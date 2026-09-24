// Imports GPT's hex terrain tiles into public/battle-assets/hex/.
// Copies only the ten delivered WebPs — never the PNG sources, the review sheets
// or the build script, which stay in the handoff folder for traceability.
// Every file is re-checked here rather than trusted from the manifest.
//
// The tile is 96x112 with the walkable hex 90x104 centred inside it: the extra
// margin is bleed, so neighbouring tiles never show a seam. The 2px difference
// from the first spec (96x110) was GPT's catch; the output size is authoritative
// and the effective hex is what the engine measures.
// Usage: node scripts/import-hex-terrain.cjs [handoff folder]
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const handoff = path.resolve(root, process.argv[2] || 'handoff-assets/hex-terrain-20260925-gpt-v1');
const target = path.join(root, 'public', 'battle-assets', 'hex');

const TYPES = ['open', 'cover', 'high', 'block', 'hazard'];
const SIZES = [96, 192];
const BUDGET = { 96: 6_000, 192: 18_000 };
const HEIGHT = { 96: 112, 192: 224 };

/** Width/height from a WebP header (VP8, VP8L or VP8X), or null when not a WebP. */
function webpSize(buf) {
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
    if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
    if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
    return null;
}

const problems = [];
const copied = [];

fs.mkdirSync(target, { recursive: true });

for (const type of TYPES) {
    for (const size of SIZES) {
        const name = `hex-${type}-${size}.webp`;
        const from = path.join(handoff, name);
        if (!fs.existsSync(from)) { problems.push(`${name}: 缺件`); continue; }

        const buf = fs.readFileSync(from);
        const dimensions = webpSize(buf);
        if (!dimensions) { problems.push(`${name}: 不是有效的 WebP`); continue; }
        if (dimensions[0] !== size || dimensions[1] !== HEIGHT[size]) {
            problems.push(`${name}: 尺寸 ${dimensions.join('x')}，應為 ${size}x${HEIGHT[size]}`);
            continue;
        }
        if (buf.length > BUDGET[size]) {
            problems.push(`${name}: ${buf.length} bytes，超過 ${BUDGET[size]}`);
            continue;
        }
        // VP8X carries the alpha flag; a planet with opaque corners would show as
        // a square on the node background.
        if (buf.toString('ascii', 12, 16) === 'VP8X' && (buf.readUInt8(20) & 0x10) === 0) {
            problems.push(`${name}: 沒有透明通道`);
            continue;
        }

        fs.writeFileSync(path.join(target, name), buf);
        copied.push(`${name} (${buf.length}B)`);
    }
}

fs.writeFileSync(path.join(target, 'SOURCE.md'),
    `由 \`scripts/import-sector-planets.cjs\` 從 \`${path.relative(root, handoff).replace(/\\/g, '/')}\` 匯入（GPT，2026-09-25）。請勿手動修改。\n`);

for (const line of copied) console.log('匯入', line);
if (problems.length > 0) {
    console.error('\n未通過:');
    for (const line of problems) console.error(' ', line);
    process.exit(1);
}
console.log(`\n${copied.length} 個檔案匯入 ${path.relative(root, target).replace(/\\/g, '/')}`);
