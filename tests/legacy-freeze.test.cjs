const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadTs } = require('./helpers/load-ts.cjs');
const freeze = loadTs('src/game/legacyFreeze.ts');

// GameContext needs login and a server to mount, so these checks read its source:
// they pin the frozen paths so a later edit cannot silently re-enable them.
const context = fs.readFileSync('src/contexts/GameContext.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const armory = fs.readFileSync('src/components/Armory.tsx', 'utf8');
const bodyOf = (src, header) => {
    const start = src.indexOf(header);
    assert.ok(start >= 0, `missing ${header}`);
    let depth = 0;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    throw new Error(`unterminated ${header}`);
};

test('legacy penalties are frozen', () => {
    assert.equal(freeze.LEGACY_PENALTIES_FROZEN, true);
});

test('corruption engine and garrison attrition do not run while frozen', () => {
    assert.match(context, /if \(!initialized \|\| LEGACY_PENALTIES_FROZEN\) return;/);
    // The guard sits in the effect that owns the Corruption Engine tick.
    const engine = context.slice(context.indexOf('// Corruption Engine'), context.indexOf('// Penitent Mode Trigger'));
    assert.match(engine, /LEGACY_PENALTIES_FROZEN\) return;[\s\S]*const tick = \(\) =>/);
});

test('the extermination order never locks the app, and an existing lock is released and synced', () => {
    const trigger = context.slice(context.indexOf('// Penitent Mode Trigger'));
    assert.match(trigger, /if \(LEGACY_PENALTIES_FROZEN\) \{\s*if \(isPenitentMode\) \{ isDirty\.current = true; setIsPenitentMode\(false\); \}\s*return;/);
    assert.match(app, /if \(isPenitentMode && !LEGACY_PENALTIES_FROZEN\)/);
});

test('servo skull is gone: not sold, refused before any RP is spent, and purchases never touch tasks', () => {
    assert.equal(freeze.isArmoryItem('servo_skull'), false);
    for (const id of ['theme_khorne', 'rosarius', 'theme_gold']) assert.equal(freeze.isArmoryItem(id), true);
    const sold = [...armory.matchAll(/\{ id: '([a-z_]+)'/g)].map(m => m[1]);
    assert.deepEqual(sold, [...freeze.ARMORY_ITEM_IDS]);
    assert.doesNotMatch(armory, /servo_skull|伺服骷髏/);
    const purchase = bodyOf(context, 'const purchaseItem = ');
    assert.ok(purchase.indexOf('isArmoryItem(type)') < purchase.indexOf('modifyResources('), 'item check must precede the RP charge');
    assert.doesNotMatch(purchase, /setTasks|updateTask|servo_skull/);
});
