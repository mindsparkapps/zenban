const CACHE_NAME = 'zenban-v34';
const STATIC_ASSETS = [
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k.startsWith('zenban-') && k !== CACHE_NAME) {
            return caches.delete(k);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Network-First for HTML/Navigation, Cache-First for static assets
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Google (inicio de sesión y Drive) y peticiones que no son GET van directo a la red
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // For HTML documents / navigation: Network First, fallback to cache
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match('./index.html') || caches.match(e.request);
        })
    );
    return;
  }

  // Para CSS, JS e imágenes: Network First (siempre la versión más nueva),
  // con la caché solo como respaldo cuando no hay conexión
  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(e.request))
  );
});
