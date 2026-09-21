import React from 'react';
import { Pin, X, Zap } from 'lucide-react';
import type { LedgerPreset, PresetFields, Suggestion } from '../../../shared/ledger/presets';

interface LedgerQuickMenuProps {
    pinned: LedgerPreset[];
    suggestions: Suggestion[];
    busy: boolean;
    onUse: (item: PresetFields & { amount: number | null }) => void;
    onPin: (item: Suggestion) => void;
    onUnpin: (preset: LedgerPreset) => void;
    onHide: (item: Suggestion) => void;
}

const chip = 'group flex items-stretch border text-sm font-mono min-h-[40px]';
const action = 'px-2 flex items-center opacity-70 hover:opacity-100 hover:bg-[#33ff00]/10 disabled:opacity-30';

/** Pinned presets first (one tap when an amount is remembered), then frequent recent items. */
export const LedgerQuickMenu: React.FC<LedgerQuickMenuProps> = ({ pinned, suggestions, busy, onUse, onPin, onUnpin, onHide }) => {
    if (!pinned.length && !suggestions.length) return null;
    return (
        <section aria-label="快速記帳" className="space-y-2">
            <h3 className="text-[#c5a059] text-xs tracking-widest uppercase m-0">快速記帳 (QUICK REQUISITION)</h3>
            <div className="flex flex-wrap gap-2">
                {pinned.map(p => (
                    <div key={p.id} className={`${chip} border-[#c5a059] bg-[#c5a059]/10 text-[#e6c278]`}>
                        <button type="button" disabled={busy} onClick={() => onUse(p)} className="px-3 flex items-center gap-1 hover:bg-[#c5a059]/20 disabled:opacity-40"
                            title={p.amount ? `一鍵記錄 ₮${p.amount}` : '帶入欄位，再輸入金額'}>
                            {p.amount ? <Zap size={13} aria-hidden /> : <Pin size={13} aria-hidden />}
                            <span>{p.itemName}</span>
                            {p.amount && <span className="text-[#33ff00]">₮{p.amount.toLocaleString()}</span>}
                        </button>
                        <button type="button" disabled={busy} onClick={() => onUnpin(p)} className={action} aria-label={`取消釘選 ${p.itemName}`}><X size={13} /></button>
                    </div>
                ))}
                {suggestions.map(s => (
                    <div key={`${s.category}|${s.itemName}|${s.paymentMethod}`} className={`${chip} border-[#33ff00]/30 text-[#33ff00]/85`}>
                        <button type="button" disabled={busy} onClick={() => onUse({ ...s, amount: null })} className="px-3 flex items-center gap-1 hover:bg-[#33ff00]/10 disabled:opacity-40"
                            title={`近 30 天記過 ${s.count} 次，帶入欄位`}>
                            <span>{s.itemName}</span><span className="text-[#33ff00]/40 text-xs">×{s.count}</span>
                        </button>
                        <button type="button" disabled={busy} onClick={() => onPin(s)} className={action} aria-label={`釘選 ${s.itemName}`}><Pin size={13} /></button>
                        <button type="button" disabled={busy} onClick={() => onHide(s)} className={action} aria-label={`不再建議 ${s.itemName}`}><X size={13} /></button>
                    </div>
                ))}
            </div>
        </section>
    );
};
