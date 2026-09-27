import type { CSSProperties } from 'react';
import type { Activation, DamageType } from '../../../shared/battle/turn/types';
import type { Hex } from '../../../shared/battle/hex';
import type { Snap } from './HexMap';

export const hexCentre = (h: Hex) => ({ x: 90 * (h.col + (h.row & 1 ? .5 : 0)) + 45, y: 78 * h.row + 46 });
const COLOURS: Record<DamageType, string> = { las: '#ff655b', ballistic: '#ffe4a0', bolt: '#ffb463', plasma: '#7ee8ff', flame: '#ff993e', melee: '#e5eaf1' };

/** Presentation only. The event contains the actual rolls; animation never rolls hits. */
export function WeaponEffects({ event, snapshot, speed, paused, reduced }: {
    event: Activation; snapshot: Snap[]; speed: number; paused: boolean; reduced: boolean;
}) {
    const source = snapshot.find(u => u.id === event.unitId);
    return <g className={`weapon-effects${reduced ? ' reduced' : ''}${paused ? ' paused' : ''}`}
        style={{ '--fx-duration': `${820 / speed}ms` } as CSSProperties} aria-hidden="true" pointerEvents="none">
        {event.activities.map((a, i) => {
            if (a.kind === 'attack' && source) {
                const target = snapshot.find(u => u.id === a.targetId);
                if (!target) return null;
                const p = hexCentre(source.at), q = hexCentre(target.at);
                const d = Math.max(1, Math.hypot(q.x - p.x, q.y - p.y));
                const start = { x: p.x + (q.x - p.x) / d * 31, y: p.y + (q.y - p.y) / d * 31 };
                const kind = a.damageType ?? 'ballistic';
                const colour = COLOURS[kind];
                const shots = a.shots ?? Array.from({ length: Math.max(1, a.hits) }, (_, n) => n < a.hits);
                return <g key={i}>
                    {shots.map((hit, n) => {
                        const end = hit ? q : { x: q.x + 40, y: q.y - 40 - n * 8 };
                        return <g key={n} className={`fx-shot fx-${kind}`} style={{ '--shot-delay': `${n * 70 / speed}ms` } as CSSProperties}>
                            {!reduced && <>
                                <circle className="fx-muzzle" cx={start.x} cy={start.y} r={kind === 'plasma' ? 10 : 6} fill={colour} />
                                {kind === 'melee'
                                    ? <path className="fx-ray" d={`M ${q.x - 30} ${q.y + 24} Q ${q.x + 10} ${q.y - 35} ${q.x + 30} ${q.y - 15}`} fill="none" stroke={colour} strokeWidth={6} />
                                    : <line className="fx-ray" x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                                        stroke={colour} strokeWidth={kind === 'flame' ? 15 : kind === 'plasma' ? 8 : kind === 'bolt' ? 5 : 3}
                                        strokeLinecap="round" strokeDasharray={kind === 'ballistic' ? '14 20' : kind === 'bolt' ? '9 38' : undefined} />}
                                {hit && <circle className="fx-impact" cx={q.x} cy={q.y} r={kind === 'bolt' || kind === 'plasma' ? 32 : 19} fill={colour} fillOpacity={.28} stroke={colour} strokeWidth={3} />}
                            </>}
                        </g>;
                    })}
                    <text className="fx-label" x={q.x} y={q.y - 45} textAnchor="middle" fill={a.hits ? '#fff0d0' : '#c5d4e4'}>{a.hits ? `命中 ${a.hits}` : '未命中'}</text>
                    {a.weaponSlot === 'sidearm' && <text className="fx-label" x={p.x} y={p.y - 42} textAnchor="middle" fill="#dfbc72">切換副武器</text>}
                </g>;
            }
            if (a.kind === 'barrage') {
                const p = hexCentre(a.at);
                return <g key={i}><circle className="fx-impact" cx={p.x} cy={p.y} r={95} fill="#ff973333" stroke="#ffc16d" strokeWidth={5} /><text className="fx-label" x={p.x} y={p.y - 45} textAnchor="middle" fill="#ffd9a1">轟擊</text></g>;
            }
            if (a.kind === 'heal' || a.kind === 'hazard') {
                const target = snapshot.find(u => u.id === a.targetId);
                if (!target) return null;
                const p = hexCentre(target.at);
                return <text key={i} className="fx-label" x={p.x} y={p.y - 44} textAnchor="middle" fill={a.kind === 'heal' ? '#8ff5b2' : '#ffaf7b'}>{a.kind === 'heal' ? `治療 +${a.amount}` : `地形 −${a.damage}`}</text>;
            }
            return null;
        })}
    </g>;
}
