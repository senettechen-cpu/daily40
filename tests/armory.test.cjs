const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { createFakeDb } = require('./helpers/fake-db.cjs');

const a = loadTs('shared/armory/index.ts');

function mount(file, db) {
    const handlers = {};
    const Router = () => {
        const add = method => (route, fn) => { handlers[`${method} ${route}`] = fn; };
        return { get: add('GET'), post: add('POST'), put: add('PUT'), delete: add('DELETE') };
    };
    loadTs(file, { mocks: { express: { Router }, '../db': { query: db.query, withTransaction: db.withTransaction } } });
    return async (method, route, { user = 'u1', body = {}, params = {} } = {}) => {
        const res = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
        await handlers[`${method} ${route}`]({ user: { uid: user }, body, params }, res);
        return res;
    };
}

function setup() {
    process.env.V15_ECONOMY = 'on';
    const db = createFakeDb();
    return { db, armory: mount('server/src/routes/armory.ts', db), roster: mount('server/src/routes/roster.ts', db) };
}

const balanceOf = db => db.tables.reward_entries.reduce((sum, r) => sum + r.amount, 0);
/** Tops the wallet up directly so a test can reach a given balance without 40 ledger entries. */
const grant = (db, amount) => db.tables.reward_entries.push({
    user_id: 'u1', seq: db.tables.reward_entries.length + 1, source_key: `test:${db.tables.reward_entries.length}`,
    kind: 'grant', amount, day: '2026-09-24', at: new Date().toISOString(), reason: 'test',
});

test('the catalogue carries the v1.5 candidate prices', () => {
    const price = id => a.catalogItem(id).price;
    assert.equal(price('lasgun'), 40);
    assert.equal(price('laspistol'), 30);
    assert.equal(price('plasma-gun'), 240);
    assert.equal(price('astartes-power-armour'), 400);
    assert.equal(price('tuning-1'), 40);
    assert.equal(price('tuning-2'), 80);
});

test('two tuning stages total +10% and the cap holds', () => {
    assert.equal(a.tuningBonus(0), 0);
    assert.equal(Math.round(a.tuningBonus(1) * 100), 5);
    assert.equal(Math.round(a.tuningBonus(2) * 100), 10);
    assert.equal(Math.round(a.tuningBonus(5) * 100), 10);
});

test('a negative balance blocks buying even a cheap item', () => {
    const error = a.purchaseError(a.catalogItem('laspistol'), { balance: -5, authorized: [] });
    assert.match(error, /軍需為負/);
});

test('a restricted item needs an authorization, not just money', () => {
    const rich = { balance: 9999, authorized: [] };
    assert.match(a.purchaseError(a.catalogItem('plasma-gun'), rich), /尚未解鎖/);
    assert.equal(a.purchaseError(a.catalogItem('plasma-gun'), { ...rich, authorized: ['plasma-gun'] }), null);
});

test('buying deducts the price and records the item as owned', async () => {
    const { db, armory } = setup();
    grant(db, 200);
    const before = balanceOf(db);

    const res = await armory('POST', '/purchase', { body: { catalogId: 'shotgun' } });
    assert.equal(res.code, 201);
    assert.equal(db.tables.equipment_items.length, 1);
    assert.equal(balanceOf(db), before + 40 - 80); // the starting grant lands on first read
});

test('buying is refused when the balance cannot cover it, and nothing is written', async () => {
    const { db, armory } = setup();
    // An unrestricted item, so the refusal is about money rather than authorization.
    const res = await armory('POST', '/purchase', { body: { catalogId: 'precision-lasgun' } });
    assert.equal(res.code, 400);
    assert.match(res.body.error, /軍需不足/);
    assert.equal(db.tables.equipment_items.length, 0);
});

test('selling returns a quarter of what was paid, rounded down', async () => {
    const { db, armory } = setup();
    grant(db, 200);
    const bought = (await armory('POST', '/purchase', { body: { catalogId: 'shotgun' } })).body;
    const afterBuy = balanceOf(db);

    const sold = await armory('DELETE', '/items/:id', { params: { id: bought.id } });
    assert.equal(sold.body.refunded, 20); // floor(80 * 0.25)
    assert.equal(balanceOf(db), afterBuy + 20);
    assert.equal(db.tables.equipment_items.length, 0);
});

test('issued gear refunds nothing, so selling cannot mint requisition', async () => {
    const { db, armory } = setup();
    db.tables.equipment_items.push({ id: 'free1', user_id: 'u1', catalog_id: 'lasgun', assigned_to: null, paid: 0, acquired_at: new Date() });
    await armory('GET', '/');
    const before = balanceOf(db);

    const sold = await armory('DELETE', '/items/:id', { params: { id: 'free1' } });
    assert.equal(sold.body.refunded, 0);
    assert.equal(balanceOf(db), before);
});

test('one weapon cannot be carried by two soldiers', async () => {
    const { armory, roster } = setup();
    const { characters } = (await roster('GET', '/')).body;
    const bought = (await armory('POST', '/purchase', { body: { catalogId: 'laspistol' } })).body;

    const first = await armory('POST', '/items/:id/assign', { params: { id: bought.id }, body: { characterId: characters[0].id } });
    assert.equal(first.code, 200);

    const second = await armory('POST', '/items/:id/assign', { params: { id: bought.id }, body: { characterId: characters[1].id } });
    assert.equal(second.code, 400);
    assert.match(second.body.error, /已經配給其他人/);
});

test('a second primary weapon does not fit the same soldier', async () => {
    const { db, armory, roster } = setup();
    grant(db, 300);
    const { characters } = (await roster('GET', '/')).body;
    const one = (await armory('POST', '/purchase', { body: { catalogId: 'shotgun' } })).body;
    const two = (await armory('POST', '/purchase', { body: { catalogId: 'precision-lasgun' } })).body;

    await armory('POST', '/items/:id/assign', { params: { id: one.id }, body: { characterId: characters[0].id } });
    const res = await armory('POST', '/items/:id/assign', { params: { id: two.id }, body: { characterId: characters[0].id } });
    assert.equal(res.code, 400);
    assert.match(res.body.error, /已滿/);
});

test('origin-restricted gear is refused for the wrong origin', async () => {
    const { db, armory, roster } = setup();
    grant(db, 500);
    db.tables.equipment_authorizations.push({ user_id: 'u1', catalog_id: 'astartes-boltgun' });
    const { characters } = (await roster('GET', '/')).body;

    const bolt = (await armory('POST', '/purchase', { body: { catalogId: 'astartes-boltgun' } })).body;
    const res = await armory('POST', '/items/:id/assign', { params: { id: bolt.id }, body: { characterId: characters[0].id } });
    assert.equal(res.code, 400);
    assert.match(res.body.error, /出身/);
});

test('unassigning returns an item to the armoury', async () => {
    const { db, armory, roster } = setup();
    grant(db, 100);
    const { characters } = (await roster('GET', '/')).body;
    const item = (await armory('POST', '/purchase', { body: { catalogId: 'laspistol' } })).body;

    await armory('POST', '/items/:id/assign', { params: { id: item.id }, body: { characterId: characters[0].id } });
    const res = await armory('POST', '/items/:id/assign', { params: { id: item.id }, body: { characterId: null } });
    assert.equal(res.body.assignedTo, null);
    assert.equal(db.tables.equipment_items[0].assigned_to, null);
});
