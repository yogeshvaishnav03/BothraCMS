"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Universal hook to access and synchronize the active site filter across all pages.
 * Listens for "siteChanged" custom events and cross-tab/local-storage updates.
 */
export function useActiveSite() {
  const [activeSiteId, setActiveSiteIdState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("buildtrack_active_site") || "";
    }
    return "";
  });

  useEffect(() => {
    const handleSiteChanged = (e: any) => {
      const newSiteId = e.detail?.siteId !== undefined ? e.detail.siteId : (localStorage.getItem("buildtrack_active_site") || "");
      setActiveSiteIdState(newSiteId);
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "buildtrack_active_site") {
        setActiveSiteIdState(e.newValue || "");
      }
    };

    window.addEventListener("siteChanged", handleSiteChanged);
    window.addEventListener("storage", handleStorage);

    // Check latest value on mount in case it changed prior to event binding
    if (typeof window !== "undefined") {
      const current = localStorage.getItem("buildtrack_active_site") || "";
      if (current !== activeSiteId) {
        setActiveSiteIdState(current);
      }
    }

    return () => {
      window.removeEventListener("siteChanged", handleSiteChanged);
      window.removeEventListener("storage", handleStorage);
    };
  }, [activeSiteId]);

  const setActiveSiteId = useCallback((siteId: string) => {
    setActiveSiteIdState(siteId);
    if (typeof window !== "undefined") {
      localStorage.setItem("buildtrack_active_site", siteId);
      document.cookie = `buildtrack_active_site=${siteId}; path=/; max-age=31536000; SameSite=Lax`;
      window.dispatchEvent(new CustomEvent("siteChanged", { detail: { siteId } }));
    }
  }, []);

  return { activeSiteId, setActiveSiteId };
}

export default useActiveSite;
