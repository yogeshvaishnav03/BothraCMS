"use client";

import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import React, { useEffect, useState, useMemo } from "react";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, ExcelColumn } from "@/components/ui/ExcelTable";
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
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [dailyReports, setDailyReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"PROJECTS" | "REPORTS">("PROJECTS");

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
  // Authorized operational roles: Supervisors, Project Managers, and Admins (Finance/Accountants excluded)
  const canSubmitDailyReport = Boolean(
    currentUser &&
      ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "SITE_SUPERVISOR"].includes(currentUser.role)
  );

  // Active Site Filter state synchronized with global shell
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
      fetch(`/api/auth/me?${cacheBuster}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
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
    const savedSite = typeof window !== "undefined" ? localStorage.getItem("buildtrack_active_site") || "" : "";
    setActiveSiteFilter(savedSite);
    loadData(savedSite);

    const onSiteChanged = (e: any) => {
      const newSite = e.detail?.siteId || "";
      setActiveSiteFilter(newSite);
      loadData(newSite);
    };

    window.addEventListener("siteChanged", onSiteChanged);
    return () => window.removeEventListener("siteChanged", onSiteChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowCreateModal(false);
        setShowCreateSiteModal(false);
        setShowDailyReportModal(false);
      }
    };
    if (showCreateModal || showCreateSiteModal || showDailyReportModal) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [showCreateModal, showCreateSiteModal, showDailyReportModal]);

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

        {/* Tab 2: Daily Site Reports View */}
        {activeTab === "REPORTS" && (
          loading ? (
            <div className="h-64 bg-slate-200/60 rounded-xl animate-pulse" />
          ) : dailyReports.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">No daily site reports filed yet</div>
              <div className="text-xs text-slate-400 mt-1">
                Click &quot;+ Submit Daily Report&quot; above to file supervisor progress and site blocker notes.
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
              <div className="overflow-x-auto">
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
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
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
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
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

        {/* Modal: Submit Daily Site Report */}
        {showDailyReportModal && canSubmitDailyReport && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
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
