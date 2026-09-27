import type { Db } from '../db';
import {
    Domain, ESCORT_MISSIONS, GrowthPlan, GrowthRecord, MissionDef, ORIGINAL_BRANCH_MIN_LEVEL, PROFILE_ID,
    STAGE_COUNT, emptyPlan, escortState, implantRefusal, isDomain, planRefusal, recordRefusal, stageDef,
} from '../shared/ascension';
import { Character, Origin, inAscension, levelOf } from '../shared/roster';
import { catalogItem } from '../shared/armory';
import { DEFAULT_TIME_ZONE, dayKey } from '../shared/rewards';
import { normalizeSlots, slotsMet } from '../shared/tasks';
import { campaignFrom } from '../shared/sector';
import { loadCharacters } from '../roster/service';
import { loadItems } from '../armory/service';

// Ascension on the server: the day's designation, growth records written when a
// designated task completes, stage implants and the graduation. Everything a
// client sees is derived from these rows; nothing it sends is trusted as progress.

/** Only the Astra Militarum line may apply for the original branch; sisters, priests and the rest keep their own endgame. */
export const ORIGINAL_BRANCH_ORIGINS: Origin[] = ['cadian', 'catachan', 'krieg', 'kasrkin', 'scion'];

/** Graduation: the compatible-gear authorization and the one-time, unsellable loaned kit (handoff §5). */
const GRADUATE_GEAR = ['astartes-boltgun', 'astartes-power-armour'];
const loanId = (characterId: string, catalogId: string) => `kit-loan-${characterId}-${catalogId}`;
/** An aspirant arrives with the same basic issue the starting six had. */
const ASPIRANT_KIT = ['lasgun', 'laspistol'];
const aspirantKitId = (characterId: string, catalogId: string) => `kit-asp-${characterId}-${catalogId}`;
/** Deterministic, so a re-sent escort victory can never bring the same candidate twice. */
export const aspirantId = (userId: string, missionId: string) => `aspirant-${missionId}-${userId}`;

export interface StoredRecord extends GrowthRecord { candidateId: string; taskId: string; sourceKey: string }

export async function loadRecords(db: Db, userId: string): Promise<StoredRecord[]> {
    const result = await db.query(
        'SELECT source_key, candidate_id, stage, domain, day, task_id FROM growth_records WHERE user_id = $1 ORDER BY created_at, source_key',
        [userId],
    );
    return result.rows.map(row => ({
        sourceKey: row.source_key, candidateId: row.candidate_id, stage: Number(row.stage),
        domain: row.domain as Domain, day: row.day, taskId: row.task_id,
    }));
}

export async function loadPlan(db: Db, userId: string, day: string): Promise<GrowthPlan> {
    const result = await db.query('SELECT candidate_id, slots FROM growth_plans WHERE user_id = $1 AND day = $2', [userId, day]);
    const row = result.rows[0];
    if (!row) return emptyPlan(day);
    const slots = (Array.isArray(row.slots) ? row.slots : [])
        .filter((s: { taskId?: unknown; domain?: unknown }) => typeof s?.taskId === 'string' && isDomain(s.domain));
    return { day, candidateId: row.candidate_id ?? null, slots };
}

export interface MissionWin { missionId: string; candidateId: string | null }

export async function loadMissionWins(db: Db, userId: string): Promise<MissionWin[]> {
    const result = await db.query(
        "SELECT mission_id, candidate_id FROM operations WHERE user_id = $1 AND mission_id IS NOT NULL AND outcome = 'victory'",
        [userId],
    );
    return result.rows.map(row => ({ missionId: row.mission_id, candidateId: row.candidate_id ?? null }));
}

export const stagesWonBy = (wins: MissionWin[], candidateId: string) =>
    wins.filter(w => w.candidateId === candidateId && w.missionId.startsWith('stage-')).map(w => Number(w.missionId.slice(6)));

export async function loadImplants(db: Db, userId: string) {
    const result = await db.query(
        'SELECT character_id, stage, organ_ids, implanted_at FROM ascension_implants WHERE user_id = $1 ORDER BY stage',
        [userId],
    );
    return result.rows.map(row => ({
        characterId: row.character_id as string, stage: Number(row.stage),
        organIds: Array.isArray(row.organ_ids) ? row.organ_ids as string[] : [],
        at: new Date(row.implanted_at).toISOString(),
    }));
}

async function capturedStrongholds(db: Db, userId: string): Promise<Set<string>> {
    const result = await db.query(
        'SELECT stronghold_id, outcome, started_at, crew FROM operations WHERE user_id = $1 AND stronghold_id IS NOT NULL ORDER BY started_at',
        [userId],
    );
    const { captured } = campaignFrom(result.rows.map(row => ({
        strongholdId: row.stronghold_id, outcome: row.outcome, at: new Date(row.started_at).toISOString(), crewIds: [],
    })));
    return new Set(captured);
}

interface TaskState { id: string; completedToday: boolean }

/** Which of the account's tasks are already done today, the way the core reward reads it. */
async function taskStates(db: Db, userId: string, day: string): Promise<TaskState[]> {
    const result = await db.query(
        'SELECT id, last_completed_at, due_times, slots_done, slots_day FROM tasks WHERE user_id = $1',
        [userId],
    );
    return result.rows.map(row => {
        const doneToday = !!row.last_completed_at && dayKey(new Date(row.last_completed_at), DEFAULT_TIME_ZONE) === day;
        const slots = normalizeSlots(row.due_times);
        const met = slots.length === 0 || slotsMet(slots, row.slots_day === day ? row.slots_done : []);
        return { id: row.id, completedToday: doneToday && met };
    });
}

export async function readAscension(db: Db, userId: string, now: Date) {
    const day = dayKey(now, DEFAULT_TIME_ZONE);
    // The old account-wide astartes JSON in game_state is neither read nor
    // converted here: the user decided (2026-09-27) to keep it in the database
    // and stop showing it (handoff §7 forbids converting it without approval).
    const [roster, records, plan, wins, implants, captured] = await Promise.all([
        loadCharacters(db, userId), loadRecords(db, userId), loadPlan(db, userId, day),
        loadMissionWins(db, userId), loadImplants(db, userId), capturedStrongholds(db, userId),
    ]);

    const escortsWon = new Set(wins.map(w => w.missionId));
    const escorts = ESCORT_MISSIONS.map(m => ({
        id: m.id, name: m.name, after: m.after, aspirantName: m.aspirantName,
        state: escortState(m, captured, escortsWon),
    }));

    const candidates = roster.filter(c => c.ascensionRoute).map(c => ({
        id: c.id,
        stage: c.ascensionStage ?? 0,
        route: c.ascensionRoute!,
        graduated: !inAscension(c),
        records: records.filter(r => r.candidateId === c.id).map(({ domain, stage, day: d, taskId }) => ({ domain, stage, day: d, taskId })),
        stagesWon: stagesWonBy(wins, c.id),
        implants: implants.filter(i => i.characterId === c.id),
    }));

    const eligibleOriginal = roster
        .filter(c => !c.ascensionRoute && ORIGINAL_BRANCH_ORIGINS.includes(c.origin) && levelOf(c.xp) >= ORIGINAL_BRANCH_MIN_LEVEL)
        .map(c => c.id);

    const recordedTaskIds = records.filter(r => r.day === day).map(r => r.taskId);
    return { day, profileId: PROFILE_ID, plan, recordedTaskIds, candidates, escorts, eligibleOriginal };
}

export async function savePlan(db: Db, userId: string, input: { candidateId?: unknown; slots?: unknown }, now: Date) {
    const day = dayKey(now, DEFAULT_TIME_ZONE);
    const slots: { taskId?: unknown; domain?: unknown }[] = Array.isArray(input.slots) ? input.slots : [];
    if (slots.some(s => typeof s?.taskId !== 'string' || !isDomain(s?.domain))) return { error: '指定格式不正確。' };
    const next: GrowthPlan = {
        day,
        candidateId: typeof input.candidateId === 'string' ? input.candidateId : null,
        slots: slots.map(s => ({ taskId: s.taskId as string, domain: s.domain as Domain })),
    };

    const [current, roster, records, tasks] = await Promise.all([
        loadPlan(db, userId, day), loadCharacters(db, userId), loadRecords(db, userId), taskStates(db, userId, day),
    ]);
    const known = new Set(tasks.map(t => t.id));
    if (next.slots.some(s => !known.has(s.taskId))) return { error: '找不到指定的任務。' };

    const error = planRefusal(current, next, {
        candidateIds: roster.filter(inAscension).map(c => c.id),
        completedTaskIds: tasks.filter(t => t.completedToday).map(t => t.id),
        recordedTaskIds: records.filter(r => r.day === day).map(r => r.taskId),
    });
    if (error) return { error };

    await db.query(
        `INSERT INTO growth_plans (user_id, day, candidate_id, slots) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, day) DO UPDATE SET candidate_id = EXCLUDED.candidate_id, slots = EXCLUDED.slots`,
        [userId, day, next.candidateId, JSON.stringify(next.slots)],
    );
    return { plan: next };
}

/**
 * Called in the same transaction as a task's completion. If today's plan
 * designated the task, the record goes to the plan's candidate and their
 * current stage; the key (day, task) makes a re-sent completion land once.
 * A refused record (stage full, domain capped, finance already this week) is
 * reported, not stored, so nothing silently over-fills a stage.
 */
export async function recordGrowthForTask(db: Db, userId: string, taskId: string, completedAt: Date) {
    const day = dayKey(completedAt, DEFAULT_TIME_ZONE);
    const plan = await loadPlan(db, userId, day);
    const slot = plan.slots.find(s => s.taskId === taskId);
    if (!slot || !plan.candidateId) return null;

    const roster = await loadCharacters(db, userId);
    const candidate = roster.find(c => c.id === plan.candidateId);
    if (!candidate || !inAscension(candidate)) return null;

    const sourceKey = `growth:${day}:${taskId}`;
    const all = await loadRecords(db, userId);
    if (all.some(r => r.sourceKey === sourceKey)) return null;
    const own = all.filter(r => r.candidateId === candidate.id);
    const stage = (candidate.ascensionStage ?? 0) + 1;
    const refused = recordRefusal(candidate.ascensionStage ?? 0, own, slot.domain, day);
    if (refused) return { recorded: false as const, reason: refused };

    await db.query(
        `INSERT INTO growth_records (user_id, source_key, candidate_id, stage, domain, day, task_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (user_id, source_key) DO NOTHING`,
        [userId, sourceKey, candidate.id, stage, slot.domain, day, taskId],
    );
    return { recorded: true as const, candidateId: candidate.id, stage, domain: slot.domain };
}

/** A voided task leaves today's designation, unless it has already produced its record. */
export async function releaseDesignation(db: Db, userId: string, taskId: string, now: Date) {
    const day = dayKey(now, DEFAULT_TIME_ZONE);
    const plan = await loadPlan(db, userId, day);
    if (!plan.slots.some(s => s.taskId === taskId)) return;
    const records = await loadRecords(db, userId);
    if (records.some(r => r.sourceKey === `growth:${day}:${taskId}`)) return;
    await db.query(
        `INSERT INTO growth_plans (user_id, day, candidate_id, slots) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, day) DO UPDATE SET candidate_id = EXCLUDED.candidate_id, slots = EXCLUDED.slots`,
        [userId, day, plan.candidateId, JSON.stringify(plan.slots.filter(s => s.taskId !== taskId))],
    );
}

export async function applyOriginal(db: Db, userId: string, characterId: string, acknowledged: boolean) {
    if (!acknowledged) return { error: '要先閱讀並確認原創路線說明。' };
    const roster = await loadCharacters(db, userId);
    const character = roster.find(c => c.id === characterId);
    if (!character) return { error: '找不到這名人員。' };
    if (character.ascensionRoute) return { error: `${character.name} 已經在飛昇路線上。` };
    if (!ORIGINAL_BRANCH_ORIGINS.includes(character.origin)) return { error: '原創路線只開放星界軍出身的人員。' };
    if (levelOf(character.xp) < ORIGINAL_BRANCH_MIN_LEVEL) return { error: `要達到 Lv${ORIGINAL_BRANCH_MIN_LEVEL} 才能申請。` };

    await db.query(
        "UPDATE roster_characters SET ascension_route = 'original-existing-soldier', ascension_stage = 0 WHERE id = $1 AND user_id = $2 AND ascension_route IS NULL",
        [characterId, userId],
    );
    return { characterId };
}

/**
 * An original-branch application can be withdrawn while nothing rides on it:
 * no stage implanted and no record earned. After that the soldier is committed.
 */
export async function withdrawOriginal(db: Db, userId: string, characterId: string, now: Date) {
    const [roster, records] = await Promise.all([loadCharacters(db, userId), loadRecords(db, userId)]);
    const character = roster.find(c => c.id === characterId);
    if (!character || character.ascensionRoute !== 'original-existing-soldier') return { error: '這名人員沒有申請原創路線。' };
    if ((character.ascensionStage ?? 0) > 0 || records.some(r => r.candidateId === characterId)) {
        return { error: '已經有成長紀錄或植入，不能撤回。' };
    }
    await db.query(
        'UPDATE roster_characters SET ascension_route = NULL WHERE id = $1 AND user_id = $2 AND ascension_stage = 0',
        [characterId, userId],
    );
    const day = dayKey(now, DEFAULT_TIME_ZONE);
    const plan = await loadPlan(db, userId, day);
    if (plan.candidateId === characterId) {
        await db.query("UPDATE growth_plans SET candidate_id = NULL, slots = '[]'::jsonb WHERE user_id = $1 AND day = $2", [userId, day]);
    }
    return { characterId };
}

/**
 * Implants one whole stage, atomically (handoff §6): the stage row, the new
 * stage on the character and, at stage V, the new identity and gear. The
 * stage row's key makes a re-sent confirmation return the stored result.
 */
export async function implantStage(db: Db, userId: string, characterId: string, stage: number) {
    const def = stageDef(stage);
    if (!def) return { error: '沒有這個階段。' };
    const [roster, records, wins, implants] = await Promise.all([
        loadCharacters(db, userId), loadRecords(db, userId), loadMissionWins(db, userId), loadImplants(db, userId),
    ]);
    const character = roster.find(c => c.id === characterId);
    if (!character || !character.ascensionRoute) return { error: '這名人員不在飛昇路線上。' };

    const existing = implants.find(i => i.characterId === characterId && i.stage === stage);
    if (existing) return { already: true, stage, organIds: existing.organIds };

    const refusal = implantRefusal(stage, {
        stage: character.ascensionStage ?? 0,
        records: records.filter(r => r.candidateId === characterId),
        missionsWon: stagesWonBy(wins, characterId),
    });
    if (refusal) return { error: refusal };

    const inserted = await db.query(
        `INSERT INTO ascension_implants (user_id, character_id, stage, profile_id, organ_ids)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (character_id, stage) DO NOTHING`,
        [userId, characterId, stage, PROFILE_ID, JSON.stringify(def.organIds)],
    );
    if (!inserted.rowCount) return { already: true, stage, organIds: def.organIds };

    const moved = await db.query(
        'UPDATE roster_characters SET ascension_stage = $1 WHERE id = $2 AND user_id = $3 AND ascension_stage = $4',
        [stage, characterId, userId, stage - 1],
    );
    // Another tab moved the stage in between: throwing rolls the implant row back too.
    if (!moved.rowCount) throw new Error('ascension stage changed concurrently');

    const graduation = stage === STAGE_COUNT ? await graduate(db, userId, character) : undefined;
    return { stage, organIds: def.organIds, graduation };
}

/**
 * Stage V: the same character becomes astartes. Human gear that no longer fits
 * goes back to the armoury (never destroyed), the compatible-gear authorization
 * opens, and the loaned basic kit is issued once, unsellable (handoff §5, §9).
 */
async function graduate(db: Db, userId: string, character: Character) {
    await db.query("UPDATE roster_characters SET origin = 'astartes' WHERE id = $1 AND user_id = $2", [character.id, userId]);
    for (const catalogId of GRADUATE_GEAR) {
        await db.query(
            'INSERT INTO equipment_authorizations (user_id, catalog_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [userId, catalogId]);
    }

    const items = await loadItems(db, userId);
    const returned: string[] = [];
    for (const item of items.filter(i => i.assignedTo === character.id)) {
        const definition = catalogItem(item.catalogId);
        if (!definition) continue;
        const humanOnly = !!definition.origins && !definition.origins.includes('astartes');
        // The loan fills the primary and armour slots, and human armour does not fit a marine.
        const displaced = definition.category === 'primary' || definition.category === 'armour';
        if (!humanOnly && !displaced) continue;
        await db.query('UPDATE equipment_items SET assigned_to = NULL WHERE id = $1 AND user_id = $2', [item.id, userId]);
        returned.push(item.id);
    }

    const loaned: string[] = [];
    for (const catalogId of GRADUATE_GEAR) {
        const id = loanId(character.id, catalogId);
        await db.query(
            'INSERT INTO equipment_items (id, user_id, catalog_id, assigned_to, paid) VALUES ($1, $2, $3, NULL, $4) ON CONFLICT (id) DO NOTHING',
            [id, userId, catalogId, 0],
        );
        await db.query('UPDATE equipment_items SET assigned_to = $1 WHERE id = $2 AND user_id = $3', [character.id, id, userId]);
        loaned.push(id);
    }
    return { returned, loaned };
}

/** The first win of an escort brings its aspirant onto the roster, with the basic issue. */
export async function bringAspirant(db: Db, userId: string, mission: MissionDef, now: Date): Promise<Character | undefined> {
    if (mission.kind !== 'escort' || !mission.aspirantName) return undefined;
    const id = aspirantId(userId, mission.id);
    const inserted = await db.query(
        `INSERT INTO roster_characters (id, user_id, name, origin, duty, asset_id, xp, health, ascension_route, ascension_stage)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING`,
        [id, userId, mission.aspirantName, 'aspirant', 'rifleman', null, 0, 'fit', 'new-aspirant', 0],
    );
    if (!inserted.rowCount) return undefined;
    for (const catalogId of ASPIRANT_KIT) {
        const itemId = aspirantKitId(id, catalogId);
        await db.query(
            'INSERT INTO equipment_items (id, user_id, catalog_id, assigned_to, paid) VALUES ($1, $2, $3, NULL, $4) ON CONFLICT (id) DO NOTHING',
            [itemId, userId, catalogId, 0],
        );
        await db.query('UPDATE equipment_items SET assigned_to = $1 WHERE id = $2 AND user_id = $3', [id, itemId, userId]);
    }
    return {
        id, name: mission.aspirantName, origin: 'aspirant', duty: 'rifleman', xp: 0, health: 'fit',
        recruitedAt: now.toISOString(), ascensionStage: 0, ascensionRoute: 'new-aspirant',
    };
}
