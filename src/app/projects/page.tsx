"use client";

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
  const canSubmitDailyReport =
    canUser(currentUser, "projects:write") || canUser(currentUser, "tasks:write");

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

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/sites").then((r) => r.json()),
      fetch("/api/daily-reports").then((r) => r.json()),
      fetch("/api/auth/me").then((r) => r.json()).catch(() => ({})),
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
            setSelectedSiteId((prev) => prev || rawSites[0].id);
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
    loadData();
  }, []);

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
        setStatusMessage("Project created successfully!");
        setShowCreateModal(false);
        setName("");
        setCode("");
        setBudgetAmount("");
        setStartDate("");
        setEndDate("");
        setNotes("");
        loadData();
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <FolderKanban className="w-6 h-6 text-amber-500" />
              <span>Construction Projects & Sites</span>
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Scope of works, budgets, schedules, material consumptions, and daily supervisor site reports.
            </p>
          </div>

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
                  if (sites.length > 0) setSelectedSiteId(sites[0].id);
                  setShowCreateModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>+ Create Project</span>
              </button>
            )}
          </div>
        </div>

        {/* Feedback alerts */}
        {statusMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

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
            <span>Active Projects ({projects.length})</span>
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
          loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-44 bg-slate-200/60 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <FolderKanban className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">No projects found</div>
              <div className="text-xs text-slate-400 mt-1">Create a new project to start scheduling work.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map((p) => (
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
          )
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
                <table className="w-full text-left text-sm">
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
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-amber-500" />
                  <span>Create Construction Site</span>
                </div>
                <button
                  onClick={() => setShowCreateSiteModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateSite} className="space-y-4">
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

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateSiteModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {submitting ? "Creating Site..." : "Create Site"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Create Project */}
        {showCreateModal && canWriteProjects && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <FolderKanban className="w-5 h-5 text-amber-500" />
                  <span>Create Construction Project</span>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateProject} className="space-y-4">
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

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : "Save Project"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Submit Daily Site Report */}
        {showDailyReportModal && canSubmitDailyReport && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 my-8">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-amber-500" />
                  <span>Submit Daily Site Operations Report</span>
                </div>
                <button
                  onClick={() => setShowDailyReportModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateReport} className="space-y-4">
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

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDailyReportModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {submitting ? "Submitting..." : "Submit Daily Report"}
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
