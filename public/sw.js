/* Bothra CMS service worker: lets the site app open with no signal.
 * - Built files (/_next/static) are kept once and reused.
 * - Navigations and /api/auth/me go to the network first; the last good copy is
 *   used when there is no signal, and /offline when there is none.
 * - Data API calls go straight to the network without service-worker cloning/cache writes.
 * - Alerts pushed by the server show as phone notifications; tapping one opens its page.
 */
const VERSION = "bothra-v9";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const SHELL = [
  "/offline",
  "/manifest.webmanifest",
  "/manifest.json",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
];

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
  // On localhost / dev server, bypass service worker caching completely
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return;
  // The buyer portal, logging in and out, and file/binary downloads are always live.
  // (/api/auth/me is kept so the app still knows who is logged in with no signal.)
  if (
    (url.pathname.startsWith("/api/auth") && url.pathname !== "/api/auth/me") ||
    url.pathname.startsWith("/portal") ||
    url.pathname.startsWith("/api/portal") ||
    url.pathname.startsWith("/api/exports") ||
    url.pathname.startsWith("/api/download")
  ) {
    return;
  }

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
  if (url.pathname === "/api/auth/me") {
    event.respondWith(networkFirst(request));
  }
});

// Phone & Laptop alerts: the server sends {title, body, href, tag}.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Bothra CMS";
  const cleanTag = typeof data.tag === "string" && data.tag.trim().length > 0 ? data.tag.trim() : undefined;
  const targetHref = typeof data.href === "string" && data.href.startsWith("/") ? data.href : "/";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    vibrate: [200, 100, 200],
    requireInteraction: false,
    data: { href: targetHref },
    actions: [{ action: "open", title: "View Details" }],
    // Chromium throws TypeError if renotify: true is passed without a non-empty tag.
    ...(cleanTag ? { tag: cleanTag, renotify: true } : {}),
  };
  event.waitUntil(
    self.registration.showNotification(title, options).catch(() =>
      self.registration.showNotification(title, {
        body: options.body,
        icon: options.icon,
        data: options.data,
        ...(cleanTag ? { tag: cleanTag } : {}),
      })
    )
  );
});

// Tapping an alert opens its page, in the app window if one is already open.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawHref = (event.notification.data && event.notification.data.href) || "/";
  let href;
  try {
    href = new URL(rawHref, self.location.origin);
  } catch {
    href = new URL("/", self.location.origin);
  }
  if (href.origin !== self.location.origin) return;

  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const sameOriginWins = wins.filter((w) => {
        try {
          return new URL(w.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });
      const win = sameOriginWins.find((w) => w.focused) || sameOriginWins[0];
      if (win) {
        try {
          if ("focus" in win) await win.focus();
        } catch {}
        if ("navigate" in win) {
          try {
            return await win.navigate(href.href);
          } catch {}
        }
        try {
          win.postMessage({ type: "BOTHRA_NAVIGATE", href: href.pathname + href.search + href.hash });
          return;
        } catch {}
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(href.href);
      }
    })()
  );
});
