import { useEffect } from 'react';
import { Task } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

// VAPID Public Key
// Rotated 2026-09-24: the previous pair was published in the old public repo.
// The public half is meant to ship; its private half lives only in the api
// service's environment. Subscriptions made with the old key fail with 410
// and are deleted, so browsers re-subscribe against this one.
const VAPID_PUBLIC_KEY = 'BCGjTeKDpYNhVrwxtjhRaX9ggsN4r403_d6ysDfLmm5yRfe1O7DHqTi8pFtkfdrScnaKZ6iWmyIp-8eUweGY1T8';

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * True only where web push can actually work. iOS exposes Notification solely
 * to a home-screen PWA (16.4+); in a Safari tab or an in-app browser (LINE,
 * Facebook) the global does not exist at all, and touching it throws — which
 * used to take the whole dashboard down right after sign-in.
 */
const pushSupported = () =>
    typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

export const useLocalNotifications = (_tasks: Task[]) => {
    // 'tasks' is kept for API compatibility; reminders are sent server-side.
    const { getToken } = useAuth();

    useEffect(() => {
        if (!pushSupported()) return;
        if (Notification.permission === 'denied') return;

        const subscribeToPush = async () => {
            try {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                });

                // Same token and base URL as every other call. This used to read
                // localStorage 'token' (never set) and post to a retired host, so
                // no subscription had ever reached the server.
                const token = await getToken();
                if (token) await api.subscribePush(subscription, token);
            } catch (err) {
                // A refused prompt or an offline server must never break the page.
                console.error('Push subscription failed:', err);
            }
        };

        void subscribeToPush();
        // Once per mount. getToken is a fresh function every render (it only
        // reads localStorage), so depending on it would re-subscribe on each one.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
};
