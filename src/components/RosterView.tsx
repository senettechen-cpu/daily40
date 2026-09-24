import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Select } from 'antd';
import { Plus, Trash2, UserPlus, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
    Character, DUTY_LABELS, Duty, HEALTH_LABELS, ORIGIN_LABELS, SQUAD_SIZE, Squad,
    isDeployable, levelOf, maxHp, xpToNext,
} from '../../shared/roster';

// Only the plain Cadian rifleman has delivered art. Giving another duty that
// portrait would misrepresent them, so everyone else gets an initials medallion
// that is visibly a placeholder until GPT delivers their crop.
const PORTRAIT_BASE = `${import.meta.env.BASE_URL}battle-assets/report/portraits/`;
const portraitFor = (character: Character) =>
    character.origin === 'cadian' && character.duty === 'rifleman' ? `${PORTRAIT_BASE}cadian-rifleman-head.webp` : null;

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

    const load = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const data = await api.getRoster(token);
            setCharacters(data.characters);
            setSquads(data.squads);
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

    const addSquad = () => {
        const name = `編成 ${squads.length + 1}`;
        void run(token => api.createSquad(name, token).then(squad => { setActiveSquadId(squad.id); }));
    };

    return (
        <Modal open={visible} onCancel={onClose} footer={null} width={1100} className="imperial-shop"
            title={<span className="eyebrow">星界軍名冊 / ROSTER</span>}>
            <div className="flex flex-col gap-4">
                {error && (
                    <div className="border border-red-900/60 bg-red-950/40 text-red-400 font-mono text-xs p-2">{error}</div>
                )}

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
        </Modal>
    );
};
