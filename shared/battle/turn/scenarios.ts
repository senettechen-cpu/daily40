import { Board, Hex } from '../hex';
import { ARMOUR_STATS, DUTY_STATS, FISTS, WEAPON_STATS } from './rules';
import { ArmourType, Stance, UnitSpec } from './types';
import ROSTERS from './enemy-rosters.json';

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

const BOARDS: Record<string, Board> = { standard: RUINS, 'close-assault': OPEN_FIELD, outnumbered: RUINS };

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
};

export const SCENARIOS: Scenario[] = (ROSTERS as { scenarios: { id: string; enemies: RosterEntry[] }[] }).scenarios
    .map(entry => ({
        id: entry.id,
        name: DESCRIPTIONS[entry.id]?.name ?? entry.id,
        description: DESCRIPTIONS[entry.id]?.description ?? '',
        board: BOARDS[entry.id] ?? RUINS,
        enemies: entry.enemies.map(traitorFrom),
    }));

export const scenarioById = (id: string) => SCENARIOS.find(scenario => scenario.id === id);
