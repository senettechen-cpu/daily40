import { randomUUID } from 'crypto';
import type { Db } from '../db';
import { EquipmentItem, assignmentError, catalogItem, purchaseError } from '../shared/armory';
import { DEFAULT_TIME_ZONE, balance, dayKey, planRefund, planSpend } from '../shared/rewards';
import { appendEntries } from '../rewards/store';
import { loadWithStartingGrant } from '../rewards/service';
import { loadCharacters } from '../roster/service';

const timeZone = DEFAULT_TIME_ZONE;

const spendKey = (itemId: string) => `armory:${itemId}`;
const refundKey = (itemId: string) => `armory:${itemId}:refund`;

export async function loadItems(db: Db, userId: string): Promise<EquipmentItem[]> {
    const result = await db.query(
        'SELECT id, catalog_id, assigned_to, paid, acquired_at FROM equipment_items WHERE user_id = $1 ORDER BY acquired_at, id',
        [userId],
    );
    return result.rows.map(row => ({
        id: row.id,
        catalogId: row.catalog_id,
        assignedTo: row.assigned_to ?? null,
        paid: row.paid,
        acquiredAt: new Date(row.acquired_at).toISOString(),
    }));
}

export async function loadAuthorizations(db: Db, userId: string): Promise<string[]> {
    const result = await db.query('SELECT catalog_id FROM equipment_authorizations WHERE user_id = $1', [userId]);
    return result.rows.map(row => row.catalog_id);
}

export async function readArmory(db: Db, userId: string, now: Date) {
    const [items, authorized, book] = await Promise.all([
        loadItems(db, userId), loadAuthorizations(db, userId), loadWithStartingGrant(db, userId, now),
    ]);
    return { items, authorized, balance: balance(book) };
}

export async function purchase(db: Db, userId: string, catalogId: string, now: Date) {
    const definition = catalogItem(catalogId);
    const [authorized, book] = await Promise.all([loadAuthorizations(db, userId), loadWithStartingGrant(db, userId, now)]);

    const error = purchaseError(definition, { balance: balance(book), authorized });
    if (error || !definition) return { error: error ?? '目錄裡沒有這件裝備。' };

    const id = randomUUID();
    const spend = planSpend(book, {
        sourceKey: spendKey(id), amount: definition.price, day: dayKey(now, timeZone), at: now,
        reason: `採購 ${definition.name}`,
    });
    if (!spend) return { error: '軍需不足，無法採購。' };

    await appendEntries(db, userId, book, [spend]);
    await db.query(
        'INSERT INTO equipment_items (id, user_id, catalog_id, assigned_to, paid) VALUES ($1, $2, $3, NULL, $4)',
        [id, userId, catalogId, definition.price],
    );
    return { item: { id, catalogId, assignedTo: null, paid: definition.price, acquiredAt: now.toISOString() } as EquipmentItem };
}

/** Sells an item back. v1.5 §2 returns at most a quarter of what was actually paid. */
export async function sell(db: Db, userId: string, itemId: string, now: Date) {
    const items = await loadItems(db, userId);
    const item = items.find(candidate => candidate.id === itemId);
    if (!item) return { error: '找不到這件裝備。' };

    const book = await loadWithStartingGrant(db, userId, now);
    const refund = planRefund(book, spendKey(itemId), refundKey(itemId), dayKey(now, timeZone), now, '回收裝備');
    await appendEntries(db, userId, book, [refund]);
    await db.query('DELETE FROM equipment_items WHERE id = $1 AND user_id = $2', [itemId, userId]);
    return { refunded: refund?.amount ?? 0 };
}

/** Assigns an item to a character, or returns it to the armoury with null. */
export async function assign(db: Db, userId: string, itemId: string, characterId: string | null) {
    const items = await loadItems(db, userId);
    const item = items.find(candidate => candidate.id === itemId);
    if (!item) return { error: '找不到這件裝備。' };

    if (characterId === null) {
        await db.query('UPDATE equipment_items SET assigned_to = NULL WHERE id = $1 AND user_id = $2', [itemId, userId]);
        return { item: { ...item, assignedTo: null } };
    }

    const [roster, authorized] = await Promise.all([loadCharacters(db, userId), loadAuthorizations(db, userId)]);
    const character = roster.find(candidate => candidate.id === characterId);
    if (!character) return { error: '找不到這個人員。' };

    const error = assignmentError(item, character, items, authorized);
    if (error) return { error };

    await db.query('UPDATE equipment_items SET assigned_to = $1 WHERE id = $2 AND user_id = $3', [characterId, itemId, userId]);
    return { item: { ...item, assignedTo: characterId } };
}
