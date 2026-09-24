import { useMemo, useState } from 'react';
import type { Activation, BattleResult, UnitSpec } from '../../../shared/battle/turn';
import { runBattle, scenarioById } from '../../../shared/battle/turn';
import type { Board } from '../../../shared/battle/hex';
import { DEPLOYMENT_KEY } from '../handoff';
import { HexMap } from './HexMap';
import './battle-test.css';
import './battle-report.css';

// The v2 report. The server already resolved the battle; this replays it from
// the stored seed so the page and the server cannot disagree, and steps through
// the activations one at a time because every one of them states its reason.

interface Handoff {
    squadName: string;
    scenarioId: string;
    seed: number;
    crew: UnitSpec[];
    board: Board;
    outcome: 'victory' | 'defeat' | 'timeout';
    rounds?: number;
    paysXp?: boolean;
    unmodelled?: string[];
    woundedIds?: string[];
}

const OUTCOME_LABELS: Record<string, string> = { victory: '勝利', defeat: '失敗', timeout: '超時' };

/** How it ended, not just who won: a win on bodies should not read as a wipe. */
const ENDING_LABELS: Record<string, string> = {
    'enemy-down': '敵軍全滅',
    'crew-down': '我方全滅',
    'mutual-down': '同歸於盡',
    'rounds-ahead': '回合用盡，我方存活較多',
    'rounds-behind': '回合用盡，敵方存活較多',
    'rounds-level': '回合用盡，雙方存活相同',
};

function readHandoff(): Handoff | null {
    try {
        const raw = sessionStorage.getItem(DEPLOYMENT_KEY);
        const parsed = raw ? JSON.parse(raw) as Handoff : null;
        return parsed && Array.isArray(parsed.crew) && parsed.crew.length > 0 && parsed.board ? parsed : null;
    } catch {
        return null;
    }
}

const describe = (activation: Activation, names: Map<string, string>) => {
    const who = names.get(activation.unitId) ?? activation.unitId;
    const hit = activation.activities.find(a => a.kind === 'attack');
    const result = hit && hit.kind === 'attack'
        ? (hit.hits > 0 ? `命中 ${hit.hits} 發，造成 ${hit.damage} 傷害` : '全部落空')
        : '';
    return { who, reason: activation.reason, result };
};

export function HexReportApp() {
    const [handoff] = useState<Handoff | null>(readHandoff);
    const [step, setStep] = useState(0);

    const battle = useMemo<BattleResult | null>(() => {
        if (!handoff) return null;
        const scenario = scenarioById(handoff.scenarioId);
        if (!scenario) return null;
        return runBattle({ board: handoff.board, units: [...handoff.crew, ...scenario.enemies], seed: handoff.seed });
    }, [handoff]);

    if (!handoff) {
        return <main className="bt-app"><p className="bt-notice">沒有可重播的行動。請從名冊按「出戰」。</p></main>;
    }
    if (!battle) {
        return <main className="bt-app"><p className="bt-notice">找不到這場行動的情境，無法重播。結果與 XP 已由伺服器結算。</p></main>;
    }

    const names = new Map<string, string>([
        ...handoff.crew.map(unit => [unit.id, unit.name] as [string, string]),
        ...(scenarioById(handoff.scenarioId)?.enemies ?? []).map(unit => [unit.id, unit.name] as [string, string]),
    ]);
    const faces = new Map<string, string | undefined>([
        ...handoff.crew.map(unit => [unit.id, unit.assetId] as [string, string | undefined]),
        ...(scenarioById(handoff.scenarioId)?.enemies ?? []).map(unit => [unit.id, unit.assetId] as [string, string | undefined]),
    ]);
    const sides = new Map<string, 'crew' | 'enemy'>([
        ...handoff.crew.map(unit => [unit.id, unit.side] as [string, 'crew' | 'enemy']),
        ...(scenarioById(handoff.scenarioId)?.enemies ?? []).map(unit => [unit.id, unit.side] as [string, 'crew' | 'enemy']),
    ]);

    const shown = battle.activations.slice(0, step + 1);
    const current = shown[shown.length - 1];
    const last = battle.activations.length - 1;
    const alive = (side: 'crew' | 'enemy') =>
        (current?.snapshot ?? []).filter(s => sides.get(s.id) === side && !s.down).length;

    return (
        <main className="bt-app br-app">
            <header className="bt-header">
                <div>
                    <p className="bt-eyebrow">
                        重播伺服器判定的行動 · {handoff.paysXp === false ? '本場不計 XP' : 'XP 已於出戰時結算'} · 不扣軍需、無永久傷亡
                    </p>
                    <h1>{handoff.squadName} · {OUTCOME_LABELS[battle.outcome]}（{battle.rounds} 回合）</h1>
                    <p className="bt-hint">{ENDING_LABELS[battle.ending] ?? ''}</p>
                </div>
                <div className="bt-controls" role="group" aria-label="重播控制">
                    <button type="button" onClick={() => setStep(0)} disabled={step === 0}>回到開頭</button>
                    <button type="button" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>上一步</button>
                    <button type="button" className="bt-primary" onClick={() => setStep(s => Math.min(last, s + 1))} disabled={step >= last}>下一步</button>
                    <button type="button" onClick={() => setStep(last)} disabled={step >= last}>看結果</button>
                </div>
            </header>

            <p className="bt-hint">
                第 {current?.round ?? 1} 回合 · 第 {step + 1} / {battle.activations.length} 次行動 ·
                我方存活 {alive('crew')} / 敵方存活 {alive('enemy')}
            </p>

            <HexMap board={handoff.board} snapshot={current?.snapshot ?? []} names={names} sides={sides} faces={faces} acting={current?.unitId} />

            <ol className="br-feed">
                {shown.map((activation, index) => {
                    const line = describe(activation, names);
                    const mine = sides.get(activation.unitId) === 'crew';
                    return (
                        <li key={index} className={index === shown.length - 1 ? 'is-current' : undefined}>
                            <strong style={{ color: mine ? '#9fd6b4' : '#dba490' }}>R{activation.round} {line.who}</strong>
                            {' · '}{line.reason}{line.result ? ` · ${line.result}` : ''}
                        </li>
                    );
                })}
            </ol>

            {handoff.unmodelled && handoff.unmodelled.length > 0 && (
                <p className="bt-warn">目前模擬沒有這些裝備的戰鬥數值，本場不生效：{handoff.unmodelled.join('、')}。</p>
            )}
            {handoff.woundedIds && handoff.woundedIds.length > 0 && (
                <p className="bt-warn">{handoff.woundedIds.length} 人在這場敗戰中負傷，今日不得再出戰。</p>
            )}
            <p className="bt-hint">數值為未校準的候選值，平衡尚待驗收。</p>
        </main>
    );
}
