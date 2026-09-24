// Independent, deterministic prototype. No GameContext resources or cloud saves.
export type WeaponId = 'lasgun' | 'shotgun' | 'longlas' | 'flamer';
export type Role = 'armsman' | 'medic' | 'scout' | 'engineer';
export type Order = 'nearest' | 'support' | 'weakest';
// Terrain, line of sight and cover now live in shared so the server can replay a
// battle on the same ground. Re-exported here so existing callers are unchanged
// and there is still only one description of the map.
export { WIDTH, HEIGHT, WALLS, COVER, distance, lineOfSight, protectedByCover } from '../../shared/battle/terrain';
export type { Point } from '../../shared/battle/terrain';
import type { Point } from '../../shared/battle/terrain';
import { COVER, HEIGHT, WALLS, WIDTH, distance, lineOfSight, protectedByCover, samePoint } from '../../shared/battle/terrain';
export type CombatWeaponId = WeaponId | 'laspistol';
export const SIDEARM = { name: '雷射手槍', damage: 5, interval: 12, range: 2.5, penetration: 0, color: '#ffad87' };
export const activeWeapon = (actor: Pick<Actor, 'weapon' | 'sidearm'>): CombatWeaponId => actor.sidearm ? 'laspistol' : actor.weapon;
export const WEAPONS: Record<WeaponId, { name: string; damage: number; interval: number; range: number; penetration: number; color: string; description: string }> = {
    lasgun: { name: '星界軍雷射步槍', damage: 12, interval: 8, range: 12, penetration: 0, color: '#f98874', description: '射程 12 格 · 傷害 12 / 0.8 秒' },
    shotgun: { name: '戰鬥霰彈槍', damage: 24, interval: 14, range: 5, penetration: 0, color: '#f2ce87', description: '射程 5 格 · 傷害 24 / 1.4 秒' },
    longlas: { name: '精準雷射槍', damage: 36, interval: 24, range: 15, penetration: 10, color: '#91dcef', description: '射程 15 格、穿甲 10 · 傷害 36 / 2.4 秒' },
    flamer: { name: '人類型火焰器', damage: 8, interval: 5, range: 4, penetration: 0, color: '#ffb35c', description: '射程 4 格、扇形清群 · 噴射 3 秒、冷卻 2 秒' },
};
export const CREW: { id: Role; name: string; job: string; allowed: WeaponId[]; color: string; skill: string }[] = [
    { id: 'armsman', name: '馬雷克', job: '星界軍步槍手', allowed: ['lasgun', 'shotgun', 'flamer'], color: '#88926a', skill: '掩體火力 · 護甲 30、生命 180' },
    { id: 'medic', name: '伊蓮', job: '星界軍醫護兵', allowed: ['lasgun'], color: '#88926a', skill: '每 8 秒為附近傷員恢復 24 生命' },
    { id: 'scout', name: '凱爾', job: '星界軍精準射手', allowed: ['lasgun', 'longlas'], color: '#88926a', skill: '精準訓練 · 命中 90%' },
    { id: 'engineer', name: '托林', job: '星界軍工兵', allowed: ['lasgun', 'shotgun'], color: '#88926a', skill: '敵軍清除後，信標修復速度加倍' },
];
export const INVENTORY: { id: string; weapon: WeaponId }[] = [
    { id: 'las-01', weapon: 'lasgun' }, { id: 'las-02', weapon: 'lasgun' }, { id: 'las-03', weapon: 'lasgun' },
    { id: 'shot-01', weapon: 'shotgun' }, { id: 'precision-01', weapon: 'longlas' }, { id: 'flame-01', weapon: 'flamer' },
];
export interface Assignment { role: Role; equipment: string; lane: number; order: Order }
export const DEFAULT_SQUAD: Assignment[] = [
    { role: 'armsman', equipment: 'las-03', lane: 2, order: 'nearest' },
    { role: 'medic', equipment: 'las-01', lane: 4, order: 'weakest' },
    { role: 'scout', equipment: 'precision-01', lane: 6, order: 'support' },
    { role: 'engineer', equipment: 'las-02', lane: 8, order: 'nearest' },
];
export const BEACON = { x: 14, y: 5 };
const same = samePoint;
const blocked = (p: Point) => p.x < 0 || p.x >= WIDTH || p.y < 0 || p.y >= HEIGHT || [...WALLS, ...COVER].some(w => same(w, p));
export type TacticState = 'positioning' | 'covered' | 'firing' | 'falling-back' | 'overwatch' | 'assault' | 'objective';
export function compatible(role: Role, equipment: string) {
    const item = INVENTORY.find(i => i.id === equipment);
    return !!item && !!CREW.find(c => c.id === role)?.allowed.includes(item.weapon);
}
export function validateSquad(squad: Assignment[]): string {
    if (squad.length !== 4 || new Set(squad.map(a => a.role)).size !== 4) return '需要四名不同的伙伴。';
    if (squad.some(a => !compatible(a.role, a.equipment))) return '裝備不符合角色操作資格。';
    if (new Set(squad.map(a => a.equipment)).size !== squad.length) return '同一件武器不能同時裝備兩人。';
    if (squad.some(a => ![1, 2, 3, 4, 5, 6, 7, 8].includes(a.lane)) || new Set(squad.map(a => a.lane)).size !== squad.length) return '部署位置必須不同，且位於 1–8 號通道。';
    if (squad.some(a => !['nearest', 'support', 'weakest'].includes(a.order))) return '無效交戰指令。';
    return '';
}
export interface Actor extends Point {
    id: string; name: string; side: 'crew' | 'enemy'; role: Role | 'raider' | 'gunner' | 'officer';
    weapon: WeaponId; hp: number; maxHp: number; armor: number; accuracy: number;
    cooldown: number; move: number; skill: number; shots: number; facing: number; order: Order;
    damage: number; healing: number; received: number;
    tactic: TacticState;
    think: number;
    destination?: Point;
    sidearm?: boolean;
    sidearmFired?: boolean;
    sidearmDamage?: number;
}
export interface Effect { id: number; kind: 'shot' | 'flame' | 'heal' | 'miss'; from: Point; to: Point; color: string; ttl: number; amount: number; born: number; sourceId: string; targetId: string; weapon: CombatWeaponId; melee: boolean }
export interface Battle {
    tick: number; random: number; status: 'running' | 'victory' | 'defeat' | 'retreated';
    actors: Actor[]; effects: Effect[]; log: string[]; wave: number; beacon: number; event: number;
}
function roll(state: Battle) { state.random = (Math.imul(state.random, 1664525) + 1013904223) >>> 0; return state.random / 4294967296; }
function record(state: Battle, text: string) { state.log = [`${(state.tick / 10).toFixed(1)}s · ${text}`, ...state.log].slice(0, 60); }
function spawnWave(state: Battle) {
    state.wave++;
    const roles: ('raider' | 'gunner' | 'officer')[] = state.wave === 1 ? ['raider', 'raider', 'gunner'] : state.wave === 2 ? ['raider', 'gunner', 'officer'] : ['gunner', 'raider', 'officer'];
    roles.forEach((role, index) => {
        const occupied = state.actors.filter(a => a.hp > 0);
        let pos = { x: 14, y: [1, 5, 8][index] };
        if (occupied.some(a => same(a, pos))) {
            const options = Array.from({ length: 30 }, (_, i) => ({ x: 13 + i % 3, y: Math.floor(i / 3) }));
            pos = options.find(p => !blocked(p) && !occupied.some(a => same(a, p))) || pos;
        }
        const hp = role === 'raider' ? 60 : role === 'officer' ? 85 : 70;
        state.actors.push({ id: `enemy-${state.wave}-${index}`, name: role === 'raider' ? '異教狂徒' : role === 'officer' ? '邪教煽動者' : '異教槍手', side: 'enemy', role, weapon: 'lasgun', ...pos, hp, maxHp: hp, armor: role === 'officer' ? 25 : 5, accuracy: .6, cooldown: 12, move: 0, skill: 0, shots: 0, facing: Math.PI, order: 'nearest', damage: 0, healing: 0, received: 0, tactic: 'positioning', think: 0 });
    });
    record(state, `第 ${state.wave}/3 波混沌教徒進場${state.wave > 1 ? ' · 優先處理提供命中支援的指揮兵' : ''}`);
}
export function createBattle(squad: Assignment[], seed = 40126): Battle {
    const error = validateSquad(squad); if (error) throw new Error(error);
    const actors: Actor[] = squad.map(a => {
        const member = CREW.find(c => c.id === a.role)!;
        const hp = a.role === 'armsman' ? 180 : 120;
        return { id: a.role, name: member.name, side: 'crew', role: a.role, weapon: INVENTORY.find(i => i.id === a.equipment)!.weapon, x: 1, y: a.lane, hp, maxHp: hp, armor: a.role === 'armsman' ? 30 : 10, accuracy: a.role === 'scout' ? .9 : .8, cooldown: 0, move: 0, skill: 0, shots: 0, facing: 0, order: a.order, damage: 0, healing: 0, received: 0, tactic: 'positioning', think: 0 };
    });
    const state: Battle = { tick: 0, random: seed >>> 0, status: 'running', actors, effects: [], log: [], wave: 0, beacon: 0, event: 0 };
    spawnWave(state); return state;
}
function moveToward(actor: Actor, target: Point, range: number, state: Battle) {
    if (actor.move > 0) return;
    const occupied = state.actors.filter(a => a.hp > 0 && a.id !== actor.id);
    const queue: { p: Point; first: Point | null }[] = [{ p: actor, first: null }];
    const visited = new Set([`${actor.x},${actor.y}`]);
    while (queue.length) {
        const node = queue.shift()!;
        if (node.first && distance(node.p, target) <= range && lineOfSight(node.p, target)) {
            actor.facing = Math.atan2(node.first.y - actor.y, node.first.x - actor.x);
            actor.x = node.first.x; actor.y = node.first.y; actor.move = actor.role === 'raider' ? 10 : 8;
            return;
        }
        for (const delta of [{ x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }]) {
            const p = { x: node.p.x + delta.x, y: node.p.y + delta.y }; const key = `${p.x},${p.y}`;
            if (visited.has(key) || blocked(p) || occupied.some(a => same(a, p))) continue;
            visited.add(key); queue.push({ p, first: node.first || p });
        }
    }
}
function effect(state: Battle, kind: Effect['kind'], from: Actor, to: Actor, color: string, amount = 0) {
    state.effects.push({ id: ++state.event, kind, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, color, amount, ttl: 10, born: state.tick, sourceId: from.id, targetId: to.id, weapon: activeWeapon(from), melee: from.role === 'raider' });
}
// Low cover is a physical obstacle. Its protection is directional: the obstacle
// must lie immediately in front of the defender, toward the incoming shot.
const weaponRange = (actor: Actor) => actor.role === 'raider' ? 1.5 : actor.side === 'enemy' ? 11 : WEAPONS[actor.weapon].range;
function reachable(actor: Actor, state: Battle) {
    const occupied = new Set(state.actors.filter(a => a.hp > 0 && a.id !== actor.id).map(a => `${a.x},${a.y}`));
    const visited = new Set([`${actor.x},${actor.y}`]);
    const nodes = [{ x: actor.x, y: actor.y, cost: 0 }];
    for (let index = 0; index < nodes.length; index++) {
        const p = nodes[index]; if (p.cost >= 12) continue;
        for (const [dx, dy] of [[1, 0], [0, -1], [0, 1], [-1, 0]]) {
            const next = { x: p.x + dx, y: p.y + dy, cost: p.cost + 1 }, key = `${next.x},${next.y}`;
            if (blocked(next) || occupied.has(key) || visited.has(key)) continue;
            visited.add(key); nodes.push(next);
        }
    }
    return nodes;
}
export function chooseFirePosition(actor: Actor, target: Actor, state: Battle, retreating = false): Point {
    const range = weaponRange(actor), short = range <= 5;
    const preferred = short ? range - .5 : range - 1.5;
    const enemies = state.actors.filter(a => a.side !== actor.side && a.hp > 0);
    const reserved = state.actors.filter(a => a.id !== actor.id && a.hp > 0 && a.side === actor.side && a.destination).map(a => a.destination!);
    const currentCanShoot = distance(actor, target) <= range && lineOfSight(actor, target);
    let best: Point = actor, bestScore = -Infinity;
    for (const p of reachable(actor, state)) {
        if (reserved.some(r => same(r, p)) && !same(actor, p)) continue;
        const d = distance(p, target), los = lineOfSight(p, target), cover = protectedByCover(p, target);
        const enemyDistance = Math.min(...enemies.map(e => distance(p, e)));
        const meleeDistance = Math.min(...enemies.filter(e => e.role === 'raider').map(e => distance(p, e)));
        const canShoot = d <= range && los;
        // A firing rifle does not cross open ground to seek a different target.
        if (currentCanShoot && !retreating && p.cost > 3) continue;
        // Close-range specialists screen the line, not sprint alone into gunfire.
        const advance = actor.side === 'crew' ? Math.max(0, p.x - actor.x) : Math.max(0, actor.x - p.x);
        let score = (canShoot ? 42 : 0) + (cover ? 30 : 0) - Math.abs(d - preferred) * 2 - p.cost * 2;
        if (!los) score -= 10;
        if (same(p, actor)) score += 9; // Hysteresis prevents constant cover swapping.
        if (enemyDistance < (short ? 1.7 : 3)) score -= 45;
        const meleeBuffer = short ? 1.5 : 3;
        if (meleeDistance < meleeBuffer) score -= (meleeBuffer - meleeDistance) * 28;
        if (retreating) score += Math.min(enemyDistance, 5) * 12;
        if (short && !currentCanShoot) score -= advance * 3;
        if (actor.role === 'medic') {
            const allies = state.actors.filter(a => a.side === actor.side && a.id !== actor.id && a.hp > 0);
            if (allies.length && Math.min(...allies.map(a => distance(a, p))) > 4) score -= 20;
        }
        if (score > bestScore) { bestScore = score; best = p; }
    }
    return { x: best.x, y: best.y };
}
function rangedPosition(actor: Actor, target: Actor, state: Battle): boolean {
    if (actor.move > 0) return true; // Finish footwork before firing.
    const threats = state.actors.filter(a => a.side !== actor.side && a.hp > 0);
    const danger = threats.some(t => t.role === 'raider' && lineOfSight(actor, t) && distance(actor, t) < (weaponRange(actor) <= 5 ? 1.5 : 2.5));
    const covered = protectedByCover(actor, target);
    const canShoot = distance(actor, target) <= weaponRange(actor) && lineOfSight(actor, target);
    if (canShoot && !danger && (actor.cooldown === 0 || weaponRange(actor) <= 5)) {
        actor.destination = undefined; actor.tactic = covered ? 'covered' : 'firing'; return false;
    }
    if (covered && canShoot && !danger) {
        actor.destination = undefined; actor.tactic = 'covered'; return false;
    }
    if (danger || !actor.think || !actor.destination) {
        actor.destination = chooseFirePosition(actor, target, state, danger); actor.think = 16;
    }
    const destination = actor.destination!;
    if (!same(actor, destination)) {
        actor.tactic = danger ? 'falling-back' : 'positioning';
        moveToward(actor, destination, 0, state);
        if (actor.move > 0) return true;
        actor.destination = undefined; // Another actor may have blocked the path.
    }
    actor.tactic = covered ? 'covered' : canShoot ? 'firing' : 'overwatch';
    return !canShoot;
}
function hit(state: Battle, actor: Actor, target: Actor, damage: number, penetration: number, flame = false) {
    const cover = !flame && protectedByCover(target, actor) ? .3 : 0;
    const officer = actor.side === 'enemy' && state.actors.some(a => a.hp > 0 && a.role === 'officer' && distance(a, actor) <= 4) ? .1 : 0;
    const melee = actor.role === 'raider';
    const success = flame || roll(state) < Math.min(.95, Math.max(.2, actor.accuracy + officer - (melee ? 0 : cover)));
    const amount = success ? Math.min(target.hp, Math.max(1, Math.round(damage * 100 / (100 + Math.max(0, target.armor - penetration))))) : 0;
    target.hp -= amount; target.received += amount; actor.damage += amount;
    if (actor.sidearm) actor.sidearmDamage = (actor.sidearmDamage || 0) + amount;
    effect(state, flame ? 'flame' : success ? 'shot' : 'miss', actor, target, actor.sidearm ? SIDEARM.color : actor.side === 'crew' ? WEAPONS[actor.weapon].color : '#ed7881', amount);
    if (target.hp <= 0) record(state, `${target.name}${target.side === 'crew' ? '倒地，本場無法作戰' : '已被擊退'}`);
}
export function stepBattle(input: Battle): Battle {
    if (input.status !== 'running') return input;
    const state: Battle = { ...input, tick: input.tick + 1, actors: input.actors.map(a => ({ ...a })), effects: input.effects.filter(e => e.ttl > 1).map(e => ({ ...e, ttl: e.ttl - 1 })), log: [...input.log] };
    if (!state.actors.some(a => a.side === 'crew' && a.hp > 0)) { state.status = 'defeat'; record(state, '緊急回收 · 原有伙伴與裝備不會被刪除'); return state; }
    const enemies = state.actors.filter(a => a.side === 'enemy' && a.hp > 0);
    if (!enemies.length && state.wave < 3) spawnWave(state);
    for (const actor of state.actors) {
        if (actor.hp <= 0) continue;
        actor.cooldown = Math.max(0, actor.cooldown - 1); actor.move = Math.max(0, actor.move - 1); actor.skill = Math.max(0, actor.skill - 1); actor.think = Math.max(0, actor.think - 1);
        if (actor.role === 'medic' && !actor.skill) {
            const patient = state.actors.filter(a => a.side === 'crew' && a.hp > 0 && a.hp <= a.maxHp - 24 && distance(actor, a) <= 4 && lineOfSight(actor, a)).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
            if (patient) { patient.hp += 24; actor.healing += 24; actor.skill = 80; effect(state, 'heal', actor, patient, '#88e0b1', 24); record(state, `${actor.name}為${patient.name}恢復 24 生命`); }
        }
        const targets = state.actors.filter(a => a.side !== actor.side && a.hp > 0).sort((a, b) => {
            if (actor.order === 'support' && (a.role === 'officer') !== (b.role === 'officer')) return a.role === 'officer' ? -1 : 1;
            if (actor.order === 'weakest' && a.hp !== b.hp) return a.hp - b.hp;
            return distance(actor, a) - distance(actor, b);
        });
        if (!targets.length) {
            actor.sidearm = false;
            if (actor.side === 'crew') {
                actor.tactic = 'objective';
                if (distance(actor, BEACON) <= 1.5) state.beacon = Math.min(100, state.beacon + (actor.role === 'engineer' ? .8 : .4));
                else moveToward(actor, BEACON, 1.5, state);
            }
            continue;
        }
        // Sidearms are defensive equipment, never a reason to chase into melee.
        if (actor.side === 'crew') {
            const nearest = [...targets].filter(t => lineOfSight(actor, t)).sort((a, b) => distance(actor, a) - distance(actor, b))[0];
            const engaged = !!nearest && distance(actor, nearest) <= (actor.sidearm ? SIDEARM.range : 1.5);
            if (engaged !== !!actor.sidearm) {
                actor.sidearm = engaged;
                actor.sidearmFired = false;
                actor.cooldown = Math.max(actor.cooldown, engaged ? 3 : 4);
                actor.destination = undefined;
                record(state, `${actor.name}${engaged ? '被近身：切換雷射手槍（低傷害）' : '脫離接觸：恢復主武器'}`);
            }
            if (actor.sidearm && nearest) {
                actor.tactic = 'falling-back';
                actor.facing = Math.atan2(nearest.y - actor.y, nearest.x - actor.x);
                if (actor.move > 0) continue;
                if (!actor.cooldown) {
                    hit(state, actor, nearest, SIDEARM.damage, 0);
                    actor.sidearmFired = true;
                    actor.cooldown = SIDEARM.interval;
                } else if (actor.sidearmFired && actor.cooldown < SIDEARM.interval - 3) {
                    // One safe backstep only; never route through a closer enemy.
                    const threats = targets.filter(t => lineOfSight(actor, t));
                    const current = Math.min(...threats.map(t => distance(actor, t)));
                    const next = reachable(actor, state).filter(p => p.cost === 1 && Math.min(...threats.map(t => distance(p, t))) > current)
                        .sort((a, b) => distance(b, nearest) - distance(a, nearest))[0];
                    if (next) moveToward(actor, next, 0, state);
                }
                continue;
            }
        }
        const weapon = WEAPONS[actor.weapon]; const range = weaponRange(actor);
        // Priority applies to shootable targets, not an order to chase an officer
        // through enemy lines when other threats can already be engaged.
        const target = targets.find(t => distance(actor, t) <= range && lineOfSight(actor, t)) || targets[0];
        actor.facing = Math.atan2(target.y - actor.y, target.x - actor.x);
        if (actor.role === 'raider') {
            actor.tactic = 'assault';
            if (distance(actor, target) > range || !lineOfSight(actor, target)) { moveToward(actor, target, range, state); continue; }
        } else if (rangedPosition(actor, target, state)) continue;
        if (actor.cooldown) continue;
        actor.cooldown = actor.role === 'raider' ? 12 : actor.side === 'enemy' ? 16 : weapon.interval;
        if (actor.weapon === 'flamer' && actor.side === 'crew') {
            const angle = actor.facing;
            targets.filter(t => distance(actor, t) <= range && lineOfSight(actor, t) && Math.cos(Math.atan2(t.y - actor.y, t.x - actor.x) - angle) >= Math.cos(Math.PI / 5)).forEach(t => hit(state, actor, t, weapon.damage, 0, true));
            actor.shots++; if (actor.shots % 6 === 0) actor.cooldown = 25;
        } else hit(state, actor, target, actor.side === 'enemy' ? actor.role === 'raider' ? 14 : 9 : weapon.damage, actor.side === 'enemy' ? 0 : weapon.penetration);
    }
    if (state.beacon >= 100) { state.status = 'victory'; record(state, '撤離信標恢復 · 碼頭重新連線'); }
    else if (state.tick >= 1800) { state.status = 'defeat'; record(state, '超出行動時限 · 緊急回收'); }
    return state;
}
export function retreat(input: Battle): Battle {
    if (input.status !== 'running') return input;
    return { ...input, status: 'retreated', log: [`${(input.tick / 10).toFixed(1)}s · 原型安全撤離 · 無資源獎懲`, ...input.log].slice(0, 60) };
}
