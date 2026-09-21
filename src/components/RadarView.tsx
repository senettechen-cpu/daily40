import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Task } from '../types';

// 定義敵軍勢力與顏色對應
const FACTION_COLORS = {
    nurgle: '#10b981',   // 納垢綠
    khorne: '#ef4444',   // 恐虐紅
    tzeentch: '#a855f7', // 奸奇紫/藍
    slaanesh: '#ec4899', // 色孽粉
    orks: '#f97316',     // 獸人橘
    necrons: '#94a3b8',  // 死靈銀
    default: '#fbbf24',  // 帝國金
};

interface RadarViewProps {
    tasks: Task[];
    onSelectKey: (id: string) => void;
    selectedId: string | null;
}

export const RadarView: React.FC<RadarViewProps> = ({ tasks, onSelectKey, selectedId }) => {
    // 將 Tasks 轉換為 Radar Blips
    const blips = useMemo(() => {
        return tasks.map(task => {
            // 1. 計算距離 (Distance)
            // 截止時間越近，距離越近 (0 = 現在, 100 = 24hr+)
            const now = new Date().getTime();
            const due = new Date(task.dueDate).getTime();
            const hoursRemaining = (due - now) / (1000 * 60 * 60);

            // 映射：0hr -> 10, 24hr -> 90, Overdue -> 5
            let distance = 50;
            if (hoursRemaining <= 0) distance = 5; // Overdue
            else if (hoursRemaining < 1) distance = 15;
            else if (hoursRemaining < 24) distance = 20 + (hoursRemaining / 24) * 70;
            else distance = 95;

            // 2. 計算角度 (Angle)
            // 根據勢力分配角度區間，避免重疊太嚴重加一點隨機
            let baseAngle = 0;
            switch (task.faction) {
                case 'nurgle': baseAngle = 0; break;   // 右
                case 'khorne': baseAngle = 90; break;  // 下
                case 'tzeentch': baseAngle = 180; break; // 左
                case 'orks': baseAngle = 270; break;   // 上
                default: baseAngle = 45; break;
            }
            // 加入 +/- 30 度的隨機偏移
            const angle = baseAngle + (Math.random() * 60 - 30);

            return {
                ...task,
                radarDistance: distance,
                radarAngle: angle
            };
        });
    }, [tasks]);

    return (
        <div className="relative w-[600px] h-[600px] flex items-center justify-center">
            {/* 掃描線效果 (SVG Overlay) */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30 animate-spin-slow" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="49" stroke="#fbbf24" strokeWidth="0.5" fill="none" />
                <circle cx="50" cy="50" r="35" stroke="#fbbf24" strokeWidth="0.2" fill="none" opacity="0.5" />
                <circle cx="50" cy="50" r="20" stroke="#fbbf24" strokeWidth="0.2" fill="none" opacity="0.3" />
                <line x1="50" y1="50" x2="50" y2="0" stroke="#fbbf24" strokeWidth="1" className="radar-sweep" />
            </svg>

            {/* 靜態背景十字準星 */}
            <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                <div className="w-full h-[1px] bg-imperial-gold" />
                <div className="h-full w-[1px] bg-imperial-gold absolute" />
            </div>

            {/* 泰拉 (中心) */}
            <div className="absolute z-10 flex flex-col items-center justify-center">
                <div className="w-4 h-4 bg-imperial-gold rounded-full shadow-[0_0_15px_#fbbf24] animate-pulse" />
                <span className="text-[10px] text-imperial-gold mt-1 tracking-widest font-mono">TERRA</span>
            </div>

            {/* 任務光點 (Blips) */}
            {blips.map((blip) => {
                const radius = (blip.radarDistance / 100) * 280;
                const x = Math.cos((blip.radarAngle * Math.PI) / 180) * radius;
                const y = Math.sin((blip.radarAngle * Math.PI) / 180) * radius;

                const color = FACTION_COLORS[blip.faction as keyof typeof FACTION_COLORS] || FACTION_COLORS.default;
                const isSelected = selectedId === blip.id;

                // Urgency Calculation
                const now = new Date().getTime();
                const due = new Date(blip.dueDate).getTime();
                const minutesRemaining = (due - now) / (1000 * 60);

                // Animation Logic
                let animationClass = '';
                if (minutesRemaining < 0) animationClass = 'animate-ping'; // Overdue: Fast Ping
                else if (minutesRemaining < 60) animationClass = 'animate-pulse'; // < 1h: Pulse

                // Size Logic: Base 12px + Difficulty * 4
                const size = 12 + (blip.difficulty * 4);

                return (
                    <div className="absolute" style={{ x, y, width: 0, height: 0 }}>
                        <motion.button
                            key={blip.id}
                            className={`absolute flex items-center justify-center rounded-full transition-all duration-300 hover:scale-125 focus:outline-none z-20 -translate-x-1/2 -translate-y-1/2`}
                            style={{
                                width: `${size}px`,
                                height: `${size}px`,
                                backgroundColor: color,
                                boxShadow: `0 0 ${isSelected ? '20px' : '10px'} ${color}`,
                                border: isSelected ? '1px solid white' : 'none'
                            }}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            onClick={() => onSelectKey(blip.id)}
                            whileHover={{ scale: 1.2 }}
                        >
                            {/* Animation Layer */}
                            {(minutesRemaining < 60) && (
                                <div className={`absolute -inset-1 rounded-full bg-inherit opacity-50 ${animationClass}`} />
                            )}

                            {isSelected && (
                                <div className="absolute -inset-4 border border-white/50 rounded-full animate-ping opacity-30" />
                            )}
                        </motion.button>

                        {/* Title Label - Positioned Above Center */}
                        <div
                            className={`absolute -top-1 left-0 -translate-x-1/2 -translate-y-full pointer-events-none whitespace-nowrap font-mono text-[10px] tracking-tight transition-all duration-300 ${isSelected ? 'text-white opacity-100 scale-110' : 'text-imperial-gold opacity-90'}`}
                            style={{
                                textShadow: '1px 1px 3px black',
                                filter: isSelected ? 'drop-shadow(0 0 5px white)' : 'none'
                            }}
                        >
                            <span className="bg-black/80 px-1.5 py-0.5 rounded border border-imperial-gold/40 uppercase font-bold shadow-2xl backdrop-blur-xs">
                                {blip.title}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
