import { Router } from 'express';
import { withTransaction } from '../db';
import { rewardSummary, v15EconomyEnabled } from '../rewards/service';
import { CoreEdit, editPlan, planView } from '../rewards/coreService';
import { dayKey, DEFAULT_TIME_ZONE } from '../shared/rewards';

const router = Router();

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

// GET /api/rewards/core?day=YYYY-MM-DD - the day's committed cores and edit window.
router.get('/core', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!v15EconomyEnabled()) return res.json({ enabled: false });

        const now = new Date();
        const day = typeof req.query.day === 'string' && DAY_PATTERN.test(req.query.day)
            ? req.query.day
            : dayKey(now, DEFAULT_TIME_ZONE);

        const view = await withTransaction(db => planView(db, userId, day, now));
        res.json({ enabled: true, ...view });
    } catch (err) {
        console.error('Error fetching core plan:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/rewards/core - add, remove or swap one core for a day.
router.post('/core', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!v15EconomyEnabled()) return res.status(409).json({ error: 'v1.5 經濟尚未啟用。' });

        const { day, action, taskId, withTaskId } = req.body ?? {};
        if (typeof day !== 'string' || !DAY_PATTERN.test(day)) return res.status(400).json({ error: '日期格式需為 YYYY-MM-DD。' });
        if (typeof taskId !== 'string' || !taskId) return res.status(400).json({ error: '缺少任務 ID。' });
        if (action !== 'add' && action !== 'remove' && action !== 'replace') return res.status(400).json({ error: '不支援的操作。' });
        if (action === 'replace' && (typeof withTaskId !== 'string' || !withTaskId)) return res.status(400).json({ error: '替換需要新的任務 ID。' });

        const edit = { action, taskId, withTaskId } as CoreEdit;
        const now = new Date();
        const result = await withTransaction(db => editPlan(db, userId, day, edit, now));
        if ('error' in result) return res.status(400).json({ error: result.error });

        const view = await withTransaction(db => planView(db, userId, day, now));
        res.json({ enabled: true, ...view });
    } catch (err) {
        console.error('Error editing core plan:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
