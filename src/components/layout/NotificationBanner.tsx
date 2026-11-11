"use client";

import { useEffect, useState } from "react";
import { Bell, X, CheckCircle2, Loader2, Share } from "lucide-react";
import { isIos, isMobile, isInstalled } from "@/components/layout/PushToggle";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import { shouldShowIosPushInstallPrompt } from "@/lib/device-platform";
import { subscribeBrowserPush, syncExistingPushSubscription } from "@/lib/push-client";

let hasAutoSyncedPushThisSession: string | false = false;

export function NotificationBanner() {
  const { user } = useAppSession();
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIosPrompt, setIsIosPrompt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) {
      return;
    }

    const hasNotificationApi = "Notification" in window;
    const hasServiceWorker = "serviceWorker" in navigator;

    // 1. Silent Background Auto-Sync if permission is already granted (re-runs if signed-in user switches)
    if (hasNotificationApi && hasServiceWorker && Notification.permission === "granted") {
      setShowPrompt(false);
      if (hasAutoSyncedPushThisSession === user.id) {
        return;
      }
      hasAutoSyncedPushThisSession = user.id;
      (async () => {
        const res = await syncExistingPushSubscription();
        if (!res.synced) {
          // Allow retry on next mount/navigation if transient failure prevented sync
          if (hasAutoSyncedPushThisSession === user.id) {
            hasAutoSyncedPushThisSession = false;
          }
          console.debug("[NotificationBanner] Auto-sync notice:", res.error);
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
  }, [user?.id]);

  const handleDismiss = (days = 3) => {
    try {
      localStorage.setItem("bothra_push_prompt_dismissed_until", String(Date.now() + days * 24 * 60 * 60 * 1000));
    } catch {}
    setShowPrompt(false);
  };

  const handleEnable = async () => {
    setBusy(true);
    setErrorMsg("");
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        const res = await subscribeBrowserPush({ test: true });
        if (res.ok) {
          if (user?.id) hasAutoSyncedPushThisSession = user.id;
          setSuccess(true);
          setTimeout(() => setShowPrompt(false), 3500);
        } else {
          setErrorMsg(res.error || "Could not finish push setup on this device. Tap Retry or open Alerts.");
        }
      } else if (permission === "denied") {
        handleDismiss(7);
      } else {
        setErrorMsg("Permission prompt was dismissed. Tap Enable Alerts when ready.");
      }
    } catch {
      setErrorMsg("Could not enable push alerts right now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!showPrompt) return null;

  const deviceName = isMobile() ? "mobile device" : "laptop / PC";

  return (
    <div className="fixed top-[calc(4.25rem+env(safe-area-inset-top,0px))] lg:top-20 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.5rem)] max-w-xl animate-fade-in pointer-events-auto">
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
                  Get instant alerts for material orders, expenses, site reports, and approvals.
                </p>
                {errorMsg && (
                  <p className="text-rose-300 text-[11px] font-medium mt-1">{errorMsg}</p>
                )}
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
