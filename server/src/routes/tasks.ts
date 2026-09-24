
import { Router } from 'express';
import { query, withTransaction } from '../db';
import { rewardCoreCompleted } from '../rewards/coreService';
import { v15EconomyEnabled } from '../rewards/service';
import { DEFAULT_TIME_ZONE, dayKey } from '../shared/rewards';
import { normalizeSlots, slotsMet } from '../shared/tasks';

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
            dueTime: row.due_time,
            dueTimes: normalizeSlots(row.due_times),
            slotsDone: normalizeSlots(row.slots_done),
            slotsDay: row.slots_day,
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

        const dueTimes = normalizeSlots(req.body.dueTimes);
        await query(
            `INSERT INTO tasks (id, title, faction, difficulty, due_date, created_at, status, is_recurring, streak, due_time, due_times, user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [id, title, faction, difficulty, dueDate, createdAt, status, isRecurring || false, 0,
                req.body.dueTime, JSON.stringify(dueTimes), userId]
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
    const fields: string[] = [];
    const values: unknown[] = [];
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
    if (updates.dueTimes !== undefined) { fields.push(`due_times = $${idx++}`); values.push(JSON.stringify(normalizeSlots(updates.dueTimes))); }
    if (updates.slotsDone !== undefined) { fields.push(`slots_done = $${idx++}`); values.push(JSON.stringify(normalizeSlots(updates.slotsDone))); }
    if (updates.slotsDay !== undefined) { fields.push(`slots_day = $${idx++}`); values.push(updates.slotsDay); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(id);
    values.push(req.user?.uid);
    const sql = `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1}`;

    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        // A task that just completed may be one of the day's cores. Update and pay
        // in one transaction so a failed grant cannot leave the task marked done.
        const completedAt = updates.lastCompletedAt ? new Date(updates.lastCompletedAt)
            : updates.status === 'completed' ? new Date()
                : null;

        const requisition = await withTransaction(async db => {
            await db.query(sql, values);
            if (!completedAt || !v15EconomyEnabled()) return 0;

            // A task with several times of day is only met when every one of them
            // is done, so the client cannot claim the core by reporting the first.
            const stored = await db.query('SELECT due_times, slots_done, slots_day FROM tasks WHERE id = $1 AND user_id = $2', [id, userId]);
            const row = stored.rows[0];
            const slots = normalizeSlots(row?.due_times);
            if (slots.length > 0) {
                const today = dayKey(completedAt, DEFAULT_TIME_ZONE);
                const done = row?.slots_day === today ? row?.slots_done : [];
                if (!slotsMet(slots, done)) return 0;
            }
            return rewardCoreCompleted(db, userId, id, completedAt);
        });

        res.json({ message: 'Task updated', requisition });
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
