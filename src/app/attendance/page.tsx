"use client";

import React, { useEffect, useState, useMemo } from "react";
import Shell from "@/components/layout/Shell";
import { formatDateTime, formatDate } from "@/lib/formatters";
import {
  Clock,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Calendar,
  CalendarDays,
  FileSpreadsheet,
  Building2,
  RefreshCw,
  Search,
  Filter,
  Sparkles,
  ShieldCheck,
  Users,
  Briefcase,
  ChevronRight,
} from "lucide-react";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, ExcelColumn } from "@/components/ui/ExcelTable";

interface AttendanceRecord {
  id: string;
  workDate: string;
  status: string;
  checkInAt: string;
  checkInLat?: number | null;
  checkInLng?: number | null;
  checkOutAt?: string | null;
  checkOutLat?: number | null;
  checkOutLng?: number | null;
  durationMinutes: number;
  durationFormatted: string;
  durationHours: number;
  site?: { id: string; name: string; code: string } | null;
  project?: { id: string; name: string; code: string } | null;
  workforceMember?: { id: string; name: string; employeeCode: string; workerType: string } | null;
  creator?: { id: string; name: string; email: string; role: string } | null;
  employeeName: string;
  employeeRole: string;
  employeeCode: string;
  employeeEmail?: string | null;
  notes?: string | null;
  correctionReason?: string | null;
  isToday: boolean;
}

interface MonthBreakdown {
  monthKey: string;
  label: string;
  count: number;
  totalMinutes: number;
  totalHours: number;
}

function getRoleBadge(role?: string) {
  switch (role) {
    case "SUPER_ADMIN":
      return {
        label: "Super Admin",
        className: "bg-amber-100 text-amber-900 border-amber-300 font-black",
      };
    case "ORG_ADMIN":
      return {
        label: "Admin",
        className: "bg-purple-100 text-purple-900 border-purple-300 font-bold",
      };
    case "SITE_SUPERVISOR":
      return {
        label: "Site Supervisor",
        className: "bg-blue-100 text-blue-900 border-blue-300 font-bold",
      };
    case "PROJECT_MANAGER":
      return {
        label: "Project Manager",
        className: "bg-indigo-100 text-indigo-900 border-indigo-300 font-bold",
      };
    case "SITE_ENGINEER":
      return {
        label: "Site Engineer",
        className: "bg-cyan-100 text-cyan-900 border-cyan-300 font-bold",
      };
    case "ACCOUNTANT":
      return {
        label: "Accountant",
        className: "bg-emerald-100 text-emerald-900 border-emerald-300 font-bold",
      };
    case "STOREKEEPER":
      return {
        label: "Storekeeper",
        className: "bg-orange-100 text-orange-900 border-orange-300 font-bold",
      };
    case "FOREMAN":
      return {
        label: "Foreman",
        className: "bg-stone-100 text-stone-800 border-stone-300 font-bold",
      };
    default:
      return {
        label: role ? role.replace(/_/g, " ") : "Staff",
        className: "bg-slate-100 text-slate-700 border-slate-200 font-semibold",
      };
  }
}

export default function AttendancePage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [sites, setSites] = useState<any[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active view tab: "all" for organization ledger, "my" for personal attendance
  const [activeTab, setActiveTab] = useState<"all" | "my">("all");

  // 3-Month attendance history data
  const [todaySession, setTodaySession] = useState<AttendanceRecord | null>(null);
  const [sessions, setSessions] = useState<AttendanceRecord[]>([]);
  const [monthsBreakdown, setMonthsBreakdown] = useState<MonthBreakdown[]>([]);
  const [metrics, setMetrics] = useState({
    targetMonths: 3,
    totalDaysPresent: 0,
    completedShifts: 0,
    totalHoursLogged: 0,
    averageDailyHours: 0,
    activeStaffToday: 0,
    completedStaffToday: 0,
    totalStaffOnSiteToday: 0,
    uniqueStaffCount: 0,
  });

  // Filter controls
  const [selectedMonthTab, setSelectedMonthTab] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [siteFilter, setSiteFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Live clock
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const isAdmin = currentUser?.role === "ORG_ADMIN";
  const isPrivileged = isSuperAdmin || isAdmin || ["HR_VIEWER", "AUDITOR"].includes(currentUser?.role);

  const loadData = async (scopeOverride?: "all" | "self") => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [authRes, sitesRes] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/sites", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      ]);

      const user = authRes?.data?.user;
      if (user) {
        setCurrentUser(user);
        // If not privileged and first load, lock to "my"
        if (!["SUPER_ADMIN", "ORG_ADMIN", "HR_VIEWER", "AUDITOR"].includes(user.role)) {
          setActiveTab("my");
        }
      }

      if (sitesRes?.success && sitesRes.data) {
        const rawSites = sitesRes.data || [];
        setSites(rawSites);
        if (rawSites.length > 0) {
          setSelectedSiteId((prev) => (rawSites.some((s: any) => s.id === prev) ? prev : rawSites[0].id));
        }
      }

      const isSuper = user?.role === "SUPER_ADMIN";
      const targetScope =
        scopeOverride ||
        (isSuper
          ? "all"
          : activeTab === "all" && ["ORG_ADMIN", "HR_VIEWER", "AUDITOR"].includes(user?.role)
          ? "all"
          : "self");

      const historyRes = await fetch(`/api/attendance/history?months=3&scope=${targetScope}`, {
        cache: "no-store",
      })
        .then((r) => r.json())
        .catch(() => ({}));

      if (historyRes?.success && historyRes.data) {
        setTodaySession(historyRes.data.todaySession || null);
        setSessions(historyRes.data.sessions || []);
        setMonthsBreakdown(historyRes.data.monthsBreakdown || []);
        if (historyRes.data.metrics) {
          setMetrics(historyRes.data.metrics);
        }
      }
    } catch (err: any) {
      console.error("Failed to load attendance history:", err);
      setErrorMessage("Failed to load attendance records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTabSwitch = (tab: "all" | "my") => {
    setActiveTab(tab);
    loadData(tab === "all" ? "all" : "self");
  };

  const getGpsCoords = async (): Promise<{ lat?: number; lng?: number; acc?: number }> => {
    if (typeof window === "undefined" || !navigator.geolocation) return {};
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 5000,
          enableHighAccuracy: true,
        });
      });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy,
      };
    } catch {
      return {};
    }
  };

  const handleCheckIn = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const gps = await getGpsCoords();
      const res = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: selectedSiteId || (sites.length > 0 ? sites[0].id : undefined),
          latitude: gps.lat,
          longitude: gps.lng,
          accuracyM: gps.acc,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to check in");
      } else {
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const gpsStr = gps.lat ? ` (GPS: ${gps.lat.toFixed(4)}, ${gps.lng?.toFixed(4)})` : "";
        setStatusMessage(`Checked in successfully at ${timeStr}${gpsStr}! Shift attendance recorded.`);
        await loadData();
      }
    } catch {
      setErrorMessage("Network error during check-in");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckOut = async () => {
    if (!todaySession) return;
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const gps = await getGpsCoords();
      const res = await fetch("/api/attendance/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: todaySession.id,
          latitude: gps.lat,
          longitude: gps.lng,
          accuracyM: gps.acc,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to check out");
      } else {
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const gpsStr = gps.lat ? ` (GPS: ${gps.lat.toFixed(4)}, ${gps.lng?.toFixed(4)})` : "";
        setStatusMessage(`Checked out successfully at ${timeStr}${gpsStr}! Today's shift completed.`);
        await loadData();
      }
    } catch {
      setErrorMessage("Network error during check-out");
    } finally {
      setSubmitting(false);
    }
  };

  // Unique roles present in sessions for filter dropdown
  const availableRoles = useMemo(() => {
    const roleSet = new Set<string>();
    sessions.forEach((s) => {
      if (s.employeeRole) roleSet.add(s.employeeRole);
    });
    return Array.from(roleSet);
  }, [sessions]);

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      // Month tab filter
      if (selectedMonthTab !== "ALL") {
        if (!s.workDate.startsWith(selectedMonthTab)) return false;
      }

      // Site filter
      if (siteFilter !== "ALL") {
        if (s.site?.id !== siteFilter) return false;
      }

      // Role filter
      if (roleFilter !== "ALL") {
        if (s.employeeRole !== roleFilter) return false;
      }

      // Status filter
      if (statusFilter !== "ALL") {
        if (statusFilter === "COMPLETED" && !s.checkOutAt) return false;
        if (statusFilter === "IN_PROGRESS" && s.checkOutAt) return false;
        if (statusFilter === "HALF_DAY" && s.status !== "HALF_DAY") return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const dateMatch = s.workDate.toLowerCase().includes(q);
        const nameMatch = s.employeeName?.toLowerCase().includes(q) || false;
        const roleMatch = s.employeeRole?.toLowerCase().includes(q) || false;
        const codeMatch = s.employeeCode?.toLowerCase().includes(q) || false;
        const siteMatch = s.site?.name?.toLowerCase().includes(q) || false;
        const notesMatch = s.notes?.toLowerCase().includes(q) || false;
        return dateMatch || nameMatch || roleMatch || codeMatch || siteMatch || notesMatch;
      }

      return true;
    });
  }, [sessions, selectedMonthTab, siteFilter, roleFilter, statusFilter, searchQuery]);

  const attendanceColumns: ExcelColumn<any>[] = useMemo(() => {
    const cols: ExcelColumn<any>[] = [];

    if (activeTab === "all" && isPrivileged) {
      cols.push({
        key: "employee",
        label: "Staff Member & Role",
        accessor: (s) => `${s.employeeName} (${s.employeeRole || ""})`,
        type: "text",
      });
    }

    cols.push(
      {
        key: "workDate",
        label: "Date & Day",
        accessor: (s) => formatDate(s.workDate),
        type: "date",
      },
      {
        key: "status",
        label: "Shift Status",
        accessor: (s) => (s.checkOutAt ? "Shift Completed" : "Active Shift"),
        type: "text",
      },
      {
        key: "checkInAt",
        label: "Check-In Time",
        accessor: (s) => (s.checkInAt ? formatDateTime(s.checkInAt) : "—"),
        type: "date",
      },
      {
        key: "checkOutAt",
        label: "Check-Out Time",
        accessor: (s) => (s.checkOutAt ? formatDateTime(s.checkOutAt) : "—"),
        type: "date",
      },
      {
        key: "durationHours",
        label: "Hours Logged",
        accessor: (s) => Number(s.durationHours) || 0,
        type: "number",
        align: "right",
      },
      {
        key: "siteName",
        label: "Site Location",
        accessor: (s) => s.siteName || "Head Office",
        type: "text",
      },
      {
        key: "gpsVerified",
        label: "GPS Verification",
        accessor: (s) => (s.gpsVerified ? "Verified" : "Unverified"),
        type: "text",
      }
    );

    return cols;
  }, [activeTab, isPrivileged]);

  const excelAttendance = useExcelTable({
    data: filteredSessions,
    columns: attendanceColumns,
  });

  // Export Attendance to CSV
  const handleExportCsv = () => {
    if (filteredSessions.length === 0) return;

    const isAllStaffMode = activeTab === "all" && isPrivileged;

    const headers = isAllStaffMode
      ? [
          "Employee Name",
          "Role",
          "Employee Code",
          "Date",
          "Day",
          "Status",
          "Check-In Time",
          "Check-In GPS",
          "Check-Out Time",
          "Check-Out GPS",
          "Duration",
          "Hours",
          "Site",
          "Notes",
        ]
      : [
          "Date",
          "Day",
          "Status",
          "Check-In Time",
          "Check-In GPS",
          "Check-Out Time",
          "Check-Out GPS",
          "Duration",
          "Hours",
          "Site",
          "Notes",
        ];

    const rows = filteredSessions.map((s) => {
      const dateObj = new Date(s.workDate);
      const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });
      const checkInTime = s.checkInAt
        ? new Date(s.checkInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";
      const checkInGps = s.checkInLat ? `${s.checkInLat.toFixed(4)}, ${s.checkInLng?.toFixed(4)}` : "";
      const checkOutTime = s.checkOutAt
        ? new Date(s.checkOutAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";
      const checkOutGps = s.checkOutLat ? `${s.checkOutLat.toFixed(4)}, ${s.checkOutLng?.toFixed(4)}` : "";

      const commonFields = [
        `"${s.workDate}"`,
        `"${dayName}"`,
        `"${s.checkOutAt ? "COMPLETED" : "IN PROGRESS"}"`,
        `"${checkInTime}"`,
        `"${checkInGps}"`,
        `"${checkOutTime}"`,
        `"${checkOutGps}"`,
        `"${s.durationFormatted}"`,
        `"${s.durationHours}"`,
        `"${s.site?.name || "Main Site"}"`,
        `"${s.notes || ""}"`,
      ];

      if (isAllStaffMode) {
        return [
          `"${s.employeeName}"`,
          `"${s.employeeRole}"`,
          `"${s.employeeCode}"`,
          ...commonFields,
        ].join(",");
      }

      return commonFields.join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const fileName = isAllStaffMode
      ? `all_staff_attendance_${new Date().toISOString().split("T")[0]}.csv`
      : `my_attendance_${currentUser?.name?.replace(/\s+/g, "_") || "staff"}.csv`;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isCheckedIn = Boolean(todaySession);
  const isCheckedOut = Boolean(todaySession?.checkOutAt);

  return (
    <Shell>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold shadow-xs">
                {isSuperAdmin ? <ShieldCheck className="w-5 h-5 text-amber-400" /> : <Clock className="w-5 h-5" />}
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <span>
                    {isSuperAdmin
                      ? "Organization Attendance & Staff Ledger"
                      : activeTab === "all"
                      ? "All Staff & Employee Attendance"
                      : "My Attendance & Shift Ledger"}
                  </span>
                  {isSuperAdmin && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black uppercase">
                      Executive Oversight
                    </span>
                  )}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isSuperAdmin
                    ? "Full organization attendance audit across all employees, site supervisors, and administrators (Super Admin is exempt from daily check-in)."
                    : isAdmin
                    ? "Mark your daily shift attendance and audit full organization attendance across all staff and sites."
                    : "Mark daily attendance with verified GPS and inspect your complete 3-month shift history."}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <button
              onClick={() => loadData()}
              disabled={loading}
              className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl transition shadow-2xs"
              title="Refresh attendance records"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-amber-500" : ""}`} />
            </button>
            <button
              onClick={handleExportCsv}
              disabled={filteredSessions.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition shadow-2xs disabled:opacity-50"
              title="Export Attendance Statement (CSV)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export Statement</span>
            </button>
          </div>
        </div>

        {/* Tab Switcher for Admin (Org Admin can view All Staff and My Attendance) */}
        {isAdmin && (
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 max-w-md">
            <button
              onClick={() => handleTabSwitch("all")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition ${
                activeTab === "all"
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200/60"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span>All Staff Attendance</span>
            </button>
            <button
              onClick={() => handleTabSwitch("my")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition ${
                activeTab === "my"
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200/60"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>My Attendance & Check-In</span>
            </button>
          </div>
        )}

        {/* Feedback Alerts */}
        {statusMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* SUPER ADMIN VIEW: Executive Overview Banner (NO CHECK IN CARD) */}
        {isSuperAdmin && (
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-md border border-slate-800 relative overflow-hidden">
            <div className="absolute right-0 top-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black uppercase tracking-wider">
                    SUPER ADMIN
                  </span>
                  <span className="text-xs text-slate-400">
                    {currentUser?.name || "Master Super Admin"} &bull; {currentUser?.email}
                  </span>
                </div>

                <div>
                  <div className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                    <span>
                      {currentTime.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span className="text-xs font-medium text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                      {currentTime.toLocaleDateString("en-US", {
                        weekday: "long",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/60 border border-amber-800/60 px-3 py-1.5 rounded-xl font-medium">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>Exempt from Daily Check-In &bull; Master Audit Mode</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1.5 rounded-xl font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>
                      {metrics.activeStaffToday} staff actively on site right now
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Summary Badges */}
              <div className="grid grid-cols-2 gap-3 min-w-[280px]">
                <div className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                    Staff On Site Today
                  </div>
                  <div className="text-lg font-black text-amber-400 mt-0.5 tabular-nums">
                    {metrics.totalStaffOnSiteToday} <span className="text-xs font-normal text-slate-400">staff</span>
                  </div>
                </div>
                <div className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                    Total Hours Logged
                  </div>
                  <div className="text-lg font-black text-emerald-400 mt-0.5 tabular-nums">
                    {metrics.totalHoursLogged} <span className="text-xs font-normal text-slate-400">hrs</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ORG ADMIN VIEW in "All Staff" tab: Quick Attendance Bar for Admin's own attendance */}
        {isAdmin && activeTab === "all" && (
          <div className="rounded-2xl border p-4 shadow-xs transition-all bg-white border-slate-200">
            {!isCheckedIn ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                      <span>Daily Shift Check-In Required for Admin</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold uppercase">
                        Pending Today
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Admins must log their daily attendance. Select site and mark check-in, or switch to &quot;My Attendance&quot;.
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                  {sites.length > 0 && (
                    <select
                      value={selectedSiteId}
                      onChange={(e) => setSelectedSiteId(e.target.value)}
                      className="bg-white border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={handleCheckIn}
                    disabled={submitting}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <UserCheck className="w-4 h-4" />
                    )}
                    <span>Check In Now</span>
                  </button>
                </div>
              </div>
            ) : !isCheckedOut ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-emerald-50/50 -m-4 p-4 rounded-2xl border border-emerald-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-emerald-950 flex items-center gap-2">
                      <span>Your Shift is Active</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    </div>
                    <div className="text-[11px] text-emerald-800 mt-0.5">
                      Checked in at{" "}
                      {new Date(todaySession!.checkInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{" "}
                      &bull; Duration: {todaySession!.durationFormatted} ({todaySession!.site?.name || "Main Site"})
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleCheckOut}
                  disabled={submitting}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {submitting ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Clock className="w-4 h-4" />
                  )}
                  <span>Check Out Today</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="font-semibold">
                    Your shift for today is completed ({todaySession!.durationFormatted} logged at{" "}
                    {todaySession!.site?.name || "Main Site"}).
                  </span>
                </div>
                <button
                  onClick={() => setActiveTab("my")}
                  className="text-xs font-bold text-slate-900 hover:text-amber-600 underline"
                >
                  View Details &rarr;
                </button>
              </div>
            )}
          </div>
        )}

        {/* PERSONAL CHECK IN CARD (Rendered when in "my" tab OR for regular employees) */}
        {(!isSuperAdmin && activeTab === "my") && (
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-md border border-slate-800 relative overflow-hidden">
            <div className="absolute right-0 top-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              {/* Left: Employee Info & Live Clock */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black uppercase tracking-wider">
                    {currentUser?.role || "EMPLOYEE"}
                  </span>
                  <span className="text-xs text-slate-400">
                    {currentUser?.name || "Staff Member"} &bull; {currentUser?.email}
                  </span>
                </div>

                <div>
                  <div className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                    <span>
                      {currentTime.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span className="text-xs font-medium text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                      {currentTime.toLocaleDateString("en-US", {
                        weekday: "long",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                {/* Status Banner */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {!isCheckedIn ? (
                    <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-xl">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                      <span>Ready to check in for today&apos;s shift</span>
                    </div>
                  ) : !isCheckedOut ? (
                    <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1.5 rounded-xl font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                      <span>
                        Checked in at{" "}
                        {new Date(todaySession!.checkInAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="text-slate-400">&bull;</span>
                      <span className="font-mono text-emerald-200">
                        Duration: {todaySession!.durationFormatted}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-blue-200 bg-blue-950/60 border border-blue-800/60 px-3 py-1.5 rounded-xl font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                      <span>
                        Shift Completed:{" "}
                        {new Date(todaySession!.checkInAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        to{" "}
                        {new Date(todaySession!.checkOutAt!).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        ({todaySession!.durationFormatted})
                      </span>
                    </div>
                  )}

                  {todaySession?.checkInLat && (
                    <div className="flex items-center gap-1 text-[11px] text-slate-300 bg-slate-800/70 border border-slate-700/80 px-2.5 py-1 rounded-lg font-mono">
                      <MapPin className="w-3 h-3 text-amber-400" />
                      <span>
                        GPS: {todaySession.checkInLat.toFixed(4)}, {todaySession.checkInLng?.toFixed(4)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Site Selector & Action Button */}
              <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row items-stretch sm:items-center gap-3">
                {!isCheckedIn && sites.length > 0 && (
                  <div className="min-w-[180px]">
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase tracking-wider">
                      Site Location:
                    </label>
                    <select
                      value={selectedSiteId}
                      onChange={(e) => setSelectedSiteId(e.target.value)}
                      className="w-full bg-slate-800 text-white border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    >
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Action Button */}
                <div>
                  {!isCheckedIn ? (
                    <button
                      onClick={handleCheckIn}
                      disabled={submitting}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm shadow-lg shadow-emerald-500/20 transition-all transform hover:scale-102 active:scale-98 disabled:opacity-50 cursor-pointer"
                    >
                      {submitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                          <span>Checking In...</span>
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-5 h-5 text-slate-950" />
                          <span>Check In Today</span>
                        </>
                      )}
                    </button>
                  ) : !isCheckedOut ? (
                    <button
                      onClick={handleCheckOut}
                      disabled={submitting}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black text-sm shadow-lg shadow-rose-500/20 transition-all transform hover:scale-102 active:scale-98 disabled:opacity-50 cursor-pointer"
                    >
                      {submitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Checking Out...</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-5 h-5 text-white" />
                          <span>Check Out</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-800/90 border border-slate-700 text-emerald-400 text-xs font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Shift Closed for Today</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3-Month Summary Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">
                {activeTab === "all" && isPrivileged ? "Total Shifts Logged" : "Days Present (3 Mos)"}
              </div>
              <div className="text-xl font-black text-slate-900 mt-0.5 tabular-nums">
                {metrics.totalDaysPresent}{" "}
                <span className="text-xs font-normal text-slate-400">
                  {activeTab === "all" && isPrivileged ? "shifts" : "days"}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">
                Completed Shifts
              </div>
              <div className="text-xl font-black text-emerald-600 mt-0.5 tabular-nums">
                {metrics.completedShifts} <span className="text-xs font-normal text-slate-400">shifts</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">
                Total Hours Logged
              </div>
              <div className="text-xl font-black text-blue-600 mt-0.5 tabular-nums">
                {metrics.totalHoursLogged} <span className="text-xs font-normal text-slate-400">hrs</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              {activeTab === "all" && isPrivileged ? <Users className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">
                {activeTab === "all" && isPrivileged ? "Staff On Site Today" : "Avg Daily Hours"}
              </div>
              <div className="text-xl font-black text-purple-600 mt-0.5 tabular-nums">
                {activeTab === "all" && isPrivileged ? (
                  <>
                    {metrics.totalStaffOnSiteToday}{" "}
                    <span className="text-xs font-normal text-slate-400">active</span>
                  </>
                ) : (
                  <>
                    {metrics.averageDailyHours}{" "}
                    <span className="text-xs font-normal text-slate-400">hrs/day</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Attendance Statement Table Section */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header & Filter Controls */}
          <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-amber-500" />
                <h2 className="font-black text-sm text-slate-900 tracking-tight">
                  {activeTab === "all" && isPrivileged
                    ? "Organization-Wide Attendance Ledger"
                    : "Personal Attendance Statement (Last 90 Days)"}
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold">
                  {filteredSessions.length} records
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {activeTab === "all" && isPrivileged
                  ? "Real-time records of all employees, supervisors, and administrators with site and GPS verification."
                  : "Complete shift records with check-in, check-out, working hours, and verified GPS coordinates."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search Bar */}
              <div className="relative min-w-[160px] sm:min-w-[200px]">
                <input
                  type="text"
                  placeholder={
                    activeTab === "all" && isPrivileged ? "Search staff, role, site..." : "Search date, site..."
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              </div>

              {/* Role Filter (when viewing all staff) */}
              {activeTab === "all" && isPrivileged && availableRoles.length > 0 && (
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                >
                  <option value="ALL">All Roles</option>
                  {availableRoles.map((r) => (
                    <option key={r} value={r}>
                      {getRoleBadge(r).label}
                    </option>
                  ))}
                </select>
              )}

              {/* Site Filter */}
              {sites.length > 0 && (
                <select
                  value={siteFilter}
                  onChange={(e) => setSiteFilter(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs max-w-[160px] truncate"
                >
                  <option value="ALL">All Sites</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
              >
                <option value="ALL">All Status</option>
                <option value="COMPLETED">Shift Completed</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="HALF_DAY">Half Day</option>
              </select>
            </div>
          </div>

          {/* Month Tabs */}
          <div className="px-4 py-2.5 border-b border-slate-200 bg-white flex items-center gap-1.5 overflow-x-auto text-xs font-bold text-slate-600">
            <button
              onClick={() => setSelectedMonthTab("ALL")}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                selectedMonthTab === "ALL"
                  ? "bg-slate-900 text-amber-400 shadow-xs"
                  : "hover:bg-slate-100 text-slate-600"
              }`}
            >
              All 3 Months ({sessions.length})
            </button>
            {monthsBreakdown.map((m) => (
              <button
                key={m.monthKey}
                onClick={() => setSelectedMonthTab(m.monthKey)}
                className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
                  selectedMonthTab === m.monthKey
                    ? "bg-slate-900 text-amber-400 shadow-xs"
                    : "hover:bg-slate-100 text-slate-600"
                }`}
              >
                <span>{m.label}</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700">
                  {m.count}
                </span>
              </button>
            ))}
          </div>

          {/* Records Table */}
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Loading attendance history...</span>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="p-16 text-center max-w-sm mx-auto space-y-2">
              <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6" />
              </div>
              <div className="text-sm font-bold text-slate-800">No Attendance Records Found</div>
              <div className="text-xs text-slate-500 leading-relaxed">
                {activeTab === "all" && isPrivileged
                  ? "No staff attendance records matched the selected filters for this time window."
                  : selectedMonthTab !== "ALL"
                  ? "No shifts logged for this selected month. Click \"Check In Today\" above to mark today's attendance."
                  : "No attendance shifts found in the past 3 months. Click \"Check In Today\" above to record your first shift."}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <ExcelTableToolbar
                table={excelAttendance}
                columns={attendanceColumns}
                tableName="attendance records"
                showSearch={true}
                showExport={true}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-200 uppercase tracking-wider text-[10px] font-semibold">
                    <tr>
                      {attendanceColumns.map((col) => (
                        <ExcelColumnHeader
                          key={col.key}
                          column={col}
                          table={excelAttendance}
                          theme="darkHeader"
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {excelAttendance.filteredData.map((s) => {
                    const dateObj = new Date(s.workDate);
                    const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });
                    const isCompleted = Boolean(s.checkOutAt);
                    const roleBadge = getRoleBadge(s.employeeRole);

                    return (
                      <tr
                        key={s.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          s.isToday ? "bg-amber-50/40" : ""
                        }`}
                      >
                        {/* Staff Member & Role column (for All Staff mode) */}
                        {activeTab === "all" && isPrivileged && (
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-slate-900 text-amber-400 font-black text-xs flex items-center justify-center shrink-0 shadow-2xs">
                                {s.employeeName.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                  <span>{s.employeeName}</span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span
                                    className={`text-[9px] px-1.5 py-0.2 rounded-md border ${roleBadge.className}`}
                                  >
                                    {roleBadge.label}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {s.employeeCode}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                        )}

                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{formatDate(s.workDate)}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-bold uppercase">
                              {dayName}
                            </span>
                            {s.isToday && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 uppercase">
                                Today
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          {isCompleted ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Shift Completed</span>
                            </span>
                          ) : s.isToday ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 inline-flex items-center gap-1 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              <span>In Progress</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              Present (Open)
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-700">
                          {s.checkInAt ? formatDateTime(s.checkInAt) : "—"}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-700">
                          {s.checkOutAt ? formatDateTime(s.checkOutAt) : "—"}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-slate-900">
                          <span
                            className={`px-2 py-0.5 rounded ${
                              s.durationMinutes >= 480
                                ? "bg-emerald-50 text-emerald-800"
                                : s.durationMinutes > 0
                                ? "bg-blue-50 text-blue-800"
                                : "text-slate-400"
                            }`}
                          >
                            {s.durationFormatted}
                          </span>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap text-slate-700">
                          <div className="flex items-center gap-1 font-semibold">
                            <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[150px]">
                              {s.site?.name || s.project?.name || "Main Site"}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                          {s.checkInLat ? (
                            <div className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                              <MapPin className="w-3 h-3 text-emerald-600" />
                              <span>
                                {s.checkInLat.toFixed(4)}, {s.checkInLng?.toFixed(4)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">No GPS data</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
