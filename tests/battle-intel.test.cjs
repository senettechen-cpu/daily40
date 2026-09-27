const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { createFakeDb } = require('./helpers/fake-db.cjs');

const turn = loadTs('shared/battle/turn/index.ts');
const { STARTING_CHARACTERS } = loadTs('shared/roster/characters.ts');

function starters(weapons = {}, stances = {}) {
    const members = STARTING_CHARACTERS.map((c, i) => ({ id: 'c' + i, name: c.name, origin: c.origin, duty: c.duty, xp: 0, health: 'fit', recruitedAt: '' }));
    const items = members.flatMap(m => [weapons[m.id] ?? 'lasgun', 'laspistol', 'flak-armour']
        .map((catalogId, k) => ({ id: m.id + k, catalogId, assignedTo: m.id, paid: 0, acquiredAt: '' })));
    return { members, items, stances };
}
function crewAt(scenarioId, setup) {
    const scenario = turn.scenarioById(scenarioId);
    const placements = turn.placementsFor(scenario.board, setup.members, undefined)
        .map(p => (setup.stances[p.characterId] ? { ...p, stance: setup.stances[p.characterId] } : p));
    return { scenario, crew: turn.assignHeavyCrew(turn.resolveGuards(turn.crewFor(setup.members, setup.items, placements).units)) };
}

test('intel: the final boss names its relays, medic and horde, and checks the squad\'s answers', () => {
    const { scenario, crew } = crewAt('w3-n4', starters());
    const ids = turn.threatsOf(scenario.enemies, scenario.objective, crew).map(t => t.id);
    for (const id of ['relays', 'medics', 'horde', 'target']) assert.ok(ids.includes(id), `missing ${id} in ${ids}`);
    const relays = turn.threatsOf(scenario.enemies, scenario.objective, crew).find(t => t.id === 'relays');
    assert.equal(relays.covered, true, 'the starting engineer carries a demolition charge');
    const horde = turn.threatsOf(scenario.enemies, scenario.objective, crew).find(t => t.id === 'horde');
    assert.equal(horde.covered, false, 'lasguns alone are no answer to a cultist rush');
    const flamed = crewAt('w3-n4', starters({ c2: 'flamer' }));
    assert.equal(turn.threatsOf(scenario.enemies, scenario.objective, flamed.crew).find(t => t.id === 'horde').covered, true);
});

test('intel: a seize objective asks for two movers, and says when the squad only holds', () => {
    const everyoneHolds = Object.fromEntries(STARTING_CHARACTERS.map((_, i) => ['c' + i, 'hold']));
    const { scenario, crew } = crewAt('w2-n2', starters({}, everyoneHolds));
    const goal = turn.threatsOf(scenario.enemies, scenario.objective, crew).find(t => t.id === 'objective');
    assert.equal(goal.covered, false);
    const moving = crewAt('w2-n2', starters());
    assert.equal(turn.threatsOf(scenario.enemies, scenario.objective, moving.crew).find(t => t.id === 'objective').covered, true);
    // World 1's landing zone has nothing special.
    const landing = crewAt('w1-n1', starters());
    assert.deepEqual([...turn.threatsOf(landing.scenario.enemies, landing.scenario.objective, landing.crew)], []);
});

test('intel: a lost battle is explained, with the leader named when the objective was a kill', () => {
    const { scenario, crew } = crewAt('w3-n4', starters());
    let lost;
    for (let seed = 1; seed <= 30 && !lost; seed += 1) {
        const result = turn.runBattle({ board: scenario.board, units: [...crew, ...scenario.enemies], seed, objective: scenario.objective });
        if (result.outcome !== 'victory') lost = result;
    }
    assert.ok(lost, 'a fresh squad should lose the final boss at least once in 30 tries');
    const report = turn.diagnose([...crew, ...scenario.enemies], lost, scenario.objective);
    assert.equal(report.crew.length, 6);
    assert.ok(report.reasons.length > 0);
    assert.ok(report.reasons.some(r => r.title.includes('教派首領') || r.title.includes('廣播節點')), JSON.stringify(report.reasons));
    const dealt = report.crew.reduce((sum, l) => sum + l.dealt, 0);
    assert.ok(dealt > 0);
});

test('intel: a won battle names its best shooter and gives no reasons', () => {
    const { scenario, crew } = crewAt('w1-n1', starters());
    const result = turn.runBattle({ board: scenario.board, units: [...crew, ...scenario.enemies], seed: 7, objective: scenario.objective });
    assert.equal(result.outcome, 'victory');
    const report = turn.diagnose([...crew, ...scenario.enemies], result, scenario.objective);
    assert.ok(report.mvp);
    assert.deepEqual([...report.reasons], []);
});

function mount(file, db) {
    const handlers = {};
    const Router = () => {
        const add = method => (route, fn) => { handlers[`${method} ${route}`] = fn; };
        return { get: add('GET'), post: add('POST'), put: add('PUT'), delete: add('DELETE') };
    };
    loadTs(file, { mocks: { express: { Router }, '../db': { query: db.query, withTransaction: db.withTransaction } } });
    return async (method, route, { user = 'u1', body = {} } = {}) => {
        const res = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
        await handlers[`${method} ${route}`]({ user: { uid: user }, body, params: {}, query: {} }, res);
        return res;
    };
}

test('server: the preview fights the squad as it stands, writes nothing, and refuses locked ground', async () => {
    process.env.V15_ECONOMY = 'on';
    const db = createFakeDb();
    const ops = mount('server/src/routes/operations.ts', db);
    const roster = mount('server/src/routes/roster.ts', db);
    const { squads } = (await roster('GET', '/')).body;

    const entriesBefore = db.tables.reward_entries.length;
    const locked = await ops('POST', '/preview', { body: { squadId: squads[0].id, strongholdId: 'w2-n1' } });
    assert.equal(locked.code, 400);

    const res = await ops('POST', '/preview', { body: { squadId: squads[0].id, strongholdId: 'w1-n1' } });
    assert.equal(res.code, 200, res.body?.error);
    assert.equal(res.body.battles, 40);
    assert.ok(res.body.winRate >= 0 && res.body.winRate <= 1);
    assert.ok(Array.isArray(res.body.threats));
    const again = await ops('POST', '/preview', { body: { squadId: squads[0].id, strongholdId: 'w1-n1' } });
    assert.equal(again.body.winRate, res.body.winRate, 'fixed seeds: the same squad gets the same estimate');
    assert.equal(db.tables.operations.length, 0);
    assert.equal(db.tables.reward_entries.length, entriesBefore);
});
