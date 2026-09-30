import React, { useState, useEffect } from 'react';
import { Modal, Input, DatePicker, Select, Button, Typography, Checkbox, Radio, Drawer, Grid } from 'antd';
import { Task, TaskDraft } from '../types';
import { useGame } from '../contexts/GameContext';
import { DOMAINS, Domain } from '../../shared/ascension';
import dayjs from 'dayjs';
import { MAX_MONTH_DAYS, MAX_SLOTS, generateSlots, isTime, monthDayLabel, normalizeMonthDays, normalizeSlots } from '../../shared/tasks';

const { useBreakpoint } = Grid;
const { Option } = Select;

interface AddTaskModalProps {
    visible: boolean;
    onClose: () => void;
    onAdd: (draft: TaskDraft) => void;
    initialKeyword?: string;
    initialTask?: Task | null;
}

/** A first guess at the domain from the title; the player can always change it. */
export const guessDomain = (title: string): Domain | undefined =>
    // 'care' was 生活照護 until the user renamed it 工作 on 2026-09-28; the chore
    // words stay so old-style titles still land somewhere, with work words first.
    /工作|上班|會議|報告|客戶|專案|簡報|信箱|郵件|加班|打掃|家務|洗|煮|整理|倒垃圾/.test(title) ? 'care'
        : /學|讀|程式|代碼|課|書/.test(title) ? 'learning'
            : /健身|運動|跑|走路|伸展|復健|睡/.test(title) ? 'health'
                : /記帳|預算|財務|帳單|投資/.test(title) ? 'finance'
                    : /家人|朋友|電話|聯絡|陪|約/.test(title) ? 'social'
                        : undefined;

/** A plain HH:mm field: faster to set eight of these than to open a picker. */
const TimeField = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
    <div className="flex flex-col gap-1">
        <span className="text-[10px] font-mono text-zinc-500">{label}</span>
        <input
            type="time"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="bg-zinc-900 border border-imperial-gold/30 text-white font-mono px-2 h-10"
        />
    </div>
);

export const AddTaskModal: React.FC<AddTaskModalProps> = ({ visible, onClose, onAdd, initialKeyword = '', initialTask }) => {
    const { projects } = useGame();
    const screens = useBreakpoint();
    const isMobile = !screens.md; // Mobile if screen is smaller than medium breakpoint

    // Modes: 'manual' | 'project'
    const [inputMode, setInputMode] = useState<'manual' | 'project'>('manual');
    const [selectedProjectId, setSelectedProjectId] = useState<string>();
    const [selectedSubTaskId, setSelectedSubTaskId] = useState<string>();

    const [title, setTitle] = useState(initialKeyword);
    const [domain, setDomain] = useState<Domain | undefined>();
    // Set by the player: from then on the title no longer guesses for them.
    const [domainTouched, setDomainTouched] = useState(false);
    const [isRecurring, setIsRecurring] = useState(false);
    // Several times of day for one recurring task, generated in one go.
    const [dueTimes, setDueTimes] = useState<string[]>([]);
    const [slotStart, setSlotStart] = useState('08:00');
    const [slotEnd, setSlotEnd] = useState('22:00');
    const [slotEvery, setSlotEvery] = useState(120);
    const [subCategory, setSubCategory] = useState<string>('');
    // Monthly protocols (2026-09-28): a recurring task falls on these days of
    // the month instead of every day. `monthly` is the radio, `monthDays` the pick.
    const [monthly, setMonthly] = useState(false);
    const [monthDays, setMonthDays] = useState<number[]>([]);
    // @ts-ignore
    const [dueDate, setDueDate] = useState<dayjs.Dayjs>(dayjs().add(12, 'hour'));

    /**
     * Touching any of start / end / interval lays the whole day out at once.
     * Waiting for a button press meant people deployed a protocol believing the
     * times were set when nothing had been generated at all.
     */
    const relayoutSlots = (start: string, end: string, every: number) => {
        setSlotStart(start);
        setSlotEnd(end);
        setSlotEvery(every);
        if (isTime(start) && isTime(end)) setDueTimes(generateSlots(start, end, every));
    };

    // Effect to handle edit mode vs new mode
    useEffect(() => {
        if (visible) {
            if (initialTask) {
                // Edit Mode
                setTitle(initialTask.title);
                setDomain(initialTask.domain);
                setDomainTouched(true);
                setIsRecurring(initialTask.isRecurring || false);
                setDueTimes(normalizeSlots(initialTask.dueTimes));
                setMonthDays(normalizeMonthDays(initialTask.monthDays));
                setMonthly(normalizeMonthDays(initialTask.monthDays).length > 0);
                setSubCategory(initialTask.subCategory || '');
                // @ts-ignore
                setDueDate(dayjs(initialTask.dueDate));
                setInputMode('manual'); // Force manual on edit
            } else {
                // New Mode
                setTitle(initialKeyword);
                setDomain(guessDomain(initialKeyword));
                setDomainTouched(false);
                setIsRecurring(false);
                setDueTimes([]);
                setMonthDays([]);
                setMonthly(false);
                setSubCategory('');
                // @ts-ignore
                setDueDate(dayjs().add(12, 'hour'));
                setInputMode('manual');
                setSelectedProjectId(undefined);
                setSelectedSubTaskId(undefined);
            }
        }
    }, [visible, initialTask, initialKeyword]);

    // Guess the domain from the title for a new task, until the player picks one.
    useEffect(() => {
        if (!initialTask && !domainTouched) setDomain(guessDomain(title));
    }, [title, initialTask, domainTouched]);

    const handleSubmit = () => {
        if (!title.trim()) return;
        const slots = isRecurring ? normalizeSlots(dueTimes) : [];
        // With a list of times the first one is the day's nominal deadline, so the
        // sorting and overdue checks that read dueTime keep working unchanged.
        const dueTime = isRecurring ? (slots[0] ?? dueDate.format('HH:mm')) : undefined;
        // A task picked from an operation plan stays linked to that subtask. The
        // link no longer completes it (2026-09-30): it names the task and marks
        // the subtask as deployed, so the plan does not offer it twice. Only
        // one-off tasks link.
        const link = inputMode === 'project' && !isRecurring && selectedProjectId && selectedSubTaskId
            ? { projectId: selectedProjectId, subTaskId: selectedSubTaskId }
            : undefined;
        onAdd({
            title, dueDate: dueDate.toDate(), isRecurring, dueTime,
            dueTimes: slots, monthDays: isRecurring && monthly ? normalizeMonthDays(monthDays) : [],
            domain, subCategory, link,
        });
        setTitle('');
        setSelectedProjectId(undefined);
        setSelectedSubTaskId(undefined);
        setDueTimes([]);
        setMonthDays([]);
        setMonthly(false);
        setDomain(undefined);
        setDomainTouched(false);
        setSubCategory('');
        setIsRecurring(false);
        onClose();
    };

    const handleProjectChange = (projectId: string) => {
        setSelectedProjectId(projectId);
        setSelectedSubTaskId(undefined);
    };

    const handleSubTaskChange = (subTaskId: string) => {
        setSelectedSubTaskId(subTaskId);
        const project = projects.find(p => p.id === selectedProjectId);
        const subTask = project?.subTasks.find(st => st.id === subTaskId);
        if (subTask) {
            setTitle(subTask.title);
        }
    };

    const content = (
        <div className="space-y-6 pt-4 pb-20 md:pb-0">
            {/* Mode Toggle */}
            {!initialTask && (
                <div className="flex justify-center mb-4">
                    <Radio.Group
                        value={inputMode}
                        onChange={e => setInputMode(e.target.value)}
                        className="bg-zinc-900 border border-imperial-gold/30 rounded-lg p-1 w-full flex"
                    >
                        <Radio.Button value="manual" className="flex-1 text-center !bg-transparent !border-none !text-imperial-gold hover:!text-white after:!hidden checked:!bg-imperial-gold/20">
                            手動輸入
                        </Radio.Button>
                        <Radio.Button value="project" className="flex-1 text-center !bg-transparent !border-none !text-imperial-gold hover:!text-white after:!hidden checked:!bg-imperial-gold/20">
                            從作戰計畫部署
                        </Radio.Button>
                    </Radio.Group>
                </div>
            )}

            {/* Project Selection Mode */}
            {inputMode === 'project' && !initialTask && (
                <div className="p-4 border border-imperial-gold/20 rounded bg-zinc-900/50 space-y-4 mb-4">
                    <div>
                        <label className="text-imperial-gold/70 font-mono block mb-2 text-xs">來源作戰計畫 (OPERATION PLAN)</label>
                        <Select
                            className="w-full"
                            placeholder="選擇作戰計畫..."
                            value={selectedProjectId}
                            onChange={handleProjectChange}
                            dropdownStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                        >
                            {projects
                                .filter(p => !p.sealedAt && p.subTasks.some(st => !st.completed))
                                .map(p => (
                                    <Option key={p.id} value={p.id}>{p.title}</Option>
                                ))}
                        </Select>
                    </div>
                    <div>
                        <label className="text-imperial-gold/70 font-mono block mb-2 text-xs">子任務目標 (SUB-OBJECTIVE)</label>
                        <Select
                            className="w-full"
                            placeholder="選擇子任務..."
                            value={selectedSubTaskId}
                            onChange={handleSubTaskChange}
                            disabled={!selectedProjectId}
                            dropdownStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                        >
                            {projects.find(p => p.id === selectedProjectId)?.subTasks.filter(st => !st.completed).map(st => (
                                <Option key={st.id} value={st.id}>{st.title}</Option>
                            ))}
                        </Select>
                    </div>
                    <p className="font-mono text-[11px] text-zinc-500 m-0">
                        {isRecurring
                            ? '每日固定任務只會沿用子計畫的名稱，不會標記為已部署，也不會勾掉它。'
                            : '完成這個任務不會勾掉子計畫——一個子計畫通常要做很多次。子計畫會標記為已部署，完成與否由你在作戰計畫裡自己勾。'}
                    </p>
                </div>
            )}

            <div>
                <label className="text-imperial-gold/70 font-mono block mb-2">任務代號 (OBJECTIVE)</label>
                <Input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="!bg-zinc-900 !border-imperial-gold/30 !text-white font-mono !text-lg !h-12"
                    placeholder="輸入任務名稱..."
                />
            </div>

            <div>
                <label className="text-imperial-gold/70 font-mono block mb-2">成長領域 (DOMAIN)</label>
                <div className="grid grid-cols-3 gap-2">
                    {[...DOMAINS.map(d => ({ id: d.id as Domain | undefined, label: d.label })), { id: undefined, label: '不指定' }].map(option => (
                        <button
                            type="button"
                            key={option.id ?? 'none'}
                            onClick={() => { setDomain(option.id); setDomainTouched(true); }}
                            className={`p-2 rounded border font-mono text-xs transition-colors ${domain === option.id
                                ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300'
                                : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-imperial-gold/50 hover:text-imperial-gold'}`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <div className="text-[11px] font-mono text-zinc-600 mt-1">飛昇的每日指定會自動帶入這個領域。</div>
            </div>

            {/* Daily/Recurring Settings */}
            <div className="bg-zinc-900/50 p-4 border border-imperial-gold/20 rounded space-y-4">
                <div className="flex items-center gap-2">
                    <Checkbox
                        checked={isRecurring}
                        onChange={e => setIsRecurring(e.target.checked)}
                        className="!text-imperial-gold font-mono"
                    >
                        每日固定任務 (DAILY)
                    </Checkbox>
                </div>

                {isRecurring && (
                    <>
                        {/* Daily or monthly (2026-09-28). A monthly protocol shows only on
                            its own days; a missed day is gone at midnight, as the user chose. */}
                        <div className="flex gap-2">
                            {[
                                { value: false, label: '每天', note: '每天都出現' },
                                { value: true, label: '每月', note: '這個月要在指定日期前做完' },
                            ].map(option => (
                                <button
                                    key={String(option.value)}
                                    type="button"
                                    onClick={() => setMonthly(option.value)}
                                    className={`flex-1 px-3 py-2 border font-mono text-xs transition-colors ${monthly === option.value
                                        ? 'border-imperial-gold text-imperial-gold bg-imperial-gold/10'
                                        : 'border-zinc-700 text-zinc-500 hover:border-imperial-gold/50'}`}
                                >
                                    {option.label}
                                    <span className="block text-[10px] opacity-70 mt-0.5">{option.note}</span>
                                </button>
                            ))}
                        </div>
                        <div className="text-[10px] text-cyan-400 font-mono">
                            {monthly
                                ? '整個月都會在清單上倒數；過了期限仍留著標「已逾期」，直到月底重新開始。'
                                : '任務將在每天 00:00 自動重置並重新開放。'}
                        </div>
                    </>
                )}

                {isRecurring && monthly && (
                    <div>
                        <label className="text-imperial-gold/70 font-mono block mb-2 text-xs">
                            每月截止日 (DUE BY)
                        </label>
                        <div className="grid grid-cols-7 gap-1">
                            {Array.from({ length: MAX_MONTH_DAYS }, (_, i) => i + 1).map(day => {
                                const picked = monthDays.includes(day);
                                return (
                                    <button
                                        key={day}
                                        type="button"
                                        aria-pressed={picked}
                                        onClick={() => setMonthDays(prev => normalizeMonthDays(
                                            picked ? prev.filter(d => d !== day) : [...prev, day]))}
                                        className={`font-mono text-xs py-2 border transition-colors ${picked
                                            ? 'border-imperial-gold text-imperial-gold bg-imperial-gold/20'
                                            : 'border-zinc-800 text-zinc-500 hover:border-imperial-gold/40'}`}
                                    >
                                        {day}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 mt-2">
                            {monthDays.length === 0
                                ? '選一個截止日，否則這個任務永遠不會出現。'
                                : `本月要在 ${monthDayLabel(monthDays, new Date())}前完成`}
                        </div>
                    </div>
                )}

                {isRecurring && !monthly ? (
                    <div>
                        <label className="text-imperial-gold/70 font-mono block mb-2 text-xs">
                            每日執行時間 (DAILY TIMES)
                        </label>
                        <div className="flex flex-wrap items-end gap-2 mb-3">
                            <TimeField label="從" value={slotStart} onChange={value => relayoutSlots(value, slotEnd, slotEvery)} />
                            <TimeField label="到" value={slotEnd} onChange={value => relayoutSlots(slotStart, value, slotEvery)} />
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-mono text-zinc-500">每隔</span>
                                <Select
                                    size="large"
                                    value={slotEvery}
                                    onChange={value => relayoutSlots(slotStart, slotEnd, value)}
                                    className="!w-28"
                                    options={[30, 60, 90, 120, 180, 240].map(m => ({ value: m, label: m < 60 ? `${m} 分鐘` : `${m / 60} 小時` }))}
                                />
                            </div>
                            <Button
                                size="large"
                                onClick={() => relayoutSlots(slotStart, slotEnd, slotEvery)}
                                className="!bg-imperial-gold/10 !border-imperial-gold/50 !text-imperial-gold font-mono"
                            >
                                {dueTimes.length > 0 ? '重新產生' : '產生時段'}
                            </Button>
                        </div>

                        {dueTimes.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {dueTimes.map(time => (
                                    <button
                                        type="button"
                                        key={time}
                                        title="移除這個時段"
                                        onClick={() => setDueTimes(prev => prev.filter(t => t !== time))}
                                        className="px-2 py-0.5 border border-imperial-gold/40 text-imperial-gold font-mono text-xs hover:border-red-500 hover:text-red-400"
                                    >
                                        {time} ×
                                    </button>
                                ))}
                                <span className="self-center font-mono text-[11px] text-zinc-500">共 {dueTimes.length} 次／天 · 清單上各自一列，過時仍可補</span>
                            </div>
                        ) : (
                            <div className="flex items-end gap-2">
                                <TimeField label="或只設一個時間" value={dueDate.format('HH:mm')}
                                    onChange={value => { if (isTime(value)) setDueDate(dayjs(`${dayjs().format('YYYY-MM-DD')} ${value}`)); }} />
                                <span className="font-mono text-[11px] text-zinc-500 pb-3">改動上面的起訖或間隔，時段就會自動排滿一整天；每個時段在清單上各自一列，各自完成</span>
                            </div>
                        )}
                        <div className="mt-2 font-mono text-[10px] text-zinc-600">
                            每個時段各自完成，全部完成才算今天達成（最多 {MAX_SLOTS} 個）。
                        </div>
                    </div>
                ) : (
                    <div>
                        <label className="text-imperial-gold/70 font-mono block mb-2 text-xs">截止時間 (ETA)</label>
                        <DatePicker
                            showTime
                            format="YYYY-MM-DD HH:mm"
                            picker="date"
                            value={dueDate}
                            onChange={val => setDueDate(val || dayjs())}
                            className="w-full !bg-zinc-900 !border-imperial-gold/30 !text-white !h-12 !text-lg"
                            popupClassName="imperial-datepicker-popup"
                        />
                    </div>
                )}

            </div >

            <Button
                type="primary"
                onClick={handleSubmit}
                className="w-full h-14 bg-imperial-gold text-black border-none font-bold tracking-[0.2em] text-xl hover:!bg-yellow-400 mt-4 shadow-[0_0_20px_rgba(251,191,36,0.3)]"
            >
                DEPLOY TASK
            </Button>
        </div >
    );

    const titleNode = <span className="text-imperial-gold font-bold tracking-widest text-lg">/// TACTICAL DEPLOYMENT ///</span>;

    if (isMobile) {
        return (
            <Drawer
                placement="bottom"
                open={visible}
                onClose={onClose}
                height="85vh"
                title={titleNode}
                className="imperial-drawer"
                styles={{
                    header: { backgroundColor: '#000', borderBottom: '1px solid #fbbf24', color: '#fbbf24' },
                    body: { backgroundColor: '#000', padding: '16px' },
                    content: { backgroundColor: '#000' }
                }}
                closeIcon={<span className="text-imperial-gold">X</span>}
            >
                {content}
            </Drawer>
        );
    }

    return (
        <Modal
            open={visible}
            onCancel={onClose}
            footer={null}
            width={500}
            title={titleNode}
            className="p-0 border-2 border-imperial-gold/50 bg-black"
            styles={{
                content: { backgroundColor: '#0a0a0a', border: '1px solid #fbbf24' },
                header: { backgroundColor: '#0a0a0a', borderBottom: '1px solid #fbbf24' },
            }}
            closeIcon={<span className="text-imperial-gold">X</span>}
        >
            {content}
        </Modal>
    );
};
