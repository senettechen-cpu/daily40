// Append-only requisition ledger. The balance is always the sum of entries;
// nothing is overwritten, so every grant and reversal stays auditable.
export type RewardKind = 'grant' | 'reversal' | 'spend';

export interface RewardEntry {
    seq: number; // position in the book, assigned by `append`
    sourceKey: string; // one real-world outcome, e.g. `ledger:<expenseId>`
    kind: RewardKind;
    amount: number; // signed
    day: string; // user-zone calendar day the entry applies to
    at: string; // ISO timestamp
    reason: string;
}

/** An entry that has been decided but not yet appended. */
export type PlannedEntry = Omit<RewardEntry, 'seq'>;

export interface RewardBook { entries: RewardEntry[] }

export const emptyBook = (): RewardBook => ({ entries: [] });
export const STARTING_GRANT = { sourceKey: 'start:v1.5', amount: 40, reason: '開局軍需' } as const;

/** Latest grant for a key, or null when the key was never granted or its last grant was reversed. */
export function activeGrant(book: RewardBook, sourceKey: string): RewardEntry | null {
    for (let i = book.entries.length - 1; i >= 0; i--) {
        const entry = book.entries[i];
        if (entry.sourceKey !== sourceKey || entry.kind === 'spend') continue;
        return entry.kind === 'grant' ? entry : null;
    }
    return null;
}

export const isActive = (book: RewardBook, sourceKey: string) => activeGrant(book, sourceKey) !== null;

/** Active grants whose source key starts with `prefix`, one per key, in a single reverse pass. */
export function activeGrants(book: RewardBook, prefix: string): RewardEntry[] {
    const seen = new Set<string>();
    const active: RewardEntry[] = [];
    for (let i = book.entries.length - 1; i >= 0; i--) {
        const entry = book.entries[i];
        if (entry.kind === 'spend' || !entry.sourceKey.startsWith(prefix) || seen.has(entry.sourceKey)) continue;
        seen.add(entry.sourceKey);
        if (entry.kind === 'grant') active.push(entry);
    }
    return active;
}

export interface GrantInput { sourceKey: string; amount: number; day: string; at: Date; reason: string }

/** Idempotent: an already-active key yields null instead of a second payment. */
export function planGrant(book: RewardBook, input: GrantInput): PlannedEntry | null {
    if (input.amount <= 0 || isActive(book, input.sourceKey)) return null;
    return { sourceKey: input.sourceKey, kind: 'grant', amount: input.amount, day: input.day, at: input.at.toISOString(), reason: input.reason };
}

/** Idempotent: reverses the active grant for a key, or yields null if nothing is active. */
export function planReversal(book: RewardBook, sourceKey: string, day: string, at: Date, reason: string): PlannedEntry | null {
    const granted = activeGrant(book, sourceKey);
    return granted && { sourceKey, kind: 'reversal', amount: -granted.amount, day, at: at.toISOString(), reason };
}

export interface RewardCause { sourceKey: string; amount: number; reason: string; mayStart: boolean }

/**
 * Match the book to the rewards whose causes currently hold, for every key under `prefix`.
 * A cause missing from `causes` reverses its grant; a present cause pays only if `mayStart`,
 * so rewards already paid survive a later loss of start eligibility.
 */
export function reconcile(book: RewardBook, prefix: string, causes: RewardCause[], day: string, at: Date, reversalReason: string): PlannedEntry[] {
    const active = new Map(activeGrants(book, prefix).map(e => [e.sourceKey, e]));
    const present = new Set(causes.map(c => c.sourceKey));
    const planned: PlannedEntry[] = [];
    for (const [sourceKey, granted] of active) {
        if (!present.has(sourceKey)) planned.push({ sourceKey, kind: 'reversal', amount: -granted.amount, day, at: at.toISOString(), reason: reversalReason });
    }
    for (const cause of causes) {
        if (cause.mayStart && cause.amount > 0 && !active.has(cause.sourceKey)) {
            planned.push({ sourceKey: cause.sourceKey, kind: 'grant', amount: cause.amount, day, at: at.toISOString(), reason: cause.reason });
        }
    }
    return planned;
}

export interface SpendInput { sourceKey: string; amount: number; day: string; at: Date; reason: string }

const hasKind = (book: RewardBook, sourceKey: string, kind: RewardKind) =>
    book.entries.some(entry => entry.sourceKey === sourceKey && entry.kind === kind);

/**
 * A purchase. Idempotent by source key, so a retried request cannot charge
 * twice, and refused outright when the balance would not cover it.
 */
export function planSpend(book: RewardBook, input: SpendInput): PlannedEntry | null {
    if (!canSpend(book, input.amount) || hasKind(book, input.sourceKey, 'spend')) return null;
    return { sourceKey: input.sourceKey, kind: 'spend', amount: -input.amount, day: input.day, at: input.at.toISOString(), reason: input.reason };
}

/** v1.5 §2: selling back returns at most a quarter of what was actually paid. */
export const REFUND_RATE = 0.25;

/**
 * Refund for an item, keyed separately from its purchase so both stay in the
 * book. Issued gear has no spend entry, so it correctly refunds nothing.
 */
export function planRefund(book: RewardBook, spendKey: string, refundKey: string, day: string, at: Date, reason: string): PlannedEntry | null {
    const spend = book.entries.find(entry => entry.sourceKey === spendKey && entry.kind === 'spend');
    if (!spend || hasKind(book, refundKey, 'grant')) return null;

    const amount = Math.floor(Math.abs(spend.amount) * REFUND_RATE);
    if (amount <= 0) return null;
    return { sourceKey: refundKey, kind: 'grant', amount, day, at: at.toISOString(), reason };
}

export function append(book: RewardBook, ...entries: (PlannedEntry | null)[]): RewardBook {
    const valid = entries.filter((e): e is PlannedEntry => e !== null);
    if (!valid.length) return book;
    return { entries: [...book.entries, ...valid.map((e, i) => ({ ...e, seq: book.entries.length + 1 + i }))] };
}

export const balance = (book: RewardBook) => book.entries.reduce((sum, e) => sum + e.amount, 0);

/** A negative balance blocks purchases; owned equipment is never confiscated. */
export const canSpend = (book: RewardBook, cost: number) => cost > 0 && balance(book) >= cost;
