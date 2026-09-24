const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { createFakeDb } = require('./helpers/fake-db.cjs');

const time = loadTs('shared/time.ts');

// Mounts the real routers against the in-memory database. Same approach as
// ledger-api.test.cjs, extended with PUT and req.query for the core endpoints.
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

function setup(economy = true) {
    process.env.V15_ECONOMY = economy ? 'on' : '';
    const db = createFakeDb();
    return {
        db,
        rewards: mount('server/src/routes/rewards.ts', db),
        tasks: mount('server/src/routes/tasks.ts', db),
        projects: mount('server/src/routes/projects.ts', db),
    };
}

// Planning for tomorrow keeps day-boundary drift out of the wiring tests: whatever
// time the suite runs, tomorrow is always in the editable "upcoming" phase.
const TOMORROW = time.addDays(time.dayKey(new Date()), 1);
const atNoon = day => new Date(`${day}T12:00:00+08:00`).toISOString();
const balanceOf = db => db.tables.reward_entries.reduce((sum, r) => sum + r.amount, 0);
const seedTask = (db, id) => db.tables.tasks.push({ id, user_id: 'u1', status: 'active', last_completed_at: null });
const completeTask = (tasks, id, day) => tasks('PUT', '/:id', { params: { id }, body: { status: 'completed', lastCompletedAt: atNoon(day) } });

test('economy off: completing a task writes no reward rows', async () => {
    const { db, tasks } = setup(false);
    seedTask(db, 't1');
    const res = await completeTask(tasks, 't1', TOMORROW);
    assert.equal(res.code, 200);
    assert.equal(res.body.requisition, 0);
    assert.equal(db.tables.reward_entries.length, 0);
});

test('a committed core is persisted and read back with its cap', async () => {
    const { db, rewards } = setup();
    seedTask(db, 't1');
    const added = await rewards('POST', '/core', { body: { day: TOMORROW, action: 'add', taskId: 't1' } });
    assert.equal(added.code, 200);
    assert.deepEqual(added.body.taskIds, ['t1']);

    const view = (await rewards('GET', '/core', { query: { day: TOMORROW } })).body;
    assert.deepEqual(view.taskIds, ['t1']);
    assert.equal(view.phase, 'upcoming');
    assert.equal(view.cap, 3);
    assert.equal(db.tables.core_plans.length, 1);
});

test('completing a committed core pays +10 once, even if the update is retried', async () => {
    const { db, rewards, tasks } = setup();
    seedTask(db, 't1');
    await rewards('POST', '/core', { body: { day: TOMORROW, action: 'add', taskId: 't1' } });

    const first = await completeTask(tasks, 't1', TOMORROW);
    assert.equal(first.body.requisition, 10);
    const retry = await completeTask(tasks, 't1', TOMORROW);
    assert.equal(retry.body.requisition, 0);
    assert.equal(balanceOf(db), 40 + 10);
});

test('completing a task that is not a core pays nothing', async () => {
    const { db, rewards, tasks } = setup();
    seedTask(db, 't1');
    seedTask(db, 't2');
    await rewards('POST', '/core', { body: { day: TOMORROW, action: 'add', taskId: 't1' } });

    const res = await completeTask(tasks, 't2', TOMORROW);
    assert.equal(res.body.requisition, 0);
    assert.equal(balanceOf(db), 40);
});

test('a fourth core is refused and the plan is left unchanged', async () => {
    const { db, rewards } = setup();
    for (const id of ['t1', 't2', 't3', 't4']) seedTask(db, id);
    for (const id of ['t1', 't2', 't3']) await rewards('POST', '/core', { body: { day: TOMORROW, action: 'add', taskId: id } });

    const res = await rewards('POST', '/core', { body: { day: TOMORROW, action: 'add', taskId: 't4' } });
    assert.equal(res.code, 400);
    assert.match(res.body.error, /最多/);
    assert.deepEqual(db.tables.core_plans[0].task_ids, ['t1', 't2', 't3']);
});

const project = (id = 'p1') => ({
    id, title: '重整書房', month: '2026-09', difficulty: 3,
    subTasks: [{ id: 's1', completed: false }, { id: 's2', completed: false }, { id: 's3', completed: false }],
});
const markDone = (projects, id, doneIds) => projects('PUT', '/:id', {
    params: { id },
    body: { subTasks: ['s1', 's2', 's3'].map(sid => ({ id: sid, completed: doneIds.includes(sid) })) },
});

test('milestones pay 20 each, and a project created and closed the same day gets no close bonus', async () => {
    const { db, projects } = setup();
    await projects('POST', '/', { body: project() });
    const set = await projects('PUT', '/:id/milestones', { params: { id: 'p1' }, body: { milestoneIds: ['s1', 's2', 's3'] } });
    assert.equal(set.code, 200);

    await markDone(projects, 'p1', ['s1', 's2', 's3']);
    assert.equal(balanceOf(db), 40 + 60);
    assert.equal(db.tables.reward_entries.filter(r => r.source_key === 'project:p1:close').length, 0);
});

test('closing on a later day than creation adds the 60 close bonus', async () => {
    const { db, projects } = setup();
    await projects('POST', '/', { body: project() });
    await projects('PUT', '/:id/milestones', { params: { id: 'p1' }, body: { milestoneIds: ['s1', 's2', 's3'] } });
    // Backdate creation so today's close counts as a later day.
    db.tables.projects[0].created_at = new Date(Date.now() - 3 * 86400000);

    await markDone(projects, 'p1', ['s1', 's2', 's3']);
    assert.equal(balanceOf(db), 40 + 60 + 60);
});

test('without three designated milestones nothing is paid', async () => {
    const { db, projects } = setup();
    await projects('POST', '/', { body: project() });
    await projects('PUT', '/:id/milestones', { params: { id: 'p1' }, body: { milestoneIds: ['s1'] } });

    await markDone(projects, 'p1', ['s1', 's2', 's3']);
    assert.equal(balanceOf(db), 40);
});

test('deleting the project reverses every reward it paid', async () => {
    const { db, projects } = setup();
    await projects('POST', '/', { body: project() });
    await projects('PUT', '/:id/milestones', { params: { id: 'p1' }, body: { milestoneIds: ['s1', 's2', 's3'] } });
    await markDone(projects, 'p1', ['s1', 's2', 's3']);
    assert.equal(balanceOf(db), 100);

    await projects('DELETE', '/:id', { params: { id: 'p1' } });
    assert.equal(balanceOf(db), 40);
});

test('milestones must be subtasks of that project', async () => {
    const { projects } = setup();
    await projects('POST', '/', { body: project() });
    const res = await projects('PUT', '/:id/milestones', { params: { id: 'p1' }, body: { milestoneIds: ['s1', 'nope', 's3'] } });
    assert.equal(res.code, 400);
    assert.match(res.body.error, /子項/);
});
