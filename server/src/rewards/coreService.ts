import type { Db } from '../db';
import {
    addCore, coreCap, corePhase, CorePlan, CORE_MAX, dayKey, DEFAULT_TIME_ZONE, emptyPlan,
    onTaskCompleted, removeCore, replaceCore,
} from '../shared/rewards';
import { appendEntries, loadBook } from './store';
import { loadWithStartingGrant } from './service';

// Per-user time zones are not stored yet; every user is on the approved default.
const timeZone = DEFAULT_TIME_ZONE;

export async function loadPlan(db: Db, userId: string, day: string): Promise<CorePlan> {
    const result = await db.query(
        'SELECT day, task_ids, locked_cap FROM core_plans WHERE user_id = $1 AND day = $2',
        [userId, day],
    );
    const row = result.rows[0];
    if (!row) return emptyPlan(day);
    return {
        day: row.day,
        taskIds: Array.isArray(row.task_ids) ? row.task_ids : [],
        lockedCap: row.locked_cap ?? undefined,
    };
}

async function savePlan(db: Db, userId: string, plan: CorePlan) {
    await db.query(
        `INSERT INTO core_plans (user_id, day, task_ids, locked_cap) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, day) DO UPDATE SET task_ids = EXCLUDED.task_ids, locked_cap = EXCLUDED.locked_cap`,
        [userId, plan.day, JSON.stringify(plan.taskIds), plan.lockedCap ?? null],
    );
}

/**
 * A task counts as completed for `day` when it was last completed that day
 * (recurring tasks) or is simply marked completed (one-off tasks).
 */
async function completionLookup(db: Db, userId: string, day: string) {
    const result = await db.query('SELECT id, status, last_completed_at FROM tasks WHERE user_id = $1', [userId]);
    const byId = new Map<string, { status: string; last_completed_at: string | null }>(
        result.rows.map(row => [row.id, { status: row.status, last_completed_at: row.last_completed_at }]),
    );
    return (taskId: string) => {
        const row = byId.get(taskId);
        if (!row) return false;
        if (row.last_completed_at && dayKey(new Date(row.last_completed_at), timeZone) === day) return true;
        return row.status === 'completed';
    };
}

export type CoreEdit =
    | { action: 'add'; taskId: string }
    | { action: 'remove'; taskId: string }
    | { action: 'replace'; taskId: string; withTaskId: string };

export async function editPlan(db: Db, userId: string, day: string, edit: CoreEdit, now: Date) {
    const plan = await loadPlan(db, userId, day);
    const ctx = { now, timeZone, isCompleted: await completionLookup(db, userId, day) };

    const result = edit.action === 'add' ? addCore(plan, edit.taskId, ctx)
        : edit.action === 'remove' ? removeCore(plan, edit.taskId, ctx)
        : replaceCore(plan, edit.taskId, edit.withTaskId, ctx);

    if ('error' in result) return result;
    await savePlan(db, userId, result.plan);
    return result;
}

/** Grants +10 when a completed task is one of that day's cores. Idempotent by source key. */
export async function rewardCoreCompleted(db: Db, userId: string, taskId: string, completedAt: Date): Promise<number> {
    const plan = await loadPlan(db, userId, dayKey(completedAt, timeZone));
    if (plan.taskIds.length === 0) return 0;

    const book = await loadWithStartingGrant(db, userId, completedAt);
    const entry = onTaskCompleted(book, plan, taskId, completedAt, timeZone);
    if (!entry) return 0;
    await appendEntries(db, userId, book, [entry]);
    return entry.amount;
}

/** Plan plus the state the UI needs to enable or disable its controls. */
export async function planView(db: Db, userId: string, day: string, now: Date) {
    const plan = await loadPlan(db, userId, day);
    const book = await loadBook(db, userId);
    const paid = new Set(book.entries.filter(e => e.sourceKey.startsWith(`core:${day}:`)).map(e => e.sourceKey));
    return {
        day,
        taskIds: plan.taskIds,
        phase: corePhase(day, now, timeZone),
        cap: coreCap(plan, now, timeZone),
        max: CORE_MAX,
        paidTaskIds: plan.taskIds.filter(id => paid.has(`core:${day}:${id}`)),
    };
}
