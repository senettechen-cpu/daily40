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
