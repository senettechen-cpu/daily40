import { PlannedEntry, reconcile, RewardBook, RewardCause } from './book';
import { dayKey, DEFAULT_TIME_ZONE } from '../time';

// Projects: no monthly limit, at most 120 each. Exactly three designated
// milestones pay +20 each; closing pays +60 only when closed on a later day
// than the project was created. Removing the cause reverses the reward.
export const MILESTONE_REWARD = 20;
export const CLOSE_REWARD = 60;
export const MILESTONE_COUNT = 3;
export const MIN_SUBTASKS = 3;
export const milestoneKey = (projectId: string, subTaskId: string) => `project:${projectId}:ms:${subTaskId}`;
export const closeKey = (projectId: string) => `project:${projectId}:close`;

export interface RewardProject {
    createdAt: Date;
    closedAt?: Date | null; // when every subtask became completed; cleared when reopened
    subTasks: { id: string; completed: boolean }[];
    milestoneIds: string[];
}

export type MilestoneResult = { milestoneIds: string[] } | { error: string };

/** Newly designated milestones must be uncompleted; completed ones stay locked in. */
export function setMilestones(project: RewardProject, nextIds: string[]): MilestoneResult {
    const ids = [...new Set(nextIds)];
    if (ids.length > MILESTONE_COUNT) return { error: `里程碑最多 ${MILESTONE_COUNT} 個。` };
    const byId = new Map(project.subTasks.map(s => [s.id, s]));
    if (ids.some(id => !byId.has(id))) return { error: '里程碑必須是這個專案的子項。' };
    if (project.milestoneIds.some(id => byId.get(id)?.completed && !ids.includes(id))) return { error: '已完成的里程碑已鎖定，不能取消。' };
    if (ids.some(id => !project.milestoneIds.includes(id) && byId.get(id)!.completed)) return { error: '已完成的子項不能改指定為里程碑。' };
    return { milestoneIds: ids };
}

/** New rewards start only once the project has enough subtasks and exactly three milestones. */
export const projectEligible = (project: RewardProject) =>
    project.subTasks.length >= MIN_SUBTASKS && project.milestoneIds.length === MILESTONE_COUNT;

/**
 * Return the grants and reversals that bring the book in line with the project's
 * current state. Pass `project = null` once it is deleted. Eligibility gates only
 * new payments, so designating a replacement milestone never claws back the
 * other two.
 */
export function reconcileProject(book: RewardBook, projectId: string, project: RewardProject | null, at: Date, timeZone = DEFAULT_TIME_ZONE): PlannedEntry[] {
    const causes: RewardCause[] = [];
    if (project) {
        const eligible = projectEligible(project);
        const completed = new Set(project.subTasks.filter(s => s.completed).map(s => s.id));
        for (const id of project.milestoneIds) {
            if (completed.has(id)) causes.push({ sourceKey: milestoneKey(projectId, id), amount: MILESTONE_REWARD, reason: '專案里程碑', mayStart: eligible });
        }
        const closedLater = !!project.closedAt && dayKey(project.closedAt, timeZone) > dayKey(project.createdAt, timeZone);
        if (project.subTasks.length > 0 && completed.size === project.subTasks.length) {
            causes.push({ sourceKey: closeKey(projectId), amount: CLOSE_REWARD, reason: '專案結案', mayStart: eligible && closedLater });
        }
    }
    return reconcile(book, `project:${projectId}:`, causes, dayKey(at, timeZone), at, project ? '專案獎勵條件不再成立' : '刪除專案');
}
