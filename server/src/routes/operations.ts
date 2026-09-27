import { Router } from 'express';
import { withTransaction } from '../db';
import { readCampaign, readGate, startOperation } from '../operations/service';

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

// GET /api/operations/campaign - every stronghold's state and every soldier's service record.
router.get('/campaign', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const campaign = await withTransaction(db => readCampaign(db, userId));
        res.json(campaign);
    } catch (err) {
        console.error('Error reading campaign:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/operations - starts and resolves one operation at a stronghold, server-side.
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const { squadId, strongholdId, missionId, candidateId, traineeIds, lanes } = req.body ?? {};
        const target = typeof strongholdId === 'string' || typeof missionId === 'string';
        if (typeof squadId !== 'string' || !target) {
            // An older page still sends a phase-one scenarioId; those left play with the campaign.
            return res.status(400).json({ error: '出戰改為攻打星區據點，請重新整理頁面。' });
        }
        if (traineeIds !== undefined && (!Array.isArray(traineeIds) || traineeIds.some((id: unknown) => typeof id !== 'string'))) {
            return res.status(400).json({ error: 'traineeIds 必須是人員 ID 的陣列。' });
        }

        const result = await withTransaction(db => startOperation(db, userId, {
            squadId,
            strongholdId: typeof missionId === 'string' ? undefined : strongholdId,
            missionId: typeof missionId === 'string' ? missionId : undefined,
            candidateId: typeof candidateId === 'string' ? candidateId : undefined,
            traineeIds, lanes,
        }, new Date()));
        if ('error' in result) return res.status(400).json({ error: result.error });
        res.status(201).json(result);
    } catch (err) {
        console.error('Error starting operation:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
