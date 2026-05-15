// Im·Desk Service Worker v2.0
const CACHE = 'imdesk-v2';

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });

// Store scheduled notifications
const scheduled = [];

self.addEventListener('message', e => {
  if (!e.data) return;

  if (e.data.type === 'SCHEDULE') {
    const { title, body, delay } = e.data;
    if (!delay || delay <= 0) return;

    // Use setTimeout for short delays, store for background
    const timerId = setTimeout(() => {
      self.registration.showNotification(title, {
        body: body || '',
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [200, 100, 200],
        requireInteraction: false,
        tag: title + '-' + Date.now()
      });
    }, delay);

    scheduled.push({ title, body, delay, timerId, scheduledAt: Date.now() });
  }

  if (e.data.type === 'PING') {
    // Client checking SW is alive
    e.source && e.source.postMessage({ type: 'PONG' });
  }
});

// Handle notification click
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url && c.focus) return c.focus();
      }
      return clients.openWindow('/');
    })
  );
});

// Periodic sync fallback (Android Chrome)
self.addEventListener('periodicsync', e => {
  if (e.tag === 'imdesk-check') {
    e.waitUntil(Promise.resolve());
  }
});
