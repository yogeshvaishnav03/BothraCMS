/* Bothra CMS service worker: lets the site app open with no signal.
 * - Built files (/_next/static) are kept once and reused.
 * - Pages and GET API calls go to the network first; the last good copy is
 *   used when there is no signal, and /offline when there is none.
 * - Nothing that changes data is cached; saves made offline wait in the
 *   app's own outbox (IndexedDB) instead.
 */
const VERSION = "bothra-v3";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const SHELL = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

// The no-signal page must work even if it was never opened, so its scripts and styles are kept too.
async function precache() {
  const c = await caches.open(STATIC);
  await c.addAll(SHELL);
  const html = await (await c.match("/offline")).text();
  const assets = Array.from(new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) || []));
  await Promise.all(assets.map((a) => c.add(a).catch(() => {})));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(request, fallback) {
  return fetch(request)
    .then((res) => {
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(PAGES).then((c) => c.put(request, copy));
      }
      return res;
    })
    .catch(() => caches.match(request).then((hit) => hit || (fallback ? caches.match(fallback) : Response.error())));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The buyer portal, logging in and out, and file downloads are always live.
  // (/api/auth/me is kept so the app still knows who is logged in with no signal.)
  if ((url.pathname.startsWith("/api/auth") && url.pathname !== "/api/auth/me") || url.pathname.startsWith("/portal") || url.pathname.startsWith("/api/portal") || url.pathname.startsWith("/api/exports")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(request, copy));
            }
            return res;
          })
      )
    );
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/offline"));
    return;
  }
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) {
    event.respondWith(networkFirst(request));
  }
});
