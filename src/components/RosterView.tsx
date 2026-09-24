import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Select, Tabs } from 'antd';
import { Lock, Plus, Swords, Trash2, UserPlus, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
    Character, DUTY_LABELS, Duty, HEALTH_LABELS, ORIGIN_LABELS, SQUAD_SIZE, Squad,
    isDeployable, isWoundedOn, levelOf, maxHp, xpToNext,
} from '../../shared/roster';
import { dayKey } from '../../shared/time';
import { RecruitTemplate, recruitError, validateSquad } from '../../shared/roster';
import {
    crewFor, damageOf, defaultPlacements, scenarioById, STANCES, Stance, WEAPON_STATS,
} from '../../shared/battle/turn';
import { StanceIcon, STANCE_ART } from './icons/stance/StanceIcon';
import {
    EquipmentItem, SLOT_CAPACITY, SLOT_LABELS, Slot, assignmentError, catalogItem, itemsOf,
} from '../../shared/armory';
import { DEPLOYMENT_KEY } from '../battle/handoff';
import { equipmentArt, portraitHead } from '../data/reportArtIndex';
import { MAX_TRAINEES } from '../../shared/battle';
import { SCENARIOS } from '../../shared/battle/turn';

const OUTCOME_LABELS: Record<string, string> = { victory: '勝利', defeat: '失敗', timeout: '超時' };

/** Recruit templates are named by the roster payload; this covers the unlock notice. */
const RECRUIT_NAMES: Record<string, string> = {
    kasrkin: '卡斯爾金', 'catachan-fighter': '卡塔昌叢林戰士', 'krieg-infantry': '克里格步兵',
};

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

const CharacterCard = ({ character, action, onAction, onOpen }: {
    character: Character; action: 'add' | 'remove' | null; onAction?: () => void; onOpen?: () => void;
}) => {
    const level = levelOf(character.xp);
    const next = xpToNext(character.xp);
    const wounded = isWoundedOn(character, dayKey(new Date()));

    return (
        <div
            role={onOpen ? 'button' : undefined}
            tabIndex={onOpen ? 0 : undefined}
            onClick={onOpen}
            onKeyDown={onOpen ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } : undefined}
            title={onOpen ? '檢視戰力與配裝' : undefined}
            className={`flex items-center gap-3 p-2 border border-zinc-700 bg-zinc-900/60 hover:border-imperial-gold/40 transition-colors ${onOpen ? 'cursor-pointer' : ''}`}
        >
            <Portrait character={character} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-imperial-gold text-sm truncate">{character.name}</span>
                    <span className={`text-[10px] font-mono px-1 border ${HEALTH_STYLES[character.health]}`}>
                        {HEALTH_LABELS[character.health]}
                    </span>
                    {wounded && (
                        <span className="text-[10px] font-mono px-1 border text-red-400 border-red-800/60" title="今天的敗戰中負傷，今日不得再出戰">
                            今日負傷
                        </span>
                    )}
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
                    onClick={e => { e.stopPropagation(); onAction?.(); }}
                    className="!text-imperial-gold/70 hover:!text-imperial-gold"
                >
                    {action === 'add' ? <UserPlus size={16} /> : <X size={16} />}
                </Button>
            )}
        </div>
    );
};

/**
 * The one behaviour control the player has. The icon is decorative: the Chinese
 * name stays beside it, because a shape alone is not a label.
 */
const StancePicker = ({ value, disabled, onChange }: {
    value: Stance; disabled: boolean; onChange: (next: Stance) => void;
}) => (
    <div className="flex gap-1" role="group" aria-label="作戰姿態">
        {STANCES.map(stance => (
            <button
                key={stance}
                type="button"
                disabled={disabled}
                aria-pressed={value === stance}
                title={STANCE_ART[stance].label}
                onClick={e => { e.stopPropagation(); onChange(stance); }}
                className={`flex items-center gap-1 px-1.5 py-1 border font-mono text-[10px] transition-colors ${value === stance
                    ? 'border-imperial-gold text-imperial-gold bg-imperial-gold/10'
                    : 'border-zinc-700 text-zinc-500 hover:border-imperial-gold/50 hover:text-imperial-gold/70'}`}
            >
                <StanceIcon stance={stance} size={14} />
                <span>{STANCE_ART[stance].label}</span>
            </button>
        ))}
    </div>
);

/** Catalogue art for one item; every catalogue entry has a delivered image. */
const ItemArt = ({ catalogId, size = 28 }: { catalogId: string; size?: number }) => {
    const src = equipmentArt(catalogId, 96);
    return src
        ? <img src={src} alt="" width={size} height={size} className="flex-shrink-0 border border-imperial-gold/20 bg-[#2d3331] object-contain" />
        : <div style={{ width: size, height: size }} className="flex-shrink-0 border border-dashed border-zinc-700 bg-zinc-900" title="尚無裝備圖" />;
};

const EmptySlotArt = ({ size = 40 }: { size?: number }) => (
    <div style={{ width: size, height: size }} className="flex-shrink-0 border border-dashed border-zinc-800 bg-black/40" title="此欄位是空的" />
);

/** One equippable slot: what is in it now, and everything that could go in it. */
const SlotRow = ({ label, current, options, disabled, onChange }: {
    label: string;
    current: EquipmentItem | null;
    options: { item: EquipmentItem; blocked: string | null }[];
    disabled: boolean;
    onChange: (nextItemId: string | null) => void;
}) => (
    <div className="flex items-center gap-2">
        <span className="w-14 flex-shrink-0 font-mono text-[11px] text-zinc-500">{label}</span>
        {current ? <ItemArt catalogId={current.catalogId} size={40} /> : <EmptySlotArt />}
        <Select
            size="small"
            className="!flex-1"
            disabled={disabled}
            value={current?.id ?? ''}
            onChange={value => onChange(value || null)}
            optionLabelProp="title"
            options={[
                { value: '', title: '— 空 —', label: <span className="font-mono text-[12px] text-zinc-500">— 空 —</span> },
                ...options.map(({ item, blocked }) => {
                    const name = catalogItem(item.catalogId)?.name ?? item.catalogId;
                    return {
                        value: item.id,
                        disabled: !!blocked,
                        title: name,
                        label: (
                            <span className="flex items-center gap-2">
                                <ItemArt catalogId={item.catalogId} />
                                <span className="font-mono text-[12px]">{name}</span>
                                {blocked && <span className="font-mono text-[11px] text-zinc-600">（{blocked}）</span>}
                            </span>
                        ),
                    };
                }),
            ]}
        />
    </div>
);

/**
 * One soldier's combat numbers and their gear. The numbers come from the same
 * deployment function the battle runs on, so what is shown here is what fights;
 * gear the simulation cannot model yet says so instead of implying an effect.
 */
const SoldierDossier = ({ character, items, authorized, busy, onAssign, onClose }: {
    character: Character;
    items: EquipmentItem[];
    authorized: string[];
    busy: boolean;
    onAssign: (currentItemId: string | null, nextItemId: string | null) => void;
    onClose: () => void;
}) => {
    // The same function the battle uses, so the card cannot disagree with the field.
    const built = crewFor([character], items, [{ characterId: character.id, at: { col: 0, row: 0 }, stance: 'advance' }]);
    const profile = built.units[0];
    const weapon = profile.weapon;
    const carried = itemsOf(items, character.id);
    const unmodelledSet = new Set(built.unmodelled);

    const inSlot = (slot: Slot) =>
        carried.filter(item => catalogItem(item.catalogId)?.category === slot);

    // A swap frees the slot before it fills it, so the occupancy check must be
    // made against a roster where the outgoing item has already been put back.
    const choicesFor = (slot: Slot, current: EquipmentItem | null) => {
        const afterRemoval = current
            ? items.map(item => (item.id === current.id ? { ...item, assignedTo: null } : item))
            : items;
        return items
            .filter(item => catalogItem(item.catalogId)?.category === slot)
            .filter(item => !item.assignedTo || item.assignedTo === character.id)
            .filter(item => !carried.some(held => held.id === item.id) || item.id === current?.id)
            .map(item => ({ item, blocked: assignmentError(item, character, afterRemoval, authorized) }));
    };

    const stat = (label: string, value: string, note?: string) => (
        <div className="flex items-baseline gap-2">
            <span className="w-14 flex-shrink-0 font-mono text-[11px] text-zinc-500">{label}</span>
            <span className="font-mono text-[12px] text-imperial-gold/90">{value}</span>
            {note && <span className="font-mono text-[11px] text-zinc-600">{note}</span>}
        </div>
    );

    const slotRows: { label: string; current: EquipmentItem | null }[] = [];
    for (const slot of ['primary', 'sidearm', 'armour', 'tool'] as Slot[]) {
        const held = inSlot(slot);
        for (let index = 0; index < SLOT_CAPACITY[slot]; index += 1) {
            slotRows.push({
                label: SLOT_CAPACITY[slot] > 1 ? `${SLOT_LABELS[slot]}${index + 1}` : SLOT_LABELS[slot],
                current: held[index] ?? null,
            });
        }
    }

    return (
        <Modal open onCancel={onClose} footer={null} width={520}
            title={<span className="eyebrow">{character.name} · 戰力與配裝</span>}>
            <div className="flex items-center gap-3 mb-4">
                <Portrait character={character} size={72} />
                <div className="min-w-0">
                    <div className="font-mono text-imperial-gold text-sm">{character.name}</div>
                    <div className="font-mono text-[11px] text-zinc-500">
                        {ORIGIN_LABELS[character.origin]} · {DUTY_LABELS[character.duty]} · Lv{levelOf(character.xp)} · {HEALTH_LABELS[character.health]}
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-1 mb-4 p-3 border border-zinc-800 bg-black/40">
                {stat('火力', `${weapon.name} · 每發 ${weapon.damage} × ${weapon.hits} 發`,
                    `射程 ${weapon.range} 格${weapon.penetration > 0 ? ` · 穿甲 ${weapon.penetration}` : ''}`)}
                {stat('防禦', `護甲 ${profile.armour} · 生命 ${profile.maxHp}`,
                    `敵方雷射槍每發 ${WEAPON_STATS.lasgun.damage} → ${damageOf(WEAPON_STATS.lasgun, profile.armour)}`)}
                {stat('機動', `每回合 ${profile.movement} 格`)}
                {stat('先攻', `${profile.initiative}`, '同隊內數字高的先行動')}
                {stat('命中', `${Math.round(profile.accuracy * 100)}%`)}
            </div>

            <div className="flex flex-col gap-2">
                {slotRows.map((row, index) => {
                    const slot = (['primary', 'sidearm', 'armour', 'tool', 'tool'] as Slot[])[index];
                    return (
                        <SlotRow
                            key={`${slot}-${index}`}
                            label={row.label}
                            current={row.current}
                            options={choicesFor(slot, row.current)}
                            disabled={busy}
                            onChange={next => onAssign(row.current?.id ?? null, next)}
                        />
                    );
                })}
            </div>

            {unmodelledSet.size > 0 && (
                <div className="mt-3 border border-amber-900/60 bg-amber-950/20 text-amber-500/90 font-mono text-[11px] p-2">
                    模擬尚未涵蓋：{[...unmodelledSet].map(id => catalogItem(id)?.name ?? id).join('、')}。
                    這些裝備會被帶上戰場，但目前不影響戰鬥結果。
                </div>
            )}

            <div className="mt-3 font-mono text-[11px] text-zinc-600">
                未配武器者徒手出戰。換裝立即生效，下一場行動就會採用。數值為未校準的候選值。
            </div>
        </Modal>
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
    const [items, setItems] = useState<EquipmentItem[]>([]);
    const [equipAuthorized, setEquipAuthorized] = useState<string[]>([]);
    const [dossierId, setDossierId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const [data, armoury] = await Promise.all([api.getRoster(token), api.getArmory(token)]);
            setCharacters(data.characters);
            setSquads(data.squads);
            setRecruits(data.recruits ?? []);
            setAuthorized(data.authorized ?? []);
            setBalance(data.balance ?? 0);
            setItems(armoury.items ?? []);
            setEquipAuthorized(armoury.authorized ?? []);
            setActiveSquadId(prev => (prev && data.squads.some(s => s.id === prev) ? prev : data.squads[0]?.id ?? null));
        } catch (err) {
            setError(err instanceof Error ? err.message : '無法載入名冊');
        }
    }, [getToken]);

    useEffect(() => { if (visible) void load(); }, [visible, load]);

    const activeSquad = squads.find(squad => squad.id === activeSquadId) ?? null;
    const dossier = dossierId ? characters.find(character => character.id === dossierId) ?? null : null;
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

    /**
     * Moves one item into a slot. Clearing the old item first keeps the slot
     * within capacity, which the server would otherwise refuse.
     */
    const assign = (currentItemId: string | null, nextItemId: string | null, characterId: string) => {
        if (currentItemId === nextItemId) return;
        void run(async token => {
            if (currentItemId) await api.assignEquipment(currentItemId, null, token);
            if (nextItemId) await api.assignEquipment(nextItemId, characterId, token);
        });
    };

    /**
     * The formation as the battle will build it: the saved one, or the default
     * the server would fall back to. Shown rather than an empty state, so the
     * squad's stances are never a surprise at departure.
     */
    const board = scenarioById(scenarioId)?.board;
    const placements = useMemo(() => {
        if (!activeSquad || !board) return [];
        const saved = activeSquad.placements ?? [];
        const roster = members.map(m => ({ id: m.id, duty: m.duty }));
        const fallback = defaultPlacements(board, roster);
        return roster.map(member =>
            saved.find(p => p.characterId === member.id)
            ?? fallback.find(p => p.characterId === member.id)
            ?? { characterId: member.id, at: { col: 0, row: 0 }, stance: 'advance' as Stance });
    }, [activeSquad, board, members]);

    const stanceOf = (characterId: string): Stance =>
        placements.find(p => p.characterId === characterId)?.stance ?? 'advance';

    const setStance = (characterId: string, stance: Stance) => {
        if (!activeSquad) return;
        const next = placements.map(p => (p.characterId === characterId ? { ...p, stance } : p));
        void run(token => api.updateSquad(activeSquad.id, { placements: next }, token).then(() => undefined));
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
            const squadError = validateSquad(activeSquad, characters, true, dayKey(new Date()));
            if (squadError) { setError(squadError); return; }
            if (members.length !== SQUAD_SIZE) {
                setError(`模擬目前固定部署 ${SQUAD_SIZE} 個通道，請補滿再出戰。`);
                return;
            }

            const started = await api.startOperation(activeSquad.id, scenarioId, traineeIds, token);
            sessionStorage.setItem(DEPLOYMENT_KEY, JSON.stringify({
                crew: started.operation.crew,
                board: started.operation.board,
                unmodelled: started.unmodelled,
                squadName: activeSquad.name,
                scenarioId: started.operation.scenarioId,
                seed: started.operation.seed,
                outcome: started.operation.outcome,
                rounds: started.operation.rounds,
                paysXp: started.operation.paysXp,
                woundedIds: started.woundedIds,
            }));

            const gained = started.awards.filter(a => a.role === 'deployed')[0]?.amount ?? 0;
            const base = started.operation.paysXp
                ? `行動結束：${OUTCOME_LABELS[started.operation.outcome]}，出戰者各 +${gained} XP`
                : `行動結束：${OUTCOME_LABELS[started.operation.outcome]}（本次不計 XP）`;
            const wounded = started.woundedIds?.length ?? 0;
            const earned = [...(started.unlocked?.equipment ?? []), ...(started.unlocked?.personnel ?? [])];
            const result = [
                base,
                wounded > 0 ? `${wounded} 人負傷，今日不得再出戰` : '',
                earned.length > 0 ? `獲得嘉獎，解鎖 ${earned.map(id => catalogItem(id)?.name ?? RECRUIT_NAMES[id] ?? id).join('、')}` : '',
            ].filter(Boolean).join(' · ');
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
                                    <div key={member.id} className="flex flex-col gap-1">
                                        <CharacterCard character={member} action="remove"
                                            onOpen={() => setDossierId(member.id)}
                                            onAction={() => setMembers(activeSquad.memberIds.filter(id => id !== member.id))} />
                                        <StancePicker value={stanceOf(member.id)} disabled={busy}
                                            onChange={stance => setStance(member.id, stance)} />
                                    </div>
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
                            onOpen={() => setDossierId(character.id)}
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
            {dossier && (
                <SoldierDossier
                    character={dossier}
                    items={items}
                    authorized={equipAuthorized}
                    busy={busy}
                    onAssign={(currentItemId, nextItemId) => assign(currentItemId, nextItemId, dossier.id)}
                    onClose={() => setDossierId(null)}
                />
            )}
        </Modal>
    );
};
