import { Duty, Origin } from './characters';

/**
 * Recruitment catalogue. User decision 2026-09-24 overrides v1.5 §4's "ordinary
 * reinforcement is not a shop item": requisition earned from life now buys
 * people as well as gear, so the same wallet funds a real choice between more
 * bodies and better equipment.
 *
 * The rule v1.5 was actually protecting — no buying elites outright — is kept:
 * anything outside the ordinary Astra Militarum line still needs a campaign or
 * story authorization, exactly like restricted equipment.
 */
export interface RecruitTemplate {
    id: string;
    name: string;
    origin: Origin;
    duty: Duty;
    /** CANDIDATE prices, set against the income model, not against play data. */
    price: number;
    restricted?: boolean;
    assetId?: string;
    note?: string;
}

// Income for reference: 30 requisition on a light day, 90 on a full one.
// 160 is roughly two full days; a specialist is 200. Recruits arrive unequipped.
export const BASIC_PRICE = 160;
export const SPECIALIST_PRICE = 200;

export const RECRUITS: RecruitTemplate[] = [
    { id: 'cadian-rifleman', name: '卡迪安步槍兵', origin: 'cadian', duty: 'rifleman', price: BASIC_PRICE, assetId: 'cadian-rifleman' },
    { id: 'cadian-sergeant', name: '卡迪安中士', origin: 'cadian', duty: 'sergeant', price: SPECIALIST_PRICE, assetId: 'cadian-sergeant' },
    { id: 'cadian-medic', name: '卡迪安醫療兵', origin: 'cadian', duty: 'medic', price: SPECIALIST_PRICE, assetId: 'cadian-medic-veteran', note: '操作資格與醫療工具分開' },
    { id: 'cadian-comms', name: '卡迪安通訊兵', origin: 'cadian', duty: 'comms', price: SPECIALIST_PRICE, assetId: 'cadian-comms-veteran' },
    { id: 'cadian-engineer', name: '卡迪安工程手', origin: 'cadian', duty: 'engineer', price: SPECIALIST_PRICE, assetId: 'cadian-mission-engineer' },
    { id: 'cadian-marksman', name: '卡迪安精準射手', origin: 'cadian', duty: 'marksman', price: SPECIALIST_PRICE, assetId: 'cadian-marksman' },
    { id: 'cadian-flamer', name: '卡迪安火焰武器手', origin: 'cadian', duty: 'flamer', price: SPECIALIST_PRICE, assetId: 'cadian-flamer' },
    { id: 'cadian-plasma', name: '卡迪安電漿武器手', origin: 'cadian', duty: 'plasma', price: SPECIALIST_PRICE, assetId: 'cadian-plasma' },

    // Other origins are story hires, not purchases. Price is what they cost once
    // the authorization exists; without it no amount of requisition works.
    { id: 'catachan-fighter', name: '卡塔昌叢林戰士', origin: 'catachan', duty: 'rifleman', price: SPECIALIST_PRICE, restricted: true },
    { id: 'krieg-infantry', name: '克里格步兵', origin: 'krieg', duty: 'rifleman', price: SPECIALIST_PRICE, restricted: true },
    { id: 'kasrkin', name: '卡斯爾金', origin: 'kasrkin', duty: 'marksman', price: 320, restricted: true, note: '同軍團，不算外援，但仍需授權' },
    { id: 'scion', name: '風暴兵', origin: 'scion', duty: 'marksman', price: 320, restricted: true },
    { id: 'battle-sister', name: '戰鬥修女', origin: 'sororitas', duty: 'rifleman', price: 360, restricted: true, note: '需聯絡授權' },
    { id: 'preacher', name: '國教牧師', origin: 'ecclesiarchy', duty: 'sergeant', price: 320, restricted: true },
];

const BY_ID = new Map(RECRUITS.map(template => [template.id, template]));
export const recruitTemplate = (id: string): RecruitTemplate | undefined => BY_ID.get(id);

export interface RecruitContext {
    balance: number;
    authorized: string[];
}

/** Why this recruit cannot be hired right now, or null when they can. */
export function recruitError(template: RecruitTemplate | undefined, context: RecruitContext): string | null {
    if (!template) return '名單裡沒有這個人員。';
    if (template.restricted && !context.authorized.includes(template.id)) {
        return `${template.name} 需要戰役或劇情授權，軍需買不到。`;
    }
    if (context.balance < 0) return '軍需為負，先把帳補回來才能招募。';
    if (context.balance < template.price) return `軍需不足：需要 ${template.price}，目前 ${context.balance}。`;
    return null;
}

// Fallback names so a recruit is never nameless; the player may rename them.
const NAME_POOL = ['布倫', '伊薩', '柯瓦', '瑞德', '塔爾', '芬恩', '奧朗', '希拉', '莫爾', '凡瑟', '格倫', '諾亞'];
export const fallbackName = (taken: string[]): string =>
    NAME_POOL.find(name => !taken.includes(name)) ?? `新兵 ${taken.length + 1}`;
