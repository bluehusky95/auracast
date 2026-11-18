/**
 * BadgeCast service worker.
 *
 * Strategy:
 *   - Precache the app shell (HTML) on install.
 *   - Cache-first for hashed assets in <base>/assets/* (immutable, content-hashed).
 *   - Network-first for the navigation HTML (so deploys are picked up).
 *   - Bypass everything else (Bluetooth has no HTTP layer; the HTTP bridge
 *     calls localhost APIs that should never be cached).
 *
 * Everything is relative to the worker's own folder (its scope), so the app
 * can live in a subfolder of another site (pupblue.com/badgecast/). Caches
 * are shared by the whole site, so this worker only ever deletes its own.
 */

const PREFIX = 'badgecast-';
const VERSION = PREFIX + 'v2';
const BASE = new URL(self.registration.scope).pathname; // e.g. "/" or "/badgecast/"
const APP_SHELL = [BASE, BASE + 'index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      // Only this app's old versions (and the pre-rename AuraCast cache).
      Promise.all(keys.filter((k) => (k.startsWith(PREFIX) || k.startsWith('auracast-')) && k !== VERSION).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Same-origin only; never cache the local Python bridge or third-party CDNs.
  if (url.origin !== self.location.origin) return;

  // Hashed bundles under <base>/assets/ are immutable: cache-first.
  if (url.pathname.startsWith(BASE + 'assets/')) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Navigation requests: network-first so deploys roll out immediately,
  // falling back to cache when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(BASE, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(BASE).then((m) => m || caches.match(BASE + 'index.html'))),
    );
  }
});
