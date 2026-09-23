const CACHE_NAME = 'cardapio-cache-v1';

// Arquivos que devem ser guardados imediatamente na primeira vez que abre
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json'
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


  
