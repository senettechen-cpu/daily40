import { useEffect, useState } from 'react';
import { Task } from '../types';

// VAPID Public Key
const VAPID_PUBLIC_KEY = 'BIN8jX2NwwF5-RptRA3n9Pi6hP9aHcQadZHw7Xy8p3Er_764WB1yV3kZtOeUIvd5WHOGlNhw5t5HBzS5i1jzlBE';

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
