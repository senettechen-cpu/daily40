import { Router } from 'express';
import { query } from '../db';
import { hashPassword, verifyPassword } from '../auth/passwords';
import { signAuthToken, isMissingSecret } from '../auth/tokens';

const router = Router();

const MIN_USERNAME = 3;
const MAX_USERNAME = 32;
const MIN_PASSWORD = 8;

const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * In-memory login throttle. This server runs as a single instance, so one map is
 * enough; a restart clears it, which is acceptable for a personal deployment.
 */
const attempts = new Map<string, { count: number; firstAt: number }>();

const isLockedOut = (key: string): boolean => {
    const entry = attempts.get(key);
    if (!entry) return false;
    if (Date.now() - entry.firstAt > LOCKOUT_MS) {
        attempts.delete(key);
        return false;
    }
    return entry.count >= MAX_ATTEMPTS;
};

const recordFailure = (key: string) => {
    const entry = attempts.get(key);
    if (!entry || Date.now() - entry.firstAt > LOCKOUT_MS) {
        attempts.set(key, { count: 1, firstAt: Date.now() });
        return;
    }
    entry.count += 1;
};

const readCredentials = (body: any): { username: string; password: string } | null => {
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!username || !password) return null;
    return { username, password };
};

/**
 * First-run setup. Only works while the users table is empty, so the endpoint
 * cannot be used to add accounts once this deployment has an owner.
 */
router.post('/register', async (req, res) => {
    try {
        const credentials = readCredentials(req.body);
        if (!credentials) {
            return res.status(400).json({ error: '請提供帳號與密碼' });
        }

        const { username, password } = credentials;

        if (username.length < MIN_USERNAME || username.length > MAX_USERNAME) {
            return res.status(400).json({ error: `帳號長度需為 ${MIN_USERNAME}-${MAX_USERNAME} 個字元` });
        }
        if (password.length < MIN_PASSWORD) {
            return res.status(400).json({ error: `密碼至少需要 ${MIN_PASSWORD} 個字元` });
        }

        const existing = await query('SELECT COUNT(*)::int AS count FROM users');
        if (existing.rows[0].count > 0) {
            return res.status(403).json({ error: '此系統已有使用者，註冊已關閉' });
        }

        const uid = `local:${username}`;
        await query(
            'INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)',
            [uid, username, hashPassword(password)]
        );

        const token = signAuthToken({ uid, username });
        console.log(`[Auth] Owner account created: ${uid}`);
        return res.status(201).json({ token, uid, username });

    } catch (error) {
        if (isMissingSecret(error)) {
            console.error('[Auth] JWT_SECRET is not set; cannot issue tokens.');
            return res.status(500).json({ error: '伺服器未設定 JWT_SECRET' });
        }
        console.error('Register error:', error);
        return res.status(500).json({ error: '註冊失敗' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const credentials = readCredentials(req.body);
        if (!credentials) {
            return res.status(400).json({ error: '請提供帳號與密碼' });
        }

        const { username, password } = credentials;

        if (isLockedOut(username)) {
            return res.status(429).json({ error: '登入嘗試過於頻繁，請稍後再試' });
        }

        const result = await query(
            'SELECT id, username, password_hash FROM users WHERE username = $1',
            [username]
        );

        // Same message and code for unknown account and wrong password, so the
        // response does not reveal which usernames exist.
        const row = result.rows[0];
        if (!row || !verifyPassword(password, row.password_hash)) {
            recordFailure(username);
            return res.status(401).json({ error: '帳號或密碼錯誤' });
        }

        attempts.delete(username);
        const token = signAuthToken({ uid: row.id, username: row.username });
        return res.json({ token, uid: row.id, username: row.username });

    } catch (error) {
        if (isMissingSecret(error)) {
            console.error('[Auth] JWT_SECRET is not set; cannot issue tokens.');
            return res.status(500).json({ error: '伺服器未設定 JWT_SECRET' });
        }
        console.error('Login error:', error);
        return res.status(500).json({ error: '登入失敗' });
    }
});

/** Lets the login screen show a "create owner account" form on a fresh deployment. */
router.get('/status', async (_req, res) => {
    try {
        const result = await query('SELECT COUNT(*)::int AS count FROM users');
        return res.json({ needsSetup: result.rows[0].count === 0 });
    } catch (error) {
        console.error('Auth status error:', error);
        return res.status(500).json({ error: '無法讀取狀態' });
    }
});

export default router;
