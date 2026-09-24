import { Character, BASE_ACCURACY, maxHp } from '../../shared/roster';
import { EquipmentItem, catalogItem } from '../../shared/armory';
import type { CrewProfile } from './sim/engine';
import type { WeaponId } from './sim/rules';

// Turns roster records into the numbers the simulation runs on. Only the two
// weapons with a benchmarked profile are modelled; everything else is carried
// but has no combat effect yet, and is reported so the UI can say so rather
// than silently pretending a plasma gun fires like a lasgun.
const SIM_WEAPONS: Record<string, WeaponId> = { lasgun: 'lasgun', laspistol: 'laspistol' };

/**
 * Armour values. Flak 20 and power armour 80 come from v1.5 §6; carapace has no
 * number in the spec, so 40 is a placeholder that must not ship unreviewed.
 */
const ARMOUR_VALUES: Record<string, number> = {
    'flak-armour': 20,
    'carapace-armour': 40,
    'astartes-power-armour': 80,
};

export interface Deployment {
    crew: CrewProfile[];
    /** Catalog ids carried into battle that the simulation cannot model yet. */
    unmodelled: string[];
}

export function deploymentFor(members: Character[], items: EquipmentItem[]): Deployment {
    const unmodelled = new Set<string>();

    const crew = members.map((character): CrewProfile => {
        const carried = items.filter(item => item.assignedTo === character.id);

        let primary: WeaponId = 'lasgun';
        let secondary: WeaponId = 'laspistol';
        let armor = 0;

        for (const item of carried) {
            const definition = catalogItem(item.catalogId);
            if (!definition) continue;

            if (definition.category === 'armour') {
                const value = ARMOUR_VALUES[item.catalogId];
                if (value === undefined) unmodelled.add(item.catalogId);
                else armor = Math.max(armor, value);
                continue;
            }
            if (definition.category === 'primary' || definition.category === 'sidearm') {
                const weapon = SIM_WEAPONS[item.catalogId];
                if (!weapon) { unmodelled.add(item.catalogId); continue; }
                if (definition.category === 'primary') primary = weapon; else secondary = weapon;
                continue;
            }
            // Tools and upgrades have no combat model yet.
            unmodelled.add(item.catalogId);
        }

        return {
            id: character.id,
            name: character.name,
            maxHp: maxHp(character),
            armor,
            accuracy: BASE_ACCURACY[character.origin] / 100,
            loadout: { primary, secondary },
        };
    });

    return { crew, unmodelled: [...unmodelled] };
}
