const CACHE_NAME = 'xhoffraix-v13';
const BASE_PATH = '/xhoffraix';

const urlsToCache = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/activities.json`,
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Install event - cache core resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - different strategies based on resource type
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Don't cache icon files - let them load directly
  if (url.pathname.includes('icon-') || 
      url.pathname.includes('apple-touch-icon') || 
      url.pathname.includes('favicon')) {
    return;
  }
  
  // Network-first for HTML and activities.json (refresh when online, fallback to cache offline)
  if (url.pathname.endsWith('.html') || 
      url.pathname.endsWith('/') || 
      url.pathname.endsWith('activities.json')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Update cache with fresh content
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // Offline - serve from cache
          return caches.match(event.request).then((response) => {
            if (response) {
              return response;
            }
            // Fallback to index.html for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match(`${BASE_PATH}/index.html`);
            }
          });
        })
    );
    return;
  }
  
  // Cache-first for OpenStreetMap tiles (save viewed tiles, don't refetch)
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((response) => {
          if (response) {
            // Tile already cached - return it
            return response;
          }
          // Tile not cached - fetch and cache it
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // Offline and tile not cached - return empty response
            return new Response('', { status: 503, statusText: 'Service Unavailable' });
          });
        });
      })
    );
    return;
  }
  
  // Cache-first for external resources (Leaflet, fonts, etc.)
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
          // Cache good responses
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        });
      })
      .catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match(`${BASE_PATH}/index.html`);
        }
      })
  );
});
