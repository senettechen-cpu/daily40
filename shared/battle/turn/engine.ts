import { Hex, distance, hexKey, reachable, ruleAt, sameHex } from '../hex';
import { canReach, damageOf, expectedDamage, hitChance, MAX_ROUNDS, threatOf } from './rules';
import { Activation, Activity, BattleResult, BattleSetup, Outcome, Side, Stance, Unit } from './types';

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
 * Sides take turns: crew, enemy, crew, enemy. When one side runs out of bodies
 * the other finishes its own order, so a numbers advantage shows up as more
 * actions rather than as a free round.
 */
function activationOrder(battle: Battle): Unit[] {
    const queue = (side: Side) => battle.units
        .filter(u => u.side === side && !u.down)
        .sort((a, b) => b.initiative - a.initiative || (a.id < b.id ? -1 : 1));

    const crew = queue('crew');
    const enemy = queue('enemy');
    const order: Unit[] = [];
    for (let i = 0; i < Math.max(crew.length, enemy.length); i += 1) {
        if (crew[i]) order.push(crew[i]);
        if (enemy[i]) order.push(enemy[i]);
    }
    return order;
}

const snapshot = (battle: Battle) =>
    battle.units.map(u => ({ id: u.id, at: u.at, hp: u.hp, down: u.down }));

const occupiedBy = (battle: Battle, self: Unit) =>
    battle.units.filter(u => u.id !== self.id && !u.down).map(u => u.at);

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
        .filter(foe => canReach(battle.setup.board, foe, foe.at, { ...unit, at: tile })).length;
    return seen * 6 * shelter;
}

/** Stance turns a tile into a preference. This is the whole of the player's control. */
function stanceBonus(battle: Battle, unit: Unit, tile: Hex, target: Unit | null): number {
    const board = battle.setup.board;
    const foes = living(battle, other(unit.side));
    const nearest = foes.length > 0
        ? foes.reduce((best, foe) => (distance(tile, foe.at) < distance(tile, best.at) ? foe : best))
        : null;

    switch (unit.stance) {
        case 'hold':
            // Stay put, take shelter, shoot what comes. Moving at all is a cost.
            return (sameHex(tile, unit.at) ? 8 : -distance(unit.at, tile) * 4)
                + ((ruleAt(board, tile).incoming ?? 1) < 1 ? 10 : 0);
        case 'advance':
            return nearest ? -distance(tile, nearest.at) * 3 : 0;
        case 'flank':
            // Worth a walk to reach someone their cover does not protect.
            return target && (ruleAt(board, target.at).incoming ?? 1) === 1 ? 12 : 0;
        case 'guard': {
            const ward = unit.guardTargetId ? byId(battle, unit.guardTargetId) : null;
            if (!ward || ward.down) return 0;
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
        const shootable = foes.filter(foe => canReach(board, unit, tile.hex, foe));
        const candidates: (Unit | null)[] = shootable.length > 0 ? shootable : [null];

        for (const target of candidates) {
            const damage = target ? expectedDamage(board, unit, tile.hex, target) : 0;
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
    const chance = hitChance(battle.setup.board, unit, unit.at, target);
    const perHit = damageOf(unit.weapon, target.armour);
    let landed = 0;
    for (let i = 0; i < unit.weapon.hits; i += 1) if (roll(battle) < chance) landed += 1;

    const damage = landed * perHit;
    target.hp = Math.max(0, target.hp - damage);
    if (target.hp === 0) target.down = true;
    return { kind: 'attack', targetId: target.id, hits: landed, damage };
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

const outcomeOf = (battle: Battle): Outcome | null => {
    if (living(battle, 'enemy').length === 0) return 'victory';
    if (living(battle, 'crew').length === 0) return 'defeat';
    return null;
};

export function runBattle(setup: BattleSetup): BattleResult {
    const battle: Battle = {
        setup,
        units: setup.units.map(spec => ({ ...spec, hp: spec.maxHp, down: false })),
        round: 0,
        random: setup.seed >>> 0,
        activations: [],
    };

    const maxRounds = setup.maxRounds ?? MAX_ROUNDS;
    let outcome = outcomeOf(battle);

    while (!outcome && battle.round < maxRounds) {
        battle.round += 1;
        for (const unit of activationOrder(battle)) {
            if (unit.down) continue; // shot before its turn came round
            activate(battle, unit);
            outcome = outcomeOf(battle);
            if (outcome) break;
        }
        if (outcome) break;
        endOfRound(battle);
        outcome = outcomeOf(battle);
    }

    return {
        outcome: outcome ?? 'timeout',
        rounds: battle.round,
        activations: battle.activations,
        units: battle.units,
        seed: setup.seed,
    };
}
