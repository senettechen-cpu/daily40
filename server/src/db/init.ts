
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const schemaSql = `
    -- Users Table (local account login; id is also the user_id used across every other table)
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Tasks Table
    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        faction TEXT NOT NULL,
        difficulty INTEGER NOT NULL,
        due_date TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        status TEXT NOT NULL,
        is_recurring BOOLEAN DEFAULT FALSE,
        last_completed_at TIMESTAMP WITH TIME ZONE,
        streak INTEGER DEFAULT 0,
        due_time TEXT,
        due_times JSONB,
        slots_done JSONB,
        slots_day TEXT
    );

    -- Projects Table
    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        month TEXT NOT NULL,
        difficulty INTEGER NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        sub_tasks JSONB DEFAULT '[]'::jsonb
    );

    -- Game State Table
    CREATE TABLE IF NOT EXISTS game_state (
        id TEXT PRIMARY KEY DEFAULT 'global',
        resources JSONB DEFAULT '{"rp": 0, "glory": 0}'::jsonb,
        corruption INTEGER DEFAULT 0,
        current_month INTEGER DEFAULT 0,
        is_penitent_mode BOOLEAN DEFAULT FALSE,
        army_strength JSONB DEFAULT '{"reserves": {"guardsmen": 0, "spaceMarines": 0, "custodes": 0, "dreadnought": 0, "baneblade": 0}, "garrisons": {}, "totalActivePower": 0}'::jsonb,
        sector_history JSONB DEFAULT '{}'::jsonb,
        owned_units JSONB DEFAULT '[]'::jsonb,
        astartes JSONB DEFAULT '{"resources": {"adamantium": 0, "neuroData": 0, "puritySeals": 0, "geneLegacy": 0}, "unlockedImplants": [], "completedStages": [], "ritualActivities": {}}'::jsonb
    );
    -- Resource Logs Table
    CREATE TABLE IF NOT EXISTS resource_logs (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        change_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_logs_user_id ON resource_logs(user_id);

    -- Push Subscriptions Table
    CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_push_user_id ON push_subscriptions(user_id);

    -- Ledger Expenses Table
    CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        date TIMESTAMP WITH TIME ZONE NOT NULL,
        category TEXT NOT NULL,
        item_name TEXT NOT NULL,
        amount INTEGER NOT NULL,
        payment_method TEXT NOT NULL,
        is_archived BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
`;

const initDb = async () => {
    try {
        console.log('Connecting to database...');
        console.log('DB URL:', process.env.DATABASE_URL ? 'Loaded' : 'Missing');

        await pool.query(schemaSql);
        console.log('Schema created successfully.');

        // Migrations: Add new columns if they don't exist (for existing DBs)
        await pool.query('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0');
        await pool.query('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_time TEXT');
        // Several times of day for one recurring task, plus that day's progress.
        await pool.query('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_times JSONB');
        await pool.query('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS slots_done JSONB');
        await pool.query('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS slots_day TEXT');

        // Multi-tenancy Migrations
        await pool.query('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id TEXT');
        await pool.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id TEXT');
        await pool.query('ALTER TABLE game_state ADD COLUMN IF NOT EXISTS user_id TEXT');

        // Email Notification Migrations
        await pool.query('ALTER TABLE game_state ADD COLUMN IF NOT EXISTS notification_email TEXT');
        await pool.query('ALTER TABLE game_state ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN DEFAULT FALSE');
        await pool.query('ALTER TABLE game_state ADD COLUMN IF NOT EXISTS astartes JSONB DEFAULT \'{"resources": {"adamantium": 0, "neuroData": 0, "puritySeals": 0, "geneLegacy": 0}, "unlockedImplants": [], "completedStages": [], "ritualActivities": {}}\'::jsonb');
        await pool.query("ALTER TABLE game_state ADD COLUMN IF NOT EXISTS campaign JSONB DEFAULT '{}'::jsonb");

        // Create index for performance
        await pool.query('CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_gamestate_user_id ON game_state(user_id)');

        // Ledger Archive Migration
        await pool.query('ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE');

        // Corruption Engine: track last tick for offline catch-up
        await pool.query('ALTER TABLE game_state ADD COLUMN IF NOT EXISTS last_corruption_tick TIMESTAMP WITH TIME ZONE');

        // v1.5 requisition ledger: append-only; balance is the sum of amounts.
        await pool.query(`CREATE TABLE IF NOT EXISTS reward_entries (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            seq INTEGER NOT NULL,
            source_key TEXT NOT NULL,
            kind TEXT NOT NULL,
            amount INTEGER NOT NULL,
            day TEXT NOT NULL,
            at TIMESTAMP WITH TIME ZONE NOT NULL,
            reason TEXT NOT NULL,
            UNIQUE (user_id, seq)
        )`);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_reward_entries_user_key ON reward_entries(user_id, source_key)');

        // Ledger quick menu: pinned presets and dismissed suggestions.
        await pool.query(`CREATE TABLE IF NOT EXISTS ledger_presets (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            category TEXT NOT NULL,
            item_name TEXT NOT NULL,
            payment_method TEXT NOT NULL,
            amount INTEGER,
            pinned BOOLEAN NOT NULL DEFAULT FALSE,
            hidden BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE (user_id, category, item_name, payment_method)
        )`);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_user_created ON expenses(user_id, created_at)');

        // v1.5 daily core: the committed task list for one day. The 09:00 cap was
        // dropped on 2026-09-24; databases created before then keep an unused
        // locked_cap column, which nothing reads or writes any more.
        await pool.query(`CREATE TABLE IF NOT EXISTS core_plans (
            user_id TEXT NOT NULL,
            day TEXT NOT NULL,
            task_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            PRIMARY KEY (user_id, day)
        )`);

        // v1.5 project rewards: exactly three designated milestones, and the
        // close timestamp needed to tell a same-day close from a later one.
        await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS milestone_ids JSONB DEFAULT '[]'::jsonb`);
        await pool.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
        await pool.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE');

        // v1.5 roster: character instances and saved formations. A squad stores
        // only ids, so saving one never copies a character or their equipment.
        await pool.query(`CREATE TABLE IF NOT EXISTS roster_characters (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            origin TEXT NOT NULL,
            duty TEXT NOT NULL,
            asset_id TEXT,
            xp INTEGER NOT NULL DEFAULT 0,
            health TEXT NOT NULL DEFAULT 'fit',
            recruited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_roster_user_id ON roster_characters(user_id)');

        await pool.query(`CREATE TABLE IF NOT EXISTS squads (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            member_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_squads_user_id ON squads(user_id)');

        // v1.5 armoury: every owned piece of gear is its own row, so two soldiers
        // can never share one weapon. `paid` is what was actually spent, which is
        // what the 25% buy-back is calculated from; issued gear is 0 and refunds 0.
        await pool.query(`CREATE TABLE IF NOT EXISTS equipment_items (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            catalog_id TEXT NOT NULL,
            assigned_to TEXT,
            paid INTEGER NOT NULL DEFAULT 0,
            acquired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_equipment_user_id ON equipment_items(user_id)');

        // Restricted catalogue entries stay unbuyable until a campaign or story
        // grants the authorization; requisition alone is never enough.
        await pool.query(`CREATE TABLE IF NOT EXISTS equipment_authorizations (
            user_id TEXT NOT NULL,
            catalog_id TEXT NOT NULL,
            granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            PRIMARY KEY (user_id, catalog_id)
        )`);

        // Recruiting an origin outside the ordinary Astra Militarum line needs a
        // campaign or story authorization, the same gate restricted gear uses.
        await pool.query(`CREATE TABLE IF NOT EXISTS personnel_authorizations (
            user_id TEXT NOT NULL,
            template_id TEXT NOT NULL,
            granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            PRIMARY KEY (user_id, template_id)
        )`);

        // Operations are resolved by the server, which re-runs the deterministic
        // simulation from what it stored. The client replays the same seed and
        // sees the same battle, but never reports its own result.
        await pool.query(`CREATE TABLE IF NOT EXISTS operations (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            squad_id TEXT NOT NULL,
            scenario_id TEXT NOT NULL,
            seed INTEGER NOT NULL,
            crew JSONB NOT NULL,
            trainee_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            outcome TEXT NOT NULL,
            pays_xp BOOLEAN NOT NULL DEFAULT TRUE,
            started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )`);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_operations_user_id ON operations(user_id)');

        console.log('Migrations applied.');

        // Initialize default game state if not exists
        const checkState = await pool.query('SELECT * FROM game_state WHERE id = $1', ['global']);
        if (checkState.rows.length === 0) {
            await pool.query('INSERT INTO game_state (id) VALUES ($1)', ['global']);
            console.log('Default game state initialized.');
        } else {
            console.log('Game state already exists.');
        }

    } catch (err) {
        console.error('Error initializing database:', err);
    } finally {
        await pool.end();
    }
};

initDb();
