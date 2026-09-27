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
const specialties = loadTs('shared/roster/specialties.ts');
const catalog = loadTs('shared/armory/catalog.ts');

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
    // Into world 3: armed, plus the heavy weapon world 2 opens, a third carapace, everyone level 5.
    veteran: () => {
        const base = PRESETS.armed();
        const items = base.items
            .filter(i => !(i.assignedTo === 'c3' && i.catalogId === 'flak-armour'))
            .map(i => (i.assignedTo === 'c2' && i.catalogId === 'shotgun' ? { ...i, catalogId: 'heavy-weapon' } : i));
        items.push(gear('c3', 'carapace-armour'));
        return { members: roster.map(c => ({ ...c, xp: 700 })), items };
    },
    // Veteran, rearranged for the two-man rule (2026-09-27): the third rifleman
    // swaps the precision rifle for a plain lasgun and feeds the heavy weapon,
    // so neither the plasma gunner nor the engineer has to.
    // Level 10 with the veteran's gear: all three specialty slots open.
    elite: () => {
        const base = PRESETS.veteran();
        return { members: base.members.map(c => ({ ...c, xp: 2700 })), items: base.items };
    },
    crewed: () => {
        const base = PRESETS.veteran();
        const items = base.items.map(i => (i.assignedTo === 'c3' && i.catalogId === 'precision-lasgun' ? { ...i, catalogId: 'lasgun' } : i));
        return { members: base.members, items };
    },
};

// A stage mission is fought by a squad the candidate is in: the rifleman c3
// stands in as an Ultramarines aspirant who has implanted the stages before it.
// Their gear stays whatever the preset gave c3, so only the body changes.
const asCandidate = (scenario, members) => {
    const match = /^asc-stage-(\d)$/.exec(scenario.id);
    if (!match) return members;
    return members.map(c => (c.id === 'c3' ? { ...c, origin: 'aspirant', ascensionRoute: 'new-aspirant', ascensionStage: Number(match[1]) - 1 } : c));
};

// SPEC=a or SPEC=b gives everyone the first or second option of every slot
// their level has opened; unset, nobody has specialties (the old baseline).
const withSpecialties = members => {
    // SPEC_ONLY=id,id gives just those specialties to everyone who may take them.
    if (process.env.SPEC_ONLY) {
        const only = process.env.SPEC_ONLY.split(',');
        return members.map(c => ({
            ...c,
            specialties: [0, 1, 2].map(slot => specialties.optionsFor(c, slot).find(o => only.includes(o.id) && slot < specialties.openSlots(c.xp))?.id ?? null),
        }));
    }
    const pick = { a: 0, b: 1 }[process.env.SPEC];
    if (pick === undefined) return members;
    return members.map(c => ({
        ...c,
        specialties: [0, 1, 2].slice(0, specialties.openSlots(c.xp)).map(slot => specialties.optionsFor(c, slot)[pick].id),
    }));
};

// GEAR="c2=shotgun;c1=carapace-armour" puts one item on one soldier on top of
// the preset, replacing whatever they had in that slot (tools are added). Used
// for the equipment value matrix (docs/value-matrix.md).
const withGear = items => {
    if (!process.env.GEAR) return items;
    let out = [...items];
    for (const pair of process.env.GEAR.split(';').filter(Boolean)) {
        const [who, catalogId] = pair.split('=');
        const category = catalog.CATALOG.find(c => c.id === catalogId)?.category;
        if (!category) throw new Error(`unknown item ${catalogId}`);
        if (category !== 'tool' && category !== 'upgrade') {
            out = out.filter(i => !(i.assignedTo === who && catalog.CATALOG.find(c => c.id === i.catalogId)?.category === category));
        }
        out.push(gear(who, catalogId));
    }
    return out;
};

function crewFor(scenario, presetName) {
    const preset = PRESETS[presetName]();
    const items = withGear(preset.items);
    const members = withSpecialties(asCandidate(scenario, preset.members));
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
        const result = turn.runBattle({ board: scenario.board, units: [...crew, ...scenario.enemies], seed: i * 7919, objective: scenario.objective });
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
const presets = (presetArg || 'fresh,flak,mix,armed,veteran').split(',');
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
console.log('\n預設隊伍：fresh 起始配發（雷射槍＋手槍、無甲）；flak 再加防破片甲；mix 入門混編（霰彈、精準、三種工具、全防破片甲）；armed 世界 1 解鎖後（mix＋甲殼甲×2＋電漿槍）；veteran 進世界 3（armed＋重武器組＋甲殼甲×3、全員 Lv5）；crewed 是 veteran 但第三名步槍兵改拿普通雷射槍當重武器助手');
