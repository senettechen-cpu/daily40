// v1.5 §4: the roster holds character instances, not unit types. A duty is a
// property of a character, so the same origin can field several of one duty and
// each keeps its own record.

export type Origin = 'cadian' | 'catachan' | 'krieg' | 'kasrkin' | 'scion' | 'ecclesiarchy' | 'sororitas' | 'astartes';

export type Duty = 'rifleman' | 'sergeant' | 'medic' | 'comms' | 'engineer' | 'marksman' | 'flamer' | 'plasma' | 'heavy';

export type Health = 'fit' | 'wounded' | 'critical';

export interface Character {
    id: string;
    name: string;
    origin: Origin;
    duty: Duty;
    /** Art key from the GPT design catalogue; may be absent until art exists. */
    assetId?: string;
    xp: number;
    health: Health;
    /** The day a lost battle put them out of action (YYYY-MM-DD), or absent. */
    woundedDay?: string;
    recruitedAt: string;
}

export const ORIGIN_LABELS: Record<Origin, string> = {
    cadian: '卡迪安', catachan: '卡塔昌', krieg: '克里格', kasrkin: '卡斯爾金',
    scion: '風暴兵', ecclesiarchy: '國教', sororitas: '戰鬥修女', astartes: '阿斯塔特',
};

export const DUTY_LABELS: Record<Duty, string> = {
    rifleman: '步槍兵', sergeant: '中士', medic: '醫療', comms: '通訊', engineer: '工程',
    marksman: '精準射手', flamer: '火焰武器手', plasma: '電漿武器手', heavy: '重武器',
};

export const HEALTH_LABELS: Record<Health, string> = {
    fit: '可出戰', wounded: '負傷', critical: '重傷',
};

// v1.5 §6 baselines for an unaugmented human. Ascension replaces the baseline
// rather than stacking on top of it, which is why this is a lookup, not a sum.
export const BASE_HP: Record<Origin, number> = {
    cadian: 100, catachan: 100, krieg: 100, kasrkin: 100,
    scion: 100, ecclesiarchy: 100, sororitas: 110, astartes: 160,
};

export const BASE_ACCURACY: Record<Origin, number> = {
    cadian: 75, catachan: 75, krieg: 75, kasrkin: 78,
    scion: 78, ecclesiarchy: 72, sororitas: 76, astartes: 80,
};

export const MAX_LEVEL = 10;

/**
 * CANDIDATE numbers: v1.5 fixes the level gates (4 picks a route, 7 a
 * speciality, 10 unlocks veteran content) but never sets the XP behind them.
 * These need balance review against real battle data before launch.
 */
export const LEVEL_XP: number[] = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700];

export function levelOf(xp: number): number {
    let level = 1;
    for (let i = 1; i < LEVEL_XP.length; i += 1) if (xp >= LEVEL_XP[i]) level = i + 1;
    return Math.min(level, MAX_LEVEL);
}

/** XP still needed for the next level, or null at the cap. */
export function xpToNext(xp: number): number | null {
    const level = levelOf(xp);
    if (level >= MAX_LEVEL) return null;
    return LEVEL_XP[level] - xp;
}

/** v1.5 §6: every level adds 2% of the current baseline, +18% across ten levels. */
export function maxHp(character: Pick<Character, 'origin' | 'xp'>): number {
    return Math.round(BASE_HP[character.origin] * (1 + 0.02 * (levelOf(character.xp) - 1)));
}

export const accuracyOf = (character: Pick<Character, 'origin'>) => BASE_ACCURACY[character.origin];

export const isDeployable = (character: Character) => character.health !== 'critical';

/**
 * A defeat puts everyone who deployed out of action for the rest of that day.
 * The bar is held as the day it was earned, so it lapses at midnight on its own
 * rather than needing a healing pass to clear it.
 */
export const isWoundedOn = (character: Character, day: string) =>
    !!character.woundedDay && character.woundedDay === day;

// The six free starting soldiers. v1.5 §2 makes basic gear for six free, and
// §4 keeps ordinary reinforcement out of the shop, so these are granted once.
export const STARTING_SQUAD_NAME = '第一特遣隊';

export const STARTING_CHARACTERS: { name: string; origin: Origin; duty: Duty; assetId: string }[] = [
    { name: '維克斯', origin: 'cadian', duty: 'sergeant', assetId: 'cadian-sergeant' },
    { name: '哈倫', origin: 'cadian', duty: 'rifleman', assetId: 'cadian-rifleman' },
    { name: '梅瑞克', origin: 'cadian', duty: 'rifleman', assetId: 'cadian-rifleman' },
    { name: '索恩', origin: 'cadian', duty: 'rifleman', assetId: 'cadian-rifleman' },
    { name: '卡莉絲', origin: 'cadian', duty: 'medic', assetId: 'cadian-medic-veteran' },
    { name: '德倫', origin: 'cadian', duty: 'engineer', assetId: 'cadian-mission-engineer' },
];
