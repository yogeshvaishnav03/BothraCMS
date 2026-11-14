"use client";

import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTablePagination, ShowEntriesControl, TablePagination } from "@/components/ui/ExcelTable";
import React, { useEffect, useState, useMemo } from "react";
import Shell from "@/components/layout/Shell";
import { formatDate } from "@/lib/formatters";
import {
  CheckSquare,
  Plus,
  Search,
  Filter,
  Clock,
  AlertTriangle,
  CheckCircle2,
  X,
  User,
  Paperclip,
  MessageSquare,
  History,
  ShieldCheck,
  Send,
  HelpCircle,
  AlertCircle,
  Calendar,
  Trash2,
  Edit2,
  Tag,
  Building,
  GitCommitHorizontal,
} from "lucide-react";
import AttachmentManager from "@/components/attachments/AttachmentManager";
import AuditHistoryModal from "@/components/audit/AuditHistoryModal";
import TaskTimeline from "@/components/tasks/TaskTimeline";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { canUser } from "@/lib/permissions";
import { useActiveSite } from "@/hooks/useActiveSite";
import { useAppSession } from "@/components/providers/AppSessionProvider";

// Safely fetch and parse JSON with cache-busting to ensure fresh tables
async function safeFetchJson(url: string, init?: RequestInit): Promise<any> {
  try {
    const isGet = !init || !init.method || init.method.toUpperCase() === "GET";
    const finalUrl = isGet ? `${url}${url.includes("?") ? "&" : "?"}_t=${Date.now()}` : url;
    const finalInit: RequestInit = {
      cache: "no-store",
      ...init,
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        ...(init?.headers || {}),
      },
    };
    const res = await fetch(finalUrl, finalInit);
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return await res.json();
    }
    return { success: false, data: [] };
  } catch {
    return { success: false, data: [] };
  }
}

export default function TasksPage() {
  const { activeSiteId } = useActiveSite();
  const { refreshUser } = useAppSession();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const canWriteTasks = canUser(currentUser, "tasks:write");

  // Filters
  const [filterTab, setFilterTab] = useState("all"); // all, pending, overdue, completed, verified, my_tasks, assigned_by_me, requests
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [search, setSearch] = useState("");

  // Create Task Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [taskType, setTaskType] = useState<
    "STANDARD" | "PERSONAL" | "REQUEST_OWNER" | "REQUEST_MANAGER" | "REQUEST_ARCHITECT"
  >("STANDARD");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [reminderAt, setReminderAt] = useState("");

  // Edit Task Modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState("MEDIUM");
  const [editAssigneeUserId, setEditAssigneeUserId] = useState("");
  const [editDueAt, setEditDueAt] = useState("");
  const [editReminderAt, setEditReminderAt] = useState("");
  const [editReason, setEditReason] = useState("");

  // Status Update Modal state
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusTask, setStatusTask] = useState<any>(null);
  const [newStatus, setNewStatus] = useState("COMPLETED");
  const [statusNote, setStatusNote] = useState("");

  // Comments / Assistance Requests Modal state
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [activeTaskForComments, setActiveTaskForComments] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentContent, setNewCommentContent] = useState("");
  const [newCommentType, setNewCommentType] = useState<"COMMENT" | "QUESTION" | "ASSISTANCE_REQUEST">("COMMENT");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<{ id: string; title: string } | null>(null);
  const [deletingTask, setDeletingTask] = useState(false);

  // Attachments Modal state
  const [showAttachmentsModal, setShowAttachmentsModal] = useState(false);
  const [activeTaskForAttachments, setActiveTaskForAttachments] = useState<any>(null);

  // Audit History Modal state
  const [auditTarget, setAuditTarget] = useState<{ id: string; title: string } | null>(null);
  const [timelineTask, setTimelineTask] = useState<any>(null);
  const deepLinkHandled = React.useRef(false);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = () => {
    setLoading(true);
    let url = "/api/tasks?";
    if (filterTab === "requests") {
      // Fetch request tasks
      url += `taskType=REQUEST_OWNER,REQUEST_MANAGER,REQUEST_ARCHITECT&`;
    } else if (filterTab !== "all") {
      url += `filter=${filterTab}&`;
    }
    if (selectedEmployeeId) {
      url += `employeeId=${selectedEmployeeId}&`;
    }

    Promise.all([
      safeFetchJson(url),
      safeFetchJson("/api/projects"),
      safeFetchJson("/api/chat/employees"),
      refreshUser().then((user) => ({ success: Boolean(user), data: { user } })),
    ])
      .then(([tasksRes, projRes, empRes, authRes]) => {
        if (authRes && authRes.success && authRes.data?.user) {
          setCurrentUser(authRes.data.user);
        }
        if (tasksRes && tasksRes.success) {
          const rawTasks = Array.isArray(tasksRes.data)
            ? tasksRes.data
            : Array.isArray(tasksRes.data?.tasks)
            ? tasksRes.data.tasks
            : [];
          setTasks(rawTasks);
        }
        if (projRes && projRes.success) {
          const rawProj = Array.isArray(projRes.data)
            ? projRes.data
            : Array.isArray(projRes.data?.projects)
            ? projRes.data.projects
            : [];
          setProjects(rawProj);
          setProjectId((prev) => {
            if (prev && (prev === "OTHER" || rawProj.some((p: any) => p.id === prev))) {
              return prev;
            }
            return rawProj.length > 0 ? rawProj[0].id : "OTHER";
          });
        }
        if (empRes && empRes.success) {
          const rawEmp = Array.isArray(empRes.data?.employees)
            ? empRes.data.employees
            : Array.isArray(empRes.data)
            ? empRes.data
            : [];
          setEmployees(rawEmp);
        }
      })
      .catch((err) => {
        console.error("Authoritative tasks load failed:", err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterTab, selectedEmployeeId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowCreateModal(false);
        setShowEditModal(false);
        setShowStatusModal(false);
        setShowCommentsModal(false);
        setShowAttachmentsModal(false);
        setAuditTarget(null);
        setPendingDeleteTask(null);
      }
    };
    if (showCreateModal || showEditModal || showStatusModal || showCommentsModal || showAttachmentsModal || auditTarget || pendingDeleteTask) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [showCreateModal, showEditModal, showStatusModal, showCommentsModal, showAttachmentsModal, auditTarget, pendingDeleteTask]);

  // Notifications link to /tasks?task=<id>: open that task's history once the list is in.
  useEffect(() => {
    if (deepLinkHandled.current || loading) return;
    const id = new URLSearchParams(window.location.search).get("task");
    if (!id) return;
    deepLinkHandled.current = true;
    const found = tasks.find((x) => x.id === id);
    if (found) {
      setTimelineTask(found);
    } else {
      safeFetchJson(`/api/tasks/${id}`).then((res) => {
        if (res?.success && res.data) setTimelineTask(res.data);
      });
    }
  }, [loading, tasks]);

  const loadComments = (taskId: string) => {
    setCommentsLoading(true);
    safeFetchJson(`/api/tasks/${taskId}/comments`)
      .then((res) => {
        if (res && res.success) {
          setComments(Array.isArray(res.data) ? res.data : []);
        }
      })
      .catch(console.error)
      .finally(() => setCommentsLoading(false));
  };

  const handleOpenComments = (task: any) => {
    setActiveTaskForComments(task);
    setShowCommentsModal(true);
    loadComments(task.id);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTaskForComments || !newCommentContent.trim()) return;

    setCommentSubmitting(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/tasks/${activeTaskForComments.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newCommentContent.trim(),
          type: newCommentType,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNewCommentContent("");
        loadComments(activeTaskForComments.id);
        loadData();
      } else {
        setCommentError(data.error?.message || "Could not post comment. Please try again.");
      }
    } catch {
      setCommentError("Network error while posting comment. Check your connection and try again.");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId || (projects.length > 0 ? projects[0].id : "OTHER"),
          title,
          description: description || undefined,
          priority,
          taskType,
          assigneeUserId: assigneeUserId || undefined,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          reminderAt: reminderAt ? new Date(reminderAt).toISOString() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not create task. Please check the title and try again.");
      } else {
        setStatusMessage("Task created and assigned successfully!");
        setShowCreateModal(false);
        setTitle("");
        setDescription("");
        setDueAt("");
        setReminderAt("");
        setAssigneeUserId("");
        setTaskType("STANDARD");
        setProjectId(projects.length > 0 ? projects[0].id : "OTHER");
        if (data.data) {
          setTasks((prev) => [data.data, ...prev.filter((t) => t.id !== data.data.id)]);
        }
        loadData();
        window.dispatchEvent(new CustomEvent("refreshTasks"));
      }
    } catch {
      setErrorMessage("Network error while creating task. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (task: any) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    setEditPriority(task.priority);
    setEditAssigneeUserId(task.assigneeUserId || "");
    setEditDueAt(task.dueAt ? task.dueAt.slice(0, 10) : "");
    setEditReminderAt(task.reminderAt ? task.reminderAt.slice(0, 16) : "");
    setEditReason("");
    setShowEditModal(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/tasks/${editingTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription || undefined,
          priority: editPriority,
          assigneeUserId: editAssigneeUserId || null,
          dueAt: editDueAt ? new Date(editDueAt).toISOString() : null,
          reminderAt: editReminderAt ? new Date(editReminderAt).toISOString() : null,
          reason: editReason || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not update task. Please check your entries.");
      } else {
        setStatusMessage(`Task "${editTitle}" updated.`);
        setShowEditModal(false);
        setEditingTask(null);
        loadData();
      }
    } catch {
      setErrorMessage("Network error while updating task. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusTask) return;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/tasks/${statusTask.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          note: statusNote || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not update task status. Please try again.");
      } else {
        setStatusMessage(`Task "${statusTask.title}" updated to ${newStatus}.`);
        setShowStatusModal(false);
        setStatusTask(null);
        setStatusNote("");
        loadData();
      }
    } catch {
      setErrorMessage("Network error while updating status. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTask = (id: string, taskTitle: string) => {
    setPendingDeleteTask({ id, title: taskTitle });
  };

  const executeDeleteTask = async () => {
    if (!pendingDeleteTask) return;
    const { id, title: taskTitle } = pendingDeleteTask;
    setDeletingTask(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not delete task. Please try again.");
        setPendingDeleteTask(null);
        return;
      }
      setStatusMessage(`Task "${taskTitle}" deleted.`);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setPendingDeleteTask(null);
      loadData();
    } catch (err: any) {
      setErrorMessage(`Network error while deleting task. Check your connection and try again.${err.message ? ` (${err.message})` : ""}`);
      setPendingDeleteTask(null);
    } finally {
      setDeletingTask(false);
    }
  };

  const isTaskOverdue = (task: any) => {
    if (!task.dueAt) return false;
    if (task.status === "COMPLETED" || task.status === "VERIFIED") return false;
    return new Date(task.dueAt).getTime() < Date.now();
  };

  const availableProjects = useMemo(() => {
    if (!activeSiteId) return projects;
    const siteProjs = projects.filter((p) => p.siteId === activeSiteId);
    return siteProjs.length > 0 ? siteProjs : projects;
  }, [projects, activeSiteId]);

  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const filteredTasks = safeTasks.filter((t) => {
    if (activeSiteId) {
      const taskSiteId = t.project?.siteId || projects.find((p) => p.id === t.projectId)?.siteId;
      if (taskSiteId && taskSiteId !== activeSiteId) return false;
      if (!taskSiteId && t.projectId && t.projectId !== "OTHER" && t.projectId !== activeSiteId) return false;
    }
    return (
      (t.title || "").toLowerCase().includes(search.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(search.toLowerCase())) ||
      (t.assignee?.name && t.assignee.name.toLowerCase().includes(search.toLowerCase())) ||
      (t.project?.name && t.project.name.toLowerCase().includes(search.toLowerCase()))
    );
  });

  const tasksPagination = useTablePagination(filteredTasks);

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader icon={CheckSquare} title="Tasks & Work" subtitle="Assign tasks to staff, track progress with site photos, and mark tasks complete.">

          {canWriteTasks && (
            <button
              onClick={() => {
                setProjectId((prev) => {
                  if (prev && (prev === "OTHER" || availableProjects.some((p: any) => p.id === prev))) {
                    return prev;
                  }
                  return availableProjects.length > 0 ? availableProjects[0].id : "OTHER";
                });
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Create / Assign Task</span>
            </button>
          )}
        </PageHeader>

        {/* Feedback alerts */}
        {statusMessage && <Alert tone="success">{statusMessage}</Alert>}
        {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

        {/* Filter controls */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Top row: Search bar + Employee dropdown */}
          <div className="p-3 sm:p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-100">
            {/* Search bar */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search tasks, descriptions, assignees, projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
              />
            </div>

            {/* Employee dropdown selector */}
            <div className="flex items-center gap-2 shrink-0">
              <User className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block" />
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="w-full sm:w-auto text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">All Employees</option>
                {(Array.isArray(employees) ? employees : []).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bottom row: Status & Priority tabs */}
          <div className="p-2 sm:p-2.5 bg-slate-50/60 flex items-center gap-1.5 overflow-x-auto min-w-0">
            {[
              { id: "all", label: "All Tasks" },
              { id: "pending", label: "Pending" },
              { id: "overdue", label: "Overdue" },
              { id: "completed", label: "Completed" },
              { id: "verified", label: "Verified" },
              { id: "my_tasks", label: "My Tasks" },
              { id: "assigned_by_me", label: "Assigned by Me" },
              { id: "requests", label: "Approval Requests" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                  filterTab === tab.id
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tasks List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-slate-200/60 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <CheckSquare className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <div className="text-sm font-bold text-slate-700">No matching tasks found</div>
            <div className="text-xs text-slate-400 mt-1">
              Create a new task or adjust the filter criteria above.
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 shadow-xs">
              <ShowEntriesControl
                pageSize={tasksPagination.pageSize}
                onPageSizeChange={tasksPagination.setPageSize}
              />
              <span className="text-xs text-slate-500">
                Showing {tasksPagination.startItem} to {tasksPagination.endItem} of {tasksPagination.filteredCount} tasks
              </span>
            </div>
            {tasksPagination.paginatedData.map((t) => {
              const overdue = isTaskOverdue(t);
              const commentCount = t.comments ? t.comments.length : 0;

              return (
                <div
                  key={t.id}
                  className={`bg-white rounded-xl border p-4 shadow-sm hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    overdue ? "border-rose-300 bg-rose-50/20" : "border-slate-200"
                  }`}
                >
                  <div className="space-y-1.5 flex-1">
                    {/* Top Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 border ${
                          t.priority === "CRITICAL"
                            ? "bg-rose-100 text-rose-800 border-rose-300"
                            : t.priority === "HIGH"
                            ? "bg-amber-100 text-amber-800 border-amber-300"
                            : t.priority === "MEDIUM"
                            ? "bg-blue-100 text-blue-800 border-blue-200"
                            : "bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            t.priority === "CRITICAL"
                              ? "bg-rose-600"
                              : t.priority === "HIGH"
                              ? "bg-amber-600"
                              : t.priority === "MEDIUM"
                              ? "bg-blue-600"
                              : "bg-slate-500"
                          }`}
                        />
                        <span>{t.priority}</span>
                      </span>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          t.status === "VERIFIED"
                            ? "bg-indigo-100 text-indigo-800 flex items-center gap-1"
                            : t.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800 flex items-center gap-1"
                            : t.status === "BLOCKED"
                            ? "bg-rose-100 text-rose-800"
                            : t.status === "IN_PROGRESS"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {t.status === "VERIFIED" && <ShieldCheck className="w-3 h-3 inline" />}
                        {t.status === "COMPLETED" && <CheckCircle2 className="w-3 h-3 inline" />}
                        {t.status.replace("_", " ")}
                      </span>

                      {t.taskType && t.taskType !== "STANDARD" && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800 uppercase tracking-wider">
                          {t.taskType.replace("REQUEST_", "REQ: ")}
                        </span>
                      )}

                      {overdue && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-600 text-white uppercase tracking-wider animate-pulse flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 inline" />
                          OVERDUE
                        </span>
                      )}

                      <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                        <Building className="w-3 h-3 text-slate-400" />
                        {t.project?.name || "General"}
                      </span>
                    </div>

                    {/* Title & Description */}
                    <h3 className="font-bold text-slate-900 text-base leading-snug">{t.title}</h3>
                    {t.description && (
                      <p className="text-xs text-slate-600 line-clamp-2">{t.description}</p>
                    )}

                    {/* Metadata strip: Assigned by, Assignee, Dates, Verification */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 pt-1">
                      {t.creator && (
                        <span className="flex items-center gap-1">
                          <span className="text-slate-400">By:</span>
                          <span className="font-semibold text-slate-700">{t.creator.name}</span>
                          <span className="text-[10px] text-slate-400">({t.creator.role})</span>
                        </span>
                      )}

                      {t.assignee ? (
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-slate-400">To:</span>
                          <span className="font-semibold text-slate-800">{t.assignee.name}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}

                      {t.dueAt && (
                        <span
                          className={`flex items-center gap-1 font-mono text-[11px] ${
                            overdue ? "text-rose-600 font-bold" : ""
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>Due: {formatDate(t.dueAt)}</span>
                        </span>
                      )}

                      {t.completedAt && (
                        <span className="flex items-center gap-1 text-emerald-700 font-medium text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Done: {formatDate(t.completedAt)}</span>
                          {t.completedBy && <span>by {t.completedBy.name}</span>}
                        </span>
                      )}

                      {t.verifiedAt && (
                        <span className="flex items-center gap-1 text-indigo-700 font-medium text-[11px]">
                          <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Verified: {formatDate(t.verifiedAt)}</span>
                          {t.verifiedBy && <span>by {t.verifiedBy.name}</span>}
                        </span>
                      )}

                      {t.reminderAt && (
                        <span className="flex items-center gap-1 text-amber-700 text-[11px]">
                          <Calendar className="w-3.5 h-3.5 text-amber-500" />
                          <span>Reminder: {formatDate(t.reminderAt)}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Right Side */}
                  <div className="shrink-0 flex flex-wrap items-center gap-2 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
                    {/* Status Update Button */}
                    {canWriteTasks && (
                      <button
                        onClick={() => {
                          setStatusTask(t);
                          setNewStatus(
                            t.status === "TODO"
                              ? "IN_PROGRESS"
                              : t.status === "IN_PROGRESS"
                              ? "COMPLETED"
                              : t.status === "COMPLETED"
                              ? "VERIFIED"
                              : "COMPLETED"
                          );
                          setShowStatusModal(true);
                        }}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-sm transition"
                      >
                        Status
                      </button>
                    )}

                    {/* Commit-style history with photos */}
                    <button
                      onClick={() => setTimelineTask(t)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-xs transition"
                      title="Task history, progress updates & photos"
                    >
                      <GitCommitHorizontal className="w-3.5 h-3.5" />
                      <span>History</span>
                    </button>

                    {/* Photographs & Attachments */}
                    <button
                      onClick={() => {
                        setActiveTaskForAttachments(t);
                        setShowAttachmentsModal(true);
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                      title="Photographs & Attachments"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>

                    {/* Edit Task */}
                    {canWriteTasks && (
                      <button
                        onClick={() => handleOpenEdit(t)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                        title="Edit Task Details"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}

                    {/* Delete Task */}
                    {canWriteTasks && (
                      <button
                        onClick={() => handleDeleteTask(t.id, t.title)}
                        title="Delete Task"
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <TablePagination
                currentPage={tasksPagination.currentPage}
                totalPages={tasksPagination.totalPages}
                totalItems={tasksPagination.filteredCount}
                totalUnfiltered={tasksPagination.totalRecords}
                pageSize={tasksPagination.pageSize}
                startItem={tasksPagination.startItem}
                endItem={tasksPagination.endItem}
                onPageChange={tasksPagination.setCurrentPage}
                itemLabel="tasks"
              />
            </div>
          </div>
        )}

        {/* Modal: Create Task */}
        {showCreateModal && canWriteTasks && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in">
              <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-100 shrink-0 bg-white">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-amber-500" />
                  <span>Create / Assign Site Task</span>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="create-task-modal-form" onSubmit={handleCreateTask} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Target Project
                  </label>
                  <SearchableSelect
                    options={[
                      ...availableProjects.map((p: any) => ({
                        value: p.id,
                        label: p.name,
                        badge: p.code || undefined,
                        subLabel: p.site?.name || p.siteName || undefined,
                      })),
                      {
                        value: "OTHER",
                        label: "Other / General Operations",
                        subLabel: availableProjects.length === 0 ? "Default Site" : "Not site-specific",
                      },
                    ]}
                    value={projectId || (availableProjects.length > 0 ? availableProjects[0].id : "OTHER")}
                    onChange={(val) => setProjectId(val)}
                    searchPlaceholder="Search project by name or code..."
                  />
                  {availableProjects.length === 0 ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      No project-specific site assigned. Task will be logged under General Site Operations.
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400">
                      Select specific project or choose &apos;Other / General Operations&apos; for unlinked tasks.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Task Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Tie rebar on 6th floor columns / Submit electrical drawings"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Description & Specifications
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Provide execution details, materials required, and safety instructions..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Task Type
                    </label>
                    <select
                      value={taskType}
                      onChange={(e: any) => setTaskType(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      <option value="STANDARD">Standard Task</option>
                      <option value="PERSONAL">Personal Task (My Todo)</option>
                      <option value="REQUEST_OWNER">Raise Request for Owner</option>
                      <option value="REQUEST_MANAGER">Raise Request for Manager</option>
                      <option value="REQUEST_ARCHITECT">Raise Request for Architect</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Assign To Employee
                    </label>
                    <select
                      value={assigneeUserId}
                      onChange={(e) => setAssigneeUserId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      <option value="">Unassigned / Current User</option>
                      {(Array.isArray(employees) ? employees : []).map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.role})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Priority
                    </label>
                    <select
                      value={priority}
                      onChange={(e: any) => setPriority(e.target.value)}
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
                      value={dueAt}
                      onChange={(e) => setDueAt(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Reminder
                    </label>
                    <input
                      type="datetime-local"
                      value={reminderAt}
                      onChange={(e) => setReminderAt(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
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
                  form="create-task-modal-form"
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 transition"
                >
                  {submitting ? "Creating..." : "Create Task"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Edit Task */}
        {showEditModal && editingTask && canWriteTasks && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in">
              <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-100 shrink-0 bg-white">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-amber-500" />
                  <span>Edit Task</span>
                </div>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="edit-task-modal-form" onSubmit={handleSaveEdit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Task Title
                  </label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Description & Specifications
                  </label>
                  <textarea
                    rows={3}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Priority
                    </label>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value)}
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
                      Assignee
                    </label>
                    <select
                      value={editAssigneeUserId}
                      onChange={(e) => setEditAssigneeUserId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      <option value="">Unassigned</option>
                      {(Array.isArray(employees) ? employees : []).map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.role})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={editDueAt}
                      onChange={(e) => setEditDueAt(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Reminder
                    </label>
                    <input
                      type="datetime-local"
                      value={editReminderAt}
                      onChange={(e) => setEditReminderAt(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Reason for Change (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Due date extension granted by structural consultant"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

              </form>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="edit-task-modal-form"
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 transition"
                >
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Update Status */}
        {showStatusModal && statusTask && canWriteTasks && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-amber-500" />
                  <span>Update Task Progress</span>
                </div>
                <button
                  onClick={() => setShowStatusModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs mb-4">
                Task: <span className="font-bold text-slate-900">{statusTask.title}</span>
              </div>

              <form onSubmit={handleUpdateStatus} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Select New Status
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    <option value="TODO">To Do</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="BLOCKED">Blocked (Needs Help)</option>
                    <option value="COMPLETED">Completed (Waiting for Review)</option>
                    <option value="VERIFIED">Verified (Approved)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Progress Note / Verification Comment
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Shuttering complete, inspection approved by site engineer"
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowStatusModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {submitting ? "Updating..." : "Save Progress"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Task Comments, Follow-up Questions & Assistance Requests */}
        {showCommentsModal && activeTaskForComments && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[85dvh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-amber-500" />
                  <span>Task Discussion & Assistance Requests</span>
                </div>
                <button
                  onClick={() => setShowCommentsModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs mb-3">
                <div className="font-bold text-slate-900">{activeTaskForComments.title}</div>
                <div className="text-slate-500 mt-0.5">Project: {activeTaskForComments.project?.name}</div>
              </div>

              {/* Comments Stream */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[180px] max-h-[350px]">
                {commentsLoading ? (
                  <div className="text-center py-6 text-xs text-slate-400">Loading discussion...</div>
                ) : comments.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    No comments or requests yet. Post a question or note below.
                  </div>
                ) : (
                  (Array.isArray(comments) ? comments : []).map((c) => (
                    <div
                      key={c.id}
                      className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                        c.type === "ASSISTANCE_REQUEST"
                          ? "bg-rose-50 border-rose-200 text-rose-950"
                          : c.type === "QUESTION"
                          ? "bg-amber-50 border-amber-200 text-amber-950"
                          : "bg-slate-50 border-slate-200 text-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{c.user?.name || "User"}</span>
                          <span className="text-[10px] text-slate-500">({c.user?.role || "Team"})</span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              c.type === "ASSISTANCE_REQUEST"
                                ? "bg-rose-200 text-rose-900"
                                : c.type === "QUESTION"
                                ? "bg-amber-200 text-amber-900"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {c.type === "ASSISTANCE_REQUEST"
                              ? "Need Assistance"
                              : c.type === "QUESTION"
                              ? "Question"
                              : "Note"}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">{formatDate(c.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{c.content}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Post comment input */}
              {commentError && (
                <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center justify-between gap-2">
                  <span>{commentError}</span>
                  <button type="button" onClick={() => setCommentError(null)} className="text-rose-600 hover:text-rose-800 p-0.5 shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <form onSubmit={handleAddComment} className="pt-3 border-t border-slate-100 mt-3 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">Type:</span>
                  <div className="flex flex-wrap items-center gap-1">
                    {[
                      { id: "COMMENT", label: "Note / Update" },
                      { id: "QUESTION", label: "Follow-up Question" },
                      { id: "ASSISTANCE_REQUEST", label: "Request Assistance" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setNewCommentType(t.id as any)}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold transition ${
                          newCommentType === t.id
                            ? "bg-slate-900 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    required
                    placeholder="Type a comment, question or assistance request..."
                    value={newCommentContent}
                    onChange={(e) => setNewCommentContent(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={commentSubmitting}
                    className="self-end px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-1"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Photographs & Attachments */}
        {showAttachmentsModal && activeTaskForAttachments && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[85dvh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Paperclip className="w-5 h-5 text-amber-500" />
                  <span>Task Photographs & Documents</span>
                </div>
                <button
                  onClick={() => setShowAttachmentsModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs mb-4">
                Task: <span className="font-bold text-slate-900">{activeTaskForAttachments.title}</span>
              </div>

              <div className="flex-1 overflow-y-auto">
                <AttachmentManager
                  entityType="TASK"
                  entityId={activeTaskForAttachments.id}
                  projectId={activeTaskForAttachments.projectId}
                  title="Task Attachments"
                  allowUpload={true}
                  categoryDefault="PHOTO"
                />
              </div>
            </div>
          </div>
        )}

        {timelineTask && (
          <TaskTimeline
            task={timelineTask}
            canWrite={canWriteTasks}
            onClose={() => {
              setTimelineTask(null);
              if (window.location.search.includes("task=")) window.history.replaceState(null, "", "/tasks");
            }}
            onChanged={loadData}
          />
        )}

        {/* Modal: Confirm Task Delete */}
        {pendingDeleteTask && (
          <div
            className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
            onClick={() => setPendingDeleteTask(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto space-y-3 animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="font-bold text-slate-900 text-base">Delete Task?</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to delete task <strong className="text-slate-900">{pendingDeleteTask.title}</strong>?
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPendingDeleteTask(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingTask}
                  onClick={executeDeleteTask}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg disabled:opacity-50"
                >
                  {deletingTask ? "Deleting..." : "Delete Task"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Audit History */}
        {auditTarget && (
          <AuditHistoryModal
            entityType="TASK"
            entityId={auditTarget.id}
            title={`Change History: ${auditTarget.title}`}
            onClose={() => setAuditTarget(null)}
          />
        )}
      </div>
    </Shell>
  );
}
