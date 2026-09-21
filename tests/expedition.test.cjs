const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const sandbox = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/expedition/engine.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
const e = sandbox.exports;
const finish = (squad = e.DEFAULT_SQUAD, seed = 40126) => { let s = e.createBattle(squad, seed); while (s.status === 'running') s = e.stepBattle(s); return s; };
test('equipment permissions, unique items and deployment slots are enforced', () => {
    assert.equal(e.validateSquad(e.DEFAULT_SQUAD), '');
    assert.equal(e.compatible('medic', 'flame-01'), false);
    assert.equal(e.compatible('armsman', 'precision-01'), false);
    assert.throws(() => e.createBattle(e.DEFAULT_SQUAD.map((a, i) => i === 1 ? { ...a, equipment: 'flame-01' } : a)));
    assert.throws(() => e.createBattle(e.DEFAULT_SQUAD.map((a, i) => i === 3 ? { ...a, equipment: 'las-01' } : a)));
    assert.throws(() => e.createBattle(e.DEFAULT_SQUAD.map(a => ({ ...a, lane: 2 }))));
});
test('walls block line of sight; new battle snapshots equipment and does not mutate input', () => {
    assert.equal(e.lineOfSight({ x: 4, y: 2 }, { x: 6, y: 2 }), false);
    assert.equal(e.lineOfSight({ x: 1, y: 1 }, { x: 8, y: 1 }), true);
    const squad = e.DEFAULT_SQUAD.map(a => ({ ...a }));
    const state = e.createBattle(squad); const original = JSON.stringify(state);
    squad[0].equipment = 'flame-01';
    assert.equal(state.actors[0].weapon, 'lasgun');
    e.stepBattle(state); assert.equal(JSON.stringify(state), original);
});
test('simulation is deterministic and completed battle cannot advance again', () => {
    const a = finish(); const b = finish();
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    assert.equal(e.stepBattle(a), a);
    assert.equal(a.status, 'victory');
    assert.equal(a.beacon, 100);
    assert.equal(a.wave, 3);
    console.log('Default outcome', a.status, 'seconds', a.tick / 10, 'survivors', a.actors.filter(a => a.side === 'crew' && a.hp > 0).length);
});
test('movement never stacks living actors or enters walls; medic contributes', () => {
    let state = e.createBattle(e.DEFAULT_SQUAD);
    while (state.status === 'running') {
        state = e.stepBattle(state);
        const live = state.actors.filter(a => a.hp > 0);
        assert.equal(new Set(live.map(a => `${a.x},${a.y}`)).size, live.length);
        assert.ok(live.every(a => ![...e.WALLS, ...e.COVER].some(w => w.x === a.x && w.y === a.y)));
    }
    const wounded = e.createBattle(e.DEFAULT_SQUAD);
    wounded.actors.find(a => a.role === 'medic').hp -= 30;
    assert.equal(e.stepBattle(wounded).actors.find(a => a.role === 'medic').healing, 24);
});
test('flamer changes actual battle effects and result; each of four weapons is usable', () => {
    const flame = e.DEFAULT_SQUAD.map((a, i) => i === 0 ? { ...a, equipment: 'flame-01' } : a);
    let state = e.createBattle(flame); let sawFlame = false;
    while (state.status === 'running') { state = e.stepBattle(state); sawFlame ||= state.effects.some(effect => effect.kind === 'flame'); }
    assert.equal(sawFlame, true);
    assert.notEqual(state.actors[0].damage, finish().actors[0].damage);
    assert.equal(e.compatible('armsman', 'las-03'), true);
});
test('retreat and total incapacitation have terminal outcomes', () => {
    const state = e.createBattle(e.DEFAULT_SQUAD);
    const retreated = e.retreat(state);
    assert.equal(retreated.status, 'retreated'); assert.equal(e.stepBattle(retreated), retreated);
    state.actors.filter(a => a.side === 'crew').forEach(a => a.hp = 0);
    assert.equal(e.stepBattle(state).status, 'defeat');
});
test('1x and 2x grouped steps produce identical state at the same tick', () => {
    let normal = e.createBattle(e.DEFAULT_SQUAD); let doubled = e.createBattle(e.DEFAULT_SQUAD);
    for (let i = 0; i < 100; i++) normal = e.stepBattle(normal);
    for (let i = 0; i < 50; i++) doubled = e.stepBattle(e.stepBattle(doubled));
    assert.equal(JSON.stringify(normal), JSON.stringify(doubled));
});
test('100 fixed seeds finish; baseline team succeeds without upgrades', () => {
    let wins = 0; let totalTicks = 0;
    for (let seed = 1; seed <= 100; seed++) {
        const state = finish(e.DEFAULT_SQUAD, seed);
        wins += state.status === 'victory' ? 1 : 0; totalTicks += state.tick;
        assert.ok(state.tick <= 1800);
    }
    console.log(`Baseline balance: ${wins}/100 wins, ${(totalTicks / 1000).toFixed(1)}s mean`);
    assert.ok(wins >= 90, `Only ${wins}/100 baseline wins`);
});
test('cover protects the rear position, not its flank or the attacking side', () => {
    assert.equal(e.protectedByCover({ x: 2, y: 1 }, { x: 9, y: 1 }), true);
    assert.equal(e.protectedByCover({ x: 2, y: 1 }, { x: 0, y: 1 }), false);
    assert.equal(e.protectedByCover({ x: 2, y: 1 }, { x: 2, y: 8 }), false);
});
test('rifleman stays in useful cover and shoots instead of chasing a distant priority', () => {
    const state = e.createBattle(e.DEFAULT_SQUAD);
    const guard = { ...state.actors[0], x: 2, y: 1, weapon: 'lasgun', order: 'support' };
    const near = { ...state.actors[6], id: 'near', role: 'gunner', x: 8, y: 1, hp: 1000, maxHp: 1000 };
    const far = { ...near, id: 'far', role: 'officer', x: 15, y: 1 };
    const setup = { ...state, actors: [guard, near, far], wave: 3 };
    const destination = e.chooseFirePosition(guard, near, setup);
    assert.equal(destination.x, guard.x); assert.equal(destination.y, guard.y);
    const next = e.stepBattle(setup);
    assert.equal(next.actors[0].x, 2); assert.equal(next.actors[0].y, 1);
    assert.equal(next.actors[0].tactic, 'covered');
    assert.ok(next.effects.some(event => event.sourceId === guard.id && event.targetId === 'near'));
});
test('close melee pressure triggers a ranged escape position, not a charge', () => {
    const state = e.createBattle(e.DEFAULT_SQUAD);
    const guard = { ...state.actors[0], x: 6, y: 5, weapon: 'lasgun' };
    const raider = { ...state.actors[4], x: 7, y: 5 };
    const setup = { ...state, actors: [guard, raider] };
    const destination = e.chooseFirePosition(guard, raider, setup, true);
    assert.ok(e.distance(destination, raider) > e.distance(guard, raider));
    assert.equal(e.stepBattle(setup).actors[0].tactic, 'falling-back');
});
test('ranged attacks happen only after movement settles; default crew actually use cover', () => {
    let state = e.createBattle(e.DEFAULT_SQUAD), covered = 0, attacks = 0;
    while (state.status === 'running') {
        state = e.stepBattle(state);
        covered += state.actors.filter(a => a.side === 'crew' && a.hp > 0 && a.tactic === 'covered').length;
        for (const event of state.effects.filter(e => e.born === state.tick && !e.melee && e.kind !== 'heal')) {
            const source = state.actors.find(a => a.id === event.sourceId);
            assert.equal(source.move, 0);
            attacks++;
        }
    }
    assert.ok(covered > 100, `Only ${covered} cover actor-ticks`);
    assert.ok(attacks > 10);
    console.log('Tactical regression: covered actor-ticks', covered, 'stationary shots', attacks);
});

test('contact draws a weaker pistol, pays switch time, and restores the original primary at distance', () => {
    let s = e.createBattle(e.DEFAULT_SQUAD, 1);
    const guard = { ...s.actors[0], x: 6, y: 5, weapon: 'flamer' };
    const foe = { ...s.actors[4], x: 7, y: 5, hp: 1000, maxHp: 1000, move: 1000, cooldown: 1000 };
    s = { ...s, actors: [guard, foe], wave: 3 };
    s = e.stepBattle(s);
    assert.equal(e.activeWeapon(s.actors[0]), 'laspistol');
    assert.equal(s.effects.length, 0);
    assert.equal(s.actors[0].cooldown, 3);
    for (let i = 0; i < 3; i++) s = e.stepBattle(s);
    const shot = s.effects.find(event => event.sourceId === guard.id);
    assert.ok(shot); assert.equal(shot.weapon, 'laspistol');
    assert.notEqual(shot.kind, 'flame'); assert.ok(shot.amount <= e.SIDEARM.damage);
    assert.equal(s.actors[0].move, 0);
    for (const weapon of Object.values(e.WEAPONS)) assert.ok(e.SIDEARM.damage / e.SIDEARM.interval < weapon.damage / weapon.interval);
    s.actors[1] = { ...s.actors[1], x: 12, y: 5 };
    s = e.stepBattle(s);
    assert.equal(e.activeWeapon(s.actors[0]), 'flamer');
    assert.ok(s.actors[0].cooldown >= 4);
    assert.ok(s.log.some(line => line.includes('恢復主武器')));
});

test('sidearm hysteresis avoids repeated switching and dead enemies do not pin a soldier', () => {
    let s = e.createBattle(e.DEFAULT_SQUAD);
    s = { ...s, wave: 3, actors: [{ ...s.actors[0], x: 6, y: 5, sidearm: true, cooldown: 20 }, { ...s.actors[4], x: 8, y: 5, move: 1000, cooldown: 1000 }] };
    s = e.stepBattle(s);
    assert.equal(s.actors[0].sidearm, true);
    assert.equal(s.log.filter(line => line.includes('切換')).length, 0);
    s.actors[1].hp = 0;
    s = e.stepBattle(s);
    assert.equal(s.actors[0].sidearm, false);
});

test('rifle opens fire across the battlefield and gets repeated shots before a frontal charge closes', () => {
    let s = e.createBattle(e.DEFAULT_SQUAD, 1);
    s = { ...s, wave: 3, actors: [{ ...s.actors[0], x: 2, y: 1 }, { ...s.actors[4], x: 14, y: 1, hp: 1000, maxHp: 1000 }] };
    s = e.stepBattle(s);
    assert.ok(s.effects.some(event => event.sourceId === 'armsman' && event.weapon === 'lasgun'));
    let shots = 1, firstContact = null;
    for (let i = 0; i < 300; i++) {
        s = e.stepBattle(s);
        shots += s.effects.filter(event => event.born === s.tick && event.sourceId === 'armsman' && event.weapon === 'lasgun').length;
        if (s.actors[0].sidearm) { firstContact = s.tick; break; }
    }
    assert.ok(shots >= 6, `Only ${shots} primary shots before contact`);
    assert.ok(firstContact === null || firstContact >= 80, `Contact too early at ${firstContact}`);
});
