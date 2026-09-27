import { useEffect, useRef, useState } from 'react';
import type { Board, Hex } from '../../../shared/battle/hex';
import type { Objective } from '../../../shared/battle/turn';
import { neighbours, terrainAt } from '../../../shared/battle/hex';
import { portraitHead } from '../../data/reportArtIndex';
import type { ReactNode } from 'react';

// A flat drawing of the hex board. It shows the state after the activation the
// reader is on, so the picture always matches the line of text beside it.
//
// Pointy-top hexes in an odd-r layout: odd rows are pushed half a tile right,
// which is the same offset the coordinates use, so col/row maps straight to the
// screen without a lookup table.

/** The walkable hex, which is what the engine measures and what the art draws. */
const HEX_W = 90;
const HEX_H = 104;
/** GPT's tile carries 3px of bleed around that hex so neighbours never seam. */
const TILE_W = 96;
const TILE_H = 112;
const ROW_STEP = HEX_H * 0.75;

const ART = `${import.meta.env.BASE_URL}battle-assets/hex/`;
const TERRAIN_ART: Record<string, string> = {
    open: 'hex-open', cover: 'hex-cover', high: 'hex-high', block: 'hex-block', hazard: 'hex-hazard',
};

/** Drawn under the art: a base colour, and the whole picture if a tile fails to load. */
const TERRAIN_FILL: Record<string, string> = {
    open: '#16202c', cover: '#24313d', high: '#2c3a2c', block: '#0a0f16', hazard: '#3a2430',
};

const centre = (hex: Hex) => ({
    x: HEX_W * (hex.col + (hex.row & 1 ? 0.5 : 0)) + HEX_W / 2,
    y: ROW_STEP * hex.row + HEX_H / 2,
});

const corners = (cx: number, cy: number) => Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${(cx + (HEX_W / 2) * Math.cos(angle) * 1.1547).toFixed(1)},${(cy + (HEX_H / 2) * Math.sin(angle)).toFixed(1)}`;
}).join(' ');

export interface Snap { id: string; at: Hex; hp: number; down: boolean }


export function HexMap({ board, snapshot, names, sides, faces, acting, objective, barrage, effects, selected, onSelect, maxHp }: {
    effects?: ReactNode;
    selected?: string;
    onSelect?: (id: string) => void;
    maxHp?: Map<string, number>;
    board: Board;
    /** A barrage marked and not yet landed: drawn so the squad's dodge makes sense. */
    barrage?: Hex | null;
    /** Marked on the map so the report shows what the squad was going for. */
    objective?: Objective;
    snapshot: Snap[];
    names: Map<string, string>;
    sides: Map<string, 'crew' | 'enemy'>;
    /** Portrait id per unit; a unit with no art keeps the lettered token. */
    faces?: Map<string, string | undefined>;
    acting?: string;
}) {
    const TOKEN = HEX_W * 0.32;
    const width = HEX_W * (board.cols + 0.5);
    const height = ROW_STEP * (board.rows - 1) + HEX_H;
    const tiles = Array.from({ length: board.rows }).flatMap((_, row) =>
        Array.from({ length: board.cols }).map((__, col) => ({ col, row })));

    // On a phone the whole board squeezed to ~345px, a third of its drawn size,
    // and tokens and health became hard to read. There the map is drawn wider
    // than the screen inside a sideways scroller (see .hex-map-wrap), with a
    // toggle back to the whole-board view.
    const [fit, setFit] = useState(false);
    const wrap = useRef<HTMLDivElement>(null);

    // Keep whoever is acting in view, so stepping through the report never
    // leaves the reader hunting for the unit the text is talking about.
    const actingUnit = snapshot.find(unit => unit.id === acting);
    const actingX = actingUnit ? centre(actingUnit.at).x : null;
    useEffect(() => {
        const el = wrap.current;
        if (!el || actingX === null || el.scrollWidth <= el.clientWidth) return;
        const left = (actingX / width) * el.scrollWidth - el.clientWidth / 2;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        el.scrollTo({ left: Math.max(0, left), behavior: reduce ? 'auto' : 'smooth' });
    }, [actingX, width, fit]);

    return (
        <div className={`hex-map-frame${fit ? ' is-fit' : ''}`}>
        <button type="button" className="hex-map-zoom" onClick={() => setFit(value => !value)} aria-pressed={!fit}>
            {fit ? '放大地圖' : '看全圖'}
        </button>
        <div className="hex-map-wrap" ref={wrap}>
        <svg
            className="hex-map"
            viewBox={`0 0 ${width.toFixed(0)} ${height.toFixed(0)}`}
            role="group"
            aria-label={`戰場俯視圖，我方 ${snapshot.filter(s => sides.get(s.id) === 'crew' && !s.down).length} 人存活`}
        >
            {tiles.map(hex => {
                const { x, y } = centre(hex);
                const terrain = terrainAt(board, hex);
                return (
                    <polygon key={`b${hex.col},${hex.row}`} points={corners(x, y)}
                        fill={TERRAIN_FILL[terrain] ?? TERRAIN_FILL.open} stroke="none" />
                );
            })}

            {/* The 2x file at 1x size: five images for the whole board, and crisp
                on a dense screen. The tile is placed by its centre because the
                bleed sits outside the hex the engine knows about. */}
            {tiles.map(hex => {
                const { x, y } = centre(hex);
                const art = TERRAIN_ART[terrainAt(board, hex)];
                if (!art) return null;
                return (
                    <image
                        key={`a${hex.col},${hex.row}`}
                        href={`${ART}${art}-192.webp`}
                        x={x - TILE_W / 2}
                        y={y - TILE_H / 2}
                        width={TILE_W}
                        height={TILE_H}
                        opacity={0.72}
                    />
                );
            })}

            {tiles.map(hex => {
                const { x, y } = centre(hex);
                return (
                    <polygon key={`g${hex.col},${hex.row}`} points={corners(x, y)}
                        fill="none" stroke="#2f3f4f" strokeWidth={1} opacity={0.5} />
                );
            })}

            {/* Terrain is marked as well as drawn: the art distinguishes the five,
                but shape and colour alone are not a difference everyone can read. */}
            {tiles.map(hex => {
                const terrain = terrainAt(board, hex);
                if (terrain === 'open' || terrain === 'block') return null;
                const { x, y } = centre(hex);
                const mark = terrain === 'cover' ? '▢' : terrain === 'high' ? '▲' : '☣';
                return (
                    <text key={`m${hex.col},${hex.row}`} x={x} y={y + HEX_H * 0.42} textAnchor="middle"
                        fontSize={18} fill="#cfe0f0" opacity={0.75}
                        style={{ paintOrder: 'stroke' }} stroke="#0b111a" strokeWidth={3}>{mark}</text>
                );
            })}

            {/* The tile to take or reach, drawn under the tokens. */}
            {objective && (objective.kind === 'seize' || objective.kind === 'rescue') && (() => {
                const { x, y } = centre(objective.at);
                return (
                    <g>
                        <polygon points={corners(x, y)} fill="#dfbc72" fillOpacity={0.14} stroke="#dfbc72" strokeWidth={4} />
                        <text x={x} y={y - HEX_H * 0.28} textAnchor="middle" fontSize={16} fontWeight="bold" fill="#dfbc72"
                            style={{ paintOrder: 'stroke' }} stroke="#0b111a" strokeWidth={4}>
                            {objective.kind === 'seize' ? '佔領' : '救援'}
                        </text>
                    </g>
                );
            })()}

            {barrage && (() => {
                const { x, y } = centre(barrage);
                return (
                    <g>
                        {[barrage, ...neighbours(barrage)].map((hex, i) => {
                            const c = centre(hex);
                            return <polygon key={i} points={corners(c.x, c.y)} fill="#e0503c" fillOpacity={0.12} stroke="#e0503c" strokeWidth={2} strokeDasharray="8 6" />;
                        })}
                        <text x={x} y={y - HEX_H * 0.28} textAnchor="middle" fontSize={16} fontWeight="bold" fill="#ff8a78"
                            style={{ paintOrder: 'stroke' }} stroke="#0b111a" strokeWidth={4}>轟擊</text>
                    </g>
                );
            })()}

            <defs>
                {snapshot.map(unit => (
                    <clipPath key={`c${unit.id}`} id={`token-${unit.id}`}>
                        <circle cx={centre(unit.at).x} cy={centre(unit.at).y - 6} r={TOKEN} />
                    </clipPath>
                ))}
            </defs>

            {snapshot.map(unit => {
                const { x, y } = centre(unit.at);
                const mine = sides.get(unit.id) === 'crew';
                const colour = unit.down ? '#4a5563' : mine ? '#7fd6a4' : '#e08a76';
                const face = unit.down ? null : portraitHead(faces?.get(unit.id));
                return (
                    <g key={unit.id} opacity={unit.down ? 0.5 : 1} role={onSelect ? 'button' : undefined}
                        tabIndex={onSelect ? 0 : undefined} aria-label={`${names.get(unit.id)} · ${mine ? '我方' : '敵方'} · ${unit.down ? '倒地' : `${unit.hp} HP`}`}
                        onClick={() => onSelect?.(unit.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(unit.id); } }}
                        className="hex-unit">
                        {selected === unit.id && <circle cx={x} cy={y - 6} r={TOKEN + 8} fill="none" stroke="#fff1c1" strokeWidth={2} strokeDasharray="4 4" />}
                        <circle cx={x} cy={y - 6} r={TOKEN} fill={colour}
                            stroke={unit.id === acting ? '#dfbc72' : '#0b1118'}
                            strokeWidth={unit.id === acting ? 5 : 3} />
                        {face
                            ? (
                                <>
                                    <image href={face} x={x - TOKEN} y={y - 6 - TOKEN} width={TOKEN * 2} height={TOKEN * 2}
                                        clipPath={`url(#token-${unit.id})`} preserveAspectRatio="xMidYMid slice" />
                                    {/* The ring is the side, so it is redrawn over the face. */}
                                    <circle cx={x} cy={y - 6} r={TOKEN} fill="none" stroke={colour} strokeWidth={4} />
                                    <circle cx={x} cy={y - 6} r={TOKEN} fill="none"
                                        stroke={unit.id === acting ? '#dfbc72' : '#0b1118'}
                                        strokeWidth={unit.id === acting ? 4 : 2} />
                                </>
                            )
                            : (
                                <text x={x} y={y + 2} textAnchor="middle" fontSize={22} fill="#0b1118" fontWeight="bold">
                                    {unit.down ? '×' : (names.get(unit.id) ?? '?').slice(0, 1)}
                                </text>
                            )}
                        <text x={x - TOKEN - 2} y={y - TOKEN - 3} fill={colour} fontSize={16} stroke="#07111a" strokeWidth={3} style={{ paintOrder: 'stroke' }}>{mine ? '◆' : '◇'}</text>
                        {/* The assassination target carries a red sight until they fall. */}
                        {!unit.down && objective?.kind === 'assassinate' && objective.targetId === unit.id && (
                            <g stroke="#e0503c" strokeWidth={3} fill="none">
                                <circle cx={x} cy={y - 6} r={TOKEN + 7} />
                                <line x1={x - TOKEN - 12} y1={y - 6} x2={x - TOKEN - 2} y2={y - 6} />
                                <line x1={x + TOKEN + 2} y1={y - 6} x2={x + TOKEN + 12} y2={y - 6} />
                            </g>
                        )}
                        {!unit.down && (
                            <text x={x} y={y + 47} textAnchor="middle" fontSize={17} fontWeight="bold" fill="#e6eef6"
                                style={{ paintOrder: 'stroke' }} stroke="#0b111a" strokeWidth={5}>
                                {unit.hp}
                            </text>
                        )}
                        {!unit.down && maxHp && <g><rect x={x - 24} y={y + 28} width={48} height={4} rx={2} fill="#060c12" />
                            <rect x={x - 24} y={y + 28} width={48 * Math.max(0, Math.min(1, unit.hp / (maxHp.get(unit.id) || 1)))} height={4} rx={2} fill={colour} /></g>}
                    </g>
                );
            })}
            {effects}
        </svg>
        </div>
        </div>
    );
}
