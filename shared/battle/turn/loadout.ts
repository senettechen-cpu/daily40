import { BASE_ACCURACY, Character, Duty, maxHp } from '../../roster';
import { EquipmentItem, catalogItem, itemsOf } from '../../armory';
import { Hex } from '../hex';
import { ARMOUR_STATS, DUTY_STATS, WEAPON_STATS, FISTS } from './rules';
import { Stance, UnitSpec } from './types';

// Turns roster records and the armoury into the units the turn engine fights
// with. Every number it reads lives in rules.ts, so the numbers pass replaces
// one file and this mapping never changes.

export interface Placement {
    characterId: string;
    at: Hex;
    stance: Stance;
    /** Who a 'guard' stance follows. */
    guardTargetId?: string;
}

export interface CrewDeployment {
    units: UnitSpec[];
    /** Carried into battle but with no combat profile yet, so the UI can say so. */
    unmodelled: string[];
}

/**
 * One soldier as the engine sees them. An empty weapon slot is not unarmed:
 * a guardsman without a rifle still has their fists, which keeps a mis-equipped
 * squad legible instead of silently unable to act.
 */
function specFor(character: Character, carried: EquipmentItem[], placement: Placement, unmodelled: Set<string>): UnitSpec {
    const duty = DUTY_STATS[character.duty as Duty] ?? DUTY_STATS.rifleman;

    let weapon = FISTS;
    let armour = 0;

    for (const item of carried) {
        const definition = catalogItem(item.catalogId);
        if (!definition) continue;

        if (definition.category === 'armour') {
            const plate = ARMOUR_STATS[item.catalogId];
            if (!plate) { unmodelled.add(item.catalogId); continue; }
            if (plate.armour > armour) armour = plate.armour;
            continue;
        }
        if (definition.category === 'primary' || definition.category === 'sidearm') {
            const profile = WEAPON_STATS[item.catalogId];
            if (!profile) { unmodelled.add(item.catalogId); continue; }
            // A primary always wins the slot; a sidearm only arms the unarmed.
            if (definition.category === 'primary' || weapon === FISTS) weapon = profile;
            continue;
        }
        unmodelled.add(item.catalogId); // tools and upgrades have no combat model yet
    }

    return {
        id: character.id,
        name: character.name,
        side: 'crew',
        duty: character.duty,
        maxHp: maxHp(character),
        armour,
        accuracy: BASE_ACCURACY[character.origin] / 100,
        movement: duty.movement,
        initiative: duty.initiative,
        weapon,
        stance: placement.stance,
        guardTargetId: placement.guardTargetId,
        at: placement.at,
    };
}

/** The player's six, in the order they were placed. */
export function crewFor(characters: Character[], items: EquipmentItem[], placements: Placement[]): CrewDeployment {
    const unmodelled = new Set<string>();
    const byId = new Map(characters.map(character => [character.id, character]));

    const units = placements
        .map(placement => {
            const character = byId.get(placement.characterId);
            return character ? specFor(character, itemsOf(items, character.id), placement, unmodelled) : null;
        })
        .filter((unit): unit is UnitSpec => unit !== null);

    return { units, unmodelled: [...unmodelled] };
}

/** A guard pointed at nobody, or at someone not deployed, is just a soldier. */
export function resolveGuards(units: UnitSpec[]): UnitSpec[] {
    const present = new Set(units.map(unit => unit.id));
    return units.map(unit => (
        unit.stance === 'guard' && (!unit.guardTargetId || !present.has(unit.guardTargetId) || unit.guardTargetId === unit.id)
            ? { ...unit, stance: 'hold' as Stance, guardTargetId: undefined }
            : unit
    ));
}
