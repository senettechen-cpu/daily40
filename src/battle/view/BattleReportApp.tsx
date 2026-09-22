import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CREW_SIZE, LANES, validateDeployment } from '../sim/engine';
import { SCENARIOS, setupFor } from '../sim/scenarios';
import { TICKS_PER_SECOND, WEAPONS } from '../sim/rules';
import { simulateWithReport, type ReportEntry, type SimulatedBattle, type UnitSnap, type UnitStats } from '../report/report';
import { loadReportArt, NO_ART, type ReportArt } from './reportArt';
import './battle-test.css';
import './battle-report.css';

// Text battle report (presentation A). The whole battle is simulated up front
// with the unchanged engine; playback only reveals entries by simulation tick.
// Isolated test page: no resources, rewards, saves, tasks or ledger data.
type Phase = 'deploy' | 'playing' | 'paused' | 'finished';
const SPEEDS = [1, 2, 4];
const seconds = (tick: number) => (tick / TICKS_PER_SECOND).toFixed(1);
const BADGE: Partial<Record<ReportEntry['kind'], string>> = { down: '倒地', swap: '換裝完成', cancel: '動作中止', result: '結算', 'swap-start': '切換中', reload: '換彈' };

export const ArtContext = createContext<ReportArt>(NO_ART);

/** Identity portrait with the unit number always visible (six crew share one portrait). Falls back to a numbered badge. */
export function Portrait({ name, side, down }: { name: string; side: 'crew' | 'enemy'; down: boolean }) {
    const art = useContext(ArtContext).portrait(side);
    const number = name.replace(/[^\d]/g, '') || name[0];
    return <span className={`br-avatar br-avatar--${side}${down ? ' is-down' : ''}${art ? ' has-art' : ''}`} aria-hidden="true">
        {art && <img src={art.head} width={128} height={128} alt="" loading="lazy" decoding="async" />}
        <b>{number}</b>
    </span>;
}

export function WeaponCard({ snap }: { snap: UnitSnap }) {
    const incoming = snap.swapTo;
    const pct = Math.round(snap.swapProgress * 100);
    // Image and name both follow the committed weapon, which changes only when a swap completes.
    const art = useContext(ArtContext).equipment(snap.weapon);
    return <div className="br-weapon" data-committed-weapon={snap.weapon}>
        {art && <img className="br-weapon__art" src={art.small} srcSet={`${art.small} 1x, ${art.large} 2x`} width={96} height={96} alt={WEAPONS[snap.weapon].name} data-weapon-art={snap.weapon} />}
        <span className="br-weapon__label">目前武器</span>
        <strong>{WEAPONS[snap.weapon].name}</strong>
        <span className="br-weapon__ammo">{snap.reloadProgress !== null ? `換彈中 ${Math.round(snap.reloadProgress * 100)}%` : `${snap.ammo[snap.active]}/${WEAPONS[snap.weapon].magazine}`}</span>
        {incoming && <span className="br-weapon__swap">切換為{WEAPONS[incoming === 'secondary' ? 'laspistol' : 'lasgun'].name} {pct}%</span>}
    </div>;
}

export function RosterCard({ name, side, snap, maxHp }: { name: string; side: 'crew' | 'enemy'; snap: UnitSnap; maxHp: number }) {
    const down = snap.hp <= 0;
    return <li className={`br-unit${down ? ' is-down' : ''}`} data-unit-card={snap.id}>
        <Portrait name={name} side={side} down={down} />
        <div className="br-unit__body">
            <div className="br-unit__head"><strong>{name}</strong>{down ? <span className="br-badge br-badge--down">倒地</span> : <span>{snap.hp}/{maxHp}</span>}</div>
            <div className="bt-hp"><i style={{ width: `${100 * snap.hp / maxHp}%`, background: side === 'crew' ? '#add6b0' : '#d98879' }} /></div>
            {!down && <WeaponCard snap={snap} />}
        </div>
    </li>;
}

function Entry({ entry, names, sim }: { entry: ReportEntry; names: Record<string, string>; sim: SimulatedBattle }) {
    const [open, setOpen] = useState(false);
    const badge = BADGE[entry.kind];
    const side = (id?: string) => (id?.startsWith('crew') ? 'crew' : 'enemy');
    const subject = entry.actorId ?? entry.targetId;
    return <li className={`br-entry br-entry--${entry.kind}${entry.key ? ' is-key' : ''}`} data-entry={entry.id} data-sources={entry.sourceEventIds.join(',')}>
        <time>{seconds(entry.startTick)}s{entry.endTick > entry.startTick ? `–${seconds(entry.endTick)}s` : ''}</time>
        {subject && entry.key && <Portrait name={names[subject]} side={side(subject)} down={entry.kind === 'down'} />}
        <p>{badge && <span className={`br-badge br-badge--${entry.kind}`}>{badge}</span>}{entry.text}</p>
        {entry.kind === 'burst' && <button type="button" className="br-expand" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? '收合' : '展開原始紀錄'}</button>}
        {open && <ol className="br-sources">{entry.sourceEventIds.map(id => {
            const ev = sim.events.find(e => e.id === id);
            return ev?.kind === 'shot' ? <li key={id}>#{id} · {seconds(ev.tick)}s · {{ hit: `命中 −${ev.amount}`, cover: '擊中掩體', miss: '未命中' }[ev.outcome]}</li> : null;
        })}</ol>}
    </li>;
}

function Results({ sim, names }: { sim: SimulatedBattle; names: Record<string, string> }) {
    const title = { victory: '勝利', defeat: '失敗', timeout: '超時', running: '進行中' }[sim.final.status];
    const row = (s: UnitStats) => <tr key={s.id} className={s.downTick !== null ? 'is-down' : ''}>
        <td>{names[s.id]}</td><td>{s.finalHp}/{s.maxHp}</td><td>{s.shots}</td><td>{s.hits}</td><td>{s.coverHits}</td><td>{s.misses}</td><td>{s.amount}</td><td>{s.damageTaken}</td><td>{s.downTick === null ? '—' : `${seconds(s.downTick)}s`}</td><td>{s.swaps}</td><td>{s.reloads}</td>
    </tr>;
    return <section className={`br-results br-results--${sim.final.status}`} aria-label="戰鬥結算">
        <h2>{title} · {seconds(sim.final.tick)} 秒</h2>
        <p>測試版結算：不發放獎勵、不扣資源、倒地不是永久傷亡。</p>
        <div className="br-table-wrap"><table>
            <thead><tr><th>單位</th><th>生命</th><th>射擊</th><th>命中</th><th>擊中掩體</th><th>未中</th><th>造成傷害</th><th>承受傷害</th><th>倒地時間</th><th>換裝</th><th>換彈</th></tr></thead>
            <tbody>{sim.stats.filter(s => s.side === 'crew').map(row)}<tr className="br-sep"><td colSpan={11}>敵軍</td></tr>{sim.stats.filter(s => s.side === 'enemy').map(row)}</tbody>
        </table></div>
    </section>;
}

export function BattleReportApp() {
    const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
    const scenario = SCENARIOS.find(s => s.id === scenarioId)!;
    const [lanes, setLanes] = useState<number[]>(scenario.lanes);
    const [seed, setSeed] = useState(scenario.seed);
    const deployError = validateDeployment(lanes);
    const [phase, setPhase] = useState<Phase>('deploy');
    const [speed, setSpeed] = useState(1);
    const [keyOnly, setKeyOnly] = useState(false);
    const [sim, setSim] = useState<SimulatedBattle | null>(null);
    const [playTick, setPlayTick] = useState(0);
    const feedRef = useRef<HTMLOListElement>(null);
    const playRef = useRef(0);
    const [art, setArt] = useState<ReportArt>(NO_ART);
    useEffect(() => { loadReportArt().then(setArt); }, []);
    useEffect(() => { setLanes(scenario.lanes); setSeed(scenario.seed); }, [scenarioId]);

    const start = () => {
        if (deployError) return;
        setSim(simulateWithReport(setupFor(scenario, lanes, seed)));
        playRef.current = 0;
        setPlayTick(0);
        setPhase('playing');
    };
    const skip = () => { if (sim) { playRef.current = sim.final.tick; setPlayTick(sim.final.tick); setPhase('finished'); } };

    // Playback clock: advances the revealed simulation tick; the outcome is already fixed.
    useEffect(() => {
        if (phase !== 'playing' || !sim) return;
        if (document.hidden) { setPhase('paused'); return; } // animation frames never fire in a hidden page
        let last = performance.now(), frame = 0;
        const tick = (now: number) => {
            const dt = Math.min(250, now - last);
            last = now;
            playRef.current = Math.min(sim.final.tick, playRef.current + dt * speed * TICKS_PER_SECOND / 1000);
            setPlayTick(playRef.current);
            if (playRef.current >= sim.final.tick) { setPhase('finished'); return; }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        const onHide = () => { if (document.hidden) setPhase(p => (p === 'playing' ? 'paused' : p)); };
        document.addEventListener('visibilitychange', onHide);
        return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', onHide); };
    }, [phase, speed, sim]);

    const names = useMemo(() => Object.fromEntries((sim?.initial.units ?? []).map(u => [u.id, u.name])), [sim]);
    const visible = useMemo(() => (sim ? sim.report.filter(e => e.startTick <= playTick && (!keyOnly || e.key)) : []), [sim, playTick, keyOnly]);
    useEffect(() => { const el = feedRef.current; if (el) el.scrollTop = el.scrollHeight; }, [visible.length]);
    (window as any).__battleReport = { phase, playTick, sim, visible: visible.length };
    // Dev-only: jump playback to a tick and pause (reproducible screenshots where animation frames are throttled).
    if (import.meta.env.DEV) (window as any).__reportSeek = (tick: number) => {
        if (!sim) return 'start a battle first';
        playRef.current = Math.min(sim.final.tick, tick);
        setPlayTick(playRef.current);
        setPhase(playRef.current >= sim.final.tick ? 'finished' : 'paused');
        return playRef.current;
    };

    if (import.meta.env.VITE_BATTLE_TEST !== 'on') return <main className="bt-app"><p className="bt-notice">戰鬥測試版未啟用（VITE_BATTLE_TEST=on 才顯示）。</p></main>;

    const snaps = sim ? sim.timeline[Math.min(sim.timeline.length - 1, Math.floor(playTick))] : [];
    const unitsById = new Map((sim?.initial.units ?? []).map(u => [u.id, u]));
    const toggleLane = (lane: number) => setLanes(l => l.includes(lane) ? l.filter(x => x !== lane) : l.length < CREW_SIZE ? [...l, lane].sort((a, b) => a - b) : l);
    const roster = (side: 'crew' | 'enemy') => snaps.filter(s => unitsById.get(s.id)?.side === side)
        .map(s => <RosterCard key={s.id} name={unitsById.get(s.id)!.name} side={side} snap={s} maxHp={unitsById.get(s.id)!.maxHp} />);

    return <ArtContext.Provider value={art}><main className="bt-app br-app">
        <header className="bt-header">
            <div>
                <p className="bt-eyebrow">第一階段戰鬥測試版 · 文字戰報 · 不扣資源、不發獎勵、無永久傷亡、不讀寫生活資料</p>
                <h1>帝國廢墟戰報 · 卡迪安 × 叛軍</h1>
            </div>
            <div className="bt-controls" role="group" aria-label="戰報控制">
                {phase === 'deploy' && <button type="button" className="bt-primary" onClick={start} disabled={!!deployError}>開始戰鬥</button>}
                {phase === 'playing' && <button type="button" onClick={() => setPhase('paused')}>暫停</button>}
                {phase === 'paused' && <button type="button" className="bt-primary" onClick={() => setPhase('playing')}>繼續</button>}
                {(phase === 'playing' || phase === 'paused') && <button type="button" onClick={skip}>快轉到結果</button>}
                {phase !== 'deploy' && <button type="button" onClick={start}>同條件重開</button>}
                {phase !== 'deploy' && <button type="button" onClick={() => { setPhase('deploy'); setSim(null); }}>回到部署</button>}
                <button type="button" onClick={() => setSpeed(s => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}>速度 {speed}×</button>
                <label className="bt-check"><input type="checkbox" checked={keyOnly} onChange={e => setKeyOnly(e.target.checked)} /> 只看關鍵事件</label>
            </div>
        </header>

        {phase === 'deploy' && <section className="bt-deploy" aria-label="部署">
            <label>情境 <select value={scenarioId} onChange={e => setScenarioId(e.target.value)}>{SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label>亂數種子 <input type="number" value={seed} onChange={e => setSeed(Number(e.target.value) || 0)} /></label>
            <div className="bt-lanes" role="group" aria-label="部署通道（選 6 條）">
                {LANES.map(l => <button key={l} type="button" aria-pressed={lanes.includes(l)} className={lanes.includes(l) ? 'is-on' : ''} onClick={() => toggleLane(l)}>通道 {l}</button>)}
            </div>
            <p className="bt-hint">{scenario.description}</p>
            {deployError && <p className="bt-warn">{deployError}（目前 {lanes.length}/{CREW_SIZE}）</p>}
        </section>}

        {sim && <div className="br-layout">
            <section className="br-feed-wrap" aria-label="戰報">
                <div className="br-clock">戰鬥時間 {seconds(Math.floor(playTick))}s／{seconds(sim.final.tick)}s{phase === 'paused' ? ' · 已暫停' : ''}</div>
                <ol className="br-feed" ref={feedRef} aria-live="polite">{visible.map(e => <Entry key={e.id} entry={e} names={names} sim={sim} />)}</ol>
                {phase === 'finished' && <Results sim={sim} names={names} />}
            </section>
            <aside className="br-side">
                <h2>我方</h2><ul className="br-roster">{roster('crew')}</ul>
                <h2>敵軍</h2><ul className="br-roster">{roster('enemy')}</ul>
                <p className="bt-perf">立繪為角色示意，六名我方共用同一張、以編號區分；實際武器以「目前武器」卡為準。</p>
            </aside>
        </div>}
    </main></ArtContext.Provider>;
}
