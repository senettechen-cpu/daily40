import type { Board, Hex } from '../../../shared/battle/hex';
import { terrainAt } from '../../../shared/battle/hex';

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

export function HexMap({ board, snapshot, names, sides, acting }: {
    board: Board;
    snapshot: Snap[];
    names: Map<string, string>;
    sides: Map<string, 'crew' | 'enemy'>;
    acting?: string;
}) {
    const width = HEX_W * (board.cols + 0.5);
    const height = ROW_STEP * (board.rows - 1) + HEX_H;
    const tiles = Array.from({ length: board.rows }).flatMap((_, row) =>
        Array.from({ length: board.cols }).map((__, col) => ({ col, row })));

    return (
        <svg
            className="hex-map"
            viewBox={`0 0 ${width.toFixed(0)} ${height.toFixed(0)}`}
            role="img"
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

            {snapshot.map(unit => {
                const { x, y } = centre(unit.at);
                const mine = sides.get(unit.id) === 'crew';
                const colour = unit.down ? '#4a5563' : mine ? '#7fd6a4' : '#e08a76';
                return (
                    <g key={unit.id} opacity={unit.down ? 0.5 : 1}>
                        <circle cx={x} cy={y - 6} r={HEX_W * 0.26} fill={colour}
                            stroke={unit.id === acting ? '#dfbc72' : '#0b1118'}
                            strokeWidth={unit.id === acting ? 5 : 3} />
                        <text x={x} y={y + 2} textAnchor="middle" fontSize={22} fill="#0b1118" fontWeight="bold">
                            {unit.down ? '×' : (names.get(unit.id) ?? '?').slice(0, 1)}
                        </text>
                        {!unit.down && (
                            <text x={x} y={y + HEX_H * 0.34} textAnchor="middle" fontSize={16} fill="#e6eef6"
                                style={{ paintOrder: 'stroke' }} stroke="#0b111a" strokeWidth={4}>
                                {unit.hp}
                            </text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
