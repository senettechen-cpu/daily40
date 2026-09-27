import React from 'react';
import { SectorCampaign } from './SectorCampaign';
import { OperationPlans } from './OperationPlans';

// The strategic view: the sector campaign above, operation plans below.
// The twelve month-bound planets, their traits and the monthly resolve belonged
// to the retired economy (removed 2026-09-27), and the older 黎明星球 board was
// replaced by the sector campaign (docs/campaign-and-operation-plans.md).
export const SectorMap: React.FC<{ onDeploy: (strongholdId: string) => void }> = ({ onDeploy }) => (
    <div className="strategy-shell">
        <div className="strategy-main">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(20,20,20,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(20,20,20,0.5)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none z-0 opacity-20" />
            <div className="strategy-content">
                <SectorCampaign onDeploy={onDeploy} />
                <OperationPlans />
            </div>
        </div>
    </div>
);
