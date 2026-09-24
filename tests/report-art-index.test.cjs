const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadTs } = require('./helpers/load-ts.cjs');

// import.meta.env is not available outside Vite, so read the sets directly and
// rebuild the paths here. What matters is that every declared id has files.
const source = fs.readFileSync('src/data/reportArtIndex.ts', 'utf8');
const setOf = name => {
    const body = source.slice(source.indexOf(`${name} = new Set([`));
    return [...body.slice(0, body.indexOf(']')).matchAll(/'([^']+)'/g)].map(m => m[1]);
};

const PORTRAITS = 'public/battle-assets/report/portraits';
const EQUIPMENT = 'public/battle-assets/report/equipment';
const roster = loadTs('shared/roster/index.ts');

test('every declared portrait has both crops on disk', () => {
    for (const assetId of setOf('PORTRAIT_ASSETS')) {
        for (const kind of ['head', 'half']) {
            const file = path.join(PORTRAITS, `${assetId}-${kind}.webp`);
            assert.ok(fs.existsSync(file), `missing ${file}`);
        }
    }
});

test('every declared equipment art has both widths on disk', () => {
    for (const id of setOf('EQUIPMENT_ASSETS')) {
        for (const width of [96, 192]) {
            const file = path.join(EQUIPMENT, `${id}-${width}.webp`);
            assert.ok(fs.existsSync(file), `missing ${file}`);
        }
    }
});

test('every catalogue item has art, so the armoury shows no placeholders', () => {
    const armory = loadTs('shared/armory/index.ts');
    const declared = new Set(setOf('EQUIPMENT_ASSETS'));
    // CATALOG comes from the loader sandbox, so compare a plain copy.
    const missing = [...armory.CATALOG].filter(item => !declared.has(item.id)).map(item => String(item.id));
    assert.equal(missing.join(', '), '', `catalogue entries with no art: ${missing.join(', ')}`);
});

test('every starting soldier resolves to a portrait, directly or through an alias', () => {
    const declared = new Set(setOf('PORTRAIT_ASSETS'));
    const aliases = Object.fromEntries([...source.slice(source.indexOf('PORTRAIT_ALIASES'))
        .matchAll(/'([^']+)':\s*'([^']+)'/g)].map(m => [m[1], m[2]]));

    for (const template of roster.STARTING_CHARACTERS) {
        const resolved = aliases[template.assetId] ?? template.assetId;
        assert.ok(declared.has(resolved), `${template.name} (${template.assetId}) has no portrait`);
    }
});

test('the sororitas and astartes boltguns are different images, not a recolour of one file', () => {
    const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    for (const width of [96, 192]) {
        assert.notEqual(
            hash(path.join(EQUIPMENT, `sororitas-boltgun-${width}.webp`)),
            hash(path.join(EQUIPMENT, `astartes-boltgun-${width}.webp`)),
            `the two boltguns share one ${width}px file`,
        );
    }
});

test('no duty borrows the plain rifleman portrait', () => {
    const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const rifleman = hash(path.join(PORTRAITS, 'cadian-rifleman-head.webp'));
    for (const assetId of setOf('PORTRAIT_ASSETS')) {
        if (assetId === 'cadian-rifleman') continue;
        assert.notEqual(hash(path.join(PORTRAITS, `${assetId}-head.webp`)), rifleman, `${assetId} reuses the rifleman portrait`);
    }
});
