import { randomUUID } from 'crypto';
import type { Db } from '../db';
import { LedgerPreset, PresetFields, suggestPresets, SUGGESTION_WINDOW_DAYS, validatePreset } from '../shared/ledger/presets';

// A preset row is either pinned (shown first, optional amount) or hidden (a
// dismissed suggestion). One row per user and category/item/payment triple.
const toPreset = (row: any): LedgerPreset => ({
    id: row.id, category: row.category, itemName: row.item_name, paymentMethod: row.payment_method,
    amount: row.amount ?? null, pinned: row.pinned, hidden: row.hidden,
});

async function upsert(db: Db, userId: string, fields: PresetFields, amount: number | null, pinned: boolean): Promise<LedgerPreset> {
    const result = await db.query(
        `INSERT INTO ledger_presets (id, user_id, category, item_name, payment_method, amount, pinned, hidden)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, category, item_name, payment_method)
         DO UPDATE SET amount = EXCLUDED.amount, pinned = EXCLUDED.pinned, hidden = EXCLUDED.hidden
         RETURNING *`,
        [randomUUID(), userId, fields.category, fields.itemName.trim(), fields.paymentMethod, amount, pinned, !pinned],
    );
    return toPreset(result.rows[0]);
}

export async function quickMenu(db: Db, userId: string, now: Date) {
    const presets = (await db.query('SELECT * FROM ledger_presets WHERE user_id = $1 ORDER BY created_at', [userId])).rows.map(toPreset);
    const since = new Date(now.getTime() - SUGGESTION_WINDOW_DAYS * 86_400_000);
    // Suggestions use when the entry was recorded, including archived entries, so settling the ledger does not reset habits.
    const recent = await db.query(
        'SELECT category, item_name, payment_method, created_at FROM expenses WHERE user_id = $1 AND created_at >= $2',
        [userId, since],
    );
    const samples = recent.rows.map(row => ({ category: row.category, itemName: row.item_name, paymentMethod: row.payment_method, recordedAt: new Date(row.created_at) }));
    return { pinned: presets.filter(p => p.pinned), suggestions: suggestPresets(samples, presets, now) };
}

export type PresetResult = { preset: LedgerPreset } | { error: string };

export async function pinPreset(db: Db, userId: string, input: PresetFields & { amount?: number | null }): Promise<PresetResult> {
    const error = validatePreset(input);
    return error ? { error } : { preset: await upsert(db, userId, input, input.amount ?? null, true) };
}

export async function hideSuggestion(db: Db, userId: string, input: PresetFields): Promise<PresetResult> {
    const error = validatePreset(input);
    return error ? { error } : { preset: await upsert(db, userId, input, null, false) };
}

/** Unpinning deletes the row, so the item can reappear as a suggestion. */
export async function unpinPreset(db: Db, userId: string, id: string): Promise<boolean> {
    const result = await db.query('DELETE FROM ledger_presets WHERE id = $1 AND user_id = $2 AND pinned = TRUE', [id, userId]);
    return (result.rowCount ?? 0) > 0;
}
