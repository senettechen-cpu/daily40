import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createBattle, LANES, stepBattle, validateDeployment, CREW_SIZE, type Battle, type Unit } from '../sim/engine';
import { SCENARIOS, setupFor } from '../sim/scenarios';
import { TICKS_PER_SECOND, WEAPONS, type Slot } from '../sim/rules';
import { loadBattleArt, type BattleArt } from '../sprites/loader';
import { heldWeaponId } from '../sprites/contract';
import { poseFor } from './animation';
import { BattleStage } from './BattleStage';
import './battle-test.css';

// Phase-1 battle test. Self-contained: it never touches GameContext, the API,
// saves, rewards, tasks or the ledger — a battle here has no lasting effect.
type Phase = 'deploy' | 'running' | 'paused' | 'finished';
const TICK_MS = 1000 / TICKS_PER_SECOND;

interface Perf { fps: number; simMs: number; frames: number; at: number; simTotal: number; simCount: number }

function useBattleArt() {
    const [art, setArt] = useState<BattleArt | null>(null);
    const [error, setError] = useState('');
    useEffect(() => { loadBattleArt().then(setArt).catch(e => setError(String(e.message || e))); }, []);
    return { art, error };
}

function SlotRow({ unit, slot, tick }: { unit: Unit; slot: Slot; tick: number }) {
    const weapon = WEAPONS[unit.loadout[slot]];
    const a = unit.action;
    const swapping = a.kind === 'swap';
    const progress = swapping ? Math.round(100 * Math.min(1, (tick - a.start) / (a.end - a.start))) : 0;
    const active = unit.active === slot;
    const state = unit.hp <= 0 ? '—'
        : swapping && a.to === slot ? `${slot === 'secondary' ? '拔出中' : '取出中'} ${progress}%`
        : swapping && active ? `收起中 ${progress}%`
        : active ? '手持' : slot === 'primary' ? '收起（背帶）' : '槍套';
    const reloading = a.kind === 'reload' && a.slot === slot;
    return <div className={`bt-slot${active ? ' is-active' : ''}${swapping && a.to === slot ? ' is-incoming' : ''}`} data-slot={slot} data-slot-state={state}>
        <span className="bt-slot__label">{slot === 'primary' ? '主' : '副'}</span>
        <span className="bt-slot__name">{weapon.name}</span>
        <span className="bt-slot__ammo">{reloading ? '換彈中' : `${unit.ammo[slot]}/${weapon.magazine}`}</span>
        <span className="bt-slot__state">{state}</span>
    </div>;
}
const ACTION_LABEL: Record<string, string> = { idle: '待命', move: '移動', 'enter-cover': '進入掩體', aim: '瞄準', fire: '射擊', retract: '縮回掩體', reload: '換彈', swap: '切換武器', down: '倒地' };

export function BattleTestApp() {
    const { art, error } = useBattleArt();
    const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
    const scenario = SCENARIOS.find(s => s.id === scenarioId)!;
    const [lanes, setLanes] = useState<number[]>(scenario.lanes);
    const [seed, setSeed] = useState(scenario.seed);
    const deployError = validateDeployment(lanes);
    const [phase, setPhase] = useState<Phase>('deploy');
    const [speed, setSpeed] = useState(1);
    const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const preview = useMemo(() => (deployError ? null : createBattle(setupFor(scenario, lanes, seed))), [scenario, lanes, seed, deployError]);
    const [snap, setSnap] = useState<{ previous: Battle; battle: Battle } | null>(null);
    const [fraction, setFraction] = useState(0);
    const [perf, setPerf] = useState<Perf>({ fps: 0, simMs: 0, frames: 0, at: performance.now(), simTotal: 0, simCount: 0 });
    const loop = useRef({ acc: 0, last: 0, battle: null as Battle | null, previous: null as Battle | null });

    useEffect(() => { setLanes(scenario.lanes); setSeed(scenario.seed); }, [scenarioId]);

    const start = () => {
        if (!preview) return;
        loop.current = { acc: 0, last: performance.now(), battle: preview, previous: preview };
        setSnap({ previous: preview, battle: preview });
        setPhase('running');
    };
    const restart = () => { setPhase('deploy'); setSnap(null); setSelectedId(null); };

    // Fixed-step simulation driven by requestAnimationFrame; pausing stops the clock entirely.
    useEffect(() => {
        if (phase !== 'running') return;
        let frame = 0;
        loop.current.last = performance.now();
        const tickFrame = (now: number) => {
            const state = loop.current;
            state.acc += Math.min(250, now - state.last) * speed;
            state.last = now;
            let stepped = false, simTime = 0;
            while (state.acc >= TICK_MS && state.battle && state.battle.status === 'running') {
                const t0 = performance.now();
                state.previous = state.battle;
                state.battle = stepBattle(state.battle);
                simTime += performance.now() - t0;
                state.acc -= TICK_MS;
                stepped = true;
            }
            if (stepped && state.battle && state.previous) setSnap({ previous: state.previous, battle: state.battle });
            setFraction(Math.min(1, state.acc / TICK_MS));
            setPerf(p => {
                const frames = p.frames + 1, simTotal = p.simTotal + simTime, simCount = p.simCount + (stepped ? 1 : 0);
                if (now - p.at < 1000) return { ...p, frames, simTotal, simCount };
                return { fps: Math.round(frames * 1000 / (now - p.at)), simMs: simCount ? +(simTotal / simCount).toFixed(2) : 0, frames: 0, at: now, simTotal: 0, simCount: 0 };
            });
            if (state.battle?.status !== 'running') { setPhase('finished'); return; }
            frame = requestAnimationFrame(tickFrame);
        };
        frame = requestAnimationFrame(tickFrame);
        const onHide = () => { if (document.hidden) setPhase(p => (p === 'running' ? 'paused' : p)); };
        document.addEventListener('visibilitychange', onHide);
        return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', onHide); };
    }, [phase, speed]);

    const shown = snap?.battle ?? preview;
    // Exposed for automated checks in the browser (read-only snapshot).
    (window as any).__battleTest = { battle: shown, phase, perf, scenarioId, seed, lanes };
    // Dev-only render benchmark: synchronous full re-renders of the stage (React + DOM commit, excluding paint).
    // Used for performance records where requestAnimationFrame is throttled (hidden preview panes, background tabs).
    if (import.meta.env.DEV) (window as any).__battleBench = (n = 60) => {
        const t0 = performance.now();
        for (let i = 0; i < n; i++) flushSync(() => setFraction(i % 2 ? 0.25 : 0.75));
        return +((performance.now() - t0) / n).toFixed(2);
    };
    // Dev-only: replay the current scenario/lanes/seed up to `tick` and pause there (reproducible screenshots).
    if (import.meta.env.DEV) (window as any).__battleJump = (tick: number) => {
        if (!preview) return 'deployment invalid';
        let previous = preview, battle = preview;
        while (battle.tick < tick && battle.status === 'running') { previous = battle; battle = stepBattle(battle); }
        loop.current = { acc: 0, last: performance.now(), battle, previous };
        setSnap({ previous, battle });
        setFraction(0);
        setPhase(battle.status === 'running' ? 'paused' : 'finished');
        return battle.tick;
    };

    if (import.meta.env.VITE_BATTLE_TEST !== 'on') return <main className="bt-app"><p className="bt-notice">戰鬥測試版未啟用（VITE_BATTLE_TEST=on 才顯示）。舊戰場原型仍可由 expedition-preview.html 進入。</p></main>;
    if (error) return <main className="bt-app"><p className="bt-notice">素材載入失敗：{error}</p></main>;
    if (!art) return <main className="bt-app"><p className="bt-notice">載入候選美術素材中…</p></main>;

    const crew = shown?.units.filter(u => u.side === 'crew') ?? [];
    const enemies = shown?.units.filter(u => u.side === 'enemy') ?? [];
    const toggleLane = (lane: number) => setLanes(l => l.includes(lane) ? l.filter(x => x !== lane) : l.length < CREW_SIZE ? [...l, lane].sort((a, b) => a - b) : l);
    const result = shown?.status === 'victory' ? '勝利' : shown?.status === 'defeat' ? '失敗' : shown?.status === 'timeout' ? '超時' : null;

    return <main className="bt-app">
        <header className="bt-header">
            <div>
                <p className="bt-eyebrow">第一階段戰鬥測試版 · 不扣資源、不發獎勵、無永久傷亡、不讀寫生活資料</p>
                <h1>帝國廢墟 · 卡迪安 SE × 叛軍 NW</h1>
            </div>
            <div className="bt-controls" role="group" aria-label="戰鬥控制">
                {phase === 'deploy' && <button type="button" onClick={start} disabled={!!deployError} className="bt-primary">開始戰鬥</button>}
                {phase === 'running' && <button type="button" onClick={() => setPhase('paused')}>暫停</button>}
                {phase === 'paused' && <button type="button" onClick={() => setPhase('running')} className="bt-primary">繼續</button>}
                {phase !== 'deploy' && <button type="button" onClick={start}>同條件重開</button>}
                {phase !== 'deploy' && <button type="button" onClick={restart}>回到部署</button>}
                <button type="button" onClick={() => setSpeed(s => (s === 1 ? 2 : 1))} aria-pressed={speed === 2}>速度 {speed}×</button>
                <label className="bt-check"><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)} /> 低動態</label>
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

        <div className="bt-layout">
            <div className="bt-stage-wrap">
                {shown && <BattleStage battle={shown} previous={snap?.previous ?? shown} fraction={fraction} art={art} reduced={reduced} selectedId={selectedId} onSelect={setSelectedId} />}
                {phase === 'paused' && <div className="bt-overlay">已暫停</div>}
                {result && <div className="bt-overlay bt-overlay--result">{result} · {(shown!.tick / TICKS_PER_SECOND).toFixed(1)} 秒<small>測試結果不影響任何正式資料</small></div>}
            </div>
            <aside className="bt-side">
                <h2>我方裝備（{crew.filter(u => u.hp > 0).length}/{crew.length} 存活）</h2>
                <ul className="bt-roster">
                    {crew.map(u => {
                        const held = heldWeaponId(poseFor(u, shown!.tick, art.cadian).frame);
                        return <li key={u.id} className={`bt-card${selectedId === u.id ? ' is-selected' : ''}${u.hp <= 0 ? ' is-down' : ''}`} data-unit-card={u.id} data-held-weapon={held ?? 'none'} data-active-weapon={u.loadout[u.active]}>
                            <button type="button" className="bt-card__head" onClick={() => setSelectedId(u.id)}>
                                <strong>{u.name}</strong>
                                <span>{u.hp > 0 ? `${u.hp}/${u.maxHp}` : '倒地'} · {ACTION_LABEL[u.action.kind] ?? u.action.kind}</span>
                            </button>
                            <div className="bt-hp"><i style={{ width: `${100 * u.hp / u.maxHp}%` }} /></div>
                            <SlotRow unit={u} slot="primary" tick={shown!.tick} />
                            <SlotRow unit={u} slot="secondary" tick={shown!.tick} />
                        </li>;
                    })}
                </ul>
                <h2>敵軍（{enemies.filter(u => u.hp > 0).length}/{enemies.length}）</h2>
                <p className="bt-enemies">{enemies.map(u => `${u.name} ${u.hp > 0 ? u.hp : '倒地'}`).join(' · ')}</p>
                <h2>戰鬥紀錄</h2>
                <ol className="bt-log">{(shown?.log ?? []).slice(0, 14).map((line, i) => <li key={i}>{line}</li>)}</ol>
                <p className="bt-perf" data-fps={perf.fps} data-sim-ms={perf.simMs}>效能：{perf.fps} fps · 模擬 {perf.simMs} ms／步 · 單位 {shown?.units.length ?? 0}</p>
            </aside>
        </div>
    </main>;
}
