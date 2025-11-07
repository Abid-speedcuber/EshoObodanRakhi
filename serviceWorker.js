const CACHE_NAME = 'esho-obodan-rakhi-v6';
const urlsToCache = [
  '/',
  '/index.html',
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
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache opened');
        return cache.addAll(urlsToCache.map(url => {
          return new Request(url, { cache: 'reload' });
        })).catch(err => {
          console.log('Cache addAll error:', err);
        });
      })
  );
  self.skipWaiting();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin) && 
      !event.request.url.includes('cdn.tailwindcss.com') &&
      !event.request.url.includes('cdn.jsdelivr.net') &&
      !event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          // Don't cache Supabase API calls
          if (!event.request.url.includes('supabase.co/rest') && 
              !event.request.url.includes('supabase.co/auth')) {
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
          }

          return response;
        }).catch(() => {
          // If both cache and network fail, show offline page
          return caches.match('/bEOR.html');
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Background sync for offline data
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  // This will be called when connection is restored
  console.log('Background sync triggered');
  // You can add logic here to sync offline data with Supabase
}

// Push notification support (for future use)
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'New update available',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification('Esho Obodan Rakhi', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});