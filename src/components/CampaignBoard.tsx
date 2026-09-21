import { useState } from 'react';
import { Button, Progress } from 'antd';
import { useGame } from '../contexts/GameContext';
import { SITES, TACTICS, previewAttack, tacticAvailable, type Site, type Tactic } from '../game/campaign';
import './campaign.css';

export function CampaignBoard() {
    const { campaign, armyStrength, attackCampaign } = useGame();
    const [site, setSite] = useState<Site>('supply');
    const [tactic, setTactic] = useState<Tactic>('recon');
    const [report, setReport] = useState('');
    const [sequence, setSequence] = useState(0);
    const preview = previewAttack(campaign, site, tactic, armyStrength);
    const captured = SITES.filter(item => campaign.progress[item.id] === 100).length;
    const total = Math.floor(Object.values(campaign.progress).reduce((sum, n) => sum + n, 0) / 3);
    return <section className="planet-campaign" aria-label="黎明星球戰役">
        <header className="planet-header"><div><p className="eyebrow">OPERATION / NEW DAWN</p><h2>黎明星球 · 收復行動</h2><p>把生活中的一小步，變成星球上的一次推進。</p></div><div className="campaign-ap"><strong>{campaign.points}</strong><span>可用行動點</span></div></header>
        <div className="planet-map">
            <div className="planet-orbit" aria-hidden="true"><div className="planet-sphere" /><span>{total}%</span><small>星球收復率</small></div>
            <div className="planet-sites">{SITES.map((item, index) => <button key={item.id} className={`planet-site ${site === item.id ? 'selected' : ''} ${campaign.progress[item.id] === 100 ? 'captured' : ''}`} onClick={() => setSite(item.id)} aria-pressed={site === item.id}>
                <span className="site-symbol" aria-hidden="true">{campaign.progress[item.id] === 100 ? '✓' : item.icon}</span><div><small>據點 0{index + 1}</small><h3>{item.name}</h3><p>{item.subtitle}</p><Progress percent={campaign.progress[item.id]} size="small" strokeColor="#83d6bd" /></div>
            </button>)}</div>
        </div>
        {captured === 3 ? <div className="campaign-victory" role="status">✦ 黎明守護者勳章已獲得<br /><small>三個據點全部收復。每一步努力，都留在這片領土上。</small></div> : <>
            <h3 className="campaign-section-title">選擇攻勢 <span>部隊提供戰術支援，不消耗、不撤走原駐軍</span></h3>
            <div className="campaign-tactics">{(Object.keys(TACTICS) as Tactic[]).map(key => <button key={key} aria-pressed={tactic === key} disabled={!tacticAvailable(key, armyStrength)} className={tactic === key ? 'selected' : ''} onClick={() => setTactic(key)}><strong>{TACTICS[key].name}</strong><span>{TACTICS[key].cost} 行動點</span><small>{TACTICS[key].description}</small>{!tacticAvailable(key, armyStrength) && <small>需先徵召對應兵種</small>}</button>)}</div>
            <div className="campaign-launch"><div><strong>{SITES.find(item => item.id === site)!.name}：{campaign.progress[site]}% → {campaign.progress[site] + preview.gain}%</strong><p>{preview.reason || `消耗 ${preview.cost} 行動點 · 確定推進 +${preview.gain}% · 無隨機失敗`}</p></div><Button type="primary" size="large" disabled={!!preview.reason} onClick={() => { if (attackCampaign(site, tactic)) { setReport(`${SITES.find(item => item.id === site)!.name} 推進 +${preview.gain}%！你的努力已化為領土進展。`); setSequence(previous => previous + 1); } }}>發動攻勢</Button></div>
        </>}
        <div key={sequence} className={report ? 'campaign-report active' : 'campaign-report'} role="status" aria-live="polite">{report || '完成一項任務、專案子任務，或今天的習慣，即可取得 1 行動點。'}</div>
        <details className="campaign-log"><summary>戰役紀錄 · 已收復 {captured}/3 據點</summary><p>一般任務與子任務各限一次；重複任務、每項習慣每天限一次。戰役不扣兵、不清空進度；原年度戰線規則維持不變。</p>{campaign.history.length ? <ol>{campaign.history.map(entry => <li key={entry.id}><time>{new Date(entry.at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>{entry.text}</li>)}</ol> : <p>下一次完成任務，就是第一份戰報。</p>}</details>
    </section>;
}
