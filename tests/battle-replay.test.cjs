const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadTs } = require('./helpers/load-ts.cjs');
const { runBattle } = loadTs('shared/battle/turn/engine.ts');
const { SCENARIOS } = loadTs('shared/battle/turn/scenarios.ts');
const { WEAPON_STATS, DUTY_STATS } = loadTs('shared/battle/turn/rules.ts');
const { frameState, eventDescription } = loadTs('src/battle/playback.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const crew = () => ['sergeant', 'rifleman', 'rifleman', 'marksman', 'medic', 'engineer'].map((d, i) => ({
    id: 'c' + i, name: 'c' + i, side: 'crew', duty: d, maxHp: 100, armour: 20,
    armourType: 'flak', accuracy: .7, ...DUTY_STATS[d],
    weapon: WEAPON_STATS[i === 3 ? 'precision-lasgun' : 'lasgun'], sidearm: WEAPON_STATS.laspistol,
    stance: i === 3 ? 'hold' : 'advance', at: { col: i + 2, row: 8 },
}));

/**
 * A tripwire, not a specification: it says the engine still resolves these 69
 * battles exactly as it did, so a change meant to be invisible - recording a
 * replay, refactoring the loadout - cannot quietly move an outcome.
 *
 * A deliberate balance change does move them, and then the hash is updated in
 * the same commit as the numbers, never on its own. Read it as "battle outcomes
 * changed, was that the intention?".
 *
 * 54516582… was the engine before the replay recording (2026-09-27).
 * ef1abd15… is after the 2026-09-29 hold-stance change: a held soldier out of
 * range now closes to its own firing range, and every board carries a parapet
 * in each deployment band. Soldier 3 holds, so this crew feels both.
 */
test('replay: the engine still resolves all 69 battles the same way', () => {
    const rows = [];
    for (const s of SCENARIOS) for (const seed of [1, 42, 20260927]) {
        const r = runBattle({ board: s.board, units: [...crew(), ...s.enemies], seed, objective: s.objective });
        rows.push([s.id, seed, r.outcome, r.rounds, r.units.map(u => [u.id, u.hp, u.at, u.down])]);
    }
    assert.equal(rows.length, 69);
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'), 'ef1abd15c833f5e9773f5663b7de493718a4f654b1116f1b52614cff91d0c08f');
});

test('replay: initial deployment, movement-before-impact and final authoritative state', () => {
    const s = SCENARIOS[0], initialUnits = [...crew(), ...s.enemies];
    const result = runBattle({ board: s.board, units: initialUnits, seed: 42, objective: s.objective });
    const replay = { version: 1, initialUnits, initialBoard: s.board, result };
    const first = frameState(replay, 0);
    assert.ok(first.snapshot.every(u => u.hp === initialUnits.find(x => x.id === u.id).maxHp));
    assert.deepEqual(plain(first.board), plain(s.board));
    for (let i = 0; i < result.timeline.length; i++) {
        const before = frameState(replay, i), firing = frameState(replay, i, true);
        assert.deepEqual(plain(firing.snapshot.map(u => u.hp)), plain(before.snapshot.map(u => u.hp)));
        const move = result.timeline[i].activities.find(a => a.kind === 'move');
        if (move) assert.deepEqual(plain(firing.snapshot.find(u => u.id === result.timeline[i].unitId).at), plain(move.to));
    }
    assert.deepEqual(plain(frameState(replay, result.timeline.length).snapshot), plain(result.units));
    assert.deepEqual(plain(frameState(replay, result.timeline.length).board), plain(result.finalBoard));
});

test('replay: individual hit rolls and real sidearm choices are recorded without guessing', () => {
    let attacks = 0, sidearms = 0;
    for (const s of SCENARIOS) {
        const r = runBattle({ board: s.board, units: [...crew(), ...s.enemies], seed: 42, objective: s.objective });
        for (const e of r.timeline) for (const a of e.activities) if (a.kind === 'attack') {
            attacks++;
            assert.ok(a.damageType);
            assert.equal(a.shots.filter(Boolean).length, a.hits);
            if (a.weaponSlot === 'sidearm') {
                sidearms++;
                assert.equal(a.weapon, r.units.find(u => u.id === e.unitId).sidearm.name);
                assert.match(eventDescription(e, new Map()), /副武器/);
            }
        }
    }
    assert.ok(attacks > 100);
    assert.ok(sidearms > 0);
});

test('replay: every scenario final event agrees with final HP including round-end effects', () => {
    for (const s of SCENARIOS) {
        const before = JSON.stringify(s.board);
        const r = runBattle({ board: s.board, units: [...crew(), ...s.enemies], seed: 1, objective: s.objective });
        assert.equal(JSON.stringify(s.board), before);
        const snap = r.timeline.at(-1).snapshot;
        assert.deepEqual(plain(snap.map(u => [u.id, u.hp, u.down, u.at])), plain(r.units.map(u => [u.id, u.hp, u.down, u.at])));
        assert.ok(r.activations.every(a => r.timeline.includes(a)));
        assert.ok(r.timeline.every(a => a.board && a.board !== s.board));
    }
});

test('replay: a fatal hazard gets its own frame even with no subsequent activation', () => {
    const units = crew().slice(0, 1);
    units[0].maxHp = 1; units[0].movement = 0;
    const foe = { ...units[0], id: 'e', side: 'enemy', at: { col: 10, row: 0 }, maxHp: 100 };
    const s = SCENARIOS[0];
    const board = { ...s.board, tiles: { ...s.board.tiles, '2,8': 'hazard' } };
    const result = runBattle({ board, units: [...units, foe], seed: 42, maxRounds: 1 });
    assert.ok(result.timeline.some(e => e.activities.some(a => a.kind === 'hazard')));
    assert.equal(result.timeline.at(-1).snapshot.find(u => u.id === 'c0').hp, 0);
});
