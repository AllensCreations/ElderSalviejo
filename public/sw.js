/**
 * Service Worker: Elder Salviejo Missionary Vault
 * High-Speed Intelligent Image & Asset Caching Engine
 * 
 * Features:
 * 1. Cache-First Strategy for all images (never re-downloads existing pictures)
 * 2. Cross-Origin CDN caching for jsDelivr & image hosts
 * 3. Stale-While-Revalidate caching for API data
 * 4. PWA offline support & 1-tap installation
 */

const CACHE_VERSION = 'v2';
const STATIC_CACHE = `elder-salviejo-shell-${CACHE_VERSION}`;
const IMAGE_CACHE = `elder-salviejo-images-${CACHE_VERSION}`;
const DATA_CACHE = `elder-salviejo-data-${CACHE_VERSION}`;

const STATIC_SHELL = [
  '/',
  '/gallery',
  '/call',
  '/book',
  '/css/tailwind.min.css',
  '/css/main.css',
  '/css/week.css',
  '/js/index.js',
  '/js/gallery.js',
  '/js/week.js',
  '/js/countdown.js',
  '/js/book.js',
  '/Icon.ico',
  '/assets/images/elder-salviejo.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_SHELL).catch((err) => {
        console.warn('Service worker pre-cache warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (![STATIC_CACHE, IMAGE_CACHE, DATA_CACHE].includes(key)) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

function isImageRequest(request, url) {
  return (
    request.destination === 'image' ||
    /\.(jpe?g|png|webp|svg|gif|ico|heic)(\?.*)?$/i.test(url.pathname) ||
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('ibb.co') ||
    url.pathname.includes('/assets/images/') ||
    url.pathname.includes('/vault/photos/')
  );
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. IMAGE REQUESTS: Cache-First strategy (never redownload images once cached)
  if (isImageRequest(event.request, url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          // Serve immediately from cache (0ms perceived load)
          return cachedResponse;
        }

        // Fetch from network and save to image cache for future requests
        try {
          const networkResponse = await fetch(event.request, { mode: 'cors' });
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            cache.put(event.request, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        } catch (err) {
          // If offline and not in cache, fallback
          return cachedResponse || new Response('', { status: 408, statusText: 'Image unavailable offline' });
        }
      })
    );
    return;
  }

  // 2. API REQUESTS: Stale-While-Revalidate strategy
  if (url.pathname.startsWith('/api/weeks') || url.pathname.startsWith('/api/gallery') || url.pathname.startsWith('/api/stats')) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);

        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone()).catch(() => {});
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        // Return cached version immediately if available, otherwise wait for network
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. STATIC ASSETS & PAGES: Stale-While-Revalidate with Cache Fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
