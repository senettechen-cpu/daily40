
import express from 'express';
import { sendEmail } from '../services/email';
import { verifyToken } from '../middleware/auth';

const router = express.Router();

/** A plausible address; the mail server has the final say. */
const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,255}\.[^\s@<>"']{2,}$/;

/**
 * The Vox-Link settings send one test message so a user can check an address
 * before saving it. Since 2026-09-27 it cannot be used as a relay: the address
 * must look like one, the body no longer echoes anything the user typed, and
 * each account may send three an hour.
 */
const TEST_LIMIT = 3;
const TEST_WINDOW_MS = 60 * 60 * 1000;
const sent = new Map<string, number[]>();
const allowTest = (uid: string) => {
    const now = Date.now();
    const recent = (sent.get(uid) ?? []).filter(at => now - at < TEST_WINDOW_MS);
    if (recent.length >= TEST_LIMIT) { sent.set(uid, recent); return false; }
    sent.set(uid, [...recent, now]);
    return true;
};

router.post('/test-email', verifyToken, async (req, res) => {
    try {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
        if (!EMAIL.test(email)) return res.status(400).json({ error: '信箱格式不正確' });
        if (!allowTest(req.user!.uid)) return res.status(429).json({ error: '測試信每小時最多 3 封，請稍後再試' });

        console.log(`[Debug] Sending test email to ${email}`);
        await sendEmail(
            email,
            'Vox-Link Connection Verified',
            `
            <div style="font-family: monospace; background-color: #000; color: #fbbf24; padding: 20px; border: 2px solid #fbbf24;">
                <h1 style="text-align: center; text-transform: uppercase;">Vox-Link Active</h1>
                <p>The Astropathic Choir confirms connection.</p>
                <p>Status: <span style="color: #00ff00;">ONLINE</span></p>
                <hr style="border-color: #fbbf24; opacity: 0.3;" />
                <p style="text-align: center; font-size: 12px; color: #666;">THE EMPEROR PROTECTS.</p>
            </div>
            `
        );

        res.json({ message: 'Test email sent' });
    } catch (err) {
        console.error('[Debug] Test email failed:', err);
        res.status(500).json({ error: 'Failed to send test email' });
    }
});

export default router;
