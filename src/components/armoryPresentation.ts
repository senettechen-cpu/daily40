import { ARMOUR_STATS, WEAPON_STATS } from '../../shared/battle/turn/rules';
import { ORIGIN_LABELS } from '../../shared/roster';
import type { CatalogItem, EquipmentItem } from '../../shared/armory';

const TYPES: Record<string, string> = { las: '雷射', ballistic: '實彈', bolt: '爆彈', plasma: '電漿', flame: '火焰', melee: '近戰' };

/** Display reads the same numbers as combat; never duplicate balance values in cards. */
export function equipmentFacts(item: CatalogItem): { label: string; value: string }[] {
    const w = WEAPON_STATS[item.id];
    if (w) return [
        { label: '傷害類型', value: TYPES[w.damageType] },
        { label: '基礎傷害', value: `${w.damage} × ${w.hits}` },
        { label: '射程', value: `${w.range} 格` },
        { label: '穿甲', value: `${w.penetration}` },
    ];
    const a = ARMOUR_STATS[item.id];
    if (a) return [{ label: '護甲', value: `${a.armour}` }, { label: '先攻影響', value: a.initiative ? `${a.initiative}` : '無' }];
    return [];
}

export function equipmentNote(item: CatalogItem): string {
    if (ARMOUR_STATS[item.id]) return '護甲與先攻以現行回合制數值為準；不是額外生命值。';
    if (item.category === 'upgrade') return '目前軍械庫尚無改裝安裝入口；買入只會留在庫存，不會因持有而自動提升戰鬥數值。';
    if (item.id === 'heavy-weapon') return '需安排助裝手；移動後改用副武器。配裝前請確認六人編成。';
    if (item.id === 'plasma-gun') return '高穿甲、單次攻擊判定；實際命中與傷害仍受戰場條件影響。';
    if (item.category === 'tool') return '工具效果依職責與條件啟動，持有不代表能使用全部技能。';
    return item.note ?? '實際傷害依命中、距離、掩體與敵方護甲計算。';
}

export const equipmentCompatibility = (item: CatalogItem): string => item.origins
    ? `限 ${item.origins.map(o => ORIGIN_LABELS[o]).join('、')}`
    : item.category === 'armour' ? '人類體型護甲；不適用阿斯塔特'
        : item.category === 'upgrade' ? '改裝耗材，不直接配給人員' : '仍需符合欄位與授權限制';

export const inventoryCount = (items: EquipmentItem[], id: string) => ({
    total: items.filter(i => i.catalogId === id).length,
    free: items.filter(i => i.catalogId === id && !i.assignedTo).length,
});
