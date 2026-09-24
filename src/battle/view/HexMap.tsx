import type { Board, Hex } from '../../../shared/battle/hex';
import { terrainAt } from '../../../shared/battle/hex';

// A flat drawing of the hex board. It shows the state after the activation the
// reader is on, so the picture always matches the line of text beside it.
//
// Pointy-top hexes in an odd-r layout: odd rows are pushed half a tile right,
// which is the same offset the coordinates use, so col/row maps straight to the
// screen without a lookup table.

const SIZE = 26; // centre to corner
const W = Math.sqrt(3) * SIZE;
const H = 2 * SIZE;
const ROW_STEP = H * 0.75;

const TERRAIN_FILL: Record<string, string> = {
    open: '#16202c',
    cover: '#24313d',
    high: '#2c3a2c',
    block: '#0a0f16',
    hazard: '#3a2430',
};

const centre = (hex: Hex) => ({
    x: W * (hex.col + (hex.row & 1 ? 0.5 : 0)) + W / 2,
    y: ROW_STEP * hex.row + H / 2,
});

const corners = (cx: number, cy: number) => Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${(cx + SIZE * Math.cos(angle)).toFixed(1)},${(cy + SIZE * Math.sin(angle)).toFixed(1)}`;
}).join(' ');

export interface Snap { id: string; at: Hex; hp: number; down: boolean }

export function HexMap({ board, snapshot, names, sides, acting }: {
    board: Board;
    snapshot: Snap[];
    names: Map<string, string>;
    sides: Map<string, 'crew' | 'enemy'>;
    acting?: string;
}) {
    const width = W * (board.cols + 0.5);
    const height = ROW_STEP * (board.rows - 1) + H;

    return (
        <svg
            className="hex-map"
            viewBox={`0 0 ${width.toFixed(0)} ${height.toFixed(0)}`}
            role="img"
            aria-label={`戰場俯視圖，我方 ${snapshot.filter(s => sides.get(s.id) === 'crew' && !s.down).length} 人存活`}
        >
            {Array.from({ length: board.rows }).map((_, row) =>
                Array.from({ length: board.cols }).map((__, col) => {
                    const hex = { col, row };
                    const { x, y } = centre(hex);
                    const terrain = terrainAt(board, hex);
                    return (
                        <polygon
                            key={`${col},${row}`}
                            points={corners(x, y)}
                            fill={TERRAIN_FILL[terrain] ?? TERRAIN_FILL.open}
                            stroke="#2f3f4f"
                            strokeWidth={1}
                        />
                    );
                }))}

            {/* High ground and hazard are marked as well as tinted: colour alone
                is not a readable difference for everyone. */}
            {Array.from({ length: board.rows }).map((_, row) =>
                Array.from({ length: board.cols }).map((__, col) => {
                    const terrain = terrainAt(board, { col, row });
                    if (terrain === 'open' || terrain === 'block') return null;
                    const { x, y } = centre({ col, row });
                    const mark = terrain === 'cover' ? '▢' : terrain === 'high' ? '▲' : '☣';
                    return (
                        <text key={`m${col},${row}`} x={x} y={y + SIZE * 0.55} textAnchor="middle"
                            fontSize={11} fill="#6d8296">{mark}</text>
                    );
                }))}

            {snapshot.map(unit => {
                const { x, y } = centre(unit.at);
                const mine = sides.get(unit.id) === 'crew';
                const colour = unit.down ? '#4a5563' : mine ? '#7fd6a4' : '#e08a76';
                return (
                    <g key={unit.id} opacity={unit.down ? 0.45 : 1}>
                        <circle cx={x} cy={y - 3} r={SIZE * 0.42} fill={colour}
                            stroke={unit.id === acting ? '#dfbc72' : '#0b1118'}
                            strokeWidth={unit.id === acting ? 3 : 1.5} />
                        <text x={x} y={y + 1} textAnchor="middle" fontSize={11} fill="#0b1118" fontWeight="bold">
                            {unit.down ? '×' : (names.get(unit.id) ?? '?').slice(0, 1)}
                        </text>
                        {!unit.down && (
                            <text x={x} y={y + SIZE * 0.78} textAnchor="middle" fontSize={9} fill="#b9c8d6">
                                {unit.hp}
                            </text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
