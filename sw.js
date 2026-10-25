const CACHE_NAME = 'zenban-v101';
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

// Compartir con ZenBan (Android): guarda las imágenes y el texto recibidos y abre la app,
// que pregunta en qué proyecto ponerlos (capture.js)
const SHARE_CACHE = 'zbshare-inbox';

async function receiveShare(request) {
  try {
    const form = await request.formData();
    const cache = await caches.open(SHARE_CACHE);
    const base = new URL('./__share/', self.registration.scope).href;
    const files = form.getAll('media').filter(f => f && typeof f !== 'string' && f.size);
    await Promise.all(files.map((f, i) => cache.put(`${base}file-${Date.now()}-${i}`, new Response(f, {
      headers: { 'Content-Type': f.type || 'image/png', 'X-File-Name': encodeURIComponent(f.name || 'captura.png') }
    }))));
    const text = [form.get('title'), form.get('text'), form.get('url')].filter(x => typeof x === 'string' && x.trim()).join('\n');
    if (text) await cache.put(`${base}text`, new Response(text));
    return Response.redirect(new URL('./index.html?share=1', self.registration.scope).href, 303);
  } catch (err) {
    return Response.redirect(new URL('./index.html?share=error', self.registration.scope).href, 303);
  }
}

// ----- Widget del panel de Widgets de Windows 11 (Edge, app instalada) -----
// La app guarda en la caché "zbwidget" el resumen de pendientes (no hay acceso a sus datos desde aquí);
// el widget usa esa plantilla (Adaptive Card) con esos datos.
const WIDGET_CACHE = 'zbwidget';
const WIDGET_DATA_KEY = new URL('./widgets/live-data.json', self.registration.scope).href;

async function widgetPayload(widget) {
  const template = await (await fetch(widget.definition.msAcTemplate)).text();
  const cached = await caches.open(WIDGET_CACHE).then(c => c.match(WIDGET_DATA_KEY)).catch(() => null);
  const data = cached ? await cached.text() : await (await fetch(widget.definition.data)).text();
  return { template, data };
}

async function updateWidget(widget) {
  if (!self.widgets || !widget) return;
  await self.widgets.updateByTag(widget.definition.tag, await widgetPayload(widget));
}

async function updateAllWidgets() {
  if (!self.widgets) return;
  const list = await self.widgets.matchAll({ installable: true }).catch(() => []);
  for (const w of list) if (w.instances && w.instances.length) await updateWidget(w);
}

self.addEventListener('widgetinstall', (e) => e.waitUntil(updateWidget(e.widget)));
self.addEventListener('widgetresume', (e) => e.waitUntil(updateWidget(e.widget)));
self.addEventListener('widgetclick', (e) => {
  if (e.action === 'open') {
    e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => {
      const open = list.find(c => c.url.startsWith(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow(new URL('./index.html', self.registration.scope).href);
    }));
  }
});
self.addEventListener('periodicsync', (e) => { if (e.tag === 'zenban-widget') e.waitUntil(updateAllWidgets()); });
// La app avisa cuando cambian los pendientes
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'widget-refresh') e.waitUntil(updateAllWidgets());
});

// Network-First for HTML/Navigation, Cache-First for static assets
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith(receiveShare(e.request));
    return;
  }

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
