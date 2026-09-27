import { Router } from 'express';
import { query } from '../db';
import { verifyToken } from '../middleware/auth';

const router = Router();

// Middleware: Require Auth
router.use(verifyToken);

// Create a log entry
router.post('/', async (req, res) => {
    try {
        const { category, amount, reason } = req.body;
        // @ts-ignore
        const userId = req.user.uid;

        if (!category || amount === undefined) {
            return res.status(400).json({ error: 'Missing category or amount' });
        }

        const changeType = amount >= 0 ? 'increase' : 'decrease';

        // Ensure amount is stored as absolute or relative? 
        // User requested "Increase/Decrease" and "Value".
        // Let's store amount as absolute in one column or just keep signed amount.
        // Let's keep it simple: store unsigned amount and implicit type, or signed amount?
        // Plan said: change_type: 'increase'/'decrease', amount: INTEGER.
        // Let's store absolute amount for 'amount' column to match standard ledger patterns, 
        // but 'change_type' will clarify direction.

        const absAmount = Math.abs(amount);

        const sql = `
            INSERT INTO resource_logs (user_id, category, change_type, amount, reason)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;

        const result = await query(sql, [userId, category, changeType, absAmount, reason || 'Unknown']);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Failed to create log:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * Accounts allowed to read every account's log, from ADMIN_USER_IDS (comma
 * separated uids, e.g. "local:owner"). Everyone else reads only their own.
 * Before 2026-09-27 any signed-in account could read all of them.
 */
export const isAdmin = (uid: string | undefined) =>
    !!uid && (process.env.ADMIN_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean).includes(uid);

router.get('/', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
        const offset = Math.max(0, Number(req.query.offset) || 0);

        const result = isAdmin(userId)
            ? await query('SELECT * FROM resource_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset])
            : await query('SELECT * FROM resource_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [userId, limit, offset]);
        res.json(result.rows);
    } catch (err) {
        console.error('Failed to fetch logs:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
