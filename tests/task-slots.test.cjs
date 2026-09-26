const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const s = loadTs('shared/tasks/slots.ts');

test('slots: a start, an end and an interval produce the whole day in one go', () => {
    assert.deepEqual([...s.generateSlots('08:00', '22:00', 120)], ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00']);
    assert.deepEqual([...s.generateSlots('09:00', '10:30', 45)], ['09:00', '09:45', '10:30']);
    // An end that does not land on the interval stops before it.
    assert.deepEqual([...s.generateSlots('09:00', '10:00', 45)], ['09:00', '09:45']);
});

test('slots: an end before the start runs past midnight', () => {
    assert.deepEqual([...s.generateSlots('22:00', '02:00', 120)], ['00:00', '02:00', '22:00']);
});

test('slots: nonsense input yields nothing rather than a broken schedule', () => {
    assert.deepEqual([...s.generateSlots('8:00', '22:00', 120)], []);
    assert.deepEqual([...s.generateSlots('08:00', '25:00', 120)], []);
    assert.deepEqual([...s.generateSlots('08:00', '22:00', 0)], []);
    assert.equal(s.generateSlots('00:00', '23:59', 1).length, s.MAX_SLOTS);
});

test('slots: stored times are sorted, deduplicated and validated', () => {
    assert.deepEqual([...s.normalizeSlots(['12:00', '08:00', '12:00', 'noon', 5])], ['08:00', '12:00']);
    assert.deepEqual([...s.normalizeSlots('12:00')], []);
});

test('slots: completion always takes the earliest outstanding time', () => {
    const slots = ['08:00', '10:00', '12:00'];
    let done = s.completeNextSlot(slots, []);
    assert.deepEqual([...done], ['08:00']);
    done = s.completeNextSlot(slots, done);
    assert.deepEqual([...done], ['08:00', '10:00']);
    assert.equal(s.nextSlot(slots, done), '12:00');
    done = s.completeNextSlot(slots, done);
    assert.deepEqual([...done], slots);
    assert.equal(s.nextSlot(slots, done), null);
    // A fourth press has nothing left to take, so nothing is recorded twice.
    assert.equal(s.completeNextSlot(slots, done), null);
});

test('slots: the day is met only when every slot is done', () => {
    const slots = ['08:00', '10:00'];
    assert.equal(s.slotsMet(slots, ['08:00']), false);
    assert.equal(s.slotsMet(slots, ['08:00', '10:00']), true);
    // Times the task no longer holds cannot stand in for the ones it does.
    assert.equal(s.slotsMet(slots, ['08:00', '23:00']), false);
    assert.deepEqual({ ...s.slotProgress(slots, ['08:00', '23:00']) }, { done: 1, total: 2 });
    assert.equal(s.slotsMet([], []), false);
});

test('reminders: a slot is announced once, only while it is fresh and outstanding', () => {
    const slots = ['08:00', '10:00', '12:00'];
    // 10:03 is three minutes past the 10:00 slot.
    assert.deepEqual([...s.dueReminders(slots, [], [], 10 * 60 + 3)], ['10:00']);
    // 08:00 fell due two hours ago: too old to shout about now.
    assert.deepEqual([...s.dueReminders(slots, [], [], 12 * 60)], ['12:00']);
    // Already drunk, or already announced: silence either way.
    assert.deepEqual([...s.dueReminders(slots, ['10:00'], [], 10 * 60 + 3)], []);
    assert.deepEqual([...s.dueReminders(slots, [], ['10:00'], 10 * 60 + 3)], []);
    // A slot still ahead is not announced early.
    assert.deepEqual([...s.dueReminders(slots, [], [], 9 * 60 + 59)], []);
    // A server down for five minutes still catches the slot it slept through.
    assert.deepEqual([...s.dueReminders(slots, [], [], 10 * 60 + 9)], ['10:00']);
    assert.deepEqual([...s.dueReminders(slots, [], [], 10 * 60 + 11)], []);
});

test('slots: any one time can be settled, in any order', () => {
    const slots = ['06:00', '08:00', '10:00'];
    // Missing 06:00 does not stop 10:00 from being drunk.
    let done = s.completeSlot(slots, [], '10:00');
    assert.deepEqual([...done], ['10:00']);
    // Stored sorted, so the earlier make-good lands in front of it.
    done = s.completeSlot(slots, done, '06:00');
    assert.deepEqual([...done], ['06:00', '10:00']);
    assert.equal(s.slotsMet(slots, done), false);
    // A time the task does not hold, and one already settled, both do nothing.
    assert.equal(s.completeSlot(slots, done, '07:00'), null);
    assert.equal(s.completeSlot(slots, done, '10:00'), null);
    done = s.completeSlot(slots, done, '08:00');
    assert.equal(s.slotsMet(slots, done), true);
});

test('slots: a time that has passed is late, never locked', () => {
    const slots = ['06:00', '10:00', '20:00'];
    const at0953 = 9 * 60 + 53;
    assert.equal(s.slotState(slots, [], '06:00', at0953), 'late');
    assert.equal(s.slotState(slots, [], '10:00', at0953), 'open');
    assert.equal(s.slotState(slots, [], '20:00', at0953), 'open');
    assert.equal(s.slotState(slots, ['06:00'], '06:00', at0953), 'done');
    // Late is a mark, not a lock: the press still goes through.
    assert.deepEqual([...s.completeSlot(slots, [], '06:00')], ['06:00']);
});

test('slots: minutes since midnight reads the clock, not the date', () => {
    assert.equal(s.minutesSinceMidnight(new Date(2026, 8, 25, 9, 53)), 9 * 60 + 53);
    assert.equal(s.minutesSinceMidnight(new Date(2026, 8, 25, 0, 0)), 0);
});
