// Im·Desk Service Worker v1.0
// © 2025 Im·Desk — Tutti i diritti riservati

const CACHE_NAME = 'imdesk-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// Handle push notifications from server (future use)
self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'Im·Desk', {
      body: data.body || '',
      icon: '/icon.png',
      badge: '/icon.png',
      vibrate: [200, 100, 200],
      data: data
    })
  );
});

// Handle scheduled notifications (message from main thread)
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SCHEDULE') {
    const { title, body, delay } = e.data;
    setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [200, 100, 200]
      });
    }, delay || 0);
  }

  if (e.data && e.data.type === 'STORE_ITEMS') {
    // Store today's items for background check
    self._todayItems = e.data.items;
    self._schedules = e.data.schedules; // [{h:9,m:20},{h:15,m:20},{h:19,m:0}]
  }
});

// Periodic background sync (where supported)
self.addEventListener('periodicsync', e => {
  if (e.tag === 'imdesk-daily') {
    e.waitUntil(sendDailyNotification());
  }
});

async function sendDailyNotification() {
  // Send notification with stored items
  if (self._todayItems && self._todayItems.length > 0) {
    const title = 'Im·Desk — ' + self._todayItems.length + ' attività oggi';
    const body = self._todayItems.slice(0, 5).map(i => i.icon + ' ' + i.title).join(' | ');
    await self.registration.showNotification(title, {
      body,
      icon: '/icon.png',
      badge: '/icon.png',
      vibrate: [200, 100, 200]
    });
  }
}

// Click on notification → open app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('imdesk') || client.url.includes('netlify')) {
          return client.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});
