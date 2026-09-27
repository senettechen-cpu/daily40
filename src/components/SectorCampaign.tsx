import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'antd';
import { CheckCircle2, Lock, Swords, Crown, Hourglass } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api, CampaignView } from '../services/api';
import {
    STRONGHOLDS, Stronghold, StrongholdRecord, StrongholdState, WORLDS, worldById,
} from '../../shared/sector';
import { scenarioById } from '../../shared/battle/turn';
import { catalogItem } from '../../shared/armory';
import { recruitTemplate } from '../../shared/roster';

// The 灰燼星區 recovery campaign (docs/campaign-and-operation-plans.md §2).
// Planet art is GPT's sector set used as a placeholder until the world
// banners and stronghold icons are delivered (docs §7).

const ART = `${import.meta.env.BASE_URL}battle-assets/sector/`;

const STATE_LOOK: Record<StrongholdState, { label: string; box: string; icon: React.ReactNode }> = {
    captured: { label: '已收復', box: 'border-green-600/70 bg-green-950/30 text-green-300', icon: <CheckCircle2 size={14} /> },
    open: { label: '可進攻', box: 'border-imperial-gold bg-imperial-gold/10 text-imperial-gold', icon: <Swords size={14} /> },
    locked: { label: '敵軍控制', box: 'border-zinc-800 bg-black/40 text-zinc-600', icon: <Lock size={14} /> },
    pending: { label: '準備中', box: 'border-zinc-700 border-dashed bg-black/30 text-zinc-500', icon: <Hourglass size={14} /> },
};

const unlockNames = (s: Stronghold) => [
    ...s.unlocks.equipment.map(id => catalogItem(id)?.name ?? id),
    ...s.unlocks.personnel.map(id => recruitTemplate(id)?.name ?? id),
];

export const SectorCampaign: React.FC<{ onDeploy: (strongholdId: string) => void }> = ({ onDeploy }) => {
    const { getToken } = useAuth();
    const [campaign, setCampaign] = useState<CampaignView | null>(null);
    const [names, setNames] = useState<Map<string, string>>(new Map());
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const [sector, roster] = await Promise.all([api.getCampaign(token), api.getRoster(token)]);
            setCampaign(sector);
            setNames(new Map(roster.characters.map(c => [c.id, c.name])));
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : '無法載入星區戰役');
        }
    }, [getToken]);

    useEffect(() => { void load(); }, [load]);

    const records = useMemo(() => new Map((campaign?.strongholds ?? []).map(r => [r.id, r])), [campaign]);
    const recordOf = (id: string): StrongholdRecord =>
        records.get(id) ?? { id, state: id === 'w1-n1' ? 'open' : 'locked', attempts: 0, defeats: 0, capturedAt: null, capturedBy: [] };
    const capturedCount = STRONGHOLDS.filter(s => recordOf(s.id).state === 'captured').length;

    // Default to where the fight is: the first stronghold that can be attacked.
    const focusId = selectedId ?? STRONGHOLDS.find(s => recordOf(s.id).state === 'open')?.id ?? 'w1-n1';
    const focus = STRONGHOLDS.find(s => s.id === focusId)!;
    const focusRecord = recordOf(focus.id);
    const scenario = focus.scenarioId ? scenarioById(focus.scenarioId) : undefined;
    // Decision 4: a lost fight buys full intelligence on the next attempt.
    const fullIntel = focusRecord.defeats > 0 || focusRecord.state === 'captured';

    const node = (s: Stronghold) => {
        const look = STATE_LOOK[recordOf(s.id).state];
        return (
            <button key={s.id} type="button" onClick={() => setSelectedId(s.id)}
                className={`flex items-center gap-2 px-2.5 py-2 border text-left text-xs font-mono transition-all ${look.box} ${focus.id === s.id ? 'ring-1 ring-imperial-gold' : ''}`}>
                {s.boss ? <Crown size={14} /> : look.icon}
                <span className="truncate">{s.name}</span>
            </button>
        );
    };

    return (
        <div className="sector-campaign mb-8">
            <div className="campaign-heading">
                <div><span className="eyebrow">SECTOR CAMPAIGN</span><h2>灰燼星區 · 收復戰</h2></div>
                <p>已收復 {capturedCount} / {STRONGHOLDS.length} 個據點{campaign?.recovered ? ' · 星區已收復' : ''}</p>
            </div>
            {error && <div className="mb-3 border border-red-900/60 bg-red-950/40 text-red-400 font-mono text-xs p-2">{error}</div>}
            {campaign?.recovered && (
                <div className="mb-4 border border-imperial-gold bg-imperial-gold/10 p-4 font-mono text-sm text-imperial-gold">
                    灰燼星區已收復。十字軍主力抵達時，接手的是一片安全的星域。所有據點都可以重打，只給 XP。
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {WORLDS.map(world => {
                        const own = STRONGHOLDS.filter(s => s.world === world.id);
                        const [first, second, third, last] = own;
                        const done = own.filter(s => recordOf(s.id).state === 'captured').length;
                        return (
                            <div key={world.id} className="border border-zinc-800 bg-zinc-950/70 p-3 flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                    <img src={`${ART}sector-${world.planet}-96.webp`} alt="" className="w-12 h-12 flex-shrink-0" />
                                    <div className="min-w-0">
                                        <div className="text-[10px] font-mono text-zinc-500">世界 {world.id} · {world.role}</div>
                                        <div className="text-imperial-gold font-bold truncate">{world.name}</div>
                                        <div className="text-[10px] font-mono text-zinc-500">{done}/4 已收復</div>
                                    </div>
                                </div>
                                {/* The branch: one opens two, both open the last. */}
                                {node(first)}
                                <div className="grid grid-cols-2 gap-2">{node(second)}{node(third)}</div>
                                {node(last)}
                            </div>
                        );
                    })}
                </div>

                <div className="border border-zinc-800 bg-zinc-950/70 p-4 flex flex-col gap-3">
                    <div>
                        <div className="text-[10px] font-mono text-zinc-500">{worldById(focus.world)?.name} · 據點 {focus.index}{focus.boss ? ' · 首領' : ''}</div>
                        <div className="flex items-center gap-2">
                            <h3 className="!m-0 text-lg font-bold text-white">{focus.name}</h3>
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 border ${STATE_LOOK[focusRecord.state].box}`}>{STATE_LOOK[focusRecord.state].label}</span>
                        </div>
                    </div>
                    <p className="m-0 text-sm text-zinc-300 leading-relaxed">{focus.briefing}</p>

                    {unlockNames(focus).length > 0 && (
                        <div className="font-mono text-[11px] text-imperial-gold/80">首次收復開放：{unlockNames(focus).join('、')}</div>
                    )}
                    {focusRecord.attempts > 0 && (
                        <div className="font-mono text-[11px] text-zinc-500">
                            出擊 {focusRecord.attempts} 次 · 失利 {focusRecord.defeats} 次
                            {focusRecord.capturedAt && ` · ${focusRecord.capturedAt.slice(0, 10)} 首次收復`}
                        </div>
                    )}
                    {focusRecord.capturedBy.length > 0 && (
                        <div className="font-mono text-[11px] text-green-400/80">
                            收復者：{focusRecord.capturedBy.map(id => names.get(id) ?? '（已離隊）').join('、')}
                        </div>
                    )}

                    {scenario && (
                        <div className="border border-zinc-800 bg-black/40 p-2.5">
                            <div className="eyebrow mb-1">{fullIntel ? '完整敵情' : '偵察情報'}</div>
                            {fullIntel ? (
                                <ul className="m-0 p-0 list-none flex flex-col gap-0.5 font-mono text-[11px] text-zinc-300">
                                    {scenario.enemies.map(e => (
                                        <li key={e.id}>{e.name} · {e.weapon.name}{e.armour > 0 ? ` · 護甲 ${e.armour}` : ' · 無甲'} · 生命 {e.maxHp}</li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="font-mono text-[11px] text-zinc-400 leading-relaxed">
                                    約 {scenario.enemies.length} 名敵軍。{scenario.description}
                                    <div className="text-zinc-600 mt-1">失利一次後可取得完整敵方配置。</div>
                                </div>
                            )}
                        </div>
                    )}

                    <Button type="primary" icon={<Swords size={14} />}
                        disabled={focusRecord.state !== 'open' && focusRecord.state !== 'captured'}
                        className={focusRecord.state === 'open' || focusRecord.state === 'captured' ? '!bg-imperial-gold !border-imperial-gold !text-black font-bold' : 'font-bold'}
                        onClick={() => onDeploy(focus.id)}>
                        {focusRecord.state === 'captured' ? '派遣小隊（重打，只給 XP）' : focusRecord.state === 'open' ? '派遣小隊出戰' : STATE_LOOK[focusRecord.state].label}
                    </Button>
                </div>
            </div>
        </div>
    );
};
