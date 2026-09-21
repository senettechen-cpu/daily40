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

// Get logs (Admin/GM view usually, but scoped to user for now? Or Global?)
// User asked: "I want to know ALL ACCOUNTS...".
// This implies the user (GM) wants to see EVERYONE'S logs.
// For now, let's allow fetching all logs if the user is authenticated (Security by Obscurity per plan).
// Or strictly, fetching OWN logs? 
// User Request: "I want to know ALL ACCOUNTS...". So it must be global for the GM.
router.get('/', async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;

        // TODO: Add "Admin Check" here if we implement roles strictly.
        // Currently, anyone with the /admin URL knows the API.

        const sql = `
            SELECT * FROM resource_logs 
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
        `;

        const result = await query(sql, [limit, offset]);
        res.json(result.rows);
    } catch (err) {
        console.error('Failed to fetch logs:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
