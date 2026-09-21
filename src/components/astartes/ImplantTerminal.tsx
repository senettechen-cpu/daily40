import React, { useState } from 'react';
import { Button, Typography, message, Tooltip, Badge, Slider } from 'antd';
import { useAscension } from '../../hooks/useAscension';
import { AscensionCategory } from '../../types';

import { IMPLANT_STAGES, Implant, REWARD_UNIT_PACK, UNIT_DETAILS, RITUAL_ACTIVITIES } from '../../data/astartesData';
import { Lock, Check, Shield, Activity, Zap, Plus, Trash2, Edit2, Save, X } from 'lucide-react';
import { useGame } from '../../contexts/GameContext';
import { Modal, Input, InputNumber } from 'antd';
import { ResourceSigil, RESOURCE_META } from '../ResourceDisplay';
import { UnitEmblem } from '../UnitPortrait';
import { UNIT_VISUALS } from '../../data/unitVisuals';
import { RitualGoal, RITUAL_RESOURCE } from './RitualGoal';


const { Title, Paragraph } = Typography;

interface ImplantTerminalProps {
    selectedImplantId: string | null;
    onSelectImplant: (id: string) => void;
    activeTab: 'surgery' | 'rituals';
    setActiveTab: (tab: 'surgery' | 'rituals') => void;
}

export const ImplantTerminal: React.FC<ImplantTerminalProps> = ({ selectedImplantId, onSelectImplant, activeTab, setActiveTab }) => {
    const { astartes, currentStageId, canUnlock, unlockImplant } = useAscension();
    const { modifyAstartesResources, addRitualActivity, updateRitualActivity, deleteRitualActivity, earnCampaignAction } = useGame();

    // Management State
    const [isAddingToCategory, setIsAddingToCategory] = useState<AscensionCategory | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [tempRitualName, setTempRitualName] = useState('');
    const [tempRitualDiff, setTempRitualDiff] = useState(3);



    const currentStage = IMPLANT_STAGES.find(s => s.id === currentStageId) || IMPLANT_STAGES[IMPLANT_STAGES.length - 1];
    const isStageCompleted = astartes.completedStages.includes(currentStage.id);

    // --- Surgery Logic ---
    const handleUnlock = (implant: Implant) => {
        onSelectImplant(implant.id);
        const result = unlockImplant(implant);
        if (result && result.success) {
            message.success(`手術成功: ${implant.name} 已植入`);
            if (result.stageCompleted) {
                message.success({
                    content: `階段完成: ${result.stageName}! 獲得戰團增援包！`,
                    duration: 5,
                    icon: <Shield className="text-imperial-gold" />
                });
            }
        } else {
            message.error(`手術失敗: ${canUnlock(implant).reason}`);
        }
    };

    // --- Rituals Logic ---
    // Direct resource gain without manual task creation
    const handleCompleteRitual = (activityId: string, category: string, baseDifficulty: number, activityName: string) => {
        // Create a transient task object to simulate completion
        const ritualTask = {
            id: `ritual-${Date.now()}`,
            title: activityName,
            difficulty: 3, // ritualDifficulty removed
            ascensionCategory: category as any,
            status: 'active' as const,
            faction: 'orks' as const, // Placeholder
            subTasks: [],
            isRecurring: false,
            createdAt: new Date(),
            dueDate: new Date(),
            month: 'Ritual',
            subCategory: activityName
        };

        // Reuse existing game context logic which handles resource grant details
        // completeTask(ritualTask.id); // Validly removed because function is dead code
        // Note: Since completeTask expects an existing ID in state, we might need a direct resource grant function expose
        // BUT, looking at GameContext logic: it finds task by ID.
        // If task doesn't exist in state, it might fail.
        // Let's check GameContext: Yes, `const task = tasks.find(...)`.
        // So we need to actually ADD it then COMPLETE it, OR we need a direct "Add Resource" method.
        // Since we can't change GameContext easily right now without risk, let's use a workaround:
        // We will mock the resource gain message here since we can't easily inject a temp task into GameContext state just to complete it immediately without a refactor.
        // WAIT, GameContext `modifyAstartesResources` is NOT exposed directly? 
        // Let's modify GameContext logic? No, let's try to simulate it by creating a "Ritual Task" via `addTask` then completing it?
        // Too slow.
        // Let's assume for this "Visual" polish step we might need to expose a helper or just rely on `addTask`?
        // User said: "I don't want to type".
        // Let's assume we can trigger resources.

        // Actually, let's just make it visually work for now, and queue a refactor for GameContext if needed.
        // But wait, `completeTask` logic in GameContext:
        // `const task = tasks.find(t => t.id === id);`
        // If it returns undefined, it won't grant resources.
        // So we MUST have the task in state.

        // Alternative: modification of GameContext is risky now? 
        // Let's do a quick hack: `addTask` -> immediate `completeTask`.
        // We need `addTask` from context.
    };

    // useGame destructured at top


    const onRitualClick = (activity: any) => {
        // Direct resource grant implementation based on Base Difficulty
        const resourceMap: Record<string, string> = {
            'exercise': 'adamantium', // Space Wolves
            'learning': 'neuroData',  // Imperial Fists
            'cleaning': 'puritySeals', // Grey Knights
            'parenting': 'geneLegacy'  // Salamanders
        };

        const resourceType = resourceMap[activity.category];
        const amount = activity.baseDifficulty * 10;

        if (resourceType) {
            const now = new Date();
            const earned = earnCampaignAction(`ritual:${activity.category}:${activity.id}:${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`, activity.name);
            modifyAstartesResources(
                { [resourceType]: amount },
                `Ritual Completed: ${activity.name}`
            );
            message.success({
                content: `儀式完成: ${activity.name} (+${amount} 資源)${earned ? ' · +1 戰役行動點' : ' · 今日行動點已領取'}`,
                icon: <Zap className="text-imperial-gold" />
            });
        }
    };

    const handleAddActivity = (category: AscensionCategory) => {
        if (!tempRitualName.trim()) {
            message.warning('請輸入儀式名稱');
            return;
        }
        addRitualActivity(category, tempRitualName, tempRitualDiff);
        setIsAddingToCategory(null);
        setTempRitualName('');
        setTempRitualDiff(3);
        message.success('儀式已新增至協議伺服器');
    };

    const handleStartEdit = (ritual: any) => {
        setEditingId(ritual.id);
        setTempRitualName(ritual.name);
        setTempRitualDiff(ritual.baseDifficulty);
    };

    const handleSaveEdit = (category: AscensionCategory, id: string) => {
        updateRitualActivity(category, id, { name: tempRitualName, baseDifficulty: tempRitualDiff });
        setEditingId(null);
        message.success('儀式紀錄已更新');
    };

    const handleDelete = (category: AscensionCategory, id: string) => {
        Modal.confirm({
            title: '確定要移除此儀式協議嗎？',
            content: '此動作將永久從終端機中抹除該紀錄。',
            okText: '抹除',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => {
                deleteRitualActivity(category, id);
                message.info('儀式紀錄已移除');
            }
        });
    };



    return (
        <div className="implant-terminal flex flex-col h-full bg-black/80 border-l border-imperial-gold/20 p-6 overflow-y-auto custom-scrollbar relative">
            {/* Background Grid */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(20,20,20,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(20,20,20,0.5)_1px,transparent_1px)] bg-[length:40px_40px] pointer-events-none opacity-20" />

            {/* TAB SWITCHER */}
            <div className="flex mb-6 border-b border-imperial-gold/30 z-10 relative">
                <button
                    onClick={() => setActiveTab('surgery')}
                    className={`flex-1 py-3 text-xs font-mono tracking-[0.2em] transition-all hover:bg-imperial-gold/5
                        ${activeTab === 'surgery' ? 'text-imperial-gold border-b-2 border-imperial-gold bg-imperial-gold/10' : 'text-zinc-600'}
                    `}
                >
                    改造手術 (SURGERY)
                </button>
                <div className="w-px bg-imperial-gold/30 my-2" />
                <button
                    onClick={() => setActiveTab('rituals')}
                    className={`flex-1 py-3 text-xs font-mono tracking-[0.2em] transition-all hover:bg-imperial-gold/5
                        ${activeTab === 'rituals' ? 'text-imperial-gold border-b-2 border-imperial-gold bg-imperial-gold/10' : 'text-zinc-600'}
                    `}
                >
                    日常儀式 (RITUAL LOG)
                </button>
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 relative z-10">
                {activeTab === 'surgery' ? (
                    <>
                        {/* Header: Stage Info */}
                        <div className="mb-8 border-b border-imperial-gold/20 pb-4">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-imperial-gold/60 text-[10px] font-mono tracking-[0.3em] bg-imperial-gold/5 px-2 py-1">PHASE // {currentStage.id.toString().padStart(2, '0')}</span>
                                <span className="text-imperial-gold font-mono text-xl font-bold animate-pulse">STAGE {currentStage.id}</span>
                            </div>
                            <Title level={3} className="!text-white !font-black uppercase !m-0 tracking-widest text-3xl drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]">
                                {currentStage.name}
                                <span className="block text-sm font-normal text-zinc-500 mt-1 tracking-normal">{currentStage.englishName}</span>
                            </Title>
                            <div className="mt-4 p-4 border border-imperial-gold/10 bg-imperial-gold/5 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-imperial-gold/50" />
                                <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-imperial-gold/50" />
                                <Paragraph className="text-zinc-400 text-sm font-mono italic m-0 relative z-10 group-hover:text-zinc-300 transition-colors">
                                    "{currentStage.description}"
                                </Paragraph>
                            </div>
                        </div>

                        {/* Implants Grid (Cards) */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            {currentStage.implants.map(implant => {
                                const isUnlocked = astartes.unlockedImplants.includes(implant.id);
                                const check = canUnlock(implant);

                                return (
                                    <div
                                        key={implant.id}
                                        data-implant-id={implant.id}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`檢視${implant.name}`}
                                        aria-pressed={selectedImplantId === implant.id}
                                        onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelectImplant(implant.id); } }}
                                        className={`
                                            relative p-5 border transition-all duration-300 group cursor-pointer overflow-hidden
                                            ${isUnlocked
                                                ? 'bg-imperial-gold/10 border-imperial-gold/60 shadow-[0_0_20px_rgba(251,191,36,0.1)]'
                                                : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-500 hover:bg-zinc-900/60'}
                                            ${selectedImplantId === implant.id ? 'border-imperial-gold scale-[1.02] shadow-[0_0_30px_rgba(251,191,36,0.15)] z-10' : ''}
                                        `}
                                        onClick={() => onSelectImplant(implant.id)}
                                    >
                                        {/* Holographic Corner Accents */}
                                        <div className={`absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 transition-colors ${isUnlocked ? 'border-imperial-gold' : 'border-zinc-600 group-hover:border-zinc-400'}`} />
                                        <div className={`absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 transition-colors ${isUnlocked ? 'border-imperial-gold' : 'border-zinc-600 group-hover:border-zinc-400'}`} />

                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <h4 className={`text-base font-bold font-mono uppercase m-0 flex items-center gap-2 ${isUnlocked ? 'text-imperial-gold text-shadow-[0_0_5px_rgba(251,191,36,0.5)]' : 'text-zinc-300'}`}>
                                                    {implant.name}
                                                </h4>
                                                <span className="text-[10px] text-zinc-500 font-mono tracking-wider">{implant.englishName}</span>
                                            </div>
                                            {isUnlocked ? (
                                                <div className="bg-green-500/20 p-1 rounded-full border border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.3)]">
                                                    <Check size={14} className="text-green-400" />
                                                </div>
                                            ) : (
                                                <Lock size={16} className="text-zinc-700 group-hover:text-zinc-500 transition-colors" />
                                            )}
                                        </div>

                                        <p className="text-xs text-zinc-500 leading-relaxed mb-4 h-10 overflow-hidden text-ellipsis line-clamp-2 group-hover:text-zinc-400 transition-colors">
                                            {implant.description}
                                        </p>

                                        <div className="flex justify-between items-center bg-black/60 p-2 border border-zinc-800/50">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-1 h-1 rounded-full ${(!isUnlocked && !check.allowed) ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                                                <span className={`text-xs font-mono font-bold ${(!isUnlocked && !check.allowed) ? 'text-red-500' : 'text-zinc-300'}`}>
                                                    <ResourceSigil kind={implant.cost.resource} size={22} />{implant.cost.amount} <span className="text-[10px] text-zinc-400 ml-1">{RESOURCE_META[implant.cost.resource].label}</span>
                                                </span>
                                            </div>

                                            {!isUnlocked ? (
                                                <Button
                                                    type="primary"
                                                    size="small"
                                                    disabled={!check.allowed}
                                                    onClick={(e) => { e.stopPropagation(); handleUnlock(implant); }}
                                                    className={`
                                                        !min-h-10 !text-xs !border-none !rounded-none
                                                        ${check.allowed
                                                            ? '!bg-imperial-gold !text-black hover:!bg-white shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                                                            : '!bg-zinc-800/50 !text-zinc-600'}
                                                    `}
                                                >
                                                    {check.allowed ? '執行植入' : '資源不足'}
                                                </Button>
                                            ) : (
                                                <span className="text-[10px] text-green-500 font-mono tracking-widest uppercase flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                                    已植入
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Stage Rewards Preview - Only for Surgery Tab */}
                        <div className="mt-8 pt-6 border-t border-zinc-800/50 relative">
                            <div className="absolute top-0 right-0 py-1 px-3 bg-zinc-900 border border-zinc-700 text-[10px] font-mono text-zinc-500 -mt-3">
                                REWARD PROTOCOLS
                            </div>
                            <div className="flex items-center justify-between mb-4 mt-2">
                                <span className="text-imperial-gold/60 text-xs font-mono tracking-[0.2em] uppercase">STAGE STATUS</span>
                                {isStageCompleted && (
                                    <div className="flex items-center gap-2 text-green-400 bg-green-900/20 px-3 py-1 border border-green-500/30 rounded shadow-[0_0_10px_rgba(34,197,94,0.1)]">
                                        <Check size={12} />
                                        <span className="font-mono text-[10px] tracking-widest font-bold">COMPLETED</span>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-4 gap-4">
                                {currentStage.rewardUnits.map(unitId => (
                                    <Tooltip key={unitId} title={UNIT_DETAILS[unitId]?.name || unitId}>
                                        <div className={`
                                            aspect-square border flex flex-col items-center justify-center bg-black/40 group relative overflow-hidden transition-all duration-500
                                            ${isStageCompleted
                                                ? 'border-imperial-gold/60 text-imperial-gold shadow-[0_0_15px_rgba(251,191,36,0.1)]'
                                                : 'border-zinc-800 text-zinc-700 hover:border-zinc-600 hover:text-zinc-500'}
                                        `}>
                                            <div className="absolute inset-0 bg-gradient-to-t from-imperial-gold/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                            <span style={{ color: UNIT_VISUALS[unitId].color }}><UnitEmblem unit={unitId} size={36} /></span>
                                            <span className="text-[11px] text-zinc-300 mt-2">{UNIT_VISUALS[unitId].name}</span>
                                            {isStageCompleted && <div className="absolute bottom-1 w-1 h-1 bg-imperial-gold rounded-full shadow-[0_0_5px_currentColor]" />}
                                        </div>
                                    </Tooltip>
                                ))}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        {/* RITUALS TAB */}
                        <div className="mb-6 p-4 border border-imperial-gold/20 bg-imperial-gold/5 rounded">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-imperial-gold font-mono text-sm tracking-widest">儀式紀錄協議 (RITUAL PROTOCOLS)</span>
                            </div>
                            <p className="text-zinc-400 text-xs font-mono">
                                根據所選活動的基礎難度 (BASE DIFF) 自動計算獲得資源。難度越高，獲得的資源越多。
                                <br />
                                <span className="text-imperial-gold/60 mt-1 block">公式: 基礎難度 x 10 = 獲得資源</span>
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                            {Object.entries(astartes.ritualActivities || RITUAL_ACTIVITIES).map(([category, activities]) => (
                                <div key={category} className="border border-zinc-800 bg-black/40 p-4 rounded relative">
                                    <div className="flex justify-between items-center mb-4 border-b border-zinc-800 pb-2">
                                        <h4 className="text-zinc-400 font-mono text-xs uppercase tracking-[0.2em] m-0">
                                            {category === 'exercise' ? '力量強化協議 (EXERCISE)' :
                                                category === 'learning' ? '智慧啟蒙協議 (LEARNING)' :
                                                    category === 'cleaning' ? '環境淨化協議 (CLEANING)' :
                                                        '基因傳承協議 (PARENTING)'}
                                        </h4>
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={<Plus size={14} />}
                                            onClick={() => setIsAddingToCategory(category as AscensionCategory)}
                                            className="!text-imperial-gold hover:!bg-imperial-gold/10"
                                        >
                                            新增
                                        </Button>
                                    </div>

                                    <RitualGoal category={category as AscensionCategory} />
                                    {/* Inline Add Form */}
                                    {isAddingToCategory === category && (
                                        <div className="mb-4 p-3 border border-dashed border-imperial-gold/30 bg-imperial-gold/5 animate-in slide-in-from-top-2">
                                            <div className="flex gap-2 mb-2">
                                                <Input
                                                    placeholder="儀式名稱"
                                                    size="small"
                                                    value={tempRitualName}
                                                    onChange={e => setTempRitualName(e.target.value)}
                                                    className="!bg-black !border-zinc-700 !text-white !font-mono"
                                                />
                                                <InputNumber
                                                    min={1} max={10}
                                                    size="small"
                                                    value={tempRitualDiff}
                                                    onChange={v => setTempRitualDiff(v || 1)}
                                                    className="!w-24 !bg-black !border-zinc-700 !text-imperial-gold"
                                                />
                                            </div>
                                            <div className="flex justify-end gap-2">
                                                <Button size="small" type="text" onClick={() => setIsAddingToCategory(null)} className="!text-zinc-500">取消</Button>
                                                <Button size="small" type="primary" onClick={() => handleAddActivity(category as AscensionCategory)} className="!bg-imperial-gold !text-black border-none">提交</Button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {activities.map(act => (
                                            <div
                                                key={act.id}
                                                className="ritual-activity relative group border border-zinc-700 bg-zinc-900/50 p-3 hover:border-imperial-gold/50 transition-all"
                                            >
                                                {editingId === act.id ? (
                                                    <div className="animate-in fade-in duration-200">
                                                        <Input
                                                            size="small"
                                                            value={tempRitualName}
                                                            onChange={e => setTempRitualName(e.target.value)}
                                                            className="mb-2 !bg-black !border-imperial-gold/50 !text-white"
                                                        />
                                                        <div className="flex justify-between items-center">
                                                            <InputNumber
                                                                size="small" min={1} max={10}
                                                                value={tempRitualDiff}
                                                                onChange={v => setTempRitualDiff(v || 1)}
                                                                className="!bg-black !border-zinc-700 !text-imperial-gold"
                                                            />
                                                            <div className="flex gap-1">
                                                                <Button icon={<X size={14} />} size="small" type="text" onClick={() => setEditingId(null)} className="!text-zinc-500" />
                                                                <Button icon={<Save size={14} />} size="small" type="text" onClick={() => handleSaveEdit(category as AscensionCategory, act.id)} className="!text-green-500" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => onRitualClick(act)}
                                                            className="w-full text-left"
                                                        >
                                                            <div className="flex justify-between items-center">
                                                                <span className="font-mono text-sm font-bold group-hover:text-imperial-gold transition-colors">{act.name}</span>
                                                                <Activity size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-imperial-gold" />
                                                            </div>
                                                            <span className="text-xs text-zinc-400 font-mono block mt-2">
                                                                難度 {act.baseDifficulty} · <span className="text-imperial-gold ml-1">+{act.baseDifficulty * 10} {RESOURCE_META[RITUAL_RESOURCE[category as AscensionCategory]].label}</span>
                                                            </span>
                                                        </button>

                                                        {/* Management Buttons Overlay - Mobile Friendly */}
                                                        <div className="ritual-activity__actions flex gap-1">
                                                            <Button
                                                                type="text" size="small"
                                                                icon={<Edit2 size={12} />}
                                                                aria-label={`編輯${act.name}`}
                                                                onClick={(e) => { e.stopPropagation(); handleStartEdit(act); }}
                                                                className="!text-imperial-gold/80 md:!text-zinc-500 hover:!text-imperial-gold !p-1 !h-auto"
                                                            />
                                                            <Button
                                                                type="text" size="small"
                                                                icon={<Trash2 size={12} />}
                                                                aria-label={`刪除${act.name}`}
                                                                onClick={(e) => { e.stopPropagation(); handleDelete(category as AscensionCategory, act.id); }}
                                                                className="!text-red-500/80 md:!text-zinc-500 hover:!text-red-500 !p-1 !h-auto"
                                                            />
                                                        </div>

                                                    </>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
};
