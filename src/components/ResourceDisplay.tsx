import { CSSProperties, useEffect, useRef, useState } from 'react';

export const RESOURCE_META = {
    // v1.5 runs a single spendable wallet; rp and glory stay only for read-only history.
    requisition: { label: '軍需', short: '軍需', color: '#dfbc72', activity: '生活成果' },
    rp: { label: '帝皇之怒', short: 'RP', color: '#86c9da', activity: '完成任務' },
    glory: { label: '榮耀', short: 'GLORY', color: '#dfbc72', activity: '完成目標' },
    adamantium: { label: '精金', short: '精金', color: '#dd9c80', activity: '運動' },
    neuroData: { label: '神經資料', short: '資料', color: '#83b6e1', activity: '學習' },
    puritySeals: { label: '純潔印記', short: '印記', color: '#dcc181', activity: '整潔' },
    geneLegacy: { label: '基因遺產', short: '基因', color: '#8ec9a7', activity: '育兒' },
};
export type ResourceKind = keyof typeof RESOURCE_META;

export function ResourceSigil({ kind, size = 36 }: { kind: ResourceKind; size?: number }) {
    return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M24 2 43 13v22L24 46 5 35V13Z" opacity=".28" />
        {kind === 'rp' ? <><path d="m26 9-12 17h9l-1 13 13-20h-9Z" fill="currentColor" fillOpacity=".2" /><path d="M10 16v16m28-16v16" /></>
            : kind === 'glory' || kind === 'requisition' ? <><path d="m24 10 4 9 10 1-8 7 2 10-8-5-8 5 2-10-8-7 10-1Z" fill="currentColor" fillOpacity=".2" /><path d="M10 8 7 13m31-5 3 5" /></>
            : kind === 'adamantium' ? <><path d="m9 28 7-13h18l6 13-6 8H15ZM9 28h31M16 15l4 13m14-13-5 13" fill="currentColor" fillOpacity=".16" /></>
            : kind === 'neuroData' ? <><path d="m24 9 11 8v15l-11 8-11-8V17ZM24 9v31M13 17l11 8 11-8M13 32l11-7 11 7" /><path d="M7 18v13m34-13v13" opacity=".5" /></>
            : kind === 'puritySeals' ? <><path d="m17 26-4 15 10-5 9 5-3-15" /><circle cx="24" cy="20" r="11" fill="currentColor" fillOpacity=".15" /><path d="m18 20 4 4 8-8" /></>
            : <><rect x="14" y="9" width="20" height="31" rx="7" /><path d="M18 15c16 7-4 10 12 18M30 15c-16 7 4 10-12 18M20 18h8m-8 12h8M18 6h12m-12 37h12" /></>}
    </svg>;
}

export function ResourceDisplay({ kind, value, compact = false }: { kind: ResourceKind; value: number; compact?: boolean }) {
    const previous = useRef(value);
    const [change, setChange] = useState(0);
    useEffect(() => {
        const delta = value - previous.current;
        previous.current = value;
        if (!delta) return;
        setChange(delta);
        const timer = window.setTimeout(() => setChange(0), 1800);
        return () => window.clearTimeout(timer);
    }, [value]);
    const meta = RESOURCE_META[kind];
    return <div className={`resource-display ${compact ? 'resource-display--compact' : ''}`} style={{ '--resource-color': meta.color } as CSSProperties} title={`${meta.activity} · ${meta.label}`}>
        <ResourceSigil kind={kind} size={compact ? 28 : 40} />
        <span className="resource-display__body"><span className="resource-display__label">{compact ? meta.short : meta.label}</span><strong>{value.toLocaleString()}</strong></span>
        {change !== 0 && <span key={value} className={`resource-display__change ${change < 0 ? 'is-spent' : ''}`} aria-live="polite">{change > 0 ? '+' : '−'}{Math.abs(change).toLocaleString()}</span>}
    </div>;
}

export function CorruptionGauge({ value, canCleanse, onCleanse }: { value: number; canCleanse: boolean; onCleanse: () => void }) {
    const level = value > 950 ? 'critical' : value > 500 ? 'warning' : 'stable';
    const label = level === 'critical' ? '裂隙臨界' : level === 'warning' ? '污染升高' : '裂隙受控';
    return <button type="button" className={`corruption-gauge corruption-gauge--${level}`} onClick={onCleanse} disabled={!canCleanse} title={canCleanse ? '淨化：消耗 20 RP，降低 30 腐化' : '淨化需要 20 RP'}>
        <svg viewBox="0 0 64 64" width="46" height="46" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" opacity=".25" /><path d="m36 5-12 19 15-5-20 20 14-4-8 25 22-29-15 5 12-19-14 4Z" fill="currentColor" opacity={.3 + Math.min(1, value / 1000) * .7} /></svg>
        <span className="corruption-gauge__body"><span className="corruption-gauge__heading"><span>{label}</span><strong>{Math.floor(value)}<small> / 1000</small></strong></span>
            <span className="corruption-gauge__track" role="meter" aria-label="腐化值" aria-valuemin={0} aria-valuemax={1000} aria-valuenow={Math.min(1000, Math.max(0, value))}><span style={{ width: `${Math.min(100, Math.max(0, value / 10))}%` }} /></span>
            <span className="corruption-gauge__hint">淨化 −30 · {canCleanse ? '消耗 20 RP' : '需要 20 RP'}</span>
        </span>
    </button>;
}
