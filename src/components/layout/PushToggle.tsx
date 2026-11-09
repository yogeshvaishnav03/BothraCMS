"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff, Loader2, Send } from "lucide-react";
import { isIosDevice } from "@/lib/device-platform";

/** The server's public key, from base64url to the bytes the browser wants. */
export function keyBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "install" | "blocked" | "off" | "on";

export const isIos = () => isIosDevice();
export const isMobile = () =>
  typeof navigator !== "undefined" &&
  (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || isIosDevice());
export const isInstalled = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true);

/**
 * "Notifications on this device": turns Web Push on or off for this browser.
 * Shown at the top of the alerts panel. Works on Android, iPhone (iOS 16.4+ installed),
 * and desktop / laptop browsers (Chrome, Edge, Safari, Firefox).
 */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [note, setNote] = useState("");

  const deviceLabel = isMobile() ? "phone" : "laptop / PC";

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
      const res = await fetch(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null);
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
      setNote("Alerts enabled! A test notification was dispatched.");
    } catch {
      setNote("Could not turn on alerts here. Please check site permissions or try Chrome/Edge.");
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

  async function sendTestAlert() {
    setTesting(true);
    setNote("");
    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testOnly: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setNote("Test alert sent! Check your system banner / notification center.");
      } else {
        // Fallback: try resubscribing with test: true
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...sub.toJSON(), test: true }),
          });
          setNote("Test alert sent! Check your system banner / notification center.");
        } else {
          setNote("Could not deliver test notification. Try turning alerts off and on again.");
        }
      }
    } catch {
      setNote("Failed to dispatch test alert.");
    } finally {
      setTesting(false);
    }
  }

  if (state === "loading" || state === "unsupported") return null;

  return (
    <div className="mx-2 mt-2 mb-1 px-3 py-2.5 rounded-xl bg-slate-50 ring-1 ring-slate-200 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-slate-700 font-semibold min-w-0">
          {state === "on" ? <BellRing className="w-4 h-4 text-emerald-600 shrink-0" /> : <BellOff className="w-4 h-4 text-slate-400 shrink-0" />}
          <span className="truncate">
            {state === "on" ? `Alerts on this ${deviceLabel}: on` : `Alerts on this ${deviceLabel}`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {state === "off" && (
            <button
              onClick={turnOn}
              disabled={busy}
              className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1 shadow-xs transition"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              Turn on
            </button>
          )}
          {state === "on" && (
            <>
              <button
                onClick={sendTestAlert}
                disabled={busy || testing}
                title="Send a test notification to verify sound and banner"
                className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold disabled:opacity-50 flex items-center gap-1 transition shadow-2xs"
              >
                {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                <span>Test</span>
              </button>
              <button
                onClick={turnOff}
                disabled={busy || testing}
                className="px-2 py-1 rounded-lg ring-1 ring-slate-300 text-slate-600 font-semibold hover:bg-slate-100 disabled:opacity-50 transition"
              >
                Turn off
              </button>
            </>
          )}
        </div>
      </div>
      {state === "install" && (
        <p className="text-slate-500 mt-1 text-[11px] leading-relaxed">
          On iPhone / iPad, open in Safari, tap the Share icon ⎙ then &ldquo;Add to Home Screen&rdquo;, and open Bothra CMS from your home screen to enable push alerts.
        </p>
      )}
      {state === "blocked" && (
        <p className="text-rose-600 mt-1 text-[11px] leading-relaxed">
          Notifications are blocked in your browser settings. Click the site settings icon (lock icon in URL bar) to allow notifications, then reload.
        </p>
      )}
      {note && <p className="text-slate-600 mt-1 text-[11px] font-medium">{note}</p>}
    </div>
  );
}
