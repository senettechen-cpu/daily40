import type { Character } from '../roster';
import { STAGES } from './rules';

// The character missions of ascension (user decisions 2026-09-27).
//
// Escort-and-assessment: capturing each world's boss stronghold brings the
// Ultramarines into contact, asking for cover while they extract a candidate.
// The first win of each escort brings that candidate onto the roster, so the
// chapter holds three at most.
//
// Stage missions: one dedicated training operation per stage, fought by a squad
// the candidate is in. Retried freely; a loss costs only the day's wound bar,
// never a growth record.

export interface MissionDef {
    id: string;
    kind: 'escort' | 'stage';
    name: string;
    scenarioId: string;
    /** Escorts: the stronghold whose capture opens it. */
    after?: string;
    /** Stage missions: the stage it clears the way to. */
    stage?: number;
    /** Escorts: who joins the roster on the first win. */
    aspirantName?: string;
}

export const ESCORT_MISSIONS: MissionDef[] = [
    { id: 'escort-1', kind: 'escort', name: '援護撤離：維斯帕里斯', scenarioId: 'asc-escort-1', after: 'w1-n4', aspirantName: '盧西烏斯' },
    { id: 'escort-2', kind: 'escort', name: '援護撤離：赫克斯鑄造環', scenarioId: 'asc-escort-2', after: 'w2-n4', aspirantName: '卡西安' },
    { id: 'escort-3', kind: 'escort', name: '援護撤離：卡斯托盧姆', scenarioId: 'asc-escort-3', after: 'w3-n4', aspirantName: '塔西圖斯' },
];

export const STAGE_MISSIONS: MissionDef[] = STAGES.map(s => ({
    id: `stage-${s.stage}`, kind: 'stage', name: s.mission, scenarioId: `asc-stage-${s.stage}`, stage: s.stage,
}));

export const MISSIONS = [...ESCORT_MISSIONS, ...STAGE_MISSIONS];
export const missionById = (id: string) => MISSIONS.find(m => m.id === id);

export type EscortState = 'locked' | 'open' | 'won';
export const escortState = (mission: MissionDef, captured: Set<string>, won: Set<string>): EscortState =>
    won.has(mission.id) ? 'won' : mission.after && captured.has(mission.after) ? 'open' : 'locked';

/** Entered ascension and not yet graduated. Mirrors roster's inAscension without importing it back. */
const training = (c: Pick<Character, 'ascensionRoute' | 'origin'>) => !!c.ascensionRoute && c.origin !== 'astartes';

/** Stronghold operations: a candidate in training fights only their own missions. */
export function strongholdSquadError(members: Character[]): string | null {
    const candidate = members.find(training);
    return candidate ? `${candidate.name} 正在接受飛昇改造，只能出自己的人物任務。` : null;
}

export interface MissionContext {
    captured: Set<string>;
    escortsWon: Set<string>;
    /** Stage missions this candidate has already won. */
    stagesWon: number[];
}

/** Why this squad cannot fight this mission, or null when it can. */
export function missionSquadError(mission: MissionDef, members: Character[], candidate: Character | undefined, ctx: MissionContext): string | null {
    if (mission.kind === 'escort') {
        const state = escortState(mission, ctx.captured, ctx.escortsWon);
        if (state === 'locked') return '要先收復這個世界的首領據點，才會和極限戰士取得聯繫。';
        if (state === 'won') return '這位候選人已經護送完成。';
        return strongholdSquadError(members);
    }
    if (!candidate || !training(candidate)) return '要指定一位培養中的候選人。';
    const current = candidate.ascensionStage ?? 0;
    if (mission.stage !== current + 1) return `${candidate.name} 目前的人物任務是第 ${current + 1} 階。`;
    if (ctx.stagesWon.includes(mission.stage)) return '這一階的人物任務已經通過，等待植入。';
    if (!members.some(m => m.id === candidate.id)) return `${candidate.name} 必須在出戰編成裡。`;
    const other = members.find(m => m.id !== candidate.id && training(m));
    if (other) return `${other.name} 也在接受改造，不能參加別人的人物任務。`;
    return null;
}
