import { Button, message } from 'antd';
import { Check, Plus, Shield } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { BASE_UNITS, getRecruitmentCost, UNIT_POWER, UNIT_VISUALS } from '../data/unitVisuals';
import { UnitPortrait } from './UnitPortrait';
import { ResourceDisplay } from './ResourceDisplay';

export function RecruitmentRoster({ support = false }: { support?: boolean }) {
    const { resources, armyStrength, getTraitForMonth, recruitUnit, buyUnit, ownedUnits } = useGame();
    const hive = getTraitForMonth(`M${new Date().getMonth() + 1}`) === 'hive';
    return <div className="roster">
        <div className="roster__intro"><div><span className="eyebrow">MUNITORUM / RECRUITMENT</span><h2>援軍待命</h2><p>徵召部隊加入預備隊，再前往戰略地圖部署。</p></div><ResourceDisplay kind="glory" value={resources.glory} /></div>
        {hive && <p className="roster__notice">巢都補給生效 · 帝國衛隊徵召費用降低 20%</p>}
        <div className="recruitment-grid">
            {BASE_UNITS.map(type => {
                const visual = UNIT_VISUALS[type];
                const cost = getRecruitmentCost(type, hive);
                const affordable = resources.glory >= cost;
                return <article className="recruit-card" key={type}>
                    <UnitPortrait unit={type} />
                    <div className="recruit-card__body"><div className="recruit-card__heading"><h3>{visual.name}</h3><span>預備 {armyStrength.reserves[type] || 0}</span></div>
                        <p className="recruit-card__power"><Shield size={14} /> 單位戰力 <strong>{UNIT_POWER[type].toLocaleString()}</strong></p>
                        <div className="recruit-card__footer"><span><strong>{cost.toLocaleString()}</strong> GLORY</span><Button disabled={!affordable} icon={<Plus size={14} />} onClick={() => {
                            if (recruitUnit(type)) message.success(`${visual.name}已加入預備隊`);
                        }}>徵召</Button></div>
                        <small>{affordable ? '可重複徵召 · 每次 1 單位' : `尚需 ${(cost - resources.glory).toLocaleString()} 榮耀`}</small>
                    </div>
                </article>;
            })}
        </div>
        {support && <><div className="roster__section"><span className="eyebrow">STRATEGIC ASSETS</span><h3>戰略支援</h3><p>一次取得的支援資產，與可部署部隊分開管理。</p></div><div className="recruitment-grid">
            {(['librarian', 'barge'] as const).map(type => {
                const cost = type === 'librarian' ? 100 : 500;
                const owned = ownedUnits.includes(type);
                return <article key={type} className={`recruit-card ${owned ? 'recruit-card--owned' : ''}`}><UnitPortrait unit={type} /><div className="recruit-card__body"><h3>{UNIT_VISUALS[type].name}</h3><p>{type === 'librarian' ? '靈能戰術中樞' : '高軌道艦隊支援'}</p><div className="recruit-card__footer"><span><strong>{cost}</strong> GLORY</span><Button disabled={owned || resources.glory < cost} icon={owned ? <Check size={14} /> : <Plus size={14} />} onClick={() => buyUnit(type, cost)}>{owned ? '已取得' : '取得支援'}</Button></div></div></article>;
            })}
        </div></>}
    </div>;
}
