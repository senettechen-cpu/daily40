const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const l = loadTs('shared/battle/turn/loadout.ts');
const s = loadTs('shared/battle/turn/scenarios.ts');
const r = loadTs('shared/battle/turn/rules.ts');
const e = loadTs('shared/battle/turn/engine.ts');
const catalog = loadTs('shared/armory/catalog.ts');

const at = (col, row) => ({ col, row });
const character = (id, over = {}) => ({
    id, name: id, origin: 'cadian', duty: 'rifleman', xp: 0, health: 'fit', ...over,
});
const gear = (id, characterId, catalogId) => ({ id, catalogId, assignedTo: characterId, paid: 0, acquiredAt: '' });
const place = (characterId, over = {}) => ({ characterId, at: at(5, 8), stance: 'advance', ...over });

test('a soldier with no weapon still has fists, so a bad loadout is legible', () => {
    const { units } = l.crewFor([character('a')], [], [place('a')]);
    assert.equal(units.length, 1);
    assert.equal(units[0].weapon.name, r.FISTS.name);
    assert.equal(units[0].armour, 0);
});

test('gear becomes numbers: the primary arms, the heaviest plate protects', () => {
    const items = [
        gear('i1', 'a', 'lasgun'),
        gear('i2', 'a', 'laspistol'),
        gear('i3', 'a', 'flak-armour'),
        gear('i4', 'a', 'carapace-armour'),
    ];
    const { units } = l.crewFor([character('a')], items, [place('a')]);
    assert.equal(units[0].weapon.name, r.WEAPON_STATS.lasgun.name, 'the primary must win the slot');
    assert.equal(units[0].armour, 40, 'the better plate must be the one worn');
});

test('a sidearm alone still arms someone who has no rifle', () => {
    const { units } = l.crewFor([character('a')], [gear('i1', 'a', 'laspistol')], [place('a')]);
    assert.equal(units[0].weapon.name, r.WEAPON_STATS.laspistol.name);
});

test('every catalogue item now reaches the battle in some form', () => {
    // Tuning and mods ride on the weapon, tools are carried and unlock by duty.
    // Nothing in the catalogue is inert any more, which is what P4 was for.
    const items = [
        gear('i1', 'a', 'lasgun'), gear('i2', 'a', 'medicae-kit'),
        gear('i3', 'a', 'tuning-1'), gear('i4', 'a', 'vox-caster'),
    ];
    const { units, unmodelled } = l.crewFor([character('a')], items, [place('a')]);
    assert.equal(units[0].weapon.name, r.WEAPON_STATS.lasgun.name);
    assert.equal(units[0].tuning, 1.05);
    assert.deepEqual([...units[0].tools].sort(), ['medicae-kit', 'vox-caster']);
    assert.deepEqual([...unmodelled], []);
    // A vox-caster lifts its bearer's place in the order.
    assert.equal(units[0].initiative, r.DUTY_STATS.rifleman.initiative + r.VOX_INITIATIVE);
});

test('a primary and a sidearm are both kept, and gear reads its own numbers', () => {
    const items = [
        gear('i1', 'a', 'lasgun'), gear('i2', 'a', 'laspistol'),
        gear('i3', 'a', 'carapace-armour'), gear('i4', 'a', 'function-mod'),
        gear('i5', 'a', 'tuning-1'), gear('i6', 'a', 'tuning-2'),
    ];
    const { units } = l.crewFor([character('a')], items, [place('a')]);
    const soldier = units[0];
    assert.equal(soldier.weapon.name, r.WEAPON_STATS.lasgun.name);
    assert.equal(soldier.sidearm.name, r.WEAPON_STATS.laspistol.name);
    assert.equal(soldier.armourType, 'carapace');
    assert.equal(soldier.tuning, 1.1, 'two stages total 1.10');
    assert.equal(soldier.accuracyBonus, 0.05);
    // Carapace costs initiative rather than movement.
    assert.equal(soldier.initiative, r.DUTY_STATS.rifleman.initiative - 1);
    assert.equal(soldier.movement, r.DUTY_STATS.rifleman.movement);
});

test('duty drives initiative and movement, and nobody is left without them', () => {
    const duties = ['sergeant', 'rifleman', 'medic', 'comms', 'engineer', 'marksman', 'flamer', 'plasma', 'heavy'];
    for (const duty of duties) {
        const { units } = l.crewFor([character('a', { duty })], [], [place('a')]);
        assert.ok(units[0].initiative > 0, `${duty} has no initiative`);
        assert.ok(units[0].movement > 0, `${duty} cannot move`);
    }
    // The heavy weapon team is the slow one, the sergeant acts first.
    const heavy = l.crewFor([character('a', { duty: 'heavy' })], [], [place('a')]).units[0];
    const sergeant = l.crewFor([character('a', { duty: 'sergeant' })], [], [place('a')]).units[0];
    assert.ok(heavy.movement < sergeant.movement);
    assert.ok(heavy.initiative < sergeant.initiative);
});

test('a guard pointed at nobody falls back to holding, not to a broken order', () => {
    const { units } = l.crewFor(
        [character('a'), character('b')],
        [],
        [place('a', { stance: 'guard', guardTargetId: 'ghost' }), place('b', { stance: 'guard', guardTargetId: 'b' })],
    );
    const resolved = l.resolveGuards(units);
    assert.equal(resolved[0].stance, 'hold', 'guarding someone who is not here');
    assert.equal(resolved[1].stance, 'hold', 'guarding yourself');

    const valid = l.resolveGuards(l.crewFor(
        [character('a'), character('b')],
        [],
        [place('a', { stance: 'guard', guardTargetId: 'b' }), place('b')],
    ).units);
    assert.equal(valid[0].stance, 'guard');
});

test('every scenario is playable: enemies on the board, in their own half, with weapons', () => {
    assert.ok(s.SCENARIOS.length >= 3);
    for (const scenario of s.SCENARIOS) {
        assert.ok(scenario.enemies.length > 0, `${scenario.id} has nobody in it`);
        const seats = new Set();
        for (const enemy of scenario.enemies) {
            assert.equal(enemy.side, 'enemy');
            assert.ok(enemy.weapon && enemy.weapon.damage > 0, `${enemy.name} cannot fight`);
            // A broadcast relay (C3 boss) is a structure: it never moves and never acts.
            assert.ok(enemy.maxHp > 0 && (enemy.movement > 0 || enemy.duty === 'relay'));
            assert.ok(enemy.at.row <= 2, `${enemy.name} starts outside the enemy half`);
            assert.ok(enemy.at.col >= 0 && enemy.at.col < scenario.board.cols);
            const key = `${enemy.at.col},${enemy.at.row}`;
            assert.ok(!seats.has(key), `two enemies share ${key} in ${scenario.id}`);
            seats.add(key);
            assert.ok(scenario.board.tiles[key] !== 'block', `${enemy.name} starts inside a wall`);
        }
        assert.equal(new Set(scenario.enemies.map(x => x.id)).size, scenario.enemies.length);
    }
});

test('the enemy is built like the squad, so the counters run both ways', () => {
    const all = s.SCENARIOS.flatMap(scenario => [...scenario.enemies]);
    assert.ok(new Set(all.map(x => x.duty)).size > 1, 'enemies must not be one duty repeated');
    assert.ok(new Set(all.map(x => x.stance)).size > 1, 'enemies must not all behave alike');
    assert.ok(new Set(all.map(x => x.armour)).size > 1, 'armour must vary or anti-armour means nothing');
});

test('a real squad fights a real scenario to a conclusion', () => {
    const duties = ['sergeant', 'rifleman', 'rifleman', 'medic', 'engineer', 'marksman'];
    const roster = duties.map((duty, i) => character('c' + i, { duty, name: '士兵' + i }));
    const items = roster.flatMap((c, i) => [gear('w' + i, c.id, 'lasgun'), gear('a' + i, c.id, 'flak-armour')]);
    const placements = roster.map((c, i) => place(c.id, { at: at(3 + i, 7), stance: i === 3 ? 'hold' : 'advance' }));

    const { units } = l.crewFor(roster, items, placements);
    const scenario = s.scenarioById('standard');
    const result = e.runBattle({
        board: scenario.board,
        units: [...units, ...scenario.enemies],
        seed: 20260924,
    });

    assert.ok(['victory', 'defeat', 'timeout'].includes(result.outcome));
    assert.ok(result.activations.length > 0);
    assert.ok(result.rounds >= 1 && result.rounds <= r.MAX_ROUNDS);
    // Nobody ever stands inside a wall or off the board.
    for (const unit of result.units) {
        assert.ok(unit.at.col >= 0 && unit.at.col < scenario.board.cols);
        assert.ok(unit.at.row >= 0 && unit.at.row < scenario.board.rows);
        assert.notEqual(scenario.board.tiles[`${unit.at.col},${unit.at.row}`], 'block');
    }
});

test('every weapon the catalogue can equip has a combat profile or is declared inert', () => {
    const armable = catalog.CATALOG.filter(item => item.category === 'primary' || item.category === 'sidearm');
    for (const item of armable) {
        assert.ok(r.WEAPON_STATS[item.id], `${item.id} can be equipped but cannot fight`);
    }
    for (const item of catalog.CATALOG.filter(x => x.category === 'armour')) {
        assert.ok(r.ARMOUR_STATS[item.id], `${item.id} can be worn but protects nothing`);
    }
});

test("another soldier's equipment never leaks into this one", () => {
    const items = [gear('i1', 'a', 'plasma-gun'), gear('i2', 'b', 'carapace-armour')];
    const { units } = l.crewFor([character('a'), character('b')], items, [place('a'), place('b', { at: at(6, 8) })]);
    const [a, b] = units;
    assert.equal(a.weapon.name, r.WEAPON_STATS['plasma-gun'].name);
    assert.equal(a.armour, 0, 'a wore b armour');
    assert.equal(b.weapon.name, r.FISTS.name, 'b took a weapon');
    assert.equal(b.armour, 40);
});

test('a heavy weapon always leaves with someone to feed it', () => {
    const duties = ['sergeant', 'heavy', 'rifleman', 'medic', 'engineer', 'marksman'];
    const roster = duties.map((duty, i) => character('c' + i, { duty }));
    const items = roster.flatMap((c, i) => [
        gear('w' + i, c.id, c.duty === 'heavy' ? 'heavy-weapon' : 'lasgun'),
        gear('a' + i, c.id, 'flak-armour'),
    ]);
    const { units } = l.crewFor(roster, items, roster.map((c, i) => place(c.id, { at: at(3 + i, 7) })));
    const crewed = l.assignHeavyCrew(units);

    const gunner = crewed.find(u => u.duty === 'heavy');
    assert.ok(gunner.assistantId, 'the gun was left to feed itself');
    const mate = crewed.find(u => u.id === gunner.assistantId);
    assert.ok(['rifleman', 'engineer'].includes(mate.duty), `a ${mate.duty} was put on the gun`);
    assert.notEqual(mate.id, gunner.id);

    // Two guns never share one pair of hands.
    const twoGuns = l.assignHeavyCrew(crewed.map(u => (u.duty === 'marksman' ? { ...u, duty: 'heavy', weapon: crewed.find(x => x.duty === 'heavy').weapon } : u)));
    const bound = twoGuns.filter(u => u.duty === 'heavy').map(u => u.assistantId).filter(Boolean);
    assert.equal(new Set(bound).size, bound.length, 'one mate was bound to two guns');
});

test('a heavy weapon draws the soldier who costs the squad least, not the first placed', () => {
    // Before 2026-09-28 the mate was whoever came first among riflemen and
    // engineers, so a placement that put the engineer first handed the gun the
    // wrong pair of hands - and the value matrix turns negative when it does.
    const gun = { name: '星界軍重武器組', hits: 5 };
    const squad = [
        { id: 'c0', side: 'crew', duty: 'heavy', weapon: gun },
        { id: 'c1', side: 'crew', duty: 'engineer', weapon: { name: '雷射槍' } },
        { id: 'c2', side: 'crew', duty: 'plasma', weapon: { name: '電漿槍' } },
        { id: 'c3', side: 'crew', duty: 'rifleman', weapon: { name: '雷射槍' } },
        { id: 'c4', side: 'crew', duty: 'medic', weapon: { name: '雷射槍' } },
    ];
    const mate = units => l.assignHeavyCrew(units).find(u => u.id === 'c0').assistantId;
    assert.equal(mate(squad), 'c3', 'the plain rifleman, though the engineer was placed first');

    // With no rifleman left, it falls to the next cheapest duty rather than giving up.
    const noRifleman = squad.filter(u => u.id !== 'c3');
    assert.equal(mate(noRifleman), 'c1', 'the engineer before the plasma gunner or the medic');
});

test("the player's chosen mate is kept, and never stolen by another gun", () => {
    const gun = { name: '星界軍重武器組', hits: 5 };
    const squad = [
        { id: 'c0', side: 'crew', duty: 'heavy', weapon: gun, assistantId: 'c4' },
        { id: 'c1', side: 'crew', duty: 'engineer', weapon: { name: '雷射槍' } },
        { id: 'c3', side: 'crew', duty: 'rifleman', weapon: { name: '雷射槍' } },
        { id: 'c4', side: 'crew', duty: 'medic', weapon: { name: '雷射槍' } },
    ];
    const crewed = l.assignHeavyCrew(squad);
    assert.equal(crewed.find(u => u.id === 'c0').assistantId, 'c4', 'the medic the player picked');

    // A second gun must take somebody else, not the mate already spoken for.
    const twoGuns = l.assignHeavyCrew([...squad, { id: 'c5', side: 'crew', duty: 'heavy', weapon: gun }]);
    assert.equal(twoGuns.find(u => u.id === 'c0').assistantId, 'c4');
    assert.equal(twoGuns.find(u => u.id === 'c5').assistantId, 'c3');
});

test('a chosen mate that is gone from the squad falls back to an automatic pick', () => {
    const gun = { name: '星界軍重武器組', hits: 5 };
    const squad = [
        { id: 'c0', side: 'crew', duty: 'heavy', weapon: gun, assistantId: 'left-the-squad' },
        { id: 'c3', side: 'crew', duty: 'rifleman', weapon: { name: '雷射槍' } },
    ];
    assert.equal(l.assignHeavyCrew(squad).find(u => u.id === 'c0').assistantId, 'c3');
});
