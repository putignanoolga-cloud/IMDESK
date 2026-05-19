// Im·Desk Service Worker v3.0
// Notifiche persistenti con IndexedDB — funziona anche con app chiusa (Android/Chrome)

const DB_NAME = 'imdesk-notifs-v1';
const DB_STORE = 'scheduled';

// ── IndexedDB ────────────────────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(DB_STORE, { keyPath: 'id' });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbSave(notif) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(notif);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbClear() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ── Timer in-memory (per quando il SW è sveglio) ─────────────────────────────
const timers = {};

async function fireNotification(n) {
  return self.registration.showNotification(n.title, {
    body: n.body || n.title,
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: String(n.id),
    renotify: true,
    requireInteraction: false,
    data: { url: '/' }
  });
}

// Carica da IndexedDB e ri-schedula i timer in memoria
async function restoreScheduled() {
  let notifs = [];
  try { notifs = await dbGetAll(); } catch(e) { return; }

  const now = Date.now();
  for (const n of notifs) {
    const remaining = n.fireAt - now;

    if (remaining <= 0) {
      // Scaduta mentre l'app era chiusa — spara subito
      try { await fireNotification(n); } catch(e) {}
      try { await dbDelete(n.id); } catch(e) {}
    } else if (remaining < 36 * 60 * 60 * 1000) {
      // Entro 36 ore — programma setTimeout
      clearTimeout(timers[n.id]);
      timers[n.id] = setTimeout(async () => {
        try { await fireNotification(n); } catch(e) {}
        try { await dbDelete(n.id); } catch(e) {}
        delete timers[n.id];
      }, remaining);
    }
    // Oltre 36h: rimane in IndexedDB, verrà ri-caricata al prossimo risveglio
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim().then(() => restoreScheduled()));
});

// ── Messaggi dall'app ────────────────────────────────────────────────────────
self.addEventListener('message', async e => {
  if (!e.data) return;

  // SCHEDULE: aggiungi notifica
  if (e.data.type === 'SCHEDULE') {
    const { title, body, fireAt, id } = e.data;
    if (!fireAt || !title) return;

    const notif = {
      id: id || (title + '-' + fireAt),
      title,
      body: body || title,
      fireAt
    };

    try { await dbSave(notif); } catch(e) {}

    const remaining = fireAt - Date.now();
    if (remaining <= 0) {
      try { await fireNotification(notif); await dbDelete(notif.id); } catch(e) {}
    } else {
      clearTimeout(timers[notif.id]);
      timers[notif.id] = setTimeout(async () => {
        try { await fireNotification(notif); await dbDelete(notif.id); } catch(e) {}
        delete timers[notif.id];
      }, remaining);
    }
  }

  // CLEAR_ALL: cancella tutto
  if (e.data.type === 'CLEAR_ALL') {
    Object.values(timers).forEach(clearTimeout);
    for (const k in timers) delete timers[k];
    try { await dbClear(); } catch(e) {}
  }

  // PING: keep-alive check
  if (e.data.type === 'PING') {
    try { e.source?.postMessage({ type: 'PONG' }); } catch(e) {}
  }
});

// ── Periodic Background Sync (Chrome Android) ────────────────────────────────
self.addEventListener('periodicsync', e => {
  if (e.tag === 'imdesk-check') {
    e.waitUntil(restoreScheduled());
  }
});

// ── Click notifica → apri/focus app ─────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const focused = list.find(c => 'focus' in c);
      if (focused) return focused.focus();
      return clients.openWindow(e.notification.data?.url || '/');
    })
  );
});
