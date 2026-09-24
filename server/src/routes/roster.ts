import { Router } from 'express';
import { withTransaction } from '../db';
import { createSquad, deleteSquad, readRoster, recruit, updateSquad } from '../roster/service';
import { RECRUITS } from '../shared/roster';

const router = Router();

// GET /api/roster - every character and saved formation. Grants the six free
// starting soldiers on the first read.
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const roster = await withTransaction(db => readRoster(db, userId, new Date()));
        res.json({ ...roster, recruits: RECRUITS });
    } catch (err) {
        console.error('Error reading roster:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/roster/recruit - hires one recruit, paid from the requisition wallet.
router.post('/recruit', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const templateId = typeof req.body?.templateId === 'string' ? req.body.templateId : '';
        const name = typeof req.body?.name === 'string' ? req.body.name : undefined;
        const result = await withTransaction(db => recruit(db, userId, templateId, name, new Date()));
        if ('error' in result) return res.status(400).json({ error: result.error });
        res.status(201).json(result);
    } catch (err) {
        console.error('Error recruiting:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/squads', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const name = typeof req.body?.name === 'string' ? req.body.name : '';
        const result = await withTransaction(db => createSquad(db, userId, name));
        if ('error' in result) return res.status(400).json({ error: result.error });
        res.status(201).json(result.squad);
    } catch (err) {
        console.error('Error creating squad:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.put('/squads/:id', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const { name, memberIds } = req.body ?? {};
        if (name !== undefined && typeof name !== 'string') return res.status(400).json({ error: '名稱格式錯誤。' });
        if (memberIds !== undefined && (!Array.isArray(memberIds) || memberIds.some((id: unknown) => typeof id !== 'string'))) {
            return res.status(400).json({ error: 'memberIds 必須是人員 ID 的陣列。' });
        }

        const result = await withTransaction(db => updateSquad(db, userId, req.params.id, { name, memberIds }));
        if ('error' in result) return res.status(400).json({ error: result.error });
        res.json(result.squad);
    } catch (err) {
        console.error('Error updating squad:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.delete('/squads/:id', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        await withTransaction(db => deleteSquad(db, userId, req.params.id));
        res.json({ message: 'Squad deleted' });
    } catch (err) {
        console.error('Error deleting squad:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
