// Service worker: makes the app installable AND keeps the shell working on
// dead restaurant wifi.
//
// Strategy:
//   - App shell (this page, the logo, icons, manifest): cache-first with a
//     background refresh, so opens are instant and updates arrive quietly.
//   - The page itself (navigations): network-first so new versions deploy
//     normally, falling back to the cached copy when offline.
//   - Third-party statics (Tailwind CDN, Google Fonts): cache-first — they
//     are versioned upstream and must be available offline for the shell
//     to render.
//   - Google Apps Script API calls: NEVER cached here. The app handles menu
//     caching itself in localStorage and queues writes in its outbox.
//
// Bump CACHE_NAME on every release that changes cached files.

const CACHE_NAME = 'bonsake-v33';
const SHELL = [
  '/',
  '/styles.css',
  '/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png'
];
// Cached best-effort on install: addAll() is all-or-nothing, and the training
// app's shell must never fail to install because this page is missing from a
// deploy. (The fetch handler still caches it on first visit either way.)
const OPTIONAL = ['/inventory.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) =>
      c.addAll(SHELL).then(() => Promise.all(OPTIONAL.map((u) =>
        fetch(u).then((res) => { if (res.ok) return c.put(u, res); }).catch(() => {})
      )))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;                 // writes pass through untouched
  if (url.hostname.indexOf('script.google.com') !== -1 ||
      url.hostname.indexOf('googleusercontent.com') !== -1) return;  // live API, never cached
  // The manifest decides how Android installs the app — always fetch it
  // fresh so install checks never see a stale copy.
  if (url.pathname === '/manifest.json') return;

  // Navigations: freshest page wins, cached page saves an offline open.
  // Each page is cached under its OWN path — with two pages on this origin,
  // a single shared key would hand the training app the inventory page (or
  // vice versa) on an offline open.
  if (event.request.mode === 'navigate') {
    const pageKey = url.pathname === '/inventory.html' ? '/inventory.html' : '/';
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(pageKey, copy));
          return res;
        })
        .catch(() => caches.match(pageKey))
    );
    return;
  }

  // Everything else (same-origin statics + CDN scripts/fonts): cache-first,
  // refreshing the cached copy in the background when the network allows.
  event.respondWith(
    caches.match(event.request).then((hit) => {
      const refresh = fetch(event.request)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || refresh;
    })
  );
});
