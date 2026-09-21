
import { Router } from 'express';
import { Pool } from 'pg';

const router = Router();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// GET /api/ledger - Get all expenses
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const result = await pool.query(
            'SELECT * FROM expenses WHERE user_id = $1 AND is_archived = FALSE ORDER BY date DESC, created_at DESC',
            [userId]
        );

        // Map snake_case DB fields to camelCase frontend types
        const expenses = result.rows.map(row => ({
            id: row.id,
            date: row.date,
            category: row.category,
            itemName: row.item_name,
            amount: row.amount,
            paymentMethod: row.payment_method
        }));

        res.json(expenses);
    } catch (error) {
        console.error('Error fetching expenses:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/ledger - Add expense
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const { id, date, category, itemName, amount, paymentMethod } = req.body;

        await pool.query(
            `INSERT INTO expenses (id, user_id, date, category, item_name, amount, payment_method)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, userId, date, category, itemName, amount, paymentMethod]
        );

        res.status(201).json({ success: true });
    } catch (error) {
        console.error('Error adding expense:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/ledger/archive - Archive all unarchived expenses for user
router.post('/archive', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        await pool.query(
            'UPDATE expenses SET is_archived = TRUE WHERE user_id = $1 AND is_archived = FALSE',
            [userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error archiving expenses:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE /api/ledger/:id - Delete expense
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const { id } = req.params;

        await pool.query(
            'DELETE FROM expenses WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting expense:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
