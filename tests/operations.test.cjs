const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { createFakeDb } = require('./helpers/fake-db.cjs');

const xp = loadTs('shared/battle/xp.ts');
const turn = loadTs('shared/battle/turn/index.ts');
const hex = loadTs('shared/battle/hex/board.ts');

function mount(file, db) {
    const handlers = {};
    const Router = () => {
        const add = method => (route, fn) => { handlers[`${method} ${route}`] = fn; };
        return { get: add('GET'), post: add('POST'), put: add('PUT'), delete: add('DELETE') };
    };
    loadTs(file, { mocks: { express: { Router }, '../db': { query: db.query, withTransaction: db.withTransaction } } });
    return async (method, route, { user = 'u1', body = {}, params = {}, query = {} } = {}) => {
        const res = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
        await handlers[`${method} ${route}`]({ user: { uid: user }, body, params, query }, res);
        return res;
    };
}

function setup() {
    process.env.V15_ECONOMY = 'on';
    const db = createFakeDb();
    return { db, ops: mount('server/src/routes/operations.ts', db), roster: mount('server/src/routes/roster.ts', db) };
}

/** Pays a core today so G1 opens, exactly as completing one would. */
const completeCore = db => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    db.tables.reward_entries.push({
        user_id: 'u1', seq: db.tables.reward_entries.length + 1, source_key: `core:${today}:t1`,
        kind: 'grant', amount: 10, day: today, at: new Date().toISOString(), reason: '完成今日核心',
    });
};

test('deployed soldiers all get the same xp, regardless of who shot', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, xp: 0 }));
    const awards = xp.awardsFor('victory', six, []);
    assert.equal(awards.length, 6);
    assert.ok(awards.every(a => a.amount === 60 && a.role === 'deployed'));
    assert.deepEqual([...new Set(xp.awardsFor('defeat', six, []).map(a => a.amount))], [40]);
    assert.deepEqual([...new Set(xp.awardsFor('timeout', six, []).map(a => a.amount))], [20]);
});

test('trainees get half, at most four of them, and never twice', () => {
    const deployed = [{ id: 'a', xp: 0 }];
    const trainees = ['t1', 't2', 't3', 't4', 't5'].map(id => ({ id, xp: 0 }));
    const awards = xp.awardsFor('victory', deployed, [...trainees, { id: 'a', xp: 0 }]);
    assert.equal(awards.filter(a => a.role === 'trainee').length, 4);
    assert.ok(awards.filter(a => a.role === 'trainee').every(a => a.amount === 30));
    assert.equal(awards.filter(a => a.characterId === 'a').length, 1);
});

test('trainee xp stops at the level eight threshold instead of banking', () => {
    const ceiling = xp.TRAINEE_XP_CEILING;
    assert.equal(ceiling, 1750);
    // Twenty short of the ceiling: pays 20, not 30.
    assert.deepEqual(xp.awardsFor('victory', [], [{ id: 't', xp: ceiling - 20 }]).map(a => a.amount), [20]);
    // Already at the ceiling: nothing at all.
    assert.equal(xp.awardsFor('victory', [], [{ id: 't', xp: ceiling }]).length, 0);
});

test('the gate refuses an operation before any core is done, and no row is written', async () => {
    const { db, ops, roster } = setup();
    const { squads } = (await roster('GET', '/')).body;

    const res = await ops('POST', '/', { body: { squadId: squads[0].id, scenarioId: 'standard' } });
    assert.equal(res.code, 400);
    assert.match(res.body.error, /還沒完成任何今日核心/);
    assert.equal(db.tables.operations.length, 0);
});

test('the server resolves the battle itself and pays the roster', async () => {
    const { db, ops, roster } = setup();
    const { squads, characters } = (await roster('GET', '/')).body;
    completeCore(db);

    const res = await ops('POST', '/', { body: { squadId: squads[0].id, scenarioId: 'standard' } });
    assert.equal(res.code, 201);
    assert.ok(['victory', 'defeat', 'timeout'].includes(res.body.operation.outcome));
    assert.equal(db.tables.operations.length, 1);

    // Every deployed soldier gained the outcome's xp, written by the server.
    const paid = res.body.awards[0].amount;
    for (const character of characters) {
        const row = db.tables.roster_characters.find(r => r.id === character.id);
        assert.equal(row.xp, paid, `${character.name} should have ${paid} xp`);
    }
});

const TODAY = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

test('the client cannot claim a result: anything it asserts is ignored', async () => {
    const { db, ops, roster } = setup();
    const { squads } = (await roster('GET', '/')).body;
    completeCore(db);

    const lying = await ops('POST', '/', { body: { squadId: squads[0].id, scenarioId: 'standard', outcome: 'victory', awards: 9999, seed: 1 } });

    // The claimed outcome and payout are dropped: what comes back is what the
    // server resolved and stored, paid from its own table.
    const stored = db.tables.operations[0];
    assert.equal(lying.body.operation.outcome, stored.outcome);
    assert.equal(lying.body.operation.seed, stored.seed);
    assert.equal(lying.body.awards[0].amount, xp.DEPLOYED_XP[stored.outcome]);
    assert.notEqual(lying.body.awards[0].amount, 9999);
});

test('each operation rolls its own seed, so one won battle cannot be replayed for xp', async () => {
    const { db, ops, roster } = setup();
    const { squads } = (await roster('GET', '/')).body;
    completeCore(db);

    const seeds = new Set();
    for (let i = 0; i < 8; i += 1) {
        const res = await ops('POST', '/', { body: { squadId: squads[0].id, scenarioId: 'standard' } });
        if (!res.body.operation) break; // a defeat bars the squad for the rest of the day
        seeds.add(res.body.operation.seed);
        for (const row of db.tables.roster_characters) row.wounded_day = null; // keep rolling
    }
    assert.ok(seeds.size > 1, `expected varied seeds, got ${[...seeds]}`);
});

test('a defeat puts the squad out of action for the rest of the day', async () => {
    const { db, ops, roster } = setup();
    const { squads } = (await roster('GET', '/')).body;
    completeCore(db);

    const first = await ops('POST', '/', { body: { squadId: squads[0].id, scenarioId: 'outnumbered' } });
    const today = TODAY();
    const barred = db.tables.roster_characters.filter(c => c.wounded_day === today).map(c => c.id);

    if (first.body.operation.outcome === 'defeat') {
        assert.deepEqual([...first.body.woundedIds].sort(), [...squads[0].memberIds].sort());
        assert.deepEqual(barred.sort(), [...squads[0].memberIds].sort());
        const again = await ops('POST', '/', { body: { squadId: squads[0].id, scenarioId: 'outnumbered' } });
        assert.match(again.body.error, /負傷/);
    } else {
        // A battle that was not lost costs nobody their day.
        assert.deepEqual([...first.body.woundedIds], []);
        assert.deepEqual(barred, []);
    }

    // Whatever happened today, tomorrow's roster is clear again.
    for (const row of db.tables.roster_characters) row.wounded_day = '2020-01-01';
    const tomorrow = await ops('POST', '/', { body: { squadId: squads[0].id, scenarioId: 'standard' } });
    assert.ok(tomorrow.body.operation, tomorrow.body.error);
});

test('an unknown scenario, or another account reaching for this squad, is refused', async () => {
    const { db, ops, roster } = setup();
    const { squads } = (await roster('GET', '/')).body;
    completeCore(db);

    assert.equal((await ops('POST', '/', { body: { squadId: squads[0].id, scenarioId: 'nope' } })).code, 400);
    assert.equal((await ops('POST', '/', { user: 'u2', body: { squadId: squads[0].id, scenarioId: 'standard' } })).code, 400);
});

test('a trainee who is also deployed is paid once, as deployed', async () => {
    const { db, ops, roster } = setup();
    const { squads, characters } = (await roster('GET', '/')).body;
    completeCore(db);

    const res = await ops('POST', '/', {
        body: { squadId: squads[0].id, scenarioId: 'standard', traineeIds: [characters[0].id] },
    });
    const forFirst = res.body.awards.filter(a => a.characterId === characters[0].id);
    assert.equal(forFirst.length, 1);
    assert.equal(forFirst[0].role, 'deployed');
});

test('the stored seed replays the battle the server resolved, exactly', async () => {
    const { db, ops, roster } = setup();
    const { squads } = (await roster('GET', '/')).body;
    completeCore(db);

    const res = await ops('POST', '/', { body: { squadId: squads[0].id, scenarioId: 'standard' } });
    const { seed, crew, outcome, board, rounds } = res.body.operation;
    const stored = db.tables.operations[0];
    assert.equal(stored.seed, seed);
    assert.equal(stored.engine, 'v2');

    // What the report does: re-run from the stored seed and board, and get the
    // same battle down to the last activation.
    const scenario = turn.scenarioById('standard');
    const replay = turn.runBattle({ board, units: [...crew, ...scenario.enemies], seed });
    assert.equal(replay.outcome, outcome);
    assert.equal(replay.rounds, rounds);
    assert.deepEqual(
        [...replay.activations].map(a => a.unitId + ':' + a.reason),
        [...res.body.activations].map(a => a.unitId + ':' + a.reason),
    );

    // And a different seed is a different battle, not the same one relabelled.
    const other = turn.runBattle({ board, units: [...crew, ...scenario.enemies], seed: seed + 1 });
    assert.notDeepEqual(other.units.map(u => u.hp), replay.units.map(u => u.hp));
});

test('a squad with no saved formation still deploys, in its own half', async () => {
    const { db, ops, roster } = setup();
    const { squads } = (await roster('GET', '/')).body;
    completeCore(db);

    const res = await ops('POST', '/', { body: { squadId: squads[0].id, scenarioId: 'standard' } });
    const { crew, placements, board } = res.body.operation;
    assert.equal(crew.length, 6);
    assert.equal(placements.length, 6);

    const zone = new Set([...hex.deploymentZone(board, 'crew')].map(h => h.col + ',' + h.row));
    const seats = new Set();
    for (const soldier of crew) {
        const key = soldier.at.col + ',' + soldier.at.row;
        assert.ok(zone.has(key), soldier.name + ' started outside the deployment zone');
        assert.ok(!seats.has(key), 'two soldiers share ' + key);
        seats.add(key);
        assert.equal(soldier.side, 'crew');
    }
});

test('a saved formation is the one that fights', async () => {
    const { db, ops, roster } = setup();
    const { squads } = (await roster('GET', '/')).body;
    completeCore(db);

    // Put everyone on the back row, all holding.
    const saved = squads[0].memberIds.map((characterId, i) => ({
        characterId, at: { col: 2 + i, row: 8 }, stance: 'hold',
    }));
    db.tables.squads.find(s => s.id === squads[0].id).placements = saved;

    const res = await ops('POST', '/', { body: { squadId: squads[0].id, scenarioId: 'standard' } });
    for (const soldier of res.body.operation.crew) {
        const placed = saved.find(p => p.characterId === soldier.id);
        assert.deepEqual([soldier.at.col, soldier.at.row], [placed.at.col, placed.at.row]);
        assert.equal(soldier.stance, 'hold');
    }
});
