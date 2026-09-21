import express from 'express';
import { pool } from '../db';

const router = express.Router();

// Store push subscription
router.post('/subscribe', async (req, res) => {
    const { subscription } = req.body;
    // @ts-ignore
    const user_id = req.user.uid;

    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Invalid subscription' });
    }

    try {
        // Upsert subscription (or just insert allow multiples? Different devices might have different endpoints)
        // Usually we store unique endpoint.
        await pool.query(
            `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (endpoint) DO UPDATE 
             SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, created_at = NOW()`,
            [user_id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
        );

        res.status(201).json({ message: 'Subscription saved' });
    } catch (err) {
        console.error('Error saving subscription:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
