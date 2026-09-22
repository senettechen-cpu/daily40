// Renders reproducible battle-test evidence: the real BattleStage component at
// chosen scenario/tick moments, as one HTML page with inline SVG plus per-unit
// state (pose, held weapon, committed weapon, slots). Output:
// docs/battle-test-evidence/index.html (open it from the repo so image paths resolve).
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('../tests/helpers/load-ts.cjs');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs', 'battle-test-evidence');
const publicFromOut = path.relative(outDir, path.join(root, 'public')).replace(/\\/g, '/') + '/';
const defines = { 'import.meta.env.BASE_URL': JSON.stringify(publicFromOut) };
const load = file => loadTs(path.join(root, file), { defines });
const e = load('src/battle/sim/engine.ts');
const s = load('src/battle/sim/scenarios.ts');
const c = load('src/battle/sprites/contract.ts');
const anim = load('src/battle/view/animation.ts');
const { BattleStage } = load('src/battle/view/BattleStage.tsx');
const rules = load('src/battle/sim/rules.ts');

function actor(id) {
    const dir = path.join(root, 'public', 'battle-assets', id);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const contracts = {};
    for (const a of manifest.actions) contracts[a.path] = JSON.parse(fs.readFileSync(path.join(dir, a.path), 'utf8'));
    return { sprites: c.buildActorSprites(id, `${publicFromOut}battle-assets/${id}/`, manifest, contracts), manifest };
}
const cad = actor('cadian'), tra = actor('traitor');
const art = { cadian: cad.sprites, traitor: tra.sprites, coverBack: `${publicFromOut}battle-assets/cadian/${cad.manifest.cover.back}`, coverFront: `${publicFromOut}battle-assets/cadian/${cad.manifest.cover.front}` };

const MOMENTS = [
    { scenario: 'standard', tick: 0, title: '部署：六名卡迪安（西，面向 SE）對六名叛軍（東，面向 NW）' },
    { scenario: 'standard', tick: 30, title: '移動中：步態依實際位移播放，前往掩體後的射擊位' },
    { scenario: 'standard', tick: 113, title: '掩體擋彈：命中判定落在掩體的射擊顯示「擊中掩體」' },
    { scenario: 'standard', tick: 275, title: '換彈：彈匣打空後縮回掩體再換彈，換彈中不射擊' },
    { scenario: 'close-assault', tick: 46, title: '切槍中（卡迪安 2，44%）：手已離開步槍，傷害來源與裝備欄仍是步槍', focus: 'crew-2' },
    { scenario: 'close-assault', tick: 52, title: '切槍完成：手持、裝備欄與射擊武器同時改為雷射手槍', focus: 'crew-2' },
    { scenario: 'close-assault', tick: 88, title: '脫離接觸後換回步槍（0.65 秒）', focus: 'crew-1' },
    { scenario: 'close-assault', tick: 999999, title: '戰鬥結束：勝負結算，不發獎勵、不扣資源' },
];

function slotText(u, slot, tick) {
    const a = u.action, swapping = a.kind === 'swap', active = u.active === slot;
    const pct = swapping ? Math.round(100 * Math.min(1, (tick - a.start) / (a.end - a.start))) : 0;
    const state = u.hp <= 0 ? '—' : swapping && a.to === slot ? `${slot === 'secondary' ? '拔出中' : '取出中'} ${pct}%` : swapping && active ? `收起中 ${pct}%` : active ? '手持' : slot === 'primary' ? '收起' : '槍套';
    return `${rules.WEAPONS[u.loadout[slot]].name} ${u.ammo[slot]}/${rules.WEAPONS[u.loadout[slot]].magazine} ${state}`;
}

const sections = MOMENTS.map((m, i) => {
    const sc = s.SCENARIOS.find(x => x.id === m.scenario);
    let previous = e.createBattle(s.setupFor(sc)), battle = previous;
    while (battle.tick < m.tick && battle.status === 'running') { previous = battle; battle = e.stepBattle(battle); }
    const svg = renderToStaticMarkup(React.createElement(BattleStage, { battle, previous, fraction: 0, art, reduced: false, selectedId: m.focus || null, onSelect: () => {} }));
    const rows = battle.units.map(u => {
        const pose = anim.poseFor(u, battle.tick, u.faction === 'cadian' ? art.cadian : art.traitor);
        return `<tr${u.id === m.focus ? ' class="focus"' : ''}><td>${u.name}</td><td>${u.hp}</td><td>${u.action.kind}</td><td>${pose.action} #${pose.frameIndex}</td><td>${c.heldWeaponId(pose.frame) ?? '（空手）'}</td><td>${u.loadout[u.active]}</td><td>${slotText(u, 'primary', battle.tick)}</td><td>${slotText(u, 'secondary', battle.tick)}</td></tr>`;
    }).join('');
    const status = { running: '進行中', victory: '勝利', defeat: '失敗', timeout: '超時' }[battle.status];
    return `<section id="m${i + 1}"><h2>${i + 1}. ${m.title}</h2><p>情境 ${sc.name}（${sc.id}）· 種子 ${sc.seed} · tick ${battle.tick}（${(battle.tick / rules.TICKS_PER_SECOND).toFixed(2)} 秒）· ${status}</p>${svg}
<table><thead><tr><th>單位</th><th>生命</th><th>模擬動作</th><th>播放動作／格</th><th>畫面手持</th><th>已提交武器</th><th>主武器槽</th><th>副武器槽</th></tr></thead><tbody>${rows}</tbody></table></section>`;
});

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>戰鬥測試版證據</title>
<style>body{margin:0;padding:16px;background:#0b1117;color:#d9dccf;font-family:system-ui,'Noto Sans TC',sans-serif}h1{font-size:20px}h2{font-size:16px;color:#e8d18f;margin:28px 0 4px}p{margin:0 0 8px;color:#a8b6ba;font-size:13px}
svg.bt-stage{display:block;width:100%;max-width:1100px;height:auto;border:1px solid #2d3b46}.bt-name{font-size:9px;font-weight:600;paint-order:stroke;stroke:#061011;stroke-width:2.5px}.bt-damage{font-size:11px;font-weight:700;paint-order:stroke;stroke:#061011;stroke-width:3px}
table{border-collapse:collapse;font-size:12px;margin-top:6px;max-width:1100px;width:100%}th,td{border:1px solid #2d3b46;padding:3px 6px;text-align:left}th{color:#c8b27a}tr.focus td{background:#dfbc7222;color:#fff3d6}</style></head><body>
<h1>第一階段戰鬥測試版 · 原場景證據</h1><p>由 <code>node scripts/render-battle-evidence.cjs</code> 產生：用正式 BattleStage 元件與模擬引擎，重播固定種子到指定 tick。素材為 GPT 候選包（productionReady=false），不代表美術驗收。</p>
${sections.join('\n')}</body></html>`);
console.log(`Wrote ${path.relative(root, path.join(outDir, 'index.html'))} (${MOMENTS.length} moments)`);
