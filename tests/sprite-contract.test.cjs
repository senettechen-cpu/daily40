const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateSpriteContract } = require('../scripts/validate-sprites.cjs');

// GPT's two-frame diagnostic example (see tests/fixtures/sprite-contract/SOURCE.md).
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'sprite-contract');
const EXAMPLE = path.join(FIXTURE_DIR, 'animation-example.json');
const base = () => JSON.parse(fs.readFileSync(EXAMPLE, 'utf8'));

/** Writes a mutated copy of the example next to copies of its PNGs and validates it. */
function check(mutate, options) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sprite-contract-'));
    try {
        fs.cpSync(FIXTURE_DIR, dir, { recursive: true });
        const doc = base();
        mutate(doc, dir);
        const file = path.join(dir, 'animation-example.json');
        fs.writeFileSync(file, JSON.stringify(doc));
        return validateSpriteContract(file, options);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
const rejects = (mutate, pattern, options) => {
    const errors = check(mutate, options);
    assert.ok(errors.some(e => pattern.test(e)), `expected ${pattern}, got:\n${errors.join('\n') || '(no errors)'}`);
};

test('GPT example passes format validation', () => {
    assert.deepEqual(validateSpriteContract(EXAMPLE), []);
});

test('diagnostic example is refused in production mode for the right reasons', () => {
    const errors = validateSpriteContract(EXAMPLE, { production: true });
    assert.ok(errors.some(e => /diagnostic fixtures/.test(e)));
    assert.ok(errors.some(e => /completeAction/.test(e)));
    assert.ok(errors.some(e => /idle needs 4 frames/.test(e)));
});

test('images: missing file, wrong declared size, non-RGBA, path escape', () => {
    rejects(d => { d.assets[0].path = 'fixtures/nope.png'; }, /file not found/);
    rejects(d => { d.assets[0].width = 129; }, /declared 129x120 but PNG is 128x120/);
    rejects((d, dir) => {
        const png = path.join(dir, d.assets[0].path);
        const buf = fs.readFileSync(png); buf[25] = 2; fs.writeFileSync(png, buf); // colour type RGB
    }, /8-bit RGBA/);
    rejects(d => { d.assets[0].path = '../../outside.png'; }, /escapes the contract folder/);
    rejects(d => { d.assets[0].path = 'https://example.com/a.png'; }, /relative local path/);
});

test('frames and timing: duplicate index, weights not summing to 1, count mismatch', () => {
    rejects(d => { d.frames[1].index = 0; }, /frames\[1\]\.index/);
    rejects(d => { d.timing.durationWeights = [0.5, 0.6]; }, /must sum to 1/);
    rejects(d => { d.timing.durationWeights = [1, 0]; }, /positive number/);
    rejects(d => { d.frameCount = 3; }, /frameCount/);
});

test('geometry: out-of-atlas rect, out-of-canvas trimOffset, wrong canvas, bad anchors, ground drift', () => {
    rejects(d => { d.frames[0].layers.body.sourceRect.x = 100; }, /exceeds asset body/);
    rejects(d => { d.frames[0].layers.body.trimOffset.x = 150; }, /outside the original canvas/);
    rejects(d => { d.frames[0].layers.body.trimOffset.y = -1; }, /non-negative/);
    rejects(d => { d.frames[0].layers.body.originalSize = { width: 256, height: 256 }; }, /must be 192x192/);
    rejects(d => { d.canvas = { width: 256, height: 256 }; }, /^canvas/);
    rejects(d => { d.frames[0].anchors.shoulder = [200, 80]; }, /outside 192x192/);
    rejects(d => { d.frames[0].anchors.hitPoint = [NaN, 1]; }, /finite numbers/);
    rejects(d => { delete d.frames[0].anchors.sling; }, /sling: must be present/);
    rejects(d => { d.frames[1].anchors.ground = [97, 176]; }, /drifted/);
    rejects(d => { d.frames[0].anchors.ground = null; }, /ground: is required/);
});

test('weapons: dangling view, mirrored or scaled weapon, grip off the hand', () => {
    rejects(d => { d.frames[0].weapons.held.viewId = 'lasgun-transition-SE'; }, /unknown weapon view/);
    rejects(d => { d.frames[0].weapons.held.flipX = true; }, /no mirrored or scaled/);
    rejects(d => { d.frames[0].weapons.held.scale = 0.85; }, /no mirrored or scaled/);
    rejects(d => { d.frames[0].weapons.held.position = [112, 98]; }, /grip does not land on triggerHand/);
    rejects(d => { d.frames[0].weapons.held.rotationDeg = 10; }, /supportGrip does not land on supportHand/);
    rejects(d => { d.coordinateSystem.flipAllowed = true; }, /never mirrored/);
});

test('draw order must list every visible layer and weapon exactly once', () => {
    rejects(d => { d.frames[0].drawOrder = d.frames[0].drawOrder.filter(r => r !== 'layer:nearHand'); }, /missing visible "layer:nearHand"/);
    rejects(d => { d.frames[0].drawOrder.push('layer:body'); }, /twice/);
    rejects(d => { d.frames[0].drawOrder.push('layer:shadow'); }, /unknown "layer:shadow"/);
    // A hidden stowed weapon keeps its position data but need not be drawn.
    assert.deepEqual(check(d => { d.frames[0].weapons.stowed[0].visible = false; d.frames[0].drawOrder.shift(); }), []);
});

test('markers are visual only and never carry combat results', () => {
    rejects(d => { d.frames[0].markers = [{ kind: 'visual', name: 'muzzle-flash', phase: 0.5, damage: 16 }]; }, /must not carry "damage"/);
    rejects(d => { d.frames[0].markers = [{ kind: 'visual', name: 'muzzle-flash', phase: 1.5 }]; }, /phase 0\.\.1/);
    assert.deepEqual(check(d => { d.frames[0].markers = [{ kind: 'visual', name: 'muzzle-flash', phase: 0.5 }]; }), []);
});

test('production: weapon swaps must use a transition view instead of rotating a flat weapon', () => {
    const complete = d => {
        d.sampleKind = 'production'; d.completeAction = true; d.action = 'swap-to-secondary'; d.timing.mode = 'engine-action';
        while (d.frames.length < 6) d.frames.push({ ...JSON.parse(JSON.stringify(d.frames[1])), index: d.frames.length });
        d.frameCount = 6; d.timing.durationWeights = Array(6).fill(1 / 6);
    };
    rejects(complete, /must use a transition view/, { production: true });
    const withTransition = check(d => {
        complete(d);
        d.weaponViews.push({ ...JSON.parse(JSON.stringify(d.weaponViews[1])), id: 'laspistol-transition-SE', viewKind: 'transition' });
        d.frames[3].weapons.stowed[0].viewId = 'laspistol-transition-SE';
    }, { production: true });
    assert.deepEqual(withTransition, []);
});
