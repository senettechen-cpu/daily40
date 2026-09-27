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
