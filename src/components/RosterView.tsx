import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Select, Tabs } from 'antd';
import { Lock, Plus, Swords, Trash2, UserPlus, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
    Character, DUTY_LABELS, Duty, HEALTH_LABELS, ORIGIN_LABELS, SQUAD_SIZE, Squad,
    isDeployable, levelOf, maxHp, xpToNext,
} from '../../shared/roster';
import { RecruitTemplate, recruitError, validateSquad } from '../../shared/roster';
import { deploymentFor } from '../../shared/battle/deployment';
import { DEPLOYMENT_KEY } from '../battle/handoff';
import { portraitHead } from '../data/reportArtIndex';
import { MAX_TRAINEES, SCENARIOS } from '../../shared/battle';

const OUTCOME_LABELS: Record<string, string> = { victory: '勝利', defeat: '失敗', timeout: '超時' };

// Each character keeps their own portrait; a duty with no delivered crop falls
// back to a marked medallion rather than borrowing someone else's likeness.
const portraitFor = (character: Character) => portraitHead(character.assetId);

const HEALTH_STYLES: Record<Character['health'], string> = {
    fit: 'text-green-400 border-green-700/60',
    wounded: 'text-amber-400 border-amber-700/60',
    critical: 'text-red-400 border-red-700/60',
};

const Portrait = ({ character, size = 48 }: { character: Character; size?: number }) => {
    const src = portraitFor(character);
    if (src) {
        return <img src={src} alt="" width={size} height={size} className="flex-shrink-0 border border-imperial-gold/30 object-cover" />;
    }
    return (
        <div
            style={{ width: size, height: size }}
            title="尚無立繪，暫以代號顯示"
            className="flex-shrink-0 border border-dashed border-zinc-600 bg-zinc-900 flex items-center justify-center font-mono text-imperial-gold/70 text-sm"
        >
            {character.name.slice(0, 2)}
        </div>
    );
};

const CharacterCard = ({ character, action, onAction }: {
    character: Character; action: 'add' | 'remove' | null; onAction?: () => void;
}) => {
    const level = levelOf(character.xp);
    const next = xpToNext(character.xp);

    return (
        <div className="flex items-center gap-3 p-2 border border-zinc-700 bg-zinc-900/60 hover:border-imperial-gold/40 transition-colors">
            <Portrait character={character} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-imperial-gold text-sm truncate">{character.name}</span>
                    <span className={`text-[10px] font-mono px-1 border ${HEALTH_STYLES[character.health]}`}>
                        {HEALTH_LABELS[character.health]}
                    </span>
                </div>
                <div className="text-[11px] font-mono text-zinc-500 truncate">
                    {ORIGIN_LABELS[character.origin]} · {DUTY_LABELS[character.duty]} · Lv{level}
                </div>
                <div className="text-[11px] font-mono text-zinc-600">
                    生命 {maxHp(character)}{next === null ? ' · 已滿級' : ` · 距下一級 ${next} XP`}
                </div>
            </div>
            {action && (
                <Button
                    size="small"
                    type="text"
                    aria-label={action === 'add' ? `加入 ${character.name}` : `移出 ${character.name}`}
                    onClick={onAction}
                    className="!text-imperial-gold/70 hover:!text-imperial-gold"
                >
                    {action === 'add' ? <UserPlus size={16} /> : <X size={16} />}
                </Button>
            )}
        </div>
    );
};

export const RosterView = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
    const { getToken } = useAuth();
    const [characters, setCharacters] = useState<Character[]>([]);
    const [squads, setSquads] = useState<Squad[]>([]);
    const [activeSquadId, setActiveSquadId] = useState<string | null>(null);
    const [dutyFilter, setDutyFilter] = useState<Duty | 'all'>('all');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [departure, setDeparture] = useState<string | null>(null);
    const [recruits, setRecruits] = useState<RecruitTemplate[]>([]);
    const [authorized, setAuthorized] = useState<string[]>([]);
    const [balance, setBalance] = useState(0);
    const [recruitName, setRecruitName] = useState('');
    const [scenarioId, setScenarioId] = useState('standard');
    const [traineeIds, setTraineeIds] = useState<string[]>([]);

    const load = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const data = await api.getRoster(token);
            setCharacters(data.characters);
            setSquads(data.squads);
            setRecruits(data.recruits ?? []);
            setAuthorized(data.authorized ?? []);
            setBalance(data.balance ?? 0);
            setActiveSquadId(prev => (prev && data.squads.some(s => s.id === prev) ? prev : data.squads[0]?.id ?? null));
        } catch (err) {
            setError(err instanceof Error ? err.message : '無法載入名冊');
        }
    }, [getToken]);

    useEffect(() => { if (visible) void load(); }, [visible, load]);

    const activeSquad = squads.find(squad => squad.id === activeSquadId) ?? null;
    const byId = useMemo(() => new Map(characters.map(c => [c.id, c])), [characters]);
    const members = activeSquad ? activeSquad.memberIds.map(id => byId.get(id)).filter((c): c is Character => !!c) : [];

    const available = characters.filter(character =>
        (dutyFilter === 'all' || character.duty === dutyFilter) && !activeSquad?.memberIds.includes(character.id));

    const run = async (work: (token: string) => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            const token = await getToken();
            if (!token) return;
            await work(token);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : '操作失敗');
        } finally {
            setBusy(false);
        }
    };

    const setMembers = (memberIds: string[]) => {
        if (!activeSquad) return;
        void run(token => api.updateSquad(activeSquad.id, { memberIds }, token).then(() => undefined));
    };

    /**
     * v1.5 G1 plus the departure checks. The gate is read from the server, so a
     * client that has been open since yesterday cannot slip past it.
     */
    const depart = async () => {
        if (!activeSquad) return;
        setBusy(true);
        setDeparture(null);
        setError(null);
        try {
            const token = await getToken();
            if (!token) return;

            // The server re-checks everything and resolves the battle itself; these
            // checks only save a round trip and give a clearer message.
            const squadError = validateSquad(activeSquad, characters, true);
            if (squadError) { setError(squadError); return; }
            if (members.length !== SQUAD_SIZE) {
                setError(`模擬目前固定部署 ${SQUAD_SIZE} 個通道，請補滿再出戰。`);
                return;
            }

            const started = await api.startOperation(activeSquad.id, scenarioId, traineeIds, token);
            sessionStorage.setItem(DEPLOYMENT_KEY, JSON.stringify({
                crew: started.operation.crew,
                unmodelled: started.unmodelled,
                squadName: activeSquad.name,
                scenarioId: started.operation.scenarioId,
                seed: started.operation.seed,
                lanes: started.operation.lanes,
                outcome: started.operation.outcome,
            }));

            const gained = started.awards.filter(a => a.role === 'deployed')[0]?.amount ?? 0;
            const result = started.operation.paysXp
                ? `行動結束：${OUTCOME_LABELS[started.operation.outcome]}，出戰者各 +${gained} XP`
                : `行動結束：${OUTCOME_LABELS[started.operation.outcome]}（本次不計 XP）`;
            await load();

            // The result is already recorded; the report tab only replays it. A blocked
            // popup must say so, or the battle looks like it silently did nothing.
            const report = window.open(`${import.meta.env.BASE_URL}battle-test.html`, '_blank');
            setDeparture(report ? result : `${result} · 戰報分頁被瀏覽器擋下，請允許此站的彈出視窗`);
        } catch (err) {
            setError(err instanceof Error ? err.message : '無法出戰');
        } finally {
            setBusy(false);
        }
    };

    const addSquad = () => {
        const name = `編成 ${squads.length + 1}`;
        void run(token => api.createSquad(name, token).then(squad => { setActiveSquadId(squad.id); }));
    };

    const recruitPanel = (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-imperial-gold/60">新兵姓名（留空自動取名）</span>
                <Input size="small" value={recruitName} onChange={e => setRecruitName(e.target.value)}
                    className="!w-40 !bg-black !border-imperial-gold/30 !text-imperial-gold font-mono" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
                {recruits.map(template => {
                    const blocked = recruitError(template, { balance, authorized });
                    return (
                        <div key={template.id} className="flex items-center gap-3 p-2 border border-zinc-700 bg-zinc-900/60">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-imperial-gold text-sm">{template.name}</span>
                                    {template.restricted && !authorized.includes(template.id) && (
                                        <span className="text-[10px] font-mono text-amber-500 border border-amber-800/60 px-1 flex items-center gap-1">
                                            <Lock size={10} /> 未授權
                                        </span>
                                    )}
                                </div>
                                <div className="text-[11px] font-mono text-zinc-500">
                                    {ORIGIN_LABELS[template.origin]} · {DUTY_LABELS[template.duty]} · {template.price} 軍需
                                </div>
                                {template.note && <div className="text-[11px] font-mono text-zinc-600 truncate">{template.note}</div>}
                            </div>
                            <Button size="small" disabled={busy || !!blocked} title={blocked ?? '招募'}
                                icon={<UserPlus size={14} />}
                                onClick={() => void run(async token => {
                                    await api.recruitCharacter(template.id, recruitName || undefined, token);
                                    setRecruitName('');
                                })}
                                className="!bg-transparent !border-imperial-gold/40 !text-imperial-gold font-mono" />
                        </div>
                    );
                })}
            </div>
            <div className="font-mono text-[11px] text-zinc-600">
                新兵不附裝備，主武器與護甲需另外到軍械庫採購。名冊沒有人數上限，但每場最多部署六人。
                價格為候選值，尚未依實際節奏校準。
            </div>
        </div>
    );

    const rosterPanel = (
        <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                    {squads.map(squad => (
                        <button
                            key={squad.id}
                            type="button"
                            onClick={() => setActiveSquadId(squad.id)}
                            className={`px-3 py-1 border font-mono text-xs tracking-widest transition-colors ${squad.id === activeSquadId
                                ? 'border-imperial-gold text-imperial-gold bg-imperial-gold/10'
                                : 'border-zinc-700 text-zinc-500 hover:border-imperial-gold/50'}`}
                        >
                            {squad.name} {squad.memberIds.length}/{SQUAD_SIZE}
                        </button>
                    ))}
                    <Button size="small" type="text" icon={<Plus size={14} />} disabled={busy} onClick={addSquad}
                        className="!text-imperial-gold/70 hover:!text-imperial-gold font-mono">新增編成</Button>
                </div>

                {activeSquad && (
                    <div className="border border-imperial-gold/20 p-3">
                        <div className="flex items-center justify-between mb-2">
                            <Input
                                size="small"
                                value={activeSquad.name}
                                onChange={e => setSquads(prev => prev.map(s => s.id === activeSquad.id ? { ...s, name: e.target.value } : s))}
                                onBlur={e => void run(token => api.updateSquad(activeSquad.id, { name: e.target.value }, token).then(() => undefined))}
                                className="!w-48 !bg-black !border-imperial-gold/30 !text-imperial-gold font-mono"
                            />
                            <Button size="small" type="text" danger icon={<Trash2 size={14} />} disabled={busy || squads.length <= 1}
                                onClick={() => void run(token => api.deleteSquad(activeSquad.id, token))}
                                className="font-mono">刪除編成</Button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {Array.from({ length: SQUAD_SIZE }).map((_, index) => {
                                const member = members[index];
                                return member ? (
                                    <CharacterCard key={member.id} character={member} action="remove"
                                        onAction={() => setMembers(activeSquad.memberIds.filter(id => id !== member.id))} />
                                ) : (
                                    <div key={`empty-${index}`} className="flex items-center justify-center h-[68px] border border-dashed border-zinc-800 text-zinc-700 font-mono text-xs">
                                        空位
                                    </div>
                                );
                            })}
                        </div>

                        {members.some(member => !isDeployable(member)) && (
                            <div className="mt-2 font-mono text-[11px] text-red-400">編成中有重傷人員，出發前必須替換。</div>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <Select size="small" value={scenarioId} onChange={setScenarioId} className="!w-36"
                                options={SCENARIOS.map(s => ({ value: s.id, label: s.name }))} />
                            <Select size="small" mode="multiple" allowClear value={traineeIds} onChange={setTraineeIds}
                                maxTagCount={2} placeholder={`備訓（最多 ${MAX_TRAINEES}）`} className="!min-w-[180px]"
                                options={characters.filter(c => !activeSquad.memberIds.includes(c.id))
                                    .map(c => ({ value: c.id, label: c.name, disabled: traineeIds.length >= MAX_TRAINEES && !traineeIds.includes(c.id) }))} />
                            <Button size="small" icon={<Swords size={14} />} disabled={busy || members.length === 0}
                                onClick={() => void depart()}
                                className="!bg-transparent !border-imperial-gold !text-imperial-gold font-mono tracking-widest">
                                出戰
                            </Button>
                            {departure && <span className="font-mono text-[11px] text-green-400">{departure}</span>}
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-imperial-gold/60">全名冊 {characters.length} 人</span>
                    <Select
                        size="small"
                        value={dutyFilter}
                        onChange={setDutyFilter}
                        className="!w-32"
                        options={[{ value: 'all', label: '全部職責' },
                        ...Object.entries(DUTY_LABELS).map(([value, label]) => ({ value, label }))]}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 max-h-[40vh] overflow-y-auto pr-1">
                    {available.map(character => (
                        <CharacterCard key={character.id} character={character}
                            action={activeSquad && activeSquad.memberIds.length < SQUAD_SIZE ? 'add' : null}
                            onAction={() => activeSquad && setMembers([...activeSquad.memberIds, character.id])} />
                    ))}
                    {available.length === 0 && (
                        <div className="col-span-full text-center text-zinc-600 font-mono text-xs py-6">
                            沒有符合條件的人員
                        </div>
                    )}
                </div>
        </div>
    );

    return (
        <Modal open={visible} onCancel={onClose} footer={null} width={1100} className="imperial-shop"
            title={<span className="eyebrow">星界軍名冊 / ROSTER · 軍需 {balance}</span>}>
            {error && <div className="mb-2 border border-red-900/60 bg-red-950/40 text-red-400 font-mono text-xs p-2">{error}</div>}
            <Tabs
                items={[
                    { key: 'roster', label: `編成與名冊（${characters.length}）`, children: rosterPanel },
                    { key: 'recruit', label: '招募中心', children: recruitPanel },
                ]}
            />
        </Modal>
    );
};
