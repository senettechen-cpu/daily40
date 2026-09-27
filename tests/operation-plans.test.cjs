const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { createFakeDb } = require('./helpers/fake-db.cjs');

const c = loadTs('shared/progression/crates.ts');
const { CATALOG } = loadTs('shared/armory/catalog.ts');

const NONE = { equipment: [], personnel: [] };
const ALL = {
    equipment: ['carapace-armour', 'plasma-gun', 'heavy-weapon'],
    personnel: ['kasrkin', 'catachan-fighter', 'krieg-infantry', 'scion', 'preacher'],
};

// ---- shared rules ---------------------------------------------------------

test('crates: a chosen difficulty counts only as far as the plan backs it', () => {
    assert.equal(c.effectiveDifficulty(5, 7, 14), 5);
    // Big enough in subtasks, too young in days: falls to what the days allow.
    assert.equal(c.effectiveDifficulty(5, 7, 3), 2);
    // Old enough, too few finished subtasks.
    assert.equal(c.effectiveDifficulty(5, 4, 30), 2);
    // Never above what was chosen, however big the plan.
    assert.equal(c.effectiveDifficulty(2, 20, 60), 2);
    // Closed the day it was made: no crate at all.
    assert.equal(c.effectiveDifficulty(3, 10, 0), 0);
    assert.equal(c.effectiveDifficulty(1, 2, 5), 0);
});

test('crates: the plan says what the chosen level still needs', () => {
    assert.deepEqual({ ...c.gateShortfall(4, 3, 2) }, { gate: c.DIFFICULTY_GATES[3], subTasks: 3, days: 5 });
    const met = c.gateShortfall(1, 3, 1);
    assert.equal(met.subTasks + met.days, 0);
});

test('crates: every odds row sums to 100, and the top levels have floors', () => {
    for (const level of [1, 2, 3, 4, 5]) {
        const row = c.RARITY_ODDS[level];
        assert.equal(c.RARITIES.reduce((sum, r) => sum + row[r], 0), 100, `level ${level}`);
    }
    assert.equal(c.RARITY_ODDS[4].common, 0);
    assert.equal(c.RARITY_ODDS[5].common + c.RARITY_ODDS[5].fine, 0);
});

test('crates: each difficulty is worth at least as much per finished subtask as the one below', () => {
    // The anti-splitting check from the design doc, with the gate minimums.
    const price = prize => prize.kind === 'equipment'
        ? CATALOG.find(i => i.id === prize.catalogId).price
        : 200;
    let last = 0;
    for (const gate of c.DIFFICULTY_GATES) {
        let value = 0;
        for (let i = 0; i < 4000; i += 1) value += price(c.openCrate(`t:${gate.level}:${i}`, gate.level, ALL));
        const perSubtask = value / 4000 / gate.subTasks;
        assert.ok(perSubtask >= last * 0.97, `level ${gate.level}: ${perSubtask.toFixed(1)} per subtask after ${last.toFixed(1)}`);
        last = perSubtask;
    }
});

test('crates: the same seed always opens the same crate', () => {
    const a = c.openCrate('crate:u1:p1', 3, ALL);
    const b = c.openCrate('crate:u1:p1', 3, ALL);
    assert.deepEqual({ ...a }, { ...b });
    const spread = new Set(Array.from({ length: 50 }, (_, i) => JSON.stringify(c.openCrate(`crate:u1:p${i}`, 3, ALL))));
    assert.ok(spread.size > 5, 'different plans should not all get the same prize');
});

test('crates: nothing restricted comes out before the campaign opens it', () => {
    const restrictedGear = new Set(CATALOG.filter(i => i.restricted).map(i => i.id));
    const restrictedPeople = new Set(['kasrkin', 'catachan-fighter', 'krieg-infantry', 'scion', 'preacher', 'battle-sister']);
    for (let i = 0; i < 3000; i += 1) {
        const prize = c.openCrate(`closed:${i}`, 5, NONE);
        if (prize.kind === 'equipment') assert.ok(!restrictedGear.has(prize.catalogId), prize.catalogId);
        else assert.ok(!restrictedPeople.has(prize.templateId), prize.templateId);
    }
});

test('crates: Astartes and Sororitas gear never enters any pool', () => {
    const everything = { equipment: CATALOG.map(i => i.id), personnel: ['kasrkin', 'scion', 'battle-sister'] };
    for (const rarity of c.RARITIES) {
        const pool = c.poolFor(rarity, everything);
        for (const id of pool.equipment) assert.ok(!CATALOG.find(i => i.id === id).origins, id);
        assert.ok(!pool.characters.some(p => p.templateId === 'battle-sister'));
    }
});

test('crates: an empty tier steps down instead of producing nothing', () => {
    // With nothing authorized, legendary gear is empty; the tier still has
    // veterans, so force the character side away by checking the fallback path.
    const onlyGearLegendary = c.poolFor('legendary', NONE);
    assert.equal(onlyGearLegendary.equipment.length, 0);
    assert.ok(onlyGearLegendary.characters.every(p => p.veteran), 'without authorization, legendary soldiers are veterans only');
    for (let i = 0; i < 500; i += 1) {
        const prize = c.openCrate(`floor:${i}`, 1, NONE);
        assert.ok(prize.kind === 'equipment' || prize.kind === 'character');
    }
});

test('crates: calendar days between two keys', () => {
    assert.equal(c.daysBetween('2026-09-27', '2026-09-27'), 0);
    assert.equal(c.daysBetween('2026-09-27', '2026-10-11'), 14);
    assert.equal(c.daysBetween('2026-12-31', '2027-01-01'), 1);
});

// ---- server: closing a plan -----------------------------------------------

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
    return { db, projects: mount('server/src/routes/projects.ts', db) };
}

const ids = n => Array.from({ length: n }, (_, i) => `s${i + 1}`);
const balanceOf = db => db.tables.reward_entries.reduce((sum, r) => sum + r.amount, 0);

/** A plan with `n` subtasks, three milestones, backdated `days` days, every subtask done. */
async function finishedPlan(env, id, { n = 3, difficulty = 1, days = 3 } = {}) {
    const { db, projects } = env;
    await projects('POST', '/', { body: { id, title: '整理書房', month: '', difficulty, subTasks: ids(n).map(s => ({ id: s, completed: false })) } });
    await projects('PUT', '/:id/milestones', { params: { id }, body: { milestoneIds: ids(3) } });
    db.tables.projects.find(p => p.id === id).created_at = new Date(Date.now() - days * 86400000);
    await projects('PUT', '/:id', { params: { id }, body: { subTasks: ids(n).map(s => ({ id: s, completed: true })) } });
}

test('close: refused until every subtask is done', async () => {
    const env = setup();
    await env.projects('POST', '/', { body: { id: 'p1', title: 'x', month: '', difficulty: 1, subTasks: ids(3).map(s => ({ id: s, completed: false })) } });
    const res = await env.projects('POST', '/:id/close', { params: { id: 'p1' } });
    assert.equal(res.code, 409);
    assert.equal(env.db.tables.projects[0].sealed_at, null);
});

test('close: a plan closed on a later day opens one crate and delivers it', async () => {
    const env = setup();
    await finishedPlan(env, 'p1');
    const before = env.db.tables.equipment_items.length + env.db.tables.roster_characters.length;

    const res = await env.projects('POST', '/:id/close', { params: { id: 'p1' } });
    assert.equal(res.code, 200);
    assert.ok(res.body.crate, res.body.reason);
    assert.equal(res.body.crate.difficulty, 1);
    assert.ok(env.db.tables.projects[0].sealed_at);
    assert.equal(env.db.tables.project_crates.length, 1);
    assert.equal(env.db.tables.equipment_items.length + env.db.tables.roster_characters.length, before + 1);
    if (res.body.crate.kind === 'equipment') assert.equal(env.db.tables.equipment_items.at(-1).paid, 0, 'issued, so it refunds nothing');
    // Milestones only: the close pays no requisition any more.
    assert.equal(balanceOf(env.db), 40 + 60);
});

test('close: repeating it returns the same crate and delivers nothing more', async () => {
    const env = setup();
    await finishedPlan(env, 'p1');
    const first = await env.projects('POST', '/:id/close', { params: { id: 'p1' } });
    const count = env.db.tables.equipment_items.length + env.db.tables.roster_characters.length;
    const again = await env.projects('POST', '/:id/close', { params: { id: 'p1' } });
    assert.equal(again.code, 200);
    assert.equal(again.body.alreadySealed, true);
    // Compared as the client receives them: undefined fields do not survive JSON.
    assert.deepEqual(JSON.parse(JSON.stringify(again.body.crate)), JSON.parse(JSON.stringify(first.body.crate)));
    assert.equal(env.db.tables.equipment_items.length + env.db.tables.roster_characters.length, count);
});

test('close: the same day it was made seals the plan but opens no crate', async () => {
    const env = setup();
    await finishedPlan(env, 'p1', { days: 0 });
    const res = await env.projects('POST', '/:id/close', { params: { id: 'p1' } });
    assert.equal(res.code, 200);
    assert.equal(res.body.crate, null);
    assert.match(res.body.reason, /同一天/);
    assert.ok(env.db.tables.projects[0].sealed_at);
});

test('close: without three milestones it seals with a reason, not a crate', async () => {
    const env = setup();
    await env.projects('POST', '/', { body: { id: 'p1', title: 'x', month: '', difficulty: 1, subTasks: ids(3).map(s => ({ id: s, completed: true })) } });
    env.db.tables.projects[0].created_at = new Date(Date.now() - 3 * 86400000);
    const res = await env.projects('POST', '/:id/close', { params: { id: 'p1' } });
    assert.equal(res.body.crate, null);
    assert.match(res.body.reason, /里程碑/);
});

test('close: a plan already paid the old +60 keeps it and gets no crate', async () => {
    const env = setup();
    await finishedPlan(env, 'p1');
    // Paid under the pre-2026-09-27 rule.
    const seq = env.db.tables.reward_entries.length + 1;
    env.db.tables.reward_entries.push({ user_id: 'u1', seq, source_key: 'project:p1:close', kind: 'grant', amount: 60, day: '2026-09-20', at: new Date().toISOString(), reason: '專案結案' });
    const withLegacy = balanceOf(env.db);

    const res = await env.projects('POST', '/:id/close', { params: { id: 'p1' } });
    assert.equal(res.body.crate, null);
    assert.match(res.body.reason, /舊制/);
    assert.equal(balanceOf(env.db), withLegacy, 'the old +60 is not reversed');
});

test('close: a sealed plan cannot be edited, re-milestoned or deleted', async () => {
    const env = setup();
    await finishedPlan(env, 'p1');
    await env.projects('POST', '/:id/close', { params: { id: 'p1' } });
    const paid = balanceOf(env.db);

    const edit = await env.projects('PUT', '/:id', { params: { id: 'p1' }, body: { subTasks: ids(3).map(s => ({ id: s, completed: false })) } });
    const ms = await env.projects('PUT', '/:id/milestones', { params: { id: 'p1' }, body: { milestoneIds: ['s1'] } });
    const del = await env.projects('DELETE', '/:id', { params: { id: 'p1' } });
    assert.deepEqual([edit.code, ms.code, del.code], [409, 409, 409]);
    assert.equal(balanceOf(env.db), paid, 'nothing reversed behind the seal');
    assert.equal(env.db.tables.projects.length, 1);
});

test('close: a client can no longer mark a plan completed by itself', async () => {
    const env = setup();
    await env.projects('POST', '/', { body: { id: 'p1', title: 'x', month: '', difficulty: 1, subTasks: [] } });
    await env.projects('PUT', '/:id', { params: { id: 'p1' }, body: { completed: true, title: 'y' } });
    assert.equal(env.db.tables.projects[0].completed, false);
    assert.equal(env.db.tables.projects[0].title, 'y');
});

test('close: a difficulty-5 veteran joins the roster at level 4', async () => {
    const env = setup();
    // Find a plan id whose crate is a veteran, so the test is deterministic.
    let id = null;
    for (let i = 0; i < 500 && !id; i += 1) {
        const prize = c.openCrate(`crate:u1:v${i}`, 5, NONE);
        if (prize.kind === 'character' && prize.veteran) id = `v${i}`;
    }
    assert.ok(id, 'no veteran seed found in 500 tries');
    await finishedPlan(env, id, { n: 7, difficulty: 5, days: 15 });

    const res = await env.projects('POST', '/:id/close', { params: { id } });
    assert.equal(res.body.crate.difficulty, 5);
    assert.equal(res.body.crate.veteran, true);
    const soldier = env.db.tables.roster_characters.find(r => r.id === res.body.crate.characterId);
    assert.equal(soldier.xp, c.VETERAN_XP);
});

test('close: the project list reports the seal and the crate', async () => {
    const env = setup();
    await finishedPlan(env, 'p1');
    await env.projects('POST', '/:id/close', { params: { id: 'p1' } });
    const list = await env.projects('GET', '/');
    assert.ok(list.body[0].sealedAt);
    assert.equal(list.body[0].crate.projectId, 'p1');
});
