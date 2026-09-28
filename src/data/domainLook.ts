import { Domain } from '../../shared/ascension';

/**
 * One colour per growth domain (2026-09-28). Every domain used to be the same
 * emerald tag and the radar still coloured its blips by the retired enemy
 * faction, so a glance told you nothing about what kind of thing a task was.
 *
 * Typed as a full Record, so adding a domain to shared/ascension fails the build
 * here until it is given a colour rather than silently falling back to grey.
 * `hex` is for canvas and SVG; the classes are for the table and card tags.
 */
export interface DomainLook {
    /** Used where a class will not do: radar blips, gradients, shadows. */
    hex: string;
    text: string;
    border: string;
    bg: string;
    /** Centre of this domain's sector on the radar, in degrees. */
    angle: number;
}

export const DOMAIN_LOOK: Record<Domain, DomainLook> = {
    health: { hex: '#34d399', text: 'text-emerald-300', border: 'border-emerald-700/70', bg: 'bg-emerald-950/40', angle: 0 },
    learning: { hex: '#38bdf8', text: 'text-sky-300', border: 'border-sky-700/70', bg: 'bg-sky-950/40', angle: 60 },
    care: { hex: '#fbbf24', text: 'text-amber-300', border: 'border-amber-700/70', bg: 'bg-amber-950/40', angle: 120 },
    social: { hex: '#a78bfa', text: 'text-violet-300', border: 'border-violet-700/70', bg: 'bg-violet-950/40', angle: 180 },
    finance: { hex: '#fb7185', text: 'text-rose-300', border: 'border-rose-700/70', bg: 'bg-rose-950/40', angle: 240 },
};

/**
 * A task with no domain yet, in the one sector left over. Deliberately not the
 * imperial gold the radar used to paint everything: that is a hair from 工作's
 * amber, and "not sorted yet" should not look like a domain.
 */
export const UNSET_LOOK: DomainLook = {
    hex: '#71717a', text: 'text-zinc-500', border: 'border-zinc-700/60', bg: 'bg-zinc-900/40', angle: 300,
};

export const lookOf = (domain?: Domain | null): DomainLook =>
    (domain && DOMAIN_LOOK[domain]) || UNSET_LOOK;

/**
 * Where a task sits on the radar dial: its domain picks the sector, its id
 * spreads it within one. Both radars used to spread blips by the retired enemy
 * faction, which is 'default' on every task now, so the whole board piled into
 * a single wedge. The offset comes from the id rather than Math.random so a
 * blip stays put instead of jumping on every repaint.
 */
export const blipAngle = (domain: Domain | null | undefined, id: string): number => {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    // Within the sector, leaving a gap so neighbouring domains stay readable.
    return lookOf(domain).angle + (hash % 45) - 22;
};
