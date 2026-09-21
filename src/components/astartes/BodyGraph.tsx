import { IMPLANT_STAGES } from '../../data/astartesData';
import { useAscension } from '../../hooks/useAscension';
import { RESOURCE_META, ResourceSigil } from '../ResourceDisplay';
import { Check, Lock, Crosshair } from 'lucide-react';

// Percent coordinates aligned to the bundled chamber illustration.
const IMPLANT_COORDS: Record<string, { x: number; y: number }> = {
    'catalepsean-node': { x: 49, y: 6 }, 'sus-an-membrane': { x: 51, y: 4 },
    'occulobe': { x: 47, y: 9 }, 'lymans-ear': { x: 55, y: 10 },
    'neuroglottis': { x: 50, y: 14 }, 'betchers-gland': { x: 47, y: 13 },
    'omophagea': { x: 52, y: 16 }, 'secondary-heart': { x: 56, y: 22 },
    'haemastamen': { x: 43, y: 23 }, 'multi-lung': { x: 57, y: 27 },
    'ossmodula': { x: 50, y: 19 }, 'biscopea': { x: 29, y: 35 },
    'black-carapace': { x: 50, y: 29 }, 'preomnor': { x: 46, y: 34 },
    'oolitic-kidney': { x: 56, y: 38 }, 'progenoids': { x: 50, y: 43 },
    'mucranoid': { x: 68, y: 24 }, 'melanchromic': { x: 32, y: 24 },
    'larramans-organ': { x: 42, y: 39 },
};

interface BodyGraphProps {
    unlockedImplants: string[];
    selectedImplantId: string | null;
    onImplantClick: (id: string) => void;
}

export const BodyGraph = ({ unlockedImplants, selectedImplantId, onImplantClick }: BodyGraphProps) => {
    const { astartes, currentStageId, canUnlock } = useAscension();
    const implants = IMPLANT_STAGES.flatMap(stage => stage.implants);
    const selected = implants.find(implant => implant.id === selectedImplantId) || implants.find(implant => !unlockedImplants.includes(implant.id)) || implants[0];
    const statusFor = (id: string) => {
        const implant = implants.find(item => item.id === id)!;
        if (unlockedImplants.includes(id)) return 'installed';
        if (canUnlock(implant).allowed) return 'ready';
        return IMPLANT_STAGES.find(stage => stage.implants.some(item => item.id === id))!.id > currentStageId ? 'locked' : 'insufficient';
    };
    const labels = { installed: '已植入', ready: '可植入', locked: '未開放', insufficient: '資源不足' };
    const status = statusFor(selected.id);
    const meta = RESOURCE_META[selected.cost.resource];
    const remaining = Math.max(0, selected.cost.amount - astartes.resources[selected.cost.resource]);
    return <section className="augmentation-scan">
        <div className="augmentation-scan__heading"><span className="eyebrow">BIOLOGIS / AUGMENTATION</span><span>植入 {unlockedImplants.length} / {implants.length}</span></div>
        <div className="augmentation-scan__figure">
            <svg viewBox="0 0 100 100" role="group" aria-label="阿斯塔特器官植入掃描，選取標記查看器官" className="augmentation-body">
                <g fill="none" stroke="#72adbb" opacity=".18" strokeWidth=".15"><circle cx="50" cy="48" r="43" /><circle cx="50" cy="48" r="36" strokeDasharray="1 3" /><path d="M5 48h90M50 3v92M10 10h10M10 10v10M90 10H80M90 10v10M10 90h10M90 90H80" /></g>
                <image href="/ascension/astartes-chamber.png" x="0" y="0" width="100" height="100" className="augmentation-portrait" style={{ filter: `saturate(${.25 + currentStageId * .15}) brightness(.85)` }} />
                <rect x="0" y="0" width="100" height="100" fill="#071523" opacity=".18" pointerEvents="none" />
                <g fill="none" stroke="#dfbc72" strokeWidth=".6" opacity={.2 + currentStageId * .15}>
                    {currentStageId >= 2 && <path d="M20 25q6-5 12 0M68 25q6-5 12 0" />}
                    {currentStageId >= 3 && <path d="M37 65h8M55 65h8M43 56h14" />}
                    {currentStageId >= 4 && <path d="m40 28 10 5 10-5m-20 4 10 5 10-5" />}
                    {unlockedImplants.includes('black-carapace') && <path d="m37 26 3 13 10 6 10-6 3-13M43 42v12m14-12v12" />}
                </g>
                {implants.map((implant, index) => {
                    const coords = IMPLANT_COORDS[implant.id];
                    if (!coords) return null;
                    const state = statusFor(implant.id);
                    const active = selected.id === implant.id;
                    return <g key={implant.id} role="button" tabIndex={0} aria-label={`${implant.name}，${labels[state]}`} aria-pressed={active} className={`implant-node implant-node--${state} ${active ? 'is-selected' : ''}`} onClick={() => onImplantClick(implant.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onImplantClick(implant.id); } }}>
                        <title>{implant.name} · {labels[state]}</title>
                        <circle cx={coords.x} cy={coords.y} r="2.3" fill="transparent" stroke="none" />
                        <circle cx={coords.x} cy={coords.y} r={active ? 1.5 : .9} />
                        {active && <><circle cx={coords.x} cy={coords.y} r="2.5" fill="none" strokeWidth=".25" /><path d={`M${coords.x + 2.5} ${coords.y}H91`} fill="none" strokeWidth=".25" /><text x="92" y={coords.y + 1} fontSize="2.5" fill="currentColor" stroke="none">{String(index + 1).padStart(2, '0')}</text></>}
                    </g>;
                })}
            </svg>
            <div className="augmentation-scan__legend"><span data-state="installed">✓ 已植入</span><span data-state="ready">◇ 可植入</span><span data-state="insufficient">○ 資源不足</span><span data-state="locked">· 未開放</span></div>
        </div>
        <div className={`implant-detail implant-detail--${status}`} aria-live="polite">
            <div className="implant-detail__title"><h3>{selected.name}</h3><span>{status === 'installed' ? <Check size={14} /> : status === 'ready' ? <Crosshair size={14} /> : <Lock size={14} />}{labels[status]}</span></div>
            <p>{selected.description}</p>
            <div className="implant-detail__cost"><ResourceSigil kind={selected.cost.resource} size={28} /><span>{meta.activity} → {meta.label}<strong>{astartes.resources[selected.cost.resource].toLocaleString()} / {selected.cost.amount.toLocaleString()}</strong></span></div>
            <div className="implant-detail__progress"><span style={{ width: `${Math.min(100, astartes.resources[selected.cost.resource] / selected.cost.amount * 100)}%` }} /></div>
            <small>{status === 'installed' ? '植入完成 · 強化已啟用' : status === 'locked' ? '完成前一階段後開放' : remaining > 0 ? `再累積 ${remaining.toLocaleString()} ${meta.label}即可植入` : '資源已備妥，可在改造手術面板執行植入'}</small>
        </div>
    </section>;
};
