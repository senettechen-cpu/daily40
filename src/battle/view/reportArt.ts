// Static art for the text report: identity portraits and equipment cards, from the
// imported thumbnail manifest (public/battle-assets/report). Portraits show who a unit
// is, never what it holds — the equipment card is the authority for the weapon.
import type { WeaponId } from '../../../shared/battle/sim';

export interface ThumbManifest {
    portraits: { assetId: string; role: string; head: string; half: string }[];
    equipment: { artId: string; weaponId: string; small: string; large: string }[];
}
export interface ReportArt {
    portrait: (side: 'crew' | 'enemy') => { head: string; half: string } | null;
    equipment: (id: WeaponId | 'flak-armour') => { small: string; large: string } | null;
}

export const NO_ART: ReportArt = { portrait: () => null, equipment: () => null };
const ROLE = { crew: 'crew-default', enemy: 'enemy-default' } as const;

export function resolveReportArt(manifest: ThumbManifest, baseUrl: string): ReportArt {
    const url = (rel: string) => baseUrl + rel;
    return {
        portrait: side => {
            const p = manifest.portraits.find(x => x.role === ROLE[side]);
            return p ? { head: url(p.head), half: url(p.half) } : null;
        },
        equipment: id => {
            const e = manifest.equipment.find(x => x.weaponId === id);
            return e ? { small: url(e.small), large: url(e.large) } : null;
        },
    };
}

/** Falls back to NO_ART (numbered badges, text-only cards) if the manifest cannot load. */
export async function loadReportArt(): Promise<ReportArt> {
    const base = `${import.meta.env.BASE_URL}battle-assets/report/`;
    try {
        const res = await fetch(`${base}manifest.json`);
        if (!res.ok) return NO_ART;
        return resolveReportArt(await res.json(), base);
    } catch {
        return NO_ART;
    }
}
