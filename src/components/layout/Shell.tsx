"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { PushToggle } from "@/components/layout/PushToggle";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MessageCircle,
  FolderKanban,
  CheckSquare,
  Boxes,
  Users,
  DollarSign,
  FileText,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  HardHat,
  ChevronDown,
  Building2,
  Clock,
  ClipboardCheck,
  ArrowRightLeft,
  Receipt,
  PlusCircle,
  Bell,
  Settings,
  AlertTriangle,
  ShieldAlert,
  BookOpen,
  CalendarDays,
  Globe,
  Check,
  MessageSquare,
  Zap,
  Search,
  UserCog,
  NotebookPen,
  PackagePlus,
  Layers,
  Truck,
  Wallet,
  Handshake,
  Landmark,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { canUser } from "@/lib/permissions";
import InteractiveGuideModal from "@/components/ui/InteractiveGuideModal";
import QuickActionLauncher from "@/components/ui/QuickActionLauncher";
import OfflineBar from "@/components/layout/OfflineBar";
import { clearQueue, listQueued } from "@/lib/offline-queue";

interface ShellProps {
  children: React.ReactNode;
}

export default function Shell({ children }: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { language, setLanguage, t, languages } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [sites, setSites] = useState<any[]>([]);
  const [activeSiteId, setActiveSiteId] = useState<string>("");

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [chatToast, setChatToast] = useState<{
    id: string;
    senderName: string;
    content: string;
  } | null>(null);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  const prevChatCountRef = useRef(0);

  // Live date and clock for the top bar (India time, the company's timezone).
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const todayLabel = now.toLocaleDateString(language === "hi" ? "hi-IN" : "en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  });
  const clock = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

  // Fetch operational alerts and unread chat message counts
  const fetchNotifications = useCallback(() => {
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setNotifications(res.data.alerts || []);
          setUnreadCount(res.data.unreadCount || 0);

          const newChatCount = res.data.unreadChatCount || 0;
          setUnreadChatCount(newChatCount);

          // If count increased and user is not currently in /chat, show toast notification!
          if (newChatCount > prevChatCountRef.current && res.data.latestChatMessage) {
            if (pathname !== "/chat") {
              setChatToast(res.data.latestChatMessage);
            }
          }
          prevChatCountRef.current = newChatCount;
        }
      })
      .catch(() => {});
  }, [pathname]);

  const handleMarkAsRead = async (notifId: string, href?: string) => {
    const target = notifications.find((n) => n.id === notifId);
    if (!target || target.isRead) {
      if (href) {
        setNotificationsOpen(false);
        router.push(href);
      }
      return;
    }

    // Optimistic update
    const prevNotifications = [...notifications];
    const prevCount = unreadCount;
    setUnreadCount((c) => Math.max(0, c - 1));
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, isRead: true } : n))
    );

    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: notifId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        // Rollback
        setUnreadCount(prevCount);
        setNotifications(prevNotifications);
      } else {
        window.dispatchEvent(new CustomEvent("refreshNotifications"));
      }
    } catch {
      // Rollback on network failure
      setUnreadCount(prevCount);
      setNotifications(prevNotifications);
    }

    if (href) {
      setNotificationsOpen(false);
      router.push(href);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return;
    const prevNotifications = [...notifications];
    const prevCount = unreadCount;

    // Optimistic update
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));

    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        // Rollback
        setUnreadCount(prevCount);
        setNotifications(prevNotifications);
      } else {
        window.dispatchEvent(new CustomEvent("refreshNotifications"));
      }
    } catch {
      // Rollback
      setUnreadCount(prevCount);
      setNotifications(prevNotifications);
    }
  };

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) {
          router.push("/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data && data.success) {
          setUser(data.data.user);
        }
      })
      // No signal is not the same as logged out: keep the page (the site app works offline).
      .catch(() => {
        if (navigator.onLine) router.push("/login");
      })
      .finally(() => setLoading(false));

    fetch("/api/sites", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        const sitesList = res.data || [];
        if (sitesList.length > 0) {
          setSites(sitesList);
          const saved = typeof window !== "undefined" ? localStorage.getItem("buildtrack_active_site") : null;
          const matched = saved ? sitesList.find((s: any) => s.id === saved) : null;
          const initialId = matched ? matched.id : "";
          setActiveSiteId(initialId);
          document.cookie = `buildtrack_active_site=${initialId}; path=/; max-age=31536000; SameSite=Lax`;
        }
      })
      .catch((err) => {
        console.error("Authoritative sites load failed:", err);
      });

    fetchNotifications();

    // Background interval poll (every 5 seconds) to catch incoming messages in real-time
    const interval = setInterval(fetchNotifications, 5000);
    const handleRefresh = () => fetchNotifications();
    window.addEventListener("refreshNotifications", handleRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener("refreshNotifications", handleRefresh);
    };
  }, [router, fetchNotifications]);

  // Auto-dismiss chat toast after 6 seconds
  useEffect(() => {
    if (chatToast) {
      const timer = setTimeout(() => setChatToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [chatToast]);

  // Clear toast if navigating to /chat
  useEffect(() => {
    if (pathname === "/chat") {
      setChatToast(null);
    }
  }, [pathname]);

  const handleSiteChange = (siteId: string) => {
    setActiveSiteId(siteId);
    if (typeof window !== "undefined") {
      localStorage.setItem("buildtrack_active_site", siteId);
      document.cookie = `buildtrack_active_site=${siteId}; path=/; max-age=31536000; SameSite=Lax`;
      window.dispatchEvent(new CustomEvent("siteChanged", { detail: { siteId } }));
    }
  };

  const handleLogout = async () => {
    // Saved updates are sent as whoever is logged in, so they cannot wait for the next person.
    const waiting = await listQueued().catch(() => []);
    if (waiting.length > 0 && !window.confirm(`${waiting.length} saved update${waiting.length === 1 ? " has" : "s have"} not been sent yet. Log out and discard ${waiting.length === 1 ? "it" : "them"}?`)) return;
    await clearQueue().catch(() => {});
    // Pages kept for offline use belong to this login.
    if ("caches" in window) await caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {});
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  type NavItem = { key: string; defaultLabel: string; href: string; icon: typeof LayoutDashboard };
  const navGroups: { key: string; label: string; items: NavItem[] }[] = [
    {
      key: "nav.group.overview",
      label: "Overview",
      items: [
        { key: "nav.dashboard", defaultLabel: "Dashboard", href: "/", icon: LayoutDashboard },
        { key: "nav.dayBook", defaultLabel: "Day Book", href: "/day-book", icon: CalendarDays },
        { key: "nav.reports", defaultLabel: "Reports & Analytics", href: "/reports", icon: FileText },
      ],
    },
    {
      key: "nav.group.siteWork",
      label: "Site Work",
      items: [
        { key: "nav.projects", defaultLabel: "Projects", href: "/projects", icon: FolderKanban },
        { key: "nav.tasks", defaultLabel: "Tasks & Work", href: "/tasks", icon: CheckSquare },
        { key: "nav.measurementBook", defaultLabel: "Measurement Book", href: "/measurement-book", icon: BookOpen },
        { key: "nav.materials", defaultLabel: "Materials & Stock", href: "/materials", icon: Boxes },
        { key: "nav.materialRequests", defaultLabel: "Material Requests", href: "/material-requests", icon: PackagePlus },
        { key: "nav.drawings", defaultLabel: "Drawings", href: "/drawings", icon: Layers },
        { key: "nav.quality", defaultLabel: "Quality & Safety", href: "/quality", icon: HardHat },
        { key: "nav.equipment", defaultLabel: "Equipment", href: "/equipment", icon: Truck },
      ],
    },
    {
      key: "nav.group.money",
      label: "Money",
      items: [
        { key: "nav.finance", defaultLabel: "Finance & Bills", href: "/finance", icon: DollarSign },
        { key: "nav.parties", defaultLabel: "Vendors & Contractors", href: "/parties", icon: Building2 },
        ...(canUser(user, "payroll:read") ? [{ key: "nav.payroll", defaultLabel: "Payroll", href: "/payroll", icon: Wallet }] : []),
        ...(canUser(user, "sales:read") ? [{ key: "nav.sales", defaultLabel: "Sales", href: "/sales", icon: Handshake }] : []),
        ...(canUser(user, "finance:read") ? [{ key: "nav.exports", defaultLabel: "Accounts Export", href: "/exports", icon: Landmark }] : []),
      ],
    },
    {
      key: "nav.group.people",
      label: "People",
      items: [
        { key: "nav.myDay", defaultLabel: "Daily Work", href: "/work-reports", icon: NotebookPen },
        { key: "nav.workforce", defaultLabel: "Workforce", href: "/workforce", icon: Users },
        { key: "nav.attendance", defaultLabel: "Attendance", href: "/attendance", icon: Clock },
        ...(canUser(user, "attendance:write") ? [{ key: "nav.muster", defaultLabel: "Site Muster", href: "/attendance/muster", icon: ClipboardCheck }] : []),
        { key: "nav.chat", defaultLabel: "Messages", href: "/chat", icon: MessageSquare },
        ...(["SUPER_ADMIN", "ORG_ADMIN", "ACCOUNTANT", "STOREKEEPER", "PROJECT_MANAGER"].includes(user?.role)
          ? [{ key: "nav.whatsapp", defaultLabel: "WhatsApp Inbox", href: "/whatsapp", icon: MessageCircle }]
          : []),
      ],
    },
    {
      key: "nav.group.admin",
      label: "Admin",
      items: [
        ...(user?.role === "SUPER_ADMIN" || user?.role === "ORG_ADMIN"
          ? [{ key: "nav.team", defaultLabel: "Team & Access", href: "/team", icon: UserCog }]
          : []),
        ...(canUser(user, "audit:read")
          ? [{ key: "nav.audit", defaultLabel: "Audit Logs", href: "/audit", icon: ShieldCheck }]
          : []),
        { key: "nav.settings", defaultLabel: "Settings", href: "/settings", icon: Settings },
        ...(user?.role === "SUPER_ADMIN"
          ? [{ key: "nav.superAdmin", defaultLabel: "Super Admin", href: "/admin", icon: ShieldAlert }]
          : []),
      ],
    },
  ];
  const navItemsDef = navGroups.flatMap((g) => g.items);
  // The longest matching link wins, so /attendance/muster lights up Site Muster, not Attendance.
  const currentNav = navItemsDef
    .filter((i) => pathname === i.href || (i.href !== "/" && pathname.startsWith(i.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const isActiveHref = (href: string) => currentNav?.href === href;
  const roleLabel = (user?.role || "").toLowerCase().replace(/_/g, " ");
  const userInitials =
    (user?.name || "U")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p: string) => p[0]?.toUpperCase())
      .join("") || "U";

  const languageToggle = (size: "sm" | "md") => (
    <div className="flex items-center rounded-lg p-0.5 bg-slate-100 ring-1 ring-slate-200">
      {(["en", "hi"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLanguage(code)}
          className={`${size === "sm" ? "px-1.5 text-[10px]" : "px-2 text-[11px]"} py-0.5 rounded-md font-bold transition ${
            language === code ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
          }`}
          title={code === "en" ? "Switch to English" : "हिन्दी में बदलें"}
        >
          {code === "en" ? "EN" : "हिन्दी"}
        </button>
      ))}
    </div>
  );

  const renderNavLink = (item: NavItem, onNavigate?: () => void) => {
    const Icon = item.icon;
    const isActive = isActiveHref(item.href);
    const isMessages = item.href === "/chat";
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        className={`group relative flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
          isActive
            ? "bg-gradient-to-r from-amber-500/20 to-amber-500/5 text-white ring-1 ring-amber-400/25"
            : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
        }`}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-gradient-to-b from-amber-300 to-orange-500" />
        )}
        <span className="flex items-center gap-3 min-w-0">
          <Icon
            className={`w-[18px] h-[18px] shrink-0 transition-colors ${
              isActive ? "text-amber-400" : "text-slate-500 group-hover:text-slate-300"
            }`}
          />
          <span className="truncate">{t(item.key, item.defaultLabel)}</span>
        </span>
        {isMessages && unreadChatCount > 0 && (
          <span className="px-1.5 min-w-[20px] h-5 rounded-full text-[10px] font-bold shrink-0 flex items-center justify-center bg-gradient-brand text-slate-950 shadow-glow">
            {unreadChatCount > 99 ? "99+" : unreadChatCount}
          </span>
        )}
      </Link>
    );
  };

  const siteSelect = (
    <select
      value={activeSiteId}
      onChange={(e) => handleSiteChange(e.target.value)}
      className="w-full bg-white/[0.06] text-slate-100 text-xs font-medium pl-2.5 pr-7 py-2 rounded-xl border border-white/10 hover:border-white/20 focus:outline-none focus:border-amber-400 transition-colors cursor-pointer"
      aria-label={t("nav.activeSite", "Active Site")}
    >
      <option value="" className="bg-slate-900 text-amber-400 font-bold">
        {t("nav.allSites", "All sites (overview)")}
      </option>
      {sites.map((s) => (
        <option key={s.id} value={s.id} className="bg-slate-900 text-slate-100">
          {s.name} ({s.code})
        </option>
      ))}
    </select>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-chrome flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 rounded-2xl bg-gradient-brand shadow-glow animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center font-display font-extrabold text-2xl text-slate-950">
              B
            </div>
          </div>
          <span className="text-slate-400 text-sm font-medium">{t("nav.loading", "Loading Bothra CMS…")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row overflow-x-clip">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[260px] bg-gradient-chrome text-slate-200 shrink-0 lg:sticky lg:top-0 lg:h-screen border-r border-white/5">
        <div className="px-5 pt-5 pb-4 flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center font-display font-extrabold text-slate-950 text-xl shadow-glow shrink-0">
            B
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display font-extrabold text-white tracking-tight text-[17px] leading-tight">
              Bothra <span className="text-gradient-brand">CMS</span>
            </div>
            <div
              className="text-[11px] text-slate-500 font-medium truncate"
              title={user?.organizationName || "Bothra Infrastructure"}
            >
              {user?.organizationName || "Bothra Infrastructure"}
            </div>
          </div>
        </div>

        <div className="px-4 pb-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-[0.12em] font-semibold mb-1.5 flex items-center justify-between px-1">
            <span>{t("nav.activeSite", "Active Site")}</span>
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${activeSiteId ? "bg-emerald-400 animate-pulse-ring" : "bg-amber-400"}`}
              title={activeSiteId ? "Specific Site Selected" : "All Active Sites (Overview)"}
            ></span>
          </div>
          {sites.length > 0 ? (
            siteSelect
          ) : (
            <div className="text-xs text-slate-400 bg-white/[0.06] px-2.5 py-2 rounded-xl border border-white/10">
              {t("nav.noSites", "No sites yet")}
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 pb-3 overflow-y-auto space-y-4 [scrollbar-color:rgb(255_255_255/0.15)_transparent]">
          {navGroups.map((group) => (
            <div key={group.key}>
              <div className="px-3 mb-1 text-[10px] uppercase tracking-[0.14em] font-semibold text-slate-600">
                {t(group.key, group.label)}
              </div>
              <div className="space-y-0.5">{group.items.map((item) => renderNavLink(item))}</div>
            </div>
          ))}
        </nav>

        <div className="m-3 p-3 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 flex items-center justify-between gap-2">
          <Link href="/settings" className="flex items-center gap-2.5 min-w-0 group">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-slate-950 flex items-center justify-center font-bold text-xs shrink-0 ring-2 ring-white/10">
              {userInitials}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate group-hover:text-amber-300 transition-colors">
                {user?.name}
              </div>
              <div className="text-[11px] text-slate-500 truncate capitalize">{roleLabel}</div>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            title={t("nav.logout", "Logout")}
            aria-label={t("nav.logout", "Logout")}
            className="p-2 text-slate-500 hover:text-rose-400 hover:bg-white/[0.06] rounded-lg transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="lg:hidden glass-dark text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40 border-b border-white/10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center font-display font-extrabold text-slate-950 text-base shadow-glow shrink-0">
            B
          </div>
          <div className="min-w-0">
            <div className="font-display font-extrabold text-white text-[15px] leading-tight">
              Bothra <span className="text-gradient-brand">CMS</span>
            </div>
            <div className="text-[10px] text-slate-400 truncate">{currentNav ? t(currentNav.key, currentNav.defaultLabel) : ""}</div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative p-2 text-slate-300 hover:text-amber-400 hover:bg-white/10 rounded-xl transition"
            title={t("nav.alerts", "Operational Alerts")}
            aria-label={t("nav.alerts", "Operational Alerts")}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-300 hover:bg-white/10 rounded-xl relative"
            aria-label={t("nav.menu", "Menu Navigation")}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            {!mobileMenuOpen && unreadChatCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex flex-col justify-end animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="bg-gradient-chrome rounded-t-3xl p-5 border-t border-white/10 max-h-[85vh] overflow-y-auto animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
            <div className="flex items-center justify-between pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-slate-950 flex items-center justify-center font-bold text-xs shrink-0">
                  {userInitials}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{user?.name}</div>
                  <div className="text-[11px] text-slate-400 capitalize">{roleLabel}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {languageToggle("md")}
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            {sites.length > 0 && (
              <div className="py-2.5">
                <div className="text-[10px] text-slate-500 uppercase tracking-[0.12em] font-semibold mb-1.5">
                  {t("nav.activeSite", "Active Site")}
                </div>
                {siteSelect}
              </div>
            )}
            <nav className="py-3 space-y-4">
              {navGroups.map((group) => (
                <div key={group.key}>
                  <div className="px-3 mb-1 text-[10px] uppercase tracking-[0.14em] font-semibold text-slate-500">
                    {t(group.key, group.label)}
                  </div>
                  <div className="grid grid-cols-1 gap-0.5">
                    {group.items.map((item) => renderNavLink(item, () => setMobileMenuOpen(false)))}
                  </div>
                </div>
              ))}
            </nav>
            <div className="pt-3 border-t border-white/10">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-500/10 text-rose-300 text-sm font-semibold hover:bg-rose-500/20"
              >
                <LogOut className="w-4 h-4" />
                <span>{t("nav.logout", "Log Out")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="app-main flex-1 min-w-0 pb-24 lg:pb-8">
        {/* Desktop top bar */}
        <div className="hidden lg:block sticky top-0 z-30 glass border-b border-slate-200/70">
          <div className="max-w-7xl mx-auto px-8 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span>{todayLabel}</span>
                <span className="text-slate-300">•</span>
                <span className="tabular-nums">{clock}</span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1.5 truncate">
                  <span className={`w-1.5 h-1.5 rounded-full ${activeSiteId ? "bg-emerald-500" : "bg-amber-500"}`} />
                  {sites.find((s) => s.id === activeSiteId)?.name ||
                    (language === "hi" ? "सभी सक्रिय साइट्स" : "All active sites")}
                </span>
              </div>
              <div className="font-display text-[17px] font-bold text-slate-900 truncate">
                {currentNav ? t(currentNav.key, currentNav.defaultLabel) : "Bothra CMS"}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("openQuickActionLauncher"))}
                className="hidden xl:flex items-center gap-2 w-64 px-3 py-2 rounded-xl bg-white ring-1 ring-slate-200 hover:ring-slate-300 text-slate-400 text-sm transition shadow-xs"
              >
                <Search className="w-4 h-4" />
                <span className="flex-1 text-left">{language === "hi" ? "त्वरित कार्य…" : "Quick actions…"}</span>
                <kbd className="text-[10px] font-semibold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">Alt Q</kbd>
              </button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("openQuickActionLauncher"))}
                className="xl:hidden p-2 rounded-xl bg-white ring-1 ring-slate-200 hover:ring-slate-300 text-slate-600 shadow-xs"
                title={language === "hi" ? "त्वरित कार्य (Alt + Q)" : "Quick Actions (Alt + Q)"}
              >
                <Zap className="w-4 h-4" />
              </button>
              <InteractiveGuideModal />
              {languageToggle("md")}
              <Link
                href="/chat"
                className="relative p-2 rounded-xl bg-white ring-1 ring-slate-200 hover:ring-slate-300 text-slate-600 hover:text-slate-900 shadow-xs transition"
                title={t("nav.chat", "Messages")}
                aria-label={t("nav.chat", "Messages")}
              >
                <MessageSquare className="w-4 h-4" />
                {unreadChatCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-brand text-slate-950 text-[10px] font-bold flex items-center justify-center">
                    {unreadChatCount > 9 ? "9+" : unreadChatCount}
                  </span>
                )}
              </Link>
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative p-2 rounded-xl bg-white ring-1 ring-slate-200 hover:ring-slate-300 text-slate-600 hover:text-slate-900 shadow-xs transition"
                title={t("nav.alerts", "Operational Alerts")}
                aria-label={t("nav.alerts", "Operational Alerts")}
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:px-8 lg:py-6 space-y-4">
          {/* Mobile helper bar: site, guide, language */}
          <div className="lg:hidden flex items-center justify-between gap-2 bg-white/80 ring-1 ring-slate-200 px-3 py-2 rounded-2xl shadow-xs">
            <span className="flex items-center gap-2 min-w-0 text-xs font-semibold text-slate-800">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${activeSiteId ? "bg-emerald-500" : "bg-amber-400"}`}
              />
              <span className="truncate">
                {sites.find((s) => s.id === activeSiteId)?.name ||
                  (language === "hi" ? "सभी सक्रिय साइट्स" : "All active sites")}
              </span>
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {languageToggle("sm")}
              <InteractiveGuideModal />
            </div>
          </div>

          <OfflineBar />
          <div className="page-enter">
            {children}
          </div>
        </div>
      </main>
      {/* Real-Time Operational Notifications Drawer */}
      {notificationsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end p-4 lg:p-6 bg-slate-950/40 backdrop-blur-xs"
          onClick={() => setNotificationsOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 overflow-hidden mt-14 animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-gradient-chrome text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold">{t("nav.alerts", "Operational Alerts")}</span>
                <span className="text-xs bg-gradient-brand text-slate-950 font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllAsRead}
                    className="text-[11px] text-amber-400 hover:text-white underline font-semibold transition"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setNotificationsOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                  aria-label="Close alerts drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <PushToggle />
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 p-2">
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  {t("nav.noAlerts", "No active operational alerts. All site systems normal!")}
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleMarkAsRead(n.id, n.href)}
                    className={`block p-3 rounded-xl transition cursor-pointer group ${
                      n.isRead
                        ? "bg-slate-50/50 opacity-70 hover:opacity-100 hover:bg-slate-50"
                        : "bg-white hover:bg-amber-50/40 ring-1 ring-amber-100/80 shadow-2xs"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {!n.isRead && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse" title="Unread" />
                        )}
                        <span
                          className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${
                            n.type === "CHAT_MESSAGE"
                              ? "bg-purple-100 text-purple-800 border border-purple-200"
                              : n.severity === "CRITICAL"
                              ? "bg-rose-100 text-rose-700 border border-rose-200"
                              : n.severity === "WARNING"
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : "bg-blue-100 text-blue-700 border border-blue-200"
                          }`}
                        >
                          {n.type === "CHAT_MESSAGE" ? "MESSAGE" : n.type.replace(/_/g, " ")}
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-600 font-semibold group-hover:underline">
                        View &rarr;
                      </span>
                    </div>
                    <div className={`text-xs mt-1 ${n.isRead ? "font-medium text-slate-700" : "font-bold text-slate-900"}`}>{n.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{n.message}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Supervisor Bottom Dock */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 glass-dark border-t border-white/10 px-3 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] flex items-center justify-around z-30 shadow-2xl">
        <Link
          href="/"
          className={`flex flex-col items-center gap-0.5 text-[11px] font-medium transition ${
            pathname === "/" ? "text-amber-400 font-bold" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span>{t("nav.home", "Home")}</span>
        </Link>
        <Link
          href="/day-book"
          className={`flex flex-col items-center gap-0.5 text-[11px] font-medium transition ${
            pathname.startsWith("/day-book") ? "text-amber-400 font-bold" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <CalendarDays className="w-5 h-5" />
          <span>{t("nav.dayBook", "Day Book")}</span>
        </Link>

        {/* Center Elevated 1-Tap Quick Action Launcher Button */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("openQuickActionLauncher"))}
          className="flex flex-col items-center -mt-5 relative z-10 focus:outline-none group cursor-pointer"
          title={language === "hi" ? "त्वरित कार्य (Alt + Q)" : "Quick Actions (Alt + Q)"}
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-brand text-slate-950 flex items-center justify-center shadow-glow ring-4 ring-slate-950/80 group-hover:scale-105 active:scale-95 transition-transform">
            <Zap className="w-6 h-6 fill-slate-950 stroke-slate-950" />
          </div>
          <span className="text-[10px] font-bold text-amber-400 mt-0.5">
            {language === "hi" ? "कार्य" : "Quick"}
          </span>
        </button>

        <Link
          href="/attendance"
          className={`flex flex-col items-center gap-0.5 text-[11px] font-medium transition ${
            pathname.startsWith("/attendance") ? "text-amber-400 font-bold" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Clock className="w-5 h-5" />
          <span>{t("nav.attendance", "Attendance")}</span>
        </Link>
        <Link
          href="/chat"
          className={`flex flex-col items-center gap-0.5 text-[11px] font-medium relative transition ${
            pathname.startsWith("/chat") ? "text-amber-400 font-bold" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <div className="relative">
            <MessageSquare className="w-5 h-5" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-2 px-1 min-w-3.5 h-3.5 rounded-full bg-amber-500 text-slate-950 text-[9px] font-black flex items-center justify-center animate-pulse">
                {unreadChatCount > 9 ? "9+" : unreadChatCount}
              </span>
            )}
          </div>
          <span>{t("nav.chat", "Chat")}</span>
        </Link>
      </div>

      {/* 1-Click Interactive Language Switcher Modal */}
      {langDropdownOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in"
          onClick={() => setLangDropdownOpen(false)}
        >
          <div
            className="w-full max-w-xs bg-slate-900 border border-slate-700 text-white rounded-2xl shadow-2xl p-4 space-y-3 max-h-[90vh] overflow-y-auto animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold">{t("nav.switchLanguage", "Switch Language")}</span>
              </div>
              <button
                type="button"
                onClick={() => setLangDropdownOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              {t("settings.quickSwitcherDesc", "Switch platform display language instantly:")}
            </p>
            <div className="space-y-1.5">
              {languages.map((l) => {
                const isSelected = language === l.code;
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => {
                      setLanguage(l.code);
                      setLangDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition ${
                      isSelected
                        ? "bg-amber-500 text-slate-950 font-bold shadow-sm"
                        : "bg-slate-800/80 text-slate-200 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-black ${
                          isSelected ? "bg-slate-950 text-amber-400" : "bg-slate-700 text-slate-300"
                        }`}
                      >
                        {l.code.toUpperCase()}
                      </span>
                      <div>
                        <div className="text-xs">{l.nativeName}</div>
                        <div className={`text-[10px] ${isSelected ? "text-slate-900" : "text-slate-400"}`}>
                          {l.name}
                        </div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-slate-950" />}
                  </button>
                );
              })}
            </div>
            <div className="pt-2 border-t border-slate-800 text-center">
              <Link
                href="/settings"
                onClick={() => setLangDropdownOpen(false)}
                className="text-[11px] text-amber-400 hover:underline font-medium"
              >
                {t("nav.settings", "Settings")} &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Real-Time Floating Chat Message Notification Toast */}
      {chatToast && (
        <div className="fixed bottom-20 lg:bottom-5 right-4 lg:right-5 z-50 max-w-sm w-[calc(100%-2rem)] bg-gradient-chrome ring-1 ring-amber-500/30 text-white p-4 rounded-2xl shadow-xl animate-fade-up">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center shrink-0 shadow-sm">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <span>{t("chat.newMessageFrom", "New message from")}</span>
                  <span className="text-white truncate font-extrabold">{chatToast.senderName}</span>
                </div>
                <p className="text-xs text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                  {chatToast.content}
                </p>
              </div>
            </div>
            <button
              onClick={() => setChatToast(null)}
              className="p-1 text-slate-400 hover:text-white rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              onClick={() => {
                setChatToast(null);
                router.push("/chat");
              }}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition flex items-center gap-1 shadow-sm"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Open Chat</span>
            </button>
          </div>
        </div>
      )}

      {/* Global Interactive Quick Action Launcher (Speed Dial FAB & Keyboard Shortcut Alt+Q) */}
      <QuickActionLauncher
        currentUser={user}
        activeSiteId={activeSiteId}
        activeSiteName={sites.find((s) => s.id === activeSiteId)?.name}
      />
    </div>
  );
}
