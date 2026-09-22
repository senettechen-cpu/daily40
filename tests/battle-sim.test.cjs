const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadTs } = require('./helpers/load-ts.cjs');
const e = loadTs('src/battle/sim/engine.ts');
const s = loadTs('src/battle/sim/scenarios.ts');
const rules = loadTs('src/battle/sim/rules.ts');
const map = loadTs('src/expedition/engine.ts');
const c = loadTs('src/battle/sprites/contract.ts');
const anim = loadTs('src/battle/view/animation.ts');

const scenario = id => s.SCENARIOS.find(x => x.id === id);
/** Steps a battle to completion, calling `each(battle)` after every tick. */
function play(setup, each = () => {}) {
    let b = e.createBattle(setup);
    while (b.status === 'running') { b = e.stepBattle(b); each(b); }
    return b;
}
const shotsOf = b => b.events.filter(x => x.kind === 'shot');
function actor(id) {
    const dir = `public/battle-assets/${id}`;
    const manifest = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, 'utf8'));
    const contracts = {};
    for (const a of manifest.actions) contracts[a.path] = JSON.parse(fs.readFileSync(`${dir}/${a.path}`, 'utf8'));
    return c.buildActorSprites(id, `${dir}/`, manifest, contracts);
}
const art = { cadian: actor('cadian'), traitor: actor('traitor') };

test('deployment: exactly six distinct lanes 1–8', () => {
    assert.equal(e.validateDeployment([1, 2, 4, 5, 7, 8]), '');
    assert.match(e.validateDeployment([1, 2, 3, 4, 5]), /6 名/);
    assert.match(e.validateDeployment([1, 1, 2, 3, 4, 5]), /只能部署一人/);
    assert.match(e.validateDeployment([0, 1, 2, 3, 4, 5]), /1–8/);
    const b = e.createBattle(s.setupFor(scenario('standard')));
    assert.equal(b.units.filter(u => u.side === 'crew').length, 6);
    assert.deepEqual([...new Set(b.units.filter(u => u.side === 'crew').map(u => u.name))].length, 6); // numbered names
});

test('every scenario finishes, and the same seed replays identically', () => {
    for (const sc of s.SCENARIOS) {
        const a = play(s.setupFor(sc)), b = play(s.setupFor(sc));
        assert.notEqual(a.status, 'running', sc.id);
        assert.equal(a.tick, b.tick, sc.id);
        assert.deepEqual(a.units.map(u => [u.id, u.hp, u.tile.x, u.tile.y]), b.units.map(u => [u.id, u.hp, u.tile.x, u.tile.y]), sc.id);
    }
});

test('hold units never cross into no man\'s land or behind the enemy line (fixed SE/NW facing)', () => {
    for (const sc of s.SCENARIOS) for (let seed = 1; seed <= 15; seed++) {
        play(s.setupFor(sc, sc.lanes, seed), b => {
            const crewX = b.units.filter(u => u.side === 'crew' && u.hp > 0).map(u => u.tile.x);
            for (const u of b.units) {
                if (u.hp <= 0 || u.order !== 'hold') continue;
                if (u.side === 'crew') assert.ok(u.tile.x <= 6, `${sc.id}/${seed} ${u.id} at x=${u.tile.x}`);
                else assert.ok(u.tile.x >= 10, `${sc.id}/${seed} ${u.id} at x=${u.tile.x}`);
            }
            for (const u of b.units.filter(x => x.side === 'enemy' && x.hp > 0)) assert.ok(crewX.every(x => u.tile.x >= x), `${u.id} flanked behind crew`);
        });
    }
});

test('ranged units do not charge: crew never ends within melee range of a ranged enemy by its own movement', () => {
    for (let seed = 1; seed <= 20; seed++) {
        play(s.setupFor(scenario('standard'), scenario('standard').lanes, seed), b => {
            for (const u of b.units.filter(x => x.side === 'crew' && x.hp > 0))
                for (const o of b.units.filter(x => x.side === 'enemy' && x.hp > 0)) assert.ok(Math.hypot(u.pos.x - o.pos.x, u.pos.y - o.pos.y) > 3, `seed ${seed}`);
        });
    }
});

test('walls block fire: every resolved shot had line of sight and was within max range', () => {
    for (const sc of s.SCENARIOS) {
        const b = play(s.setupFor(sc));
        for (const shot of shotsOf(b)) {
            assert.ok(map.lineOfSight(shot.from, shot.to), `${sc.id} shot ${shot.id} through a wall`);
            assert.ok(Math.hypot(shot.from.x - shot.to.x, shot.from.y - shot.to.y) <= rules.WEAPONS[shot.weapon].maxRange + 1e-9);
        }
    }
});

test('low cover really stops shots: covered targets are hit less, and some shots strike the sandbags', () => {
    let covered = 0, coveredHits = 0, open = 0, openHits = 0, sandbag = 0;
    for (let seed = 1; seed <= 30; seed++) {
        const b = play(s.setupFor(scenario('standard'), scenario('standard').lanes, seed));
        for (const shot of shotsOf(b)) {
            const isCovered = map.protectedByCover(shot.to, shot.from);
            if (isCovered) { covered++; if (shot.outcome === 'hit') coveredHits++; } else { open++; if (shot.outcome === 'hit') openHits++; }
            if (shot.outcome === 'cover') { sandbag++; assert.ok(isCovered, 'a cover block needs cover between shooter and target'); }
        }
    }
    assert.ok(covered > 50 && open > 50, `${covered} covered / ${open} open`);
    assert.ok(sandbag > 0);
    assert.ok(coveredHits / covered < openHits / open - 0.1, `covered ${(coveredHits / covered).toFixed(2)} vs open ${(openHits / open).toFixed(2)}`);
});

test('damage follows the v1.5 formula: rifle 13 and pistol 6 against flak armour 20', () => {
    assert.equal(rules.damageFor(rules.WEAPONS.lasgun, 20), 13);
    assert.equal(rules.damageFor(rules.WEAPONS.laspistol, 20), 6);
    assert.ok(Math.abs(rules.hitChance(0.75, rules.WEAPONS.lasgun, 13, true, false) - 0.3) < 1e-9); // 75 − 20 (beyond 12) − 25 (cover)
    assert.equal(rules.hitChance(0.1, rules.WEAPONS.lasgun, 20, true, false), 0.15);
    const b = play(s.setupFor(scenario('close-assault')));
    for (const shot of shotsOf(b).filter(x => x.outcome === 'hit')) assert.ok(shot.amount === (shot.weapon === 'lasgun' ? 13 : 6) || shot.amount < 13, `${shot.weapon} ${shot.amount}`);
});

test('swap: only melee contact triggers it; weapon, damage and slot change exactly when it completes', () => {
    let swaps = 0;
    const b = play(s.setupFor(scenario('close-assault')), battle => {
        for (const u of battle.units) {
            const a = u.action;
            if (a.kind === 'swap' && a.start === battle.tick) {
                swaps++;
                assert.equal(a.end - a.start, a.to === 'secondary' ? rules.ticks(0.45) : rules.ticks(0.65));
                if (a.to === 'secondary') assert.ok(battle.units.some(o => o.side !== u.side && o.hp > 0 && (o.order === 'assault' || u.order === 'assault') && Math.hypot(o.pos.x - u.pos.x, o.pos.y - u.pos.y) <= rules.ENGAGE_RANGE), `${u.id} swapped without contact`);
            }
            if (a.kind === 'swap') assert.notEqual(u.active, a.to, 'committed weapon changed before the swap finished');
        }
        // A shot's weapon is always the shooter's committed weapon at that moment.
        for (const shot of battle.events.filter(x => x.kind === 'shot' && x.tick === battle.tick)) {
            const shooter = battle.units.find(u => u.id === shot.sourceId);
            assert.equal(shot.weapon, shooter.loadout[shooter.active]);
        }
    });
    assert.ok(swaps >= 3);
    assert.ok(shotsOf(b).some(x => x.weapon === 'laspistol'), 'pistol fired after a completed swap');
    // Hold enemies alone never make the crew draw pistols.
    const quiet = play(s.setupFor(scenario('standard')));
    assert.equal(quiet.events.filter(x => x.kind === 'swap').length, 0);
});

test('forced swap cancels a rifle reload without refilling the magazine', () => {
    const sc = scenario('close-assault');
    let b = e.createBattle({ ...s.setupFor(sc), crewAmmo: { primary: 1 } });
    let cancelled = null;
    while (b.status === 'running' && b.tick < 400) {
        const before = b;
        b = e.stepBattle(b);
        for (const u of b.units) {
            const was = before.units.find(x => x.id === u.id);
            if (was.action.kind === 'reload' && u.action.kind !== 'reload' && u.hp > 0 && b.tick < was.action.end) {
                cancelled = { id: u.id, ammoBefore: was.ammo.primary, ammoAfter: u.ammo.primary };
            }
        }
        if (cancelled) break;
    }
    assert.ok(cancelled, 'expected an assault to interrupt a reload');
    assert.equal(cancelled.ammoAfter, cancelled.ammoBefore);
    assert.ok(b.events.some(x => x.kind === 'cancel'));
});

test('death cancels everything: no shots from the dead, a swap in progress never commits', () => {
    for (const sc of s.SCENARIOS) for (let seed = 1; seed <= 10; seed++) {
        const deadAt = new Map();
        play(s.setupFor(sc, sc.lanes, seed), b => {
            for (const u of b.units) {
                if (u.hp <= 0) {
                    if (!deadAt.has(u.id)) deadAt.set(u.id, { tick: b.tick, active: u.active });
                    assert.equal(u.action.kind, 'down');
                    assert.equal(u.active, deadAt.get(u.id).active, 'weapon changed after death');
                }
            }
            for (const shot of b.events.filter(x => x.kind === 'shot' && x.tick === b.tick)) {
                const d = deadAt.get(shot.sourceId);
                assert.ok(!d || d.tick >= b.tick, `${sc.id}/${seed}: ${shot.sourceId} fired after dying`);
            }
        });
    }
});

test('reload refills only when it completes, and never during a fire', () => {
    const b = play({ ...s.setupFor(scenario('standard')), crewAmmo: { primary: 2 } }, battle => {
        for (const u of battle.units) if (u.action.kind === 'reload') assert.ok(u.ammo[u.action.slot] < rules.WEAPONS[u.loadout[u.action.slot]].magazine);
    });
    assert.ok(b.events.some(x => x.kind === 'reload'));
});

test('animation matches state: held weapon equals the committed weapon except mid-swap; gait stops when movement stops', () => {
    for (const sc of s.SCENARIOS) {
        play(s.setupFor(sc), b => {
            for (const u of b.units) {
                const pose = anim.poseFor(u, b.tick, art[u.faction]);
                const held = c.heldWeaponId(pose.frame);
                if (u.hp > 0 && u.action.kind !== 'swap') assert.equal(held, u.loadout[u.active], `${sc.id} t${b.tick} ${u.id} ${pose.action}`);
                if (u.action.kind === 'move') assert.equal(pose.action, 'move');
                else assert.notEqual(pose.action, 'move', `${u.id} walks in place while ${u.action.kind}`);
            }
        });
    }
});

test('muzzle comes from the weapon mount, not the body centre', () => {
    const fire = art.cadian.actions.fire;
    const frame = fire.frames[1];
    const muzzle = c.muzzleOf(fire, frame);
    const view = fire.weaponViews.find(v => v.id === frame.weapons.held.viewId);
    const origin = view.anchors[frame.weapons.held.originAnchor];
    const r = frame.weapons.held.rotationDeg * Math.PI / 180, d = [view.anchors.muzzle[0] - origin[0], view.anchors.muzzle[1] - origin[1]];
    const expected = [frame.weapons.held.position[0] + Math.cos(r) * d[0] - Math.sin(r) * d[1], frame.weapons.held.position[1] + Math.sin(r) * d[0] + Math.cos(r) * d[1]];
    assert.ok(Math.abs(muzzle[0] - expected[0]) < 1e-9 && Math.abs(muzzle[1] - expected[1]) < 1e-9);
    assert.ok(muzzle[0] > 110, 'SE muzzle sits forward of the body');
    assert.equal(c.muzzleOf(art.cadian.actions.down, art.cadian.actions.down.frames[5]), null, 'no muzzle once the rifle is dropped');
});

test('frame sampling honours duration weights, distance phase and the clock', () => {
    const fire = art.cadian.actions.fire;
    assert.deepEqual([0, 0.34, 0.99, 1].map(p => c.frameAtProgress(fire, p)), [0, 1, 2, 2]);
    const move = art.cadian.actions.move;
    assert.equal(c.frameAtDistance(move, 0, 1.6), 0);
    assert.equal(c.frameAtDistance(move, 0.8, 1.6), 4);
    assert.equal(c.frameAtDistance(move, 1.6, 1.6), 0);
    const idle = art.cadian.actions.idle;
    assert.equal(c.frameAtClock(idle, 0), 0);
    assert.equal(c.frameAtClock(idle, idle.timing.nominalDurationMs), 0);
});

test('the battle test is isolated from game data', () => {
    for (const file of ['src/battle/sim/engine.ts', 'src/battle/sim/rules.ts', 'src/battle/view/BattleTestApp.tsx', 'src/battle/view/BattleStage.tsx', 'src/battle/view/animation.ts', 'src/battle/sprites/loader.ts', 'src/battle/report/report.ts', 'src/battle/view/BattleReportApp.tsx', 'src/battle/main.tsx']) {
        const code = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        assert.doesNotMatch(code, /from\s+['"][^'"]*(contexts\/|services\/|lib\/firebase|firebase)/, `${file} imports app data`);
        assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB|modifyResources|useGame\(|\bapi\./, `${file} touches app data`);
    }
});
