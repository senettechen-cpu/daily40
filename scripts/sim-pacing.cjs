#!/usr/bin/env node
// Pacing model (system review P1-5, 2026-09-27): on which day a player reaches
// each milestone, given how much they do each day. Monte Carlo over player
// days; battle outcomes come from the measured win-rate tables below (fighting
// real battles here would take hours), everything else from the game's own
// constants, so a change of price or reward shows up here at once.
//
//   node scripts/sim-pacing.cjs [runs]
//
// Assumptions, all visible below: the player buys gear in a fixed order as soon
// as they can afford it and the campaign allows it; they attack the next open
// stronghold, and replay a captured one for XP when the next is not worth it;
// a defeat ends battles for the day (the squad is wounded); every candidate's
// growth records come at the profile's daily rate.

const path = require('path');
process.chdir(path.join(__dirname, '..'));
const { loadTs } = require('../tests/helpers/load-ts.cjs');
const { LEVEL_XP, levelOf } = loadTs('shared/roster/characters.ts');
const { CATALOG } = loadTs('shared/armory/catalog.ts');
const { DEPLOYED_XP } = loadTs('shared/battle/xp.ts');
const { FIRST_CAPTURE_XP, STRONGHOLDS } = loadTs('shared/sector/campaign.ts');
const { CORE_REWARD } = loadTs('shared/rewards/dailyCore.ts');
const { LEDGER_REWARD } = loadTs('shared/rewards/ledgerRewards.ts');
const { MILESTONE_REWARD, } = loadTs('shared/rewards/projectRewards.ts');
const { STARTING_GRANT } = loadTs('shared/rewards/book.ts');
const { STAGES } = loadTs('shared/ascension/rules.ts');

// Win rates (%) by squad tier, measured 2026-09-27 with scripts/sim-battles.cjs
// at 200 battles per cell after enemy support went live (balance-decisions.md).
// 'elite' is level 10 with three specialties picked (SPEC=a).
const WIN = {
    'w1-n1': { fresh: 100, flak: 100, mix: 100, armed: 100, veteran: 100, elite: 100 },
    'w1-n2': { fresh: 90, flak: 96, mix: 97, armed: 99, veteran: 100, elite: 100 },
    'w1-n3': { fresh: 85, flak: 90, mix: 94, armed: 98, veteran: 100, elite: 100 },
    'w1-n4': { fresh: 50, flak: 61, mix: 64, armed: 69, veteran: 92, elite: 100 },
    'w2-n1': { fresh: 50, flak: 56, mix: 61, armed: 74, veteran: 96, elite: 99 },
    'w2-n2': { fresh: 10, flak: 14, mix: 18, armed: 44, veteran: 64, elite: 74 },
    'w2-n3': { fresh: 8, flak: 10, mix: 10, armed: 34, veteran: 70, elite: 95 },
    'w2-n4': { fresh: 0, flak: 0, mix: 3, armed: 23, veteran: 45, elite: 83 },
    'w3-n1': { fresh: 10, flak: 17, mix: 11, armed: 31, veteran: 81, elite: 96 },
    'w3-n2': { fresh: 5, flak: 8, mix: 5, armed: 18, veteran: 37, elite: 74 },
    'w3-n3': { fresh: 5, flak: 9, mix: 6, armed: 30, veteran: 52, elite: 69 },
    'w3-n4': { fresh: 0, flak: 0, mix: 0, armed: 2, veteran: 14, elite: 46 },
};
const ESCORT_WIN = { 'escort-1': 75, 'escort-2': 75, 'escort-3': 82 };
const STAGE_WIN = 78;

const price = id => CATALOG.find(c => c.id === id).price;
// The order a sensible player buys in, with the stronghold that must fall first.
const SHOPPING = [
    { tier: 'flak', items: Array(6).fill('flak-armour'), needs: null },
    { tier: 'mix', items: ['shotgun', 'precision-lasgun', 'vox-caster', 'medicae-kit', 'engineering-kit'], needs: null },
    { tier: 'armed-a', items: ['carapace-armour', 'carapace-armour'], needs: 'w1-n2' },
    { tier: 'armed', items: ['plasma-gun'], needs: 'w1-n4' },
    { tier: 'veteran-gear', items: ['heavy-weapon', 'carapace-armour'], needs: 'w2-n2' },
];

// `cores` is what the G1 deployment gate needs; `tasks` is how many tasks the
// day finishes. They were the same number until 2026-09-28, when every completed
// task started paying and the three-core cap stopped being the income ceiling.
// TASKS=<n> overrides tasks-per-day for every profile, to see what a longer list
// does to the pace.
const perDay = Number(process.env.TASKS);
const PROFILES = {
    light: { cores: 1.5, tasks: perDay || 1.5, ledger: 1, battles: 1, planDays: 21, growth: 1.0 },
    steady: { cores: 2.5, tasks: perDay || 2.5, ledger: 2, battles: 2, planDays: 14, growth: 1.5 },
    max: { cores: 3, tasks: perDay || 3, ledger: 3, battles: 4, planDays: 10, growth: 2.0 },
};

const order = STRONGHOLDS.map(s => s.id);

function tierOf(state) {
    const lv = levelOf(state.xp);
    if (lv >= 10) return 'elite';
    if (state.bought >= 5 && lv >= 5) return 'veteran';
    if (state.bought >= 4) return 'armed';
    if (state.bought >= 2) return 'mix';
    if (state.bought >= 1) return 'flak';
    return 'fresh';
}

function simulate(profile, random, maxDays = 400) {
    const s = { day: 0, balance: STARTING_GRANT.amount, xp: 0, bought: 0, captured: new Set(), escorts: 0, marks: {} };
    const candidates = []; // { stage, records, missionWon }
    const mark = (key) => { if (!(key in s.marks)) s.marks[key] = s.day; };
    const roll = (p) => random() * 100 < p;
    const fractional = (x) => Math.floor(x) + (random() < x - Math.floor(x) ? 1 : 0);

    for (s.day = 1; s.day <= maxDays; s.day += 1) {
        // Income: cores, the ledger, a plan's three milestones spread over it.
        const cores = fractional(profile.cores);
        s.balance += fractional(profile.tasks) * CORE_REWARD + fractional(profile.ledger) * LEDGER_REWARD;
        if (s.day % Math.round(profile.planDays / 3) === 0) s.balance += MILESTONE_REWARD;

        // Shopping.
        while (s.bought < SHOPPING.length) {
            const next = SHOPPING[s.bought];
            if (next.needs && !s.captured.has(next.needs)) break;
            const cost = next.items.reduce((sum, id) => sum + price(id), 0);
            if (s.balance < cost) break;
            s.balance -= cost;
            s.bought += 1;
            mark(`gear:${next.tier}`);
        }

        // Battles: the G1 gate needs a core; a defeat ends the day.
        if (cores > 0) {
            for (let b = 0; b < fractional(profile.battles); b += 1) {
                const tier = tierOf(s);
                // An open escort or stage mission first, then the next stronghold.
                const escortOpen = ['w1-n4', 'w2-n4', 'w3-n4'].filter(id => s.captured.has(id)).length > s.escorts;
                const training = candidates.find(c => c.stage < 5 && !c.missionWon);
                let won;
                if (escortOpen) {
                    won = roll(ESCORT_WIN[`escort-${s.escorts + 1}`]);
                    if (won) { s.escorts += 1; candidates.push({ stage: 0, records: 0, missionWon: false }); mark(`aspirant:${s.escorts}`); }
                } else if (training) {
                    won = roll(STAGE_WIN);
                    if (won) training.missionWon = true;
                } else {
                    const next = order.find(id => !s.captured.has(id) && STRONGHOLDS.find(x => x.id === id).requires.every(r => s.captured.has(r)));
                    const target = next ?? 'w1-n1';
                    won = roll(WIN[target][tier]);
                    if (won && next) { s.captured.add(next); s.xp += FIRST_CAPTURE_XP; mark(`capture:${next}`); }
                }
                s.xp += won ? DEPLOYED_XP.victory : DEPLOYED_XP.defeat;
                if (!won) break;
            }
        }
        for (const lv of [3, 6, 9, 10]) if (levelOf(s.xp) >= lv) mark(`level:${lv}`);

        // Growth records: one candidate a day, at the profile's rate.
        const growing = candidates.find(c => c.stage < 5);
        if (growing) {
            growing.records += fractional(profile.growth);
            const need = STAGES[growing.stage]?.records ?? Infinity;
            if (growing.records >= need && growing.missionWon) {
                growing.stage += 1; growing.records = 0; growing.missionWon = false;
                mark(`asc${candidates.indexOf(growing) + 1}:stage${growing.stage}`);
            }
        }
        if (s.captured.has('w3-n4') && candidates.every(c => c.stage >= 5) && candidates.length === 3) break;
    }
    return s.marks;
}

function seeded(seed) {
    let t = seed >>> 0;
    return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

const runs = Number(process.argv[2] || 300);
const MILESTONES = [
    ['gear:flak', '全隊防破片甲'], ['capture:w1-n1', '收復 1-1'], ['level:3', '全隊 Lv3（專長第 1 槽）'],
    ['capture:w1-n4', '收復 1-4（世界 1 首領）'], ['aspirant:1', '第一位候選人'], ['gear:armed', '世界 1 裝備（電漿）'],
    ['level:6', '全隊 Lv6（第 2 槽）'], ['capture:w2-n2', '收復 2-2'], ['capture:w2-n4', '收復 2-4（世界 2 首領）'],
    ['level:9', '全隊 Lv9（第 3 槽）'], ['level:10', '全隊 Lv10'], ['capture:w3-n4', '收復 3-4（最終首領）'],
    ['asc1:stage1', '第一位候選人植入第 I 階'], ['asc1:stage5', '第一位阿斯塔特授銜'],
];
const median = xs => { const a = xs.filter(x => x !== undefined).sort((p, q) => p - q); return a.length < runs / 2 ? null : a[Math.floor(a.length / 2)]; };

console.log(`# 節奏模型（每種玩家 ${runs} 次，400 天上限）\n`);
console.log('| 里程碑 | ' + Object.keys(PROFILES).map(p => `${p}（任務 ${PROFILES[p].tasks}／記帳 ${PROFILES[p].ledger}／出戰 ${PROFILES[p].battles}／成長 ${PROFILES[p].growth} 每天）`).join(' | ') + ' |');
console.log('| --- |' + ' ---: |'.repeat(Object.keys(PROFILES).length));
const results = {};
for (const [name, profile] of Object.entries(PROFILES)) {
    results[name] = Array.from({ length: runs }, (_, i) => simulate(profile, seeded((i + 1) * 7919)));
}
for (const [key, label] of MILESTONES) {
    const cells = Object.keys(PROFILES).map(name => {
        const m = median(results[name].map(r => r[key]));
        return m === null ? '> 400 天' : `第 ${m} 天`;
    });
    console.log(`| ${label} | ${cells.join(' | ')} |`);
}
console.log(`\n收入：今日核心每項 +${CORE_REWARD}、記帳每筆 +${LEDGER_REWARD}、里程碑 +${MILESTONE_REWARD}、開局 +${STARTING_GRANT.amount}。XP：勝 ${DEPLOYED_XP.victory}、敗 ${DEPLOYED_XP.defeat}、首次收復 +${FIRST_CAPTURE_XP}；Lv10 需 ${LEVEL_XP[9]} XP。`);
