import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, CoreView, RequisitionSummary } from '../services/api';
import { useAuth } from './AuthContext';
import { addDays, dayKey } from '../../shared/time';

interface RequisitionContextType {
    /** False while the server still runs the old economy; the new UI stays hidden. */
    enabled: boolean;
    balance: number;
    ledger: { used: number; slots: number } | null;
    core: CoreView;
    today: string;
    tomorrow: string;
    /** Which day the core controls act on; v1.5 allows committing tomorrow in advance. */
    selectedDay: string;
    setSelectedDay: (day: string) => void;
    error: string | null;
    clearError: () => void;
    isCore: (taskId: string) => boolean;
    isCorePaid: (taskId: string) => boolean;
    canAddCore: boolean;
    toggleCore: (taskId: string) => Promise<void>;
    refresh: () => Promise<void>;
}

const RequisitionContext = createContext<RequisitionContextType | undefined>(undefined);

export const RequisitionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { getToken, user } = useAuth();
    const [summary, setSummary] = useState<RequisitionSummary>({ enabled: false });
    const [core, setCore] = useState<CoreView>({ enabled: false });
    const [error, setError] = useState<string | null>(null);

    // Recomputed on every render is fine: it only changes at midnight in Taipei.
    const today = dayKey(new Date());
    const tomorrow = addDays(today, 1);
    const [selectedDay, setSelectedDay] = useState(today);

    const refresh = useCallback(async () => {
        if (!user) return;
        try {
            const token = await getToken();
            if (!token) return;
            const [nextSummary, nextCore] = await Promise.all([api.getRequisition(token), api.getCorePlan(selectedDay, token)]);
            setSummary(nextSummary);
            setCore(nextCore);
        } catch {
            // Keep the previous values. The balance shown here is informational;
            // the server remains the only authority on what was granted.
        }
    }, [getToken, user, selectedDay]);

    useEffect(() => { void refresh(); }, [refresh]);

    const toggleCore = useCallback(async (taskId: string) => {
        setError(null);
        try {
            const token = await getToken();
            if (!token) return;
            const action = core.taskIds?.includes(taskId) ? 'remove' : 'add';
            setCore(await api.editCorePlan({ day: selectedDay, action, taskId }, token));
        } catch (err) {
            setError(err instanceof Error ? err.message : '無法更新今日核心');
        }
    }, [core.taskIds, getToken, selectedDay]);

    const value = useMemo<RequisitionContextType>(() => {
        const taskIds = core.taskIds ?? [];
        const paid = core.paidTaskIds ?? [];
        return {
            enabled: !!summary.enabled,
            balance: summary.balance ?? 0,
            ledger: summary.ledger ?? null,
            core,
            today,
            tomorrow,
            selectedDay,
            setSelectedDay,
            error,
            clearError: () => setError(null),
            isCore: (taskId: string) => taskIds.includes(taskId),
            isCorePaid: (taskId: string) => paid.includes(taskId),
            canAddCore: taskIds.length < (core.cap ?? 0),
            toggleCore,
            refresh,
        };
    }, [summary, core, today, tomorrow, selectedDay, error, toggleCore, refresh]);

    return <RequisitionContext.Provider value={value}>{children}</RequisitionContext.Provider>;
};

export const useRequisition = () => {
    const context = useContext(RequisitionContext);
    if (context === undefined) throw new Error('useRequisition must be used within a RequisitionProvider');
    return context;
};
