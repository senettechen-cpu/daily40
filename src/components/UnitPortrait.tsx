import { CSSProperties } from 'react';
import { UNIT_VISUALS } from '../data/unitVisuals';

export function UnitEmblem({ unit, size = 24 }: { unit: keyof typeof UNIT_VISUALS; size?: number }) {
    const { sigil } = UNIT_VISUALS[unit];
    return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M20 2 35 10v15L20 38 5 25V10Z" opacity=".45" />
        {sigil === 'ship' ? <path d="m20 7 4 12 8 6-10-2-2 9-2-9-10 2 8-6Z" />
            : sigil === 'crown' ? <path d="m10 14 6 6 4-10 4 10 6-6-3 14H13ZM13 31h14" />
            : sigil === 'flame' ? <path d="M21 8c3 8-4 9 2 14l5-6c7 17-18 20-16 7 1-6 7-8 9-15Z" />
            : sigil === 'fang' ? <path d="m10 12 6 6 4-10 4 10 6-6-6 17-4 4-4-4ZM16 23h8" />
            : sigil === 'star' ? <path d="m20 7 3 10 10 3-10 3-3 10-3-10-10-3 10-3Z" />
            : sigil === 'machine' ? <><path d="M12 14h16v15H12ZM8 18h4m16 0h4M8 25h4m16 0h4M17 9v5m6-5v5" /><circle cx="20" cy="22" r="3" /></>
            : sigil === 'line' ? <path d="m12 14 8 5 8-5m-16 7 8 5 8-5m-8 5v7" />
            : <path d="M12 12h16v11l-8 8-8-8ZM20 14v13m-5-8h10" />}
    </svg>;
}

export function UnitPortrait({ unit, compact = false }: { unit: keyof typeof UNIT_VISUALS; compact?: boolean }) {
    const visual = UNIT_VISUALS[unit];
    return <div className={`unit-portrait ${compact ? 'unit-portrait--compact' : ''} unit-portrait--${unit}`} style={{ '--unit-color': visual.color } as CSSProperties}>
        {visual.image ? <img src={visual.image} alt={visual.name} loading="lazy" decoding="async" /> :
            <svg viewBox="0 0 400 300" className="barge-blueprint" role="img" aria-label="戰鬥駁船軌道戰艦圖">
                <g fill="none" stroke="currentColor" strokeWidth="1">
                    <ellipse cx="200" cy="160" rx="170" ry="80" opacity=".2" /><ellipse cx="200" cy="160" rx="145" ry="100" opacity=".15" />
                    <path d="M20 160h360M200 30v250" strokeDasharray="3 7" opacity=".25" />
                </g>
                <g fill="#172d39" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                    <path d="m65 178 42-35 50 6 79-37 84 16 37 26-96 51-79-3-46 17-51-12Z" />
                    <path d="m127 169 116-44 67 8-114 57Z" fill="#274354" />
                    <path d="m215 144 0-31 12-11 12 7v24m-33 14V98l12-14 10 8v43m-33 19v-25l11-10" />
                    <path d="m103 179 23-12v30l-23 12Zm37 4 14-7v27l-14 7Zm30-4 14-7v29l-14 7ZM266 159l31-14m-17 29 29-15" />
                    <path d="m75 181 13 7-13 9-17-6Z" fill="#88c5cf" />
                </g>
                <g fill="currentColor"><circle cx="248" cy="165" r="2" /><circle cx="260" cy="160" r="2" /><circle cx="272" cy="155" r="2" /></g>
            </svg>}
        <span className="unit-portrait__emblem"><UnitEmblem unit={unit} size={compact ? 20 : 32} /></span>
        {!compact && <span className="unit-portrait__caption">{visual.role}</span>}
    </div>;
}
