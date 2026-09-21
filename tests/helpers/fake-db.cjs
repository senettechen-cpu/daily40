// In-memory stand-in for the PostgreSQL statements used by the ledger and reward
// routes. It mirrors the constraints the code relies on (primary keys, UNIQUE
// (user_id, seq), preset upsert) and rolls back on error like a transaction.
// It is not a SQL engine: an unknown statement throws so tests cannot pass silently.
function createFakeDb() {
    const tables = { expenses: [], reward_entries: [], ledger_presets: [] };
    const log = [];
    const normalized = sql => sql.replace(/\s+/g, ' ').trim();

    async function query(sql, params = []) {
        const s = normalized(sql);
        log.push(s);
        if (fake.failOn && fake.failOn.test(s)) { fake.failOn = null; throw new Error('fake-db: injected failure'); }
        const p = params;
        if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [], rowCount: 0 };
        if (s.startsWith('INSERT INTO expenses')) {
            if (tables.expenses.some(e => e.id === p[0])) return { rows: [], rowCount: 0 };
            tables.expenses.push({ id: p[0], user_id: p[1], date: p[2], category: p[3], item_name: p[4], amount: p[5], payment_method: p[6], is_archived: false, created_at: new Date(fake.now += 1000) });
            return { rows: [], rowCount: 1 };
        }
        if (s.startsWith('SELECT user_id FROM expenses WHERE id = $1')) return { rows: tables.expenses.filter(e => e.id === p[0]).map(e => ({ user_id: e.user_id })), rowCount: 1 };
        if (s.startsWith('DELETE FROM expenses WHERE id = $1 AND user_id = $2')) {
            const before = tables.expenses.length;
            tables.expenses = tables.expenses.filter(e => !(e.id === p[0] && e.user_id === p[1]));
            return { rows: [], rowCount: before - tables.expenses.length };
        }
        if (s.startsWith('SELECT category, item_name, payment_method, created_at FROM expenses')) {
            const rows = tables.expenses.filter(e => e.user_id === p[0] && e.created_at >= p[1]);
            return { rows, rowCount: rows.length };
        }
        if (s.startsWith('SELECT seq, source_key, kind, amount, day, at, reason FROM reward_entries')) {
            const rows = tables.reward_entries.filter(r => r.user_id === p[0]).sort((a, b) => a.seq - b.seq);
            return { rows, rowCount: rows.length };
        }
        if (s.startsWith('INSERT INTO reward_entries')) {
            if (tables.reward_entries.some(r => r.user_id === p[0] && r.seq === p[1])) throw new Error('duplicate key value violates unique constraint (user_id, seq)');
            tables.reward_entries.push({ user_id: p[0], seq: p[1], source_key: p[2], kind: p[3], amount: p[4], day: p[5], at: p[6], reason: p[7] });
            return { rows: [], rowCount: 1 };
        }
        if (s.startsWith('INSERT INTO ledger_presets')) {
            const [id, user_id, category, item_name, payment_method, amount, pinned, hidden] = p;
            let row = tables.ledger_presets.find(r => r.user_id === user_id && r.category === category && r.item_name === item_name && r.payment_method === payment_method);
            if (row) Object.assign(row, { amount, pinned, hidden });
            else tables.ledger_presets.push(row = { id, user_id, category, item_name, payment_method, amount, pinned, hidden, created_at: new Date(fake.now) });
            return { rows: [{ ...row }], rowCount: 1 };
        }
        if (s.startsWith('SELECT * FROM ledger_presets WHERE user_id = $1')) {
            const rows = tables.ledger_presets.filter(r => r.user_id === p[0]);
            return { rows, rowCount: rows.length };
        }
        if (s.startsWith('DELETE FROM ledger_presets WHERE id = $1 AND user_id = $2 AND pinned = TRUE')) {
            const before = tables.ledger_presets.length;
            tables.ledger_presets = tables.ledger_presets.filter(r => !(r.id === p[0] && r.user_id === p[1] && r.pinned));
            return { rows: [], rowCount: before - tables.ledger_presets.length };
        }
        throw new Error(`fake-db: unsupported statement: ${s}`);
    }

    async function withTransaction(work) {
        const snapshot = JSON.stringify(tables, (k, v) => v);
        const dates = tables.expenses.map(e => e.created_at);
        try { return await work({ query }); }
        catch (err) {
            const restored = JSON.parse(snapshot);
            restored.expenses.forEach((e, i) => { e.created_at = dates[i] ?? new Date(e.created_at); });
            restored.ledger_presets.forEach(r => { r.created_at = new Date(r.created_at); });
            Object.assign(tables, restored);
            throw err;
        }
    }

    // Each insert advances the clock one second, starting an hour ago, so ordering is deterministic.
    const fake = { tables, log, query, withTransaction, now: Date.now() - 3_600_000, failOn: null };
    return fake;
}
module.exports = { createFakeDb };
