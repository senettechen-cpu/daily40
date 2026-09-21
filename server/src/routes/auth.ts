import { Router } from 'express';
import axios from 'axios';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();

// LINE Login Config
const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CALLBACK_URL = process.env.LINE_CALLBACK_URL;

router.post('/line', async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Authorization code is required' });
        }

        // 1. Exchange Code for Access Token
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', LINE_CALLBACK_URL || '');
        params.append('client_id', LINE_CHANNEL_ID || '');
        params.append('client_secret', LINE_CHANNEL_SECRET || '');

        const tokenResponse = await axios.post('https://api.line.me/oauth2/v2.1/token', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token, id_token } = tokenResponse.data;

        // 2. Get User Profile using Access Token (Or decode id_token, but let's use profile API for specific fields)
        const profileResponse = await axios.get('https://api.line.me/v2/profile', {
            headers: {
                'Authorization': `Bearer ${access_token}`
            }
        });

        const { userId, displayName, pictureUrl } = profileResponse.data;
        const firebaseUid = `line:${userId}`;

        // 3. Check or Create Firebase User
        try {
            await admin.auth().getUser(firebaseUid);
            // User exists, update profile if needed?
            await admin.auth().updateUser(firebaseUid, {
                displayName: displayName,
                photoURL: pictureUrl
            });
        } catch (error: any) {
            if (error.code === 'auth/user-not-found') {
                // Create new user
                await admin.auth().createUser({
                    uid: firebaseUid,
                    displayName: displayName,
                    photoURL: pictureUrl
                });
            } else {
                throw error;
            }
        }

        // 4. Create Custom Token
        const customToken = await admin.auth().createCustomToken(firebaseUid);

        res.json({ token: customToken });

    } catch (error: any) {
        console.error('LINE Login Error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to authenticate with LINE' });
    }
});

export default router;
