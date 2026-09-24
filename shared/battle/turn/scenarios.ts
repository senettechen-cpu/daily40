import { Board, Hex } from '../hex';
import { DUTY_STATS, WEAPON_STATS } from './rules';
import { Stance, UnitSpec } from './types';

// v2 scenarios. The user decided (design §12) that the enemy is built the same
// way the squad is — duty, gear and stance — so the counters run both ways:
// bringing plasma against unarmoured rebels wastes it, and their flamer against
// carapace wastes theirs.

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

interface EnemySpec {
    name: string;
    duty: string;
    weapon: string;
    armour: number;
    at: Hex;
    stance: Stance;
    maxHp?: number;
    accuracy?: number;
}

const traitor = (id: number, spec: EnemySpec): UnitSpec => {
    const duty = DUTY_STATS[spec.duty] ?? DUTY_STATS.rifleman;
    return {
        id: `enemy-${id}`,
        name: spec.name,
        side: 'enemy',
        duty: spec.duty,
        maxHp: spec.maxHp ?? 90,
        armour: spec.armour,
        accuracy: spec.accuracy ?? 0.65,
        movement: duty.movement,
        initiative: duty.initiative,
        weapon: WEAPON_STATS[spec.weapon] ?? WEAPON_STATS.lasgun,
        stance: spec.stance,
        at: spec.at,
    };
};

export interface Scenario {
    id: string;
    name: string;
    description: string;
    board: Board;
    enemies: UnitSpec[];
}

export const SCENARIOS: Scenario[] = [
    {
        id: 'standard',
        name: '標準交火',
        description: '六名持槍叛軍守住廢墟街道，各自找掩體。檢查：掩體有沒有用、射程取捨、姿態差異。',
        board: RUINS,
        enemies: [
            { name: '叛軍班長', duty: 'sergeant', weapon: 'lasgun', armour: 20, at: { col: 5, row: 1 }, stance: 'hold' },
            { name: '叛軍槍手', duty: 'rifleman', weapon: 'lasgun', armour: 20, at: { col: 3, row: 1 }, stance: 'hold' },
            { name: '叛軍槍手', duty: 'rifleman', weapon: 'lasgun', armour: 20, at: { col: 7, row: 1 }, stance: 'hold' },
            { name: '叛軍槍手', duty: 'rifleman', weapon: 'lasgun', armour: 0, at: { col: 4, row: 0 }, stance: 'advance' },
            { name: '叛軍槍手', duty: 'rifleman', weapon: 'lasgun', armour: 0, at: { col: 6, row: 0 }, stance: 'advance' },
            { name: '叛軍射手', duty: 'marksman', weapon: 'precision-lasgun', armour: 0, at: { col: 5, row: 0 }, stance: 'hold' },
        ].map((spec, i) => traitor(i + 1, spec as EnemySpec)),
    },
    {
        id: 'close-assault',
        name: '近身突擊',
        description: '兩名持霰彈槍的叛軍奉命貼身，其餘在後方壓制。檢查：近戰武器的射程劣勢、護衛姿態。',
        board: OPEN_FIELD,
        enemies: [
            { name: '叛軍突擊兵', duty: 'rifleman', weapon: 'shotgun', armour: 20, at: { col: 4, row: 2 }, stance: 'advance' },
            { name: '叛軍突擊兵', duty: 'rifleman', weapon: 'shotgun', armour: 20, at: { col: 6, row: 2 }, stance: 'advance' },
            { name: '叛軍焚化兵', duty: 'flamer', weapon: 'flamer', armour: 0, at: { col: 5, row: 1 }, stance: 'advance' },
            { name: '叛軍槍手', duty: 'rifleman', weapon: 'lasgun', armour: 20, at: { col: 3, row: 0 }, stance: 'hold' },
            { name: '叛軍槍手', duty: 'rifleman', weapon: 'lasgun', armour: 20, at: { col: 7, row: 0 }, stance: 'hold' },
        ].map((spec, i) => traitor(i + 1, spec as EnemySpec)),
    },
    {
        id: 'outnumbered',
        name: '以寡擊眾',
        description: '八名叛軍，其中兩名披甲殼甲。檢查：反甲武器是否必要、醫療的存活、超時的代價。',
        board: RUINS,
        enemies: [
            { name: '叛軍班長', duty: 'sergeant', weapon: 'lasgun', armour: 40, at: { col: 5, row: 1 }, stance: 'hold' },
            { name: '叛軍重裝兵', duty: 'heavy', weapon: 'heavy-weapon', armour: 40, at: { col: 5, row: 0 }, stance: 'hold' },
            { name: '叛軍槍手', duty: 'rifleman', weapon: 'lasgun', armour: 20, at: { col: 2, row: 1 }, stance: 'flank' },
            { name: '叛軍槍手', duty: 'rifleman', weapon: 'lasgun', armour: 20, at: { col: 8, row: 1 }, stance: 'flank' },
            { name: '叛軍槍手', duty: 'rifleman', weapon: 'lasgun', armour: 0, at: { col: 3, row: 0 }, stance: 'advance' },
            { name: '叛軍槍手', duty: 'rifleman', weapon: 'lasgun', armour: 0, at: { col: 7, row: 0 }, stance: 'advance' },
            { name: '叛軍槍手', duty: 'rifleman', weapon: 'lasgun', armour: 0, at: { col: 4, row: 0 }, stance: 'advance' },
            { name: '叛軍槍手', duty: 'rifleman', weapon: 'lasgun', armour: 0, at: { col: 6, row: 0 }, stance: 'advance' },
        ].map((spec, i) => traitor(i + 1, spec as EnemySpec)),
    },
];

export const scenarioById = (id: string) => SCENARIOS.find(scenario => scenario.id === id);
