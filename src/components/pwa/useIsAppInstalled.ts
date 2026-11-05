"use client";

import { useState, useEffect } from "react";

/**
 * Hook to detect if Bothra CMS is running inside the installed PWA / WebAPK application,
 * or if the user has already installed the application on their device.
 * Used to completely hide all "Install App" buttons, prompts, and banners inside the installed app.
 */
export function useIsAppInstalled(): boolean {
  // Start with true to avoid visual layout shift/flash of install buttons during initial paint
  const [isInstalled, setIsInstalled] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkInstalled = () => {
      // 1. Check all standard PWA / WebAPK / TWA standalone display modes
      const isStandaloneMode =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches ||
        window.matchMedia("(display-mode: minimal-ui)").matches ||
        window.matchMedia("(display-mode: window-controls-overlay)").matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes("android-app://") ||
        window.location.search.includes("source=pwa");

      // 2. Check persistent install marker
      const hasInstalledMarker = localStorage.getItem("bothra_app_installed") === "true";

      if (isStandaloneMode) {
        try {
          localStorage.setItem("bothra_app_installed", "true");
        } catch {
          // ignore storage error in restricted contexts
        }
      }

      setIsInstalled(isStandaloneMode || hasInstalledMarker);
    };

    checkInstalled();

    // Listen for browser's official appinstalled event
    const handleAppInstalled = () => {
      try {
        localStorage.setItem("bothra_app_installed", "true");
      } catch {}
      setIsInstalled(true);
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    const mql = window.matchMedia("(display-mode: standalone)");
    mql.addEventListener?.("change", checkInstalled);

    return () => {
      window.removeEventListener("appinstalled", handleAppInstalled);
      mql.removeEventListener?.("change", checkInstalled);
    };
  }, []);

  return isInstalled;
}
