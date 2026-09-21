const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const e = loadTs('src/expedition/engine.ts');
const { project } = loadTs('src/expedition/presentation.ts');
// Values built inside the loader sandbox have foreign prototypes; compare plain copies.
const plain = value => JSON.parse(JSON.stringify(value));

// Snapshot from handoff-assets/cover-art-direction-20260921-gpt-v4/ART-HANDOFF.md §3.
// Art is drawn against these exact points; changing the map must be a reported
// map change, not a silent edit, so this test fails first.
const COVER = [[3, 1, 400, 160], [3, 4, 310, 205], [3, 8, 190, 265], [7, 1, 520, 220], [7, 4, 430, 265], [7, 8, 310, 325], [9, 1, 580, 250], [9, 6, 430, 325], [12, 2, 640, 310], [12, 6, 520, 370]];
const WALLS = [[5, 2], [5, 3], [5, 6], [5, 7], [10, 3], [10, 4], [10, 7]];

test('battlefield grid, cover, walls and beacon match the v4 art handoff', () => {
    assert.equal(e.WIDTH, 16);
    assert.equal(e.HEIGHT, 10);
    assert.deepEqual(plain(e.COVER).map(p => [p.x, p.y]), COVER.map(([x, y]) => [x, y]));
    assert.deepEqual(COVER.map(([x, y]) => plain(project({ x, y }))).map(p => [p.x, p.y]), COVER.map(([, , sx, sy]) => [sx, sy]));
    assert.deepEqual(plain(e.WALLS).map(p => [p.x, p.y]), WALLS);
    assert.deepEqual([e.BEACON.x, e.BEACON.y], [14, 5]);
    assert.deepEqual(plain(project(e.BEACON)), { x: 610, y: 385 });
});

test('deployment lanes stay on the original west edge', () => {
    assert.deepEqual(plain(e.DEFAULT_SQUAD).map(a => a.lane), [2, 4, 6, 8]);
    assert.deepEqual(plain(e.createBattle(e.DEFAULT_SQUAD).actors).filter(a => a.side === 'crew').map(a => [a.x, a.y]), [[1, 2], [1, 4], [1, 6], [1, 8]]);
});
