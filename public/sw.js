// Minimal service worker: exists mainly so the app is installable
// ("Add to Home Screen" / desktop install prompt), which on Android/Chrome
// requires an active SW with a fetch handler. Caching is deliberately
// light — network-first for navigations (so you always get the latest
// build when online), falling back to the cached shell only when
// offline. This app's real data lives in IndexedDB/Firebase, not in this
// cache, so there's no data staleness risk from caching too eagerly.
const CACHE = 'docket-shell-v1';
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Navigations: try the network first so you always get the current
  // build; only serve the cached shell if you're offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((res) => res ?? Response.error())),
    );
    return;
  }

  // Everything else (JS/CSS/icons): cache-first with a network fallback
  // that also updates the cache, so repeat visits load instantly.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((res) => {
          if (res.ok) caches.open(CACHE).then((cache) => cache.put(request, res.clone()));
          return res;
        }),
    ),
  );
});
