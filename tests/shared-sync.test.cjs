const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { listFiles, source, target } = require('../scripts/sync-shared.cjs');

test('server/src/shared is an exact copy of shared/ (run npm run sync:shared)', () => {
    const expected = listFiles(source).sort();
    const actual = listFiles(target).filter(file => file !== 'GENERATED.md').sort();
    assert.deepEqual(actual, expected);
    for (const file of expected) {
        assert.equal(fs.readFileSync(path.join(target, file), 'utf8'), fs.readFileSync(path.join(source, file), 'utf8'), file);
    }
});
