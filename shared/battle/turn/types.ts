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

export interface Weapon {
    name: string;
    /** Damage of a single hit, before armour. */
    damage: number;
    /** Hits attempted per attack. */
    hits: number;
    /** Reach in tiles. */
    range: number;
    /** Armour ignored. */
    penetration: number;
}

export interface UnitSpec {
    id: string;
    name: string;
    side: Side;
    /** Drives the threat weighting: a medic is worth shooting first. */
    duty: string;
    maxHp: number;
    armour: number;
    /** Base hit chance, 0..1. */
    accuracy: number;
    /** Tiles of movement per activation. */
    movement: number;
    /** Higher acts earlier within its side. */
    initiative: number;
    weapon: Weapon;
    stance: Stance;
    /** Who a 'guard' stance follows. */
    guardTargetId?: string;
    at: Hex;
}

export interface Unit extends UnitSpec {
    hp: number;
    /** Downed units stay on the field as wreckage; v2 has no permanent death. */
    down: boolean;
}

export type Activity =
    | { kind: 'move'; to: Hex }
    | { kind: 'attack'; targetId: string; hits: number; damage: number }
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

export interface BattleSetup {
    board: Board;
    units: UnitSpec[];
    seed: number;
    maxRounds?: number;
}

export interface BattleResult {
    outcome: Outcome;
    rounds: number;
    activations: Activation[];
    units: Unit[];
    seed: number;
}
