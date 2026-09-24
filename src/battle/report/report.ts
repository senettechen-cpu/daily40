// Turns simulation events into a battle report (text + static art presentation).
// Every entry is traceable to its source event IDs; wording comes only from
// GPT's templates (report-templates.json); nothing here touches the battle RNG,
// so replays and report variants never change the outcome.
import type { Battle, BattleEvent, BattleSetup, BattleStatus, Unit } from '../../../shared/battle/sim';
import { createBattle, stepBattle } from '../../../shared/battle/sim';
import { TICKS_PER_SECOND, WEAPONS, type Slot, type WeaponId } from '../../../shared/battle/sim';
import templateFile from './report-templates.json';

export const TEMPLATE_VERSION = templateFile.schemaVersion;
export const BURST_WINDOW_TICKS = 2 * TICKS_PER_SECOND;
export const MAX_SINGLE_CHARS = 80;
export const MAX_BURST_CHARS = 140;
type TemplateKey = keyof typeof templateFile.templates;

export type EntryKind = 'hit' | 'cover' | 'miss' | 'burst' | 'swap-start' | 'swap' | 'reload' | 'cancel' | 'down' | 'result';

export interface ShotTally { shots: number; hits: number; coverHits: number; misses: number; amount: number }

export interface ReportEntry {
    id: string;
    kind: EntryKind;
    key: boolean; // key moments are never merged or hidden
    startTick: number;
    endTick: number;
    text: string;
    actorId?: string;
    targetId?: string;
    weapon?: WeaponId;
    tally?: ShotTally;
    sourceEventIds: number[];
    order: number; // original event order of the first source event
}

export interface UnitStats extends ShotTally { id: string; name: string; side: Unit['side']; damageTaken: number; downTick: number | null; finalHp: number; maxHp: number; swaps: number; reloads: number }

/** Compact per-tick unit state for the roster panel. */
export interface UnitSnap {
    id: string;
    hp: number;
    /**
     * Where the unit stood on this tick. The tactical map replays historical
     * positions, so it needs the position at the event, not the final one.
     */
    pos: { x: number; y: number };
    side: 'crew' | 'enemy'; active: Slot; weapon: WeaponId; ammo: Record<Slot, number>; action: Unit['action']['kind']; swapTo: Slot | null; swapProgress: number; reloadProgress: number | null }

type Shot = Extract<BattleEvent, { kind: 'shot' }>;

/** Deterministic template variant: a fixed hash of the event ID and template version (no RNG). */
function variant(key: TemplateKey, seedId: number): string {
    const list = templateFile.templates[key];
    const h = (Math.imul(seedId, 2654435761) + TEMPLATE_VERSION * 97) >>> 0;
    return list[h % list.length];
}

const fill = (template: string, values: Record<string, string | number>) =>
    template.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));

const weaponName = (id: WeaponId) => WEAPONS[id].name;
const shortName = (name: string) => (name.length > 16 ? name.slice(0, 16) : name);

export function buildReport(events: BattleEvent[], names: Record<string, string>, final: { status: BattleStatus; tick: number }): ReportEntry[] {
    const entries: ReportEntry[] = [];
    const open = new Map<string, Shot[]>();
    const who = (id: string) => shortName(names[id] ?? id);

    const flush = (key: string) => {
        const shots = open.get(key);
        open.delete(key);
        if (!shots?.length) return;
        const first = shots[0], last = shots[shots.length - 1];
        const tally: ShotTally = {
            shots: shots.length,
            hits: shots.filter(s => s.outcome === 'hit').length,
            coverHits: shots.filter(s => s.outcome === 'cover').length,
            misses: shots.filter(s => s.outcome === 'miss').length,
            amount: shots.reduce((sum, s) => sum + s.amount, 0),
        };
        const values = { shooter: who(first.sourceId), target: who(first.targetId), weapon: weaponName(first.weapon), ...tally };
        const kind: EntryKind = shots.length > 1 ? 'burst' : first.outcome;
        let text = fill(variant(kind as TemplateKey, first.id), values);
        const limit = kind === 'burst' ? MAX_BURST_CHARS : MAX_SINGLE_CHARS;
        if ([...text].length > limit) text = `${values.shooter}→${values.target}（${values.weapon}）×${tally.shots}：命中${tally.hits}／掩體${tally.coverHits}／未中${tally.misses}，傷害${tally.amount}`;
        entries.push({ id: `shot-${first.id}`, kind, key: false, startTick: first.tick, endTick: last.tick, text, actorId: first.sourceId, targetId: first.targetId, weapon: first.weapon, tally, sourceEventIds: shots.map(s => s.id), order: first.id });
    };
    // A key event closes every open window involving that unit, as shooter or target.
    const flushUnit = (unitId: string) => { for (const [key, shots] of [...open]) if (shots[0].sourceId === unitId || shots[0].targetId === unitId) flush(key); };
    const keyEntry = (ev: BattleEvent, kind: EntryKind, text: string, extra: Partial<ReportEntry> = {}) =>
        entries.push({ id: `${kind}-${ev.id}`, kind, key: kind !== 'swap-start' && kind !== 'reload', startTick: ev.tick, endTick: ev.tick, text, sourceEventIds: [ev.id], order: ev.id, ...extra });

    for (const ev of [...events].sort((a, b) => a.id - b.id)) {
        if (ev.kind === 'shot') {
            const key = `${ev.sourceId}|${ev.targetId}|${ev.weapon}`;
            const current = open.get(key);
            if (current && ev.tick - current[0].tick > BURST_WINDOW_TICKS) flush(key);
            open.set(key, [...(open.get(key) ?? []), ev]);
            continue;
        }
        flushUnit(ev.unitId);
        const actor = who(ev.unitId);
        if (ev.kind === 'swap') {
            const weapon = weaponName(ev.weapon);
            if (ev.phase === 'start') keyEntry(ev, 'swap-start', `${actor}開始切換武器`, { actorId: ev.unitId });
            else {
                const text = ev.to === 'primary' ? fill(variant('swapPrimary', ev.id), { shooter: actor, weapon })
                    : ev.reason === 'engaged' ? fill(variant('swapSecondaryEngaged', ev.id), { shooter: actor, weapon })
                    : `${actor}已切換為${weapon}`; // cause not confirmed: neutral wording
                keyEntry(ev, 'swap', text, { actorId: ev.unitId, weapon: ev.weapon });
            }
        } else if (ev.kind === 'reload') keyEntry(ev, 'reload', fill(variant('reload', ev.id), { shooter: actor, weapon: weaponName(ev.weapon) }), { actorId: ev.unitId, weapon: ev.weapon });
        else if (ev.kind === 'cancel') keyEntry(ev, 'cancel', `${actor}的動作中止`, { actorId: ev.unitId });
        else if (ev.kind === 'down') keyEntry(ev, 'down', fill(variant('down', ev.id), { target: actor }), { targetId: ev.unitId });
    }
    for (const key of [...open.keys()]) flush(key);
    if (final.status !== 'running') {
        const key = final.status as TemplateKey;
        entries.push({ id: `result-${final.tick}`, kind: 'result', key: true, startTick: final.tick, endTick: final.tick, text: variant(key, final.tick), sourceEventIds: [], order: Number.MAX_SAFE_INTEGER });
    }
    return entries.sort((a, b) => a.startTick - b.startTick || a.order - b.order);
}

export function battleStats(events: BattleEvent[], final: Battle): UnitStats[] {
    return final.units.map(u => {
        const mine = events.filter((e): e is Shot => e.kind === 'shot' && e.sourceId === u.id);
        const down = events.find(e => e.kind === 'down' && e.unitId === u.id);
        return {
            id: u.id, name: u.name, side: u.side,
            shots: mine.length,
            hits: mine.filter(s => s.outcome === 'hit').length,
            coverHits: mine.filter(s => s.outcome === 'cover').length,
            misses: mine.filter(s => s.outcome === 'miss').length,
            amount: mine.reduce((sum, s) => sum + s.amount, 0),
            damageTaken: events.reduce((sum, e) => sum + (e.kind === 'shot' && e.targetId === u.id ? e.amount : 0), 0),
            downTick: down ? down.tick : null,
            finalHp: u.hp, maxHp: u.maxHp,
            swaps: events.filter(e => e.kind === 'swap' && e.phase === 'complete' && e.unitId === u.id).length,
            reloads: events.filter(e => e.kind === 'reload' && e.unitId === u.id).length,
        };
    });
}

function snap(u: Unit, tick: number): UnitSnap {
    const a = u.action;
    return {
        id: u.id, hp: u.hp, pos: { x: u.pos.x, y: u.pos.y }, side: u.side, active: u.active, weapon: u.loadout[u.active], ammo: { ...u.ammo }, action: a.kind,
        swapTo: a.kind === 'swap' ? a.to : null,
        swapProgress: a.kind === 'swap' ? Math.min(1, (tick - a.start) / (a.end - a.start)) : 0,
        reloadProgress: a.kind === 'reload' ? Math.min(1, (tick - a.start) / (a.end - a.start)) : null,
    };
}

export interface SimulatedBattle { initial: Battle; final: Battle; events: BattleEvent[]; timeline: UnitSnap[][]; report: ReportEntry[]; stats: UnitStats[] }

/** Runs the whole battle up front (deterministic), keeping every event — the live battle caps its event buffer. */
export function simulateWithReport(setup: BattleSetup): SimulatedBattle {
    const initial = createBattle(setup);
    let battle = initial;
    const events: BattleEvent[] = [];
    const timeline: UnitSnap[][] = [battle.units.map(u => snap(u, 0))];
    while (battle.status === 'running') {
        const next = battle.nextEventId;
        battle = stepBattle(battle);
        for (const ev of battle.events) if (ev.id >= next) events.push(ev);
        timeline.push(battle.units.map(u => snap(u, battle.tick)));
    }
    const names = Object.fromEntries(initial.units.map(u => [u.id, u.name]));
    return { initial, final: battle, events, timeline, report: buildReport(events, names, battle), stats: battleStats(events, battle) };
}
