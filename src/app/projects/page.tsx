"use client";

import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import React, { useEffect, useState, useMemo } from "react";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, ExcelColumn } from "@/components/ui/ExcelTable";
import { useActiveSite } from "@/hooks/useActiveSite";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  FolderKanban,
  Plus,
  Building2,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  ClipboardList,
  Trash2,
  Filter,
  Search,
  RotateCcw,
} from "lucide-react";
import { canUser } from "@/lib/permissions";

export default function ProjectsPage() {
  const { refreshUser } = useAppSession();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [dailyReports, setDailyReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"PROJECTS" | "SITES" | "REPORTS">("PROJECTS");

  // Role & Permission Checks
  const canManageSites = canUser(currentUser, "sites:manage");
  const canWriteProjects = canUser(currentUser, "projects:write");

  const reportColumns: ExcelColumn<any>[] = useMemo(
    () => [
      {
        key: "reportDate",
        label: "Date",
        accessor: (r) => formatDate(r.reportDate),
        type: "date",
      },
      {
        key: "project",
        label: "Project",
        accessor: (r) => `${r.project?.name || ""} (${r.project?.code || ""})`,
        type: "text",
      },
      {
        key: "site",
        label: "Site",
        accessor: (r) => r.project?.site?.name || "—",
        type: "text",
      },
      {
        key: "progress",
        label: "Progress Summary",
        accessor: (r) => r.progress || "—",
        type: "text",
      },
      {
        key: "blockers",
        label: "Blockers",
        accessor: (r) => r.blockers || "None",
        type: "text",
      },
      {
        key: "safetyNotes",
        label: "Safety Notes",
        accessor: (r) => r.safetyNotes || "None",
        type: "text",
      },
      {
        key: "author",
        label: "Supervisor",
        accessor: (r) => r.author?.name || "Site Supervisor",
        type: "text",
      },
    ],
    []
  );

  const excelReports = useExcelTable({
    data: dailyReports,
    columns: reportColumns,
  });
  // Authorized operational roles: Supervisors, Project Managers, and Org Admins (Super Admin and Finance/Accountants excluded)
  const canSubmitDailyReport = Boolean(
    currentUser &&
      ["ORG_ADMIN", "PROJECT_MANAGER", "SITE_SUPERVISOR"].includes(currentUser.role)
  );

  // Active Site Filter state synchronized with global shell
  const { activeSiteId, setActiveSiteId } = useActiveSite();
  const [activeSiteFilter, setActiveSiteFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const pStatus = (p.status || "IN_PROGRESS").toUpperCase();
      if (statusFilter !== "ALL") {
        if (statusFilter === "ACTIVE") {
          if (pStatus !== "ACTIVE" && pStatus !== "IN_PROGRESS") return false;
        } else if (pStatus !== statusFilter) {
          return false;
        }
      }
      if (activeSiteFilter && p.siteId !== activeSiteFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.name?.toLowerCase().includes(q);
        const matchCode = p.code?.toLowerCase().includes(q);
        const matchSite = p.site?.name?.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchSite) return false;
      }
      return true;
    });
  }, [projects, statusFilter, activeSiteFilter, searchQuery]);

  const totalPages = Math.ceil(filteredProjects.length / pageSize) || 1;
  const paginatedProjects = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProjects.slice(start, start + pageSize);
  }, [filteredProjects, currentPage, pageSize]);

  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("ALL");
    setActiveSiteFilter("");
    setActiveSiteId("");
    setCurrentPage(1);
    loadData("");
  };

  // Project modal & form states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  // Site modal & form states
  const [showCreateSiteModal, setShowCreateSiteModal] = useState(false);
  const [siteName, setSiteName] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [siteAddress, setSiteAddress] = useState("");

  // Site delete & transfer states
  const [showDeleteSiteModal, setShowDeleteSiteModal] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState<any | null>(null);
  const [activeProjectsForSite, setActiveProjectsForSite] = useState<any[]>([]);
  const [transferSiteId, setTransferSiteId] = useState<string>("");
  const [deletingSite, setDeletingSite] = useState(false);

  // Daily report modal & form states
  const [showDailyReportModal, setShowDailyReportModal] = useState(false);
  const [reportProjectId, setReportProjectId] = useState("");
  const [reportDate, setReportDate] = useState(new Date().toISOString().split("T")[0]);
  const [reportProgress, setReportProgress] = useState("");
  const [reportBlockers, setReportBlockers] = useState("");
  const [reportSafetyNotes, setReportSafetyNotes] = useState("");

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = (siteIdFilter?: string) => {
    setLoading(true);
    const activeSite = siteIdFilter !== undefined ? siteIdFilter : activeSiteFilter;
    const cacheBuster = `_t=${Date.now()}`;
    const projUrl = activeSite
      ? `/api/projects?siteId=${encodeURIComponent(activeSite)}&${cacheBuster}`
      : `/api/projects?${cacheBuster}`;
    const repUrl = activeSite
      ? `/api/daily-reports?siteId=${encodeURIComponent(activeSite)}&${cacheBuster}`
      : `/api/daily-reports?${cacheBuster}`;

    Promise.all([
      fetch(projUrl, { cache: "no-store", headers: { "Cache-Control": "no-cache" } }).then((r) => r.json()),
      fetch(`/api/sites?${cacheBuster}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(repUrl, { cache: "no-store", headers: { "Cache-Control": "no-cache" } }).then((r) => r.json()),
      refreshUser().then((user) => ({ success: Boolean(user), data: { user } })),
    ])
      .then(([projRes, sitesRes, repRes, authRes]) => {
        if (authRes?.success && authRes.data?.user) {
          setCurrentUser(authRes.data.user);
        }
        if (projRes.success) {
          const rawProj = projRes.data || [];
          setProjects(rawProj);
          if (rawProj.length > 0) {
            setReportProjectId((prev) => prev || rawProj[0].id);
          }
        }
        if (sitesRes.success && sitesRes.data) {
          const rawSites = sitesRes.data || [];
          setSites(rawSites);
          if (rawSites.length > 0) {
            setSelectedSiteId((prev) => prev || activeSite || rawSites[0].id);
          }
        }
        if (repRes.success) {
          const rawRep = repRes.data || [];
          setDailyReports(rawRep);
        }
      })
      .catch((err) => {
        console.error("Authoritative projects load failed:", err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setActiveSiteFilter(activeSiteId || "");
    setCurrentPage(1);
    loadData(activeSiteId || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowCreateModal(false);
        setShowCreateSiteModal(false);
        setShowDailyReportModal(false);
        setShowDeleteSiteModal(false);
      }
    };
    if (showCreateModal || showCreateSiteModal || showDailyReportModal || showDeleteSiteModal) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [showCreateModal, showCreateSiteModal, showDailyReportModal, showDeleteSiteModal]);

  const initiateDeleteSite = (site: any) => {
    setErrorMessage(null);
    setStatusMessage(null);
    setSiteToDelete(site);

    const siteProjects =
      site.projects && site.projects.length > 0
        ? site.projects
        : projects.filter((p) => p.siteId === site.id);

    const incomplete = siteProjects.filter(
      (p: any) => !["COMPLETED", "ARCHIVED"].includes(p.status)
    );
    setActiveProjectsForSite(incomplete);

    const otherSites = sites.filter((s) => s.id !== site.id);
    setTransferSiteId(otherSites.length > 0 ? otherSites[0].id : "");
    setShowDeleteSiteModal(true);
  };

  const handleConfirmDeleteSite = async () => {
    if (!siteToDelete) return;
    setDeletingSite(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const needsTransfer = activeProjectsForSite.length > 0;
    const targetId = needsTransfer ? transferSiteId : undefined;

    try {
      const res = await fetch(`/api/sites/${siteToDelete.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: targetId ? JSON.stringify({ transferToSiteId: targetId }) : undefined,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.error?.code === "PROJECTS_REQUIRE_TRANSFER" && data.error?.details?.activeProjects) {
          setActiveProjectsForSite(data.error.details.activeProjects);
          setErrorMessage(data.error.message);
          return;
        }
        setErrorMessage(data.error?.message || "Failed to delete site");
        return;
      }

      setShowDeleteSiteModal(false);
      const targetSiteName = sites.find((s) => s.id === targetId)?.name;
      setStatusMessage(
        data.data?.message ||
          (targetId
            ? `Site "${siteToDelete.name}" deleted. ${activeProjectsForSite.length} active project(s) transferred to "${targetSiteName}".`
            : `Site "${siteToDelete.name}" deleted successfully.`)
      );

      // Optimistically remove the deleted site immediately so UI updates without refreshing
      setSites((prev) => prev.filter((s) => s.id !== siteToDelete.id));

      // Re-assign or clear active filter if currently selected
      if (activeSiteId === siteToDelete.id) {
        setActiveSiteId(targetId || "");
        setActiveSiteFilter(targetId || "");
      } else if (activeSiteFilter === siteToDelete.id) {
        setActiveSiteFilter(targetId || "");
      }

      setSiteToDelete(null);
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sitesUpdated"));
      loadData(targetId || (activeSiteId === siteToDelete.id ? "" : activeSiteId));
    } catch (err: any) {
      setErrorMessage(`Network error: ${err.message || "Failed to delete site"}`);
    } finally {
      setDeletingSite(false);
    }
  };

  const handleDeleteProject = async (id: string, projectName: string) => {
    if (!confirm(`Are you sure you want to delete project "${projectName}"?`)) return;
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to delete project");
        return;
      }
      setStatusMessage(`Project "${projectName}" deleted successfully.`);
      // Optimistically remove from state immediately so UI updates without refreshing
      setProjects((prev) => prev.filter((p) => p.id !== id));
      loadData();
    } catch (err: any) {
      setErrorMessage(`Network error: ${err.message || "Failed to delete project"}`);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    const siteToUse = selectedSiteId || (sites.length > 0 ? sites[0].id : "");
    if (!siteToUse) {
      setErrorMessage("Please select a site before creating a project.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: siteToUse,
          code,
          name,
          budgetAmount: budgetAmount ? parseFloat(budgetAmount) * 100 : 0,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          notes: notes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to create project");
      } else {
        const createdProject = data.data;
        setStatusMessage(`Project "${createdProject.name}" created successfully!`);
        setShowCreateModal(false);
        setName("");
        setCode("");
        setBudgetAmount("");
        setStartDate("");
        setEndDate("");
        setNotes("");

        // Reset search, filters, and pagination so the new project is guaranteed visible
        setCurrentPage(1);
        setSearchQuery("");
        setStatusFilter("ALL");

        // Immediately prepend to state so the project appears instantly
        setProjects((prev) => [createdProject, ...prev.filter((p) => p.id !== createdProject.id)]);

        // If currently filtering by a different site, update active site to the new project's site
        if (activeSiteFilter && activeSiteFilter !== siteToUse) {
          setActiveSiteFilter(siteToUse);
          if (typeof window !== "undefined") {
            localStorage.setItem("buildtrack_active_site", siteToUse);
            window.dispatchEvent(new CustomEvent("siteChanged", { detail: { siteId: siteToUse } }));
          }
        }

        // Fresh authoritative re-sync from server
        loadData(activeSiteFilter && activeSiteFilter !== siteToUse ? siteToUse : undefined);
      }
    } catch {
      setErrorMessage("Network error during project creation");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: siteName.trim(),
          code: siteCode.trim().toUpperCase(),
          address: siteAddress.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to create site");
      } else {
        setStatusMessage(`Site "${data.data.name}" created successfully with default main store!`);
        setShowCreateSiteModal(false);
        setSiteName("");
        setSiteCode("");
        setSiteAddress("");
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sitesUpdated"));
        loadData();
      }
    } catch {
      setErrorMessage("Network error during site creation");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportProjectId) {
      setErrorMessage("Please select a target project");
      return;
    }
    if (!reportProgress.trim()) {
      setErrorMessage("Work progress summary is required");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/daily-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: reportProjectId,
          reportDate,
          progress: reportProgress.trim(),
          blockers: reportBlockers.trim() || undefined,
          safetyNotes: reportSafetyNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to submit daily report");
      } else {
        setStatusMessage(`Daily site report for ${reportDate} submitted and recorded in audit log!`);
        setShowDailyReportModal(false);
        setReportProgress("");
        setReportBlockers("");
        setReportSafetyNotes("");
        setActiveTab("REPORTS");
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sitesUpdated"));
        loadData();
      }
    } catch {
      setErrorMessage("Network error during daily report submission");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader icon={FolderKanban} title="Projects & Sites" subtitle="View project budgets, work progress, materials used, and daily reports.">

          <div className="flex flex-wrap items-center gap-2">
            {canManageSites && (
              <button
                onClick={() => setShowCreateSiteModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-300 shadow-sm transition-all"
              >
                <Building2 className="w-4 h-4 text-amber-600" />
                <span>+ Add Site</span>
              </button>
            )}
            {canSubmitDailyReport && (
              <button
                onClick={() => {
                  if (projects.length > 0) setReportProjectId(projects[0].id);
                  setShowDailyReportModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all"
              >
                <ClipboardList className="w-4 h-4 text-amber-400" />
                <span>+ Submit Daily Report</span>
              </button>
            )}
            {canWriteProjects && (
              <button
                onClick={() => {
                  setSelectedSiteId(activeSiteFilter || (sites.length > 0 ? sites[0].id : ""));
                  setShowCreateModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>+ Create Project</span>
              </button>
            )}
          </div>
        </PageHeader>

        {/* Feedback alerts */}
        {statusMessage && <Alert tone="success">{statusMessage}</Alert>}
        {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

        {/* Tab Controls */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setActiveTab("PROJECTS")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "PROJECTS"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <FolderKanban className="w-4 h-4" />
            <span>Active Projects ({filteredProjects.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("SITES")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "SITES"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <Building2 className="w-4 h-4 text-amber-500" />
            <span>Sites Directory ({sites.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("REPORTS")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "REPORTS"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Daily Site Reports ({dailyReports.length})</span>
          </button>
        </div>

        {/* Tab 1: Projects Cards Grid */}
        {activeTab === "PROJECTS" && (
          <div className="space-y-4">
            {/* Project Filter Toolbar */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by project name, code, or site..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-9 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Site Filter Dropdown */}
                <select
                  value={activeSiteFilter}
                  onChange={(e) => {
                    const sId = e.target.value;
                    setActiveSiteFilter(sId);
                    setActiveSiteId(sId);
                    setCurrentPage(1);
                    loadData(sId);
                  }}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  <option value="">All Sites</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>

                {activeSiteFilter && canManageSites && (
                  <button
                    type="button"
                    onClick={() => {
                      const curSite = sites.find((s) => s.id === activeSiteFilter);
                      if (curSite) initiateDeleteSite(curSite);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition cursor-pointer"
                    title="Delete this selected site"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Site</span>
                  </button>
                )}

                {/* Status Filter Dropdown */}
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ON_HOLD">On Hold</option>
                  <option value="PLANNING">Planning</option>
                </select>
              </div>

              <div className="flex items-center justify-between md:justify-end gap-3 text-xs text-slate-500">
                <span>
                  Showing <strong>{paginatedProjects.length}</strong> of <strong>{filteredProjects.length}</strong> projects
                </span>

                {(searchQuery || statusFilter !== "ALL" || activeSiteFilter) && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg transition"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-44 bg-slate-200/60 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-slate-200 p-6">
                <FolderKanban className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <div className="text-sm font-bold text-slate-700">No matching projects found</div>
                <div className="text-xs text-slate-400 mt-1 mb-4">
                  {searchQuery || statusFilter !== "ALL" || activeSiteFilter
                    ? "No projects matched your active filters. Try resetting the filters or searching with different terms."
                    : "No projects exist yet. Click '+ Create Project' to get started."}
                </div>
                {(searchQuery || statusFilter !== "ALL" || activeSiteFilter) && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset All Filters</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {paginatedProjects.map((p) => (
                    <div
                      key={p.id}
                      className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                            {p.code}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                            ● {p.status}
                          </span>
                        </div>

                        <h3 className="font-bold text-slate-900 text-lg">{p.name}</h3>

                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{p.site?.name}</span>
                        </div>

                        {p.notes && (
                          <p className="text-xs text-slate-600 mt-2 line-clamp-2">{p.notes}</p>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <div>
                          <div className="text-slate-400 text-[11px]">Approved Budget</div>
                          <div className="font-bold text-slate-900 text-sm tabular-nums">
                            {formatCurrency(p.budgetAmount)}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-slate-400 text-[11px]">Linked Records</div>
                          <div className="font-semibold text-slate-700">
                            {p._count?.tasks ?? 0} Tasks • {p._count?.dailyReports ?? 0} Reports
                          </div>
                        </div>
                      </div>

                      <div className="mt-3.5 flex items-center gap-2">
                        <Link
                          href={`/projects/${p.id}`}
                          className="flex-1 text-center py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition shadow-xs"
                        >
                          View Project Details &rarr;
                        </Link>
                        {canWriteProjects && (
                          <button
                            onClick={() => handleDeleteProject(p.id, p.name)}
                            title="Delete Project"
                            className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-xs text-slate-600">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 font-semibold"
                    >
                      Previous
                    </button>
                    <span>
                      Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 font-semibold"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab 2: Sites Directory View */}
        {activeTab === "SITES" && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-amber-500" />
                  <span>Construction Sites & Locations Directory</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage active construction yards, project locations, and site inventories.
                </p>
              </div>
              {canManageSites && (
                <button
                  type="button"
                  onClick={() => setShowCreateSiteModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs transition shrink-0 cursor-pointer"
                >
                  <Building2 className="w-4 h-4" />
                  <span>+ Add New Site</span>
                </button>
              )}
            </div>

            {sites.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-slate-200 p-6">
                <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <div className="text-sm font-bold text-slate-700">No active sites found</div>
                <div className="text-xs text-slate-400 mt-1 mb-3">
                  Click &quot;+ Add New Site&quot; to create your first construction site.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sites.map((site) => {
                  const siteProjects =
                    site.projects && site.projects.length > 0
                      ? site.projects
                      : projects.filter((p) => p.siteId === site.id);
                  const activeProjCount = siteProjects.filter(
                    (p: any) => !["COMPLETED", "ARCHIVED"].includes(p.status)
                  ).length;
                  const completedProjCount = siteProjects.filter((p: any) => p.status === "COMPLETED").length;
                  const isCurrentActive = activeSiteId === site.id;

                  return (
                    <div
                      key={site.id}
                      className={`bg-white rounded-xl border p-5 shadow-xs transition-all flex flex-col justify-between ${
                        isCurrentActive ? "border-amber-400 ring-2 ring-amber-400/20" : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                            {site.code}
                          </span>
                          {isCurrentActive ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 uppercase tracking-wider flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Active Filter Site
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                              ● Active Site
                            </span>
                          )}
                        </div>

                        <h3 className="font-bold text-slate-900 text-base">{site.name}</h3>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {site.address || "No physical address specified"}
                        </p>

                        <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <div className="text-[11px] text-slate-400 font-medium">Projects</div>
                            <div className="font-bold text-slate-900 text-sm mt-0.5">
                              {siteProjects.length} total
                            </div>
                            <div className="text-[10px] mt-0.5">
                              {activeProjCount > 0 ? (
                                <span className="text-amber-700 font-semibold">{activeProjCount} active / in-progress</span>
                              ) : (
                                <span className="text-emerald-700 font-semibold">All completed ✓</span>
                              )}
                            </div>
                          </div>

                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <div className="text-[11px] text-slate-400 font-medium">Stores / Yards</div>
                            <div className="font-bold text-slate-900 text-sm mt-0.5">
                              {site.stores?.length ?? 2} stores
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {completedProjCount} completed proj
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSiteFilter(site.id);
                            setActiveSiteId(site.id);
                            setActiveTab("PROJECTS");
                            loadData(site.id);
                          }}
                          className="flex-1 py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition text-center shadow-xs cursor-pointer"
                        >
                          View Projects &rarr;
                        </button>

                        {canManageSites && (
                          <button
                            type="button"
                            onClick={() => initiateDeleteSite(site)}
                            title={`Delete site "${site.name}"`}
                            className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Daily Site Reports View */}
        {activeTab === "REPORTS" && (
          loading ? (
            <div className="h-64 bg-slate-200/60 rounded-xl animate-pulse" />
          ) : dailyReports.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">No daily site reports filed yet</div>
              <div className="text-xs text-slate-400 mt-1">
                {canSubmitDailyReport
                  ? 'Click "+ Submit Daily Report" above to file supervisor progress and site blocker notes.'
                  : "Supervisor progress and site blocker notes will appear here once submitted."}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <ExcelTableToolbar
                table={excelReports}
                columns={reportColumns}
                tableName="daily site reports"
                showSearch={true}
                showExport={true}
              />
              <div className="overflow-x-auto min-h-[400px]">
                <table className="w-full text-left text-sm min-w-[750px]">
                  <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                    <tr>
                      {reportColumns.map((col) => (
                        <ExcelColumnHeader
                          key={col.key}
                          column={col}
                          table={excelReports}
                          theme="darkHeader"
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {excelReports.filteredData.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-xs font-bold text-slate-900 whitespace-nowrap">
                          {formatDate(r.reportDate)}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-800">
                          {r.project?.name} ({r.project?.code})
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-600">
                          {r.project?.site?.name || "—"}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-700 max-w-xs">
                          {r.progress}
                        </td>
                        <td className="py-3.5 px-4 text-xs">
                          {r.blockers ? (
                            <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              {r.blockers}
                            </span>
                          ) : (
                            <span className="text-slate-400">None</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-xs">
                          {r.safetyNotes ? (
                            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              {r.safetyNotes}
                            </span>
                          ) : (
                            <span className="text-slate-400">None</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-semibold text-slate-600">
                          {r.creator?.name || "Supervisor"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {/* Modal: Create Site */}
        {showCreateSiteModal && canManageSites && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
              <div className="p-5 pb-3 border-b border-slate-100 shrink-0 bg-white flex items-center justify-between">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-amber-500" />
                  <span>Create Construction Site</span>
                </div>
                <button
                  onClick={() => setShowCreateSiteModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="create-site-modal-form" onSubmit={handleCreateSite} className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Site Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SKY-SEC62"
                    value={siteCode}
                    onChange={(e) => setSiteCode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono uppercase"
                  />
                  <p className="text-[11px] text-slate-400 mt-0.5">Unique identifier for this construction site</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Site / Location Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Skyline Heights Phase 2"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Site Physical Address *
                  </label>
                  <textarea
                    required
                    rows={2}
                    placeholder="e.g. Plot 4B, Sector 62, Noida, Uttar Pradesh 201301"
                    value={siteAddress}
                    onChange={(e) => setSiteAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

              </form>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCreateSiteModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="create-site-modal-form"
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 transition"
                >
                  {submitting ? "Creating Site..." : "Create Site"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Create Project */}
        {showCreateModal && canWriteProjects && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
              <div className="p-5 pb-3 border-b border-slate-100 shrink-0 bg-white flex items-center justify-between">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <FolderKanban className="w-5 h-5 text-amber-500" />
                  <span>Create Construction Project</span>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="create-project-modal-form" onSubmit={handleCreateProject} className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Project Location / Site *
                  </label>
                  <select
                    value={selectedSiteId}
                    onChange={(e) => setSelectedSiteId(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Project Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PRJ-SKY-B"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Tower B Structural Frame"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Approved Budget (₹)
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 50000000"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Target Completion
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Project Scope / Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Brief description of the construction scope..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

              </form>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="create-project-modal-form"
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 transition"
                >
                  {submitting ? "Saving..." : "Save Project"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Delete Site Confirmation & Active Projects Transfer */}
        {showDeleteSiteModal && siteToDelete && canManageSites && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
              <div className="p-5 pb-3 border-b border-slate-100 shrink-0 bg-white flex items-center justify-between">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  {activeProjectsForSite.length > 0 ? (
                    <>
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                      <span>Transfer Projects & Delete Site</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-5 h-5 text-rose-500" />
                      <span>Delete Construction Site</span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setShowDeleteSiteModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {activeProjectsForSite.length > 0 ? (
                  <>
                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1.5">
                      <div className="font-bold flex items-center gap-1.5 text-amber-800">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                        <span>Active / Incomplete Projects Detected</span>
                      </div>
                      <p>
                        Site <strong className="font-semibold text-slate-900">{siteToDelete.name}</strong> ({siteToDelete.code}) currently has{" "}
                        <strong className="underline font-bold text-amber-950">{activeProjectsForSite.length} active project(s)</strong>.
                      </p>
                      <p className="text-[11px] text-amber-800">
                        To safely delete this site, you must transfer these active projects to another site so that ongoing tasks, labour attendance, and budget records remain intact.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1.5">
                        Active Projects Requiring Transfer ({activeProjectsForSite.length}):
                      </label>
                      <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 bg-slate-50">
                        {activeProjectsForSite.map((proj) => (
                          <div key={proj.id} className="p-2.5 flex items-center justify-between text-xs bg-white">
                            <div className="pr-2">
                              <div className="font-bold text-slate-900">{proj.name}</div>
                              <div className="font-mono text-[10px] text-slate-500">{proj.code}</div>
                            </div>
                            <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 uppercase tracking-wider">
                              ● {proj.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                        Select Destination Site *
                      </label>
                      {sites.filter((s) => s.id !== siteToDelete.id).length === 0 ? (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                          No other active sites are available to transfer projects to. Please create another site first or mark these projects as completed.
                        </div>
                      ) : (
                        <>
                          <select
                            value={transferSiteId}
                            onChange={(e) => setTransferSiteId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-amber-500"
                          >
                            {sites
                              .filter((s) => s.id !== siteToDelete.id)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.code}) — {s.address || "Main Site"}
                                </option>
                              ))}
                          </select>
                          <p className="text-[11px] text-slate-500 mt-1">
                            All {activeProjectsForSite.length} active project(s) will be automatically reassigned to this destination site.
                          </p>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>All Projects Completed</span>
                      </div>
                      <p>
                        There are no active or in-progress projects on site <strong className="font-semibold text-slate-900">{siteToDelete.name}</strong>.
                      </p>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Are you sure you want to delete site <strong className="font-bold text-slate-900">{siteToDelete.name}</strong> ({siteToDelete.code})?
                      The site will be safely archived and removed from active site dropdowns and operations.
                    </p>
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowDeleteSiteModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>

                {activeProjectsForSite.length > 0 ? (
                  <button
                    type="button"
                    disabled={
                      deletingSite ||
                      !transferSiteId ||
                      sites.filter((s) => s.id !== siteToDelete.id).length === 0
                    }
                    onClick={handleConfirmDeleteSite}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 transition cursor-pointer flex items-center gap-1.5"
                  >
                    {deletingSite ? "Transferring & Deleting..." : `Transfer ${activeProjectsForSite.length} Projects & Delete Site`}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={deletingSite}
                    onClick={handleConfirmDeleteSite}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 transition cursor-pointer"
                  >
                    {deletingSite ? "Deleting Site..." : "Delete Site"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal: Submit Daily Site Report */}
        {showDailyReportModal && canSubmitDailyReport && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
              <div className="p-5 pb-3 border-b border-slate-100 shrink-0 bg-white flex items-center justify-between">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-amber-500" />
                  <span>Submit Daily Site Operations Report</span>
                </div>
                <button
                  onClick={() => setShowDailyReportModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="daily-report-modal-form" onSubmit={handleCreateReport} className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Target Project *
                    </label>
                    <select
                      value={reportProjectId}
                      onChange={(e) => setReportProjectId(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Report Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={reportDate}
                      onChange={(e) => setReportDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Daily Work Progress Summary *
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="e.g. Completed 4th floor column casting; shuttering work underway on eastern wing with 14 masons and 8 helpers."
                    value={reportProgress}
                    onChange={(e) => setReportProgress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Blockers, Bottlenecks & Delays
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Delayed delivery of 32mm steel rebar due to transporter strike"
                    value={reportBlockers}
                    onChange={(e) => setReportBlockers(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Safety Notes & Environmental Checks
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Toolbox meeting conducted at 8:30 AM; 100% PPE compliance; zero incidents"
                    value={reportSafetyNotes}
                    onChange={(e) => setReportSafetyNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

              </form>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowDailyReportModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="daily-report-modal-form"
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 transition"
                >
                  {submitting ? "Submitting..." : "Submit Daily Report"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
