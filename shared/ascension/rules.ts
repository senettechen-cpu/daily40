import CATALOG from './organ-catalog.json';

// Ascension (v1.5 §5, GPT's ascension handoff, Ultramarines profile), with the
// user's 2026-09-27 decisions:
//   - a candidate comes from the sector campaign: each world boss captured
//     opens one escort-and-assessment operation, whose first win brings an
//     Ultramarines aspirant (three at most in chapter one);
//   - a level-10 soldier of the roster may apply for the original branch;
//   - every stage's character mission is a dedicated training operation the
//     candidate must win, retried freely;
//   - the daily designation has no 09:00 deadline: a task counts only if it
//     was designated before it was completed;
//   - a candidate who has not graduated fights only their own missions.
//
// Growth records are not a currency: they belong to one candidate and one
// stage, they are never spent, sold or moved, and organs cost no requisition.

export type Domain = 'health' | 'learning' | 'care' | 'social' | 'finance';

export const DOMAINS: { id: Domain; label: string }[] = [
    { id: 'health', label: '健康／復健' },
    { id: 'learning', label: '學習' },
    { id: 'care', label: '工作' },
    { id: 'social', label: '人際責任' },
    { id: 'finance', label: '財務回顧' },
];
export const DOMAIN_LABELS = Object.fromEntries(DOMAINS.map(d => [d.id, d.label])) as Record<Domain, string>;
export const isDomain = (value: unknown): value is Domain => DOMAINS.some(d => d.id === value);

export const PROFILE_ID = CATALOG.profileId;
export const MAX_DAILY_RECORDS = 2;
export const MIN_DOMAINS_PER_STAGE = 2;
/** Handoff §4: a finance record is the week's planned review, so one a week per candidate. */
export const FINANCE_PER_WEEK = 1;
export const STAGE_COUNT = 5;

export interface StageDef {
    stage: number;
    name: string;
    /** Growth records this stage needs. */
    records: number;
    /** Health baseline once this stage is implanted (replaces, never adds). */
    hp: number;
    mission: string;
    organIds: string[];
    /** floor(records × 0.75): what one domain may contribute. */
    maxOneDomain: number;
}

export const STAGES: StageDef[] = CATALOG.stages.map(s => ({
    stage: s.stage, name: s.name, records: s.records, hp: s.hp, mission: s.mission,
    organIds: s.ids, maxOneDomain: s.maximumOneDomainRecords,
}));
export const stageDef = (stage: number) => STAGES.find(s => s.stage === stage);

export interface Organ { id: string; labelZh: string; labelEn: string; canonicalPhase: number | null; gameStage: number | null; enabled: boolean; lore: string }
export const ORGANS: Organ[] = CATALOG.implants.map(i => ({
    id: i.id, labelZh: i.labelZh, labelEn: i.labelEn, canonicalPhase: i.canonicalPhase,
    gameStage: i.gameStage, enabled: i.enabledInBaseline, lore: i.loreFunctionShort,
}));
/** The standard nineteen; the three Primaris extras are prepared but never counted (handoff §3). */
export const STANDARD_ORGANS = ORGANS.filter(o => o.enabled);

export type Route = 'new-aspirant' | 'original-existing-soldier';
export const ROUTE_LABELS: Record<Route, string> = { 'new-aspirant': '極限戰士候選人', 'original-existing-soldier': '原創飛昇' };

/** v1.5 §4: level 10 unlocks an eligible soldier's application for the original branch. */
export const ORIGINAL_BRANCH_MIN_LEVEL = 10;
/** Word for word from docs/ultramarines-ascension-profile.md; shown before an application is made. */
export const ORIGINAL_BRANCH_NOTICE = {
    title: '原創飛昇路線｜本作改編',
    body: '本分支讓合資格既有星界軍角色保留身分進行阿斯塔特改造；這是本作原創設定，不代表《Warhammer 40,000》的常規招募流程。需要人物任務與完整成長階段，不可用軍需購買跳過。',
    confirm: '了解，選擇原創路線',
    cancel: '返回候選人主線',
};

export interface GrowthRecord { domain: Domain; stage: number; day: string }

export interface StageStanding {
    stage: StageDef;
    /** Records that count, after each domain's cap. */
    counted: number;
    byDomain: Record<Domain, { raw: number; counted: number }>;
    domains: number;
    /** Enough records, from enough domains. */
    full: boolean;
}

/** Where a candidate stands on one stage, from the records bound to that stage. */
export function stageStanding(stage: StageDef, records: GrowthRecord[]): StageStanding {
    const own = records.filter(r => r.stage === stage.stage);
    const byDomain = Object.fromEntries(DOMAINS.map(d => {
        const raw = own.filter(r => r.domain === d.id).length;
        return [d.id, { raw, counted: Math.min(raw, stage.maxOneDomain) }];
    })) as StageStanding['byDomain'];
    const counted = Math.min(stage.records, DOMAINS.reduce((sum, d) => sum + byDomain[d.id].counted, 0));
    const domains = DOMAINS.filter(d => byDomain[d.id].raw > 0).length;
    // One domain can never reach the total on its own (it is capped at 75%),
    // so a full stage always has at least two domains; checked anyway.
    return { stage, counted, byDomain, domains, full: counted >= stage.records && domains >= MIN_DOMAINS_PER_STAGE };
}

/** ISO-ish week key (Monday start) for the finance limit. */
export function weekOf(day: string): string {
    const d = new Date(`${day}T00:00:00Z`);
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return monday.toISOString().slice(0, 10);
}

/**
 * Whether one more record in this domain would count for the candidate's
 * current stage. A full stage takes nothing more until it is implanted
 * (handoff §4.7), a capped domain takes nothing more this stage, and finance
 * counts once a week.
 */
export function recordRefusal(currentStage: number, records: GrowthRecord[], domain: Domain, day: string): string | null {
    const def = stageDef(currentStage + 1);
    if (!def) return '已完成全部五個階段。';
    const standing = stageStanding(def, records);
    if (standing.full) return `第 ${def.stage} 階的紀錄已滿，確認植入後才會累積下一階。`;
    if (standing.byDomain[domain].raw >= def.maxOneDomain) return `${DOMAIN_LABELS[domain]}在第 ${def.stage} 階最多計入 ${def.maxOneDomain} 筆。`;
    if (domain === 'finance') {
        const week = weekOf(day);
        const thisWeek = records.filter(r => r.domain === 'finance' && weekOf(r.day) === week).length;
        if (thisWeek >= FINANCE_PER_WEEK) return '財務回顧每週只計一次。';
    }
    return null;
}

export interface Slot { taskId: string; domain: Domain }
export interface GrowthPlan { day: string; candidateId: string | null; slots: Slot[] }
export const emptyPlan = (day: string): GrowthPlan => ({ day, candidateId: null, slots: [] });

export interface PlanContext {
    /** Candidates still in training on this account. */
    candidateIds: string[];
    /** Tasks already completed today. */
    completedTaskIds: string[];
    /** Tasks today's plan has already turned into records. */
    recordedTaskIds: string[];
}

/**
 * The daily designation (B1 as revised by the user on 2026-09-27: no 09:00
 * deadline). One candidate a day, at most two tasks in two different domains.
 * A task counts only if it was designated before it was done, so nothing can be
 * claimed after the fact; once a record has landed today the candidate is
 * fixed, and a slot that has produced its record can no longer be moved.
 */
export function planRefusal(current: GrowthPlan, next: GrowthPlan, ctx: PlanContext): string | null {
    if (next.slots.length > MAX_DAILY_RECORDS) return `每天最多指定 ${MAX_DAILY_RECORDS} 項。`;
    if (next.slots.length > 0 && !next.candidateId) return '要先選一位培養中的候選人。';
    if (next.candidateId && !ctx.candidateIds.includes(next.candidateId)) return '這位不是培養中的候選人。';
    if (new Set(next.slots.map(s => s.domain)).size !== next.slots.length) return '兩項要屬於不同領域。';
    if (new Set(next.slots.map(s => s.taskId)).size !== next.slots.length) return '同一個任務不能指定兩次。';
    if (next.slots.some(s => !isDomain(s.domain))) return '未知的成長領域。';

    const recorded = new Set(ctx.recordedTaskIds);
    if (recorded.size > 0 && current.candidateId && next.candidateId !== current.candidateId) {
        return '今天已經有紀錄入帳，不能再換候選人。';
    }
    for (const slot of current.slots.filter(s => recorded.has(s.taskId))) {
        const kept = next.slots.find(s => s.taskId === slot.taskId);
        if (!kept || kept.domain !== slot.domain) return '已經入帳的項目不能取消或改領域。';
    }
    const before = new Set(current.slots.map(s => s.taskId));
    const done = new Set(ctx.completedTaskIds);
    for (const slot of next.slots) {
        if (!before.has(slot.taskId) && done.has(slot.taskId)) return '已經完成的任務不能事後指定，要在完成前指定。';
    }
    return null;
}

export interface ImplantContext {
    /** Stages implanted so far (0–5). */
    stage: number;
    records: GrowthRecord[];
    /** Stages whose character mission this candidate has won. */
    missionsWon: number[];
}

/** Why a stage cannot be implanted yet, or null when it can. */
export function implantRefusal(target: number, ctx: ImplantContext): string | null {
    const def = stageDef(target);
    if (!def) return '沒有這個階段。';
    if (target <= ctx.stage) return `第 ${target} 階已經植入。`;
    if (target !== ctx.stage + 1) return `要先完成第 ${ctx.stage + 1} 階。`;
    const standing = stageStanding(def, ctx.records);
    if (!standing.full) return `第 ${target} 階還差 ${def.records - standing.counted} 筆成長紀錄${standing.domains < MIN_DOMAINS_PER_STAGE ? '，而且至少要兩個領域' : ''}。`;
    if (!ctx.missionsWon.includes(target)) return `還沒通過人物任務「${def.mission}」。`;
    return null;
}

/** Health baseline for a soldier partway through ascension; null means use the origin's. */
export function stageHp(stage: number | undefined): number | null {
    if (!stage || stage >= STAGE_COUNT) return null;
    return stageDef(stage)?.hp ?? null;
}

/** Organs implanted after `stage` stages, in the catalogue's order. */
export const organsThrough = (stage: number): string[] => STAGES.filter(s => s.stage <= stage).flatMap(s => s.organIds);
