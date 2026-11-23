/* Bene offline shell. No analytics, no network calls except app assets. */

/* The cache name carries a build stamp, injected at build time. Without it
   this string never changes between releases, so the activate handler never
   evicts anything, and a cache-first fetch keeps serving the previous
   release's HTML and bundle. That is what forced users to clear app data to
   see an update. */
const RELEASE = '__BENE_RELEASE__';
const CACHE = `bene-${RELEASE}`;
const CORE = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      /* Drop every cache from a previous release, not only ones whose name we
         recognise: a leftover cache keeps serving its stale bundle. */
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Navigations go to the network first. Serving index.html from cache is
     what pinned users to an old release: the HTML names the hashed bundle, so
     a stale copy keeps requesting files the next build no longer ships.
     Offline still works through the cache fallback. */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
    );
    return;
  }

  /* Build assets carry a content hash, so a cached hit can never be stale. */
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (!res || res.status !== 200 || res.type === 'opaque') return res;
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match('./index.html'));
    }),
  );
});
