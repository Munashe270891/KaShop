/**
 * Tuckshop POS Service Worker
 * Handles Static Caching for 100% Offline App Launching
 */

const CACHE_NAME = 'tuckshop-pos-v1';

// Files required to launch the app UI offline
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './checkout.js',
  './sync.js',
  './manifest.json'
];

// 1. INSTALL EVENT: Cache essential UI files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching App Shell Assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. ACTIVATE EVENT: Clean up old caches on app updates
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing Old Cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. FETCH EVENT: Cache-First Strategy (Serve from phone memory immediately)
self.addEventListener('fetch', (event) => {
  // Ignore API requests (sync requests handled by Box 4 / IndexedDB)
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached app file if found, otherwise request from network
      return cachedResponse || fetch(event.request);
    })
  );
});
