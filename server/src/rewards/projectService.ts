import type { Db } from '../db';
import { DEFAULT_TIME_ZONE, reconcileProject, RewardProject, setMilestones } from '../shared/rewards';
import { appendEntries } from './store';
import { loadWithStartingGrant } from './service';

const timeZone = DEFAULT_TIME_ZONE;

interface ProjectRow {
    sub_tasks: { id: string; completed?: boolean }[] | null;
    milestone_ids: string[] | null;
    created_at: string;
    closed_at: string | null;
}

async function loadProject(db: Db, userId: string, projectId: string): Promise<RewardProject | null> {
    const result = await db.query(
        'SELECT sub_tasks, milestone_ids, created_at, closed_at FROM projects WHERE id = $1 AND user_id = $2',
        [projectId, userId],
    );
    const row = result.rows[0] as ProjectRow | undefined;
    if (!row) return null;
    return {
        createdAt: new Date(row.created_at),
        closedAt: row.closed_at ? new Date(row.closed_at) : null,
        subTasks: (row.sub_tasks ?? []).map(sub => ({ id: sub.id, completed: !!sub.completed })),
        milestoneIds: Array.isArray(row.milestone_ids) ? row.milestone_ids : [],
    };
}

/**
 * Stamps closed_at the first time every subtask is complete and clears it when
 * the project reopens, because the close reward depends on the closing day.
 */
export async function refreshClosedAt(db: Db, userId: string, projectId: string, now: Date) {
    const project = await loadProject(db, userId, projectId);
    if (!project) return;

    const allDone = project.subTasks.length > 0 && project.subTasks.every(sub => sub.completed);
    if (allDone && !project.closedAt) {
        await db.query('UPDATE projects SET closed_at = $1 WHERE id = $2 AND user_id = $3', [now, projectId, userId]);
    } else if (!allDone && project.closedAt) {
        await db.query('UPDATE projects SET closed_at = NULL WHERE id = $1 AND user_id = $2', [projectId, userId]);
    }
}

/**
 * Brings the book in line with the project's current state: grants newly earned
 * milestones and the close bonus, reverses any whose cause no longer holds.
 * Pass a deleted project's id and it reverses everything for that project.
 */
export async function syncProjectRewards(db: Db, userId: string, projectId: string, now: Date): Promise<number> {
    const project = await loadProject(db, userId, projectId);
    const book = await loadWithStartingGrant(db, userId, now);
    const planned = reconcileProject(book, projectId, project, now, timeZone);
    await appendEntries(db, userId, book, planned);
    return planned.reduce((sum, entry) => sum + (entry?.amount ?? 0), 0);
}

export async function saveMilestones(db: Db, userId: string, projectId: string, milestoneIds: string[], now: Date) {
    const project = await loadProject(db, userId, projectId);
    if (!project) return { error: '找不到這個專案。' };

    const result = setMilestones(project, milestoneIds);
    if ('error' in result) return result;

    await db.query(
        'UPDATE projects SET milestone_ids = $1 WHERE id = $2 AND user_id = $3',
        [JSON.stringify(result.milestoneIds), projectId, userId],
    );
    await syncProjectRewards(db, userId, projectId, now);
    return result;
}
