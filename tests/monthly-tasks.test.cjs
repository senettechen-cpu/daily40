const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

const m = loadTs('shared/tasks/monthly.ts');
// Arrays built inside the loader sandbox have their own Array prototype, so a
// strict deep-equal against a plain literal fails on the prototype alone.
const plain = value => [...value];

// Taipei is UTC+8, so a date built from a UTC instant near midnight lands on the
// next day locally. Every case below is written as the instant, then asserted
// against what the user's calendar says.
const taipei = (year, month, day, hour = 12) =>
    new Date(Date.UTC(year, month - 1, day, hour - 8));

test('a chosen day lands on itself in a month long enough to hold it', () => {
    assert.equal(m.landsOn(5, 2026, 9), 5);
    assert.equal(m.landsOn(30, 2026, 9), 30);
    assert.equal(m.landsOn(1, 2026, 2), 1);
});

test('a day past the end of the month lands on the last day, never skipped', () => {
    assert.equal(m.landsOn(31, 2026, 9), 30, 'September has 30 days');
    assert.equal(m.landsOn(31, 2026, 2), 28, 'February 2026 has 28');
    assert.equal(m.landsOn(30, 2026, 2), 28);
    assert.equal(m.landsOn(31, 2028, 2), 29, '2028 is a leap year');
});

test('daysInMonth knows the short months and leap years', () => {
    assert.equal(m.daysInMonth(2026, 1), 31);
    assert.equal(m.daysInMonth(2026, 2), 28);
    assert.equal(m.daysInMonth(2028, 2), 29);
    assert.equal(m.daysInMonth(2026, 4), 30);
    assert.equal(m.daysInMonth(2026, 12), 31);
});

test('normalizeMonthDays keeps 1-31, sorted, without duplicates', () => {
    assert.deepEqual(plain(m.normalizeMonthDays([15, 1, 15])), [1, 15]);
    assert.deepEqual(plain(m.normalizeMonthDays([0, 32, -3, 5])), [5]);
    assert.deepEqual(plain(m.normalizeMonthDays(['5', null, undefined, {}])), []);
    assert.deepEqual(plain(m.normalizeMonthDays(undefined)), []);
    assert.deepEqual(plain(m.normalizeMonthDays([5.9])), [5], 'a fraction truncates rather than being dropped');
});

test('a protocol falls only on its own days', () => {
    const days = [5, 20];
    assert.equal(m.occursOn(days, taipei(2026, 9, 5)), true);
    assert.equal(m.occursOn(days, taipei(2026, 9, 20)), true);
    assert.equal(m.occursOn(days, taipei(2026, 9, 6)), false);
    assert.equal(m.occursOn(days, taipei(2026, 9, 19)), false);
    assert.equal(m.occursOn([], taipei(2026, 9, 5)), false, 'no days means it never falls');
});

test('the 31st falls on the last day of a short month, and only then', () => {
    assert.equal(m.occursOn([31], taipei(2026, 9, 30)), true, 'September: the 30th');
    assert.equal(m.occursOn([31], taipei(2026, 9, 29)), false);
    assert.equal(m.occursOn([31], taipei(2026, 2, 28)), true, 'February 2026: the 28th');
    assert.equal(m.occursOn([31], taipei(2028, 2, 29)), true, 'leap February: the 29th');
    assert.equal(m.occursOn([31], taipei(2026, 10, 31)), true, 'October: its own day');
    assert.equal(m.occursOn([31], taipei(2026, 10, 30)), false);
});

test('two chosen days that collapse onto one date fire once, not twice', () => {
    // In February both the 30th and the 31st land on the 28th.
    assert.equal(m.occursOn([30, 31], taipei(2026, 2, 28)), true);
    assert.equal(m.normalizeMonthDays([30, 31]).length, 2, 'both are still stored');
});

test('the day is read in Taipei, not in the machine zone', () => {
    // 2026-09-05 00:30 Taipei is 2026-09-04 16:30 UTC: the user says the 5th.
    const justAfterMidnight = new Date('2026-09-04T16:30:00Z');
    assert.equal(m.occursOn([5], justAfterMidnight), true);
    // 2026-09-05 23:30 Taipei is 15:30 UTC, still the 5th.
    assert.equal(m.occursOn([5], new Date('2026-09-05T15:30:00Z')), true);
    // 2026-09-06 00:30 Taipei is 2026-09-05 16:30 UTC: no longer the 5th.
    assert.equal(m.occursOn([5], new Date('2026-09-05T16:30:00Z')), false);
});

test('the label says when a chosen day is being moved to the month end', () => {
    assert.equal(m.monthDayLabel([5], taipei(2026, 9, 1)), '5 號');
    assert.equal(m.monthDayLabel([1, 15], taipei(2026, 9, 1)), '1 號、15 號');
    assert.match(m.monthDayLabel([31], taipei(2026, 9, 1)), /本月只到 30/);
    assert.equal(m.monthDayLabel([31], taipei(2026, 10, 1)), '31 號', 'October holds the 31st');
    assert.equal(m.monthDayLabel([], taipei(2026, 9, 1)), '');
});

// ---- the deadline, not the day ---------------------------------------------

test('the deadline is the earliest chosen day as it lands this month', () => {
    assert.equal(m.deadlineDay([5], taipei(2026, 9, 1)), 5);
    assert.equal(m.deadlineDay([20, 5], taipei(2026, 9, 1)), 5, 'the earliest of several');
    assert.equal(m.deadlineDay([31], taipei(2026, 9, 1)), 30, 'slid to the month end');
    assert.equal(m.deadlineDay([], taipei(2026, 9, 1)), null, 'not monthly at all');
});

test('days left counts down, hits zero on the day, and goes negative after', () => {
    assert.equal(m.daysLeft([5], taipei(2026, 9, 1)), 4);
    assert.equal(m.daysLeft([5], taipei(2026, 9, 4)), 1);
    assert.equal(m.daysLeft([5], taipei(2026, 9, 5)), 0, 'due today');
    assert.equal(m.daysLeft([5], taipei(2026, 9, 6)), -1, 'one day over');
    assert.equal(m.daysLeft([5], taipei(2026, 9, 30)), -25, 'still counted at month end');
    assert.equal(m.daysLeft([], taipei(2026, 9, 5)), null);
});

test('the deadline reads plainly on every day of its month', () => {
    const on = day => m.deadlineLabel([5], taipei(2026, 9, day));
    assert.equal(on(1), '5 號前 · 還有 4 天');
    assert.equal(on(4), '5 號前 · 明天截止');
    assert.equal(on(5), '5 號前 · 今天截止');
    assert.equal(on(7), '5 號前 · 已逾期 2 天');
    assert.match(m.deadlineLabel([31], taipei(2026, 9, 28)), /^30 號前/, 'a slid deadline says the real date');
});

test('a new month starts the count over', () => {
    assert.equal(m.daysLeft([5], taipei(2026, 9, 30)), -25, 'September: long overdue');
    assert.equal(m.daysLeft([5], taipei(2026, 10, 1)), 4, 'October: four days to go again');
});

// ---- server round trip -----------------------------------------------------

const { createFakeDb } = require('./helpers/fake-db.cjs');

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

test('server: a monthly protocol keeps its days through create, read and update', async () => {
    process.env.V15_ECONOMY = 'on';
    const db = createFakeDb();
    const tasks = mount('server/src/routes/tasks.ts', db);
    const base = {
        faction: 'default', difficulty: 1, dueDate: new Date().toISOString(),
        createdAt: new Date().toISOString(), status: 'active', isRecurring: true,
    };

    await tasks('POST', '/', { body: { ...base, id: 'rent', title: '繳房租', monthDays: [5] } });
    await tasks('POST', '/', { body: { ...base, id: 'report', title: '交月報', monthDays: [15, 1, 15] } });
    await tasks('POST', '/', { body: { ...base, id: 'water', title: '喝水' } });
    await tasks('POST', '/', { body: { ...base, id: 'junk', title: '亂填', monthDays: [0, 99, 'x'] } });

    const read = (await tasks('GET', '/')).body;
    const byId = id => read.find(t => t.id === id);
    assert.deepEqual([...byId('rent').monthDays], [5]);
    assert.deepEqual([...byId('report').monthDays], [1, 15], 'sorted and de-duplicated');
    assert.deepEqual([...byId('water').monthDays], [], 'a daily protocol carries no days');
    assert.deepEqual([...byId('junk').monthDays], [], 'days outside 1-31 are dropped, not stored');

    await tasks('PUT', '/:id', { params: { id: 'rent' }, body: { monthDays: [1, 20] } });
    assert.deepEqual(JSON.parse(db.tables.tasks.find(t => t.id === 'rent').month_days), [1, 20]);

    // Clearing the days puts a protocol back to daily rather than making it vanish.
    await tasks('PUT', '/:id', { params: { id: 'rent' }, body: { monthDays: [] } });
    assert.deepEqual(JSON.parse(db.tables.tasks.find(t => t.id === 'rent').month_days), []);
});
