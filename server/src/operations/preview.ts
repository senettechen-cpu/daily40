import type { Db } from '../db';
import {
    assignHeavyCrew, crewFor, placementsFor, resolveGuards, runBattle, scenarioById, threatsOf,
} from '../shared/battle/turn';
import { missionById } from '../shared/ascension';
import { strongholdById } from '../shared/sector';
import { loadCharacters, loadSquads } from '../roster/service';
import { loadItems } from '../armory/service';
import { readCampaign } from './service';

// Pre-battle intelligence (2026-09-27, system review P1-3, user decision 6):
// the threats a battle holds and an estimated win rate for the squad as it
// stands. It fights the same deployment startOperation would build, on fixed
// seeds so the estimate does not wobble between presses, and writes nothing:
// no operation, no XP, no wounds.

export const PREVIEW_BATTLES = 40;
const PREVIEW_SEED = 7919;

export interface PreviewRequest { squadId: string; strongholdId?: string; missionId?: string }

export async function previewOperation(db: Db, userId: string, request: PreviewRequest) {
    let scenarioId: string | undefined;
    if (request.missionId) {
        scenarioId = missionById(request.missionId)?.scenarioId;
    } else if (request.strongholdId) {
        const campaign = await readCampaign(db, userId);
        const state = campaign.strongholds.find(s => s.id === request.strongholdId)?.state;
        if (!state || state === 'locked' || state === 'pending') return { error: '這個據點還不能預估。' };
        scenarioId = strongholdById(request.strongholdId)?.scenarioId ?? undefined;
    }
    const scenario = scenarioId ? scenarioById(scenarioId) : undefined;
    if (!scenario) return { error: '找不到這場作戰。' };

    const [squads, roster, items] = await Promise.all([loadSquads(db, userId), loadCharacters(db, userId), loadItems(db, userId)]);
    const squad = squads.find(s => s.id === request.squadId);
    if (!squad) return { error: '找不到這個編成。' };
    const byId = new Map(roster.map(c => [c.id, c]));
    const members = squad.memberIds.map(id => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
    if (members.length === 0) return { error: '編成裡沒有人。' };

    const placements = placementsFor(scenario.board, members, squad.placements);
    const crew = assignHeavyCrew(resolveGuards(crewFor(members, items, placements).units));

    let won = 0;
    let timeouts = 0;
    const rounds: number[] = [];
    for (let i = 1; i <= PREVIEW_BATTLES; i += 1) {
        const result = runBattle({ board: scenario.board, units: [...crew, ...scenario.enemies], seed: i * PREVIEW_SEED, objective: scenario.objective });
        if (result.outcome === 'victory') won += 1;
        if (result.outcome === 'timeout') timeouts += 1;
        rounds.push(result.rounds);
    }
    rounds.sort((a, b) => a - b);
    return {
        battles: PREVIEW_BATTLES,
        winRate: won / PREVIEW_BATTLES,
        timeoutRate: timeouts / PREVIEW_BATTLES,
        medianRounds: rounds[Math.floor(rounds.length / 2)],
        threats: threatsOf(scenario.enemies, scenario.objective, crew),
    };
}
