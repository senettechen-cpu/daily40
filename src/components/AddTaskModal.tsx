import React, { useState, useEffect } from 'react';
import { Modal, Input, Slider, DatePicker, Select, Button, Typography, Checkbox, Radio, Drawer, Grid } from 'antd';
import { Task, Faction, AscensionCategory } from '../types';
import { useGame } from '../contexts/GameContext';
import { Home, Activity, Book, Heart, Hammer, Cpu } from 'lucide-react'; // Icons for factions
import dayjs from 'dayjs';
import { MAX_SLOTS, generateSlots, isTime, normalizeSlots } from '../../shared/tasks';

const { useBreakpoint } = Grid;
const { Option } = Select;

interface AddTaskModalProps {
    visible: boolean;
    onClose: () => void;
    onAdd: (title: string, faction: Faction, difficulty: number, dueDate: Date, isRecurring: boolean, dueTime?: string, ascensionCategory?: AscensionCategory, subCategory?: string, dueTimes?: string[]) => void;
    initialKeyword?: string;
    initialTask?: Task | null;
}

const FACTION_OPTIONS: { value: Faction; label: string; icon: React.ReactNode; color: string }[] = [
    { value: 'nurgle', label: '納垢 (家務)', icon: <Home />, color: '#10b981' },
    { value: 'khorne', label: '恐虐 (健身)', icon: <Activity />, color: '#ef4444' },
    { value: 'tzeentch', label: '奸奇 (學習)', icon: <Book />, color: '#3b82f6' },
    { value: 'slaanesh', label: '色孽 (慾望)', icon: <Heart />, color: '#ec4899' },
    { value: 'orks', label: '獸人 (雜務)', icon: <Hammer />, color: '#f97316' },
    { value: 'necrons', label: '死靈 (Debug)', icon: <Cpu />, color: '#94a3b8' },
];

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
    const [difficulty, setDifficulty] = useState(1);
    const [faction, setFaction] = useState<Faction>('orks');
    const [isRecurring, setIsRecurring] = useState(false);
    // Several times of day for one recurring task, generated in one go.
    const [dueTimes, setDueTimes] = useState<string[]>([]);
    const [slotStart, setSlotStart] = useState('08:00');
    const [slotEnd, setSlotEnd] = useState('22:00');
    const [slotEvery, setSlotEvery] = useState(120);
    const [ascensionCategory, setAscensionCategory] = useState<AscensionCategory | undefined>();
    const [subCategory, setSubCategory] = useState<string>('');
    // @ts-ignore
    const [dueDate, setDueDate] = useState<dayjs.Dayjs>(dayjs().add(12, 'hour'));

    // Effect to handle edit mode vs new mode
    useEffect(() => {
        if (visible) {
            if (initialTask) {
                // Edit Mode
                setTitle(initialTask.title);
                setDifficulty(initialTask.difficulty);
                setFaction(initialTask.faction);
                setIsRecurring(initialTask.isRecurring || false);
                setDueTimes(normalizeSlots(initialTask.dueTimes));
                setAscensionCategory(initialTask.ascensionCategory);
                setSubCategory(initialTask.subCategory || '');
                // @ts-ignore
                setDueDate(dayjs(initialTask.dueDate));
                setInputMode('manual'); // Force manual on edit
            } else {
                // New Mode
                setTitle(initialKeyword);
                setDifficulty(1);
                setFaction('orks');
                setIsRecurring(false);
                setDueTimes([]);
                setAscensionCategory(undefined);
                setSubCategory('');
                // @ts-ignore
                setDueDate(dayjs().add(12, 'hour'));
                setInputMode('manual');
                setSelectedProjectId(undefined);
                setSelectedSubTaskId(undefined);
            }
        }
    }, [visible, initialTask, initialKeyword]);

    // Auto-detect faction based on title (only for new tasks)
    useEffect(() => {
        if (!initialTask && /[打掃家務洗]/.test(title)) setFaction('nurgle');
        else if (!initialTask && /[學習程式代碼]/.test(title)) setFaction('tzeentch');
        else if (!initialTask && /[健身運動困難]/.test(title)) setFaction('khorne');
        else if (!initialTask && /[修改bug]/.test(title.toLowerCase())) setFaction('necrons');
        // keep existing decision if not matched or editing
    }, [title, initialTask]);

    const handleSubmit = () => {
        if (!title.trim()) return;
        const slots = isRecurring ? normalizeSlots(dueTimes) : [];
        // With a list of times the first one is the day's nominal deadline, so the
        // sorting and overdue checks that read dueTime keep working unchanged.
        const dueTime = isRecurring ? (slots[0] ?? dueDate.format('HH:mm')) : undefined;
        onAdd(title, faction, difficulty, dueDate.toDate(), isRecurring, dueTime, ascensionCategory, subCategory, slots);
        setTitle('');
        setDueTimes([]);
        setAscensionCategory(undefined);
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
                            從專案導入
                        </Radio.Button>
                    </Radio.Group>
                </div>
            )}

            {/* Project Selection Mode */}
            {inputMode === 'project' && !initialTask && (
                <div className="p-4 border border-imperial-gold/20 rounded bg-zinc-900/50 space-y-4 mb-4">
                    <div>
                        <label className="text-imperial-gold/70 font-mono block mb-2 text-xs">來源專案 (SOURCE PROJECT)</label>
                        <Select
                            className="w-full"
                            placeholder="選擇戰略專案..."
                            value={selectedProjectId}
                            onChange={handleProjectChange}
                            dropdownStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                        >
                            {projects
                                .filter(p => !p.completed)
                                .sort((a, b) => {
                                    // Extract numbers from something like "M1", "Month 2" etc.
                                    const aNum = parseInt(a.month.replace(/\D/g, '')) || Number.MAX_SAFE_INTEGER;
                                    const bNum = parseInt(b.month.replace(/\D/g, '')) || Number.MAX_SAFE_INTEGER;
                                    return aNum - bNum;
                                })
                                .map(p => (
                                    <Option key={p.id} value={p.id}>{p.month} - {p.title}</Option>
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
                            {projects.find(p => p.id === selectedProjectId)?.subTasks.map(st => (
                                <Option key={st.id} value={st.id}>
                                    {st.completed ? '[已完成] ' : ''}{st.title}
                                </Option>
                            ))}
                        </Select>
                    </div>
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
                <label className="text-imperial-gold/70 font-mono block mb-2">敵軍勢力 (FACTION)</label>
                <div className="grid grid-cols-3 gap-2">
                    {FACTION_OPTIONS.map(opt => (
                        <div
                            key={opt.value}
                            onClick={() => setFaction(opt.value)}
                            className={`
                                cursor-pointer flex flex-col items-center justify-center p-2 rounded border transition-all duration-300
                                ${faction === opt.value
                                    ? 'text-white'
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-imperial-gold/50 hover:text-imperial-gold'}
                            `}
                            style={{
                                borderColor: faction === opt.value ? opt.color : undefined,
                                backgroundColor: faction === opt.value ? `${opt.color}20` : undefined,
                                boxShadow: faction === opt.value ? `0 0 10px ${opt.color}` : undefined
                            }}
                        >
                            <div className="mb-1" style={{ color: faction === opt.value ? opt.color : 'inherit' }}>{opt.icon}</div>
                            <span className="text-[10px] font-mono tracking-tighter">{opt.label.split(' ')[0]}</span>
                        </div>
                    ))}
                </div>
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

                {
                    isRecurring && (
                        <div className="text-[10px] text-cyan-400 font-mono animate-pulse">
                            任務將在每天 00:00 自動重置並重新開放。
                        </div>
                    )
                }

                {isRecurring ? (
                    <div>
                        <label className="text-imperial-gold/70 font-mono block mb-2 text-xs">
                            每日執行時間 (DAILY TIMES)
                        </label>
                        <div className="flex flex-wrap items-end gap-2 mb-3">
                            <TimeField label="從" value={slotStart} onChange={setSlotStart} />
                            <TimeField label="到" value={slotEnd} onChange={setSlotEnd} />
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-mono text-zinc-500">每隔</span>
                                <Select
                                    size="large"
                                    value={slotEvery}
                                    onChange={setSlotEvery}
                                    className="!w-28"
                                    options={[30, 60, 90, 120, 180, 240].map(m => ({ value: m, label: m < 60 ? `${m} 分鐘` : `${m / 60} 小時` }))}
                                />
                            </div>
                            <Button
                                size="large"
                                onClick={() => setDueTimes(generateSlots(slotStart, slotEnd, slotEvery))}
                                className="!bg-imperial-gold/10 !border-imperial-gold/50 !text-imperial-gold font-mono"
                            >
                                產生時段
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
                                <span className="self-center font-mono text-[11px] text-zinc-500">共 {dueTimes.length} 次／天</span>
                            </div>
                        ) : (
                            <div className="flex items-end gap-2">
                                <TimeField label="或只設一個時間" value={dueDate.format('HH:mm')}
                                    onChange={value => { if (isTime(value)) setDueDate(dayjs(`${dayjs().format('YYYY-MM-DD')} ${value}`)); }} />
                                <span className="font-mono text-[11px] text-zinc-500 pb-3">設定起訖與間隔後按「產生時段」，即可一次排完一整天</span>
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

                <div>
                    <label className="text-imperial-gold/70 font-mono block mb-2 text-xs">威脅等級 (THREAT): {difficulty}</label>
                    <Slider
                        min={1}
                        max={5}
                        step={1}
                        marks={{
                            1: { style: { color: '#bbb' }, label: '1' },
                            2: { style: { color: '#bbb' }, label: '2' },
                            3: { style: { color: '#bbb' }, label: '3' },
                            4: { style: { color: '#bbb' }, label: '4' },
                            5: { style: { color: 'red', fontWeight: 'bold' }, label: 'EXTREME' }
                        }}
                        value={difficulty}
                        onChange={setDifficulty}
                        railStyle={{ backgroundColor: '#333' }}
                        trackStyle={{ backgroundColor: '#ef4444' }}
                        handleStyle={{ borderColor: '#ef4444', backgroundColor: '#ef4444' }}
                    />
                </div>
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
