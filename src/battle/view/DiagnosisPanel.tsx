import { diagnose } from '../../../shared/battle/turn';
import type { BattleResult, Objective, UnitSpec } from '../../../shared/battle/turn';

// After-action review (2026-09-27, system review P1-3): who did what, and for a
// loss, the likeliest reasons and what to try. Computed from the same result
// the report replays, so it cannot disagree with what was shown.

export const DiagnosisPanel = ({ units, result, objective }: { units: UnitSpec[]; result: BattleResult; objective?: Objective }) => {
    const report = diagnose(units, result, objective);
    return (
        <section aria-label="戰後檢討" style={{ marginTop: 12, padding: 12, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(0,0,0,.45)' }}>
            <p className="cin-kicker">AFTER-ACTION REVIEW / 戰後檢討</p>
            {report.mvp && <p className="bt-hint">本場輸出最高：{report.mvp}</p>}
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                    <tr><th style={{ textAlign: 'left' }}>隊員</th><th style={{ textAlign: 'right' }}>造成傷害</th><th style={{ textAlign: 'right' }}>承受</th><th style={{ textAlign: 'right' }}>治療</th><th style={{ textAlign: 'right' }}>結果</th></tr>
                </thead>
                <tbody>
                    {report.crew.map(line => (
                        <tr key={line.id}>
                            <td>{line.name}</td>
                            <td style={{ textAlign: 'right' }}>{line.dealt}</td>
                            <td style={{ textAlign: 'right' }}>{line.taken}</td>
                            <td style={{ textAlign: 'right' }}>{line.healed || '—'}</td>
                            <td style={{ textAlign: 'right' }}>{line.down ? '倒下' : '存活'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {report.reasons.length > 0 && (
                <>
                    <p className="cin-kicker" style={{ marginTop: 10 }}>可能的敗因與建議</p>
                    <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                        {report.reasons.map((r, i) => (
                            <li key={i} style={{ marginBottom: 4 }}><b>{r.title}</b><br /><span style={{ opacity: .8 }}>{r.advice}</span></li>
                        ))}
                    </ol>
                </>
            )}
        </section>
    );
};
