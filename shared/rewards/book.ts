// Append-only requisition ledger. The balance is always the sum of entries;
// nothing is overwritten, so every grant and reversal stays auditable.
export type RewardKind = 'grant' | 'reversal' | 'spend';

export interface RewardEntry {
    seq: number;
    sourceKey: string; // one real-world outcome, e.g. `ledger:<expenseId>`
    kind: RewardKind;
    amount: number; // signed
    day: string; // user-zone calendar day the entry applies to
    at: string; // ISO timestamp
    reason: string;
}

export interface RewardBook { entries: RewardEntry[] }

export const emptyBook = (): RewardBook => ({ entries: [] });
export const STARTING_GRANT = { sourceKey: 'start:v1.5', amount: 40, reason: '開局軍需' } as const;

/** Latest grant for a key, or null when the key was never granted or its last grant was reversed. */
export function activeGrant(book: RewardBook, sourceKey: string): RewardEntry | null {
    for (let i = book.entries.length - 1; i >= 0; i--) {
        const entry = book.entries[i];
        if (entry.sourceKey !== sourceKey) continue;
        if (entry.kind === 'grant') return entry;
        if (entry.kind === 'reversal') return null;
    }
    return null;
}

export const isActive = (book: RewardBook, sourceKey: string) => activeGrant(book, sourceKey) !== null;

/** Active grants whose source key starts with `prefix`, one per key. */
export function activeGrants(book: RewardBook, prefix: string): RewardEntry[] {
    const keys = new Set(book.entries.filter(e => e.sourceKey.startsWith(prefix)).map(e => e.sourceKey));
    return [...keys].map(key => activeGrant(book, key)).filter((e): e is RewardEntry => e !== null);
}

export interface GrantInput { sourceKey: string; amount: number; day: string; at: Date; reason: string }

/** Idempotent: an already-active key yields null instead of a second payment. */
export function planGrant(book: RewardBook, input: GrantInput, offset = 0): RewardEntry | null {
    if (input.amount <= 0 || isActive(book, input.sourceKey)) return null;
    return { seq: book.entries.length + 1 + offset, sourceKey: input.sourceKey, kind: 'grant', amount: input.amount, day: input.day, at: input.at.toISOString(), reason: input.reason };
}

/** Idempotent: reverses the active grant for a key, or yields null if nothing is active. */
export function planReversal(book: RewardBook, sourceKey: string, day: string, at: Date, reason: string, offset = 0): RewardEntry | null {
    const granted = activeGrant(book, sourceKey);
    if (!granted) return null;
    return { seq: book.entries.length + 1 + offset, sourceKey, kind: 'reversal', amount: -granted.amount, day, at: at.toISOString(), reason };
}

export function append(book: RewardBook, ...entries: (RewardEntry | null)[]): RewardBook {
    const valid = entries.filter((e): e is RewardEntry => e !== null);
    return valid.length ? { entries: [...book.entries, ...valid] } : book;
}

export const balance = (book: RewardBook) => book.entries.reduce((sum, e) => sum + e.amount, 0);

/** A negative balance blocks purchases; owned equipment is never confiscated. */
export const canSpend = (book: RewardBook, cost: number) => cost > 0 && balance(book) >= cost;
