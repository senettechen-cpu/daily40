import { Router } from 'express';
import { withTransaction } from '../db';
import { rewardSummary, v15EconomyEnabled } from '../rewards/service';

const router = Router();

// GET /api/rewards - requisition balance, today's ledger slots and recent entries.
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!v15EconomyEnabled()) return res.json({ enabled: false });
        const summary = await withTransaction(db => rewardSummary(db, userId, new Date()));
        res.json({ enabled: true, ...summary });
    } catch (err) {
        console.error('Error fetching rewards:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
