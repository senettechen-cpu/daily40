import { Router } from 'express';
import { withTransaction } from '../db';
import { assign, purchase, readArmory, sell } from '../armory/service';
import { CATALOG } from '../shared/armory';

const router = Router();

const guard = (req: any, res: any) => {
    const userId = req.user?.uid;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return null; }
    return userId as string;
};

// GET /api/armory - the catalogue plus what this user owns, has unlocked and can spend.
router.get('/', async (req, res) => {
    try {
        const userId = guard(req, res);
        if (!userId) return;
        const state = await withTransaction(db => readArmory(db, userId, new Date()));
        res.json({ catalog: CATALOG, ...state });
    } catch (err) {
        console.error('Error reading armory:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/purchase', async (req, res) => {
    try {
        const userId = guard(req, res);
        if (!userId) return;
        const catalogId = typeof req.body?.catalogId === 'string' ? req.body.catalogId : '';
        const result = await withTransaction(db => purchase(db, userId, catalogId, new Date()));
        if ('error' in result) return res.status(400).json({ error: result.error });
        res.status(201).json(result.item);
    } catch (err) {
        console.error('Error purchasing equipment:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/items/:id/assign', async (req, res) => {
    try {
        const userId = guard(req, res);
        if (!userId) return;
        const characterId = req.body?.characterId ?? null;
        if (characterId !== null && typeof characterId !== 'string') return res.status(400).json({ error: 'characterId 格式錯誤。' });

        const result = await withTransaction(db => assign(db, userId, req.params.id, characterId));
        if ('error' in result) return res.status(400).json({ error: result.error });
        res.json(result.item);
    } catch (err) {
        console.error('Error assigning equipment:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.delete('/items/:id', async (req, res) => {
    try {
        const userId = guard(req, res);
        if (!userId) return;
        const result = await withTransaction(db => sell(db, userId, req.params.id, new Date()));
        if ('error' in result) return res.status(400).json({ error: result.error });
        res.json({ refunded: result.refunded });
    } catch (err) {
        console.error('Error selling equipment:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
