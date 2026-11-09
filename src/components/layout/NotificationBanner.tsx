"use client";

import { useEffect, useState } from "react";
import { Bell, X, CheckCircle2, Loader2, Share } from "lucide-react";
import { keyBytes, isIos, isMobile, isInstalled } from "@/components/layout/PushToggle";
import { shouldShowIosPushInstallPrompt } from "@/lib/device-platform";

let hasAutoSyncedPushThisSession = false;

export function NotificationBanner() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIosPrompt, setIsIosPrompt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hasNotificationApi = "Notification" in window;
    const hasServiceWorker = "serviceWorker" in navigator;

    // 1. Silent Background Auto-Sync if permission is already granted (once per document load)
    if (hasNotificationApi && hasServiceWorker && Notification.permission === "granted") {
      if (hasAutoSyncedPushThisSession) {
        return;
      }
      hasAutoSyncedPushThisSession = true;
      (async () => {
        try {
          const reg = await navigator.serviceWorker.ready;
          let sub = await reg.pushManager.getSubscription();
          const { data } = await fetch("/api/push", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
          if (!data?.publicKey) return;

          if (sub && sub.options.applicationServerKey) {
            const current = new Uint8Array(sub.options.applicationServerKey);
            const wanted = keyBytes(data.publicKey);
            if (current.length !== wanted.length || current.some((b, i) => b !== wanted[i])) {
              await sub.unsubscribe();
              sub = null;
            }
          }

          if (!sub) {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: keyBytes(data.publicKey),
            });
          }

          const check = await fetch(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`, { cache: "no-store" })
            .then((r) => r.json())
            .catch(() => null);

          if (!check?.data?.thisDevice) {
            await fetch("/api/push", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...sub.toJSON() }),
            });
          }
        } catch (err) {
          console.debug("[NotificationBanner] Auto-sync notice:", err);
        }
      })();
      return;
    }

    // 2. Check dismissal cooldown
    let dismissedUntil: string | null = null;
    try {
      dismissedUntil = localStorage.getItem("bothra_push_prompt_dismissed_until");
    } catch {}
    if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
      return;
    }

    // 3. For iOS Safari tabs, Notification does not exist until added to Home Screen
    if (
      shouldShowIosPushInstallPrompt({
        ios: isIos(),
        installed: isInstalled(),
        hasNotificationApi,
        notificationPermission: hasNotificationApi ? Notification.permission : undefined,
      })
    ) {
      setIsIosPrompt(true);
      setShowPrompt(true);
      return;
    }

    // 4. If permission is still "default", show enable banner
    if (hasNotificationApi && hasServiceWorker && Notification.permission === "default") {
      setShowPrompt(true);
    }
  }, []);

  const handleDismiss = (days = 3) => {
    try {
      localStorage.setItem("bothra_push_prompt_dismissed_until", String(Date.now() + days * 24 * 60 * 60 * 1000));
    } catch {}
    setShowPrompt(false);
  };

  const handleEnable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
        await navigator.serviceWorker.ready;
        const { data } = await fetch("/api/push", { cache: "no-store" }).then((r) => r.json());
        let sub = await reg.pushManager.getSubscription();

        if (sub && sub.options.applicationServerKey) {
          const current = new Uint8Array(sub.options.applicationServerKey);
          const wanted = keyBytes(data.publicKey);
          if (current.length !== wanted.length || current.some((b, i) => b !== wanted[i])) {
            await sub.unsubscribe();
            sub = null;
          }
        }

        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: keyBytes(data.publicKey),
          });
        }

        await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...sub.toJSON(), test: true }),
        });

        setSuccess(true);
        setTimeout(() => setShowPrompt(false), 3500);
      } else {
        handleDismiss(1);
      }
    } catch {
      handleDismiss(1);
    } finally {
      setBusy(false);
    }
  };

  if (!showPrompt) return null;

  const deviceName = isMobile() ? "mobile device" : "laptop / PC";

  return (
    <div className="fixed top-20 md:top-20 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.5rem)] max-w-xl animate-fade-in pointer-events-auto">
      <div className="bg-slate-950/95 backdrop-blur-md border border-amber-500/40 text-white p-3.5 sm:p-4 rounded-2xl shadow-2xl flex items-start sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
            {success ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Bell className="w-5 h-5" />}
          </div>
          <div className="min-w-0 text-xs sm:text-sm">
            {success ? (
              <p className="font-bold text-emerald-400">
                ✅ Notifications activated on this {deviceName}! A test alert is on its way.
              </p>
            ) : isIosPrompt ? (
              <div>
                <p className="font-bold text-white flex items-center gap-1.5">
                  <span>Enable Alerts on iPhone</span>
                </p>
                <p className="text-slate-300 text-xs mt-0.5 leading-relaxed">
                  In Safari, tap Share <Share className="w-3.5 h-3.5 inline text-amber-400 mx-0.5 align-text-bottom" /> ➔ &ldquo;Add to Home Screen&rdquo; to install Bothra CMS and turn on instant push alerts.
                </p>
              </div>
            ) : (
              <div>
                <p className="font-bold text-white">
                  Turn on alerts for this {deviceName}
                </p>
                <p className="text-slate-300 text-xs mt-0.5">
                  Get real-time notification alerts for orders, expenses, site reports, and approvals.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!success && !isIosPrompt && (
            <button
              onClick={handleEnable}
              disabled={busy}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
              <span>Enable Alerts</span>
            </button>
          )}

          {isIosPrompt && (
            <button
              onClick={() => handleDismiss(7)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold rounded-lg text-xs transition"
            >
              Got it
            </button>
          )}

          <button
            onClick={() => handleDismiss(3)}
            aria-label="Dismiss notification prompt"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
