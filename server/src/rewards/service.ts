import type { Db } from '../db';
import {
    balance, dayKey, DEFAULT_TIME_ZONE, LEDGER_DAILY_SLOTS, ledgerSlotsUsed, onExpenseDeleted, onExpenseRecorded,
    planGrant, STARTING_GRANT,
} from '../shared/rewards';
import { appendEntries, loadBook } from './store';

// v1.5 requisition rewards stay dark until the full launch (economy, roster,
// armory, combat) is approved; set V15_ECONOMY=on only in a test environment.
export const v15EconomyEnabled = () => process.env.V15_ECONOMY === 'on';

// Per-user time zones are not stored yet; every user is on the approved default.
const timeZone = DEFAULT_TIME_ZONE;

export async function loadWithStartingGrant(db: Db, userId: string, now: Date) {
    const book = await loadBook(db, userId);
    return appendEntries(db, userId, book, [planGrant(book, { ...STARTING_GRANT, day: dayKey(now, timeZone), at: now })]);
}

/** Returns the requisition granted for recording this expense (0 when no slot is left). */
export async function rewardExpenseRecorded(db: Db, userId: string, expenseId: string, now: Date): Promise<number> {
    const book = await loadWithStartingGrant(db, userId, now);
    const entry = onExpenseRecorded(book, expenseId, now, timeZone);
    await appendEntries(db, userId, book, [entry]);
    return entry?.amount ?? 0;
}

/** Returns the (negative) amount reversed for deleting this expense, or 0. */
export async function reverseExpenseReward(db: Db, userId: string, expenseId: string, now: Date): Promise<number> {
    const book = await loadBook(db, userId);
    const entry = onExpenseDeleted(book, expenseId, now, timeZone);
    await appendEntries(db, userId, book, [entry]);
    return entry?.amount ?? 0;
}

export async function rewardSummary(db: Db, userId: string, now: Date) {
    const book = await loadWithStartingGrant(db, userId, now);
    return {
        balance: balance(book),
        ledger: { used: ledgerSlotsUsed(book, dayKey(now, timeZone)), slots: LEDGER_DAILY_SLOTS },
        recent: book.entries.slice(-20).reverse(),
    };
}
