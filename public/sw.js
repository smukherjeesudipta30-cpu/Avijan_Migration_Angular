// Chat push notifications only — this is not a caching/offline service
// worker. It exists purely so the browser has something registered to
// receive a 'push' event and show a native notification for it, even with
// every tab of the site closed.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = { title: 'Avijan', body: 'You have a new chat message.' };

  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Not JSON — fall back to the default text above rather than showing nothing.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.ico',
      tag: 'avijan-chat',
      // Replaces rather than stacks: several messages while away collapse
      // into "you have unread chats", not a pile of individual popups.
      renotify: true
    })
  );
});

// Focuses an already-open tab rather than opening a new one, if one exists.
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
