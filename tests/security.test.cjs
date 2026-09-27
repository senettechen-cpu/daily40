const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { createFakeDb } = require('./helpers/fake-db.cjs');

// Security fixes of 2026-09-27 (docs/system-review-2026-09-27.md, P0).

function mount(file, db, extraMocks = {}) {
    const handlers = {};
    const Router = () => {
        const add = method => (route, ...fns) => { handlers[`${method} ${route}`] = fns[fns.length - 1]; };
        return { get: add('GET'), post: add('POST'), put: add('PUT'), delete: add('DELETE'), use: () => {} };
    };
    loadTs(file, {
        mocks: {
            express: { Router, default: { Router } },
            '../db': { query: db.query, withTransaction: db.withTransaction },
            '../middleware/auth': { verifyToken: (_req, _res, next) => next() },
            ...extraMocks,
        },
    });
    return async (method, route, { user = 'u1', body = {}, params = {}, query = {} } = {}) => {
        const res = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
        await handlers[`${method} ${route}`]({ user: { uid: user }, body, params, query }, res);
        return res;
    };
}

test('security: an account reads only its own resource logs unless listed as an admin', async () => {
    const db = createFakeDb();
    db.tables.resource_logs = [
        { id: 1, user_id: 'u1', category: 'rp', amount: 1, created_at: new Date(1) },
        { id: 2, user_id: 'u2', category: 'rp', amount: 2, created_at: new Date(2) },
    ];
    const logs = mount('server/src/routes/logs.ts', db);
    delete process.env.ADMIN_USER_IDS;
    const mine = await logs('GET', '/', { user: 'u1' });
    assert.deepEqual([...mine.body.map(r => r.user_id)], ['u1']);

    process.env.ADMIN_USER_IDS = 'someone, u2';
    const all = await logs('GET', '/', { user: 'u2' });
    assert.deepEqual([...all.body.map(r => r.user_id)].sort(), ['u1', 'u2']);
    delete process.env.ADMIN_USER_IDS;
});

test('security: the test email checks the address, echoes nothing and allows three an hour', async () => {
    const outbox = [];
    const debug = mount('server/src/routes/debug.ts', createFakeDb(), {
        '../services/email': { sendEmail: async (to, subject, html) => { outbox.push({ to, html }); } },
    });
    assert.equal((await debug('POST', '/test-email', { body: { email: 'not-an-address' } })).code, 400);
    assert.equal((await debug('POST', '/test-email', { body: { email: '<script>@x.com' } })).code, 400);

    for (let i = 0; i < 3; i += 1) {
        const ok = await debug('POST', '/test-email', { user: 'rate', body: { email: 'me@example.com' } });
        assert.equal(ok.code, 200);
    }
    assert.equal((await debug('POST', '/test-email', { user: 'rate', body: { email: 'me@example.com' } })).code, 429);
    assert.equal(outbox.length, 3);
    assert.ok(outbox.every(m => !m.html.includes('me@example.com')), 'the body must not echo the address');
});

test('legacy: the game-state sync writes only the notification settings, from the first save', async () => {
    const db = createFakeDb();
    const sync = mount('server/src/routes/gameState.ts', db);
    const first = await sync('POST', '/', { body: { notificationEmail: 'me@example.com', emailEnabled: true, resources: { rp: 999 }, corruption: 50 } });
    assert.equal(first.code, 200);
    const row = db.tables.game_state.find(r => r.user_id === 'u1');
    assert.equal(row.notification_email, 'me@example.com');
    assert.equal(row.email_enabled, true);
    assert.equal(row.resources, undefined, 'a retired field was written');

    await sync('POST', '/', { body: { emailEnabled: false, astartes: { unlockedImplants: ['x'] }, campaign: { actions: 9 } } });
    assert.equal(row.email_enabled, false);
    assert.equal(row.astartes, undefined);
    assert.equal(row.campaign, undefined);
    const nothing = await sync('POST', '/', { body: { resources: { rp: 1 } } });
    assert.equal(nothing.code, 200);
});

test('legacy: the purge runs only with PURGE_LEGACY=on, in one transaction, and only once', async () => {
    const { purgeLegacy } = loadTs('server/src/db/init.ts', { mocks: { pg: { Pool: class {} }, dotenv: { default: { config() {} }, config() {} }, path: { default: require('node:path') } }, defines: { __dirname: "'.'" } });
    const statements = [];
    const ran = new Set();
    const exec = async (sql, params = []) => {
        const s = sql.replace(/\s+/g, ' ').trim();
        statements.push(s);
        if (s.startsWith('SELECT 1 FROM maintenance_runs')) return { rows: ran.has(params[0]) ? [{}] : [], rowCount: 0 };
        if (s.startsWith('INSERT INTO maintenance_runs')) ran.add(params[0]);
        return { rows: [], rowCount: 1 };
    };
    const pool = { query: exec, connect: async () => ({ query: exec, release() {} }) };

    delete process.env.PURGE_LEGACY;
    await purgeLegacy(pool);
    assert.equal(statements.length, 0, 'without the switch nothing is touched');

    process.env.PURGE_LEGACY = 'on';
    await purgeLegacy(pool);
    assert.ok(statements.includes('BEGIN') && statements.includes('COMMIT'));
    assert.ok(statements.some(s => s.startsWith('UPDATE game_state SET resources = DEFAULT')));
    assert.ok(statements.some(s => s === 'DELETE FROM resource_logs'));
    assert.ok(statements.some(s => s.startsWith("UPDATE tasks SET faction = 'default'")));
    const count = statements.length;
    await purgeLegacy(pool);
    assert.equal(statements.length, count + 1, 'the second run only checks and stops');
    delete process.env.PURGE_LEGACY;
});
