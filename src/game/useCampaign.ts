import { useRef, useState } from 'react';
import type { ArmyStrength } from '../types';
import { attack, earnAction, freshCampaign, normalizeCampaign, type CampaignState, type Site, type Tactic } from './campaign';

// A synchronous ref prevents rapid clicks and repeated completion events from spending twice.
export function useCampaign(onChange: () => void) {
    const [campaign, setCampaign] = useState(freshCampaign);
    const ref = useRef(campaign);
    const commit = (next: CampaignState) => {
        if (next === ref.current) return false;
        ref.current = next;
        setCampaign(next);
        onChange();
        return true;
    };
    return { campaign, campaignRef: ref,
        loadCampaign: (value: unknown) => { ref.current = normalizeCampaign(value); setCampaign(ref.current); },
        earnCampaignAction: (key: string, title: string) => commit(earnAction(ref.current, key, title)),
        attackCampaign: (site: Site, tactic: Tactic, army: ArmyStrength) => commit(attack(ref.current, site, tactic, army)),
    };
}
