// The 灰燼星區 recovery campaign (docs/campaign-and-operation-plans.md §2,
// decided by the user on 2026-09-27). Three worlds, four strongholds each.
// Capturing a stronghold is what opens restricted gear and personnel; the old
// count of won operations no longer grants anything.
//
// Progress is never stored separately: a stronghold is captured when the
// account has a won operation against it, so the operations table is the only
// record and the two can never disagree.

export type WorldId = 1 | 2 | 3;

export interface World {
    id: WorldId;
    name: string;
    role: string;
    summary: string;
    /** Placeholder planet art (GPT's sector planets) until the world banners are delivered. */
    planet: 'hive' | 'forge' | 'shrine';
}

export interface Unlocks { equipment: string[]; personnel: string[] }

export interface Stronghold {
    id: string;
    world: WorldId;
    index: 1 | 2 | 3 | 4;
    name: string;
    briefing: string;
    /** Strongholds that must all be captured before this one can be attacked. */
    requires: string[];
    /** Opened the first time it is captured; never taken back. */
    unlocks: Unlocks;
    /** The battle fought here, or null while it is not built yet. */
    scenarioId: string | null;
    boss?: boolean;
}

export const WORLDS: World[] = [
    { id: 1, name: '維斯帕里斯', role: '外環補給世界', planet: 'hive',
        summary: '星區的補給門戶。叛軍佔住登陸場與港口，切斷了通往內環的軌道航線。' },
    { id: 2, name: '赫克斯鑄造環', role: '工業世界', planet: 'forge',
        summary: '鑄造廠替叛軍日夜生產武器與步行機。奪回兵工廠，就奪回了這場戰爭的軍火。' },
    { id: 3, name: '卡斯托盧姆', role: '聖堂與中樞', planet: 'shrine',
        summary: '混沌教派在聖殤大教堂築起儀式節點。星區的叛亂由這裡指揮。' },
];

const none: Unlocks = { equipment: [], personnel: [] };

export const STRONGHOLDS: Stronghold[] = [
    { id: 'w1-n1', world: 1, index: 1, name: '登陸場', requires: [], unlocks: none, scenarioId: 'w1-n1',
        briefing: '在彈坑遍布的平原建立灘頭。守軍無甲、裝備簡陋，是特遣隊的第一戰。' },
    { id: 'w1-n2', world: 1, index: 2, name: '補給港', requires: ['w1-n1'], unlocks: { equipment: ['carapace-armour'], personnel: [] }, scenarioId: 'w1-n2',
        briefing: '奪回港口倉庫。貨櫃把碼頭切成走道，守軍披上防破片甲，後方有精準射手。' },
    { id: 'w1-n3', world: 1, index: 3, name: '通訊塔', requires: ['w1-n1'], unlocks: none, scenarioId: 'w1-n3',
        briefing: '兩名精準射手佔住桅杆旁的高地。拿下通訊塔，叛軍就聽不到彼此。' },
    { id: 'w1-n4', world: 1, index: 4, name: '軌道升降站', requires: ['w1-n2', 'w1-n3'], unlocks: { equipment: ['plasma-gun'], personnel: [] }, scenarioId: 'w1-n4', boss: true,
        briefing: '貨運龍門架築成一道牆，只留五個缺口，後方架著一組重武器。收復它，就打通了前往內環的航線。' },

    { id: 'w2-n1', world: 2, index: 1, name: '冶煉區', requires: ['w1-n4'], unlocks: none, scenarioId: 'w2-n1',
        briefing: '熔爐間的狹窄通道。偵察回報叛軍的哨兵步行機在此巡邏。' },
    { id: 'w2-n2', world: 2, index: 2, name: '兵工廠', requires: ['w2-n1'], unlocks: { equipment: ['heavy-weapon'], personnel: [] }, scenarioId: 'w2-n2',
        briefing: '叛軍的軍火來源。拿下它，星界軍重武器組就能配發到前線。' },
    { id: 'w2-n3', world: 2, index: 3, name: '發電核心', requires: ['w2-n1'], unlocks: none, scenarioId: 'w2-n3',
        briefing: '整座鑄造環的電力來源，由叛軍精銳看守。' },
    { id: 'w2-n4', world: 2, index: 4, name: '裝甲庫', requires: ['w2-n2', 'w2-n3'], unlocks: { equipment: [], personnel: ['kasrkin'] }, scenarioId: 'w2-n4', boss: true,
        briefing: '步行機與裝甲車的停放庫。收復它，卡斯爾金願意派員支援。' },

    { id: 'w3-n1', world: 3, index: 1, name: '外城', requires: ['w2-n4'], unlocks: none, scenarioId: 'w3-n1',
        briefing: '教徒佔據的街區，人數眾多、近身狂熱。' },
    { id: 'w3-n2', world: 3, index: 2, name: '聖殤大教堂', requires: ['w3-n1'], unlocks: { equipment: [], personnel: ['catachan-fighter', 'krieg-infantry'] }, scenarioId: 'w3-n2',
        briefing: '被褻瀆的大教堂。奪回它，其他軍團願意調派部隊協助。' },
    { id: 'w3-n3', world: 3, index: 3, name: '儀式節點', requires: ['w3-n1'], unlocks: none, scenarioId: 'w3-n3',
        briefing: '教派的儀式陣地，叛軍奇美拉裝甲車在旁掩護。' },
    { id: 'w3-n4', world: 3, index: 4, name: '邪教指揮中樞', requires: ['w3-n2', 'w3-n3'], unlocks: { equipment: [], personnel: ['scion', 'preacher'] }, scenarioId: null, boss: true,
        briefing: '叛亂的心臟。擊敗教派首領，灰燼星區就收復了。' },
];

const BY_ID = new Map(STRONGHOLDS.map(s => [s.id, s]));
export const strongholdById = (id: string): Stronghold | undefined => BY_ID.get(id);
export const worldById = (id: number): World | undefined => WORLDS.find(w => w.id === id);

/**
 * locked: an earlier stronghold is still held by the enemy.
 * open: can be attacked.
 * captured: won at least once; can be fought again for XP.
 * pending: its requirements are met but its battle is not built yet.
 */
export type StrongholdState = 'locked' | 'open' | 'captured' | 'pending';

export function strongholdState(stronghold: Stronghold, captured: ReadonlySet<string>): StrongholdState {
    if (captured.has(stronghold.id)) return 'captured';
    if (!stronghold.requires.every(id => captured.has(id))) return 'locked';
    return stronghold.scenarioId ? 'open' : 'pending';
}

export type AttackCheck = { ok: true; stronghold: Stronghold; scenarioId: string; firstCapture: boolean } | { ok: false; reason: string };

/** Whether this stronghold may be attacked now, and whether a win would be its first capture. */
export function checkAttack(id: string, captured: ReadonlySet<string>): AttackCheck {
    const stronghold = strongholdById(id);
    if (!stronghold) return { ok: false, reason: '找不到這個據點。' };
    const state = strongholdState(stronghold, captured);
    if (state === 'locked') return { ok: false, reason: `要先收復 ${stronghold.requires.map(r => strongholdById(r)?.name ?? r).join('、')}。` };
    if (state === 'pending' || !stronghold.scenarioId) return { ok: false, reason: '這個據點的作戰還在準備中。' };
    return { ok: true, stronghold, scenarioId: stronghold.scenarioId, firstCapture: state === 'open' };
}

/** Extra XP each deployed soldier earns for the first capture of a stronghold (candidate; docs/balance-decisions.md). */
export const FIRST_CAPTURE_XP = 40;

/** Everything the captured strongholds have opened, for showing what the campaign has granted. */
export function unlockedBy(captured: Iterable<string>): Unlocks {
    const equipment = new Set<string>();
    const personnel = new Set<string>();
    for (const id of captured) {
        const stronghold = strongholdById(id);
        stronghold?.unlocks.equipment.forEach(e => equipment.add(e));
        stronghold?.unlocks.personnel.forEach(p => personnel.add(p));
    }
    return { equipment: [...equipment], personnel: [...personnel] };
}

/** The whole sector is recovered once the last stronghold falls. */
export const sectorRecovered = (captured: ReadonlySet<string>) => captured.has('w3-n4');

/** One stronghold's record, derived from the account's operations against it. */
export interface StrongholdRecord {
    id: string;
    state: StrongholdState;
    attempts: number;
    defeats: number;
    capturedAt: string | null;
    /** Who was in the squad the first time it fell. */
    capturedBy: string[];
}

/** A soldier's line in the campaign's service record. */
export interface ServiceEntry { strongholdId: string; outcome: 'victory' | 'defeat' | 'timeout'; at: string; firstCapture: boolean }

export interface OperationSummary { strongholdId: string; outcome: 'victory' | 'defeat' | 'timeout'; at: string; crewIds: string[] }

/**
 * The campaign as seen from a list of operations, oldest first. Operations
 * without a stronghold (the phase-one scenarios) are ignored.
 */
export function campaignFrom(operations: OperationSummary[]) {
    const ordered = [...operations].sort((a, b) => a.at.localeCompare(b.at));
    const captured = new Set<string>();
    const firstCapture = new Map<string, OperationSummary>();
    const attempts = new Map<string, { attempts: number; defeats: number }>();
    const service: Record<string, ServiceEntry[]> = {};

    for (const op of ordered) {
        if (!strongholdById(op.strongholdId)) continue;
        const tally = attempts.get(op.strongholdId) ?? { attempts: 0, defeats: 0 };
        tally.attempts += 1;
        if (op.outcome !== 'victory') tally.defeats += 1;
        attempts.set(op.strongholdId, tally);

        const first = op.outcome === 'victory' && !captured.has(op.strongholdId);
        if (first) {
            captured.add(op.strongholdId);
            firstCapture.set(op.strongholdId, op);
        }
        for (const id of op.crewIds) {
            (service[id] ??= []).push({ strongholdId: op.strongholdId, outcome: op.outcome, at: op.at, firstCapture: first });
        }
    }

    const strongholds: StrongholdRecord[] = STRONGHOLDS.map(s => ({
        id: s.id,
        state: strongholdState(s, captured),
        attempts: attempts.get(s.id)?.attempts ?? 0,
        defeats: attempts.get(s.id)?.defeats ?? 0,
        capturedAt: firstCapture.get(s.id)?.at ?? null,
        capturedBy: firstCapture.get(s.id)?.crewIds ?? [],
    }));
    return { captured, strongholds, service, recovered: sectorRecovered(captured) };
}
