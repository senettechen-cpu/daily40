const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { createFakeDb } = require('./helpers/fake-db.cjs');

const a = loadTs('shared/ascension/index.ts');
const roster = loadTs('shared/roster/index.ts');
const turn = loadTs('shared/battle/turn/index.ts');

const recs = (stage, counts, day = '2026-09-01') => Object.entries(counts)
    .flatMap(([domain, n]) => Array.from({ length: n }, () => ({ domain, stage, day })));

// ---- catalogue (handoff §9, items 1, 2, 11) -------------------------------

test('ascension: nineteen standard organs in five stages of 3/3/5/7/1; the Primaris three never count', () => {
    assert.equal(a.STANDARD_ORGANS.length, 19);
    assert.equal(new Set(a.STANDARD_ORGANS.map(o => o.id)).size, 19);
    assert.equal(a.ORGANS.filter(o => !o.enabled).length, 3);
    assert.deepEqual([...a.STAGES.map(s => s.organIds.length)], [3, 3, 5, 7, 1]);
    const staged = a.STAGES.flatMap(s => s.organIds);
    assert.deepEqual([...staged].sort(), [...a.STANDARD_ORGANS.map(o => o.id)].sort());
    assert.deepEqual([...a.STAGES[4].organIds], ['black-carapace']);
    assert.deepEqual([...a.organsThrough(5)].length, 19);
});

test('ascension: a hundred records in 12/16/20/24/28, one domain capped at 75%', () => {
    assert.deepEqual([...a.STAGES.map(s => s.records)], [12, 16, 20, 24, 28]);
    assert.equal(a.STAGES.reduce((sum, s) => sum + s.records, 0), 100);
    assert.deepEqual([...a.STAGES.map(s => s.maxOneDomain)], [9, 12, 15, 18, 21]);
    for (const s of a.STAGES) assert.equal(s.maxOneDomain, Math.floor(s.records * 0.75));
    assert.deepEqual([...a.STAGES.map(s => s.hp)], [110, 120, 130, 130, 160]);
});

// ---- records --------------------------------------------------------------

test('ascension: one domain alone never fills a stage; two domains do', () => {
    const one = a.stageStanding(a.STAGES[0], recs(1, { health: 12 }));
    assert.equal(one.counted, 9);
    assert.equal(one.full, false);
    const two = a.stageStanding(a.STAGES[0], recs(1, { health: 9, learning: 3 }));
    assert.equal(two.counted, 12);
    assert.equal(two.full, true);
    // Records of another stage do not count here.
    assert.equal(a.stageStanding(a.STAGES[1], recs(1, { health: 9, learning: 3 })).counted, 0);
});

test('ascension: a full stage, a capped domain and a second finance review in a week are refused', () => {
    assert.match(a.recordRefusal(0, recs(1, { health: 9, learning: 3 }), 'care', '2026-09-02'), /已滿/);
    assert.match(a.recordRefusal(0, recs(1, { health: 9 }), 'health', '2026-09-02'), /最多計入 9/);
    assert.equal(a.recordRefusal(0, recs(1, { health: 8 }), 'health', '2026-09-02'), null);

    const finance = [{ domain: 'finance', stage: 1, day: '2026-09-21' }]; // a Monday
    assert.match(a.recordRefusal(0, finance, 'finance', '2026-09-27'), /每週/); // the Sunday after
    assert.equal(a.recordRefusal(0, finance, 'finance', '2026-09-28'), null); // next Monday
    assert.equal(a.weekOf('2026-09-27'), '2026-09-21');
    assert.match(a.recordRefusal(5, [], 'health', '2026-09-02'), /五個階段/);
});

// ---- the daily designation (no 09:00 deadline; designate first) ----------

test('ascension: the plan takes one candidate and two tasks in different domains, designated before they are done', () => {
    const ctx = { candidateIds: ['c1', 'c2'], completedTaskIds: ['done'], recordedTaskIds: [] };
    const empty = a.emptyPlan('2026-09-27');
    const plan = (candidateId, ...slots) => ({ day: '2026-09-27', candidateId, slots });
    assert.equal(a.planRefusal(empty, plan('c1', { taskId: 't1', domain: 'health' }, { taskId: 't2', domain: 'learning' }), ctx), null);
    assert.match(a.planRefusal(empty, plan('c1', { taskId: 't1', domain: 'health' }, { taskId: 't2', domain: 'health' }), ctx), /不同領域/);
    assert.match(a.planRefusal(empty, plan('c1', { taskId: 't1', domain: 'health' }, { taskId: 't2', domain: 'care' }, { taskId: 't3', domain: 'social' }), ctx), /最多/);
    assert.match(a.planRefusal(empty, plan(null, { taskId: 't1', domain: 'health' }), ctx), /候選人/);
    assert.match(a.planRefusal(empty, plan('stranger'), ctx), /不是培養中/);
    assert.match(a.planRefusal(empty, plan('c1', { taskId: 'done', domain: 'health' }), ctx), /事後指定/);
});

test('ascension: once a record lands the candidate is fixed and that slot cannot move', () => {
    const current = { day: '2026-09-27', candidateId: 'c1', slots: [{ taskId: 't1', domain: 'health' }] };
    const ctx = { candidateIds: ['c1', 'c2'], completedTaskIds: ['t1'], recordedTaskIds: ['t1'] };
    assert.match(a.planRefusal(current, { ...current, candidateId: 'c2' }, ctx), /不能再換候選人/);
    assert.match(a.planRefusal(current, { ...current, slots: [] }, ctx), /不能取消/);
    assert.match(a.planRefusal(current, { ...current, slots: [{ taskId: 't1', domain: 'care' }] }, ctx), /不能取消或改領域/);
    // Adding the second, still-open slot is fine.
    assert.equal(a.planRefusal(current, { ...current, slots: [...current.slots, { taskId: 't2', domain: 'care' }] }, ctx), null);
    // Before any record, switching candidates is allowed.
    assert.equal(a.planRefusal(current, { ...current, candidateId: 'c2' }, { ...ctx, recordedTaskIds: [], completedTaskIds: [] }), null);
});

// ---- implants (handoff §9, item 3) ----------------------------------------

test('ascension: a stage needs its records, its mission and the stage before it', () => {
    const full1 = recs(1, { health: 9, learning: 3 });
    assert.match(a.implantRefusal(1, { stage: 0, records: [], missionsWon: [1] }), /還差 12 筆/);
    assert.match(a.implantRefusal(1, { stage: 0, records: full1, missionsWon: [] }), /適應評估/);
    assert.equal(a.implantRefusal(1, { stage: 0, records: full1, missionsWon: [1] }), null);
    assert.match(a.implantRefusal(2, { stage: 0, records: full1, missionsWon: [1, 2] }), /先完成第 1 階/);
    assert.match(a.implantRefusal(1, { stage: 1, records: full1, missionsWon: [1] }), /已經植入/);
    // Stage V: all eighteen before it (stage 4 implanted), 28 records and the armour trial.
    const full5 = recs(5, { health: 21, learning: 7 });
    assert.match(a.implantRefusal(5, { stage: 3, records: full5, missionsWon: [5] }), /先完成第 4 階/);
    assert.match(a.implantRefusal(5, { stage: 4, records: full5, missionsWon: [] }), /裝甲介面/);
    assert.equal(a.implantRefusal(5, { stage: 4, records: full5, missionsWon: [5] }), null);
});

test('ascension: health follows the stage baseline, replaced not stacked (handoff §9, item 8)', () => {
    const aspirant = { origin: 'aspirant', xp: 0, ascensionRoute: 'new-aspirant' };
    assert.equal(roster.maxHp({ ...aspirant, ascensionStage: 0 }), 100);
    assert.equal(roster.maxHp({ ...aspirant, ascensionStage: 1 }), 110);
    assert.equal(roster.maxHp({ ...aspirant, ascensionStage: 2 }), 120);
    assert.equal(roster.maxHp({ ...aspirant, ascensionStage: 4 }), 130);
    assert.equal(roster.maxHp({ origin: 'astartes', xp: 0, ascensionStage: 5 }), 160);
    assert.equal(roster.maxHp({ origin: 'astartes', xp: 2700, ascensionStage: 5 }), 189);
    assert.equal(roster.maxHp({ origin: 'cadian', xp: 2700, ascensionStage: 2, ascensionRoute: 'original-existing-soldier' }), 142);
    assert.equal(roster.BASE_ACCURACY.aspirant, 75);
    assert.equal(roster.BASE_ACCURACY.astartes, 80);
    assert.equal(roster.inAscension({ ...aspirant }), true);
    assert.equal(roster.inAscension({ origin: 'astartes', ascensionRoute: 'new-aspirant' }), false);
    assert.equal(roster.inAscension({ origin: 'cadian' }), false);
});

// ---- missions -------------------------------------------------------------

const soldier = (id, extra = {}) => ({ id, name: id, origin: 'cadian', duty: 'rifleman', xp: 0, health: 'fit', recruitedAt: '', ...extra });
const cand = (id, stage) => soldier(id, { origin: 'aspirant', ascensionRoute: 'new-aspirant', ascensionStage: stage });

test('ascension: each world boss opens one escort, and each escort is won once', () => {
    const [e1, e2, e3] = a.ESCORT_MISSIONS;
    assert.deepEqual([...a.ESCORT_MISSIONS.map(m => m.after)], ['w1-n4', 'w2-n4', 'w3-n4']);
    assert.equal(a.escortState(e1, new Set(), new Set()), 'locked');
    assert.equal(a.escortState(e1, new Set(['w1-n4']), new Set()), 'open');
    assert.equal(a.escortState(e1, new Set(['w1-n4']), new Set(['escort-1'])), 'won');
    assert.equal(a.escortState(e2, new Set(['w1-n4']), new Set()), 'locked');
    assert.equal(a.escortState(e3, new Set(['w3-n4']), new Set()), 'open');
});

test('ascension: a candidate in training fights only their own stage mission', () => {
    const squad = [cand('k', 0), soldier('b'), soldier('c')];
    assert.match(a.strongholdSquadError(squad), /只能出自己的人物任務/);
    assert.equal(a.strongholdSquadError([soldier('b')]), null);
    assert.equal(a.strongholdSquadError([soldier('g', { origin: 'astartes', ascensionRoute: 'new-aspirant', ascensionStage: 5 })]), null);

    const ctx = { captured: new Set(), escortsWon: new Set(), stagesWon: [] };
    const stage1 = a.missionById('stage-1');
    assert.equal(a.missionSquadError(stage1, squad, squad[0], ctx), null);
    assert.match(a.missionSquadError(a.missionById('stage-2'), squad, squad[0], ctx), /第 1 階/);
    assert.match(a.missionSquadError(stage1, [soldier('b')], squad[0], ctx), /必須在出戰編成/);
    assert.match(a.missionSquadError(stage1, [...squad, cand('z', 0)], squad[0], ctx), /z 也在接受改造/);
    assert.match(a.missionSquadError(stage1, squad, squad[0], { ...ctx, stagesWon: [1] }), /已經通過/);
    assert.match(a.missionSquadError(stage1, squad, undefined, ctx), /培養中的候選人/);
    assert.match(a.missionSquadError(a.missionById('escort-1'), [soldier('b')], undefined, ctx), /首領據點/);
    assert.match(a.missionSquadError(a.missionById('escort-1'), squad, undefined, { ...ctx, captured: new Set(['w1-n4']) }), /只能出自己的人物任務/);
});

test('ascension: every mission has a built battle whose objective makes sense', () => {
    for (const mission of a.MISSIONS) {
        const scenario = turn.scenarioById(mission.scenarioId);
        assert.ok(scenario, mission.id);
        assert.ok(scenario.enemies.length > 0, mission.id);
        const tiles = new Set();
        for (const enemy of scenario.enemies) {
            const key = `${enemy.at.col},${enemy.at.row}`;
            assert.ok(!tiles.has(key), `${mission.id}: two enemies on ${key}`);
            tiles.add(key);
            assert.notEqual(scenario.board.tiles[key], 'block', `${mission.id}: ${enemy.id} stands in a wall`);
        }
        if (scenario.objective?.kind === 'assassinate') assert.ok(scenario.enemies.some(e => e.id === scenario.objective.targetId));
        assert.ok(turn.objectiveText(scenario).length > 0);
    }
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
        asc: mount('server/src/routes/ascension.ts', db),
        ops: mount('server/src/routes/operations.ts', db),
        roster: mount('server/src/routes/roster.ts', db),
        armory: mount('server/src/routes/armory.ts', db),
        tasks: mount('server/src/routes/tasks.ts', db),
    };
}

const TODAY = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const completeCore = db => db.tables.reward_entries.push({
    user_id: 'u1', seq: db.tables.reward_entries.length + 1, source_key: `core:${TODAY()}:t0`,
    kind: 'grant', amount: 10, day: TODAY(), at: new Date().toISOString(), reason: '完成今日核心',
});
const wonAt = (db, strongholdId) => db.tables.operations.push({
    id: `past-${strongholdId}`, user_id: 'u1', squad_id: 'x', scenario_id: strongholdId, seed: 1, crew: [], trainee_ids: [],
    outcome: 'victory', pays_xp: true, engine: 'v2', board: null, rounds: 5, stronghold_id: strongholdId, started_at: new Date(0),
});
const missionWon = (db, missionId, candidateId) => db.tables.operations.push({
    id: `past-${missionId}-${candidateId}`, user_id: 'u1', squad_id: 'x', scenario_id: `asc-${missionId}`, seed: 1, crew: [], trainee_ids: [],
    outcome: 'victory', pays_xp: true, engine: 'v2', board: null, rounds: 5, stronghold_id: null, mission_id: missionId, candidate_id: candidateId, started_at: new Date(0),
});
const heal = db => { for (const row of db.tables.roster_characters) row.wounded_day = null; };
const giveRecords = (db, candidateId, stage, counts) => {
    for (const [domain, n] of Object.entries(counts)) {
        for (let i = 0; i < n; i += 1) {
            db.tables.growth_records.push({ user_id: 'u1', source_key: `seed:${candidateId}:${stage}:${domain}:${i}`, candidate_id: candidateId, stage, domain, day: '2026-09-01', task_id: `seed${i}` });
        }
    }
};

async function winMission(env, body) {
    for (let i = 0; i < 30; i += 1) {
        const res = await env.ops('POST', '/', { body });
        assert.equal(res.code, 201, res.body?.error);
        if (res.body.operation.outcome === 'victory') return res;
        heal(env.db);
    }
    throw new Error(`no victory in ${body.missionId} after 30 tries`);
}

/** An account whose first escort has been won: the six starters plus one aspirant. */
async function withAspirant() {
    const env = setup();
    const { squads } = (await env.roster('GET', '/')).body;
    await env.armory('GET', '/');
    completeCore(env.db);
    wonAt(env.db, 'w1-n4');
    const won = await winMission(env, { squadId: squads[0].id, missionId: 'escort-1' });
    heal(env.db);
    return { env, squad: squads[0], aspirant: won.body.aspirant, won };
}

test('server: the escort is closed until the world boss falls, and its first win brings one armed aspirant', async () => {
    const env = setup();
    const { squads } = (await env.roster('GET', '/')).body;
    completeCore(env.db);
    const early = await env.ops('POST', '/', { body: { squadId: squads[0].id, missionId: 'escort-1' } });
    assert.equal(early.code, 400);
    assert.match(early.body.error, /首領據點/);

    const { env: e2, aspirant, won } = await withAspirant();
    assert.equal(won.body.operation.missionId, 'escort-1');
    assert.equal(won.body.operation.strongholdId, undefined);
    assert.equal(aspirant.name, '盧西烏斯');
    const row = e2.db.tables.roster_characters.find(r => r.id === aspirant.id);
    assert.equal(row.origin, 'aspirant');
    assert.equal(row.ascension_route, 'new-aspirant');
    const kit = e2.db.tables.equipment_items.filter(i => i.assigned_to === aspirant.id).map(i => i.catalog_id).sort();
    assert.deepEqual(kit, ['lasgun', 'laspistol']);

    // The escort is done; the campaign map does not count it as a stronghold.
    const again = await e2.ops('POST', '/', { body: { squadId: e2.db.tables.squads[0].id, missionId: 'escort-1' } });
    assert.equal(again.code, 400);
    assert.match(again.body.error, /已經護送完成/);
    assert.equal(e2.db.tables.roster_characters.length, 7);
    const view = (await e2.asc('GET', '/')).body;
    assert.equal(view.escorts.find(x => x.id === 'escort-1').state, 'won');
    assert.equal(view.escorts.find(x => x.id === 'escort-2').state, 'locked');
    assert.equal(view.candidates.length, 1);
});

test('server: an aspirant cannot attack a stronghold, but fights their own stage mission', async () => {
    const { env, squad, aspirant } = await withAspirant();
    const members = [aspirant.id, ...squad.memberIds.slice(1)];
    env.db.tables.squads[0].member_ids = members;
    const refused = await env.ops('POST', '/', { body: { squadId: squad.id, strongholdId: 'w1-n1' } });
    assert.equal(refused.code, 400);
    assert.match(refused.body.error, /只能出自己的人物任務/);

    const noCandidate = await env.ops('POST', '/', { body: { squadId: squad.id, missionId: 'stage-1' } });
    assert.equal(noCandidate.code, 400);
    const won = await winMission(env, { squadId: squad.id, missionId: 'stage-1', candidateId: aspirant.id });
    assert.equal(won.body.operation.candidateId, aspirant.id);
    const view = (await env.asc('GET', '/')).body;
    assert.deepEqual([...view.candidates[0].stagesWon], [1]);
});

test('server: a designated task becomes one record for the plan\'s candidate; nothing else does', async () => {
    const { env, aspirant } = await withAspirant();
    for (const id of ['t1', 't2', 't3']) env.db.tables.tasks.push({ id, user_id: 'u1', title: id, status: 'active' });

    const saved = await env.asc('PUT', '/plan', { body: { candidateId: aspirant.id, slots: [{ taskId: 't1', domain: 'health' }, { taskId: 't2', domain: 'learning' }] } });
    assert.equal(saved.code, 200, saved.body?.error);

    const done = await env.tasks('PUT', '/:id', { params: { id: 't1' }, body: { lastCompletedAt: new Date().toISOString() } });
    assert.equal(done.body.growth.recorded, true);
    assert.equal(done.body.growth.domain, 'health');
    // The same completion sent again lands once.
    await env.tasks('PUT', '/:id', { params: { id: 't1' }, body: { lastCompletedAt: new Date().toISOString() } });
    // An undesignated task earns nothing.
    const other = await env.tasks('PUT', '/:id', { params: { id: 't3' }, body: { lastCompletedAt: new Date().toISOString() } });
    assert.equal(other.body.growth, null);
    assert.equal(env.db.tables.growth_records.length, 1);
    assert.equal(env.db.tables.growth_records[0].candidate_id, aspirant.id);
    assert.equal(env.db.tables.growth_records[0].stage, 1);

    // t3 is done now, so it cannot be designated after the fact; the recorded slot cannot move.
    const late = await env.asc('PUT', '/plan', { body: { candidateId: aspirant.id, slots: [{ taskId: 't1', domain: 'health' }, { taskId: 't3', domain: 'care' }] } });
    assert.equal(late.code, 400);
    assert.match(late.body.error, /事後指定/);
    const moved = await env.asc('PUT', '/plan', { body: { candidateId: aspirant.id, slots: [{ taskId: 't2', domain: 'learning' }] } });
    assert.equal(moved.code, 400);
    // Records are not currency: the reward book only saw the core.
    assert.ok(env.db.tables.reward_entries.every(r => !r.source_key.startsWith('growth')));
});

test('server: implanting a stage is whole, idempotent, and uses only that candidate\'s records', async () => {
    const { env, squad, aspirant } = await withAspirant();
    // A second candidate on the original branch.
    const vet = env.db.tables.roster_characters.find(r => r.id === squad.memberIds[1]);
    vet.xp = 2700;
    const applied = await env.asc('POST', '/original', { body: { characterId: vet.id, acknowledged: true } });
    assert.equal(applied.code, 201, applied.body?.error);

    giveRecords(env.db, aspirant.id, 1, { health: 9, learning: 3 });
    const early = await env.asc('POST', '/candidates/:id/implant', { params: { id: aspirant.id }, body: { stage: 1 } });
    assert.equal(early.code, 400);
    assert.match(early.body.error, /適應評估/);

    missionWon(env.db, 'stage-1', aspirant.id);
    missionWon(env.db, 'stage-1', vet.id);
    const itemsBefore = env.db.tables.equipment_items.length;
    const ok = await env.asc('POST', '/candidates/:id/implant', { params: { id: aspirant.id }, body: { stage: 1 } });
    assert.equal(ok.code, 200, ok.body?.error);
    assert.deepEqual([...ok.body.organIds], [...a.STAGES[0].organIds]);
    const resend = await env.asc('POST', '/candidates/:id/implant', { params: { id: aspirant.id }, body: { stage: 1 } });
    assert.equal(resend.body.already, true);
    assert.equal(env.db.tables.ascension_implants.length, 1);
    assert.equal(env.db.tables.roster_characters.find(r => r.id === aspirant.id).ascension_stage, 1);
    assert.equal(env.db.tables.equipment_items.length, itemsBefore, 'a stage grants no items');
    assert.equal(env.db.tables.roster_characters.length, 7, 'and no characters');

    // The veteran won the mission but has no records of their own.
    const other = await env.asc('POST', '/candidates/:id/implant', { params: { id: vet.id }, body: { stage: 1 } });
    assert.equal(other.code, 400);
    assert.match(other.body.error, /還差 12 筆/);
});

test('server: stage V makes the same soldier astartes, returns human gear and loans the kit once', async () => {
    const { env, aspirant } = await withAspirant();
    const row = env.db.tables.roster_characters.find(r => r.id === aspirant.id);
    row.ascension_stage = 4;
    giveRecords(env.db, aspirant.id, 5, { health: 21, care: 7 });
    missionWon(env.db, 'stage-5', aspirant.id);
    // A flak vest bought for them while they were human.
    env.db.tables.equipment_items.push({ id: 'vest', user_id: 'u1', catalog_id: 'flak-armour', assigned_to: aspirant.id, paid: 60, acquired_at: new Date() });

    const res = await env.asc('POST', '/candidates/:id/implant', { params: { id: aspirant.id }, body: { stage: 5 } });
    assert.equal(res.code, 200, res.body?.error);
    assert.equal(row.origin, 'astartes');
    assert.equal(row.ascension_route, 'new-aspirant', 'the route stays as their tag');
    const held = env.db.tables.equipment_items.filter(i => i.assigned_to === aspirant.id).map(i => i.catalog_id).sort();
    assert.deepEqual(held, ['astartes-boltgun', 'astartes-power-armour', 'laspistol']);
    assert.equal(env.db.tables.equipment_items.find(i => i.id === 'vest').assigned_to, null, 'the vest is back in the armoury, not gone');
    assert.ok(env.db.tables.equipment_authorizations.some(r => r.catalog_id === 'astartes-power-armour'));

    const resend = await env.asc('POST', '/candidates/:id/implant', { params: { id: aspirant.id }, body: { stage: 5 } });
    assert.equal(resend.body.already, true);
    assert.equal(env.db.tables.equipment_items.filter(i => i.catalog_id === 'astartes-power-armour').length, 1);
    const loan = env.db.tables.equipment_items.find(i => i.catalog_id === 'astartes-boltgun');
    const sold = await env.armory('DELETE', '/items/:id', { params: { id: loan.id } });
    assert.equal(sold.code, 400);
    assert.equal(env.db.tables.roster_characters.length, 7);

    const character = (await env.roster('GET', '/')).body.characters.find(c => c.id === aspirant.id);
    assert.equal(roster.maxHp(character), 160);
    assert.equal(roster.inAscension(character), false);
});

test('server: the original branch needs level 10, an Astra Militarum origin and the notice read', async () => {
    const env = setup();
    const { characters } = (await env.roster('GET', '/')).body;
    const id = characters[1].id;
    const low = await env.asc('POST', '/original', { body: { characterId: id, acknowledged: true } });
    assert.match(low.body.error, /Lv10/);
    env.db.tables.roster_characters.find(r => r.id === id).xp = 2700;
    assert.equal((await env.asc('GET', '/')).body.eligibleOriginal.includes(id), true);
    const unread = await env.asc('POST', '/original', { body: { characterId: id } });
    assert.match(unread.body.error, /確認/);
    const ok = await env.asc('POST', '/original', { body: { characterId: id, acknowledged: true } });
    assert.equal(ok.code, 201);
    const twice = await env.asc('POST', '/original', { body: { characterId: id, acknowledged: true } });
    assert.equal(twice.code, 400);

    const sister = { id: 'sis', user_id: 'u1', name: '修女', origin: 'sororitas', duty: 'rifleman', xp: 2700, health: 'fit', recruited_at: new Date() };
    env.db.tables.roster_characters.push(sister);
    assert.match((await env.asc('POST', '/original', { body: { characterId: 'sis', acknowledged: true } })).body.error, /星界軍/);

    // Nothing rides on it yet, so it can be withdrawn; after a record it cannot.
    const back = await env.asc('DELETE', '/original/:id', { params: { id } });
    assert.equal(back.code, 200, back.body?.error);
    assert.equal(env.db.tables.roster_characters.find(r => r.id === id).ascension_route, null);
    await env.asc('POST', '/original', { body: { characterId: id, acknowledged: true } });
    giveRecords(env.db, id, 1, { health: 1 });
    assert.equal((await env.asc('DELETE', '/original/:id', { params: { id } })).code, 400);
});

test('server: the old account-wide ascension stays in the database, is not shown and is never converted', async () => {
    const env = setup();
    await env.roster('GET', '/');
    const old = { user_id: 'u1', astartes: { unlockedImplants: ['secondary-heart', 'ossmodula'], completedStages: [1] } };
    env.db.tables.game_state.push(old);
    const view = (await env.asc('GET', '/')).body;
    assert.equal('legacy' in view, false);
    assert.equal(view.candidates.length, 0);
    assert.equal(env.db.tables.ascension_implants.length, 0);
    assert.deepEqual([...env.db.tables.game_state[0].astartes.unlockedImplants], ['secondary-heart', 'ossmodula']);
});

test('server: voiding a task frees its core and designation slots and pays nothing', async () => {
    const { env, aspirant } = await withAspirant();
    const tomorrow = new Date(Date.now() + 86_400_000);
    const TOMORROW = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(tomorrow);
    for (const id of ['t1', 't2']) env.db.tables.tasks.push({ id, user_id: 'u1', title: id, status: 'active' });
    env.db.tables.core_plans.push({ user_id: 'u1', day: TODAY(), task_ids: ['t1', 't2'] });
    env.db.tables.core_plans.push({ user_id: 'u1', day: TOMORROW, task_ids: ['t1'] });
    await env.asc('PUT', '/plan', { body: { candidateId: aspirant.id, slots: [{ taskId: 't1', domain: 'health' }, { taskId: 't2', domain: 'care' }] } });
    const entriesBefore = env.db.tables.reward_entries.length;

    const res = await env.tasks('PUT', '/:id', { params: { id: 't1' }, body: { status: 'failed' } });
    assert.equal(res.code, 200);
    assert.equal(res.body.requisition, 0);
    assert.equal(res.body.growth, null);
    assert.equal(env.db.tables.tasks.find(t => t.id === 't1').status, 'failed');
    assert.deepEqual([...env.db.tables.core_plans.find(p => p.day === TODAY()).task_ids], ['t2']);
    assert.deepEqual([...env.db.tables.core_plans.find(p => p.day === TOMORROW).task_ids], []);
    assert.deepEqual([...env.db.tables.growth_plans[0].slots.map(s => s.taskId)], ['t2']);
    assert.equal(env.db.tables.reward_entries.length, entriesBefore);
    assert.equal(env.db.tables.growth_records.length, 0);
});
