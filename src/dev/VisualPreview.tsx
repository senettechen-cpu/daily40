// Development-only entry, not imported by main.tsx or included in the production HTML build.
// All interactions use disposable React state; this provider never calls the API.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, theme, Button, message } from 'antd';
import zhTW from 'antd/locale/zh_TW';
import { GameContext, GameContextType } from '../contexts/GameContext';
import { ArmyStrength, AstartesState, Project, UnitType } from '../types';
import { getGarrisonPower, getRecruitmentCost, UNIT_POWER } from '../data/unitVisuals';
import { IMPLANT_STAGES, RITUAL_ACTIVITIES } from '../data/astartesData';
import { UnitShop } from '../components/UnitShop';
import { Armory } from '../components/Armory';
import { SectorMap } from '../components/SectorMap';
import { AscensionTracker } from '../components/astartes/AscensionTracker';
import { ResourceDisplay, CorruptionGauge } from '../components/ResourceDisplay';
import '../index.css';
import '../command-deck.css';
import { useCampaign } from '../game/useCampaign';

const emptyArmy = () => Object.fromEntries(Object.keys(UNIT_POWER).map(type => [type, 0])) as Record<UnitType, number>;
const initialProjects: Project[] = [
    { id: 'p1', title: '完成年度學習計畫', month: 'M3', difficulty: 3, completed: false, subTasks: [{ id: 's1', title: '完成第一章筆記', completed: true }, { id: 's2', title: '練習專案與成果整理', completed: false }] },
    { id: 'p2', title: '建立家庭運動習慣', month: 'M3', difficulty: 2, completed: true, subTasks: [{ id: 's3', title: '本月運動八次', completed: true }] },
    { id: 'p3', title: '工作室環境整理', month: 'M9', difficulty: 2, completed: false, subTasks: [] },
];

function Preview() {
    const { campaign, earnCampaignAction, attackCampaign } = useCampaign(() => {});
    const [panel, setPanel] = useState<'map' | 'shop' | 'armory' | 'ascension'>('map');
    const [resources, setResources] = useState({ rp: 1840, glory: 4800 });
    const [corruption, setCorruption] = useState(340);
    const [projects, setProjects] = useState(initialProjects);
    const [ownedUnits, setOwnedUnits] = useState<string[]>([]);
    const [currentMonth, setCurrentMonth] = useState(2);
    const [fortifiedSectors, setFortified] = useState<string[]>(['M2']);
    const [sectorHistory, setHistory] = useState<GameContextType['sectorHistory']>({ M1: 'victory', M2: 'victory' });
    const [armyStrength, setArmy] = useState<ArmyStrength>({ reserves: { ...emptyArmy(), guardsmen: 12, space_marine: 3, custodes: 1, dreadnought: 2, wolf_guard: 1, pyroclast: 1 }, garrisons: { M3: { ...emptyArmy(), guardsmen: 4, space_marine: 1 } }, totalActivePower: 500 });
    const [astartes, setAstartes] = useState<AstartesState>({ resources: { adamantium: 560, neuroData: 640, puritySeals: 120, geneLegacy: 640 }, unlockedImplants: ['secondary-heart'], completedStages: [], ritualActivities: RITUAL_ACTIVITIES });
    const modifyResources: GameContextType['modifyResources'] = (rp, glory) => setResources(previous => ({ rp: Math.max(0, previous.rp + rp), glory: Math.max(0, previous.glory + glory) }));
    const getTraitForMonth: GameContextType['getTraitForMonth'] = month => { const count = projects.filter(project => project.month === month).length; return count === 0 ? 'barren' : count <= 2 ? 'hive' : count <= 4 ? 'shrine' : count <= 7 ? 'forge' : 'death'; };
    const unavailable = () => message.info('此項操作未包含在視覺預覽中。');
    const transfer = (month: string, type: UnitType, amount: number) => setArmy(previous => {
        const garrison = previous.garrisons[month] || emptyArmy();
        if ((amount > 0 && previous.reserves[type] < amount) || (amount < 0 && garrison[type] < -amount)) return previous;
        const garrisons = { ...previous.garrisons, [month]: { ...garrison, [type]: garrison[type] + amount } };
        return { reserves: { ...previous.reserves, [type]: previous.reserves[type] - amount }, garrisons, totalActivePower: Object.values(garrisons).reduce((sum, units) => sum + getGarrisonPower(units), 0) };
    });
    const value: GameContextType = {
        campaign, earnCampaignAction, attackCampaign: (site, tactic) => attackCampaign(site, tactic, armyStrength),
        tasks: [], allTasks: [], resources, corruption, ownedUnits, isPenitentMode: false, radarTheme: 'gold', viewMode: 'strategic', setViewMode: () => {},
        armyStrength, projects, currentMonth, getTraitForMonth, sectorHistory, fortifiedSectors, astartes,
        notificationEmail: '', emailEnabled: false, activeTacticalScan: false,
        addTask: unavailable, updateTask: unavailable, purgeTask: unavailable, deleteTask: unavailable,
        modifyResources, modifyCorruption: amount => setCorruption(previous => Math.max(0, previous + amount)),
        buyUnit: (id, cost) => { if (resources.glory >= cost && !ownedUnits.includes(id)) { modifyResources(0, -cost, 'preview'); setOwnedUnits(previous => [...previous, id]); } },
        recruitUnit: type => { const cost = getRecruitmentCost(type, getTraitForMonth(`M${new Date().getMonth() + 1}`) === 'hive'); if (resources.glory < cost) return false; modifyResources(0, -cost, 'preview'); setArmy(previous => ({ ...previous, reserves: { ...previous.reserves, [type]: previous.reserves[type] + 1 } })); return true; },
        deployUnit: transfer, recallUnit: (month, type, count) => transfer(month, type, -count),
        cleanseCorruption: () => { if (resources.rp >= 20) { modifyResources(-20, 0, 'preview'); setCorruption(previous => Math.max(0, previous - 30)); } },
        purchaseItem: (cost, id) => { if (resources.rp >= cost) { modifyResources(-cost, 0, 'preview'); if (id === 'rosarius') setCorruption(previous => Math.max(0, previous - 50)); } },
        resetGame: unavailable, activateTacticalScan: unavailable, updateSettings: unavailable, exportSTC: unavailable, importSTC: async () => { unavailable(); },
        debugSetResources: setResources, debugSetCorruption: setCorruption, debugSetArmyStrength: setArmy,
        addProject: (title, difficulty, month) => { const id = crypto.randomUUID(); setProjects(previous => [...previous, { id, title, difficulty, month, completed: false, subTasks: [] }]); return id; },
        addSubTask: (id, title) => setProjects(previous => previous.map(project => project.id === id ? { ...project, subTasks: [...project.subTasks, { id: crypto.randomUUID(), title, completed: false }] } : project)),
        completeSubTask: (id, subId) => { const task = projects.find(project => project.id === id)?.subTasks.find(task => task.id === subId); if (task && !task.completed) earnCampaignAction(`subtask:${id}:${subId}`, task.title); setProjects(previous => previous.map(project => { if (project.id !== id) return project; const subTasks = project.subTasks.map(task => task.id === subId ? { ...task, completed: true } : task); return { ...project, subTasks, completed: subTasks.every(task => task.completed) }; })); },
        updateSubTask: (id, subId, title) => setProjects(previous => previous.map(project => project.id === id ? { ...project, subTasks: project.subTasks.map(task => task.id === subId ? { ...task, title } : task) } : project)),
        deleteSubTask: (id, subId) => setProjects(previous => previous.map(project => project.id === id ? { ...project, subTasks: project.subTasks.filter(task => task.id !== subId) } : project)),
        deleteProject: id => setProjects(previous => previous.filter(project => project.id !== id)),
        advanceMonth: () => setCurrentMonth(previous => (previous + 1) % 12),
        resolveSector: month => { setHistory(previous => ({ ...previous, [month]: getGarrisonPower(armyStrength.garrisons[month] || {}, ownedUnits) >= Math.floor(500 * Math.pow(1.52, currentMonth)) ? 'victory' : 'defeat' })); setCurrentMonth(previous => (previous + 1) % 12); },
        fortifySector: month => { if (resources.rp >= 40 && !fortifiedSectors.includes(month)) { modifyResources(-40, 0, 'preview'); setFortified(previous => [...previous, month]); } },
        triggerBattlefieldMiracle: unavailable,
        modifyAstartesResources: changes => setAstartes(previous => { const updated = { ...previous.resources }; (Object.keys(updated) as (keyof typeof updated)[]).forEach(key => { updated[key] = Math.max(0, updated[key] + (changes[key] || 0)); }); return { ...previous, resources: updated }; }),
        updateAstartes: changes => setAstartes(previous => ({ ...previous, ...changes })),
        grantAscensionReward: (units, glory = 0) => { setArmy(previous => { const reserves = { ...previous.reserves }; units.forEach(type => reserves[type] += 1); return { ...previous, reserves }; }); modifyResources(0, glory, 'preview'); },
        addRitualActivity: (category, name, baseDifficulty) => setAstartes(previous => ({ ...previous, ritualActivities: { ...previous.ritualActivities!, [category]: [...previous.ritualActivities![category], { id: crypto.randomUUID(), category, name, baseDifficulty }] } })),
        updateRitualActivity: (category, id, changes) => setAstartes(previous => ({ ...previous, ritualActivities: { ...previous.ritualActivities!, [category]: previous.ritualActivities![category].map(activity => activity.id === id ? { ...activity, ...changes } : activity) } })),
        deleteRitualActivity: (category, id) => setAstartes(previous => ({ ...previous, ritualActivities: { ...previous.ritualActivities!, [category]: previous.ritualActivities![category].filter(activity => activity.id !== id) } })),
    };
    return <ConfigProvider locale={zhTW} theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: '#dfbc72', colorBgBase: '#090e15' } }}><GameContext.Provider value={value}>
        <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
            <a href="/expedition-preview.html" style={{ display: 'block', padding: '10px 18px', color: '#dfc78c', background: '#182731', borderBottom: '1px solid #405460', flexShrink: 0 }}>✦ 新試玩：虛空遠征 · 2D 編隊與武器戰鬥 →</a>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #3a4653', background: '#111a24', flexShrink: 0 }}><p className="eyebrow">視覺預覽 · 示範資料 · 重新整理即重設</p><div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginTop: 10 }}><ResourceDisplay kind="rp" value={resources.rp} compact /><ResourceDisplay kind="glory" value={resources.glory} compact /><CorruptionGauge value={corruption} canCleanse={resources.rp >= 20} onCleanse={value.cleanseCorruption} /><Button onClick={() => setPanel('shop')}>軍團徵召</Button><Button onClick={() => setPanel('armory')}>軍械庫</Button><Button onClick={() => setPanel('ascension')}>阿斯塔特飛昇</Button><Button onClick={() => { setResources({ rp: 0, glory: 0 }); setCorruption(975); }}>資源不足狀態</Button><Button onClick={() => setAstartes(previous => ({ ...previous, unlockedImplants: IMPLANT_STAGES.flatMap(stage => stage.implants.map(implant => implant.id)), completedStages: IMPLANT_STAGES.map(stage => stage.id) }))}>滿階預覽</Button></div></div>
            <div style={{ padding: '8px 18px', display: 'flex', flexWrap: 'wrap', gap: 8 }} aria-label="戰役示範任務">{['完成十分鐘運動', '整理工作桌', '閱讀一節筆記'].map((title, index) => <Button key={title} disabled={!!campaign.earned[`demo:${index}`]} onClick={() => earnCampaignAction(`demo:${index}`, title)}>完成示範：{title}</Button>)}<small>示範任務各限一次；也可在飛昇儀式獲得行動點。</small></div>
            <div style={{ flex: 1, minHeight: 0 }}><SectorMap /></div>
        </div>
        <UnitShop visible={panel === 'shop'} onClose={() => setPanel('map')} /><Armory visible={panel === 'armory'} onClose={() => setPanel('map')} /><AscensionTracker visible={panel === 'ascension'} onClose={() => setPanel('map')} />
    </GameContext.Provider></ConfigProvider>;
}

if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview />);
