import { BASE_ACCURACY, Character, Duty, Effect, effectsOf, maxHp } from '../../roster';
import { EquipmentItem, catalogItem, itemsOf } from '../../armory';
import { Hex } from '../hex';
import {
    ARMOUR_STATS, DUTY_STATS, FISTS, FUNCTION_MOD_ACCURACY, TUNING_MULTIPLIER, VOX_CASTER,
    VOX_INITIATIVE, WEAPON_STATS,
} from './rules';
import { ArmourType, Stance, UnitSpec } from './types';

// Turns roster records and the armoury into the units the turn engine fights
// with. Every number it reads lives in rules.ts, so the numbers pass replaces
// one file and this mapping never changes.

export interface Placement {
    characterId: string;
    at: Hex;
    stance: Stance;
    /** Who a 'guard' stance follows. */
    guardTargetId?: string;
    /** Who feeds this soldier's heavy weapon; ignored for anyone else. */
    assistantId?: string;
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
    let sidearm: UnitSpec['sidearm'];
    let armour = 0;
    let armourType: ArmourType = 'none';
    let initiative = duty.initiative;
    let tuningStages = 0;
    let mods = 0;
    const tools: string[] = [];

    for (const item of carried) {
        const definition = catalogItem(item.catalogId);
        if (!definition) continue;

        if (definition.category === 'armour') {
            const plate = ARMOUR_STATS[item.catalogId];
            if (!plate) { unmodelled.add(item.catalogId); continue; }
            // Only one plate is worn: the strongest, and its type comes with it
            // rather than being guessed from the duty.
            if (plate.armour > armour) {
                armour = plate.armour;
                armourType = plate.type;
                initiative = duty.initiative + (plate.initiative ?? 0);
            }
            continue;
        }
        if (definition.category === 'primary') {
            const profile = WEAPON_STATS[item.catalogId];
            if (!profile) { unmodelled.add(item.catalogId); continue; }
            weapon = profile;
            continue;
        }
        if (definition.category === 'sidearm') {
            const profile = WEAPON_STATS[item.catalogId];
            if (!profile) { unmodelled.add(item.catalogId); continue; }
            sidearm = profile;
            continue;
        }
        // Upgrades ride on the primary; tools unlock what their duty can already
        // do, so a kit in the wrong hands is carried and says so.
        if (item.catalogId === 'tuning-1' || item.catalogId === 'tuning-2') { tuningStages += 1; continue; }
        if (item.catalogId === 'function-mod') { mods += 1; continue; }
        if (definition.category === 'tool') { tools.push(item.catalogId); continue; }
        unmodelled.add(item.catalogId);
    }

    // An unarmed soldier fights with their sidearm if they have one.
    if (weapon === FISTS && sidearm) { weapon = sidearm; sidearm = undefined; }

    // Specialties: the fixed effects fold into the numbers here; the rest ride
    // along for the engine to read when the situation arises.
    const effects = effectsOf(character);
    const total = (kind: Effect['kind']) => effects.reduce((sum, e) => sum + (e.kind === kind ? (e as { amount: number }).amount : 0), 0);
    const product = (kind: Effect['kind']) => effects.reduce((acc, e) => acc * (e.kind === kind ? (e as { amount: number }).amount : 1), 1);
    const pierce = total('penetration');
    if (pierce) weapon = { ...weapon, penetration: weapon.penetration + pierce };
    const boltBoost = product('bolt-damage');
    if (boltBoost !== 1 && weapon.damageType === 'bolt') weapon = { ...weapon, damage: weapon.damage * boltBoost };

    return {
        id: character.id,
        name: character.name,
        side: 'crew',
        duty: character.duty,
        assetId: character.assetId,
        maxHp: Math.round(maxHp(character) * product('max-hp')),
        armour: armour + total('armour'),
        armourType,
        accuracy: BASE_ACCURACY[character.origin] / 100,
        accuracyBonus: Math.min(mods, 1) * FUNCTION_MOD_ACCURACY + total('self-hit'),
        tuning: TUNING_MULTIPLIER[Math.min(tuningStages, TUNING_MULTIPLIER.length - 1)],
        movement: duty.movement + total('move'),
        initiative: initiative + (tools.includes(VOX_CASTER) ? VOX_INITIATIVE : 0) + total('initiative'),
        weapon,
        sidearm,
        tools,
        stance: placement.stance,
        guardTargetId: placement.guardTargetId,
        // The player's chosen mate; assignHeavyCrew keeps it when it is valid.
        assistantId: placement.assistantId,
        at: placement.at,
        ...(effects.length > 0 ? { effects } : {}),
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

/** What a soldier costs the squad while they feed a gun instead of fighting. */
const MATE_PREFERENCE: Record<string, number> = {
    // A plain rifleman gives up the least: the value matrix has the heavy weapon
    // at +10 win points when one feeds it, and negative when the plasma gunner
    // or the engineer does (docs/pacing-and-value.md).
    rifleman: 0,
    engineer: 1,
    vox: 2,
    medic: 3,
    marksman: 4,
    flamer: 5,
    plasma: 6,
};

/**
 * Binds a mate to every heavy weapon. A chosen `assistantId` that is still a
 * valid mate is kept - the deployment screen lets the player pick (2026-09-28).
 * Otherwise the cheapest duty to spare is drafted, deterministically, rather
 * than whoever happened to be placed first: taking the engineer or the plasma
 * gunner turns the gun from the best buy in the game into a liability, and the
 * screen never said so.
 */
export function assignHeavyCrew(units: UnitSpec[]): UnitSpec[] {
    const taken = new Set<string>();
    const gunners = units.filter(u => u.duty === 'heavy' && u.weapon.name.includes('重武器'));

    // Honour the player's picks first, so an automatic choice cannot take them.
    for (const gunner of gunners) {
        const chosen = gunner.assistantId
            && units.find(u => u.id === gunner.assistantId && u.side === gunner.side && u.id !== gunner.id && u.duty !== 'heavy');
        if (chosen) taken.add(chosen.id);
    }

    return units.map(unit => {
        if (!gunners.some(g => g.id === unit.id)) return unit;
        if (unit.assistantId && taken.has(unit.assistantId)) return unit;

        const mate = units
            .filter(other => other.id !== unit.id && other.side === unit.side
                && !taken.has(other.id) && other.duty !== 'heavy'
                && other.duty in MATE_PREFERENCE)
            .sort((a, b) => MATE_PREFERENCE[a.duty] - MATE_PREFERENCE[b.duty]
                || (a.id < b.id ? -1 : 1))[0];
        if (!mate) return unit;
        taken.add(mate.id);
        return { ...unit, assistantId: mate.id };
    });
}
