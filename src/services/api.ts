
import { Task, Project, ArmyStrength, SectorHistory, Resources } from '../types';
import type { LedgerPreset, PresetFields, Suggestion } from '../../shared/ledger/presets';
import type { Character, RecruitTemplate, Squad } from '../../shared/roster';
import type { CatalogItem, EquipmentItem } from '../../shared/armory';

export interface LedgerQuickMenuData { pinned: LedgerPreset[]; suggestions: Suggestion[] }

export interface RosterData {
    characters: Character[];
    squads: Squad[];
    recruits: RecruitTemplate[];
    /** Recruit template ids unlocked by a campaign or story. */
    authorized: string[];
    balance: number;
}

export interface ArmoryData { catalog: CatalogItem[]; items: EquipmentItem[]; authorized: string[]; balance: number }

export interface OperationGate { allowed: boolean; paysRequisition: boolean; reason: string; completedCores: number; day: string }

export interface XpAward { characterId: string; amount: number; role: 'deployed' | 'trainee' }

/** The server's own result. The client replays it; it never reports one. */
export interface StartedOperation {
    operation: {
        id: string; scenarioId: string; seed: number; engine: 'v2';
        crew: unknown[]; board: unknown; rounds: number; placements: unknown[];
        outcome: 'victory' | 'defeat' | 'timeout'; paysXp: boolean;
    };
    activations?: unknown[];
    awards: XpAward[];
    unmodelled: string[];
    /** Who a defeat put out of action for the rest of the day. */
    woundedIds?: string[];
    /** Authorizations this victory just earned. */
    unlocked?: { equipment: string[]; personnel: string[]; victories?: number };
}

export interface RequisitionSummary {
    enabled: boolean;
    balance?: number;
    ledger?: { used: number; slots: number };
}

export type CorePhase = 'too-early' | 'upcoming' | 'open' | 'past';

export interface CoreView {
    enabled: boolean;
    day?: string;
    taskIds?: string[];
    phase?: CorePhase;
    /** How many cores the day may hold: three on any day still open. */
    cap?: number;
    max?: number;
    paidTaskIds?: string[];
}

export type CoreEdit =
    | { day: string; action: 'add'; taskId: string }
    | { day: string; action: 'remove'; taskId: string }
    | { day: string; action: 'replace'; taskId: string; withTaskId: string };

const fallbackUrl = import.meta.env.PROD ? window.location.origin : 'http://localhost:3001';
const RAW_URL = import.meta.env.VITE_API_URL || fallbackUrl;
const BASE_URL = RAW_URL.replace(/\/api\/?$/, '').replace(/\/+$/, '');
const API_URL = `${BASE_URL}/api`;

const getHeaders = (token?: string) => {
    const headers: HeadersInit = {
        'Content-Type': 'application/json'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
};

export const api = {
    // Tasks
    getTasks: async (token?: string): Promise<Task[]> => {
        const response = await fetch(`${API_URL}/tasks`, {
            headers: getHeaders(token)
        });
        if (!response.ok) throw new Error('Failed to fetch tasks');
        return response.json();
    },

    createTask: async (task: Task, token?: string): Promise<void> => {
        const response = await fetch(`${API_URL}/tasks`, {
            method: 'POST',
            headers: getHeaders(token),
            body: JSON.stringify(task)
        });
        if (!response.ok) throw new Error('Failed to create task');
    },

    updateTask: async (id: string, updates: Partial<Task>, token?: string): Promise<void> => {
        const response = await fetch(`${API_URL}/tasks/${id}`, {
            method: 'PUT',
            headers: getHeaders(token),
            body: JSON.stringify(updates)
        });
        if (!response.ok) throw new Error('Failed to update task');
    },

    deleteTask: async (id: string, token?: string): Promise<void> => {
        const response = await fetch(`${API_URL}/tasks/${id}`, {
            method: 'DELETE',
            headers: getHeaders(token)
        });
        if (!response.ok) throw new Error('Failed to delete task');
    },

    // Game State
    getGameState: async (token?: string) => {
        const response = await fetch(`${API_URL}/game-state`, {
            headers: getHeaders(token)
        });
        if (!response.ok) throw new Error('Failed to fetch game state');
        return response.json();
    },

    syncGameState: async (state: any, token?: string): Promise<void> => {
        console.log("[API] Syncing Game State:", JSON.stringify(state).substring(0, 200) + "...");
        const response = await fetch(`${API_URL}/game-state`, {
            method: 'POST',
            headers: getHeaders(token),
            body: JSON.stringify(state)
        });
        if (!response.ok) throw new Error('Failed to sync game state');
    },

    // Projects
    getProjects: async (token?: string): Promise<Project[]> => {
        const response = await fetch(`${API_URL}/projects`, {
            headers: getHeaders(token)
        });
        if (!response.ok) throw new Error('Failed to fetch projects');
        return response.json();
    },

    sendTestEmail: async (email: string, token?: string): Promise<void> => {
        const response = await fetch(`${API_URL}/debug/test-email`, {
            method: 'POST',
            headers: getHeaders(token),
            body: JSON.stringify({ email })
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to send test email');
        }
    },

    createProject: async (project: Project, token?: string): Promise<void> => {
        const response = await fetch(`${API_URL}/projects`, {
            method: 'POST',
            headers: getHeaders(token),
            body: JSON.stringify(project)
        });
        if (!response.ok) throw new Error('Failed to create project');
    },

    updateProject: async (id: string, updates: Partial<Project>, token?: string): Promise<void> => {
        const response = await fetch(`${API_URL}/projects/${id}`, {
            method: 'PUT',
            headers: getHeaders(token),
            body: JSON.stringify(updates)
        });
        if (!response.ok) throw new Error('Failed to update project');
    },

    deleteProject: async (id: string, token?: string): Promise<void> => {
        const response = await fetch(`${API_URL}/projects/${id}`, {
            method: 'DELETE',
            headers: getHeaders(token)
        });
        if (!response.ok) throw new Error('Failed to delete project');
    },

    // Audit Logs
    // Audit Logs
    logResourceChange: async (data: { category: string; amount: number; reason: string }, token?: string): Promise<void> => {
        const response = await fetch(`${API_URL}/logs`, {
            method: 'POST',
            headers: getHeaders(token),
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.text();
            console.error("Failed to log resource change:", err);
            throw new Error(`Log failed: ${err}`);
        }
    },

    getLogs: async (limit: number = 50, offset: number = 0, token?: string): Promise<any[]> => {
        const response = await fetch(`${API_URL}/logs?limit=${limit}&offset=${offset}`, {
            headers: getHeaders(token)
        });
        if (!response.ok) throw new Error('Failed to fetch logs');
        return response.json();
    },

    // Ledger
    getExpenses: async (token?: string): Promise<any[]> => {
        const response = await fetch(`${API_URL}/ledger`, { headers: getHeaders(token) });
        if (!response.ok) throw new Error('Failed to fetch expenses');
        return response.json();
    },

    addExpense: async (expense: any, token?: string): Promise<void> => {
        const response = await fetch(`${API_URL}/ledger`, {
            method: 'POST',
            headers: getHeaders(token),
            body: JSON.stringify(expense)
        });
        if (!response.ok) throw new Error('Failed to add expense');
    },

    deleteExpense: async (id: string, token?: string): Promise<void> => {
        const response = await fetch(`${API_URL}/ledger/${id}`, {
            method: 'DELETE',
            headers: getHeaders(token)
        });
        if (!response.ok) throw new Error('Failed to delete expense');
    },

    // Ledger quick menu
    getLedgerQuickMenu: async (token?: string): Promise<LedgerQuickMenuData> => {
        const response = await fetch(`${API_URL}/ledger/presets`, { headers: getHeaders(token) });
        if (!response.ok) throw new Error('Failed to fetch quick menu');
        return response.json();
    },

    pinLedgerPreset: async (preset: PresetFields & { amount: number | null }, token?: string): Promise<LedgerPreset> => {
        const response = await fetch(`${API_URL}/ledger/presets`, { method: 'POST', headers: getHeaders(token), body: JSON.stringify(preset) });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Failed to pin preset');
        return response.json();
    },

    hideLedgerSuggestion: async (fields: PresetFields, token?: string): Promise<void> => {
        const response = await fetch(`${API_URL}/ledger/presets/hide`, { method: 'POST', headers: getHeaders(token), body: JSON.stringify(fields) });
        if (!response.ok) throw new Error('Failed to hide suggestion');
    },

    unpinLedgerPreset: async (id: string, token?: string): Promise<void> => {
        const response = await fetch(`${API_URL}/ledger/presets/${encodeURIComponent(id)}`, { method: 'DELETE', headers: getHeaders(token) });
        if (!response.ok) throw new Error('Failed to unpin preset');
    },

    archiveExpenses: async (token?: string): Promise<void> => {
        const response = await fetch(`${API_URL}/ledger/archive`, {
            method: 'POST',
            headers: getHeaders(token)
        });
        if (!response.ok) throw new Error('Failed to archive expenses');
    },

    // v1.5 requisition. Every response carries `enabled`, which is false while
    // the server still runs the old economy, so callers can hide the new UI.
    getRequisition: async (token?: string): Promise<RequisitionSummary> => {
        const response = await fetch(`${API_URL}/rewards`, { headers: getHeaders(token) });
        if (!response.ok) throw new Error('Failed to fetch requisition');
        return response.json();
    },

    getCorePlan: async (day: string, token?: string): Promise<CoreView> => {
        const response = await fetch(`${API_URL}/rewards/core?day=${encodeURIComponent(day)}`, { headers: getHeaders(token) });
        if (!response.ok) throw new Error('Failed to fetch core plan');
        return response.json();
    },

    editCorePlan: async (edit: CoreEdit, token?: string): Promise<CoreView> => {
        const response = await fetch(`${API_URL}/rewards/core`, { method: 'POST', headers: getHeaders(token), body: JSON.stringify(edit) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || '無法更新今日核心');
        return data;
    },

    // v1.5 roster. The first read also grants the six free starting soldiers.
    getRoster: async (token?: string): Promise<RosterData> => {
        const response = await fetch(`${API_URL}/roster`, { headers: getHeaders(token) });
        if (!response.ok) throw new Error('Failed to fetch roster');
        return response.json();
    },

    recruitCharacter: async (templateId: string, name: string | undefined, token?: string): Promise<{ character: Character; spent: number }> => {
        const response = await fetch(`${API_URL}/roster/recruit`, { method: 'POST', headers: getHeaders(token), body: JSON.stringify({ templateId, name }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || '無法招募');
        return data;
    },

    createSquad: async (name: string, token?: string): Promise<Squad> => {
        const response = await fetch(`${API_URL}/roster/squads`, { method: 'POST', headers: getHeaders(token), body: JSON.stringify({ name }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || '無法建立編成');
        return data;
    },

    updateSquad: async (id: string, changes: { name?: string; memberIds?: string[] }, token?: string): Promise<Squad> => {
        const response = await fetch(`${API_URL}/roster/squads/${encodeURIComponent(id)}`, { method: 'PUT', headers: getHeaders(token), body: JSON.stringify(changes) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || '無法更新編成');
        return data;
    },

    deleteSquad: async (id: string, token?: string): Promise<void> => {
        const response = await fetch(`${API_URL}/roster/squads/${encodeURIComponent(id)}`, { method: 'DELETE', headers: getHeaders(token) });
        if (!response.ok) throw new Error('無法刪除編成');
    },

    // v1.5 armoury
    getArmory: async (token?: string): Promise<ArmoryData> => {
        const response = await fetch(`${API_URL}/armory`, { headers: getHeaders(token) });
        if (!response.ok) throw new Error('Failed to fetch armory');
        return response.json();
    },

    purchaseEquipment: async (catalogId: string, token?: string): Promise<EquipmentItem> => {
        const response = await fetch(`${API_URL}/armory/purchase`, { method: 'POST', headers: getHeaders(token), body: JSON.stringify({ catalogId }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || '無法採購');
        return data;
    },

    assignEquipment: async (itemId: string, characterId: string | null, token?: string): Promise<EquipmentItem> => {
        const response = await fetch(`${API_URL}/armory/items/${encodeURIComponent(itemId)}/assign`, { method: 'POST', headers: getHeaders(token), body: JSON.stringify({ characterId }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || '無法配裝');
        return data;
    },

    sellEquipment: async (itemId: string, token?: string): Promise<number> => {
        const response = await fetch(`${API_URL}/armory/items/${encodeURIComponent(itemId)}`, { method: 'DELETE', headers: getHeaders(token) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || '無法回收');
        return data.refunded;
    },

    // v1.5 G1: whether a new operation may start today.
    getOperationGate: async (token?: string): Promise<OperationGate> => {
        const response = await fetch(`${API_URL}/operations/gate`, { headers: getHeaders(token) });
        if (!response.ok) throw new Error('Failed to read operation gate');
        return response.json();
    },

    startOperation: async (squadId: string, scenarioId: string, traineeIds: string[], token?: string): Promise<StartedOperation> => {
        const response = await fetch(`${API_URL}/operations`, {
            method: 'POST', headers: getHeaders(token), body: JSON.stringify({ squadId, scenarioId, traineeIds }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || '無法出戰');
        return data;
    },

    setProjectMilestones: async (projectId: string, milestoneIds: string[], token?: string): Promise<string[]> => {
        const response = await fetch(`${API_URL}/projects/${encodeURIComponent(projectId)}/milestones`, {
            method: 'PUT', headers: getHeaders(token), body: JSON.stringify({ milestoneIds })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || '無法設定里程碑');
        return data.milestoneIds;
    }
};
