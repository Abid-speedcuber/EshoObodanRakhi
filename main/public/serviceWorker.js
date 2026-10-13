const CACHE = "eor-react-v2";
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch("/index.html", { cache: "reload" });
      if (!response.ok) throw new Error("App shell could not be fetched");
      const html = await response.clone().text();
      const assets = [
        ...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g),
      ].map((match) => match[1]);
      await cache.put("/index.html", response);
      await cache.addAll([
        ...new Set(assets),
        "/icon.png",
        "/manifest.webmanifest",
        ...[
          "fund",
          "refresh",
          "settings",
          "previous",
          "next",
          "search",
          "close",
          "location",
          "call",
          "copy",
          "edit",
          "delete",
          "google",
          "eye",
          "eye-slash",
        ].map((name) => `/svgs/icon-${name}.svg`),
        "/svgs/blood-donation-icon.svg",
        "/svgs/overview-icon.svg",
      ]);
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Retire the legacy worker's files and previous React build caches.
      for (const name of await caches.keys())
        if (name.startsWith("eor-") && name !== CACHE)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Authentication and donor/fund responses never enter the service worker cache.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
  } else if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/svgs/") ||
    ["/icon.png", "/manifest.webmanifest"].includes(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        // Fingerprinted public assets are identical regardless of the Origin
        // header added to module/CSS requests. Some hosts return Vary: Origin.
        const cached = await caches.match(request, { ignoreVary: true });
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok)
          (await caches.open(CACHE)).put(request, response.clone());
        return response;
      })(),
    );
  }
});
