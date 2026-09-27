import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import { useRequisition } from '../contexts/RequisitionContext';
import { api } from '../services/api';
import { catalogItem, type CatalogItem, type EquipmentItem } from '../../shared/armory';
import type { Character } from '../../shared/roster';
import { ArmoryPanel } from './ArmoryPanel';

export const Armory = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
    const { getToken } = useAuth();
    const { refresh: refreshRequisition } = useRequisition();
    const [catalog, setCatalog] = useState<CatalogItem[]>([]);
    const [items, setItems] = useState<EquipmentItem[]>([]);
    const [authorized, setAuthorized] = useState<string[]>([]);
    const [balance, setBalance] = useState(0);
    const [characters, setCharacters] = useState<Character[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const working = useRef(false);
    const request = useRef(0);
    const load = useCallback(async () => {
        const sequence = ++request.current;
        setLoading(true);
        setError(null);
        try {
            const token = await getToken();
            if (!token) throw new Error('登入已失效，請重新登入');
            const [armory, roster] = await Promise.all([api.getArmory(token), api.getRoster(token)]);
            if (sequence !== request.current) return;
            setCatalog(armory.catalog); setItems(armory.items); setAuthorized(armory.authorized);
            setBalance(armory.balance); setCharacters(roster.characters);
        } catch (err) {
            if (sequence === request.current) setError(err instanceof Error ? err.message : '無法載入軍械庫');
        } finally { if (sequence === request.current) setLoading(false); }
    }, [getToken]);
    useEffect(() => {
        if (visible) { setNotice(null); void load(); }
        return () => { request.current++; };
    }, [visible, load]);

    const run = async (work: (token: string) => Promise<unknown>, success: string): Promise<boolean> => {
        if (working.current || loading || error) return false;
        working.current = true; setBusy(true); setError(null); setNotice(null);
        try {
            const token = await getToken();
            if (!token) throw new Error('登入已失效，請重新登入');
            await work(token);
            // A failed refresh is not a failed purchase: never encourage spending twice.
            setNotice(success);
            await load();
            void refreshRequisition();
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : '操作未確認完成，請重新載入庫存後核對');
            return false;
        } finally { working.current = false; setBusy(false); }
    };
    return <Modal open={visible} onCancel={() => { if (!busy) onClose(); }} footer={null} width={1100} className="imperial-shop command-modal"
        closable={!busy} maskClosable={!busy} keyboard={!busy} title={<span className="eyebrow">軍械庫 / ARMOURY</span>}>
        {visible && <ArmoryPanel catalog={catalog} items={items} authorized={authorized} balance={balance} characters={characters}
            loading={loading} busy={busy} error={error} notice={notice} onRetry={() => void load()}
            onPurchase={id => run(token => api.purchaseEquipment(id, token), `已採購 ${catalogItem(id)?.name ?? id}，請到「我的庫存」配發。`)}
            onAssign={(id, characterId) => run(token => api.assignEquipment(id, characterId, token), characterId ? '裝備已配發。' : '裝備已收回軍械庫。')}
            onSell={id => run(token => api.sellEquipment(id, token), '裝備已回收，軍需以最新餘額為準。')} />}
    </Modal>;
};
