#!/usr/bin/env node
// Supply-crate economics for operation plans (docs/campaign-and-operation-plans.md §3).
// Deterministic: every draw goes through the crate's own seeded RNG with fixed
// seed strings, so a rerun prints the same numbers.
//
//   node scripts/sim-crates.cjs
//
// Value is expressed in requisition: a catalogue item at its list price, a
// recruit at the price the recruitment centre charges, a level-4 veteran at 1.5x.

const path = require('path');
process.chdir(path.join(__dirname, '..'));
const { loadTs } = require('../tests/helpers/load-ts.cjs');
const c = loadTs('shared/progression/crates.ts');
const { CATALOG } = loadTs('shared/armory/catalog.ts');
const { RECRUITS } = loadTs('shared/roster/recruitment.ts');

const priceOf = prize => prize.kind === 'equipment'
    ? CATALOG.find(i => i.id === prize.catalogId).price
    : RECRUITS.find(r => r.id === prize.templateId).price * (prize.veteran ? 1.5 : 1);

const NONE = { equipment: [], personnel: [] };
// Everything the campaign opens by the end (docs §2.3).
const ALL = {
    equipment: ['carapace-armour', 'plasma-gun', 'heavy-weapon'],
    personnel: ['kasrkin', 'catachan-fighter', 'krieg-infantry', 'scion', 'preacher'],
};

const N = 20000;
const pct = x => `${(x * 100).toFixed(1)}%`;

function sample(level, authorized, label) {
    const counts = Object.fromEntries(c.RARITIES.map(r => [r, 0]));
    let value = 0, characters = 0;
    for (let i = 0; i < N; i += 1) {
        const prize = c.openCrate(`sim:${label}:${level}:${i}`, level, authorized);
        counts[prize.rarity] += 1;
        value += priceOf(prize);
        if (prize.kind === 'character') characters += 1;
    }
    return { counts, ev: value / N, characterShare: characters / N };
}

console.log(`# 補給箱模擬（每格 ${N} 箱，種子 sim:<授權>:<難度>:<i>）\n`);
for (const [label, authorized] of [['none', NONE], ['all', ALL]]) {
    console.log(`## 授權：${label === 'none' ? '戰役尚未開放任何受限項目' : '戰役全部開放'}\n`);
    console.log('| 難度 | 門檻 | 普通 | 精良 | 稀有 | 傳奇 | 角色占比 | 期望價值 | 每個子計畫 | 對舊制 +60 |');
    console.log('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const gate of c.DIFFICULTY_GATES) {
        const r = sample(gate.level, authorized, label);
        const share = rarity => pct(r.counts[rarity] / N);
        console.log(`| ${gate.level} | ${gate.subTasks} 項／${gate.days} 天 | ${share('common')} | ${share('fine')} | ${share('rare')} | ${share('legendary')} | ${pct(r.characterShare)} | ${r.ev.toFixed(1)} | ${(r.ev / gate.subTasks).toFixed(1)} | ×${(r.ev / 60).toFixed(2)} |`);
    }
    console.log('');
}

// Plasma: once the campaign opens it, does a crate outrun simply buying one?
// Profile: two plans closed a week, difficulty mix below. Buying assumes the
// requisition the design already pays (three cores a day = +210/week) with
// nothing else spent — the fastest a player could afford it.
const MIX = [[1, 0.4], [2, 0.3], [3, 0.2], [4, 0.07], [5, 0.03]];
const PLANS_PER_WEEK = 2;
const pickLevel = roll => { let edge = 0; for (const [level, w] of MIX) { edge += w; if (roll < edge) return level; } return 1; };
const weeks = [];
for (let player = 0; player < 2000; player += 1) {
    const rng = c.seededRandom(`sim:profile:${player}`);
    let week = 0, got = false;
    while (!got && week < 520) {
        week += 1;
        for (let k = 0; k < PLANS_PER_WEEK && !got; k += 1) {
            const prize = c.openCrate(`sim:profile:${player}:${week}:${k}`, pickLevel(rng()), ALL);
            if (prize.kind === 'equipment' && prize.catalogId === 'plasma-gun') got = true;
        }
    }
    weeks.push(week);
}
weeks.sort((a, b) => a - b);
const median = weeks[Math.floor(weeks.length / 2)];
const p90 = weeks[Math.floor(weeks.length * 0.9)];
console.log('## 電漿槍：開放之後，靠補給箱多久抽到');
console.log(`每週結案 ${PLANS_PER_WEEK} 個，難度組合 ${MIX.map(([l, w]) => `D${l} ${Math.round(w * 100)}%`).join('、')}，2000 名模擬玩家`);
console.log(`- 中位數 ${median} 週，90% 在 ${p90} 週內`);
console.log(`- 對照：直接購買 240 軍需，只靠每日三核心（每週 +210）約 ${(240 / 210).toFixed(1)} 週`);
