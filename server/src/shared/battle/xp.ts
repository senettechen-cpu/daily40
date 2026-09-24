import { LEVEL_XP } from '../roster';

// v1.5 / GPT r6: service pays the same to everyone who went, so nobody is
// rewarded for stealing a kill or for leaving the medic behind.

export type Outcome = 'victory' | 'defeat' | 'timeout';

export const DEPLOYED_XP: Record<Outcome, number> = { victory: 60, defeat: 40, timeout: 20 };
export const TRAINEE_XP: Record<Outcome, number> = { victory: 30, defeat: 20, timeout: 10 };

export const MAX_TRAINEES = 4;

/** Trainees coast to level eight; nine and ten have to be served in person. */
export const TRAINEE_XP_CEILING = LEVEL_XP[7];

export interface XpAward {
    characterId: string;
    amount: number;
    role: 'deployed' | 'trainee';
}

export interface XpSubject { id: string; xp: number }

/**
 * What one finished operation pays. Trainees are truncated at the ceiling
 * rather than banking hidden XP, and anyone listed twice is paid once, as the
 * deployed soldier they are.
 */
export function awardsFor(outcome: Outcome, deployed: XpSubject[], trainees: XpSubject[]): XpAward[] {
    const awards: XpAward[] = deployed.map(subject => ({
        characterId: subject.id, amount: DEPLOYED_XP[outcome], role: 'deployed' as const,
    }));

    const alreadyPaid = new Set(deployed.map(subject => subject.id));
    for (const subject of trainees.slice(0, MAX_TRAINEES)) {
        if (alreadyPaid.has(subject.id)) continue;
        alreadyPaid.add(subject.id);

        const room = Math.max(0, TRAINEE_XP_CEILING - subject.xp);
        const amount = Math.min(TRAINEE_XP[outcome], room);
        if (amount > 0) awards.push({ characterId: subject.id, amount, role: 'trainee' });
    }
    return awards;
}
