import { randomInt, randomUUID } from 'crypto';
import type { Db } from '../db';
import {
    MAX_TRAINEES, Outcome, SCENARIOS, awardsFor, createBattle, deploymentFor, operationGate,
    runBattle, setupFor,
} from '../shared/battle';
import { SQUAD_SIZE, validateSquad } from '../shared/roster';
import { DEFAULT_TIME_ZONE, dayKey } from '../shared/rewards';
import { newlyUnlocked } from '../shared/progression';
import { loadBook } from '../rewards/store';
import { loadCharacters, loadSquads } from '../roster/service';
import { loadItems } from '../armory/service';

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

export interface StartRequest {
    squadId: string;
    scenarioId: string;
    traineeIds?: string[];
    lanes?: number[];
}

/**
 * Starts and resolves one operation. The server builds the deployment from its
 * own records, runs the simulation itself and stores the outcome, so a client
 * can replay the battle but can never claim a result it did not get.
 */
export async function startOperation(db: Db, userId: string, request: StartRequest, now: Date) {
    const gate = await readGate(db, userId, now);
    if (!gate.allowed) return { error: gate.reason };

    const scenario = SCENARIOS.find(candidate => candidate.id === request.scenarioId);
    if (!scenario) return { error: '找不到這個情境。' };

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
    const { crew, unmodelled } = deploymentFor(members, items);

    // Trainees must be on the roster and not already deployed.
    const deployedIds = new Set(squad.memberIds);
    const trainees = (request.traineeIds ?? [])
        .filter(id => byId.has(id) && !deployedIds.has(id))
        .slice(0, MAX_TRAINEES)
        .map(id => byId.get(id)!);

    const lanes = request.lanes && request.lanes.length === SQUAD_SIZE ? request.lanes : scenario.lanes;
    // A fresh seed per operation: the scenario's own seed is the reproducible one
    // for testing, and reusing it made every battle of a scenario identical, so a
    // won fight could be replayed for XP indefinitely. The roll is stored, which
    // keeps the report an exact replay of what the server resolved.
    const seed = randomInt(1, 2 ** 31 - 1);
    const finished = runBattle(createBattle(setupFor(scenario, lanes, seed, crew)));
    const outcome = (finished.status === 'running' ? 'timeout' : finished.status) as Outcome;

    const id = randomUUID();
    await db.query(
        `INSERT INTO operations (id, user_id, squad_id, scenario_id, seed, crew, trainee_ids, outcome, pays_xp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, userId, squad.id, scenario.id, seed, JSON.stringify(crew),
            JSON.stringify(trainees.map(t => t.id)), outcome, gate.paysRequisition],
    );

    // A rest day or exemption opens the gate but pays nothing, XP included.
    const awards = gate.paysRequisition
        ? awardsFor(outcome, members.map(m => ({ id: m.id, xp: m.xp })), trainees.map(t => ({ id: t.id, xp: t.xp })))
        : [];

    for (const award of awards) {
        await db.query('UPDATE roster_characters SET xp = xp + $1 WHERE id = $2 AND user_id = $3',
            [award.amount, award.characterId, userId]);
    }

    // A victory may earn a commendation, which is the only thing in v1.5 that
    // writes an authorization: without it the restricted catalogue is unreachable.
    const unlocked = outcome === 'victory' ? await grantCommendations(db, userId) : { equipment: [], personnel: [] };

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
        operation: { id, scenarioId: scenario.id, seed, lanes, crew, outcome, paysXp: gate.paysRequisition },
        awards,
        unmodelled,
        woundedIds,
        unlocked,
    };
}

/**
 * Counts the account's won operations and writes any authorization that count
 * has just earned. Inserts ignore a row that is already there, so replaying or
 * retrying never double-grants, and an authorization is never taken away.
 */
async function grantCommendations(db: Db, userId: string) {
    const counted = await db.query(
        "SELECT COUNT(*)::int AS won FROM operations WHERE user_id = $1 AND outcome = 'victory'", [userId]);
    const victories = counted.rows[0]?.won ?? 0;
    const earned = newlyUnlocked(victories);

    for (const catalogId of earned.equipment) {
        await db.query(
            'INSERT INTO equipment_authorizations (user_id, catalog_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [userId, catalogId]);
    }
    for (const templateId of earned.personnel) {
        await db.query(
            'INSERT INTO personnel_authorizations (user_id, template_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [userId, templateId]);
    }
    return { ...earned, victories };
}
