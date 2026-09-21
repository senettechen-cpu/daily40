
import { Router } from 'express';
import { query } from '../db';

const router = Router();

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
            subTasks: row.sub_tasks // JSONB automatic parsing
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
        await query(sql, values);
        res.json({ message: 'Project updated' });
    } catch (err) {
        console.error('Error updating project:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE project
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [id, req.user?.uid]);
        res.json({ message: 'Project deleted' });
    } catch (err) {
        console.error('Error deleting project:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
