/* Bothra CMS service worker: lets the site app open with no signal.
 * - Built files (/_next/static) are kept once and reused.
 * - Pages and GET API calls go to the network first; the last good copy is
 *   used when there is no signal, and /offline when there is none.
 * - Nothing that changes data is cached; saves made offline wait in the
 *   app's own outbox (IndexedDB) instead.
 * - Alerts pushed by the server show as phone notifications; tapping one
 *   opens its page.
 */
const VERSION = "bothra-v4";
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

// Phone alerts: the server sends {title, body, href, tag}.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Bothra CMS", {
      body: data.body || "",
      tag: data.tag || undefined,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { href: data.href || "/" },
    })
  );
});

// Tapping an alert opens its page, in the app window if one is already open.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = new URL((event.notification.data && event.notification.data.href) || "/", self.location.origin);
  if (href.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) return win.focus().then((w) => (w && "navigate" in w ? w.navigate(href.href) : null));
      return self.clients.openWindow(href.href);
    })
  );
});
