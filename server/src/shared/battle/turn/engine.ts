import { Hex, deploymentZone, distance, hexKey, reachable, ruleAt, sameHex } from '../hex';
import {
    canReach, coverMultiplier, damageOf, expectedDamage, FISTS, hitChance, MAX_ROUNDS, threatOf,
} from './rules';
import { Activation, Activity, BattleResult, BattleSetup, Ending, Outcome, Side, Stance, Unit, Weapon } from './types';

// The turn engine. Rounds, alternating activations, and an AI that scores its
// options by fixed rules so the report can state the reason for every move.
//
// Determinism is a hard requirement: the server resolves the battle and the
// client replays it from the stored seed, so nothing may depend on object order
// or floating-point drift. Every sort ends in a tie-break on position and id.

interface Battle {
    setup: BattleSetup;
    units: Unit[];
    round: number;
    random: number;
    activations: Activation[];
    /** Stable tie-break for equal initiative, drawn from the seed, not from side. */
    order: Map<string, number>;
    zones: Record<Side, Set<string>>;
}

const roll = (battle: Battle): number => {
    battle.random = (Math.imul(battle.random, 1664525) + 1013904223) >>> 0;
    return battle.random / 4294967296;
};

const other = (side: Side): Side => (side === 'crew' ? 'enemy' : 'crew');
const living = (battle: Battle, side: Side) => battle.units.filter(u => u.side === side && !u.down);
const byId = (battle: Battle, id: string) => battle.units.find(u => u.id === id);

const STANCE_VERB: Record<Stance, string> = {
    hold: '固守', advance: '推進', flank: '側翼', guard: '護衛',
};

/**
 * One order across both sides, highest initiative first. Alternating sides gave
 * whoever went first a 71% edge in a mirror match, and the user chose global
 * initiative over evening that out with numbers: initiative is now something a
 * loadout can actually buy, and carapace's -1 is a real cost.
 *
 * Ties break on a key drawn from the seed rather than on side or id, so equal
 * initiative is a coin toss that still replays exactly.
 */
function activationOrder(battle: Battle): Unit[] {
    return battle.units
        .filter(u => !u.down)
        .sort((a, b) =>
            b.initiative - a.initiative
            || (battle.order.get(a.id) ?? 0) - (battle.order.get(b.id) ?? 0)
            || (a.id < b.id ? -1 : 1));
}

const snapshot = (battle: Battle) =>
    battle.units.map(u => ({ id: u.id, at: u.at, hp: u.hp, down: u.down }));

const occupiedBy = (battle: Battle, self: Unit) =>
    battle.units.filter(u => u.id !== self.id && !u.down).map(u => u.at);

/**
 * GPT's engagement rule: an ordinary primary is unusable in someone's face, so
 * an adjacent enemy means the sidearm, or fists when there is none. Shotguns and
 * flamers are built for that range and keep firing. Choosing the weapon is part
 * of the one attack, never an extra one.
 */
function weaponAgainst(unit: Unit, from: Hex, target: Unit): Weapon {
    const adjacent = distance(from, target.at) <= 1;
    if (!adjacent || unit.weapon.closeQuarter) return unit.weapon;
    return unit.sidearm ?? FISTS;
}

interface Option {
    tile: Hex;
    cost: number;
    target: Unit | null;
    score: number;
    reason: string;
}

/**
 * How much a tile exposes whoever stands on it: every enemy that could shoot it
 * counts, softened by the cover the tile gives. Keeps units out of the open when
 * standing there buys nothing.
 */
function exposureOf(battle: Battle, unit: Unit, tile: Hex): number {
    const shelter = ruleAt(battle.setup.board, tile).incoming ?? 1;
    const seen = living(battle, other(unit.side))
        .filter(foe => canReach(battle.setup.board, foe, foe.at, { ...unit, at: tile }, foe.weapon)).length;
    return seen * 6 * shelter;
}

/** Stance turns a tile into a preference. This is the whole of the player's control. */
function stanceBonus(battle: Battle, unit: Unit, tile: Hex, target: Unit | null): number {
    const board = battle.setup.board;
    const foes = living(battle, other(unit.side));
    const nearest = foes.length > 0
        ? foes.reduce((best, foe) => (distance(tile, foe.at) < distance(tile, best.at) ? foe : best))
        : null;

    const sheltered = (ruleAt(board, tile).incoming ?? 1) < 1;

    switch (unit.stance) {
        case 'hold':
            // Hold the ground you were given: leaving the deployment zone is not
            // a preference the score can outweigh, it is refused outright.
            if (!battle.zones[unit.side].has(hexKey(tile))) return -Infinity;
            return (sameHex(tile, unit.at) ? 8 : -distance(unit.at, tile) * 4) + (sheltered ? 10 : 0);

        case 'advance': {
            if (!nearest) return 0;
            // Work to the furthest distance that still shoots at full accuracy,
            // and hold there. Stopping at maximum range instead looked like
            // caution but measured as a stalemate: both sides froze at the edge
            // of their falloff and neither could finish inside ten rounds.
            // This is the effective band, not the enemy's face.
            const band = Math.max(1, Math.floor(unit.weapon.range / 2));
            return -Math.abs(distance(tile, nearest.at) - band) * 3 + (sheltered ? 6 : 0);
        }

        case 'flank': {
            // Worth a walk to reach someone their cover does not protect.
            if (target) return (ruleAt(board, target.at).incoming ?? 1) === 1 ? 12 : 0;
            // With nothing to shoot, keep working around rather than stalling.
            return nearest ? -distance(tile, nearest.at) * 2 + (sheltered ? 4 : 0) : 0;
        }

        case 'guard': {
            const ward = unit.guardTargetId ? byId(battle, unit.guardTargetId) : null;
            // A ward who is down is not a position to run back to: hold here.
            if (!ward || ward.down) return sameHex(tile, unit.at) ? 8 : -distance(unit.at, tile) * 4;
            return -Math.max(0, distance(tile, ward.at) - 2) * 8;
        }

        default:
            return 0;
    }
}

function describe(unit: Unit, tile: Hex, target: Unit | null, damage: number): string {
    const moved = !sameHex(tile, unit.at);
    if (target) {
        const where = moved ? '移動至 ' + hexKey(tile) + ' 後' : '原地';
        return where + '射擊 ' + target.name + '（預期 ' + Math.round(damage) + ' 傷害）';
    }
    return moved
        ? '無可射擊目標，依' + STANCE_VERB[unit.stance] + '姿態移動至 ' + hexKey(tile)
        : '無可射擊目標，原地待命';
}

function bestOption(battle: Battle, unit: Unit): Option {
    const board = battle.setup.board;
    const foes = living(battle, other(unit.side));
    const tiles: { hex: Hex; cost: number }[] = [
        { hex: unit.at, cost: 0 },
        ...[...reachable(board, unit.at, unit.movement, { occupied: occupiedBy(battle, unit) }).values()],
    ];

    const options: Option[] = [];
    for (const tile of tiles) {
        const shootable = foes.filter(foe => canReach(board, unit, tile.hex, foe, weaponAgainst(unit, tile.hex, foe)));
        const candidates: (Unit | null)[] = shootable.length > 0 ? shootable : [null];

        for (const target of candidates) {
            const weapon = target ? weaponAgainst(unit, tile.hex, target) : unit.weapon;
            const damage = target ? expectedDamage(board, unit, tile.hex, target, weapon) : 0;
            // Finishing someone is worth more than spreading damage around.
            const finisher = target && damage >= target.hp ? 2 : 1;
            const worth = target ? damage * finisher * threatOf(target) : 0;
            const score = worth - exposureOf(battle, unit, tile.hex) + stanceBonus(battle, unit, tile.hex, target);

            options.push({
                tile: tile.hex,
                cost: tile.cost,
                target,
                score,
                reason: describe(unit, tile.hex, target, damage),
            });
        }
    }

    options.sort((a, b) =>
        b.score - a.score
        || a.cost - b.cost
        || a.tile.row - b.tile.row
        || a.tile.col - b.tile.col
        || (a.target ? a.target.id : '').localeCompare(b.target ? b.target.id : ''));
    return options[0];
}

function attack(battle: Battle, unit: Unit, target: Unit): Activity {
    const board = battle.setup.board;
    const weapon = weaponAgainst(unit, unit.at, target);
    const chance = hitChance(board, unit, unit.at, target, weapon);
    const perHit = damageOf(weapon, target.armour, target.armourType, {
        tuning: unit.tuning,
        cover: coverMultiplier(board, weapon, target.at),
    });

    // Every attempt is rolled on its own: four shots are four chances, not one
    // chance for four times the damage.
    let landed = 0;
    for (let i = 0; i < weapon.hits; i += 1) if (roll(battle) < chance) landed += 1;

    const damage = landed * perHit;
    target.hp = Math.max(0, target.hp - damage);
    if (target.hp === 0) target.down = true;
    return { kind: 'attack', targetId: target.id, hits: landed, damage, weapon: weapon.name };
}

function activate(battle: Battle, unit: Unit) {
    const choice = bestOption(battle, unit);
    const activities: Activity[] = [];

    if (!sameHex(choice.tile, unit.at)) {
        unit.at = choice.tile;
        activities.push({ kind: 'move', to: choice.tile });
    }
    if (choice.target && !choice.target.down) {
        activities.push(attack(battle, unit, choice.target));
    }
    if (activities.length === 0) activities.push({ kind: 'idle' });

    battle.activations.push({
        round: battle.round,
        unitId: unit.id,
        reason: choice.reason,
        activities,
        snapshot: snapshot(battle),
    });
}

/** Hazard tiles bite at the end of a round, so crossing one is a real decision. */
function endOfRound(battle: Battle) {
    for (const unit of battle.units) {
        if (unit.down) continue;
        const attrition = ruleAt(battle.setup.board, unit.at).attrition ?? 0;
        if (attrition === 0) continue;
        unit.hp = Math.max(0, unit.hp - attrition);
        if (unit.hp === 0) unit.down = true;
    }
}

const endingOf = (battle: Battle): Ending | null => {
    const crew = living(battle, 'crew').length;
    const enemy = living(battle, 'enemy').length;
    // Hazard can drop the last of both sides in the same end-of-round pass.
    // Checking the enemy first would have handed that to the crew.
    if (crew === 0 && enemy === 0) return 'mutual-down';
    if (enemy === 0) return 'enemy-down';
    if (crew === 0) return 'crew-down';
    return null;
};

/**
 * Running out of rounds is settled on who is still standing. Without this the
 * tail of an even fight never resolves: the last survivor on each side is
 * usually holding, out of the other's reach, and ten rounds burn down to a draw
 * that neither player's decisions caused. Equal numbers left is a real draw.
 */
const endingAtLimit = (crew: number, enemy: number): { ending: Ending; outcome: Outcome } => {
    if (crew > enemy) return { ending: 'rounds-ahead', outcome: 'victory' };
    if (enemy > crew) return { ending: 'rounds-behind', outcome: 'defeat' };
    return { ending: 'rounds-level', outcome: 'timeout' };
};

const OUTCOME_OF: Record<Ending, Outcome> = {
    'enemy-down': 'victory',
    'crew-down': 'defeat',
    'mutual-down': 'timeout',
    'rounds-ahead': 'victory',
    'rounds-behind': 'defeat',
    'rounds-level': 'timeout',
};

export function runBattle(setup: BattleSetup): BattleResult {
    const battle: Battle = {
        setup,
        units: setup.units.map(spec => ({ ...spec, hp: spec.maxHp, down: false })),
        round: 0,
        random: setup.seed >>> 0,
        activations: [],
        order: new Map(),
        zones: {
            crew: new Set(deploymentZone(setup.board, 'crew').map(hexKey)),
            enemy: new Set(deploymentZone(setup.board, 'enemy').map(hexKey)),
        },
    };

    // Drawn once, before anything else touches the generator, so the tie-break is
    // fixed for the battle and identical on replay.
    for (const unit of battle.units) battle.order.set(unit.id, roll(battle));

    const maxRounds = setup.maxRounds ?? MAX_ROUNDS;
    let ending = endingOf(battle);

    while (!ending && battle.round < maxRounds) {
        battle.round += 1;
        for (const unit of activationOrder(battle)) {
            if (unit.down) continue; // shot before its turn came round
            activate(battle, unit);
            ending = endingOf(battle);
            if (ending) break;
        }
        if (ending) break;
        endOfRound(battle);
        ending = endingOf(battle);
    }

    const settled: Ending = ending
        ?? endingAtLimit(living(battle, 'crew').length, living(battle, 'enemy').length).ending;
    return {
        outcome: OUTCOME_OF[settled],
        ending: settled,
        rounds: battle.round,
        activations: battle.activations,
        units: battle.units,
        seed: setup.seed,
    };
}
