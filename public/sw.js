const CACHE_NAME = 'helpaid-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/src/main.tsx',
  '/src/index.css',
  '/src/App.tsx',
  '/favicon.ico'
];

// Offline guides data backup in case API call fails when offline
const EMERGENCY_GUIDES_FALLBACK = [
  {
    title: "CPR",
    urgency: "CRITICAL",
    steps: ["Check responsiveness", "Call emergency services (108)", "Compress chest 30 times", "Give 2 breaths", "Repeat"],
    warnings: ["Do not compress if the victim is breathing normally."]
  },
  {
    title: "Fracture",
    urgency: "HIGH",
    steps: ["Keep bone still", "Apply a cold pack", "Immobilize the area with splint"],
    warnings: ["Do not align the bone yourself."]
  },
  {
    title: "Burns",
    urgency: "HIGH",
    steps: ["Cool the burn with running water for 10 minutes", "Cover with clean wrap", "Take pain reliever"],
    warnings: ["Do not apply ice, butter, or paste directly."]
  }
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static app shell assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event (Stale-While-Revalidate with API Offline Mockups)
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // If it is a backend API fetch call
  if (requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If successful response, clone and cache it
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // If network is offline, check cache
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // Offline fallback JSON responses based on route
            if (requestUrl.pathname.endsWith('/first-aid-guides')) {
              return new Response(JSON.stringify(EMERGENCY_GUIDES_FALLBACK), {
                headers: { 'Content-Type': 'application/json' }
              });
            }
            
            return new Response(JSON.stringify({
              error: 'Operating offline. Emergency features are restricted.',
              offline: true
            }), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
  } else {
    // Standard static resource fetch (Cache first, then network fallback)
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request);
      })
    );
  }
});
