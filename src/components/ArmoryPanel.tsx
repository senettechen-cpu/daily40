import { useState } from 'react';
import { Button, Input, Modal, Select, Tabs } from 'antd';
import { Search, Lock, RefreshCw } from 'lucide-react';
import { assignmentError, purchaseError, SLOT_LABELS, catalogItem, type CatalogItem, type EquipmentItem } from '../../shared/armory';
import { REFUND_RATE } from '../../shared/rewards';
import type { Character } from '../../shared/roster';
import { equipmentArt } from '../data/reportArtIndex';
import { equipmentCompatibility, equipmentFacts, equipmentNote, inventoryCount } from './armoryPresentation';
import './command-panels.css';

export interface ArmoryPanelProps {
    catalog: CatalogItem[]; items: EquipmentItem[]; authorized: string[]; balance: number; characters: Character[];
    loading: boolean; busy: boolean; error: string | null; notice: string | null;
    onRetry: () => void;
    onPurchase: (id: string) => Promise<boolean>;
    onAssign: (id: string, characterId: string | null) => Promise<boolean>;
    onSell: (id: string) => Promise<boolean>;
}

export function ArmoryPanel(props: ArmoryPanelProps) {
    const { catalog, items, authorized, balance, characters, busy, loading, error, notice } = props;
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('all');
    const [availableOnly, setAvailableOnly] = useState(false);
    const [tab, setTab] = useState('catalog');
    const [confirmation, setConfirmation] = useState<{ kind: 'buy'; item: CatalogItem } | { kind: 'sell'; item: EquipmentItem } | null>(null);
    const disabled = busy || loading || !!error;
    const match = (d: CatalogItem) => (category === 'all' || d.category === category)
        && `${d.name} ${d.id} ${SLOT_LABELS[d.category]}`.toLowerCase().includes(query.trim().toLowerCase());
    const visibleCatalog = catalog.filter(d => match(d) && (!availableOnly || !purchaseError(d, { balance, authorized })));
    const visibleItems = items.filter(i => { const d = catalogItem(i.catalogId); return d ? match(d) && (!availableOnly || !i.assignedTo) : !query && category === 'all' && (!availableOnly || !i.assignedTo); });
    const art = (id: string) => {
        const src = equipmentArt(id, 192);
        return src ? <img className="armory-art" src={src} alt="" width={96} height={96} loading="lazy" /> : <div className="armory-art armory-placeholder">無圖</div>;
    };
    const empty = <div className="command-empty"><strong>{tab === 'inventory' && !items.length ? '軍械庫尚無庫存' : '沒有符合條件的裝備'}</strong><p>{tab === 'inventory' && !items.length ? '從目錄採購後，再到這裡配發給人員。' : '可調整搜尋、分類或篩選條件。'}</p><Button onClick={() => { setQuery(''); setCategory('all'); setAvailableOnly(false); }}>清除篩選</Button></div>;
    const catalogue = <div className="armory-cards">{visibleCatalog.length ? visibleCatalog.map(d => {
        const blocked = purchaseError(d, { balance, authorized });
        const count = inventoryCount(items, d.id);
        return <article className="armory-card" key={d.id}>
            <div className="armory-card-top">{art(d.id)}<div><small>{SLOT_LABELS[d.category]}</small><h3>{d.name}</h3><p>{equipmentCompatibility(d)}</p></div></div>
            <dl className="armory-facts">{equipmentFacts(d).map(f => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
            <p className={`armory-note${d.category === 'upgrade' ? ' is-warning' : ''}`}>{equipmentNote(d)}</p>
            <div className="armory-stock">持有 {count.total} 件 · 未配發 {count.free} 件</div>
            <footer><strong>{d.price} <small>軍需</small></strong><Button disabled={disabled || !!blocked} onClick={() => setConfirmation({ kind: 'buy', item: d })} aria-label={`採購${d.name}`}>採購</Button></footer>
            {blocked && <p className="armory-blocked"><Lock size={12} aria-hidden="true" />{blocked}</p>}
        </article>;
    }) : empty}</div>;
    const inventory = <div className="armory-inventory">{visibleItems.length ? visibleItems.map(item => {
        const d = catalogItem(item.catalogId);
        const holder = characters.find(c => c.id === item.assignedTo);
        const refund = Math.floor(item.paid * REFUND_RATE);
        const issuedKit = item.id.startsWith('kit-'); // Same invariant as server isKitItem.
        return <article className="armory-owned" key={item.id}>
            <div className="armory-card-top">{art(item.catalogId)}<div><small>{d ? SLOT_LABELS[d.category] : '未知類型'} · {item.paid === 0 ? '配發品' : '採購品'}</small><h3>{d?.name ?? item.catalogId}</h3><p>{item.assignedTo ? `配發中：${holder?.name ?? '未在目前名冊的人員'}` : '待配發'}</p><small>回收可得 {refund} 軍需</small></div></div>
            <div className="armory-owned-actions"><label>配發對象<Select aria-label={`配發${d?.name ?? item.catalogId}（${item.id}）`} value={item.assignedTo ?? ''}
                disabled={disabled || d?.category === 'upgrade'} onChange={id => void props.onAssign(item.id, id || null)}
                options={[{ value: '', label: '留在軍械庫／收回' }, ...characters.map(c => {
                    const reason = assignmentError(item, c, items, authorized);
                    return { value: c.id, label: `${c.name}${reason ? ` · ${reason}` : ''}`, disabled: !!reason };
                })]} /></label>
                <Button danger disabled={disabled || issuedKit} onClick={() => setConfirmation({ kind: 'sell', item })} aria-label={`回收${d?.name ?? item.catalogId}（${item.id}）`}>{issuedKit ? '起始配發不可回收' : '回收'}</Button></div>
            {item.assignedTo && <p className="armory-note">轉配其他人員前，請先收回軍械庫。</p>}
            {d?.category === 'upgrade' && <p className="armory-note is-warning">{equipmentNote(d)}</p>}
        </article>;
    }) : empty}</div>;
    const confirmDefinition = confirmation?.kind === 'buy' ? confirmation.item : confirmation ? catalogItem(confirmation.item.catalogId) : undefined;
    const confirmBlocked = confirmation?.kind === 'buy' ? purchaseError(confirmation.item, { balance, authorized }) : null;
    return <div className="command-panel armory-panel" aria-busy={loading || busy}>
        <header className="command-masthead"><div><p className="command-eyebrow">MUNITORUM / 軍需補給</p><h2>把每一天的努力，化為下一場的裝備。</h2><p>採購 → 庫存配發 → 名冊編成 → 出戰</p></div><div className="command-balance"><small>可用軍需</small><strong>{!catalog.length ? '—' : balance.toLocaleString()}</strong><span>{catalog.length ? `持有 ${items.length} 件裝備` : '庫存待同步'}</span></div></header>
        {error && <div className="command-feedback is-error" role="alert"><span>{error}；資料可能不是最新，操作已暫停。</span><Button icon={<RefreshCw size={14} />} onClick={props.onRetry} disabled={loading || busy}>重新載入</Button></div>}
        {notice && <div className="command-feedback" role="status">{notice}</div>}
        {loading && <div className="command-loading" role="status">正在核對軍需、裝備與名冊…</div>}
        {!loading && !error && <div className="armory-toolbar"><Input aria-label="搜尋裝備" placeholder="搜尋名稱或裝備代號" prefix={<Search size={16} />} allowClear value={query} onChange={e => setQuery(e.target.value)} />
            <Select aria-label="裝備分類" value={category} onChange={setCategory} options={[{ value: 'all', label: '所有裝備' }, ...Object.entries(SLOT_LABELS).map(([value, label]) => ({ value, label }))]} />
            <label><input type="checkbox" checked={availableOnly} onChange={e => setAvailableOnly(e.target.checked)} />{tab === 'catalog' ? '只看可採購' : '只看未配發'}</label></div>}
        {!loading && (!error || catalog.length > 0) && <Tabs activeKey={tab} onChange={value => { setTab(value); setAvailableOnly(false); }} items={[{ key: 'catalog', label: `裝備目錄（${visibleCatalog.length}）`, children: catalogue }, { key: 'inventory', label: `我的庫存（${visibleItems.length}）`, children: inventory }]} />}
        <p className="armory-footnote">數值取自現行戰鬥規則；基礎傷害 × 攻擊次數並非保證傷害。解鎖與配發資格由伺服器驗證。</p>
        <Modal open={!!confirmation} title={confirmation?.kind === 'buy' ? '確認採購' : '確認回收裝備'} onCancel={() => { if (!busy) setConfirmation(null); }}
            confirmLoading={busy} closable={!busy} maskClosable={!busy} keyboard={!busy} cancelButtonProps={{ disabled: busy }} okButtonProps={{ disabled: disabled || !!confirmBlocked, danger: confirmation?.kind === 'sell' }}
            okText={confirmation?.kind === 'buy' ? '確認採購 1 件' : '確認回收'} cancelText="取消"
            onOk={async () => { if (!confirmation || disabled) return; const ok = confirmation.kind === 'buy' ? await props.onPurchase(confirmation.item.id) : await props.onSell(confirmation.item.id); if (ok) setConfirmation(null); }}>
            <p>{confirmDefinition?.name ?? '裝備'}</p>
            {confirmation?.kind === 'buy' ? <><p>本次花費 {confirmation.item.price} 軍需，採購後剩餘 {balance - confirmation.item.price}。</p>{confirmation.item.category === 'upgrade' && <p className="armory-note is-warning">{equipmentNote(confirmation.item)}</p>}</>
                : confirmation && <><p>退回 {Math.floor(confirmation.item.paid * REFUND_RATE)} 軍需；配發品回收不退軍需。</p><p>這件裝備會從庫存移除{confirmation.item.assignedTo ? '，並解除目前人員的配裝' : ''}。此操作無法直接復原。</p></>}
            {confirmBlocked && <p role="alert">{confirmBlocked}</p>}
            {error && <p role="alert">{error}</p>}
        </Modal>
    </div>;
}
