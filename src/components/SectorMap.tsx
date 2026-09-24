import React, { useState, useEffect, useRef } from 'react';
import { Card, Progress, Typography, Modal, Button, Form, Input, Select, Tag, Tooltip } from 'antd';
import { Lock, Crosshair, Star, Briefcase, Plus, Check, ChevronRight, Swords, ShieldAlert, Shield, Settings, Skull, Church as ChurchIcon, CircleDashed, Pencil, Trash2 } from 'lucide-react';
import { useGame } from '../contexts/GameContext';
import { useRequisition } from '../contexts/RequisitionContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Project, SubTask } from '../types';
import { GuardsmanIcon, MarineIcon, CustodesIcon } from './ImperiumIcons';
import { PlanetaryTraitType, UnitType } from '../types';
import { SectorNode } from './SectorNode';
import { CampaignBoard } from './CampaignBoard';

const TRAIT_CONFIG: Record<PlanetaryTraitType, { name: string, effect: string, icon: React.ReactNode, color: string }> = {
    'hive': { name: '巢都世界 (Lv1)', effect: '專案數 1~2: 徵召「帝國衛隊」費用 -20%', icon: <Shield size={14} />, color: '#10b981' },
    'forge': { name: '鑄造世界 (Lv3)', effect: '專案數 5~7: 專案 Glory 獎勵 +20%', icon: <Settings size={14} />, color: '#f59e0b' },
    'death': { name: '死亡世界 (Lv4)', effect: '專案數 8+: 難度提升 / Glory 雙倍', icon: <Skull size={14} />, color: '#ef4444' },
    'shrine': { name: '聖地世界 (Lv2)', effect: '專案數 3~4: 腐壞增長速度減半', icon: <ChurchIcon size={14} />, color: '#a855f7' },
    'barren': { name: '荒蕪世界 (Lv0)', effect: '專案數 0', icon: <CircleDashed size={14} />, color: '#71717a' },
};


export const SectorMap: React.FC = () => {
    const { projects, addProject, addSubTask, completeSubTask, updateSubTask, deleteSubTask, deleteProject, getTraitForMonth, currentMonth, sectorHistory, resolveSector, fortifiedSectors } = useGame();
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [activeTab, setActiveTab] = useState<'projects' | 'resolve'>('projects');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [subTaskTitle, setSubTaskTitle] = useState('');
    const [editingSubTaskId, setEditingSubTaskId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');

    // v1.5 milestones. The server is the authority; this holds the ids it just
    // confirmed so the row updates without waiting for a full project reload.
    const { enabled: economyOn, refresh: refreshRequisition } = useRequisition();
    const { getToken } = useAuth();
    const [milestoneOverride, setMilestoneOverride] = useState<Record<string, string[]>>({});
    const [milestoneError, setMilestoneError] = useState<string | null>(null);
    const milestonesFor = (p: Project) => milestoneOverride[p.id] ?? p.milestoneIds ?? [];

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
    const dialogRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!isModalOpen) return;
        const previousFocus = document.activeElement as HTMLElement | null;
        dialogRef.current?.focus();
        const handler = (event: KeyboardEvent) => {
            // Nested Ant Design confirmation dialogs own their keyboard handling.
            if (Array.from(document.querySelectorAll('.ant-modal-wrap')).some(element => element.getClientRects().length > 0)) return;
            if (event.key === 'Escape') setIsModalOpen(false);
            if (event.key === 'Tab') {
                const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]') || []).filter(el => el.getClientRects().length);
                const first = elements[0]; const last = elements[elements.length - 1];
                if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        };
        document.addEventListener('keydown', handler);
        return () => { document.removeEventListener('keydown', handler); previousFocus?.focus(); };
    }, [isModalOpen]);

    const currentMonthIdx = currentMonth;


    const MONTHS = Array.from({ length: 12 }, (_, i) => ({
        id: `M${i + 1}`,
        name: `Month ${i + 1}`,
        status: i < currentMonthIdx ? 'past' : i === currentMonthIdx ? 'active' : 'pending',
    }));

    const handleMonthClick = (monthId: string) => {
        setSelectedMonth(monthId);
        setSelectedProject(null);
        setActiveTab('projects');
        setIsModalOpen(true);
    };

    const handleProjectClick = (project: Project) => setSelectedProject(project);
    const handleAddProject = (values: any) => { if (selectedMonth) addProject(values.title, values.difficulty, selectedMonth); };
    const handleAddSubTask = () => { if (selectedProject && subTaskTitle.trim()) { addSubTask(selectedProject.id, subTaskTitle); setSubTaskTitle(''); } };

    const monthProjects = projects.filter(p => p.month === selectedMonth);
    const activeProject = selectedProject ? projects.find(p => p.id === selectedProject.id) || null : null;

    return (
        <div className="strategy-shell">
            {/* RIGHT MAIN CONTENT */}
            <div className="strategy-main">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(20,20,20,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(20,20,20,0.5)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none z-0 opacity-20" />

                <div className="strategy-content">
                    <CampaignBoard />
                    <div className="campaign-heading"><div><span className="eyebrow">ANNUAL CRUSADE / 12 SECTORS</span><h2>年度遠征航線</h2></div><p>外環：專案完成度</p></div>
                    <div className="campaign-route">
                        {MONTHS.map((month, idx) => {
                            const sectorProjects = projects.filter(p => p.month === month.id);
                            const trait = TRAIT_CONFIG[getTraitForMonth(month.id)];
                            return <SectorNode key={month.id} month={month.id} index={idx} active={month.status === 'active'} past={month.status === 'past'} result={sectorHistory[month.id]} trait={trait} traitId={getTraitForMonth(month.id)} count={sectorProjects.length} completed={sectorProjects.filter(p => p.completed).length} fortified={fortifiedSectors.includes(month.id)} onClick={() => handleMonthClick(month.id)} />;
                        })}
                    </div>
                </div>
            </div>

            {/* MODAL */}
            {isModalOpen && (
                <div className="sector-overlay">
                    <div className="sector-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label={`${selectedMonth} 星區指揮中心`} tabIndex={-1}>
                        {/* Header */}
                        <div className="sector-dialog__header">
                            <div className="flex">
                                <button className={`px-6 py-4 font-mono font-bold transition-all ${activeTab === 'projects' ? 'text-black bg-imperial-gold' : 'text-zinc-500 hover:text-white'}`} onClick={() => setActiveTab('projects')}>戰略專案</button>
                                <button className={`px-6 py-4 font-mono font-bold transition-all ${activeTab === 'resolve' ? 'text-black bg-imperial-gold' : 'text-zinc-500 hover:text-white'}`} onClick={() => setActiveTab('resolve')}>戰役結算</button>
                            </div>
                            <div className="sector-dialog__actions">
                                <span>星區: {selectedMonth}</span>
                                {selectedMonth && fortifiedSectors.includes(selectedMonth) && (
                                    <Tag color="purple" className="font-mono m-0 flex items-center"><Shield size={14} className="mr-1" /> 已要塞化</Tag>
                                )}
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white font-mono text-xl p-2 hover:bg-zinc-800 rounded">X</button>
                        </div>

                        <div className="sector-banner" style={{ backgroundImage: `linear-gradient(90deg, #080c12 5%, rgba(8,12,18,.5)), url("/planets/m${Number(selectedMonth?.slice(1))}.png")` }}><span className="eyebrow">PLANETARY COMMAND</span><h2>{selectedMonth} · {TRAIT_CONFIG[getTraitForMonth(selectedMonth!)].name}</h2><p>{monthProjects.length} 項戰略專案 · {monthProjects.filter(p => p.completed).length} 項已確保</p></div>
                        {/* Content */}
                        <div className="sector-dialog__body">
                            {activeTab === 'resolve' && selectedMonth ? (
                                <div className="flex flex-col gap-6 animate-fade-in">
                                    <p className="font-mono text-xs text-zinc-500">
                                        兵種預備隊制已由名冊取代，部隊部署面板已移除。星區結算仍會推進月份。
                                    </p>
                                    {parseInt(selectedMonth!.slice(1)) - 1 === currentMonth && (
                                        <div className="mt-4 pt-4 border-t border-zinc-800">
                                            <Button danger size="large" block className="!h-16 !text-xl font-bold tracking-widest uppercase animate-pulse" onClick={() => {
                                                Modal.confirm({
                                                    title: '確認戰役結算 (RESOLVE SECTOR)',
                                                    content: '您確定要結束本月的部署並進行戰鬥結算嗎？一旦執行，戰果將無法撤銷，並且時間將推進到下個月。',
                                                    okText: '為了帝皇！', cancelText: '取消',
                                                    onOk: () => { resolveSector(selectedMonth!); setIsModalOpen(false); }
                                                });
                                            }}>🛑 結算本月戰役 (RESOLVE)</Button>
                                        </div>
                                    )}
                                </div>
                            ) : activeProject ? (
                                <div className="flex flex-col gap-6 animate-fade-in">
                                    <div className="flex justify-between items-start">
                                        <div><span className="block text-zinc-500 text-xs font-mono mb-1">行動目標</span><h4 className="!text-white !m-0 text-lg font-bold">{activeProject.title}</h4></div>
                                        <Tag color="volcano" className="font-mono">難度 {activeProject.difficulty}</Tag>
                                    </div>
                                    <div className="project-objectives">
                                        <span className="block text-imperial-gold/70 font-mono text-xs">任務日誌 ({activeProject.subTasks.filter(t => t.completed).length}/{activeProject.subTasks.length})</span>
                                        {economyOn && (
                                            <span className="block text-imperial-gold/50 font-mono text-[11px] mb-1">
                                                里程碑 {milestonesFor(activeProject).length}/3
                                                {milestonesFor(activeProject).length < 3 && '（指定滿三個才開始發放軍需）'}
                                                {milestoneError && <span className="text-red-400"> · {milestoneError}</span>}
                                            </span>
                                        )}
                                        {activeProject.subTasks.length === 0 ? (
                                            <div className="p-8 border border-dashed border-zinc-800 rounded flex flex-col items-center justify-center text-zinc-600"><span className="font-mono text-xs">尚未建立目標</span></div>
                                        ) : (
                                            activeProject.subTasks.map(st => (
                                                <div key={st.id} className={`flex items-center gap-3 p-3 rounded border transition-all group ${st.completed ? 'bg-green-900/20 border-green-900/50 opacity-50' : 'bg-zinc-900 border-zinc-700'}`}>
                                                    <div
                                                        className={`w-6 h-6 rounded-full border flex items-center justify-center cursor-pointer flex-shrink-0 ${st.completed ? 'bg-green-500 border-green-500 text-black' : 'border-zinc-500 hover:border-imperial-gold'}`}
                                                        onClick={() => {
                                                            if (!st.completed) {
                                                                Modal.confirm({
                                                                    title: '確認目標達成',
                                                                    content: `確認已完成戰略目標「${st.title}」？`,
                                                                    okText: '確認', cancelText: '取消',
                                                                    onOk: () => completeSubTask(activeProject.id, st.id)
                                                                });
                                                            }
                                                        }}
                                                    >
                                                        {st.completed && '✓'}
                                                    </div>

                                                    {economyOn && (
                                                        <button
                                                            type="button"
                                                            disabled={st.completed && !milestonesFor(activeProject).includes(st.id)}
                                                            onClick={(e) => { e.stopPropagation(); void toggleMilestone(activeProject, st.id); }}
                                                            title={st.completed ? '已完成的子項無法再改指定' : '指定為里程碑（完成 +20 軍需）'}
                                                            className={`text-[10px] font-mono px-1.5 py-0.5 border tracking-widest flex-shrink-0 ${milestonesFor(activeProject).includes(st.id)
                                                                ? 'border-imperial-gold text-imperial-gold bg-imperial-gold/10'
                                                                : 'border-zinc-700 text-zinc-500 hover:border-imperial-gold/50'}`}
                                                        >
                                                            里程碑
                                                        </button>
                                                    )}

                                                    {editingSubTaskId === st.id ? (
                                                        <div className="flex-1 flex gap-2">
                                                            <input
                                                                value={editTitle}
                                                                onChange={e => setEditTitle(e.target.value)}
                                                                className="flex-1 bg-black text-white border border-imperial-gold p-1 font-mono text-sm"
                                                                autoFocus
                                                            />
                                                            <Button size="small" type="primary" onClick={() => { updateSubTask(activeProject.id, st.id, editTitle); setEditingSubTaskId(null); }}>Save</Button>
                                                            <Button size="small" onClick={() => setEditingSubTaskId(null)}>Cancel</Button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <span className={`flex-1 ${st.completed ? 'line-through text-green-500' : 'text-white'}`}>{st.title}</span>
                                                            {!st.completed && (
                                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <Button
                                                                        type="text" size="small"
                                                                        className="!text-zinc-500 hover:!text-imperial-gold"
                                                                        onClick={() => { setEditingSubTaskId(st.id); setEditTitle(st.title); }}
                                                                    >
                                                                        <Pencil size={14} />
                                                                    </Button>
                                                                    <Button
                                                                        type="text" size="small"
                                                                        className="!text-zinc-500 hover:!text-red-500"
                                                                        onClick={() => {
                                                                            Modal.confirm({
                                                                                title: '刪除目標',
                                                                                content: '確認廢棄此戰略目標？',
                                                                                okText: '刪除', okType: 'danger', cancelText: '取消',
                                                                                onOk: () => deleteSubTask(activeProject.id, st.id)
                                                                            });
                                                                        }}
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                        <div className="flex gap-2 mt-4 p-4 bg-zinc-900/50 rounded border border-zinc-800">
                                            <input value={subTaskTitle} onChange={e => setSubTaskTitle(e.target.value)} placeholder="> 輸入新目標座標..." className="flex-1 bg-black text-white border border-zinc-700 p-2 font-mono outline-none focus:border-imperial-gold" onKeyDown={e => e.key === 'Enter' && handleAddSubTask()} />
                                            <Button onClick={handleAddSubTask} disabled={!subTaskTitle.trim()}>增加</Button>
                                        </div>
                                    </div>
                                    <Button onClick={() => setSelectedProject(null)}>返回星區清單</Button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-6 animate-fade-in">
                                    <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
                                        {monthProjects.length === 0 && <span className="text-zinc-500 text-center py-4">此星區尚無部屬行動。</span>}
                                        {monthProjects.map(p => (
                                            <div key={p.id} className="flex justify-between items-center p-3 bg-zinc-900 border border-zinc-700 rounded cursor-pointer hover:border-imperial-gold transition-all" onClick={() => handleProjectClick(p)}>
                                                <div>
                                                    <div className="text-imperial-gold font-bold">{p.title}</div>
                                                    <div className="text-xs text-zinc-500">難度: {p.difficulty} • {p.subTasks.length} 個目標</div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Progress percent={(p.subTasks.filter(t => t.completed).length / (p.subTasks.length || 1)) * 100} size="small" showInfo={false} strokeColor="#fbbf24" className="w-16" />
                                                    <Tag color={p.completed ? "green" : "volcano"}>{p.completed ? "已確保" : "進行中"}</Tag>
                                                    <ChevronRight size={16} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="border-t border-zinc-800 pt-4">
                                        <span className="block text-imperial-gold/70 mb-2 font-mono text-xs">部屬新專案</span>
                                        <div className="flex gap-2">
                                            <input id="new-project-title" placeholder="專案名稱" className="flex-1 bg-black text-white border border-zinc-700 p-2 font-mono outline-none focus:border-imperial-gold" />
                                            <select id="new-project-difficulty" className="bg-black text-white border border-zinc-700 p-2 font-mono w-24">
                                                {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>Lvl {v}</option>)}
                                            </select>
                                            <Button onClick={() => {
                                                const title = (document.getElementById('new-project-title') as HTMLInputElement).value;
                                                const diff = (document.getElementById('new-project-difficulty') as HTMLSelectElement).value;
                                                if (title) { handleAddProject({ title, difficulty: Number(diff) }); (document.getElementById('new-project-title') as HTMLInputElement).value = ''; }
                                            }}>部署</Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
