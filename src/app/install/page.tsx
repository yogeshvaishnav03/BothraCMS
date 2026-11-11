"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Smartphone,
  Download,
  WifiOff,
  MapPin,
  Bell,
  Zap,
  CheckCircle2,
  Share2,
  HardHat,
  FileCheck,
  Share,
  PlusSquare,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import { triggerAppInstall } from "@/components/pwa/AndroidInstallPrompt";
import {
  detectDevicePlatform,
  getIosBrowserContext,
  type IosBrowserContext,
} from "@/lib/device-platform";

type PlatformTab = "ios" | "android";

export default function InstallAppPage() {
  const [copied, setCopied] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [selectedTab, setSelectedTab] = useState<PlatformTab>("android");
  const [iosBrowser, setIosBrowser] = useState<IosBrowserContext>({
    isIos: false,
    isSafari: false,
    isThirdPartyBrowser: false,
    isInAppBrowser: false,
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes("android-app://") ||
        window.location.search.includes("source=pwa") ||
        localStorage.getItem("bothra_app_installed") === "true";
      setIsStandalone(standalone);

      const detected = detectDevicePlatform();
      if (detected === "ios") {
        setSelectedTab("ios");
      }
      setIosBrowser(getIosBrowserContext());
    }
  }, []);

  const handleCopyLink = () => {
    if (typeof window === "undefined") return;
    navigator.clipboard?.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Install Bothra CMS App (iPhone & Android)",
          text: "Install the Bothra CMS app on iPhone (Safari -> Add to Home Screen) or Android (.apk) for site management and attendance.",
          url,
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopyLink();
    }
  };

  const isIosTab = selectedTab === "ios";

  return (
    <div className="min-h-dvh bg-gradient-chrome text-white flex flex-col justify-between p-4 sm:p-6 pt-safe pb-safe selection:bg-amber-500 selection:text-slate-950">
      <div className="max-w-xl mx-auto w-full py-6 sm:py-8 space-y-5">
        {/* Top Brand Bar */}
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center font-display font-black text-slate-950 text-base shadow-glow">
              B
            </div>
            <span className="font-display font-extrabold text-white text-lg tracking-tight">
              Bothra <span className="text-gradient-brand">CMS</span>
            </span>
          </Link>
          <Link
            href="/login"
            className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 transition"
          >
            Go to Login
          </Link>
        </div>

        {/* Platform Selector Tabs (iPhone vs Android) */}
        <div
          role="tablist"
          aria-label="Choose device platform"
          className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-white/[0.05] ring-1 ring-white/10"
        >
          <button
            type="button"
            role="tab"
            aria-selected={isIosTab}
            onClick={() => setSelectedTab("ios")}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              isIosTab
                ? "bg-amber-500 text-slate-950 shadow-glow"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>iPhone / iPad (iOS)</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isIosTab}
            onClick={() => setSelectedTab("android")}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              !isIosTab
                ? "bg-amber-500 text-slate-950 shadow-glow"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Android (.apk &amp; Web)</span>
          </button>
        </div>

        {/* Hero Card */}
        <div className="bg-white/[0.04] backdrop-blur-xl ring-1 ring-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center font-bold text-2xl shadow-glow ring-4 ring-amber-400/20 shrink-0">
              <HardHat className="w-9 h-9 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                  {isIosTab ? "Apple iOS Web App" : "Android APK Package"}
                </span>
                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  {isIosTab ? "No App Store Needed" : "Ready to Download"}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-1">
                {isIosTab ? "Bothra CMS for iPhone & iPad" : "Bothra CMS for Android"}
              </h1>
              <p className="text-xs text-slate-300 mt-1">
                {isIosTab
                  ? "iPhone cannot run .apk files. Add Bothra CMS directly to your iPhone Home Screen in Safari to get the full-screen app."
                  : "Download the official Android APK file (.apk) or install with 1 tap directly on any Android smartphone or tablet."}
              </p>
            </div>
          </div>

          {/* Primary Action Buttons */}
          {isIosTab ? (
            <div className="space-y-3 pt-1">
              {iosBrowser.isInAppBrowser && (
                <div className="p-3.5 bg-amber-500/15 border border-amber-400/40 rounded-2xl flex items-start gap-2.5 text-xs text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block">Opened inside WhatsApp / another app?</strong>
                    Tap the <strong className="text-amber-300">Safari / ⋯</strong> button to open this page in{" "}
                    <strong className="text-white">Safari</strong> first, or tap Copy Link below and paste into Safari.
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={triggerAppInstall}
                className="w-full bg-gradient-brand hover:brightness-110 text-slate-950 font-black py-4 px-6 rounded-2xl text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-glow active:scale-[0.98] transition-all"
              >
                <Share className="w-5 h-5 text-slate-950" />
                <span>Show iPhone Install Steps (Share → Add to Home Screen)</span>
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="bg-white/[0.06] hover:bg-white/[0.10] text-slate-200 text-xs font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 ring-1 ring-white/10 transition active:scale-98"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-amber-400" />}
                  <span>{copied ? "Link Copied!" : "Copy Safari Link"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className="bg-white/[0.06] hover:bg-white/[0.10] text-slate-200 text-xs font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 ring-1 ring-white/10 transition active:scale-98"
                >
                  <Share2 className="w-4 h-4 text-amber-400" />
                  <span>Share via WhatsApp</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              {/* Direct APK Download Button */}
              <a
                href="/api/download/apk"
                download="bothra-cms.apk"
                className="w-full bg-gradient-brand hover:brightness-110 text-slate-950 font-black py-4 px-6 rounded-2xl text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-glow active:scale-[0.98] transition-all"
              >
                <Download className="w-5 h-5 text-slate-950" />
                <span>Download Android APK File (.apk)</span>
              </a>
              <div className="flex items-center justify-center gap-3 text-[11px] text-slate-400 font-mono">
                <span>Size: 1.25 MB</span>
                <span>•</span>
                <span>Version: 1.0.0</span>
                <span>•</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <FileCheck className="w-3.5 h-3.5" /> Verified App File
                </span>
              </div>

              {/* Instant Browser Install (PWA Option) */}
              <button
                type="button"
                onClick={triggerAppInstall}
                className="w-full bg-white/[0.06] hover:bg-white/[0.10] text-slate-200 text-xs font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 ring-1 ring-white/10 transition active:scale-98"
              >
                <Smartphone className="w-4 h-4 text-amber-400" />
                <span>Or Install in Chrome (No file download needed)</span>
              </button>

              {/* Share Button */}
              <button
                type="button"
                onClick={handleShare}
                className="w-full bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition"
              >
                <Share2 className="w-4 h-4 text-amber-400" />
                <span>{copied ? "Link Copied to Clipboard!" : "Share Install Link with Team via WhatsApp"}</span>
              </button>
            </div>
          )}

          {/* Standalone Status Notice */}
          {isStandalone && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-xs text-emerald-300 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>You are currently running inside the installed application!</span>
            </div>
          )}
        </div>

        {/* Step-by-Step Guide for Selected OS */}
        {isIosTab ? (
          <div id="ios-steps" className="bg-white/[0.03] ring-1 ring-white/10 rounded-3xl p-5 sm:p-6 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <span>How to Install on iPhone &amp; iPad (Safari)</span>
            </h3>

            <div className="space-y-3">
              <div className="flex items-start gap-3 bg-slate-900/40 p-3 rounded-2xl border border-white/5">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div className="text-xs text-slate-300 leading-relaxed">
                  Open this page in <strong className="text-white">Safari</strong> on your iPhone (over{" "}
                  <code className="text-amber-400 font-mono">https://</code> — if opened from WhatsApp, tap{" "}
                  <strong className="text-white">Open in Safari</strong>).
                </div>
              </div>

              <div className="flex items-start gap-3 bg-slate-900/40 p-3 rounded-2xl border border-white/5">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div className="text-xs text-slate-300 leading-relaxed">
                  Tap the{" "}
                  <strong className="text-amber-400 inline-flex items-center gap-1">
                    Share <Share className="w-3.5 h-3.5 inline" />
                  </strong>{" "}
                  icon at the bottom (iPhone) or top-right (iPad) of Safari, then scroll down and tap{" "}
                  <strong className="text-white inline-flex items-center gap-1">
                    <PlusSquare className="w-3.5 h-3.5 inline text-amber-400" /> &ldquo;Add to Home Screen&rdquo;
                  </strong>
                  .
                </div>
              </div>

              <div className="flex items-start gap-3 bg-slate-900/40 p-3 rounded-2xl border border-white/5">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div className="text-xs text-slate-300 leading-relaxed">
                  Tap <strong className="text-white">&ldquo;Add&rdquo;</strong> in the top-right corner, then open the{" "}
                  <strong className="text-amber-400">Bothra CMS</strong> app icon from your Home Screen. (iOS 16.4+
                  supports instant push alerts once launched from Home Screen.)
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white/[0.03] ring-1 ring-white/10 rounded-3xl p-5 sm:p-6 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <span>How to Install the Downloaded APK on Android</span>
            </h3>

            <div className="space-y-3">
              <div className="flex items-start gap-3 bg-slate-900/40 p-3 rounded-2xl border border-white/5">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div className="text-xs text-slate-300">
                  Tap <strong className="text-white">&ldquo;Download Android APK File&rdquo;</strong> above to download{" "}
                  <code className="text-amber-400 font-mono">bothra-cms.apk</code>.
                </div>
              </div>

              <div className="flex items-start gap-3 bg-slate-900/40 p-3 rounded-2xl border border-white/5">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div className="text-xs text-slate-300">
                  Open your phone notification bar or <strong className="text-white">Downloads</strong> folder and tap on{" "}
                  <strong className="text-amber-400">bothra-cms.apk</strong>.
                </div>
              </div>

              <div className="flex items-start gap-3 bg-slate-900/40 p-3 rounded-2xl border border-white/5">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div className="text-xs text-slate-300">
                  Tap <strong className="text-white">&ldquo;Install&rdquo;</strong>. If your phone asks for permission to install from Chrome or My Files, tap{" "}
                  <strong className="text-amber-400">Settings &rarr; Allow from this source</strong>, then tap Install. The Bothra CMS app icon will appear in your apps!
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="bg-white/[0.03] ring-1 ring-white/10 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <WifiOff className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Works Without Signal</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Access your site data and draft reports even in low-connectivity basement or remote sites.
              </p>
            </div>
          </div>

          <div className="bg-white/[0.03] ring-1 ring-white/10 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Instant GPS Check-In</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Fast 1-tap supervisor and workforce attendance with automatic GPS location verification.
              </p>
            </div>
          </div>

          <div className="bg-white/[0.03] ring-1 ring-white/10 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Full-Screen App View</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Runs like a native app on both iPhone and Android with maximum screen space for tables &amp; forms.
              </p>
            </div>
          </div>

          <div className="bg-white/[0.03] ring-1 ring-white/10 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Push Notifications</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Get real-time alerts on Android and iPhone (iOS 16.4+) for messages, approvals, and deadlines.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-slate-500">
        Bothra CMS • iPhone / iPad Web App (iOS) &amp; Android APK / Progressive Web App
      </footer>
    </div>
  );
}
