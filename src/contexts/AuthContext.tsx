import React, { createContext, useContext, useEffect, useState } from 'react';

export interface LocalUser {
    uid: string;
    username: string;
}

interface AuthContextType {
    user: LocalUser | null;
    loading: boolean;
    needsSetup: boolean;
    login: (username: string, password: string) => Promise<void>;
    register: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'emperor.auth.token';

const fallbackUrl = import.meta.env.PROD ? window.location.origin : 'http://localhost:3001';
const RAW_URL = import.meta.env.VITE_API_URL || fallbackUrl;
const BASE_URL = RAW_URL.replace(/\/api\/?$/, '').replace(/\/+$/, '');
const AUTH_URL = `${BASE_URL}/api/auth`;

interface TokenClaims {
    uid: string;
    username: string;
    exp?: number;
}

/**
 * Reads the claims out of a token without verifying it. The server is the only
 * thing that trusts a token; this is just so the UI knows who is signed in and
 * can drop an obviously expired token instead of firing doomed requests.
 */
const decodeToken = (token: string): TokenClaims | null => {
    try {
        const segment = token.split('.')[1];
        if (!segment) return null;
        const json = atob(segment.replace(/-/g, '+').replace(/_/g, '/'));
        const claims = JSON.parse(json) as TokenClaims;
        if (!claims.uid || !claims.username) return null;
        if (claims.exp && claims.exp * 1000 <= Date.now()) return null;
        return claims;
    } catch {
        return null;
    }
};

const readStoredUser = (): LocalUser | null => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;

    const claims = decodeToken(token);
    if (!claims) {
        localStorage.removeItem(TOKEN_KEY);
        return null;
    }
    return { uid: claims.uid, username: claims.username };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<LocalUser | null>(readStoredUser);
    const [loading, setLoading] = useState(true);
    const [needsSetup, setNeedsSetup] = useState(false);

    useEffect(() => {
        if (user) {
            setLoading(false);
            return;
        }

        let cancelled = false;
        fetch(`${AUTH_URL}/status`)
            .then(res => (res.ok ? res.json() : { needsSetup: false }))
            .then(data => {
                if (!cancelled) setNeedsSetup(Boolean(data.needsSetup));
            })
            .catch(() => {
                // Server unreachable: fall back to the login form rather than the setup form.
                if (!cancelled) setNeedsSetup(false);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [user]);

    const submit = async (path: string, username: string, password: string) => {
        const response = await fetch(`${AUTH_URL}/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || '登入失敗，請稍後再試');
        }

        localStorage.setItem(TOKEN_KEY, data.token);
        setUser({ uid: data.uid, username: data.username });
        setNeedsSetup(false);
    };

    const login = (username: string, password: string) => submit('login', username, password);
    const register = (username: string, password: string) => submit('register', username, password);

    const logout = async () => {
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
    };

    const getToken = async (): Promise<string | null> => localStorage.getItem(TOKEN_KEY);

    return (
        <AuthContext.Provider value={{ user, loading, needsSetup, login, register, logout, getToken }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
