const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { createFakeDb } = require('./helpers/fake-db.cjs');

const sp = loadTs('shared/roster/specialties.ts');
const turn = loadTs('shared/battle/turn/index.ts');

const soldier = (extra = {}) => ({ id: 'a', name: 'a', origin: 'cadian', duty: 'rifleman', xp: 0, health: 'fit', recruitedAt: '', ...extra });

// ---- rules ----------------------------------------------------------------

test('specialties: five groups of three slots, two exclusive options each (30 in all)', () => {
    assert.equal(sp.SPECIALTIES.length, 30);
    assert.equal(new Set(sp.SPECIALTIES.map(x => x.id)).size, 30);
    for (const group of Object.keys(sp.GROUP_LABELS)) {
        for (const slot of [0, 1, 2]) {
            assert.equal(sp.SPECIALTIES.filter(x => x.group === group && x.slot === slot).length, 2, `${group} slot ${slot}`);
        }
    }
    for (const x of sp.SPECIALTIES) assert.ok(x.effects.length > 0 && x.description.length > 0, x.id);
});

test('specialties: slots open at levels 3, 6 and 9; the group follows the duty, astartes have their own', () => {
    assert.equal(sp.openSlots(0), 0);
    assert.equal(sp.openSlots(250), 1);   // Lv3
    assert.equal(sp.openSlots(1000), 2);  // Lv6
    assert.equal(sp.openSlots(2200), 3);  // Lv9
    assert.equal(sp.groupOf(soldier({ duty: 'plasma' })), 'assault');
    assert.equal(sp.groupOf(soldier({ duty: 'marksman' })), 'precision');
    assert.equal(sp.groupOf(soldier({ duty: 'comms' })), 'support');
    assert.equal(sp.groupOf(soldier({ duty: 'sergeant' })), 'command');
    assert.equal(sp.groupOf(soldier({ origin: 'aspirant' })), 'assault', 'a candidate in training uses the assault group');
    assert.equal(sp.groupOf(soldier({ origin: 'astartes', duty: 'medic' })), 'astartes');
});

test('specialties: a pick needs the slot open, the right group, and an empty slot; then it is final', () => {
    const lv3 = soldier({ xp: 250 });
    assert.equal(sp.pickRefusal(lv3, 0, 'steady-aim'), null);
    assert.match(sp.pickRefusal(soldier(), 0, 'steady-aim'), /Lv3/);
    assert.match(sp.pickRefusal(lv3, 1, 'close-assault'), /Lv6/);
    assert.match(sp.pickRefusal(lv3, 0, 'rally'), /指揮/);
    assert.match(sp.pickRefusal(lv3, 0, 'close-assault'), /沒有這個專長/, 'an option of another slot');
    assert.match(sp.pickRefusal({ ...lv3, specialties: ['covering-advance'] }, 0, 'steady-aim'), /不能更改/);
});

test('specialties: only picks of the soldier\'s current group and open slots take effect', () => {
    const picked = soldier({ xp: 2200, specialties: ['steady-aim', 'dig-in', 'veteran-grit'] });
    assert.deepEqual([...sp.effectsOf(picked).map(e => e.kind)], ['steady-hit', 'cover-guard', 'max-hp']);
    // Graduated: the human picks no longer apply even if they were somehow left behind.
    assert.equal(sp.effectsOf({ ...picked, origin: 'astartes' }).length, 0);
    assert.equal(sp.effectsOf({ ...picked, xp: 250 }).length, 1, 'a slot above the level does nothing');
});

// ---- loadout and engine ---------------------------------------------------

const place = (id, col, row, stance = 'hold') => ({ characterId: id, at: { col, row }, stance });
const kit = id => [{ id: id + 'w', catalogId: 'lasgun', assignedTo: id, paid: 0, acquiredAt: '' }];

test('specialties: fixed effects fold into the unit, situational ones ride along', () => {
    const grit = soldier({ xp: 2200, specialties: ['covering-advance', 'dig-in', 'veteran-grit'] });
    const plain = soldier({ xp: 2200 });
    const [a] = turn.crewFor([grit], kit('a'), [place('a', 5, 8)]).units;
    const [b] = turn.crewFor([plain], kit('a'), [place('a', 5, 8)]).units;
    assert.equal(a.movement, b.movement + 1);
    assert.equal(a.maxHp, Math.round(b.maxHp * 1.08));
    assert.deepEqual([...a.effects.map(e => e.kind)], ['move', 'moving-hit', 'cover-guard', 'max-hp']);
    assert.equal(b.effects, undefined);
});

const unit = (id, side, extra = {}) => ({
    id, name: id, side, duty: 'rifleman', maxHp: 100, armour: 0, armourType: 'none', accuracy: 0.9,
    movement: 0, initiative: 10, weapon: turn.WEAPON_STATS.lasgun, stance: 'hold', at: { col: 5, row: 8 }, ...extra,
});
const openBoard = tiles => ({ cols: 11, rows: 9, tiles });
const damageTo = (result, id) => result.activations.flatMap(a => [...a.activities])
    .filter(x => x.kind === 'attack' && x.targetId === id).reduce((sum, x) => sum + x.damage, 0);

test('specialties: 堅守陣線 softens hits taken in cover, and only in cover', () => {
    const run = (effects, tile) => turn.runBattle({
        board: openBoard(tile ? { '5,8': tile } : {}), seed: 5, maxRounds: 3,
        units: [unit('me', 'crew', { maxHp: 9000, effects, weapon: turn.FISTS }), unit('foe', 'enemy', { at: { col: 5, row: 5 }, maxHp: 9000 })],
    });
    const dug = [{ kind: 'cover-guard', amount: 0.5 }];
    assert.ok(damageTo(run(dug, 'cover'), 'me') < damageTo(run(undefined, 'cover'), 'me'));
    assert.equal(damageTo(run(dug, undefined), 'me'), damageTo(run(undefined, undefined), 'me'));
});

test('specialties: 不屈 recovers once when a soldier falls low', () => {
    const result = turn.runBattle({
        board: openBoard({}), seed: 3, maxRounds: 10,
        units: [
            unit('me', 'crew', { maxHp: 100, weapon: turn.FISTS, effects: [{ kind: 'last-stand', amount: 30, below: 0.3 }] }),
            unit('foe', 'enemy', { at: { col: 5, row: 6 }, maxHp: 9000, weapon: turn.WEAPON_STATS.laspistol }),
        ],
    });
    const hp = result.activations.map(a => a.snapshot.find(s => s.id === 'me').hp);
    const rises = hp.filter((v, i) => i > 0 && v > hp[i - 1]).length;
    assert.equal(rises, 1, `expected one recovery, saw ${rises} in ${hp.join(',')}`);
});

test('specialties: 開場一擊 multiplies only the first attack', () => {
    const run = effects => turn.runBattle({
        board: openBoard({}), seed: 11, maxRounds: 3,
        units: [unit('me', 'crew', { accuracy: 0.95, effects }), unit('foe', 'enemy', { at: { col: 5, row: 5 }, maxHp: 9000, weapon: turn.FISTS })],
    });
    const hits = r => r.activations.filter(a => a.unitId === 'me').flatMap(a => [...a.activities]).filter(x => x.kind === 'attack');
    const boosted = hits(run([{ kind: 'first-shot', amount: 2 }]));
    const plain = hits(run(undefined));
    assert.ok(boosted[0].damage > plain[0].damage);
    assert.equal(boosted[1].damage, plain[1].damage);
});

// ---- server ---------------------------------------------------------------

function mount(file, db) {
    const handlers = {};
    const Router = () => {
        const add = method => (route, fn) => { handlers[`${method} ${route}`] = fn; };
        return { get: add('GET'), post: add('POST'), put: add('PUT'), delete: add('DELETE') };
    };
    loadTs(file, { mocks: { express: { Router }, '../db': { query: db.query, withTransaction: db.withTransaction } } });
    return async (method, route, { user = 'u1', body = {}, params = {} } = {}) => {
        const res = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
        await handlers[`${method} ${route}`]({ user: { uid: user }, body, params, query: {} }, res);
        return res;
    };
}

test('server: a specialty is picked once, needs its level, and is reported with the roster', async () => {
    process.env.V15_ECONOMY = 'on';
    const db = createFakeDb();
    const roster = mount('server/src/routes/roster.ts', db);
    const { characters } = (await roster('GET', '/')).body;
    const rifleman = characters.find(c => c.duty === 'rifleman');
    const pick = (slot, specialtyId) => roster('POST', '/characters/:id/specialties', { params: { id: rifleman.id }, body: { slot, specialtyId } });

    assert.match((await pick(0, 'steady-aim')).body.error, /Lv3/);
    db.tables.roster_characters.find(r => r.id === rifleman.id).xp = 1000; // Lv6
    const ok = await pick(0, 'steady-aim');
    assert.equal(ok.code, 200, ok.body?.error);
    assert.match((await pick(0, 'covering-advance')).body.error, /不能更改/);
    assert.match((await pick(2, 'finish-them')).body.error, /Lv9/);
    assert.equal((await pick(1, 'dig-in')).code, 200);

    const again = (await roster('GET', '/')).body.characters.find(c => c.id === rifleman.id);
    assert.deepEqual([...again.specialties], ['steady-aim', 'dig-in', null]);
});

test('server: a task carries its growth domain through create, read and update; nonsense is dropped', async () => {
    process.env.V15_ECONOMY = 'on';
    const db = createFakeDb();
    const tasks = mount('server/src/routes/tasks.ts', db);
    const base = { title: '跑步', faction: 'default', difficulty: 1, dueDate: new Date().toISOString(), createdAt: new Date().toISOString(), status: 'active', isRecurring: true };
    await tasks('POST', '/', { body: { ...base, id: 'run', domain: 'health' } });
    await tasks('POST', '/', { body: { ...base, id: 'odd', domain: 'wizardry' } });
    const read = (await tasks('GET', '/')).body;
    assert.equal(read.find(t => t.id === 'run').domain, 'health');
    assert.equal(read.find(t => t.id === 'odd').domain, undefined);
    await tasks('PUT', '/:id', { params: { id: 'run' }, body: { domain: 'learning' } });
    assert.equal(db.tables.tasks.find(t => t.id === 'run').domain, 'learning');
});
