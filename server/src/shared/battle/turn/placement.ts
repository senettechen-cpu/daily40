import { Board, Hex, deploymentZone, hexKey, isBlocked } from '../hex';
import { Stance } from './types';
import { Placement } from './loadout';

// Where the squad stands when the shooting starts. One of the player's four
// decisions, so it is stored with the formation rather than chosen per battle,
// and it has to survive a roster that changed since it was saved.

export const STANCES: Stance[] = ['hold', 'advance', 'flank', 'guard'];
export const isStance = (value: unknown): value is Stance => STANCES.includes(value as Stance);

/**
 * A sensible formation for a squad that has never been placed: spread along the
 * back line in roster order, with the medic held back. It exists so a battle can
 * be fought before the placement screen is built, and as the fallback whenever a
 * saved formation no longer fits.
 */
export function defaultPlacements(board: Board, members: { id: string; duty: string }[]): Placement[] {
    const zone = deploymentZone(board, 'crew')
        .sort((a, b) => b.row - a.row || a.col - b.col);
    const back = zone.filter(hex => hex.row === zone[0]?.row);
    const front = zone.filter(hex => hex.row !== zone[0]?.row);

    // Centre the line rather than crowding one edge.
    const spread = (tiles: Hex[], count: number) => {
        if (count <= 0) return [];
        const start = Math.max(0, Math.floor((tiles.length - count) / 2));
        return tiles.slice(start, start + count);
    };

    const shooters = members.filter(m => m.duty !== 'medic');
    const support = members.filter(m => m.duty === 'medic');
    const line = spread(front.length >= shooters.length ? front : back, shooters.length);
    const rear = spread(back, support.length);

    const placements: Placement[] = [];
    shooters.forEach((member, i) => {
        const at = line[i] ?? back[i] ?? zone[i];
        if (at) placements.push({ characterId: member.id, at, stance: 'advance' });
    });
    support.forEach((member, i) => {
        const at = rear.find(hex => !placements.some(p => hexKey(p.at) === hexKey(hex))) ?? rear[i] ?? zone[zone.length - 1 - i];
        if (at) placements.push({ characterId: member.id, at, stance: 'hold' });
    });

    return placements;
}

/** Why this formation cannot take the field, or null when it can. */
export function placementError(board: Board, memberIds: string[], placements: Placement[]): string | null {
    const zone = new Set(deploymentZone(board, 'crew').map(hexKey));
    const seen = new Set<string>();

    for (const id of memberIds) {
        if (!placements.some(p => p.characterId === id)) return '有人還沒有指定位置。';
    }
    for (const placement of placements) {
        if (!memberIds.includes(placement.characterId)) return '編成裡沒有這個人。';
        if (!isStance(placement.stance)) return '姿態無效。';
        if (isBlocked(board, placement.at)) return '不能站在障礙上。';
        if (!zone.has(hexKey(placement.at))) return '只能部署在我方部署區內。';
        const key = hexKey(placement.at);
        if (seen.has(key)) return '兩個人不能站在同一格。';
        seen.add(key);
    }
    return null;
}

/**
 * The formation to fight with: the saved one when it still fits, otherwise a
 * fresh default. A squad whose roster changed keeps fighting rather than
 * refusing to deploy over a stale tile.
 */
export function placementsFor(board: Board, members: { id: string; duty: string }[], saved: Placement[] | undefined): Placement[] {
    const ids = members.map(member => member.id);
    if (saved && saved.length > 0 && !placementError(board, ids, saved)) return saved;
    return defaultPlacements(board, members);
}

/** Reads placements out of storage, dropping anything malformed. */
export function normalizePlacements(value: unknown): Placement[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap(entry => {
        if (!entry || typeof entry !== 'object') return [];
        const row = entry as Record<string, unknown>;
        const at = row.at as Record<string, unknown> | undefined;
        if (typeof row.characterId !== 'string' || !at) return [];
        if (typeof at.col !== 'number' || typeof at.row !== 'number') return [];
        return [{
            characterId: row.characterId,
            at: { col: at.col, row: at.row },
            stance: isStance(row.stance) ? row.stance : 'advance',
            guardTargetId: typeof row.guardTargetId === 'string' ? row.guardTargetId : undefined,
        }];
    });
}
