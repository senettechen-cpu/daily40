import { Board, Hex } from '../hex';
import { ARMOUR_STATS, DUTY_STATS, FISTS, WEAPON_STATS } from './rules';
import { ArmourType, Stance, UnitSpec } from './types';
import ROSTERS from './enemy-rosters.json';
import CAMPAIGN_ROSTERS from './campaign-rosters.json';

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

const BOARDS: Record<string, Board> = {
    standard: RUINS, 'close-assault': OPEN_FIELD, outnumbered: RUINS,
    landing: LANDING, dockyard: DOCKYARD, 'vox-tower': VOX_TOWER, 'orbital-lift': ORBITAL_LIFT,
};

const NAMES: Record<string, string> = {
    sergeant: '叛軍班長', rifleman: '叛軍槍手', marksman: '叛軍射手',
    medic: '叛軍醫護', engineer: '叛軍工兵', heavy: '叛軍重裝兵',
};

interface RosterEntry {
    id: string;
    duty: string;
    maxHp: number;
    accuracy: number;
    stance: string;
    at: { col: number; row: number };
    loadout: { primary?: string | null; sidearm?: string | null; armour?: string | null; tools?: string[] };
    note?: string;
}

/**
 * One rebel, read through the same tables the squad uses. Missing gear is an
 * empty slot, never a substitute: a fighter the data did not arm goes in with
 * fists, which is visible, rather than with a lasgun nobody wrote down.
 */
function traitorFrom(entry: RosterEntry, index: number): UnitSpec {
    const duty = DUTY_STATS[entry.duty] ?? DUTY_STATS.rifleman;
    const plate = entry.loadout.armour ? ARMOUR_STATS[entry.loadout.armour] : undefined;
    if (entry.loadout.armour && !plate) throw new Error(`unknown armour ${entry.loadout.armour} for ${entry.id}`);

    const weaponOf = (id: string | null | undefined) => {
        if (!id) return undefined;
        const profile = WEAPON_STATS[id];
        if (!profile) throw new Error(`unknown weapon ${id} for ${entry.id}`);
        return profile;
    };

    const primary = weaponOf(entry.loadout.primary);
    const sidearm = weaponOf(entry.loadout.sidearm);

    return {
        id: entry.id,
        name: `${NAMES[entry.duty] ?? '叛軍'}${index + 1}`,
        side: 'enemy',
        duty: entry.duty,
        // One shared traitor face until per-duty rebel art exists; the duty is
        // carried by the label, never implied by borrowing a Cadian portrait.
        assetId: 'traitor-guardsman',
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
    };
}

export interface Scenario {
    id: string;
    name: string;
    description: string;
    board: Board;
    enemies: UnitSpec[];
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
};

type RosterFile = { scenarios: { id: string; board?: string; enemies: RosterEntry[] }[] };

const scenariosFrom = (file: RosterFile): Scenario[] => file.scenarios.map(entry => ({
    id: entry.id,
    name: DESCRIPTIONS[entry.id]?.name ?? entry.id,
    description: DESCRIPTIONS[entry.id]?.description ?? '',
    // The phase-one file names its board in prose; campaign entries name a key.
    board: BOARDS[entry.id] ?? (entry.board ? BOARDS[entry.board] : undefined) ?? RUINS,
    enemies: entry.enemies.map(traitorFrom),
}));

/** The three phase-one scenarios, kept as the balance baseline after the campaign replaced them in play. */
export const BASELINE_SCENARIOS: Scenario[] = scenariosFrom(ROSTERS as RosterFile);

/** One scenario per sector-campaign stronghold, keyed by the stronghold id. */
export const CAMPAIGN_SCENARIOS: Scenario[] = scenariosFrom(CAMPAIGN_ROSTERS as RosterFile);

export const SCENARIOS: Scenario[] = [...BASELINE_SCENARIOS, ...CAMPAIGN_SCENARIOS];

export const scenarioById = (id: string) => SCENARIOS.find(scenario => scenario.id === id);
