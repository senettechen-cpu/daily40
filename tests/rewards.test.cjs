const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const r = loadTs('shared/rewards/index.ts');

// Asia/Taipei is UTC+8 with no DST: 2026-09-21 08:59 local = 00:59Z.
const taipei = (day, time = '12:00') => new Date(`${day}T${time}:00+08:00`);
const apply = r.append;

test('book: grants are idempotent, reversals net to zero, balance is the sum', () => {
    let book = r.emptyBook();
    const at = taipei('2026-09-21');
    const g = r.planGrant(book, { sourceKey: 'x', amount: 20, day: '2026-09-21', at, reason: 't' });
    book = apply(book, g);
    assert.equal(r.planGrant(book, { sourceKey: 'x', amount: 20, day: '2026-09-21', at, reason: 't' }), null);
    book = apply(book, r.planReversal(book, 'x', '2026-09-21', at, 'undo'));
    assert.equal(r.planReversal(book, 'x', '2026-09-21', at, 'undo'), null);
    assert.equal(r.balance(book), 0);
    assert.deepEqual([...book.entries.map(e => e.seq)], [1, 2]);
});

test('ledger: +20 for the first three entries recorded per day, none after', () => {
    let book = r.emptyBook();
    const at = taipei('2026-09-21');
    for (const id of ['a', 'b', 'c', 'd', 'e']) book = apply(book, r.onExpenseRecorded(book, id, at));
    assert.equal(r.balance(book), 60);
    assert.equal(r.ledgerSlotsUsed(book, '2026-09-21'), 3);
    // Recording the same expense twice (network retry) never pays twice.
    const once = apply(r.emptyBook(), r.onExpenseRecorded(r.emptyBook(), 'a', at));
    assert.equal(r.onExpenseRecorded(once, 'a', at), null);
});

test('ledger: deleting a rewarded entry reverses it and frees the slot; delete-and-readd nets zero', () => {
    let book = r.emptyBook();
    const at = taipei('2026-09-21');
    for (const id of ['a', 'b', 'c']) book = apply(book, r.onExpenseRecorded(book, id, at));
    book = apply(book, r.onExpenseDeleted(book, 'b', at));
    assert.equal(r.balance(book), 40);
    book = apply(book, r.onExpenseRecorded(book, 'f', at));
    assert.equal(r.balance(book), 60);
    // Deleting an unrewarded (4th) entry changes nothing.
    assert.equal(r.onExpenseDeleted(book, 'never-rewarded', at), null);
});

test('ledger: the recording day counts in Taipei time, and a new day opens new slots', () => {
    let book = r.emptyBook();
    // 23:30 on the 21st in Taipei is 15:30Z the same day; 00:30 on the 22nd is 16:30Z on the 21st.
    for (const id of ['a', 'b', 'c']) book = apply(book, r.onExpenseRecorded(book, id, taipei('2026-09-21', '23:30')));
    assert.equal(r.onExpenseRecorded(book, 'd', taipei('2026-09-21', '23:59')), null);
    const next = r.onExpenseRecorded(book, 'e', taipei('2026-09-22', '00:30'));
    assert.equal(next.day, '2026-09-22');
});

test('ledger: reversals may push the balance negative, which blocks spending', () => {
    let book = apply(r.emptyBook(), r.onExpenseRecorded(r.emptyBook(), 'a', taipei('2026-09-21')));
    book = apply(book, { seq: 2, sourceKey: 'purchase:1', kind: 'spend', amount: -20, day: '2026-09-21', at: '', reason: 'buy' });
    book = apply(book, r.onExpenseDeleted(book, 'a', taipei('2026-09-21')));
    assert.equal(r.balance(book), -20);
    assert.equal(r.canSpend(book, 1), false);
});

const ctx = (time, completed = []) => ({ now: taipei(time.slice(0, 10), time.slice(11)), isCompleted: id => completed.includes(id) });
const ok = result => { assert.ok(!('error' in result), result.error); return result.plan; };

test('daily core: up to three before 09:00; tomorrow can be preset; later days cannot', () => {
    let plan = r.emptyPlan('2026-09-21');
    for (const id of ['t1', 't2', 't3']) plan = ok(r.addCore(plan, id, ctx('2026-09-21T08:00')));
    assert.match(r.addCore(plan, 't4', ctx('2026-09-21T08:00')).error, /最多 3/);
    ok(r.addCore(r.emptyPlan('2026-09-22'), 't1', ctx('2026-09-21T22:00')));
    assert.match(r.addCore(r.emptyPlan('2026-09-23'), 't1', ctx('2026-09-21T22:00')).error, /隔天/);
    assert.match(r.addCore(r.emptyPlan('2026-09-20'), 't1', ctx('2026-09-21T08:00')).error, /結束/);
});

test('daily core: after 09:00 the count is capped at the 09:00 count but cores can be swapped', () => {
    let plan = r.emptyPlan('2026-09-21');
    for (const id of ['t1', 't2']) plan = ok(r.addCore(plan, id, ctx('2026-09-21T08:30')));
    assert.match(r.addCore(plan, 't3', ctx('2026-09-21T09:00')).error, /鎖定為 2/);
    plan = ok(r.replaceCore(plan, 't2', 't3', ctx('2026-09-21T10:00')));
    assert.deepEqual([...plan.taskIds], ['t1', 't3']);
    // Remove-then-add is still only a swap: the cap stays 2.
    plan = ok(r.removeCore(plan, 't3', ctx('2026-09-21T11:00')));
    plan = ok(r.addCore(plan, 't4', ctx('2026-09-21T11:05')));
    assert.match(r.addCore(plan, 't5', ctx('2026-09-21T11:10')).error, /鎖定為 2/);
    // An empty plan at 09:00 means no cores that day.
    assert.match(r.addCore(r.emptyPlan('2026-09-21'), 't1', ctx('2026-09-21T09:30')).error, /鎖定為 0/);
});

test('daily core: completed tasks cannot be added, completed cores are locked', () => {
    let plan = ok(r.addCore(r.emptyPlan('2026-09-21'), 't1', ctx('2026-09-21T08:00')));
    assert.match(r.addCore(plan, 't2', ctx('2026-09-21T08:10', ['t2'])).error, /已完成的任務/);
    assert.match(r.removeCore(plan, 't1', ctx('2026-09-21T10:00', ['t1'])).error, /已鎖定/);
    assert.match(r.replaceCore(plan, 't1', 't9', ctx('2026-09-21T10:00', ['t1'])).error, /已鎖定/);
});

test('daily core: +10 only for a committed task completed on its day, once', () => {
    const plan = { day: '2026-09-21', taskIds: ['t1'] };
    let book = r.emptyBook();
    book = apply(book, r.onTaskCompleted(book, plan, 't1', taipei('2026-09-21', '18:00')));
    assert.equal(r.balance(book), 10);
    assert.equal(r.onTaskCompleted(book, plan, 't1', taipei('2026-09-21', '18:01')), null);
    assert.equal(r.onTaskCompleted(book, plan, 't2', taipei('2026-09-21', '18:00')), null);
    assert.equal(r.onTaskCompleted(r.emptyBook(), plan, 't1', taipei('2026-09-22', '08:00')), null);
});

const project = (over = {}) => ({
    createdAt: taipei('2026-09-20'), closedAt: null, milestoneIds: ['s1', 's2', 's3'],
    subTasks: ['s1', 's2', 's3', 's4'].map(id => ({ id, completed: false })), ...over,
});
const done = (p, ids, closedAt = null) => ({ ...p, closedAt, subTasks: p.subTasks.map(s => ({ ...s, completed: s.completed || ids.includes(s.id) })) });
const sync = (book, p, at = taipei('2026-09-21')) => apply(book, ...r.reconcileProject(book, 'p1', p, at));

test('project: three milestones pay 20 each and closing on a later day pays 60 (max 120)', () => {
    let p = project(), book = r.emptyBook();
    p = done(p, ['s1', 's2']); book = sync(book, p);
    assert.equal(r.balance(book), 40);
    p = done(p, ['s3', 's4'], taipei('2026-09-21')); book = sync(book, p);
    assert.equal(r.balance(book), 120);
    assert.equal(r.reconcileProject(book, 'p1', p, taipei('2026-09-22')).length, 0);
});

test('project: created and closed the same day only pays milestones, even when re-synced later', () => {
    let p = project({ createdAt: taipei('2026-09-21', '08:00') });
    p = done(p, ['s1', 's2', 's3', 's4'], taipei('2026-09-21', '20:00'));
    let book = sync(r.emptyBook(), p);
    book = sync(book, p, taipei('2026-09-25'));
    assert.equal(r.balance(book), 60);
});

test('project: no new rewards without three subtasks and exactly three milestones', () => {
    const few = project({ subTasks: [{ id: 's1', completed: true }, { id: 's2', completed: true }], milestoneIds: ['s1', 's2'] });
    assert.equal(r.reconcileProject(r.emptyBook(), 'p1', few, taipei('2026-09-21')).length, 0);
    const two = done(project({ milestoneIds: ['s1', 's2'] }), ['s1']);
    assert.equal(r.reconcileProject(r.emptyBook(), 'p1', two, taipei('2026-09-21')).length, 0);
});

test('project: unchecking or deleting reverses; deleting the project reverses everything', () => {
    let p = done(project(), ['s1', 's2']);
    let book = sync(r.emptyBook(), p);
    p = { ...p, subTasks: p.subTasks.map(s => s.id === 's2' ? { ...s, completed: false } : s) };
    book = sync(book, p);
    assert.equal(r.balance(book), 20);
    book = apply(book, ...r.reconcileProject(book, 'p1', null, taipei('2026-09-21')));
    assert.equal(r.balance(book), 0);
});

test('project: replacing a deleted milestone keeps the other paid milestones', () => {
    let p = done(project(), ['s1', 's2']);
    let book = sync(r.emptyBook(), p);
    // s2 is deleted; only two milestones remain designated.
    p = { ...p, subTasks: p.subTasks.filter(s => s.id !== 's2'), milestoneIds: ['s1', 's3'] };
    book = sync(book, p);
    assert.equal(r.balance(book), 20);
    const next = r.setMilestones(p, ['s1', 's3', 's4']);
    assert.deepEqual([...next.milestoneIds], ['s1', 's3', 's4']);
});

test('project: milestone designation rules', () => {
    const p = done(project({ milestoneIds: ['s1'] }), ['s1', 's4']);
    assert.match(r.setMilestones(p, ['s1', 's4']).error, /已完成的子項不能/);
    assert.match(r.setMilestones(p, ['s2', 's3']).error, /已鎖定/);
    assert.match(r.setMilestones(p, ['s1', 's2', 's3', 's4']).error, /最多 3/);
    assert.match(r.setMilestones(p, ['s1', 'zzz']).error, /子項/);
    assert.deepEqual([...r.setMilestones(p, ['s1', 's2', 's3']).milestoneIds], ['s1', 's2', 's3']);
});
