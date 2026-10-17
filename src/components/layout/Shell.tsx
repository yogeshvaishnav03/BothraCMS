"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
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
} from "lucide-react";

interface ShellProps {
  children: React.ReactNode;
}

export default function Shell({ children }: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [sites, setSites] = useState<any[]>([]);
  const [activeSiteId, setActiveSiteId] = useState<string>("");

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentLang, setCurrentLang] = useState<string>("en");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("buildtrack_language");
      if (stored) setCurrentLang(stored);

      const handleLang = (e: any) => {
        if (e.detail?.language) {
          setCurrentLang(e.detail.language);
        }
      };
      window.addEventListener("languageChanged", handleLang);
      return () => window.removeEventListener("languageChanged", handleLang);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
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
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));

    fetch("/api/sites")
      .then((r) => r.json())
      .then((res) => {
        const sitesList = res.data || [];
        if (sitesList.length > 0) {
          setSites(sitesList);
          const saved = typeof window !== "undefined" ? localStorage.getItem("buildtrack_active_site") : null;
          const matched = sitesList.find((s: any) => s.id === saved);
          const initialId = matched ? matched.id : sitesList[0].id;
          setActiveSiteId(initialId);
          document.cookie = `buildtrack_active_site=${initialId}; path=/; max-age=31536000; SameSite=Lax`;
        }
      })
      .catch((err) => {
        console.error("Authoritative sites load failed:", err);
      });

    fetch("/api/notifications")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setNotifications(res.data.alerts || []);
          setUnreadCount(res.data.unreadCount || 0);
        }
      })
      .catch(() => {});
  }, [router]);

  const handleSiteChange = (siteId: string) => {
    setActiveSiteId(siteId);
    if (typeof window !== "undefined") {
      localStorage.setItem("buildtrack_active_site", siteId);
      document.cookie = `buildtrack_active_site=${siteId}; path=/; max-age=31536000; SameSite=Lax`;
      window.dispatchEvent(new CustomEvent("siteChanged", { detail: { siteId } }));
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const navItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Day Book", href: "/day-book", icon: CalendarDays },
    { label: "Projects", href: "/projects", icon: FolderKanban },
    { label: "Tasks & Work", href: "/tasks", icon: CheckSquare },
    { label: "Materials & Stock", href: "/materials", icon: Boxes },
    { label: "Measurement Book", href: "/measurement-book", icon: BookOpen },
    { label: "Vendors & Contractors", href: "/parties", icon: Building2 },
    { label: "Finance & Bills", href: "/finance", icon: DollarSign },
    { label: "Workforce & Attendance", href: "/attendance", icon: HardHat },
    { label: "Reports & Analytics", href: "/reports", icon: FileText },
    { label: "Audit Logs", href: "/audit", icon: ShieldCheck },
    { label: "Settings", href: "/settings", icon: Settings },
    ...(user?.role === "SUPER_ADMIN"
      ? [{ label: "Super Admin", href: "/admin", icon: ShieldAlert }]
      : []),
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-slate-300 font-medium">Loading Build Track Pro...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-slate-900 border-r border-slate-800 text-slate-200 shrink-0">
        <div className="p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center font-black text-slate-950 text-xl shadow-md">
              B
            </div>
            <div>
              <div className="font-bold text-white tracking-tight flex items-center gap-1.5">
                Bothra <span className="text-amber-400 font-black">CMS</span>
              </div>
              <div className="text-xs text-slate-400 font-medium truncate max-w-[120px]">
                {user?.organizationName || "Bothra Infrastructure"}
              </div>
            </div>
          </div>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
            title="Operational Alerts"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center animate-pulse">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </div>

        <div className="p-4 border-b border-slate-800 bg-slate-950/40">
          <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1.5 flex items-center justify-between">
            <span>Active Site</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
          </div>
          {sites.length > 0 ? (
            <select
              value={activeSiteId}
              onChange={(e) => handleSiteChange(e.target.value)}
              className="w-full bg-slate-800/90 text-slate-100 text-xs font-semibold px-2.5 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-amber-400 transition-colors cursor-pointer"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-900 text-slate-100">
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          ) : (
            <div className="text-xs text-slate-400 bg-slate-800/80 px-2.5 py-1.5 rounded border border-slate-700">
              Skyline Heights Sector 62
            </div>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-amber-500 text-slate-950 font-semibold shadow-sm"
                    : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-slate-950" : "text-slate-400"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5 truncate">
            <div className="w-8 h-8 rounded-full bg-slate-700 text-amber-400 flex items-center justify-center font-bold text-xs uppercase border border-slate-600">
              {user?.name?.slice(0, 2) || "US"}
            </div>
            <div className="truncate text-left">
              <div className="text-xs font-semibold text-white truncate">{user?.name}</div>
              <div className="text-[11px] text-amber-400/90 font-mono tracking-tight capitalize">
                {user?.role?.toLowerCase().replace("_", " ")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Link
              href="/settings"
              title={`Active language: ${currentLang.toUpperCase()} - Change in Settings`}
              className="px-2 py-1 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition-colors flex items-center gap-1 text-[11px] font-bold"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{currentLang.toUpperCase()}</span>
            </Link>
            <button
              onClick={handleLogout}
              title="Logout"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="lg:hidden bg-slate-900 border-b border-slate-800 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-amber-500 flex items-center justify-center font-black text-slate-950 text-base">
            B
          </div>
          <span className="font-bold text-white text-base">
            Bothra <span className="text-amber-400">CMS</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            title={`Active language: ${currentLang.toUpperCase()} - Change in Settings`}
            className="p-1.5 text-slate-300 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition flex items-center gap-1 text-[11px] font-bold"
          >
            <Globe className="w-4 h-4" />
            <span>{currentLang.toUpperCase()}</span>
          </Link>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative p-1.5 text-slate-300 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
            title="Operational Alerts"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          <div className="text-right mr-1">
            <div className="text-xs font-semibold text-slate-200">{user?.name}</div>
            <div className="text-[10px] text-amber-400 font-mono">
              {user?.role?.replace("_", " ")}
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-300 hover:bg-slate-800 rounded-lg"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col justify-end">
          <div className="bg-slate-900 rounded-t-2xl p-5 border-t border-slate-700 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                Menu Navigation
              </span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {sites.length > 0 && (
              <div className="py-2.5 px-1 border-b border-slate-800">
                <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-1">
                  Active Site
                </div>
                <select
                  value={activeSiteId}
                  onChange={(e) => handleSiteChange(e.target.value)}
                  className="w-full bg-slate-800 text-slate-100 text-xs font-semibold px-2.5 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-amber-400"
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id} className="bg-slate-900 text-slate-100">
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <nav className="py-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium ${
                      isActive
                        ? "bg-amber-500 text-slate-950 font-semibold"
                        : "text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="pt-3 border-t border-slate-800">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-rose-500/10 text-rose-400 text-sm font-semibold hover:bg-rose-500/20"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-20 lg:pb-8">
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>

      {/* Real-Time Operational Notifications Drawer */}
      {notificationsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end p-4 lg:p-6 bg-slate-950/40 backdrop-blur-xs"
          onClick={() => setNotificationsOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden mt-12 animate-in fade-in slide-in-from-top-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold">Operational Alerts</span>
                <span className="text-xs bg-amber-500 text-slate-950 font-black px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              </div>
              <button
                onClick={() => setNotificationsOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 p-2">
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No active operational alerts. All site systems normal!
                </div>
              ) : (
                notifications.map((n) => (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => setNotificationsOpen(false)}
                    className="block p-3 hover:bg-slate-50 rounded-xl transition group"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${
                          n.severity === "CRITICAL"
                            ? "bg-rose-100 text-rose-700 border border-rose-200"
                            : n.severity === "WARNING"
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-blue-100 text-blue-700 border border-blue-200"
                        }`}
                      >
                        {n.type.replace("_", " ")}
                      </span>
                      <span className="text-[10px] text-amber-600 font-semibold group-hover:underline">
                        View &rarr;
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-900 mt-1">{n.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{n.message}</div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Supervisor Bottom Dock */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 px-3 py-2 flex items-center justify-around z-30 shadow-lg">
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
            pathname === "/" ? "text-amber-400" : "text-slate-400"
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span>Home</span>
        </Link>
        <Link
          href="/tasks"
          className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
            pathname.startsWith("/tasks") ? "text-amber-400" : "text-slate-400"
          }`}
        >
          <CheckSquare className="w-5 h-5" />
          <span>Tasks</span>
        </Link>
        <Link
          href="/materials"
          className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
            pathname.startsWith("/materials") ? "text-amber-400" : "text-slate-400"
          }`}
        >
          <Boxes className="w-5 h-5" />
          <span>Materials</span>
        </Link>
        <Link
          href="/attendance"
          className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
            pathname.startsWith("/attendance") ? "text-amber-400" : "text-slate-400"
          }`}
        >
          <HardHat className="w-5 h-5" />
          <span>Attendance</span>
        </Link>
        <Link
          href="/finance"
          className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
            pathname.startsWith("/finance") ? "text-amber-400" : "text-slate-400"
          }`}
        >
          <DollarSign className="w-5 h-5" />
          <span>Finance</span>
        </Link>
      </div>
    </div>
  );
}
