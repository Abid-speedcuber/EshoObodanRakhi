// ================================
// SERVICE WORKER - Modern Offline-First PWA
// Version: 10.0
// ================================

const CACHE_VERSION = 'eor-v10';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// Critical resources that MUST be cached for offline functionality
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/css/tailwind.css',
  '/js/main.js',
  '/js/fund.js',
  '/js/blood.js',
  '/js/auth.js',
  '/js/activities.js',
  '/js/notes.js',
  '/js/notifications.js',
  '/js/messages.js',
  '/manifest.webmanifest'
];

// SVG icons (lightweight, cache all)
const SVG_ASSETS = [
  '/svgs/icon-settings.svg',
  '/svgs/icon-fund.svg',
  '/svgs/announcement-icon.svg',
  '/svgs/blood-donation-icon.svg',
  '/svgs/icon-previous.svg',
  '/svgs/icon-next.svg',
  '/svgs/icon-copy.svg',
  '/svgs/icon-location.svg',
  '/svgs/icon-call.svg',
  '/svgs/icon-edit.svg',
  '/svgs/icon-delete.svg',
  '/svgs/icon-bump.svg',
  '/svgs/icon-eye.svg',
  '/svgs/icon-eye-slash.svg',
  '/svgs/overview-icon.svg',
  '/svgs/icon-refresh.svg',
  '/svgs/icon-search.svg',
  '/svgs/icon-close.svg',
  '/svgs/icon-home.svg',
  '/svgs/icon-google.svg',
  '/svgs/icon-info.svg',
  '/svgs/icon-file.svg',
  '/svgs/icon-quit.svg',
  '/svgs/icon-import.svg',
  '/svgs/icon-export.svg',
  '/svgs/icon-backup.svg',
  '/svgs/icon-restore.svg',
  '/svgs/blood-donation-icon.svg'
];

// External CDN resources (cache with network fallback)
const EXTERNAL_RESOURCES = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// URLs that should NEVER be cached (always fetch fresh)
const NETWORK_ONLY_PATTERNS = [
  /\/rest\/v1\//,           // Supabase REST API
  /\/auth\/v1\//,           // Supabase Auth API
  /\/storage\/v1\//,        // Supabase Storage
  /analytics/,              // Analytics
  /google-analytics/,
  /googletagmanager/
];

// Cache duration limits (in milliseconds)
const CACHE_DURATIONS = {
  static: 7 * 24 * 60 * 60 * 1000,    // 7 days
  dynamic: 24 * 60 * 60 * 1000,        // 24 hours
  images: 30 * 24 * 60 * 60 * 1000     // 30 days
};

// Maximum cache sizes
const MAX_CACHE_SIZES = {
  dynamic: 50,   // Max 50 dynamic resources
  images: 30     // Max 30 images
};

// ================================
// INSTALLATION
// ================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    (async () => {
      try {
        // Open static cache
        const staticCache = await caches.open(STATIC_CACHE);

        // Cache critical assets first (with retry logic)
        await Promise.all(
          CRITICAL_ASSETS.map(async (url) => {
            try {
              const response = await fetch(url, { cache: 'reload' });
              if (response.ok) {
                await staticCache.put(url, response);
                console.log(`[SW] Cached: ${url}`);
              }
            } catch (err) {
              console.warn(`[SW] Failed to cache ${url}:`, err);
            }
          })
        );

        // Cache SVG assets (non-blocking)
        SVG_ASSETS.forEach(async (url) => {
          try {
            const response = await fetch(url);
            if (response.ok) await staticCache.put(url, response);
          } catch (err) {
            console.warn(`[SW] Failed to cache SVG ${url}`);
          }
        });

        // Cache external resources (non-blocking)
        EXTERNAL_RESOURCES.forEach(async (url) => {
          try {
            const response = await fetch(url);
            if (response.ok) await staticCache.put(url, response);
          } catch (err) {
            console.warn(`[SW] Failed to cache external ${url}`);
          }
        });

        console.log('[SW] Installation complete!');
      } catch (error) {
        console.error('[SW] Installation failed:', error);
        throw error;
      }
    })()
  );

  // Activate immediately
  self.skipWaiting();
});

// ================================
// ACTIVATION
// ================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name.startsWith('eor-') && !name.startsWith(CACHE_VERSION))
          .map(name => {
            console.log(`[SW] Deleting old cache: ${name}`);
            return caches.delete(name);
          })
      );

      // Take control of all pages immediately
      await self.clients.claim();

      console.log('[SW] Activation complete!');
    })()
  );
});

// ================================
// FETCH STRATEGY
// ================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) protocols
  if (!url.protocol.startsWith('http')) return;

  // Network-only for API calls
  if (NETWORK_ONLY_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(fetch(request));
    return;
  }

  // Determine strategy based on resource type
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
  } else if (isImageAsset(url)) {
    event.respondWith(cacheFirstStrategy(request, IMAGE_CACHE));
  } else {
    event.respondWith(networkFirstStrategy(request));
  }
});

// ================================
// CACHING STRATEGIES
// ================================

// Cache First (for static assets)
async function cacheFirstStrategy(request, cacheName) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      // Check if cache is stale
      const cacheTime = new Date(cachedResponse.headers.get('date')).getTime();
      const now = Date.now();
      const duration = CACHE_DURATIONS[cacheName.includes('static') ? 'static' : 'images'];

      if (now - cacheTime < duration) {
        // Cache is fresh, return it
        return cachedResponse;
      }
    }

    // Cache miss or stale - fetch from network
    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    // Network failed, return cached version even if stale
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log(`[SW] Serving stale cache for: ${request.url}`);
      return cachedResponse;
    }

    // No cache available
    return new Response('Offline - Resource not available', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Network First (for dynamic content)
async function networkFirstStrategy(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request, {
      // Add timeout for faster fallback
      signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
    });

    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      await cache.put(request, networkResponse.clone());
      
      // Enforce cache size limit
      await limitCacheSize(DYNAMIC_CACHE, MAX_CACHE_SIZES.dynamic);
    }

    return networkResponse;
  } catch (error) {
    // Network failed - try cache
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      console.log(`[SW] Serving cached version for: ${request.url}`);
      return cachedResponse;
    }

    // No cache available - return offline page for navigations
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/index.html');
      if (offlinePage) return offlinePage;
    }

    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// ================================
// HELPER FUNCTIONS
// ================================

function isStaticAsset(url) {
  return CRITICAL_ASSETS.some(asset => url.pathname.includes(asset)) ||
         SVG_ASSETS.some(asset => url.pathname.includes(asset)) ||
         url.pathname.endsWith('.css') ||
         url.pathname.endsWith('.js');
}

function isImageAsset(url) {
  return url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i);
}

async function limitCacheSize(cacheName, maxSize) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    if (keys.length > maxSize) {
      // Remove oldest entries
      const toDelete = keys.slice(0, keys.length - maxSize);
      await Promise.all(toDelete.map(key => cache.delete(key)));
      console.log(`[SW] Trimmed ${toDelete.length} items from ${cacheName}`);
    }
  } catch (error) {
    console.error(`[SW] Error limiting cache size:`, error);
  }
}

// ================================
// BACKGROUND SYNC
// ================================
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);

  if (event.tag === 'sync-notes') {
    event.waitUntil(syncNotes());
  } else if (event.tag === 'sync-offline-data') {
    event.waitUntil(syncOfflineData());
  }
});

async function syncNotes() {
  console.log('[SW] Syncing notes...');
  // This will trigger the main app to sync notes
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_NOTES' });
  });
}

async function syncOfflineData() {
  console.log('[SW] Syncing offline data...');
  // This will trigger the main app to sync any pending offline changes
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_OFFLINE_DATA' });
  });
}

// ================================
// PUSH NOTIFICATIONS
// ================================
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Esho Obodan Rakhi';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/svgs/icon-app.png',
    badge: '/svgs/icon-app.png',
    vibrate: [200, 100, 200],
    data: data.url || '/',
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'close', title: 'Close' }
    ],
    tag: data.tag || 'default',
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const urlToOpen = event.notification.data || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if app is already open
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// ================================
// MESSAGE HANDLING
// ================================
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(clearAllCaches());
  } else if (event.data.type === 'GET_CACHE_SIZE') {
    event.waitUntil(getCacheSize().then(size => {
      event.ports[0].postMessage({ type: 'CACHE_SIZE', size });
    }));
  }
});

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter(name => name.startsWith('eor-'))
      .map(name => caches.delete(name))
  );
  console.log('[SW] All caches cleared');
}

async function getCacheSize() {
  const cacheNames = await caches.keys();
  let totalSize = 0;

  for (const name of cacheNames) {
    if (name.startsWith('eor-')) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      
      for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          totalSize += blob.size;
        }
      }
    }
  }

  return totalSize;
}

// ================================
// PERIODIC BACKGROUND SYNC
// ================================
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sync-notes-periodic') {
    event.waitUntil(syncNotes());
  }
});

console.log('[SW] Service Worker loaded successfully!');