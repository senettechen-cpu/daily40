#!/usr/bin/env node
// Battle balance harness. Builds the crew exactly as the server does
// (placements → loadout → guards → heavy crews), then runs the turn engine.
// Seeds are `i × 7919`, the method recorded in docs/balance-decisions.md.
//
//   node scripts/sim-battles.cjs [scenario,...] [preset,...] [battles]
//   node scripts/sim-battles.cjs w1-n1,w1-n2 fresh,mix 200
//
// With no scenarios given it runs every scenario the engine knows.

const path = require('path');
process.chdir(path.join(__dirname, '..'));
const { loadTs } = require('../tests/helpers/load-ts.cjs');
const turn = loadTs('shared/battle/turn/index.ts');
const { STARTING_CHARACTERS } = loadTs('shared/roster/characters.ts');

const roster = STARTING_CHARACTERS.map((c, i) => ({
    id: `c${i}`, name: c.name, origin: c.origin, duty: c.duty, assetId: c.assetId, xp: 0, health: 'fit', recruitedAt: '',
}));

let itemSeq = 0;
const gear = (characterId, catalogId) => ({ id: `i${itemSeq += 1}`, catalogId, assignedTo: characterId, paid: 0, acquiredAt: '' });
const kit = extra => roster.flatMap(c => [gear(c.id, 'lasgun'), gear(c.id, 'laspistol'), ...extra(c)]);

// Squads a player plausibly fields at each stage of the campaign.
const PRESETS = {
    // A fresh account: the starting issue only (lasgun + laspistol), no armour.
    fresh: () => ({ members: roster, items: kit(() => []) }),
    // The starting issue plus a flak vest each: 360 requisition, a first purchase.
    flak: () => ({ members: roster, items: kit(c => [gear(c.id, 'flak-armour')]) }),
    // The handoff's entry mix: tools where they belong, one shotgun, one precision rifle, all flak.
    mix: () => {
        const items = roster.flatMap(c => {
            const primary = c.id === 'c2' ? 'shotgun' : c.id === 'c3' ? 'precision-lasgun' : 'lasgun';
            const tool = { sergeant: 'vox-caster', medic: 'medicae-kit', engineer: 'engineering-kit' }[c.duty];
            return [gear(c.id, primary), gear(c.id, 'laspistol'), gear(c.id, 'flak-armour'), ...(tool ? [gear(c.id, tool)] : [])];
        });
        return { members: roster, items };
    },
    // What world 1 unlocks: the mix, carapace on the two front riflemen, plasma on one.
    armed: () => {
        const base = PRESETS.mix();
        const items = base.items
            .filter(i => !(['c1', 'c2'].includes(i.assignedTo) && i.catalogId === 'flak-armour'))
            .map(i => (i.assignedTo === 'c1' && i.catalogId === 'lasgun' ? { ...i, catalogId: 'plasma-gun' } : i));
        items.push(gear('c1', 'carapace-armour'), gear('c2', 'carapace-armour'));
        return { members: roster, items };
    },
};

function crewFor(scenario, presetName) {
    const { members, items } = PRESETS[presetName]();
    const placements = turn.placementsFor(scenario.board, members, undefined);
    const built = turn.crewFor(members, items, placements);
    return turn.assignHeavyCrew(turn.resolveGuards(built.units));
}

const median = values => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};

function measure(scenario, presetName, battles) {
    const crew = crewFor(scenario, presetName);
    let won = 0, timeouts = 0;
    const rounds = [], survivors = [];
    for (let i = 1; i <= battles; i += 1) {
        const result = turn.runBattle({ board: scenario.board, units: [...crew, ...scenario.enemies], seed: i * 7919 });
        rounds.push(result.rounds);
        if (result.outcome === 'victory') {
            won += 1;
            survivors.push(result.units.filter(u => u.side === 'crew' && !u.down).length);
        }
        if (result.outcome === 'timeout') timeouts += 1;
    }
    return { win: won / battles, timeout: timeouts / battles, rounds: median(rounds), survivors: median(survivors) };
}

const [scenarioArg, presetArg, battlesArg] = process.argv.slice(2);
const scenarios = scenarioArg
    ? scenarioArg.split(',').map(id => turn.scenarioById(id) ?? (() => { throw new Error(`unknown scenario ${id}`); })())
    : turn.SCENARIOS;
const presets = (presetArg || 'fresh,flak,mix,armed').split(',');
const battles = Number(battlesArg || 200);

const pct = x => `${Math.round(x * 100)}%`;
console.log(`# 戰鬥模擬（每格 ${battles} 場，種子 i × 7919）\n`);
console.log(`| 情境 | ${presets.join(' | ')} |`);
console.log(`| --- | ${presets.map(() => '---:').join(' | ')} |`);
for (const scenario of scenarios) {
    const cells = presets.map(name => {
        const r = measure(scenario, name, battles);
        return `${pct(r.win)}（超時 ${pct(r.timeout)}，${r.rounds} 回合，存活 ${r.survivors}）`;
    });
    console.log(`| ${scenario.id} ${scenario.name} | ${cells.join(' | ')} |`);
}
console.log('\n預設隊伍：fresh 起始配發（雷射槍＋手槍、無甲）；flak 再加防破片甲；mix 入門混編（霰彈、精準、三種工具、全防破片甲）；armed 世界 1 解鎖後（mix＋甲殼甲×2＋電漿槍）');
