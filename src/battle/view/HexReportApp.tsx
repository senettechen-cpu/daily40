import { useEffect, useMemo, useRef, useState } from 'react';
import type { BattleReplay, UnitSpec } from '../../../shared/battle/turn';
import { objectiveText, runBattle, scenarioById, STANCE_LABELS } from '../../../shared/battle/turn';
import type { Board } from '../../../shared/battle/hex';
import { DEPLOYMENT_KEY } from '../handoff';
import { eventDescription, frameState, FRAME_MS, type PlaybackPhase } from '../playback';
import { portraitHead, equipmentArt } from '../../data/reportArtIndex';
import { WEAPON_STATS } from '../../../shared/battle/turn/rules';
import { HexMap } from './HexMap';
import { WeaponEffects } from './WeaponEffects';
import { DiagnosisPanel } from './DiagnosisPanel';
import './battle-test.css';
import './battle-report.css';
import './battle-cinematic.css';

interface Handoff {
    squadName: string; scenarioId: string; seed: number; crew: UnitSpec[]; board: Board;
    outcome: 'victory' | 'defeat' | 'timeout'; rounds?: number; paysXp?: boolean;
    unmodelled?: string[]; woundedIds?: string[]; summary?: string; missionName?: string;
    replay?: BattleReplay; demo?: boolean;
}
const OUTCOME = { victory: '作戰勝利', defeat: '作戰失敗', timeout: '作戰超時' };
const ENDING: Record<string, string> = { 'enemy-down': '敵軍全滅', 'crew-down': '我方全滅', 'mutual-down': '雙方全滅', 'rounds-ahead': '回合用盡，我方存活較多', 'rounds-behind': '回合用盡，敵方存活較多', 'rounds-level': '回合用盡，存活人數相同', 'objective-met': '達成作戰目標' };
const DUTY: Record<string, string> = { sergeant: '中士', rifleman: '步槍兵', marksman: '精準射手', medic: '醫療兵', engineer: '工兵', heavy: '重武器手', cultist: '異教徒', walker: '步行機甲', tank: '裝甲載具', relay: '中繼設施' };
function readHandoff(): Handoff | null {
    try {
        const value = JSON.parse(sessionStorage.getItem(DEPLOYMENT_KEY) ?? 'null');
        return value && Array.isArray(value.crew) && value.crew.length && value.board ? value : null;
    } catch { return null; }
}

export function HexReportApp() {
    const [handoff] = useState(readHandoff);
    const [step, setStep] = useState(0);
    const [phase, setPhase] = useState<PlaybackPhase>('aim');
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [selected, setSelected] = useState<string>();
    const clock = useRef({ key: '', remaining: 0 });
    const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    const replay = useMemo<BattleReplay | null>(() => {
        if (!handoff) return null;
        if (handoff.replay) {
            const r = handoff.replay;
            return r.version === 1 && Array.isArray(r.initialUnits) && Array.isArray(r.result?.timeline)
                && r.initialBoard && r.result.finalBoard && r.result.outcome === handoff.outcome ? r : null;
        }
        const scenario = scenarioById(handoff.scenarioId);
        if (!scenario) return null;
        const units = [...handoff.crew, ...scenario.enemies];
        const result = runBattle({ board: handoff.board, units, seed: handoff.seed, objective: scenario.objective });
        if (result.outcome !== handoff.outcome || (handoff.rounds !== undefined && result.rounds !== handoff.rounds)) return null;
        return { version: 1, initialUnits: units, initialBoard: handoff.board, objective: scenario.objective, result };
    }, [handoff]);
    const total = replay?.result.timeline.length ?? 0;
    const done = step >= total;
    useEffect(() => {
        const key = `${step}:${phase}`;
        if (clock.current.key !== key) clock.current = { key, remaining: FRAME_MS[phase] };
        if (!playing || done) return;
        const started = performance.now();
        const timer = window.setTimeout(() => {
            if (phase === 'aim') setPhase('fire');
            else if (phase === 'fire') setPhase('impact');
            else { setStep(s => Math.min(total, s + 1)); setPhase('aim'); }
        }, clock.current.remaining / speed);
        return () => {
            window.clearTimeout(timer);
            clock.current.remaining = Math.max(0, clock.current.remaining - (performance.now() - started) * speed);
        };
    }, [playing, done, step, phase, speed, total]);
    useEffect(() => { if (done) setPlaying(false); }, [done]);
    useEffect(() => {
        const hide = () => { if (document.hidden) setPlaying(false); };
        document.addEventListener('visibilitychange', hide);
        return () => document.removeEventListener('visibilitychange', hide);
    }, []);
    const seek = (n: number) => { clock.current.key = ''; setPlaying(false); setPhase('aim'); setStep(Math.max(0, Math.min(total, n))); };
    const back = <a className="cin-back" href={import.meta.env.BASE_URL}>← 返回指揮部</a>;
    if (!handoff || !replay) return <main className="bt-app">{back}<p className="bt-notice">{handoff ? '這份舊紀錄或資料版本無法可靠重播。請返回指揮部查看已結算結果；不要為了重播重複出戰。' : '沒有可重播的行動，請從名冊出戰。'}</p>{handoff && <p>{OUTCOME[handoff.outcome]} · {handoff.summary}</p>}</main>;
    const units = replay.initialUnits;
    const names = new Map(units.map(u => [u.id, u.name]));
    const sides = new Map(units.map(u => [u.id, u.side]));
    const faces = new Map(units.map(u => [u.id, u.assetId]));
    const maxHp = new Map(units.map(u => [u.id, u.maxHp]));
    const frame = frameState(replay, step, phase !== 'aim');
    const visibleFrame = phase === 'impact' ? frameState(replay, step + 1) : frame;
    const current = frame.pending;
    const focus = units.find(u => u.id === selected) ?? units.find(u => u.id === current?.unitId) ?? units[0];
    const focused = visibleFrame.snapshot.find(u => u.id === focus?.id);
    const attack = current?.unitId === focus?.id ? current.activities.find(a => a.kind === 'attack') : undefined;
    const weaponName = attack?.kind === 'attack' ? attack.weapon : focus?.weapon.name;
    const weaponId = Object.entries(WEAPON_STATS).find(([, w]) => w.name === weaponName)?.[0];
    const weaponImage = weaponId ? equipmentArt(weaponId, 192) : null;
    const face = portraitHead(focus?.assetId);
    const scenario = scenarioById(handoff.scenarioId);
    const alive = (side: string) => visibleFrame.snapshot.filter(u => sides.get(u.id) === side && !u.down).length;
    return <main className="bt-app cinematic-report">
        <header className="cin-header"><div>{back}<p className="cin-kicker">IMPERIAL TACTICAL ARCHIVE / 作戰紀錄</p>
            <h1>{handoff.missionName ?? handoff.squadName ?? '六人戰術小隊'}</h1>
            <p className="bt-hint">{scenario ? objectiveText({ ...scenario, objective: replay.objective }) : '依本場作戰目標行動'} · {handoff.demo ? '本機示範紀錄' : handoff.replay ? '伺服器實錄' : '舊版種子重建'} · 重播不影響獎勵</p></div>
            <div className="cin-round"><small>ROUND</small><strong>{done ? replay.result.rounds : current?.round ?? 1}</strong><span>我方 {alive('crew')}　／　敵軍 {alive('enemy')}</span></div>
        </header>
        {!handoff.replay && <p className="bt-warn">舊版紀錄依目前規則重建；已比對勝負與回合，但不能保證每次行動與當時完全相同。</p>}
        <div className="cin-layout"><section className="cin-stage" aria-label="戰場">
            <div className="cin-stage-bar"><span>◆ 我方　◇ 敵軍</span><span>{done ? '行動結束' : !playing ? '已暫停' : phase !== 'aim' ? '執行中' : '行動準備'} · {step} / {total}</span></div>
            <HexMap board={visibleFrame.board} snapshot={visibleFrame.snapshot} names={names} sides={sides} faces={faces} maxHp={maxHp}
                acting={current?.unitId} selected={selected} onSelect={setSelected} objective={replay.objective} barrage={frame.barrage}
                effects={phase !== 'aim' && current ? <WeaponEffects key={step} event={current} snapshot={frame.snapshot} speed={speed} paused={!playing} reduced={reduced} /> : null} />
            <div className="cin-caption" aria-live={playing ? 'off' : 'polite'}>
                <strong>{done ? OUTCOME[handoff.outcome] : names.get(current?.unitId ?? '') ?? '回合結算'}</strong>
                <span>{done ? ENDING[replay.result.ending] : current?.reason}</span>
                <small>{!done && current ? (phase !== 'aim' ? eventDescription(current, names) : '按播放觀看行動，或逐步檢查結果') : handoff.summary}</small>
            </div>
        </section><aside className="cin-inspector" aria-label="單位情報">
            <p className="cin-kicker">UNIT INTELLIGENCE / 點選棋子查看</p>
            {focus && <><div className="cin-person">{face && <img src={face} alt="" width={64} height={64} />}<div><h2>{focus.name}</h2><p>{focus.side === 'crew' ? '我方' : '敵軍'} · {DUTY[focus.duty] ?? focus.duty} · {STANCE_LABELS[focus.stance]}</p></div></div>
            <div className="cin-health"><span>生命 {focused?.hp ?? focus.maxHp} / {focus.maxHp}</span><progress max={focus.maxHp} value={focused?.hp ?? focus.maxHp} /></div>
            <dl><div><dt>護甲</dt><dd>{focus.armour}</dd></div><div><dt>移動</dt><dd>{focus.movement} 格</dd></div><div><dt>先攻</dt><dd>{focus.initiative}</dd></div></dl>
            <div className="cin-weapon">{weaponImage && <img src={weaponImage} alt="" />}<small>{attack?.kind === 'attack' ? '本次使用' : '主武器'}</small><strong>{weaponName}</strong><span>副武器：{focus.sidearm?.name ?? '無（近戰可能使用徒手）'}</span></div>
            <p className="bt-hint">主武器射程 {focus.weapon.range} 格 · 單發基礎傷害 {focus.weapon.damage} · {focus.weapon.hits} 次攻擊判定</p></>}
            <h2 className="cin-log-title">最近行動</h2><ol className="cin-log">{replay.result.timeline.slice(Math.max(0, step - 5), step).reverse().map((event, i) => <li key={step - i}><strong>R{event.round} {names.get(event.unitId) ?? '戰場'}</strong><span>{eventDescription(event, names)}</span></li>)}</ol>
            {step === 0 && <p className="bt-hint">此刻顯示完整初始部署，尚未執行第一個行動。</p>}
        </aside></div>
        <footer className="cin-controls"><div className="bt-controls" role="group" aria-label="重播控制">
            <button onClick={() => seek(0)} disabled={step === 0 && phase === 'aim'}>重播</button>
            <button onClick={() => seek(step - 1)} disabled={step === 0}>上一步</button>
            <button className="bt-primary" onClick={() => { if (done) seek(0); setPlaying(p => !p); }}>{playing ? '暫停' : done ? '重新播放' : '播放戰鬥'}</button>
            <button onClick={() => seek(step + 1)} disabled={done}>下一步</button>
            <button onClick={() => seek(total)} disabled={done}>看結果</button>
            <button onClick={() => setSpeed(s => s === 1 ? 2 : s === 2 ? .5 : 1)} aria-label="播放速度">{speed}×</button>
            <label><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)} />簡化特效</label>
        </div><label className="cin-scrub">行動進度 <input aria-label="行動進度" type="range" min={0} max={total} value={step} onChange={e => seek(Number(e.target.value))} /></label></footer>
        {done && <section className="cin-result" aria-label="結算"><h2>{OUTCOME[handoff.outcome]}</h2><p>{ENDING[replay.result.ending]} · {replay.result.rounds} 回合</p><p>{handoff.summary ?? '請返回名冊查看結算。'}</p>{!!handoff.woundedIds?.length && <p className="bt-warn">{handoff.woundedIds.length} 人負傷，今日不得再出戰。</p>}</section>}
        {done && <DiagnosisPanel units={replay.initialUnits} result={replay.result} objective={replay.objective} />}
        {!!handoff.unmodelled?.length && <p className="bt-warn">本場尚未生效的裝備：{handoff.unmodelled.join('、')}</p>}
    </main>;
}
