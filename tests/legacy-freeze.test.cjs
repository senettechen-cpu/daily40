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

test('the RP armoury is retired: no purchase path, no servo skull, nothing touches tasks', () => {
    // Stronger than keeping the skull off a list: there is no RP-spending path at
    // all, so no item can mark a real-life task completed.
    assert.equal(freeze.ARMORY_ITEM_IDS, undefined);
    assert.equal(freeze.isArmoryItem, undefined);
    assert.doesNotMatch(context, /purchaseItem/);
    assert.doesNotMatch(armory, /servo_skull|伺服骷髏|modifyResources/);
    for (const source of [context, app, armory]) assert.doesNotMatch(source, /servo_skull/);
});

test('the v1.5 armoury spends requisition through the server and never writes tasks', () => {
    // The component only calls the API; the balance lives in the server ledger.
    assert.match(armory, /api\.purchaseEquipment/);
    assert.doesNotMatch(armory, /setTasks|updateTask/);
});
