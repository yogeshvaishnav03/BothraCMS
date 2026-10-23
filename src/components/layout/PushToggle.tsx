"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff, Loader2 } from "lucide-react";

/** The server's public key, from base64url to the bytes the browser wants. */
function keyBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "install" | "blocked" | "off" | "on";

const isIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
const isInstalled = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true);

/**
 * "Alerts on this phone": turns Web Push on or off for this browser. Shown at
 * the top of the alerts panel. On iPhone push only works once the app is on
 * the home screen, so it says how to do that instead.
 */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(isIos() && !isInstalled() ? "install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) return setState("off");
      const res = await fetch(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      setState(res?.data?.thisDevice ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setBusy(true);
    setNote("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const { data } = await fetch("/api/push", { cache: "no-store" }).then((r) => r.json());
      let sub = await reg.pushManager.getSubscription();
      // A subscription made with another key cannot be used; start again.
      if (sub && sub.options.applicationServerKey) {
        const current = new Uint8Array(sub.options.applicationServerKey);
        const wanted = keyBytes(data.publicKey);
        if (current.length !== wanted.length || current.some((b, i) => b !== wanted[i])) {
          await sub.unsubscribe();
          sub = null;
        }
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.publicKey) });
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sub.toJSON(), test: true }),
      });
      if (!res.ok) throw new Error();
      setState("on");
      setNote("Done. A test alert is on its way.");
    } catch {
      setNote("Could not turn on alerts here. Try again, or use Chrome.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" });
        await sub.unsubscribe();
      }
      setState("off");
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported") return null;

  return (
    <div className="mx-2 mt-2 mb-1 px-3 py-2 rounded-xl bg-slate-50 ring-1 ring-slate-200 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-slate-700 font-semibold">
          {state === "on" ? <BellRing className="w-4 h-4 text-emerald-600" /> : <BellOff className="w-4 h-4 text-slate-400" />}
          <span>{state === "on" ? "Alerts on this phone: on" : "Alerts on this phone"}</span>
        </div>
        {state === "off" && (
          <button onClick={turnOn} disabled={busy} className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold disabled:opacity-50 flex items-center gap-1">
            {busy && <Loader2 className="w-3 h-3 animate-spin" />}Turn on
          </button>
        )}
        {state === "on" && (
          <button onClick={turnOff} disabled={busy} className="px-2.5 py-1 rounded-lg ring-1 ring-slate-300 text-slate-600 font-semibold disabled:opacity-50">
            Turn off
          </button>
        )}
      </div>
      {state === "install" && (
        <p className="text-slate-500 mt-1">On iPhone, tap Share, then Add to Home Screen, and open the app from there to turn on alerts.</p>
      )}
      {state === "blocked" && <p className="text-slate-500 mt-1">Notifications are blocked for this site. Allow them in the browser&apos;s site settings, then reopen this panel.</p>}
      {note && <p className="text-slate-500 mt-1">{note}</p>}
    </div>
  );
}
