import { Character, Origin } from '../roster';
import { CatalogItem, SLOT_CAPACITY, Slot, catalogItem } from './catalog';

// Every owned piece of gear is a distinct instance. Two riflemen cannot share
// one lasgun, which is what makes the "equipment is unique" departure check
// meaningful rather than a count comparison.
export interface EquipmentItem {
    id: string;
    catalogId: string;
    /** null while the item sits in the armoury. */
    assignedTo: string | null;
    /** What was actually paid; 0 for issued gear, which therefore refunds nothing. */
    paid: number;
    acquiredAt: string;
}

export const itemsOf = (items: EquipmentItem[], characterId: string) =>
    items.filter(item => item.assignedTo === characterId);

const slotOf = (item: EquipmentItem): Slot | null => {
    const definition = catalogItem(item.catalogId);
    return definition && definition.category !== 'upgrade' ? definition.category : null;
};

/** Why this character may not take this item, or null when they may. */
export function assignmentError(
    item: EquipmentItem, character: Character, items: EquipmentItem[], authorized: string[],
): string | null {
    const definition = catalogItem(item.catalogId);
    if (!definition) return '未知的裝備。';
    if (definition.category === 'upgrade') return '改裝要裝在武器上，不是人身上。';

    if (item.assignedTo && item.assignedTo !== character.id) return '這件裝備已經配給其他人。';
    if (definition.origins && !definition.origins.includes(character.origin)) {
        return `${definition.name} 不能由這個出身的人員使用。`;
    }
    if (definition.restricted && !authorized.includes(definition.id)) {
        return `${definition.name} 尚未取得授權。`;
    }

    const slot = definition.category;
    const held = itemsOf(items, character.id).filter(other => other.id !== item.id && slotOf(other) === slot);
    if (held.length >= SLOT_CAPACITY[slot]) {
        return `${character.name} 的${slot === 'tool' ? '工具欄' : '欄位'}已滿。`;
    }
    return null;
}

/** v1.5 §6: two tuning stages total +10%, and the cap is a hard ceiling. */
export const tuningBonus = (stages: number) => Math.min(stages, 2) * 0.05;

export interface PurchaseContext {
    balance: number;
    authorized: string[];
}

/** Why this item cannot be bought right now, or null when it can. */
export function purchaseError(definition: CatalogItem | undefined, context: PurchaseContext): string | null {
    if (!definition) return '目錄裡沒有這件裝備。';
    if (definition.restricted && !context.authorized.includes(definition.id)) return `${definition.name} 尚未解鎖，需要戰役或劇情授權。`;
    if (context.balance < 0) return '軍需為負，先把帳補回來才能採購。';
    if (context.balance < definition.price) return `軍需不足：需要 ${definition.price}，目前 ${context.balance}。`;
    return null;
}

/** Origins that can legally carry an item, for the catalogue UI. */
export const allowedOrigins = (definition: CatalogItem): Origin[] | null => definition.origins ?? null;
