
import { Router } from 'express';
import { query, withTransaction } from '../db';
import { editPlan, rewardCoreCompleted } from '../rewards/coreService';
import { v15EconomyEnabled } from '../rewards/service';
import { DEFAULT_TIME_ZONE, dayKey } from '../shared/rewards';
import { normalizeMonthDays, normalizeSlots, slotsMet } from '../shared/tasks';
import { isDomain } from '../shared/ascension';
import { recordGrowthForTask, releaseDesignation } from '../ascension/service';
import { addDays } from '../shared/time';
import type { Db } from '../db';

/**
 * A voided task (2026-09-27: "標記無效" is a true void, not a completion) gives
 * back what it was holding: its place among today's and tomorrow's cores and
 * its slot in today's growth designation, so another task can take them.
 * Nothing is paid and nothing is reversed, because nothing was earned.
 */
async function releaseVoidedTask(db: Db, userId: string, taskId: string, now: Date) {
    const today = dayKey(now, DEFAULT_TIME_ZONE);
    for (const day of [today, addDays(today, 1)]) {
        await editPlan(db, userId, day, { action: 'remove', taskId }, now);
    }
    await releaseDesignation(db, userId, taskId, now);
}

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
            monthDays: normalizeMonthDays(row.month_days),
            projectId: row.project_id ?? undefined,
            subTaskId: row.sub_task_id ?? undefined,
            domain: isDomain(row.domain) ? row.domain : undefined,
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
        // Days of the month; empty keeps is_recurring meaning every day.
        const monthDays = normalizeMonthDays(req.body.monthDays);
        // Only a one-off task may stand for a subtask: a daily one would tick it
        // the first time and then keep recurring with nothing left to tick.
        const linked = !isRecurring && typeof req.body.projectId === 'string' && typeof req.body.subTaskId === 'string';
        await query(
            `INSERT INTO tasks (id, title, faction, difficulty, due_date, created_at, status, is_recurring, streak, due_time, due_times, month_days, user_id, project_id, sub_task_id, domain)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
            [id, title, faction, difficulty, dueDate, createdAt, status, isRecurring || false, 0,
                req.body.dueTime, JSON.stringify(dueTimes), JSON.stringify(monthDays), userId,
                linked ? req.body.projectId : null, linked ? req.body.subTaskId : null,
                isDomain(req.body.domain) ? req.body.domain : null]
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
    if (updates.monthDays !== undefined) { fields.push(`month_days = $${idx++}`); values.push(JSON.stringify(normalizeMonthDays(updates.monthDays))); }
    if (updates.domain !== undefined) { fields.push(`domain = $${idx++}`); values.push(isDomain(updates.domain) ? updates.domain : null); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(id);
    values.push(req.user?.uid);
    const sql = `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1}`;

    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        // A task that just completed may be one of the day's cores. Update and pay
        // in one transaction so a failed grant cannot leave the task marked done.
        // Settling one time of day pays on its own since 2026-09-29, and the client
        // reports it as `slotsDone` without a `lastCompletedAt`: the protocol is not
        // finished for the day, but that one glass of water is.
        const completedAt = updates.lastCompletedAt ? new Date(updates.lastCompletedAt)
            : updates.status === 'completed' || updates.slotsDone !== undefined ? new Date()
                : null;

        const { requisition, growth } = await withTransaction(async db => {
            await db.query(sql, values);
            if (updates.status === 'failed' && v15EconomyEnabled()) {
                await releaseVoidedTask(db, userId, id, new Date());
                return { requisition: 0, growth: null };
            }
            if (!completedAt || !v15EconomyEnabled()) return { requisition: 0, growth: null };

            // Read the times back from the row the transaction just wrote, so the
            // client cannot claim a time it has not actually settled.
            const stored = await db.query('SELECT due_times, slots_done, slots_day FROM tasks WHERE id = $1 AND user_id = $2', [id, userId]);
            const row = stored.rows[0];
            const slots = normalizeSlots(row?.due_times);
            const today = dayKey(completedAt, DEFAULT_TIME_ZONE);
            const done = row?.slots_day === today ? normalizeSlots(row?.slots_done).filter(time => slots.includes(time)) : [];

            // A protocol with times of day pays per time (user decision
            // 2026-09-29); one without pays once, as before.
            const requisition = slots.length > 0
                ? await rewardCoreCompleted(db, userId, id, completedAt, done)
                : await rewardCoreCompleted(db, userId, id, completedAt);

            // The growth record is still the day's, not one time's: it waits for
            // the last of them, and there is only one designation a day to fill.
            const dayMet = slots.length === 0 || slotsMet(slots, done);
            return {
                requisition,
                growth: dayMet ? await recordGrowthForTask(db, userId, id, completedAt) : null,
            };
        });

        res.json({ message: 'Task updated', requisition, growth });
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
