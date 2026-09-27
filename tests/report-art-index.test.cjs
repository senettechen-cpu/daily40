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

const SECTOR = 'public/battle-assets/sector';

test('every world type has planet art on disk, at both sizes and within budget', () => {
    // SECTOR_PLANET_TYPES is a const tuple rather than a Set, so read it directly.
    const tuple = source.slice(source.indexOf('SECTOR_PLANET_TYPES = ['));
    const types = [...tuple.slice(0, tuple.indexOf(']')).matchAll(/'([^']+)'/g)].map(m => m[1]);
    assert.ok(types.length >= 5, 'the five world types must all be declared');

    for (const type of types) {
        for (const [width, budget] of [[96, 4000], [192, 12000]]) {
            const file = path.join(SECTOR, `sector-${type}-${width}.webp`);
            assert.ok(fs.existsSync(file), `missing ${file}`);
            const buf = fs.readFileSync(file);
            assert.ok(buf.length <= budget, `${file} is ${buf.length} bytes, over ${budget}`);
            assert.equal(buf.toString('ascii', 8, 12), 'WEBP', `${file} is not a WebP`);
            // VP8X carries the alpha flag: opaque corners would show as a square.
            if (buf.toString('ascii', 12, 16) === 'VP8X') {
                assert.ok((buf.readUInt8(20) & 0x10) !== 0, `${file} has no alpha channel`);
            }
        }
    }
});

test('the world types with art are the ones the game can actually assign', () => {
    // getTraitForMonth returns exactly these; art keyed to anything else is dead.
    const assigned = ['barren', 'hive', 'shrine', 'forge', 'death'];
    const tuple = source.slice(source.indexOf('SECTOR_PLANET_TYPES = ['));
    const declared = [...tuple.slice(0, tuple.indexOf(']')).matchAll(/'([^']+)'/g)].map(m => m[1]);
    assert.deepEqual([...declared].sort(), [...assigned].sort());
});

const CRATES = 'public/battle-assets/crates';

test('every crate rarity has a frame on disk, with its colour and an empty centre', () => {
    // border-image does not inherit currentColor, so each file must carry the
    // rarity colour itself; a painted centre would cover the card.
    const colours = { common: '#71717a', fine: '#22c55e', rare: '#38bdf8', legendary: '#fbbf24' };
    const declared = setOf('CRATE_FRAMES');
    assert.deepEqual([...declared].sort(), Object.keys(colours).sort());

    for (const rarity of declared) {
        const file = path.join(CRATES, `crate-frame-${rarity}.svg`);
        assert.ok(fs.existsSync(file), `missing ${file}`);
        const svg = fs.readFileSync(file, 'utf8');
        assert.ok(svg.includes('viewBox="0 0 96 96"'), `${file} is not a 96x96 frame`);
        assert.ok(svg.includes(`color="${colours[rarity]}"`), `${file} does not carry ${colours[rarity]}`);
        assert.ok(!/<rect[^>]*\bx="(?:2[5-9]|[3-9]\d)"/.test(svg), `${file} paints inside the nine-slice centre`);
    }
});

test('the rarities with frames are the ones a crate can actually roll', () => {
    const progression = loadTs('shared/progression/index.ts');
    assert.deepEqual([...setOf('CRATE_FRAMES')].sort(), [...progression.RARITIES].sort());
});
