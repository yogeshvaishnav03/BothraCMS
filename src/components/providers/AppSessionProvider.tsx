"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { showDeviceNotification } from "@/lib/push-client";

const USER_CACHE_KEY = "buildtrack_session_user_v1";
const SITES_CACHE_KEY = "buildtrack_session_sites_v1";
const ACTIVE_SITE_STORAGE_KEY = "buildtrack_active_site";
const NOTIFICATION_POLL_MS = 30_000;
const VISIBILITY_REFRESH_MIN_GAP_MS = 10_000;

export interface ChatToastState {
  id: string;
  senderName: string;
  content: string;
}

export interface AlertToastState {
  id: string;
  title: string;
  message: string;
  href: string;
  severity?: string;
}

interface AppSessionContextValue {
  user: any | null;
  sites: any[];
  activeSiteId: string;
  notifications: any[];
  unreadCount: number;
  unreadChatCount: number;
  chatToast: ChatToastState | null;
  alertToast: AlertToastState | null;
  setChatToast: React.Dispatch<React.SetStateAction<ChatToastState | null>>;
  setAlertToast: React.Dispatch<React.SetStateAction<AlertToastState | null>>;
  setActiveSiteId: (siteId: string) => void;
  ensureSession: () => Promise<any | null>;
  refreshUser: (force?: boolean) => Promise<any | null>;
  refreshSites: (force?: boolean) => Promise<any[]>;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (notifId: string, href?: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  clearSessionCache: () => void;
}

const AppSessionContext = createContext<AppSessionContextValue | null>(null);

export function AppSessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<any | null>(null);
  const [sites, setSites] = useState<any[]>([]);
  const [activeSiteId, setActiveSiteIdState] = useState<string>("");
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [chatToast, setChatToast] = useState<ChatToastState | null>(null);
  const [alertToast, setAlertToast] = useState<AlertToastState | null>(null);
  const [sessionActive, setSessionActive] = useState(false);

  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const userRef = useRef<any | null>(null);
  userRef.current = user;

  const sitesRef = useRef<any[]>([]);
  sitesRef.current = sites;

  const hasValidatedAuthRef = useRef(false);
  const hasLoadedSitesRef = useRef(false);
  const hasLoadedNotifsRef = useRef(false);
  const lastNotifFetchAtRef = useRef(0);

  const inflightAuthRef = useRef<Promise<any | null> | null>(null);
  const inflightSitesRef = useRef<Promise<any[]> | null>(null);
  const inflightNotifRef = useRef<Promise<void> | null>(null);

  const prevChatCountRef = useRef(0);
  const prevAlertIdsRef = useRef<Set<string>>(new Set());
  const isFirstAlertFetchRef = useRef(true);

  const playAlertChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  }, []);

  // Warm-start from sessionStorage/localStorage cleanly after hydration
  useEffect(() => {
    try {
      const savedSite = localStorage.getItem(ACTIVE_SITE_STORAGE_KEY) || "";
      if (savedSite) setActiveSiteIdState(savedSite);

      const cachedUser = sessionStorage.getItem(USER_CACHE_KEY);
      if (cachedUser) {
        const parsed = JSON.parse(cachedUser);
        if (parsed && parsed.id) {
          setUser((prev: any) => prev || parsed);
          userRef.current = userRef.current || parsed;
        }
      }

      const cachedSites = sessionStorage.getItem(SITES_CACHE_KEY);
      if (cachedSites) {
        const parsedSites = JSON.parse(cachedSites);
        if (Array.isArray(parsedSites) && parsedSites.length > 0) {
          setSites((prev) => (prev.length > 0 ? prev : parsedSites));
          sitesRef.current = sitesRef.current.length > 0 ? sitesRef.current : parsedSites;
        }
      }
    } catch {}
  }, []);

  const clearSessionCache = useCallback(() => {
    hasValidatedAuthRef.current = false;
    hasLoadedSitesRef.current = false;
    hasLoadedNotifsRef.current = false;
    inflightAuthRef.current = null;
    inflightSitesRef.current = null;
    inflightNotifRef.current = null;
    prevChatCountRef.current = 0;
    prevAlertIdsRef.current = new Set();
    isFirstAlertFetchRef.current = true;
    setUser(null);
    userRef.current = null;
    setSites([]);
    sitesRef.current = [];
    setNotifications([]);
    setUnreadCount(0);
    setUnreadChatCount(0);
    setChatToast(null);
    setAlertToast(null);
    setSessionActive(false);
    try {
      sessionStorage.removeItem(USER_CACHE_KEY);
      sessionStorage.removeItem(SITES_CACHE_KEY);
    } catch {}
  }, []);

  const setActiveSiteId = useCallback((siteId: string) => {
    setActiveSiteIdState(siteId);
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_SITE_STORAGE_KEY, siteId);
      document.cookie = `${ACTIVE_SITE_STORAGE_KEY}=${siteId}; path=/; max-age=31536000; SameSite=Lax`;
      window.dispatchEvent(new CustomEvent("siteChanged", { detail: { siteId } }));
    }
  }, []);

  const refreshUser = useCallback(
    async (force = false): Promise<any | null> => {
      if (!force && hasValidatedAuthRef.current && userRef.current) {
        return userRef.current;
      }
      if (!force && inflightAuthRef.current) {
        return inflightAuthRef.current;
      }

      const promise = fetch("/api/auth/me", { cache: "no-store" })
        .then(async (res) => {
          if (res.status === 401) {
            clearSessionCache();
            if (pathnameRef.current !== "/login") {
              router.push("/login");
            }
            return null;
          }
          if (!res.ok) return userRef.current;
          const data = await res.json().catch(() => null);
          if (data?.success && data?.data?.user) {
            hasValidatedAuthRef.current = true;
            setUser(data.data.user);
            userRef.current = data.data.user;
            try {
              sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(data.data.user));
            } catch {}
            return data.data.user;
          }
          return userRef.current;
        })
        .catch(() => {
          if (typeof navigator !== "undefined" && navigator.onLine && !userRef.current && pathnameRef.current !== "/login") {
            router.push("/login");
          }
          return userRef.current;
        })
        .finally(() => {
          inflightAuthRef.current = null;
        });

      inflightAuthRef.current = promise;
      return promise;
    },
    [clearSessionCache, router]
  );

  const refreshSites = useCallback(async (force = false): Promise<any[]> => {
    if (!force && hasLoadedSitesRef.current && sitesRef.current.length > 0) {
      return sitesRef.current;
    }
    if (!force && inflightSitesRef.current) {
      return inflightSitesRef.current;
    }

    const promise = fetch("/api/sites?compact=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        const sitesList = Array.isArray(res?.data) ? res.data : [];
        hasLoadedSitesRef.current = true;
        setSites(sitesList);
        sitesRef.current = sitesList;
        try {
          sessionStorage.setItem(SITES_CACHE_KEY, JSON.stringify(sitesList));
        } catch {}

        if (typeof window !== "undefined") {
          const saved = localStorage.getItem(ACTIVE_SITE_STORAGE_KEY);
          const matched = saved ? sitesList.find((s: any) => s.id === saved) : null;
          const initialId = matched ? matched.id : "";
          setActiveSiteIdState(initialId);
          document.cookie = `${ACTIVE_SITE_STORAGE_KEY}=${initialId}; path=/; max-age=31536000; SameSite=Lax`;
        }

        return sitesList;
      })
      .catch((err) => {
        console.error("Authoritative sites load failed:", err);
        return sitesRef.current;
      })
      .finally(() => {
        inflightSitesRef.current = null;
      });

    inflightSitesRef.current = promise;
    return promise;
  }, []);

  const refreshNotifications = useCallback(async (): Promise<void> => {
    if (inflightNotifRef.current) {
      return inflightNotifRef.current;
    }

    lastNotifFetchAtRef.current = Date.now();

    const promise = fetch("/api/notifications", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        hasLoadedNotifsRef.current = true;
        if (res?.success && res?.data) {
          setNotifications(res.data.alerts || []);
          setUnreadCount(res.data.unreadCount || 0);

          const newChatCount = res.data.unreadChatCount || 0;
          setUnreadChatCount(newChatCount);

          const hasNewChat = newChatCount > prevChatCountRef.current && Boolean(res.data.latestChatMessage);
          if (hasNewChat && res.data.latestChatMessage) {
            if (pathnameRef.current !== "/chat") {
              setChatToast(res.data.latestChatMessage);
            }
          }
          prevChatCountRef.current = newChatCount;

          const currentAlerts = res.data.alerts || [];
          if (isFirstAlertFetchRef.current) {
            prevAlertIdsRef.current = new Set(currentAlerts.map((a: any) => a.id));
            isFirstAlertFetchRef.current = false;
          } else {
            const newlyArrived = currentAlerts.filter(
              (a: any) => !a.isRead && !prevAlertIdsRef.current.has(a.id)
            );
            if (newlyArrived.length > 0) {
              const latest = newlyArrived[0];
              setAlertToast({
                id: latest.id,
                title: latest.title,
                message: latest.message,
                href: latest.href || "/",
                severity: latest.severity,
              });
              playAlertChime();

              if (typeof document !== "undefined" && document.hidden) {
                const tag =
                  latest.type === "CHAT_MESSAGE" && res.data.latestChatMessage?.id
                    ? `chat:${res.data.latestChatMessage.id}`
                    : latest.id;
                void showDeviceNotification({
                  title: latest.title,
                  body: latest.message,
                  href: latest.href || "/",
                  tag,
                });
              }
            } else if (hasNewChat && res.data.latestChatMessage && pathnameRef.current !== "/chat") {
              playAlertChime();
              if (typeof document !== "undefined" && document.hidden) {
                void showDeviceNotification({
                  title: `New message from ${res.data.latestChatMessage.senderName}`,
                  body: res.data.latestChatMessage.content,
                  href: "/chat",
                  tag: `chat:${res.data.latestChatMessage.id}`,
                });
              }
            }
            prevAlertIdsRef.current = new Set(currentAlerts.map((a: any) => a.id));
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        inflightNotifRef.current = null;
      });

    inflightNotifRef.current = promise;
    return promise;
  }, [playAlertChime, router]);

  const ensureSession = useCallback(async () => {
    setSessionActive(true);
    const [resolvedUser] = await Promise.all([
      refreshUser(false),
      refreshSites(false),
      hasLoadedNotifsRef.current ? Promise.resolve() : refreshNotifications(),
    ]);
    return resolvedUser;
  }, [refreshUser, refreshSites, refreshNotifications]);

  const markNotificationRead = useCallback(
    async (notifId: string, href?: string) => {
      const target = notifications.find((n) => n.id === notifId);
      if (!target || target.isRead) {
        if (href) {
          router.push(href);
        }
        return;
      }

      const prevNotifications = [...notifications];
      const prevCount = unreadCount;
      setUnreadCount((c) => Math.max(0, c - 1));
      setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, isRead: true } : n)));

      try {
        const res = await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationId: notifId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          setUnreadCount(prevCount);
          setNotifications(prevNotifications);
        } else {
          window.dispatchEvent(new CustomEvent("refreshNotifications"));
        }
      } catch {
        setUnreadCount(prevCount);
        setNotifications(prevNotifications);
      }

      if (href) {
        router.push(href);
      }
    },
    [notifications, unreadCount, router]
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (unreadCount === 0) return;
    const prevNotifications = [...notifications];
    const prevCount = unreadCount;
    const alertIds = notifications.map((n) => n.id);

    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));

    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, alertIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setUnreadCount(prevCount);
        setNotifications(prevNotifications);
      } else {
        window.dispatchEvent(new CustomEvent("refreshNotifications"));
      }
    } catch {
      setUnreadCount(prevCount);
      setNotifications(prevNotifications);
    }
  }, [notifications, unreadCount]);

  // Global event listeners & visibility-aware background notification polling
  useEffect(() => {
    const handleSiteChangeExt = (e: any) => {
      const newSiteId =
        e.detail?.siteId !== undefined
          ? e.detail.siteId
          : localStorage.getItem(ACTIVE_SITE_STORAGE_KEY) || "";
      setActiveSiteIdState(newSiteId);
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_SITE_STORAGE_KEY) {
        setActiveSiteIdState(e.newValue || "");
      }
    };

    const handleSitesUpdated = () => {
      refreshSites(true);
    };

    const handleAuthUpdated = () => {
      refreshUser(true);
    };

    window.addEventListener("siteChanged", handleSiteChangeExt);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("sitesUpdated", handleSitesUpdated);
    window.addEventListener("authUpdated", handleAuthUpdated);

    return () => {
      window.removeEventListener("siteChanged", handleSiteChangeExt);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("sitesUpdated", handleSitesUpdated);
      window.removeEventListener("authUpdated", handleAuthUpdated);
    };
  }, [refreshSites, refreshUser]);

  useEffect(() => {
    if (!sessionActive) return;

    const handleRefresh = () => {
      refreshNotifications();
    };

    const handleVisibility = () => {
      if (
        !document.hidden &&
        Date.now() - lastNotifFetchAtRef.current >= VISIBILITY_REFRESH_MIN_GAP_MS
      ) {
        refreshNotifications();
      }
    };

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      refreshNotifications();
    }, NOTIFICATION_POLL_MS);

    window.addEventListener("refreshNotifications", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibility);

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "BOTHRA_NAVIGATE" && typeof event.data.href === "string" && event.data.href.startsWith("/")) {
        router.push(event.data.href);
      }
    };
    const swContainer = typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker : null;
    swContainer?.addEventListener("message", handleSwMessage);

    return () => {
      clearInterval(interval);
      window.removeEventListener("refreshNotifications", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibility);
      swContainer?.removeEventListener("message", handleSwMessage);
    };
  }, [sessionActive, refreshNotifications, router]);

  return (
    <AppSessionContext.Provider
      value={{
        user,
        sites,
        activeSiteId,
        notifications,
        unreadCount,
        unreadChatCount,
        chatToast,
        alertToast,
        setChatToast,
        setAlertToast,
        setActiveSiteId,
        ensureSession,
        refreshUser,
        refreshSites,
        refreshNotifications,
        markNotificationRead,
        markAllNotificationsRead,
        clearSessionCache,
      }}
    >
      {children}
    </AppSessionContext.Provider>
  );
}

export function useAppSession() {
  const ctx = useContext(AppSessionContext);
  if (!ctx) {
    throw new Error("useAppSession must be used inside AppSessionProvider");
  }
  return ctx;
}
