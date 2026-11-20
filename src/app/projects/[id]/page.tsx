"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Shell from "@/components/layout/Shell";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import { formatCurrency, formatCompactINR, formatCompactNumber, formatDate } from "@/lib/formatters";
import { istDateKey } from "@/lib/ist-date";
import {
  TASK_PRIORITY_OPTIONS,
  formatPriorityLabel,
  getAutoReminderMessage,
  normalizePriority,
} from "@/lib/task-reminder";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, TablePagination, ExcelColumn } from "@/components/ui/ExcelTable";
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
  Paperclip,
  FolderPlus,
  Folder,
  FolderOpen,
  Edit2,
  History,
  FileText,
  Flag,
  IndianRupee,
  Bell,
  Tag,
  UserCheck,
  Layers,
  Users,
  Eye,
  Download,
  ExternalLink,
  Search,
  Filter,
  Check,
  Receipt,
  CreditCard,
  FileSpreadsheet,
  FilePlus2,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";
import AttachmentManager from "@/components/attachments/AttachmentManager";
import AuditHistoryModal from "@/components/audit/AuditHistoryModal";
import ProjectBudget from "@/components/projects/ProjectBudget";
import ProjectMilestones from "@/components/projects/ProjectMilestones";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { FileUpload } from "@/components/ui/FileUpload";
import { canUser } from "@/lib/permissions";

const DRAWING_DISCIPLINES: Record<string, { label: string; dot: string; pill: string }> = {
  ARCHITECTURAL: { label: "Architectural", dot: "bg-amber-500", pill: "bg-amber-50 text-amber-800 border-amber-200" },
  STRUCTURAL: { label: "Structural", dot: "bg-blue-500", pill: "bg-blue-50 text-blue-800 border-blue-200" },
  ELECTRICAL: { label: "Electrical", dot: "bg-yellow-400", pill: "bg-yellow-50 text-yellow-800 border-yellow-200" },
  PLUMBING: { label: "Plumbing", dot: "bg-cyan-500", pill: "bg-cyan-50 text-cyan-800 border-cyan-200" },
  HVAC: { label: "HVAC", dot: "bg-violet-500", pill: "bg-violet-50 text-violet-800 border-violet-200" },
  LANDSCAPE: { label: "Landscape", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  OTHER: { label: "Other", dot: "bg-slate-400", pill: "bg-slate-50 text-slate-800 border-slate-200" },
};

const DRAWING_STATUS: Record<string, { label: string; pill: string }> = {
  FOR_APPROVAL: { label: "For Approval", pill: "bg-amber-50 text-amber-800 border-amber-200" },
  APPROVED: { label: "Approved", pill: "bg-blue-50 text-blue-700 border-blue-200" },
  GFC: { label: "Good for Construction", pill: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  SUPERSEDED: { label: "Superseded", pill: "bg-slate-100 text-slate-500 border-slate-200" },
  REJECTED: { label: "Sent Back", pill: "bg-rose-50 text-rose-700 border-rose-200" },
};

export default function ProjectDetailsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"PROGRESS" | "BUDGET" | "FINANCE" | "TASKS" | "MATERIALS" | "REPORTS" | "DOCUMENTS" | "WORKFORCE" | "DRAWINGS">("TASKS");
  const [financeSubTab, setFinanceSubTab] = useState<"BILLS" | "PAYMENTS" | "BUDGET">("BILLS");
  const [billSearch, setBillSearch] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>("ALL");
  const [headcountSearch, setHeadcountSearch] = useState("");
  const [headcountDateFilter, setHeadcountDateFilter] = useState("");
  const [drawingSearch, setDrawingSearch] = useState("");
  const [drawingDisciplineFilter, setDrawingDisciplineFilter] = useState<string>("ALL");

  const { refreshUser } = useAppSession();
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab")?.toUpperCase();
    if (tab === "BUDGET") setActiveTab("FINANCE");
    else if (tab && ["PROGRESS", "BUDGET", "FINANCE", "TASKS", "MATERIALS", "REPORTS", "DOCUMENTS", "WORKFORCE", "DRAWINGS"].includes(tab)) {
      setActiveTab(tab as any);
    }
    refreshUser()
      .then((u) => setCurrentUser(u || null))
      .catch(() => {});
    fetch("/api/chat/employees")
      .then((r) => r.json())
      .then((j) => {
        const raw = Array.isArray(j?.data?.employees)
          ? j.data.employees
          : Array.isArray(j?.data)
          ? j.data
          : [];
        setEmployees(raw);
      })
      .catch(() => {});
  }, [refreshUser]);

  // Dynamic Modals
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPriority, setTaskPriority] = useState<string>("DAILY");
  const [taskAssigneeId, setTaskAssigneeId] = useState("");
  const [taskTrade, setTaskTrade] = useState("");
  const [taskDueDate, setTaskDueDate] = useState(() => istDateKey());
  const [employees, setEmployees] = useState<any[]>([]);

  // Drawing Modal State
  const [showDrawingModal, setShowDrawingModal] = useState(false);
  const [drawingNumber, setDrawingNumber] = useState("");
  const [drawingTitle, setDrawingTitle] = useState("");
  const [drawingDiscipline, setDrawingDiscipline] = useState("ARCHITECTURAL");
  const [drawingNotes, setDrawingNotes] = useState("");
  const [drawingFile, setDrawingFile] = useState<{ url: string; name: string } | null>(null);

  // Workforce Headcount Modal State
  const [showHeadcountModal, setShowHeadcountModal] = useState(false);
  const [hcDate, setHcDate] = useState(() => istDateKey());
  const [hcShift, setHcShift] = useState<"GENERAL" | "DAY" | "NIGHT">("GENERAL");
  const [hcSource, setHcSource] = useState<"CONTRACTOR" | "DIRECT">("CONTRACTOR");
  const [hcContractor, setHcContractor] = useState("");
  const [hcArtisans, setHcArtisans] = useState<number>(0);
  const [hcLaborerMale, setHcLaborerMale] = useState<number>(0);
  const [hcLaborerFemale, setHcLaborerFemale] = useState<number>(0);
  const [hcNotes, setHcNotes] = useState("");

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportDate, setReportDate] = useState(() => istDateKey());
  const [reportProgress, setReportProgress] = useState("");
  const [reportBlockers, setReportBlockers] = useState("");
  const [reportSafetyNotes, setReportSafetyNotes] = useState("");

  // Edit Project Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editBudget, setEditBudget] = useState("");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [editReason, setEditReason] = useState("");

  // Folders state (Priority 7)
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDesc, setNewFolderDesc] = useState("");

  // Audit Modal state
  const [showAuditModal, setShowAuditModal] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!(showTaskModal || showReportModal || showEditModal || showFolderModal || showAuditModal || showDrawingModal || showHeadcountModal)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowTaskModal(false);
        setShowReportModal(false);
        setShowEditModal(false);
        setShowFolderModal(false);
        setShowAuditModal(false);
        setShowDrawingModal(false);
        setShowHeadcountModal(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showTaskModal, showReportModal, showEditModal, showFolderModal, showAuditModal, showDrawingModal, showHeadcountModal]);

  const loadProject = () => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch(`/api/projects/${projectId}/folders`).then((r) => r.json()).catch(() => ({ success: false })),
    ])
      .then(([projRes, foldRes]) => {
        if (projRes.success && projRes.data) {
          setProject(projRes.data);
          setEditName(projRes.data.name);
          setEditDescription(projRes.data.description || "");
          setEditBudget(projRes.data.budgetAmount ? String(projRes.data.budgetAmount / 100) : "");
          setEditStatus(projRes.data.status || "ACTIVE");
        } else {
          setProject(null);
        }
        if (foldRes.success && foldRes.data) {
          setFolders(foldRes.data);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !project || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      let finalDescription = taskDescription.trim();
      if (taskTrade) {
        finalDescription = finalDescription
          ? `[Trade/Category: ${taskTrade}]\n${finalDescription}`
          : `[Trade/Category: ${taskTrade}]`;
      }

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          title: taskTitle.trim(),
          description: finalDescription || undefined,
          priority: taskPriority,
          assigneeUserId: taskAssigneeId || undefined,
          dueAt: taskDueDate ? new Date(taskDueDate).toISOString() : new Date().toISOString(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not create task. Please check the title and try again.");
        return;
      }

      setStatusMessage(`Task "${data.data.title}" added to project!`);
      setShowTaskModal(false);
      setTaskTitle("");
      setTaskDescription("");
      setTaskPriority("DAILY");
      setTaskAssigneeId("");
      setTaskTrade("");
      setTaskDueDate(istDateKey());
      loadProject();
    } catch (err: any) {
      setErrorMessage(`Network error while creating task. Check your connection and try again.${err.message ? ` (${err.message})` : ""}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !project) return;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/projects/${project.id}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFolderName.trim(),
          description: newFolderDesc.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not create folder. Please try again.");
      } else {
        setStatusMessage(`Folder "${newFolderName}" created!`);
        setShowFolderModal(false);
        setNewFolderName("");
        setNewFolderDesc("");
        // Reload folders
        const foldRes = await fetch(`/api/projects/${project.id}/folders`).then((r) => r.json());
        if (foldRes.success) setFolders(foldRes.data || []);
      }
    } catch {
      setErrorMessage("Network error while creating folder. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        setErrorMessage(d.error?.message || "Failed to update task status");
        return;
      }
      setStatusMessage(`Task marked as ${newStatus.replace(/_/g, " ")}`);
      loadProject();
    } catch {
      setErrorMessage("Failed to update task status");
    }
  };

  const handleCreateDrawing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawingNumber.trim() || !drawingTitle.trim() || !project || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/drawings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          number: drawingNumber.trim().toUpperCase(),
          title: drawingTitle.trim(),
          discipline: drawingDiscipline,
          fileUrl: drawingFile?.url || null,
          fileName: drawingFile?.name || null,
          notes: drawingNotes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not add drawing. Please check the details.");
        return;
      }

      setStatusMessage(`Drawing ${drawingNumber.trim().toUpperCase()} added successfully.`);
      setShowDrawingModal(false);
      setDrawingNumber("");
      setDrawingTitle("");
      setDrawingDiscipline("ARCHITECTURAL");
      setDrawingNotes("");
      setDrawingFile(null);
      loadProject();
    } catch (err: any) {
      setErrorMessage(err.message || "Network error while saving drawing.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateHeadcount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/workforce/headcount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: project.siteId,
          projectId: project.id,
          date: hcDate,
          shift: hcShift,
          source: hcSource,
          contractorName: hcContractor.trim() || (hcSource === "DIRECT" ? "Direct Site Labor" : "Contractor Team"),
          artisanCount: Number(hcArtisans) || 0,
          laborerMale: Number(hcLaborerMale) || 0,
          laborerFemale: Number(hcLaborerFemale) || 0,
          notes: hcNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not log workforce count. Please try again.");
        return;
      }

      const totalLogged = (Number(hcArtisans) || 0) + (Number(hcLaborerMale) || 0) + (Number(hcLaborerFemale) || 0);
      setStatusMessage(`Logged workforce headcount (${totalLogged} workers) on ${hcDate}.`);
      setShowHeadcountModal(false);
      setHcArtisans(0);
      setHcLaborerMale(0);
      setHcLaborerFemale(0);
      setHcNotes("");
      setHcContractor("");
      loadProject();
    } catch (err: any) {
      setErrorMessage(err.message || "Network error while saving headcount.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          description: editDescription || undefined,
          budgetAmount: editBudget ? Math.round(parseFloat(editBudget) * 100) : undefined,
          status: editStatus,
          reason: editReason || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not save project changes. Please check your entries.");
      } else {
        setStatusMessage(`Project "${editName}" updated successfully.`);
        setShowEditModal(false);
        loadProject();
      }
    } catch {
      setErrorMessage("Network error while updating project. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const stockMovements = useMemo(() => project?.stockMovements || [], [project]);

  const movementColumns: ExcelColumn<any>[] = useMemo(
    () => [
      { key: "movementAt", label: "Date", accessor: (m) => formatDate(m.movementAt), type: "date" },
      { key: "material", label: "Material", accessor: (m) => m.material?.name || "Material", type: "text" },
      { key: "quantity", label: "Quantity Provided to Contractor", accessor: (m) => `${Math.abs(m.quantityDelta)} ${m.unitCode || ""}`, type: "text", align: "right" },
      { key: "store", label: "Store", accessor: (m) => m.store?.name || "Store", type: "text" },
      { key: "notes", label: "Notes", accessor: (m) => m.notes || "—", type: "text" },
    ],
    []
  );

  const excelMovements = useExcelTable({
    data: stockMovements,
    columns: movementColumns,
  });

  const dailyReports = project?.dailyReports || [];
  const reportColumns: ExcelColumn<any>[] = useMemo(
    () => [
      { key: "reportDate", label: "Date", accessor: (r) => formatDate(r.reportDate), type: "date" },
      { key: "creator", label: "Reported By", accessor: (r) => `${r.creator?.name || "Staff"} (${r.creator?.role || "Site"})`, type: "text" },
      { key: "progress", label: "Progress Summary", accessor: (r) => r.progress || "—", type: "text" },
      { key: "blockers", label: "Issues / Blockers", accessor: (r) => r.blockers || "None", type: "text" },
      { key: "safetyNotes", label: "Safety Notes", accessor: (r) => r.safetyNotes || "None", type: "text" },
    ],
    []
  );

  const excelReports = useExcelTable({
    data: dailyReports,
    columns: reportColumns,
  });

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportProgress.trim()) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/daily-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          reportDate,
          progress: reportProgress.trim(),
          blockers: reportBlockers.trim() || undefined,
          safetyNotes: reportSafetyNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to create daily site report");
      }
      setStatusMessage("Daily site report submitted successfully.");
      setShowReportModal(false);
      setReportProgress("");
      setReportBlockers("");
      setReportSafetyNotes("");
      loadProject();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to submit daily report");
    } finally {
      setSubmitting(false);
    }
  };

  const tasks = useMemo(() => project?.tasks || [], [project]);
  const bills = useMemo(() => project?.bills || [], [project]);
  const payments = useMemo(() => project?.payments || [], [project]);
  const headcounts = useMemo(() => project?.headcounts || [], [project]);
  const drawings = useMemo(() => project?.drawings || [], [project]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t: any) => {
      if (taskStatusFilter === "CRITICAL") {
        if (normalizePriority(t.priority) !== "CRITICAL") return false;
      } else if (taskStatusFilter === "COMPLETED") {
        if (t.status !== "COMPLETED" && t.status !== "VERIFIED") return false;
      } else if (taskStatusFilter !== "ALL" && t.status !== taskStatusFilter) {
        return false;
      }
      if (taskSearch.trim()) {
        const q = taskSearch.toLowerCase();
        const matchTitle = t.title?.toLowerCase().includes(q);
        const matchDesc = t.description?.toLowerCase().includes(q);
        const matchAssignee = t.assignee?.name?.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchAssignee) return false;
      }
      return true;
    });
  }, [tasks, taskStatusFilter, taskSearch]);

  const filteredBills = useMemo(() => {
    if (!billSearch.trim()) return bills;
    const q = billSearch.toLowerCase();
    return bills.filter(
      (b: any) =>
        b.billNumber?.toLowerCase().includes(q) ||
        b.party?.name?.toLowerCase().includes(q) ||
        b.costHead?.toLowerCase().includes(q) ||
        b.status?.toLowerCase().includes(q)
    );
  }, [bills, billSearch]);

  const filteredPayments = useMemo(() => {
    if (!paymentSearch.trim()) return payments;
    const q = paymentSearch.toLowerCase();
    return payments.filter(
      (p: any) =>
        p.referenceNumber?.toLowerCase().includes(q) ||
        p.party?.name?.toLowerCase().includes(q) ||
        p.recipientName?.toLowerCase().includes(q) ||
        p.payingAccount?.toLowerCase().includes(q) ||
        p.method?.toLowerCase().includes(q) ||
        p.status?.toLowerCase().includes(q)
    );
  }, [payments, paymentSearch]);

  const filteredHeadcounts = useMemo(() => {
    return headcounts.filter((h: any) => {
      if (headcountDateFilter && h.date !== headcountDateFilter) return false;
      if (headcountSearch.trim()) {
        const q = headcountSearch.toLowerCase();
        const matchContractor = h.contractorName?.toLowerCase().includes(q);
        const matchSource = h.source?.toLowerCase().includes(q);
        const matchNotes = h.notes?.toLowerCase().includes(q);
        const matchSupervisor = h.supervisorName?.toLowerCase().includes(q);
        if (!matchContractor && !matchSource && !matchNotes && !matchSupervisor) return false;
      }
      return true;
    });
  }, [headcounts, headcountSearch, headcountDateFilter]);

  const filteredDrawings = useMemo(() => {
    return drawings.filter((d: any) => {
      if (drawingDisciplineFilter !== "ALL" && d.discipline !== drawingDisciplineFilter) return false;
      if (drawingSearch.trim()) {
        const q = drawingSearch.toLowerCase();
        const matchNumber = d.number?.toLowerCase().includes(q);
        const matchTitle = d.title?.toLowerCase().includes(q);
        if (!matchNumber && !matchTitle) return false;
      }
      return true;
    });
  }, [drawings, drawingDisciplineFilter, drawingSearch]);

  if (loading) {
    return (
      <Shell>
        <div className="space-y-4">
          <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

  const budget = project.financials?.budgetAmount || project.budgetAmount || 0;
  const billed = project.financials?.totalBilled || 0;
  const budgetUtilization = budget > 0 ? Math.min(100, Math.round((billed / budget) * 100)) : 0;
  const canSeeMoney = canUser(currentUser, "finance:read");

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
              <h1 className="font-display text-xl sm:text-[26px] font-extrabold text-slate-900 tracking-tight mt-1 flex items-center gap-2">
                {project.name}
              </h1>
              <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
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

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowEditModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-sm transition-all"
              title="Edit Project Details"
            >
              <Edit2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Edit</span>
            </button>
            <button
              onClick={() => setShowAuditModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-sm transition-all"
              title="View Change History"
            >
              <History className="w-3.5 h-3.5 text-indigo-600" />
              <span>History</span>
            </button>
            <button
              onClick={() => setShowTaskModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Task</span>
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
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="p-0.5 text-rose-600 hover:text-rose-800">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Financial & Operational KPI Cards */}
        <div className={`grid grid-cols-2 gap-4 ${canSeeMoney ? "lg:grid-cols-4" : ""}`}>
          {canSeeMoney && (
            <>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Project Budget
            </span>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums tracking-tight leading-tight truncate">
              <span title={formatCurrency(budget)}>{formatCompactINR(budget)}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Approved financial allocation</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Billed
            </span>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-amber-600 mt-1 tabular-nums tracking-tight leading-tight truncate">
              <span title={formatCurrency(billed)}>{formatCompactINR(billed)}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {project.bills?.length || 0} posted vendor/sub bills
            </div>
          </div>

            </>
          )}

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Active Tasks
            </span>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums tracking-tight leading-tight truncate">
              <span title={String(project.tasks?.length || 0)}>{formatCompactNumber(project.tasks?.length || 0)}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Milestones & work orders</div>
          </div>
        </div>

        {/* Budget Progress Indicator */}
        {canSeeMoney && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Budget used: {budgetUtilization}% billed so far</span>
            <span className="tabular-nums whitespace-nowrap" title={`${formatCurrency(billed)} of ${formatCurrency(budget)}`}>
              {formatCompactINR(billed)} of {formatCompactINR(budget)}
            </span>
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
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 border-b border-slate-200 overflow-x-auto pb-px">
          <button
            onClick={() => setActiveTab("TASKS")}
            className={`flex items-center gap-2 px-3.5 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
              activeTab === "TASKS"
                ? "border-amber-600 text-amber-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <CheckSquare className="w-4 h-4 text-amber-500" />
            <span>Tasks & Work ({project.tasks?.length || 0})</span>
          </button>

          {canSeeMoney && (
            <button
              onClick={() => setActiveTab("FINANCE")}
              className={`flex items-center gap-2 px-3.5 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
                activeTab === "FINANCE" || activeTab === "BUDGET"
                  ? "border-amber-600 text-amber-700"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <IndianRupee className="w-4 h-4 text-emerald-600" />
              <span>Payments & Bills ({(project.bills?.length || 0) + (project.payments?.length || 0)})</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab("WORKFORCE")}
            className={`flex items-center gap-2 px-3.5 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
              activeTab === "WORKFORCE"
                ? "border-amber-600 text-amber-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <HardHat className="w-4 h-4 text-amber-500" />
            <span>Site Workers & Headcount ({project.headcounts?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("DRAWINGS")}
            className={`flex items-center gap-2 px-3.5 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
              activeTab === "DRAWINGS"
                ? "border-amber-600 text-amber-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <FolderKanban className="w-4 h-4 text-blue-500" />
            <span>Drawings & Plans ({project.drawings?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("PROGRESS")}
            className={`flex items-center gap-2 px-3.5 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
              activeTab === "PROGRESS"
                ? "border-amber-600 text-amber-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <Flag className="w-4 h-4" />
            <span>Progress & Stages</span>
          </button>

          <button
            onClick={() => setActiveTab("MATERIALS")}
            className={`flex items-center gap-2 px-3.5 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
              activeTab === "MATERIALS"
                ? "border-amber-600 text-amber-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Material Consumption ({project.stockMovements?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("REPORTS")}
            className={`flex items-center gap-2 px-3.5 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
              activeTab === "REPORTS"
                ? "border-amber-600 text-amber-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Daily Site Reports ({dailyReports.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("DOCUMENTS")}
            className={`flex items-center gap-2 px-3.5 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
              activeTab === "DOCUMENTS"
                ? "border-amber-600 text-amber-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <FolderOpen className="w-4 h-4 text-amber-500" />
            <span>Documents & Folders</span>
          </button>
        </div>

        {/* Tab 1: Tasks & Work */}
        {activeTab === "TASKS" && (
          <div className="space-y-4">
            {/* Header with Search and Filters */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <CheckSquare className="w-5 h-5 text-amber-500" />
                    <span>Project Tasks & Work Orders</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Action items, construction work assignments, quality milestones, and trade tickets.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTaskModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Task</span>
                </button>
              </div>

              {/* Status filter pills & Search */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {[
                    { id: "ALL", label: `All (${tasks.length})` },
                    { id: "TODO", label: `To Do (${tasks.filter((t: any) => t.status === "TODO").length})` },
                    { id: "IN_PROGRESS", label: `In Progress (${tasks.filter((t: any) => t.status === "IN_PROGRESS").length})` },
                    { id: "CRITICAL", label: `Critical (${tasks.filter((t: any) => normalizePriority(t.priority) === "CRITICAL").length})` },
                    { id: "COMPLETED", label: `Completed (${tasks.filter((t: any) => t.status === "COMPLETED" || t.status === "VERIFIED").length})` },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => setTaskStatusFilter(filter.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                        taskStatusFilter === filter.id
                          ? "bg-slate-900 text-white shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <div className="relative min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    placeholder="Search tasks, trades, assignees..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  {taskSearch && (
                    <button
                      onClick={() => setTaskSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Task list container */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {filteredTasks.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <CheckSquare className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <div className="text-sm font-bold text-slate-700">No tasks found</div>
                  <p className="text-xs text-slate-400 mt-1">
                    {taskSearch || taskStatusFilter !== "ALL"
                      ? "No tasks match your filter criteria."
                      : "Create your first task or milestone for this project."}
                  </p>
                  <button
                    onClick={() => setShowTaskModal(true)}
                    className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Task</span>
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredTasks.map((task: any) => {
                    const isDone = task.status === "COMPLETED" || task.status === "VERIFIED";
                    const isOverdue = task.dueAt && new Date(task.dueAt).getTime() < Date.now() && !isDone;
                    return (
                      <div
                        key={task.id}
                        className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition ${
                          isDone ? "bg-slate-50/40" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleUpdateTaskStatus(task.id, isDone ? "TODO" : "COMPLETED")}
                            title={isDone ? "Mark as To Do" : "Mark as Completed"}
                            className="mt-0.5 shrink-0 focus:outline-none"
                          >
                            {isDone ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-600 hover:text-emerald-700 transition" />
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 transition" />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`text-sm font-bold tracking-tight text-slate-900 ${
                                  isDone ? "line-through text-slate-400" : ""
                                }`}
                              >
                                {task.title}
                              </span>
                              <span
                                className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 border ${
                                  normalizePriority(task.priority) === "CRITICAL"
                                    ? "bg-rose-100 text-rose-800 border-rose-300"
                                    : normalizePriority(task.priority) === "GENERAL"
                                    ? "bg-sky-100 text-sky-800 border-sky-300"
                                    : "bg-amber-100 text-amber-800 border-amber-300"
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    normalizePriority(task.priority) === "CRITICAL"
                                      ? "bg-rose-600"
                                      : normalizePriority(task.priority) === "GENERAL"
                                      ? "bg-sky-600"
                                      : "bg-amber-600"
                                  }`}
                                />
                                <span>{formatPriorityLabel(task.priority)}</span>
                              </span>
                            </div>

                            {task.description && (
                              <div className="text-xs text-slate-600 mt-1 line-clamp-2">
                                {task.description}
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3 text-slate-400" />
                                <span>{task.assignee?.name || "Unassigned"}</span>
                              </span>
                              {task.dueAt && (
                                <span
                                  className={`flex items-center gap-1 font-medium ${
                                    isOverdue ? "text-rose-600 font-bold" : "text-slate-500"
                                  }`}
                                >
                                  <Calendar className="w-3 h-3" />
                                  <span>{isOverdue ? `⚠️ Overdue (${formatDate(task.dueAt)})` : `Due: ${formatDate(task.dueAt)}`}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status selector badge */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <select
                            value={task.status}
                            onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value)}
                            className={`text-xs font-bold px-2.5 py-1 rounded-lg border focus:ring-2 focus:ring-amber-500 focus:outline-none transition ${
                              task.status === "COMPLETED" || task.status === "VERIFIED"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : task.status === "IN_PROGRESS"
                                ? "bg-sky-50 text-sky-800 border-sky-200"
                                : task.status === "BLOCKED"
                                ? "bg-rose-50 text-rose-800 border-rose-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            <option value="TODO">To Do</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="BLOCKED">Blocked</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="VERIFIED">Verified</option>
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Payments & Bills */}
        {(activeTab === "FINANCE" || activeTab === "BUDGET") && canSeeMoney && (
          <div className="space-y-4">
            {/* Financial Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Total Billed
                </span>
                <div className="text-xl font-extrabold text-slate-900 mt-1">
                  {formatCurrency(project.financials?.totalBilled || 0)}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{bills.length} vendor/contractor bills</div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Total Paid
                </span>
                <div className="text-xl font-extrabold text-emerald-600 mt-1">
                  {formatCurrency(project.financials?.totalPaid || 0)}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{payments.length} payment vouchers</div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Outstanding Due
                </span>
                <div className="text-xl font-extrabold text-amber-600 mt-1">
                  {formatCurrency(project.financials?.outstandingAmount || 0)}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Payable balance</div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Approved Budget
                </span>
                <div className="text-xl font-extrabold text-slate-900 mt-1">
                  {formatCurrency(budget)}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{budgetUtilization}% billed</div>
              </div>
            </div>

            {/* Sub-view navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center gap-2 overflow-x-auto">
                <button
                  onClick={() => setFinanceSubTab("BILLS")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                    financeSubTab === "BILLS"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Bills ({bills.length})</span>
                </button>
                <button
                  onClick={() => setFinanceSubTab("PAYMENTS")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                    financeSubTab === "PAYMENTS"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Payments & Vouchers ({payments.length})</span>
                </button>
                <button
                  onClick={() => setFinanceSubTab("BUDGET")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                    financeSubTab === "BUDGET"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <IndianRupee className="w-3.5 h-3.5" />
                  <span>Budget vs Actual</span>
                </button>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                {financeSubTab === "BILLS" && (
                  <Link
                    href={`/finance/bills/new?projectId=${project.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Bill</span>
                  </Link>
                )}
                {financeSubTab === "PAYMENTS" && (
                  <Link
                    href={`/finance/payments/new?projectId=${project.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Record Payment</span>
                  </Link>
                )}
              </div>
            </div>

            {/* Sub-view: Bills */}
            {financeSubTab === "BILLS" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-3 border-b border-slate-100 flex items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={billSearch}
                      onChange={(e) => setBillSearch(e.target.value)}
                      placeholder="Search bills by #, vendor, category..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                  <span className="text-xs text-slate-400 font-medium">
                    Showing {filteredBills.length} of {bills.length} bills
                  </span>
                </div>

                {filteredBills.length === 0 ? (
                  <div className="text-center py-12 px-4 text-slate-400 text-xs">
                    No bills recorded for this project yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4">Bill Date</th>
                          <th className="py-3 px-4">Bill #</th>
                          <th className="py-3 px-4">Vendor / Party</th>
                          <th className="py-3 px-4 text-right">Total Amount</th>
                          <th className="py-3 px-4 text-right">Paid</th>
                          <th className="py-3 px-4 text-right">Balance Due</th>
                          <th className="py-3 px-4 text-center">Status</th>
                          <th className="py-3 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredBills.map((b: any) => {
                          const billPaid = (b.allocations || []).reduce((s: number, a: any) => s + (a.amount || 0), 0);
                          const balanceDue = Math.max(0, (b.totalAmount || 0) - billPaid);
                          return (
                            <tr key={b.id} className="hover:bg-slate-50/70">
                              <td className="py-3 px-4 font-mono text-slate-600">{formatDate(b.billDate)}</td>
                              <td className="py-3 px-4 font-bold text-slate-900">{b.billNumber}</td>
                              <td className="py-3 px-4 font-medium text-slate-700">{b.party?.name || "—"}</td>
                              <td className="py-3 px-4 text-right font-bold text-slate-900">{formatCurrency(b.totalAmount)}</td>
                              <td className="py-3 px-4 text-right font-semibold text-emerald-600">{formatCurrency(billPaid)}</td>
                              <td className="py-3 px-4 text-right font-bold text-amber-600">{formatCurrency(balanceDue)}</td>
                              <td className="py-3 px-4 text-center">
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    b.status === "POSTED"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : b.status === "PAID"
                                      ? "bg-blue-100 text-blue-800"
                                      : "bg-amber-100 text-amber-800"
                                  }`}
                                >
                                  {b.status}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <Link
                                  href={`/finance?billId=${b.id}`}
                                  className="text-amber-600 hover:text-amber-700 font-bold hover:underline"
                                >
                                  View &rarr;
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Sub-view: Payments */}
            {financeSubTab === "PAYMENTS" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-3 border-b border-slate-100 flex items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={paymentSearch}
                      onChange={(e) => setPaymentSearch(e.target.value)}
                      placeholder="Search payments by ref #, recipient, account..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                  <span className="text-xs text-slate-400 font-medium">
                    Showing {filteredPayments.length} of {payments.length} vouchers
                  </span>
                </div>

                {filteredPayments.length === 0 ? (
                  <div className="text-center py-12 px-4 text-slate-400 text-xs">
                    No payment vouchers recorded for this project yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4">Payment Date</th>
                          <th className="py-3 px-4">Ref / Voucher #</th>
                          <th className="py-3 px-4">Recipient / Vendor</th>
                          <th className="py-3 px-4">Paying Account / Method</th>
                          <th className="py-3 px-4 text-right">Amount</th>
                          <th className="py-3 px-4 text-center">Status</th>
                          <th className="py-3 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredPayments.map((p: any) => (
                          <tr key={p.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-mono text-slate-600">{formatDate(p.paymentDate)}</td>
                            <td className="py-3 px-4 font-bold text-slate-900">{p.referenceNumber}</td>
                            <td className="py-3 px-4 font-medium text-slate-700">
                              {p.party?.name || p.recipientName || "—"}
                            </td>
                            <td className="py-3 px-4 text-slate-600">
                              <div>{p.payingAccount || "Operating Account"}</div>
                              <div className="text-[10px] text-slate-400 uppercase">{p.method?.replace(/_/g, " ")}</div>
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-700">{formatCurrency(p.amount)}</td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  p.status === "POSTED"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : p.status === "REJECTED"
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {p.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Link
                                href={`/finance?paymentId=${p.id}`}
                                className="text-amber-600 hover:text-amber-700 font-bold hover:underline"
                              >
                                View &rarr;
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Sub-view: Budget vs Actual */}
            {financeSubTab === "BUDGET" && (
              <ProjectBudget projectId={project.id} canEdit={canUser(currentUser, "finance:write")} />
            )}
          </div>
        )}

        {/* Tab 3: Site Workers & Labor Headcount */}
        {activeTab === "WORKFORCE" && (
          <div className="space-y-4">
            {/* Workforce Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Logged Entries
                </span>
                <div className="text-xl font-extrabold text-slate-900 mt-1">{headcounts.length}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Deployment journals</div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Latest On-Site Count
                </span>
                <div className="text-xl font-extrabold text-amber-600 mt-1">
                  {headcounts[0]?.grandTotal || (headcounts[0]?.artisanCount + headcounts[0]?.laborerTotal) || 0}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{headcounts[0]?.date ? `On ${formatDate(headcounts[0].date)}` : "No logs yet"}</div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Skilled Artisans
                </span>
                <div className="text-xl font-extrabold text-slate-900 mt-1">
                  {headcounts[0]?.artisanCount || 0}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Masons, bar benders, carpenters</div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Laborers (M / F)
                </span>
                <div className="text-xl font-extrabold text-slate-900 mt-1">
                  {headcounts[0] ? `M: ${headcounts[0].laborerMale || 0}, F: ${headcounts[0].laborerFemale || 0}` : "—"}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Unskilled site labor</div>
              </div>
            </div>

            {/* Header with Search and Actions */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <HardHat className="w-5 h-5 text-amber-500" />
                  <span>Site Workers & Labor Headcount</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Daily contractor deployment, direct site labor, and trade headcounts for {project.name}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/workforce?siteId=${project.siteId}&projectId=${project.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs"
                >
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  <span>Full Workforce Register</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setShowHeadcountModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log Headcount</span>
                </button>
              </div>
            </div>

            {/* Headcount Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  <div className="relative min-w-[200px] flex-1 max-w-xs">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={headcountSearch}
                      onChange={(e) => setHeadcountSearch(e.target.value)}
                      placeholder="Search contractor, supervisor..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                  <input
                    type="date"
                    value={headcountDateFilter}
                    onChange={(e) => setHeadcountDateFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                  />
                  {headcountDateFilter && (
                    <button
                      onClick={() => setHeadcountDateFilter("")}
                      className="text-xs text-amber-600 font-bold hover:underline"
                    >
                      Clear Date
                    </button>
                  )}
                </div>
                <span className="text-xs text-slate-400 font-medium">
                  Showing {filteredHeadcounts.length} of {headcounts.length} entries
                </span>
              </div>

              {filteredHeadcounts.length === 0 ? (
                <div className="text-center py-12 px-4 text-slate-400 text-xs">
                  No workforce deployment records found for this project yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Shift</th>
                        <th className="py-3 px-4">Source</th>
                        <th className="py-3 px-4">Contractor / Team</th>
                        <th className="py-3 px-4">Labor Breakdown</th>
                        <th className="py-3 px-4 text-right">Total Workers</th>
                        <th className="py-3 px-4">Recorded By</th>
                        <th className="py-3 px-4">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredHeadcounts.map((h: any) => {
                        const totalLaborers = h.laborerTotal || (h.laborerMale || 0) + (h.laborerFemale || 0);
                        const totalWorkers = h.grandTotal || (h.artisanCount || 0) + totalLaborers;
                        return (
                          <tr key={h.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-mono font-bold text-slate-800">{formatDate(h.date)}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  h.shift === "NIGHT"
                                    ? "bg-indigo-100 text-indigo-800"
                                    : h.shift === "DAY"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-sky-100 text-sky-800"
                                }`}
                              >
                                {h.shift}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  h.source === "CONTRACTOR"
                                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                    : "bg-blue-50 text-blue-800 border border-blue-200"
                                }`}
                              >
                                {h.source}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-900">
                              {h.contractorName || "Direct Labor"}
                            </td>
                            <td className="py-3 px-4 text-slate-700">
                              <span>Artisans: <strong className="text-slate-900">{h.artisanCount || 0}</strong></span>
                              <span className="mx-1.5 text-slate-300">•</span>
                              <span>
                                Laborers: <strong className="text-slate-900">{totalLaborers}</strong> (M: {h.laborerMale || 0}, F: {h.laborerFemale || 0})
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-extrabold text-slate-900">
                              <span className="px-2 py-0.5 rounded bg-slate-100">{totalWorkers}</span>
                            </td>
                            <td className="py-3 px-4 text-slate-500 font-medium">{h.supervisorName || "Site User"}</td>
                            <td className="py-3 px-4 text-slate-400 max-w-xs truncate">{h.notes || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Drawings & Plans */}
        {activeTab === "DRAWINGS" && (
          <div className="space-y-6">
            {/* Drawings Header and Actions */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <FolderKanban className="w-5 h-5 text-blue-500" />
                    <span>Project Drawings & Architectural Plans</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Architectural, structural, electrical, and plumbing engineering plans with GFC revision tracking.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/drawings?projectId=${project.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                    <span>Full Drawings Hub</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setShowDrawingModal(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Drawing / Plan</span>
                  </button>
                </div>
              </div>

              {/* Discipline filter pills & Search */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <button
                    onClick={() => setDrawingDisciplineFilter("ALL")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                      drawingDisciplineFilter === "ALL"
                        ? "bg-slate-900 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    All Disciplines ({drawings.length})
                  </button>
                  {Object.entries(DRAWING_DISCIPLINES).map(([k, d]) => {
                    const count = drawings.filter((dw: any) => dw.discipline === k).length;
                    if (count === 0 && drawingDisciplineFilter !== k) return null;
                    return (
                      <button
                        key={k}
                        onClick={() => setDrawingDisciplineFilter(k)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
                          drawingDisciplineFilter === k
                            ? "bg-slate-900 text-white shadow-xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${d.dot}`} />
                        <span>{d.label} ({count})</span>
                      </button>
                    );
                  })}
                </div>

                <div className="relative min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={drawingSearch}
                    onChange={(e) => setDrawingSearch(e.target.value)}
                    placeholder="Search drawing #, title..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Drawings Register Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {filteredDrawings.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <FolderKanban className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <div className="text-sm font-bold text-slate-700">No drawings recorded yet</div>
                  <p className="text-xs text-slate-400 mt-1">
                    Upload architectural sheets, structural details, or MEP plans for this project.
                  </p>
                  <button
                    onClick={() => setShowDrawingModal(true)}
                    className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Upload Drawing</span>
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Drawing Number</th>
                        <th className="py-3 px-4">Title / Description</th>
                        <th className="py-3 px-4">Discipline</th>
                        <th className="py-3 px-4 text-center">Current Revision</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4">Updated</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDrawings.map((d: any) => {
                        const latestRev = d.revisions?.[0] || null;
                        const disc = DRAWING_DISCIPLINES[d.discipline] || DRAWING_DISCIPLINES.OTHER;
                        const statusObj = latestRev ? (DRAWING_STATUS[latestRev.status] || DRAWING_STATUS.FOR_APPROVAL) : null;
                        return (
                          <tr key={d.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-mono font-extrabold text-slate-900 tracking-wide">
                              {d.number}
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-800">
                              <div>{d.title}</div>
                              {latestRev?.fileName && (
                                <div className="text-[11px] text-slate-400 font-normal flex items-center gap-1 mt-0.5">
                                  <Paperclip className="w-3 h-3" />
                                  <span>{latestRev.fileName}</span>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${disc.pill}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${disc.dot}`} />
                                <span>{disc.label}</span>
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                              <span className="px-2 py-0.5 rounded bg-slate-100">
                                {latestRev?.revision || "R0"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {statusObj ? (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusObj.pill}`}>
                                  {statusObj.label}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-500">{formatDate(d.updatedAt || d.createdAt)}</td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {latestRev?.fileUrl && (
                                  <a
                                    href={latestRev.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[11px] transition"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>View Plan</span>
                                  </a>
                                )}
                                <Link
                                  href={`/drawings?projectId=${project.id}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition"
                                >
                                  <span>Details</span>
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Embedded Documents & Blueprints Manager below Drawings register */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-amber-500" />
                    <span>Project Document Folders & Blueprints</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Permits, contracts, site inspection scans, and folder organization.
                  </p>
                </div>
                <button
                  onClick={() => setShowFolderModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs self-start sm:self-auto"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>New Folder</span>
                </button>
              </div>

              {/* Folder Selector Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                <button
                  onClick={() => setSelectedFolderId(null)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                    selectedFolderId === null
                      ? "bg-amber-500 text-slate-950 shadow-xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>All Documents</span>
                </button>

                {folders.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFolderId(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                      selectedFolderId === f.id
                        ? "bg-amber-500 text-slate-950 shadow-xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>{f.name}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10">
                      {f._count?.attachments || 0}
                    </span>
                  </button>
                ))}
              </div>

              <AttachmentManager
                entityType="PROJECT_DOCUMENT"
                entityId={project.id}
                projectId={project.id}
                folderId={selectedFolderId || undefined}
                title={
                  selectedFolderId
                    ? `Documents in "${folders.find((f) => f.id === selectedFolderId)?.name || "Folder"}"`
                    : "All Project Files & Drawings"
                }
                allowUpload={true}
                categoryDefault="DRAWING"
              />
            </div>
          </div>
        )}

        {/* Tab 5: Progress & Stages */}
        {activeTab === "PROGRESS" && (
          <ProjectMilestones
            projectId={project.id}
            canPlan={canUser(currentUser, "projects:write")}
            canUpdate={canUser(currentUser, "tasks:write")}
          />
        )}

        {/* Tab 3: Material Issues */}
        {activeTab === "MATERIALS" && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <ExcelTableToolbar
              table={excelMovements}
              columns={movementColumns}
              tableName="materials provided"
              showSearch={true}
              showExport={true}
            />
            {stockMovements.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No materials provided to contractor recorded for this project yet.
              </div>
            ) : (
              <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
                    <tr>
                      {movementColumns.map((col) => (
                        <ExcelColumnHeader
                          key={col.key}
                          column={col}
                          table={excelMovements}
                          theme="lightHeader"
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {excelMovements.paginatedData.map((m: any) => (
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
              <TablePagination
                currentPage={excelMovements.currentPage}
                totalPages={excelMovements.totalPages}
                totalItems={excelMovements.filteredCount}
                totalUnfiltered={excelMovements.totalRecords}
                pageSize={excelMovements.pageSize}
                startItem={excelMovements.startItem}
                endItem={excelMovements.endItem}
                onPageChange={excelMovements.setCurrentPage}
                itemLabel="materials provided"
              />
              </>
            )}
          </div>
        )}

        {/* Tab: Daily Site Reports */}
        {activeTab === "REPORTS" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-amber-500" />
                  <span>Daily Progress & Site Logs</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chronological site journals, execution milestones, issues encountered, and safety notes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReportModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                <span>Log Daily Report</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <ExcelTableToolbar
                table={excelReports}
                columns={reportColumns}
                tableName="daily site reports"
                showSearch={true}
                showExport={true}
              />

              {/* Desktop Table Layout */}
              <div className="hidden md:block overflow-x-auto">
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
                    {excelReports.filteredData.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                          No daily reports logged for this project yet.
                        </td>
                      </tr>
                    ) : (
                      excelReports.paginatedData.map((r: any) => (
                        <tr key={r.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-4 font-mono text-xs font-bold text-slate-800">
                            {formatDate(r.reportDate)}
                          </td>
                          <td className="py-3 px-4 text-xs font-semibold text-slate-700">
                            <div>{r.creator?.name || "Staff"}</div>
                            <div className="text-[10px] text-slate-400 font-normal">{r.creator?.role || "Site User"}</div>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-900 max-w-xs break-words">
                            {r.progress || "—"}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            {r.blockers ? (
                              <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded text-[11px] font-medium inline-block">
                                {r.blockers}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">None</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">
                            {r.safetyNotes || "None"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Responsive Cards Layout */}
              <div className="block md:hidden divide-y divide-slate-100 p-3 space-y-3">
                {excelReports.filteredData.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No daily reports logged for this project yet.
                  </div>
                ) : (
                  excelReports.paginatedData.map((r: any) => (
                    <div key={r.id} className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-200/90 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                          <Calendar className="w-3.5 h-3.5 text-amber-500" />
                          <span>{formatDate(r.reportDate)}</span>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-200/70 text-slate-700">
                          {r.creator?.name || "Staff"} ({r.creator?.role || "Site"})
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-500 block mb-0.5 uppercase tracking-wide">Work Completed / Progress:</span>
                        <p className="text-xs text-slate-800 leading-relaxed bg-white p-2.5 rounded-lg border border-slate-100">
                          {r.progress}
                        </p>
                      </div>
                      {r.blockers && (
                        <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-xs text-rose-800">
                          <span className="font-bold block text-[11px] uppercase tracking-wide">⚠️ Issues / Blockers:</span>
                          <span className="mt-0.5 block">{r.blockers}</span>
                        </div>
                      )}
                      {r.safetyNotes && (
                        <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-2.5 text-xs text-emerald-800">
                          <span className="font-bold block text-[11px] uppercase tracking-wide">🛡️ Safety Notes:</span>
                          <span className="mt-0.5 block">{r.safetyNotes}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <TablePagination
                currentPage={excelReports.currentPage}
                totalPages={excelReports.totalPages}
                totalItems={excelReports.filteredCount}
                totalUnfiltered={excelReports.totalRecords}
                pageSize={excelReports.pageSize}
                startItem={excelReports.startItem}
                endItem={excelReports.endItem}
                onPageChange={excelReports.setCurrentPage}
                itemLabel="daily reports"
              />
            </div>
          </div>
        )}

        {/* Tab 4: Project Documents & Drawings (Priority 7) */}
        {activeTab === "DOCUMENTS" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <FolderKanban className="w-5 h-5 text-amber-500" />
                    <span>Project Drawings & Document Archive</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Architectural plans, structural drawings, approvals, specifications, and inspection photos.
                  </p>
                </div>
                <button
                  onClick={() => setShowFolderModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs self-start sm:self-auto"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>New Folder</span>
                </button>
              </div>

              {/* Folder Selector Pills */}
              <div className="flex items-center gap-2 pt-4 overflow-x-auto pb-2">
                <button
                  onClick={() => setSelectedFolderId(null)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                    selectedFolderId === null
                      ? "bg-amber-500 text-slate-950 shadow-xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>All Documents</span>
                </button>

                {folders.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFolderId(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                      selectedFolderId === f.id
                        ? "bg-amber-500 text-slate-950 shadow-xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>{f.name}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10">
                      {f._count?.attachments || 0}
                    </span>
                  </button>
                ))}
              </div>

              {/* Embedded Document Manager */}
              <div className="pt-4 border-t border-slate-100 mt-2">
                <AttachmentManager
                  entityType="PROJECT_DOCUMENT"
                  entityId={project.id}
                  projectId={project.id}
                  folderId={selectedFolderId || undefined}
                  title={
                    selectedFolderId
                      ? `Documents in "${folders.find((f) => f.id === selectedFolderId)?.name || "Folder"}"`
                      : "All Project Files & Drawings"
                  }
                  allowUpload={true}
                  categoryDefault="DRAWING"
                />
              </div>
            </div>
          </div>
        )}

        {/* Modal: Add Task */}
        {showTaskModal && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto animate-scale-in">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                    <CheckSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <span>Add Task for {project.code}</span>
                      <span className="text-[11px] font-normal text-slate-500 hidden sm:inline">({project.name})</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Create and assign work tasks, milestones, or approval requests</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
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
                    placeholder="e.g. RCC Column Casting Level 3 / Electrical Conduit Check"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1 flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                      Assign To Employee
                    </label>
                    <SearchableSelect
                      options={[
                        { value: "", label: "Unassigned / Current User" },
                        ...(Array.isArray(employees) ? employees : []).map((emp) => ({
                          value: emp.id,
                          label: emp.name,
                          badge: emp.role?.replace(/_/g, " "),
                        })),
                      ]}
                      value={taskAssigneeId}
                      onChange={setTaskAssigneeId}
                      placeholder="Select Employee..."
                      searchPlaceholder="Search employee name or role..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                      Trade / Work Category
                    </label>
                    <SearchableSelect
                      options={[
                        { value: "", label: "General Construction / Site Work" },
                        { value: "Civil & RCC / Structural", label: "Civil & RCC / Structural" },
                        { value: "Masonry & Brickwork", label: "Masonry & Brickwork" },
                        { value: "Electrical & Power", label: "Electrical & Power" },
                        { value: "Plumbing & Sanitary", label: "Plumbing & Sanitary" },
                        { value: "Finishing, Plaster & Painting", label: "Finishing, Plaster & Painting" },
                        { value: "Flooring & Tiling", label: "Flooring & Tiling" },
                        { value: "Carpentry & Joinery", label: "Carpentry & Joinery" },
                        { value: "HVAC & Mechanical", label: "HVAC & Mechanical" },
                        { value: "Safety, Quality & Inspection", label: "Safety, Quality & Inspection" },
                        { value: "Material & Procurement", label: "Material & Procurement" },
                      ]}
                      value={taskTrade}
                      onChange={setTaskTrade}
                      placeholder="Select Trade / Work Category..."
                      searchPlaceholder="Search category..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1 flex items-center gap-1">
                      <Flag className="w-3.5 h-3.5 text-slate-400" />
                      Priority
                    </label>
                    <SearchableSelect
                      options={TASK_PRIORITY_OPTIONS}
                      value={taskPriority}
                      onChange={(v) => setTaskPriority(v as any)}
                      placeholder="Select Priority..."
                      searchPlaceholder="Search priority..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Target Due Date
                    </label>
                    <input
                      type="date"
                      value={taskDueDate}
                      onChange={(e) => setTaskDueDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Auto-reminder schedule info */}
                <div className="p-3 bg-amber-50/90 border border-amber-200/80 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{getAutoReminderMessage(taskPriority)}</span>
                    <p className="text-[11px] text-amber-800/80 mt-0.5">
                      Recurring notifications are automatically dispatched until the task is marked completed or verified.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    Description & Specifications (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    placeholder="Provide execution details, location / grid / floor, required materials, quality standards, and safety precautions..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTaskModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg shadow-sm transition-colors"
                  >
                    {submitting ? "Adding..." : "Add Task"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: New Folder (Priority 7) */}
        {showFolderModal && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto animate-scale-in">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <FolderPlus className="w-5 h-5 text-amber-500" />
                  <span>Create Document Folder</span>
                </div>
                <button
                  onClick={() => setShowFolderModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateFolder} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Folder Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Architectural Drawings / Approvals & NOCs"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Description (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Approved layout plans signed by municipal corporation"
                    value={newFolderDesc}
                    onChange={(e) => setNewFolderDesc(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFolderModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {submitting ? "Creating..." : "Create Folder"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Project & Audit (Priority 6) */}
        {showEditModal && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto animate-scale-in">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-amber-500" />
                  <span>Edit Project Details</span>
                </div>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditProject} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Project Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Budget (₹)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={editBudget}
                      onChange={(e) => setEditBudget(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Status
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="ON_HOLD">On Hold</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Reason for Change (Audit Log)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Budget increase approved by executive board"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Log Daily Report */}
        {showReportModal && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto animate-scale-in">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                    <ClipboardList className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Log Daily Site Report</h3>
                    <p className="text-[11px] text-slate-400">{project.name} ({project.code})</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateReport} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Report Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Work Progress / Milestones *
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={reportProgress}
                    onChange={(e) => setReportProgress(e.target.value)}
                    placeholder="Describe construction progress, quantities executed, activities completed today..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Issues / Blockers (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={reportBlockers}
                    onChange={(e) => setReportBlockers(e.target.value)}
                    placeholder="Material shortages, rain delays, machine breakdown, design clarifications..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Safety & Site Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={reportSafetyNotes}
                    onChange={(e) => setReportSafetyNotes(e.target.value)}
                    placeholder="Toolbox talk conducted, PPE compliance, scaffold inspection..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : "Submit Report"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Audit History (Priority 6) */}
        {showAuditModal && (
          <AuditHistoryModal
            entityType="PROJECT"
            entityId={project.id}
            title={`Change History: ${project.name} (${project.code})`}
            onClose={() => setShowAuditModal(false)}
          />
        )}

        {/* Modal: Add Drawing / Plan */}
        {showDrawingModal && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto animate-scale-in">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
                    <FilePlus2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Add Drawing / Plan</h3>
                    <p className="text-[11px] text-slate-400">{project.name} ({project.code})</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDrawingModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateDrawing} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Drawing Number *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. STR-GF-101"
                      value={drawingNumber}
                      onChange={(e) => setDrawingNumber(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm uppercase font-mono font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Discipline *
                    </label>
                    <select
                      value={drawingDiscipline}
                      onChange={(e) => setDrawingDiscipline(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    >
                      {Object.entries(DRAWING_DISCIPLINES).map(([k, d]) => (
                        <option key={k} value={k}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Drawing Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ground Floor Column & Beam Reinforcement Layout"
                    value={drawingTitle}
                    onChange={(e) => setDrawingTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Attach Drawing File (PDF / Image)
                  </label>
                  <FileUpload
                    value={drawingFile}
                    onChange={setDrawingFile}
                    entityType="DRAWING"
                    projectId={project.id}
                    category="DRAWING"
                    label="Attach Drawing (PDF, PNG, JPG, CAD)"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Notes & Issue Details (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Issued for structural consultant review"
                    value={drawingNotes}
                    onChange={(e) => setDrawingNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowDrawingModal(false)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition disabled:opacity-50"
                  >
                    {submitting ? "Adding..." : "Add Drawing as R0"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Quick Log Workforce Headcount */}
        {showHeadcountModal && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto animate-scale-in">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                    <HardHat className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Log Site Workers & Headcount</h3>
                    <p className="text-[11px] text-slate-400">{project.name} ({project.code})</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHeadcountModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateHeadcount} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Deployment Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={hcDate}
                      onChange={(e) => setHcDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Shift *
                    </label>
                    <select
                      value={hcShift}
                      onChange={(e) => setHcShift(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    >
                      <option value="GENERAL">General Shift</option>
                      <option value="DAY">Day Shift</option>
                      <option value="NIGHT">Night Shift</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Labor Source *
                    </label>
                    <select
                      value={hcSource}
                      onChange={(e) => setHcSource(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    >
                      <option value="CONTRACTOR">Contractor / Subcontractor</option>
                      <option value="DIRECT">Direct Site Labor</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Contractor / Team Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Sharma Civil Team / RCC Gang"
                      value={hcContractor}
                      onChange={(e) => setHcContractor(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Labor counts breakdown (No wage rates/money shown) */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Worker Deployment Counts
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Skilled Artisans
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={hcArtisans}
                        onChange={(e) => setHcArtisans(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-bold text-center focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Laborers (M)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={hcLaborerMale}
                        onChange={(e) => setHcLaborerMale(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-bold text-center focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Laborers (F)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={hcLaborerFemale}
                        onChange={(e) => setHcLaborerFemale(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-bold text-center focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 flex items-center justify-between pt-1">
                    <span>Total Workers:</span>
                    <strong className="text-slate-900 font-mono text-sm">
                      {(Number(hcArtisans) || 0) + (Number(hcLaborerMale) || 0) + (Number(hcLaborerFemale) || 0)}
                    </strong>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Notes / Work Location (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2nd floor slab shuttering and reinforcement"
                    value={hcNotes}
                    onChange={(e) => setHcNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowHeadcountModal(false)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : "Log Headcount"}
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
