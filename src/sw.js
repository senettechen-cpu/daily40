/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

const sw = self;

sw.addEventListener('install', (event) => {
    sw.skipWaiting();
    console.log('[ServiceWorker] Installed');
});

sw.addEventListener('activate', (event) => {
    event.waitUntil(sw.clients.claim());
    console.log('[ServiceWorker] Activated');
});

sw.addEventListener('push', (event) => {
    console.log('[ServiceWorker] Push Received');

    const data = event.data ? event.data.json() : {};
    const title = data.title || '帝國通訊';
    const options = {
        body: data.body || '收到加密訊息',
        icon: data.icon || '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        data: { url: data.url || '/' }
    };

    event.waitUntil(
        sw.registration.showNotification(title, options)
    );
});

sw.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            if (clientList.length > 0) {
                let client = clientList[0];
                for (const c of clientList) {
                    if (c.focused) {
                        client = c;
                    }
                }
                return client.focus();
            }
            return sw.clients.openWindow(event.notification.data.url);
        })
    );
});
