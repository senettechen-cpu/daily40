const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('./helpers/load-ts.cjs');
const { WeaponEffects } = loadTs('src/battle/view/WeaponEffects.tsx');
const snapshot = [{ id: 'a', at: { col: 0, row: 0 }, hp: 100, down: false }, { id: 'b', at: { col: 2, row: 2 }, hp: 100, down: false }];
function draw(activity, options = {}) {
    return renderToStaticMarkup(React.createElement(WeaponEffects, {
        event: { unitId: 'a', round: 1, reason: '', activities: [activity], snapshot },
        snapshot, speed: 1, paused: false, reduced: false, ...options,
    }));
}
for (const type of ['las', 'ballistic', 'bolt', 'plasma', 'flame', 'melee']) {
    test(`weapon VFX: ${type} uses its own style and recorded shot count`, () => {
        const html = draw({ kind: 'attack', targetId: 'b', weapon: 'test', damageType: type, hits: 1, damage: 20, shots: [false, true] });
        assert.equal((html.match(new RegExp(`fx-shot fx-${type}`, 'g')) ?? []).length, 2);
        assert.equal((html.match(/class="fx-impact"/g) ?? []).length, 1);
        assert.match(html, /命中 1/);
    });
}
test('weapon VFX: all misses produce no target impact and no fake damage number', () => {
    const html = draw({ kind: 'attack', targetId: 'b', weapon: 'test', damageType: 'las', hits: 0, damage: 0, shots: [false, false] });
    assert.doesNotMatch(html, /class="fx-impact"/);
    assert.match(html, /未命中/);
});
test('weapon VFX: reduced motion keeps textual result, removes rays and flashes', () => {
    const html = draw({ kind: 'attack', targetId: 'b', weapon: 'pistol', damageType: 'las', weaponSlot: 'sidearm', hits: 1, damage: 20, shots: [true] }, { reduced: true, paused: true });
    assert.doesNotMatch(html, /<line|fx-muzzle|fx-impact/);
    assert.match(html, /切換副武器/);
    assert.match(html, /reduced paused/);
});
test('weapon VFX: missing targets never crash playback', () => {
    assert.doesNotThrow(() => draw({ kind: 'attack', targetId: 'absent', hits: 0, damage: 0, weapon: 'none' }));
});
