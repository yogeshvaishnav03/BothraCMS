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
  Check,
} from "lucide-react";
import { triggerAndroidInstall } from "@/components/pwa/AndroidInstallPrompt";

export default function InstallAppPage() {
  const [copied, setCopied] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

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
    }
  }, []);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Download Bothra CMS Android APK",
          text: "Download and install the Bothra CMS Android App (.apk) for site management and attendance.",
          url,
        });
      } catch {
        // User cancelled share
      }
    } else {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-chrome text-white flex flex-col justify-between p-4 sm:p-6 selection:bg-amber-500 selection:text-slate-950">
      <div className="max-w-xl mx-auto w-full py-8 space-y-6">
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

        {/* Hero Card */}
        <div className="bg-white/[0.04] backdrop-blur-xl ring-1 ring-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center font-bold text-2xl shadow-glow ring-4 ring-amber-400/20 shrink-0">
              <HardHat className="w-9 h-9 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                  Android APK Package
                </span>
                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Ready to Download
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-1">
                Bothra CMS for Android
              </h1>
              <p className="text-xs text-slate-300 mt-1">
                Download the official Android APK file (.apk) to install directly on any Android smartphone or tablet.
              </p>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="space-y-3 pt-2">
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
                <FileCheck className="w-3.5 h-3.5" /> Signed APK
              </span>
            </div>

            {/* Instant Browser Install (PWA Option) */}
            <button
              onClick={triggerAndroidInstall}
              className="w-full bg-white/[0.06] hover:bg-white/[0.10] text-slate-200 text-xs font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 ring-1 ring-white/10 transition active:scale-98"
            >
              <Smartphone className="w-4 h-4 text-amber-400" />
              <span>Or 1-Tap Install in Chrome (No APK download needed)</span>
            </button>

            {/* Share Button */}
            <button
              onClick={handleShare}
              className="w-full bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition"
            >
              <Share2 className="w-4 h-4 text-amber-400" />
              <span>{copied ? "Link Copied to Clipboard!" : "Share Download Link with Team via WhatsApp"}</span>
            </button>
          </div>

          {/* Standalone Status Notice */}
          {isStandalone && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-xs text-emerald-300 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>You are currently running inside the installed application!</span>
            </div>
          )}
        </div>

        {/* 3 Step APK Installation Guide */}
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
                Tap <strong className="text-white">&ldquo;Download Android APK File&rdquo;</strong> above to download <code className="text-amber-400 font-mono">bothra-cms.apk</code>.
              </div>
            </div>

            <div className="flex items-start gap-3 bg-slate-900/40 p-3 rounded-2xl border border-white/5">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                2
              </div>
              <div className="text-xs text-slate-300">
                Open your phone notification bar or <strong className="text-white">Downloads</strong> folder and tap on <strong className="text-amber-400">bothra-cms.apk</strong>.
              </div>
            </div>

            <div className="flex items-start gap-3 bg-slate-900/40 p-3 rounded-2xl border border-white/5">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                3
              </div>
              <div className="text-xs text-slate-300">
                Tap <strong className="text-white">&ldquo;Install&rdquo;</strong>. If your phone asks for permission to install from Chrome or My Files, tap <strong className="text-amber-400">Settings &rarr; Allow from this source</strong>, then tap Install. The Bothra CMS app icon will appear in your apps!
              </div>
            </div>
          </div>
        </div>

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
              <h4 className="text-xs font-bold text-white">No URL Bar / Full-Screen</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Runs just like an app installed from Google Play with maximum screen space for tables & forms.
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
                Get real-time phone alerts for incoming chat messages, site approvals, and daily deadlines.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-slate-500">
        Bothra CMS • Native Android Application Package (.apk) & Progressive Web App
      </footer>
    </div>
  );
}
