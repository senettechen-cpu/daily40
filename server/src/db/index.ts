
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export const query = (text: string, params?: any[]) => pool.query(text, params);

/** Minimal query surface shared by the pool and a transaction client, so services can run in either. */
export interface Db {
    query(text: string, params?: any[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

/** Runs `work` in one transaction; any thrown error rolls back every write. */
export async function withTransaction<T>(work: (db: Db) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
