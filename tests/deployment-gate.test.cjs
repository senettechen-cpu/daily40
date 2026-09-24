const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

const gate = loadTs('shared/battle/gate.ts');
const deploy = loadTs('shared/battle/deployment.ts');
const engine = loadTs('shared/battle/sim/engine.ts');
const scenarios = loadTs('shared/battle/sim/scenarios.ts');

const character = (id, extra = {}) => ({
    id, name: id, origin: 'cadian', duty: 'rifleman', xp: 0, health: 'fit',
    recruitedAt: '2026-09-24T00:00:00.000Z', ...extra,
});
// Values built inside the loader sandbox have foreign prototypes; compare plain copies.
const plain = value => JSON.parse(JSON.stringify(value));
const item = (id, catalogId, assignedTo, paid = 0) => ({ id, catalogId, assignedTo, paid, acquiredAt: '2026-09-24T00:00:00.000Z' });

test('G1: a finished core opens the gate; nothing else does', () => {
    assert.equal(gate.operationGate({ completedCores: 1, restDay: false, exempt: false }).allowed, true);
    const blocked = gate.operationGate({ completedCores: 0, restDay: false, exempt: false });
    assert.equal(blocked.allowed, false);
    assert.match(blocked.reason, /還沒完成任何今日核心/);
});

test('G1: a rest day or exemption lets the operation run but pays nothing', () => {
    for (const input of [{ restDay: true, exempt: false }, { restDay: false, exempt: true }]) {
        const result = gate.operationGate({ completedCores: 0, ...input });
        assert.equal(result.allowed, true);
        assert.equal(result.paysRequisition, false);
    }
    assert.equal(gate.operationGate({ completedCores: 2, restDay: false, exempt: false }).paysRequisition, true);
});

test('an unequipped soldier deploys on the human baseline with no armour', () => {
    const { crew } = deploy.deploymentFor([character('a')], []);
    assert.equal(crew[0].maxHp, 100);
    assert.equal(crew[0].armor, 0);
    assert.equal(crew[0].accuracy, 0.75);
    assert.deepEqual(plain(crew[0].loadout), { primary: 'lasgun', secondary: 'laspistol' });
});

test('assigned armour and level feed the simulation', () => {
    const veteran = character('a', { xp: 2700 });
    const { crew } = deploy.deploymentFor([veteran], [item('i1', 'flak-armour', 'a')]);
    assert.equal(crew[0].armor, 20);
    assert.equal(crew[0].maxHp, 118); // +18% at level ten
});

test('gear with no combat profile is carried but reported, never faked', () => {
    const { crew, unmodelled } = deploy.deploymentFor([character('a')], [
        item('i1', 'plasma-gun', 'a'), item('i2', 'medicae-kit', 'a'),
    ]);
    // The plasma gun does not silently become a lasgun's damage.
    assert.equal(crew[0].loadout.primary, 'lasgun');
    assert.deepEqual(plain(unmodelled).sort(), ['medicae-kit', 'plasma-gun']);
});

test('another soldier’s equipment never leaks into this one', () => {
    const { crew } = deploy.deploymentFor([character('a'), character('b')], [item('i1', 'flak-armour', 'b')]);
    assert.equal(crew[0].armor, 0);
    assert.equal(crew[1].armor, 20);
});

test('a real deployment drives the battle, and its absence reproduces the old test crew', () => {
    const scenario = scenarios.SCENARIOS[0];
    const roster = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => character(id, { name: `士兵${id}` }));
    const { crew } = deploy.deploymentFor(roster, [item('i1', 'flak-armour', 'a')]);

    const withSquad = engine.createBattle(scenarios.setupFor(scenario, scenario.lanes, scenario.seed, crew));
    const named = withSquad.units.filter(u => u.side === 'crew');
    assert.equal(named[0].name, '士兵a');
    assert.equal(named[0].armor, 20);
    assert.equal(named[1].armor, 0);

    // Without a deployment the built-in six are unchanged, so recorded seeds still replay.
    const plain = engine.createBattle(scenarios.setupFor(scenario));
    const testCrew = plain.units.filter(u => u.side === 'crew');
    assert.equal(testCrew[0].name, '卡迪安 1');
    assert.equal(testCrew[0].armor, 20);
    assert.equal(testCrew[0].maxHp, 100);
});

test('carapace slows movement once; flak and power armour do not', () => {
    const suits = { 'flak-armour': 1.2, 'carapace-armour': 1.08, 'astartes-power-armour': 1.2 };
    for (const [suit, expected] of Object.entries(suits)) {
        const { crew } = deploy.deploymentFor([character('a')], [item('i1', suit, 'a')]);
        assert.equal(Number(crew[0].speed.toFixed(4)), expected, `${suit} speed`);
    }
    // No armour at all keeps the baseline.
    assert.equal(deploy.deploymentFor([character('a')], []).crew[0].speed, 1.2);
});

test('the speed penalty is applied once, not compounded as the unit walks', () => {
    const scenario = scenarios.SCENARIOS[0];
    const roster = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => character(id));
    const { crew } = deploy.deploymentFor(roster, [item('i1', 'carapace-armour', 'a')]);

    let battle = engine.createBattle(scenarios.setupFor(scenario, scenario.lanes, scenario.seed, crew));
    const walker = () => battle.units.find(u => u.id === 'a');
    const speedAtStart = walker().speed;

    for (let i = 0; i < 200; i += 1) battle = engine.stepBattle(battle);
    // A per-tick multiplier would have driven this toward zero by now.
    assert.equal(walker().speed, speedAtStart);
    assert.equal(Number(speedAtStart.toFixed(4)), 1.08);
});

test('carapace changes movement only: cover, aim, reload and swap timings are untouched', () => {
    const rules = loadTs('shared/battle/sim/rules.ts');
    const source = require('node:fs').readFileSync('shared/battle/sim/engine.ts', 'utf8');
    // The unit's speed is read for movement and nowhere else.
    const uses = [...source.matchAll(/u\.speed|\.speed\b/g)].length;
    assert.ok(uses <= 3, `unit speed is referenced ${uses} times; it should only drive movement`);
    assert.ok(rules.ENTER_COVER_TICKS > 0 && rules.SWAP_TICKS.primary > 0, 'fixed timings still exist');
});
