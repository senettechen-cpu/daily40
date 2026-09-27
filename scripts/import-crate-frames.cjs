// Imports GPT's supply crate rarity frames into public/battle-assets/crates/.
// Copies only the four delivered SVGs; the review sheet and build script stay in
// the handoff folder. Every file is re-checked here rather than trusted from the
// manifest: a frame with a painted centre would hide the card behind it.
// Usage: node scripts/import-crate-frames.cjs [handoff folder]
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const handoff = path.resolve(root, process.argv[2] || 'handoff-assets/sector-campaign-20260927-gpt-v1');
const target = path.join(root, 'public', 'battle-assets', 'crates');

// The colour each frame must carry: border-image does not inherit the parent's
// currentColor, so the rarity colour has to live in the file (handoff README §3).
const FRAMES = {
    common: '#71717a',
    fine: '#22c55e',
    rare: '#38bdf8',
    legendary: '#fbbf24',
};
const BUDGET = 4_000;

const problems = [];
const copied = [];

fs.mkdirSync(target, { recursive: true });

for (const [rarity, colour] of Object.entries(FRAMES)) {
    const name = `crate-frame-${rarity}.svg`;
    const from = path.join(handoff, name);
    if (!fs.existsSync(from)) { problems.push(`${name}: 缺件`); continue; }

    const svg = fs.readFileSync(from, 'utf8');
    if (!svg.trimStart().startsWith('<svg')) { problems.push(`${name}: 不是 SVG`); continue; }
    if (!svg.includes('viewBox="0 0 96 96"')) { problems.push(`${name}: viewBox 不是 0 0 96 96`); continue; }
    if (!svg.includes(`color="${colour}"`)) { problems.push(`${name}: 沒有帶稀有度色 ${colour}`); continue; }
    if (!svg.includes('currentColor')) { problems.push(`${name}: 沒有用 currentColor 描邊`); continue; }
    // The nine-slice centre must stay empty, or the frame paints over the card.
    if (/<rect[^>]*\bx="(?:2[5-9]|[3-9]\d)"/.test(svg)) { problems.push(`${name}: 中央可能有圖形`); continue; }
    if (Buffer.byteLength(svg) > BUDGET) { problems.push(`${name}: ${Buffer.byteLength(svg)} bytes，超過 ${BUDGET}`); continue; }

    fs.writeFileSync(path.join(target, name), svg);
    copied.push(`${name} (${Buffer.byteLength(svg)} bytes)`);
}

fs.writeFileSync(
    path.join(target, 'SOURCE.md'),
    `由 \`scripts/import-crate-frames.cjs\` 從 \`${path.relative(root, handoff).split(path.sep).join('/')}\` 匯入（GPT，2026-09-27）。請勿手動修改。\n`,
);

for (const line of copied) console.log(`匯入 ${line}`);
if (problems.length) { for (const p of problems) console.error(`問題 ${p}`); process.exit(1); }
console.log(`${copied.length} 個外框已匯入 ${path.relative(root, target)}`);
