
import { Task, Project, ArmyStrength, SectorHistory, Resources } from '../types';

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

    archiveExpenses: async (token?: string): Promise<void> => {
        const response = await fetch(`${API_URL}/ledger/archive`, {
            method: 'POST',
            headers: getHeaders(token)
        });
        if (!response.ok) throw new Error('Failed to archive expenses');
    }
};
