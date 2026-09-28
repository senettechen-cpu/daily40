#!/usr/bin/env node
// The equipment value matrix. Takes a baseline squad, gives exactly one soldier
// exactly one item, and reports what that item is worth.
//
// Two numbers per item since 2026-09-28, not one. Win rate was the only measure
// while going down on a win cost nothing, which is why every tool read as
// worthless: keeping a soldier standing changed nothing the game could see. Now
// the fallen are out for the day, so survivors are the second half of an item's
// value - they are the squad you still have for the next fight.
//
//   node scripts/sim-value.cjs [battles] [preset]
//
// Reads through scripts/sim-battles.cjs with FORMAT=json so both scripts agree
// on how a battle is built and seeded.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const battles = Number(process.argv[2] || 100);
const preset = process.argv[3] || 'flak';
const SCENARIOS = ['w1-n4', 'w2-n1', 'w2-n2', 'w2-n3', 'w2-n4', 'w3-n1', 'w3-n2', 'w3-n3'];

// Who carries what: the same soldier every time, so the comparison is fair.
// c1 is a rifleman, c2 the shotgun slot, c3 the marksman slot.
const ITEMS = [
    { label: '重武器組（c2）', gear: 'c2=heavy-weapon', price: 200 },
    { label: '甲殼甲（c1）', gear: 'c1=carapace-armour', price: 160 },
    { label: '電漿槍（c1）', gear: 'c1=plasma-gun', price: 240 },
    { label: '功能改裝（c1）', gear: 'c1=function-mod', price: 60 },
    { label: '火焰器（c2）', gear: 'c2=flamer', price: 120 },
    { label: '霰彈槍（c2）', gear: 'c2=shotgun', price: 80 },
    { label: '精準雷射槍（c3）', gear: 'c3=precision-lasgun', price: 120 },
    { label: '整備一階（c1）', gear: 'c1=tuning-1', price: 40 },
    { label: '醫療工具（醫療兵）', gear: 'c4=medicae-kit', price: 80 },
    { label: '工程工具（工兵）', gear: 'c5=engineering-kit', price: 80 },
    { label: '通訊工具（中士）', gear: 'c0=vox-caster', price: 80 },
];

const run = gear => {
    const out = execFileSync(process.execPath, [
        path.join(__dirname, 'sim-battles.cjs'), SCENARIOS.join(','), preset, String(battles),
    ], { env: { ...process.env, FORMAT: 'json', ...(gear ? { GEAR: gear } : {}) }, encoding: 'utf8', maxBuffer: 1 << 24 });
    const { rows } = JSON.parse(out);
    return Object.fromEntries(rows.map(r => [r.id, r.cells[preset]]));
};

const base = run(null);
const round1 = x => Math.round(x * 10) / 10;

console.log(`# 裝備價值矩陣（每格 ${battles} 場，隊伍 ${preset}，種子 i × 7919）\n`);
console.log('勝率為百分點差；存活為勝仗中的中位存活人數差（滿編 6）。\n');
console.log(`| 裝備 | 價格 | ${SCENARIOS.join(' | ')} | 平均勝率 | 平均存活 | 每 100 軍需勝率 |`);
console.log(`| --- | ---: | ${SCENARIOS.map(() => '---:').join(' | ')} | ---: | ---: | ---: |`);
console.log(`| 基準：${preset} | — | ${SCENARIOS.map(id => `${Math.round(base[id].win * 100)}%／${base[id].survivors}`).join(' | ')} | — | — | — |`);

for (const item of ITEMS) {
    const got = run(item.gear);
    const winDeltas = SCENARIOS.map(id => (got[id].win - base[id].win) * 100);
    const lifeDeltas = SCENARIOS.map(id => got[id].survivors - base[id].survivors);
    const avgWin = winDeltas.reduce((a, b) => a + b, 0) / winDeltas.length;
    const avgLife = lifeDeltas.reduce((a, b) => a + b, 0) / lifeDeltas.length;
    const cells = SCENARIOS.map((id, i) => `${winDeltas[i] > 0 ? '+' : ''}${Math.round(winDeltas[i])}／${lifeDeltas[i] > 0 ? '+' : ''}${round1(lifeDeltas[i])}`);
    console.log(`| ${item.label} | ${item.price} | ${cells.join(' | ')} | ${avgWin > 0 ? '+' : ''}${round1(avgWin)} | ${avgLife > 0 ? '+' : ''}${round1(avgLife)} | ${round1(avgWin / item.price * 100)} |`);
}
