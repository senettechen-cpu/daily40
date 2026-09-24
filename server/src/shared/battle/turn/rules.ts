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
