
import { Router } from 'express';
import { query, withTransaction } from '../db';
import { hideSuggestion, pinPreset, quickMenu, unpinPreset } from '../ledger/presets';
import { reverseExpenseReward, rewardExpenseRecorded, v15EconomyEnabled } from '../rewards/service';

const router = Router();

// GET /api/ledger - Get all expenses
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const result = await query(
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

// POST /api/ledger - Add expense. With the v1.5 economy on, the expense and its
// requisition reward commit together; a retried request never pays twice.
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const { id, date, category, itemName, amount, paymentMethod } = req.body;

        const result = await withTransaction(async db => {
            const inserted = await db.query(
                `INSERT INTO expenses (id, user_id, date, category, item_name, amount, payment_method)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
                [id, userId, date, category, itemName, amount, paymentMethod]
            );
            if (!inserted.rowCount) {
                const owner = await db.query('SELECT user_id FROM expenses WHERE id = $1', [id]);
                if (owner.rows[0]?.user_id !== userId) return { conflict: true as const };
            }
            const reward = v15EconomyEnabled() ? await rewardExpenseRecorded(db, userId, id, new Date()) : 0;
            return { reward };
        });

        if ('conflict' in result) return res.status(409).json({ error: 'Expense id already in use' });
        res.status(201).json({ success: true, reward: result.reward });
    } catch (error) {
        console.error('Error adding expense:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/ledger/presets - Quick menu: pinned presets, then frequent recent items.
router.get('/presets', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        res.json(await quickMenu({ query }, userId, new Date()));
    } catch (error) {
        console.error('Error fetching ledger presets:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/ledger/presets - Pin an item (optionally with a remembered amount).
router.post('/presets', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const { category, itemName, paymentMethod, amount } = req.body;
        const result = await pinPreset({ query }, userId, { category, itemName, paymentMethod, amount: amount ?? null });
        if ('error' in result) return res.status(400).json({ error: result.error });
        res.status(201).json(result.preset);
    } catch (error) {
        console.error('Error pinning ledger preset:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/ledger/presets/hide - Stop suggesting an item.
router.post('/presets/hide', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const { category, itemName, paymentMethod } = req.body;
        const result = await hideSuggestion({ query }, userId, { category, itemName, paymentMethod });
        if ('error' in result) return res.status(400).json({ error: result.error });
        res.json(result.preset);
    } catch (error) {
        console.error('Error hiding ledger suggestion:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE /api/ledger/presets/:id - Unpin.
router.delete('/presets/:id', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const removed = await unpinPreset({ query }, userId, req.params.id);
        res.status(removed ? 200 : 404).json({ success: removed });
    } catch (error) {
        console.error('Error unpinning ledger preset:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/ledger/archive - Archive all unarchived expenses for user
router.post('/archive', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        await query(
            'UPDATE expenses SET is_archived = TRUE WHERE user_id = $1 AND is_archived = FALSE',
            [userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error archiving expenses:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE /api/ledger/:id - Delete expense; a rewarded entry has its requisition reversed.
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const { id } = req.params;

        const reversed = await withTransaction(async db => {
            const deleted = await db.query('DELETE FROM expenses WHERE id = $1 AND user_id = $2', [id, userId]);
            return deleted.rowCount && v15EconomyEnabled() ? reverseExpenseReward(db, userId, id, new Date()) : 0;
        });

        res.json({ success: true, reward: reversed });
    } catch (error) {
        console.error('Error deleting expense:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
