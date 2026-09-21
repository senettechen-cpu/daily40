import { planGrant, PlannedEntry, RewardBook } from './book';
import { addDays, dayKey, DEFAULT_TIME_ZONE, minutesOfDay } from '../time';

// Daily core outcomes: up to three committed tasks, +10 each on completion.
// Plans may be set the day before. At 09:00 the count is capped at however many
// were committed by then; after that, uncompleted cores may still be swapped.
export const CORE_REWARD = 10;
export const CORE_MAX = 3;
export const CORE_CUTOFF_MINUTES = 9 * 60;
export const coreKey = (day: string, taskId: string) => `core:${day}:${taskId}`;

export interface CorePlan {
    day: string;
    taskIds: string[];
    lockedCap?: number; // recorded by the first change made after the cutoff
}

export interface CoreContext {
    now: Date;
    timeZone?: string;
    /** Whether the task already counts as completed for `plan.day`. */
    isCompleted: (taskId: string) => boolean;
}

export type CorePhase = 'too-early' | 'upcoming' | 'open' | 'locked' | 'past';
export type CoreResult = { plan: CorePlan } | { error: string };

export const emptyPlan = (day: string): CorePlan => ({ day, taskIds: [] });

export function corePhase(day: string, now: Date, timeZone = DEFAULT_TIME_ZONE): CorePhase {
    const today = dayKey(now, timeZone);
    if (day < today) return 'past';
    if (day === today) return minutesOfDay(now, timeZone) < CORE_CUTOFF_MINUTES ? 'open' : 'locked';
    return day === addDays(today, 1) ? 'upcoming' : 'too-early';
}

const capFor = (plan: CorePlan, phase: CorePhase) => phase === 'locked' ? plan.lockedCap ?? plan.taskIds.length : CORE_MAX;

/** How many cores the plan may hold right now. */
export const coreCap = (plan: CorePlan, now: Date, timeZone = DEFAULT_TIME_ZONE) => capFor(plan, corePhase(plan.day, now, timeZone));

function editable(plan: CorePlan, ctx: CoreContext): { plan: CorePlan; phase: CorePhase } | { error: string } {
    const phase = corePhase(plan.day, ctx.now, ctx.timeZone);
    if (phase === 'past') return { error: '這一天已經結束，核心不能再修改。' };
    if (phase === 'too-early') return { error: '只能提前設定隔天的核心。' };
    // Freeze the 09:00 count before the first post-cutoff change alters the list.
    if (phase === 'locked' && plan.lockedCap === undefined) return { plan: { ...plan, lockedCap: plan.taskIds.length }, phase };
    return { plan, phase };
}

export function addCore(plan: CorePlan, taskId: string, ctx: CoreContext): CoreResult {
    const ready = editable(plan, ctx);
    if ('error' in ready) return ready;
    const current = ready.plan;
    if (current.taskIds.includes(taskId)) return { plan };
    if (ctx.isCompleted(taskId)) return { error: '已完成的任務不能再設為核心。' };
    // Only the locked phase can lower the cap below CORE_MAX.
    const cap = capFor(current, ready.phase);
    if (current.taskIds.length >= cap) {
        return { error: cap < CORE_MAX ? `已過 09:00，今天的核心數量鎖定為 ${cap} 個，只能替換。` : `核心最多 ${CORE_MAX} 個。` };
    }
    return { plan: { ...current, taskIds: [...current.taskIds, taskId] } };
}

export function removeCore(plan: CorePlan, taskId: string, ctx: CoreContext): CoreResult {
    if (!plan.taskIds.includes(taskId)) return { plan };
    const ready = editable(plan, ctx);
    if ('error' in ready) return ready;
    if (ctx.isCompleted(taskId)) return { error: '已完成的核心已鎖定。' };
    return { plan: { ...ready.plan, taskIds: ready.plan.taskIds.filter(id => id !== taskId) } };
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
