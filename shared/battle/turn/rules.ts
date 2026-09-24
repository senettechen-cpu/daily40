import { Board, Hex, distance, hasLineOfSight, ruleAt } from '../hex';
import { Unit, Weapon } from './types';

// Placeholder combat numbers. GPT owns the real ones (design §11); nothing here
// is calibrated, so it must stay in one file that can be replaced wholesale.

export const MAX_ROUNDS = 10;
export const HIT_FLOOR = 0.15;
export const HIT_CEILING = 0.95;
/** Hit chance lost per tile beyond half the weapon's range. */
export const FALLOFF = 0.05;

/** A medic left standing undoes the whole attack, so the AI shoots one first. */
export const THREAT: Record<string, number> = {
    medic: 1.5, heavy: 1.4, sergeant: 1.3, marksman: 1.2,
};
export const threatOf = (unit: Unit) => THREAT[unit.duty] ?? 1;

export const effectiveRange = (board: Board, unit: Unit, from: Hex) =>
    unit.weapon.range + (ruleAt(board, from).range ?? 0);

export function canReach(board: Board, unit: Unit, from: Hex, target: Unit): boolean {
    if (target.down) return false;
    return distance(from, target.at) <= effectiveRange(board, unit, from)
        && hasLineOfSight(board, from, target.at);
}

/**
 * Chance of one hit landing. Cover and high ground are read off the board, so
 * where a unit stands matters as much as what it carries.
 */
export function hitChance(board: Board, unit: Unit, from: Hex, target: Unit): number {
    const span = distance(from, target.at);
    const reach = effectiveRange(board, unit, from);
    const far = Math.max(0, span - reach / 2);
    const shelter = ruleAt(board, target.at).incoming ?? 1;

    const chance = unit.accuracy
        + (ruleAt(board, from).accuracy ?? 0) / 100
        - far * FALLOFF
        - (1 - shelter); // 0.75 cover reads as a quarter off the chance
    return Math.min(HIT_CEILING, Math.max(HIT_FLOOR, chance));
}

/** One landed hit, after armour. P2 multiplies this by damage type against armour type. */
export const damageOf = (weapon: Weapon, armour: number) =>
    Math.max(1, Math.round(weapon.damage * 100 / (100 + Math.max(0, armour - weapon.penetration))));

/** What an attack is worth on average, used by the AI to choose its shot. */
export const expectedDamage = (board: Board, unit: Unit, from: Hex, target: Unit) =>
    unit.weapon.hits * hitChance(board, unit, from, target) * damageOf(unit.weapon, target.armour);

// ---------------------------------------------------------------------------
// Placeholder stat tables. GPT owns every number below (design §11 and
// docs/gpt-brief-battle-v2-numbers.md); they are gathered here so the numbers
// pass replaces one file and no rule has to change with them.
//
// P2 adds damageType to each weapon and armourType to each plate, plus the
// coefficient table between them. Until then a hit is armour against damage.
// ---------------------------------------------------------------------------

/** Nobody is unarmed: an empty weapon slot still has fists. */
export const FISTS: Weapon = { name: '徒手', damage: 6, hits: 1, range: 1, penetration: 0 };

/** By catalogue id. An id absent here is carried but does not fight. */
export const WEAPON_STATS: Record<string, Weapon> = {
    lasgun: { name: '制式雷射槍', damage: 16, hits: 2, range: 5, penetration: 0 },
    laspistol: { name: '制式雷射手槍', damage: 12, hits: 1, range: 2, penetration: 0 },
    shotgun: { name: '霰彈槍', damage: 11, hits: 3, range: 3, penetration: 0 },
    'precision-lasgun': { name: '精準雷射槍', damage: 26, hits: 1, range: 7, penetration: 5 },
    flamer: { name: '火焰器', damage: 9, hits: 4, range: 2, penetration: 0 },
    'plasma-gun': { name: '電漿槍', damage: 34, hits: 1, range: 5, penetration: 30 },
    'heavy-weapon': { name: '星界軍重武器組', damage: 18, hits: 3, range: 6, penetration: 10 },
    'sororitas-boltgun': { name: '修女用爆彈槍', damage: 22, hits: 2, range: 5, penetration: 10 },
    'astartes-boltgun': { name: '阿斯塔特用爆彈槍', damage: 28, hits: 2, range: 5, penetration: 15 },
};

export const ARMOUR_STATS: Record<string, { armour: number }> = {
    'flak-armour': { armour: 20 },
    'carapace-armour': { armour: 40 },
    'astartes-power-armour': { armour: 80 },
};

export interface DutyStats { initiative: number; movement: number }

/** Initiative orders a side; movement is tiles per activation. */
export const DUTY_STATS: Record<string, DutyStats> = {
    sergeant: { initiative: 14, movement: 3 },
    marksman: { initiative: 12, movement: 3 },
    rifleman: { initiative: 10, movement: 3 },
    medic: { initiative: 9, movement: 3 },
    comms: { initiative: 9, movement: 3 },
    engineer: { initiative: 8, movement: 3 },
    flamer: { initiative: 8, movement: 3 },
    plasma: { initiative: 8, movement: 3 },
    heavy: { initiative: 6, movement: 2 },
};
