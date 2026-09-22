const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('./helpers/load-ts.cjs');
const { webpSize } = require('../scripts/import-report-art.cjs');

const dir = 'public/battle-assets/report';
const manifest = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, 'utf8'));
const defines = { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.DEV': 'false', 'import.meta.env.VITE_BATTLE_TEST': '"on"' };
const ui = loadTs('src/battle/view/BattleReportApp.tsx', { defines });
const { resolveReportArt, NO_ART } = loadTs('src/battle/view/reportArt.ts', { defines });
const art = resolveReportArt(manifest, '/battle-assets/report/');

const snap = over => ({ id: 'crew-2', hp: 100, active: 'primary', weapon: 'lasgun', ammo: { primary: 12, secondary: 8 }, action: 'idle', swapTo: null, swapProgress: 0, reloadProgress: null, ...over });
const card = (s, a = art) => renderToStaticMarkup(React.createElement(ui.ArtContext.Provider, { value: a },
    React.createElement(ui.RosterCard, { name: '卡迪安 2', side: 'crew', snap: s, maxHp: 100 })));

test('imported thumbnails are real WebP files with the declared sizes, and the runtime manifest has no source paths', () => {
    const text = fs.readFileSync(`${dir}/manifest.json`, 'utf8');
    assert.doesNotMatch(text, /source|\.png|handoff-assets/);
    for (const p of manifest.portraits) {
        assert.deepEqual(webpSize(fs.readFileSync(path.join(dir, p.head))), p.headSize);
        assert.deepEqual(webpSize(fs.readFileSync(path.join(dir, p.half))), p.halfSize);
    }
    for (const e of manifest.equipment) {
        assert.deepEqual(webpSize(fs.readFileSync(path.join(dir, e.small))), e.smallSize);
        assert.deepEqual(webpSize(fs.readFileSync(path.join(dir, e.large))), e.largeSize);
    }
    const total = fs.readdirSync(dir, { recursive: true }).filter(f => f.endsWith('.webp')).reduce((sum, f) => sum + fs.statSync(path.join(dir, f)).size, 0);
    assert.ok(total < 150 * 1024, `${total} bytes`);
});

test('the generic Cadian rifleman portrait is not the sergeant', () => {
    const crew = manifest.portraits.find(p => p.role === 'crew-default');
    assert.equal(crew.assetId, 'cadian-rifleman');
    assert.doesNotMatch(JSON.stringify(crew), /sergeant/);
    assert.ok(art.portrait('crew').head.endsWith('cadian-rifleman-head.webp'));
    assert.ok(art.portrait('enemy').head.endsWith('traitor-guardsman-head.webp'));
});

test('the weapon card image follows the committed weapon: unchanged mid-swap, switched only after completion', () => {
    const during = card(snap({ action: 'swap', swapTo: 'secondary', swapProgress: 0.5 }));
    assert.match(during, /data-weapon-art="lasgun"/);
    assert.match(during, /equipment\/lasgun-96\.webp/);
    assert.match(during, /切換為雷射手槍 50%/);
    const after = card(snap({ active: 'secondary', weapon: 'laspistol' }));
    assert.match(after, /data-weapon-art="laspistol"/);
    assert.match(after, /雷射手槍/);
    assert.doesNotMatch(after, /lasgun-96/);
});

test('portraits keep the unit number; downed units get grayscale plus a text badge and no weapon card', () => {
    const alive = card(snap({}));
    assert.match(alive, /cadian-rifleman-head\.webp/);
    assert.match(alive, /<b>2<\/b>/);
    const down = card(snap({ hp: 0, action: 'down' }));
    assert.match(down, /br-avatar[^"]*is-down/);
    assert.match(down, />倒地</);
    assert.doesNotMatch(down, /data-weapon-art/);
});

test('without the manifest the page falls back to numbered badges and text-only weapon cards', () => {
    const html = card(snap({}), NO_ART);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /<b>2<\/b>/);
    assert.match(html, /雷射步槍/);
});

test('report UI never references original art or review sheets', () => {
    for (const file of ['src/battle/view/BattleReportApp.tsx', 'src/battle/view/reportArt.ts']) {
        assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /handoff-assets|review\.png|\.png['"`]/, file);
    }
});
