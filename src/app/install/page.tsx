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
  ArrowRight,
  HardHat,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { triggerAndroidInstall } from "@/components/pwa/AndroidInstallPrompt";

export default function InstallAppPage() {
  const [copied, setCopied] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isAndroid, setIsAndroid] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true;
      setIsStandalone(standalone);

      const ua = navigator.userAgent || "";
      setIsAndroid(/Android/i.test(ua));
    }
  }, []);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Install Bothra CMS on Android",
          text: "Install Bothra CMS app on your phone for offline site operations and attendance.",
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
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                  Android Web App
                </span>
                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  v1.0 Ready
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-1">
                Install Bothra CMS on Android
              </h1>
              <p className="text-xs text-slate-300 mt-1">
                Full-screen native experience designed for site supervisors, engineers, and management.
              </p>
            </div>
          </div>

          {/* Primary Action Button */}
          <div className="space-y-3 pt-2">
            <button
              onClick={triggerAndroidInstall}
              className="w-full bg-gradient-brand hover:brightness-110 text-slate-950 font-black py-4 px-6 rounded-2xl text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-glow active:scale-[0.98] transition-all"
            >
              <Download className="w-5 h-5 text-slate-950" />
              <span>Tap Here to Install App</span>
            </button>

            <button
              onClick={handleShare}
              className="w-full bg-white/[0.06] hover:bg-white/10 text-slate-200 text-xs font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition"
            >
              <Share2 className="w-4 h-4 text-amber-400" />
              <span>{copied ? "Link Copied to Clipboard!" : "Share Install Link via WhatsApp / Team"}</span>
            </button>
          </div>

          {/* Standalone Status Notice */}
          {isStandalone && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-xs text-emerald-300 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>You are already using the installed native application!</span>
            </div>
          )}
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

        {/* 3 Step Install Guide for Chrome on Android */}
        <div className="bg-white/[0.03] ring-1 ring-white/10 rounded-3xl p-5 sm:p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Manual Installation Guide for Android (Chrome)
          </h3>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                1
              </div>
              <div className="text-xs text-slate-300">
                In Google Chrome, tap the <strong className="text-white">Three Dots (⋮)</strong> menu in the upper-right corner.
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                2
              </div>
              <div className="text-xs text-slate-300">
                Select <strong className="text-amber-400">"Install app"</strong> or <strong className="text-amber-400">"Add to Home screen"</strong>.
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                3
              </div>
              <div className="text-xs text-slate-300">
                Tap <strong className="text-white">"Install"</strong> in the popup. Bothra CMS is now installed on your phone!
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-slate-500">
        Bothra CMS • Progressive Web Application for Android & Desktop
      </footer>
    </div>
  );
}
