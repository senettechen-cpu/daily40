// Imports GPT's report thumbnails (portraits + equipment) into public/battle-assets/report/.
// Checks every file against thumbnails-manifest.json (real WebP, declared size, byte budget)
// and copies only the thumbnails — never the original PNG sources or review sheets.
// Usage: node scripts/import-report-art.cjs [handoff folder]
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const handoff = path.resolve(root, process.argv[2] || 'handoff-assets/report-thumbnails-20260922-gpt-v1');
const target = path.join(root, 'public', 'battle-assets', 'report');
const BUDGET = { head: 30_000, half: 120_000, small: 30_000, large: 60_000 };

/** Width/height from a WebP header (VP8, VP8L or VP8X), or null when not a WebP. */
function webpSize(buf) {
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
    if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
    if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
    return null;
}

function check(rel, size, budget, errors) {
    const file = path.join(handoff, rel);
    if (!fs.existsSync(file)) return errors.push(`${rel}: missing`);
    const buf = fs.readFileSync(file);
    const actual = webpSize(buf);
    if (!actual) return errors.push(`${rel}: not a WebP`);
    if (actual[0] !== size[0] || actual[1] !== size[1]) errors.push(`${rel}: ${actual.join('x')} but manifest says ${size.join('x')}`);
    if (buf.length > budget) errors.push(`${rel}: ${buf.length} bytes exceeds ${budget}`);
}

module.exports = { webpSize };
if (require.main !== module) return;

const manifest = JSON.parse(fs.readFileSync(path.join(handoff, 'thumbnails-manifest.json'), 'utf8'));
const errors = [];
for (const p of manifest.portraits) { check(p.head, p.headSize, BUDGET.head, errors); check(p.half, p.halfSize, BUDGET.half, errors); }
for (const e of manifest.equipment) { check(e.small, e.smallSize, BUDGET.small, errors); check(e.large, e.largeSize, BUDGET.large, errors); }
for (const role of ['crew-default', 'enemy-default']) if (!manifest.portraits.some(p => p.role === role)) errors.push(`no portrait for role ${role}`);
for (const w of ['lasgun', 'laspistol']) if (!manifest.equipment.some(e => e.weaponId === w)) errors.push(`no equipment art for ${w}`);
if (errors.length) { console.error(`✖ ${errors.length} problem(s):\n  ${errors.join('\n  ')}`); process.exit(1); }

fs.rmSync(target, { recursive: true, force: true });
const files = [...manifest.portraits.flatMap(p => [p.head, p.half]), ...manifest.equipment.flatMap(e => [e.small, e.large])];
for (const rel of files) {
    fs.mkdirSync(path.dirname(path.join(target, rel)), { recursive: true });
    fs.copyFileSync(path.join(handoff, rel), path.join(target, rel));
}
// The runtime manifest drops `source`, so the page cannot be pointed at an original PNG.
const runtime = {
    schemaVersion: manifest.schemaVersion,
    portraits: manifest.portraits.map(({ source, bytes, ...p }) => p),
    equipment: manifest.equipment.map(({ source, bytes, ...e }) => e),
};
fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(runtime, null, 2));
fs.writeFileSync(path.join(target, 'SOURCE.md'), `由 \`scripts/import-report-art.cjs\` 從 \`${path.relative(root, handoff).replace(/\\/g, '/')}\` 匯入（GPT 第五輪）。請勿手動修改。\n`);
const bytes = files.reduce((sum, rel) => sum + fs.statSync(path.join(target, rel)).size, 0);
console.log(`✔ imported ${files.length} thumbnails (${(bytes / 1024).toFixed(1)} KiB) into public/battle-assets/report`);
