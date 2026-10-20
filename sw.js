// SecureVault Service Worker v4.0
const CACHE_NAME = 'securevault-v4';
const ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Только GET и только свой origin
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  
  // API запросы (HIBP) не кэшируем
  if (url.hostname !== location.hostname) return;
  
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, resClone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// Приём сообщений от клиента
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
