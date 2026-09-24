import { Hex, distance, hexKey, lineBetween, neighbours, sameHex } from './coords';

// The board: what each tile is made of, what it costs to enter, what it blocks.
// Terrain is data, not behaviour — the engine asks these questions and never
// reaches into the tile list itself.

export type Terrain = 'open' | 'cover' | 'high' | 'block' | 'hazard';

export interface TerrainRule {
    /** Movement spent entering the tile. */
    cost: number;
    /** Nobody may stand here. */
    impassable?: boolean;
    /** Breaks line of sight through it. */
    opaque?: boolean;
    /** Entering it ends the move: you take the shelter or you keep running. */
    endsMovement?: boolean;
    /** Ranged damage taken here, as a multiplier. */
    incoming?: number;
    /** Added to this unit's range while standing here. */
    range?: number;
    /** Added to this unit's hit chance, in percentage points. */
    accuracy?: number;
    /** Damage suffered at the end of a round spent here. */
    attrition?: number;
}

export const TERRAIN: Record<Terrain, TerrainRule> = {
    open: { cost: 1 },
    cover: { cost: 1, endsMovement: true, incoming: 0.75 },
    high: { cost: 2, range: 1, accuracy: 10 },
    block: { cost: Infinity, impassable: true, opaque: true },
    hazard: { cost: 1, attrition: 5 },
};

export interface Board {
    cols: number;
    rows: number;
    /** Terrain by hexKey; anything absent is open ground. */
    tiles: Record<string, Terrain>;
}

export const terrainAt = (board: Board, hex: Hex): Terrain =>
    board.tiles[hexKey(hex)] ?? 'open';

export const ruleAt = (board: Board, hex: Hex): TerrainRule => TERRAIN[terrainAt(board, hex)];

export const onBoard = (board: Board, hex: Hex) =>
    hex.col >= 0 && hex.col < board.cols && hex.row >= 0 && hex.row < board.rows;

/** A tile nobody can stand on, whether because of terrain or the edge of the map. */
export const isBlocked = (board: Board, hex: Hex) =>
    !onBoard(board, hex) || !!ruleAt(board, hex).impassable;

/**
 * Whether `from` can see `to`. Only the tiles strictly between them matter: a
 * unit standing in a doorway can still be shot, and can still shoot out.
 */
export function hasLineOfSight(board: Board, from: Hex, to: Hex): boolean {
    const line = lineBetween(from, to);
    return !line.slice(1, -1).some(hex => ruleAt(board, hex).opaque);
}

export interface Occupancy {
    /** Tiles held by someone else; passable by nobody, including allies. */
    occupied: Hex[];
}

/**
 * Every tile reachable with `movement` points, with what it cost to get there.
 * A tile that ends movement can be entered but not moved through, so shelter is
 * a commitment rather than a free stop on the way past.
 */
export function reachable(board: Board, from: Hex, movement: number, { occupied }: Occupancy): Map<string, { hex: Hex; cost: number }> {
    const taken = new Set(occupied.map(hexKey));
    const best = new Map<string, { hex: Hex; cost: number }>();
    best.set(hexKey(from), { hex: from, cost: 0 });

    // Dijkstra over a handful of tiles: a sorted frontier is plenty, and it keeps
    // the traversal order stable, which the replay depends on.
    const frontier: { hex: Hex; cost: number; stop: boolean }[] = [{ hex: from, cost: 0, stop: false }];
    while (frontier.length > 0) {
        frontier.sort((a, b) => a.cost - b.cost || a.hex.row - b.hex.row || a.hex.col - b.hex.col);
        const current = frontier.shift()!;
        if (current.stop) continue;

        for (const next of neighbours(current.hex)) {
            const key = hexKey(next);
            if (isBlocked(board, next) || taken.has(key)) continue;
            const rule = ruleAt(board, next);
            const cost = current.cost + rule.cost;
            if (cost > movement) continue;
            const known = best.get(key);
            if (known && known.cost <= cost) continue;
            best.set(key, { hex: next, cost });
            frontier.push({ hex: next, cost, stop: !!rule.endsMovement });
        }
    }

    best.delete(hexKey(from));
    return best;
}

/**
 * The cheapest step toward `target` from the tiles reachable this activation,
 * or null when nothing gets closer. Ties break on lower cost, then on the tile
 * that would suffer least, then on position, so the same battle always replays.
 */
export function stepToward(board: Board, from: Hex, target: Hex, movement: number, occupancy: Occupancy): Hex | null {
    const options = [...reachable(board, from, movement, occupancy).values()];
    if (options.length === 0) return null;

    const current = distance(from, target);
    const scored = options
        .map(option => ({ ...option, gap: distance(option.hex, target), rule: ruleAt(board, option.hex) }))
        .filter(option => option.gap < current);
    if (scored.length === 0) return null;

    scored.sort((a, b) =>
        a.gap - b.gap
        || (a.rule.attrition ?? 0) - (b.rule.attrition ?? 0)
        || a.cost - b.cost
        || a.hex.row - b.hex.row
        || a.hex.col - b.hex.col);
    return scored[0].hex;
}

/** Tiles in the deployment band at one end of the board. */
export const deploymentZone = (board: Board, side: 'crew' | 'enemy', depth = 2): Hex[] => {
    const rows = side === 'crew'
        ? Array.from({ length: depth }, (_, i) => board.rows - 1 - i)
        : Array.from({ length: depth }, (_, i) => i);
    const zone: Hex[] = [];
    for (const row of rows) {
        for (let col = 0; col < board.cols; col += 1) {
            const hex = { col, row };
            if (!isBlocked(board, hex)) zone.push(hex);
        }
    }
    return zone;
};

export { distance, hexKey, neighbours, sameHex };
export type { Hex };
