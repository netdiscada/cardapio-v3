const CACHE_NAME = 'cardapio-cache-v3.2';

// Arquivos que devem ser guardados imediatamente na primeira vez que abre
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/ocr.js',
  './js/fontzoom.js'
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

  // Tesseract.js: cache-first (o modelo OCR 'por' é pesado, baixa 1x e fica offline)
  if (url.includes('tesseract') || url.includes('tessdata') || url.includes('jsdelivr')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

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
