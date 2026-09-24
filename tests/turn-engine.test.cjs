const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const e = loadTs('shared/battle/turn/engine.ts');
const r = loadTs('shared/battle/turn/rules.ts');

const board = (tiles = {}) => ({ cols: 11, rows: 9, tiles });
const at = (col, row) => ({ col, row });

const RIFLE = { name: '雷射步槍', damage: 16, hits: 2, range: 5, penetration: 0 };
const PISTOL = { name: '雷射手槍', damage: 7, hits: 1, range: 2, penetration: 0 };

const unit = (id, side, over = {}) => ({
    id,
    name: id,
    side,
    duty: 'rifleman',
    maxHp: 100,
    armour: 20,
    accuracy: 0.75,
    movement: 3,
    initiative: 10,
    weapon: RIFLE,
    stance: 'advance',
    at: side === 'crew' ? at(5, 8) : at(5, 0),
    ...over,
});

const run = (units, over = {}) => e.runBattle({ board: board(), units, seed: 12345, ...over });

test('a battle ends when one side is down, and reports which', () => {
    // Six against one: the lone defender cannot survive the round.
    const crew = Array.from({ length: 6 }, (_, i) => unit('c' + i, 'crew', { at: at(3 + i, 6) }));
    const win = run([...crew, unit('e0', 'enemy', { at: at(5, 5), maxHp: 20 })]);
    assert.equal(win.outcome, 'victory');
    assert.ok(win.units.filter(u => u.side === 'enemy').every(u => u.down));

    const enemies = Array.from({ length: 6 }, (_, i) => unit('e' + i, 'enemy', { at: at(3 + i, 2) }));
    const loss = run([unit('c0', 'crew', { at: at(5, 3), maxHp: 20 }), ...enemies]);
    assert.equal(loss.outcome, 'defeat');
});

test('a stalemate runs out of rounds instead of running forever', () => {
    // Out of reach of each other, with hold stance so neither closes.
    const far = run([
        unit('c0', 'crew', { at: at(0, 8), stance: 'hold', movement: 0 }),
        unit('e0', 'enemy', { at: at(10, 0), stance: 'hold', movement: 0 }),
    ]);
    assert.equal(far.outcome, 'timeout');
    assert.equal(far.rounds, r.MAX_ROUNDS);
});

test('the same seed replays exactly, a different one does not', () => {
    const units = () => [
        unit('c0', 'crew', { at: at(4, 7) }), unit('c1', 'crew', { at: at(6, 7) }),
        unit('e0', 'enemy', { at: at(4, 1) }), unit('e1', 'enemy', { at: at(6, 1) }),
    ];
    const summary = result => JSON.stringify({
        outcome: result.outcome,
        rounds: result.rounds,
        units: result.units.map(u => [u.id, u.hp, u.at.col, u.at.row, u.down]),
        reasons: result.activations.map(a => a.unitId + ':' + a.reason),
    });

    assert.equal(summary(run(units())), summary(run(units())));
    assert.notEqual(summary(run(units())), summary(run(units(), { seed: 999 })));
});

test('sides alternate, and the order inside a side follows initiative', () => {
    const result = run([
        unit('c-slow', 'crew', { at: at(4, 8), initiative: 1, stance: 'hold', movement: 0 }),
        unit('c-fast', 'crew', { at: at(6, 8), initiative: 9, stance: 'hold', movement: 0 }),
        unit('e-slow', 'enemy', { at: at(4, 0), initiative: 2, stance: 'hold', movement: 0 }),
        unit('e-fast', 'enemy', { at: at(6, 0), initiative: 8, stance: 'hold', movement: 0 }),
    ]);
    // Spread first: arrays crossing the loadTs realm are not reference-equal.
    const firstRound = [...result.activations].filter(a => a.round === 1).map(a => a.unitId);
    assert.deepEqual(firstRound, ['c-fast', 'e-fast', 'c-slow', 'e-slow']);
});

test('every activation says why, and leaves a snapshot of the whole field', () => {
    const result = run([
        unit('c0', 'crew', { at: at(5, 6) }),
        unit('e0', 'enemy', { at: at(5, 3) }),
    ]);
    assert.ok(result.activations.length > 0);
    for (const step of result.activations) {
        assert.ok(step.reason.length > 0, 'an unexplained activation is a random button');
        assert.equal(step.snapshot.length, 2);
        assert.ok(step.activities.length > 0);
    }
});

test('a held position stays put; an advance closes the distance', () => {
    const start = at(5, 8);
    const held = run([
        unit('c0', 'crew', { at: start, stance: 'hold' }),
        unit('e0', 'enemy', { at: at(5, 0), stance: 'hold', movement: 0 }),
    ]);
    const heldAt = held.units.find(u => u.id === 'c0').at;
    assert.deepEqual([heldAt.col, heldAt.row], [start.col, start.row]);

    const advanced = run([
        unit('c0', 'crew', { at: start, stance: 'advance' }),
        unit('e0', 'enemy', { at: at(5, 0), stance: 'hold', movement: 0 }),
    ]);
    const movedTo = advanced.units.find(u => u.id === 'c0').at;
    assert.ok(movedTo.row < start.row, 'an advancing soldier must have closed on the enemy');
});

test('a guard keeps station on whoever it was told to protect', () => {
    const result = run([
        unit('medic', 'crew', { at: at(5, 8), duty: 'medic', stance: 'hold', movement: 0 }),
        unit('minder', 'crew', { at: at(0, 8), stance: 'guard', guardTargetId: 'medic' }),
        unit('e0', 'enemy', { at: at(5, 0), stance: 'hold', movement: 0 }),
    ]);
    const minder = result.units.find(u => u.id === 'minder');
    const medic = result.units.find(u => u.id === 'medic');
    const gap = Math.max(Math.abs(minder.at.col - medic.at.col), Math.abs(minder.at.row - medic.at.row));
    assert.ok(gap <= 5, 'the guard wandered off');
});

test('the medic is shot first when both are equally reachable', () => {
    // One shooter, two targets side by side: the threat weighting decides.
    const result = run([
        unit('c0', 'crew', { at: at(5, 5), stance: 'hold' }),
        unit('e-medic', 'enemy', { at: at(4, 3), duty: 'medic', stance: 'hold', movement: 0 }),
        unit('e-grunt', 'enemy', { at: at(6, 3), stance: 'hold', movement: 0 }),
    ]);
    const firstShot = result.activations
        .find(a => a.unitId === 'c0' && a.activities.some(x => x.kind === 'attack'));
    const shot = firstShot.activities.find(x => x.kind === 'attack');
    assert.equal(shot.targetId, 'e-medic');
});

test('cover softens what lands, so the same shot hurts less behind it', () => {
    const shooter = { ...unit('c0', 'crew', { at: at(5, 5) }), hp: 100, down: false };
    const exposed = { ...unit('e0', 'enemy', { at: at(5, 3) }), hp: 100, down: false };
    const sheltered = { ...exposed, at: at(5, 3) };

    const open = r.hitChance(board(), shooter, shooter.at, exposed);
    const behind = r.hitChance(board({ '5,3': 'cover' }), shooter, shooter.at, sheltered);
    assert.ok(behind < open, 'cover must reduce the chance of being hit');
});

test('armour reduces a hit but never to nothing', () => {
    assert.ok(r.damageOf(RIFLE, 0) > r.damageOf(RIFLE, 40));
    assert.ok(r.damageOf(PISTOL, 400) >= 1, 'a hit always registers something');
    // Penetration cancels armour point for point.
    assert.equal(r.damageOf({ ...RIFLE, penetration: 20 }, 20), r.damageOf(RIFLE, 0));
});

test('hazard ground costs health at the end of a round', () => {
    const result = e.runBattle({
        board: board({ '5,8': 'hazard' }),
        units: [
            unit('c0', 'crew', { at: at(5, 8), stance: 'hold', movement: 0 }),
            unit('e0', 'enemy', { at: at(0, 0), stance: 'hold', movement: 0 }),
        ],
        seed: 7,
    });
    const survivor = result.units.find(u => u.id === 'c0');
    assert.ok(survivor.hp < 100, 'standing in hazard must cost something');
});
