const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { createFakeDb } = require('./helpers/fake-db.cjs');

const s = loadTs('shared/sector/campaign.ts');
const turn = loadTs('shared/battle/turn/index.ts');
const { CATALOG } = loadTs('shared/armory/catalog.ts');
const { RECRUITS } = loadTs('shared/roster/recruitment.ts');

const captured = (...ids) => new Set(ids);
const stateOf = (id, set) => s.strongholdState(s.strongholdById(id), set);

// ---- rules ----------------------------------------------------------------

test('campaign: only the landing zone is open at the start', () => {
    const none = captured();
    assert.equal(stateOf('w1-n1', none), 'open');
    for (const other of s.STRONGHOLDS.filter(x => x.id !== 'w1-n1')) assert.equal(stateOf(other.id, none), 'locked', other.id);
});

test('campaign: capturing the first stronghold opens both branches, and the fourth needs both', () => {
    const one = captured('w1-n1');
    assert.equal(stateOf('w1-n2', one), 'open');
    assert.equal(stateOf('w1-n3', one), 'open');
    assert.equal(stateOf('w1-n4', one), 'locked');
    assert.equal(stateOf('w1-n4', captured('w1-n1', 'w1-n2')), 'locked');
    assert.equal(stateOf('w1-n4', captured('w1-n1', 'w1-n2', 'w1-n3')), 'open');
});

test('campaign: a stronghold whose battle is not built yet reads as pending, not open', () => {
    const before = captured('w1-n1', 'w1-n2', 'w1-n3', 'w1-n4', 'w2-n1', 'w2-n2', 'w2-n3', 'w2-n4', 'w3-n1', 'w3-n2', 'w3-n3');
    const last = s.strongholdById('w3-n4');
    if (last.scenarioId) return; // built in C3; nothing to check then
    assert.equal(stateOf('w3-n4', before), 'pending');
    const check = s.checkAttack('w3-n4', before);
    assert.equal(check.ok, false);
    assert.match(check.reason, /準備中/);
});

test('campaign: every built stronghold after world 1 asks for something, and names it', () => {
    const kinds = new Set();
    for (const x of s.STRONGHOLDS.filter(x => x.scenarioId)) {
        const scenario = turn.scenarioById(x.scenarioId);
        kinds.add(scenario.objective?.kind ?? 'eliminate');
        assert.ok(turn.objectiveText(scenario).length > 0);
        if (scenario.objective?.kind === 'assassinate') {
            assert.ok(scenario.enemies.some(e => e.id === scenario.objective.targetId), `${x.id} marks a missing target`);
        }
    }
    for (const kind of ['eliminate', 'seize', 'hold', 'rescue', 'assassinate']) assert.ok(kinds.has(kind), `no stronghold uses ${kind}`);
});

test('campaign: worlds 2 and 3 bring the vehicles and the cult the user asked for', () => {
    const enemiesOf = world => s.STRONGHOLDS.filter(x => x.world === world && x.scenarioId)
        .flatMap(x => turn.scenarioById(x.scenarioId).enemies);
    assert.ok(enemiesOf(1).every(e => e.armourType !== 'vehicle' && e.duty !== 'cultist'), 'world 1 is infantry only');
    assert.ok(enemiesOf(2).some(e => e.duty === 'walker'), 'world 2 has walkers');
    assert.ok(enemiesOf(3).some(e => e.duty === 'tank'), 'world 3 has a Chimera');
    assert.ok(enemiesOf(3).filter(e => e.duty === 'cultist').length >= 10, 'world 3 is thick with cultists');
});

test('campaign: attacking names what has to fall first, and a captured stronghold can be fought again', () => {
    const locked = s.checkAttack('w1-n4', captured('w1-n1'));
    assert.equal(locked.ok, false);
    assert.match(locked.reason, /補給港/);
    assert.match(locked.reason, /通訊塔/);

    const replay = s.checkAttack('w1-n1', captured('w1-n1'));
    assert.equal(replay.ok, true);
    assert.equal(replay.firstCapture, false);
    assert.equal(s.checkAttack('w1-n1', captured()).firstCapture, true);
    assert.equal(s.checkAttack('nowhere', captured()).ok, false);
});

test('campaign: the map is well formed', () => {
    const ids = new Set(s.STRONGHOLDS.map(x => x.id));
    assert.equal(s.STRONGHOLDS.length, 12);
    for (const world of s.WORLDS) {
        const own = s.STRONGHOLDS.filter(x => x.world === world.id);
        assert.equal(own.length, 4, `world ${world.id}`);
        assert.ok(own.find(x => x.index === 4).boss, `world ${world.id} ends in a boss`);
    }
    for (const x of s.STRONGHOLDS) {
        for (const r of x.requires) assert.ok(ids.has(r), `${x.id} requires unknown ${r}`);
        if (x.scenarioId) assert.ok(turn.scenarioById(x.scenarioId), `${x.id} names a missing scenario`);
    }
    // No cycles: every stronghold is reachable by capturing in order.
    const taken = new Set();
    for (let pass = 0; pass < 12; pass += 1) for (const x of s.STRONGHOLDS) if (x.requires.every(r => taken.has(r))) taken.add(x.id);
    assert.equal(taken.size, 12);
});

test('campaign: every restricted item and recruit is opened by exactly one stronghold', () => {
    // Astartes and Sororitas gear go through ascension and joint operations,
    // not the sector campaign (design §2.3).
    const excludedGear = CATALOG.filter(i => i.origins).map(i => i.id);
    const gear = CATALOG.filter(i => i.restricted && !excludedGear.includes(i.id)).map(i => i.id);
    const people = RECRUITS.filter(r => r.restricted && r.id !== 'battle-sister').map(r => r.id);
    const count = (list, key) => s.STRONGHOLDS.filter(x => x.unlocks[key].includes(list)).length;
    for (const id of gear) assert.equal(count(id, 'equipment'), 1, id);
    for (const id of people) assert.equal(count(id, 'personnel'), 1, id);
    for (const x of s.STRONGHOLDS) {
        for (const id of x.unlocks.equipment) assert.ok(CATALOG.find(i => i.id === id), id);
        for (const id of x.unlocks.personnel) assert.ok(RECRUITS.find(r => r.id === id), id);
    }
});

test('campaign: records come from operations, first capture keeps its squad', () => {
    const ops = [
        { strongholdId: 'w1-n1', outcome: 'defeat', at: '2026-09-27T01:00:00Z', crewIds: ['a', 'b'] },
        { strongholdId: 'w1-n1', outcome: 'victory', at: '2026-09-27T02:00:00Z', crewIds: ['a', 'c'] },
        { strongholdId: 'w1-n1', outcome: 'victory', at: '2026-09-28T02:00:00Z', crewIds: ['d'] },
        { strongholdId: 'standard', outcome: 'victory', at: '2026-09-20T02:00:00Z', crewIds: ['a'] },
    ];
    const campaign = s.campaignFrom(ops);
    const n1 = campaign.strongholds.find(x => x.id === 'w1-n1');
    assert.equal(n1.state, 'captured');
    assert.equal(n1.attempts, 3);
    assert.equal(n1.defeats, 1);
    assert.deepEqual([...n1.capturedBy], ['a', 'c']);
    assert.equal(n1.capturedAt, '2026-09-27T02:00:00Z');
    // The phase-one scenario is not a stronghold and leaves no trace.
    assert.equal(campaign.service.a.length, 2);
    assert.deepEqual([...campaign.service.a.map(e => e.firstCapture)], [false, true]);
    assert.equal(campaign.service.d[0].firstCapture, false);
    assert.equal(campaign.recovered, false);
});

// ---- server ---------------------------------------------------------------

function mount(file, db) {
    const handlers = {};
    const Router = () => {
        const add = method => (route, fn) => { handlers[`${method} ${route}`] = fn; };
        return { get: add('GET'), post: add('POST'), put: add('PUT'), delete: add('DELETE') };
    };
    loadTs(file, { mocks: { express: { Router }, '../db': { query: db.query, withTransaction: db.withTransaction } } });
    return async (method, route, { user = 'u1', body = {}, params = {} } = {}) => {
        const res = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
        await handlers[`${method} ${route}`]({ user: { uid: user }, body, params, query: {} }, res);
        return res;
    };
}

function setup() {
    process.env.V15_ECONOMY = 'on';
    const db = createFakeDb();
    return {
        db,
        ops: mount('server/src/routes/operations.ts', db),
        roster: mount('server/src/routes/roster.ts', db),
        armory: mount('server/src/routes/armory.ts', db),
    };
}

const TODAY = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const completeCore = db => db.tables.reward_entries.push({
    user_id: 'u1', seq: db.tables.reward_entries.length + 1, source_key: `core:${TODAY()}:t1`,
    kind: 'grant', amount: 10, day: TODAY(), at: new Date().toISOString(), reason: '完成今日核心',
});
/** A won operation already on the books, so a stronghold counts as captured. */
const wonAt = (db, strongholdId) => db.tables.operations.push({
    id: `past-${strongholdId}`, user_id: 'u1', squad_id: 'x', scenario_id: strongholdId, seed: 1, crew: [], trainee_ids: [],
    outcome: 'victory', pays_xp: true, engine: 'v2', board: null, rounds: 5, stronghold_id: strongholdId, started_at: new Date(0),
});

/** Attacks until the squad wins, healing it between tries. Returns the winning response. */
async function winAt(env, squadId, strongholdId) {
    for (let i = 0; i < 25; i += 1) {
        const res = await env.ops('POST', '/', { body: { squadId, strongholdId } });
        assert.equal(res.code, 201, res.body?.error);
        if (res.body.operation.outcome === 'victory') return res;
        for (const row of env.db.tables.roster_characters) row.wounded_day = null;
    }
    throw new Error(`no victory at ${strongholdId} in 25 tries`);
}

test('server: a locked stronghold is refused and nothing is written', async () => {
    const env = setup();
    const { squads } = (await env.roster('GET', '/')).body;
    completeCore(env.db);
    const res = await env.ops('POST', '/', { body: { squadId: squads[0].id, strongholdId: 'w1-n2' } });
    assert.equal(res.code, 400);
    assert.match(res.body.error, /登陸場/);
    assert.equal(env.db.tables.operations.length, 0);
});

test('server: an old page sending a scenario id is told to refresh', async () => {
    const env = setup();
    const { squads } = (await env.roster('GET', '/')).body;
    completeCore(env.db);
    const res = await env.ops('POST', '/', { body: { squadId: squads[0].id, scenarioId: 'standard' } });
    assert.equal(res.code, 400);
    assert.match(res.body.error, /重新整理/);
});

test('server: the first capture opens what the stronghold holds and pays a bonus; a replay does neither', async () => {
    const env = setup();
    const { squads } = (await env.roster('GET', '/')).body;
    completeCore(env.db);
    wonAt(env.db, 'w1-n1');

    const first = await winAt(env, squads[0].id, 'w1-n2');
    assert.equal(first.body.firstCapture, true);
    assert.deepEqual([...first.body.unlocked.equipment], ['carapace-armour']);
    assert.ok(env.db.tables.equipment_authorizations.some(r => r.catalog_id === 'carapace-armour'));
    assert.equal(first.body.awards[0].amount, 60 + s.FIRST_CAPTURE_XP);
    assert.equal(first.body.operation.strongholdId, 'w1-n2');

    for (const row of env.db.tables.roster_characters) row.wounded_day = null;
    const again = await winAt(env, squads[0].id, 'w1-n2');
    assert.equal(again.body.firstCapture, false);
    assert.deepEqual([...again.body.unlocked.equipment], []);
    assert.equal(again.body.awards[0].amount, 60);
    assert.equal(env.db.tables.equipment_authorizations.filter(r => r.catalog_id === 'carapace-armour').length, 1);
});

test('server: a pile of won operations no longer grants anything by itself', async () => {
    const env = setup();
    const { squads } = (await env.roster('GET', '/')).body;
    completeCore(env.db);
    // Thirty old wins with no stronghold: under the retired ladder that was everything.
    for (let i = 0; i < 30; i += 1) {
        env.db.tables.operations.push({ id: `old${i}`, user_id: 'u1', squad_id: 'x', scenario_id: 'standard', seed: 1, crew: [], trainee_ids: [], outcome: 'victory', pays_xp: true, engine: 'v2', board: null, rounds: 5, stronghold_id: null, started_at: new Date(0) });
    }
    await winAt(env, squads[0].id, 'w1-n1');
    assert.equal(env.db.tables.equipment_authorizations.length, 0, 'the landing zone opens nothing, and the old count opens nothing');
    assert.equal(env.db.tables.personnel_authorizations.length, 0);
});

test('server: the campaign endpoint reports captures and each soldier\'s service record', async () => {
    const env = setup();
    const { squads } = (await env.roster('GET', '/')).body;
    completeCore(env.db);
    await winAt(env, squads[0].id, 'w1-n1');

    const res = await env.ops('GET', '/campaign');
    assert.equal(res.code, 200);
    const n1 = res.body.strongholds.find(x => x.id === 'w1-n1');
    assert.equal(n1.state, 'captured');
    assert.deepEqual([...n1.capturedBy].sort(), [...squads[0].memberIds].sort());
    assert.equal(res.body.strongholds.find(x => x.id === 'w1-n2').state, 'open');
    const record = res.body.service[squads[0].memberIds[0]];
    assert.ok(record.some(e => e.strongholdId === 'w1-n1' && e.firstCapture));
});

test('server: the starting kit is issued once, armed on the starting squad, and cannot be sold', async () => {
    const env = setup();
    const { characters } = (await env.roster('GET', '/')).body;
    const kit = env.db.tables.equipment_items.filter(r => r.id.startsWith('kit-'));
    assert.equal(kit.length, 12);
    for (const character of characters) {
        const held = kit.filter(r => r.assigned_to === character.id).map(r => r.catalog_id).sort();
        assert.deepEqual(held, ['lasgun', 'laspistol'], character.name);
    }
    assert.ok(kit.every(r => r.paid === 0));

    await env.roster('GET', '/');
    await env.armory('GET', '/');
    assert.equal(env.db.tables.equipment_items.filter(r => r.id.startsWith('kit-')).length, 12, 'issued once');

    const sold = await env.armory('DELETE', '/items/:id', { params: { id: kit[0].id } });
    assert.equal(sold.code, 400);
    assert.match(sold.body.error, /起始配發/);
});

test('campaign: worlds 2 and 3 field enemy medics and engineers with their kits', () => {
    const support = s.STRONGHOLDS.filter(x => x.world >= 2 && x.scenarioId)
        .flatMap(x => turn.scenarioById(x.scenarioId).enemies)
        .filter(e => (e.duty === 'medic' && (e.tools ?? []).includes('medicae-kit')) || (e.duty === 'engineer' && (e.tools ?? []).includes('engineering-kit')));
    assert.ok(support.some(e => e.duty === 'medic'), 'no enemy medic carries a medicae kit');
    assert.ok(support.some(e => e.duty === 'engineer'), 'no enemy engineer carries an engineering kit');
    const world1 = s.STRONGHOLDS.filter(x => x.world === 1).flatMap(x => turn.scenarioById(x.scenarioId).enemies);
    assert.ok(world1.every(e => !(e.tools ?? []).length), 'world 1 stays without enemy support');
});

/** The six starters in lasgun and flak, placed and crewed the way the server does it. */
function fieldCrew(scenario) {
    const { STARTING_CHARACTERS } = loadTs('shared/roster/characters.ts');
    const members = STARTING_CHARACTERS.map((c, i) => ({ id: 'c' + i, name: c.name, origin: c.origin, duty: c.duty, xp: 0, health: 'fit', recruitedAt: '' }));
    const items = members.flatMap(m => ['lasgun', 'laspistol', 'flak-armour'].map((catalogId, k) => ({ id: m.id + k, catalogId, assignedTo: m.id, paid: 0, acquiredAt: '' })));
    const built = turn.crewFor(members, items, turn.placementsFor(scenario.board, members, undefined));
    return turn.assignHeavyCrew(turn.resolveGuards(built.units));
}

test('campaign: an enemy medic with a kit actually patches up an ally', () => {
    const w = turn.scenarioById('w2-n3');
    const medic = w.enemies.find(e => e.duty === 'medic');
    assert.ok(medic, 'w2-n3 has no medic');
    let healed = false;
    for (let seed = 1; seed <= 40 && !healed; seed += 1) {
        const result = turn.runBattle({ board: w.board, units: [...w.enemies, ...fieldCrew(w)], seed, objective: w.objective });
        healed = result.activations.some(a => a.unitId === medic.id && a.activities.some(x => x.kind === 'heal'));
    }
    assert.ok(healed, 'the enemy medic never healed anyone in 40 battles');
});
