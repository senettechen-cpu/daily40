// Validates a sprite contract JSON (handoff-assets/.../contract/FORMAT.md, schema 1.x)
// against its PNGs. Usage: node scripts/validate-sprites.cjs <file.json> [--production]
// Fixture mode checks the format; production mode also requires a complete action.
const fs = require('node:fs');
const path = require('node:path');

const CANVAS = { width: 192, height: 192 };
const GROUND = [96, 176];
const DIRECTIONS = ['NE', 'NW', 'SE', 'SW'];
const FRAME_ANCHORS = ['ground', 'shoulder', 'triggerHand', 'supportHand', 'holster', 'sling', 'hitPoint'];
const VIEW_KINDS = ['held', 'holstered', 'slung', 'transition'];
const SLOTS = ['primary', 'secondary'];
const FORBIDDEN_MARKER_KEYS = ['damage', 'currency', 'grants', 'hit', 'amount'];
const GRIP_TOLERANCE = 1;
// Production action set from ART-HANDOFF v4 §7 (frames per direction).
const ACTIONS = {
    'idle': { frames: 4, timing: 'clock' },
    'move': { frames: 8, timing: 'distance-phase' },
    'enter-cover': { frames: 4, timing: 'engine-action' },
    'peek': { frames: 4, timing: 'engine-action' },
    'fire': { frames: 3, timing: 'engine-action' },
    'exit-cover': { frames: 4, timing: 'engine-action' },
    'reload': { frames: 8, timing: 'engine-action' },
    'swap-to-secondary': { frames: 6, timing: 'engine-action', swap: true },
    'swap-to-primary': { frames: 6, timing: 'engine-action', swap: true },
    'pistol-fire': { frames: 3, timing: 'engine-action' },
    'hit': { frames: 3, timing: 'engine-action' },
    'down': { frames: 6, timing: 'engine-action' },
};

/** Reads width, height, bit depth and colour type from a PNG header. */
function readPngHeader(file) {
    const buf = fs.readFileSync(file);
    const signature = '89504e470d0a1a0a';
    if (buf.length < 29 || buf.subarray(0, 8).toString('hex') !== signature || buf.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType: buf[25] };
}

function validateSpriteContract(jsonPath, { production = false } = {}) {
    const errors = [];
    const fail = (where, message) => errors.push(`${where}: ${message}`);
    let doc;
    try { doc = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (err) { return [`file: cannot read JSON (${err.message})`]; }
    const baseDir = path.dirname(path.resolve(jsonPath));

    const isNum = v => typeof v === 'number' && Number.isFinite(v);
    const isPoint = v => Array.isArray(v) && v.length === 2 && v.every(isNum);
    const size = (v, where) => {
        if (!v || !Number.isInteger(v.width) || !Number.isInteger(v.height) || v.width <= 0 || v.height <= 0) { fail(where, 'must be positive integer width/height'); return null; }
        return v;
    };
    const pointIn = (p, box, where, { nullable = true } = {}) => {
        if (p === null && nullable) return;
        if (p === null || p === undefined) return fail(where, 'is required');
        if (!isPoint(p)) return fail(where, 'must be [x, y] with finite numbers');
        if (p[0] < 0 || p[1] < 0 || p[0] >= box.width || p[1] >= box.height) fail(where, `(${p}) is outside ${box.width}x${box.height}`);
    };
    // sourceRect must sit inside its atlas; trimOffset + rect must fit the untrimmed canvas.
    const placement = (item, asset, original, where) => {
        const r = item.sourceRect, t = item.trimOffset;
        if (!r || ![r.x, r.y, r.width, r.height].every(Number.isInteger) || r.width <= 0 || r.height <= 0) return fail(`${where}.sourceRect`, 'must be integer x/y/width/height with positive size');
        if (asset && (r.x < 0 || r.y < 0 || r.x + r.width > asset.width || r.y + r.height > asset.height)) fail(`${where}.sourceRect`, `exceeds asset ${asset.id} (${asset.width}x${asset.height})`);
        if (!t || !Number.isInteger(t.x) || !Number.isInteger(t.y) || t.x < 0 || t.y < 0) return fail(`${where}.trimOffset`, 'must be non-negative integers');
        if (original && (t.x + r.width > original.width || t.y + r.height > original.height)) fail(`${where}.trimOffset`, 'places the trimmed image outside the original canvas');
        if (item.atlasRotated) fail(`${where}.atlasRotated`, 'rotated atlas regions are not supported');
    };

    // Header
    if (typeof doc.schemaVersion !== 'string' || !doc.schemaVersion.startsWith('1.')) fail('schemaVersion', 'must be 1.x');
    if (!DIRECTIONS.includes(doc.direction)) fail('direction', `must be one of ${DIRECTIONS.join('/')}`);
    if (!doc.canvas || doc.canvas.width !== CANVAS.width || doc.canvas.height !== CANVAS.height) fail('canvas', `must be ${CANVAS.width}x${CANVAS.height}`);
    if (!isPoint(doc.ground) || doc.ground[0] !== GROUND[0] || doc.ground[1] !== GROUND[1]) fail('ground', `must be [${GROUND}]`);
    if (doc.coordinateSystem?.flipAllowed !== false) fail('coordinateSystem.flipAllowed', 'must be false (directions are drawn, never mirrored)');

    // Assets
    const assets = new Map();
    for (const [i, a] of (Array.isArray(doc.assets) ? doc.assets : []).entries()) {
        const where = `assets[${i}]`;
        if (!a?.id || assets.has(a.id)) { fail(where, `missing or duplicate id "${a?.id}"`); continue; }
        assets.set(a.id, a);
        if (typeof a.path !== 'string' || /^[a-z]+:/i.test(a.path) || path.isAbsolute(a.path)) { fail(`${where}.path`, 'must be a relative local path'); continue; }
        const file = path.resolve(baseDir, a.path);
        if (path.relative(baseDir, file).startsWith('..')) { fail(`${where}.path`, 'escapes the contract folder'); continue; }
        if (!fs.existsSync(file)) { fail(`${where}.path`, `file not found: ${a.path}`); continue; }
        const png = readPngHeader(file);
        if (!png) { fail(`${where}.path`, 'is not a PNG'); continue; }
        if (png.bitDepth !== 8 || png.colorType !== 6) fail(`${where}`, `must be 8-bit RGBA (got bit depth ${png.bitDepth}, colour type ${png.colorType})`);
        if (png.width !== a.width || png.height !== a.height) fail(`${where}`, `declared ${a.width}x${a.height} but PNG is ${png.width}x${png.height}`);
    }
    if (!assets.size) fail('assets', 'must list at least one asset');

    // Weapon views
    const views = new Map();
    for (const [i, v] of (Array.isArray(doc.weaponViews) ? doc.weaponViews : []).entries()) {
        const where = `weaponViews[${i}]`;
        if (!v?.id || views.has(v.id)) { fail(where, `missing or duplicate id "${v?.id}"`); continue; }
        views.set(v.id, v);
        if (!assets.has(v.assetId)) fail(`${where}.assetId`, `unknown asset "${v.assetId}"`);
        if (!VIEW_KINDS.includes(v.viewKind)) fail(`${where}.viewKind`, `must be one of ${VIEW_KINDS.join('/')}`);
        if (v.direction !== doc.direction) fail(`${where}.direction`, 'must match the contract direction');
        const original = size(v.originalSize, `${where}.originalSize`);
        placement(v, assets.get(v.assetId), original, where);
        if (original) for (const [name, p] of Object.entries(v.anchors || {})) pointIn(p, original, `${where}.anchors.${name}`);
        if (!v.anchors?.grip) fail(`${where}.anchors.grip`, 'is required');
    }

    // Timing and frames
    const frames = Array.isArray(doc.frames) ? doc.frames : [];
    const weights = doc.timing?.durationWeights;
    if (!Number.isInteger(doc.frameCount) || doc.frameCount !== frames.length) fail('frameCount', `must equal frames.length (${frames.length})`);
    if (!Array.isArray(weights) || weights.length !== frames.length) fail('timing.durationWeights', 'must have one weight per frame');
    else {
        if (!weights.every(w => isNum(w) && w > 0)) fail('timing.durationWeights', 'every weight must be a positive number');
        const sum = weights.reduce((s, w) => s + (isNum(w) ? w : 0), 0);
        if (Math.abs(sum - 1) > 1e-6) fail('timing.durationWeights', `must sum to 1 (got ${sum})`);
    }
    if (!['clock', 'distance-phase', 'engine-action'].includes(doc.timing?.mode)) fail('timing.mode', 'must be clock, distance-phase or engine-action');

    frames.forEach((f, i) => {
        const where = `frames[${i}]`;
        if (f.index !== i) fail(`${where}.index`, `must be ${i} (indices are 0-based and contiguous)`);
        for (const name of FRAME_ANCHORS) {
            if (!f.anchors || !(name in f.anchors)) fail(`${where}.anchors.${name}`, 'must be present (use null when unused)');
            else pointIn(f.anchors[name], CANVAS, `${where}.anchors.${name}`, { nullable: name !== 'ground' });
        }
        if (isPoint(f.anchors?.ground) && (f.anchors.ground[0] !== GROUND[0] || f.anchors.ground[1] !== GROUND[1])) fail(`${where}.anchors.ground`, `drifted from [${GROUND}]`);

        const refs = new Set();
        for (const [key, layer] of Object.entries(f.layers || {})) {
            if (!layer) continue;
            refs.add(`layer:${key}`);
            if (!assets.has(layer.assetId)) fail(`${where}.layers.${key}.assetId`, `unknown asset "${layer.assetId}"`);
            const original = size(layer.originalSize, `${where}.layers.${key}.originalSize`);
            if (original && (original.width !== CANVAS.width || original.height !== CANVAS.height)) fail(`${where}.layers.${key}.originalSize`, `must be ${CANVAS.width}x${CANVAS.height}`);
            placement(layer, assets.get(layer.assetId), CANVAS, `${where}.layers.${key}`);
        }

        const weapons = f.weapons;
        if (!weapons || !('held' in weapons) || !Array.isArray(weapons.stowed)) fail(`${where}.weapons`, 'must have held (object or null) and stowed (array)');
        const mounts = [['weapon:held', weapons?.held], ...(weapons?.stowed || []).map((w, k) => [`weapon:stowed:${k}`, w])];
        for (const [ref, w] of mounts) {
            if (!w) continue;
            const at = `${where}.${ref.replace(/:/g, '.')}`;
            const view = views.get(w.viewId);
            if (!view) { fail(`${at}.viewId`, `unknown weapon view "${w.viewId}"`); continue; }
            if (w.weaponId !== view.weaponId) fail(`${at}.weaponId`, `does not match view weapon "${view.weaponId}"`);
            if (!SLOTS.includes(w.equipmentSlot)) fail(`${at}.equipmentSlot`, 'must be primary or secondary');
            if (w.scale !== 1 || w.flipX !== false || w.flipY !== false) fail(at, 'scale must be 1 and flips false (no mirrored or scaled weapons)');
            if (!isNum(w.rotationDeg)) fail(`${at}.rotationDeg`, 'must be a finite number');
            if (typeof w.visible !== 'boolean') fail(`${at}.visible`, 'must be boolean');
            pointIn(w.position, CANVAS, `${at}.position`, { nullable: false });
            const origin = view.anchors?.[w.originAnchor];
            if (!isPoint(origin)) { fail(`${at}.originAnchor`, `"${w.originAnchor}" is not a set anchor on ${view.id}`); continue; }
            if (w.visible) refs.add(ref);
            // Held weapons must actually sit in the hands: grip on triggerHand, supportGrip on supportHand.
            if (ref === 'weapon:held' && w.visible && view.viewKind === 'held' && isPoint(w.position) && isNum(w.rotationDeg)) {
                const rad = w.rotationDeg * Math.PI / 180;
                const place = p => [w.position[0] + Math.cos(rad) * (p[0] - origin[0]) - Math.sin(rad) * (p[1] - origin[1]), w.position[1] + Math.sin(rad) * (p[0] - origin[0]) + Math.cos(rad) * (p[1] - origin[1])];
                const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= GRIP_TOLERANCE;
                if (isPoint(view.anchors.grip) && isPoint(f.anchors?.triggerHand) && !near(place(view.anchors.grip), f.anchors.triggerHand)) fail(`${at}`, 'grip does not land on triggerHand (tolerance 1px)');
                if (isPoint(view.anchors.supportGrip) && isPoint(f.anchors?.supportHand) && !near(place(view.anchors.supportGrip), f.anchors.supportHand)) fail(`${at}`, 'supportGrip does not land on supportHand (tolerance 1px)');
            }
        }

        const order = Array.isArray(f.drawOrder) ? f.drawOrder : [];
        if (new Set(order).size !== order.length) fail(`${where}.drawOrder`, 'lists an entry twice');
        for (const ref of refs) if (!order.includes(ref)) fail(`${where}.drawOrder`, `is missing visible "${ref}"`);
        const known = new Set([...Object.keys(f.layers || {}).map(k => `layer:${k}`), ...mounts.filter(([, w]) => w).map(([r]) => r)]);
        for (const ref of order) if (!known.has(ref)) fail(`${where}.drawOrder`, `references unknown "${ref}"`);

        for (const [k, m] of (Array.isArray(f.markers) ? f.markers : []).entries()) {
            const at = `${where}.markers[${k}]`;
            if (m?.kind !== 'visual' || typeof m.name !== 'string' || !isNum(m.phase) || m.phase < 0 || m.phase > 1) fail(at, 'must be {kind:"visual", name, phase 0..1}');
            for (const key of FORBIDDEN_MARKER_KEYS) if (m && key in m) fail(at, `must not carry "${key}"; combat results come from engine events`);
        }
    });

    // Production-only completeness
    const action = ACTIONS[doc.action];
    if (doc.productionReady === true && !production) fail('productionReady', 'true requires production validation');
    if (production) {
        if (doc.sampleKind === 'diagnostic_fixture') fail('sampleKind', 'diagnostic fixtures cannot pass production validation');
        if (doc.completeAction !== true) fail('completeAction', 'must be true for production');
        if (!action) fail('action', `must be one of ${Object.keys(ACTIONS).join(', ')}`);
        else {
            if (frames.length !== action.frames) fail('frameCount', `${doc.action} needs ${action.frames} frames`);
            if (doc.timing?.mode !== action.timing) fail('timing.mode', `${doc.action} must use ${action.timing}`);
            const usesTransition = frames.some(f => [f.weapons?.held, ...(f.weapons?.stowed || [])].some(w => w && views.get(w.viewId)?.viewKind === 'transition'));
            if (action.swap && !usesTransition) fail('weaponViews', `${doc.action} must use a transition view (no rotating a flat weapon)`);
        }
    }
    return errors;
}

module.exports = { validateSpriteContract, readPngHeader, ACTIONS };

if (require.main === module) {
    const [file, flag] = process.argv.slice(2);
    if (!file) { console.error('Usage: node scripts/validate-sprites.cjs <contract.json> [--production]'); process.exit(2); }
    const errors = validateSpriteContract(file, { production: flag === '--production' });
    if (errors.length) { console.error(`✖ ${errors.length} problem(s) in ${file}`); errors.forEach(e => console.error(`  - ${e}`)); process.exit(1); }
    console.log(`✔ ${file} passes ${flag === '--production' ? 'production' : 'format'} validation`);
}
