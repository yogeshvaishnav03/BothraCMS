"use client";

import React, { useEffect, useState } from "react";
import { Download, X, Smartphone, CheckCircle, ExternalLink, Sparkles } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function AndroidInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isAndroidDevice, setIsAndroidDevice] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Check if already installed & running in standalone PWA / WebAPK mode
    const standaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes("android-app://");

    setIsStandalone(standaloneMode);
    if (standaloneMode) return;

    // 2. Detect Android or mobile user agent
    const ua = navigator.userAgent || "";
    const isAndroid = /Android/i.test(ua);
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    setIsAndroidDevice(isAndroid || isMobile);

    // 3. Check dismissal memory (24h cooldown)
    const dismissedTime = localStorage.getItem("bothra_android_prompt_dismissed");
    const isDismissedRecently =
      dismissedTime && Date.now() - parseInt(dismissedTime, 10) < 24 * 60 * 60 * 1000;

    // 4. Listen for browser install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!isDismissedRecently) {
        // Show banner after brief delay so initial load is smooth
        setTimeout(() => setShowBanner(true), 2500);
      }
    };

    // 5. Listen for successful install
    const handleAppInstalled = () => {
      setInstalledSuccess(true);
      setShowBanner(false);
      setDeferredPrompt(null);
      setTimeout(() => setInstalledSuccess(false), 4000);
    };

    // 6. Listen for manual trigger from menu/settings
    const handleManualTrigger = () => {
      if (deferredPrompt) {
        deferredPrompt.prompt().then(() => {
          deferredPrompt.userChoice.then((choice) => {
            if (choice.outcome === "accepted") {
              setDeferredPrompt(null);
              setShowBanner(false);
            }
          });
        });
      } else {
        setShowInstructionsModal(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener("open-android-install-prompt", handleManualTrigger);

    // If on Android and prompt didn't fire within 4s, but user hasn't dismissed, show banner
    const timer = setTimeout(() => {
      if (!standaloneMode && (isAndroid || isMobile) && !isDismissedRecently) {
        setShowBanner(true);
      }
    }, 4000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("open-android-install-prompt", handleManualTrigger);
      clearTimeout(timer);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setShowBanner(false);
        setDeferredPrompt(null);
      }
    } else {
      // Show Android step-by-step instructions
      setShowInstructionsModal(true);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem("bothra_android_prompt_dismissed", Date.now().toString());
  };

  // If running standalone, no install banner needed
  if (isStandalone) return null;

  return (
    <>
      {/* Success Notification */}
      {installedSuccess && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle className="w-5 h-5 text-emerald-200" />
          <div>
            <div className="text-xs font-bold">Bothra CMS Installed!</div>
            <div className="text-[11px] text-emerald-100">App added to your Android home screen.</div>
          </div>
        </div>
      )}

      {/* Floating Bottom Android Install Banner */}
      {showBanner && !isStandalone && (
        <aside
          role="region"
          aria-label="Android App Installation"
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50 bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-amber-500/30 animate-in fade-in slide-in-from-bottom-6 duration-300"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-white shrink-0 shadow-md ring-2 ring-amber-400/20">
              <Smartphone className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black tracking-wide text-amber-400 uppercase">Android App Available</span>
                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded-full border border-emerald-500/30">
                  Fast & Offline
                </span>
              </div>
              <h4 className="text-sm font-bold text-white mt-0.5">Install Bothra CMS</h4>
              <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                Install as a native Android app for 1-tap launcher access, instant site updates, and offline support.
              </p>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleInstallClick}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Install App</span>
                </button>
                <button
                  onClick={handleDismiss}
                  className="text-xs font-medium text-slate-400 hover:text-white px-2.5 py-2 rounded-xl hover:bg-white/5 transition-colors"
                >
                  Later
                </button>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              aria-label="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </aside>
      )}

      {/* Android Step-by-Step Instructions Modal */}
      {showInstructionsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 text-white rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Install on Android Device</h3>
                  <p className="text-[11px] text-slate-400">Add Bothra CMS directly to your home screen</p>
                </div>
              </div>
              <button
                onClick={() => setShowInstructionsModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3.5">
              <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-2xl border border-slate-700/50">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div className="text-xs text-slate-300">
                  Tap the <strong className="text-white">Three Dots (⋮)</strong> menu in the top right corner of Chrome or your Android browser.
                </div>
              </div>

              <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-2xl border border-slate-700/50">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div className="text-xs text-slate-300">
                  Select <strong className="text-amber-400">"Install app"</strong> or <strong className="text-amber-400">"Add to Home screen"</strong> from the menu options.
                </div>
              </div>

              <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-2xl border border-slate-700/50">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div className="text-xs text-slate-300">
                  Tap <strong className="text-white">"Install"</strong> in the confirmation popup. The Bothra CMS app icon will appear on your Android home screen and app drawer!
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowInstructionsModal(false)}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 rounded-xl transition-all shadow-md active:scale-95"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Utility to manually trigger Android install prompt from any button/menu */
export function triggerAndroidInstall() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("open-android-install-prompt"));
  }
}
