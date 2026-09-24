// Combat numbers for the phase-1 battle test. Every value comes from
// docs/expedition-rpg-design.md §09–10 (weapon table, hit formula, swap and
// engagement rules); presentation timing never feeds back into these.
export const TICKS_PER_SECOND = 20;
export const ticks = (seconds: number) => Math.round(seconds * TICKS_PER_SECOND);

export type WeaponId = 'lasgun' | 'laspistol';
export type Slot = 'primary' | 'secondary';

export interface WeaponSpec {
    name: string;
    damage: number;
    interval: number; // ticks between shots
    effectiveRange: number; // tiles
    maxRange: number;
    magazine: number;
    reload: number; // ticks
    penetration: number;
    aim: number; // first aim / new target / after moving
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
    lasgun: { name: '雷射步槍', damage: 16, interval: ticks(1), effectiveRange: 12, maxRange: 18, magazine: 12, reload: ticks(2), penetration: 0, aim: ticks(0.35) },
    // The spec gives no separate pistol aim time; it uses the general 0.35 s.
    laspistol: { name: '雷射手槍', damage: 7, interval: ticks(1), effectiveRange: 3, maxRange: 6, magazine: 8, reload: ticks(1.5), penetration: 0, aim: ticks(0.35) },
};

export const SWAP_TICKS: Record<Slot, number> = { secondary: ticks(0.45), primary: ticks(0.65) }; // keyed by destination
export const ENTER_COVER_TICKS = ticks(0.3); // spec candidate 240–360 ms
export const RETRACT_TICKS = ticks(0.3);
// A shot resolves when the muzzle pulse shows, a short wind-up into the fire
// action; dying during the wind-up cancels the shot.
export const FIRE_WINDUP_TICKS = 2;
export const FIRE_ACTION_TICKS = 5;

export const HUMAN = { hp: 100, armor: 20, accuracy: 0.75, speed: 1.2 }; // tiles per second
export const ENGAGE_RANGE = 1.2; // melee contact
export const DISENGAGE_RANGE = 2.0; // hysteresis before holstering the pistol
export const BATTLE_TIME_LIMIT = ticks(180);

export const PENALTY = { beyondEffective: 0.2, lowCover: 0.25, engagedPistol: 0.15 };

export function hitChance(accuracy: number, weapon: WeaponSpec, distance: number, targetCovered: boolean, engaged: boolean): number {
    const chance = accuracy
        - (distance > weapon.effectiveRange ? PENALTY.beyondEffective : 0)
        - (targetCovered ? PENALTY.lowCover : 0)
        - (engaged && weapon === WEAPONS.laspistol ? PENALTY.engagedPistol : 0);
    return Math.min(0.95, Math.max(0.15, chance));
}

/** Single hit: round(base × 100 / (100 + effective armour)); only rounded at the end. */
export const damageFor = (weapon: WeaponSpec, armor: number) =>
    Math.round(weapon.damage * 100 / (100 + Math.max(0, armor - weapon.penetration)));
