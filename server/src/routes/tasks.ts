
import { Router } from 'express';
import { query } from '../db';

const router = Router();

// GET all tasks
router.get('/', async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const result = await query('SELECT * FROM tasks WHERE user_id = $1', [userId]);
        // Convert snake_case to camelCase for frontend
        const tasks = result.rows.map(row => ({
            id: row.id,
            title: row.title,
            faction: row.faction,
            difficulty: row.difficulty,
            dueDate: row.due_date,
            createdAt: row.created_at,
            status: row.status,
            isRecurring: row.is_recurring,
            lastCompletedAt: row.last_completed_at,
            streak: row.streak,
            dueTime: row.due_time
        }));
        res.json(tasks);
    } catch (err) {
        console.error('Error fetching tasks:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST new task
router.post('/', async (req, res) => {
    const { id, title, faction, difficulty, dueDate, createdAt, status, isRecurring } = req.body;
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        await query(
            `INSERT INTO tasks (id, title, faction, difficulty, due_date, created_at, status, is_recurring, streak, due_time, user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [id, title, faction, difficulty, dueDate, createdAt, status, isRecurring || false, 0, req.body.dueTime, userId]
        );
        res.status(201).json({ message: 'Task created' });
    } catch (err) {
        console.error('Error creating task:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT update task
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Build dynamic query
    const fields = [];
    const values = [];
    let idx = 1;

    if (updates.title !== undefined) { fields.push(`title = $${idx++}`); values.push(updates.title); }
    if (updates.faction !== undefined) { fields.push(`faction = $${idx++}`); values.push(updates.faction); }
    if (updates.difficulty !== undefined) { fields.push(`difficulty = $${idx++}`); values.push(updates.difficulty); }
    if (updates.dueDate !== undefined) { fields.push(`due_date = $${idx++}`); values.push(updates.dueDate); }
    if (updates.status !== undefined) { fields.push(`status = $${idx++}`); values.push(updates.status); }
    if (updates.isRecurring !== undefined) { fields.push(`is_recurring = $${idx++}`); values.push(updates.isRecurring); }
    if (updates.lastCompletedAt !== undefined) { fields.push(`last_completed_at = $${idx++}`); values.push(updates.lastCompletedAt); }
    if (updates.streak !== undefined) { fields.push(`streak = $${idx++}`); values.push(updates.streak); }
    if (updates.dueTime !== undefined) { fields.push(`due_time = $${idx++}`); values.push(updates.dueTime); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(id);
    values.push(req.user?.uid);
    const sql = `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1}`;

    try {
        await query(sql, values);
        res.json({ message: 'Task updated' });
    } catch (err) {
        console.error('Error updating task:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE task
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [id, req.user?.uid]);
        res.json({ message: 'Task deleted' });
    } catch (err) {
        console.error('Error deleting task:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
