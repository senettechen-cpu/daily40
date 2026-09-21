const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function route(rows) {
    const handlers = {};
    const queries = [];
    const sandbox = { exports: {}, console: { log() {}, error() {} }, require(name) {
        if (name === 'express') return { Router: () => ({ get: (_, fn) => handlers.get = fn, post: (_, fn) => handlers.post = fn }) };
        if (name === '../db') return { query: async (sql, values) => { queries.push({ sql, values }); return { rows }; } };
        throw new Error(name);
    } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('server/src/routes/gameState.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
    const res = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    return { handlers, queries, res };
}
test('GET returns campaign for authenticated user', async () => {
    const campaign = { points: 3 };
    const { handlers, queries, res } = route([{ id: 'user', campaign }]);
    await handlers.get({ user: { uid: 'user' } }, res);
    assert.equal(res.body.campaign, campaign);
    assert.equal(queries[0].values[0], 'user');
});
test('new-user INSERT includes campaign; partial existing update preserves it when omitted', async () => {
    const campaign = { points: 2 };
    const first = route([]);
    await first.handlers.post({ user: { uid: 'user' }, body: { campaign } }, first.res);
    assert.match(first.queries[1].sql, /astartes, campaign/);
    assert.equal(first.queries[1].values[10], campaign);
    const update = route([{ id: 'user' }]);
    await update.handlers.post({ user: { uid: 'user' }, body: { corruption: 4 } }, update.res);
    assert.doesNotMatch(update.queries[1].sql, /campaign/);
});
test('campaign-only update remains user-scoped', async () => {
    const { handlers, queries, res } = route([{ id: 'user' }]);
    await handlers.post({ user: { uid: 'user' }, body: { campaign: { points: 1 } } }, res);
    assert.equal(queries[1].sql, 'UPDATE game_state SET campaign = $1 WHERE user_id = $2');
    assert.equal(queries[1].values[1], 'user');
});
