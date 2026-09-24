import { planGrant, PlannedEntry, RewardBook } from './book';
import { addDays, dayKey, DEFAULT_TIME_ZONE } from '../time';

// Daily core outcomes: up to three committed tasks, +10 each on completion.
// Plans may be set the day before. The 09:00 cutoff was dropped on 2026-09-24:
// a missed morning used to lock the count at zero and shut the day's G1 gate,
// so cores may now be committed at any hour of their own day.
export const CORE_REWARD = 10;
export const CORE_MAX = 3;
export const coreKey = (day: string, taskId: string) => `core:${day}:${taskId}`;

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

export function onTaskCompleted(book: RewardBook, plan: CorePlan, taskId: string, completedAt: Date, timeZone = DEFAULT_TIME_ZONE): PlannedEntry | null {
    const day = dayKey(completedAt, timeZone);
    if (day !== plan.day || !plan.taskIds.includes(taskId)) return null;
    return planGrant(book, { sourceKey: coreKey(day, taskId), amount: CORE_REWARD, day, at: completedAt, reason: '完成今日核心' });
}
