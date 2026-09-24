import { COVER, HEIGHT, WALLS, WIDTH } from '../../expedition/engine';
import type { UnitSnap } from '../report/report';
import type { BattleEvent } from '../sim/engine';

// A schematic, not a second renderer: it explains who stood where and what the
// selected event did. Geometry only, read from the live map constants so there
// is never a second copy of the terrain to drift out of step.

const CELL = 34;
const PAD = 16;
const W = WIDTH * CELL + PAD * 2;
const H = HEIGHT * CELL + PAD * 2;

const at = (x: number, y: number) => ({ cx: PAD + (x + 0.5) * CELL, cy: PAD + (y + 0.5) * CELL });

type Shot = Extract<BattleEvent, { kind: 'shot' }>;

const SHOT_STYLE: Record<Shot['outcome'], { dash: string; label: string }> = {
    hit: { dash: '', label: '命中' },
    cover: { dash: '10 6', label: '掩體攔截' },
    miss: { dash: '2 5', label: '未中' },
};

export interface TacticalMapProps {
    /** Positions at the tick being viewed, or null when that tick has no snapshot. */
    snaps: UnitSnap[] | null;
    names: Record<string, string>;
    shot: Shot | null;
    tick: number;
}

export function TacticalMap({ snaps, names, shot, tick }: TacticalMapProps) {
    if (!snaps) {
        return <p className="bt-hint">此事件無位置快照，不顯示推測位置。</p>;
    }

    // Stable per-side labels so a marker is identifiable without colour.
    const labels = new Map<string, string>();
    let crew = 0;
    let enemy = 0;
    for (const snap of snaps) {
        labels.set(snap.id, snap.side === 'crew' ? `A${++crew}` : `E${++enemy}`);
    }

    return (
        <div className="bt-tactical">
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
                aria-label={`第 ${tick} tick 的俯視戰術圖`}>
                <rect x={0} y={0} width={W} height={H} fill="#0b0f0d" />

                {Array.from({ length: WIDTH + 1 }, (_, i) => (
                    <line key={`v${i}`} x1={PAD + i * CELL} y1={PAD} x2={PAD + i * CELL} y2={H - PAD} stroke="#2a3330" strokeWidth={1} />
                ))}
                {Array.from({ length: HEIGHT + 1 }, (_, i) => (
                    <line key={`h${i}`} x1={PAD} y1={PAD + i * CELL} x2={W - PAD} y2={PAD + i * CELL} stroke="#2a3330" strokeWidth={1} />
                ))}

                {WALLS.map((wall, i) => (
                    <g key={`w${i}`}>
                        <rect x={PAD + wall.x * CELL} y={PAD + wall.y * CELL} width={CELL} height={CELL}
                            fill="#3a3a38" stroke="#6b6b66" strokeWidth={2} />
                        <line x1={PAD + wall.x * CELL} y1={PAD + wall.y * CELL} x2={PAD + (wall.x + 1) * CELL} y2={PAD + (wall.y + 1) * CELL} stroke="#6b6b66" strokeWidth={1} />
                        <line x1={PAD + (wall.x + 1) * CELL} y1={PAD + wall.y * CELL} x2={PAD + wall.x * CELL} y2={PAD + (wall.y + 1) * CELL} stroke="#6b6b66" strokeWidth={1} />
                        <text x={PAD + wall.x * CELL + 3} y={PAD + wall.y * CELL + 11} fill="#9a9a94" fontSize={9}>W{i + 1}</text>
                    </g>
                ))}

                {COVER.map((cover, i) => (
                    <g key={`c${i}`}>
                        <rect x={PAD + cover.x * CELL + 3} y={PAD + cover.y * CELL + 9} width={CELL - 6} height={CELL - 18}
                            rx={4} fill="#5c5037" stroke="#8d7c55" strokeWidth={1} />
                        <text x={PAD + cover.x * CELL + 5} y={PAD + cover.y * CELL + 11} fill="#c2ad7a" fontSize={9}>C{i + 1}</text>
                    </g>
                ))}

                {shot && (() => {
                    const from = snaps.find(s => s.id === shot.sourceId);
                    const to = snaps.find(s => s.id === shot.targetId);
                    if (!from || !to) return null;
                    const a = at(from.pos.x, from.pos.y);
                    const b = at(to.pos.x, to.pos.y);
                    const style = SHOT_STYLE[shot.outcome];
                    return (
                        <g>
                            <line x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} stroke="#e8e2d0" strokeWidth={1.5} strokeDasharray={style.dash} opacity={0.85} />
                            {shot.outcome === 'hit' && <circle cx={b.cx} cy={b.cy} r={4} fill="#e8e2d0" />}
                            {shot.outcome === 'cover' && <rect x={b.cx - 4} y={b.cy - 4} width={8} height={8} fill="#e8e2d0" />}
                            {shot.outcome === 'miss' && <circle cx={b.cx} cy={b.cy} r={4} fill="none" stroke="#e8e2d0" strokeWidth={1.5} />}
                            <circle cx={a.cx} cy={a.cy} r={15} fill="none" stroke="#e0b64a" strokeWidth={2} />
                            <rect x={b.cx - 15} y={b.cy - 15} width={30} height={30} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeDasharray="6 4" />
                        </g>
                    );
                })()}

                {snaps.map(snap => {
                    const { cx, cy } = at(snap.pos.x, snap.pos.y);
                    const down = snap.hp <= 0;
                    const colour = snap.side === 'crew' ? (down ? '#3f6a6a' : '#4fd1d1') : (down ? '#6a3f3f' : '#e05a5a');
                    return (
                        <g key={snap.id} opacity={down ? 0.55 : 1}>
                            {snap.side === 'crew'
                                ? <circle cx={cx} cy={cy} r={9} fill={colour} stroke="#0b0f0d" strokeWidth={1.5} />
                                : <rect x={cx - 8} y={cy - 8} width={16} height={16} transform={`rotate(45 ${cx} ${cy})`} fill={colour} stroke="#0b0f0d" strokeWidth={1.5} />}
                            {down && (
                                <g stroke="#0b0f0d" strokeWidth={2}>
                                    <line x1={cx - 5} y1={cy - 5} x2={cx + 5} y2={cy + 5} />
                                    <line x1={cx + 5} y1={cy - 5} x2={cx - 5} y2={cy + 5} />
                                </g>
                            )}
                            <text x={cx} y={cy - 13} fill="#d8d2c0" fontSize={10} textAnchor="middle">{labels.get(snap.id)}</text>
                        </g>
                    );
                })}
            </svg>

            <ul className="bt-tactical-legend">
                <li>● 我方（A）</li>
                <li>◆ 敵方（E）</li>
                <li>✕ 倒地（留在原位）</li>
                <li>—— 命中</li>
                <li>– – 掩體攔截</li>
                <li>· · · 未中</li>
                <li>端點為目標位置，非實際彈著點</li>
            </ul>

            <ul className="bt-tactical-units">
                {snaps.map(snap => (
                    <li key={snap.id} className={snap.hp <= 0 ? 'is-down' : ''}>
                        <b>{labels.get(snap.id)}</b> {names[snap.id] ?? snap.id}
                        {snap.hp <= 0 ? ' · 倒地' : ` · ${snap.hp} HP`}
                    </li>
                ))}
            </ul>
        </div>
    );
}
