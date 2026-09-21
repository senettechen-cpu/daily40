import React from 'react';
import { useGame } from '../contexts/GameContext';
import { Radar, Map, ShoppingCart, Scroll, Activity } from 'lucide-react';

interface NavigationArrayProps {
    onOpenArmory: () => void;
    onOpenLedger: () => void;
    onOpenAscension: () => void;
}

export const NavigationArray: React.FC<NavigationArrayProps> = ({ onOpenArmory, onOpenLedger, onOpenAscension }) => {
    const { viewMode, setViewMode, resources, exportSTC, importSTC } = useGame();
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            if (content) importSTC(content);
        };
        reader.readAsText(file);
        // Reset
        if (event.target) event.target.value = '';
    };

    return (
        <div className="w-full h-[60px] bg-black border-t border-imperial-gold flex items-center justify-between px-4 md:px-8 z-50 relative overflow-x-auto overflow-y-hidden scrollbar-hide">
            {/* Background Mesh */}
            <div className="absolute inset-0 opacity-10 pointer-events-none"
                style={{ backgroundImage: 'radial-gradient(#fbbf24 1px, transparent 1px)', backgroundSize: '4px 4px' }}
            />

            <div className="flex gap-4 h-full items-center shrink-0">
                {/* Logistics Toggle (Far Left) */}
                <button
                    onClick={onOpenLedger}
                    className="h-10 px-4 md:px-6 flex items-center gap-2 font-mono tracking-widest text-xs border border-zinc-800 bg-black text-[#c5a059] hover:bg-[#c5a059] hover:text-black transition-all shrink-0"
                >
                    <Scroll size={16} />
                    <span>後勤</span>
                </button>

                {/* Ascension Toggle */}
                <button
                    onClick={onOpenAscension}
                    className="h-10 px-4 md:px-6 flex items-center gap-2 font-mono tracking-widest text-xs border border-zinc-800 bg-black text-emerald-500 hover:bg-emerald-500 hover:text-black transition-all shrink-0"
                >
                    <Activity size={16} />
                    <span>改造計畫</span>
                </button>

                {/* Tactical View Toggle */}
                <button
                    onClick={() => setViewMode('tactical')}
                    className={`
                        h-10 px-6 flex items-center gap-2 font-mono tracking-widest text-xs border transition-all duration-300
                        ${viewMode === 'tactical'
                            ? 'border-imperial-gold bg-imperial-gold/20 text-imperial-gold shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                            : 'border-zinc-800 bg-black text-zinc-500 hover:border-imperial-gold/50 hover:text-imperial-gold/70'}
                    `}
                >
                    <Radar size={16} />
                    <span>戰術視圖</span>
                </button>

                {/* STC Operations */}
                <div className="h-6 w-px bg-zinc-800 mx-2" />

                <button
                    onClick={exportSTC}
                    className="h-8 px-4 flex items-center gap-2 font-mono text-[10px] tracking-wider border border-zinc-700 text-zinc-400 hover:text-green-400 hover:border-green-500 transition-colors"
                >
                    EXPORT STC
                </button>

                <button
                    onClick={handleImportClick}
                    className="h-8 px-4 flex items-center gap-2 font-mono text-[10px] tracking-wider border border-zinc-700 text-zinc-400 hover:text-blue-400 hover:border-blue-500 transition-colors"
                >
                    IMPORT STC
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".json"
                    className="hidden"
                />
            </div>

            <div className="flex gap-2 items-center shrink-0">
                {/* Strategic View Toggle (Moved to Right) */}
                <button
                    onClick={() => setViewMode('strategic')}
                    className={`
                        h-10 px-6 flex items-center gap-2 font-mono tracking-widest text-xs border transition-all duration-300
                        ${viewMode === 'strategic'
                            ? 'border-imperial-gold bg-imperial-gold/20 text-imperial-gold shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                            : 'border-zinc-800 bg-black text-zinc-500 hover:border-imperial-gold/50 hover:text-imperial-gold/70'}
                    `}
                >
                    <Map size={16} />
                    <span>戰略地圖</span>
                </button>

                {/* Armory Toggle */}
                <button
                    onClick={onOpenArmory}
                    className="h-10 px-4 md:px-6 flex items-center gap-2 font-mono tracking-widest text-xs border border-zinc-800 bg-black text-imperial-gold hover:bg-imperial-gold hover:text-black transition-all shrink-0"
                >
                    <ShoppingCart size={16} />
                    <span>軍械庫</span>
                </button>
            </div>
        </div>
    );
};
