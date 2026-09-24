const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadTs } = require('./helpers/load-ts.cjs');
const e = loadTs('shared/battle/sim/engine.ts');
const s = loadTs('shared/battle/sim/scenarios.ts');
const r = loadTs('src/battle/report/report.ts');
const templates = JSON.parse(fs.readFileSync('src/battle/report/report-templates.json', 'utf8')).templates;

const scenario = id => s.SCENARIOS.find(x => x.id === id);
const all = [];
for (const sc of s.SCENARIOS) for (let seed = 1; seed <= 10; seed++) all.push({ key: `${sc.id}:${seed}`, sim: r.simulateWithReport(s.setupFor(sc, sc.lanes, seed)) });

test('outcomes are unchanged by the report work: identical to the recorded pre-change baseline', () => {
    const baseline = JSON.parse(fs.readFileSync('tests/fixtures/battle-baseline.json', 'utf8'));
    for (const { key, sim } of all) {
        const b = sim.final;
        const now = {
            status: b.status, tick: b.tick, random: b.random,
            units: b.units.map(u => [u.id, u.hp, u.tile.x, u.tile.y, u.active, u.ammo.primary, u.ammo.secondary]),
            shots: sim.events.filter(x => x.kind === 'shot').map(x => [x.tick, x.sourceId, x.targetId, x.weapon, x.outcome, x.amount]),
        };
        assert.equal(JSON.stringify(now), JSON.stringify(baseline[key]), key);
    }
});

test('building the report twice gives identical text and never touches the battle RNG', () => {
    const sim = all[0].sim;
    const before = sim.final.random;
    const names = Object.fromEntries(sim.initial.units.map(u => [u.id, u.name]));
    const again = r.buildReport(sim.events, names, sim.final);
    assert.deepEqual(again.map(x => x.text), sim.report.map(x => x.text));
    assert.equal(sim.final.random, before);
});

test('traceability: every shot appears in exactly one entry, and merged tallies match the source events', () => {
    for (const { key, sim } of all) {
        const shots = sim.events.filter(x => x.kind === 'shot');
        const seen = new Map();
        for (const entry of sim.report) for (const id of entry.sourceEventIds) seen.set(id, (seen.get(id) || 0) + 1);
        for (const shot of shots) assert.equal(seen.get(shot.id), 1, `${key} shot ${shot.id}`);
        for (const entry of sim.report.filter(x => x.tally)) {
            const src = entry.sourceEventIds.map(id => shots.find(x => x.id === id));
            assert.equal(entry.tally.shots, src.length);
            assert.equal(entry.tally.shots, entry.tally.hits + entry.tally.coverHits + entry.tally.misses);
            assert.equal(entry.tally.amount, src.reduce((sum, x) => sum + x.amount, 0));
            assert.ok(src.every(x => x.sourceId === entry.actorId && x.targetId === entry.targetId && x.weapon === entry.weapon), 'burst mixes shooter/target/weapon');
            assert.ok(entry.endTick - entry.startTick <= r.BURST_WINDOW_TICKS);
            if (entry.kind !== 'burst') assert.equal(src.length, 1, 'single shots are not merged');
        }
    }
});

test('a key event for a unit closes its open burst: no merged entry spans that unit\'s swap, reload, cancel or down', () => {
    for (const { key, sim } of all) {
        const keyEvents = sim.events.filter(x => x.kind !== 'shot');
        for (const entry of sim.report.filter(x => x.kind === 'burst')) {
            const [first, last] = [Math.min(...entry.sourceEventIds), Math.max(...entry.sourceEventIds)];
            const crossing = keyEvents.find(k => k.id > first && k.id < last && (k.unitId === entry.actorId || k.unitId === entry.targetId));
            assert.equal(crossing, undefined, `${key} ${entry.id} spans ${crossing?.kind}`);
        }
    }
});

test('texts stay within GPT limits and come from the templates', () => {
    const allowed = Object.values(templates).flat();
    const pattern = t => new RegExp('^' + t.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\w+\}/g, '.+?') + '$');
    const patterns = allowed.map(pattern);
    const neutral = [/^.+開始切換武器$/, /^.+的動作中止$/, /^.+已切換為.+$/];
    for (const { sim } of all) for (const entry of sim.report) {
        assert.ok([...entry.text].length <= (entry.kind === 'burst' ? r.MAX_BURST_CHARS : r.MAX_SINGLE_CHARS), entry.text);
        assert.ok(patterns.some(p => p.test(entry.text)) || neutral.some(p => p.test(entry.text)), `not from a template: ${entry.text}`);
        assert.doesNotMatch(entry.text, /\{\w+\}/, 'unfilled placeholder');
        assert.doesNotMatch(entry.text, /陣亡|死亡|滅絕|永久/, 'forbidden wording');
    }
});

test('swap start and completion are separate; completion wording only after the swap completes, weapon from the event', () => {
    const sim = r.simulateWithReport(s.setupFor(scenario('close-assault')));
    const starts = sim.report.filter(x => x.kind === 'swap-start');
    const done = sim.report.filter(x => x.kind === 'swap');
    assert.ok(starts.length >= 3 && done.length >= 3);
    for (const entry of done) {
        const ev = sim.events.find(x => x.id === entry.sourceEventIds[0]);
        assert.equal(ev.kind, 'swap');
        assert.equal(ev.phase, 'complete');
        assert.equal(entry.weapon, ev.weapon);
        assert.ok(entry.key);
        // The committed weapon in the timeline changes exactly at the completion tick.
        const before = sim.timeline[ev.tick - 1].find(u => u.id === ev.unitId), after = sim.timeline[ev.tick].find(u => u.id === ev.unitId);
        assert.notEqual(before.weapon, ev.weapon);
        assert.equal(after.weapon, ev.weapon);
    }
    for (const entry of starts) assert.match(entry.text, /開始切換武器$/);
    assert.ok(done.some(x => /貼身|近身/.test(x.text)), 'engaged swap uses the engaged template');
    assert.ok(done.some(x => x.weapon === 'lasgun'), 'swap back to the rifle is reported');
});

test('interrupted reload: a cancel entry, no reload completion at that moment', () => {
    const sim = r.simulateWithReport({ ...s.setupFor(scenario('close-assault')), crewAmmo: { primary: 1 } });
    const cancels = sim.report.filter(x => x.kind === 'cancel');
    assert.ok(cancels.length > 0);
    for (const entry of cancels) {
        assert.match(entry.text, /的動作中止$/);
        assert.equal(sim.report.filter(x => x.kind === 'reload' && x.actorId === entry.actorId && x.startTick === entry.startTick).length, 0);
    }
});

test('down, victory, defeat and timeout all produce the right key entries from the simulation end state', () => {
    const statuses = new Set(all.map(x => x.sim.final.status));
    assert.ok(statuses.has('victory') && statuses.has('defeat'));
    for (const { sim } of all) {
        const result = sim.report[sim.report.length - 1];
        assert.equal(result.kind, 'result');
        assert.ok(templates[sim.final.status].includes(result.text));
        const downs = sim.events.filter(x => x.kind === 'down').length;
        assert.equal(sim.report.filter(x => x.kind === 'down').length, downs);
        assert.ok(sim.report.filter(x => x.kind === 'down').every(x => x.key));
    }
    // Timeout comes from the simulation state, never from playback ending.
    const timeout = r.buildReport([], {}, { status: 'timeout', tick: 3600 });
    assert.equal(timeout.length, 1);
    assert.ok(templates.timeout.includes(timeout[0].text));
    assert.equal(r.buildReport([], {}, { status: 'running', tick: 10 }).length, 0);
});

test('stats agree with the events and the final state', () => {
    for (const { key, sim } of all) {
        const shots = sim.events.filter(x => x.kind === 'shot');
        assert.equal(sim.stats.reduce((sum, u) => sum + u.shots, 0), shots.length, key);
        assert.equal(sim.stats.reduce((sum, u) => sum + u.amount, 0), sim.stats.reduce((sum, u) => sum + u.damageTaken, 0), key);
        for (const u of sim.stats) {
            assert.equal(u.finalHp, Math.max(0, u.maxHp - u.damageTaken), `${key} ${u.id}`);
            assert.equal(u.downTick !== null, u.finalHp === 0, `${key} ${u.id}`);
        }
    }
});

test('the timeline has one snapshot per tick and entries are ordered by time', () => {
    for (const { sim } of all) {
        assert.equal(sim.timeline.length, sim.final.tick + 1);
        for (let i = 1; i < sim.report.length; i++) assert.ok(sim.report[i - 1].startTick <= sim.report[i].startTick);
    }
});
