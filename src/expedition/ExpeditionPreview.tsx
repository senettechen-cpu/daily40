import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CREW, DEFAULT_SQUAD, INVENTORY, WEAPONS, createBattle, retreat, stepBattle, validateSquad, compatible, type Actor, type Assignment, type Battle } from './engine';
import { CinematicBattlefield, SoldierFigure } from './CinematicBattlefield';
import './expedition.css';
import { WeaponLoadout } from './WeaponLoadout';

function Figure({ actor }: { actor: Pick<Actor, 'side' | 'role' | 'weapon' | 'facing' | 'hp' | 'sidearm'>; portrait?: boolean }) {
    return <g transform="translate(-6 34) scale(.75)"><SoldierFigure actor={actor} /></g>;
}
function ExpeditionPreview() {
    const [squad, setSquad] = useState<Assignment[]>(DEFAULT_SQUAD.map(a => ({ ...a })));
    const [battle, setBattle] = useState<Battle | null>(null);
    const [paused, setPaused] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const [selected, setSelected] = useState(0);
    const battleRef = useRef(battle);
    const [error, setError] = useState('');
    const running = battle?.status === 'running';
    const squadError = validateSquad(squad);
    const member = CREW.find(c => c.id === squad[selected].role)!;
    const equipment = INVENTORY.find(i => i.id === squad[selected].equipment)!;
    const displayBattle = battle || createBattle(squadError ? DEFAULT_SQUAD : squad);
    const selectedActor = displayBattle.actors.find(a => a.id === member.id)!;
    useEffect(() => { battleRef.current = battle; }, [battle]);
    useEffect(() => {
        if (!running || paused) return;
        const timer = window.setInterval(() => {
            let next = battleRef.current;
            if (!next) return;
            for (let i = 0; i < speed; i++) next = stepBattle(next);
            battleRef.current = next; setBattle(next);
        }, 100);
        return () => clearInterval(timer);
    }, [running, paused, speed]);
    useEffect(() => {
        const onHidden = () => { if (document.hidden) setPaused(true); };
        document.addEventListener('visibilitychange', onHidden);
        return () => document.removeEventListener('visibilitychange', onHidden);
    }, []);
    const equip = (id: string) => {
        if (running) return;
        const next = squad.map((a, i) => i === selected ? { ...a, equipment: id } : a);
        const reason = validateSquad(next); if (reason) { setError(reason); return; }
        setSquad(next); setError('');
    };
    const start = () => { if (running || squadError) return; const next = createBattle(squad); battleRef.current = next; setBattle(next); setPaused(false); setError(''); };
    const finish = () => { if (!battleRef.current) return; let next = battleRef.current; while (next.status === 'running') next = stepBattle(next); battleRef.current = next; setBattle(next); };
    return <main className="void-app">
        <header className="void-top"><a href="/visual-preview.html" className="void-brand">✦ VOID EXPEDITION <span>虛空遠征</span></a><div className="void-prototype">戰鬥原型 A · 獨立試玩 · 重新整理重設</div><a href="/visual-preview.html">返回原指揮中心 ↗</a></header>
        <div className="void-heading"><div><p className="void-eyebrow">EXPEDITION 001 / HELIOS OUTPOST</p><h1>淨化失落工廠</h1><p>四名伙伴。一座失聯信標。把每個人帶回來。</p></div><div className="void-mission-badge"><span>行動目標</span><strong>清除三波守軍 → 恢復信標</strong><small>不限耗材 · 此原型不發放正式獎勵</small></div></div>
        <div className="void-layout"><aside className="void-panel void-roster"><div className="void-panel-title"><h2>遠征小隊</h2><span>04 / 04</span></div><p className="void-muted">選擇伙伴，設定武器與部署通道。</p>
            <div className="void-crew-list">{squad.map((a, i) => { const c = CREW.find(c => c.id === a.role)!; const w = INVENTORY.find(item => item.id === a.equipment)!; const live = displayBattle.actors.find(actor => actor.id === a.role); return <button key={a.role} className={`void-crew ${selected === i ? 'selected' : ''}`} aria-pressed={selected === i} onClick={() => setSelected(i)}><svg viewBox="-45 -38 95 76" aria-hidden="true"><Figure portrait actor={live || { side: 'crew', role: a.role, weapon: w.weapon, facing: 0, hp: 1 }} /></svg><span><strong>{c.name}</strong><small>{c.job}</small><em>{live?.sidearm ? '手持：雷射手槍' : WEAPONS[w.weapon].name}</em></span><b>0{i + 1}</b></button>; })}</div>
            <div className="void-loadout"><p className="void-eyebrow">LOADOUT / {member.id.toUpperCase()}</p><h3>{member.name}的配裝</h3><svg className="void-portrait" viewBox="-65 -45 130 90" role="img" aria-label={`${member.name}持有${selectedActor.sidearm ? '雷射手槍' : WEAPONS[selectedActor.weapon].name}`}><circle r="36" fill="#24333e" stroke="#667364" strokeDasharray="2 5" /><Figure portrait actor={selectedActor} /></svg><p>{member.skill}</p>
                <label>主武器<select aria-label="主武器" disabled={!!running} value={squad[selected].equipment} onChange={e => equip(e.target.value)}>{INVENTORY.filter(item => compatible(member.id, item.id)).map(item => { const owner = squad.find((a, i) => i !== selected && a.equipment === item.id); return <option key={item.id} value={item.id} disabled={!!owner}>{WEAPONS[item.weapon].name} · {item.id}{owner ? '（其他伙伴使用中）' : ''}</option>; })}</select></label>
                <p className="void-weapon-detail">{WEAPONS[equipment.weapon].description}</p><WeaponLoadout actor={selectedActor} />
                <label>部署通道<select aria-label="部署通道" disabled={!!running} value={squad[selected].lane} onChange={e => setSquad(previous => previous.map((a, i) => i === selected ? { ...a, lane: Number(e.target.value) } : a))}>{Array.from({ length: 8 }, (_, i) => i + 1).map(lane => <option key={lane} value={lane} disabled={squad.some((a, i) => i !== selected && a.lane === lane)}>通道 {lane}{lane <= 3 ? ' · 北側' : lane >= 6 ? ' · 南側' : ' · 中路'}</option>)}</select></label>
                <label>交戰優先<select aria-label="交戰優先" disabled={!!running} value={squad[selected].order} onChange={e => setSquad(previous => previous.map((a, i) => i === selected ? { ...a, order: e.target.value as Assignment['order'] } : a))}><option value="nearest">最近的敵人</option><option value="support">優先指揮兵</option><option value="weakest">優先受傷敵人</option></select></label>
                {running && <p className="void-lock">出擊裝備已鎖定；返回整備後才能更換。</p>}
            </div>
        </aside><section className="void-main"><div className="void-panel void-arena"><div className="void-panel-title"><h2>戰術監控 <span className="void-live">{!battle ? '待命' : battle.status !== 'running' ? '行動結束' : paused ? '暫停' : 'LIVE'}</span></h2><span>{(displayBattle.tick / 10).toFixed(1)}s / 180s</span></div><div className="void-animation-controls"><p>星界軍 vs 混沌教徒 · 掩體交火／副武器自衛</p><button disabled={!!running} onClick={start}>觀看戰鬥動畫</button><label><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)} />減少動態</label></div><div className="void-map-scroll"><CinematicBattlefield battle={displayBattle} paused={paused || !running} speed={speed} reduced={reduced} /></div><div className="void-map-key"><span>▣ 實體障礙 · 阻擋視線</span><span>▱ 掩體後方 · 正面射擊命中 −30%</span><span>◉ 信標 · 清敵後自動修復</span></div>
            <div className="void-controls"><button className="void-primary" onClick={start} disabled={!!running || !!squadError}>{battle ? '以目前配裝重新出擊' : '部署並出擊'}</button><button disabled={!running} onClick={() => setPaused(p => !p)}>{paused ? '繼續戰鬥' : '暫停戰鬥'}</button><button disabled={!running} onClick={() => setSpeed(s => s === 1 ? 2 : 1)}>{speed}× 速度</button><button disabled={!running} onClick={finish}>快算至結束</button><button disabled={!running} onClick={() => { if (battleRef.current) { const next = retreat(battleRef.current); battleRef.current = next; setBattle(next); } }}>原型安全撤離</button></div>
            <p className="void-muted void-note">固定種子 40126 · 倍速与快算使用同一套戰鬥規則 · 切換分頁自動暫停</p>
        </div>
        {(error || squadError) && <p role="alert" className="void-error">{error || squadError}</p>}
        <div className="void-bottom"><section className="void-panel"><div className="void-panel-title"><h2>戰地情報</h2><span>ENEMY INTEL</span></div><div className="void-enemy"><b>01</b><div><strong>異教狂徒</strong><p>持刀逼近、迫使遠程兵改用低傷害副武器。保持距離，別讓火線被突破。</p></div></div><div className="void-enemy"><b>02</b><div><strong>異教槍手</strong><p>會利用掩體定點射擊；繞到側翼可避開掩體保護。</p></div></div><div className="void-enemy"><b>03</b><div><strong>邪教煽動者</strong><p>附近 4 格敵軍命中 +10%。偵察員可優先處理。</p></div></div></section>
        <section className="void-panel"><div className="void-panel-title"><h2>行動紀錄</h2><span>{battle ? `WAVE ${battle.wave} / 3` : 'AWAITING ORDERS'}</span></div><div className="void-log">{battle ? battle.log.map((line, i) => <p key={`${line}-${i}`}>{line}</p>) : <p>先選擇伙伴與武器，再發起遠征。所有原型配置免費，不影響現有遊戲資料。</p>}</div></section></div>
        {battle && battle.status !== 'running' && <section className="void-panel void-result" aria-label="戰鬥結算"><p className="void-eyebrow">AFTER ACTION REPORT</p><h2>{battle.status === 'victory' ? '信標重新點亮。' : battle.status === 'retreated' ? '遠征隊已撤離。' : '行動未完成，伙伴已回收。'}</h2><p role="status">{battle.status === 'victory' ? '三波守軍已清除，撤離通道恢復。' : '可調整武器、部署通道或目標優先後再次挑戰。'} 原型不扣資源、不刪除伙伴。</p><div className="void-table-scroll"><table><thead><tr><th>伙伴</th><th>武器</th><th>造成傷害</th><th>其中副武器</th><th>承受傷害</th><th>治療</th><th>生命</th></tr></thead><tbody>{battle.actors.filter(a => a.side === 'crew').map(a => <tr key={a.id}><td>{a.name}</td><td>{WEAPONS[a.weapon].name}</td><td>{a.damage}</td><td>{a.sidearmDamage || 0}</td><td>{a.received}</td><td>{a.healing}</td><td>{a.hp}/{a.maxHp}</td></tr>)}</tbody></table></div><p className="void-muted">此階段驗證戰鬥與配裝；經驗、裝備強化、章節與永久存檔尚未開放。</p></section>}
        </section></div><footer className="void-footer">非官方原創試作 · 生成式角色與場景素材＋程式戰鬥 · 無帳號連線或正式獎勵</footer>
    </main>;
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<ExpeditionPreview />);
