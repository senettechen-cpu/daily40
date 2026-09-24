const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const h = loadTs('shared/battle/hex/coords.ts');
const b = loadTs('shared/battle/hex/board.ts');

const at = (col, row) => ({ col, row });
const board = (tiles = {}, cols = 11, rows = 9) => ({ cols, rows, tiles });
const keys = map => [...map.values()].map(v => `${v.hex.col},${v.hex.row}`).sort();

test('hex distance is symmetric and counts steps, not squares', () => {
    assert.equal(h.distance(at(3, 3), at(3, 3)), 0);
    for (const n of h.neighbours(at(3, 3))) assert.equal(h.distance(at(3, 3), n), 1);
    // Every hex two steps out is at distance two, and there are twelve of them.
    const ring = h.withinRange(at(4, 4), 2).filter(x => h.distance(at(4, 4), x) === 2);
    assert.equal(ring.length, 12);
    // Symmetry holds on both odd and even rows, where the offset layout shifts.
    for (const [a, c] of [[at(2, 2), at(7, 5)], [at(1, 3), at(6, 4)], [at(0, 0), at(10, 8)]]) {
        assert.equal(h.distance(a, c), h.distance(c, a));
    }
});

test('neighbours are six, distinct, and mutual', () => {
    for (const origin of [at(3, 3), at(4, 4), at(0, 0)]) {
        const near = h.neighbours(origin);
        assert.equal(near.length, 6);
        assert.equal(new Set(near.map(h.hexKey)).size, 6);
        for (const n of near) {
            assert.ok(h.neighbours(n).some(back => h.sameHex(back, origin)), `${h.hexKey(n)} does not look back`);
        }
    }
});

test('a line runs end to end and reads the same from either end', () => {
    const from = at(1, 1);
    const to = at(6, 5);
    const line = h.lineBetween(from, to);
    assert.equal(line.length, h.distance(from, to) + 1);
    assert.ok(h.sameHex(line[0], from));
    assert.ok(h.sameHex(line[line.length - 1], to));
    // Each step is adjacent to the last: no jumps.
    for (let i = 1; i < line.length; i += 1) assert.equal(h.distance(line[i - 1], line[i]), 1);
    // Symmetric, so cover never shelters one direction only.
    assert.deepEqual(h.lineBetween(to, from).map(h.hexKey).reverse(), line.map(h.hexKey));
});

test('only blocking terrain breaks sight, and never the tiles at either end', () => {
    const wall = board({ '3,3': 'block' });
    assert.equal(b.hasLineOfSight(wall, at(1, 3), at(6, 3)), false);
    assert.equal(b.hasLineOfSight(wall, at(1, 1), at(6, 1)), true);
    // Standing in it, or shooting at it, still works: only what is between counts.
    assert.equal(b.hasLineOfSight(wall, at(3, 3), at(6, 3)), true);
    assert.equal(b.hasLineOfSight(wall, at(1, 3), at(3, 3)), true);
    // Cover hides nothing; it only softens what lands.
    assert.equal(b.hasLineOfSight(board({ '3,3': 'cover' }), at(1, 3), at(6, 3)), true);
});

test('movement pays terrain, stops at the board edge and cannot pass through anyone', () => {
    const plain = board();
    const near = b.reachable(plain, at(5, 4), 1, { occupied: [] });
    assert.equal(near.size, 6);

    // High ground costs two, so one point cannot reach it.
    const hill = board({ '5,3': 'high' });
    assert.ok(!keys(b.reachable(hill, at(5, 4), 1, { occupied: [] })).includes('5,3'));
    assert.ok(keys(b.reachable(hill, at(5, 4), 2, { occupied: [] })).includes('5,3'));

    // A wall is never reachable, at any budget.
    assert.ok(!keys(b.reachable(board({ '5,3': 'block' }), at(5, 4), 4, { occupied: [] })).includes('5,3'));

    // Someone standing there blocks the tile, allies included.
    assert.ok(!keys(b.reachable(plain, at(5, 4), 1, { occupied: [at(5, 3)] })).includes('5,3'));

    // A corner cannot reach off the map.
    for (const { hex } of b.reachable(plain, at(0, 0), 3, { occupied: [] }).values()) {
        assert.ok(b.onBoard(plain, hex), `${h.hexKey(hex)} is off the board`);
    }
});

test('cover is entered, not passed through', () => {
    // Wall off every way out of the start except one tile of cover, so the only
    // route onward runs through it. With three points to spend, movement must
    // still stop the moment it takes shelter.
    const start = at(5, 4);
    const [doorway, ...walls] = h.neighbours(start);
    const corridor = board({
        ...Object.fromEntries(walls.map(w => [h.hexKey(w), 'block'])),
        [h.hexKey(doorway)]: 'cover',
    });

    const reach = keys(b.reachable(corridor, start, 3, { occupied: [] }));
    assert.deepEqual(reach, [h.hexKey(doorway)],
        'taking cover must end the move, so nothing beyond it is reachable');

    // The same doorway as open ground does let movement continue past it.
    const open = board(Object.fromEntries(walls.map(w => [h.hexKey(w), 'block'])));
    assert.ok(keys(b.reachable(open, start, 3, { occupied: [] })).length > 1);
});

test('stepping toward a target closes the gap, or reports that it cannot', () => {
    const plain = board();
    const step = b.stepToward(plain, at(5, 8), at(5, 0), 2, { occupied: [] });
    assert.ok(step);
    assert.ok(h.distance(step, at(5, 0)) < h.distance(at(5, 8), at(5, 0)));

    // Already there: nothing gets closer.
    assert.equal(b.stepToward(plain, at(5, 1), at(5, 1), 2, { occupied: [] }), null);

    // Walled in on every side, it says so instead of teleporting.
    const boxed = board(Object.fromEntries(h.neighbours(at(5, 4)).map(n => [h.hexKey(n), 'block'])));
    assert.equal(b.stepToward(boxed, at(5, 4), at(5, 0), 3, { occupied: [] }), null);

    // Given the choice, it keeps out of hazard.
    const mined = board({ '5,7': 'hazard' });
    const careful = b.stepToward(mined, at(5, 8), at(5, 0), 1, { occupied: [] });
    assert.notEqual(h.hexKey(careful), '5,7');
});

test('deployment zones sit at opposite ends and exclude blocked tiles', () => {
    const plain = board();
    const crew = b.deploymentZone(plain, 'crew');
    const enemy = b.deploymentZone(plain, 'enemy');
    assert.deepEqual([...new Set(crew.map(x => x.row))].sort(), [7, 8]);
    assert.deepEqual([...new Set(enemy.map(x => x.row))].sort(), [0, 1]);
    assert.equal(crew.length, 22);
    assert.equal(b.deploymentZone(board({ '0,8': 'block' }), 'crew').length, 21);
});
