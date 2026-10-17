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
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { clientCache } from "@/lib/client-cache";
import { useLanguage } from "@/lib/i18n";

export default function DashboardPage() {
  const { t } = useLanguage();
  const [kpi, setKpi] = useState<any>(null);
  const [activeKpiModal, setActiveKpiModal] = useState<string | null>(null);
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
    ])
      .then(([kpiRes, projRes, taskRes, attRes, matRes, wfRes]) => {
        const rawProjs = projRes.data || [];
        const rawTasks = taskRes.data || [];
        const rawWorkers = wfRes.data || [];

        setWorkers(rawWorkers);
        if (rawWorkers.length > 0) {
          setSelectedWorkerId((prev) => (rawWorkers.some((w: any) => w.id === prev) ? prev : rawWorkers[0].id));
        }

        const filteredProjs = siteId ? rawProjs.filter((p: any) => p.siteId === siteId) : rawProjs;
        const filteredTasks = siteId
          ? rawTasks.filter((t: any) => t.project?.siteId === siteId || filteredProjs.some((p: any) => p.id === t.projectId))
          : rawTasks;

        setProjects(filteredProjs);
        if (filteredProjs.length > 0 && !quickProjectId) {
          setQuickProjectId(filteredProjs[0].id);
        }

        setTasks(filteredTasks.filter((t: any) => t.status === "TODO" || t.status === "IN_PROGRESS"));
        refreshKpis(kpiRes.data, siteId);
      })
      .catch((err) => {
        console.error("Dashboard authoritative load failed:", err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (workers.length > 0) {
      setSelectedWorkerId((prev) => (workers.some((w) => w.id === prev) ? prev : workers[0].id));
    }
  }, [workers]);

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

    const targetProjId = quickProjectId || (projects.length > 0 ? projects[0].id : "");
    if (!targetProjId) {
      setErrorMessage("Please select a project before creating a task.");
      return;
    }

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

  const handleQuickCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkerId || submittingCheckIn) return;

    const siteToUse = checkInSiteId || activeSiteId || (projects.length > 0 ? projects[0].siteId : "");
    if (!siteToUse) {
      setErrorMessage("Please select a site for crew check-in.");
      return;
    }

    setSubmittingCheckIn(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workforceMemberId: selectedWorkerId,
          siteId: siteToUse,
          workDate: new Date().toISOString().split("T")[0],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to record check-in on server");
        return;
      }

      const worker = workers.find((w) => w.id === selectedWorkerId);
      setStatusMessage(`Worker "${worker?.name || 'Trade Crew'}" checked in successfully!`);
      setShowCheckInModal(false);
      loadDashboard(activeSiteId);
    } catch (err: any) {
      setErrorMessage(`Network error: ${err.message || "Failed to record check-in"}`);
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
        return {
          icon: <HardHat className="w-5 h-5 text-emerald-600" />,
          title: t("kpi.workersOnSite", "Workers on Site"),
          badge: `${kpi?.workersPresentTodayCount ?? 0} Present Today`,
          badgeColor: "bg-emerald-100 text-emerald-800",
          subtitle: "Crew members and workforce who have checked in today",
          actionUrl: "/attendance",
          actionLabel: "Go to Attendance",
          emptyTitle: "No crew checked in today",
          emptyDesc: "No attendance sessions logged for today yet. Use Quick Crew Check-In or the Attendance page.",
          content: list.length > 0 ? (
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {list.map((w: any) => (
                <div
                  key={w.id}
                  className="p-3.5 bg-slate-50 hover:bg-emerald-50/40 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{w.workerName}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                        {w.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-3">
                      <span>
                        Trade: <strong className="text-slate-700">{w.trade}</strong>
                      </span>
                      {w.siteName && (
                        <span>
                          Site: <strong className="text-slate-700">{w.siteName}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <div className="text-[11px] text-slate-500 font-medium">Check-In Time</div>
                    <div className="text-sm font-bold text-emerald-700">
                      {w.checkInAt
                        ? new Date(w.checkInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "Today"}
                    </div>
                  </div>
                </div>
              ))}
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
                <span>{projects[0]?.name || "All Active Sites"}</span>
                <span className="text-blue-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                  Details <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </div>

            {/* Workers Present Today */}
            <div
              onClick={() => setActiveKpiModal("workersPresentToday")}
              className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group select-none active:scale-[0.99]"
              title="Click to view Crew Attendance details"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">{t("kpi.workersOnSite", "Workers on Site")}</span>
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <HardHat className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900">
                {kpi?.workersPresentTodayCount ?? 0}
              </div>
              <div className="text-[11px] text-emerald-600 font-medium mt-1 flex items-center justify-between">
                <span>Checked in today</span>
                <span className="text-emerald-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
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
                    {workers.length === 0 ? (
                      <option value="" disabled>
                        No active workers found — Register via Attendance page
                      </option>
                    ) : (
                      workers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.employeeCode} - {w.workerType})
                        </option>
                      ))
                    )}
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
      </div>
    </Shell>
  );
}
