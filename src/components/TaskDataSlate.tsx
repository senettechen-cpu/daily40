import React, { useMemo, useState } from 'react';
import { Table, Button, Tag, Tooltip } from 'antd';
import { Shield, Trash2, Target, Sword, Activity, Plus, FileEdit, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Task, Faction } from '../types';

// Removed Text destructured from Typography to prevent accidental usage

interface TaskDataSlateProps {
    tasks: Task[];
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onPurge: (id: string) => void;
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
    const [purgingIds, setPurgingIds] = useState<Set<string>>(new Set());

    const handlePurge = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setPurgingIds(prev => new Set(prev).add(id));
        setTimeout(() => {
            onPurge(id);
            // Cleanup set after a bit to prevent memory leak if component unmounts/remounts strangely, 
            // though onPurge usually removes the task from props, so it won't render anyway.
            setPurgingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }, 1500);
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

    const columns = useMemo(() => [
        {
            title: '威脅源',
            dataIndex: 'faction',
            key: 'faction',
            width: 100,
            render: (faction: Faction) => (
                <div className="flex items-center gap-2">
                    {FACTION_ICONS[faction]}
                    <span className="text-xs uppercase font-mono text-imperial-gold/50">
                        {faction === 'orks' ? '獸人' :
                            faction === 'nurgle' ? '納垢' :
                                faction === 'khorne' ? '恐虐' :
                                    faction === 'tzeentch' ? '奸奇' :
                                        faction === 'slaanesh' ? '色虐' :
                                            faction === 'necrons' ? '太空死靈' : '未知'}
                    </span>
                </div>
            ),
        },
        {
            title: '目標內容',
            dataIndex: 'title',
            key: 'title',
            render: (title: string, record: Task) => (
                <span
                    className={`font-mono transition-colors ${record.id === selectedId ? 'text-green-400' : 'text-green-500/80'}`}
                >
                    <span>{title}</span>
                </span>
            ),
        },
        {
            title: '威脅等級',
            dataIndex: 'difficulty',
            key: 'difficulty',
            width: 120,
            render: (diff: number) => (
                <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                        <div
                            key={i}
                            className={`w-2 h-3 border border-imperial-gold/20 ${i < diff ? 'bg-red-600/60 shadow-[0_0_5px_rgba(220,38,38,0.5)]' : 'bg-transparent'}`}
                        />
                    ))}
                </div>
            ),
        },
        {
            title: '期限',
            dataIndex: 'dueDate',
            key: 'dueDate',
            width: 150,
            render: (date: Date, record: Task) => {
                const isOverdue = new Date(date) < new Date();

                if (record.isRecurring) {
                    const timeStr = record.dueTime || new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                    const streak = record.streak || 0;

                    return (
                        <div className="flex flex-col">
                            <span className="font-mono text-xs text-cyan-400">每日 {timeStr} 截止</span>
                            <div className={`flex items-center gap-1 mt-0.5 ${streak > 0 ? 'animate-pulse' : 'opacity-50'}`}>
                                <Flame size={12} className={streak > 0 ? "text-orange-500 fill-orange-500" : "text-zinc-600"} />
                                <span className={`text-[10px] font-bold font-mono ${streak > 0 ? "text-orange-400" : "text-zinc-600"}`}>STREAK: {streak}</span>
                            </div>
                        </div>
                    );
                }

                return <span className={`font-mono text-xs ${isOverdue ? 'text-red-500 animate-pulse font-bold' : 'text-imperial-gold/60'}`}><span>{new Date(date).toLocaleString()}</span></span>;
            }
        },
        {
            title: '指令',
            key: 'actions',
            width: 140,
            render: (_: any, record: Task) => {
                const isRecurring = record.isRecurring;
                const isCompletedToday = isRecurring && record.lastCompletedAt &&
                    new Date(record.lastCompletedAt).toLocaleDateString() === new Date().toLocaleDateString();

                return (
                    <div className="flex gap-2 items-center">
                        {onEdit && (
                            <Tooltip title="修改參數">
                                <Button
                                    size="small"
                                    className="!bg-blue-900/20 !border-blue-500/50 hover:!bg-blue-500 hover:!text-black !text-blue-500 !p-1 h-7 w-7 flex items-center justify-center transition-all"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEdit(record);
                                    }}
                                >
                                    <FileEdit size={14} />
                                </Button>
                            </Tooltip>
                        )}

                        {isCompletedToday ? (
                            <Tag color="green" className="!bg-green-900/20 !border-green-500/50 !text-green-500 font-mono text-[10px] m-0 px-2 py-0.5 animate-pulse">
                                COMPLETED
                            </Tag>
                        ) : (() => {
                            // Inline Overdue Check for Recurring
                            let isOverdue = false;
                            if (isRecurring) {
                                const now = new Date();
                                let deadline = new Date(record.dueDate);
                                if (record.dueTime) {
                                    const [h, m] = record.dueTime.split(':').map(Number);
                                    deadline = new Date();
                                    deadline.setHours(h, m, 0, 0);
                                }
                                isOverdue = now > deadline;
                            }

                            if (isOverdue) {
                                return (
                                    <Tag color="red" className="!bg-red-900/20 !border-red-500/50 !text-red-500 font-mono text-[10px] m-0 px-2 py-0.5">
                                        EXPIRED
                                    </Tag>
                                );
                            }

                            return (
                                <Tooltip title="執行淨化">
                                    <Button
                                        size="small"
                                        className={`!border-green-500/50 hover:!bg-green-500 hover:!text-black !text-green-500 !p-1 h-7 w-7 flex items-center justify-center transition-all ${purgingIds.has(record.id) ? '!bg-imperial-gold/20 !text-imperial-gold !border-imperial-gold animate-pulse' : '!bg-green-900/20'}`}
                                        onClick={(e) => handlePurge(record.id, e)}
                                    >
                                        {purgingIds.has(record.id) ? <Flame size={14} className="fill-imperial-gold" /> : <Shield size={14} />}
                                    </Button>
                                </Tooltip>
                            );
                        })()}

                        {isRecurring && onDelete && (
                            <Tooltip title="刪除協議">
                                <Button
                                    size="small"
                                    className="!bg-red-900/10 !border-red-900/30 hover:!bg-red-800 hover:!text-white !text-red-800/50 !p-1 h-7 w-7 flex items-center justify-center transition-all ml-1"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm('確認刪除此每日協議？')) {
                                            onDelete(record.id);
                                        }
                                    }}
                                >
                                    <Trash2 size={12} />
                                </Button>
                            </Tooltip>
                        )}

                        {!isRecurring && (
                            <Tooltip title="標記無效">
                                <Button
                                    size="small"
                                    className="!bg-red-900/20 !border-red-500/50 hover:!bg-red-500 hover:!text-black !text-red-500 !p-1 h-7 w-7 flex items-center justify-center transition-all"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onPurge(record.id);
                                    }}
                                >
                                    <Trash2 size={14} />
                                </Button>
                            </Tooltip>
                        )}
                    </div>
                );
            }
        }
    ], [selectedId, viewMode, onEdit, onPurge]);

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
                    dataSource={sortedTasks}
                    columns={columns}
                    rowKey="id"
                    pagination={false}
                    className="imperial-table"
                    onRow={(record) => ({
                        onMouseEnter: () => onSelect(record.id),
                        onMouseLeave: () => onSelect(null),
                        onClick: () => onSelect(record.id === selectedId ? null : record.id),
                    })}
                    rowClassName={(record) => `cursor-pointer transition-all duration-300 ${purgingIds.has(record.id) ? 'purging-row' : ''} ${record.id === selectedId ? 'bg-green-500/10 border-l-2 border-green-500' : 'hover:bg-imperial-gold/5'}`}
                />
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden flex flex-col gap-3 p-4 pb-20">
                <AnimatePresence mode='popLayout'>
                    {sortedTasks.map(task => {
                        const isOverdue = new Date(task.dueDate) < new Date();
                        const isPurging = purgingIds.has(task.id);

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
                                                    每日 {task.dueTime || new Date(task.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
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

                                        {task.isRecurring && task.lastCompletedAt &&
                                            new Date(task.lastCompletedAt).toLocaleDateString() === new Date().toLocaleDateString() ? (
                                            <Tag color="green" className="!bg-green-900/20 !border-green-500/50 !text-green-500 font-mono text-xs m-0 px-3 py-1 flex items-center animate-pulse">
                                                COMPLETED
                                            </Tag>
                                        ) : (() => {
                                            // Mobile View Overdue Check
                                            let isOverdue = false;
                                            if (task.isRecurring) {
                                                const now = new Date();
                                                let deadline = new Date(task.dueDate);
                                                if (task.dueTime) {
                                                    const [h, m] = task.dueTime.split(':').map(Number);
                                                    deadline = new Date();
                                                    deadline.setHours(h, m, 0, 0);
                                                }
                                                isOverdue = now > deadline;
                                            }

                                            if (isOverdue) {
                                                return (
                                                    <div className="px-4 py-2 border border-red-500/50 bg-red-900/20 text-red-500 text-xs font-mono font-bold tracking-widest">
                                                        EXPIRED / MISSED
                                                    </div>
                                                );
                                            }

                                            return (
                                                <Button
                                                    size="middle"
                                                    className="!bg-green-600 !border-green-500 !text-white !h-10 !px-4 flex items-center gap-2 shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:!scale-105 active:!scale-95 transition-transform"
                                                    disabled={isPurging}
                                                    onClick={(e) => handlePurge(task.id, e)}
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
