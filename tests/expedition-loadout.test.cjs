const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('./helpers/load-ts.cjs');
const e = loadTs('src/expedition/engine.ts');
const { SoldierFigure } = loadTs('src/expedition/CinematicBattlefield.tsx');
const { WeaponLoadout } = loadTs('src/expedition/WeaponLoadout.tsx');
test('weapon slots, portrait and hand layer switch together, then restore the original rifle', () => {
    const actor = e.createBattle(e.DEFAULT_SQUAD).actors[0];
    for (const sidearm of [false, true, false]) {
        const live = { ...actor, sidearm };
        const held = sidearm ? 'laspistol' : 'lasgun';
        const figure = renderToStaticMarkup(React.createElement(SoldierFigure, { actor: live }));
        const slots = renderToStaticMarkup(React.createElement(WeaponLoadout, { actor: live }));
        assert.ok(figure.includes(`data-hand-weapon="${held}"`));
        assert.ok(slots.includes(`data-held-weapon="${held}"`));
        assert.equal(figure.includes('data-sidearm-indicator'), sidearm);
        assert.ok(slots.includes(sidearm ? '目前手持：雷射手槍' : '目前手持：星界軍雷射步槍'));
        assert.equal((slots.match(/is-held/g) || []).length, 1);
    }
});
