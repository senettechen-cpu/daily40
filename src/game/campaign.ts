import type { ArmyStrength, UnitType } from '../types';

export const SITES = [
    { id: 'supply', name: '黎明補給港', subtitle: '奪取後所有攻勢 +5 推進', icon: '◈' },
    { id: 'defense', name: '鋼鐵防禦線', subtitle: '奪取後指揮部攻勢 +10 推進', icon: '⬡' },
    { id: 'command', name: '黑曜指揮部', subtitle: '先奪取任一據點即可進攻', icon: '✦' },
] as const;
export type Site = typeof SITES[number]['id'];
export const TACTICS = {
    recon: { name: '偵察推進', cost: 1, power: 20, specialty: 'supply', bonus: 0, description: '無需部隊，穩定推進 20', units: [] as UnitType[] },
    infantry: { name: '步兵佔領', cost: 1, power: 25, specialty: 'supply', bonus: 15, description: '推進 25；補給港額外 +15', units: ['guardsmen', 'space_marine', 'wolf_guard', 'phalanx_warder', 'purifier', 'pyroclast'] as UnitType[] },
    armor: { name: '裝甲突破', cost: 2, power: 45, specialty: 'defense', bonus: 25, description: '推進 45；防禦線額外 +25', units: ['dreadnought', 'baneblade', 'redemptor_dreadnought'] as UnitType[] },
    guardian: { name: '禁軍護送', cost: 1, power: 25, specialty: 'command', bonus: 15, description: '推進 25；指揮部額外 +15', units: ['custodes'] as UnitType[] },
};
export type Tactic = keyof typeof TACTICS;
export interface CampaignState {
    version: 1;
    points: number;
    earned: Record<string, true>;
    progress: Record<Site, number>;
    history: { id: string; text: string; at: string }[];
}
export const freshCampaign = (): CampaignState => ({ version: 1, points: 0, earned: {}, progress: { supply: 0, defense: 0, command: 0 }, history: [] });
export function normalizeCampaign(value: unknown): CampaignState {
    const base = freshCampaign();
    if (!value || typeof value !== 'object') return base;
    const input = value as Partial<CampaignState>;
    const integer = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    return { ...base, points: integer(input.points),
        progress: Object.fromEntries(SITES.map(site => [site.id, Math.min(100, integer(input.progress?.[site.id]))])) as Record<Site, number>,
        earned: Object.fromEntries(Object.entries(input.earned || {}).filter(([, v]) => v === true)),
        history: Array.isArray(input.history) ? input.history.filter(entry => entry && typeof entry.text === 'string' && typeof entry.at === 'string' && typeof entry.id === 'string').slice(0, 30) : [],
    };
}
export const localDay = (date = new Date()) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
export function earnAction(state: CampaignState, key: string, title: string, at = new Date().toISOString()): CampaignState {
    if (!key || Object.hasOwn(state.earned, key)) return state;
    return { ...state, points: state.points + 1, earned: { ...state.earned, [key]: true }, history: [{ id: key, text: `完成「${title}」 · +1 行動點`, at }, ...state.history].slice(0, 30) };
}
export function tacticAvailable(tactic: Tactic, army: ArmyStrength): boolean {
    return tactic === 'recon' || TACTICS[tactic].units.some(type => [army.reserves, ...Object.values(army.garrisons)].some(group => (group[type] || 0) > 0));
}
export function previewAttack(state: CampaignState, site: Site, tactic: Tactic, army: ArmyStrength) {
    const rule = TACTICS[tactic];
    const locked = site === 'command' && state.progress.supply < 100 && state.progress.defense < 100;
    const gain = Math.min(100 - state.progress[site], rule.power + (rule.specialty === site ? rule.bonus : 0) + (state.progress.supply === 100 ? 5 : 0) + (site === 'command' && state.progress.defense === 100 ? 10 : 0));
    const reason = state.progress[site] === 100 ? '據點已收復' : locked ? '先收復補給港或防禦線' : !tacticAvailable(tactic, army) ? '需要徵召對應兵種' : state.points < rule.cost ? '完成任務以取得行動點' : '';
    return { gain, cost: rule.cost, reason };
}
export function attack(state: CampaignState, site: Site, tactic: Tactic, army: ArmyStrength, at = new Date().toISOString()): CampaignState {
    const result = previewAttack(state, site, tactic, army);
    if (result.reason) return state;
    const next = state.progress[site] + result.gain;
    return { ...state, points: state.points - result.cost, progress: { ...state.progress, [site]: next }, history: [{ id: `${at}-${site}-${next}`, at, text: `${SITES.find(item => item.id === site)!.name} · ${TACTICS[tactic].name} +${result.gain}%${next === 100 ? ' · 據點收復！' : ''}` }, ...state.history].slice(0, 30) };
}
