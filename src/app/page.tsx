"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  FolderKanban,
  CheckSquare,
  HardHat,
  AlertTriangle,
  Boxes,
  DollarSign,
  TrendingDown,
  PlusCircle,
  PackagePlus,
  PackageMinus,
  UserCheck,
  Clock,
  CheckCircle2,
  X,
  Plus,
  ExternalLink,
  ArrowRight,
  Building2,
  MapPin,
  Globe,
  Camera,
  User,
  Image as ImageIcon,
  ShieldCheck,
  Calendar,
  Users,
  Upload,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { clientCache } from "@/lib/client-cache";
import { useLanguage } from "@/lib/i18n";

export default function DashboardPage() {
  const { t } = useLanguage();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [dashboardMode, setDashboardMode] = useState<"EXECUTIVE" | "EMPLOYEE">("EXECUTIVE");
  const [recentPhotos, setRecentPhotos] = useState<any[]>([]);
  const [lightboxPhoto, setLightboxPhoto] = useState<any>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);

  const refreshRecentPhotos = async () => {
    try {
      const res = await fetch("/api/attachments?category=PHOTO&limit=8");
      const data = await res.json();
      if (res.ok && data.success) {
        setRecentPhotos(data.data || []);
      }
    } catch {
      // Ignore
    }
  };

  const handleDashboardPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhoto(true);
    setPhotoMsg(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", "PHOTO");
        formData.append("entityType", "SITE_PHOTO");
        formData.append("entityId", activeSiteId || "SITE");
        if (activeSiteId) formData.append("projectId", activeSiteId);

        const res = await fetch("/api/attachments", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || "Failed to upload site photo");
        }
      }
      setPhotoMsg("Site photograph(s) uploaded and saved successfully!");
      await refreshRecentPhotos();
    } catch (err: any) {
      alert(err.message || "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const handleDashboardPhotoReplace = async (photoId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    setPhotoMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/attachments/${photoId}`, {
        method: "PUT",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        // Fallback: POST new and DELETE old
        const postData = new FormData();
        postData.append("file", file);
        postData.append("category", "PHOTO");
        postData.append("entityType", "SITE_PHOTO");
        postData.append("entityId", activeSiteId || "SITE");
        const postRes = await fetch("/api/attachments", { method: "POST", body: postData });
        const postJson = await postRes.json();
        if (!postRes.ok || !postJson.success) {
          throw new Error(data.error?.message || postJson.error?.message || "Failed to replace photo");
        }
        await fetch(`/api/attachments/${photoId}`, { method: "DELETE" });
      }

      setPhotoMsg("Photo replaced successfully!");
      await refreshRecentPhotos();
      if (lightboxPhoto?.id === photoId) {
        setLightboxPhoto((prev: any) => ({
          ...prev,
          url: `/api/uploads/${prev.fileId}?t=${Date.now()}`,
          fileName: file.name,
        }));
      }
    } catch (err: any) {
      alert(err.message || "Failed to replace photo");
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const handleDashboardPhotoDelete = async (photoId: string, fileName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) return;

    try {
      const res = await fetch(`/api/attachments/${photoId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to delete photo");
      }
      setRecentPhotos((prev) => prev.filter((p) => p.id !== photoId));
      if (lightboxPhoto?.id === photoId) {
        setLightboxPhoto(null);
      }
      setPhotoMsg("Photo deleted successfully!");
    } catch (err: any) {
      alert(err.message || "Failed to delete photo");
    }
  };

  const [kpi, setKpi] = useState<any>(null);
  const [activeKpiModal, setActiveKpiModal] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSiteId, setActiveSiteId] = useState<string>("");

  // Quick Task Modal
  const [showQuickTaskModal, setShowQuickTaskModal] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickProjectId, setQuickProjectId] = useState("");
  const [quickPriority, setQuickPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [quickDueAt, setQuickDueAt] = useState("");

  // Attendance state for logged in user
  const [todaySessions, setTodaySessions] = useState<any[]>([]);

  // Feedback notifications
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittingTask, setSubmittingTask] = useState(false);
  const [submittingCheckIn, setSubmittingCheckIn] = useState(false);

  const refreshKpis = (serverKpi?: any, siteId?: string) => {
    const computed = clientCache.calculateKpis(serverKpi, siteId);
    setKpi(computed);
  };

  const loadDashboard = (siteId?: string) => {
    setLoading(true);
    const kpiUrl = siteId ? `/api/dashboard/kpi?siteId=${siteId}` : "/api/dashboard/kpi";
    const projUrl = siteId ? `/api/projects?siteId=${siteId}` : "/api/projects";
    const todayStr = new Date().toISOString().split("T")[0];

    Promise.all([
      fetch(kpiUrl).then((r) => r.json()),
      fetch(projUrl).then((r) => r.json()),
      fetch("/api/tasks").then((r) => r.json()),
      fetch(`/api/attendance?workDate=${todayStr}${siteId ? `&siteId=${siteId}` : ""}`).then((r) => r.json()),
      fetch("/api/materials").then((r) => r.json()),
      fetch(`/api/workforce${siteId ? `?siteId=${siteId}` : ""}`).then((r) => r.json()),
      fetch("/api/sites").then((r) => r.json()),
      fetch("/api/auth/me").then((r) => r.json()).catch(() => ({})),
      fetch("/api/attachments?category=PHOTO&limit=8").then((r) => r.json()).catch(() => ({})),
    ])
      .then(([kpiRes, projRes, taskRes, attRes, matRes, wfRes, sitesRes, meRes, photoRes]) => {
        if (meRes.success && meRes.data) {
          setCurrentUser(meRes.data.user);
        }
        if (photoRes.success && photoRes.data) {
          setRecentPhotos(photoRes.data || []);
        }
        if (attRes.success) {
          setTodaySessions(attRes.data || []);
        }

        const rawProjs = projRes.data || [];
        const rawTasks = taskRes.data || [];
        const rawWorkers = wfRes.data || [];
        const rawSites = sitesRes.data || [];

        setSites(rawSites);
        setWorkers(rawWorkers);

        const filteredProjs = siteId ? rawProjs.filter((p: any) => p.siteId === siteId) : rawProjs;
        const filteredTasks = siteId
          ? rawTasks.filter((t: any) => t.project?.siteId === siteId || filteredProjs.some((p: any) => p.id === t.projectId))
          : rawTasks;

        setProjects(filteredProjs);
        if (filteredProjs.length > 0 && !quickProjectId) {
          setQuickProjectId(filteredProjs[0].id);
        }

        setAllTasks(filteredTasks);
        setTasks(filteredTasks.filter((t: any) => t.status === "TODO" || t.status === "IN_PROGRESS"));
        refreshKpis(kpiRes.data, siteId);
      })
      .catch((err) => {
        console.error("Dashboard authoritative load failed:", err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const savedSite = typeof window !== "undefined" ? localStorage.getItem("buildtrack_active_site") || "" : "";
    setActiveSiteId(savedSite);
    loadDashboard(savedSite);

    const onSiteChanged = (e: any) => {
      const newSiteId = e.detail?.siteId || "";
      setActiveSiteId(newSiteId);
      loadDashboard(newSiteId);
    };

    window.addEventListener("siteChanged", onSiteChanged);
    return () => window.removeEventListener("siteChanged", onSiteChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleQuickTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim() || submittingTask) return;

    const targetProjId = quickProjectId || (projects.length > 0 ? projects[0].id : "OTHER");

    setSubmittingTask(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: targetProjId,
          title: quickTitle.trim(),
          priority: quickPriority,
          dueAt: quickDueAt ? new Date(quickDueAt).toISOString() : new Date().toISOString(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to create task on server");
        return;
      }

      setStatusMessage(`Task "${data.data.title}" confirmed and saved to database!`);
      setShowQuickTaskModal(false);
      setQuickTitle("");
      setQuickDueAt("");
      loadDashboard(activeSiteId);
    } catch (err: any) {
      setErrorMessage(`Network error: ${err.message || "Failed to create task"}`);
    } finally {
      setSubmittingTask(false);
    }
  };

  const handleQuickCompleteTask = async (taskId: string, title: string) => {
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/tasks/${taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to complete task on server");
        return;
      }

      setStatusMessage(`Task "${title}" marked completed in database!`);
      loadDashboard(activeSiteId);
    } catch (err: any) {
      setErrorMessage(`Network error: ${err.message || "Failed to complete task"}`);
    }
  };

  const currentUserSession = todaySessions.find((s) => {
    const userEmpCode = currentUser?.id ? `USR-${currentUser.id.slice(-6).toUpperCase()}` : "";
    if (userEmpCode && s.workforceMember?.employeeCode === userEmpCode) return true;
    if (currentUser?.name && s.workforceMember?.name?.trim().toLowerCase() === currentUser.name?.trim().toLowerCase()) return true;
    return false;
  });
  const isUserCheckedIn = !!currentUserSession;
  const isUserCheckedOut = !!currentUserSession?.checkOutAt;

  const getGpsCoords = async (): Promise<{ lat?: number; lng?: number; acc?: number }> => {
    if (typeof window === "undefined" || !navigator.geolocation) return {};
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 4000,
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

  const handleQuickCheckInOut = async () => {
    if (submittingCheckIn) return;
    setSubmittingCheckIn(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const gps = await getGpsCoords();
      if (!isUserCheckedIn) {
        // Perform self check-in
        const res = await fetch("/api/attendance/check-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteId: activeSiteId || (sites.length > 0 ? sites[0].id : undefined),
            workDate: new Date().toISOString().split("T")[0],
            latitude: gps.lat,
            longitude: gps.lng,
            accuracyM: gps.acc,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setErrorMessage(data.error?.message || "Failed to check in");
          return;
        }
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const gpsStr = gps.lat ? ` (GPS: ${gps.lat.toFixed(4)}, ${gps.lng?.toFixed(4)})` : "";
        setStatusMessage(`Checked in successfully at ${timeStr}${gpsStr}!`);
        loadDashboard(activeSiteId);
      } else if (!isUserCheckedOut) {
        // Perform self check-out
        const res = await fetch("/api/attendance/check-out", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: currentUserSession?.id,
            latitude: gps.lat,
            longitude: gps.lng,
            accuracyM: gps.acc,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setErrorMessage(data.error?.message || "Failed to check out");
          return;
        }
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const gpsStr = gps.lat ? ` (GPS: ${gps.lat.toFixed(4)}, ${gps.lng?.toFixed(4)})` : "";
        setStatusMessage(`Checked out successfully at ${timeStr}${gpsStr}!`);
        loadDashboard(activeSiteId);
      }
    } catch (err: any) {
      setErrorMessage(`Network error: ${err.message || "Failed to update attendance"}`);
    } finally {
      setSubmittingCheckIn(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveKpiModal(null);
      }
    };
    if (activeKpiModal) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [activeKpiModal]);

  const renderKpiModalContent = () => {
    switch (activeKpiModal) {
      case "activeProjects": {
        const list = kpi?.activeProjects || [];
        return {
          icon: <FolderKanban className="w-5 h-5 text-blue-600" />,
          title: t("kpi.activeProjects", "Active Projects"),
          badge: `${kpi?.activeProjectsCount ?? 0} Active`,
          badgeColor: "bg-blue-100 text-blue-800",
          subtitle: "Projects currently active or in planning across your sites",
          actionUrl: "/projects",
          actionLabel: "View All Projects",
          emptyTitle: "No active projects",
          emptyDesc: "There are currently no active or planning projects recorded in the system.",
          content: list.length > 0 ? (
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {list.map((p: any) => (
                <div
                  key={p.id}
                  className="p-3.5 bg-slate-50 hover:bg-blue-50/40 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{p.name}</span>
                      {p.code && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-mono font-medium">
                          {p.code}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          p.status === "ACTIVE" || p.status === "IN_PROGRESS"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-3">
                      {p.siteName && (
                        <span>
                          Site: <strong className="text-slate-700">{p.siteName}</strong>
                        </span>
                      )}
                      {p.managerName && (
                        <span>
                          Manager: <strong className="text-slate-700">{p.managerName}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <div className="text-[11px] text-slate-500 font-medium">Budget</div>
                    <div className="text-sm font-black text-slate-900 tabular-nums">
                      {formatCurrency(p.budgetAmount || 0)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null,
        };
      }
      case "workersPresentToday": {
        const list = kpi?.workersPresentToday || [];
        const headcount = kpi?.workforceHeadcount;
        const headcountRecords = headcount?.records || [];
        const totalHeadcount = headcount?.grandTotal || 0;
        const totalStaff = kpi?.staffAttendanceCount ?? list.length;
        const displayTotal = totalHeadcount > 0 ? totalHeadcount : totalStaff;

        const hasAnyData = totalHeadcount > 0 || list.length > 0;

        return {
          icon: <HardHat className="w-5 h-5 text-emerald-600" />,
          title: "Workforce & Workers on Site",
          badge: `${displayTotal} on Site Today`,
          badgeColor: "bg-emerald-100 text-emerald-800",
          subtitle: "Daily site workforce headcount (Artisans, Craftsmen, Laborers) and checked-in personnel",
          actionUrl: "/workforce",
          actionLabel: "Go to Workforce",
          emptyTitle: "No workforce or crew logged today",
          emptyDesc: "No site workforce headcount or attendance sessions logged for today yet. Use the Workforce page to upload site counts.",
          content: hasAnyData ? (
            <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
              {/* Top Trade Headcount Summary */}
              {totalHeadcount > 0 && (
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-emerald-600" />
                      <span>Today&apos;s Total Workforce Headcount</span>
                    </span>
                    <span className="text-xs font-mono font-black text-emerald-900 bg-emerald-200/80 px-2.5 py-0.5 rounded-full">
                      {totalHeadcount} Workers
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-2xs">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Artisans</div>
                      <div className="text-base font-black text-slate-900 mt-0.5">
                        {headcount?.totalArtisan || 0}
                      </div>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-2xs">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Craftsmen</div>
                      <div className="text-base font-black text-slate-900 mt-0.5">
                        {headcount?.totalCraftsman || 0}
                      </div>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-2xs">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Laborers</div>
                      <div className="text-base font-black text-slate-900 mt-0.5">
                        {headcount?.totalLaborer || 0}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        ({headcount?.totalLaborerMale || 0}M / {headcount?.totalLaborerFemale || 0}F)
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Site-by-Site Headcount Records */}
              {headcountRecords.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Site Workforce Headcount Records ({headcountRecords.length})</span>
                  </div>
                  {headcountRecords.map((r: any) => (
                    <div
                      key={r.id}
                      className="p-3.5 bg-white hover:bg-slate-50/80 rounded-xl border border-slate-200 transition-colors shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{r.siteName}</span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold uppercase">
                              {r.shift} Shift
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span>
                              Supervisor: <strong className="text-slate-700">{r.supervisorName}</strong>
                            </span>
                            {r.contractorName && (
                              <span>
                                Contractor: <strong className="text-slate-700">{r.contractorName}</strong>
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg tabular-nums">
                            {r.grandTotal} Workers
                          </span>
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-100 grid grid-cols-3 gap-2 text-[11px] text-slate-600">
                        <div>
                          Artisans: <strong className="text-slate-900">{r.artisanCount}</strong>
                        </div>
                        <div>
                          Craftsmen: <strong className="text-slate-900">{r.craftsmanCount}</strong>
                        </div>
                        <div>
                          Laborers: <strong className="text-slate-900">{r.laborerTotal}</strong>
                          <span className="text-[10px] text-slate-400 ml-1">
                            ({r.laborerMale}M / {r.laborerFemale}F)
                          </span>
                        </div>
                      </div>

                      {r.notes && (
                        <div className="mt-2 text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                          Note: {r.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Checked-In Staff & Supervisors */}
              {list.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Checked-In Staff &amp; Supervisors ({list.length})</span>
                    </span>
                    <Link
                      href="/attendance"
                      className="text-[11px] font-semibold text-blue-600 hover:underline"
                    >
                      Attendance Page &rarr;
                    </Link>
                  </div>
                  <div className="space-y-2">
                    {list.map((w: any) => (
                      <div
                        key={w.id}
                        className="p-3 bg-slate-50 hover:bg-slate-100/60 rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-900">{w.workerName}</span>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {w.trade} &bull; {w.siteName || "Main Site"}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase">
                            {w.status}
                          </span>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {w.checkInAt
                              ? new Date(w.checkInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                              : "Today"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null,
        };
      }
      case "lowStockItems": {
        const list = kpi?.lowStockItems || [];
        return {
          icon: <Boxes className="w-5 h-5 text-amber-600" />,
          title: t("kpi.criticalMaterials", "Low Stock Items"),
          badge: `${kpi?.lowStockItemsCount ?? 0} Alerts`,
          badgeColor: "bg-amber-100 text-amber-800",
          subtitle: "Materials currently at or below safety reorder thresholds",
          actionUrl: "/materials",
          actionLabel: "View Materials & Reorder",
          emptyTitle: "All stocks healthy",
          emptyDesc: "Every active material is currently stocked above its defined minimum reorder threshold.",
          content: list.length > 0 ? (
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {list.map((m: any) => (
                <div
                  key={m.id}
                  className="p-3.5 bg-slate-50 hover:bg-amber-50/40 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{m.name}</span>
                      {m.code && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-mono font-medium">
                          {m.code}
                        </span>
                      )}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 uppercase tracking-wider">
                        Reorder Needed
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5">
                      Category: <strong className="text-slate-700">{m.category}</strong>
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <div className="text-[11px] text-slate-500 font-medium">Stock / Min Threshold</div>
                    <div className="text-sm font-black text-rose-600 tabular-nums">
                      {m.quantityOnHand}{" "}
                      <span className="text-xs text-slate-500 font-normal">
                        / {m.minStockQty} {m.unitCode}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null,
        };
      }
      case "tasksOverdue": {
        const list = kpi?.tasksOverdue || [];
        return {
          icon: <AlertTriangle className="w-5 h-5 text-rose-600" />,
          title: "Overdue Tasks",
          badge: `${kpi?.tasksOverdueCount ?? 0} Overdue`,
          badgeColor: "bg-rose-100 text-rose-800",
          subtitle: "Uncompleted work items that have exceeded their target deadline",
          actionUrl: "/tasks",
          actionLabel: "Resolve Overdue Tasks",
          emptyTitle: "No overdue tasks",
          emptyDesc: "Outstanding tasks are proceeding on schedule with zero overdue items.",
          content: list.length > 0 ? (
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {list.map((t: any) => (
                <div
                  key={t.id}
                  className="p-3.5 bg-slate-50 hover:bg-rose-50/40 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{t.title}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          t.priority === "CRITICAL"
                            ? "bg-rose-100 text-rose-800"
                            : t.priority === "HIGH"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {t.priority}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-3">
                      {t.projectName && (
                        <span>
                          Project: <strong className="text-slate-700">{t.projectName}</strong>
                        </span>
                      )}
                      {t.assigneeName && (
                        <span>
                          Assignee: <strong className="text-slate-700">{t.assigneeName}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <div className="text-[11px] text-slate-500 font-medium">Target Due Date</div>
                    <div className="text-sm font-bold text-rose-600">
                      {t.dueAt ? formatDate(t.dueAt) : "Overdue"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null,
        };
      }
      case "tasksDueToday": {
        const list = kpi?.tasksDueToday || [];
        return {
          icon: <CheckSquare className="w-5 h-5 text-indigo-600" />,
          title: "Tasks Due Today",
          badge: `${kpi?.tasksDueTodayCount ?? 0} Due Today`,
          badgeColor: "bg-indigo-100 text-indigo-800",
          subtitle: "Deliverables and milestones scheduled for completion today",
          actionUrl: "/tasks",
          actionLabel: "Manage Today's Tasks",
          emptyTitle: "No tasks due today",
          emptyDesc: "There are no tasks specifically scheduled to be completed by today.",
          content: list.length > 0 ? (
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {list.map((t: any) => (
                <div
                  key={t.id}
                  className="p-3.5 bg-slate-50 hover:bg-indigo-50/40 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{t.title}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          t.priority === "CRITICAL"
                            ? "bg-rose-100 text-rose-800"
                            : t.priority === "HIGH"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-indigo-100 text-indigo-800"
                        }`}
                      >
                        {t.priority}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-3">
                      {t.projectName && (
                        <span>
                          Project: <strong className="text-slate-700">{t.projectName}</strong>
                        </span>
                      )}
                      {t.assigneeName && (
                        <span>
                          Assignee: <strong className="text-slate-700">{t.assigneeName}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <div className="text-[11px] text-slate-500 font-medium">Due Schedule</div>
                    <div className="text-sm font-bold text-indigo-700">
                      {t.dueAt
                        ? new Date(t.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "Today"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null,
        };
      }
      case "paymentsMadeToday": {
        const list = kpi?.paymentsMadeToday || [];
        return {
          icon: <DollarSign className="w-5 h-5 text-emerald-600" />,
          title: "Paid Today",
          badge: `${formatCurrency(kpi?.paymentsMadeTodayAmount ?? 0)} Paid`,
          badgeColor: "bg-emerald-100 text-emerald-800",
          subtitle: "Banking, cash, and online disbursements settled today",
          actionUrl: "/finance",
          actionLabel: "Go to Finance & Payments",
          emptyTitle: "No payments recorded today",
          emptyDesc: "No banking disbursements or payouts have been logged for today yet.",
          content: list.length > 0 ? (
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {list.map((p: any) => (
                <div
                  key={p.id}
                  className="p-3.5 bg-slate-50 hover:bg-emerald-50/40 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{p.recipientName}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                        {p.method}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-3">
                      {p.referenceNumber && (
                        <span>
                          Ref: <strong className="text-slate-700">{p.referenceNumber}</strong>
                        </span>
                      )}
                      {p.payingAccount && (
                        <span>
                          Account: <strong className="text-slate-700">{p.payingAccount}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <div className="text-[11px] text-slate-500 font-medium">Disbursed</div>
                    <div className="text-sm font-black text-emerald-700 tabular-nums">
                      {formatCurrency(p.amount || 0)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null,
        };
      }
      case "outstandingPayables": {
        const list = kpi?.outstandingPayables || [];
        return {
          icon: <TrendingDown className="w-5 h-5 text-amber-700" />,
          title: "Total Outstanding Payables",
          badge: `${formatCurrency(kpi?.totalOutstandingPayablesAmount ?? 0)} Outstanding`,
          badgeColor: "bg-amber-100 text-amber-800",
          subtitle: "Unpaid vendor & contractor invoices and verified bills",
          actionUrl: "/parties",
          actionLabel: "View Vendor & Contractor Bills",
          emptyTitle: "Zero outstanding payables",
          emptyDesc: "All verified vendor and contractor invoices are completely settled.",
          content: list.length > 0 ? (
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {list.map((b: any) => (
                <div
                  key={b.id}
                  className="p-3.5 bg-slate-50 hover:bg-amber-50/40 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{b.billNumber}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-medium">
                        {b.partyName}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-3">
                      <span>
                        Total Bill: <strong className="text-slate-700">{formatCurrency(b.totalAmount || 0)}</strong>
                      </span>
                      {b.dueDate && (
                        <span>
                          Due: <strong className="text-slate-700">{formatDate(b.dueDate)}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <div className="text-[11px] text-slate-500 font-medium">Remaining Balance</div>
                    <div className="text-sm font-black text-amber-600 tabular-nums">
                      {formatCurrency(b.remainingAmount || 0)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null,
        };
      }
      default:
        return null;
    }
  };

  return (
    <Shell>
      <div className="space-y-6">
        {/* Welcome & Site Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Site Operations Dashboard
              </h1>
              {!activeSiteId ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-2xs">
                  <span>🌐 All Active Sites Overview</span>
                  {sites.length > 0 && <span className="opacity-75 font-mono">({sites.length})</span>}
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1 shadow-2xs">
                  <span>📍 {sites.find((s) => s.id === activeSiteId)?.name || "Selected Site"}</span>
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {!activeSiteId
                ? `Showing real-time operations, inventory, and finances across all ${sites.length} active construction sites`
                : `Showing site operations for ${sites.find((s) => s.id === activeSiteId)?.name || "selected location"}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQuickTaskModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{t("kpi.quickTask", "+ Quick Task")}</span>
            </button>
            <Link
              href="/materials"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-sm transition-all"
            >
              <PackagePlus className="w-4 h-4 text-amber-400" />
              <span>{t("kpi.quickMaterialIn", "Receive Stock")}</span>
            </Link>
          </div>
        </div>

        {/* Dashboard Mode Selector: Executive / Owner vs Personalized Employee Workspace */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setDashboardMode("EXECUTIVE")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                dashboardMode === "EXECUTIVE"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Owner & Executive Overview</span>
            </button>
            <button
              type="button"
              onClick={() => setDashboardMode("EMPLOYEE")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                dashboardMode === "EMPLOYEE"
                  ? "bg-amber-500 text-slate-950 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Personalized Employee Workspace</span>
            </button>
          </div>

          <div className="text-xs text-slate-500 px-2 flex items-center gap-2">
            {currentUser && (
              <span>
                Logged in as <strong className="text-slate-800">{currentUser.name}</strong> ({currentUser.role})
              </span>
            )}
          </div>
        </div>

        {/* Quick Site Switcher Bar */}
        {sites.length > 0 && (
          <div className="flex items-center gap-1.5 bg-slate-100/90 p-1.5 rounded-xl overflow-x-auto max-w-full border border-slate-200/80">
            <button
              type="button"
              onClick={() => {
                setActiveSiteId("");
                if (typeof window !== "undefined") {
                  localStorage.setItem("buildtrack_active_site", "");
                  document.cookie = "buildtrack_active_site=; path=/; max-age=31536000; SameSite=Lax";
                  window.dispatchEvent(new CustomEvent("siteChanged", { detail: { siteId: "" } }));
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                !activeSiteId
                  ? "bg-amber-500 text-slate-950 shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
              }`}
            >
              <span>🌐 All Active Sites</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  !activeSiteId ? "bg-slate-950 text-amber-400" : "bg-slate-200 text-slate-700"
                }`}
              >
                {sites.length}
              </span>
            </button>
            {sites.map((s) => {
              const isSelected = activeSiteId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setActiveSiteId(s.id);
                    if (typeof window !== "undefined") {
                      localStorage.setItem("buildtrack_active_site", s.id);
                      document.cookie = `buildtrack_active_site=${s.id}; path=/; max-age=31536000; SameSite=Lax`;
                      window.dispatchEvent(new CustomEvent("siteChanged", { detail: { siteId: s.id } }));
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  }`}
                >
                  <span>{s.name}</span>
                  {s.code && <span className="text-[10px] opacity-75 font-mono">({s.code})</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Status notification banner */}
        {statusMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center justify-between gap-2 shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusMessage}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-emerald-700 hover:text-emerald-900 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Error notification banner */}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center justify-between gap-2 shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-700 hover:text-rose-900 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Personalized Employee Workspace */}
        {dashboardMode === "EMPLOYEE" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <Link
                href="/tasks?filter=my_tasks"
                className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group select-none block"
              >
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">My Open Tasks</span>
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-600 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                    <CheckSquare className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900">
                  {allTasks.filter((t: any) => (t.assigneeUserId === currentUser?.id || t.assignee?.id === currentUser?.id) && t.status !== "COMPLETED" && t.status !== "VERIFIED").length}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                  <span>Assigned to you</span>
                  <span className="text-amber-600 font-medium group-hover:underline">Open List →</span>
                </div>
              </Link>

              <Link
                href="/tasks?filter=overdue"
                className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-rose-400 hover:shadow-md transition-all cursor-pointer group select-none block"
              >
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">My Overdue Tasks</span>
                  <div className="p-2 rounded-lg bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-rose-600">
                  {allTasks.filter((t: any) => (t.assigneeUserId === currentUser?.id || t.assignee?.id === currentUser?.id) && t.dueAt && new Date(t.dueAt).getTime() < Date.now() && t.status !== "COMPLETED" && t.status !== "VERIFIED").length}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                  <span>Needs urgent action</span>
                  <span className="text-rose-600 font-medium group-hover:underline">View →</span>
                </div>
              </Link>

              <Link
                href="/tasks?filter=completed"
                className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group select-none block"
              >
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Completed By Me</span>
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-emerald-600">
                  {allTasks.filter((t: any) => (t.assigneeUserId === currentUser?.id || t.completedById === currentUser?.id) && (t.status === "COMPLETED" || t.status === "VERIFIED")).length}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                  <span>Delivered work</span>
                  <span className="text-emerald-700 font-medium group-hover:underline">View →</span>
                </div>
              </Link>

              <Link
                href="/tasks?filter=requests"
                className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group select-none block"
              >
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">My Role Requests</span>
                  <div className="p-2 rounded-lg bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-black text-purple-600">
                  {allTasks.filter((t: any) => t.createdBy === currentUser?.id && t.taskType && t.taskType !== "STANDARD").length}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                  <span>Requests for Owner/Arch</span>
                  <span className="text-purple-600 font-medium group-hover:underline">Track →</span>
                </div>
              </Link>
            </div>

            {/* Employee Active Tasks Work Queue */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-amber-500" />
                    <span>My Active Task Work Queue</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">Tasks currently assigned to your account requiring execution</p>
                </div>
                <Link href="/tasks" className="text-xs font-bold text-amber-600 hover:underline">
                  Go to All Site Tasks →
                </Link>
              </div>

              {allTasks.filter((t: any) => (t.assigneeUserId === currentUser?.id || t.assignee?.id === currentUser?.id) && t.status !== "COMPLETED" && t.status !== "VERIFIED").length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <div className="font-bold text-slate-700 text-sm">All caught up!</div>
                  <p className="mt-0.5">No open tasks currently assigned to you. Create a personal task or request from the tasks page.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {allTasks
                    .filter((t: any) => (t.assigneeUserId === currentUser?.id || t.assignee?.id === currentUser?.id) && t.status !== "COMPLETED" && t.status !== "VERIFIED")
                    .slice(0, 6)
                    .map((t: any) => {
                      const isOverdue = t.dueAt && new Date(t.dueAt).getTime() < Date.now();
                      return (
                        <div
                          key={t.id}
                          className="p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm">{t.title}</span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                  t.priority === "CRITICAL"
                                    ? "bg-rose-100 text-rose-800"
                                    : t.priority === "HIGH"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-slate-200 text-slate-700"
                                }`}
                              >
                                {t.priority}
                              </span>
                              {isOverdue && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-600 text-white uppercase">
                                  Overdue
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                              <span>Project: <strong className="text-slate-700">{t.project?.name || "General"}</strong></span>
                              {t.dueAt && <span>Due: <strong>{formatDate(t.dueAt)}</strong></span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleQuickCompleteTask(t.id, t.title)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-2xs transition flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Mark Done</span>
                            </button>
                            <Link
                              href="/tasks"
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition"
                            >
                              Details
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Real KPI Cards Grid (Executive Mode) */}
        {dashboardMode === "EXECUTIVE" && (loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-slate-200/60 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Active Projects */}
            <div
              onClick={() => setActiveKpiModal("activeProjects")}
              className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group select-none active:scale-[0.99]"
              title="Click to view Active Projects details"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">{t("kpi.activeProjects", "Active Projects")}</span>
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <FolderKanban className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900">
                {kpi?.activeProjectsCount ?? 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>
                  {!activeSiteId
                    ? `Across all ${sites.length} Active Sites`
                    : (sites.find((s) => s.id === activeSiteId)?.name || projects[0]?.name || "Active Site")}
                </span>
                <span className="text-blue-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                  Details <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </div>

            {/* Workforce on Site Today */}
            <div
              onClick={() => setActiveKpiModal("workersPresentToday")}
              className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group select-none active:scale-[0.99]"
              title="Click to view full Workforce & Crew details"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">{t("kpi.workersOnSite", "Workforce on Site")}</span>
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <HardHat className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 flex items-baseline gap-2">
                <span>
                  {(kpi?.workforceHeadcount?.grandTotal || 0) > 0
                    ? kpi.workforceHeadcount.grandTotal
                    : kpi?.workersPresentTodayCount ?? 0}
                </span>
                {(kpi?.workforceHeadcount?.grandTotal || 0) > 0 && (kpi?.staffAttendanceCount || 0) > 0 && (
                  <span className="text-xs font-bold text-slate-400">
                    (+{kpi.staffAttendanceCount} staff)
                  </span>
                )}
              </div>
              <div className="text-[11px] text-emerald-600 font-medium mt-1 flex items-center justify-between">
                <span className="truncate max-w-[190px]">
                  {(kpi?.workforceHeadcount?.grandTotal || 0) > 0
                    ? `${kpi.workforceHeadcount.grandTotal} on site (${kpi.workforceHeadcount.totalArtisan || 0} Art, ${kpi.workforceHeadcount.totalLaborer || 0} Lab)`
                    : `${kpi?.workersPresentTodayCount ?? 0} checked in today`}
                </span>
                <span className="text-emerald-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0">
                  Details <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </div>

            {/* Low Stock Alerts */}
            <div
              onClick={() => setActiveKpiModal("lowStockItems")}
              className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group select-none active:scale-[0.99]"
              title="Click to view Low Stock Inventory details"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">{t("kpi.criticalMaterials", "Low Stock Items")}</span>
                <div
                  className={`p-2 rounded-lg transition-colors ${
                    (kpi?.lowStockItemsCount || 0) > 0
                      ? "bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white"
                      : "bg-slate-50 text-slate-500 group-hover:bg-slate-200"
                  }`}
                >
                  <Boxes className="w-4 h-4" />
                </div>
              </div>
              <div
                className={`text-2xl font-black ${
                  (kpi?.lowStockItemsCount || 0) > 0 ? "text-amber-600" : "text-slate-900"
                }`}
              >
                {kpi?.lowStockItemsCount ?? 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>Items below reorder limit</span>
                <span className="text-amber-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                  Details <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </div>

            {/* Overdue Tasks */}
            <div
              onClick={() => setActiveKpiModal("tasksOverdue")}
              className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-rose-400 hover:shadow-md transition-all cursor-pointer group select-none active:scale-[0.99]"
              title="Click to view Overdue Tasks details"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Overdue Tasks</span>
                <div
                  className={`p-2 rounded-lg transition-colors ${
                    (kpi?.tasksOverdueCount || 0) > 0
                      ? "bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white"
                      : "bg-slate-50 text-slate-500 group-hover:bg-slate-200"
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div
                className={`text-2xl font-black ${
                  (kpi?.tasksOverdueCount || 0) > 0 ? "text-rose-600" : "text-slate-900"
                }`}
              >
                {kpi?.tasksOverdueCount ?? 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>Needs supervisor action</span>
                <span className="text-rose-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                  Details <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </div>

            {/* Tasks Due Today */}
            <div
              onClick={() => setActiveKpiModal("tasksDueToday")}
              className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group select-none active:scale-[0.99]"
              title="Click to view Tasks Due Today details"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Tasks Due Today</span>
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <CheckSquare className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900">
                {kpi?.tasksDueTodayCount ?? 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>Scheduled completion today</span>
                <span className="text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                  Details <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </div>

            {/* Payments Today */}
            <div
              onClick={() => setActiveKpiModal("paymentsMadeToday")}
              className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group select-none active:scale-[0.99]"
              title="Click to view Payments Made Today details"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Paid Today</span>
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl font-black text-slate-900 tabular-nums">
                {formatCurrency(kpi?.paymentsMadeTodayAmount ?? 0)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>Posted banking disbursements</span>
                <span className="text-emerald-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                  Details <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </div>

            {/* Total Outstanding Payables */}
            <div
              onClick={() => setActiveKpiModal("outstandingPayables")}
              className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-amber-400 hover:shadow-md transition-all col-span-2 cursor-pointer group select-none active:scale-[0.99]"
              title="Click to view Outstanding Payables breakdown"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Outstanding Payables</span>
                <div className="p-2 rounded-lg bg-amber-50 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <TrendingDown className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-amber-600 tabular-nums">
                {formatCurrency(kpi?.totalOutstandingPayablesAmount ?? 0)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>Verified across vendor & contractor bills</span>
                <span className="text-amber-600 font-semibold group-hover:underline flex items-center gap-0.5">
                  View Breakdown →
                </span>
              </div>
            </div>
          </div>
        ))}

        {/* Supervisor Mobile Quick Actions Dock */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs uppercase tracking-wider font-bold text-amber-400">
              Site Supervisor Quick Entry Dock
            </span>
            <span className="text-[11px] text-slate-400">Live field actions</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Link
              href="/materials"
              className="p-3 bg-slate-800/80 hover:bg-slate-800 rounded-xl border border-slate-700 flex items-center gap-2.5 transition-all"
            >
              <PackagePlus className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-left">
                <div className="text-xs font-bold text-white">Receive Goods</div>
                <div className="text-[10px] text-slate-400">Log vendor delivery</div>
              </div>
            </Link>

            <Link
              href="/materials"
              className="p-3 bg-slate-800/80 hover:bg-slate-800 rounded-xl border border-slate-700 flex items-center gap-2.5 transition-all"
            >
              <PackageMinus className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="text-left">
                <div className="text-xs font-bold text-white">Issue Material</div>
                <div className="text-[10px] text-slate-400">Consume to task</div>
              </div>
            </Link>

            {!isUserCheckedIn ? (
              <button
                onClick={handleQuickCheckInOut}
                disabled={submittingCheckIn}
                className="p-3 bg-emerald-950/40 hover:bg-emerald-900/60 rounded-xl border border-emerald-600/50 flex items-center gap-2.5 transition-all text-left disabled:opacity-50"
              >
                <UserCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-white">
                    {submittingCheckIn ? "Checking In..." : "Check In"}
                  </div>
                  <div className="text-[10px] text-emerald-300">Tap to record attendance</div>
                </div>
              </button>
            ) : !isUserCheckedOut ? (
              <button
                onClick={handleQuickCheckInOut}
                disabled={submittingCheckIn}
                className="p-3 bg-rose-950/40 hover:bg-rose-900/60 rounded-xl border border-rose-600/50 flex items-center gap-2.5 transition-all text-left disabled:opacity-50"
              >
                <Clock className="w-5 h-5 text-rose-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-white">
                    {submittingCheckIn ? "Checking Out..." : "Check Out"}
                  </div>
                  <div className="text-[10px] text-rose-300">Tap to end shift</div>
                </div>
              </button>
            ) : (
              <Link
                href="/attendance"
                className="p-3 bg-slate-800/80 hover:bg-slate-800 rounded-xl border border-slate-700 flex items-center gap-2.5 transition-all text-left"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-white">Shift Done</div>
                  <div className="text-[10px] text-slate-400">View attendance log</div>
                </div>
              </Link>
            )}

            <button
              onClick={() => setShowQuickTaskModal(true)}
              className="p-3 bg-slate-800/80 hover:bg-slate-800 rounded-xl border border-slate-700 flex items-center gap-2.5 transition-all text-left"
            >
              <CheckSquare className="w-5 h-5 text-purple-400 shrink-0" />
              <div>
                <div className="text-xs font-bold text-white">Quick Task</div>
                <div className="text-[10px] text-slate-400">Create new site task</div>
              </div>
            </button>
          </div>
        </div>

        {/* Every Active Site Dashboard Details */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>Every Active Site Dashboard Details</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                    {sites.length} Active {sites.length === 1 ? "Location" : "Locations"}
                  </span>
                </h2>
                <p className="text-xs text-slate-500">
                  Live operational breakdown and project status across every construction site
                </p>
              </div>
            </div>
            {!activeSiteId ? (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 w-max flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>All Sites Unified</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setActiveSiteId("");
                  if (typeof window !== "undefined") {
                    localStorage.setItem("buildtrack_active_site", "");
                    document.cookie = "buildtrack_active_site=; path=/; max-age=31536000; SameSite=Lax";
                    window.dispatchEvent(new CustomEvent("siteChanged", { detail: { siteId: "" } }));
                  }
                }}
                className="text-amber-600 hover:text-amber-700 font-bold text-xs hover:underline flex items-center gap-1"
              >
                <span>← Show All Sites Overview</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sites.map((site) => {
              const siteProjs = projects.filter((p) => p.siteId === site.id);
              const isSelected = activeSiteId === site.id;
              const totalSiteBudget = siteProjs.reduce((sum, p) => sum + (p.budgetAmount || 0), 0);
              const siteWorkers = workers.filter((w) => w.defaultSiteId === site.id);
              const siteHeadcount = (kpi?.workforceHeadcount?.records || []).find(
                (r: any) => r.siteId === site.id || r.siteName?.toLowerCase() === site.name?.toLowerCase()
              );
              const siteWorkersPresent = (kpi?.workersPresentToday || []).filter((w: any) => w.siteName === site.name);
              const siteOnSiteCount = siteHeadcount ? siteHeadcount.grandTotal : siteWorkersPresent.length;

              return (
                <div
                  key={site.id}
                  className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                    isSelected
                      ? "bg-amber-50/50 border-amber-400 ring-2 ring-amber-300/70 shadow-sm"
                      : "bg-slate-50/60 hover:bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{site.name}</span>
                          {site.code && (
                            <span className="text-[10px] font-mono font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                              {site.code}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 line-clamp-1">
                          <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                          <span>{site.address || "Active Site"}</span>
                        </p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase tracking-wider shrink-0">
                        {site.status}
                      </span>
                    </div>

                    {/* Site Statistics Bar */}
                    <div className="grid grid-cols-3 gap-2 py-2.5 my-2 border-y border-slate-200/60 text-center bg-white/70 rounded-lg">
                      <div>
                        <div className="text-[10px] text-slate-500 font-medium">Projects</div>
                        <div className="text-sm font-black text-slate-900">
                          {siteProjs.length || site._count?.projects || 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-medium">On-Site Today</div>
                        <div className="text-sm font-black text-emerald-600">
                          {siteOnSiteCount}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-medium">Crew Total</div>
                        <div className="text-sm font-black text-slate-700">
                          {siteWorkers.length || site._count?.workforceMembers || 0}
                        </div>
                      </div>
                    </div>

                    {/* Site Projects List */}
                    <div className="space-y-1.5 my-2">
                      <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                        <span>Active Projects:</span>
                        {totalSiteBudget > 0 && (
                          <span className="text-slate-500 font-mono text-[10px] font-semibold">
                            Budget: {formatCurrency(totalSiteBudget)}
                          </span>
                        )}
                      </div>
                      {siteProjs.length === 0 ? (
                        <div className="text-[11px] text-slate-400 italic p-2 bg-white/60 rounded border border-slate-100">
                          No active projects logged for this site.
                        </div>
                      ) : (
                        siteProjs.map((p) => (
                          <Link
                            key={p.id}
                            href={`/projects/${p.id}`}
                            className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-slate-200/80 hover:border-amber-400 transition-colors block"
                          >
                            <span className="font-semibold text-slate-800 truncate max-w-[170px]">{p.name}</span>
                            <span className="font-black text-slate-900 tabular-nums text-[11px]">
                              {formatCurrency(p.budgetAmount || 0)}
                            </span>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Filter action button */}
                  <div className="pt-3 border-t border-slate-200/60 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const nextId = isSelected ? "" : site.id;
                        setActiveSiteId(nextId);
                        if (typeof window !== "undefined") {
                          localStorage.setItem("buildtrack_active_site", nextId);
                          document.cookie = `buildtrack_active_site=${nextId}; path=/; max-age=31536000; SameSite=Lax`;
                          window.dispatchEvent(new CustomEvent("siteChanged", { detail: { siteId: nextId } }));
                        }
                      }}
                      className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                        isSelected
                          ? "bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-2xs"
                          : "bg-slate-900 text-white hover:bg-slate-800 shadow-2xs"
                      }`}
                    >
                      <span>{isSelected ? "✓ Filtering Active" : "Filter Dashboard to this Site →"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Projects and Tasks Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active Projects List */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-amber-500" />
                <span>
                  {!activeSiteId
                    ? "All Active Sites & Projects"
                    : `Active Projects (${sites.find((s) => s.id === activeSiteId)?.name || "Selected Site"})`}
                </span>
              </h2>
              <Link href="/projects" className="text-xs font-semibold text-amber-600 hover:underline">
                View All
              </Link>
            </div>

            {projects.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                No active projects found.
              </div>
            ) : (
              <div className="space-y-3">
                {projects.slice(0, 4).map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="p-3.5 rounded-lg border border-slate-100 hover:border-slate-300 hover:shadow-xs bg-slate-50/50 flex flex-col gap-2 transition block"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-900 text-sm">{p.name}</div>
                      <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                        {p.code}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 flex items-center justify-between">
                      <span>Site: {p.site?.name || "Main Site"}</span>
                      <span className="font-semibold text-slate-700 tabular-nums">
                        Budget: {formatCurrency(p.budgetAmount)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                      <span>Tasks: {p._count?.tasks ?? 0}</span>
                      <span>Daily Reports: {p._count?.dailyReports ?? 0}</span>
                      <span className="ml-auto font-medium text-emerald-600">
                        ● {p.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Pending Tasks Quick List */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-blue-500" />
                <span>
                  {!activeSiteId
                    ? "Pending Tasks Across All Sites"
                    : `Pending Tasks (${sites.find((s) => s.id === activeSiteId)?.name || "Selected Site"})`}
                </span>
              </h2>
              <Link href="/tasks" className="text-xs font-semibold text-amber-600 hover:underline">
                Open Kanban
              </Link>
            </div>

            {tasks.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                No pending tasks found. All caught up!
              </div>
            ) : (
              <div className="space-y-2.5">
                {tasks.slice(0, 5).map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-lg border border-slate-100 hover:border-slate-200 bg-slate-50/50 flex items-center justify-between gap-3"
                  >
                    <div className="truncate flex-1">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {t.title}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                        <span>{t.project?.name || "General"}</span>
                        {t.dueAt && <span>• Due: {formatDate(t.dueAt)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleQuickCompleteTask(t.id, t.title)}
                        title="Mark Completed"
                        className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-[11px] rounded-md transition flex items-center gap-1 shadow-2xs"
                      >
                        <span>✓ Done</span>
                      </button>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          t.priority === "CRITICAL"
                            ? "bg-rose-100 text-rose-700"
                            : t.priority === "HIGH"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {t.priority}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Site Photographs & Quality Inspection Gallery */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Recent Site Photographs & Quality Inspections</h2>
                <p className="text-xs text-slate-500">Live field images, delivery challans, and progress updates from site teams</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {recentPhotos.length > 0 && (
                <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                  {recentPhotos.length} Photos
                </span>
              )}
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg cursor-pointer transition shadow-xs">
                <Upload className="w-3.5 h-3.5 text-amber-400" />
                <span>{uploadingPhoto ? "Uploading..." : "+ Upload Photo"}</span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleDashboardPhotoUpload}
                  disabled={uploadingPhoto}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {photoMsg && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{photoMsg}</span>
              </div>
              <button onClick={() => setPhotoMsg(null)} className="text-emerald-600 hover:text-emerald-800 p-0.5">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {recentPhotos.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <Camera className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <div className="font-bold text-slate-700">No site photographs uploaded yet</div>
              <p className="mt-0.5 mb-3">Supervisors and engineers can capture photos during task execution and material inwards.</p>
              <label className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg cursor-pointer transition shadow-xs">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload First Site Photo</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleDashboardPhotoUpload}
                  disabled={uploadingPhoto}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {recentPhotos.map((photo: any) => (
                <div
                  key={photo.id}
                  className="group relative aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-200 shadow-xs hover:border-amber-400 transition"
                >
                  <img
                    src={photo.url}
                    alt={photo.fileName}
                    onClick={() => setLightboxPhoto(photo)}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300 cursor-pointer"
                  />

                  {/* Card Action Controls: Replace and Delete */}
                  <div className="absolute top-2 right-2 flex items-center gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-xs p-1 rounded-lg">
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 text-slate-300 hover:text-amber-400 cursor-pointer transition"
                      title="Replace / Re-upload this photo"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => handleDashboardPhotoReplace(photo.id, e)}
                        disabled={uploadingPhoto}
                        className="hidden"
                      />
                    </label>
                    <button
                      onClick={(e) => handleDashboardPhotoDelete(photo.id, photo.fileName, e)}
                      className="p-1 text-slate-300 hover:text-rose-400 transition"
                      title="Delete photo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div
                    onClick={() => setLightboxPhoto(photo)}
                    className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent p-2.5 flex flex-col justify-end text-white cursor-pointer pointer-events-none"
                  >
                    <div className="text-[11px] font-bold truncate">{photo.fileName}</div>
                    <div className="text-[10px] text-slate-300 flex items-center justify-between mt-0.5">
                      <span>{photo.uploadedBy || "Site Team"}</span>
                      <span>{formatDate(photo.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal: Quick Task Creation */}
        {showQuickTaskModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-amber-500" />
                  <span>Create Quick Site Task</span>
                </div>
                <button
                  onClick={() => setShowQuickTaskModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleQuickTaskSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Task Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    placeholder="e.g. Slab Rebar Inspection Level 4"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Target Project *
                  </label>
                  <select
                    value={quickProjectId || (projects.length > 0 ? projects[0].id : "OTHER")}
                    onChange={(e) => setQuickProjectId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    {projects.length === 0 ? (
                      <option value="OTHER">Other / General Operations (Default Site)</option>
                    ) : (
                      <>
                        {projects.map((p) => {
                          const siteName = p.site?.name || sites.find((s) => s.id === p.siteId)?.name;
                          return (
                            <option key={p.id} value={p.id}>
                              {p.code} - {p.name} {siteName ? `[${siteName}]` : ""}
                            </option>
                          );
                        })}
                        <option value="OTHER">Other / General Operations (Not site-specific)</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Priority
                    </label>
                    <select
                      value={quickPriority}
                      onChange={(e) => setQuickPriority(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={quickDueAt}
                      onChange={(e) => setQuickDueAt(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowQuickTaskModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm"
                  >
                    Create & Assign Task
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: KPI Short Details */}
        {activeKpiModal && (() => {
          const modalData = renderKpiModalContent();
          if (!modalData) return null;
          return (
            <div
              className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
              onClick={() => setActiveKpiModal(null)}
            >
              <div
                className="bg-white rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200/60 shrink-0">
                      {modalData.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                          {modalData.title}
                        </h3>
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${modalData.badgeColor}`}>
                          {modalData.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {modalData.subtitle}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveKpiModal(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                    aria-label="Close modal"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Body / Items List */}
                <div className="p-5 flex-1 overflow-y-auto">
                  {modalData.content ? (
                    modalData.content
                  ) : (
                    <div className="py-12 px-4 text-center flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                        <CheckCircle2 className="w-6 h-6 text-slate-400" />
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{modalData.emptyTitle}</p>
                      <p className="text-xs text-slate-500 max-w-xs mt-1">{modalData.emptyDesc}</p>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveKpiModal(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/80 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                  <Link
                    href={modalData.actionUrl}
                    onClick={() => setActiveKpiModal(null)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <span>{modalData.actionLabel}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Lightbox Modal for Recent Site Photos */}
        {lightboxPhoto && (
          <div
            className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setLightboxPhoto(null)}
          >
            <div
              className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-3.5 bg-slate-950 flex items-center justify-between text-white border-b border-slate-800">
                <div>
                  <div className="font-bold text-sm">{lightboxPhoto.fileName}</div>
                  <div className="text-xs text-slate-400">
                    Uploaded by {lightboxPhoto.uploadedBy} on {formatDate(lightboxPhoto.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg cursor-pointer transition shadow-xs"
                    title="Replace with an image from your device"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Replace Photo</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => handleDashboardPhotoReplace(lightboxPhoto.id, e)}
                      disabled={uploadingPhoto}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={() => handleDashboardPhotoDelete(lightboxPhoto.id, lightboxPhoto.fileName)}
                    className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 hover:text-rose-300 transition"
                    title="Delete photo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setLightboxPhoto(null)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center p-3 bg-black/70 overflow-hidden">
                <img
                  src={lightboxPhoto.url}
                  alt={lightboxPhoto.fileName}
                  className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-lg"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
