// Copies the self-contained actor folders of a GPT duel handoff into
// public/battle-assets/<actor>/, keeping only the manifest, the action
// contracts and the PNGs they reference. Every contract is validated first.
// Usage: node scripts/import-battle-assets.cjs [handoff folder]
const fs = require('node:fs');
const path = require('node:path');
const { validateSpriteContract } = require('./validate-sprites.cjs');

const root = path.resolve(__dirname, '..');
const handoff = path.resolve(root, process.argv[2] || 'handoff-assets/duel-complete-20260922-gpt-v2');
const target = path.join(root, 'public', 'battle-assets');
const ACTORS = { cadian: 'cadian', traitor: 'traitor' };

function importActor(name) {
    const from = path.join(handoff, ACTORS[name]);
    const manifest = JSON.parse(fs.readFileSync(path.join(from, 'manifest.json'), 'utf8'));
    const files = new Set(['manifest.json']);
    for (const action of manifest.actions) {
        const contractPath = path.join(from, action.path);
        const errors = validateSpriteContract(contractPath, { production: true });
        if (errors.length) throw new Error(`${name}/${action.path} failed validation:\n  ${errors.join('\n  ')}`);
        files.add(action.path);
        for (const asset of JSON.parse(fs.readFileSync(contractPath, 'utf8')).assets) files.add(asset.path);
    }
    for (const key of ['back', 'front']) if (manifest.cover?.[key]) files.add(manifest.cover[key]);
    const out = path.join(target, name);
    fs.rmSync(out, { recursive: true, force: true });
    let bytes = 0;
    for (const file of files) {
        fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
        fs.copyFileSync(path.join(from, file), path.join(out, file));
        bytes += fs.statSync(path.join(out, file)).size;
    }
    return { name, files: files.size, bytes };
}

const results = Object.keys(ACTORS).map(importActor);
fs.writeFileSync(path.join(target, 'SOURCE.md'),
    `由 \`scripts/import-battle-assets.cjs\` 從 \`${path.relative(root, handoff).replace(/\\/g, '/')}\` 匯入（GPT 候選包，productionReady=false）。請勿手動修改；重新匯入會覆蓋。\n`);
for (const r of results) console.log(`${r.name}: ${r.files} files, ${(r.bytes / 1024).toFixed(0)} KB`);
