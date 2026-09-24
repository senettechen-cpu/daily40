import React, { useCallback, useEffect, useState } from 'react';
import { Button, Modal, Select, Tabs } from 'antd';
import { Lock, ShoppingCart, Undo2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRequisition } from '../contexts/RequisitionContext';
import { api } from '../services/api';
import { CatalogItem, EquipmentItem, SLOT_LABELS, catalogItem, purchaseError } from '../../shared/armory';
import { REFUND_RATE } from '../../shared/rewards';
import { Character, DUTY_LABELS, ORIGIN_LABELS } from '../../shared/roster';
import { equipmentArt } from '../data/reportArtIndex';

const ItemArt = ({ catalogId }: { catalogId: string }) => {
    const src = equipmentArt(catalogId, 96);
    return src
        ? <img src={src} alt="" width={48} height={48} className="flex-shrink-0 border border-imperial-gold/20 bg-[#2d3331] object-contain" />
        : <div className="w-12 h-12 flex-shrink-0 border border-dashed border-zinc-700 bg-zinc-900" title="尚無裝備圖" />;
};

export const Armory = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
    const { getToken } = useAuth();
    const { refresh: refreshRequisition } = useRequisition();
    const [catalog, setCatalog] = useState<CatalogItem[]>([]);
    const [items, setItems] = useState<EquipmentItem[]>([]);
    const [authorized, setAuthorized] = useState<string[]>([]);
    const [balance, setBalance] = useState(0);
    const [characters, setCharacters] = useState<Character[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const [armory, roster] = await Promise.all([api.getArmory(token), api.getRoster(token)]);
            setCatalog(armory.catalog);
            setItems(armory.items);
            setAuthorized(armory.authorized);
            setBalance(armory.balance);
            setCharacters(roster.characters);
        } catch (err) {
            setError(err instanceof Error ? err.message : '無法載入軍械庫');
        }
    }, [getToken]);

    useEffect(() => { if (visible) void load(); }, [visible, load]);

    const run = async (work: (token: string) => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            const token = await getToken();
            if (!token) return;
            await work(token);
            await load();
            void refreshRequisition();
        } catch (err) {
            setError(err instanceof Error ? err.message : '操作失敗');
        } finally {
            setBusy(false);
        }
    };


    const catalogueTab = (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto pr-1">
            {catalog.map(definition => {
                const blocked = purchaseError(definition, { balance, authorized });
                return (
                    <div key={definition.id} className="flex items-center gap-3 p-2 border border-zinc-700 bg-zinc-900/60">
                        <ItemArt catalogId={definition.id} />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-imperial-gold text-sm">{definition.name}</span>
                                {definition.restricted && !authorized.includes(definition.id) && (
                                    <span className="text-[10px] font-mono text-amber-500 border border-amber-800/60 px-1 flex items-center gap-1">
                                        <Lock size={10} /> 未解鎖
                                    </span>
                                )}
                            </div>
                            <div className="text-[11px] font-mono text-zinc-500">
                                {SLOT_LABELS[definition.category]} · {definition.price} 軍需
                                {definition.origins && ` · 限 ${definition.origins.map(o => ORIGIN_LABELS[o]).join('、')}`}
                            </div>
                            {definition.note && <div className="text-[11px] font-mono text-zinc-600 truncate">{definition.note}</div>}
                        </div>
                        <Button size="small" disabled={busy || !!blocked} title={blocked ?? '採購'}
                            icon={<ShoppingCart size={14} />}
                            onClick={() => void run(token => api.purchaseEquipment(definition.id, token).then(() => undefined))}
                            className="!bg-transparent !border-imperial-gold/40 !text-imperial-gold font-mono" />
                    </div>
                );
            })}
        </div>
    );

    const inventoryTab = (
        <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto pr-1">
            {items.length === 0 && <div className="text-center text-zinc-600 font-mono text-xs py-6">庫存是空的</div>}
            {items.map(item => {
                const definition = catalogItem(item.catalogId);
                return (
                    <div key={item.id} className="flex items-center gap-3 p-2 border border-zinc-700 bg-zinc-900/60">
                        <ItemArt catalogId={item.catalogId} />
                        <div className="flex-1 min-w-0">
                            <div className="font-mono text-imperial-gold text-sm">{definition?.name ?? item.catalogId}</div>
                            <div className="text-[11px] font-mono text-zinc-500">
                                {item.paid > 0 ? `實付 ${item.paid} · 回收 ${Math.floor(item.paid * REFUND_RATE)}` : '配發品 · 回收 0'}
                            </div>
                        </div>
                        <Select
                            size="small"
                            className="!w-36"
                            value={item.assignedTo ?? ''}
                            disabled={busy}
                            onChange={value => void run(token => api.assignEquipment(item.id, value || null, token).then(() => undefined))}
                            options={[{ value: '', label: '收回軍械庫' },
                            ...characters.map(c => ({ value: c.id, label: `${c.name}（${DUTY_LABELS[c.duty]}）` }))]}
                        />
                        <Button size="small" type="text" danger icon={<Undo2 size={14} />} disabled={busy}
                            title={`回收，退回 ${Math.floor(item.paid * REFUND_RATE)} 軍需`}
                            onClick={() => void run(token => api.sellEquipment(item.id, token).then(() => undefined))}
                            className="font-mono" />
                    </div>
                );
            })}
        </div>
    );

    return (
        <Modal open={visible} onCancel={onClose} footer={null} width={1000} className="imperial-shop"
            title={<span className="eyebrow">軍械庫 / ARMOURY · 軍需 {balance}</span>}>
            {error && <div className="mb-2 border border-red-900/60 bg-red-950/40 text-red-400 font-mono text-xs p-2">{error}</div>}
            <Tabs
                items={[
                    { key: 'catalog', label: `目錄（${catalog.length}）`, children: catalogueTab },
                    { key: 'inventory', label: `庫存（${items.length}）`, children: inventoryTab },
                ]}
            />
            <div className="mt-2 font-mono text-[11px] text-zinc-600">
                價格為 v1.5 候選值，尚未依戰鬥實測校準。標示「未解鎖」的項目需要戰役或劇情授權，光有軍需買不到。
            </div>
        </Modal>
    );
};
