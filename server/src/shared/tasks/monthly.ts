import { dayKey, DEFAULT_TIME_ZONE } from '../time';

/**
 * Monthly protocols (2026-09-28). A recurring task used to mean "every day";
 * one that carries days of the month is a deadline instead: the user revised
 * the rule to "finish it before the Nth of the month". So it is on the slate
 * from the first of the month, counting down; past its day it stays, marked
 * overdue, until the month ends and the next one starts it over.
 *
 * Kept as days of the month rather than "the second Friday": the user chose the
 * simpler rule, and everything here reads the date out of `dayKey`, so a later
 * weekday rule can sit beside it without changing what is stored.
 */
export const MAX_MONTH_DAYS = 31;

/** Days in the given month; `month` is 1-12. */
export const daysInMonth = (year: number, month: number): number =>
    new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * The date a chosen day lands on in a given month. A protocol set to the 31st
 * still has to happen in February, so anything past the end of the month lands
 * on its last day rather than being skipped.
 */
export const landsOn = (day: number, year: number, month: number): number =>
    Math.min(day, daysInMonth(year, month));

/** Sorted, de-duplicated days of the month; anything outside 1-31 is dropped. */
export const normalizeMonthDays = (days: unknown): number[] => {
    if (!Array.isArray(days)) return [];
    const kept = days
        .map(value => (typeof value === 'number' ? Math.trunc(value) : Number.NaN))
        .filter(value => Number.isInteger(value) && value >= 1 && value <= MAX_MONTH_DAYS);
    return [...new Set(kept)].sort((a, b) => a - b);
};

/** Whether a protocol on these days falls on `at`, read in the user's zone. */
export function occursOn(days: number[], at: Date, timeZone = DEFAULT_TIME_ZONE): boolean {
    const [year, month, date] = dayKey(at, timeZone).split('-').map(Number);
    return days.some(day => landsOn(day, year, month) === date);
}

/** How a day of the month reads on screen, with the month-end case spelled out. */
export function monthDayLabel(days: number[], at: Date, timeZone = DEFAULT_TIME_ZONE): string {
    if (days.length === 0) return '';
    const [year, month] = dayKey(at, timeZone).split('-').map(Number);
    const end = daysInMonth(year, month);
    return days
        .map(day => (day > end ? `${day} 號（本月只到 ${end}，順延至月底）` : `${day} 號`))
        .join('、');
}

/** The deadline this month, as a day of the month; the earliest when several. */
export const deadlineDay = (days: number[], at: Date, timeZone = DEFAULT_TIME_ZONE): number | null => {
    if (days.length === 0) return null;
    const [year, month] = dayKey(at, timeZone).split('-').map(Number);
    return Math.min(...days.map(day => landsOn(day, year, month)));
};

/**
 * Days left before the deadline: 0 on the day itself, negative once it has
 * passed. Null when the protocol has no days, which means it is not monthly.
 */
export const daysLeft = (days: number[], at: Date, timeZone = DEFAULT_TIME_ZONE): number | null => {
    const deadline = deadlineDay(days, at, timeZone);
    if (deadline === null) return null;
    const date = Number(dayKey(at, timeZone).split('-')[2]);
    return deadline - date;
};

/** How a monthly deadline reads on a row: the date, then how it stands today. */
export function deadlineLabel(days: number[], at: Date, timeZone = DEFAULT_TIME_ZONE): string {
    const left = daysLeft(days, at, timeZone);
    if (left === null) return '';
    const deadline = deadlineDay(days, at, timeZone);
    const when = left > 1 ? `還有 ${left} 天`
        : left === 1 ? '明天截止'
            : left === 0 ? '今天截止'
                : `已逾期 ${-left} 天`;
    return `${deadline} 號前 · ${when}`;
}
