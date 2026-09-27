import { CATALOG } from '../armory/catalog';
import { RECRUITS } from '../roster/recruitment';
import { LEVEL_XP } from '../roster/characters';

// Operation plans (the old projects) end in a supply crate instead of the +60
// close bonus. The user decided on 2026-09-27: difficulty is self-chosen but
// only counts once the plan is big enough to back it, and the crate draws only
// from what the campaign has already opened. See
// docs/campaign-and-operation-plans.md §3.
//
// Every number below is a CANDIDATE backed by scripts/sim-crates.cjs; the
// evidence and the chosen values are recorded in docs/balance-decisions.md.

export type Rarity = 'common' | 'fine' | 'rare' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'fine', 'rare', 'legendary'];
export const RARITY_LABELS: Record<Rarity, string> = { common: '普通', fine: '精良', rare: '稀有', legendary: '傳奇' };

/**
 * What a chosen difficulty has to be backed by. Completed subtasks, not
 * created ones, so padding a plan with empty entries earns nothing; and days
 * between the creation day and the closing day, so level 1 is exactly the old
 * "cannot close on the day it was made" rule.
 */
export interface DifficultyGate { level: number; subTasks: number; days: number }
export const DIFFICULTY_GATES: DifficultyGate[] = [
    { level: 1, subTasks: 3, days: 1 },
    { level: 2, subTasks: 4, days: 2 },
    { level: 3, subTasks: 5, days: 4 },
    { level: 4, subTasks: 6, days: 7 },
    { level: 5, subTasks: 7, days: 14 },
];
export const MAX_DIFFICULTY = DIFFICULTY_GATES.length;

const clampLevel = (level: number) => Math.max(1, Math.min(MAX_DIFFICULTY, Math.round(Number(level) || 1)));

/** The difficulty a close actually counts at: the chosen one, lowered to what the plan backs. 0 means no crate. */
export function effectiveDifficulty(chosen: number, completedSubTasks: number, daysOpen: number): number {
    const cap = clampLevel(chosen);
    let reached = 0;
    for (const gate of DIFFICULTY_GATES) {
        if (gate.level <= cap && completedSubTasks >= gate.subTasks && daysOpen >= gate.days) reached = gate.level;
    }
    return reached;
}

/** What is still missing for the chosen level, so the plan can say so before closing. */
export function gateShortfall(chosen: number, completedSubTasks: number, daysOpen: number) {
    const gate = DIFFICULTY_GATES[clampLevel(chosen) - 1];
    return {
        gate,
        subTasks: Math.max(0, gate.subTasks - completedSubTasks),
        days: Math.max(0, gate.days - daysOpen),
    };
}

/** Odds per effective difficulty, in percent. Rows sum to 100. */
export const RARITY_ODDS: Record<number, Record<Rarity, number>> = {
    1: { common: 70, fine: 25, rare: 5, legendary: 0 },
    2: { common: 30, fine: 45, rare: 20, legendary: 5 },
    3: { common: 10, fine: 30, rare: 42, legendary: 18 },
    4: { common: 0, fine: 15, rare: 45, legendary: 40 },
    5: { common: 0, fine: 0, rare: 30, legendary: 70 },
};

/** Within a rarity, how often the crate holds a soldier rather than gear. */
export const CHARACTER_SHARE = 0.3;

/** A crate veteran starts at level 4. */
export const VETERAN_XP = LEVEL_XP[3];

export interface CharacterPrize { templateId: string; veteran: boolean }
export interface CratePool { equipment: string[]; characters: CharacterPrize[] }

const SPECIALISTS = ['cadian-sergeant', 'cadian-medic', 'cadian-comms', 'cadian-engineer', 'cadian-marksman', 'cadian-flamer', 'cadian-plasma'];

/**
 * Only real catalogue and recruit ids. Astartes and Sororitas gear never
 * appears (the design's red line); restricted entries stay out until the
 * campaign has authorized them, which `poolFor` enforces.
 */
export const CRATE_POOLS: Record<Rarity, CratePool> = {
    common: {
        equipment: ['lasgun', 'laspistol', 'flak-armour', 'medicae-kit', 'vox-caster', 'engineering-kit'],
        characters: [],
    },
    fine: {
        equipment: ['shotgun', 'precision-lasgun', 'tuning-1'],
        characters: [{ templateId: 'cadian-rifleman', veteran: false }],
    },
    rare: {
        equipment: ['flamer', 'carapace-armour', 'function-mod', 'tuning-2'],
        characters: SPECIALISTS.map(templateId => ({ templateId, veteran: false })),
    },
    legendary: {
        equipment: ['plasma-gun', 'heavy-weapon'],
        characters: [
            ...SPECIALISTS.map(templateId => ({ templateId, veteran: true })),
            ...['kasrkin', 'catachan-fighter', 'krieg-infantry', 'scion', 'preacher'].map(templateId => ({ templateId, veteran: false })),
        ],
    },
};

export interface Authorized { equipment: string[]; personnel: string[] }

/** One rarity's pool, less anything restricted that the campaign has not opened. */
export function poolFor(rarity: Rarity, authorized: Authorized): CratePool {
    const pool = CRATE_POOLS[rarity];
    const openItem = (id: string) => {
        const item = CATALOG.find(entry => entry.id === id);
        return !!item && !item.origins && (!item.restricted || authorized.equipment.includes(id));
    };
    const openRecruit = (prize: CharacterPrize) => {
        const template = RECRUITS.find(entry => entry.id === prize.templateId);
        return !!template && (!template.restricted || authorized.personnel.includes(prize.templateId));
    };
    return { equipment: pool.equipment.filter(openItem), characters: pool.characters.filter(openRecruit) };
}

export type CratePrize =
    | { rarity: Rarity; kind: 'equipment'; catalogId: string }
    | { rarity: Rarity; kind: 'character'; templateId: string; veteran: boolean };

/** FNV-1a, so a seed string always yields the same stream on either side. */
function hash(text: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/** mulberry32: small, fast and good enough for a loot draw. */
export function seededRandom(seed: string): () => number {
    let state = hash(seed);
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function rollRarity(difficulty: number, roll: number): Rarity {
    const odds = RARITY_ODDS[clampLevel(difficulty)];
    let edge = 0;
    for (const rarity of RARITIES) {
        edge += odds[rarity] / 100;
        if (roll < edge) return rarity;
    }
    return 'common';
}

/**
 * Opens one crate. The seed is the user and the plan, so the same close can
 * never be re-rolled. A rarity whose pool is empty after authorization steps
 * down a tier; common always has something, so a crate is never empty.
 */
export function openCrate(seed: string, difficulty: number, authorized: Authorized): CratePrize {
    const next = seededRandom(seed);
    let tier = RARITIES.indexOf(rollRarity(difficulty, next()));
    const kindRoll = next();
    const pickRoll = next();

    for (; tier >= 0; tier -= 1) {
        const rarity = RARITIES[tier];
        const pool = poolFor(rarity, authorized);
        if (pool.equipment.length === 0 && pool.characters.length === 0) continue;

        const wantsCharacter = pool.characters.length > 0 && (pool.equipment.length === 0 || kindRoll < CHARACTER_SHARE);
        if (wantsCharacter) {
            const prize = pool.characters[Math.floor(pickRoll * pool.characters.length)];
            return { rarity, kind: 'character', templateId: prize.templateId, veteran: prize.veteran };
        }
        return { rarity, kind: 'equipment', catalogId: pool.equipment[Math.floor(pickRoll * pool.equipment.length)] };
    }
    // Unreachable while common holds unrestricted gear; kept so the type is total.
    return { rarity: 'common', kind: 'equipment', catalogId: 'lasgun' };
}

/** Whole calendar days between two `YYYY-MM-DD` keys. */
export function daysBetween(fromDay: string, toDay: string): number {
    const toUtc = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
    return Math.round((toUtc(toDay) - toUtc(fromDay)) / 86_400_000);
}
