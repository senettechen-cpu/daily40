import { useState, useMemo, useEffect } from 'react'
import { ConfigProvider, Input, Typography, theme, Button } from 'antd'
import zhTW from 'antd/locale/zh_TW'
import { Plus, ShoppingCart, AlertTriangle, Map as MapIcon, Radar, Mail, Scroll, Activity, Users } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { RadarView } from './components/RadarView' // Keep old one just in case, or remove
import { OrbitalRadar } from './components/OrbitalRadar'
import { WeaponDeck } from './components/WeaponDeck'
import { UnitShop } from './components/UnitShop'
import { AddTaskModal } from './components/AddTaskModal'
import { VoxLinkModal } from './components/VoxLinkModal'
import { Armory } from './components/Armory'
import { RequisitionForm } from './components/RequisitionForm'
import { NavigationArray } from './components/NavigationArray'
import { SectorMap } from './components/SectorMap'
import TaskDataSlate from './components/TaskDataSlate' // Added
import { AscensionTracker } from './components/astartes/AscensionTracker'
import { GameProvider, useGame } from './contexts/GameContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useAuth } from './contexts/AuthContext'
import { RequisitionProvider, useRequisition } from './contexts/RequisitionContext'
import { AdminDashboard } from './pages/AdminDashboard'
import { useLocalNotifications } from './hooks/useLocalNotifications'
import { LEGACY_PENALTIES_FROZEN } from './game/legacyFreeze'
import './App.css'
import './command-deck.css'
import { ResourceDisplay } from './components/ResourceDisplay'

const { Title, Text } = Typography;

// Main Content Component separate from Provider to use Context
// Login Screen Component
const LoginScreen = ({ mode, onSubmit }: { mode: 'login' | 'setup', onSubmit: (username: string, password: string) => Promise<void> }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSetup = mode === 'setup';

  const handleSubmit = async () => {
    if (!username.trim() || !password) {
      setError('請輸入帳號與密碼');
      return;
    }
    if (isSetup && password.length < 8) {
      setError('密碼至少需要 8 個字元');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSubmit(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
      <div className="scanline" />
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1635322966219-b75ed3a90e27?q=80&w=2000&auto=format&fit=crop')] opacity-20 bg-cover bg-center" />

      <div className="z-10 border border-imperial-gold/30 bg-black/80 p-12 backdrop-blur-md max-w-md w-full text-center shadow-[0_0_50px_rgba(251,191,36,0.1)]">
        <h1 className="text-imperial-gold text-4xl font-mono mb-2 tracking-widest">帝國邏輯引擎</h1>
        <h2 className="text-zinc-500 text-sm tracking-[0.5em] mb-10">
          {isSetup ? '初始化 // 建立指揮官識別' : '機密存取 // 僅限授權人員'}
        </h2>

        <div className="text-left mb-2">
          <label className="text-zinc-500 font-mono text-xs tracking-widest" htmlFor="login-username">識別代號</label>
        </div>
        <Input
          id="login-username"
          size="large"
          value={username}
          autoComplete="username"
          onChange={(e) => setUsername(e.target.value)}
          onPressEnter={handleSubmit}
          className="mb-4 !bg-black !border-imperial-gold/40 !text-imperial-gold font-mono"
        />

        <div className="text-left mb-2">
          <label className="text-zinc-500 font-mono text-xs tracking-widest" htmlFor="login-password">通行密語</label>
        </div>
        <Input.Password
          id="login-password"
          size="large"
          value={password}
          autoComplete={isSetup ? 'new-password' : 'current-password'}
          onChange={(e) => setPassword(e.target.value)}
          onPressEnter={handleSubmit}
          className="mb-6 !bg-black !border-imperial-gold/40 font-mono"
        />

        {error && (
          <div className="mb-4 border border-red-900/60 bg-red-950/40 text-red-400 font-mono text-xs p-3 text-left">
            {error}
          </div>
        )}

        <Button
          type="primary"
          size="large"
          loading={busy}
          onClick={handleSubmit}
          className="w-full !h-14 !bg-imperial-gold !text-black !font-bold !tracking-widest !text-lg hover:!bg-white transition-all flex items-center justify-center gap-2"
        >
          <span className="uppercase">{isSetup ? '建立識別並登入' : '啟動識別協定'}</span>
        </Button>

        <div className="mt-8 text-zinc-600 font-mono text-xs">
          {isSetup ? (
            <p>本系統尚無指揮官。建立後註冊將自動關閉。</p>
          ) : (
            <>
              <p>每日箴言：</p>
              <p>「開放的心靈就像一座大門敞開且無人看守的堡壘。」</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Authenticated Application Wrapper
const AppContent = () => {
  const { user, loading, needsSetup, login, register, logout, getToken } = useAuth();
  const [isMigrating, setIsMigrating] = useState(false);

  // Auto-claim legacy data on login
  useEffect(() => {
    if (user) {
      setIsMigrating(true);
      getToken().then(token => {
        // Normalize URL: Remove trailing /api or / if present to default to base
        const fallbackUrl = import.meta.env.PROD ? window.location.origin : 'http://localhost:3001';
        const rawUrl = import.meta.env.VITE_API_URL || fallbackUrl;
        const baseUrl = rawUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');

        fetch(`${baseUrl}/api/migration/claim`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
          .then(res => {
            if (res.ok) return res.json();
            throw new Error('Migration endpoint error');
          })
          .then(data => {
            if (data.message === 'Legacy data claimed successfully') {
              console.log('Legacy data migration:', data);
              // Reload to fetch fresh data
              window.location.reload();
            } else {
              console.log('No legacy data to claim or already claimed.');
            }
          })
          .catch(err => console.error('Migration check failed (This is expected if no legacy data exists):', err))
          .finally(() => setIsMigrating(false));
      });
    }
  }, [user]);

  const path = window.location.pathname;

  if (path === '/admin') {
    return (
      <GameProvider>
        <AdminDashboard />
      </GameProvider>
    );
  }

  if (loading) {
    return <div className="h-screen bg-black flex items-center justify-center text-imperial-gold font-mono tracking-widest">連線中…</div>;
  }

  if (!user) {
    return <LoginScreen mode={needsSetup ? 'setup' : 'login'} onSubmit={needsSetup ? register : login} />;
  }

  // Only render GameProvider when user is authenticated
  return (
    <RequisitionProvider>
      <GameProvider>
        <MainDashboard currentUser={user} onLogout={logout} />
      </GameProvider>
    </RequisitionProvider>
  );
};

/** Today's committed cores. After 09:00 the count is frozen, so the UI says so. */
const CoreStatus = () => {
  const { core, error, clearError } = useRequisition();
  const count = core.taskIds?.length ?? 0;
  const cap = core.cap ?? 0;
  const locked = core.phase === 'locked';

  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="font-mono text-xs tracking-widest text-imperial-gold/70"
        title={locked ? '已過 09:00，今天的核心數量已鎖定，只能替換未完成的項目' : '09:00 前可自由增減今日核心'}
      >
        今日核心 {count}/{cap || 3}
        {locked && <span className="text-imperial-gold/40"> · 已鎖定</span>}
      </span>
      {error && (
        <button type="button" onClick={clearError} className="font-mono text-[11px] text-red-400 hover:text-red-300">
          {error}（點擊關閉）
        </button>
      )}
    </div>
  );
};

const MainDashboard = ({ currentUser, onLogout }: { currentUser: any, onLogout: () => void }) => {
  const requisition = useRequisition();
  const {
    tasks, ownedUnits, isPenitentMode,
    addTask, updateTask, purgeTask, deleteTask, resetGame, viewMode, allTasks
  } = useGame();

  useLocalNotifications(allTasks);

  // Completing a task may have paid a core, so re-read the balance whenever a
  // task's completion state changes. The signature keeps this off other edits.
  const completionSignature = allTasks.map(t => `${t.id}:${t.status}:${t.lastCompletedAt ?? ''}`).join('|');
  useEffect(() => { void requisition.refresh(); }, [completionSignature, requisition.refresh]);

  // Clock State
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [keyword, setKeyword] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [isArmoryOpen, setIsArmoryOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isVoxLinkOpen, setIsVoxLinkOpen] = useState(false);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [isAscensionOpen, setIsAscensionOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [slateViewMode, setSlateViewMode] = useState<'active' | 'mandates'>('active');
  // Exclusive Modal Logic
  const openLedger = () => {
    setIsLedgerOpen(true);
    setIsArmoryOpen(false);
    setIsVoxLinkOpen(false);
    setIsShopOpen(false);
    setIsAscensionOpen(false);
  };

  const openArmory = () => {
    setIsArmoryOpen(true);
    setIsLedgerOpen(false);
    setIsVoxLinkOpen(false);
    setIsShopOpen(false);
    setIsAscensionOpen(false);
  };

  const openShop = () => {
    setIsShopOpen(true);
    setIsArmoryOpen(false);
    setIsLedgerOpen(false);
    setIsVoxLinkOpen(false);
    setIsAscensionOpen(false);
  };

  const openAscension = () => {
    setIsAscensionOpen(true);
    setIsLedgerOpen(false);
    setIsArmoryOpen(false);
    setIsVoxLinkOpen(false);
    setIsShopOpen(false);
  };

  const currentActiveTasks = slateViewMode === 'mandates' ? allTasks : tasks;
  const selectedTask = useMemo(() => currentActiveTasks.find(t => t.id === selectedTaskId), [selectedTaskId, currentActiveTasks]);

  const handleQuickAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && keyword.trim()) {
      setIsAddModalOpen(true);
    }
  };

  if (isPenitentMode && !LEGACY_PENALTIES_FROZEN) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-red-600 font-mono p-8 animate-pulse relative overflow-hidden">
        <div className="absolute inset-0 bg-red-950/50 z-0 glitch" />
        <h1 className="!text-red-500 text-8xl tracking-widest z-10 glitch-text font-black scale-150 m-0">滅絕令執行中</h1>
        <h3 className="!text-red-500/80 z-10 mb-12 tracking-[0.5em] uppercase m-0">世界已遭淨化</h3>
        <div className="w-full max-w-2xl border-4 border-red-600 p-8 z-10 bg-black/90 text-center">
          <span className="block text-red-500 mb-4 text-center tracking-[0.3em] font-bold text-2xl">失敗即異端</span>
          <span className="text-red-400 font-mono">系統已因腐壞過高而執行滅絕令。</span>
          <span className="text-red-400 font-mono block mt-2">請重啟系統並重新效忠。</span>
        </div>
        <Button danger size="large" className="mt-12 z-10 border-2 border-red-500 bg-red-900/20 hover:bg-red-500 hover:text-black tracking-widest text-xl h-16 px-12 uppercase font-bold" onClick={resetGame}>
          重新初始化邏輯引擎
        </Button>
      </div>
    );
  }

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  };

  return (
    <div className="h-screen bg-black relative flex flex-col items-center overflow-hidden">
      <div className="scanline" />

      <header className="w-full flex flex-col xl:flex-row justify-between items-center p-4 xl:p-6 border-b border-imperial-gold/20 z-10 bg-black/80 backdrop-blur-sm gap-4 xl:gap-0">
        <div className="w-full flex justify-between items-start xl:w-auto xl:flex-col xl:items-start">
          <div className="flex flex-col">
            <span className="text-imperial-gold font-mono tracking-[0.2em] text-[10px] xl:text-xs opacity-60">帝國曆</span>
            <span className="text-imperial-gold font-bold text-lg xl:text-xl tracking-widest font-mono shadow-[0_0_10px_rgba(251,191,36,0.3)]">
              {formatDate(currentTime).split(' ')[0]} <span className="text-xs xl:text-lg">{formatDate(currentTime).split(' ')[1]}</span>
            </span>
          </div>
          <button type="button" className="flex gap-2 xl:hidden" onClick={openArmory} aria-label="開啟軍械庫">
            <ResourceDisplay kind="requisition" value={requisition.balance} compact />
          </button>
        </div>

        <CoreStatus />

        <div className="hidden xl:flex gap-4 items-center">
          <button type="button" onClick={openArmory} aria-label="開啟軍械庫"><ResourceDisplay kind="requisition" value={requisition.balance} /></button>
          {currentUser && (
            <div className="flex gap-2">
              <Button
                ghost
                className="!border-imperial-gold/50 !text-imperial-gold hover:!bg-imperial-gold/20 font-mono"
                icon={<Mail size={16} />}
                onClick={() => setIsVoxLinkOpen(true)}
              >
                通訊鏈路
              </Button>
              <Button
                ghost
                className="!border-[#c5a059]/50 !text-[#c5a059] hover:!bg-[#c5a059]/20 font-mono"
                icon={<Scroll size={16} />}
                onClick={openLedger}
              >
                後勤總表
              </Button>

              <Button
                ghost
                className="!border-imperial-gold/50 !text-imperial-gold hover:!bg-imperial-gold/20 font-mono"
                icon={<Users size={16} />}
                onClick={openShop}
              >
                徵召中心
              </Button>

              <Button
                ghost
                danger
                className="!border-red-900 !text-red-700 hover:!bg-red-900/20 font-mono"
                onClick={(e) => { e.stopPropagation(); onLogout(); }}
              >
                終止連線
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 w-full flex flex-row overflow-hidden relative">
        {viewMode === 'tactical' ? (
          <>
            <div className={`fixed inset-y-0 left-0 z-50 w-[85%] bg-black/95 border-r border-imperial-gold/30 transform transition-transform duration-300 md:relative md:transform-none md:w-1/2 md:flex md:flex-col md:bg-black/40 ${isDrawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} h-[100dvh] md:h-auto flex flex-col`}>
              <div className="md:hidden absolute top-4 right-4 z-50">
                <Button type="text" icon={<MapIcon className="text-imperial-gold" />} onClick={() => setIsDrawerOpen(false)} className="!text-imperial-gold border border-imperial-gold/30" />
              </div>

              <div className="flex-1 overflow-y-auto p-6 pb-32 scrollbar-thin scrollbar-thumb-imperial-gold/20 scrollbar-track-transparent">
                <TaskDataSlate
                  tasks={slateViewMode === 'mandates' ? allTasks.filter(t => t.isRecurring) : tasks}
                  selectedId={selectedTaskId}
                  onSelect={setSelectedTaskId}
                  onPurge={purgeTask}
                  onDelete={deleteTask}
                  onOpenAddModal={() => { setEditingTask(null); setIsAddModalOpen(true); setIsDrawerOpen(false); }}
                  viewMode={slateViewMode}
                  onToggleView={setSlateViewMode}
                  onEdit={(task) => { setEditingTask(task); setIsAddModalOpen(true); setIsDrawerOpen(false); }}
                />
              </div>

              <div className="p-6 border-t border-imperial-gold/10 bg-black/60 backdrop-blur-sm">
                <Input
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  onKeyDown={handleQuickAdd}
                  placeholder="> 輸入任務代碼並按 ENTER 進行部屬..."
                  className="!bg-black/80 !border-imperial-gold/50 !text-imperial-gold font-mono h-12 text-center tracking-wider hover:!border-imperial-gold focus:!border-imperial-gold focus:!shadow-[0_0_15px_#fbbf24]"
                  suffix={<Plus size={16} className="text-imperial-gold/50" />}
                />
              </div>
            </div>

            {isDrawerOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm" onClick={() => setIsDrawerOpen(false)} />}

            <div className="w-full h-full md:w-1/2 relative flex items-center justify-center bg-zinc-900/10">
              <OrbitalRadar tasks={tasks} selectedId={selectedTaskId} onSelectKey={(id) => { setSelectedTaskId(id); setIsDrawerOpen(true); }} />
              <div className="absolute top-4 left-4 z-30 md:hidden">
                <Button onClick={() => setIsDrawerOpen(true)} className="!bg-black/80 !border-imperial-gold/50 !text-imperial-gold !h-12 !w-12 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(251,191,36,0.3)]">
                  <Radar size={24} />
                </Button>
              </div>
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                {ownedUnits.includes('dreadnought') && <div className="absolute top-[20%] right-[20%] text-imperial-gold/20 animate-pulse font-mono">[無畏機甲 DEPLOYED]</div>}
                {ownedUnits.includes('barge') && <div className="absolute top-[10%] text-imperial-gold/10 text-6xl tracking-[1em] w-full text-center font-mono">/// 軌道支援 ///</div>}
              </div>
            </div>
          </>
        ) : (
          <SectorMap />
        )}

        {/* Tactical FAB - Quick Add Task (Mobile Only) */}
        {!isDrawerOpen && (
          <>
            {/* Deploy Task FAB (Right) */}
            <div className="fixed bottom-24 right-6 z-40 md:hidden">
              <Button
                type="primary"
                shape="circle"
                icon={<Plus size={32} />}
                className="!w-16 !h-16 !bg-imperial-gold !text-black !border-none shadow-[0_0_20px_rgba(251,191,36,0.5)] animate-bounce-slow flex items-center justify-center"
                onClick={() => { setEditingTask(null); setIsAddModalOpen(true); }}
              />
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="text-[10px] font-mono text-imperial-gold bg-black/80 px-2 rounded border border-imperial-gold/30">
                  DEPLOY
                </span>
              </div>
            </div>

            {/* Logistics FAB (Left) */}
            <div className="fixed bottom-24 left-6 z-40 md:hidden">
              <Button
                type="default"
                shape="circle"
                icon={<Scroll size={24} />}
                className="!w-12 !h-12 !bg-black/80 !text-[#c5a059] !border-[#c5a059] shadow-[0_0_15px_rgba(197,160,89,0.3)] flex items-center justify-center"
                onClick={openLedger}
              />
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="text-[10px] font-mono text-[#c5a059] bg-black/80 px-2 rounded border border-[#c5a059]/30">
                  LEDGER
                </span>
              </div>
            </div>
          </>
        )}
      </main>

      <NavigationArray onOpenArmory={openArmory} onOpenLedger={openLedger} onOpenAscension={openAscension} />

      <UnitShop visible={isShopOpen} onClose={() => setIsShopOpen(false)} />

      <AddTaskModal
        visible={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setEditingTask(null); setKeyword(''); }}
        onAdd={(title, faction, diff, date, isRec, dueTime, ascCat, subCat) => {
          if (editingTask) { updateTask(editingTask.id, { title, faction, difficulty: diff, dueDate: date, isRecurring: isRec, dueTime, ascensionCategory: ascCat, subCategory: subCat }); }
          else { addTask(title, faction, diff, date, isRec, dueTime, ascCat, subCat); }
        }}
        initialKeyword={keyword}
        initialTask={editingTask}
      />

      <Armory visible={isArmoryOpen} onClose={() => setIsArmoryOpen(false)} />

      <VoxLinkModal visible={isVoxLinkOpen} onClose={() => setIsVoxLinkOpen(false)} />

      <RequisitionForm visible={isLedgerOpen} onClose={() => setIsLedgerOpen(false)} />

      <AscensionTracker visible={isAscensionOpen} onClose={() => setIsAscensionOpen(false)} />
    </div>
  );
}

function App() {
  return (
    <ConfigProvider
      locale={zhTW}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#fbbf24',
          colorBgBase: '#000000',
        },
      }}
    >
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </ConfigProvider>
  )
}

export default App
