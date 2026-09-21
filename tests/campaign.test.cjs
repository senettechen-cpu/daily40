const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { freshCampaign, earnAction, attack, previewAttack, normalizeCampaign, tacticAvailable } = loadTs('src/game/campaign.ts');
const empty = { reserves: {}, garrisons: {}, totalActivePower: 0 };
const army = { ...empty, reserves: { guardsmen: 1, dreadnought: 1, custodes: 1 } };
test('completion events are idempotent; recurring events can earn on another day', () => {
    const first = earnAction(freshCampaign(), 'task:one:day1', 'Exercise');
    assert.equal(first.points, 1);
    assert.equal(earnAction(first, 'task:one:day1', 'Exercise'), first);
    assert.equal(earnAction(first, 'task:one:day2', 'Exercise').points, 2);
});
test('no army or AP required to preview; insufficient AP and locked command never spend', () => {
    const state = freshCampaign();
    assert.equal(tacticAvailable('recon', empty), true);
    assert.equal(tacticAvailable('armor', empty), false);
    assert.equal(attack(state, 'supply', 'recon', empty), state);
    assert.equal(attack({ ...state, points: 5 }, 'command', 'guardian', army).points, 5);
});
test('unit roles, stationed troops, and exact attack previews agree', () => {
    assert.equal(tacticAvailable('guardian', { ...empty, garrisons: { M3: { custodes: 1 } } }), true);
    const state = { ...freshCampaign(), points: 5 };
    assert.equal(previewAttack(state, 'defense', 'armor', army).gain, 70);
    const next = attack(state, 'defense', 'armor', army);
    assert.equal(next.progress.defense, 70);
    assert.equal(next.points, 3);
    assert.equal(state.progress.defense, 0);
});
test('capture bonuses, progress cap, and completed sites cannot be farmed', () => {
    let state = { ...freshCampaign(), points: 20 };
    for (let i = 0; i < 3; i++) state = attack(state, 'supply', 'infantry', army);
    assert.equal(state.progress.supply, 100);
    assert.equal(attack(state, 'supply', 'infantry', army), state);
    assert.equal(previewAttack(state, 'command', 'guardian', army).gain, 45);
    for (let i = 0; i < 2; i++) state = attack(state, 'defense', 'armor', army);
    assert.equal(previewAttack(state, 'command', 'guardian', army).gain, 55);
    for (let i = 0; i < 2; i++) state = attack(state, 'command', 'guardian', army);
    assert.equal(state.progress.command, 100);
    assert.ok(state.points >= 0);
});
test('old saves initialize safely and new saves round-trip including deduplication', () => {
    assert.equal(normalizeCampaign(undefined).points, 0);
    const state = earnAction(freshCampaign(), 'task:one', 'Read');
    const restored = normalizeCampaign(JSON.parse(JSON.stringify(state)));
    assert.equal(earnAction(restored, 'task:one', 'Read'), restored);
    assert.equal(normalizeCampaign({ points: -1, progress: { supply: 500, command: NaN } }).progress.supply, 100);
    assert.equal(normalizeCampaign({ points: -1 }).points, 0);
});
