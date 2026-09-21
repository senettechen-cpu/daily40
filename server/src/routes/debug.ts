
import express from 'express';
import { sendEmail } from '../services/email';
import { verifyToken } from '../middleware/auth';

const router = express.Router();

// Debug: Test Email Sending
router.post('/test-email', verifyToken, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required' });

        console.log(`[Debug] Sending test email to ${email}`);
        await sendEmail(
            email,
            'Vox-Link Connection Verified',
            `
            <div style="font-family: monospace; background-color: #000; color: #fbbf24; padding: 20px; border: 2px solid #fbbf24;">
                <h1 style="text-align: center; text-transform: uppercase;">Vox-Link Active</h1>
                <p>The Astropathic Choir confirms connection.</p>
                <p>Target: ${email}</p>
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
