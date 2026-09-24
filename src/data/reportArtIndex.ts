// Which report art actually exists, so a missing piece shows a marked
// placeholder instead of a broken image. Keep this in step with
// public/battle-assets/report/ — tests/visual-data pins it.

const BASE = `${import.meta.env.BASE_URL}battle-assets/report/`;

/**
 * GPT keeps its own asset ids; r6 shipped a requestedAssetId alias table rather
 * than renaming the delivered files. These map the roster's ids onto theirs.
 */
const PORTRAIT_ALIASES: Record<string, string> = {
    'cadian-medic-veteran': 'cadian-medic',
    'cadian-mission-engineer': 'cadian-engineer',
    'cadian-comms-veteran': 'cadian-vox',
};

export const PORTRAIT_ASSETS = new Set([
    'cadian-rifleman', 'cadian-sergeant', 'cadian-medic', 'cadian-engineer',
    'cadian-vox', 'cadian-marksman', 'cadian-flamer', 'cadian-plasma',
    'cadian-heavy-team', 'traitor-guardsman',
]);

/** Head crop for a roster asset id, or null when that character has no art yet. */
export function portraitHead(assetId?: string): string | null {
    if (!assetId) return null;
    const resolved = PORTRAIT_ALIASES[assetId] ?? assetId;
    return PORTRAIT_ASSETS.has(resolved) ? `${BASE}portraits/${resolved}-head.webp` : null;
}

/** Half-body crop, used for the character sheet and report highlights. */
export function portraitHalf(assetId?: string): string | null {
    if (!assetId) return null;
    const resolved = PORTRAIT_ALIASES[assetId] ?? assetId;
    return PORTRAIT_ASSETS.has(resolved) ? `${BASE}portraits/${resolved}-half.webp` : null;
}

export const EQUIPMENT_ASSETS = new Set([
    'lasgun', 'laspistol', 'shotgun', 'precision-lasgun', 'flamer', 'plasma-gun',
    'heavy-weapon', 'sororitas-boltgun', 'astartes-boltgun', 'flak-armour',
    'carapace-armour', 'astartes-power-armour', 'medicae-kit', 'vox-caster',
    'engineering-kit', 'function-mod', 'tuning-1', 'tuning-2',
]);

/** Catalogue art at the requested width, or null when that item has none. */
export const equipmentArt = (catalogId: string, width: 96 | 192 = 96): string | null =>
    EQUIPMENT_ASSETS.has(catalogId) ? `${BASE}equipment/${catalogId}-${width}.webp` : null;

// Sector node planets (GPT, 2026-09-24). Keyed by world type rather than by
// month: a month's type is recomputed from its project count, so the art has to
// follow the type. Keep in step with public/battle-assets/sector/.
const SECTOR_BASE = `${import.meta.env.BASE_URL}battle-assets/sector/`;

export const SECTOR_PLANET_TYPES = ['barren', 'hive', 'shrine', 'forge', 'death'] as const;
export type SectorPlanetType = typeof SECTOR_PLANET_TYPES[number];

const HAS_PLANET = new Set<string>(SECTOR_PLANET_TYPES);

/** Planet art for a world type, or null when that type has none delivered. */
export const sectorPlanetArt = (type: string, width: 96 | 192 = 96): string | null =>
    HAS_PLANET.has(type) ? `${SECTOR_BASE}sector-${type}-${width}.webp` : null;
