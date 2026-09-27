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
