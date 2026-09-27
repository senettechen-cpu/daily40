const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('./helpers/load-ts.cjs');
const { CATALOG, catalogItem } = loadTs('shared/armory/index.ts');
const { WEAPON_STATS, ARMOUR_STATS } = loadTs('shared/battle/turn/rules.ts');
const { equipmentFacts, equipmentNote, equipmentCompatibility, inventoryCount } = loadTs('src/components/armoryPresentation.ts');
const { STRONGHOLDS, strongholdState } = loadTs('shared/sector/index.ts');
const defines = { 'import.meta.env.BASE_URL': "'/'" };
const { ArmoryPanel } = loadTs('src/components/ArmoryPanel.tsx', { defines });
const { SectorCampaignPanel } = loadTs('src/components/SectorCampaign.tsx', { defines, mocks: { '../contexts/AuthContext': {}, '../services/api': {} } });
const draw = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const base = { catalog: CATALOG, items: [], authorized: [], balance: 0, characters: [], loading: false, busy: false, error: null, notice: null, onRetry() {}, onPurchase: async()=>false, onAssign: async()=>false, onSell: async()=>false };
const campaign = { strongholds: STRONGHOLDS.map(s=>({id:s.id,state:strongholdState(s,new Set()),attempts:0,defeats:0,capturedAt:null,capturedBy:[]})), service:{},recovered:false };
const sectorProps = {campaign,names:new Map(),error:null,loading:false,onRetry(){},onDeploy(){}};

test('armoury: every weapon card reads damage, shots and range from the engine', () => {
    for (const [id,w] of Object.entries(WEAPON_STATS)) {
        const facts = equipmentFacts(catalogItem(id));
        assert.equal(facts.find(f=>f.label==='基礎傷害').value,`${w.damage} × ${w.hits}`);
        assert.equal(facts.find(f=>f.label==='射程').value,`${w.range} 格`);
    }
});
test('armoury: carapace reports initiative, never the retired movement multiplier', () => {
    const d=catalogItem('carapace-armour');
    assert.equal(equipmentFacts(d).find(f=>f.label==='先攻影響').value,String(ARMOUR_STATS[d.id].initiative));
    assert.doesNotMatch(equipmentNote(d),/0\.90/);
});
test('armoury: incompatible origins and unfinished upgrades have explicit descriptions', () => {
    assert.match(equipmentCompatibility(catalogItem('astartes-boltgun')),/阿斯塔特/);
    assert.match(equipmentCompatibility(catalogItem('flak-armour')),/不適用阿斯塔特/);
    for(const d of CATALOG.filter(d=>d.category==='upgrade')) assert.match(equipmentNote(d),/尚無改裝安裝入口/);
});
test('armoury: stock distinguishes total owned from unassigned instances', () => {
    const counts=inventoryCount([{catalogId:'lasgun',assignedTo:'a'},{catalogId:'lasgun',assignedTo:null},{catalogId:'laspistol',assignedTo:null}],'lasgun');
    assert.equal(counts.total,2);assert.equal(counts.free,1);
});
test('armoury: loading does not pretend a zero balance or an empty inventory is real', () => {
    const html=draw(ArmoryPanel,{...base,catalog:[],loading:true});
    assert.match(html,/庫存待同步/);assert.match(html,/正在核對/);assert.doesNotMatch(html,/軍械庫尚無庫存/);
});
test('armoury: insufficient funds and missing authorization are visible, not tooltip-only', () => {
    const html=draw(ArmoryPanel,base);
    assert.match(html,/軍需不足/);assert.match(html,/尚未解鎖/);assert.match(html,/aria-label="採購制式雷射槍"/);
});
test('armoury: a refresh error blocks purchasing stale data and offers recovery', () => {
    const html=draw(ArmoryPanel,{...base,balance:1000,authorized:CATALOG.map(d=>d.id),error:'連線失敗'});
    assert.match(html,/操作已暫停/);assert.match(html,/重新載入/);
    const buttons=[...html.matchAll(/<button\b[^>]*aria-label="採購[^>]*>/g)].map(m=>m[0]);
    assert.equal(buttons.length,CATALOG.length);assert.ok(buttons.every(b=>b.includes('disabled')));
});
test('campaign: no default open stronghold or deploy button while loading or failed', () => {
    for(const props of [{loading:true,campaign:null},{error:'讀取失敗',campaign:null}]) {
        const html=draw(SectorCampaignPanel,{...sectorProps,...props});
        assert.doesNotMatch(html,/派遣小隊出戰|登陸場/);
    }
});
test('campaign: incomplete server progress is not replaced with invented progress', () => {
    const html=draw(SectorCampaignPanel,{...sectorProps,campaign:{...campaign,strongholds:[]}});
    assert.match(html,/沒有完整的進度紀錄/);assert.doesNotMatch(html,/派遣小隊出戰/);
});
test('campaign: full enemy stats stay hidden before the first defeat or capture', () => {
    const html=draw(SectorCampaignPanel,sectorProps);
    assert.match(html,/偵察情報/);assert.doesNotMatch(html,/class="campaign-enemy"/);
    const changed={...campaign,strongholds:campaign.strongholds.map((r,i)=>i===0?{...r,defeats:1}:r)};
    assert.match(draw(SectorCampaignPanel,{...sectorProps,campaign:changed}),/class="campaign-enemy"/);
});
test('campaign: three world banners and every referenced node icon exist', () => {
    const folder='public/battle-assets/sector/campaign/';
    for(const file of ['world-1-banner.webp','world-2-banner.webp','world-3-banner.webp','stronghold-open.svg','stronghold-locked.svg','stronghold-captured.svg','stronghold-boss.svg']) assert.ok(fs.existsSync(folder+file),file);
    const html=draw(SectorCampaignPanel,sectorProps);
    assert.equal((html.match(/class="campaign-world-banner"/g)||[]).length,3);
});
