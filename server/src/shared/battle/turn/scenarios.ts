import { Board, Hex } from '../hex';
import { ARMOUR_STATS, DUTY_STATS, ENEMY_ARMOUR_STATS, ENEMY_WEAPON_STATS, FISTS, WEAPON_STATS } from './rules';
import { ArmourType, Objective, Stance, UnitSpec } from './types';
import ROSTERS from './enemy-rosters.json';
import CAMPAIGN_ROSTERS from './campaign-rosters.json';
import ASCENSION_ROSTERS from './ascension-rosters.json';

// v2 scenarios. The user decided (design §12) that the enemy is built the same
// way the squad is — duty, gear and stance — so the counters run both ways:
// bringing plasma against unarmoured rebels wastes it, and their flamer against
// carapace wastes theirs.
//
// The rosters are GPT's (handoff-assets/battle-v2-balance-20260924-gpt-v1) and
// are read through the same tables the squad uses. A weapon id that is not in
// the catalogue is an error, never a silent fall back to a lasgun.

export const BOARD_COLS = 11;
export const BOARD_ROWS = 9;

const board = (tiles: Record<string, string>): Board =>
    ({ cols: BOARD_COLS, rows: BOARD_ROWS, tiles: tiles as Board['tiles'] });

/** Terrain shared by the phase-one scenarios: a ruined street with two flanks. */
const RUINS = board({
    '2,4': 'block', '3,4': 'cover', '5,4': 'high', '7,4': 'cover', '8,4': 'block',
    '1,3': 'cover', '9,3': 'cover',
    '4,2': 'cover', '6,2': 'cover',
    '4,6': 'cover', '6,6': 'cover',
    '5,2': 'hazard', '5,6': 'hazard',
});

const OPEN_FIELD = board({
    '3,4': 'cover', '7,4': 'cover', '5,3': 'high',
    '2,2': 'block', '8,2': 'block',
    '4,6': 'cover', '6,6': 'cover',
});

// Sector campaign, world 1 (docs/campaign-and-operation-plans.md §2). Each
// stronghold has its own ground; the enemy starts in rows 0-1, the squad in 7-8.

/** Landing zone: craters and little else, the gentlest ground in the campaign. */
const LANDING = board({
    '2,3': 'cover', '8,3': 'cover', '3,4': 'cover', '7,4': 'cover', '5,5': 'cover',
    '5,2': 'high',
});

/** Supply port: stacked containers split the field, crates give cover between them. */
const DOCKYARD = board({
    '2,3': 'block', '3,3': 'block', '7,5': 'block', '8,5': 'block',
    '5,3': 'cover', '5,5': 'cover', '1,5': 'cover', '9,3': 'cover', '4,6': 'cover', '6,2': 'cover',
});

/** Vox tower: the enemy's marksmen sit on the high ground by the mast; burning cable trenches on the flanks. */
const VOX_TOWER = board({
    '5,2': 'high', '4,2': 'cover', '6,2': 'cover', '5,4': 'block',
    '3,5': 'cover', '7,5': 'cover', '2,4': 'hazard', '8,4': 'hazard',
});

/** Orbital lift: a wall of cargo gantries with five gaps; whoever holds the gaps holds the field. */
const ORBITAL_LIFT = board({
    '1,4': 'block', '2,4': 'block', '4,4': 'block', '6,4': 'block', '8,4': 'block', '9,4': 'block',
    '3,3': 'cover', '7,3': 'cover', '5,5': 'cover', '3,5': 'cover', '7,5': 'cover',
});

// World 2, the forge ring (C2): walkers patrol here, and objectives other than a clear field begin.

/** Smelter: two furnaces and channels of molten slag that burn whoever stands in them. */
const SMELTER = board({
    '3,3': 'block', '7,3': 'block',
    '5,2': 'hazard', '5,5': 'hazard', '2,5': 'hazard', '8,5': 'hazard',
    '4,4': 'cover', '6,4': 'cover', '1,3': 'cover', '9,3': 'cover', '3,6': 'cover', '7,6': 'cover',
});

/** Armoury: the hall door at 5,3 is the objective; walls to either side funnel the approach. */
const ARMOURY = board({
    '3,2': 'block', '7,2': 'block', '2,2': 'block', '8,2': 'block',
    '4,3': 'cover', '6,3': 'cover', '2,4': 'cover', '8,4': 'cover', '5,5': 'cover', '3,6': 'cover', '7,6': 'cover',
});

/** Power core: generator housings split the field; the live core burns. */
const POWER_CORE = board({
    '4,3': 'block', '6,3': 'block', '5,3': 'hazard', '5,2': 'block',
    '2,2': 'cover', '8,2': 'cover', '3,5': 'cover', '7,5': 'cover', '5,5': 'cover',
});

/** Vehicle bay: an open floor built for walkers, little to hide behind. */
const VEHICLE_BAY = board({
    '3,3': 'cover', '7,3': 'cover', '5,4': 'cover', '2,6': 'cover', '8,6': 'cover',
    '5,2': 'high',
});

// World 3, Castorum (C2): the cult's own ground.

/** Outer city: rubble everywhere, and the squad only has to still be standing. */
const OUTER_CITY = board({
    '2,3': 'cover', '4,3': 'cover', '6,3': 'cover', '8,3': 'cover',
    '3,5': 'cover', '5,5': 'cover', '7,5': 'cover', '5,6': 'cover',
    '1,4': 'block', '9,4': 'block',
});

/** Cathedral: pillars down the nave; the captive priest is held at the altar, 5,1. */
const CATHEDRAL = board({
    '2,3': 'block', '4,3': 'block', '6,3': 'block', '8,3': 'block',
    '3,5': 'cover', '7,5': 'cover', '5,4': 'cover', '5,1': 'high',
});

/** Ritual node: the node at 5,3 has to be held; the warp bleeds out beside it. */
const RITUAL_NODE = board({
    '4,3': 'hazard', '6,3': 'hazard',
    '3,2': 'cover', '7,2': 'cover', '3,5': 'cover', '7,5': 'cover', '5,5': 'cover',
    '1,2': 'block', '9,2': 'block',
});

/** Command hub: the leader's sanctum between two walls, a broadcast relay on each flank. */
const COMMAND_HUB = board({
    '4,1': 'block', '6,1': 'block', '5,0': 'cover',
    '3,3': 'cover', '7,3': 'cover', '5,3': 'cover', '2,5': 'cover', '8,5': 'cover', '5,6': 'cover',
    '5,2': 'hazard',
});

// Ascension missions (2026-09-27): three escort-and-assessment extractions and
// one training operation per stage.

/** Extraction field: a clear run to the Ultramarines' landing marker at 5,1, broken by wreckage. */
const EVAC_FIELD = board({
    '2,3': 'cover', '4,3': 'cover', '6,3': 'cover', '8,3': 'cover',
    '3,5': 'cover', '7,5': 'cover', '1,4': 'block', '9,4': 'block', '5,4': 'block',
});

/** Forge extraction: a fenced loading apron the squad must hold until the gunship lands. */
const FORGE_EVAC = board({
    '3,5': 'cover', '5,5': 'cover', '7,5': 'cover', '2,6': 'cover', '8,6': 'cover',
    '1,3': 'block', '9,3': 'block', '4,3': 'hazard', '6,3': 'hazard', '5,2': 'cover',
});

/** Shrine extraction: a broken plaza, the landing pad at 5,3 between two collapsed spires. */
const SHRINE_EVAC = board({
    '3,3': 'block', '7,3': 'block', '4,4': 'cover', '6,4': 'cover',
    '2,5': 'cover', '8,5': 'cover', '5,5': 'cover', '1,2': 'cover', '9,2': 'cover',
});

/** Training yard: sandbag lines and a watchtower, the ground an assessor picks. */
const TRAINING_YARD = board({
    '2,3': 'cover', '5,3': 'cover', '8,3': 'cover', '3,5': 'cover', '7,5': 'cover', '5,5': 'high',
});

/** Firing range: the spotter's tower at 5,0 behind a line of target walls. */
const FIRING_RANGE = board({
    '5,0': 'high', '3,2': 'block', '7,2': 'block', '2,4': 'cover', '5,4': 'cover', '8,4': 'cover',
    '4,6': 'cover', '6,6': 'cover',
});

/** Hazard course: burning ground between the squad and the casualty at 5,1. */
const HAZARD_COURSE = board({
    '3,3': 'hazard', '5,3': 'hazard', '7,3': 'hazard', '4,4': 'hazard', '6,4': 'hazard',
    '2,5': 'cover', '8,5': 'cover', '5,5': 'cover', '1,3': 'cover', '9,3': 'cover', '5,2': 'cover',
});

const BOARDS: Record<string, Board> = {
    standard: RUINS, 'close-assault': OPEN_FIELD, outnumbered: RUINS,
    landing: LANDING, dockyard: DOCKYARD, 'vox-tower': VOX_TOWER, 'orbital-lift': ORBITAL_LIFT,
    smelter: SMELTER, armoury: ARMOURY, 'power-core': POWER_CORE, 'vehicle-bay': VEHICLE_BAY,
    'outer-city': OUTER_CITY, cathedral: CATHEDRAL, 'ritual-node': RITUAL_NODE, 'command-hub': COMMAND_HUB,
    'evac-field': EVAC_FIELD, 'forge-evac': FORGE_EVAC, 'shrine-evac': SHRINE_EVAC,
    'training-yard': TRAINING_YARD, 'firing-range': FIRING_RANGE, 'hazard-course': HAZARD_COURSE,
};

const NAMES: Record<string, string> = {
    sergeant: '叛軍班長', rifleman: '叛軍槍手', marksman: '叛軍射手',
    medic: '叛軍醫護', engineer: '叛軍工兵', heavy: '叛軍重裝兵',
    cultist: '混沌教徒', walker: '叛軍哨兵步行機', tank: '叛軍奇美拉', relay: '廣播節點',
};

/**
 * The portrait each enemy duty asks for. Only 'traitor-guardsman' exists yet;
 * the rest are requested in docs/art-request-sector-campaign.md, and until a
 * file lands the report falls back to the lettered token on its own.
 */
const ENEMY_ART: Record<string, string> = {
    sergeant: 'traitor-guardsman', rifleman: 'traitor-guardsman', marksman: 'traitor-guardsman',
    medic: 'traitor-guardsman', engineer: 'traitor-guardsman', heavy: 'traitor-guardsman',
    cultist: 'chaos-cultist', walker: 'traitor-sentinel', tank: 'traitor-chimera', relay: 'cult-relay',
};

interface RosterEntry {
    id: string;
    duty: string;
    maxHp: number;
    accuracy: number;
    stance: string;
    at: { col: number; row: number };
    loadout: { primary?: string | null; sidearm?: string | null; armour?: string | null; tools?: string[] };
    /** Overrides the numbered duty name, for a leader or a vehicle worth naming. */
    name?: string;
    /** Overrides the duty's portrait, for a named leader. */
    assetId?: string;
    note?: string;
}

/**
 * One rebel, read through the same tables the squad uses. Missing gear is an
 * empty slot, never a substitute: a fighter the data did not arm goes in with
 * fists, which is visible, rather than with a lasgun nobody wrote down.
 */
function traitorFrom(entry: RosterEntry, index: number): UnitSpec {
    const duty = DUTY_STATS[entry.duty] ?? DUTY_STATS.rifleman;
    const armourId = entry.loadout.armour;
    const plate = armourId ? ARMOUR_STATS[armourId] ?? ENEMY_ARMOUR_STATS[armourId] : undefined;
    if (entry.loadout.armour && !plate) throw new Error(`unknown armour ${entry.loadout.armour} for ${entry.id}`);

    const weaponOf = (id: string | null | undefined) => {
        if (!id) return undefined;
        const profile = WEAPON_STATS[id] ?? ENEMY_WEAPON_STATS[id];
        if (!profile) throw new Error(`unknown weapon ${id} for ${entry.id}`);
        return profile;
    };

    const primary = weaponOf(entry.loadout.primary);
    const sidearm = weaponOf(entry.loadout.sidearm);
    // Tools work for the enemy exactly as for the squad (2026-09-27): a rebel
    // medic with a medicae kit patches up, an engineer with a kit fortifies.
    // Before, the field was read and dropped, so no enemy ever used one.
    const tools = (entry.loadout.tools ?? []).filter(Boolean);

    return {
        id: entry.id,
        name: entry.name ?? `${NAMES[entry.duty] ?? '叛軍'}${index + 1}`,
        side: 'enemy',
        duty: entry.duty,
        // One shared traitor face until per-duty rebel art exists; the duty is
        // carried by the label, never implied by borrowing a Cadian portrait.
        assetId: entry.assetId ?? ENEMY_ART[entry.duty],
        maxHp: entry.maxHp,
        armour: plate?.armour ?? 0,
        armourType: (plate?.type ?? 'none') as ArmourType,
        accuracy: entry.accuracy,
        movement: duty.movement,
        initiative: duty.initiative + (plate?.initiative ?? 0),
        weapon: primary ?? sidearm ?? FISTS,
        sidearm: primary ? sidearm : undefined,
        stance: entry.stance as Stance,
        at: entry.at as Hex,
        ...(tools.length > 0 ? { tools } : {}),
    };
}

export interface Scenario {
    id: string;
    name: string;
    description: string;
    board: Board;
    enemies: UnitSpec[];
    /** Absent means clear the field. */
    objective?: Objective;
}

const DESCRIPTIONS: Record<string, { name: string; description: string }> = {
    standard: {
        name: '標準交火',
        description: '叛軍班長帶兩名步槍兵推進，無甲霰彈手走側翼，後排一名精準射手。檢查：掩體、射程取捨、姿態差異。',
    },
    'close-assault': {
        name: '近身突擊',
        description: '兩名霰彈手與一名焚化兵貼身壓上。檢查：主副武器接敵切換、短射程武器的價值、護衛姿態。',
    },
    outnumbered: {
        name: '以寡擊眾',
        description: '八名叛軍，兩名披甲殼甲，含一組重武器與助手。檢查：反甲武器是否必要、醫療存活、超時代價。',
    },
    'w1-n1': { name: '登陸場', description: '五名叛軍守著彈坑散布的登陸場，無甲、裝備簡陋。' },
    'w1-n2': { name: '補給港', description: '貨櫃把碼頭切成幾條走道，叛軍披上防破片甲，後方有一名精準射手。' },
    'w1-n3': { name: '通訊塔', description: '兩名精準射手佔住桅杆旁的高地，兩側是燃燒的電纜溝。' },
    'w1-n4': { name: '軌道升降站', description: '貨運龍門架築成一道牆，只留五個缺口。叛軍在後方架起一組重武器。' },
    'w2-n1': { name: '冶煉區', description: '熔爐與熔渣溝之間，一台叛軍哨兵步行機在巡邏。' },
    'w2-n2': { name: '兵工廠', description: '目標：佔住兵工廠大門（中央）撐過兩個回合結束。守軍有電漿槍與重武器組。' },
    'w2-n3': { name: '發電核心', description: '目標：擊倒叛軍技術軍官。他躲在發電機組後方，身邊有披甲殼甲的衛兵。' },
    'w2-n4': { name: '裝甲庫', description: '空曠的停機坪上有兩台哨兵步行機，還有叛軍精銳。' },
    'w3-n1': { name: '外城', description: '目標：撐過八個回合。成群的混沌教徒揮著利刃衝上來。' },
    'w3-n2': { name: '聖殤大教堂', description: '目標：讓任一名隊員抵達祭壇（5,1），救出被俘的牧師。祭壇前有叛軍班長與一台奇美拉把守。' },
    'w3-n4': { name: '邪教指揮中樞', description: '目標：擊倒教派首領。兩座廣播節點讓敵軍命中提高，也讓首領每兩回合呼叫一次轟擊；炸掉兩座節點就能讓轟擊停止。' },
    'w3-n3': { name: '儀式節點', description: '目標：佔住儀式節點（5,3）撐過四個回合結束。一台叛軍奇美拉在旁掩護。' },
    'asc-escort-1': { name: '援護撤離：維斯帕里斯', description: '目標：任一名隊員抵達候選人所在的降落標記（5,0）。叛軍班長守在標記上。' },
    'asc-escort-2': { name: '援護撤離：赫克斯鑄造環', description: '目標：撐過六個回合，等雷鷹砲艇降落。一台哨兵步行機與電漿槍班長壓上來。' },
    'asc-escort-3': { name: '援護撤離：卡斯托盧姆', description: '目標：佔住降落平台（5,3）撐過三個回合結束。奇美拉與教徒群守著廣場。' },
    'asc-stage-1': { name: '適應評估', description: '候選人第一次在評估官面前作戰：清除訓練場上裝備簡陋的叛軍。' },
    'asc-stage-2': { name: '生理穩定評估', description: '目標：撐過六個回合。成群的教徒衝上來，看新器官能不能撐住。' },
    'asc-stage-3': { name: '感官與射界訓練', description: '目標：擊倒塔上的叛軍觀測官。兩側各有一名射手，觀測官身邊有衛兵。' },
    'asc-stage-4': { name: '環境適應與救援演練', description: '目標：任一名隊員穿過燃燒地帶，抵達傷員位置（5,0）。叛軍班長與步行機守在後方。' },
    'asc-stage-5': { name: '裝甲介面訓練與授銜審核', description: '目標：佔住廣場（5,3）撐過三個回合結束。對手有奇美拉與步行機，這是授銜前最後一戰。' },
};

type RosterFile = { scenarios: { id: string; board?: string; objective?: Objective; enemies: RosterEntry[] }[] };

const scenariosFrom = (file: RosterFile): Scenario[] => file.scenarios.map(entry => ({
    id: entry.id,
    name: DESCRIPTIONS[entry.id]?.name ?? entry.id,
    description: DESCRIPTIONS[entry.id]?.description ?? '',
    // The phase-one file names its board in prose; campaign entries name a key.
    board: BOARDS[entry.id] ?? (entry.board ? BOARDS[entry.board] : undefined) ?? RUINS,
    enemies: entry.enemies.map(traitorFrom),
    objective: entry.objective,
}));

/** The three phase-one scenarios, kept as the balance baseline after the campaign replaced them in play. */
export const BASELINE_SCENARIOS: Scenario[] = scenariosFrom(ROSTERS as RosterFile);

/** One scenario per sector-campaign stronghold, keyed by the stronghold id. */
export const CAMPAIGN_SCENARIOS: Scenario[] = scenariosFrom(CAMPAIGN_ROSTERS as RosterFile);

/** Ascension missions: escorts and stage trainings, keyed 'asc-…'. */
export const ASCENSION_SCENARIOS: Scenario[] = scenariosFrom(ASCENSION_ROSTERS as RosterFile);

export const SCENARIOS: Scenario[] = [...BASELINE_SCENARIOS, ...CAMPAIGN_SCENARIOS, ...ASCENSION_SCENARIOS];

export const scenarioById = (id: string) => SCENARIOS.find(scenario => scenario.id === id);

/** What an operation asks for, in the words the briefing and the report use. */
export function objectiveText(scenario: Pick<Scenario, 'objective' | 'enemies'>): string {
    const goal = scenario.objective;
    if (!goal || goal.kind === 'eliminate') return '殲滅所有敵軍';
    const where = (hex: Hex) => `${hex.col},${hex.row}`;
    switch (goal.kind) {
        case 'seize': return `佔住 ${where(goal.at)}，連續撐過 ${goal.rounds} 個回合結束（或殲滅敵軍）`;
        case 'hold': return `撐過 ${goal.rounds} 個回合，任一人存活即達成（或殲滅敵軍）`;
        case 'rescue': return `任一名隊員抵達 ${where(goal.at)}（或殲滅敵軍）`;
        case 'assassinate': {
            const target = scenario.enemies.find(e => e.id === goal.targetId);
            return `擊倒 ${target?.name ?? '指定目標'}（或殲滅敵軍）`;
        }
        default: return '殲滅所有敵軍';
    }
}
