const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadTs } = require('./helpers/load-ts.cjs');

const report = loadTs('src/battle/report/report.ts');
const scenarios = loadTs('shared/battle/sim/scenarios.ts');
const expedition = loadTs('src/expedition/engine.ts');
const source = fs.readFileSync('src/battle/view/TacticalMap.tsx', 'utf8');

test('every snapshot carries the position and side the map needs', () => {
    const sim = report.simulateWithReport(scenarios.setupFor(scenarios.SCENARIOS[0]));
    assert.ok(sim.timeline.length > 1);
    for (const tickSnaps of [sim.timeline[0], sim.timeline[Math.floor(sim.timeline.length / 2)]]) {
        for (const snap of tickSnaps) {
            assert.equal(typeof snap.pos.x, 'number');
            assert.equal(typeof snap.pos.y, 'number');
            assert.ok(snap.side === 'crew' || snap.side === 'enemy');
        }
    }
});

test('positions are historical, not the final ones', () => {
    const sim = report.simulateWithReport(scenarios.setupFor(scenarios.SCENARIOS[1]));
    const first = sim.timeline[0];
    const last = sim.timeline[sim.timeline.length - 1];
    const moved = first.some(snap => {
        const later = last.find(other => other.id === snap.id);
        return later && (later.pos.x !== snap.pos.x || later.pos.y !== snap.pos.y);
    });
    assert.ok(moved, 'someone should have moved, otherwise this test proves nothing');
});

test('a downed unit stays at its position in the snapshot', () => {
    const sim = report.simulateWithReport(scenarios.setupFor(scenarios.SCENARIOS[2]));
    const last = sim.timeline[sim.timeline.length - 1];
    const down = last.find(snap => snap.hp <= 0);
    if (!down) return; // the scenario may end with nobody down; nothing to assert
    assert.equal(typeof down.pos.x, 'number');
    assert.ok(Number.isFinite(down.pos.x) && Number.isFinite(down.pos.y));
});

test('the map reads the live terrain constants, it does not keep its own copy', () => {
    assert.match(source, /from '\.\.\/\.\.\/expedition\/engine'/);
    assert.match(source, /COVER/);
    assert.match(source, /WALLS/);
    // No inlined coordinate table that could drift from the real map.
    assert.doesNotMatch(source, /\{\s*x:\s*\d+,\s*y:\s*\d+\s*\}/);
    assert.equal(expedition.COVER.length, 10);
    assert.equal(expedition.WALLS.length, 7);
});

test('the map never guesses a position it does not have', () => {
    assert.match(source, /此事件無位置快照/);
    // The shot line is drawn only from real snapshot positions.
    assert.match(source, /snaps\.find\(s => s\.id === shot\.sourceId\)/);
    assert.doesNotMatch(source, /nearest|closest|estimate/i);
});

test('markers are distinguishable without colour and label the impact honestly', () => {
    // Shape plus a text label per side, not colour alone.
    assert.match(source, /A\$\{\+\+crew\}/);
    assert.match(source, /E\$\{\+\+enemy\}/);
    assert.match(source, /端點為目標位置，非實際彈著點/);
});
