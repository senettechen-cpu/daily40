import type { Db } from '../db';
import {
    addCore, corePhase, CorePlan, CORE_MAX, dayKey, DEFAULT_TIME_ZONE, emptyPlan,
    isCorePayment, onSlotCompleted, onTaskCompleted, removeCore, replaceCore,
} from '../shared/rewards';
import { appendEntries, loadBook } from './store';
import { loadWithStartingGrant } from './service';

// Per-user time zones are not stored yet; every user is on the approved default.
const timeZone = DEFAULT_TIME_ZONE;

export async function loadPlan(db: Db, userId: string, day: string): Promise<CorePlan> {
    const result = await db.query(
        'SELECT day, task_ids FROM core_plans WHERE user_id = $1 AND day = $2',
        [userId, day],
    );
    const row = result.rows[0];
    if (!row) return emptyPlan(day);
    return { day: row.day, taskIds: Array.isArray(row.task_ids) ? row.task_ids : [] };
}

async function savePlan(db: Db, userId: string, plan: CorePlan) {
    await db.query(
        `INSERT INTO core_plans (user_id, day, task_ids) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, day) DO UPDATE SET task_ids = EXCLUDED.task_ids`,
        [userId, plan.day, JSON.stringify(plan.taskIds)],
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

/**
 * Grants for a completed task. Since 2026-09-28 every task pays, not only the
 * day's cores, so a day with no plan at all still pays; the plan is loaded only
 * to tell a core apart from the rest in the ledger's reason. Idempotent by
 * source key, so one task pays once a day.
 *
 * `settledSlots` is the protocol's finished times of day, which since
 * 2026-09-29 each pay on their own. Pass the whole list, not the one just
 * pressed: every time has its own key, so replaying the list pays only for
 * what is still unpaid and a dropped request costs nothing. Returns the total
 * granted by this call.
 */
export async function rewardCoreCompleted(db: Db, userId: string, taskId: string, completedAt: Date, settledSlots?: string[]): Promise<number> {
    const plan = await loadPlan(db, userId, dayKey(completedAt, timeZone));

    const book = await loadWithStartingGrant(db, userId, completedAt);
    const entries = settledSlots
        ? settledSlots.map(slot => onSlotCompleted(book, plan, taskId, slot, completedAt, timeZone))
        : [onTaskCompleted(book, plan, taskId, completedAt, timeZone)];

    const paid = entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    if (paid.length === 0) return 0;
    await appendEntries(db, userId, book, paid);
    return paid.reduce((sum, entry) => sum + entry.amount, 0);
}

/** Plan plus the state the UI needs to enable or disable its controls. */
export async function planView(db: Db, userId: string, day: string, now: Date) {
    const plan = await loadPlan(db, userId, day);
    const book = await loadBook(db, userId);
    // A protocol's times pay under their own keys, so a core counts as paid once
    // any of them has: the money is out, and swapping the core would hide that.
    const paid = book.entries.filter(e => e.kind === 'grant').map(e => e.sourceKey);
    return {
        day,
        taskIds: plan.taskIds,
        phase: corePhase(day, now, timeZone),
        cap: CORE_MAX,
        max: CORE_MAX,
        paidTaskIds: plan.taskIds.filter(id => paid.some(key => isCorePayment(key, day, id))),
    };
}
