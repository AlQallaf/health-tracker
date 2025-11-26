// service-worker.js
const CACHE_NAME = "health-tracker-cache-v45";

const ASSETS = [
  // NOTE: no "/" or "./" here – they caused duplicate URL requests
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/db.js",
  "./js/utils.js",
  "./js/ui.js",
  "./js/daily.js",
  "./js/routine.js",
  "./js/weekly.js",
  "./js/monthly.js",
  "./js/routineManager.js",
  "./js/dataManager.js",
  "./js/dayPlanner.js",
  "./js/labelScanner.js",
  "./js/settings.js",
  "./js/setup.js",
  "./js/ai/modelLoader.js",
  "./js/ai/chat.js",
  "./js/ai/healthCoach.js",
  "./js/ai/ui.js",
  "./tests/test-runner.html",
  "./tests/test-runner.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

const ALLOWED_EXTERNAL_ORIGINS = [
  "https://cdn.jsdelivr.net",
  "https://generativelanguage.googleapis.com",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // 1) NAVIGATION REQUESTS (PWA launch, address bar, reload)
  //    Offline-first: if we have index.html cached, always serve it.
  if (request.mode === "navigate") {
    const url = new URL(request.url);
    // Allow test runner navigations to load directly (no SPA shell)
    if (url.pathname.includes("/tests/")) {
      event.respondWith(
        fetch(request).catch(() =>
          caches.match(request).then((cached) => cached || caches.match("./tests/test-runner.html"))
        )
      );
      return;
    }

    // For app navigations, prefer network for the actual request; fall back to cached index.html.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === "basic") {
            caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", response.clone()));
          }
          return response;
        })
        .catch(() =>
          caches.match("./index.html").then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // 2) Only handle GET requests
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const allowedExternal = ALLOWED_EXTERNAL_ORIGINS.includes(url.origin);

  // Ignore random third-party stuff
  if (!sameOrigin && !allowedExternal) {
    return;
  }

  // 3) Cache-first for assets; fall back to network; never cache bad responses
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          // If response is missing or not ok (e.g., ngrok error page), don't cache it
          if (!response || !response.ok) {
            return response;
          }

          const responseClone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, responseClone));
          return response;
        })
        .catch(() => {
          // If we asked for HTML and failed, fall back to app shell
          const accept = request.headers.get("Accept") || "";
          if (accept.includes("text/html")) {
            return caches.match("./index.html");
          }
          return new Response("", { status: 503, statusText: "Offline" });
        });
    })
  );
});
