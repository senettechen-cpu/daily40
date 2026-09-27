import { randomUUID } from 'crypto';
import type { Db } from '../db';
import {
    DEFAULT_TIME_ZONE, closeKey, dayKey, isActive, projectEligible, reconcileProject, RewardProject, setMilestones,
} from '../shared/rewards';
import { CratePrize, VETERAN_XP, daysBetween, effectiveDifficulty, openCrate } from '../shared/progression';
import { fallbackName, recruitTemplate } from '../shared/roster';
import { appendEntries } from './store';
import { loadWithStartingGrant } from './service';
import { loadAuthorizations } from '../armory/service';
import { loadCharacters, loadPersonnelAuthorizations } from '../roster/service';

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

/** What a sealed plan's crate held, as the client shows it. */
export interface CrateRecord {
    projectId: string;
    difficulty: number;
    rarity: CratePrize['rarity'];
    kind: CratePrize['kind'];
    catalogId?: string;
    templateId?: string;
    veteran: boolean;
    itemId?: string;
    characterId?: string;
    /** The new soldier's name; only on the close response, the table does not keep it. */
    name?: string;
    openedAt: string;
}

interface CrateRow {
    project_id: string; difficulty: number; rarity: string; kind: string;
    catalog_id: string | null; template_id: string | null; veteran: boolean;
    item_id: string | null; character_id: string | null; opened_at: string;
}

const toCrate = (row: CrateRow): CrateRecord => ({
    projectId: row.project_id,
    difficulty: row.difficulty,
    rarity: row.rarity as CrateRecord['rarity'],
    kind: row.kind as CrateRecord['kind'],
    catalogId: row.catalog_id ?? undefined,
    templateId: row.template_id ?? undefined,
    veteran: !!row.veteran,
    itemId: row.item_id ?? undefined,
    characterId: row.character_id ?? undefined,
    openedAt: new Date(row.opened_at).toISOString(),
});

const CRATE_COLUMNS = 'project_id, difficulty, rarity, kind, catalog_id, template_id, veteran, item_id, character_id, opened_at';

export async function loadCrates(db: Db, userId: string): Promise<CrateRecord[]> {
    const result = await db.query(`SELECT ${CRATE_COLUMNS} FROM project_crates WHERE user_id = $1`, [userId]);
    return (result.rows as CrateRow[]).map(toCrate);
}

/** A sealed plan is read-only: no edits, no milestone changes, no deletion. */
export async function isSealed(db: Db, userId: string, projectId: string): Promise<boolean> {
    const result = await db.query('SELECT sealed_at FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
    return !!result.rows[0]?.sealed_at;
}

export type CloseResult =
    | { error: string; status: number }
    | { sealedAt: string; crate: CrateRecord | null; reason: string | null; alreadySealed: boolean };

/**
 * Closes a plan: the one explicit, final act (user decision 2026-09-27). Every
 * subtask must be done. The plan is sealed whether or not it earns a crate,
 * and a sealed plan answers a repeated close with the crate it already opened,
 * so a retried request can never draw twice.
 *
 * A crate needs the same eligibility the milestones do, a close on a later day
 * than creation, and a plan that never received the retired +60. Its seed is
 * the user and the plan, so nothing about the request can steer the draw.
 */
export async function closeProject(db: Db, userId: string, projectId: string, now: Date): Promise<CloseResult> {
    const found = await db.query(
        'SELECT sub_tasks, milestone_ids, created_at, sealed_at, difficulty FROM projects WHERE id = $1 AND user_id = $2',
        [projectId, userId],
    );
    const row = found.rows[0];
    if (!row) return { error: '找不到這個作戰計畫。', status: 404 };

    if (row.sealed_at) {
        const existing = await db.query(`SELECT ${CRATE_COLUMNS} FROM project_crates WHERE user_id = $1 AND project_id = $2`, [userId, projectId]);
        const crate = existing.rows[0] ? toCrate(existing.rows[0] as CrateRow) : null;
        return { sealedAt: new Date(row.sealed_at).toISOString(), crate, reason: null, alreadySealed: true };
    }

    const subTasks = (row.sub_tasks ?? []) as { id: string; completed?: boolean }[];
    if (subTasks.length === 0 || subTasks.some(sub => !sub.completed)) {
        return { error: '所有子計畫都完成後才能結案。', status: 409 };
    }

    const project: RewardProject = {
        createdAt: new Date(row.created_at),
        subTasks: subTasks.map(sub => ({ id: sub.id, completed: !!sub.completed })),
        milestoneIds: Array.isArray(row.milestone_ids) ? row.milestone_ids : [],
    };
    const book = await loadWithStartingGrant(db, userId, now);
    const daysOpen = daysBetween(dayKey(project.createdAt, timeZone), dayKey(now, timeZone));
    const level = effectiveDifficulty(row.difficulty ?? 1, subTasks.length, daysOpen);

    let reason: string | null = null;
    if (isActive(book, closeKey(projectId))) reason = '這個計畫已領過舊制的結案 +60 軍需，不再開補給箱。';
    else if (!projectEligible(project)) reason = '至少要有 3 個子計畫並指定 3 個里程碑，結案才會開補給箱。';
    else if (level === 0) reason = '同一天建立又結案，不會開補給箱。';

    let crate: CrateRecord | null = null;
    if (!reason) {
        const [equipment, personnel] = await Promise.all([loadAuthorizations(db, userId), loadPersonnelAuthorizations(db, userId)]);
        const prize = openCrate(`crate:${userId}:${projectId}`, level, { equipment, personnel });
        crate = await deliverPrize(db, userId, projectId, level, prize, now);
    }

    await db.query('UPDATE projects SET sealed_at = $1, completed = $2 WHERE id = $3 AND user_id = $4', [now, true, projectId, userId]);
    await syncProjectRewards(db, userId, projectId, now);
    return { sealedAt: now.toISOString(), crate, reason, alreadySealed: false };
}

/** Puts the prize where it belongs: gear into the armoury as issued (paid 0, so it refunds 0), a soldier onto the roster. */
async function deliverPrize(db: Db, userId: string, projectId: string, level: number, prize: CratePrize, now: Date): Promise<CrateRecord> {
    const record: CrateRecord = {
        projectId, difficulty: level, rarity: prize.rarity, kind: prize.kind, veteran: false, openedAt: now.toISOString(),
    };

    if (prize.kind === 'equipment') {
        record.catalogId = prize.catalogId;
        record.itemId = randomUUID();
        await db.query(
            'INSERT INTO equipment_items (id, user_id, catalog_id, assigned_to, paid) VALUES ($1, $2, $3, NULL, $4)',
            [record.itemId, userId, prize.catalogId, 0],
        );
    } else {
        const template = recruitTemplate(prize.templateId);
        if (!template) throw new Error(`crate drew an unknown recruit template: ${prize.templateId}`);
        const roster = await loadCharacters(db, userId);
        record.templateId = prize.templateId;
        record.veteran = prize.veteran;
        record.characterId = randomUUID();
        record.name = fallbackName(roster.map(c => c.name));
        await db.query(
            'INSERT INTO roster_characters (id, user_id, name, origin, duty, asset_id, xp, health) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [record.characterId, userId, record.name, template.origin, template.duty,
                template.assetId ?? null, prize.veteran ? VETERAN_XP : 0, 'fit'],
        );
    }

    await db.query(
        `INSERT INTO project_crates (user_id, project_id, difficulty, rarity, kind, catalog_id, template_id, veteran, item_id, character_id, opened_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [userId, projectId, level, prize.rarity, prize.kind, record.catalogId ?? null, record.templateId ?? null,
            record.veteran, record.itemId ?? null, record.characterId ?? null, now],
    );
    return record;
}
