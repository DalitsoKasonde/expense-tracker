const CACHE_NAME = "expenses-v0.4";
// Only assets the app actually renders. This list used to precache
// /logo.png (1.4 MB, referenced nowhere) and /inscribed-logo.png (the Open
// Graph image, fetched by crawlers server-side and never by the app), which
// cost every install 1.6 MB it could not use. Existing installs reclaim that
// on the next CACHE_NAME bump, when `activate` drops the old cache.
const STATIC_ASSETS = [
  "/inscribed-wordmark.png",
  "/icon.svg",
  "/mask-icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png"
];

// On install, cache predefined static assets only (not pages)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("Service Worker cache.addAll failed during install:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// On activate, clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // Skip API requests, development endpoints, static chunks, and the manifest
  if (
    url.pathname.includes("/v1/") ||
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("webpack") ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname.endsWith("manifest.json")
  ) {
    return;
  }

  // Navigation requests (HTML pages): network-first with cache fallback
  // This prevents the stale-while-revalidate loop where background
  // revalidation of /today triggers manifest fetches and vice versa.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          return cachedResponse || new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        })
    );
    return;
  }

  // Sub-resources (images, icons, fonts): cache-first with network fallback
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }

      const networkResponse = await fetch(request);
      if (networkResponse && networkResponse.status === 200) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    }).catch(() => {
      return new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      });
    })
  );
});
