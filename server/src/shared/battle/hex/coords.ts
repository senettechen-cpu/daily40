// Hex geometry for the v2 battlefield. Tiles are authored and stored as offset
// (col, row) so a map stays a readable rectangle, and converted to cube
// coordinates for anything geometric, where the maths is exact and cheap.
//
// Layout: pointy-top hexes, odd rows pushed half a tile right ("odd-r").

export interface Hex { col: number; row: number }
export interface Cube { x: number; y: number; z: number }

export const sameHex = (a: Hex, b: Hex) => a.col === b.col && a.row === b.row;
export const hexKey = (hex: Hex) => `${hex.col},${hex.row}`;

export function toCube(hex: Hex): Cube {
    const x = hex.col - (hex.row - (hex.row & 1)) / 2;
    const z = hex.row;
    return { x, y: -x - z, z };
}

export function fromCube(cube: Cube): Hex {
    return { col: cube.x + (cube.z - (cube.z & 1)) / 2, row: cube.z };
}

export function distance(a: Hex, b: Hex): number {
    const p = toCube(a);
    const q = toCube(b);
    return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y), Math.abs(p.z - q.z));
}

/** The six directions, as cube offsets, in a fixed order so paths are stable. */
const DIRECTIONS: Cube[] = [
    { x: 1, y: -1, z: 0 }, { x: 1, y: 0, z: -1 }, { x: 0, y: 1, z: -1 },
    { x: -1, y: 1, z: 0 }, { x: -1, y: 0, z: 1 }, { x: 0, y: -1, z: 1 },
];

export function neighbours(hex: Hex): Hex[] {
    const cube = toCube(hex);
    return DIRECTIONS.map(d => fromCube({ x: cube.x + d.x, y: cube.y + d.y, z: cube.z + d.z }));
}

export const areAdjacent = (a: Hex, b: Hex) => distance(a, b) === 1;

/** Every hex within `range` of the centre, the centre included. */
export function withinRange(centre: Hex, range: number): Hex[] {
    const result: Hex[] = [];
    const c = toCube(centre);
    for (let x = -range; x <= range; x += 1) {
        for (let y = Math.max(-range, -x - range); y <= Math.min(range, -x + range); y += 1) {
            result.push(fromCube({ x: c.x + x, y: c.y + y, z: c.z - x - y }));
        }
    }
    return result;
}

const roundCube = (x: number, y: number, z: number): Cube => {
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return { x: rx, y: ry, z: rz };
};

/**
 * The hexes a straight line from `a` to `b` passes through, both ends included.
 * Used for line of sight, so it must be symmetric: the nudge below keeps a line
 * that grazes an edge from resolving differently depending on which end asked.
 */
export function lineBetween(a: Hex, b: Hex): Hex[] {
    const steps = distance(a, b);
    if (steps === 0) return [a];
    const p = toCube(a);
    const q = toCube(b);
    const nudge = 1e-6;
    const line: Hex[] = [];
    for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        line.push(fromCube(roundCube(
            p.x + (q.x - p.x) * t + nudge,
            p.y + (q.y - p.y) * t + nudge,
            p.z + (q.z - p.z) * t - 2 * nudge,
        )));
    }
    return line;
}
