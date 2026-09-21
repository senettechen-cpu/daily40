
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const migrate = async () => {
    try {
        console.log('Starting migration: Add astartes column to game_state...');

        await pool.query('ALTER TABLE game_state ADD COLUMN IF NOT EXISTS astartes JSONB DEFAULT \'{"resources": {"adamantium": 0, "neuroData": 0, "puritySeals": 0, "geneLegacy": 0}, "unlockedImplants": [], "completedStages": [], "ritualActivities": {}}\'::jsonb');

        console.log('Migration successful: astartes column added.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
};

migrate();
