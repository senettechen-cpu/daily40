import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Shield, ShieldAlert } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { BASE_UNITS, getGarrisonPower, UNIT_POWER, UNIT_VISUALS } from '../data/unitVisuals';
import { UnitType } from '../types';
import { UnitPortrait, UnitEmblem } from './UnitPortrait';

export function DeploymentPanel({ month }: { month: string }) {
    const { armyStrength, ownedUnits, deployUnit, recallUnit } = useGame();
    const [transfer, setTransfer] = useState<{ type: UnitType; direction: 'deploy' | 'recall'; key: number } | null>(null);
    useEffect(() => {
        if (!transfer) return;
        const timer = window.setTimeout(() => setTransfer(null), 1600);
        return () => window.clearTimeout(timer);
    }, [transfer]);
    const garrison = armyStrength.garrisons[month] || {};
    const power = getGarrisonPower(garrison, ownedUnits);
    const threat = Math.floor(500 * Math.pow(1.52, Number(month.slice(1)) - 1));
    const defended = power >= threat;
    const types = (Object.keys(UNIT_POWER) as UnitType[]).filter(type => BASE_UNITS.includes(type) || armyStrength.reserves[type] > 0 || garrison[type] > 0);
    return <div className="deployment-panel">
        <div className={`defense-readout ${defended ? 'is-defended' : ''}`}>
            <div className="defense-readout__heading">{defended ? <Shield size={22} /> : <ShieldAlert size={22} />}<span>{defended ? '防線穩固' : '等待增援'}<small>{defended ? `超過威脅 ${(power - threat).toLocaleString()} 戰力` : `還差 ${(threat - power).toLocaleString()} 戰力`}</small></span></div>
            <div className="defense-readout__numbers"><span>有效防禦 <strong>{power.toLocaleString()}</strong></span><span>星區威脅 <strong>{threat.toLocaleString()}</strong></span></div>
            <div className="defense-readout__track" role="meter" aria-label="星區防禦達成率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(power / threat * 100))}><span style={{ width: `${Math.min(100, power / threat * 100)}%` }} /></div>
            {(ownedUnits.includes('librarian') || ownedUnits.includes('barge')) && <small>已包含戰略支援資產加成</small>}
        </div>
        <div className="deployment-route"><span>預備隊</span><ArrowRight size={18} /><strong>{month} 戰區</strong><ArrowRight size={18} /><span>駐軍防線</span></div>
        <div className="deployment-grid">{types.map(type => {
            const reserve = armyStrength.reserves[type] || 0;
            const count = garrison[type] || 0;
            return <article className="deployment-card" key={type}>
                <div className="deployment-card__heading"><UnitPortrait unit={type} compact /><div><h3>{UNIT_VISUALS[type].name}</h3><small>單位戰力 {UNIT_POWER[type].toLocaleString()}</small></div><UnitEmblem unit={type} /></div>
                <div className="deployment-card__transfer"><span><small>預備</small><strong>{reserve}</strong></span><div className="deployment-card__controls"><button type="button" aria-label={`召回${UNIT_VISUALS[type].name}`} disabled={count === 0} onClick={() => { recallUnit(month, type, 1); setTransfer({ type, direction: 'recall', key: Date.now() }); }}><ArrowLeft size={16} />召回</button><button type="button" aria-label={`部署${UNIT_VISUALS[type].name}`} disabled={reserve === 0} onClick={() => { deployUnit(month, type, 1); setTransfer({ type, direction: 'deploy', key: Date.now() }); }}>部署<ArrowRight size={16} /></button></div><span><small>駐軍</small><strong>{count}</strong></span></div>
                <div className="deployment-card__feedback" aria-live="polite">{transfer?.type === type ? <span key={transfer.key} className={`transfer-feedback transfer-feedback--${transfer.direction}`}><UnitEmblem unit={type} size={16} />{transfer.direction === 'deploy' ? '已部署至戰區' : '已返回預備隊'}</span> : <span>駐軍貢獻 {(count * UNIT_POWER[type]).toLocaleString()} 戰力</span>}</div>
            </article>;
        })}</div>
    </div>;
}
