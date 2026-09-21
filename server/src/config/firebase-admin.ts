import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

let serviceAccount: any;

try {
    // Option 1: Load from env variable (JSON string) - Best for Zeabur
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    }
    // Option 2: Load from local file (Dev only)
    else {
        // You can modify this path to where you put your serviceAccountKey.json
        // serviceAccount = require('../../../serviceAccountKey.json');
        console.warn('[Firebase Admin] No FIREBASE_SERVICE_ACCOUNT env found. Backend auth verification might fail.');
    }
} catch (error) {
    console.error('[Firebase Admin] Failed to parse service account credentials:', error);
}

if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('[Firebase Admin] Initialized successfully.');
}

export default admin;
