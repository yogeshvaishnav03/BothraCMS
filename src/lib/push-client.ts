"use client";

/**
 * Shared browser Web Push, Service Worker registration, and local OS
 * notification helpers used across NotificationBanner, PushToggle,
 * AppSessionProvider, and Shell logout.
 */

export function keyBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function keysMatch(existingKey: ArrayBuffer | null | undefined, expected: Uint8Array): boolean {
  if (!existingKey) return true;
  const current = new Uint8Array(existingKey);
  return current.length === expected.length && current.every((b, i) => b === expected[i]);
}

export async function registerServiceWorkerWithTimeout(timeoutMs = 10_000): Promise<ServiceWorkerRegistration> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported in this browser.");
  }

  const registered =
    (await navigator.serviceWorker.getRegistration().catch(() => undefined)) ||
    (await navigator.serviceWorker.register("/sw.js"));

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ready = await Promise.race<ServiceWorkerRegistration | null>([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    return ready || registered;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface SubscribePushResult {
  ok: boolean;
  error?: string;
  test?: { sent?: number; failed?: number } | null;
}

async function fetchServerVapidKey(): Promise<{ publicKey?: string; error?: string }> {
  const res = await fetch("/api/push", { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success || !json?.data?.publicKey) {
    return { error: json?.error?.message || "Push service is currently unavailable." };
  }
  return { publicKey: json.data.publicKey };
}

async function saveSubscriptionOnServer(sub: PushSubscription, test: boolean) {
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...sub.toJSON(), ...(test ? { test: true } : {}) }),
  });
  const json = await res.json().catch(() => null);
  return { res, json };
}

/**
 * Registers the service worker, subscribes to browser push with the org's VAPID key,
 * and saves the subscription for the signed-in user. Automatically rotates the browser
 * subscription if a previous user on the same shared mobile device still owns the old endpoint.
 */
export async function subscribeBrowserPush(options?: { test?: boolean }): Promise<SubscribePushResult> {
  try {
    const reg = await registerServiceWorkerWithTimeout();
    if (!reg.pushManager) {
      return { ok: false, error: "Push notifications are not available in this browser view." };
    }

    const { publicKey, error } = await fetchServerVapidKey();
    if (!publicKey) {
      return { ok: false, error: error || "Could not load push configuration." };
    }

    const wantedKey = keyBytes(publicKey);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !keysMatch(sub.options?.applicationServerKey, wantedKey)) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: wantedKey,
      });
    }

    const sendTest = Boolean(options?.test);
    let { res, json } = await saveSubscriptionOnServer(sub, sendTest);

    // Shared phone recovery: another user previously held this browser push endpoint.
    // Revoke and mint a fresh endpoint + keypair for the currently authenticated user.
    if (res.status === 403) {
      await sub.unsubscribe().catch(() => {});
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: wantedKey,
      });
      ({ res, json } = await saveSubscriptionOnServer(sub, sendTest));
    }

    if (!res.ok || !json?.success) {
      return {
        ok: false,
        error: json?.error?.message || "Could not save notification subscription for this device.",
      };
    }

    return { ok: true, test: json?.data?.test ?? null };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Could not enable push alerts on this browser.",
    };
  }
}

/**
 * Silent auto-sync called when Notification.permission is already "granted".
 * Ensures the browser SW is registered, subscription VAPID key is current, and
 * the current authenticated user is bound to this device in the database.
 */
export async function syncExistingPushSubscription(): Promise<{ synced: boolean; error?: string }> {
  try {
    const reg = await registerServiceWorkerWithTimeout();
    if (!reg.pushManager) return { synced: false };

    const { publicKey } = await fetchServerVapidKey();
    if (!publicKey) return { synced: false };

    const wantedKey = keyBytes(publicKey);
    const sub = await reg.pushManager.getSubscription();

    if (sub && keysMatch(sub.options?.applicationServerKey, wantedKey)) {
      const checkRes = await fetch(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`, { cache: "no-store" });
      const checkJson = await checkRes.json().catch(() => null);
      if (checkRes.ok && checkJson?.data?.thisDevice) {
        return { synced: true };
      }
    }

    const res = await subscribeBrowserPush({ test: false });
    return { synced: res.ok, error: res.error };
  } catch (err: any) {
    return { synced: false, error: err?.message };
  }
}

/**
 * Removes this device's push subscription from the currently signed-in user's account.
 * On logout we clear only the server mapping so the next user on a shared phone isn't
 * blocked and the signed-out user stops receiving alerts; explicit "Turn off" also unsubscribes.
 */
export async function unsubscribeCurrentDevicePush(unsubscribeBrowser = false): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (!sub) return;
    await fetch(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" }).catch(() => {});
    if (unsubscribeBrowser) {
      await sub.unsubscribe().catch(() => {});
    }
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Displays a local OS notification while a tab is backgrounded.
 * Prefers ServiceWorkerRegistration.showNotification() because mobile browsers
 * (Android Chrome / TWA / PWA) throw TypeError on `new Notification()`.
 */
export async function showDeviceNotification(params: {
  title: string;
  body: string;
  href?: string;
  tag?: string;
}): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return false;
  }

  const cleanTag = typeof params.tag === "string" && params.tag.trim().length > 0 ? params.tag.trim() : undefined;
  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
    body: params.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { href: params.href || "/" },
    ...(cleanTag ? { tag: cleanTag, renotify: true } : {}),
  };

  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.showNotification) {
        await reg.showNotification(params.title, options);
        return true;
      }
    } catch {
      // Fall through to Notification constructor when SW notification fails
    }
  }

  try {
    const n = new Notification(params.title, {
      body: params.body,
      icon: "/icons/icon-192.png",
      ...(cleanTag ? { tag: cleanTag } : {}),
    });
    n.onclick = () => {
      window.focus();
      if (params.href) window.location.assign(params.href);
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
