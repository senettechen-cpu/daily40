const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('./helpers/load-ts.cjs');

// The slate is one timeline for the day: a protocol with times of day is drawn
// as one line per time, and every line sorts by its own clock time. What is not
// today has no place on that clock, so it goes to one end or the other.

const defines = { 'import.meta.env.BASE_URL': "'/'" };
const { default: TaskDataSlate } = loadTs('src/components/TaskDataSlate.tsx', {
    defines,
    mocks: {
        // The loader compiles without esModuleInterop, so `import React from
        // 'react'` reads `.default` off a CommonJS module that has none, and the
        // component's `React.useState` is undefined. Hand it a module that has
        // both shapes.
        react: { ...React, default: React, __esModule: true },
        // Hidden, so the core badge needs none of the rest of the context.
        '../contexts/RequisitionContext': { useRequisition: () => ({ enabled: false }) },
    },
});

const draw = tasks => renderToStaticMarkup(React.createElement(TaskDataSlate, {
    tasks, selectedId: null, onSelect() { }, onPurge() { },
}));

/** The order the titles appear in, by first appearance; the table is drawn first. */
function order(tasks, titles) {
    const html = draw(tasks);
    const seen = titles
        .map(title => ({ title, at: html.indexOf('>' + title + '<') }))
        .filter(entry => entry.at >= 0);
    assert.equal(seen.length, titles.length, `missing from the slate: ${JSON.stringify(seen)}`);
    return seen.sort((a, b) => a.at - b.at).map(entry => entry.title);
}

const base = { faction: 'default', difficulty: 1, createdAt: new Date(), status: 'active' };
const today = (hour, minute = 0) => {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d;
};
const daysFromNow = days => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(12, 0, 0, 0);
    return d;
};

test('slate: a one-off due later sorts to the bottom, whatever month it falls in', () => {
    // '2026/10/22' < '2026/9/30' as text, because '1' sorts before '9'. Reading
    // the locale date that way put every October deadline at the TOP of the
    // slate, above things already overdue (user report 2026-09-30).
    const tasks = [
        { ...base, id: 'next-month', title: '下個月', dueDate: daysFromNow(22) },
        { ...base, id: 'overdue', title: '早就逾期', dueDate: daysFromNow(-3) },
        { ...base, id: 'noon', title: '今天中午', dueDate: today(12) },
    ];
    assert.deepEqual(order(tasks, ['早就逾期', '今天中午', '下個月']), ['早就逾期', '今天中午', '下個月']);
});

test('slate: a protocol\'s times interleave with everything else on the clock', () => {
    const tasks = [
        {
            ...base, id: 'water', title: '喝水', dueDate: today(6), isRecurring: true,
            dueTime: '06:00', dueTimes: ['06:00', '20:00'],
        },
        { ...base, id: 'gym', title: '運動', dueDate: today(8), isRecurring: true, dueTime: '08:00' },
    ];
    // 06:00 water, then the gym at 08:00, then the last glass at 20:00 - not all
    // eight glasses in a block with the gym stranded underneath them.
    const html = draw(tasks);
    const water = [...html.matchAll(/>喝水</g)].map(m => m.index);
    const gym = html.indexOf('>運動<');
    assert.ok(water.length >= 2, 'both times of the protocol are drawn');
    assert.ok(water[0] < gym && gym < water[1], `運動 must sit between the two 喝水 lines: ${water} vs ${gym}`);
});

/** A monthly protocol: a deadline on days of the month, with no time of day. */
const monthly = (id, title, days) => ({
    ...base, id, title, dueDate: today(0), isRecurring: true, monthDays: days,
});

/** The day of this month that is `offset` days from today, clamped to 1-28. */
const dayOfMonth = offset => Math.min(28, Math.max(1, new Date().getDate() + offset));

test('slate: a monthly deadline weeks away sits below today, not on top of it', () => {
    // Its dueDate carries 00:00, which used to be read as a clock time and put
    // a meeting still weeks out above every one of today's habits (user report
    // 2026-10-01).
    const tasks = [
        monthly('mtg', '行銷會議', [28]),
        { ...base, id: 'water', title: '喝水', dueDate: today(6), isRecurring: true, dueTime: '06:00' },
        { ...base, id: 'gym', title: '運動', dueDate: today(20), isRecurring: true, dueTime: '20:00' },
    ];
    if (dayOfMonth(0) >= 28) return; // The 28th onwards has no "weeks away" left this month.
    assert.deepEqual(order(tasks, ['喝水', '運動', '行銷會議']), ['喝水', '運動', '行銷會議']);
});

test('slate: among what is still to come, the nearest deadline comes first', () => {
    const soon = dayOfMonth(2);
    const later = dayOfMonth(6);
    if (soon >= later) return; // Too close to the end of the month to tell them apart.
    const tasks = [
        monthly('far', '月底盤點', [later]),
        monthly('near', '成控會議', [soon]),
        { ...base, id: 'next-week', title: '下週交件', dueDate: daysFromNow(4) },
    ];
    assert.deepEqual(
        order(tasks, ['成控會議', '下週交件', '月底盤點']),
        ['成控會議', '下週交件', '月底盤點'],
    );
});

test('slate: a monthly deadline due today keeps its place in today, above tomorrow', () => {
    const tasks = [
        monthly('due-today', '今天截止', [dayOfMonth(0)]),
        { ...base, id: 'tomorrow', title: '明天', dueDate: daysFromNow(1) },
        { ...base, id: 'morning', title: '早上', dueDate: today(6), isRecurring: true, dueTime: '06:00' },
    ];
    assert.deepEqual(order(tasks, ['早上', '今天截止', '明天']), ['早上', '今天截止', '明天']);
});

test('slate: an overdue monthly deadline stays at the top, oldest first', () => {
    const tasks = [
        { ...base, id: 'noon', title: '今天中午', dueDate: today(12) },
        monthly('late-1', '遲一天', [dayOfMonth(-1)]),
        monthly('late-5', '遲五天', [dayOfMonth(-5)]),
    ];
    if (dayOfMonth(-5) >= dayOfMonth(-1)) return; // Early in the month there is no room.
    assert.deepEqual(order(tasks, ['遲五天', '遲一天', '今天中午']), ['遲五天', '遲一天', '今天中午']);
});
