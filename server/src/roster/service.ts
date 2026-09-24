import { randomUUID } from 'crypto';
import type { Db } from '../db';
import {
    Character, Squad, STARTING_CHARACTERS, STARTING_SQUAD_NAME, setMembers, validateSquad,
} from '../shared/roster';

interface CharacterRow {
    id: string; name: string; origin: string; duty: string;
    asset_id: string | null; xp: number; health: string; recruited_at: string;
}

const toCharacter = (row: CharacterRow): Character => ({
    id: row.id,
    name: row.name,
    origin: row.origin as Character['origin'],
    duty: row.duty as Character['duty'],
    assetId: row.asset_id ?? undefined,
    xp: row.xp,
    health: row.health as Character['health'],
    recruitedAt: new Date(row.recruited_at).toISOString(),
});

export async function loadCharacters(db: Db, userId: string): Promise<Character[]> {
    const result = await db.query(
        'SELECT id, name, origin, duty, asset_id, xp, health, recruited_at FROM roster_characters WHERE user_id = $1 ORDER BY recruited_at, id',
        [userId],
    );
    return result.rows.map(toCharacter);
}

export async function loadSquads(db: Db, userId: string): Promise<Squad[]> {
    const result = await db.query(
        'SELECT id, name, member_ids FROM squads WHERE user_id = $1 ORDER BY created_at, id',
        [userId],
    );
    return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        memberIds: Array.isArray(row.member_ids) ? row.member_ids : [],
    }));
}

/**
 * Grants the six free starting soldiers and their formation, once. Keyed on the
 * roster being empty rather than a flag, so a retried request cannot double up.
 */
export async function ensureStartingRoster(db: Db, userId: string): Promise<void> {
    const existing = await db.query('SELECT COUNT(*)::int AS count FROM roster_characters WHERE user_id = $1', [userId]);
    if (existing.rows[0].count > 0) return;

    const ids: string[] = [];
    for (const template of STARTING_CHARACTERS) {
        const id = randomUUID();
        ids.push(id);
        await db.query(
            'INSERT INTO roster_characters (id, user_id, name, origin, duty, asset_id, xp, health) VALUES ($1, $2, $3, $4, $5, $6, 0, $7)',
            [id, userId, template.name, template.origin, template.duty, template.assetId, 'fit'],
        );
    }
    await db.query(
        'INSERT INTO squads (id, user_id, name, member_ids) VALUES ($1, $2, $3, $4)',
        [randomUUID(), userId, STARTING_SQUAD_NAME, JSON.stringify(ids)],
    );
}

export async function readRoster(db: Db, userId: string) {
    await ensureStartingRoster(db, userId);
    const [characters, squads] = await Promise.all([loadCharacters(db, userId), loadSquads(db, userId)]);
    return { characters, squads };
}

export async function createSquad(db: Db, userId: string, name: string): Promise<{ squad: Squad } | { error: string }> {
    const roster = await loadCharacters(db, userId);
    const squad: Squad = { id: randomUUID(), name: name.trim(), memberIds: [] };
    const error = validateSquad(squad, roster);
    if (error) return { error };

    await db.query(
        'INSERT INTO squads (id, user_id, name, member_ids) VALUES ($1, $2, $3, $4)',
        [squad.id, userId, squad.name, JSON.stringify(squad.memberIds)],
    );
    return { squad };
}

export async function updateSquad(
    db: Db, userId: string, squadId: string, changes: { name?: string; memberIds?: string[] },
): Promise<{ squad: Squad } | { error: string }> {
    const squads = await loadSquads(db, userId);
    const current = squads.find(squad => squad.id === squadId);
    if (!current) return { error: '找不到這個編成。' };

    const roster = await loadCharacters(db, userId);
    const renamed: Squad = { ...current, name: changes.name?.trim() ?? current.name };
    const result = changes.memberIds ? setMembers(renamed, changes.memberIds, roster) : { squad: renamed };
    if ('error' in result) return result;

    const error = validateSquad(result.squad, roster);
    if (error) return { error };

    await db.query(
        'UPDATE squads SET name = $1, member_ids = $2 WHERE id = $3 AND user_id = $4',
        [result.squad.name, JSON.stringify(result.squad.memberIds), squadId, userId],
    );
    return result;
}

export async function deleteSquad(db: Db, userId: string, squadId: string): Promise<void> {
    await db.query('DELETE FROM squads WHERE id = $1 AND user_id = $2', [squadId, userId]);
}
