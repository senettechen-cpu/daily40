import { Character, isDeployable, isWoundedOn } from './characters';

// v1.5 §4: the roster itself has no cap, but a deployment holds at most six
// real people. Saving a formation never copies a character or their gear, so a
// squad is only a list of ids validated against the roster.
export const SQUAD_SIZE = 6;

export interface Squad {
    id: string;
    name: string;
    memberIds: string[];
}

export type SquadResult = { squad: Squad } | { error: string };

/**
 * Checks a squad against the roster. `forDeparture` adds the health gate, and
 * `day` additionally bars anyone a defeat took out of action that day.
 */
export function validateSquad(squad: Squad, roster: Character[], forDeparture = false, day?: string): string | null {
    if (!squad.name.trim()) return '編成需要一個名稱。';
    if (squad.memberIds.length > SQUAD_SIZE) return `一次最多部署 ${SQUAD_SIZE} 人。`;
    if (new Set(squad.memberIds).size !== squad.memberIds.length) return '同一個人不能占兩個位置。';

    const byId = new Map(roster.map(character => [character.id, character]));
    const missing = squad.memberIds.find(id => !byId.has(id));
    if (missing) return '編成裡有不存在的人員。';

    if (forDeparture) {
        if (squad.memberIds.length === 0) return '編成是空的，無法出發。';
        const members = squad.memberIds.map(id => byId.get(id)!);
        const unfit = members.find(character => !isDeployable(character));
        if (unfit) return `${unfit.name} 重傷，無法出發。`;
        const wounded = day ? members.find(character => isWoundedOn(character, day)) : undefined;
        if (wounded) return `${wounded.name} 在今天的敗戰中負傷，今日不得再出戰。`;
    }
    return null;
}

export function setMembers(squad: Squad, memberIds: string[], roster: Character[]): SquadResult {
    const next = { ...squad, memberIds };
    const error = validateSquad(next, roster);
    return error ? { error } : { squad: next };
}

/** Adds one member, refusing a duplicate or a seventh body. */
export function addMember(squad: Squad, characterId: string, roster: Character[]): SquadResult {
    if (squad.memberIds.includes(characterId)) return { squad };
    return setMembers(squad, [...squad.memberIds, characterId], roster);
}

export function removeMember(squad: Squad, characterId: string): Squad {
    return { ...squad, memberIds: squad.memberIds.filter(id => id !== characterId) };
}

/** Squads a character belongs to, so the UI can warn before retiring them. */
export const squadsWith = (squads: Squad[], characterId: string) =>
    squads.filter(squad => squad.memberIds.includes(characterId));
