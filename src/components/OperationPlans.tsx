import React, { useMemo, useState } from 'react';
import { Button, Modal, Progress, Tag, message } from 'antd';
import { ChevronLeft, ChevronRight, Copy, Lock, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { useRequisition } from '../contexts/RequisitionContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { CloseProjectResult, Project, ProjectCrate } from '../types';
import {
    CHARACTER_SHARE, CRATE_POOLS, DIFFICULTY_GATES, RARITIES, RARITY_LABELS, RARITY_ODDS, daysBetween, effectiveDifficulty,
    gateShortfall,
} from '../../shared/progression';
import { catalogItem } from '../../shared/armory';
import { recruitTemplate } from '../../shared/roster';
import { dayKey } from '../../shared/time';
import { crateFrameArt, equipmentArt, portraitHalf } from '../data/reportArtIndex';

// Operation plans replace the month-bound planet projects (2026-09-27): a plan
// with subtasks, subtasks deployed as one-off tasks, and an explicit, final
// close that opens a supply crate. docs/campaign-and-operation-plans.md §3.

const MILESTONES = 3;

// Rarity colours for the label and the glow, and the border the card falls
// back to when its frame art is missing (docs §7).
const RARITY_STYLE: Record<ProjectCrate['rarity'], { border: string; text: string; glow: string }> = {
    common: { border: 'border-zinc-500', text: 'text-zinc-300', glow: '' },
    fine: { border: 'border-green-500', text: 'text-green-400', glow: 'shadow-[0_0_24px_rgba(34,197,94,0.35)]' },
    rare: { border: 'border-sky-400', text: 'text-sky-300', glow: 'shadow-[0_0_28px_rgba(56,189,248,0.4)]' },
    legendary: { border: 'border-imperial-gold', text: 'text-imperial-gold', glow: 'shadow-[0_0_36px_rgba(251,191,36,0.55)]' },
};

/**
 * The odds a crate of this difficulty rolls, and everything it can hold
 * (2026-09-27, system review P1-7: odds are shown, not hidden in the code).
 * Restricted entries only drop once the campaign has opened them; a rarity
 * with nothing opened steps down a tier, so a crate is never empty.
 */
export const CrateOdds: React.FC<{ level: number }> = ({ level }) => {
    const odds = RARITY_ODDS[Math.min(5, Math.max(1, level))];
    return (
        <div className="text-xs space-y-1">
            <div className="font-bold">難度 {level} 補給箱機率</div>
            <div className="flex flex-wrap gap-x-3">
                {RARITIES.map(r => <span key={r}>{RARITY_LABELS[r]} {odds[r]}%</span>)}
            </div>
            <div className="text-zinc-500">同一稀有度中，約 {Math.round(CHARACTER_SHARE * 100)}% 是士兵、其餘是裝備（該級沒有可抽的士兵時一律是裝備）。</div>
            <details>
                <summary className="cursor-pointer">可能抽到的內容</summary>
                {RARITIES.filter(r => odds[r] > 0).map(r => {
                    const pool = CRATE_POOLS[r];
                    const gear = pool.equipment.map(id => `${catalogItem(id)?.name ?? id}${catalogItem(id)?.restricted ? '*' : ''}`);
                    const people = pool.characters.map(c => `${c.veteran ? '老兵 ' : ''}${recruitTemplate(c.templateId)?.name ?? c.templateId}${recruitTemplate(c.templateId)?.restricted ? '*' : ''}`);
                    return (
                        <div key={r} className="mt-1">
                            <b>{RARITY_LABELS[r]}</b>：{[...gear, ...people].join('、')}
                        </div>
                    );
                })}
                <div className="mt-1 text-zinc-500">* 需要星區戰役先解鎖；還沒解鎖時不會抽到，若該稀有度沒有可抽的內容就降一級。</div>
            </details>
        </div>
    );
};

/** Where a plan stands against its chosen difficulty, as of today. */
function standing(plan: Project) {
    const completed = plan.subTasks.filter(s => s.completed).length;
    const days = plan.createdAt ? daysBetween(dayKey(new Date(plan.createdAt)), dayKey(new Date())) : 0;
    const level = effectiveDifficulty(plan.difficulty, completed, days);
    const short = gateShortfall(plan.difficulty, completed, days);
    const milestones = plan.milestoneIds?.length ?? 0;
    const allDone = plan.subTasks.length > 0 && completed === plan.subTasks.length;
    let noCrate: string | null = null;
    if (plan.subTasks.length < 3 || milestones !== MILESTONES) noCrate = '至少 3 個子計畫並指定 3 個里程碑，結案才會開補給箱';
    else if (level === 0) noCrate = '同一天建立又結案不會開補給箱';
    return { completed, days, level, short, allDone, noCrate };
}

const prizeName = (crate: ProjectCrate) => crate.kind === 'equipment'
    ? catalogItem(crate.catalogId ?? '')?.name ?? crate.catalogId
    : `${crate.veteran ? '老兵 ' : ''}${recruitTemplate(crate.templateId ?? '')?.name ?? crate.templateId}`;

const prizeArt = (crate: ProjectCrate) => crate.kind === 'equipment'
    ? equipmentArt(crate.catalogId ?? '', 192)
    : portraitHalf(recruitTemplate(crate.templateId ?? '')?.assetId);

// GPT's rarity frames are nine-slice borders with an empty centre, drawn on a
// 96x96 canvas with 24px corners (handoff README §3). border-image does not
// inherit currentColor, so the rarity colour is baked into each file.
const FRAME_SLICE = 24;

const frameStyle = (rarity: ProjectCrate['rarity']): React.CSSProperties | null => {
    const src = crateFrameArt(rarity);
    return src ? {
        borderStyle: 'solid',
        borderWidth: FRAME_SLICE,
        borderColor: 'transparent',
        borderImageSource: `url(${src})`,
        borderImageSlice: FRAME_SLICE,
        borderImageWidth: `${FRAME_SLICE}px`,
        borderImageRepeat: 'stretch',
    } : null;
};

export const CrateCard: React.FC<{ crate: ProjectCrate; compact?: boolean }> = ({ crate, compact }) => {
    const style = RARITY_STYLE[crate.rarity];
    const art = prizeArt(crate);
    // The compact row keeps the plain rule: a 24px frame would swallow it.
    const frame = compact ? null : frameStyle(crate.rarity);
    const box = frame
        ? style.glow
        : `border-2 ${style.border} ${compact ? 'p-2' : `p-4 ${style.glow}`}`;
    return (
        <div style={frame ?? undefined} className={`flex items-center gap-3 bg-black/60 ${box}`}>
            {art
                ? <img src={art} alt="" className={`${compact ? 'w-10 h-10' : 'w-24 h-24'} object-contain bg-[#2d3331] flex-shrink-0`} />
                : <div className={`${compact ? 'w-10 h-10' : 'w-24 h-24'} bg-zinc-800 flex-shrink-0`} />}
            <div className="min-w-0">
                <div className={`font-mono text-xs tracking-widest ${style.text}`}>{RARITY_LABELS[crate.rarity]} · 難度 {crate.difficulty}</div>
                <div className={`${compact ? 'text-sm' : 'text-lg'} font-bold text-white`}>{prizeName(crate)}</div>
                {!compact && (
                    <div className="font-mono text-[11px] text-zinc-400 mt-1">
                        {crate.kind === 'equipment' ? '已放入軍械庫，可配發給任何人' : `${crate.name ? `${crate.name} ` : ''}已加入名冊${crate.veteran ? '（Lv4 起）' : ''}`}
                    </div>
                )}
            </div>
        </div>
    );
};

export const OperationPlans: React.FC = () => {
    const {
        projects, allTasks, addProject, addSubTask, completeSubTask, updateSubTask, deleteSubTask, deleteProject,
        setProjectDifficulty, closeProject, duplicateProject, addTask,
    } = useGame();
    const { enabled: economyOn, refresh: refreshRequisition } = useRequisition();
    const { getToken } = useAuth();

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [newDifficulty, setNewDifficulty] = useState(1);
    const [subTaskTitle, setSubTaskTitle] = useState('');
    const [editingSubTaskId, setEditingSubTaskId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [showSealed, setShowSealed] = useState(false);
    const [reveal, setReveal] = useState<CloseProjectResult | null>(null);
    const [closing, setClosing] = useState(false);

    // The server is the authority on milestones; this holds what it just confirmed.
    const [milestoneOverride, setMilestoneOverride] = useState<Record<string, string[]>>({});
    const [milestoneError, setMilestoneError] = useState<string | null>(null);
    const milestonesFor = (p: Project) => milestoneOverride[p.id] ?? p.milestoneIds ?? [];

    const active = useMemo(() => projects.filter(p => !p.sealedAt), [projects]);
    const sealed = useMemo(() => projects.filter(p => p.sealedAt)
        .sort((a, b) => String(b.sealedAt).localeCompare(String(a.sealedAt))), [projects]);
    const plan = projects.find(p => p.id === selectedId) ?? null;
    const planWithMilestones = plan ? { ...plan, milestoneIds: milestonesFor(plan) } : null;

    const createPlan = () => {
        const title = newTitle.trim();
        if (!title) return;
        const id = addProject(title, newDifficulty, '');
        setNewTitle('');
        setSelectedId(id);
    };

    const toggleMilestone = async (p: Project, subTaskId: string) => {
        const current = milestonesFor(p);
        const next = current.includes(subTaskId) ? current.filter(id => id !== subTaskId) : [...current, subTaskId];
        setMilestoneError(null);
        try {
            const token = await getToken();
            if (!token) return;
            const saved = await api.setProjectMilestones(p.id, next, token);
            setMilestoneOverride(prev => ({ ...prev, [p.id]: saved }));
            void refreshRequisition();
        } catch (err) {
            setMilestoneError(err instanceof Error ? err.message : '無法設定里程碑');
        }
    };

    const deployedIds = useMemo(() => new Set(allTasks
        .filter(t => t.status === 'active' && t.subTaskId)
        .map(t => t.subTaskId as string)), [allTasks]);

    const deployToday = (p: Project, subTaskId: string, title: string) => {
        const end = new Date();
        end.setHours(23, 59, 0, 0);
        addTask({ title, dueDate: end, isRecurring: false, link: { projectId: p.id, subTaskId } });
        message.success(`已部署到今日任務：${title}`);
    };

    const confirmClose = (p: Project) => {
        const s = standing({ ...p, milestoneIds: milestonesFor(p) });
        Modal.confirm({
            title: '結案作戰計畫',
            okText: '結案', cancelText: '再想想',
            content: (
                <div className="space-y-2 text-sm">
                    <p className="m-0"><b>結案後無法撤銷</b>，計畫會變成唯讀，里程碑也會鎖定。</p>
                    <p className="m-0">{s.noCrate ? `這次不會開補給箱：${s.noCrate}。` : `會開一個難度 ${s.level} 的補給箱。`}</p>
                    {!s.noCrate && <CrateOdds level={s.level} />}
                    {!s.noCrate && s.level < p.difficulty && (
                        <p className="m-0 text-amber-600">你選的是難度 {p.difficulty}，目前規模只夠算難度 {s.level}。
                            {s.short.subTasks > 0 && ` 還差 ${s.short.subTasks} 個完成的子計畫。`}
                            {s.short.days > 0 && ` 還要再等 ${s.short.days} 天。`}</p>
                    )}
                </div>
            ),
            onOk: async () => {
                setClosing(true);
                try {
                    const result = await closeProject(p.id);
                    setReveal(result);
                } catch (err) {
                    message.error(err instanceof Error ? err.message : '無法結案');
                } finally {
                    setClosing(false);
                }
            },
        });
    };

    const confirmDelete = (p: Project) => Modal.confirm({
        title: '刪除作戰計畫',
        content: '確定刪除？已發放的里程碑軍需會被扣回。',
        okText: '刪除', okType: 'danger', cancelText: '取消',
        onOk: () => { deleteProject(p.id); setSelectedId(null); },
    });

    const planRow = (p: Project) => {
        const s = standing({ ...p, milestoneIds: milestonesFor(p) });
        return (
            <button key={p.id} type="button" onClick={() => setSelectedId(p.id)}
                className={`w-full text-left flex justify-between items-center gap-3 p-3 border transition-all ${selectedId === p.id ? 'border-imperial-gold bg-imperial-gold/5' : 'border-zinc-700 bg-zinc-900 hover:border-imperial-gold/60'}`}>
                <div className="min-w-0">
                    <div className="text-imperial-gold font-bold truncate">{p.title}</div>
                    <div className="text-[11px] font-mono text-zinc-500">
                        選擇難度 {p.difficulty} · 目前算 {s.level || '—'} · {s.completed}/{p.subTasks.length} 完成
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <Progress percent={(s.completed / (p.subTasks.length || 1)) * 100} size="small" showInfo={false} strokeColor="#fbbf24" className="!w-16 !m-0" />
                    {s.allDone && <Tag color="gold" className="!m-0">可結案</Tag>}
                    <ChevronRight size={16} className="text-zinc-500" />
                </div>
            </button>
        );
    };

    const detail = plan && planWithMilestones && (() => {
        const s = standing(planWithMilestones);
        const isSealed = !!plan.sealedAt;
        const ms = milestonesFor(plan);
        return (
            <div className="flex flex-col gap-4">
                <button type="button" onClick={() => setSelectedId(null)} className="md:hidden self-start flex items-center gap-1 font-mono text-xs text-zinc-400">
                    <ChevronLeft size={14} /> 返回計畫清單
                </button>
                <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                        <span className="block text-zinc-500 text-xs font-mono mb-1">{isSealed ? '已結案 · 唯讀' : '作戰計畫'}</span>
                        <h4 className="!text-white !m-0 text-lg font-bold break-words">{plan.title}</h4>
                    </div>
                    {isSealed ? <Tag icon={<Lock size={12} className="inline mr-1" />} className="!m-0">已封存</Tag> : (
                        <select value={plan.difficulty} onChange={e => setProjectDifficulty(plan.id, Number(e.target.value))}
                            className="bg-black text-imperial-gold border border-imperial-gold/40 p-1.5 font-mono text-xs" aria-label="選擇難度">
                            {DIFFICULTY_GATES.map(g => <option key={g.level} value={g.level}>難度 {g.level}</option>)}
                        </select>
                    )}
                </div>

                {isSealed ? (
                    plan.crate ? <CrateCard crate={plan.crate} /> : <p className="font-mono text-xs text-zinc-500 m-0">這個計畫結案時沒有開補給箱。</p>
                ) : (
                    <div className="border border-zinc-800 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-zinc-400">
                        <div>難度 {plan.difficulty} 需要：完成 {s.short.gate.subTasks} 個子計畫
                            {s.short.subTasks > 0 ? <span className="text-amber-400">（還差 {s.short.subTasks}）</span> : <span className="text-green-500"> ✓</span>}
                            ，開案滿 {s.short.gate.days} 天
                            {s.short.days > 0 ? <span className="text-amber-400">（還差 {s.short.days} 天）</span> : <span className="text-green-500"> ✓</span>}
                        </div>
                        <div className={s.noCrate ? 'text-zinc-500' : 'text-imperial-gold'}>
                            現在結案：{s.noCrate ? `沒有補給箱（${s.noCrate}）` : `難度 ${s.level} 補給箱`}
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-2">
                    <span className="block text-imperial-gold/70 font-mono text-xs">
                        子計畫 ({s.completed}/{plan.subTasks.length})
                        {economyOn && <> · 里程碑 {ms.length}/{MILESTONES}{ms.length < MILESTONES && !isSealed && '（指定滿三個才開始發軍需）'}</>}
                        {milestoneError && <span className="text-red-400"> · {milestoneError}</span>}
                    </span>
                    {plan.subTasks.length === 0 && (
                        <div className="p-6 border border-dashed border-zinc-800 text-center text-zinc-600 font-mono text-xs">尚未建立子計畫</div>
                    )}
                    {plan.subTasks.map(st => (
                        <div key={st.id} className={`flex items-center gap-2 p-2.5 border ${st.completed ? 'bg-green-900/20 border-green-900/50' : 'bg-zinc-900 border-zinc-700'}`}>
                            <button type="button" disabled={st.completed || isSealed}
                                aria-label={st.completed ? '已完成' : `完成 ${st.title}`}
                                onClick={() => Modal.confirm({
                                    title: '確認子計畫完成', content: `確認已完成「${st.title}」？`, okText: '確認', cancelText: '取消',
                                    onOk: () => completeSubTask(plan.id, st.id),
                                })}
                                className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 ${st.completed ? 'bg-green-500 border-green-500 text-black' : 'border-zinc-500 hover:border-imperial-gold'}`}>
                                {st.completed && '✓'}
                            </button>
                            {economyOn && (
                                <button type="button" disabled={isSealed || (st.completed && !ms.includes(st.id))}
                                    onClick={() => void toggleMilestone(plan, st.id)}
                                    title={st.completed ? '已完成的子計畫無法再改指定' : '指定為里程碑（完成 +20 軍需）'}
                                    className={`text-[10px] font-mono px-1.5 py-0.5 border tracking-widest flex-shrink-0 ${ms.includes(st.id) ? 'border-imperial-gold text-imperial-gold bg-imperial-gold/10' : 'border-zinc-700 text-zinc-500 hover:border-imperial-gold/50'}`}>
                                    里程碑
                                </button>
                            )}
                            {editingSubTaskId === st.id ? (
                                <div className="flex-1 flex gap-2">
                                    <input value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus
                                        className="flex-1 min-w-0 bg-black text-white border border-imperial-gold p-1 font-mono text-sm" />
                                    <Button size="small" type="primary" onClick={() => { updateSubTask(plan.id, st.id, editTitle); setEditingSubTaskId(null); }}>儲存</Button>
                                </div>
                            ) : (
                                <>
                                    <span className={`flex-1 min-w-0 break-words ${st.completed ? 'line-through text-green-500' : 'text-white'}`}>{st.title}</span>
                                    {!st.completed && !isSealed && (
                                        <div className="flex gap-1 flex-shrink-0">
                                            {deployedIds.has(st.id)
                                                ? <span className="font-mono text-[10px] text-cyan-400 self-center">已部署</span>
                                                : (
                                                    <Button type="text" size="small" title="部署到今日任務" className="!text-cyan-400 hover:!text-cyan-300"
                                                        onClick={() => deployToday(plan, st.id, st.title)}>
                                                        <Send size={14} />
                                                    </Button>
                                                )}
                                            <Button type="text" size="small" className="!text-zinc-500 hover:!text-imperial-gold"
                                                onClick={() => { setEditingSubTaskId(st.id); setEditTitle(st.title); }}><Pencil size={14} /></Button>
                                            <Button type="text" size="small" className="!text-zinc-500 hover:!text-red-500"
                                                onClick={() => Modal.confirm({
                                                    title: '刪除子計畫', content: `確認刪除「${st.title}」？`, okText: '刪除', okType: 'danger', cancelText: '取消',
                                                    onOk: () => deleteSubTask(plan.id, st.id),
                                                })}><Trash2 size={14} /></Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ))}
                    {!isSealed && (
                        <div className="flex gap-2 mt-1">
                            <input value={subTaskTitle} onChange={e => setSubTaskTitle(e.target.value)} placeholder="新增子計畫…"
                                onKeyDown={e => { if (e.key === 'Enter' && subTaskTitle.trim()) { addSubTask(plan.id, subTaskTitle.trim()); setSubTaskTitle(''); } }}
                                className="flex-1 min-w-0 bg-black text-white border border-zinc-700 p-2 font-mono outline-none focus:border-imperial-gold" />
                            <Button disabled={!subTaskTitle.trim()} onClick={() => { addSubTask(plan.id, subTaskTitle.trim()); setSubTaskTitle(''); }}>增加</Button>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800">
                    {isSealed ? (
                        <Button icon={<Copy size={14} />} onClick={() => { const id = duplicateProject(plan.id); if (id) setSelectedId(id); }}>以此為範本新建</Button>
                    ) : (
                        <>
                            <Button type="primary" disabled={!s.allDone || closing || !economyOn} loading={closing}
                                className={s.allDone && economyOn ? '!bg-imperial-gold !border-imperial-gold !text-black font-bold' : 'font-bold'}
                                title={!s.allDone ? '所有子計畫完成後才能結案' : undefined}
                                onClick={() => confirmClose(plan)}>
                                結案
                            </Button>
                            <Button danger icon={<Trash2 size={14} />} onClick={() => confirmDelete(plan)}>刪除計畫</Button>
                        </>
                    )}
                </div>
            </div>
        );
    })();

    return (
        <div className="operation-plans">
            <div className="campaign-heading">
                <div><span className="eyebrow">OPERATION PLANS</span><h2>作戰計畫</h2></div>
                <p>子計畫可部署成每日任務；全部完成後結案，依難度開補給箱。</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-4">
                <div className={`flex flex-col gap-3 ${plan ? 'hidden md:flex' : ''}`}>
                    <div className="flex gap-2 p-3 border border-zinc-800 bg-zinc-900/60">
                        <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="新作戰計畫名稱"
                            onKeyDown={e => e.key === 'Enter' && createPlan()}
                            className="flex-1 min-w-0 bg-black text-white border border-zinc-700 p-2 font-mono outline-none focus:border-imperial-gold" />
                        <select value={newDifficulty} onChange={e => setNewDifficulty(Number(e.target.value))} aria-label="難度"
                            className="bg-black text-white border border-zinc-700 p-2 font-mono">
                            {DIFFICULTY_GATES.map(g => <option key={g.level} value={g.level}>難度 {g.level}</option>)}
                        </select>
                        <Button icon={<Plus size={14} />} disabled={!newTitle.trim()} onClick={createPlan}>建立</Button>
                    </div>
                    <p className="font-mono text-[10px] text-zinc-500 m-0 leading-relaxed">
                        難度門檻：{DIFFICULTY_GATES.map(g => `${g.level} 級 ${g.subTasks} 項／${g.days} 天`).join('、')}。未達門檻會自動降級。
                    </p>

                    {active.length === 0 && <span className="text-zinc-500 text-center py-6 font-mono text-xs">還沒有進行中的作戰計畫。</span>}
                    {active.map(planRow)}

                    {sealed.length > 0 && (
                        <div className="mt-2">
                            <button type="button" onClick={() => setShowSealed(v => !v)} className="font-mono text-xs text-zinc-400 hover:text-imperial-gold">
                                {showSealed ? '▾' : '▸'} 已結案（{sealed.length}）
                            </button>
                            {showSealed && (
                                <div className="flex flex-col gap-2 mt-2">
                                    {sealed.map(p => (
                                        <button key={p.id} type="button" onClick={() => setSelectedId(p.id)}
                                            className={`text-left p-2 border ${selectedId === p.id ? 'border-imperial-gold' : 'border-zinc-800'} bg-black/40`}>
                                            <div className="text-zinc-300 text-sm font-bold mb-1">{p.title}</div>
                                            {p.crate ? <CrateCard crate={p.crate} compact /> : <span className="font-mono text-[10px] text-zinc-600">無補給箱</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className={`${plan ? '' : 'hidden md:block'} border border-zinc-800 bg-zinc-950/70 p-4 min-h-[200px]`}>
                    {detail ?? <span className="text-zinc-600 font-mono text-xs">選一個作戰計畫查看子計畫。</span>}
                </div>
            </div>

            <Modal open={!!reveal} onCancel={() => setReveal(null)} footer={null} centered title={<span className="font-mono tracking-widest">補給箱</span>}>
                {reveal && (reveal.crate
                    ? <div className="flex flex-col gap-3"><p className="m-0 text-sm">作戰計畫結案，補給送達：</p><CrateCard crate={reveal.crate} /></div>
                    : <p className="m-0 text-sm">作戰計畫已結案。{reveal.reason ?? ''}</p>)}
            </Modal>
        </div>
    );
};
