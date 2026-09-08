/**
 * Service Worker: Elder Salviejo Mission Vault
 * Enables 1-tap "Add to Home Screen" PWA installability and fast offline caching.
 */

const CACHE_NAME = 'elder-salviejo-v1';
const STATIC_SHELL = [
  '/',
  '/gallery',
  '/call',
  '/book',
  '/css/tailwind.min.css',
  '/css/main.css',
  '/Icon.ico',
  '/assets/images/elder-salviejo.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_SHELL).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network-first strategy for API and dynamic views, cache fallback for static shell
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // For API calls, always fetch fresh from network
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for shell assets
        if (response && response.status === 200 && (url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname.endsWith('.jpg') || url.pathname.endsWith('.ico'))) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
