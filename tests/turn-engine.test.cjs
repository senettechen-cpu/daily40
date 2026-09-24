const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const e = loadTs('shared/battle/turn/engine.ts');
const r = loadTs('shared/battle/turn/rules.ts');

const board = (tiles = {}) => ({ cols: 11, rows: 9, tiles });
const at = (col, row) => ({ col, row });

const RIFLE = { name: '雷射步槍', damage: 16, hits: 2, range: 5, penetration: 0 };
const PISTOL = { name: '雷射手槍', damage: 7, hits: 1, range: 2, penetration: 0 };

const unit = (id, side, over = {}) => ({
    id,
    name: id,
    side,
    duty: 'rifleman',
    maxHp: 100,
    armour: 20,
    accuracy: 0.75,
    movement: 3,
    initiative: 10,
    weapon: RIFLE,
    stance: 'advance',
    at: side === 'crew' ? at(5, 8) : at(5, 0),
    ...over,
});

const run = (units, over = {}) => e.runBattle({ board: board(), units, seed: 12345, ...over });

test('a battle ends when one side is down, and reports which', () => {
    // Six against one: the lone defender cannot survive the round.
    const crew = Array.from({ length: 6 }, (_, i) => unit('c' + i, 'crew', { at: at(3 + i, 6) }));
    const win = run([...crew, unit('e0', 'enemy', { at: at(5, 5), maxHp: 20 })]);
    assert.equal(win.outcome, 'victory');
    assert.ok(win.units.filter(u => u.side === 'enemy').every(u => u.down));

    const enemies = Array.from({ length: 6 }, (_, i) => unit('e' + i, 'enemy', { at: at(3 + i, 2) }));
    const loss = run([unit('c0', 'crew', { at: at(5, 3), maxHp: 20 }), ...enemies]);
    assert.equal(loss.outcome, 'defeat');
});

test('a stalemate runs out of rounds instead of running forever', () => {
    // Out of reach of each other, with hold stance so neither closes.
    const far = run([
        unit('c0', 'crew', { at: at(0, 8), stance: 'hold', movement: 0 }),
        unit('e0', 'enemy', { at: at(10, 0), stance: 'hold', movement: 0 }),
    ]);
    assert.equal(far.outcome, 'timeout');
    assert.equal(far.rounds, r.MAX_ROUNDS);
});

test('the same seed replays exactly, a different one does not', () => {
    const units = () => [
        unit('c0', 'crew', { at: at(4, 7) }), unit('c1', 'crew', { at: at(6, 7) }),
        unit('e0', 'enemy', { at: at(4, 1) }), unit('e1', 'enemy', { at: at(6, 1) }),
    ];
    const summary = result => JSON.stringify({
        outcome: result.outcome,
        rounds: result.rounds,
        units: result.units.map(u => [u.id, u.hp, u.at.col, u.at.row, u.down]),
        reasons: result.activations.map(a => a.unitId + ':' + a.reason),
    });

    assert.equal(summary(run(units())), summary(run(units())));
    assert.notEqual(summary(run(units())), summary(run(units(), { seed: 999 })));
});


test('every activation says why, and leaves a snapshot of the whole field', () => {
    const result = run([
        unit('c0', 'crew', { at: at(5, 6) }),
        unit('e0', 'enemy', { at: at(5, 3) }),
    ]);
    assert.ok(result.activations.length > 0);
    for (const step of result.activations) {
        assert.ok(step.reason.length > 0, 'an unexplained activation is a random button');
        assert.equal(step.snapshot.length, 2);
        assert.ok(step.activities.length > 0);
    }
});

test('a held position stays put; an advance closes the distance', () => {
    const start = at(5, 8);
    const held = run([
        unit('c0', 'crew', { at: start, stance: 'hold' }),
        unit('e0', 'enemy', { at: at(5, 0), stance: 'hold', movement: 0 }),
    ]);
    const heldAt = held.units.find(u => u.id === 'c0').at;
    assert.deepEqual([heldAt.col, heldAt.row], [start.col, start.row]);

    const advanced = run([
        unit('c0', 'crew', { at: start, stance: 'advance' }),
        unit('e0', 'enemy', { at: at(5, 0), stance: 'hold', movement: 0 }),
    ]);
    const movedTo = advanced.units.find(u => u.id === 'c0').at;
    assert.ok(movedTo.row < start.row, 'an advancing soldier must have closed on the enemy');
});

test('a guard keeps station on whoever it was told to protect', () => {
    const result = run([
        unit('medic', 'crew', { at: at(5, 8), duty: 'medic', stance: 'hold', movement: 0 }),
        unit('minder', 'crew', { at: at(0, 8), stance: 'guard', guardTargetId: 'medic' }),
        unit('e0', 'enemy', { at: at(5, 0), stance: 'hold', movement: 0 }),
    ]);
    const minder = result.units.find(u => u.id === 'minder');
    const medic = result.units.find(u => u.id === 'medic');
    const gap = Math.max(Math.abs(minder.at.col - medic.at.col), Math.abs(minder.at.row - medic.at.row));
    assert.ok(gap <= 5, 'the guard wandered off');
});

test('the medic is shot first when both are equally reachable', () => {
    // One shooter, two targets side by side: the threat weighting decides.
    const result = run([
        unit('c0', 'crew', { at: at(5, 5), stance: 'hold' }),
        unit('e-medic', 'enemy', { at: at(4, 3), duty: 'medic', stance: 'hold', movement: 0 }),
        unit('e-grunt', 'enemy', { at: at(6, 3), stance: 'hold', movement: 0 }),
    ]);
    const firstShot = result.activations
        .find(a => a.unitId === 'c0' && a.activities.some(x => x.kind === 'attack'));
    const shot = firstShot.activities.find(x => x.kind === 'attack');
    assert.equal(shot.targetId, 'e-medic');
});

test('cover reduces the damage that lands, and never the chance of landing it', () => {
    // GPT's contract: counting cover in both places would shelter twice.
    const shooter = { ...unit('c0', 'crew', { at: at(5, 5) }), hp: 100, down: false };
    const target = { ...unit('e0', 'enemy', { at: at(5, 3) }), hp: 100, down: false };
    const open = board();
    const sheltered = board({ '5,3': 'cover' });

    assert.equal(
        r.hitChance(sheltered, shooter, shooter.at, target, RIFLE),
        r.hitChance(open, shooter, shooter.at, target, RIFLE),
        'cover must not touch the hit chance',
    );
    assert.equal(r.coverMultiplier(sheltered, RIFLE, target.at), 0.75);
    assert.equal(r.coverMultiplier(open, RIFLE, target.at), 1);
});

test('flame and fists ignore cover: a sandbag stops neither', () => {
    const sheltered = board({ '5,3': 'cover' });
    const flamer = { name: '火焰器', damage: 12, hits: 4, range: 2, penetration: 0, damageType: 'flame' };
    assert.equal(r.coverMultiplier(sheltered, flamer, at(5, 3)), 1);
    assert.equal(r.coverMultiplier(sheltered, r.FISTS, at(5, 3)), 1);
});

test('more armour never means more damage taken', () => {
    // Plasma is flat rather than rising, so heavy plate is never a liability.
    for (const id of Object.keys(r.WEAPON_STATS)) {
        const weapon = r.WEAPON_STATS[id];
        const steps = [['none', 0], ['flak', 20], ['carapace', 40], ['power', 80]];
        let previous = Infinity;
        for (const [type, armour] of steps) {
            const taken = r.damageOf(weapon, armour, type);
            assert.ok(taken <= previous, id + ' hurts more through ' + type + ' than through lighter plate');
            previous = taken;
        }
    }
});

test('the type coefficient is applied once, and only rounds at the end', () => {
    const weapon = r.WEAPON_STATS.flamer; // 12 damage, flame, 0.65 against carapace
    assert.equal(r.damageOf(weapon, 40, 'carapace'), Math.round(12 * 0.65 * (100 / 140)));
    // Two tuning stages are a 1.10 total, never 1.05 squared.
    assert.equal(r.TUNING_MULTIPLIER[2], 1.1);
    assert.equal(
        r.damageOf(r.WEAPON_STATS.lasgun, 0, 'none', { tuning: 1.1 }),
        Math.round(22 * 1.1),
    );
});

test('armour reduces a hit but never to nothing', () => {
    assert.ok(r.damageOf(RIFLE, 0) > r.damageOf(RIFLE, 40));
    assert.ok(r.damageOf(PISTOL, 400) >= 1, 'a hit always registers something');
    // Penetration cancels armour point for point.
    assert.equal(r.damageOf({ ...RIFLE, penetration: 20 }, 20), r.damageOf(RIFLE, 0));
});

test('hazard ground costs health at the end of a round', () => {
    const result = e.runBattle({
        board: board({ '5,8': 'hazard' }),
        units: [
            unit('c0', 'crew', { at: at(5, 8), stance: 'hold', movement: 0 }),
            unit('e0', 'enemy', { at: at(0, 0), stance: 'hold', movement: 0 }),
        ],
        seed: 7,
    });
    const survivor = result.units.find(u => u.id === 'c0');
    assert.ok(survivor.hp < 100, 'standing in hazard must cost something');
});

test('initiative orders both sides at once, so neither side owns the first move', () => {
    // A low-initiative crewman must not act before a high-initiative enemy.
    const result = run([
        unit('c-slow', 'crew', { at: at(4, 8), initiative: 2, stance: 'hold', movement: 0 }),
        unit('e-fast', 'enemy', { at: at(4, 0), initiative: 20, stance: 'hold', movement: 0 }),
        unit('c-fast', 'crew', { at: at(6, 8), initiative: 15, stance: 'hold', movement: 0 }),
        unit('e-slow', 'enemy', { at: at(6, 0), initiative: 5, stance: 'hold', movement: 0 }),
    ]);
    const firstRound = [...result.activations].filter(a => a.round === 1).map(a => a.unitId);
    assert.deepEqual(firstRound, ['e-fast', 'c-fast', 'e-slow', 'c-slow']);
});

test('a mirror match is a coin toss, not a first-mover win', () => {
    // The whole reason initiative went global: alternating sides gave whoever
    // moved first a 71% edge over an identical opponent.
    let crew = 0;
    let enemy = 0;
    const rounds = 120;
    for (let i = 1; i <= rounds; i += 1) {
        const result = e.runBattle({
            board: board({ '3,4': 'cover', '7,4': 'cover' }),
            units: [
                ...[0, 1, 2].map(j => unit('c' + j, 'crew', { at: at(4 + j, 7) })),
                ...[0, 1, 2].map(j => unit('e' + j, 'enemy', { at: at(4 + j, 1) })),
            ],
            seed: i * 104729,
        });
        if (result.outcome === 'victory') crew += 1;
        if (result.outcome === 'defeat') enemy += 1;
    }
    const share = crew / (crew + enemy);
    assert.ok(share > 0.35 && share < 0.65, `mirror win share was ${(share * 100).toFixed(1)}%`);
});

test('a held position never leaves its deployment zone, whatever the score says', () => {
    // Put a juicy target far up the board: holding must still refuse to chase it.
    const result = run([
        unit('c0', 'crew', { at: at(5, 8), stance: 'hold', movement: 3 }),
        unit('e0', 'enemy', { at: at(5, 0), duty: 'medic', stance: 'hold', movement: 0 }),
    ]);
    for (const step of result.activations) {
        if (step.unitId !== 'c0') continue;
        const me = step.snapshot.find(s => s.id === 'c0');
        assert.ok(me.at.row >= 7, `a holding soldier walked to row ${me.at.row}`);
    }
});

test('an advance works to its effective band, and stops there', () => {
    // Stopping at maximum range measured as a stalemate; charging to contact
    // throws the range advantage away. The contract is the furthest distance
    // that still shoots at full accuracy — 2 tiles for a five-tile lasgun.
    const band = Math.max(1, Math.floor(RIFLE.range / 2));
    const result = run([
        unit('c0', 'crew', { at: at(5, 8), stance: 'advance', movement: 3 }),
        unit('e0', 'enemy', { at: at(5, 1), stance: 'hold', movement: 0, maxHp: 4000 }),
    ]);

    const mine = [...result.activations].filter(a => a.unitId === 'c0');
    const settled = mine[mine.length - 1].snapshot.find(s => s.id === 'c0');
    const gap = Math.max(Math.abs(settled.at.col - 5), Math.abs(settled.at.row - 1));
    assert.ok(gap <= band + 1, `stopped ${gap} tiles out, past its band of ${band}`);
    assert.ok(gap >= band - 1, `closed to ${gap} tiles, inside its band of ${band}`);

    // Already standing in the band: no reason to shuffle.
    const held = run([
        unit('c0', 'crew', { at: at(5, 4), stance: 'advance', movement: 3 }),
        unit('e0', 'enemy', { at: at(5, 2), stance: 'hold', movement: 0, maxHp: 4000 }),
    ]);
    const first = [...held.activations].find(a => a.unitId === 'c0');
    assert.ok(first.activities.some(a => a.kind === 'attack'));
    assert.ok(!first.activities.some(a => a.kind === 'move'), 'it shuffled while already in band');
});

test('running out of rounds is settled on who is left standing', () => {
    // Two units that cannot reach each other: the round limit decides, and with
    // one body each it is a genuine draw.
    const stuck = () => e.runBattle({
        board: board({}),
        units: [
            unit('c0', 'crew', { at: at(0, 8), stance: 'hold', movement: 0 }),
            unit('e0', 'enemy', { at: at(10, 0), stance: 'hold', movement: 0 }),
        ],
        seed: 5,
    });
    assert.equal(stuck().ending, 'rounds-level');
    assert.equal(stuck().outcome, 'timeout');

    // Add a second crewman who also cannot reach anyone: still out of rounds,
    // but the squad is ahead on bodies and takes it.
    const ahead = e.runBattle({
        board: board({}),
        units: [
            unit('c0', 'crew', { at: at(0, 8), stance: 'hold', movement: 0 }),
            unit('c1', 'crew', { at: at(1, 8), stance: 'hold', movement: 0 }),
            unit('e0', 'enemy', { at: at(10, 0), stance: 'hold', movement: 0 }),
        ],
        seed: 5,
    });
    assert.equal(ahead.ending, 'rounds-ahead');
    assert.equal(ahead.outcome, 'victory');

    const behind = e.runBattle({
        board: board({}),
        units: [
            unit('c0', 'crew', { at: at(0, 8), stance: 'hold', movement: 0 }),
            unit('e0', 'enemy', { at: at(10, 0), stance: 'hold', movement: 0 }),
            unit('e1', 'enemy', { at: at(9, 0), stance: 'hold', movement: 0 }),
        ],
        seed: 5,
    });
    assert.equal(behind.ending, 'rounds-behind');
    assert.equal(behind.outcome, 'defeat');
});

test('a wipe still reads as a wipe, not as a count', () => {
    const crew = [0, 1, 2, 3, 4, 5].map(j => unit('c' + j, 'crew', { at: at(3 + j, 6) }));
    const win = run([...crew, unit('e0', 'enemy', { at: at(5, 5), maxHp: 20 })]);
    assert.equal(win.ending, 'enemy-down');
    assert.equal(win.outcome, 'victory');
});

// --- P4: tools and duty skills ------------------------------------------------

const KIT = (duty, tools, over = {}) => unit('s-' + duty, 'crew', { duty, tools, ...over });
const activitiesOf = (result, id, kind) => [...result.activations]
    .filter(a => a.unitId === id)
    .flatMap(a => [...a.activities])
    .filter(a => a.kind === kind);

test('charge is banked a round at a time, so no skill fires on round one', () => {
    const result = run([
        KIT('rifleman', [], { at: at(5, 6), stance: 'hold' }),
        unit('e0', 'enemy', { at: at(5, 4), stance: 'hold', movement: 0, maxHp: 900 }),
    ]);
    const aimed = [...result.activations]
        .filter(a => a.activities.some(x => x.kind === 'attack' && x.skill))
        .map(a => a.round);
    assert.ok(aimed.length > 0, 'the rifleman never used its skill at all');
    // Two rounds of charge means the earliest possible use is round three.
    assert.ok(Math.min(...aimed) >= 3, `fired on round ${Math.min(...aimed)}`);
});

test('a medic with a kit patches the worst hurt, and never revives', () => {
    const wounded = KIT('rifleman', [], { at: at(5, 8), stance: 'hold', movement: 0 });
    const result = e.runBattle({
        board: board({}),
        units: [
            KIT('medic', ['medicae-kit'], { at: at(4, 8), stance: 'hold', movement: 0 }),
            { ...wounded, id: 'hurt', maxHp: 100 },
            unit('e0', 'enemy', { at: at(5, 0), stance: 'hold', movement: 0 }),
        ],
        seed: 11,
    });
    // Nobody took damage, so there is nothing to heal and no charge is wasted.
    assert.equal(activitiesOf(result, 's-medic', 'heal').length, 0);

    const hurtResult = e.runBattle({
        board: board({}),
        units: [
            KIT('medic', ['medicae-kit'], { at: at(4, 8), stance: 'hold', movement: 0 }),
            { ...wounded, id: 'hurt', maxHp: 100, hp: 100 },
            unit('e0', 'enemy', { at: at(5, 0), stance: 'hold', movement: 0 }),
        ],
        seed: 11,
    });
    for (const step of hurtResult.activations) {
        for (const snap of step.snapshot) {
            assert.ok(snap.hp <= 100, 'healed past full');
            if (snap.down) assert.equal(snap.hp, 0, 'a downed unit was healed back up');
        }
    }
});

test('an engineer fortifies at most twice, and only ground that is open', () => {
    const crew = [
        KIT('engineer', ['engineering-kit'], { at: at(5, 8), stance: 'hold', movement: 0 }),
        unit('a1', 'crew', { at: at(4, 8), stance: 'hold', movement: 0 }),
        unit('a2', 'crew', { at: at(6, 8), stance: 'hold', movement: 0 }),
    ];
    const foes = [0, 1, 2].map(j => unit('e' + j, 'enemy', { at: at(4 + j, 5), stance: 'hold', movement: 0, maxHp: 900 }));
    const result = e.runBattle({ board: board({}), units: [...crew, ...foes], seed: 3 });

    const built = activitiesOf(result, 's-engineer', 'fortify');
    assert.ok(built.length <= 2, `built ${built.length} pieces of cover`);
    // Whatever it fortified, it was somewhere a living ally stood.
    for (const piece of built) assert.ok(piece.at.row >= 7);
});

test('a sergeant only gives an order when enough people can use it', () => {
    const lone = e.runBattle({
        board: board({}),
        units: [
            KIT('sergeant', [], { at: at(5, 8), stance: 'hold', movement: 0 }),
            unit('a1', 'crew', { at: at(4, 8), stance: 'hold', movement: 0 }),
            unit('e0', 'enemy', { at: at(5, 0), stance: 'hold', movement: 0 }),
        ],
        seed: 9,
    });
    // One ally in range is below the threshold, so the order is never given.
    assert.equal(activitiesOf(lone, 's-sergeant', 'command').length, 0);

    const squad = e.runBattle({
        board: board({}),
        units: [
            KIT('sergeant', [], { at: at(5, 8), stance: 'hold', movement: 0 }),
            unit('a1', 'crew', { at: at(4, 8), stance: 'hold', movement: 0 }),
            unit('a2', 'crew', { at: at(6, 8), stance: 'hold', movement: 0 }),
            unit('a3', 'crew', { at: at(5, 7), stance: 'hold', movement: 0 }),
            unit('e0', 'enemy', { at: at(5, 0), stance: 'hold', movement: 0 }),
        ],
        seed: 9,
    });
    assert.ok(activitiesOf(squad, 's-sergeant', 'command').length > 0, 'the order was never given');
});

test('a tool in the wrong hands unlocks nothing', () => {
    // A rifleman carrying an engineering kit cannot fortify anything.
    const result = e.runBattle({
        board: board({}),
        units: [
            KIT('rifleman', ['engineering-kit'], { at: at(5, 8), stance: 'hold', movement: 0 }),
            unit('a1', 'crew', { at: at(4, 8), stance: 'hold', movement: 0 }),
            unit('e0', 'enemy', { at: at(5, 5), stance: 'hold', movement: 0, maxHp: 900 }),
        ],
        seed: 4,
    });
    assert.equal(activitiesOf(result, 's-rifleman', 'fortify').length, 0);
});

test('skills and tools leave the replay exact', () => {
    const squad = () => [
        KIT('sergeant', ['vox-caster'], { at: at(4, 7) }),
        KIT('medic', ['medicae-kit'], { at: at(5, 8) }),
        KIT('engineer', ['engineering-kit'], { at: at(6, 7) }),
        unit('r1', 'crew', { at: at(5, 7) }),
        unit('e0', 'enemy', { at: at(4, 1) }),
        unit('e1', 'enemy', { at: at(6, 1) }),
    ];
    const summary = r => JSON.stringify({
        outcome: r.outcome, ending: r.ending, rounds: r.rounds,
        units: r.units.map(u => [u.id, u.hp, u.at.col, u.at.row, u.down, u.charge]),
        reasons: [...r.activations].map(a => a.unitId + ':' + a.reason),
    });
    const once = e.runBattle({ board: board({ '5,4': 'cover' }), units: squad(), seed: 4242 });
    const twice = e.runBattle({ board: board({ '5,4': 'cover' }), units: squad(), seed: 4242 });
    assert.equal(summary(once), summary(twice));
});

test('fortifying never writes on the board it was handed', () => {
    // Scenario boards are module constants shared by every battle: one
    // engineer's sandbags must not become part of the map for everyone after.
    const shared = board({});
    const before = JSON.stringify(shared.tiles);
    e.runBattle({
        board: shared,
        units: [
            KIT('engineer', ['engineering-kit'], { at: at(5, 8), stance: 'hold', movement: 0 }),
            unit('a1', 'crew', { at: at(4, 8), stance: 'hold', movement: 0 }),
            unit('a2', 'crew', { at: at(6, 8), stance: 'hold', movement: 0 }),
            ...[0, 1].map(j => unit('e' + j, 'enemy', { at: at(4 + j, 5), stance: 'hold', movement: 0, maxHp: 900 })),
        ],
        seed: 3,
    });
    assert.equal(JSON.stringify(shared.tiles), before, 'the battle edited the board it was given');
});

test('a heavy weapon cannot be fired on the move', () => {
    const HEAVY = { name: '星界軍重武器組', damage: 20, hits: 3, range: 6, penetration: 10, damageType: 'ballistic' };
    const result = run([
        unit('h0', 'crew', { duty: 'heavy', weapon: HEAVY, at: at(5, 8), stance: 'advance', movement: 2 }),
        unit('e0', 'enemy', { at: at(5, 2), stance: 'hold', movement: 0, maxHp: 900 }),
    ]);
    for (const step of [...result.activations].filter(a => a.unitId === 'h0')) {
        const moved = step.activities.some(x => x.kind === 'move');
        const fired = step.activities.some(x => x.kind === 'attack');
        assert.ok(!(moved && fired), `round ${step.round}: moved and fired the heavy weapon`);
    }
});
