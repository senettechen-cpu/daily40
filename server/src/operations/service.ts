import { randomInt, randomUUID } from 'crypto';
import type { Db } from '../db';
import { MAX_TRAINEES, Outcome, awardsFor, operationGate } from '../shared/battle';
import {
    assignHeavyCrew, crewFor, placementsFor, resolveGuards, runBattle, scenarioById,
} from '../shared/battle/turn';
import { SQUAD_SIZE, inAscension, validateSquad } from '../shared/roster';
import { MissionDef, missionById, missionSquadError, strongholdSquadError } from '../shared/ascension';
import { DEFAULT_TIME_ZONE, dayKey } from '../shared/rewards';
import { FIRST_CAPTURE_XP, OperationSummary, campaignFrom, checkAttack } from '../shared/sector';
import { loadBook } from '../rewards/store';
import { loadCharacters, loadSquads } from '../roster/service';
import { loadItems } from '../armory/service';
import { bringAspirant, loadMissionWins, stagesWonBy } from '../ascension/service';

/** Cores already paid today; the G1 gate counts these, not anything the client says. */
async function completedCoresToday(db: Db, userId: string, now: Date): Promise<number> {
    const today = dayKey(now, DEFAULT_TIME_ZONE);
    const book = await loadBook(db, userId);
    return book.entries.filter(entry => entry.kind === 'grant' && entry.sourceKey.startsWith(`core:${today}:`)).length;
}

export async function readGate(db: Db, userId: string, now: Date) {
    const completedCores = await completedCoresToday(db, userId, now);
    // Rest days and exemptions belong to D2, which is not built; reported as
    // false rather than guessed at.
    return {
        ...operationGate({ completedCores, restDay: false, exempt: false }),
        completedCores,
        day: dayKey(now, DEFAULT_TIME_ZONE),
    };
}

/** Every campaign operation the account has fought, oldest first. */
async function loadCampaignOperations(db: Db, userId: string): Promise<OperationSummary[]> {
    const result = await db.query(
        'SELECT stronghold_id, outcome, started_at, crew FROM operations WHERE user_id = $1 AND stronghold_id IS NOT NULL ORDER BY started_at',
        [userId],
    );
    return result.rows.map(row => ({
        strongholdId: row.stronghold_id,
        outcome: row.outcome,
        at: new Date(row.started_at).toISOString(),
        crewIds: (Array.isArray(row.crew) ? row.crew : []).map((unit: { id: string }) => unit.id),
    }));
}

/** The campaign as the account stands: every stronghold's state and every soldier's service record. */
export async function readCampaign(db: Db, userId: string) {
    const { strongholds, service, recovered } = campaignFrom(await loadCampaignOperations(db, userId));
    return { strongholds, service, recovered };
}

export interface StartRequest {
    squadId: string;
    /** A stronghold of the sector campaign, or… */
    strongholdId?: string;
    /** …an ascension mission; a stage mission also names its candidate. */
    missionId?: string;
    candidateId?: string;
    traineeIds?: string[];
    lanes?: number[];
}

/**
 * Starts and resolves one operation against a stronghold. The server builds
 * the deployment from its own records, runs the simulation itself and stores
 * the outcome, so a client can replay the battle but never claim a result.
 *
 * Since the sector campaign (2026-09-27) every operation is fought at a
 * stronghold; the three phase-one scenarios left play and stay only as the
 * balance baseline.
 */
export async function startOperation(db: Db, userId: string, request: StartRequest, now: Date) {
    const gate = await readGate(db, userId, now);
    if (!gate.allowed) return { error: gate.reason };

    const history = await loadCampaignOperations(db, userId);
    const { captured } = campaignFrom(history);

    // An ascension mission is fought the same way; only what it asks of the
    // squad and what a win brings differ.
    const mission: MissionDef | undefined = request.missionId ? missionById(request.missionId) : undefined;
    if (request.missionId && !mission) return { error: '找不到這個人物任務。' };
    const check = mission ? undefined : checkAttack(request.strongholdId ?? '', captured);
    if (check && !check.ok) return { error: check.reason };
    const attack = check && check.ok ? check : undefined;

    const scenario = scenarioById(mission ? mission.scenarioId : attack?.scenarioId ?? '');
    if (!scenario) return { error: '找不到這個據點的作戰。' };

    const [squads, roster, items] = await Promise.all([
        loadSquads(db, userId), loadCharacters(db, userId), loadItems(db, userId),
    ]);
    const squad = squads.find(candidate => candidate.id === request.squadId);
    if (!squad) return { error: '找不到這個編成。' };

    const squadError = validateSquad(squad, roster, true, gate.day);
    if (squadError) return { error: squadError };
    if (squad.memberIds.length !== SQUAD_SIZE) return { error: `模擬固定部署 ${SQUAD_SIZE} 個通道，請補滿再出戰。` };

    const byId = new Map(roster.map(character => [character.id, character]));
    const members = squad.memberIds.map(id => byId.get(id)!);

    const candidate = mission?.kind === 'stage' && request.candidateId ? byId.get(request.candidateId) : undefined;
    if (mission) {
        const wins = await loadMissionWins(db, userId);
        const missionError = missionSquadError(mission, members, candidate, {
            captured: new Set(captured),
            escortsWon: new Set(wins.map(w => w.missionId)),
            stagesWon: candidate ? stagesWonBy(wins, candidate.id) : [],
        });
        if (missionError) return { error: missionError };
    } else {
        const candidateError = strongholdSquadError(members);
        if (candidateError) return { error: candidateError };
    }

    // The saved formation when it still fits the squad, a sensible default when
    // it does not, so a roster change never leaves a squad unable to deploy.
    const placements = placementsFor(scenario.board, members, squad.placements);
    const built = crewFor(members, items, placements);
    const crew = assignHeavyCrew(resolveGuards(built.units));
    const unmodelled = built.unmodelled;

    // Trainees must be on the roster and not already deployed.
    const deployedIds = new Set(squad.memberIds);
    // A candidate in training watches nobody else's battles either.
    const trainees = (request.traineeIds ?? [])
        .filter(id => byId.has(id) && !deployedIds.has(id) && !inAscension(byId.get(id)!))
        .slice(0, MAX_TRAINEES)
        .map(id => byId.get(id)!);

    // A fresh seed per operation: reusing one made every battle of a stronghold
    // identical, so a won fight could be replayed for xp indefinitely. The roll
    // is stored, which keeps the report an exact replay of what was resolved.
    const seed = randomInt(1, 2 ** 31 - 1);
    const finished = runBattle({ board: scenario.board, units: [...crew, ...scenario.enemies], seed, objective: scenario.objective });
    const outcome = finished.outcome as Outcome;
    const firstCapture = outcome === 'victory' && !!attack?.firstCapture;
    const strongholdId = attack?.stronghold.id ?? null;

    const id = randomUUID();
    await db.query(
        `INSERT INTO operations (id, user_id, squad_id, scenario_id, seed, crew, trainee_ids, outcome, pays_xp, engine, board, rounds, stronghold_id, mission_id, candidate_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'v2', $10, $11, $12, $13, $14)`,
        [id, userId, squad.id, scenario.id, seed, JSON.stringify(crew),
            JSON.stringify(trainees.map(t => t.id)), outcome, gate.paysRequisition,
            JSON.stringify(scenario.board), finished.rounds, strongholdId,
            mission?.id ?? null, candidate?.id ?? null],
    );

    // A rest day or exemption opens the gate but pays nothing, XP included.
    const awards = gate.paysRequisition
        ? awardsFor(outcome, members.map(m => ({ id: m.id, xp: m.xp })), trainees.map(t => ({ id: t.id, xp: t.xp })))
        : [];
    // The first capture of a stronghold pays each soldier who took it a little more.
    if (gate.paysRequisition && firstCapture) {
        for (const award of awards) if (award.role === 'deployed') award.amount += FIRST_CAPTURE_XP;
    }

    for (const award of awards) {
        await db.query('UPDATE roster_characters SET xp = xp + $1 WHERE id = $2 AND user_id = $3',
            [award.amount, award.characterId, userId]);
    }

    // Capturing a stronghold for the first time opens what it holds. This is
    // the only thing that writes an authorization; the count of won operations
    // no longer grants anything. Inserts ignore rows already there, so a retry
    // never double-grants, and an authorization is never taken back.
    const unlocked = firstCapture && attack ? await grantUnlocks(db, userId, attack.stronghold.unlocks) : { equipment: [], personnel: [] };

    // The first win of an escort brings the Ultramarines' candidate onto the roster.
    const aspirant = mission && outcome === 'victory' ? await bringAspirant(db, userId, mission, now) : undefined;

    // A defeat puts the squad that fought it out of action for the rest of the
    // day. Trainees stayed behind, so they are untouched.
    const woundedIds = outcome === 'defeat' ? squad.memberIds : [];
    if (woundedIds.length > 0) {
        await db.query(
            'UPDATE roster_characters SET wounded_day = $1 WHERE user_id = $2 AND id = ANY($3::text[])',
            [gate.day, userId, woundedIds],
        );
    }

    return {
        operation: {
            id, scenarioId: scenario.id, strongholdId: strongholdId ?? undefined, missionId: mission?.id, candidateId: candidate?.id,
            seed, crew, outcome, engine: 'v2' as const,
            board: scenario.board, rounds: finished.rounds, placements,
            paysXp: gate.paysRequisition,
        },
        activations: finished.activations,
        replay: {
            version: 1 as const, initialUnits: [...crew, ...scenario.enemies],
            initialBoard: scenario.board, objective: scenario.objective, result: finished,
        },
        awards,
        unmodelled,
        woundedIds,
        firstCapture,
        unlocked,
        aspirant,
    };
}

async function grantUnlocks(db: Db, userId: string, unlocks: { equipment: string[]; personnel: string[] }) {
    for (const catalogId of unlocks.equipment) {
        await db.query(
            'INSERT INTO equipment_authorizations (user_id, catalog_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [userId, catalogId]);
    }
    for (const templateId of unlocks.personnel) {
        await db.query(
            'INSERT INTO personnel_authorizations (user_id, template_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [userId, templateId]);
    }
    return { equipment: [...unlocks.equipment], personnel: [...unlocks.personnel] };
}
