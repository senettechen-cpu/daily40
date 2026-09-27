import { Router } from 'express';
import { withTransaction } from '../db';
import { applyOriginal, implantStage, readAscension, savePlan, withdrawOriginal } from '../ascension/service';

const router = Router();

// GET /api/ascension - candidates, today's designation, escorts and the old read-only record.
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        res.json(await withTransaction(db => readAscension(db, userId, new Date())));
    } catch (err) {
        console.error('Error reading ascension:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT /api/ascension/plan - today's candidate and up to two designated tasks.
router.put('/plan', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await withTransaction(db => savePlan(db, userId, req.body ?? {}, new Date()));
        if ('error' in result) return res.status(400).json({ error: result.error });
        res.json(result);
    } catch (err) {
        console.error('Error saving growth plan:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/ascension/original - a level-10 soldier applies for the original branch.
router.post('/original', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const { characterId, acknowledged } = req.body ?? {};
        if (typeof characterId !== 'string') return res.status(400).json({ error: 'characterId 必須是字串。' });
        const result = await withTransaction(db => applyOriginal(db, userId, characterId, acknowledged === true));
        if ('error' in result) return res.status(400).json({ error: result.error });
        res.status(201).json(result);
    } catch (err) {
        console.error('Error applying for the original branch:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE /api/ascension/original/:id - withdraws an application nothing rides on yet.
router.delete('/original/:id', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await withTransaction(db => withdrawOriginal(db, userId, req.params.id, new Date()));
        if ('error' in result) return res.status(400).json({ error: result.error });
        res.json(result);
    } catch (err) {
        console.error('Error withdrawing the original branch:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/ascension/candidates/:id/implant - implants one whole stage; a re-send returns the stored result.
router.post('/candidates/:id/implant', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const stage = Number(req.body?.stage);
        if (!Number.isInteger(stage)) return res.status(400).json({ error: 'stage 必須是整數。' });
        const result = await withTransaction(db => implantStage(db, userId, req.params.id, stage));
        if ('error' in result) return res.status(400).json({ error: result.error });
        res.json(result);
    } catch (err) {
        console.error('Error implanting a stage:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
