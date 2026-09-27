import React from 'react';
import { CampaignBoard } from './CampaignBoard';
import { OperationPlans } from './OperationPlans';

// The strategic view. The twelve month-bound planets, their traits and the
// monthly "resolve" belonged to the retired economy and are gone (2026-09-27);
// projects live on as operation plans. The board above is the older campaign,
// which the sector campaign (docs/campaign-and-operation-plans.md §2) replaces.
export const SectorMap: React.FC = () => (
    <div className="strategy-shell">
        <div className="strategy-main">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(20,20,20,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(20,20,20,0.5)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none z-0 opacity-20" />
            <div className="strategy-content">
                <CampaignBoard />
                <OperationPlans />
            </div>
        </div>
    </div>
);
