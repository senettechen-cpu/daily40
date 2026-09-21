
import React, { useState, useEffect, useMemo } from 'react';
import { Button, Input, Select, List, Empty } from 'antd';
import { Trash2, PieChart, AlertTriangle, FileText, BarChart3, Calendar, List as ListIcon, X } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Expense, ExpenseCategory, PaymentMethod } from '../types/ledger';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../constants/ledger';
import { useAuth } from '../contexts/AuthContext';
import { useGame } from '../contexts/GameContext';
import dayjs from 'dayjs';

interface RequisitionFormProps {
    visible: boolean;
    onClose: () => void;
}

type StatsViewMode = 'list' | 'category' | 'date';

export const RequisitionForm: React.FC<RequisitionFormProps> = ({ visible, onClose }) => {
    // Auth
    const { getToken } = useAuth();
    const { modifyResources } = useGame();

    // Form State
    const [date, setDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
    const [category, setCategory] = useState<ExpenseCategory>("飲食");
    const [itemName, setItemName] = useState<string>('');
    const [amount, setAmount] = useState<number>(0);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");

    // View State
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [activeMobileTab, setActiveMobileTab] = useState<'input' | 'stats'>('input');
    const [statsViewMode, setStatsViewMode] = useState<StatsViewMode>('list');

    // Responsive Check
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Load Data
    const loadExpenses = async () => {
        const token = await getToken();
        if (token) {
            import('../services/api').then(m => m.api.getExpenses(token))
                .then(data => setExpenses(data))
                .catch(err => console.error("Failed to load expenses:", err));
        }
    };

    useEffect(() => {
        if (visible) loadExpenses();
    }, [visible]);

    // Helpers
    const getImperialDate = (dateStr: string) => {
        return dayjs(dateStr).format('YYYY-MM-DD');
    };

    const getIcon = (iconName: string) => {
        const IconComponent = (LucideIcons as any)[iconName];
        return IconComponent ? <IconComponent size={16} /> : <LucideIcons.Box size={16} />;
    };

    // Calculate Summary
    const totalCost = expenses.reduce((sum, item) => sum + item.amount, 0);
    const moraleCost = expenses
        .filter(e => e.category === "娛樂")
        .reduce((sum, item) => sum + item.amount, 0);

    const moralePercentage = totalCost > 0 ? (moraleCost / totalCost) * 100 : 0;
    const isSlaaneshCorrupted = moralePercentage > 30;


    interface GroupedExpense {
        id: string;
        label: string;
        amount: number;
        count: number;
        items: Expense[];
    }

    // Aggregated Data
    const groupedExpenses = useMemo<GroupedExpense[]>(() => {
        if (statsViewMode === 'list') return [];

        const groups: Record<string, GroupedExpense> = {};

        expenses.forEach(item => {
            const key = statsViewMode === 'category' ? item.category : new Date(item.date).toISOString().split('T')[0];
            const label = statsViewMode === 'category' ? EXPENSE_CATEGORIES[item.category as ExpenseCategory]?.label || key : key;

            if (!groups[key]) {
                groups[key] = {
                    id: key,
                    label: label,
                    amount: 0,
                    count: 0,
                    items: []
                };
            }
            groups[key].amount += item.amount;
            groups[key].count += 1;
            groups[key].items.push(item);
        });

        return Object.values(groups).sort((a, b) => b.amount - a.amount);
    }, [expenses, statsViewMode]);



    // Handlers
    const handleSubmit = async () => {
        if (!itemName || amount <= 0) return;
        console.log("Submitting Requisition...");

        const newExpense: Expense = {
            id: Date.now().toString(),
            date: new Date(date),
            category,
            itemName,
            amount,
            paymentMethod
        };

        try {
            const token = await getToken();
            if (!token) throw new Error("Offline");

            await import('../services/api').then(m => m.api.addExpense(newExpense, token));
            console.log("Expense API success. Updating resources...");
            modifyResources(0, 50, "Requisition Filed");
            console.log("Resources updated locally.");

            // Play Sound
            const audio = new Audio('/sounds/deploy.mp3');
            audio.play().catch(() => { });

            loadExpenses();
            setItemName('');
            setAmount(0);

            // Simple Feedback
            console.log("Expense Added");
        } catch (e) {
            console.error("Requisition Failed:", e);
            alert("Requisition Failed: " + e); // Explicit feedback
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const token = await getToken();
            if (!token) return;
            await import('../services/api').then(m => m.api.deleteExpense(id, token));
            setExpenses(prev => prev.filter(e => e.id !== id));
        } catch (e) {
            console.error("Delete failed", e);
        }
    };

    const handleExportCSV = () => {
        if (expenses.length === 0) return;

        // Add BOM for Excel UTF-8
        const BOM = '\uFEFF';
        const headers = '日期,類別,項目名稱,金額,付款方式\n';

        const rows = expenses.map(e => {
            const dateStr = dayjs(e.date).format('YYYY-MM-DD');
            const category = EXPENSE_CATEGORIES[e.category as ExpenseCategory]?.label || e.category;
            const itemName = `"${e.itemName.replace(/"/g, '""')}"`; // Escape quotes
            const amount = e.amount;
            const payment = PAYMENT_METHODS[e.paymentMethod] || e.paymentMethod;
            return `${dateStr},${category},${itemName},${amount},${payment}`;
        }).join('\n');

        const blob = new Blob([BOM + headers + rows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `imperial_ledger_${dayjs().format('YYYY-MM')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleArchive = async () => {
        if (!window.confirm("確定要結算並封存目前的紀錄嗎？(資料將會從列表清除，但保留在後端資料庫中以供調閱)")) return;
        try {
            const token = await getToken();
            if (!token) return;
            await import('../services/api').then(m => m.api.archiveExpenses(token));
            setExpenses([]);
        } catch (e) {
            console.error("Archive failed", e);
            alert("封存失敗");
        }
    };

    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-50 bg-[#0a0f0d] text-[#33ff00] font-mono flex flex-col overflow-hidden animate-in fade-in duration-200">
            {/* Background Effects */}
            <div className="absolute inset-0 pointer-events-none z-0 mix-blend-overlay opacity-20"
                style={{
                    backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))',
                    backgroundSize: '100% 2px, 3px 100%'
                }}
            />

            {/* Header */}
            <header className="flex-none h-16 border-b border-[#c5a059] flex items-center justify-between px-6 bg-[#0a0f0d] z-10">
                <div className="flex items-center gap-3">
                    <PieChart className="text-[#c5a059]" />
                    <h1 className="text-xl md:text-2xl font-bold tracking-widest text-[#33ff00] m-0">帝國後勤總帳 (IMPERIAL LEDGER)</h1>
                </div>
                <div className="flex items-center gap-4">
                    <div className="hidden md:flex flex-col items-end mr-8">
                        <span className="text-[#c5a059] text-xs uppercase tracking-widest">Total Consumption</span>
                        <span className={`text-2xl font-bold font-mono ${isSlaaneshCorrupted ? 'text-red-500 animate-pulse' : 'text-[#33ff00]'}`}>
                            ₮ {totalCost.toLocaleString()}
                        </span>
                    </div>
                    <Button
                        type="text"
                        icon={<X size={32} />}
                        onClick={onClose}
                        className="!text-[#c5a059] hover:!text-[#33ff00] hover:!bg-[#33ff00]/10"
                    />
                </div>
            </header>

            {/* Mobile Tabs */}
            <div className="md:hidden flex border-b border-[#c5a059]/30 bg-[#0a0f0d] z-10">
                <button
                    onClick={() => setActiveMobileTab('input')}
                    className={`flex-1 py-3 text-center tracking-widest transition-colors ${activeMobileTab === 'input' ? 'bg-[#c5a059]/20 text-[#33ff00] border-b-2 border-[#33ff00]' : 'text-[#c5a059]'}`}
                >
                    <div className="flex items-center justify-center gap-2">
                        <FileText size={16} />
                        輸入儀表
                    </div>
                </button>
                <button
                    onClick={() => setActiveMobileTab('stats')}
                    className={`flex-1 py-3 text-center tracking-widest transition-colors ${activeMobileTab === 'stats' ? 'bg-[#c5a059]/20 text-[#33ff00] border-b-2 border-[#33ff00]' : 'text-[#c5a059]'}`}
                >
                    <div className="flex items-center justify-center gap-2">
                        <BarChart3 size={16} />
                        後勤統計
                    </div>
                </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden relative z-0">

                {/* Left Panel: Input Form */}
                <div className={`${(isMobile && activeMobileTab !== 'input') ? 'hidden' : 'flex'} w-full md:w-1/3 border-r border-[#c5a059]/30 flex-col bg-[#0a0f0d] p-6 overflow-y-auto`}>

                    {/* Mobile Summary */}
                    <div className="md:hidden mb-6 p-4 border border-[#c5a059] bg-[#33ff00]/5">
                        <span className="block text-[#c5a059] text-xs tracking-widest mb-1 uppercase">Total Resource Consumption</span>
                        <span className={`text-3xl font-mono font-bold ${isSlaaneshCorrupted ? 'text-red-500' : 'text-[#33ff00]'}`}>
                            ₮ {totalCost.toLocaleString()}
                        </span>
                        {isSlaaneshCorrupted &&
                            <div className="flex items-center gap-1 text-red-500 mt-1 animate-pulse">
                                <AlertTriangle size={14} /> <span className="text-xs">HERESY DETECTED</span>
                            </div>
                        }
                    </div>

                    <div className="flex flex-col gap-6 max-w-lg mx-auto w-full">
                        <h2 className="text-[#c5a059] border-b border-[#c5a059]/30 pb-2 mb-0 tracking-widest text-lg flex items-center gap-2">
                            <FileText size={18} /> REQUISITION PROTOCOL
                        </h2>

                        {/* Date */}
                        <div className="space-y-1">
                            <label className="text-[#33ff00]/60 text-xs uppercase">Date Request</label>
                            <Input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="!bg-black !text-[#33ff00] !border-[#c5a059]/50 font-mono h-12 text-lg"
                            />
                        </div>

                        {/* Category */}
                        <div className="space-y-1">
                            <label className="text-[#33ff00]/60 text-xs uppercase">Category Class</label>
                            <Select
                                value={category}
                                onChange={setCategory}
                                className="w-full imperial-select h-12"
                                options={Object.entries(EXPENSE_CATEGORIES).map(([key, detail]) => ({
                                    label: (
                                        <div className="flex items-center gap-2 text-[#33ff00]">
                                            {getIcon(detail.icon)}
                                            <span>{detail.label}</span>
                                        </div>
                                    ),
                                    value: key
                                }))}
                                popupClassName="!bg-[#0a0f0d] !border !border-[#c5a059]"
                            />
                        </div>

                        {/* Item Name */}
                        <div className="space-y-1">
                            <label className="text-[#33ff00]/60 text-xs uppercase">Manifest Detail</label>
                            <Input
                                placeholder="項目名稱..."
                                value={itemName}
                                onChange={e => setItemName(e.target.value)}
                                className="!bg-black !text-[#33ff00] !border-[#c5a059]/50 font-mono placeholder:!text-[#33ff00]/30 h-12"
                            />
                        </div>

                        {/* Amount */}
                        <div className="space-y-1">
                            <label className="text-[#33ff00]/60 text-xs uppercase">Cost Allocation</label>
                            <Input
                                type="number"
                                inputMode="decimal"
                                value={amount}
                                onFocus={(e) => e.target.select()}
                                onChange={e => setAmount(Number(e.target.value))}
                                prefix={<span className="text-[#c5a059] mr-2">₮</span>}
                                className="!bg-black !text-[#33ff00] !border-[#c5a059]/50 font-mono text-2xl h-14"
                            />
                        </div>

                        {/* Payment */}
                        <div className="space-y-1">
                            <label className="text-[#33ff00]/60 text-xs uppercase">Payment Vector</label>
                            <Select
                                value={paymentMethod}
                                onChange={setPaymentMethod}
                                className="w-full imperial-select h-12"
                                options={Object.entries(PAYMENT_METHODS).map(([key, label]) => ({
                                    label: <span className="text-[#33ff00]">{label}</span>,
                                    value: key
                                }))}
                            />
                        </div>

                        {/* Submit */}
                        <Button
                            onClick={handleSubmit}
                            className="mt-4 !bg-[#c5a059] !text-black !border-[#c5a059] font-mono font-bold tracking-widest hover:!bg-[#e6c278] hover:!text-black h-14 text-lg w-full shadow-[0_0_15px_rgba(197,160,89,0.3)]"
                        >
                            批准徵用 (AUTHORIZE)
                        </Button>
                    </div>
                </div>

                {/* Right Panel: Statistics & List */}
                <div className={`${(isMobile && activeMobileTab !== 'stats') ? 'hidden' : 'flex'} w-full md:w-2/3 flex-col bg-[#0a0f0d] relative`}>

                    {/* Toolbar */}
                    <div className="flex-none p-4 border-b border-[#c5a059]/30 flex flex-wrap gap-4 items-center justify-between bg-[#0a0f0d]/50 backdrop-blur-sm">
                        <div className="flex gap-2">
                            <Button
                                type={statsViewMode === 'list' ? 'primary' : 'default'}
                                onClick={() => setStatsViewMode('list')}
                                className={statsViewMode === 'list' ? '!bg-[#c5a059] !text-black' : '!bg-transparent !text-[#c5a059] !border-[#c5a059]'}
                                icon={<ListIcon size={16} />}
                            >
                                清單
                            </Button>
                            <Button
                                type={statsViewMode === 'category' ? 'primary' : 'default'}
                                onClick={() => setStatsViewMode('category')}
                                className={statsViewMode === 'category' ? '!bg-[#c5a059] !text-black' : '!bg-transparent !text-[#c5a059] !border-[#c5a059]'}
                                icon={<PieChart size={16} />}
                            >
                                分類
                            </Button>
                            <Button
                                type={statsViewMode === 'date' ? 'primary' : 'default'}
                                onClick={() => setStatsViewMode('date')}
                                className={statsViewMode === 'date' ? '!bg-[#c5a059] !text-black' : '!bg-transparent !text-[#c5a059] !border-[#c5a059]'}
                                icon={<Calendar size={16} />}
                            >
                                日期
                            </Button>
                        </div>
                        <div className="flex gap-2 items-center">
                            <Button
                                size="small"
                                className="!bg-[#c5a059]/20 !text-[#c5a059] !border-[#c5a059] hover:!bg-[#c5a059]/40"
                                icon={<FileText size={14} />}
                                onClick={handleExportCSV}
                            >
                                匯出 (CSV)
                            </Button>
                            <Button
                                size="small"
                                danger
                                ghost
                                icon={<Trash2 size={14} />}
                                onClick={handleArchive}
                            >
                                封存本月
                            </Button>
                            <div className="text-[#c5a059] text-xs font-mono tracking-widest hidden md:block ml-2">
                                RECORDS: {expenses.length} // SYSTEM: ONLINE
                            </div>
                        </div>
                    </div>

                    {/* scrollable area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                        {expenses.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full opacity-50">
                                <Empty description={<span className="text-[#33ff00]">No Data Scryed</span>} />
                            </div>
                        ) : (
                            statsViewMode === 'list' ? (
                                // ListView
                                <List
                                    dataSource={expenses}
                                    renderItem={item => (
                                        <div className="flex items-center gap-4 p-4 border-b border-[#c5a059]/10 hover:bg-[#33ff00]/5 transition-colors group">
                                            <div className="text-[#c5a059] p-2 bg-[#c5a059]/10 rounded">
                                                {getIcon(EXPENSE_CATEGORIES[item.category].icon)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-baseline">
                                                    <h3 className="text-[#33ff00] font-bold text-lg truncate">{item.itemName}</h3>
                                                    <span className="text-[#c5a059] font-mono font-bold text-lg">₮ {item.amount.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between text-xs text-[#33ff00]/50 font-mono mt-1">
                                                    <span>{getImperialDate(item.date.toString())} • {item.category}</span>
                                                    <span>{PAYMENT_METHODS[item.paymentMethod].split('(')[0]}</span>
                                                </div>
                                            </div>
                                            <Button
                                                type="text"
                                                icon={<Trash2 size={16} />}
                                                className="text-red-500 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-900/20"
                                                onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                                            />
                                        </div>
                                    )}
                                />
                            ) : (
                                // Aggregated List (Category / Date)
                                <div className="p-4 grid gap-4">
                                    {groupedExpenses.map((group) => (
                                        <div key={group.id} className="border border-[#c5a059]/30 bg-[#0a0f0d] p-4 rounded hover:border-[#c5a059] transition-colors">
                                            <div className="flex justify-between items-center mb-2">
                                                <div className="flex items-center gap-2">
                                                    {statsViewMode === 'category' && getIcon(EXPENSE_CATEGORIES[group.id as ExpenseCategory]?.icon || 'Box')}
                                                    <span className="text-lg font-bold text-[#33ff00]">{group.label}</span>
                                                    <span className="text-xs text-[#c5a059] bg-[#c5a059]/10 px-2 py-0.5 rounded-full">{group.count} 筆</span>
                                                </div>
                                                <span className="text-xl font-mono text-[#c5a059]">₮ {group.amount.toLocaleString()}</span>
                                            </div>
                                            {/* Progress Bar of sorts */}
                                            <div className="w-full bg-[#33ff00]/10 h-1 mt-1 mb-2">
                                                <div className="bg-[#c5a059] h-1" style={{ width: `${Math.min((group.amount / totalCost) * 100, 100)}%` }}></div>
                                            </div>

                                            {/* Expandable mini list could go here, for now just summary */}
                                            <div className="text-xs text-[#33ff00]/40 font-mono text-right">
                                                {(group.amount / totalCost * 100).toFixed(1)}% of Total
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
