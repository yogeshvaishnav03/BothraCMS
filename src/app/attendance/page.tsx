"use client";

import { Alert } from "@/components/ui/Alert";
import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
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
  RefreshCw,
  Search,
  Filter,
  Sparkles,
  ShieldCheck,
  Users,
  Briefcase,
  ChevronRight,
  Info,
  X,
  BellRing,
  Sliders,
  UserPlus,
  AlertCircle,
  Save,
  Check,
} from "lucide-react";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, ExcelColumn } from "@/components/ui/ExcelTable";
import { useActiveSite } from "@/hooks/useActiveSite";
import { useAppSession } from "@/components/providers/AppSessionProvider";

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
  const { activeSiteId, setActiveSiteId } = useActiveSite();
  const { user: sessionUser, refreshUser, refreshSites } = useAppSession();
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

  // Attendance correction modal state
  const [correctionSession, setCorrectionSession] = useState<any>(null);
  const [correctionStatus, setCorrectionStatus] = useState<string>("PRESENT");
  const [correctionShift, setCorrectionShift] = useState<"GENERAL" | "DAY" | "NIGHT">("GENERAL");
  const [correctionCheckIn, setCorrectionCheckIn] = useState<string>("");
  const [correctionCheckOut, setCorrectionCheckOut] = useState<string>("");
  const [correctionReason, setCorrectionReason] = useState<string>("");
  const [correcting, setCorrecting] = useState<boolean>(false);

  // Shift timings & reminders state
  const [shiftSettings, setShiftSettings] = useState<any>(null);
  const [showShiftSettingsModal, setShowShiftSettingsModal] = useState<boolean>(false);
  const [shiftModalLoading, setShiftModalLoading] = useState<boolean>(false);
  const [tempShiftSettings, setTempShiftSettings] = useState<any>(null);

  // Alter staff attendance modal state (for Admin & Super Admin)
  const [showAlterModal, setShowAlterModal] = useState<boolean>(false);
  const [alterStaffLoading, setAlterStaffLoading] = useState<boolean>(false);
  const [staffUsers, setStaffUsers] = useState<any[]>([]);
  const [alterUserId, setAlterUserId] = useState<string>("");
  const [alterSiteId, setAlterSiteId] = useState<string>("");
  const [alterDate, setAlterDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [alterShift, setAlterShift] = useState<"GENERAL" | "DAY" | "NIGHT">("GENERAL");
  const [alterStatus, setAlterStatus] = useState<string>("PRESENT");
  const [alterCheckIn, setAlterCheckIn] = useState<string>("");
  const [alterCheckOut, setAlterCheckOut] = useState<string>("");
  const [alterReason, setAlterReason] = useState<string>("");

  // Synchronize Attendance site filter with global active site
  useEffect(() => {
    setSiteFilter(activeSiteId || "ALL");
    if (activeSiteId) {
      setSelectedSiteId(activeSiteId);
      setAlterSiteId(activeSiteId);
    }
  }, [activeSiteId]);

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
      const resolveScope = (u: any) =>
        scopeOverride ||
        (u?.role === "SUPER_ADMIN"
          ? "all"
          : activeTab === "all" && ["ORG_ADMIN", "HR_VIEWER", "AUDITOR"].includes(u?.role)
          ? "all"
          : "self");

      const userPromise = sessionUser ? Promise.resolve(sessionUser) : refreshUser();
      const historyPromise = userPromise.then((u) =>
        fetch(`/api/attendance/history?months=3&scope=${resolveScope(u)}`, {
          cache: "no-store",
        })
          .then((r) => r.json())
          .catch(() => ({}))
      );
      const usersPromise = userPromise.then((u) =>
        u && ["SUPER_ADMIN", "ORG_ADMIN"].includes(u.role)
          ? fetch("/api/users", { cache: "no-store" })
              .then((r) => r.json())
              .catch(() => null)
          : null
      );

      const [user, rawSites, shiftRes, historyRes, usersRes] = await Promise.all([
        userPromise,
        refreshSites(),
        fetch("/api/attendance/shifts", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        historyPromise,
        usersPromise,
      ]);

      if (shiftRes?.success && shiftRes.data) {
        setShiftSettings(shiftRes.data);
      }

      if (user) {
        setCurrentUser(user);
        if (!["SUPER_ADMIN", "ORG_ADMIN", "HR_VIEWER", "AUDITOR"].includes(user.role)) {
          setActiveTab("my");
        }
      }

      if (usersRes?.success && usersRes.data) {
        setStaffUsers(usersRes.data);
        if (usersRes.data.length > 0) {
          setAlterUserId((prev) => prev || usersRes.data[0].id);
        }
      }

      if (Array.isArray(rawSites) && rawSites.length > 0) {
        setSites(rawSites);
        setSelectedSiteId((prev) => (rawSites.some((s: any) => s.id === prev) ? prev : rawSites[0].id));
        setAlterSiteId((prev) => (rawSites.some((s: any) => s.id === prev) ? prev : rawSites[0].id));
      }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabSwitch = (tab: "all" | "my") => {
    setActiveTab(tab);
    loadData(tab === "all" ? "all" : "self");
  };

  const getGpsCoords = async (): Promise<{ lat: number; lng: number; acc: number }> => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      throw new Error("📍 GPS/Geolocation is not supported by your browser or connection. GPS capture is mandatory to check in.");
    }
    return new Promise<{ lat: number; lng: number; acc: number }>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            acc: pos.coords.accuracy,
          });
        },
        (err) => {
          let msg = "📍 GPS location is mandatory to check in.";
          if (err.code === 1) {
            msg = "📍 Location access denied. GPS capture is mandatory before check-in can be submitted. Please allow location permissions in your browser or device settings and try again.";
          } else if (err.code === 2) {
            msg = "📍 GPS location unavailable. Please ensure device location/GPS is enabled and try again.";
          } else if (err.code === 3) {
            msg = "📍 GPS location request timed out. Please check your device GPS signal and try again.";
          } else {
            msg = `📍 GPS error: ${err.message || "Failed to capture GPS coordinates. GPS is mandatory to check in."}`;
          }
          reject(new Error(msg));
        },
        {
          timeout: 10000,
          enableHighAccuracy: true,
          maximumAge: 0,
        }
      );
    });
  };

  const handleCheckIn = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    // Enforce mandatory GPS capture
    let gps: { lat: number; lng: number; acc: number };
    try {
      gps = await getGpsCoords();
    } catch (gpsErr: any) {
      setErrorMessage(gpsErr.message || "📍 GPS location capture is mandatory before check-in can be submitted.");
      setSubmitting(false);
      return;
    }

    if (!gps || typeof gps.lat !== "number" || typeof gps.lng !== "number" || isNaN(gps.lat) || isNaN(gps.lng)) {
      setErrorMessage("📍 GPS location capture is mandatory before check-in can be submitted. Please allow location permissions and try again.");
      setSubmitting(false);
      return;
    }

    try {
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
        const gpsStr = ` (GPS: ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)})`;
        setStatusMessage(`Checked in successfully at ${timeStr}${gpsStr}! Shift attendance recorded.`);
        await loadData();
      }
    } catch {
      setErrorMessage("Network error during check-in");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenCorrection = (session: any) => {
    setCorrectionSession(session);
    setCorrectionStatus(session.status || "PRESENT");
    const matchedShift = (session.notes?.match(/\[Shift:\s*(GENERAL|DAY|NIGHT)\]/i)?.[1]?.toUpperCase() as any) || "GENERAL";
    setCorrectionShift(matchedShift);
    setCorrectionCheckIn(session.checkInAt ? new Date(session.checkInAt).toISOString().slice(0, 16) : "");
    setCorrectionCheckOut(session.checkOutAt ? new Date(session.checkOutAt).toISOString().slice(0, 16) : "");
    setCorrectionReason("");
  };

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionSession) return;
    if (!correctionReason.trim() || correctionReason.trim().length < 5) {
      setErrorMessage("A detailed justification (minimum 5 characters) is required for attendance correction");
      return;
    }

    setCorrecting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/attendance/${correctionSession.id}/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: correctionStatus,
          checkInAt: correctionCheckIn ? new Date(correctionCheckIn).toISOString() : undefined,
          checkOutAt: correctionCheckOut ? new Date(correctionCheckOut).toISOString() : undefined,
          shift: correctionShift,
          reason: correctionReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to correct attendance time-tag");
        return;
      }

      setStatusMessage("Attendance record corrected successfully with immutable audit trail recorded.");
      setCorrectionSession(null);
      await loadData();
    } catch {
      setErrorMessage("Network error during attendance correction");
    } finally {
      setCorrecting(false);
    }
  };

  // Alter Staff Attendance Handlers (Admin & Super Admin)
  const handleOpenAlterModal = () => {
    const today = new Date().toISOString().split("T")[0];
    setAlterDate(today);
    setAlterShift("GENERAL");
    setAlterStatus("PRESENT");
    setAlterCheckIn(`${today}T09:30`);
    setAlterCheckOut(`${today}T18:30`);
    setAlterReason("");
    if (staffUsers.length > 0 && !alterUserId) {
      setAlterUserId(staffUsers[0].id);
    }
    if (sites.length > 0 && !alterSiteId) {
      setAlterSiteId(sites[0].id);
    }
    setShowAlterModal(true);
  };

  const handleAlterStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alterUserId) {
      setErrorMessage("Please select a staff member to alter attendance.");
      return;
    }
    if (!alterSiteId) {
      setErrorMessage("Please select a site location.");
      return;
    }
    if (!alterReason.trim() || alterReason.trim().length < 5) {
      setErrorMessage("Mandatory administrative justification (min 5 characters) is required.");
      return;
    }

    setAlterStaffLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: alterUserId,
          siteId: alterSiteId,
          workDate: alterDate,
          shift: alterShift,
          status: alterStatus,
          checkInAt: alterCheckIn ? new Date(alterCheckIn).toISOString() : undefined,
          checkOutAt: alterCheckOut ? new Date(alterCheckOut).toISOString() : undefined,
          reason: alterReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to alter staff attendance.");
        return;
      }

      setStatusMessage(data.data?.message || "Staff attendance successfully altered and audited.");
      setShowAlterModal(false);
      await loadData();
    } catch {
      setErrorMessage("Network error altering staff attendance.");
    } finally {
      setAlterStaffLoading(false);
    }
  };

  // Shift Settings Handlers (Admin & Super Admin)
  const handleOpenShiftSettings = () => {
    setTempShiftSettings(JSON.parse(JSON.stringify(shiftSettings || {
      enableCheckoutReminder: true,
      reminderGraceMinutes: 15,
      standardWorkHours: 8,
      shifts: [
        { code: "GENERAL", name: "General Shift", startTime: "09:30", endTime: "18:30", durationHours: 9 },
        { code: "DAY", name: "Morning / Day Shift", startTime: "08:00", endTime: "17:00", durationHours: 9 },
        { code: "NIGHT", name: "Night Shift", startTime: "20:00", endTime: "05:00", durationHours: 9 },
      ],
    })));
    setShowShiftSettingsModal(true);
  };

  const handleSaveShiftSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempShiftSettings) return;
    setShiftModalLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/attendance/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tempShiftSettings),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to update shift timings.");
        return;
      }

      setShiftSettings(data.data?.settings);
      setStatusMessage("Shift timings and checkout reminder policies updated successfully.");
      setShowShiftSettingsModal(false);
    } catch {
      setErrorMessage("Network error saving shift settings.");
    } finally {
      setShiftModalLoading(false);
    }
  };

  // Real-time Checkout Reminder check for account holders
  const isShiftEndedForToday = useMemo(() => {
    if (!todaySession || todaySession.checkOutAt) return false;
    // 1. Duration check
    const targetHours = shiftSettings?.standardWorkHours || 8;
    if (todaySession.durationHours >= targetHours) return true;

    // 2. Scheduled timing check (Current IST time past 18:30 for General Shift)
    const now = currentTime;
    const istHours = (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24;
    const istMinutes = (now.getUTCMinutes() + 30) % 60;
    const currentMins = istHours * 60 + istMinutes;

    // General Shift finishes at 18:30 (1110 mins)
    const shiftEndMinutes = 18 * 60 + 30;
    return currentMins >= shiftEndMinutes;
  }, [todaySession, shiftSettings, currentTime]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCorrectionSession(null);
      }
    };
    if (correctionSession) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [correctionSession]);

  const handleCheckOut = async () => {
    if (!todaySession) return;
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      let gps: { lat?: number; lng?: number; acc?: number } = {};
      try {
        gps = await getGpsCoords();
      } catch {
        // Attempt GPS on check-out, but do not block shift completion if signal drops
      }
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
        key: "gpsVerified",
        label: "GPS Verification",
        accessor: (s) => (s.gpsVerified ? "Verified" : "Unverified"),
        type: "text",
      }
    );

    if (isPrivileged) {
      cols.push({
        key: "actions",
        label: "Action",
        accessor: () => "",
        type: "text",
        align: "center",
      });
    }

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
                      ? "Staff Attendance & Check-Ins"
                      : activeTab === "all"
                      ? "All Staff Attendance"
                      : "My Attendance"}
                  </span>
                  {isSuperAdmin && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black uppercase">
                      All Sites
                    </span>
                  )}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isSuperAdmin
                    ? "View and track attendance across all employees, site supervisors, and managers."
                    : isAdmin
                    ? "Check in for your daily shift and view attendance across all staff and sites."
                    : "Check in daily with GPS location and view your shift history."}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
            {isPrivileged && (
              <>
                <button
                  type="button"
                  onClick={handleOpenAlterModal}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black rounded-xl text-xs transition shadow-sm cursor-pointer"
                  title="Alter or record attendance for another account holder"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Alter Staff Attendance</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenShiftSettings}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
                  title="Alter Shift Timings and Automatic Checkout Reminders"
                >
                  <Sliders className="w-3.5 h-3.5 text-slate-600" />
                  <span>Shift Timings & Reminders</span>
                </button>
              </>
            )}

            {["SUPER_ADMIN", "ORG_ADMIN", "SITE_SUPERVISOR", "HR_VIEWER"].includes(currentUser?.role) && (
              <Link
                href="/attendance/muster"
                className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-2xs transition hover:bg-slate-800"
              >
                <Users className="h-3.5 w-3.5" /> Site master
              </Link>
            )}
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

        {/* REAL-TIME CHECKOUT REMINDER BANNER FOR ACTIVE UNCLOSED SHIFTS */}
        {isShiftEndedForToday && (
          <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-slate-950 p-4 sm:p-5 rounded-2xl shadow-lg border border-amber-300 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3">
                <div className="p-2.5 bg-slate-950 text-amber-400 rounded-xl shadow-md shrink-0">
                  <BellRing className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm sm:text-base text-slate-950 tracking-tight">
                      ⏰ Shift Completed — Checkout Reminder!
                    </span>
                    <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-slate-950 text-amber-300">
                      Action Required
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-950/90 mt-1">
                    Your scheduled shift has concluded. You checked in at{" "}
                    <strong>
                      {todaySession
                        ? new Date(todaySession.checkInAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "shift start"}
                    </strong>{" "}
                    ({todaySession?.durationFormatted} logged so far). Please tap Check Out Now to record your departure with GPS verification.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCheckOut}
                disabled={submitting}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-950 hover:bg-slate-900 text-white rounded-xl text-xs font-black shadow-md transition transform hover:scale-105 active:scale-95 shrink-0 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Clock className="w-4 h-4 text-amber-400" />
                )}
                <span>Check Out Now (GPS)</span>
              </button>
            </div>
          </div>
        )}

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
        {statusMessage && <Alert tone="success">{statusMessage}</Alert>}
        {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

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
                      <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5 text-emerald-600" /> GPS Mandatory
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Admins must log their daily attendance. Mark check-in, or switch to &quot;My Attendance&quot;.
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
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

              {/* Right: Action Button */}
              <div className="flex items-center">
                {/* Action Button */}
                <div>
                  {!isCheckedIn ? (
                    <div>
                      <button
                        onClick={handleCheckIn}
                        disabled={submitting}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm shadow-lg shadow-emerald-500/20 transition-all transform hover:scale-102 active:scale-98 disabled:opacity-50 cursor-pointer"
                      >
                        {submitting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                            <span>Checking In (Verifying GPS)...</span>
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-5 h-5 text-slate-950" />
                            <span>Check In Today</span>
                          </>
                        )}
                      </button>
                      <div className="flex items-center justify-center sm:justify-start gap-1 text-[11px] text-amber-400/90 mt-1.5 font-medium">
                        <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>Mandatory GPS capture required</span>
                      </div>
                    </div>
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
                  onChange={(e) => {
                    const val = e.target.value;
                    setSiteFilter(val);
                    setActiveSiteId(val === "ALL" ? "" : val);
                  }}
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
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm min-h-[400px]">
              <ExcelTableToolbar
                table={excelAttendance}
                columns={attendanceColumns}
                tableName="attendance records"
                showSearch={true}
                showExport={true}
              />
              {/* Desktop Table View (≥ lg screens) */}
              <div className="hidden lg:block overflow-x-auto min-h-[400px]">
                <table className="w-full text-left text-xs min-w-[700px]">
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

                        {isPrivileged && (
                          <td className="py-3 px-4 whitespace-nowrap text-center">
                            <button
                              type="button"
                              onClick={() => handleOpenCorrection(s)}
                              className="px-2.5 py-1 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition"
                              title="Correct time or shift status"
                              aria-label={`Correct attendance for ${s.employeeName || "staff"} on ${formatDate(s.workDate)}`}
                            >
                              Correct
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Attendance Cards (< lg screens) */}
            <div className="lg:hidden p-3 bg-slate-50/60 space-y-3 min-h-[300px]">
              {excelAttendance.filteredData.map((s) => {
                const dateObj = new Date(s.workDate);
                const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });
                const isCompleted = Boolean(s.checkOutAt);
                const roleBadge = getRoleBadge(s.employeeRole);

                return (
                  <div key={`att-card-${s.id}`} className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all">
                    {/* Top: Staff Name, Role and Shift Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 text-sm">{s.employeeName}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className={`text-[9px] px-1.5 py-0.2 rounded-md border ${roleBadge.className}`}>
                            {roleBadge.label}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">{s.employeeCode}</span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="shrink-0">
                        {isCompleted ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>Shift Done</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            <span>On Shift</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle: Work Date & Check-in / Check-out Times */}
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs">
                      <div>
                        <div className="text-[11px] text-slate-400 font-medium">Work Date</div>
                        <div className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                          <span>{formatDate(s.workDate)}</span>
                          <span className="text-[10px] font-mono uppercase text-slate-500">({dayName})</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[11px] text-slate-400 font-medium">Timing</div>
                        <div className="text-slate-700 font-mono text-[11px] mt-0.5">
                          {s.checkInAt ? new Date(s.checkInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                          {" → "}
                          {s.checkOutAt ? new Date(s.checkOutAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Active"}
                        </div>
                      </div>
                    </div>

                    {/* Footer: GPS verification and Correct Action */}
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 text-[11px]">
                        {s.checkInLat ? (
                          <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                            <span className="text-emerald-600">✓</span> GPS Logged
                          </span>
                        ) : (
                          <span className="text-slate-400">Standard check-in</span>
                        )}
                      </div>

                      {isPrivileged && (
                        <button
                          type="button"
                          onClick={() => handleOpenCorrection(s)}
                          className="px-2.5 py-1 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition"
                        >
                          Correct
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </div>

        {/* Attendance Time-Tag & Status Correction Modal */}
        {correctionSession && (
          <div
            className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setCorrectionSession(null);
            }}
          >
            <div
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-labelledby="attendance-correction-title"
            >
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-400" />
                  <span id="attendance-correction-title" className="font-bold text-sm">
                    Correct Attendance Record ({formatDate(correctionSession.workDate)})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCorrectionSession(null)}
                  className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-slate-800"
                  aria-label="Close correction modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCorrectionSubmit} className="p-5 overflow-y-auto space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-slate-800 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-slate-600 text-[11px] leading-relaxed">
                    Audited administrative action for staff: <strong className="text-slate-900">{correctionSession.employeeName}</strong> ({correctionSession.employeeCode}). All edits create an immutable entry in the system audit log.
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Shift Timing *
                    </label>
                    <select
                      value={correctionShift}
                      onChange={(e) => setCorrectionShift(e.target.value as any)}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                    >
                      <option value="GENERAL">General Shift (09:30 - 18:30)</option>
                      <option value="DAY">Morning / Day Shift (08:00 - 17:00)</option>
                      <option value="NIGHT">Night Shift (20:00 - 05:00)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Shift Status *
                    </label>
                    <select
                      value={correctionStatus}
                      onChange={(e) => setCorrectionStatus(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                    >
                      <option value="PRESENT">Present (Full Day)</option>
                      <option value="HALF_DAY">Half Day</option>
                      <option value="OVERTIME">Overtime</option>
                      <option value="ABSENT">Absent</option>
                      <option value="ON_LEAVE">On Approved Leave</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Check-In Timestamp
                    </label>
                    <input
                      type="datetime-local"
                      value={correctionCheckIn}
                      onChange={(e) => setCorrectionCheckIn(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Check-Out Timestamp
                    </label>
                    <input
                      type="datetime-local"
                      value={correctionCheckOut}
                      onChange={(e) => setCorrectionCheckOut(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Justification / Reason * (min. 5 chars)
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                    placeholder="Provide explicit operational reason for this correction (e.g. Employee forgot to tap check-out before leaving site)..."
                    className="w-full text-xs font-normal p-3 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCorrectionSession(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={correcting || correctionReason.trim().length < 5}
                    className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition"
                  >
                    {correcting ? "Saving Correction..." : "Save Correction"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ALTER / RECORD STAFF ATTENDANCE MODAL (Super Admin & Admin) */}
        {showAlterModal && (
          <div
            className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowAlterModal(false);
            }}
          >
            <div
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-150"
              role="dialog"
              aria-modal="true"
            >
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="font-black text-sm">Alter / Record Staff Attendance</h3>
                    <p className="text-[11px] text-slate-400">Admin & Super Admin Operational Override</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAlterModal(false)}
                  className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAlterStaffSubmit} className="p-5 overflow-y-auto space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-slate-800 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-slate-600 text-[11px] leading-relaxed">
                    As an Admin / Super Admin, you can record or alter shift attendance for any employee who forgot to check in or out. An audited record will be created.
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Select Account Holder / Employee <span className="text-rose-600">*</span>
                  </label>
                  <select
                    required
                    value={alterUserId}
                    onChange={(e) => setAlterUserId(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                  >
                    {staffUsers.length === 0 ? (
                      <option value="">No staff accounts found</option>
                    ) : (
                      staffUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} — {u.role?.replace(/_/g, " ")} ({u.email})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Site Location <span className="text-rose-600">*</span>
                    </label>
                    <select
                      required
                      value={alterSiteId}
                      onChange={(e) => setAlterSiteId(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                    >
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Work Date <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={alterDate}
                      onChange={(e) => {
                        setAlterDate(e.target.value);
                        if (alterCheckIn) setAlterCheckIn(`${e.target.value}T${alterCheckIn.split("T")[1] || "09:30"}`);
                        if (alterCheckOut) setAlterCheckOut(`${e.target.value}T${alterCheckOut.split("T")[1] || "18:30"}`);
                      }}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Shift Timing <span className="text-rose-600">*</span>
                    </label>
                    <select
                      value={alterShift}
                      onChange={(e) => {
                        const s = e.target.value as any;
                        setAlterShift(s);
                        if (s === "DAY") {
                          setAlterCheckIn(`${alterDate}T08:00`);
                          setAlterCheckOut(`${alterDate}T17:00`);
                        } else if (s === "NIGHT") {
                          setAlterCheckIn(`${alterDate}T20:00`);
                          setAlterCheckOut(`${alterDate}T05:00`);
                        } else {
                          setAlterCheckIn(`${alterDate}T09:30`);
                          setAlterCheckOut(`${alterDate}T18:30`);
                        }
                      }}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                    >
                      <option value="GENERAL">General Shift (09:30 - 18:30)</option>
                      <option value="DAY">Morning / Day Shift (08:00 - 17:00)</option>
                      <option value="NIGHT">Night Shift (20:00 - 05:00)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Attendance Status <span className="text-rose-600">*</span>
                    </label>
                    <select
                      value={alterStatus}
                      onChange={(e) => setAlterStatus(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                    >
                      <option value="PRESENT">Present (Full Day)</option>
                      <option value="HALF_DAY">Half Day</option>
                      <option value="OVERTIME">Overtime</option>
                      <option value="ON_LEAVE">On Approved Leave</option>
                      <option value="ABSENT">Absent</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Check-In Timestamp
                    </label>
                    <input
                      type="datetime-local"
                      value={alterCheckIn}
                      onChange={(e) => setAlterCheckIn(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Check-Out Timestamp
                    </label>
                    <input
                      type="datetime-local"
                      value={alterCheckOut}
                      onChange={(e) => setAlterCheckOut(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Administrative Reason / Justification <span className="text-rose-600">*</span> (min. 5 chars)
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={alterReason}
                    onChange={(e) => setAlterReason(e.target.value)}
                    placeholder="e.g. Employee forgot to punch out after late night shuttering; verified with Site Engineer..."
                    className="w-full text-xs font-normal p-3 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAlterModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={alterStaffLoading || alterReason.trim().length < 5}
                    className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition"
                  >
                    {alterStaffLoading ? "Saving Attendance..." : "Save Staff Attendance"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SHIFT TIMINGS & REMINDERS SETTINGS MODAL (Super Admin & Admin) */}
        {showShiftSettingsModal && tempShiftSettings && (
          <div
            className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowShiftSettingsModal(false);
            }}
          >
            <div
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-150"
              role="dialog"
              aria-modal="true"
            >
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="font-black text-sm">Shift Timings & Automatic Checkout Reminders</h3>
                    <p className="text-[11px] text-slate-400">Configure operational shifts, work hours, and staff reminder policies</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowShiftSettingsModal(false)}
                  className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveShiftSettings} className="p-5 overflow-y-auto space-y-5">
                {/* General Policies */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-900">Automatic Shift Checkout Reminders</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Alert account holders on their dashboard and notification center when their scheduled shift has concluded and they haven&apos;t checked out.
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempShiftSettings.enableCheckoutReminder}
                        onChange={(e) =>
                          setTempShiftSettings({ ...tempShiftSettings, enableCheckoutReminder: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Reminder Grace Window (Minutes)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={180}
                        value={tempShiftSettings.reminderGraceMinutes}
                        onChange={(e) =>
                          setTempShiftSettings({ ...tempShiftSettings, reminderGraceMinutes: Number(e.target.value) })
                        }
                        className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-white focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-[10px] text-slate-500 mt-0.5 block">Minutes after shift completion before urgent alert</span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Standard Work Day Hours
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min={4}
                        max={16}
                        value={tempShiftSettings.standardWorkHours}
                        onChange={(e) =>
                          setTempShiftSettings({ ...tempShiftSettings, standardWorkHours: Number(e.target.value) })
                        }
                        className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-white focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-[10px] text-slate-500 mt-0.5 block">Default working shift duration across company</span>
                    </div>
                  </div>
                </div>

                {/* Shift Timings Configurations */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                    Shift Timings Schedule
                  </h4>

                  <div className="space-y-3">
                    {tempShiftSettings.shifts?.map((shift: any, idx: number) => (
                      <div key={shift.code} className="p-3.5 border border-slate-200 rounded-xl bg-white shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                            <span>{shift.name} ({shift.code})</span>
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                            {shift.durationHours} Hours Duration
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                              Start Time (HH:mm)
                            </label>
                            <input
                              type="time"
                              value={shift.startTime}
                              onChange={(e) => {
                                const copy = [...tempShiftSettings.shifts];
                                copy[idx] = { ...copy[idx], startTime: e.target.value };
                                setTempShiftSettings({ ...tempShiftSettings, shifts: copy });
                              }}
                              className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:outline-none focus:border-amber-500"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                              End Time (HH:mm)
                            </label>
                            <input
                              type="time"
                              value={shift.endTime}
                              onChange={(e) => {
                                const copy = [...tempShiftSettings.shifts];
                                copy[idx] = { ...copy[idx], endTime: e.target.value };
                                setTempShiftSettings({ ...tempShiftSettings, shifts: copy });
                              }}
                              className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:outline-none focus:border-amber-500"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                              Shift Hours
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              min={1}
                              max={24}
                              value={shift.durationHours}
                              onChange={(e) => {
                                const copy = [...tempShiftSettings.shifts];
                                copy[idx] = { ...copy[idx], durationHours: Number(e.target.value) };
                                setTempShiftSettings({ ...tempShiftSettings, shifts: copy });
                              }}
                              className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg bg-slate-50 focus:outline-none focus:border-amber-500"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowShiftSettingsModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={shiftModalLoading}
                    className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 rounded-xl shadow-xs transition"
                  >
                    {shiftModalLoading ? "Saving Policies..." : "Save Shift Settings"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
