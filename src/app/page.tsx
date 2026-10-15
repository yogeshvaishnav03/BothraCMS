"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatQuantity, formatDate } from "@/lib/formatters";
import {
  FolderKanban,
  CheckSquare,
  HardHat,
  AlertTriangle,
  Boxes,
  DollarSign,
  TrendingDown,
  ArrowUpRight,
  PlusCircle,
  Calendar,
  Clock,
  ShieldAlert,
  ArrowRight,
  PackagePlus,
  PackageMinus,
  UserCheck,
} from "lucide-react";
import { clientCache } from "@/lib/client-cache";

export default function DashboardPage() {
  const [kpi, setKpi] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSiteId, setActiveSiteId] = useState<string>("");

  const loadDashboard = (siteId?: string) => {
    setLoading(true);
    const kpiUrl = siteId ? `/api/dashboard/kpi?siteId=${siteId}` : "/api/dashboard/kpi";
    const projUrl = siteId ? `/api/projects?siteId=${siteId}` : "/api/projects";

    Promise.all([
      fetch(kpiUrl).then((r) => r.json()),
      fetch(projUrl).then((r) => r.json()),
      fetch("/api/tasks").then((r) => r.json()),
    ])
      .then(([kpiRes, projRes, taskRes]) => {
        const mergedProj = clientCache.mergeProjects(projRes.data || []);
        const mergedTasks = clientCache.mergeTasks(taskRes.data || []);
        setProjects(mergedProj);
        setTasks(mergedTasks.filter((t: any) => t.status === "TODO" || t.status === "IN_PROGRESS"));

        if (kpiRes.success && kpiRes.data) {
          const kpiData = { ...kpiRes.data };
          if (mergedProj.length > 0) {
            kpiData.activeProjects =
              mergedProj.filter((p: any) => p.status === "ACTIVE").length || mergedProj.length;
          }
          if (mergedTasks.length > 0) {
            kpiData.pendingTasks = mergedTasks.filter((t: any) => t.status !== "COMPLETED").length;
          }
          setKpi(kpiData);
        }
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
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Quick Task</span>
            </Link>
            <Link
              href="/materials"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-sm transition-all"
            >
              <PackagePlus className="w-4 h-4 text-amber-400" />
              <span>Receive Stock</span>
            </Link>
          </div>
        </div>

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
                <div className={`p-2 rounded-lg ${kpi?.lowStockItemsCount > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-50 text-slate-500"}`}>
                  <Boxes className="w-4 h-4" />
                </div>
              </div>
              <div className={`text-2xl font-black ${kpi?.lowStockItemsCount > 0 ? "text-amber-600" : "text-slate-900"}`}>
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
                <div className={`p-2 rounded-lg ${kpi?.tasksOverdueCount > 0 ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-500"}`}>
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className={`text-2xl font-black ${kpi?.tasksOverdueCount > 0 ? "text-rose-600" : "text-slate-900"}`}>
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
            <span className="text-[11px] text-slate-400">High-priority field actions</span>
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

            <Link
              href="/attendance"
              className="p-3 bg-slate-800/80 hover:bg-slate-800 rounded-xl border border-slate-700 flex items-center gap-2.5 transition-all"
            >
              <UserCheck className="w-5 h-5 text-blue-400 shrink-0" />
              <div className="text-left">
                <div className="text-xs font-bold text-white">Crew Check-In</div>
                <div className="text-[10px] text-slate-400">Tap worker attendance</div>
              </div>
            </Link>

            <Link
              href="/tasks"
              className="p-3 bg-slate-800/80 hover:bg-slate-800 rounded-xl border border-slate-700 flex items-center gap-2.5 transition-all"
            >
              <CheckSquare className="w-5 h-5 text-purple-400 shrink-0" />
              <div className="text-left">
                <div className="text-xs font-bold text-white">Update Task</div>
                <div className="text-[10px] text-slate-400">Mark done / blocked</div>
              </div>
            </Link>
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
                {projects.slice(0, 3).map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-lg border border-slate-100 hover:border-slate-200 bg-slate-50/50 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-900 text-sm">{p.name}</div>
                      <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                        {p.code}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 flex items-center justify-between">
                      <span>Site: {p.site?.name}</span>
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
                  </div>
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
                {tasks.slice(0, 4).map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-lg border border-slate-100 hover:border-slate-200 bg-slate-50/50 flex items-center justify-between gap-3"
                  >
                    <div className="truncate">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {t.title}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                        <span>{t.project?.name}</span>
                        {t.dueAt && <span>• Due: {formatDate(t.dueAt)}</span>}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ${
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
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
