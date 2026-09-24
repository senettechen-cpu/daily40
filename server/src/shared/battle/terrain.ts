// The one description of the battlefield. It lives in shared so the server can
// re-run a battle on the same ground the client showed, and src/expedition
// re-exports it rather than keeping a second copy.

export interface Point { x: number; y: number }

export const WIDTH = 16;
export const HEIGHT = 10;

export const WALLS: Point[] = [
    { x: 5, y: 2 }, { x: 5, y: 3 }, { x: 5, y: 6 }, { x: 5, y: 7 },
    { x: 10, y: 3 }, { x: 10, y: 4 }, { x: 10, y: 7 },
];

export const COVER: Point[] = [
    { x: 3, y: 1 }, { x: 3, y: 4 }, { x: 3, y: 8 },
    { x: 7, y: 1 }, { x: 7, y: 4 }, { x: 7, y: 8 },
    { x: 9, y: 1 }, { x: 9, y: 6 }, { x: 12, y: 2 }, { x: 12, y: 6 },
];

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

export function lineOfSight(a: Point, b: Point): boolean {
    const steps = Math.ceil(distance(a, b) * 4);
    for (let i = 1; i < steps; i++) {
        const p = { x: Math.round(a.x + (b.x - a.x) * i / steps), y: Math.round(a.y + (b.y - a.y) * i / steps) };
        if (WALLS.some(w => samePoint(w, p))) return false;
    }
    return true;
}

export function protectedByCover(defender: Point, attacker: Point): boolean {
    const dx = attacker.x - defender.x, dy = attacker.y - defender.y;
    const length = Math.hypot(dx, dy);
    if (length < 1.5) return false;
    return COVER.some(c => {
        const cx = c.x - defender.x, cy = c.y - defender.y;
        return Math.hypot(cx, cy) <= 1.05 && cx * dx + cy * dy > 0 && Math.abs(cx * dy - cy * dx) / length <= .72;
    });
}
