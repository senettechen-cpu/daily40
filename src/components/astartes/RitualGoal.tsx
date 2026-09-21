import { AscensionCategory } from '../../types';
import { IMPLANT_STAGES } from '../../data/astartesData';
import { useAscension } from '../../hooks/useAscension';
import { RESOURCE_META, ResourceSigil } from '../ResourceDisplay';

export const RITUAL_RESOURCE = { exercise: 'adamantium', learning: 'neuroData', cleaning: 'puritySeals', parenting: 'geneLegacy' } as const;

export function RitualGoal({ category }: { category: AscensionCategory }) {
    const { astartes, currentStageId } = useAscension();
    const kind = RITUAL_RESOURCE[category];
    const meta = RESOURCE_META[kind];
    const goalStage = IMPLANT_STAGES.find(stage => stage.implants.some(implant => implant.cost.resource === kind && !astartes.unlockedImplants.includes(implant.id)));
    const goal = goalStage?.implants.find(implant => implant.cost.resource === kind && !astartes.unlockedImplants.includes(implant.id));
    return <div className="ritual-goal" style={{ color: meta.color }}><ResourceSigil kind={kind} size={32} /><div><strong>{meta.activity} → {meta.label} → {goal?.name || '本類植入已完成'}</strong><span>{goal ? `還需 ${Math.max(0, goal.cost.amount - astartes.resources[kind]).toLocaleString()} ${meta.label}${goalStage!.id > currentStageId ? ' · 完成前階段後開放' : ''}` : '持續累積你的飛昇資源'}</span></div></div>;
}
