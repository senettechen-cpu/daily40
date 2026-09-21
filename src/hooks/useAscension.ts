
import { useMemo } from 'react';
import { useGame } from '../contexts/GameContext';
import { IMPLANT_STAGES, Implant, ImplantStage } from '../data/astartesData';
import { AstartesResources } from '../types';

export const useAscension = () => {
    const { astartes, modifyAstartesResources, updateAstartes, grantAscensionReward } = useGame();

    const currentStageId = useMemo(() => {
        // Find the first stage that is NOT fully completed
        // Stage is completed if all its implants are unlocked?
        // No, stage is "completed" in terms of rewards if it's in completedStages.
        // But for "current view", we want the highest unlocked stage.
        // Let's iterate stages.
        for (const stage of IMPLANT_STAGES) {
            const allImplantsUnlocked = stage.implants.every(img => astartes.unlockedImplants.includes(img.id));
            if (!allImplantsUnlocked) return stage.id;
        }
        return IMPLANT_STAGES[IMPLANT_STAGES.length - 1].id; // All done
    }, [astartes.unlockedImplants]);

    const canUnlock = (implant: Implant): { allowed: boolean; reason?: string } => {
        // 1. Check if already unlocked
        if (astartes.unlockedImplants.includes(implant.id)) {
            return { allowed: false, reason: '已植入' };
        }

        // 2. Check Stage Constraints (Wooden Barrel Theory)
        // Find implant stage
        const stage = IMPLANT_STAGES.find(s => s.implants.some(i => i.id === implant.id));
        if (!stage) return { allowed: false, reason: '未知器官' };

        // Check previous stages are fully completed
        if (stage.id > 1) {
            const prevStage = IMPLANT_STAGES.find(s => s.id === stage.id - 1);
            if (prevStage) {
                const prevCompleted = prevStage.implants.every(i => astartes.unlockedImplants.includes(i.id));
                if (!prevCompleted) return { allowed: false, reason: '前一階段尚未完成' };
            }
        }

        // 3. Check Resources
        const cost = implant.cost;
        const currentRes = astartes.resources[cost.resource];
        if (currentRes < cost.amount) {
            return { allowed: false, reason: `資源不足 (${cost.amount - currentRes} needed)` };
        }

        return { allowed: true };
    };

    const unlockImplant = (implant: Implant) => {
        const check = canUnlock(implant);
        if (!check.allowed) return false;

        // 1. Deduct Resources
        modifyAstartesResources({ [implant.cost.resource]: -implant.cost.amount }, `Implant: ${implant.name}`);

        // 2. Unlock Implant
        const newUnlocked = [...astartes.unlockedImplants, implant.id];
        updateAstartes({ unlockedImplants: newUnlocked });

        // 3. Check Stage Completion & Grant Reward
        const stage = IMPLANT_STAGES.find(s => s.implants.some(i => i.id === implant.id));
        if (stage) {
            const allUnlockedNow = stage.implants.every(i => newUnlocked.includes(i.id));
            if (allUnlockedNow && !astartes.completedStages.includes(stage.id)) {
                // Grant Reward!
                grantAscensionReward(stage.rewardUnits, stage.gloryReward || 0);

                // Mark Stage Completed
                updateAstartes({
                    unlockedImplants: newUnlocked,
                    completedStages: [...astartes.completedStages, stage.id]
                });

                return { success: true, stageCompleted: true, stageName: stage.name };
            }
        }

        return { success: true, stageCompleted: false };
    };

    const getResourceProgress = (res: keyof AstartesResources) => {
        return astartes.resources[res];
    };

    return {
        astartes,
        currentStageId,
        canUnlock,
        unlockImplant,
        getResourceProgress
    };
};
