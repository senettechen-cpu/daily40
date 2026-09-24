const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { createFakeDb } = require('./helpers/fake-db.cjs');

const r = loadTs('shared/roster/index.ts');

const character = (id, extra = {}) => ({
    id, name: id, origin: 'cadian', duty: 'rifleman', xp: 0, health: 'fit',
    recruitedAt: '2026-09-24T00:00:00.000Z', ...extra,
});
const squad = (memberIds, name = '第一特遣隊') => ({ id: 's1', name, memberIds });

test('levels follow the xp table and stop at ten', () => {
    assert.equal(r.levelOf(0), 1);
    assert.equal(r.levelOf(99), 1);
    assert.equal(r.levelOf(100), 2);
    assert.equal(r.levelOf(2700), 10);
    assert.equal(r.levelOf(999999), 10);
    assert.equal(r.xpToNext(0), 100);
    assert.equal(r.xpToNext(2700), null);
});

test('each level adds 2% of the origin baseline, +18% at level ten', () => {
    assert.equal(r.maxHp({ origin: 'cadian', xp: 0 }), 100);
    assert.equal(r.maxHp({ origin: 'cadian', xp: 2700 }), 118);
    // Ascension replaces the baseline instead of stacking on the human one.
    assert.equal(r.maxHp({ origin: 'astartes', xp: 0 }), 160);
    assert.equal(r.maxHp({ origin: 'astartes', xp: 2700 }), 189);
});

test('a squad holds at most six and refuses the same person twice', () => {
    const roster = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => character(id));
    assert.equal(r.validateSquad(squad(['a', 'b', 'c', 'd', 'e', 'f']), roster), null);
    assert.match(r.validateSquad(squad(['a', 'b', 'c', 'd', 'e', 'f', 'g']), roster), /最多部署 6 人/);
    assert.match(r.validateSquad(squad(['a', 'a']), roster), /不能占兩個位置/);
});

test('an eleventh character does not block the roster, only the squad', () => {
    const roster = Array.from({ length: 11 }, (_, i) => character(`c${i}`));
    // The roster itself has no cap; only a deployment is limited to six.
    assert.equal(r.validateSquad(squad(roster.slice(0, 6).map(c => c.id)), roster), null);
    assert.match(r.validateSquad(squad(roster.map(c => c.id)), roster), /最多部署 6 人/);
});

test('six of the same duty is allowed', () => {
    const roster = Array.from({ length: 6 }, (_, i) => character(`c${i}`, { duty: 'medic' }));
    assert.equal(r.validateSquad(squad(roster.map(c => c.id)), roster), null);
});

test('departure refuses an empty squad or a critically wounded member', () => {
    const roster = [character('a'), character('b', { health: 'critical' }), character('c', { health: 'wounded' })];
    assert.match(r.validateSquad(squad([]), roster, true), /編成是空的/);
    assert.match(r.validateSquad(squad(['a', 'b']), roster, true), /重傷/);
    // A wounded soldier may still deploy; only critical is barred.
    assert.equal(r.validateSquad(squad(['a', 'c']), roster, true), null);
});

test('a member who is not on the roster is rejected', () => {
    assert.match(r.validateSquad(squad(['ghost']), [character('a')]), /不存在的人員/);
});

test('addMember is idempotent and stops at the seventh', () => {
    const roster = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => character(id));
    const full = squad(['a', 'b', 'c', 'd', 'e', 'f']);
    assert.deepEqual(r.addMember(full, 'a', roster).squad.memberIds, full.memberIds);
    assert.match(r.addMember(full, 'g', roster).error, /最多部署 6 人/);
});

// --- routes -----------------------------------------------------------------

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
const setup = () => { const db = createFakeDb(); return { db, roster: mount('server/src/routes/roster.ts', db) }; };

test('the first read grants six starting soldiers and one formation, and only once', async () => {
    const { db, roster } = setup();
    const first = (await roster('GET', '/')).body;
    assert.equal(first.characters.length, 6);
    assert.equal(first.squads.length, 1);
    assert.equal(first.squads[0].memberIds.length, 6);

    const second = (await roster('GET', '/')).body;
    assert.equal(second.characters.length, 6);
    assert.equal(db.tables.roster_characters.length, 6);
});

test('each starting soldier is a distinct instance, including the three riflemen', async () => {
    const { roster } = setup();
    const { characters } = (await roster('GET', '/')).body;
    assert.equal(new Set(characters.map(c => c.id)).size, 6);
    assert.equal(characters.filter(c => c.duty === 'rifleman').length, 3);
});

test('a squad can be created, filled, renamed and deleted', async () => {
    const { db, roster } = setup();
    const { characters } = (await roster('GET', '/')).body;

    const created = await roster('POST', '/squads', { body: { name: '突擊組' } });
    assert.equal(created.code, 201);

    const filled = await roster('PUT', '/squads/:id', {
        params: { id: created.body.id }, body: { memberIds: characters.slice(0, 2).map(c => c.id) },
    });
    assert.equal(filled.body.memberIds.length, 2);

    const renamed = await roster('PUT', '/squads/:id', { params: { id: created.body.id }, body: { name: '偵察組' } });
    assert.equal(renamed.body.name, '偵察組');
    assert.deepEqual(renamed.body.memberIds.length, 2); // renaming keeps the members

    await roster('DELETE', '/squads/:id', { params: { id: created.body.id } });
    assert.equal(db.tables.squads.length, 1); // the starting formation remains
});

test('the route refuses a seventh member and leaves the squad unchanged', async () => {
    const { db, roster } = setup();
    const { characters, squads } = (await roster('GET', '/')).body;

    const res = await roster('PUT', '/squads/:id', {
        params: { id: squads[0].id }, body: { memberIds: [...characters.map(c => c.id), characters[0].id] },
    });
    assert.equal(res.code, 400);
    assert.equal(db.tables.squads[0].member_ids.length, 6);
});

test('another user cannot read or change this roster', async () => {
    const { roster } = setup();
    const mine = (await roster('GET', '/')).body;
    const theirs = (await roster('GET', '/', { user: 'u2' })).body;

    // u2 gets their own six, not u1's.
    assert.equal(theirs.characters.length, 6);
    assert.equal(mine.characters.filter(c => theirs.characters.some(t => t.id === c.id)).length, 0);

    const res = await roster('PUT', '/squads/:id', { user: 'u2', params: { id: mine.squads[0].id }, body: { name: '奪取' } });
    assert.equal(res.code, 400);
});
