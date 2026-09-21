const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { createFakeDb } = require('./helpers/fake-db.cjs');

// Loads the real Express routers against the in-memory database. The SQL text is
// not executed by PostgreSQL here; real-database verification happens before launch.
function mount(file, db) {
    const handlers = {};
    const Router = () => {
        const add = method => (route, fn) => { handlers[`${method} ${route}`] = fn; };
        return { get: add('GET'), post: add('POST'), delete: add('DELETE') };
    };
    loadTs(file, { mocks: { express: { Router }, '../db': { query: db.query, withTransaction: db.withTransaction } } });
    return async (method, route, { user = 'u1', body = {}, params = {} } = {}) => {
        const res = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
        await handlers[`${method} ${route}`]({ user: { uid: user }, body, params }, res);
        return res;
    };
}
function setup(economy) {
    process.env.V15_ECONOMY = economy ? 'on' : '';
    const db = createFakeDb();
    return { db, ledger: mount('server/src/routes/ledger.ts', db), rewards: mount('server/src/routes/rewards.ts', db) };
}
const expense = (id, extra = {}) => ({ id, date: '2026-09-21', category: '飲食', itemName: '早餐', amount: 60, paymentMethod: 'Cash', ...extra });
// Values built inside the loader sandbox have foreign prototypes; compare plain copies.
const plain = value => JSON.parse(JSON.stringify(value));
const balanceOf = db => db.tables.reward_entries.reduce((sum, r) => sum + r.amount, 0);

test('economy off: expenses save as before and no reward rows are written', async () => {
    const { db, ledger, rewards } = setup(false);
    const res = await ledger('POST', '/', { body: expense('e1') });
    assert.equal(res.code, 201);
    assert.equal(res.body.reward, 0);
    assert.equal(db.tables.expenses.length, 1);
    assert.equal(db.tables.reward_entries.length, 0);
    assert.deepEqual(plain((await rewards('GET', '/')).body), { enabled: false });
});

test('economy on: starting grant once, +20 for the first three entries a day, none after', async () => {
    const { db, ledger, rewards } = setup(true);
    const paid = [];
    for (const id of ['e1', 'e2', 'e3', 'e4']) paid.push((await ledger('POST', '/', { body: expense(id) })).body.reward);
    assert.deepEqual(paid, [20, 20, 20, 0]);
    assert.equal(balanceOf(db), 40 + 60);
    const summary = (await rewards('GET', '/')).body;
    assert.equal(summary.balance, 100);
    assert.equal(summary.ledger.used, 3);
    assert.equal(db.tables.reward_entries.filter(r => r.source_key === 'start:v1.5').length, 1);
});

test('a retried POST (same expense id) neither duplicates the expense nor pays twice', async () => {
    const { db, ledger } = setup(true);
    await ledger('POST', '/', { body: expense('e1') });
    const retry = await ledger('POST', '/', { body: expense('e1') });
    assert.equal(retry.code, 201);
    assert.equal(retry.body.reward, 0);
    assert.equal(db.tables.expenses.length, 1);
    assert.equal(balanceOf(db), 60);
});

test('another user reusing an expense id is rejected without touching either ledger', async () => {
    const { db, ledger } = setup(true);
    await ledger('POST', '/', { body: expense('e1') });
    const res = await ledger('POST', '/', { user: 'u2', body: expense('e1') });
    assert.equal(res.code, 409);
    assert.equal(db.tables.reward_entries.filter(r => r.user_id === 'u2').length, 0);
});

test('deleting a rewarded expense reverses it and frees the slot; delete-and-readd nets zero', async () => {
    const { db, ledger } = setup(true);
    for (const id of ['e1', 'e2', 'e3']) await ledger('POST', '/', { body: expense(id) });
    const del = await ledger('DELETE', '/:id', { params: { id: 'e2' } });
    assert.equal(del.body.reward, -20);
    assert.equal((await ledger('POST', '/', { body: expense('e5') })).body.reward, 20);
    assert.equal(balanceOf(db), 100);
    // Deleting someone else's or a missing expense changes nothing.
    assert.equal((await ledger('DELETE', '/:id', { user: 'u2', params: { id: 'e1' } })).body.reward, 0);
    assert.equal(balanceOf(db), 100);
});

test('a failed reward write rolls back the expense too', async () => {
    const { db, ledger } = setup(true);
    await ledger('POST', '/', { body: expense('e1') });
    // e.g. a concurrent writer took the same sequence number and the unique constraint fired.
    db.failOn = /^INSERT INTO reward_entries/;
    const res = await ledger('POST', '/', { body: expense('e2') });
    assert.equal(res.code, 500);
    assert.equal(db.tables.expenses.some(e => e.id === 'e2'), false);
});

test('quick menu: pinned first, frequent suggestions, pin/hide/unpin round trip', async () => {
    const { db, ledger } = setup(false);
    for (const [id, item] of [['a', '早餐'], ['b', '早餐'], ['c', '午餐'], ['d', '咖啡'], ['e', '早餐']]) await ledger('POST', '/', { body: expense(id, { itemName: item }) });
    let menu = plain((await ledger('GET', '/presets')).body);
    assert.deepEqual(menu.suggestions.map(s => [s.itemName, s.count]), [['早餐', 3], ['咖啡', 1], ['午餐', 1]]);

    const pinned = await ledger('POST', '/presets', { body: { category: '飲食', itemName: '早餐', paymentMethod: 'Cash', amount: 60 } });
    assert.equal(pinned.code, 201);
    await ledger('POST', '/presets/hide', { body: { category: '飲食', itemName: '午餐', paymentMethod: 'Cash' } });
    menu = plain((await ledger('GET', '/presets')).body);
    assert.deepEqual(menu.pinned.map(p => [p.itemName, p.amount]), [['早餐', 60]]);
    assert.deepEqual(menu.suggestions.map(s => s.itemName), ['咖啡']);

    assert.equal((await ledger('DELETE', '/presets/:id', { params: { id: pinned.body.id } })).code, 200);
    menu = plain((await ledger('GET', '/presets')).body);
    assert.deepEqual(menu.pinned, []);
    assert.equal(menu.suggestions[0].itemName, '早餐');
    // Hidden rows cannot be "unpinned", and other users' presets are untouched.
    const hidden = db.tables.ledger_presets.find(r => r.hidden);
    assert.equal((await ledger('DELETE', '/presets/:id', { params: { id: hidden.id } })).code, 404);
});

test('quick menu validation rejects blank names and bad amounts', async () => {
    const { ledger } = setup(false);
    assert.equal((await ledger('POST', '/presets', { body: { category: '飲食', itemName: '  ', paymentMethod: 'Cash' } })).code, 400);
    assert.equal((await ledger('POST', '/presets', { body: { category: '飲食', itemName: '早餐', paymentMethod: 'Cash', amount: -5 } })).code, 400);
    assert.equal((await ledger('POST', '/presets', { body: { category: '飲食', itemName: '早餐', paymentMethod: 'Cash', amount: 12.5 } })).code, 400);
});
