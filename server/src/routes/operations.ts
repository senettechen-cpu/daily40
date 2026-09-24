import { Router } from 'express';
import { withTransaction } from '../db';
import { operationGate } from '../shared/battle';
import { DEFAULT_TIME_ZONE, dayKey } from '../shared/rewards';
import { loadBook } from '../rewards/store';

const router = Router();

// GET /api/operations/gate - whether a new operation may start today (v1.5 G1).
// Rest days and exemptions are part of D2, which is not built yet, so they are
// reported as false rather than guessed.
router.get('/gate', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const now = new Date();
        const today = dayKey(now, DEFAULT_TIME_ZONE);
        const book = await withTransaction(db => loadBook(db, userId));
        const completedCores = book.entries.filter(entry => entry.kind === 'grant' && entry.sourceKey.startsWith(`core:${today}:`)).length;

        res.json({ ...operationGate({ completedCores, restDay: false, exempt: false }), completedCores, day: today });
    } catch (err) {
        console.error('Error reading operation gate:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
