
import { Router } from 'express';
import { query, withTransaction } from '../db';
import { refreshClosedAt, saveMilestones, syncProjectRewards } from '../rewards/projectService';
import { v15EconomyEnabled } from '../rewards/service';

const router = Router();

/** Re-settles a project's milestone and close rewards after its state changed. */
async function settle(userId: string, projectId: string) {
    if (!v15EconomyEnabled()) return;
    const now = new Date();
    await withTransaction(async db => {
        await refreshClosedAt(db, userId, projectId, now);
        await syncProjectRewards(db, userId, projectId, now);
    });
}

// GET all projects
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const result = await query('SELECT * FROM projects WHERE user_id = $1', [userId]);
        const projects = result.rows.map(row => ({
            id: row.id,
            title: row.title,
            month: row.month,
            difficulty: row.difficulty,
            completed: row.completed,
            subTasks: row.sub_tasks, // JSONB automatic parsing
            milestoneIds: row.milestone_ids ?? [],
            createdAt: row.created_at,
            closedAt: row.closed_at
        }));
        res.json(projects);
    } catch (err) {
        console.error('Error fetching projects:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST create project
router.post('/', async (req, res) => {
    const { id, title, month, difficulty, completed, subTasks } = req.body;
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        await query(
            'INSERT INTO projects (id, title, month, difficulty, completed, sub_tasks, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [id, title, month, difficulty, completed || false, JSON.stringify(subTasks || []), userId]
        );
        res.status(201).json({ message: 'Project created' });
    } catch (err) {
        console.error('Error creating project:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT update project
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Build dynamic update query
    const fields = [];
    const values = [];
    let idx = 1;

    if (updates.title !== undefined) { fields.push(`title = $${idx++}`); values.push(updates.title); }
    if (updates.month !== undefined) { fields.push(`month = $${idx++}`); values.push(updates.month); }
    if (updates.difficulty !== undefined) { fields.push(`difficulty = $${idx++}`); values.push(updates.difficulty); }
    if (updates.completed !== undefined) { fields.push(`completed = $${idx++}`); values.push(updates.completed); }
    if (updates.subTasks !== undefined) { fields.push(`sub_tasks = $${idx++}`); values.push(JSON.stringify(updates.subTasks)); }

    if (fields.length === 0) return res.status(400).json({ message: 'No updates provided' });

    values.push(id);
    values.push(req.user?.uid);
    const sql = `UPDATE projects SET ${fields.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1}`;

    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        await query(sql, values);
        await settle(userId, id);
        res.json({ message: 'Project updated' });
    } catch (err) {
        console.error('Error updating project:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT designate this project's three milestones
router.put('/:id/milestones', async (req, res) => {
    const { id } = req.params;
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!v15EconomyEnabled()) return res.status(409).json({ error: 'v1.5 經濟尚未啟用。' });

        const ids = req.body?.milestoneIds;
        if (!Array.isArray(ids) || ids.some(value => typeof value !== 'string')) {
            return res.status(400).json({ error: 'milestoneIds 必須是子項 ID 的陣列。' });
        }

        const result = await withTransaction(db => saveMilestones(db, userId, id, ids, new Date()));
        if ('error' in result) return res.status(400).json({ error: result.error });
        res.json({ milestoneIds: result.milestoneIds });
    } catch (err) {
        console.error('Error setting milestones:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE project
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        await query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
        // Reverses every reward for the project now that its cause is gone.
        await settle(userId, id);
        res.json({ message: 'Project deleted' });
    } catch (err) {
        console.error('Error deleting project:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
