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
  CheckCircle2,
  X,
  Plus,
} from "lucide-react";
import { clientCache } from "@/lib/client-cache";

export default function DashboardPage() {
  const [kpi, setKpi] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSiteId, setActiveSiteId] = useState<string>("");

  // Quick Task Modal
  const [showQuickTaskModal, setShowQuickTaskModal] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickProjectId, setQuickProjectId] = useState("");
  const [quickPriority, setQuickPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [quickDueAt, setQuickDueAt] = useState("");

  // Quick Crew Check-in Modal
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [checkInSiteId, setCheckInSiteId] = useState("");

  // Feedback notifications
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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
      fetch(`/api/attendance?workDate=${todayStr}`).then((r) => r.json()),
      fetch("/api/materials").then((r) => r.json()),
      fetch("/api/workforce").then((r) => r.json()),
    ])
      .then(([kpiRes, projRes, taskRes, attRes, matRes, wfRes]) => {
        const mergedProj = clientCache.mergeProjects(projRes.data || []);
        const mergedTasks = clientCache.mergeTasks(taskRes.data || []);
        if (attRes.success && attRes.data) clientCache.mergeAttendance(attRes.data);
        if (matRes.success && matRes.data) clientCache.mergeMaterials(matRes.data);
        if (wfRes.success && wfRes.data) {
          const mergedWf = clientCache.mergeWorkforce(wfRes.data);
          setWorkers(mergedWf);
          if (mergedWf.length > 0) setSelectedWorkerId(mergedWf[0].id);
        }

        const filteredProjs = siteId ? mergedProj.filter((p: any) => p.siteId === siteId) : mergedProj;
        const filteredTasks = siteId
          ? mergedTasks.filter((t: any) => t.project?.siteId === siteId || filteredProjs.some((p: any) => p.id === t.projectId))
          : mergedTasks;

        setProjects(filteredProjs);
        if (filteredProjs.length > 0 && !quickProjectId) {
          setQuickProjectId(filteredProjs[0].id);
        }

        setTasks(filteredTasks.filter((t: any) => t.status === "TODO" || t.status === "IN_PROGRESS"));
        refreshKpis(kpiRes.data, siteId);
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
  }, []);

  const handleQuickTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;

    const targetProjId = quickProjectId || (projects.length > 0 ? projects[0].id : "demo-prj-1");
    const targetProj = projects.find((p) => p.id === targetProjId);

    const newTask = {
      id: `task-${Date.now()}`,
      projectId: targetProjId,
      title: quickTitle.trim(),
      priority: quickPriority,
      status: "TODO",
      dueAt: quickDueAt ? new Date(quickDueAt).toISOString() : new Date().toISOString(),
      project: targetProj ? { id: targetProj.id, name: targetProj.name, code: targetProj.code } : undefined,
    };

    clientCache.saveTask(newTask);
    setTasks((prev) => [newTask, ...prev]);
    refreshKpis(kpi, activeSiteId);

    setStatusMessage(`Task "${newTask.title}" added to site board!`);
    setShowQuickTaskModal(false);
    setQuickTitle("");
    setQuickDueAt("");

    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTask),
      });
    } catch {
      // offline / clientCache handles persistence
    }
  };

  const handleQuickCompleteTask = async (taskId: string, title: string) => {
    clientCache.updateTaskStatus(taskId, "COMPLETED");
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    refreshKpis(kpi, activeSiteId);
    setStatusMessage(`Task "${title}" marked completed!`);

    try {
      await fetch(`/api/tasks/${taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
    } catch {
      // offline / clientCache handles persistence
    }
  };

  const handleQuickCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkerId) return;

    const worker = workers.find((w) => w.id === selectedWorkerId);
    const siteToUse = checkInSiteId || activeSiteId || (projects.length > 0 ? projects[0].siteId : "demo-site-1");

    const session = {
      id: `att-${Date.now()}`,
      workforceMemberId: selectedWorkerId,
      siteId: siteToUse,
      workDate: new Date().toISOString().split("T")[0],
      checkInAt: new Date().toISOString(),
      status: "PRESENT",
      workforceMember: worker,
    };

    clientCache.saveAttendance(session);
    refreshKpis(kpi, activeSiteId);
    setStatusMessage(`Worker "${worker?.name || 'Trade Crew'}" checked in successfully for today's shift!`);
    setShowCheckInModal(false);

    try {
      await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session),
      });
    } catch {
      // offline / clientCache handles persistence
    }
  };

  return (
    <Shell>
      <div className="space-y-6">
        {/* Welcome & Site Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Site Operations Dashboard
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Real-time site progress, authoritative inventory, and financial balances
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQuickTaskModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ Quick Task</span>
            </button>
            <Link
              href="/materials"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-sm transition-all"
            >
              <PackagePlus className="w-4 h-4 text-amber-400" />
              <span>Receive Stock</span>
            </Link>
          </div>
        </div>

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

        {/* Real KPI Cards Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-slate-200/60 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Active Projects */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Active Projects</span>
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                  <FolderKanban className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900">
                {kpi?.activeProjectsCount ?? 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                <span>{projects[0]?.name || "All Active Sites"}</span>
              </div>
            </div>

            {/* Workers Present Today */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Workers on Site</span>
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <HardHat className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900">
                {kpi?.workersPresentTodayCount ?? 0}
              </div>
              <div className="text-[11px] text-emerald-600 font-medium mt-1">
                Checked in today
              </div>
            </div>

            {/* Low Stock Alerts */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Low Stock Items</span>
                <div
                  className={`p-2 rounded-lg ${
                    (kpi?.lowStockItemsCount || 0) > 0
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-50 text-slate-500"
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
              <div className="text-[11px] text-slate-500 mt-1">
                Items below reorder limit
              </div>
            </div>

            {/* Overdue Tasks */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Overdue Tasks</span>
                <div
                  className={`p-2 rounded-lg ${
                    (kpi?.tasksOverdueCount || 0) > 0
                      ? "bg-rose-50 text-rose-600"
                      : "bg-slate-50 text-slate-500"
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
              <div className="text-[11px] text-slate-500 mt-1">
                Needs supervisor action
              </div>
            </div>

            {/* Tasks Due Today */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Tasks Due Today</span>
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  <CheckSquare className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900">
                {kpi?.tasksDueTodayCount ?? 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Scheduled completion today
              </div>
            </div>

            {/* Payments Today */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Paid Today</span>
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl font-black text-slate-900 tabular-nums">
                {formatCurrency(kpi?.paymentsMadeTodayAmount ?? 0)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Posted banking disbursements
              </div>
            </div>

            {/* Total Outstanding Payables */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-slate-300 transition-all col-span-2">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Outstanding Payables</span>
                <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
                  <TrendingDown className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-amber-600 tabular-nums">
                {formatCurrency(kpi?.totalOutstandingPayablesAmount ?? 0)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>Verified across vendor & contractor bills</span>
                <Link href="/parties" className="text-amber-600 font-semibold hover:underline">
                  View Statements →
                </Link>
              </div>
            </div>
          </div>
        )}

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

            <button
              onClick={() => setShowCheckInModal(true)}
              className="p-3 bg-slate-800/80 hover:bg-slate-800 rounded-xl border border-slate-700 flex items-center gap-2.5 transition-all text-left"
            >
              <UserCheck className="w-5 h-5 text-blue-400 shrink-0" />
              <div>
                <div className="text-xs font-bold text-white">Crew Check-In</div>
                <div className="text-[10px] text-slate-400">Tap worker attendance</div>
              </div>
            </button>

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

        {/* Active Projects and Tasks Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active Projects List */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-amber-500" />
                <span>Active Site Projects</span>
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
                <span>Pending Site Tasks</span>
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
                    value={quickProjectId}
                    onChange={(e) => setQuickProjectId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} - {p.name}
                      </option>
                    ))}
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

        {/* Modal: Quick Crew Check-in */}
        {showCheckInModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <HardHat className="w-5 h-5 text-emerald-600" />
                  <span>Quick Crew Check-In</span>
                </div>
                <button
                  onClick={() => setShowCheckInModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleQuickCheckInSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Select Worker to Check In *
                  </label>
                  <select
                    value={selectedWorkerId}
                    onChange={(e) => setSelectedWorkerId(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.employeeCode} - {w.workerType})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-800">
                  Worker will be marked PRESENT with current timestamp and checked in to the active site.
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCheckInModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-sm"
                  >
                    Confirm Check-In
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
