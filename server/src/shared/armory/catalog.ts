import { Origin } from '../roster';

// v1.5 §2 candidate prices. They were set against the income model, not against
// battle results, so they stay candidates until the weapon benchmarks run.
export type Slot = 'primary' | 'sidearm' | 'armour' | 'tool';
export type ItemCategory = Slot | 'upgrade';

export interface CatalogItem {
    id: string;
    name: string;
    category: ItemCategory;
    price: number;
    /** Needs a campaign or story authorization first; requisition alone cannot buy it. */
    restricted?: boolean;
    /** Origins allowed to carry it. Absent means anyone may. */
    origins?: Origin[];
    note?: string;
}

export const CATALOG: CatalogItem[] = [
    { id: 'lasgun', name: '制式雷射槍', category: 'primary', price: 40, note: '起始配發；擴編或多套裝備才需購買' },
    { id: 'laspistol', name: '制式雷射手槍', category: 'sidearm', price: 30, note: '起始配發' },
    { id: 'shotgun', name: '霰彈槍', category: 'primary', price: 80, note: '改打法，不是全面取代步槍' },
    { id: 'precision-lasgun', name: '精準雷射槍', category: 'primary', price: 120 },
    { id: 'flamer', name: '火焰器', category: 'primary', price: 120 },
    { id: 'plasma-gun', name: '電漿槍', category: 'primary', price: 240, restricted: true, note: '反甲但彈少；需授權與部署取捨' },
    { id: 'heavy-weapon', name: '星界軍重武器組', category: 'primary', price: 200, restricted: true, note: '雙人操作' },
    { id: 'sororitas-boltgun', name: '修女用爆彈槍', category: 'primary', price: 180, restricted: true, origins: ['sororitas'] },
    { id: 'astartes-boltgun', name: '阿斯塔特用爆彈槍', category: 'primary', price: 280, restricted: true, origins: ['astartes'] },

    { id: 'flak-armour', name: '防破片甲', category: 'armour', price: 60, note: '護甲 20' },
    { id: 'carapace-armour', name: '甲殼甲', category: 'armour', price: 160, restricted: true, note: '移動代價待測' },
    { id: 'astartes-power-armour', name: '阿斯塔特制式動力甲', category: 'armour', price: 400, restricted: true, origins: ['astartes'], note: '護甲 80' },

    { id: 'medicae-kit', name: '醫療工具', category: 'tool', price: 80, note: '操作資格獨立於持有' },
    { id: 'vox-caster', name: '通訊工具', category: 'tool', price: 80 },
    { id: 'engineering-kit', name: '工程工具', category: 'tool', price: 80 },

    { id: 'function-mod', name: '功能改裝', category: 'upgrade', price: 60, note: '每件武器一個' },
    { id: 'tuning-1', name: '整備一階', category: 'upgrade', price: 40, note: '+5% 原始傷害' },
    { id: 'tuning-2', name: '整備二階', category: 'upgrade', price: 80, note: '+5% 原始傷害，需先有一階' },
];

const BY_ID = new Map(CATALOG.map(item => [item.id, item]));
export const catalogItem = (id: string): CatalogItem | undefined => BY_ID.get(id);

export const SLOT_LABELS: Record<ItemCategory, string> = {
    primary: '主武器', sidearm: '副武器', armour: '護甲', tool: '工具', upgrade: '改裝',
};

// v1.5 §6: one function mod plus two tuning stages, +10% original damage in total.
export const MAX_FUNCTION_MODS = 1;
export const MAX_TUNING_STAGES = 2;
export const TUNING_BONUS_PER_STAGE = 0.05;

/** A character may carry one primary, one sidearm, one suit of armour and up to two tools. */
export const SLOT_CAPACITY: Record<Slot, number> = { primary: 1, sidearm: 1, armour: 1, tool: 2 };
