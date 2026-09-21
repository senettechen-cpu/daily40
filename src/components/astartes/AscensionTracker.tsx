import { useEffect, useRef, useState } from 'react';
import { Drawer } from 'antd';
import { Check } from 'lucide-react';
import { BodyGraph } from './BodyGraph';
import { ImplantTerminal } from './ImplantTerminal';
import { useAscension } from '../../hooks/useAscension';
import { IMPLANT_STAGES } from '../../data/astartesData';
import { ResourceDisplay, ResourceKind } from '../ResourceDisplay';

interface AscensionTrackerProps { visible: boolean; onClose: () => void; }

export const AscensionTracker = ({ visible, onClose }: AscensionTrackerProps) => {
    const { astartes, currentStageId } = useAscension();
    const [highlightedImplantId, setHighlightedImplantId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'surgery' | 'rituals'>('surgery');
    const terminalRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!highlightedImplantId || activeTab !== 'surgery' || !visible) return;
        terminalRef.current?.querySelector(`[data-implant-id="${highlightedImplantId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }, [highlightedImplantId, activeTab, visible]);
    const selectImplant = (id: string) => { setHighlightedImplantId(id); };
    return <Drawer open={visible} onClose={onClose} width="100vw" className="ascension-drawer" title={<span className="eyebrow">PROJECT ASCENSION / 阿斯塔特飛昇</span>}>
        <div className="ascension-workspace">
            <div className="ascension-masthead"><div><span className="eyebrow">FROM INITIATE TO ASTARTES</span><h1>鑄造帝皇的死亡天使</h1><p>每一次日常儀式，都讓下一階段更接近。</p></div><div className="ascension-resource-row">{(['adamantium', 'neuroData', 'puritySeals', 'geneLegacy'] as ResourceKind[]).map(kind => <ResourceDisplay key={kind} kind={kind} value={astartes.resources[kind as keyof typeof astartes.resources]} compact />)}</div></div>
            <ol className="ascension-stages" aria-label="飛昇階段">{IMPLANT_STAGES.map(stage => {
                const completed = stage.implants.every(implant => astartes.unlockedImplants.includes(implant.id));
                return <li key={stage.id} className={completed ? 'is-complete' : stage.id === currentStageId ? 'is-current' : ''} aria-current={!completed && stage.id === currentStageId ? 'step' : undefined}><span>{completed ? <Check size={16} /> : String(stage.id).padStart(2, '0')}</span><div><strong>{stage.name}</strong><small>{stage.implants.filter(implant => astartes.unlockedImplants.includes(implant.id)).length} / {stage.implants.length} 植入</small></div></li>;
            })}</ol>
            <div className="ascension-panels">
                <div className="ascension-body-panel"><BodyGraph unlockedImplants={astartes.unlockedImplants} selectedImplantId={highlightedImplantId} onImplantClick={selectImplant} /></div>
                <div className="ascension-terminal-panel" ref={terminalRef}><ImplantTerminal selectedImplantId={highlightedImplantId} onSelectImplant={selectImplant} activeTab={activeTab} setActiveTab={setActiveTab} /></div>
            </div>
        </div>
    </Drawer>;
};
