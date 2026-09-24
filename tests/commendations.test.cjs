const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const u = loadTs('shared/progression/unlocks.ts');
const catalog = loadTs('shared/armory/catalog.ts');
const recruits = loadTs('shared/roster/recruitment.ts');

// Values cross the loadTs realm, so compare copies made in this one.
const plain = x => ({ equipment: [...x.equipment], personnel: [...x.personnel] });

test('commendations are cumulative and only ever add', () => {
    assert.deepEqual(plain(u.unlockedAt(0)), { equipment: [], personnel: [] });
    assert.deepEqual([...u.unlockedAt(3).equipment], ['carapace-armour']);
    assert.deepEqual([...u.unlockedAt(6).equipment], ['carapace-armour', 'plasma-gun']);
    // Nothing earned is ever lost as the count grows.
    let previous = u.unlockedAt(0);
    for (let won = 1; won <= 30; won += 1) {
        const now = u.unlockedAt(won);
        for (const id of previous.equipment) assert.ok(now.equipment.includes(id), `${id} lost at ${won}`);
        for (const id of previous.personnel) assert.ok(now.personnel.includes(id), `${id} lost at ${won}`);
        previous = now;
    }
});

test('each unlock is announced exactly once, on the victory that earns it', () => {
    const seen = [];
    for (let won = 1; won <= 30; won += 1) {
        const step = u.newlyUnlocked(won);
        for (const id of [...step.equipment, ...step.personnel]) seen.push(id);
    }
    assert.equal(new Set(seen).size, seen.length, `announced twice: ${seen}`);
    assert.deepEqual([...u.newlyUnlocked(3).equipment], ['carapace-armour']);
    assert.deepEqual(plain(u.newlyUnlocked(4)), { equipment: [], personnel: [] });
});

test('every id a commendation unlocks exists and is actually restricted', () => {
    for (const step of u.COMMENDATIONS) {
        for (const id of step.equipment ?? []) {
            const item = catalog.CATALOG.find(entry => entry.id === id);
            assert.ok(item, `unknown catalogue id ${id}`);
            assert.ok(item.restricted, `${id} is not restricted, so unlocking it means nothing`);
            assert.ok(!item.origins, `${id} is origin-locked, which a commendation cannot help with`);
        }
        for (const id of step.personnel ?? []) {
            const template = recruits.RECRUITS.find(entry => entry.id === id);
            assert.ok(template, `unknown recruit template ${id}`);
            assert.ok(template.restricted, `${id} is not restricted`);
        }
    }
});

test('the next goal is the nearest unearned one, and runs out at the end', () => {
    assert.equal(u.nextCommendation(0).victories, 3);
    assert.equal(u.nextCommendation(3).victories, 6);
    assert.equal(u.nextCommendation(999), null);
});
