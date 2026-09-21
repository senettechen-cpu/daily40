import React from 'react';
import { Skull, ShieldAlert, Zap } from 'lucide-react';
import { Button } from 'antd';

interface WeaponDeckProps {
    selectedTask: any | null; // Replace any with proper type later
    onPurge: () => void;
    onTimerStart: () => void;
}

export const WeaponDeck: React.FC<WeaponDeckProps> = ({ selectedTask, onPurge, onTimerStart }) => {
    if (!selectedTask) {
        return (
            <div className="w-full max-w-4xl bg-zinc-900/80 border-t border-imperial-gold/30 p-4 min-h-[120px] flex items-center justify-center text-imperial-gold/40 font-mono tracking-widest uppercase">
        // 等待目標鎖定 // WAITING FOR TARGET LOCK
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl bg-zinc-900/90 border-t-2 border-imperial-gold p-6 flex items-center justify-between shadow-[0_-5px_20px_rgba(251,191,36,0.1)] relative overflow-hidden">
            {/* 裝飾線條 */}
            <div className="absolute top-0 left-0 w-2 h-full bg-imperial-gold/20" />
            <div className="absolute top-0 right-0 w-2 h-full bg-imperial-gold/20" />

            {/* 左側：目標資訊 */}
            <div className="flex flex-col gap-2 z-10">
                <h3 className="text-imperial-gold text-lg font-bold flex items-center gap-2">
                    <TargetIcon className="animate-spin-slow" />
                    鎖定目標: {selectedTask.title}
                </h3>
                <div className="flex gap-4 text-xs font-mono text-imperial-gold/70">
                    <span className="bg-void-black px-2 py-1 border border-imperial-gold/30 rounded">
                        威脅等級: {selectedTask.size > 5 ? 'EXTREME' : 'MODERATE'}
                    </span>
                    <span className="bg-void-black px-2 py-1 border border-imperial-gold/30 rounded">
                        勢力: {selectedTask.faction.toUpperCase()}
                    </span>
                </div>
            </div>

            {/* 右側：武裝控制 */}
            <div className="flex items-center gap-4 z-10">
                <Button
                    onClick={onTimerStart}
                    className="h-12 px-6 border-2 border-warp-purple text-warp-purple bg-transparent hover:bg-warp-purple/10 font-bold tracking-widest flex items-center gap-2"
                >
                    <Zap size={18} /> 鏈鋸劍 (專注)
                </Button>

                <Button
                    onClick={onPurge}
                    className="h-12 px-8 border-none bg-mechanicus-red hover:!bg-red-600 text-white font-black text-lg tracking-[0.2em] shadow-[0_0_15px_#ef4444] animate-pulse"
                >
                    <Skull size={20} className="mr-2" /> 淨化 PURGE
                </Button>
            </div>
        </div>
    );
};

const TargetIcon = ({ className }: { className?: string }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`w-5 h-5 ${className}`}
    >
        <circle cx="12" cy="12" r="10" />
        <line x1="22" y1="12" x2="18" y2="12" />
        <line x1="6" y1="12" x2="2" y2="12" />
        <line x1="12" y1="6" x2="12" y2="2" />
        <line x1="12" y1="22" x2="12" y2="18" />
    </svg>
);
