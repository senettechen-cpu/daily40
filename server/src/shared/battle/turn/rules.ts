import { Board, Hex, distance, hasLineOfSight, ruleAt } from '../hex';
import { ArmourType, DamageType, Unit, Weapon } from './types';

// Combat numbers from GPT's balance pass (handoff-assets/battle-v2-balance-
// 20260924-gpt-v1). They are a first implementation baseline, not a verified
// balance: the target is 5–8 rounds, under 10% timeouts, and 2–4 survivors on
// the winning side, which has not been measured yet.
//
// Everything a number lives in is here so the next pass replaces one file.

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

export const ARMOUR_TYPES: ArmourType[] = ['none', 'flak', 'carapace', 'power'];

/**
 * Damage type against armour type. Plasma is flat rather than rising, so more
 * armour never means more damage taken: anti-armour comes from a stable
 * coefficient plus penetration, never from a coefficient above one on heavy
 * plate.
 */
export const DAMAGE_COEFFICIENTS: Record<DamageType, Record<ArmourType, number>> = {
    las: { none: 1.00, flak: 1.00, carapace: 0.90, power: 0.80 },
    ballistic: { none: 1.10, flak: 1.00, carapace: 0.80, power: 0.65 },
    bolt: { none: 1.00, flak: 1.00, carapace: 0.95, power: 0.85 },
    plasma: { none: 1.00, flak: 1.00, carapace: 1.00, power: 1.00 },
    flame: { none: 1.20, flak: 1.00, carapace: 0.65, power: 0.45 },
    melee: { none: 1.00, flak: 0.95, carapace: 0.80, power: 0.60 },
};

export const coefficientFor = (damage: DamageType, armour: ArmourType) =>
    DAMAGE_COEFFICIENTS[damage]?.[armour] ?? 1;

/** Nobody is unarmed: an empty weapon slot still has fists. Not a catalogue item. */
export const FISTS: Weapon = { name: '徒手', damage: 6, hits: 1, range: 1, penetration: 0, damageType: 'melee', closeQuarter: true };

/** By catalogue id. An id absent here is carried but does not fight. */
export const WEAPON_STATS: Record<string, Weapon> = {
    lasgun: { name: '制式雷射槍', damage: 22, hits: 2, range: 5, penetration: 0, damageType: 'las' },
    laspistol: { name: '制式雷射手槍', damage: 16, hits: 1, range: 2, penetration: 0, damageType: 'las' },
    shotgun: { name: '霰彈槍', damage: 16, hits: 3, range: 3, penetration: 0, damageType: 'ballistic', closeQuarter: true },
    'precision-lasgun': { name: '精準雷射槍', damage: 42, hits: 1, range: 7, penetration: 15, damageType: 'las' },
    flamer: { name: '火焰器', damage: 12, hits: 4, range: 2, penetration: 0, damageType: 'flame', closeQuarter: true },
    'plasma-gun': { name: '電漿槍', damage: 38, hits: 1, range: 5, penetration: 50, damageType: 'plasma' },
    'heavy-weapon': { name: '星界軍重武器組', damage: 20, hits: 3, range: 6, penetration: 10, damageType: 'ballistic' },
    'sororitas-boltgun': { name: '修女用爆彈槍', damage: 24, hits: 2, range: 5, penetration: 15, damageType: 'bolt' },
    'astartes-boltgun': { name: '阿斯塔特用爆彈槍', damage: 28, hits: 2, range: 5, penetration: 20, damageType: 'bolt' },
};

/**
 * Carapace costs initiative rather than movement. The v1 penalty was a 0.90
 * speed multiplier, which on whole tiles would round three down to two — a
 * third of a soldier's movement for a plate that is supposed to be a trade, not
 * a crippling. An explicit v2 replacement of the v1 rule, approved by the user
 * on 2026-09-25.
 */
export const ARMOUR_STATS: Record<string, { armour: number; type: ArmourType; initiative?: number }> = {
    'flak-armour': { armour: 20, type: 'flak' },
    'carapace-armour': { armour: 40, type: 'carapace', initiative: -1 },
    'astartes-power-armour': { armour: 80, type: 'power' },
};

export interface DutyStats { initiative: number; movement: number }

/**
 * Initiative orders a side; movement is tiles per activation. comms, flamer and
 * plasma keep their roster identity but fight on the rifleman profile: what they
 * carry decides what they do, not what their duty is called.
 */
export const DUTY_STATS: Record<string, DutyStats> = {
    sergeant: { initiative: 14, movement: 3 },
    marksman: { initiative: 11, movement: 3 },
    rifleman: { initiative: 10, movement: 3 },
    medic: { initiative: 9, movement: 3 },
    engineer: { initiative: 8, movement: 3 },
    heavy: { initiative: 6, movement: 2 },
    comms: { initiative: 10, movement: 3 },
    flamer: { initiative: 10, movement: 3 },
    plasma: { initiative: 10, movement: 3 },
};

/** Tuning stages are a total, not a product: two stages are 1.10, not 1.1025. */
export const TUNING_MULTIPLIER = [1, 1.05, 1.10];
export const FUNCTION_MOD_ACCURACY = 0.05;

export const effectiveRange = (board: Board, unit: Unit, from: Hex, weapon: Weapon) =>
    weapon.range + (weapon.damageType === 'flame' || weapon.damageType === 'melee' ? 0 : (ruleAt(board, from).range ?? 0));

export function canReach(board: Board, unit: Unit, from: Hex, target: Unit, weapon: Weapon): boolean {
    if (target.down) return false;
    return distance(from, target.at) <= effectiveRange(board, unit, from, weapon)
        && hasLineOfSight(board, from, target.at);
}

/**
 * Chance of one hit landing. Cover does not touch it — cover reduces the damage
 * that lands instead, and doing both would count the same shelter twice.
 */
export function hitChance(board: Board, unit: Unit, from: Hex, target: Unit, weapon: Weapon): number {
    const span = distance(from, target.at);
    const reach = effectiveRange(board, unit, from, weapon);
    const far = Math.max(0, span - reach / 2);

    const chance = unit.accuracy
        + (ruleAt(board, from).accuracy ?? 0) / 100
        + (unit.accuracyBonus ?? 0)
        - far * FALLOFF;
    return Math.min(HIT_CEILING, Math.max(HIT_FLOOR, chance));
}

/**
 * Cover softens ranged fire only. Flame is explicitly exempt — a sandbag does
 * not help against something that flows around it — and melee is not ranged, so
 * a soldier in cover is no safer from fists.
 */
export function coverMultiplier(board: Board, weapon: Weapon, target: Hex): number {
    if (weapon.damageType === 'flame' || weapon.damageType === 'melee') return 1;
    return ruleAt(board, target).incoming ?? 1;
}

export interface DamageContext {
    /** Weapon tuning, 1 / 1.05 / 1.10. */
    tuning?: number;
    /** An active skill's damage multiplier for this attack. */
    skill?: number;
    cover?: number;
    /** Anything else softening the hit, such as an engineer's fortified position. */
    reduction?: number;
    /** Armour ignored on top of the weapon's own penetration. */
    extraPenetration?: number;
}

/**
 * One landed hit. Every multiplier is applied before a single rounding, so the
 * same shot never resolves differently depending on the order it was computed.
 */
export function damageOf(weapon: Weapon, armour: number, armourType: ArmourType = 'none', context: DamageContext = {}): number {
    const pierced = weapon.penetration + (context.extraPenetration ?? 0);
    const raw = weapon.damage
        * (context.tuning ?? 1)
        * (context.skill ?? 1)
        * coefficientFor(weapon.damageType, armourType)
        * (100 / (100 + Math.max(0, armour - pierced)))
        * (context.cover ?? 1)
        * (context.reduction ?? 1);
    return Math.max(1, Math.round(raw));
}

/** What an attack is worth on average. The AI and the shot share this arithmetic. */
export function expectedDamage(board: Board, unit: Unit, from: Hex, target: Unit, weapon: Weapon): number {
    const perHit = damageOf(weapon, target.armour, target.armourType, {
        tuning: unit.tuning,
        cover: coverMultiplier(board, weapon, target.at),
    });
    return weapon.hits * hitChance(board, unit, from, target, weapon) * perHit;
}

// ---------------------------------------------------------------------------
// Tools and duty skills (GPT's table four). A tool only unlocks what its duty
// can already do: an engineering kit in a rifleman's hands does nothing this
// battle, and the UI says so rather than pretending otherwise.
// ---------------------------------------------------------------------------

export interface Skill { name: string; charge: number }

/** One active per duty. Charge is banked a round at a time and spent in full. */
export const SKILLS: Record<string, Skill> = {
    sergeant: { name: '戰術指令', charge: 3 },
    rifleman: { name: '瞄準射擊', charge: 2 },
    marksman: { name: '弱點射擊', charge: 3 },
    medic: { name: '戰地救護', charge: 2 },
    engineer: { name: '佈設掩體', charge: 3 },
    heavy: { name: '壓制射擊', charge: 3 },
};

export const skillFor = (duty: string): Skill | undefined => SKILLS[duty];

/** A sergeant steadies the people beside them; vox doubles how far that reaches. */
export const AURA_HIT = 0.05;
export const AURA_RANGE = 1;
export const AURA_RANGE_WITH_VOX = 2;

/** Passive patching: small, every round, and capped per side so it cannot stall a battle. */
export const MEDIC_PASSIVE_HEAL = 4;
export const MEDIC_PASSIVE_CAP = 8;
/** 戰地救護: worth spending only on someone actually hurt. */
export const MEDIC_ACTIVE_HEAL = 24;
export const MEDIC_ACTIVE_MIN_MISSING = 18;
/** A medicae kit in anyone else's hands: once a battle, on themselves. */
export const SELF_HEAL = 12;
export const SELF_HEAL_MIN_MISSING = 12;

/** An engineer with their kit is harder to shift out of cover. */
export const ENGINEER_COVER_REDUCTION = 0.90;
export const MAX_BUILT_COVER = 2;

export const AIMED_HIT = 0.15;
export const AIMED_DAMAGE = 1.15;
export const WEAKPOINT_PENETRATION = 30;
export const WEAKPOINT_HIT = 0.10;
export const SUPPRESS_DAMAGE = 0.80;
export const SUPPRESS_HIT = 0.15;
export const COMMAND_MOVE = 1;
export const COMMAND_RANGE = 2;
export const COMMAND_MIN_TARGETS = 2;

/** A heavy weapon served by one person feeds itself one round at a time. */
export const UNASSISTED_HITS = 1;

export const MEDICAE_KIT = 'medicae-kit';
export const VOX_CASTER = 'vox-caster';
export const ENGINEERING_KIT = 'engineering-kit';
export const VOX_INITIATIVE = 1;

export const carries = (tools: string[] | undefined, tool: string) => !!tools?.includes(tool);
