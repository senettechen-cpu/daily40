const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadTs } = require('./helpers/load-ts.cjs');
const e = loadTs('src/expedition/engine.ts');
const p = loadTs('src/expedition/presentation.ts');
test('guard sprite atlas exists as the expected four-cell RGBA asset', () => {
    const png = fs.readFileSync('public/expedition/cadian-poses-v1.png');
    assert.equal(png.readUInt32BE(16), 1254); assert.equal(png.readUInt32BE(20), 1254);
    assert.equal(png[25], 6);
});
test('animation events identify weapon, source, target and simulation timestamp', () => {
    let state = e.createBattle(e.DEFAULT_SQUAD);
    while (!state.effects.length) state = e.stepBattle(state);
    for (const event of state.effects) {
        assert.ok(state.actors.some(a => a.id === event.sourceId));
        assert.ok(state.actors.some(a => a.id === event.targetId));
        assert.ok(e.WEAPONS[event.weapon] || event.weapon === 'laspistol');
        assert.equal(event.born, state.tick);
        assert.equal(p.effectAge(event, state.tick), 0);
    }
});
test('health display is delayed to visible impact without changing authoritative damage', () => {
    const battle = { tick: 10, actors: [{ id: 'target', hp: 76, maxHp: 100 }], effects: [{ targetId: 'target', born: 10, amount: 24, kind: 'shot' }] };
    assert.equal(p.visibleHealth(battle, 'target', 0), 100);
    assert.equal(p.visibleHealth(battle, 'target', 2), 76);
    assert.equal(battle.actors[0].hp, 76);
    battle.effects[0].kind = 'heal';
    assert.equal(p.visibleHealth(battle, 'target', 0), 52);
    assert.equal(p.visibleHealth(battle, 'target', 2), 76);
});
test('walking interpolates over several ticks, clamps endpoints and is deterministic while paused', () => {
    const track = { from: { x: 1, y: 2 }, to: { x: 2, y: 2 }, start: 10, end: 16 };
    assert.equal(p.motionPoint(track, 9).x, 1);
    assert.equal(p.motionPoint(track, 13).x, 1.5);
    assert.equal(p.motionPoint(track, 17).x, 2);
    assert.equal(JSON.stringify(p.motionPoint(track, 13)), JSON.stringify(p.motionPoint(track, 13)));
    assert.equal(p.project({ x: 1, y: 1 }).x, 340);
});
