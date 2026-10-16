"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  FolderKanban,
  ArrowLeft,
  Calendar,
  Building2,
  HardHat,
  DollarSign,
  CheckSquare,
  ClipboardList,
  Boxes,
  Clock,
  AlertTriangle,
  User,
  PlusCircle,
  Plus,
  X,
  CheckCircle2,
} from "lucide-react";

export default function ProjectDetailsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"DSR" | "TASKS" | "MATERIALS">("DSR");

  // Dynamic Modals
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [taskDueDate, setTaskDueDate] = useState("");

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportProgress, setReportProgress] = useState("");
  const [reportBlockers, setReportBlockers] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadProject = () => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setProject(res.data);
        } else {
          setProject(null);
        }
      })
      .catch((err) => {
        console.error("Authoritative project load failed:", err);
        setProject(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProject();
  }, [projectId]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !project || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          title: taskTitle.trim(),
          priority: taskPriority,
          dueAt: taskDueDate ? new Date(taskDueDate).toISOString() : new Date().toISOString(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to create task");
        return;
      }

      setStatusMessage(`Task "${data.data.title}" added to project!`);
      setShowTaskModal(false);
      setTaskTitle("");
      setTaskDueDate("");
      loadProject();
    } catch (err: any) {
      setErrorMessage(`Network error: ${err.message || "Failed to create task"}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportProgress.trim() || !project || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/daily-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          reportDate: new Date().toISOString().split("T")[0],
          progress: reportProgress.trim(),
          blockers: reportBlockers.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to record daily report");
        return;
      }

      setStatusMessage("Daily site report recorded successfully!");
      setShowReportModal(false);
      setReportProgress("");
      setReportBlockers("");
      loadProject();
    } catch (err: any) {
      setErrorMessage(`Network error: ${err.message || "Failed to record daily report"}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div className="space-y-4">
          <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-slate-200 rounded-xl animate-pulse" />
        </div>
      </Shell>
    );
  }

  if (!project) {
    return (
      <Shell>
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-2" />
          <h2 className="text-base font-bold text-slate-800">Project Not Found</h2>
          <p className="text-xs text-slate-500 mt-1">
            This project does not exist or is outside your organization scope.
          </p>
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-xs text-amber-600 font-bold hover:underline mt-4"
          >
            &larr; Back to Projects Directory
          </Link>
        </div>
      </Shell>
    );
  }

  const budget = project.financials?.budgetAmount || 0;
  const billed = project.financials?.totalBilled || 0;
  const budgetUtilization = budget > 0 ? Math.min(100, Math.round((billed / (budget * 100)) * 100)) : 0;

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header with Breadcrumb */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/projects"
              className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  {project.code}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    project.status === "ACTIVE"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {project.status}
                </span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1 flex items-center gap-2">
                {project.name}
              </h1>
              <div className="text-xs text-slate-500 flex items-center gap-3 mt-0.5">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  {project.site?.name}
                </span>
                {project.manager && (
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    Manager: {project.manager.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReportModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all"
            >
              <ClipboardList className="w-4 h-4 text-amber-400" />
              <span>+ Daily Report</span>
            </button>
            <button
              onClick={() => setShowTaskModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Task</span>
            </button>
          </div>
        </div>

        {/* Status Alert */}
        {statusMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusMessage}</span>
            </div>
            <button onClick={() => setStatusMessage(null)} className="p-0.5 text-emerald-600 hover:text-emerald-800">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Financial & Operational KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Project Budget
            </span>
            <div className="text-xl font-black text-slate-900 mt-1">
              ₹{(budget).toLocaleString("en-IN")}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Approved financial allocation</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Billed
            </span>
            <div className="text-xl font-black text-amber-600 mt-1">
              {formatCurrency(billed)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {project.bills?.length || 0} posted vendor/sub bills
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Daily Reports Filed
            </span>
            <div className="text-xl font-black text-slate-900 mt-1">
              {project.dailyReports?.length || 0}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Supervisor progress logs</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Active Tasks
            </span>
            <div className="text-xl font-black text-slate-900 mt-1">
              {project.tasks?.length || 0}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Milestones & work orders</div>
          </div>
        </div>

        {/* Budget Progress Indicator */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Budget Utilization: {budgetUtilization}% committed</span>
            <span>{formatCurrency(billed)} of ₹{budget.toLocaleString("en-IN")}</span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                budgetUtilization > 90
                  ? "bg-rose-500"
                  : budgetUtilization > 70
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${budgetUtilization}%` }}
            />
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab("DSR")}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
              activeTab === "DSR"
                ? "border-amber-600 text-amber-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Daily Site Reports ({project.dailyReports?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("TASKS")}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
              activeTab === "TASKS"
                ? "border-amber-600 text-amber-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            Tasks & Work Orders ({project.tasks?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("MATERIALS")}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
              activeTab === "MATERIALS"
                ? "border-amber-600 text-amber-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <Boxes className="w-4 h-4" />
            Material Consumption ({project.stockMovements?.length || 0})
          </button>
        </div>

        {/* Tab 1: Daily Site Reports (DSR History) */}
        {activeTab === "DSR" && (
          <div className="space-y-4">
            {project.dailyReports?.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
                <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <div className="text-sm font-bold text-slate-700">No daily reports recorded yet</div>
                <p className="text-xs text-slate-400 mt-1">
                  Site supervisors submit daily progress and blocker notes from the Projects tab.
                </p>
              </div>
            ) : (
              project.dailyReports.map((report: any) => (
                <div key={report.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black bg-slate-900 text-slate-100 px-2.5 py-1 rounded">
                        {report.reportDate}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        Filed by <span className="font-semibold text-slate-800">{report.creator?.name}</span> ({report.creator?.role})
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {new Date(report.createdAt).toLocaleTimeString("en-IN", { timeStyle: "short" })}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="font-bold text-slate-700 uppercase tracking-wider block text-[10px] text-slate-400">
                        Work Progress Summary
                      </span>
                      <p className="text-slate-800 leading-relaxed font-medium mt-0.5">{report.progress}</p>
                    </div>

                    {report.blockers && (
                      <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-amber-900">
                        <span className="font-bold block text-[10px] uppercase text-amber-800">
                          Site Blockers / Impediments
                        </span>
                        <p className="mt-0.5">{report.blockers}</p>
                      </div>
                    )}

                    {report.safetyNotes && (
                      <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 text-emerald-900">
                        <span className="font-bold block text-[10px] uppercase text-emerald-800">
                          Safety & Compliance Observations
                        </span>
                        <p className="mt-0.5">{report.safetyNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Tasks */}
        {activeTab === "TASKS" && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {project.tasks?.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No active tasks assigned to this project yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {project.tasks.map((task: any) => (
                  <div key={task.id} className="p-4 flex items-center justify-between hover:bg-slate-50/60">
                    <div>
                      <div className="text-xs font-bold text-slate-900">{task.title}</div>
                      {task.description && (
                        <div className="text-[11px] text-slate-500 mt-0.5">{task.description}</div>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                        <span>Assignee: {task.assignee?.name || "Unassigned"}</span>
                        {task.dueAt && <span>Due: {formatDate(task.dueAt)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          task.priority === "CRITICAL"
                            ? "bg-rose-100 text-rose-800"
                            : task.priority === "HIGH"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {task.priority}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {task.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Material Issues */}
        {activeTab === "MATERIALS" && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {project.stockMovements?.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No stock issues recorded for this project yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4">Material</th>
                      <th className="py-2.5 px-4">Quantity Issued</th>
                      <th className="py-2.5 px-4">Store</th>
                      <th className="py-2.5 px-4">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {project.stockMovements.map((m: any) => (
                      <tr key={m.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 text-slate-600">{formatDate(m.movementAt)}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{m.material?.name}</td>
                        <td className="py-3 px-4 font-bold text-amber-700">
                          {Math.abs(m.quantityDelta)} {m.unitCode}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{m.store?.name}</td>
                        <td className="py-3 px-4 text-slate-500">{m.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Modal: Add Task */}
        {showTaskModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-amber-500" />
                  <span>Add Task for {project.code}</span>
                </div>
                <button
                  onClick={() => setShowTaskModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateTask} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Task Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="e.g. RCC Column Casting Level 3"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Priority
                    </label>
                    <select
                      value={taskPriority}
                      onChange={(e) => setTaskPriority(e.target.value as any)}
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
                      value={taskDueDate}
                      onChange={(e) => setTaskDueDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTaskModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm"
                  >
                    Add Task
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Daily Report */}
        {showReportModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-amber-500" />
                  <span>Submit Daily Site Report</span>
                </div>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateReport} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Work Progress Summary *
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={reportProgress}
                    onChange={(e) => setReportProgress(e.target.value)}
                    placeholder="Describe progress achieved on site today..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Blockers / Material Constraints
                  </label>
                  <textarea
                    rows={2}
                    value={reportBlockers}
                    onChange={(e) => setReportBlockers(e.target.value)}
                    placeholder="Any site issues, material delays, or plant downtime..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-sm"
                  >
                    Record Report
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
