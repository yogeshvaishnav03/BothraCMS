"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CloudOff, Loader2, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { discard, flushQueue, listQueued, QUEUE_EVENT, type QueuedRequest } from "@/lib/offline-queue";

/**
 * Registers the service worker (so the app opens with no signal), shows when
 * the phone is offline, and lists stage updates and reports waiting to be
 * sent. Everything waiting goes out by itself when the signal comes back.
 */
export default function OfflineBar() {
  const [online, setOnline] = useState(true);
  const [items, setItems] = useState<QueuedRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listQueued()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await flushQueue();
      if (r.sent) setNote(`${r.sent} saved update${r.sent === 1 ? "" : "s"} sent.`);
    } catch {
      // Still no signal; try again on the next "online" event.
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [refresh]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();
    if (navigator.onLine) sync();
    const up = () => {
      setOnline(true);
      sync();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    window.addEventListener(QUEUE_EVENT, refresh);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      window.removeEventListener(QUEUE_EVENT, refresh);
    };
  }, [refresh, sync]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 5000);
    return () => clearTimeout(t);
  }, [note]);

  const waiting = items.filter((i) => !i.failed);
  const refused = items.filter((i) => i.failed);
  if (online && items.length === 0 && !note) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-3 lg:px-8">
      <div className={`rounded-xl px-3 py-2.5 text-sm ring-1 ${online ? "bg-sky-50 text-sky-900 ring-sky-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {online ? <UploadCloud className="h-4 w-4 shrink-0" /> : <CloudOff className="h-4 w-4 shrink-0" />}
          <span className="font-semibold">{online ? (note && items.length === 0 ? note : "Back online") : "No signal"}</span>
          {!online && <span className="text-xs">Stage updates, daily reports, check-ins, material requests and quality checks are saved on this phone and sent when you are back online.</span>}
          {items.length > 0 && (
            <button onClick={() => setOpen((o) => !o)} className="text-xs font-bold underline underline-offset-2">
              {waiting.length > 0 && `${waiting.length} waiting to send`}
              {waiting.length > 0 && refused.length > 0 && " · "}
              {refused.length > 0 && `${refused.length} not accepted`}
            </button>
          )}
          {online && waiting.length > 0 && (
            <button
              onClick={sync}
              disabled={syncing}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50"
            >
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Send now
            </button>
          )}
        </div>
        {open && items.length > 0 && (
          <ul className="mt-2 space-y-1 border-t border-current/10 pt-2 text-xs">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{i.label}</span>
                  {i.photos.length > 0 && ` · ${i.photos.length} photo${i.photos.length === 1 ? "" : "s"}`}
                  <span className="text-slate-500"> · saved {new Date(i.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span>
                  {i.failed && <span className="block text-rose-600">Not accepted: {i.failed}</span>}
                </span>
                <button onClick={() => discard(i.id)} className="rounded p-1 text-slate-400 hover:text-rose-600" aria-label={`Discard ${i.label}`} title="Discard">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
