import React, { useMemo, useState } from 'react';
import { Table, Button, Tag, Tooltip } from 'antd';
import { Shield, Trash2, Target, Sword, Activity, Plus, FileEdit, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Task, Faction } from '../types';
import { useRequisition } from '../contexts/RequisitionContext';
import { minutesSinceMidnight, normalizeSlots, slotProgress, slotState, type SlotState } from '../../shared/tasks';
import { dayKey } from '../../shared/time';

/** Today's settled times for a task, ignoring a day that has already rolled over. */
const slotsOf = (task: Task) => {
    const slots = normalizeSlots(task.dueTimes);
    const done = task.slotsDay === dayKey(new Date()) ? normalizeSlots(task.slotsDone) : [];
    return { slots, done };
};

/**
 * One line of the slate. A recurring task holding several times of day is drawn
 * as one row per time, each pressed on its own, so missing 06:00 costs that one
 * row and leaves the rest of the day open.
 */
type SlateRow = { key: string; task: Task; slot?: string; state?: SlotState; first: boolean };

const FACTION_NAMES: Record<Faction, string> = {
    orks: '獸人', nurgle: '納垢', khorne: '恐虐', tzeentch: '奸奇',
    slaanesh: '色虐', necrons: '太空死靈', default: '未知',
};

/** A slot's own clock time, coloured by where it stands today. */
const SLOT_LOOK: Record<SlotState, { text: string; note: string }> = {
    done: { text: 'text-green-500', note: '已完成' },
    late: { text: 'text-amber-400', note: '已逾時 · 仍可補' },
    open: { text: 'text-cyan-400', note: '待執行' },
};

/**
 * Marks a task as one of today's three cores. Hidden while the old economy is
 * running, and disabled once the core has already paid out.
 */
const CoreBadge = ({ taskId }: { taskId: string }) => {
    const { enabled, isCore, isCorePaid, canAddCore, toggleCore, selectedDay, today } = useRequisition();
    if (!enabled) return null;

    const selected = isCore(taskId);
    const paid = isCorePaid(taskId);
    const forTomorrow = selectedDay !== today;
    const disabled = paid || (!selected && !canAddCore);

    return (
        <button
            type="button"
            disabled={disabled}
            onClick={(e) => { e.stopPropagation(); void toggleCore(taskId); }}
            title={paid ? '這個核心已結算，不能取消'
                : forTomorrow ? '設為明天的核心（完成 +10 軍需）'
                    : '設為今日核心（完成 +10 軍需）'}
            className={`text-[10px] font-mono px-1.5 py-0.5 border tracking-widest transition-colors ${selected
                ? 'border-imperial-gold text-imperial-gold bg-imperial-gold/10'
                : 'border-zinc-700 text-zinc-500 hover:border-imperial-gold/50 hover:text-imperial-gold/70'
                } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
            {paid ? '核心 ✓' : forTomorrow ? '明日核心' : '核心'}
        </button>
    );
};

// Removed Text destructured from Typography to prevent accidental usage

interface TaskDataSlateProps {
    tasks: Task[];
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onPurge: (id: string, slot?: string) => void;
    onOpenAddModal?: () => void;
    onEdit?: (task: Task) => void;
    onDelete?: (id: string) => void;
    viewMode?: 'active' | 'mandates';
    onToggleView?: (mode: 'active' | 'mandates') => void;
}

const FACTION_ICONS: Record<Faction, React.ReactNode> = {
    'nurgle': <Activity size={14} className="text-green-500" />,
    'khorne': <Sword size={14} className="text-red-500" />,
    'tzeentch': <Target size={14} className="text-blue-500" />,
    'slaanesh': <Activity size={14} className="text-purple-500" />,
    'orks': <Activity size={14} className="text-orange-500" />,
    'necrons': <Shield size={14} className="text-zinc-400" />,
    'default': <Shield size={14} className="text-imperial-gold" />,
};

const TaskDataSlate: React.FC<TaskDataSlateProps> = ({
    tasks, selectedId, onSelect, onPurge, onDelete, onOpenAddModal,
    onEdit, viewMode = 'active', onToggleView
}) => {
    const [showTodayOnly, setShowTodayOnly] = React.useState(false);
    // Keyed by row, not by task: purging the 10:00 glass of water must not light
    // up the other seven rows of the same protocol.
    const [purgingKeys, setPurgingKeys] = useState<Set<string>>(new Set());

    const handlePurge = (row: SlateRow, e: React.MouseEvent) => {
        e.stopPropagation();
        setPurgingKeys(prev => new Set(prev).add(row.key));
        setTimeout(() => {
            onPurge(row.task.id, row.slot);
            setPurgingKeys(prev => {
                const next = new Set(prev);
                next.delete(row.key);
                return next;
            });
        }, 1500);
    };

    /**
     * On a phone a protocol's times are chips, not eight full cards: the same
     * "one press per time" the desktop rows give, in a tenth of the scrolling.
     */
    const renderSlotChips = (task: Task) => {
        const { slots, done } = slotsOf(task);
        const nowMinutes = minutesSinceMidnight();
        return (
            <div className="flex flex-wrap gap-1.5 mt-2">
                {slots.map(time => {
                    const state = slotState(slots, done, time, nowMinutes);
                    const key = `${task.id}@${time}`;
                    const purging = purgingKeys.has(key);
                    return (
                        <button
                            key={time}
                            type="button"
                            disabled={state === 'done' || purging}
                            onClick={(e) => handlePurge({ key, task, slot: time, state, first: false }, e)}
                            className={`font-mono text-xs px-2.5 py-2 border tracking-widest transition-colors ${purging ? 'border-imperial-gold text-imperial-gold bg-imperial-gold/20 animate-pulse'
                                : state === 'done' ? 'border-green-500/40 text-green-500 bg-green-900/20'
                                    : state === 'late' ? 'border-amber-500/50 text-amber-400 bg-amber-900/10 active:bg-amber-500 active:text-black'
                                        : 'border-cyan-500/40 text-cyan-400 bg-cyan-900/10 active:bg-cyan-500 active:text-black'}`}
                        >
                            {state === 'done' ? `✓ ${time}` : time}
                        </button>
                    );
                })}
            </div>
        );
    };

    const sortedTasks = useMemo(() => {
        let filtered = [...tasks];

        if (showTodayOnly) {
            const todayStr = new Date().toLocaleDateString();
            filtered = filtered.filter(t => {
                const isDueToday = new Date(t.dueDate).toLocaleDateString() === todayStr;
                const isOverdue = new Date(t.dueDate) < new Date();
                return isDueToday || isOverdue; // Show today AND overdue
            });
        }

        return filtered.sort((a, b) => {
            const now = new Date();
            const nowTime = now.getTime();

            const getEffectiveDate = (t: Task) => {
                let d = new Date(t.dueDate);
                if (t.isRecurring) {
                    d = new Date(); // Always normalize recurring to Today
                    let h = 0, m = 0;

                    if (t.dueTime) {
                        [h, m] = t.dueTime.split(':').map(Number);
                    } else {
                        // Fallback to original due date time
                        const original = new Date(t.dueDate);
                        h = original.getHours();
                        m = original.getMinutes();
                    }
                    d.setHours(h, m, 0, 0);
                }
                return d;
            };

            const dateA = getEffectiveDate(a);
            const dateB = getEffectiveDate(b);
            const timeA = dateA.getTime();
            const timeB = dateB.getTime();

            const isOverdueA = timeA < nowTime;
            const isOverdueB = timeB < nowTime;

            // 1. Completion/Status grouping? (Optional, if "New" implies "Not Done")
            // Assuming "All Active" tasks here.

            // 1. Overdue first (if strict ordering desired) - Or just native time sorting?
            // If strictly time sorting (08:00, 10:00, 12:00), overdue naturally comes first if it's earlier in the day.
            // But if "Tomorrow"? Simple time sort handles it.

            return timeA - timeB;
        });
    }, [tasks, showTodayOnly]);

    /**
     * The slate's lines. A protocol with times of day becomes one line per time,
     * kept contiguous and in clock order under the protocol it belongs to.
     */
    const rows = useMemo<SlateRow[]>(() => {
        const nowMinutes = minutesSinceMidnight();
        return sortedTasks.flatMap<SlateRow>(task => {
            const { slots, done } = slotsOf(task);
            if (!task.isRecurring || slots.length === 0) return [{ key: task.id, task, first: true }];
            return slots.map<SlateRow>((time, i) => ({
                key: `${task.id}@${time}`,
                task,
                slot: time,
                state: slotState(slots, done, time, nowMinutes),
                first: i === 0,
            }));
        });
    }, [sortedTasks]);

    const columns = useMemo(() => [
        {
            title: '威脅源',
            key: 'faction',
            width: 100,
            render: (_: unknown, { task, first }: SlateRow) => first ? (
                <div className="flex items-center gap-2">
                    {FACTION_ICONS[task.faction]}
                    <span className="text-xs uppercase font-mono text-imperial-gold/50">
                        {FACTION_NAMES[task.faction] ?? '未知'}
                    </span>
                </div>
            ) : (
                <span className="font-mono text-imperial-gold/20 text-xs pl-2">└</span>
            ),
        },
        {
            title: '目標內容',
            key: 'title',
            render: (_: unknown, { task, slot, state, first }: SlateRow) => (
                <div className="flex items-center gap-2">
                    <span className={`font-mono transition-colors ${task.id === selectedId ? 'text-green-400' : 'text-green-500/80'} ${slot && !first ? 'opacity-60' : ''}`}>
                        {task.title}
                    </span>
                    {slot && (
                        <span className={`font-mono text-[11px] px-1.5 py-0.5 border tracking-widest ${state === 'done' ? 'border-green-500/40 text-green-500 bg-green-900/10'
                            : state === 'late' ? 'border-amber-500/40 text-amber-400 bg-amber-900/10'
                                : 'border-cyan-500/30 text-cyan-400 bg-cyan-900/10'}`}>
                            {slot}
                        </span>
                    )}
                    {first && <CoreBadge taskId={task.id} />}
                </div>
            ),
        },
        {
            title: '威脅等級',
            key: 'difficulty',
            width: 120,
            render: (_: unknown, { task, first }: SlateRow) => first ? (
                <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                        <div
                            key={i}
                            className={`w-2 h-3 border border-imperial-gold/20 ${i < task.difficulty ? 'bg-red-600/60 shadow-[0_0_5px_rgba(220,38,38,0.5)]' : 'bg-transparent'}`}
                        />
                    ))}
                </div>
            ) : null,
        },
        {
            title: '期限',
            key: 'dueDate',
            width: 180,
            render: (_: unknown, { task, slot, state, first }: SlateRow) => {
                if (!task.isRecurring) {
                    const isOverdue = new Date(task.dueDate) < new Date();
                    return (
                        <span className={`font-mono text-xs ${isOverdue ? 'text-red-500 animate-pulse font-bold' : 'text-imperial-gold/60'}`}>
                            {new Date(task.dueDate).toLocaleString()}
                        </span>
                    );
                }

                const streak = task.streak || 0;
                const { slots, done } = slotsOf(task);
                const progress = slotProgress(slots, done);

                // A single-time protocol past its hour is marked late, not expired:
                // the user ruled a missed one can still be made good the same day.
                const plainTime = task.dueTime || new Date(task.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                const plainLate = !slot && (() => {
                    const [h, m] = plainTime.split(':').map(Number);
                    const deadline = new Date();
                    deadline.setHours(h, m, 0, 0);
                    return new Date() > deadline;
                })();

                return (
                    <div className="flex flex-col">
                        {slot ? (
                            <span className={`font-mono text-xs ${SLOT_LOOK[state ?? 'open'].text}`}>
                                {slot} · {SLOT_LOOK[state ?? 'open'].note}
                            </span>
                        ) : (
                            <span className={`font-mono text-xs ${plainLate ? 'text-amber-400' : 'text-cyan-400'}`}>
                                每日 {plainTime} {plainLate ? '· 已逾時 · 仍可補' : '截止'}
                            </span>
                        )}
                        {first && (
                            <div className="flex items-center gap-2 mt-0.5">
                                <div className={`flex items-center gap-1 ${streak > 0 ? 'animate-pulse' : 'opacity-50'}`}>
                                    <Flame size={12} className={streak > 0 ? 'text-orange-500 fill-orange-500' : 'text-zinc-600'} />
                                    <span className={`text-[10px] font-bold font-mono ${streak > 0 ? 'text-orange-400' : 'text-zinc-600'}`}>STREAK: {streak}</span>
                                </div>
                                {slots.length > 0 && (
                                    <span className="text-[10px] font-mono text-zinc-500">今日 {progress.done}/{progress.total}</span>
                                )}
                            </div>
                        )}
                    </div>
                );
            }
        },
        {
            title: '指令',
            key: 'actions',
            width: 140,
            render: (_: unknown, row: SlateRow) => {
                const { task, slot, state, first } = row;
                const purging = purgingKeys.has(row.key);
                const settledToday = slot
                    ? state === 'done'
                    : Boolean(task.isRecurring && task.lastCompletedAt &&
                        new Date(task.lastCompletedAt).toLocaleDateString() === new Date().toLocaleDateString());

                return (
                    <div className="flex gap-2 items-center">
                        {onEdit && first && (
                            <Tooltip title="修改參數">
                                <Button
                                    size="small"
                                    className="!bg-blue-900/20 !border-blue-500/50 hover:!bg-blue-500 hover:!text-black !text-blue-500 !p-1 h-7 w-7 flex items-center justify-center transition-all"
                                    onClick={(e) => { e.stopPropagation(); onEdit(task); }}
                                >
                                    <FileEdit size={14} />
                                </Button>
                            </Tooltip>
                        )}

                        {settledToday ? (
                            <Tag color="green" className="!bg-green-900/20 !border-green-500/50 !text-green-500 font-mono text-[10px] m-0 px-2 py-0.5">
                                COMPLETED
                            </Tag>
                        ) : (
                            <Tooltip title={slot ? `補上 ${slot} 這一格` : '執行淨化'}>
                                <Button
                                    size="small"
                                    className={`!border-green-500/50 hover:!bg-green-500 hover:!text-black !text-green-500 !p-1 h-7 w-7 flex items-center justify-center transition-all ${purging ? '!bg-imperial-gold/20 !text-imperial-gold !border-imperial-gold animate-pulse' : '!bg-green-900/20'}`}
                                    onClick={(e) => handlePurge(row, e)}
                                >
                                    {purging ? <Flame size={14} className="fill-imperial-gold" /> : <Shield size={14} />}
                                </Button>
                            </Tooltip>
                        )}

                        {task.isRecurring && onDelete && first && (
                            <Tooltip title="刪除協議">
                                <Button
                                    size="small"
                                    className="!bg-red-900/10 !border-red-900/30 hover:!bg-red-800 hover:!text-white !text-red-800/50 !p-1 h-7 w-7 flex items-center justify-center transition-all ml-1"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm('確認刪除此每日協議？')) onDelete(task.id);
                                    }}
                                >
                                    <Trash2 size={12} />
                                </Button>
                            </Tooltip>
                        )}

                        {!task.isRecurring && (
                            <Tooltip title="標記無效">
                                <Button
                                    size="small"
                                    className="!bg-red-900/20 !border-red-500/50 hover:!bg-red-500 hover:!text-black !text-red-500 !p-1 h-7 w-7 flex items-center justify-center transition-all"
                                    onClick={(e) => { e.stopPropagation(); onPurge(task.id); }}
                                >
                                    <Trash2 size={14} />
                                </Button>
                            </Tooltip>
                        )}
                    </div>
                );
            }
        }
    ], [selectedId, onEdit, onDelete, onPurge, purgingKeys]);

    return (
        <div
            className="w-full border border-imperial-gold/20 bg-black/60 backdrop-blur-md relative overflow-hidden flex flex-col"
        >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-imperial-gold/30 to-transparent" />
            <header className="px-4 py-2 border-b border-imperial-gold/10 flex justify-between items-center bg-imperial-gold/5">
                <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                        <div
                            className={`cursor-pointer px-2 py-1 text-[10px] font-mono tracking-[0.2em] transition-colors ${viewMode === 'active' ? 'text-imperial-gold border-b border-imperial-gold' : 'text-imperial-gold/40 hover:text-imperial-gold/70'}`}
                            onClick={() => onToggleView && onToggleView('active')}
                        >
                            ACTIVE MISSIONS
                        </div>
                        <div className="w-px h-4 bg-imperial-gold/20" />
                        <div
                            className={`cursor-pointer px-2 py-1 text-[10px] font-mono tracking-[0.2em] transition-colors ${viewMode === 'mandates' ? 'text-cyan-400 border-b border-cyan-400' : 'text-imperial-gold/40 hover:text-cyan-400/70'}`}
                            onClick={() => onToggleView && onToggleView('mandates')}
                        >
                            MANDATE PROTOCOLS
                        </div>
                    </div>
                    {/* Today Filter Toggle */}
                    <div
                        className={`cursor-pointer px-2 py-1 text-[10px] font-mono tracking-[0.1em] border transition-all ${showTodayOnly ? 'border-green-500 text-green-500 bg-green-900/10' : 'border-imperial-gold/20 text-imperial-gold/40 hover:border-imperial-gold/50'}`}
                        onClick={() => setShowTodayOnly(!showTodayOnly)}
                    >
                        [ {showTodayOnly ? 'TODAY ONLY' : 'SHOW ALL'} ]
                    </div>

                    {onOpenAddModal && (
                        <Button
                            size="small"
                            icon={<Plus size={14} />}
                            className="!bg-imperial-gold/10 !border-imperial-gold/30 !text-imperial-gold hover:!bg-imperial-gold hover:!text-black flex items-center justify-center h-6 text-[10px] font-mono ml-2"
                            onClick={onOpenAddModal}
                        >
                            NEW DEPLOYMENT
                        </Button>
                    )}
                </div>
                <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
                        <span className="text-[9px] font-mono text-green-500 opacity-50 underline">ENCRYPTED LINK STABLE</span>
                    </div>
                </div>
            </header>

            {/* Desktop Table View */}
            <div className="hidden md:block">
                <Table
                    dataSource={rows}
                    columns={columns}
                    rowKey="key"
                    pagination={false}
                    className="imperial-table"
                    onRow={(row) => ({
                        onMouseEnter: () => onSelect(row.task.id),
                        onMouseLeave: () => onSelect(null),
                        onClick: () => onSelect(row.task.id === selectedId ? null : row.task.id),
                    })}
                    rowClassName={(row) => `cursor-pointer transition-all duration-300 ${purgingKeys.has(row.key) ? 'purging-row' : ''} ${row.slot && !row.first ? 'slot-row' : ''} ${row.task.id === selectedId ? 'bg-green-500/10 border-l-2 border-green-500' : 'hover:bg-imperial-gold/5'}`}
                />
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden flex flex-col gap-3 p-4 pb-20">
                <AnimatePresence mode='popLayout'>
                    {sortedTasks.map(task => {
                        const isOverdue = new Date(task.dueDate) < new Date();
                        const isPurging = purgingKeys.has(task.id);
                        const cardSlots = slotsOf(task);
                        const cardProgress = slotProgress(cardSlots.slots, cardSlots.done);
                        const cardMet = cardProgress.total > 0 && cardProgress.done === cardProgress.total;

                        return (
                            <motion.div
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{
                                    opacity: 1,
                                    scale: 1,
                                    borderColor: isPurging ? '#fbbf24' : (task.id === selectedId ? '#22c55e' : '#27272a'),
                                    backgroundColor: isPurging ? 'rgba(251, 191, 36, 0.2)' : (task.id === selectedId ? 'rgba(20, 83, 45, 0.1)' : 'rgba(24, 24, 27, 0.4)'),
                                    boxShadow: isPurging ? '0 0 30px rgba(251, 191, 36, 0.6)' : 'none'
                                }}
                                exit={{
                                    opacity: 0,
                                    scale: 1.1,
                                    y: -20,
                                    filter: 'blur(10px)',
                                    transition: { duration: 0.5 }
                                }}
                                transition={{ duration: 0.3 }}
                                key={task.id} // Must be stable
                                className={`relative p-4 border rounded-lg overflow-hidden`}
                                onClick={() => !isPurging && onSelect(task.id === selectedId ? null : task.id)}
                            >
                                {/* Holy Purge Overlay */}
                                <AnimatePresence>
                                    {isPurging && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                                        >
                                            <div className="flex flex-col items-center">
                                                <motion.div
                                                    initial={{ scale: 0, rotate: -45 }}
                                                    animate={{ scale: 1.5, rotate: 0 }}
                                                    transition={{ type: "spring", bounce: 0.5 }}
                                                >
                                                    <Shield size={48} className="text-imperial-gold fill-imperial-gold/20" />
                                                </motion.div>
                                                <motion.span
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: 0.2 }}
                                                    className="mt-2 text-xl font-bold font-mono text-imperial-gold tracking-[0.5em] uppercase shadow-black drop-shadow-lg"
                                                >
                                                    異端消除
                                                </motion.span>
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: '100%' }}
                                                    transition={{ duration: 1 }}
                                                    className="h-1 bg-imperial-gold mt-2 shadow-[0_0_10px_#fbbf24]"
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex flex-col">
                                        <span className={`font-mono text-lg font-bold ${task.id === selectedId ? 'text-green-400' : 'text-green-500'}`}>
                                            {task.title}
                                        </span>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] text-zinc-500 uppercase font-mono">
                                                {task.faction === 'orks' ? '獸人' :
                                                    task.faction === 'nurgle' ? '納垢' :
                                                        task.faction === 'khorne' ? '恐虐' :
                                                            task.faction === 'tzeentch' ? '奸奇' :
                                                                task.faction === 'slaanesh' ? '色虐' :
                                                                    task.faction === 'necrons' ? '太空死靈' : '未知'}
                                            </span>
                                            <CoreBadge taskId={task.id} />
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        {FACTION_ICONS[task.faction]}
                                        <div className="flex gap-0.5">
                                            {[...Array(5)].map((_, i) => (
                                                <div
                                                    key={i}
                                                    className={`w-1.5 h-2 border border-imperial-gold/20 ${i < task.difficulty ? 'bg-red-600/60' : 'bg-transparent'}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-between items-end mt-4">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-zinc-500 font-mono">DEADLINE</span>
                                        {task.isRecurring ? (
                                            <div className="flex flex-col">
                                                <span className="font-mono text-sm text-cyan-400">
                                                    {cardProgress.total > 0
                                                        ? `今日 ${cardProgress.done}/${cardProgress.total}`
                                                        : `每日 ${task.dueTime || new Date(task.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`}
                                                </span>
                                                <div className={`flex items-center gap-1 mt-1 ${(task.streak || 0) > 0 ? 'animate-pulse' : 'opacity-50'}`}>
                                                    <Flame size={12} className={(task.streak || 0) > 0 ? "text-orange-500 fill-orange-500" : "text-zinc-600"} />
                                                    <span className={`text-[10px] font-bold font-mono ${(task.streak || 0) > 0 ? "text-orange-400" : "text-zinc-600"}`}>STREAK: {task.streak || 0}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <span className={`font-mono text-sm ${isOverdue ? 'text-red-500 animate-pulse font-bold' : 'text-imperial-gold/80'}`}>
                                                {new Date(task.dueDate).toLocaleString()}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex gap-2">
                                        {onEdit && (
                                            <Button
                                                size="middle"
                                                className="!bg-blue-900/20 !border-blue-500/50 !text-blue-500 !h-10 !w-10 flex items-center justify-center p-0"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onEdit(task);
                                                }}
                                            >
                                                <FileEdit size={18} />
                                            </Button>
                                        )}

                                        {(cardProgress.total > 0
                                            ? cardMet
                                            : Boolean(task.isRecurring && task.lastCompletedAt &&
                                                new Date(task.lastCompletedAt).toLocaleDateString() === new Date().toLocaleDateString())) ? (
                                            <Tag color="green" className="!bg-green-900/20 !border-green-500/50 !text-green-500 font-mono text-xs m-0 px-3 py-1 flex items-center animate-pulse">
                                                COMPLETED
                                            </Tag>
                                        ) : (() => {
                                            // A protocol with times of day is pressed through its chips
                                            // below, one time at a time. Nothing here expires: a slot that
                                            // has passed is marked late and stays pressable all day.
                                            if (cardProgress.total > 0) return null;

                                            return (
                                                <Button
                                                    size="middle"
                                                    className="!bg-green-600 !border-green-500 !text-white !h-10 !px-4 flex items-center gap-2 shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:!scale-105 active:!scale-95 transition-transform"
                                                    disabled={isPurging}
                                                    onClick={(e) => handlePurge({ key: task.id, task, first: true }, e)}
                                                >
                                                    <Shield size={18} className={isPurging ? 'animate-spin' : ''} />
                                                    <span className="font-bold tracking-widest text-xs">
                                                        {isPurging ? 'PURGING...' : '淨化'}
                                                    </span>
                                                </Button>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {cardProgress.total > 0 && renderSlotChips(task)}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            <style>{`
                .imperial-table .ant-table {
                    background: transparent !important;
                    color: #fbbf24 !important;
                }
                .imperial-table .ant-table-thead > tr > th {
                    background: rgba(251, 191, 36, 0.05) !important;
                    color: rgba(251, 191, 36, 0.5) !important;
                    text-transform: uppercase;
                    font-size: 14px; /* Increased from 10px */
                    letter-spacing: 0.1em;
                    border-bottom: 1px solid rgba(251, 191, 36, 0.1) !important;
                    font-family: monospace;
                }
                .imperial-table .ant-table-tbody > tr > td {
                    border-bottom: 1px solid rgba(251, 191, 36, 0.05) !important;
                    font-size: 16px; /* Increased base font size */
                }
                .imperial-table .ant-table-tbody > tr:hover > td {
                    background: transparent !important;
                }
                .imperial-table .ant-table-tbody > tr.slot-row > td {
                    border-bottom-color: rgba(251, 191, 36, 0.02) !important;
                    padding-top: 6px !important;
                    padding-bottom: 6px !important;
                }
                .imperial-table .ant-table-tbody > tr.purging-row > td {
                    background: rgba(251, 191, 36, 0.2) !important;
                    color: #fbbf24 !important;
                    text-shadow: 0 0 10px #fbbf24;
                    transition: all 1s ease;
                    filter: blur(1px);
                }
            `}</style>
        </div>
    );
};

export default TaskDataSlate;
