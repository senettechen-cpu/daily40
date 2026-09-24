import { useEffect, useState } from 'react';
import { Task } from '../types';

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

export const useLocalNotifications = (tasks: Task[]) => {
    // Note: 'tasks' argument is kept for API compatibility but logic is now server-side push.
    const [isSubscribed, setIsSubscribed] = useState(false);

    useEffect(() => {
        const subscribeToPush = async () => {
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                return;
            }

            try {
                // Wait for SW to be ready
                const registration = await navigator.serviceWorker.ready;

                // Subscribe
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                });

                console.log('Push Subscription Object:', JSON.stringify(subscription));

                // Send to backend
                const token = localStorage.getItem('token');
                // Use a relative URL or configured API URL
                // Assuming dev/prod environment. For now hardcode or use relative if proxy is set.
                // Since this runs in browser, relative '/api' might work if served from same origin (which it isn't usually in dev).
                // Let's use the production URL for Zeabur or localhost fallback.
                const API_URL = window.location.hostname.includes('localhost')
                    ? 'http://localhost:3001/api'
                    : 'https://emperor-tasks-server.zeabur.app/api';

                if (token) {
                    await fetch(`${API_URL}/notifications/subscribe`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ subscription })
                    });
                    console.log('Push Subscribed & Sent to Server!');
                    setIsSubscribed(true);
                }

            } catch (err) {
                console.error('Push Subscription failed:', err);
            }
        };

        if (Notification.permission === 'default' || Notification.permission === 'granted') {
            subscribeToPush();
        }

    }, []);
};
