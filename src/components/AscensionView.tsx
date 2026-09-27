import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Modal, Select } from 'antd';
import { Check, Lock, Swords, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useGame } from '../contexts/GameContext';
import { api } from '../services/api';
import type { AscensionView as View, CandidateView } from '../services/api';
import { Character, ORIGIN_LABELS, levelOf, maxHp } from '../../shared/roster';
import {
    DOMAINS, DOMAIN_LABELS, Domain, MAX_DAILY_RECORDS, MIN_DOMAINS_PER_STAGE, ORGANS, ORIGINAL_BRANCH_MIN_LEVEL,
    ORIGINAL_BRANCH_NOTICE, STAGES, STAGE_COUNT, STANDARD_ORGANS, implantRefusal, organsThrough, recordRefusal,
    stageStanding,
} from '../../shared/ascension';
import { strongholdById } from '../../shared/sector';
import type { MissionOrder } from './RosterView';

// The ascension page (2026-09-27): today's designation, each candidate's stage,
// the escorts that bring new candidates, the original branch and the old
// account-wide record, read-only. Every number shown is the server's.

const ART = `${import.meta.env.BASE_URL}battle-assets/ascension`;
const organArt = (id: string) => `${ART}/organs/${id}.webp`;
const stageArt = (stage: number) => `${ART}/stages/stage-${stage}.webp`;
const organName = (id: string) => ORGANS.find(o => o.id === id)?.labelZh ?? id;

/** The old task categories suggest a domain; the player can always change it. */
const CATEGORY_DOMAIN: Record<string, Domain> = { exercise: 'health', learning: 'learning', cleaning: 'care', parenting: 'social' };

type Draft = { candidateId: string | null; slots: { taskId: string; domain: Domain }[] };

const panel = 'border border-emerald-900/50 bg-black/70 p-3 md:p-4';
const heading = 'font-mono text-xs tracking-widest text-emerald-400 mb-2';

export const AscensionView = ({ visible, onClose, onDeployMission }: {
    visible: boolean;
    onClose: () => void;
    onDeployMission: (order: MissionOrder) => void;
}) => {
    const { getToken } = useAuth();
    const { tasks, allTasks } = useGame();
    const [view, setView] = useState<View | null>(null);
    const [characters, setCharacters] = useState<Character[]>([]);
    const [draft, setDraft] = useState<Draft>({ candidateId: null, slots: [] });
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [applying, setApplying] = useState<Character | null>(null);
    const [implanting, setImplanting] = useState<{ candidate: Character; stage: number } | null>(null);
    const [revealed, setRevealed] = useState<{ name: string; stage: number; organIds: string[]; graduation?: { returned: string[]; loaned: string[] } } | null>(null);

    const load = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;
            const [data, roster] = await Promise.all([api.getAscension(token), api.getRoster(token)]);
            setView(data);
            setCharacters(roster.characters);
            setDraft({ candidateId: data.plan.candidateId, slots: data.plan.slots });
        } catch (err) {
            setError(err instanceof Error ? err.message : '無法讀取飛昇進度');
        }
    }, [getToken]);

    useEffect(() => { if (visible) void load(); }, [visible, load]);

    const run = async (work: (token: string) => Promise<void>) => {
        setBusy(true);
        setError(null);
        setNotice(null);
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

    const byId = useMemo(() => new Map(characters.map(c => [c.id, c])), [characters]);
    const training = (view?.candidates ?? []).filter(c => !c.graduated);
    const graduates = (view?.candidates ?? []).filter(c => c.graduated);
    const recorded = new Set(view?.recordedTaskIds ?? []);
    const planCandidate = view?.candidates.find(c => c.id === draft.candidateId);

    // Tasks still open today, plus any already designated (they may be done by now).
    const taskOptions = useMemo(() => {
        const open = new Map(tasks.map(t => [t.id, t]));
        for (const slot of draft.slots) {
            const task = allTasks.find(t => t.id === slot.taskId);
            if (task) open.set(task.id, task);
        }
        return [...open.values()].map(t => ({ value: t.id, label: t.title }));
    }, [tasks, allTasks, draft.slots]);

    const setSlot = (index: number, change: Partial<{ taskId: string; domain: Domain }>) => {
        setDraft(prev => {
            const slots = [...prev.slots];
            const current = slots[index] ?? { taskId: '', domain: 'health' as Domain };
            const next = { ...current, ...change };
            if (change.taskId && !change.domain) {
                const category = allTasks.find(t => t.id === change.taskId)?.ascensionCategory;
                if (category && CATEGORY_DOMAIN[category]) next.domain = CATEGORY_DOMAIN[category];
            }
            slots[index] = next;
            return { ...prev, slots };
        });
    };

    const savePlan = () => void run(async token => {
        const slots = draft.slots.filter(s => s.taskId);
        await api.saveGrowthPlan(draft.candidateId, slots, token);
        setNotice('今日指定已儲存：完成這些任務時，紀錄會記在這位候選人身上。');
    });

    const confirmImplant = () => {
        if (!implanting) return;
        const { candidate, stage } = implanting;
        setImplanting(null);
        void run(async token => {
            const result = await api.implantStage(candidate.id, stage, token);
            setRevealed({ name: candidate.name, stage, organIds: result.organIds, graduation: result.graduation });
        });
    };

    const legacy = view?.legacy;
    const withdrawable = training.filter(c => c.route === 'original-existing-soldier' && c.stage === 0 && c.records.length === 0);

    return (
        <Drawer open={visible} onClose={onClose} width="100vw" className="ascension-drawer"
            title={<span className="eyebrow">PROJECT ASCENSION / 極限戰士飛昇計畫</span>}>
            <div className="min-h-full p-3 md:p-6 flex flex-col gap-4"
                style={{ background: `linear-gradient(rgba(0,0,0,.82), rgba(0,0,0,.9)), url(${ART}/apothecarion-background.webp) center/cover fixed` }}>
                <div>
                    <h1 className="font-mono text-lg md:text-2xl text-emerald-300 tracking-widest">從候選人到阿斯塔特</h1>
                    <p className="font-mono text-xs text-zinc-400 mt-1 max-w-3xl">
                        每位候選人要走完五個階段、100 筆成長紀錄、19 個器官。紀錄只來自事先指定的生活任務，綁定在該候選人身上，
                        不能買、不能轉讓；每一階還要通過一場人物任務。候選人改造期間只能出自己的人物任務。
                    </p>
                </div>
                {error && <div className="border border-red-900/60 bg-red-950/60 text-red-300 font-mono text-xs p-2">{error}</div>}
                {notice && <div className="border border-emerald-900/60 bg-emerald-950/50 text-emerald-300 font-mono text-xs p-2">{notice}</div>}

                {/* Today's designation */}
                <section className={panel} aria-label="今日指定">
                    <div className={heading}>今日指定 · {view?.day ?? ''}</div>
                    {training.length === 0 ? (
                        <p className="font-mono text-xs text-zinc-500">目前沒有培養中的候選人。收復世界首領據點後可以出「援護撤離」迎接候選人，或讓 Lv{ORIGINAL_BRANCH_MIN_LEVEL} 老兵申請原創路線。</p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs text-zinc-400">今天培養</span>
                                <Select size="small" className="!min-w-[160px]" value={draft.candidateId ?? undefined} placeholder="選一位候選人"
                                    disabled={busy || recorded.size > 0}
                                    onChange={value => setDraft(prev => ({ ...prev, candidateId: value }))}
                                    options={training.map(c => ({ value: c.id, label: byId.get(c.id)?.name ?? c.id }))} />
                                {recorded.size > 0 && <span className="font-mono text-[11px] text-amber-400">今天已有紀錄入帳，候選人已鎖定</span>}
                            </div>
                            {Array.from({ length: MAX_DAILY_RECORDS }).map((_, index) => {
                                const slot = draft.slots[index];
                                const locked = !!slot && recorded.has(slot.taskId);
                                const warn = slot?.taskId && planCandidate && !locked
                                    ? recordRefusal(planCandidate.stage, planCandidate.records, slot.domain, view?.day ?? '')
                                    : null;
                                return (
                                    <div key={index} className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-xs text-zinc-500 whitespace-nowrap">第 {index + 1} 項</span>
                                        <Select size="small" className="!min-w-[200px] !max-w-full" allowClear placeholder="選今天要做的任務"
                                            disabled={busy || locked} value={slot?.taskId || undefined}
                                            onChange={value => value ? setSlot(index, { taskId: value }) : setDraft(prev => ({ ...prev, slots: prev.slots.filter((_, i) => i !== index) }))}
                                            options={taskOptions} />
                                        <Select size="small" className="!min-w-[120px]" disabled={busy || locked || !slot?.taskId}
                                            value={slot?.domain} onChange={domain => setSlot(index, { domain })}
                                            options={DOMAINS.map(d => ({ value: d.id, label: d.label }))} />
                                        {locked && <span className="font-mono text-[11px] text-emerald-400 flex items-center gap-1"><Check size={12} /> 已入帳</span>}
                                        {warn && <span className="font-mono text-[11px] text-amber-400">{warn}</span>}
                                    </div>
                                );
                            })}
                            <div className="flex flex-wrap items-center gap-3">
                                <Button size="small" disabled={busy} onClick={savePlan}
                                    className="!bg-transparent !border-emerald-500 !text-emerald-300 font-mono">儲存指定</Button>
                                <span className="font-mono text-[11px] text-zinc-500">
                                    先指定、再完成才會計入；每天最多兩項，要不同領域。財務回顧每週只計一次，記帳本身不算。
                                </span>
                            </div>
                        </div>
                    )}
                </section>

                {/* Candidates in training */}
                {training.map(candidate => {
                    const character = byId.get(candidate.id);
                    return character && (
                        <CandidateCard key={candidate.id} candidate={candidate} character={character} busy={busy}
                            onDeploy={() => onDeployMission({ missionId: `stage-${candidate.stage + 1}`, candidateId: candidate.id })}
                            onImplant={stage => setImplanting({ candidate: character, stage })} />
                    );
                })}

                {/* Graduates */}
                {graduates.length > 0 && (
                    <section className={panel} aria-label="已授銜">
                        <div className={heading}>已授銜的阿斯塔特</div>
                        <div className="flex flex-col gap-3">
                            {graduates.map(g => {
                                const character = byId.get(g.id);
                                return character && (
                                    <div key={g.id} className="flex flex-col gap-2">
                                        <div className="font-mono text-sm text-emerald-300">
                                            {character.name} · 19/19 · 生命 {maxHp(character)} · 命中 80%
                                            {g.route === 'original-existing-soldier' && <span className="ml-2 text-[10px] px-1 border border-sky-800/60 text-sky-300">原創飛昇</span>}
                                        </div>
                                        <OrganGrid implanted={organsThrough(STAGE_COUNT)} />
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* Escorts */}
                <section className={panel} aria-label="援護撤離">
                    <div className={heading}>援護撤離 · 迎接新候選人</div>
                    <p className="font-mono text-[11px] text-zinc-500 mb-2">每收復一個世界的首領據點，極限戰士會請求援護撤離一位候選人。首次勝利後候選人加入名冊（本章最多三位）。</p>
                    <div className="flex flex-col gap-2">
                        {(view?.escorts ?? []).map(escort => (
                            <div key={escort.id} className="flex flex-wrap items-center gap-3 border border-zinc-800 p-2">
                                <span className="font-mono text-sm text-zinc-200 flex-1 min-w-[200px]">{escort.name}</span>
                                {escort.state === 'won' && <span className="font-mono text-xs text-emerald-400 flex items-center gap-1"><Check size={12} /> 已護送 · {escort.aspirantName} 已加入</span>}
                                {escort.state === 'locked' && <span className="font-mono text-xs text-zinc-500 flex items-center gap-1"><Lock size={12} /> 收復 {strongholdById(escort.after ?? '')?.name ?? escort.after} 後開放</span>}
                                {escort.state === 'open' && (
                                    <Button size="small" icon={<Swords size={14} />} disabled={busy}
                                        onClick={() => onDeployMission({ missionId: escort.id })}
                                        className="!bg-transparent !border-imperial-gold !text-imperial-gold font-mono">出戰</Button>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                {/* Original branch */}
                <section className={panel} aria-label="原創飛昇路線">
                    <div className={heading}>{ORIGINAL_BRANCH_NOTICE.title}</div>
                    <p className="font-mono text-[11px] text-zinc-500 mb-2">
                        開放給 Lv{ORIGINAL_BRANCH_MIN_LEVEL} 的星界軍出身人員（卡迪安、卡塔昌、克里格、卡斯爾金、風暴兵）。保留同一個角色與經歷，一樣要走完五階、100 筆紀錄與人物任務。
                    </p>
                    <div className="flex flex-col gap-2">
                        {(view?.eligibleOriginal ?? []).map(id => byId.get(id)).filter((c): c is Character => !!c).map(c => (
                            <div key={c.id} className="flex flex-wrap items-center gap-3 border border-zinc-800 p-2">
                                <span className="font-mono text-sm text-zinc-200 flex-1">{c.name} · {ORIGIN_LABELS[c.origin]} · Lv{levelOf(c.xp)}</span>
                                <Button size="small" icon={<UserPlus size={14} />} disabled={busy} onClick={() => setApplying(c)}
                                    className="!bg-transparent !border-sky-600 !text-sky-300 font-mono">申請原創路線</Button>
                            </div>
                        ))}
                        {withdrawable.map(c => (
                            <div key={c.id} className="flex flex-wrap items-center gap-3 border border-zinc-800 p-2">
                                <span className="font-mono text-sm text-zinc-300 flex-1">{byId.get(c.id)?.name} · 已申請，尚無紀錄</span>
                                <Button size="small" type="text" disabled={busy}
                                    onClick={() => void run(token => api.withdrawOriginalBranch(c.id, token))}
                                    className="!text-zinc-400 font-mono">撤回申請</Button>
                            </div>
                        ))}
                        {(view?.eligibleOriginal.length ?? 0) === 0 && withdrawable.length === 0 && (
                            <span className="font-mono text-xs text-zinc-600">目前沒有符合資格的人員。</span>
                        )}
                    </div>
                </section>

                {legacy && (
                    <section className={panel} aria-label="舊版改造紀錄">
                        <div className={heading}>舊版改造紀錄（唯讀）</div>
                        <p className="font-mono text-[11px] text-zinc-500 mb-2">這是舊系統的帳號共用紀錄，保留原樣供查閱，沒有轉換成任何角色的進度。</p>
                        <div className="font-mono text-xs text-zinc-400">
                            已完成階段：{legacy.completedStages.join('、') || '無'}；已解鎖：{legacy.unlockedImplants.map(organName).join('、') || '無'}
                        </div>
                    </section>
                )}
            </div>

            <Modal open={!!applying} onCancel={() => setApplying(null)} title={ORIGINAL_BRANCH_NOTICE.title}
                footer={[
                    <Button key="back" onClick={() => setApplying(null)}>{ORIGINAL_BRANCH_NOTICE.cancel}</Button>,
                    <Button key="ok" type="primary" disabled={busy} onClick={() => {
                        const target = applying;
                        setApplying(null);
                        if (target) void run(token => api.applyOriginalBranch(target.id, token));
                    }}>{ORIGINAL_BRANCH_NOTICE.confirm}</Button>,
                ]}>
                <p>{ORIGINAL_BRANCH_NOTICE.body}</p>
                {applying && <p className="mt-2 text-zinc-500">申請人：{applying.name}。申請後改造期間只能出自己的人物任務；在取得任何紀錄前可以撤回。</p>}
            </Modal>

            <Modal open={!!implanting} onCancel={() => setImplanting(null)} okText="確認植入" cancelText="再想想"
                onOk={confirmImplant} title={implanting ? `植入第 ${implanting.stage} 階：${STAGES[implanting.stage - 1].name}` : ''}>
                {implanting && (
                    <div className="flex flex-col gap-2">
                        <p>{implanting.candidate.name} 將植入 {STAGES[implanting.stage - 1].organIds.map(organName).join('、')}。整階一次完成，不能撤銷。</p>
                        {implanting.stage < STAGE_COUNT
                            ? <p>生命基線改為 {STAGES[implanting.stage - 1].hp}（取代原本的基線，不是相加）；命中維持 75%。</p>
                            : <p>授銜後成為阿斯塔特：生命基線 160、命中 80%。人類護甲與主武器退回軍械庫（不會消失），並借用一套不可出售的阿斯塔特用爆彈槍與動力甲；進階裝備仍要用軍需採購。</p>}
                    </div>
                )}
            </Modal>

            <Modal open={!!revealed} onCancel={() => setRevealed(null)} footer={null} width={760}
                title={revealed ? `${revealed.name} · 第 ${revealed.stage} 階植入完成` : ''}>
                {revealed && (
                    <div className="flex flex-col gap-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {revealed.organIds.map(id => {
                                const organ = ORGANS.find(o => o.id === id);
                                return (
                                    <figure key={id} className="border border-emerald-900/60 bg-black p-2">
                                        <img src={organArt(id)} alt={organ?.labelZh ?? id} className="w-full aspect-square object-contain" />
                                        <figcaption className="font-mono text-xs text-emerald-300 mt-1">{organ?.labelZh}</figcaption>
                                        <p className="font-mono text-[10px] text-zinc-500">{organ?.lore}</p>
                                    </figure>
                                );
                            })}
                        </div>
                        <p className="font-mono text-[11px] text-zinc-500">器官能力是背景設定，本版不觸發戰鬥被動；階段成果由生命基線一次替換。</p>
                        {revealed.graduation && (
                            <p className="font-mono text-xs text-emerald-300">
                                授銜完成。借用裝備 {revealed.graduation.loaned.length} 件已配上；退回軍械庫 {revealed.graduation.returned.length} 件。
                            </p>
                        )}
                    </div>
                )}
            </Modal>
        </Drawer>
    );
};

const CandidateCard = ({ candidate, character, busy, onDeploy, onImplant }: {
    candidate: CandidateView; character: Character; busy: boolean;
    onDeploy: () => void; onImplant: (stage: number) => void;
}) => {
    const next = STAGES[candidate.stage];
    const standing = next ? stageStanding(next, candidate.records) : null;
    const missionWon = next ? candidate.stagesWon.includes(next.stage) : false;
    const refusal = next ? implantRefusal(next.stage, { stage: candidate.stage, records: candidate.records, missionsWon: candidate.stagesWon }) : '已完成';
    const implanted = organsThrough(candidate.stage);

    return (
        <section className={panel} aria-label={`候選人 ${character.name}`}>
            <div className="flex flex-col md:flex-row gap-3">
                {next && <img src={stageArt(next.stage)} alt="" className="w-full md:w-64 aspect-video object-cover border border-emerald-900/40" />}
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-base text-emerald-300">{character.name}</span>
                        <span className="text-[10px] font-mono px-1 border border-sky-800/60 text-sky-300">
                            {candidate.route === 'original-existing-soldier' ? '原創飛昇' : '極限戰士候選人'}
                        </span>
                        <span className="font-mono text-xs text-zinc-400">Lv{levelOf(character.xp)} · 生命 {maxHp(character)} · 器官 {implanted.length}/{STANDARD_ORGANS.length}</span>
                    </div>
                    <ol className="flex flex-wrap gap-1" aria-label="階段">
                        {STAGES.map(s => {
                            const done = s.stage <= candidate.stage;
                            const current = s.stage === candidate.stage + 1;
                            return (
                                <li key={s.stage} aria-current={current ? 'step' : undefined}
                                    className={`font-mono text-[11px] px-2 py-0.5 border ${done ? 'border-emerald-600 text-emerald-300 bg-emerald-950/40' : current ? 'border-imperial-gold text-imperial-gold' : 'border-zinc-800 text-zinc-600'}`}>
                                    {done ? '✓ ' : ''}{['I', 'II', 'III', 'IV', 'V'][s.stage - 1]} {s.name}
                                </li>
                            );
                        })}
                    </ol>
                    {next && standing && (
                        <>
                            <div className="font-mono text-xs text-zinc-300">
                                第 {next.stage} 階紀錄 {standing.counted}/{next.records}
                                {standing.full ? ' · 已滿，等待植入' : ''}
                                <span className="text-zinc-500"> · 領域 {standing.domains}（至少 {MIN_DOMAINS_PER_STAGE}）· 單一領域最多 {next.maxOneDomain}</span>
                            </div>
                            <div className="h-2 bg-zinc-900 border border-zinc-800" role="progressbar" aria-valuenow={standing.counted} aria-valuemax={next.records} aria-label="本階紀錄">
                                <div className="h-full bg-emerald-600" style={{ width: `${(standing.counted / next.records) * 100}%` }} />
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                                {DOMAINS.map(d => (
                                    <span key={d.id} className="font-mono text-[11px] text-zinc-400">
                                        {DOMAIN_LABELS[d.id]} {standing.byDomain[d.id].raw}{standing.byDomain[d.id].raw >= next.maxOneDomain ? '（已達上限）' : ''}
                                    </span>
                                ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                {missionWon ? (
                                    <span className="font-mono text-xs text-emerald-400 flex items-center gap-1"><Check size={12} /> 人物任務「{next.mission}」已通過</span>
                                ) : (
                                    <Button size="small" icon={<Swords size={14} />} disabled={busy} onClick={onDeploy}
                                        className="!bg-transparent !border-imperial-gold !text-imperial-gold font-mono">
                                        人物任務：{next.mission}
                                    </Button>
                                )}
                                <Button size="small" disabled={busy || !!refusal} onClick={() => onImplant(next.stage)}
                                    className="!bg-transparent !border-emerald-500 !text-emerald-300 font-mono disabled:!opacity-50">
                                    確認植入第 {next.stage} 階
                                </Button>
                                {refusal && <span className="font-mono text-[11px] text-zinc-500">{refusal}</span>}
                            </div>
                        </>
                    )}
                </div>
            </div>
            <div className="mt-3"><OrganGrid implanted={implanted} /></div>
        </section>
    );
};

/** The nineteen, lit when implanted; the three Primaris extras are marked as prepared, never required. */
const OrganGrid = ({ implanted }: { implanted: string[] }) => {
    const done = new Set(implanted);
    return (
        <ul className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-11 gap-1.5" aria-label="器官">
            {ORGANS.map(organ => {
                const lit = done.has(organ.id);
                return (
                    <li key={organ.id} className={`border ${lit ? 'border-emerald-700' : 'border-zinc-800'} bg-black p-1`}
                        title={`${organ.labelZh}${organ.enabled ? (lit ? '（已植入）' : '（未植入）') : '（原鑄預備，不計入 19）'}`}>
                        <img src={organArt(organ.id)} alt="" loading="lazy"
                            className={`w-full aspect-square object-contain ${lit ? '' : 'grayscale opacity-30'}`} />
                        <span className={`block font-mono text-[9px] leading-tight truncate ${lit ? 'text-emerald-300' : 'text-zinc-600'}`}>
                            {organ.labelZh}{organ.enabled ? '' : '·預備'}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
};
