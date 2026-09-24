// Phase-1 battle test simulation: deterministic, fixed-step (20 ticks/s), no
// access to game resources, saves or life data. The map is the original
// imperial-ruins layout (locked by tests/battlefield-layout.test.cjs).
// Facing is fixed: the crew holds the west and faces SE (+x), the enemy holds
// the east and faces NW (−x); nobody may path behind the opposing line.
import { COVER, HEIGHT, lineOfSight, protectedByCover, WALLS, WIDTH, type Point } from '../terrain';
import {
    BATTLE_TIME_LIMIT, damageFor, DISENGAGE_RANGE, ENGAGE_RANGE, ENTER_COVER_TICKS, FIRE_ACTION_TICKS, FIRE_WINDUP_TICKS,
    hitChance, HUMAN, RETRACT_TICKS, Slot, SWAP_TICKS, TICKS_PER_SECOND, ticks, WeaponId, WEAPONS,
} from './rules';

export type Side = 'crew' | 'enemy';
export type Faction = 'cadian' | 'traitor';
export type Order = 'hold' | 'assault';
export type Posture = 'standing' | 'covered' | 'peeked';

export type Action =
    | { kind: 'idle' }
    | { kind: 'move' }
    | { kind: 'enter-cover'; start: number; end: number }
    | { kind: 'aim'; start: number; end: number; targetId: string; peek: boolean }
    | { kind: 'fire'; start: number; end: number; shotAt: number; targetId: string; slot: Slot; resolved: boolean }
    | { kind: 'retract'; start: number; end: number }
    | { kind: 'reload'; start: number; end: number; slot: Slot }
    | { kind: 'swap'; start: number; end: number; to: Slot; reason: SwapReason }
    | { kind: 'down'; start: number };

export interface Unit {
    id: string;
    name: string;
    side: Side;
    faction: Faction;
    order: Order;
    pos: Point; // continuous position used for rendering and distance
    tile: Point; // tile occupied (or being entered) — used for LOS, cover and occupancy
    prev: Point; // tile being left while moving
    step: number; // 0..1 progress from prev to tile
    path: Point[];
    goal: Point | null; // reserved destination
    walked: number; // total tiles walked; drives the gait phase
    hp: number;
    maxHp: number;
    armor: number;
    accuracy: number;
    /**
     * Tiles per second. Derived once from the baseline and the worn armour, never
     * re-multiplied per tick — a repeated multiplier would make a unit crawl
     * slower the longer it walked.
     */
    speed: number;
    loadout: Record<Slot, WeaponId>;
    active: Slot; // committed weapon: changes only when a swap completes
    ammo: Record<Slot, number>;
    action: Action;
    posture: Posture;
    positioned: boolean; // reached its first firing position
    cooldownUntil: number;
    aimedAt: string | null;
    noTargetSince: number | null;
    lastHitTick: number;
    stats: { shots: number; hits: number; damage: number };
}

export type SwapReason = 'engaged' | 'disengaged';

// Structured events: the battle report reads these fields, never the log text.
export type BattleEvent =
    | { id: number; tick: number; kind: 'shot'; sourceId: string; targetId: string; weapon: WeaponId; outcome: 'hit' | 'miss' | 'cover'; amount: number; from: Point; to: Point }
    | { id: number; tick: number; kind: 'swap'; unitId: string; phase: 'start' | 'complete'; to: Slot; weapon: WeaponId; reason: SwapReason; text: string }
    | { id: number; tick: number; kind: 'reload'; unitId: string; slot: Slot; weapon: WeaponId; text: string }
    | { id: number; tick: number; kind: 'cancel'; unitId: string; action: 'reload' | 'aim' | 'fire'; reason: 'engaged'; text: string }
    | { id: number; tick: number; kind: 'down'; unitId: string; text: string };

type EventFields<K extends BattleEvent['kind']> = Omit<Extract<BattleEvent, { kind: K }>, 'id' | 'tick' | 'text'>;

export type BattleStatus = 'running' | 'victory' | 'defeat' | 'timeout';

export interface Battle {
    tick: number;
    random: number;
    status: BattleStatus;
    units: Unit[];
    events: BattleEvent[]; // most recent last, capped
    nextEventId: number;
    log: string[]; // most recent first, capped
}

export interface EnemySpawn { x: number; y: number; order: Order }
/**
 * Per-soldier stats for a real deployment. Absent means the test crew: six
 * identical guardsmen on the HUMAN baseline, which keeps every existing
 * scenario and its recorded seeds reproducing exactly as before.
 */
export interface CrewProfile {
    id: string;
    name: string;
    maxHp: number;
    armor: number;
    accuracy: number; // 0..1
    /** Tiles per second; absent falls back to the unencumbered baseline. */
    speed?: number;
    loadout: Record<Slot, WeaponId>;
}

export interface BattleSetup {
    lanes: number[];
    enemies: EnemySpawn[];
    seed: number;
    crewAmmo?: Partial<Record<Slot, number>>;
    crew?: CrewProfile[];
}

export const CREW_SIZE = 6;
export const LANES = [1, 2, 3, 4, 5, 6, 7, 8];
// Hold orders stay behind their own cover rows (crew: C(3)/C(7), enemy: C(9)/C(12));
// columns 7–9 are no man's land that only assault orders enter.
const CREW_ZONE_MAX_X = 6;
const ENEMY_ZONE_MIN_X = 10;
const REPOSITION_AFTER = ticks(2);
const EVENT_CAP = 200;

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const terrainBlocked = (p: Point) => p.x < 0 || p.x >= WIDTH || p.y < 0 || p.y >= HEIGHT || WALLS.some(w => same(w, p)) || COVER.some(c => same(c, p));

export function validateDeployment(lanes: number[]): string {
    if (lanes.length !== CREW_SIZE) return `需要部署 ${CREW_SIZE} 名士兵。`;
    if (new Set(lanes).size !== lanes.length) return '每個通道只能部署一人。';
    if (lanes.some(l => !LANES.includes(l))) return '部署通道必須在 1–8。';
    return '';
}

function makeUnit(id: string, name: string, side: Side, faction: Faction, order: Order, at: Point, ammo?: Partial<Record<Slot, number>>, profile?: CrewProfile): Unit {
    const maxHp = profile?.maxHp ?? HUMAN.hp;
    const loadout: Record<Slot, WeaponId> = profile?.loadout ?? { primary: 'lasgun', secondary: 'laspistol' };
    return {
        id, name, side, faction, order, pos: { ...at }, tile: { ...at }, prev: { ...at }, step: 1, path: [], goal: null, walked: 0,
        hp: maxHp, maxHp, armor: profile?.armor ?? HUMAN.armor, accuracy: profile?.accuracy ?? HUMAN.accuracy,
        speed: profile?.speed ?? HUMAN.speed,
        loadout, active: 'primary',
        ammo: { primary: ammo?.primary ?? WEAPONS[loadout.primary].magazine, secondary: ammo?.secondary ?? WEAPONS[loadout.secondary].magazine },
        action: { kind: 'idle' }, posture: 'standing', positioned: false, cooldownUntil: 0, aimedAt: null, noTargetSince: null,
        lastHitTick: -999, stats: { shots: 0, hits: 0, damage: 0 },
    };
}

export function createBattle(setup: BattleSetup): Battle {
    const error = validateDeployment(setup.lanes);
    if (error) throw new Error(error);
    const units = [
        ...setup.lanes.map((lane, i) => {
            const profile = setup.crew?.[i];
            return makeUnit(profile?.id ?? `crew-${i + 1}`, profile?.name ?? `卡迪安 ${i + 1}`, 'crew', 'cadian', 'hold', { x: 1, y: lane }, setup.crewAmmo, profile);
        }),
        ...setup.enemies.map((e, i) => makeUnit(`enemy-${i + 1}`, `叛軍 ${i + 1}${e.order === 'assault' ? '（突擊）' : ''}`, 'enemy', 'traitor', e.order, { x: e.x, y: e.y })),
    ];
    const taken = units.map(u => `${u.tile.x},${u.tile.y}`);
    if (new Set(taken).size !== taken.length || units.some(u => terrainBlocked(u.tile))) throw new Error('部署位置重疊或位於障礙物上。');
    return { tick: 0, random: setup.seed >>> 0, status: 'running', units, events: [], nextEventId: 1, log: ['戰鬥測試開始 · 不影響任何正式資料'] };
}

function clone(b: Battle): Battle {
    return {
        ...b,
        units: b.units.map(u => ({ ...u, pos: { ...u.pos }, tile: { ...u.tile }, prev: { ...u.prev }, path: u.path.map(p => ({ ...p })), goal: u.goal && { ...u.goal }, ammo: { ...u.ammo }, action: { ...u.action } as Action, stats: { ...u.stats } })),
        events: [...b.events],
        log: [...b.log],
    };
}

function roll(b: Battle) {
    b.random = (Math.imul(b.random, 1664525) + 1013904223) >>> 0;
    return b.random / 4294967296;
}
function record(b: Battle, text: string) {
    b.log = [`${(b.tick / TICKS_PER_SECOND).toFixed(1)}s · ${text}`, ...b.log].slice(0, 80);
}
function note<K extends Exclude<BattleEvent['kind'], 'shot'>>(b: Battle, unit: Unit, fields: EventFields<K> & { kind: K }, text: string) {
    b.events.push({ id: b.nextEventId++, tick: b.tick, ...fields, text } as BattleEvent);
    record(b, `${unit.name}${text}`);
}

function startSwap(b: Battle, u: Unit, to: Slot, reason: SwapReason) {
    u.action = { kind: 'swap', start: b.tick, end: b.tick + SWAP_TICKS[to], to, reason };
    note(b, u, { kind: 'swap', unitId: u.id, phase: 'start', to, weapon: u.loadout[to], reason }, '開始切換武器');
}

const opponents = (b: Battle, u: Unit) => b.units.filter(o => o.side !== u.side && o.hp > 0);
const weaponOf = (u: Unit) => WEAPONS[u.loadout[u.active]];

/** Enemies in melee contact: an opponent with an assault (melee/intercept) order within 1.2 tiles and in sight. */
function meleeThreats(b: Battle, u: Unit, range: number) {
    return opponents(b, u).filter(o => (u.order === 'assault' || o.order === 'assault') && dist(u.pos, o.pos) <= range && lineOfSight(u.tile, o.tile));
}

function nearestOpponent(b: Battle, u: Unit, from: Point = u.pos) {
    return opponents(b, u).sort((a, c) => dist(from, a.pos) - dist(from, c.pos) || a.id.localeCompare(c.id))[0];
}

function pickTarget(b: Battle, u: Unit): Unit | undefined {
    const weapon = weaponOf(u);
    return opponents(b, u)
        .filter(o => dist(u.pos, o.pos) <= weapon.maxRange && lineOfSight(u.tile, o.tile))
        .sort((a, c) => Number(dist(u.pos, a.pos) > weapon.effectiveRange) - Number(dist(u.pos, c.pos) > weapon.effectiveRange)
            || dist(u.pos, a.pos) - dist(u.pos, c.pos) || a.id.localeCompare(c.id))[0];
}

/** Tiles a unit may stand on: own half for hold orders; never behind the opposing line. */
function allowed(b: Battle, u: Unit, p: Point): boolean {
    if (terrainBlocked(p)) return false;
    const foes = opponents(b, u);
    if (u.side === 'crew') return p.x <= CREW_ZONE_MAX_X && foes.every(f => p.x < f.tile.x);
    if (u.order === 'hold' && p.x < ENEMY_ZONE_MIN_X) return false;
    return foes.every(f => p.x > f.tile.x || (p.x === f.tile.x && p.y !== f.tile.y));
}

function occupiedBy(b: Battle, u: Unit, p: Point) {
    return b.units.some(o => o !== u && o.hp > 0 && (same(o.tile, p) || (o.goal && same(o.goal, p))));
}

function reachable(b: Battle, u: Unit, maxCost: number) {
    const start = { x: u.tile.x, y: u.tile.y, cost: 0, path: [] as Point[] };
    const seen = new Set([`${start.x},${start.y}`]);
    const nodes = [start];
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.cost >= maxCost) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const p = { x: n.x + dx, y: n.y + dy }, key = `${p.x},${p.y}`;
            if (seen.has(key) || !allowed(b, u, p) || occupiedBy(b, u, p)) continue;
            seen.add(key);
            nodes.push({ ...p, cost: n.cost + 1, path: [...n.path, p] });
        }
    }
    return nodes;
}

/** Best firing position: a shot within effective range, then protection from the nearest enemy, then the shortest walk. */
function choosePosition(b: Battle, u: Unit) {
    const weapon = WEAPONS[u.loadout.primary];
    let best = null as null | { x: number; y: number; path: Point[]; score: number };
    for (const n of reachable(b, u, 12)) {
        const foe = nearestOpponent(b, u, n);
        if (!foe) break;
        const d = dist(n, foe.tile);
        const shot = d <= weapon.effectiveRange && opponents(b, u).some(o => dist(n, o.tile) <= weapon.effectiveRange && lineOfSight(n, o.tile));
        const score = (shot ? 40 : 0) + (protectedByCover(n, foe.tile) ? 30 : 0) - n.cost * 1.5 + (n.cost === 0 ? 5 : 0);
        if (!best || score > best.score) best = { x: n.x, y: n.y, path: n.path, score };
    }
    return best;
}

function assaultPath(b: Battle, u: Unit) {
    const foe = nearestOpponent(b, u);
    if (!foe) return null;
    return reachable(b, u, 30)
        .filter(n => n.cost > 0 && dist(n, foe.tile) <= ENGAGE_RANGE)
        .sort((a, c) => a.cost - c.cost || c.x - a.x || a.y - c.y)[0] ?? null;
}

function startMove(u: Unit, target: { x: number; y: number; path: Point[] }) {
    u.path = target.path.map(p => ({ ...p }));
    u.goal = { x: target.x, y: target.y };
    u.action = { kind: 'move' };
    u.posture = 'standing';
    u.aimedAt = null;
}

function begin(b: Battle, u: Unit, action: Action) {
    u.action = action;
}

function cancelAction(b: Battle, u: Unit, why: string) {
    const kind = u.action.kind;
    if (kind === 'reload' || kind === 'aim' || (kind === 'fire' && !u.action.resolved)) note(b, u, { kind: 'cancel', unitId: u.id, action: kind, reason: 'engaged' }, `${why}，中止${{ reload: '換彈', aim: '瞄準', fire: '射擊' }[kind]}（彈量不補）`);
    u.action = { kind: 'idle' };
    u.aimedAt = null;
}

function kill(b: Battle, u: Unit) {
    u.hp = 0;
    u.path = [];
    u.goal = null;
    u.action = { kind: 'down', start: b.tick };
    note(b, u, { kind: 'down', unitId: u.id }, '倒地（測試版不造成永久傷亡）');
}

function resolveShot(b: Battle, u: Unit, action: Extract<Action, { kind: 'fire' }>) {
    action.resolved = true;
    const target = b.units.find(o => o.id === action.targetId);
    const weapon = WEAPONS[u.loadout[action.slot]];
    // The weapon, target and sight line are re-checked at the moment of the shot.
    if (u.active !== action.slot || !target || target.hp <= 0 || !lineOfSight(u.tile, target.tile) || dist(u.pos, target.pos) > weapon.maxRange || u.ammo[action.slot] <= 0) return;
    u.ammo[action.slot]--;
    u.stats.shots++;
    u.cooldownUntil = action.start + weapon.interval;
    const covered = protectedByCover(target.tile, u.tile);
    const engaged = meleeThreats(b, u, ENGAGE_RANGE).length > 0;
    const d = dist(u.pos, target.pos);
    const withCover = hitChance(u.accuracy, weapon, d, covered, engaged);
    const withoutCover = hitChance(u.accuracy, weapon, d, false, engaged);
    const r = roll(b);
    const outcome = r < withCover ? 'hit' : covered && r < withoutCover ? 'cover' : 'miss';
    const amount = outcome === 'hit' ? Math.min(target.hp, damageFor(weapon, target.armor)) : 0;
    b.events.push({ id: b.nextEventId++, tick: b.tick, kind: 'shot', sourceId: u.id, targetId: target.id, weapon: u.loadout[action.slot], outcome, amount, from: { ...u.tile }, to: { ...target.tile } });
    if (!amount) return;
    target.hp -= amount;
    target.lastHitTick = b.tick;
    u.stats.hits++;
    u.stats.damage += amount;
    if (target.hp <= 0) kill(b, target);
}

function advanceMove(b: Battle, u: Unit) {
    // Per-unit: heavy armour slows movement only. Cover entry, aiming, reloading
    // and weapon swaps keep their own fixed timings.
    const speed = u.speed / TICKS_PER_SECOND;
    if (u.step >= 1) {
        const next = u.path.shift();
        if (!next) { arrive(u); return; }
        if (occupiedBy(b, u, next) && !(u.goal && same(u.goal, next))) { u.path = []; arrive(u); return; } // blocked: re-plan next tick
        u.prev = { ...u.tile };
        u.tile = { ...next };
        u.step = 0;
    }
    u.step = Math.min(1, u.step + speed);
    u.walked += speed;
    u.pos = { x: u.prev.x + (u.tile.x - u.prev.x) * u.step, y: u.prev.y + (u.tile.y - u.prev.y) * u.step };
    if (u.step >= 1 && !u.path.length) arrive(u);
}

function arrive(u: Unit) {
    u.pos = { ...u.tile };
    u.prev = { ...u.tile };
    u.step = 1;
    u.goal = null;
    u.action = { kind: 'idle' };
    u.aimedAt = null; // moving always requires a fresh aim
}

function completeAction(b: Battle, u: Unit) {
    const a = u.action;
    if (a.kind === 'swap') {
        u.active = a.to; // the weapon, damage source and equipment slot change only now
        note(b, u, { kind: 'swap', unitId: u.id, phase: 'complete', to: a.to, weapon: u.loadout[a.to], reason: a.reason }, a.to === 'secondary' ? '完成拔出雷射手槍（低傷害自衛）' : '完成換回雷射步槍');
    } else if (a.kind === 'reload') {
        u.ammo[a.slot] = WEAPONS[u.loadout[a.slot]].magazine;
        note(b, u, { kind: 'reload', unitId: u.id, slot: a.slot, weapon: u.loadout[a.slot] }, `完成${WEAPONS[u.loadout[a.slot]].name}換彈`);
    } else if (a.kind === 'enter-cover') u.posture = 'covered';
    else if (a.kind === 'retract') u.posture = 'covered';
    else if (a.kind === 'aim') {
        u.aimedAt = a.targetId;
        if (a.peek) u.posture = 'peeked';
    }
    u.action = { kind: 'idle' };
}

function decide(b: Battle, u: Unit) {
    const foes = opponents(b, u);
    if (!foes.length) return;
    // Weapon swaps: melee contact → pistol; clear of contact (with a buffer) → rifle.
    const contact = meleeThreats(b, u, ENGAGE_RANGE).length > 0;
    if (contact && u.active === 'primary') return startSwap(b, u, 'secondary', 'engaged');
    if (!contact && u.active === 'secondary' && meleeThreats(b, u, DISENGAGE_RANGE).length === 0) return startSwap(b, u, 'primary', 'disengaged');

    const weapon = weaponOf(u);
    if (u.ammo[u.active] <= 0) {
        if (u.posture === 'peeked') return begin(b, u, { kind: 'retract', start: b.tick, end: b.tick + RETRACT_TICKS });
        return begin(b, u, { kind: 'reload', start: b.tick, end: b.tick + weapon.reload, slot: u.active });
    }

    // Hold orders walk to a firing position before opening fire.
    if (u.order === 'hold' && !u.positioned && !contact) {
        u.positioned = true;
        const spot = choosePosition(b, u);
        if (spot && spot.path.length) return startMove(u, spot);
    }
    if (u.order === 'assault' && u.active === 'primary' && !contact) {
        const route = assaultPath(b, u);
        if (route) return startMove(u, route);
    }

    const target = pickTarget(b, u);
    if (target) {
        u.noTargetSince = null;
        if (u.posture === 'standing' && u.order === 'hold' && protectedByCover(u.tile, target.tile)) return begin(b, u, { kind: 'enter-cover', start: b.tick, end: b.tick + ENTER_COVER_TICKS });
        if (b.tick < u.cooldownUntil) return;
        if (u.aimedAt !== target.id) return begin(b, u, { kind: 'aim', start: b.tick, end: b.tick + weapon.aim, targetId: target.id, peek: u.posture === 'covered' });
        return begin(b, u, { kind: 'fire', start: b.tick, end: b.tick + FIRE_ACTION_TICKS, shotAt: b.tick + FIRE_WINDUP_TICKS, targetId: target.id, slot: u.active, resolved: false });
    }

    if (u.posture === 'peeked') return begin(b, u, { kind: 'retract', start: b.tick, end: b.tick + RETRACT_TICKS });
    if (u.order === 'hold' && u.active === 'primary') {
        u.noTargetSince ??= b.tick;
        if (b.tick - u.noTargetSince >= REPOSITION_AFTER) {
            u.noTargetSince = b.tick;
            const spot = choosePosition(b, u);
            if (spot && spot.path.length) startMove(u, spot);
        }
    }
}

export function stepBattle(input: Battle): Battle {
    if (input.status !== 'running') return input;
    const b = clone(input);
    b.tick++;
    for (const u of b.units) {
        if (u.hp <= 0) continue;
        const a = u.action;
        if (a.kind === 'fire' && !a.resolved && b.tick >= a.shotAt) resolveShot(b, u, a);
        if (u.hp <= 0) continue;
        // Melee contact interrupts rifle work; a forced swap cancels a rifle reload without refilling.
        if (u.active === 'primary' && (a.kind === 'reload' || a.kind === 'aim' || (a.kind === 'fire' && !a.resolved)) && meleeThreats(b, u, ENGAGE_RANGE).length) cancelAction(b, u, '遭貼身');
        const current = u.action;
        if (current.kind === 'move') advanceMove(b, u);
        else if ('end' in current && b.tick >= current.end) completeAction(b, u);
        if (u.action.kind === 'idle') decide(b, u);
    }
    b.events = b.events.slice(-EVENT_CAP);
    const crewAlive = b.units.some(u => u.side === 'crew' && u.hp > 0);
    const enemyAlive = b.units.some(u => u.side === 'enemy' && u.hp > 0);
    if (!enemyAlive) { b.status = 'victory'; record(b, '敵軍全數倒地 · 勝利（測試版不發放獎勵）'); }
    else if (!crewAlive) { b.status = 'defeat'; record(b, '我方全數倒地 · 失敗（測試版不扣資源）'); }
    else if (b.tick >= BATTLE_TIME_LIMIT) { b.status = 'timeout'; record(b, '超出時限 · 結束'); }
    return b;
}

/** Runs to completion (or `maxTicks`); used by tests and quick checks. */
export function runBattle(battle: Battle, maxTicks = BATTLE_TIME_LIMIT + 1) {
    let b = battle;
    for (let i = 0; i < maxTicks && b.status === 'running'; i++) b = stepBattle(b);
    return b;
}
