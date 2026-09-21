import type { Db } from '../db';
import { append, PlannedEntry, RewardBook, RewardEntry } from '../shared/rewards';

// Persistence for the append-only reward book. UNIQUE (user_id, seq) makes two
// concurrent writers that planned from the same book collide instead of both
// paying; the loser's transaction rolls back and the client can retry.
export async function loadBook(db: Db, userId: string): Promise<RewardBook> {
    const result = await db.query(
        'SELECT seq, source_key, kind, amount, day, at, reason FROM reward_entries WHERE user_id = $1 ORDER BY seq',
        [userId],
    );
    return {
        entries: result.rows.map((row): RewardEntry => ({
            seq: row.seq, sourceKey: row.source_key, kind: row.kind, amount: row.amount,
            day: row.day, at: new Date(row.at).toISOString(), reason: row.reason,
        })),
    };
}

/** Appends planned entries after the given book and returns the new book. */
export async function appendEntries(db: Db, userId: string, book: RewardBook, planned: (PlannedEntry | null)[]): Promise<RewardBook> {
    const next = append(book, ...planned);
    for (const e of next.entries.slice(book.entries.length)) {
        await db.query(
            'INSERT INTO reward_entries (user_id, seq, source_key, kind, amount, day, at, reason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [userId, e.seq, e.sourceKey, e.kind, e.amount, e.day, e.at, e.reason],
        );
    }
    return next;
}
