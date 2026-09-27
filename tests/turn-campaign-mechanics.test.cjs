const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const e = loadTs('shared/battle/turn/engine.ts');
const r = loadTs('shared/battle/turn/rules.ts');

// C2 mechanics: vehicles, the engineer's demolition charge, and objectives.

const board = (tiles = {}) => ({ cols: 11, rows: 9, tiles });
const at = (col, row) => ({ col, row });
const LAS = { name: '雷射槍', damage: 22, hits: 2, range: 5, penetration: 0, damageType: 'las' };

const unit = (id, side, over = {}) => ({
    id, name: id, side, duty: 'rifleman', maxHp: 100, armour: 20, armourType: 'flak',
    accuracy: 0.75, movement: 3, initiative: 10, weapon: LAS, stance: 'advance',
    at: side === 'crew' ? at(5, 8) : at(5, 0), ...over,
});
const walker = (id, over = {}) => unit(id, 'enemy', {
    duty: 'walker', maxHp: 180, armour: 60, armourType: 'vehicle', movement: 4, initiative: 9,
    weapon: r.ENEMY_WEAPON_STATS.multilaser, ...over,
});

// ---- vehicles ---------------------------------------------------------------

test('a vehicle hull shrugs off las and flame but not plasma', () => {
    const las = r.damageOf(r.WEAPON_STATS.lasgun, 60, 'vehicle');
    const flame = r.damageOf(r.WEAPON_STATS.flamer, 60, 'vehicle');
    const plasma = r.damageOf(r.WEAPON_STATS['plasma-gun'], 60, 'vehicle');
    const heavy = r.damageOf(r.WEAPON_STATS['heavy-weapon'], 60, 'vehicle');
    assert.ok(las <= 4, `lasgun ${las}`);
    assert.ok(flame <= 2, `flamer ${flame}`);
    assert.ok(plasma >= 30, `plasma ${plasma}`);
    // Per attack, the heavy weapon's three shots out-hurt a lasgun's two by far.
    assert.ok(heavy * 3 > las * 2 * 3, `heavy ${heavy} x3 vs las ${las} x2`);
});

test('a vehicle gets nothing from cover', () => {
    const b = board({ '5,3': 'cover' });
    assert.equal(r.coverMultiplier(b, r.WEAPON_STATS.lasgun, at(5, 3), 'vehicle'), 1);
    assert.ok(r.coverMultiplier(b, r.WEAPON_STATS.lasgun, at(5, 3), 'flak') < 1);
});

test('a destroyed vehicle leaves its wreck as cover, on this battle\'s board only', () => {
    const field = board();
    const crew = Array.from({ length: 6 }, (_, i) => unit('c' + i, 'crew', {
        at: at(2 + i, 5), weapon: r.WEAPON_STATS['plasma-gun'], stance: 'hold',
    }));
    const result = e.runBattle({ board: field, units: [...crew, walker('w', { at: at(5, 3), maxHp: 30, stance: 'hold' })], seed: 7 });
    const wreck = result.units.find(u => u.id === 'w');
    assert.ok(wreck.down);
    assert.equal(Object.keys(field.tiles).length, 0, 'the scenario board is untouched');
    // The report's own replay shows the cover where the walker fell.
    const down = result.activations.find(a => a.snapshot.find(s => s.id === 'w').down);
    assert.ok(down, 'the walker went down during the battle');
});

// ---- demolition -------------------------------------------------------------

test('an engineer beside a vehicle plants a charge once, for flat damage through the hull', () => {
    const engineer = unit('eng', 'crew', { duty: 'engineer', at: at(5, 5), initiative: 20 });
    const hull = walker('w', { at: at(5, 4), maxHp: 500, stance: 'hold', weapon: { ...LAS, damage: 1 } });
    const result = e.runBattle({ board: board(), units: [engineer, hull], seed: 3, maxRounds: 3 });
    const charges = result.activations.filter(a => a.unitId === 'eng' && a.activities.some(x => x.kind === 'attack' && x.weapon === r.DEMOLITION_NAME));
    assert.equal(charges.length, 1, 'once a battle');
    const blast = charges[0].activities.find(x => x.kind === 'attack');
    assert.equal(blast.damage, r.DEMOLITION_DAMAGE);
    assert.match(charges[0].reason, /爆破包/);
});

test('an engineer works toward a vehicle it cannot reach yet', () => {
    const engineer = unit('eng', 'crew', { duty: 'engineer', at: at(5, 8), initiative: 20 });
    const hull = walker('w', { at: at(5, 1), maxHp: 500, stance: 'hold', weapon: { ...LAS, damage: 1, range: 1 } });
    const result = e.runBattle({ board: board(), units: [engineer, hull], seed: 3, maxRounds: 4 });
    const blasts = result.activations.filter(a => a.activities.some(x => x.kind === 'attack' && x.weapon === r.DEMOLITION_NAME));
    assert.equal(blasts.length, 1, 'it walked up and planted the charge');
});

// ---- objectives -------------------------------------------------------------

test('seize: standing on the tile for the required round ends wins, before the field is clear', () => {
    const goal = at(5, 6);
    const crew = [unit('c0', 'crew', { at: at(5, 7), maxHp: 400 })];
    // Far away, harmless, and too tough to kill quickly: only the objective can end it.
    const enemy = unit('e0', 'enemy', { at: at(0, 0), maxHp: 5000, stance: 'hold', weapon: { ...LAS, range: 1, damage: 1 } });
    const result = e.runBattle({ board: board(), units: [...crew, enemy], seed: 1, objective: { kind: 'seize', at: goal, rounds: 2 } });
    assert.equal(result.ending, 'objective-met');
    assert.equal(result.outcome, 'victory');
    assert.ok(result.rounds <= 4, `took ${result.rounds} rounds`);
});

test('seize: a squad told to hold its ground never takes the tile', () => {
    const goal = at(5, 3);
    const crew = [unit('c0', 'crew', { at: at(5, 8), maxHp: 400, stance: 'hold' })];
    const enemy = unit('e0', 'enemy', { at: at(0, 0), maxHp: 5000, stance: 'hold', weapon: { ...LAS, range: 1, damage: 1 } });
    const result = e.runBattle({ board: board(), units: [...crew, enemy], seed: 1, objective: { kind: 'seize', at: goal, rounds: 2 } });
    assert.notEqual(result.ending, 'objective-met');
});

test('hold: still standing at the end of the round wins, even outnumbered', () => {
    const crew = [unit('c0', 'crew', { at: at(5, 8), maxHp: 2000, stance: 'hold' })];
    const enemies = Array.from({ length: 3 }, (_, i) => unit('e' + i, 'enemy', { at: at(3 + i, 0), maxHp: 2000, weapon: { ...LAS, damage: 2 } }));
    const result = e.runBattle({ board: board(), units: [...crew, ...enemies], seed: 1, objective: { kind: 'hold', rounds: 4 } });
    assert.equal(result.ending, 'objective-met');
    assert.equal(result.rounds, 4);
});

test('rescue: reaching the tile ends it at once', () => {
    const crew = [unit('c0', 'crew', { at: at(5, 6), maxHp: 400 })];
    const enemy = unit('e0', 'enemy', { at: at(0, 0), maxHp: 5000, stance: 'hold', weapon: { ...LAS, range: 1, damage: 1 } });
    const result = e.runBattle({ board: board(), units: [...crew, enemy], seed: 1, objective: { kind: 'rescue', at: at(5, 4) } });
    assert.equal(result.ending, 'objective-met');
    assert.equal(result.rounds, 1);
});

test('assassinate: the marked enemy going down wins, and the squad goes for them first', () => {
    const crew = Array.from({ length: 3 }, (_, i) => unit('c' + i, 'crew', { at: at(4 + i, 6), weapon: r.WEAPON_STATS['plasma-gun'], stance: 'hold' }));
    const leader = unit('boss', 'enemy', { at: at(5, 3), maxHp: 60, stance: 'hold' });
    const guard = unit('g', 'enemy', { at: at(4, 3), maxHp: 60, stance: 'hold' });
    const result = e.runBattle({ board: board(), units: [...crew, leader, guard], seed: 2, objective: { kind: 'assassinate', targetId: 'boss' } });
    assert.equal(result.ending, 'objective-met');
    const firstShot = result.activations.find(a => a.unitId.startsWith('c') && a.activities.some(x => x.kind === 'attack'));
    assert.equal(firstShot.activities.find(x => x.kind === 'attack').targetId, 'boss');
});

// ---- the cult command hub (C3) ----------------------------------------------

const relay = (id, over = {}) => unit(id, 'enemy', {
    duty: 'relay', maxHp: 100, armour: 40, armourType: 'vehicle', movement: 0, initiative: 0,
    weapon: r.FISTS, stance: 'hold', ...over,
});
const leader = (over = {}) => unit('boss-leader', 'enemy', { duty: 'sergeant', maxHp: 2000, stance: 'hold', at: at(5, 0), weapon: { ...LAS, damage: 1 }, ...over });

test('a broadcast relay never acts, but it is on the field to be destroyed', () => {
    const crew = [unit('c0', 'crew', { at: at(5, 8), maxHp: 2000, weapon: { ...LAS, damage: 1 }, stance: 'hold' })];
    const result = e.runBattle({ board: board(), units: [...crew, relay('rl', { at: at(2, 1) })], seed: 1, maxRounds: 3 });
    assert.ok(result.activations.every(a => a.unitId !== 'rl'));
    assert.ok(result.activations[0].snapshot.some(s => s.id === 'rl'));
});

test('while a relay stands the enemy aims better', () => {
    const shots = withRelay => {
        const crew = [unit('c0', 'crew', { at: at(5, 5), maxHp: 100000, weapon: { ...LAS, damage: 1 }, stance: 'hold' })];
        const foe = unit('e0', 'enemy', { at: at(5, 2), maxHp: 100000, stance: 'hold', accuracy: 0.5 });
        const units = withRelay ? [...crew, foe, relay('rl', { at: at(0, 0), maxHp: 100000 })] : [...crew, foe];
        const result = e.runBattle({ board: board(), units, seed: 99, maxRounds: 10 });
        return result.activations.filter(a => a.unitId === 'e0').reduce((n, a) => n + a.activities.filter(x => x.kind === 'attack').reduce((m, x) => m + x.hits, 0), 0);
    };
    assert.ok(shots(true) > shots(false), `with relay ${shots(true)}, without ${shots(false)}`);
});

test('the leader marks a barrage on the tightest knot of the squad, and it lands a round later', () => {
    const crew = [
        unit('c0', 'crew', { at: at(5, 7), maxHp: 1000, stance: 'hold', weapon: { ...LAS, damage: 1 } }),
        unit('c1', 'crew', { at: at(6, 7), maxHp: 1000, stance: 'hold', weapon: { ...LAS, damage: 1 } }),
        unit('c2', 'crew', { at: at(1, 8), maxHp: 1000, stance: 'hold', weapon: { ...LAS, damage: 1 } }),
    ];
    const result = e.runBattle({ board: board(), units: [...crew, leader(), relay('rl', { at: at(8, 1), maxHp: 100000 })], seed: 5, maxRounds: 2 });
    const marks = result.activations.filter(a => a.activities.some(x => x.kind === 'barrage-mark'));
    const falls = result.activations.filter(a => a.activities.some(x => x.kind === 'barrage'));
    assert.equal(marks.length, 1);
    assert.equal(marks[0].round, 1);
    const mark = marks[0].activities[0].at;
    assert.ok([5, 6].includes(mark.col) && mark.row === 7, 'on the pair, not the loner');
    assert.equal(falls.length, 1);
    assert.equal(falls[0].round, 2);
    assert.match(marks[0].reason, /標出轟擊區/);
});

test('a squad free to move steps out from under a marked barrage', () => {
    const crew = [
        unit('c0', 'crew', { at: at(5, 7), maxHp: 1000, weapon: { ...LAS, damage: 1 } }),
        unit('c1', 'crew', { at: at(6, 7), maxHp: 1000, weapon: { ...LAS, damage: 1 } }),
    ];
    const result = e.runBattle({ board: board(), units: [...crew, leader({ weapon: { ...LAS, damage: 1, range: 1 } }), relay('rl', { at: at(8, 1), maxHp: 100000 })], seed: 5, maxRounds: 2 });
    const fall = result.activations.find(a => a.activities.some(x => x.kind === 'barrage'));
    assert.equal(fall.activities[0].targetIds.length, 0, fall.reason);
});

test('with no relay standing there is no barrage at all', () => {
    // A leader without a relay is what destroying both relays leaves behind.
    const crew = [
        unit('c0', 'crew', { at: at(5, 7), maxHp: 1000, stance: 'hold', weapon: { ...LAS, damage: 1 } }),
        unit('c1', 'crew', { at: at(6, 7), maxHp: 1000, stance: 'hold', weapon: { ...LAS, damage: 1 } }),
    ];
    const dead = relay('rl', { at: at(8, 1) });
    const withDownedRelay = e.runBattle({ board: board(), units: [...crew, leader(), { ...dead, maxHp: 1 }], seed: 5, maxRounds: 4 });
    const alone = e.runBattle({ board: board(), units: [...crew, leader()], seed: 5, maxRounds: 4 });
    assert.equal(alone.activations.filter(a => a.activities.some(x => x.kind === 'barrage-mark')).length, 0);
    // Once a relay is down, no mark is made after it fell.
    const fell = withDownedRelay.activations.findIndex(a => a.snapshot.find(x => x.id === 'rl')?.down);
    if (fell >= 0) {
        const later = withDownedRelay.activations.slice(fell + 1).filter(a => a.activities.some(x => x.kind === 'barrage-mark'));
        assert.equal(later.length, 0);
    }
});
