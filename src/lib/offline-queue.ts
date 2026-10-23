"use client";

/**
 * A small outbox for the site app. When there is no signal, a stage update or
 * a daily report (with its photos) is kept in IndexedDB on the phone and sent
 * when the phone is back online. Photos are uploaded first and their links
 * added to the saved request just before it is sent.
 */

export interface QueuedPhoto {
  blob: Blob;
  name: string;
  entityType: string;
  entityId?: string;
  projectId?: string | null;
}

export interface QueuedRequest {
  id: string;
  /** What the person sees in the outbox, e.g. "Slab casting: 75%". */
  label: string;
  url: string;
  method: string;
  body: Record<string, unknown>;
  photos: QueuedPhoto[];
  /** The body field the uploaded photo links are appended to. */
  photoField?: string;
  createdAt: string;
  tries: number;
  /** Set when the server refused it, so it is not retried forever. */
  failed?: string | null;
  /** Sent as X-Offline-Ref so the server handles it once, however many times it arrives. */
  ref?: string;
}

export const QUEUE_EVENT = "bothra-outbox-changed";
const DB = "bothra-offline";
const STORE = "outbox";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}

function changed() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(QUEUE_EVENT));
}

export function canQueue() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** fetch throws a TypeError when there is no network at all. */
export function isNetworkError(e: unknown) {
  return e instanceof TypeError || isOffline();
}

export async function listQueued(): Promise<QueuedRequest[]> {
  if (!canQueue()) return [];
  const rows = await tx<QueuedRequest[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedRequest[]>);
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export function newRef() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function enqueue(item: Omit<QueuedRequest, "id" | "createdAt" | "tries">) {
  const row: QueuedRequest = { ref: newRef(), ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString(), tries: 0 };
  await tx("readwrite", (s) => s.put(row));
  changed();
  return row;
}

export async function clearQueue() {
  if (!canQueue()) return;
  await tx("readwrite", (s) => s.clear());
  changed();
}

export async function discard(id: string) {
  await tx("readwrite", (s) => s.delete(id));
  changed();
}

async function uploadPhoto(p: QueuedPhoto): Promise<string> {
  const form = new FormData();
  form.append("file", p.blob, p.name);
  form.append("entityType", p.entityType);
  if (p.entityId) form.append("entityId", p.entityId);
  if (p.projectId) form.append("projectId", p.projectId);
  form.append("category", "PHOTO");
  const res = await fetch("/api/attachments", { method: "POST", body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data?.url) throw new RefusedError(json?.error?.message || `Could not upload ${p.name}`, res.status);
  return json.data.url as string;
}

class RefusedError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

/**
 * Sends one saved request: photos first, then the request itself. Each photo
 * that goes up is moved into the saved request as a link straight away, so a
 * retry after the signal drops does not upload it again.
 */
async function send(item: QueuedRequest, onStep?: (now: QueuedRequest) => void) {
  let current = item;
  while (current.photos.length) {
    const url = await uploadPhoto(current.photos[0]);
    const body = { ...current.body };
    if (current.photoField) body[current.photoField] = [...((body[current.photoField] as string[]) || []), url];
    current = { ...current, body, photos: current.photos.slice(1) };
    onStep?.(current);
    if (current.id) {
      const saved = current;
      await tx("readwrite", (s) => s.put(saved));
    }
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (current.ref) headers["X-Offline-Ref"] = current.ref;
  const res = await fetch(current.url, { method: current.method, headers, body: JSON.stringify(current.body) });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new RefusedError(json?.error?.message || "The server did not accept it", res.status);
  return json.data;
}

/**
 * Every open tab flushes when the signal returns. A browser lock lets only
 * one tab send at a time, so nothing is sent twice; the next tab then finds
 * the outbox already empty.
 */
function acrossTabs<T>(run: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  return locks ? (locks.request("bothra-outbox-flush", run) as Promise<T>) : run();
}

let flushing: Promise<{ sent: number; failed: number; left: number }> | null = null;

/**
 * Sends everything saved on the phone, oldest first. Stops at the first
 * network failure; a refusal from the server (say the stage was deleted) is
 * marked on the item so the person can see it and discard it.
 */
export function flushQueue() {
  if (!flushing) {
    flushing = acrossTabs(async () => {
      let sent = 0;
      let failed = 0;
      for (const item of await listQueued()) {
        if (item.failed) continue;
        try {
          await send(item);
          await tx("readwrite", (s) => s.delete(item.id));
          sent++;
        } catch (e) {
          // Read it back: photos sent before the failure are now links in it.
          const latest = (await tx<QueuedRequest | undefined>("readonly", (s) => s.get(item.id) as IDBRequest<QueuedRequest | undefined>)) || item;
          if (e instanceof RefusedError && e.status !== 401 && e.status < 500) {
            await tx("readwrite", (s) => s.put({ ...latest, tries: latest.tries + 1, failed: e.message }));
            failed++;
            continue;
          }
          await tx("readwrite", (s) => s.put({ ...latest, tries: latest.tries + 1 }));
          break;
        }
      }
      changed();
      return { sent, failed, left: (await listQueued()).length };
    }).finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

/**
 * Posts now when there is signal. With no signal (or if the network drops
 * mid-send) the request is saved to the outbox instead.
 */
export async function submitOrQueue<T = unknown>(req: {
  label: string;
  url: string;
  method?: string;
  body: Record<string, unknown>;
  photos?: QueuedPhoto[];
  photoField?: string;
  /** Extra fields added only when the request is saved for later, e.g. the time it was made. */
  whenQueued?: Record<string, unknown>;
}): Promise<{ queued: false; data: T } | { queued: true }> {
  // The same id is used if a send that may have reached the server is saved for a retry.
  const item = { label: req.label, url: req.url, method: req.method || "POST", body: req.body, photos: req.photos || [], photoField: req.photoField, ref: newRef() };
  let progress: Omit<QueuedRequest, "id" | "createdAt" | "tries"> = item;
  const later = () => enqueue({ ...progress, body: { ...progress.body, ...(req.whenQueued || {}) } });
  if (isOffline() && canQueue()) {
    await later();
    return { queued: true };
  }
  try {
    const data = await send({ ...item, id: "", createdAt: "", tries: 0 }, ({ id, createdAt, tries, ...rest }) => (progress = rest));
    return { queued: false, data: data as T };
  } catch (e) {
    if (isNetworkError(e) && canQueue()) {
      await later();
      return { queued: true };
    }
    throw e;
  }
}
