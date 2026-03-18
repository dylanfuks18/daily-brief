const CACHE = 'daily-brief-v4';
const SHELL = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', e => {
  // skipWaiting siempre — no bloquear en caso de fallo de cache
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Network-first para APIs externas y news.json (datos siempre frescos)
  const isApi = url.includes('espn.com') || url.includes('bluelytics') ||
                url.includes('coingecko') || url.includes('finance.yahoo') ||
                url.includes('allorigins') || url.includes('themoviedb') ||
                url.includes('news.json');

  if (isApi) {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request) || new Response('{}', { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // Network-first para app shell (app.js, style.css, index.html)
  // Asi los cambios llegan inmediatamente, con fallback a cache si no hay red
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.status === 200) {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      }
      return res;
    }).catch(() => caches.match(e.request) || caches.match('/index.html'))
  );
});
