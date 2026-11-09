"use client";

import React, { useEffect, useState, useRef } from "react";
import { Download, X, Smartphone, CheckCircle, ArrowRight, Share, PlusSquare, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  detectDevicePlatform,
  getIosBrowserContext,
  type DevicePlatform,
  type IosBrowserContext,
} from "@/lib/device-platform";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function AndroidInstallPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);
  const [platform, setPlatform] = useState<DevicePlatform>("desktop");
  const [iosBrowser, setIosBrowser] = useState<IosBrowserContext>({
    isIos: false,
    isSafari: false,
    isThirdPartyBrowser: false,
    isInAppBrowser: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Check if already running in standalone PWA / WebAPK mode or already installed
    const standaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      window.matchMedia("(display-mode: window-controls-overlay)").matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes("android-app://") ||
      window.location.search.includes("source=pwa") ||
      localStorage.getItem("bothra_app_installed") === "true";

    setIsStandalone(standaloneMode);
    if (standaloneMode) {
      setShowBanner(false);
      return;
    }

    const detected = detectDevicePlatform();
    const iosCtx = getIosBrowserContext();
    setPlatform(detected);
    setIosBrowser(iosCtx);

    // 2. Check persistent dismissal from localStorage (survives page changes & reloads)
    let isDismissed = false;
    try {
      isDismissed =
        localStorage.getItem("bothra_install_prompt_dismissed") === "true" ||
        sessionStorage.getItem("bothra_install_prompt_dismissed") === "true";
    } catch {}

    // On iPhone/iPad, Apple Safari does not emit beforeinstallprompt,
    // so show the non-intrusive install banner unless already dismissed or on /install.
    if (detected === "ios" && !isDismissed && pathname !== "/install") {
      setShowBanner(true);
    }

    // 3. Listen for browser install prompt (Chrome / Android / Edge)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      deferredPromptRef.current = promptEvent;
      setDeferredPrompt(promptEvent);

      // Only auto-show banner on mobile devices if never dismissed; never auto-nag on desktop
      if (!isDismissed && detected === "android" && pathname !== "/install") {
        setShowBanner(true);
      }
    };

    // 4. Listen for successful install
    const handleAppInstalled = () => {
      try {
        localStorage.setItem("bothra_app_installed", "true");
        localStorage.setItem("bothra_install_prompt_dismissed", "true");
      } catch {}
      setIsStandalone(true);
      setInstalledSuccess(true);
      setShowBanner(false);
      deferredPromptRef.current = null;
      setDeferredPrompt(null);
      setTimeout(() => setInstalledSuccess(false), 4000);
    };

    // 5. Global trigger event (from top bar, sidebar, menu buttons, /install page)
    const handleManualTrigger = () => {
      const prompt = deferredPromptRef.current;
      if (prompt) {
        prompt.prompt().then(() => {
          prompt.userChoice.then((choice) => {
            if (choice.outcome === "accepted") {
              try {
                localStorage.setItem("bothra_app_installed", "true");
                localStorage.setItem("bothra_install_prompt_dismissed", "true");
              } catch {}
              deferredPromptRef.current = null;
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

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("open-android-install-prompt", handleManualTrigger);
    };
  }, [pathname]);

  const handleInstallClick = async () => {
    handleDismiss();
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        try {
          localStorage.setItem("bothra_app_installed", "true");
        } catch {}
        setIsStandalone(true);
        setShowBanner(false);
        setDeferredPrompt(null);
      }
    } else {
      setShowInstructionsModal(true);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    try {
      localStorage.setItem("bothra_install_prompt_dismissed", "true");
      sessionStorage.setItem("bothra_install_prompt_dismissed", "true");
    } catch {}
  };

  // Lock background scroll while instructions modal is open
  useEffect(() => {
    if (!showInstructionsModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showInstructionsModal]);

  if (isStandalone) return null;

  const isIos = platform === "ios";
  const isAndroid = platform === "android";

  const bannerTagline = isIos
    ? "iPhone & iPad App"
    : isAndroid
      ? "Android Web App"
      : "Official Web App";

  return (
    <>
      {/* Success Notification */}
      {installedSuccess && (
        <div className="fixed top-[calc(1rem+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 max-w-[calc(100%-2rem)]">
          <CheckCircle className="w-5 h-5 text-emerald-200 shrink-0" />
          <div>
            <div className="text-xs font-bold">Bothra CMS Installed Successfully!</div>
            <div className="text-[11px] text-emerald-100">App has been added to your device home screen.</div>
          </div>
        </div>
      )}

      {/* Primary Floating Install Banner */}
      {showBanner && pathname !== "/install" && (
        <aside
          role="region"
          aria-label="App Installation"
          className="fixed bottom-safe-offset left-4 right-4 md:left-auto md:right-6 md:w-[420px] z-50 bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-amber-500/40 animate-in fade-in slide-in-from-bottom-6 duration-300"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 shrink-0 shadow-lg ring-2 ring-amber-400/30">
              <Smartphone className="w-6 h-6 text-slate-950" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-black tracking-wider text-amber-400 uppercase">
                  {bannerTagline}
                </span>
                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded-full border border-emerald-500/30">
                  Works Offline
                </span>
              </div>
              <h4 className="text-sm font-bold text-white mt-0.5">Install Bothra CMS</h4>
              <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                {isIos
                  ? "Add to your iPhone Home Screen in Safari for full-screen mode, GPS check-in, and push alerts."
                  : "Install as a native application for full-screen view, faster performance, and 1-tap launcher access."}
              </p>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleInstallClick}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
                >
                  {isIos ? <Share className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                  <span>{isIos ? "How to Install" : "Install App"}</span>
                </button>
                <Link
                  href="/install"
                  onClick={handleDismiss}
                  className="text-xs font-medium text-amber-300 hover:text-white px-2.5 py-2 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-1"
                >
                  <span>Details</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
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

      {/* Platform-Aware Step-by-Step Instructions Modal */}
      {showInstructionsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 text-white rounded-3xl p-5 sm:p-6 max-w-md w-full max-h-[90dvh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">
                    {isIos
                      ? "Install on iPhone / iPad"
                      : isAndroid
                        ? "Install on Android Device"
                        : "Install Bothra CMS App"}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isIos
                      ? "Add Bothra CMS to your Apple Home Screen (no App Store needed)"
                      : "Add Bothra CMS directly to your device"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowInstructionsModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIos ? (
              <div className="py-4 space-y-3.5">
                {iosBrowser.isInAppBrowser && (
                  <div className="flex items-start gap-2.5 bg-amber-500/15 border border-amber-500/40 p-3 rounded-2xl text-xs text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white block">Open in Safari first</strong>
                      You are inside an in-app browser (such as WhatsApp or Instagram). Tap the{" "}
                      <strong className="text-amber-300">Safari / ⋯</strong> icon to open this link in{" "}
                      <strong className="text-white">Safari</strong>.
                    </div>
                  </div>
                )}

                {iosBrowser.isThirdPartyBrowser && (
                  <div className="flex items-start gap-2.5 bg-blue-500/15 border border-blue-500/40 p-3 rounded-2xl text-xs text-blue-200">
                    <Smartphone className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white">Using Chrome/Edge on iPhone?</strong> Tap{" "}
                      <strong className="text-amber-300">Share (⎙)</strong> in the address bar →{" "}
                      <strong className="text-white">Add to Home Screen</strong>, or open in{" "}
                      <strong className="text-white">Safari</strong>.
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-2xl border border-slate-700/50">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </div>
                  <div className="text-xs text-slate-300 leading-relaxed">
                    In <strong className="text-white">Safari</strong>, tap the{" "}
                    <strong className="text-amber-400 inline-flex items-center gap-1">
                      Share <Share className="w-3.5 h-3.5 inline" />
                    </strong>{" "}
                    button at the bottom (or top) toolbar.
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-2xl border border-slate-700/50">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </div>
                  <div className="text-xs text-slate-300 leading-relaxed">
                    Scroll down the share sheet and tap{" "}
                    <strong className="text-amber-400 inline-flex items-center gap-1">
                      <PlusSquare className="w-3.5 h-3.5 inline" /> &ldquo;Add to Home Screen&rdquo;
                    </strong>
                    .
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-2xl border border-slate-700/50">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </div>
                  <div className="text-xs text-slate-300 leading-relaxed">
                    Tap <strong className="text-white">&ldquo;Add&rdquo;</strong> in the top right corner, then launch{" "}
                    <strong className="text-amber-400">Bothra CMS</strong> from your Home Screen icon for full-screen
                    mode and push notifications (iOS 16.4+).
                  </div>
                </div>
              </div>
            ) : isAndroid ? (
              <div className="py-4 space-y-3.5">
                <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-2xl border border-slate-700/50">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </div>
                  <div className="text-xs text-slate-300">
                    Tap the <strong className="text-white">Three Dots (⋮)</strong> menu button in the top right corner of Chrome or your browser.
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-2xl border border-slate-700/50">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </div>
                  <div className="text-xs text-slate-300">
                    Select <strong className="text-amber-400">&ldquo;Install app&rdquo;</strong> (or{" "}
                    <strong className="text-amber-400">&ldquo;Add to Home screen&rdquo;</strong>) from the menu list.
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-2xl border border-slate-700/50">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </div>
                  <div className="text-xs text-slate-300">
                    Tap <strong className="text-white">&ldquo;Install&rdquo;</strong> in the confirmation popup, or download the{" "}
                    <strong className="text-amber-400">.apk</strong> directly from the Install Portal!
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-4 space-y-3.5">
                <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-2xl border border-slate-700/50">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </div>
                  <div className="text-xs text-slate-300">
                    <strong className="text-white">On iPhone / iPad:</strong> Open this URL in{" "}
                    <strong className="text-amber-400">Safari</strong>, tap{" "}
                    <strong className="text-white">Share (⎙) → Add to Home Screen</strong>.
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-2xl border border-slate-700/50">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </div>
                  <div className="text-xs text-slate-300">
                    <strong className="text-white">On Android:</strong> Open in{" "}
                    <strong className="text-amber-400">Chrome</strong> or open the{" "}
                    <strong className="text-white">Install Portal</strong> to download{" "}
                    <code className="text-amber-300">bothra-cms.apk</code>.
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-800/60 p-3 rounded-2xl border border-slate-700/50">
                  <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </div>
                  <div className="text-xs text-slate-300">
                    <strong className="text-white">On Desktop:</strong> Click the{" "}
                    <strong className="text-amber-400">Install (⊕)</strong> icon in Chrome/Edge&apos;s address bar.
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center gap-2">
              <Link
                href="/install"
                onClick={() => setShowInstructionsModal(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs py-2.5 rounded-xl text-center transition"
              >
                View Install Portal
              </Link>
              <button
                onClick={() => setShowInstructionsModal(false)}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 rounded-xl transition-all shadow-md active:scale-95"
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

/** Utility to manually trigger the platform-appropriate app install prompt from any button/menu */
export function triggerAndroidInstall() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("open-android-install-prompt"));
  }
}

export const triggerAppInstall = triggerAndroidInstall;
export const AppInstallPrompt = AndroidInstallPrompt;
