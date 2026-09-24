// In-memory stand-in for the PostgreSQL statements used by the ledger and reward
// routes. It mirrors the constraints the code relies on (primary keys, UNIQUE
// (user_id, seq), preset upsert) and rolls back on error like a transaction.
// It is not a SQL engine: an unknown statement throws so tests cannot pass silently.
function createFakeDb() {
    const tables = { expenses: [], reward_entries: [], ledger_presets: [], core_plans: [], tasks: [], projects: [], roster_characters: [], squads: [], equipment_items: [], equipment_authorizations: [], personnel_authorizations: [], operations: [] };
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
        if (s.startsWith('SELECT day, task_ids FROM core_plans')) {
            const rows = tables.core_plans.filter(r => r.user_id === p[0] && r.day === p[1]);
            return { rows, rowCount: rows.length };
        }
        if (s.startsWith('INSERT INTO core_plans')) {
            const [user_id, day, task_ids] = p;
            let row = tables.core_plans.find(r => r.user_id === user_id && r.day === day);
            const next = { user_id, day, task_ids: JSON.parse(task_ids) };
            if (row) Object.assign(row, next); else tables.core_plans.push(next);
            return { rows: [], rowCount: 1 };
        }
        if (s.startsWith('SELECT due_times, slots_done, slots_day FROM tasks WHERE id = $1')) {
            const rows = tables.tasks.filter(t => t.id === p[0] && t.user_id === p[1])
                .map(t => ({ due_times: t.due_times ?? null, slots_done: t.slots_done ?? null, slots_day: t.slots_day ?? null }));
            return { rows, rowCount: rows.length };
        }
        if (s.startsWith('SELECT id, status, last_completed_at FROM tasks WHERE user_id = $1')) {
            const rows = tables.tasks.filter(t => t.user_id === p[0]);
            return { rows, rowCount: rows.length };
        }
        if (s.startsWith('UPDATE tasks SET')) return applyUpdate(tables.tasks, s, p);
        if (s.startsWith('SELECT sub_tasks, milestone_ids, created_at, closed_at FROM projects')) {
            const rows = tables.projects.filter(r => r.id === p[0] && r.user_id === p[1]);
            return { rows, rowCount: rows.length };
        }
        if (s.startsWith('INSERT INTO projects')) {
            if (tables.projects.some(r => r.id === p[0])) return { rows: [], rowCount: 0 };
            tables.projects.push({
                id: p[0], title: p[1], month: p[2], difficulty: p[3], completed: p[4],
                sub_tasks: JSON.parse(p[5]), user_id: p[6], milestone_ids: [],
                created_at: new Date(fake.now += 1000), closed_at: null,
            });
            return { rows: [], rowCount: 1 };
        }
        if (s.startsWith('UPDATE projects SET closed_at = NULL WHERE id = $1 AND user_id = $2')) {
            const row = tables.projects.find(r => r.id === p[0] && r.user_id === p[1]);
            if (row) row.closed_at = null;
            return { rows: [], rowCount: row ? 1 : 0 };
        }
        if (s.startsWith('UPDATE projects SET')) return applyUpdate(tables.projects, s, p);
        if (s.startsWith('DELETE FROM projects WHERE id = $1 AND user_id = $2')) {
            const before = tables.projects.length;
            tables.projects = tables.projects.filter(r => !(r.id === p[0] && r.user_id === p[1]));
            return { rows: [], rowCount: before - tables.projects.length };
        }
        if (s.startsWith('SELECT COUNT(*)::int AS count FROM roster_characters')) {
            return { rows: [{ count: tables.roster_characters.filter(r => r.user_id === p[0]).length }], rowCount: 1 };
        }
        if (s.startsWith('SELECT id, name, origin, duty, asset_id, xp, health, wounded_day, recruited_at FROM roster_characters')) {
            const rows = tables.roster_characters.filter(r => r.user_id === p[0]);
            return { rows, rowCount: rows.length };
        }
        if (s.startsWith('UPDATE roster_characters SET wounded_day =')) {
            const ids = new Set(p[2]);
            let n = 0;
            for (const row of tables.roster_characters) {
                if (row.user_id === p[1] && ids.has(row.id)) { row.wounded_day = p[0]; n += 1; }
            }
            return { rows: [], rowCount: n };
        }
        if (s.startsWith("SELECT COUNT(*)::int AS won FROM operations")) {
            return { rows: [{ won: tables.operations.filter(o => o.user_id === p[0] && o.outcome === 'victory').length }], rowCount: 1 };
        }
        if (s.startsWith('INSERT INTO equipment_authorizations')) {
            if (!tables.equipment_authorizations.some(r => r.user_id === p[0] && r.catalog_id === p[1])) {
                tables.equipment_authorizations.push({ user_id: p[0], catalog_id: p[1] });
            }
            return { rows: [], rowCount: 1 };
        }
        if (s.startsWith('INSERT INTO personnel_authorizations')) {
            if (!tables.personnel_authorizations.some(r => r.user_id === p[0] && r.template_id === p[1])) {
                tables.personnel_authorizations.push({ user_id: p[0], template_id: p[1] });
            }
            return { rows: [], rowCount: 1 };
        }
        if (s.startsWith('INSERT INTO roster_characters')) {
            tables.roster_characters.push({
                id: p[0], user_id: p[1], name: p[2], origin: p[3], duty: p[4],
                asset_id: p[5], xp: 0, health: p[6], recruited_at: new Date(fake.now += 1000),
            });
            return { rows: [], rowCount: 1 };
        }
        if (s.startsWith('SELECT id, name, member_ids FROM squads')) {
            const rows = tables.squads.filter(r => r.user_id === p[0]);
            return { rows, rowCount: rows.length };
        }
        if (s.startsWith('INSERT INTO squads')) {
            tables.squads.push({ id: p[0], user_id: p[1], name: p[2], member_ids: JSON.parse(p[3]), created_at: new Date(fake.now += 1000) });
            return { rows: [], rowCount: 1 };
        }
        if (s.startsWith('UPDATE squads SET')) return applyUpdate(tables.squads, s, p);
        if (s.startsWith('DELETE FROM squads WHERE id = $1 AND user_id = $2')) {
            const before = tables.squads.length;
            tables.squads = tables.squads.filter(r => !(r.id === p[0] && r.user_id === p[1]));
            return { rows: [], rowCount: before - tables.squads.length };
        }
        if (s.startsWith('SELECT id, catalog_id, assigned_to, paid, acquired_at FROM equipment_items')) {
            const rows = tables.equipment_items.filter(r => r.user_id === p[0]);
            return { rows, rowCount: rows.length };
        }
        if (s.startsWith('INSERT INTO equipment_items')) {
            tables.equipment_items.push({ id: p[0], user_id: p[1], catalog_id: p[2], assigned_to: null, paid: p[3], acquired_at: new Date(fake.now += 1000) });
            return { rows: [], rowCount: 1 };
        }
        if (s.startsWith('UPDATE equipment_items SET assigned_to = NULL WHERE id = $1 AND user_id = $2')) {
            const row = tables.equipment_items.find(r => r.id === p[0] && r.user_id === p[1]);
            if (row) row.assigned_to = null;
            return { rows: [], rowCount: row ? 1 : 0 };
        }
        if (s.startsWith('UPDATE equipment_items SET assigned_to = $1 WHERE id = $2 AND user_id = $3')) {
            const row = tables.equipment_items.find(r => r.id === p[1] && r.user_id === p[2]);
            if (row) row.assigned_to = p[0];
            return { rows: [], rowCount: row ? 1 : 0 };
        }
        if (s.startsWith('DELETE FROM equipment_items WHERE id = $1 AND user_id = $2')) {
            const before = tables.equipment_items.length;
            tables.equipment_items = tables.equipment_items.filter(r => !(r.id === p[0] && r.user_id === p[1]));
            return { rows: [], rowCount: before - tables.equipment_items.length };
        }
        if (s.startsWith('SELECT catalog_id FROM equipment_authorizations')) {
            const rows = tables.equipment_authorizations.filter(r => r.user_id === p[0]);
            return { rows, rowCount: rows.length };
        }
        if (s.startsWith('SELECT template_id FROM personnel_authorizations')) {
            const rows = tables.personnel_authorizations.filter(r => r.user_id === p[0]);
            return { rows, rowCount: rows.length };
        }
        if (s.startsWith('INSERT INTO operations')) {
            tables.operations.push({
                id: p[0], user_id: p[1], squad_id: p[2], scenario_id: p[3], seed: p[4],
                crew: JSON.parse(p[5]), trainee_ids: JSON.parse(p[6]), outcome: p[7], pays_xp: p[8],
                started_at: new Date(fake.now += 1000),
            });
            return { rows: [], rowCount: 1 };
        }
        if (s.startsWith('UPDATE roster_characters SET xp = xp + $1 WHERE id = $2 AND user_id = $3')) {
            const row = tables.roster_characters.find(r => r.id === p[1] && r.user_id === p[2]);
            if (row) row.xp = (row.xp ?? 0) + p[0];
            return { rows: [], rowCount: row ? 1 : 0 };
        }
        throw new Error(`fake-db: unsupported statement: ${s}`);
    }

    // Handles the routes' dynamically built "UPDATE <table> SET a = $1, b = $2
    // WHERE id = $n AND user_id = $n+1" by mapping each assignment to its param.
    const JSON_COLUMNS = new Set(['sub_tasks', 'milestone_ids', 'member_ids']);
    function applyUpdate(rows, sql, params) {
        const [, setClause, idIdx, userIdx] = sql.match(/^UPDATE \w+ SET (.+) WHERE id = \$(\d+) AND user_id = \$(\d+)$/) ?? [];
        if (!setClause) throw new Error(`fake-db: unsupported update: ${sql}`);
        const row = rows.find(r => r.id === params[Number(idIdx) - 1] && r.user_id === params[Number(userIdx) - 1]);
        if (!row) return { rows: [], rowCount: 0 };
        for (const assignment of setClause.split(', ')) {
            const [column, placeholder] = assignment.split(' = ');
            const value = params[Number(placeholder.slice(1)) - 1];
            row[column] = JSON_COLUMNS.has(column) ? JSON.parse(value) : value;
        }
        return { rows: [], rowCount: 1 };
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
