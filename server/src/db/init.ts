
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
        due_time TEXT
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
