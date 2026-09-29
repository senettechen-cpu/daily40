import { planGrant, PlannedEntry, RewardBook } from './book';
import { addDays, dayKey, DEFAULT_TIME_ZONE } from '../time';

// Daily core outcomes: up to three committed tasks. Completing anything pays
// +10, and a protocol with times of day pays +10 per time (2026-09-29).
// Plans may be set the day before. The 09:00 cutoff was dropped on 2026-09-24:
// a missed morning used to lock the count at zero and shut the day's G1 gate,
// so cores may now be committed at any hour of their own day.
export const CORE_REWARD = 10;
export const CORE_MAX = 3;
export const coreKey = (day: string, taskId: string) => `core:${day}:${taskId}`;

/**
 * A single time of day, paid on its own (user decision 2026-09-29). A protocol
 * with eight glasses of water used to pay +10 once, and only when the last of
 * them was pressed; the user asked for every time to pay, so eight glasses pay
 * eight times. The key hangs off the task's own key, so a protocol without
 * times keeps paying under `coreKey` and nothing already paid is paid twice.
 */
export const slotKey = (day: string, taskId: string, slot: string) => `${coreKey(day, taskId)}@${slot}`;

/** Whether a source key pays for this task on this day, whole or one of its times. */
export const isCorePayment = (sourceKey: string, day: string, taskId: string): boolean => {
    const base = coreKey(day, taskId);
    return sourceKey === base || sourceKey.startsWith(`${base}@`);
};

export interface CorePlan {
    day: string;
    taskIds: string[];
}

export interface CoreContext {
    now: Date;
    timeZone?: string;
    /** Whether the task already counts as completed for `plan.day`. */
    isCompleted: (taskId: string) => boolean;
}

export type CorePhase = 'too-early' | 'upcoming' | 'open' | 'past';
export type CoreResult = { plan: CorePlan } | { error: string };

export const emptyPlan = (day: string): CorePlan => ({ day, taskIds: [] });

export function corePhase(day: string, now: Date, timeZone = DEFAULT_TIME_ZONE): CorePhase {
    const today = dayKey(now, timeZone);
    if (day < today) return 'past';
    if (day === today) return 'open';
    return day === addDays(today, 1) ? 'upcoming' : 'too-early';
}

function editable(plan: CorePlan, ctx: CoreContext): { plan: CorePlan } | { error: string } {
    const phase = corePhase(plan.day, ctx.now, ctx.timeZone);
    if (phase === 'past') return { error: '這一天已經結束，核心不能再修改。' };
    if (phase === 'too-early') return { error: '只能提前設定隔天的核心。' };
    return { plan };
}

export function addCore(plan: CorePlan, taskId: string, ctx: CoreContext): CoreResult {
    const ready = editable(plan, ctx);
    if ('error' in ready) return ready;
    if (plan.taskIds.includes(taskId)) return { plan };
    if (ctx.isCompleted(taskId)) return { error: '已完成的任務不能再設為核心。' };
    if (plan.taskIds.length >= CORE_MAX) return { error: `核心最多 ${CORE_MAX} 個。` };
    return { plan: { ...plan, taskIds: [...plan.taskIds, taskId] } };
}

export function removeCore(plan: CorePlan, taskId: string, ctx: CoreContext): CoreResult {
    if (!plan.taskIds.includes(taskId)) return { plan };
    const ready = editable(plan, ctx);
    if ('error' in ready) return ready;
    if (ctx.isCompleted(taskId)) return { error: '已完成的核心已鎖定。' };
    return { plan: { ...plan, taskIds: plan.taskIds.filter(id => id !== taskId) } };
}

/** Swap one uncompleted core for another task, keeping the count unchanged. */
export function replaceCore(plan: CorePlan, oldTaskId: string, newTaskId: string, ctx: CoreContext): CoreResult {
    if (!plan.taskIds.includes(oldTaskId)) return { error: '要替換的任務不是核心。' };
    const removed = removeCore(plan, oldTaskId, ctx);
    if ('error' in removed) return removed;
    return addCore(removed.plan, newTaskId, ctx);
}

/**
 * What finishing a task pays (user decision 2026-09-28). Every completed task
 * pays, not only the day's designated cores, and there is no daily total: the
 * user asked for the designation to stop being the price of being paid.
 *
 * The source key still carries the day and the task, so one task pays once a
 * day however many times it is toggled, and it is the same key the core grants
 * already used - a task paid before this change is not paid again. A protocol
 * with times of day is paid through `onSlotCompleted` instead, one key a time.
 *
 * Designating a core still means something: it is what opens the day's
 * deployment gate (G1).
 */
export function onTaskCompleted(book: RewardBook, plan: CorePlan, taskId: string, completedAt: Date, timeZone = DEFAULT_TIME_ZONE): PlannedEntry | null {
    return payFor(book, plan, taskId, completedAt, timeZone, null);
}

/**
 * What settling one time of day pays: the same +10, keyed to that time, so a
 * protocol pays once per time rather than once per day. Idempotent per time,
 * so replaying the whole `slotsDone` list only pays for what is still unpaid.
 */
export function onSlotCompleted(book: RewardBook, plan: CorePlan, taskId: string, slot: string, completedAt: Date, timeZone = DEFAULT_TIME_ZONE): PlannedEntry | null {
    return payFor(book, plan, taskId, completedAt, timeZone, slot);
}

function payFor(book: RewardBook, plan: CorePlan, taskId: string, completedAt: Date, timeZone: string, slot: string | null): PlannedEntry | null {
    const day = dayKey(completedAt, timeZone);
    const isCore = day === plan.day && plan.taskIds.includes(taskId);
    const what = isCore ? '完成今日核心' : '完成任務';
    return planGrant(book, {
        sourceKey: slot === null ? coreKey(day, taskId) : slotKey(day, taskId, slot),
        amount: CORE_REWARD,
        day,
        at: completedAt,
        reason: slot === null ? what : `${what} ${slot}`,
    });
}
