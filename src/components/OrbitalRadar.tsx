import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Button, Tooltip } from 'antd';
import { Radar } from 'lucide-react';
import { Task } from '../types';
import { useGame } from '../contexts/GameContext';

// 配置：勢力顏色
const FACTION_COLORS = {
    nurgle: '#10b981',   // 納垢綠
    khorne: '#ef4444',   // 恐虐紅 (修正為紅)
    tzeentch: '#3b82f6', // 奸奇藍 (修正為藍)
    slaanesh: '#ec4899', // 色孽粉
    orks: '#f97316',     // 獸人橘
    necrons: '#94a3b8',  // 死靈銀
    default: '#fbbf24',  // 帝國金
};

interface OrbitalRadarProps {
    tasks: Task[];
    onSelectKey: (id: string) => void;
    selectedId: string | null;
}

export const OrbitalRadar: React.FC<OrbitalRadarProps> = ({ tasks, onSelectKey, selectedId }) => {
    const { radarTheme, activeTacticalScan, activateTacticalScan, resources } = useGame();

    // Theme Colors
    const themeColor = useMemo(() => {
        switch (radarTheme) {
            case 'red': return { primary: '#ef4444', dark: '#7f1d1d', bg: 'rgba(239, 68, 68, 0.2)' };
            case 'gold': return { primary: '#fbbf24', dark: '#78350f', bg: 'rgba(251, 191, 36, 0.2)' };
            default: return { primary: '#10b981', dark: '#064e3b', bg: 'rgba(16, 185, 129, 0.2)' }; // green
        }
    }, [radarTheme]);

    // 核心計算：將 Task 轉換為雷達上的座標
    const blips = useMemo(() => {
        return tasks.filter(t => !t.isRecurring).map(task => {
            // 1. 計算距離 (Distance from Center)
            const now = new Date().getTime();
            const due = new Date(task.dueDate).getTime();
            const hoursRemaining = (due - now) / (1000 * 60 * 60);

            // 邏輯：越近越急 (r 越小)
            // 過期: r=5-10%, <1hr: r=15%, <24hr: spread 20-80%, >24hr: 90%
            let distance = 82; // Clamped from 90 to prevent overflow
            if (hoursRemaining <= 0) distance = Math.random() * 5 + 5;
            else if (hoursRemaining < 1) distance = 15;
            else if (hoursRemaining < 24) distance = 20 + (hoursRemaining / 24) * 55; // Max ~75
            else distance = 82;

            // 2. 計算角度 (Angle) - 分散避免重疊 + 勢力分區
            // 為了視覺混亂美學，我們主要使用 hash 或隨機分佈，但稍微群聚
            // 這裡採用隨機角度，模擬真實雷達的散亂感
            // 也可以選擇根據 Faction 分區：Nurgle(0-90), Khorne(90-180)... 但全域掃描更有趣
            const angle = Math.random() * 360;

            return {
                ...task,
                r: distance, //半徑百分比 0-100
                theta: angle, // 角度 0-360
            };
        });
    }, [tasks]);

    return (
        <div className="relative w-[300px] h-[300px] md:w-[500px] md:h-[500px] flex items-center justify-center select-none">

            {/* 1. CRT 螢幕容器 & 掃描線動畫 */}
            <div
                className="absolute inset-0 rounded-full border-4 bg-black overflow-hidden shadow-[0_0_50px_currentColor]"
                style={{ borderColor: themeColor.dark, color: themeColor.bg }}
            >

                {/* 背景網格 (SVG) */}
                <svg className="absolute inset-0 w-full h-full opacity-40 pointer-events-none" viewBox="0 0 100 100">
                    {/* 同心圓 */}
                    <circle cx="50" cy="50" r="48" stroke={themeColor.dark} strokeWidth="0.5" fill="none" />
                    <circle cx="50" cy="50" r="38" stroke={themeColor.dark} strokeWidth="0.5" fill="none" />
                    <circle cx="50" cy="50" r="28" stroke={themeColor.dark} strokeWidth="0.5" fill="none" />
                    <circle cx="50" cy="50" r="18" stroke={themeColor.dark} strokeWidth="0.5" fill="none" />
                    <circle cx="50" cy="50" r="8" stroke={themeColor.primary} strokeWidth="0.5" fill="none" opacity="0.8" />

                    {/* 十字軸 */}
                    <line x1="50" y1="0" x2="50" y2="100" stroke={themeColor.dark} strokeWidth="0.5" />
                    <line x1="0" y1="50" x2="100" y2="50" stroke={themeColor.dark} strokeWidth="0.5" />
                </svg>

                {/* 掃描光束 (Radar Sweep) - CSS Animation */}
                <div
                    className="absolute top-0 left-0 w-full h-full origin-center pointer-events-none"
                    style={{
                        background: `conic-gradient(from 0deg, transparent 0deg, transparent 270deg, ${themeColor.bg} 360deg)`,
                        animation: 'radar-spin 4s linear infinite',
                    }}
                />

                {/* 泰拉核心 (Center) */}
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full shadow-[0_0_10px_currentColor]"
                    style={{ backgroundColor: themeColor.primary, color: themeColor.primary }}
                />

                {/* 任務光點 (Blips) */}
                {blips.map((blip: any) => {
                    // 將極座標轉回 % 座標 (center is 50, 50)
                    const rPercent = blip.r / 2; // 0-50
                    const rad = (blip.theta * Math.PI) / 180;
                    const x = 50 + rPercent * Math.cos(rad);
                    const y = 50 + rPercent * Math.sin(rad);

                    const color = FACTION_COLORS[blip.faction as keyof typeof FACTION_COLORS] || FACTION_COLORS.default;
                    const isSelected = selectedId === blip.id;
                    const isOverdue = new Date().getTime() > new Date(blip.dueDate).getTime();

                    // Urgency Calculation
                    const now = new Date().getTime();
                    const due = new Date(blip.dueDate).getTime();
                    const minutesRemaining = (due - now) / (1000 * 60);

                    // Animation Logic
                    let animationClass = '';
                    if (isOverdue || minutesRemaining < 0) animationClass = 'animate-ping'; // Overdue: Fast Ping
                    else if (minutesRemaining < 30) animationClass = 'animate-ping'; // < 30m: Fast Ping (High Urgency)
                    else if (minutesRemaining < 60) animationClass = 'animate-pulse'; // < 1h: Pulse

                    // Size Logic: Base 14px + Difficulty * 6 (More obvious)
                    // Regular size logic
                    const sizeVal = 14 + (blip.difficulty * 6);
                    // Overdue scales up
                    const scale = isOverdue ? 1.3 : 1;

                    return (
                        <button
                            key={blip.id}
                            className={`absolute -ml-1.5 -mt-1.5 rounded-full z-20 cursor-pointer focus:outline-none group transition-all duration-300 flex items-center justify-center`}
                            style={{
                                left: `${x}%`,
                                top: `${y}%`,
                                width: `${sizeVal}px`,
                                height: `${sizeVal}px`,
                                transform: `translate(-50%, -50%) scale(${scale})`, // Centering correction
                                backgroundColor: isOverdue ? '#ef4444' : color,
                                boxShadow: isSelected ? `0 0 15px 2px ${color}` : `0 0 5px ${color}`,
                                border: isSelected ? '2px solid white' : `1px solid black`,
                                opacity: isSelected ? 1 : 0.9
                            }}
                            onClick={() => onSelectKey(blip.id)}
                        >
                            {/* Urgency Animation Layer */}
                            {(minutesRemaining < 60 || isOverdue) && (
                                <div className={`absolute -inset-1 rounded-full bg-inherit opacity-60 ${animationClass}`} />
                            )}

                            {/* Overdue Marker (Keep existing logic or merge?) */}
                            {isOverdue && (
                                <span className="absolute -inset-4 border border-red-500/50 rounded-full animate-ping pointer-events-none block" />
                            )}

                            {/* Title Label - Persistently Visible */}
                            <div
                                className={`absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none whitespace-nowrap font-mono text-[10px] tracking-tight transition-all duration-300 ${isSelected ? 'text-white opacity-100 scale-110' : 'text-imperial-gold opacity-100'}`}
                                style={{
                                    textShadow: '2px 2px 4px black',
                                    filter: isSelected ? 'drop-shadow(0 0-8px white)' : 'none'
                                }}
                            >
                                <span className="bg-black/90 px-2 py-0.5 rounded border border-imperial-gold/60 uppercase font-black shadow-2xl backdrop-blur-sm">
                                    {isOverdue ? `[!!] ${blip.title}` : blip.title}
                                </span>
                            </div>
                        </button>
                    )
                })}
            </div>

            {/* 裝飾框 (Bezel) */}
            <div className="absolute inset-0 rounded-full border-[20px] border-zinc-900 pointer-events-none shadow-[inset_0_0_20px_black]" />

            {/* 全域樣式注入 (For Animation) */}
            <style>{`
        @keyframes radar-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

            {/* Tactical Scan Button */}
            <div className="absolute bottom-4 right-4 z-30">
                <Tooltip title={activeTacticalScan ? "戰術掃描已啟動 (下個困難任務 RP x2)" : "啟動戰術掃描 (15 RP) - 獲得任務情報優勢"}>
                    <Button
                        type="primary"
                        shape="circle"
                        icon={<Radar size={20} className={activeTacticalScan ? "animate-spin-slow" : ""} />}
                        size="large"
                        className={`!border-none shadow-[0_0_15px_currentColor] transition-all duration-500
                            ${activeTacticalScan
                                ? '!bg-green-600 !text-white !shadow-[0_0_25px_#10b981]'
                                : '!bg-zinc-900/80 !text-imperial-gold hover:!bg-imperial-gold hover:!text-black'
                            }
                        `}
                        disabled={!activeTacticalScan && resources.rp < 15}
                        onClick={activateTacticalScan}
                    />
                </Tooltip>
            </div>
        </div>
    );
};
