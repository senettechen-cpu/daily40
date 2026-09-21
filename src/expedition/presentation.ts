import type { Battle, Effect, Point } from './engine';

export const project = (p: Point) => ({ x: 340 + (p.x - p.y) * 30, y: 100 + (p.x + p.y) * 15 });
export const IMPACT_DELAY = .16;
export const effectAge = (e: Effect, tick: number, fraction = 0) => Math.max(0, (tick - e.born + fraction) / 10);
export interface MotionTrack { from: Point; to: Point; start: number; end: number }
export function motionPoint(track: MotionTrack, tick: number): Point {
    const t = Math.max(0, Math.min(1, (tick - track.start) / Math.max(1, track.end - track.start)));
    const eased = t * t * (3 - 2 * t);
    return { x: track.from.x + (track.to.x - track.from.x) * eased, y: track.from.y + (track.to.y - track.from.y) * eased };
}
export function visibleHealth(battle: Battle, id: string, fraction = 0) {
    const actor = battle.actors.find(a => a.id === id)!;
    // The simulation settles immediately; the presentation applies the bar at visual impact.
    const pending = battle.effects.filter(e => e.targetId === id && effectAge(e, battle.tick, fraction) < IMPACT_DELAY)
        .reduce((sum, e) => sum + (e.kind === 'heal' ? -e.amount : e.amount), 0);
    return Math.max(0, Math.min(actor.maxHp, actor.hp + pending));
}
