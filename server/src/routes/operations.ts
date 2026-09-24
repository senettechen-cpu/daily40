import { Router } from 'express';
import { withTransaction } from '../db';
import { readGate, startOperation } from '../operations/service';

const router = Router();

// GET /api/operations/gate - whether a new operation may start today (v1.5 G1).
router.get('/gate', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const gate = await withTransaction(db => readGate(db, userId, new Date()));
        res.json(gate);
    } catch (err) {
        console.error('Error reading operation gate:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/operations - starts and resolves one operation server-side.
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const { squadId, scenarioId, traineeIds, lanes } = req.body ?? {};
        if (typeof squadId !== 'string' || typeof scenarioId !== 'string') {
            return res.status(400).json({ error: '需要編成與情境。' });
        }
        if (traineeIds !== undefined && (!Array.isArray(traineeIds) || traineeIds.some((id: unknown) => typeof id !== 'string'))) {
            return res.status(400).json({ error: 'traineeIds 必須是人員 ID 的陣列。' });
        }

        const result = await withTransaction(db => startOperation(db, userId, { squadId, scenarioId, traineeIds, lanes }, new Date()));
        if ('error' in result) return res.status(400).json({ error: result.error });
        res.status(201).json(result);
    } catch (err) {
        console.error('Error starting operation:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
