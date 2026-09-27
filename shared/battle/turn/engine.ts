import {
    Hex, deploymentZone, distance, hasLineOfSight, hexKey, reachable, ruleAt, sameHex, stepToward, terrainAt,
} from '../hex';
import {
    AIMED_DAMAGE, AIMED_HIT, AURA_HIT, AURA_RANGE, AURA_RANGE_WITH_VOX, canReach, carries,
    COMMAND_MIN_TARGETS, COMMAND_MOVE, COMMAND_RANGE, coverMultiplier, damageOf, DEMOLITION_DAMAGE, DEMOLITION_NAME, ENGINEERING_KIT,
    ENGINEER_COVER_REDUCTION, expectedDamage, FISTS, hitChance, MAX_BUILT_COVER, MAX_ROUNDS,
    MEDICAE_KIT, MEDIC_ACTIVE_HEAL, MEDIC_ACTIVE_MIN_MISSING, MEDIC_PASSIVE_CAP, MEDIC_PASSIVE_HEAL,
    SELF_HEAL, SELF_HEAL_MIN_MISSING, skillFor, SUPPRESS_DAMAGE, SUPPRESS_HIT, threatOf,
    UNASSISTED_HITS, VOX_CASTER,
    WEAKPOINT_HIT, WEAKPOINT_PENETRATION, isVehicle,
    BARRAGE_DAMAGE, BARRAGE_EVERY, CULT_LEADER_ID_SUFFIX, RELAY_AURA_HIT, isRelay,
} from './rules';
import { Activation, Activity, BattleResult, BattleSetup, Ending, Objective, Outcome, Side, Stance, Unit, Weapon } from './types';
import type { Effect } from '../../roster/specialties';

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
    /** Passive patching is capped per side per round so it cannot stall a battle. */
    healed: Record<Side, number>;
    /** An engineer may fortify twice a battle, not endlessly. */
    built: Record<Side, number>;
    /**
     * Assistants feeding a heavy weapon this round. Chosen once at the start of
     * the round so the order units happen to act in cannot buy a free attack.
     */
    spotting: Set<string>;
    objective: Objective;
    /** Consecutive round ends a soldier has stood on a seize objective. */
    seizeRun: number;
    /** Set at a round end when a seize or hold objective has been met. */
    objectiveMet: boolean;
    /** A barrage the cult leader has marked, and the round it lands at the end of. */
    barrage: { at: Hex; lands: number } | null;
}

/**
 * Everyone who falls stays on the field. A vehicle's wreck also becomes cover
 * where it stopped (C2): the board is this battle's own copy, so no other
 * battle ever sees it.
 */
function knockDown(battle: Battle, unit: Unit) {
    unit.down = true;
    if (isVehicle(unit)) battle.setup.board.tiles[hexKey(unit.at)] = 'cover';
}

const roll = (battle: Battle): number => {
    battle.random = (Math.imul(battle.random, 1664525) + 1013904223) >>> 0;
    return battle.random / 4294967296;
};

const other = (side: Side): Side => (side === 'crew' ? 'enemy' : 'crew');
const living = (battle: Battle, side: Side) => battle.units.filter(u => u.side === side && !u.down);
const byId = (battle: Battle, id: string) => battle.units.find(u => u.id === id);

/** The unit's specialty effect of this kind, if it has one (2026-09-27). */
function effectOf<K extends Effect['kind']>(unit: Pick<Unit, 'effects'>, kind: K): Extract<Effect, { kind: K }> | undefined {
    return unit.effects?.find(e => e.kind === kind) as Extract<Effect, { kind: K }> | undefined;
}

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
        .filter(u => !u.down && !isRelay(u))
        .sort((a, b) =>
            b.initiative - a.initiative
            || (battle.order.get(a.id) ?? 0) - (battle.order.get(b.id) ?? 0)
            || (a.id < b.id ? -1 : 1));
}

const servesHeavyWeapon = (unit: Unit) => unit.duty === 'heavy' && unit.weapon.name.includes('重武器');

/**
 * An assistant only counts while they are alive and beside the gun. Deciding at
 * the start of the round, rather than when the gun fires, keeps activation order
 * from handing anyone a free action.
 */
function chooseSpotters(battle: Battle) {
    battle.spotting.clear();
    const taken = new Set<string>();
    for (const gunner of battle.units.filter(u => !u.down && servesHeavyWeapon(u) && u.assistantId)) {
        const mate = byId(battle, gunner.assistantId!);
        // Nobody feeds two guns, and a downed mate feeds none.
        if (!mate || mate.down || mate.side !== gunner.side || taken.has(mate.id)) continue;
        if (distance(gunner.at, mate.at) > 1) continue;
        battle.spotting.add(mate.id);
        taken.add(mate.id);
    }
}

/** Full rate needs the mate still standing beside the gun when it fires. */
function assistedHits(battle: Battle, unit: Unit, weapon: Weapon): number {
    if (!servesHeavyWeapon(unit) || weapon !== unit.weapon) return weapon.hits;
    const mate = unit.assistantId ? byId(battle, unit.assistantId) : null;
    const fed = !!mate && !mate.down && battle.spotting.has(mate.id) && distance(unit.at, mate.at) <= 1;
    return fed ? weapon.hits : UNASSISTED_HITS;
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
function weaponAgainst(unit: Unit, from: Hex, target: Unit, moved = false): Weapon {
    // A heavy weapon has to be set down before it fires, so a gunner who moved
    // reaches for their sidearm instead of being silenced for the turn.
    if (moved && servesHeavyWeapon(unit)) return unit.sidearm ?? FISTS;
    const adjacent = distance(from, target.at) <= 1;
    if (!adjacent || unit.weapon.closeQuarter) return unit.weapon;
    return unit.sidearm ?? FISTS;
}

const allies = (battle: Battle, unit: Unit) =>
    battle.units.filter(u => u.side === unit.side && u.id !== unit.id && !u.down);

/**
 * A sergeant steadies whoever is beside them, and a vox-caster doubles how far
 * that carries. Auras of the same kind do not stack: the strongest applies.
 */
function auraFor(battle: Battle, unit: Unit, from: Hex): number {
    let best = 0;
    for (const leader of leadersCovering(battle, unit, from)) {
        best = Math.max(best, AURA_HIT + (effectOf(leader, 'aura-hit')?.amount ?? 0));
    }
    return best;
}

const auraReach = (leader: Unit) =>
    (carries(leader.tools, VOX_CASTER) ? AURA_RANGE_WITH_VOX : AURA_RANGE) + (effectOf(leader, 'aura-range')?.amount ?? 0);

/** The sergeants whose aura reaches this tile. */
const leadersCovering = (battle: Battle, unit: Unit, from: Hex) =>
    allies(battle, unit).filter(a => a.duty === 'sergeant' && distance(from, a.at) <= auraReach(a));

/** The strongest sergeant specialty of this kind whose aura covers the tile (multipliers: the lowest wins for guards). */
function auraEffect(battle: Battle, unit: Unit, from: Hex, kind: 'aura-damage' | 'aura-guard'): number {
    const values = leadersCovering(battle, unit, from).map(l => effectOf(l, kind)?.amount).filter((v): v is number => v !== undefined);
    if (values.length === 0) return 1;
    return kind === 'aura-damage' ? Math.max(...values) : Math.min(...values);
}

/** A vox operator's coordination: its own aura, separate from a sergeant's. */
function coordinationFor(battle: Battle, unit: Unit, from: Hex): number {
    let best = 0;
    for (const ally of allies(battle, unit)) {
        const effect = effectOf(ally, 'coordination');
        if (effect && distance(from, ally.at) <= effect.range) best = Math.max(best, effect.amount);
    }
    return best;
}

/** Specialty multipliers on one attack's damage, for the shot and for the AI's estimate alike. */
function attackMultiplier(battle: Battle, unit: Unit, from: Hex, target: Unit): number {
    let multiplier = 1;
    const close = effectOf(unit, 'close-damage');
    if (close && distance(from, target.at) <= close.within) multiplier *= close.amount;
    const finisher = effectOf(unit, 'finisher');
    if (finisher && target.hp < target.maxHp / 2) multiplier *= finisher.amount;
    const opening = effectOf(unit, 'first-shot');
    if (opening && !unit.firstShotDone) multiplier *= opening.amount;
    return multiplier * auraEffect(battle, unit, from, 'aura-damage');
}

/** Once a battle, a soldier with 不屈 recovers when they fall low but not out. */
function lastStand(target: Unit) {
    const effect = effectOf(target, 'last-stand');
    if (!effect || target.lastStandUsed || target.down || target.hp >= target.maxHp * effect.below) return;
    target.hp = Math.min(target.maxHp, target.hp + effect.amount);
    target.lastStandUsed = true;
}

/**
 * The unit as it fights from a tile: passives and the debuffs on it folded into
 * one object, so the AI's estimate and the shot that follows read the same
 * numbers. Nothing here reaches into rules.ts.
 */
function asFighting(battle: Battle, unit: Unit, from: Hex, moved: boolean): Unit {
    const high = terrainAt(battle.setup.board, from) === 'high' ? (effectOf(unit, 'high-ground')?.amount ?? 0) : 0;
    const still = moved ? (effectOf(unit, 'moving-hit')?.amount ?? 0) : (effectOf(unit, 'steady-hit')?.amount ?? 0);
    const bonus = (unit.accuracyBonus ?? 0) + auraFor(battle, unit, from) + relayAura(battle, unit) - (unit.suppressed ?? 0)
        + coordinationFor(battle, unit, from) + high + still;
    // A marksman who held still sees further, but only down their own sight.
    const steady = (!moved || !!effectOf(unit, 'mobile-steady')) && unit.duty === 'marksman' && unit.weapon.name.includes('精準');
    const weapon = steady ? { ...unit.weapon, range: unit.weapon.range + 1 } : unit.weapon;
    return { ...unit, accuracyBonus: bonus, weapon };
}

/** While a broadcast relay of their side stands, everyone on it aims a little better. */
const relayAura = (battle: Battle, unit: Unit) =>
    living(battle, unit.side).some(isRelay) && !isRelay(unit) ? RELAY_AURA_HIT : 0;

/**
 * Everything softening a hit on this target beyond armour and cover: an
 * engineer's kit in cover, and the specialties that guard (堅守陣線, 鋼鐵意志,
 * a neighbour's 護衛站位, a sergeant's 死守陣線).
 */
function damageReduction(battle: Battle, target: Unit): number {
    const sheltered = (ruleAt(battle.setup.board, target.at).incoming ?? 1) < 1;
    let reduction = target.duty === 'engineer' && carries(target.tools, ENGINEERING_KIT) && sheltered ? ENGINEER_COVER_REDUCTION : 1;
    const dugIn = effectOf(target, 'cover-guard');
    if (dugIn && sheltered) reduction *= dugIn.amount;
    reduction *= effectOf(target, 'damage-taken')?.amount ?? 1;
    const shields = allies(battle, target)
        .filter(a => distance(a.at, target.at) <= 1)
        .map(a => effectOf(a, 'shield-adjacent')?.amount)
        .filter((v): v is number => v !== undefined);
    if (shields.length > 0) reduction *= Math.min(...shields);
    return reduction * auraEffect(battle, target, target.at, 'aura-guard');
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
    // A marked barrage is announced a round ahead precisely so it can be dodged.
    const marked = battle.barrage && unit.side === 'crew' && distance(tile, battle.barrage.at) <= 1 ? BARRAGE_AVOID : 0;
    return seen * 6 * shelter + marked;
}

/** How much the squad dislikes standing under a marked barrage. */
const BARRAGE_AVOID = 45;

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

/**
 * The objective pulls the squad as well as the stance does (C2). Only soldiers
 * told to move on it feel the pull: 'hold' keeps its ground and 'guard' its
 * ward, so which stances a player picks decides whether the objective is taken.
 * The enemy does not chase objectives; it defends by fighting.
 */
function objectivePull(battle: Battle, unit: Unit, tile: Hex): number {
    if (unit.side !== 'crew' || (unit.stance !== 'advance' && unit.stance !== 'flank')) return 0;
    const goal = battle.objective;
    if (goal.kind !== 'seize' && goal.kind !== 'rescue') return 0;
    // Standing on the tile has to beat a good shot, or the squad fights beside
    // the objective and never takes it. Reaching a rescue ends the battle.
    if (sameHex(tile, goal.at)) return goal.kind === 'rescue' ? OBJECTIVE_REACHED_RESCUE : OBJECTIVE_ON_SEIZE;
    return -distance(tile, goal.at) * OBJECTIVE_PULL;
}

/** Objective weights, in the same units as an attack's expected damage × threat. */
const OBJECTIVE_PULL = 6;
const OBJECTIVE_ON_SEIZE = 40;
const OBJECTIVE_REACHED_RESCUE = 200;

/** An engineer with a charge left works toward the nearest enemy vehicle. */
function demolitionPull(battle: Battle, unit: Unit, tile: Hex): number {
    if (unit.duty !== 'engineer' || unit.demolished || unit.stance === 'hold') return 0;
    const hulls = living(battle, other(unit.side)).filter(isVehicle);
    if (hulls.length === 0) return 0;
    return -Math.min(...hulls.map(h => distance(tile, h.at))) * 3;
}

/** An assassination target is worth several ordinary ones to the squad. */
const markedTarget = (battle: Battle, unit: Unit, target: Unit | null) =>
    !!target && unit.side === 'crew' && battle.objective.kind === 'assassinate' && battle.objective.targetId === target.id;

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
        ...[...reachable(board, unit.at, unit.movement + (unit.moveBonus ?? 0), { occupied: occupiedBy(battle, unit) }).values()],
    ];

    const options: Option[] = [];
    for (const tile of tiles) {
        const moved = !sameHex(tile.hex, unit.at);
        const fighting = asFighting(battle, unit, tile.hex, moved);
        const shootable = foes.filter(foe =>
            canReach(board, fighting, tile.hex, foe, weaponAgainst(fighting, tile.hex, foe, moved)));
        const candidates: (Unit | null)[] = shootable.length > 0 ? shootable : [null];

        for (const target of candidates) {
            const weapon = target ? weaponAgainst(fighting, tile.hex, target, moved) : fighting.weapon;
            // The gun's rate depends on whether the mate is still feeding it.
            const rate = target ? assistedHits(battle, unit, weapon) / weapon.hits : 1;
            const damage = target
                ? expectedDamage(board, fighting, tile.hex, target, weapon) * damageReduction(battle, target) * rate
                    * attackMultiplier(battle, unit, tile.hex, target)
                : 0;
            // Finishing someone is worth more than spreading damage around.
            const finisher = target && damage >= target.hp ? 2 : 1;
            const marked = markedTarget(battle, unit, target) ? 2.5 : 1;
            const worth = target ? damage * finisher * threatOf(target) * marked : 0;
            const score = worth - exposureOf(battle, unit, tile.hex) + stanceBonus(battle, unit, tile.hex, target)
                + objectivePull(battle, unit, tile.hex) + demolitionPull(battle, unit, tile.hex);

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

interface AttackSkill { name: string; hit?: number; damage?: number; penetration?: number; suppress?: boolean }

function attack(battle: Battle, unit: Unit, target: Unit, moved: boolean, skill?: AttackSkill): Activity {
    const board = battle.setup.board;
    const fighting = asFighting(battle, unit, unit.at, moved);
    const weapon = weaponAgainst(fighting, unit.at, target, moved);
    // 隱匿: harder to hit while they are in cover.
    const hidden = (ruleAt(board, target.at).incoming ?? 1) < 1 ? (effectOf(target, 'hidden')?.amount ?? 0) : 0;
    const chance = Math.min(0.95, hitChance(board, fighting, unit.at, target, weapon) + (skill?.hit ?? 0) - hidden);
    const perHit = damageOf(weapon, target.armour, target.armourType, {
        tuning: unit.tuning,
        skill: (skill?.damage ?? 1) * attackMultiplier(battle, unit, unit.at, target),
        extraPenetration: skill?.penetration,
        cover: coverMultiplier(board, weapon, target.at, target.armourType),
        reduction: damageReduction(battle, target),
    });

    // Every attempt is rolled on its own: four shots are four chances, not one
    // chance for four times the damage.
    const shots = assistedHits(battle, unit, weapon);
    let landed = 0;
    for (let i = 0; i < shots; i += 1) if (roll(battle) < chance) landed += 1;

    const damage = landed * perHit;
    target.hp = Math.max(0, target.hp - damage);
    if (target.hp === 0) knockDown(battle, target);
    else lastStand(target);
    unit.firstShotDone = true;
    // Suppression bites on the target's next activation, whether or not it hurt.
    if (skill?.suppress && landed > 0 && !target.down) target.suppressed = SUPPRESS_HIT;
    return { kind: 'attack', targetId: target.id, hits: landed, damage, weapon: weapon.name, skill: skill?.name };
}

const missing = (unit: Unit) => unit.maxHp - unit.hp;
const ready = (unit: Unit) => {
    const skill = skillFor(unit.duty);
    return !!skill && unit.charge >= skill.charge - (effectOf(unit, 'skill-charge')?.amount ?? 0);
};

/**
 * Support replaces the attack, so it is considered first: a medic who can save
 * someone should not be shooting, and an engineer who can build cover should
 * not be either. Nothing is spent when there is no legal target.
 */
function trySupport(battle: Battle, unit: Unit): { activity: Activity; reason: string } | null {
    const board = battle.setup.board;
    const skill = skillFor(unit.duty);
    if (!skill || !ready(unit)) return null;

    if (unit.duty === 'medic' && carries(unit.tools, MEDICAE_KIT)) {
        const hurt = [...allies(battle, unit), unit]
            .filter(a => !a.down && missing(a) >= MEDIC_ACTIVE_MIN_MISSING)
            .filter(a => distance(unit.at, a.at) <= 2 && hasLineOfSight(board, unit.at, a.at))
            .sort((a, b) => missing(b) / b.maxHp - missing(a) / a.maxHp || (a.id < b.id ? -1 : 1));
        const patient = hurt[0];
        if (!patient) return null;
        const amount = Math.min(Math.round(MEDIC_ACTIVE_HEAL * healBoost(unit)), missing(patient));
        patient.hp += amount;
        return {
            activity: { kind: 'heal', targetId: patient.id, amount, skill: skill.name },
            reason: `施放${skill.name}，替 ${patient.name} 回復 ${amount} 點`,
        };
    }

    if (unit.duty === 'engineer' && carries(unit.tools, ENGINEERING_KIT)) {
        if (battle.built[unit.side] >= MAX_BUILT_COVER) return null;
        // Fortify whoever is most exposed to incoming fire, not the nearest tile.
        const foes = living(battle, other(unit.side));
        const candidates = allies(battle, unit)
            .filter(a => distance(unit.at, a.at) <= 1 && terrainAt(board, a.at) === 'open')
            .map(a => ({
                ally: a,
                threat: foes.filter(f => canReach(board, f, f.at, a, f.weapon)).length,
            }))
            .filter(c => c.threat > 0)
            .sort((a, b) => b.threat - a.threat || (a.ally.id < b.ally.id ? -1 : 1));
        const chosen = candidates[0];
        if (!chosen) return null;
        board.tiles[hexKey(chosen.ally.at)] = 'cover';
        battle.built[unit.side] += 1;
        return {
            activity: { kind: 'fortify', at: chosen.ally.at, skill: skill.name },
            reason: `施放${skill.name}，將 ${hexKey(chosen.ally.at)} 加固為掩體`,
        };
    }

    if (unit.duty === 'sergeant') {
        // Only worth an order when enough people can actually use the ground.
        const helped = allies(battle, unit)
            .filter(a => distance(unit.at, a.at) <= COMMAND_RANGE && !a.moveBonus);
        if (helped.length < COMMAND_MIN_TARGETS) return null;
        const move = COMMAND_MOVE + (effectOf(unit, 'command-move')?.amount ?? 0);
        for (const ally of helped) ally.moveBonus = move;
        return {
            activity: { kind: 'command', targetIds: helped.map(a => a.id), skill: skill.name },
            reason: `施放${skill.name}，${helped.length} 名友軍下次啟動多走 ${move} 格`,
        };
    }

    return null;
}

/**
 * An engineer who can reach a tile beside an enemy vehicle plants a charge:
 * once a battle, flat damage through the hull. Considered before anything else
 * the engineer could do, because nothing else they carry hurts a vehicle.
 */
function tryDemolish(battle: Battle, unit: Unit): { activities: Activity[]; reason: string } | null {
    if (unit.duty !== 'engineer' || unit.demolished) return null;
    const board = battle.setup.board;
    const hulls = living(battle, other(unit.side)).filter(isVehicle);
    if (hulls.length === 0) return null;

    const tiles = [
        { hex: unit.at, cost: 0 },
        ...[...reachable(board, unit.at, unit.movement + (unit.moveBonus ?? 0), { occupied: occupiedBy(battle, unit) }).values()],
    ];
    let best: { hex: Hex; cost: number; hull: Unit } | null = null;
    for (const tile of tiles) {
        for (const hull of hulls) {
            if (distance(tile.hex, hull.at) !== 1) continue;
            const better = !best || tile.cost < best.cost || (tile.cost === best.cost && hull.hp < best.hull.hp)
                || (tile.cost === best.cost && hull.hp === best.hull.hp && hull.id < best.hull.id);
            if (better) best = { hex: tile.hex, cost: tile.cost, hull };
        }
    }
    if (!best) return null;

    const activities: Activity[] = [];
    const moved = !sameHex(best.hex, unit.at);
    if (moved) { unit.at = best.hex; activities.push({ kind: 'move', to: best.hex }); }
    const damage = Math.min(DEMOLITION_DAMAGE, best.hull.hp);
    best.hull.hp -= damage;
    if (best.hull.hp === 0) knockDown(battle, best.hull);
    unit.demolished = true;
    activities.push({ kind: 'attack', targetId: best.hull.id, hits: 1, damage, weapon: DEMOLITION_NAME, skill: DEMOLITION_NAME });
    const verb = moved ? '貼近' : '就地';
    const wrecked = best.hull.down ? '，將其擊毀' : '';
    return { activities, reason: verb + '對 ' + best.hull.name + ' 安放' + DEMOLITION_NAME + '，造成 ' + damage + ' 傷害' + wrecked };
}

const healBoost = (unit: Unit) => effectOf(unit, 'heal-boost')?.amount ?? 1;

/** 戰地急救: once a battle, the most hurt neighbour, no kit needed. */
function tryFieldAid(battle: Battle, unit: Unit): { activity: Activity; reason: string } | null {
    const effect = effectOf(unit, 'field-aid');
    if (!effect || unit.fieldAidUsed) return null;
    const patient = allies(battle, unit)
        .filter(a => distance(unit.at, a.at) <= 1 && missing(a) >= effect.amount)
        .sort((a, b) => missing(b) / b.maxHp - missing(a) / a.maxHp || (a.id < b.id ? -1 : 1))[0];
    if (!patient) return null;
    const amount = Math.min(Math.round(effect.amount * healBoost(unit)), missing(patient));
    patient.hp += amount;
    unit.fieldAidUsed = true;
    return {
        activity: { kind: 'heal', targetId: patient.id, amount, skill: '戰地急救' },
        reason: `施放戰地急救，替 ${patient.name} 回復 ${amount} 點`,
    };
}

/** A medicae kit in anyone else's hands: one patch-up, on themselves, per battle. */
function trySelfHeal(battle: Battle, unit: Unit): { activity: Activity; reason: string } | null {
    if (unit.duty === 'medic' || unit.selfHealed) return null;
    if (!carries(unit.tools, MEDICAE_KIT) || missing(unit) < SELF_HEAL_MIN_MISSING) return null;
    const amount = Math.min(Math.round(SELF_HEAL * healBoost(unit)), missing(unit));
    unit.hp += amount;
    unit.selfHealed = true;
    return {
        activity: { kind: 'heal', targetId: unit.id, amount, skill: '醫療工具' },
        reason: `使用醫療工具自療 ${amount} 點`,
    };
}

/** The attack skills, all of which need the unit to have held still. */
function attackSkillFor(unit: Unit): AttackSkill | null {
    const skill = skillFor(unit.duty);
    if (!skill || !ready(unit)) return null;
    if (unit.duty === 'rifleman') return { name: skill.name, hit: AIMED_HIT, damage: AIMED_DAMAGE };
    if (unit.duty === 'marksman' && unit.weapon.name.includes('精準')) {
        return { name: skill.name, hit: WEAKPOINT_HIT, penetration: WEAKPOINT_PENETRATION };
    }
    if (servesHeavyWeapon(unit)) return { name: skill.name, damage: SUPPRESS_DAMAGE, suppress: true };
    return null;
}

function activate(battle: Battle, unit: Unit) {
    const activities: Activity[] = [];
    let reason = '';

    // Feeding a heavy weapon is a job: the mate may reposition with the gun but
    // has no attack or skill of their own this round.
    if (battle.spotting.has(unit.id)) {
        const gunner = battle.units.find(u => u.assistantId === unit.id);
        const step = gunner ? stepToward(battle.setup.board, unit.at, gunner.at, unit.movement,
            { occupied: occupiedBy(battle, unit) }) : null;
        if (step) { unit.at = step; activities.push({ kind: 'move', to: step }); }
        if (activities.length === 0) activities.push({ kind: 'idle' });
        battle.activations.push({
            round: battle.round,
            unitId: unit.id,
            reason: `為 ${gunner?.name ?? '重武器'} 助裝，本輪不另行攻擊`,
            activities,
            snapshot: snapshot(battle),
        });
        unit.moveBonus = undefined;
        unit.suppressed = undefined;
        return;
    }

    const demolition = tryDemolish(battle, unit);
    const support = demolition ? null : trySupport(battle, unit);
    const aid = demolition || support ? null : tryFieldAid(battle, unit);
    if (demolition) {
        activities.push(...demolition.activities);
        reason = demolition.reason;
    } else if (aid) {
        activities.push(aid.activity);
        reason = aid.reason;
    } else if (support) {
        activities.push(support.activity);
        reason = support.reason;
        unit.charge = 0;
    } else {
        const choice = bestOption(battle, unit);
        const staying = sameHex(choice.tile, unit.at);
        const skill = staying && choice.target ? attackSkillFor(unit) : null;

        if (!staying) {
            unit.at = choice.tile;
            activities.push({ kind: 'move', to: choice.tile });
        }
        if (choice.target && !choice.target.down) {
            activities.push(attack(battle, unit, choice.target, !staying, skill ?? undefined));
            if (skill) unit.charge = 0;
        }
        if (activities.length === 0) {
            // Nothing to shoot and nowhere worth going: patch yourself up instead.
            const patch = trySelfHeal(battle, unit);
            if (patch) { activities.push(patch.activity); reason = patch.reason; }
        }
        if (activities.length === 0) activities.push({ kind: 'idle' });
        if (!reason) reason = skill ? `${choice.reason}（${skill.name}）` : choice.reason;
    }

    // Orders and suppression last exactly one activation: this one.
    unit.moveBonus = undefined;
    unit.suppressed = undefined;

    battle.activations.push({
        round: battle.round,
        unitId: unit.id,
        reason,
        activities,
        snapshot: snapshot(battle),
    });
}

/**
 * End of round, in the order GPT fixed: hazard bites, the field is judged, the
 * medics who are still standing patch someone up, and only then does everyone
 * bank a round of charge. Judging before healing is what stops a medic from
 * reviving a battle that is already over; the dead neither heal nor charge.
 */
function endOfRound(battle: Battle) {
    for (const unit of battle.units) {
        if (unit.down) continue;
        const attrition = ruleAt(battle.setup.board, unit.at).attrition ?? 0;
        if (attrition === 0) continue;
        unit.hp = Math.max(0, unit.hp - attrition);
        if (unit.hp === 0) knockDown(battle, unit);
    }

    resolveBarrage(battle);
    judgeObjective(battle);
    if (endingOf(battle)) return; // settled: no patching a finished field

    battle.healed = { crew: 0, enemy: 0 };
    const medics = battle.units
        .filter(u => !u.down && u.duty === 'medic' && carries(u.tools, MEDICAE_KIT))
        .sort((a, b) => b.initiative - a.initiative || (a.id < b.id ? -1 : 1));

    for (const medic of medics) {
        const room = MEDIC_PASSIVE_CAP - battle.healed[medic.side];
        if (room <= 0) continue;
        const patient = allies(battle, medic)
            .filter(a => distance(medic.at, a.at) <= 1 && missing(a) > 0)
            .sort((a, b) => missing(b) / b.maxHp - missing(a) / a.maxHp || (a.id < b.id ? -1 : 1))[0];
        if (!patient) continue;
        const amount = Math.min(Math.round(MEDIC_PASSIVE_HEAL * healBoost(medic)), room, missing(patient));
        patient.hp += amount;
        battle.healed[medic.side] += amount;
    }

    for (const unit of battle.units) {
        if (unit.down) continue;
        const skill = skillFor(unit.duty);
        if (skill) unit.charge = Math.min(skill.charge, unit.charge + 1);
    }
}

/**
 * The cult leader's barrage (C3). A marked barrage lands first; then, if the
 * leader and a relay still stand, the next one is marked on the tightest knot
 * of the squad. Both are recorded against the leader so the report reads them.
 */
function resolveBarrage(battle: Battle) {
    const leader = battle.units.find(u => u.side === 'enemy' && u.id.endsWith(CULT_LEADER_ID_SUFFIX));
    if (!leader) return;
    const powered = !leader.down && living(battle, 'enemy').some(isRelay);

    if (battle.barrage && battle.barrage.lands === battle.round) {
        const at = battle.barrage.at;
        battle.barrage = null;
        const struck = battle.units.filter(u => !u.down && !isRelay(u) && distance(u.at, at) <= 1);
        for (const unit of struck) {
            unit.hp = Math.max(0, unit.hp - BARRAGE_DAMAGE);
            if (unit.hp === 0) knockDown(battle, unit);
        }
        battle.activations.push({
            round: battle.round, unitId: leader.id,
            reason: '轟擊落在 ' + hexKey(at) + '，' + (struck.length > 0 ? struck.length + ' 人各受 ' + BARRAGE_DAMAGE + ' 點傷害' : '無人在範圍內'),
            activities: [{ kind: 'barrage', at, targetIds: struck.map(u => u.id), damage: BARRAGE_DAMAGE }],
            snapshot: snapshot(battle),
        });
    }

    if (!powered || battle.barrage || battle.round % BARRAGE_EVERY !== 1) return;
    const crew = living(battle, 'crew');
    if (crew.length === 0) return;
    const huddle = (u: Unit) => crew.filter(o => distance(o.at, u.at) <= 1).length;
    const mark = [...crew].sort((a, b) => huddle(b) - huddle(a) || (a.id < b.id ? -1 : 1))[0].at;
    battle.barrage = { at: mark, lands: battle.round + 1 };
    battle.activations.push({
        round: battle.round, unitId: leader.id,
        reason: '標出轟擊區 ' + hexKey(mark) + '，下一回合結束時落下',
        activities: [{ kind: 'barrage-mark', at: mark }],
        snapshot: snapshot(battle),
    });
}

/**
 * Seize and hold are judged at the end of a round, after hazard: standing on
 * the tile when the round closes is what counts, not passing through it.
 */
function judgeObjective(battle: Battle) {
    const goal = battle.objective;
    const crew = living(battle, 'crew');
    if (goal.kind === 'seize') {
        battle.seizeRun = crew.some(u => sameHex(u.at, goal.at)) ? battle.seizeRun + 1 : 0;
        if (battle.seizeRun >= goal.rounds) battle.objectiveMet = true;
    }
    if (goal.kind === 'hold' && battle.round >= goal.rounds && crew.length > 0) battle.objectiveMet = true;
}

const endingOf = (battle: Battle): Ending | null => {
    const crew = living(battle, 'crew');
    const enemy = living(battle, 'enemy').length;
    // Hazard can drop the last of both sides in the same end-of-round pass.
    // Checking the enemy first would have handed that to the crew.
    if (crew.length === 0 && enemy === 0) return 'mutual-down';
    if (enemy === 0) return 'enemy-down';
    if (crew.length === 0) return 'crew-down';

    const goal = battle.objective;
    if (battle.objectiveMet) return 'objective-met';
    // Rescue and assassination end the moment they happen, mid-round.
    if (goal.kind === 'rescue' && crew.some(u => sameHex(u.at, goal.at))) return 'objective-met';
    if (goal.kind === 'assassinate' && byId(battle, goal.targetId)?.down) return 'objective-met';
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
    'objective-met': 'victory',
};

export function runBattle(setup: BattleSetup): BattleResult {
    // Fortifying writes terrain, and the board handed in is usually a scenario
    // constant shared by every battle ever fought on it. Copy it, or one
    // engineer's sandbags become part of the map for everyone afterwards.
    const board = { ...setup.board, tiles: { ...setup.board.tiles } };

    const battle: Battle = {
        setup: { ...setup, board },
        units: setup.units.map(spec => ({ ...spec, hp: spec.maxHp, down: false, charge: 0 })),
        round: 0,
        random: setup.seed >>> 0,
        activations: [],
        order: new Map(),
        zones: {
            crew: new Set(deploymentZone(board, 'crew').map(hexKey)),
            enemy: new Set(deploymentZone(board, 'enemy').map(hexKey)),
        },
        healed: { crew: 0, enemy: 0 },
        built: { crew: 0, enemy: 0 },
        spotting: new Set(),
        objective: setup.objective ?? { kind: 'eliminate' },
        seizeRun: 0,
        objectiveMet: false,
        barrage: null,
    };

    // Drawn once, before anything else touches the generator, so the tie-break is
    // fixed for the battle and identical on replay.
    for (const unit of battle.units) battle.order.set(unit.id, roll(battle));

    const maxRounds = setup.maxRounds ?? MAX_ROUNDS;
    let ending = endingOf(battle);

    while (!ending && battle.round < maxRounds) {
        battle.round += 1;
        chooseSpotters(battle);
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
