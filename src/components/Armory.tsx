import { Drawer, Button, Tabs, message } from 'antd';
import { Skull, Zap, ShieldCheck, Sparkles } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { RecruitmentRoster } from './RecruitmentRoster';
import { ResourceDisplay } from './ResourceDisplay';

const ITEMS = [
    { id: 'servo_skull', name: '伺服骷髏', cost: 30, desc: '自動完成一個進行中的歐克獸人任務。', Icon: Skull, color: '#b9c8cc', code: 'SERVO / 01' },
    { id: 'theme_khorne', name: '恐虐紅塗裝', cost: 50, desc: '將戰術雷達切換為嗜血紅色。', Icon: Zap, color: '#d98b76', code: 'LIVERY / 02' },
    { id: 'rosarius', name: '免死金牌', cost: 80, desc: '立即消除 50 點腐化值。', Icon: ShieldCheck, color: '#dfbc72', code: 'RELIC / 03' },
    { id: 'theme_gold', name: '黃金王座塗裝', cost: 100, desc: '將戰術雷達切換為神聖金色。', Icon: Sparkles, color: '#e9d399', code: 'LIVERY / 04' },
];

export const Armory = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
    const { resources, purchaseItem } = useGame();
    return <Drawer title={<span className="eyebrow">帝國軍械庫 / IMPERIAL ARMORY</span>} placement="right" onClose={onClose} open={visible} width="min(940px, 100vw)" className="imperial-armory">
        <Tabs items={[
            { key: 'requisition', label: '物資徵用', children: <><div className="roster__intro"><div><span className="eyebrow">SANCTIONED EQUIPMENT</span><h2>戰備補給</h2><p>以任務累積的 RP 徵用裝備與戰術塗裝。</p></div><ResourceDisplay kind="rp" value={resources.rp} /></div><div className="equipment-grid">{ITEMS.map(item => <article key={item.id} className="equipment-card"><div className="equipment-card__art" style={{ color: item.color }}><span className="equipment-card__orbit" /><item.Icon size={64} strokeWidth={1} /></div><span className="eyebrow">{item.code}</span><h3>{item.name}</h3><p>{item.desc}</p><div className="recruit-card__footer"><span><strong>{item.cost}</strong> RP</span><Button disabled={resources.rp < item.cost} onClick={() => { purchaseItem(item.cost, item.id); message.success(`已配發：${item.name}`); }}>徵用</Button></div></article>)}</div></> },
            { key: 'recruitment', label: '軍團徵召', children: <RecruitmentRoster /> },
        ]} />
    </Drawer>;
};
