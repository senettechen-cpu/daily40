import type { Unit } from '../../../shared/battle/sim';
import { ticks, TICKS_PER_SECOND } from '../../../shared/battle/sim';
import { frameAtClock, frameAtDistance, frameAtProgress, type ActionId, type ActorSprites, type Frame, type SpriteContract } from '../sprites/contract';

// Maps simulation state to a contract frame. Engine actions play over their
// real engine duration × durationWeights; walking follows distance walked;
// only idle runs on the clock. Presentation never changes simulation state.
export const GAIT_STRIDE_TILES = 1.6; // one 8-frame walk cycle per 1.6 tiles walked
const DOWN_TICKS = ticks(1.1);
const HIT_TICKS = ticks(0.3);

/** A pistol holder hit while idle gets a small flinch offset instead of the (rifle-drawn) hit clip. */
export const flinch = (u: Unit, t: number) => (u.hp > 0 && t - u.lastHitTick < HIT_TICKS ? 1 - (t - u.lastHitTick) / HIT_TICKS : 0);

export interface Pose { action: ActionId; frameIndex: number; contract: SpriteContract; frame: Frame }

const progress = (t: number, start: number, end: number) => (end > start ? (t - start) / (end - start) : 1);

/** `t` is the fractional render tick (sim tick + interpolation). */
export function poseFor(u: Unit, t: number, sprites: ActorSprites): Pose {
    const pick = (action: ActionId, frameIndex: number): Pose => {
        const contract = sprites.actions[action];
        const i = Math.max(0, Math.min(contract.frameCount - 1, frameIndex));
        return { action, frameIndex: i, contract, frame: contract.frames[i] };
    };
    const at = (action: ActionId, p: number) => pick(action, frameAtProgress(sprites.actions[action], p));
    const a = u.action;
    const pistol = u.active === 'secondary';

    if (u.hp <= 0 || a.kind === 'down') return at('down', a.kind === 'down' ? progress(t, a.start, a.start + DOWN_TICKS) : 1);
    switch (a.kind) {
        case 'swap': return at(a.to === 'secondary' ? 'swap-to-secondary' : 'swap-to-primary', progress(t, a.start, a.end));
        case 'reload': return at('reload', progress(t, a.start, a.end));
        case 'enter-cover': return at('enter-cover', progress(t, a.start, a.end));
        case 'retract': return at('exit-cover', progress(t, a.start, a.end));
        case 'aim': return a.peek ? at('peek', progress(t, a.start, a.end)) : at(pistol ? 'pistol-fire' : 'fire', 0);
        case 'fire': return at(a.slot === 'secondary' ? 'pistol-fire' : 'fire', progress(t, a.start, a.end));
        case 'move': return pick('move', frameAtDistance(sprites.actions.move, u.walked, GAIT_STRIDE_TILES));
    }
    // Idle: brief hit reaction, then the held pose for the current posture and committed weapon.
    // The hit clip is drawn holding the rifle, so a pistol holder keeps the pistol pose (the view adds a flinch).
    if (pistol) return at('pistol-fire', 0);
    if (t - u.lastHitTick < HIT_TICKS) return at('hit', progress(t, u.lastHitTick, u.lastHitTick + HIT_TICKS));
    if (u.posture === 'peeked') return at('peek', 1);
    if (u.posture === 'covered') return at('enter-cover', 1);
    return pick('idle', frameAtClock(sprites.actions.idle, (t / TICKS_PER_SECOND) * 1000));
}
