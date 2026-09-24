// v1.5 leaves the campaign that hands out authorizations undesigned, so the
// restricted half of the catalogue was unreachable: the tables and the checks
// existed, but nothing ever wrote a row. Commendations are the interim source —
// a count of won operations, which is a switch rather than a balance number and
// so needs no combat data to be correct.
//
// The thresholds are candidates set by Claude on 2026-09-24 and have not been
// reviewed by GPT. Replace this table when the formal campaign lands; grants it
// already made stay valid, since an authorization is never taken back.

export interface Commendation {
    /** Won operations needed. */
    victories: number;
    name: string;
    /** Catalogue ids unlocked for purchase. */
    equipment?: string[];
    /** Recruit template ids unlocked. */
    personnel?: string[];
}

export const COMMENDATIONS: Commendation[] = [
    { victories: 3, name: '戰場實績', equipment: ['carapace-armour'] },
    { victories: 6, name: '軍械授權', equipment: ['plasma-gun'] },
    { victories: 10, name: '重火力編制', equipment: ['heavy-weapon'] },
    { victories: 15, name: '同軍團調派', personnel: ['kasrkin'] },
    { victories: 25, name: '跨軍團調派', personnel: ['catachan-fighter', 'krieg-infantry'] },
];

export interface Unlocked { equipment: string[]; personnel: string[] }

/** Everything earned at this many victories, cumulative. */
export function unlockedAt(victories: number): Unlocked {
    const earned = COMMENDATIONS.filter(step => victories >= step.victories);
    return {
        equipment: [...new Set(earned.flatMap(step => step.equipment ?? []))],
        personnel: [...new Set(earned.flatMap(step => step.personnel ?? []))],
    };
}

/** What this victory earned that the count before it had not. */
export function newlyUnlocked(victories: number): Unlocked {
    const before = unlockedAt(victories - 1);
    const now = unlockedAt(victories);
    return {
        equipment: now.equipment.filter(id => !before.equipment.includes(id)),
        personnel: now.personnel.filter(id => !before.personnel.includes(id)),
    };
}

/** The next commendation still to earn, for the UI to show as a goal. */
export const nextCommendation = (victories: number): Commendation | null =>
    COMMENDATIONS.find(step => victories < step.victories) ?? null;
