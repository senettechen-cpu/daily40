import type { Stance } from '../../../../shared/battle/turn';

// Stance icons delivered by GPT (handoff-assets/stance-icons-20260924-gpt-v1),
// inlined so currentColor inherits the button's text colour. Loading them as
// <img> would cut that inheritance and leave every icon the same shade.
//
// The outlines are expanded fills, not strokes: adding one would thicken the
// line and eat the 16px inner space GPT designed around.

interface StanceArt { label: string; evenOdd: boolean; d: string }

export const STANCE_ART: Record<Stance, StanceArt> = {
    hold: { label: '固守', evenOdd: true, d: 'M12 2.5a1 1 0 0 1 .35.06l8 3A1 1 0 0 1 21 6.5V12c0 4.47-3.28 7.76-8.6 10.02a1 1 0 0 1-.8 0C6.28 19.76 3 16.47 3 12V6.5a1 1 0 0 1 .65-.94l8-3a1 1 0 0 1 .35-.06Zm0 2.07L5 7.19V12c0 3.35 2.43 6.06 7 8.01 4.57-1.95 7-4.66 7-8.01V7.19Z' },
    advance: { label: '推進', evenOdd: false, d: 'M11 20V6.41l-4.29 4.3a1 1 0 0 1-1.42-1.42l6-6a1 1 0 0 1 1.42 0l6 6a1 1 0 0 1-1.42 1.42L13 6.41V20a1 1 0 0 1-2 0Z' },
    flank: { label: '側翼', evenOdd: false, d: 'M3 20v-7a7 7 0 0 1 7-7h7.59l-2.3-2.29a1 1 0 0 1 1.42-1.42l4 4a1 1 0 0 1 0 1.42l-4 4a1 1 0 0 1-1.42-1.42L17.59 8H10a5 5 0 0 0-5 5v7a1 1 0 0 1-2 0Z' },
    guard: { label: '護衛', evenOdd: true, d: 'M6 2a1 1 0 0 1 .45.11l4 2A1 1 0 0 1 11 5v5c0 2.91-1.72 5.26-4.49 6.86a1 1 0 0 1-1.02 0C2.72 15.26 1 12.91 1 10V5a1 1 0 0 1 .55-.89l4-2A1 1 0 0 1 6 2Zm0 2.12L3 5.62V10c0 1.89 1.08 3.54 3 4.82 1.92-1.28 3-2.93 3-4.82V5.62ZM18 7a1 1 0 0 1 .45.11l4 2A1 1 0 0 1 23 10v5c0 2.91-1.72 5.26-4.49 6.86a1 1 0 0 1-1.02 0C14.72 20.26 13 17.91 13 15v-5a1 1 0 0 1 .55-.89l4-2A1 1 0 0 1 18 7Zm0 2.12-3 1.5V15c0 1.89 1.08 3.54 3 4.82 1.92-1.28 3-2.93 3-4.82v-4.38Z' },
};

/**
 * Decorative by itself: the shape alone is not a label, so every control that
 * uses it keeps the Chinese name or an accessible label beside it.
 */
export function StanceIcon({ stance, size = 16 }: { stance: Stance; size?: number }) {
    const art = STANCE_ART[stance];
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false">
            <path d={art.d} fillRule={art.evenOdd ? 'evenodd' : undefined} clipRule={art.evenOdd ? 'evenodd' : undefined} />
        </svg>
    );
}
