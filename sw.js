const CACHE_NAME = 'cardapio-cache-v3.3';

// Arquivos que devem ser guardados imediatamente na primeira vez que abre
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/pushRegistration.js',
  './js/menu-viewer.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Firebase e Firestore: sempre network (dados em tempo real)
  if (url.includes('firebaseio') || url.includes('googleapis')) return;

  // Ignora envios de dados (POST, PUT), trata apenas carregamento de arquivos (GET)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    // Tenta buscar da internet primeiro (Network-First)
    fetch(event.request)
      .then((networkResponse) => {
        // Se deu certo, salva uma cópia no cache para a próxima vez que ficar offline
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      })
      .catch(() => {
        // Se a internet falhou (Offline), busca o arquivo salvo no Cache
        return caches.match(event.request);
      })
  );
});

// ===== WEB PUSH: Recebe notificações do servidor =====
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    console.error('[SW] Push data parse error:', e);
    return;
  }

  const title = data.title || 'Cardápio Quatinga';
  const options = {
    body: data.body || 'Nova atualização disponível',
    icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%232563eb" rx="20"/%3E%3Ctext x="50" y="65" font-size="60" text-anchor="middle" fill="white"%3E%F0%9F%8D%B2%3C/text%3E%3C/svg%3E',
    badge: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%232563eb" rx="20"/%3E%3Ctext x="50" y="65" font-size="60" text-anchor="middle" fill="white"%3E%F0%9F%8D%B2%3C/text%3E%3C/svg%3E',
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'close', title: 'Fechar' }
    ],
    requireInteraction: true,
    tag: data.type || 'cardapio-notification'
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  // Abre ou foca a janela do app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Se não achou janela aberta, abre nova
      if (clients.openWindow) {
        return clients.openWindow('./');
      }
    })
  );
});