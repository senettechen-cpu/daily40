const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const cache = new Map();
function load(file) {
    if (cache.has(file)) return cache.get(file);
    const box = { exports: {}, performance, require(id) {
        if (id.endsWith('.css')) return {};
        if (!id.startsWith('.')) return require(id);
        const base = path.resolve(path.dirname(file), id);
        return load(fs.existsSync(base + '.tsx') ? base + '.tsx' : base + '.ts');
    } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, box);
    cache.set(file, box.exports); return box.exports;
}
const root = path.resolve('src/expedition');
const e = load(path.join(root, 'engine.ts'));
const { SoldierFigure } = load(path.join(root, 'CinematicBattlefield.tsx'));
const { WeaponLoadout } = load(path.join(root, 'WeaponLoadout.tsx'));
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
