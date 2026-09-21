import { activeGrants, planGrant, planReversal, RewardBook, RewardEntry } from './book';
import { dayKey, DEFAULT_TIME_ZONE } from '../time';

// Expense rewards: +20 for each of the first three entries recorded per day.
// The day is when the entry is recorded (not the expense date), so backfilling
// old dates cannot reclaim past days' slots.
export const LEDGER_REWARD = 20;
export const LEDGER_DAILY_SLOTS = 3;
export const ledgerKey = (expenseId: string) => `ledger:${expenseId}`;

export const ledgerSlotsUsed = (book: RewardBook, day: string) =>
    activeGrants(book, 'ledger:').filter(e => e.day === day).length;

export function onExpenseRecorded(book: RewardBook, expenseId: string, recordedAt: Date, timeZone = DEFAULT_TIME_ZONE): RewardEntry | null {
    const day = dayKey(recordedAt, timeZone);
    if (ledgerSlotsUsed(book, day) >= LEDGER_DAILY_SLOTS) return null;
    return planGrant(book, { sourceKey: ledgerKey(expenseId), amount: LEDGER_REWARD, day, at: recordedAt, reason: '記帳' });
}

/** Deleting or undoing a rewarded entry reverses it, which frees that day's slot. */
export function onExpenseDeleted(book: RewardBook, expenseId: string, at: Date, timeZone = DEFAULT_TIME_ZONE): RewardEntry | null {
    return planReversal(book, ledgerKey(expenseId), dayKey(at, timeZone), at, '刪除記帳');
}
