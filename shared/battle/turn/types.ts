import { Board, Hex } from '../hex';

// The v2 battle is turn based and nobody steers it: the player picks the six,
// their gear, where they stand and how they should behave, and the squad fights
// on its own. Everything here therefore has to be legible after the fact —
// every activation records why it did what it did.

export type Side = 'crew' | 'enemy';

/** The one behaviour control the player has, chosen per soldier before departure. */
export type Stance = 'hold' | 'advance' | 'flank' | 'guard';

export const STANCE_LABELS: Record<Stance, string> = {
    hold: '固守', advance: '推進', flank: '側翼', guard: '護衛',
};

export type DamageType = 'las' | 'ballistic' | 'bolt' | 'plasma' | 'flame' | 'melee';
export type ArmourType = 'none' | 'flak' | 'carapace' | 'power';

export interface Weapon {
    name: string;
    /** Decides which column of the coefficient table this weapon reads. */
    damageType: DamageType;
    /** Damage of a single hit, before armour. */
    damage: number;
    /** Hits attempted per attack. */
    hits: number;
    /** Reach in tiles. */
    range: number;
    /** Armour ignored. */
    penetration: number;
    /** Built for someone's face: kept in hand when an enemy is adjacent. */
    closeQuarter?: boolean;
}

export interface UnitSpec {
    id: string;
    name: string;
    side: Side;
    /** Drives the threat weighting: a medic is worth shooting first. */
    duty: string;
    /** Portrait id, so the token on the map is the face from the roster. */
    assetId?: string;
    maxHp: number;
    armour: number;
    /** Follows the plate actually worn, never guessed from the duty. */
    armourType: ArmourType;
    /** Base hit chance, 0..1. */
    accuracy: number;
    /** Flat hit bonus from a function mod on the weapon. */
    accuracyBonus?: number;
    /** Tuning stages on the primary, as a multiplier: 1, 1.05 or 1.10. */
    tuning?: number;
    /** Tiles of movement per activation. */
    movement: number;
    /** Higher acts earlier within its side. */
    initiative: number;
    weapon: Weapon;
    /** Reached for when an enemy is adjacent, unless the primary is close-quarter. */
    sidearm?: Weapon;
    /** Catalogue ids of carried tools; what they unlock depends on the duty. */
    tools?: string[];
    /**
     * A heavy weapon is a two-person job: whoever is bound here feeds it. Both
     * take one of the six places, and both have their own health and turn.
     */
    assistantId?: string;
    stance: Stance;
    /** Who a 'guard' stance follows. */
    guardTargetId?: string;
    at: Hex;
}

export interface Unit extends UnitSpec {
    hp: number;
    /** Downed units stay on the field as wreckage; v2 has no permanent death. */
    down: boolean;
    /** Rounds banked toward this duty's active skill. */
    charge: number;
    /** Extra movement granted for this unit's next activation only. */
    moveBonus?: number;
    /** Hit chance lost on this unit's next activation only. */
    suppressed?: number;
    /** A non-medic's medicae kit patches them up once a battle. */
    selfHealed?: boolean;
}

export type Activity =
    | { kind: 'move'; to: Hex }
    | { kind: 'attack'; targetId: string; hits: number; damage: number; weapon: string; skill?: string }
    | { kind: 'heal'; targetId: string; amount: number; skill: string }
    | { kind: 'fortify'; at: Hex; skill: string }
    | { kind: 'command'; targetIds: string[]; skill: string }
    | { kind: 'idle' };

export interface Activation {
    round: number;
    unitId: string;
    /** Plain language, for the report: this battle has to explain itself. */
    reason: string;
    activities: Activity[];
    /** Every unit's position and health once this activation finished. */
    snapshot: { id: string; at: Hex; hp: number; down: boolean }[];
}

export type Outcome = 'victory' | 'defeat' | 'timeout';

/** Why a battle ended, for a report that has to explain itself. */
export type Ending =
    | 'enemy-down'      // the enemy is wiped out
    | 'crew-down'       // the squad is wiped out
    | 'mutual-down'     // the last of both fell together
    | 'rounds-ahead'    // out of rounds, more of the squad left standing
    | 'rounds-behind'   // out of rounds, fewer
    | 'rounds-level';   // out of rounds, level on bodies

export interface BattleSetup {
    board: Board;
    units: UnitSpec[];
    seed: number;
    maxRounds?: number;
}

export interface BattleResult {
    outcome: Outcome;
    ending: Ending;
    rounds: number;
    activations: Activation[];
    units: Unit[];
    seed: number;
}
