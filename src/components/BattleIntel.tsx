import { useEffect, useState } from 'react';
import { Button } from 'antd';
import { Crosshair } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { Threat } from '../../shared/battle/turn';

// Pre-battle intelligence (2026-09-27, system review P1-3): the threats this
// fight holds, whether the squad has an answer to each, and an estimate from
// fighting the squad as it stands on fixed seeds. The server builds the
// deployment the same way a real departure does and writes nothing.

const fallbackUrl = import.meta.env.PROD ? window.location.origin : 'http://localhost:3001';
const BASE = (import.meta.env.VITE_API_URL || fallbackUrl).replace(/\/api\/?$/, '').replace(/\/+$/, '');

export interface Preview { battles: number; winRate: number; timeoutRate: number; medianRounds: number; threats: Threat[] }

export async function fetchPreview(body: { squadId: string; strongholdId?: string; missionId?: string }, token: string): Promise<Preview> {
    const response = await fetch(`${BASE}/api/operations/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '無法預估');
    return data as Preview;
}

const tone = (rate: number) => (rate >= 0.7 ? 'text-green-400' : rate >= 0.4 ? 'text-amber-400' : 'text-red-400');

export const BattleIntel = ({ squadId, strongholdId, missionId, revision }: {
    squadId: string | null;
    strongholdId?: string;
    missionId?: string;
    /** Anything that changes the squad (members, gear, stances); a change clears a stale estimate. */
    revision?: string;
}) => {
    const { getToken } = useAuth();
    const [preview, setPreview] = useState<Preview | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { setPreview(null); setError(null); }, [squadId, strongholdId, missionId, revision]);

    const run = async () => {
        if (!squadId) return;
        setBusy(true);
        setError(null);
        try {
            const token = await getToken();
            if (!token) return;
            setPreview(await fetchPreview({ squadId, strongholdId, missionId }, token));
        } catch (err) {
            setError(err instanceof Error ? err.message : '無法預估');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-2 border border-zinc-800 bg-black/40 p-2 font-mono text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
                <Button size="small" icon={<Crosshair size={12} />} loading={busy} disabled={!squadId} onClick={() => void run()}
                    className="!bg-transparent !border-sky-700 !text-sky-300 font-mono">敵情與勝率預估</Button>
                {preview && (
                    <span className={tone(preview.winRate)}>
                        模擬 {preview.battles} 場：勝率約 {Math.round(preview.winRate * 100)}%
                        <span className="text-zinc-500">（中位數 {preview.medianRounds} 回合{preview.timeoutRate > 0 ? `，超時 ${Math.round(preview.timeoutRate * 100)}%` : ''}）</span>
                    </span>
                )}
                {error && <span className="text-red-400">{error}</span>}
            </div>
            {preview && preview.threats.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 m-0 p-0 list-none">
                    {preview.threats.map(t => (
                        <li key={t.id} className="flex flex-col">
                            <span className={t.covered ? 'text-zinc-300' : 'text-amber-400'}>
                                {t.covered ? '✓' : '⚠'} {t.title}：<span className="text-zinc-500">{t.detail}</span>
                            </span>
                            <span className="pl-4 text-zinc-500">{t.covered ? '已有對策：' : '建議：'}{t.answer}</span>
                        </li>
                    ))}
                </ul>
            )}
            {preview && preview.threats.length === 0 && <div className="mt-1 text-zinc-500">這場沒有特殊威脅。</div>}
            {preview && <div className="mt-1 text-zinc-600">預估用固定種子模擬，實際出戰每場的擲骰不同；換裝或改站位後請重新預估。</div>}
        </div>
    );
};
