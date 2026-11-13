"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { useActiveSite } from "@/hooks/useActiveSite";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import { formatCurrency, formatCompactINR, formatDate } from "@/lib/formatters";
import { compressImageFile } from "@/lib/image-compression";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, TablePagination, ExcelColumn } from "@/components/ui/ExcelTable";
import {
  Receipt,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Camera,
  Upload,
  Eye,
  Download,
  FileText,
  AlertTriangle,
  Building2,
  Wallet,
  X,
  Check,
  Smartphone,
  ExternalLink,
  Filter,
  Edit2,
  Trash2,
} from "lucide-react";

interface ExpenseItem {
  id: string;
  referenceNumber: string;
  title: string;
  amount: number;
  amountPaise: number;
  expenseDate: string;
  category: string;
  paidTo: string;
  paymentMode: string;
  payingAccount: string;
  status: "PENDING_APPROVAL" | "POSTED" | "REJECTED";
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  notes?: string | null;
  creator?: { id: string; name: string; role: string; email: string } | null;
  site?: { id: string; name: string; code: string } | null;
  project?: { id: string; name: string; code: string } | null;
  receipt?: {
    id: string;
    fileId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    url: string;
  } | null;
  attachments?: any[];
  createdAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  MATERIALS: "Materials & Hardware",
  EQUIPMENT: "Fuel & Generator Diesel",
  TRANSPORT: "Transport & Delivery",
  LABOUR: "Labour Tea & Refreshment",
  SITE_OFFICE: "Site Office & Consumables",
  REPAIRS: "Minor Repairs & Tools",
  OTHER: "Other Site Expense",
};

function cleanExpenseTitle(title?: string | null): string {
  if (!title) return "Site Expense";
  return title.replace(/\s*\([₹\s]*[0-9,.]+\)\s*$/i, "").trim();
}

export default function ExpensesPage() {
  const { activeSiteId } = useActiveSite();
  const { refreshUser, refreshSites } = useAppSession();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  // Modal: Log New Expense
  const [showLogModal, setShowLogModal] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [category, setCategory] = useState("MATERIALS");
  const [paidTo, setPaidTo] = useState("");
  const [paymentMode, setPaymentMode] = useState("PERSONAL_UPI");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [notes, setNotes] = useState("");
  
  // Mandatory Receipt photo state
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Modal: View Receipt Photo
  const [viewingReceipt, setViewingReceipt] = useState<{ url: string; fileName: string; title: string } | null>(null);

  // Modal: Approve & Reject Confirmation
  const [pendingApproveExpenseId, setPendingApproveExpenseId] = useState<string | null>(null);
  const [rejectingExpenseId, setRejectingExpenseId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  // Modal: Edit / Update Expense
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editExpenseDate, setEditExpenseDate] = useState("");
  const [editCategory, setEditCategory] = useState("MATERIALS");
  const [editPaidTo, setEditPaidTo] = useState("");
  const [editPaymentMode, setEditPaymentMode] = useState("PERSONAL_UPI");
  const [editSiteId, setEditSiteId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editReceiptFile, setEditReceiptFile] = useState<File | null>(null);
  const [editReceiptPreview, setEditReceiptPreview] = useState<string | null>(null);
  const [updatingExpense, setUpdatingExpense] = useState(false);
  const [editReceiptError, setEditReceiptError] = useState<string | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const editCameraInputRef = useRef<HTMLInputElement>(null);

  // Modal: Delete Expense Confirmation
  const [deletingExpense, setDeletingExpense] = useState<ExpenseItem | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  const isApprover = currentUser?.role && ["SUPER_ADMIN", "ORG_ADMIN", "ACCOUNTANT"].includes(currentUser.role);

  useEffect(() => {
    const anyModal = showLogModal || Boolean(viewingReceipt) || Boolean(rejectingExpenseId) || Boolean(pendingApproveExpenseId) || Boolean(editingExpense) || Boolean(deletingExpense);
    if (!anyModal) return;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowLogModal(false);
        setViewingReceipt(null);
        setRejectingExpenseId(null);
        setPendingApproveExpenseId(null);
        setEditingExpense(null);
        setDeletingExpense(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showLogModal, viewingReceipt, rejectingExpenseId, pendingApproveExpenseId, editingExpense, deletingExpense]);

  const loadExpenses = (statusOverride?: string) => {
    setLoading(true);
    let url = "/api/expenses";
    const params = new URLSearchParams();
    if (activeSiteId) params.set("siteId", activeSiteId);
    const activeStatus = statusOverride !== undefined ? statusOverride : statusFilter;
    if (activeStatus && activeStatus !== "ALL") params.set("status", activeStatus);
    params.set("_t", Date.now().toString());
    url += `?${params.toString()}`;

    fetch(url, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          setExpenses(res.data);
        }
      })
      .catch((err) => {
        console.error("Failed to load expenses:", err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refreshUser().then((u) => {
      if (u) setCurrentUser(u);
    });

    refreshSites().then((list) => {
      if (Array.isArray(list)) setSites(list);
    });

    fetch("/api/projects")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          setProjects(res.data);
        }
      })
      .catch(() => {});
  }, [refreshSites, refreshUser]);

  useEffect(() => {
    loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, statusFilter]);

  useEffect(() => {
    if (activeSiteId) {
      setSelectedSiteId(activeSiteId);
    } else if (sites.length > 0 && !selectedSiteId) {
      setSelectedSiteId(sites[0].id);
    }
  }, [activeSiteId, sites, selectedSiteId]);

  // Handle Photo selection, compress images automatically, & create live preview
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    e.target.value = "";
    if (!rawFile) return;

    if (!rawFile.type.startsWith("image/") && rawFile.type !== "application/pdf") {
      setReceiptError("Unsupported file type. Upload a JPG, PNG, WebP photo or a PDF receipt.");
      return;
    }

    if (rawFile.type === "application/pdf" && rawFile.size > 5 * 1024 * 1024) {
      setReceiptError("This PDF is larger than 5 MB. Compress it or take a clear photo of the receipt instead.");
      return;
    }

    const file = rawFile.type.startsWith("image/")
      ? await compressImageFile(rawFile, { preset: "receipt" })
      : rawFile;

    if (file.size > 5 * 1024 * 1024) {
      setReceiptError("This photo is still over 5 MB. Take a closer cropped photo or choose a smaller file.");
      return;
    }

    setReceiptFile(file);
    setReceiptError(null);

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        setReceiptPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setReceiptPreview(null);
    }
  };

  const handleClearPhoto = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
    setReceiptError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setReceiptError(null);

    // MANDATORY VALIDATION: Must attach a receipt photo
    if (!receiptFile) {
      setReceiptError("Please attach a receipt photo or PDF before submitting.");
      return;
    }

    const amtNum = parseFloat(amount);
    if (isNaN(amtNum) || amtNum <= 0) {
      setFeedback({ tone: "error", message: "Enter an amount greater than ₹0." });
      return;
    }

    setSubmitting(true);
    setUploadingReceipt(true);

    try {
      // Step 1: Upload receipt photo to /api/uploads
      const uploadForm = new FormData();
      uploadForm.append("file", receiptFile, receiptFile.name);
      uploadForm.append("category", "RECEIPT");
      uploadForm.append("entityType", "PAYMENT");
      uploadForm.append("notes", `Out-of-pocket receipt for ${title}`);

      const uploadRes = await fetch("/api/uploads", {
        method: "POST",
        body: uploadForm,
      });

      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok || !uploadJson.success) {
        throw new Error(uploadJson.error?.message || "Could not upload the receipt photo. Check your connection and try again.");
      }

      const receiptFileId = uploadJson.data?.fileId || uploadJson.data?.id;
      if (!receiptFileId) {
        throw new Error("Upload did not finish properly. Please remove the receipt and upload it again.");
      }

      setUploadingReceipt(false);

      // Step 2: Post expense claim to /api/expenses
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          amount: amtNum,
          expenseDate,
          category,
          paidTo: paidTo.trim(),
          paymentMode,
          siteId: selectedSiteId || undefined,
          projectId: selectedProjectId || undefined,
          notes: notes.trim() || undefined,
          receiptFileId,
          receiptFileName: receiptFile.name,
          receiptFileSize: receiptFile.size,
          receiptMimeType: receiptFile.type,
        }),
      });

      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.error?.message || "Could not submit your expense claim. Please check the form and try again.");
      }

      setFeedback({
        tone: "success",
        message: `Expense claim of ₹${amtNum.toLocaleString("en-IN")} submitted for approval.`,
      });

      // Instantly prepend new expense to state for 0ms visual update in the table
      if (resJson.data?.expense) {
        setExpenses((prev) => [resJson.data.expense, ...prev.filter((e) => e.id !== resJson.data.expense.id)]);
      }

      // Reset form
      setShowLogModal(false);
      setTitle("");
      setAmount("");
      setPaidTo("");
      setNotes("");
      handleClearPhoto();
      setStatusFilter("ALL");
      loadExpenses("ALL");
      window.dispatchEvent(new CustomEvent("refreshExpenses"));
    } catch (err: any) {
      setFeedback({ tone: "error", message: err.message || "Could not save your expense claim. Please try again." });
    } finally {
      setSubmitting(false);
      setUploadingReceipt(false);
    }
  };

  const handleApproveExpense = (id: string) => {
    setPendingApproveExpenseId(id);
  };

  const confirmApproveExpense = async () => {
    if (!pendingApproveExpenseId) return;
    const id = pendingApproveExpenseId;
    setPendingApproveExpenseId(null);
    // Optimistic status update
    setExpenses((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: "POSTED" as const } : e))
    );
    try {
      const res = await fetch(`/api/expenses/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedback({ tone: "error", message: data.error?.message || "Could not approve this expense claim. Please try again." });
        loadExpenses();
        return;
      }
      setFeedback({ tone: "success", message: "Expense claim approved successfully for reimbursement!" });
      loadExpenses();
      window.dispatchEvent(new CustomEvent("refreshExpenses"));
    } catch {
      setFeedback({ tone: "error", message: "Connection error while approving expense. Check your internet and try again." });
      loadExpenses();
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingExpenseId || !rejectionReason.trim()) return;

    const targetId = rejectingExpenseId;
    // Optimistic status update
    setExpenses((prev) =>
      prev.map((e) => (e.id === targetId ? { ...e, status: "REJECTED" as const } : e))
    );
    setRejectSubmitting(true);
    try {
      const res = await fetch(`/api/expenses/${targetId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedback({ tone: "error", message: data.error?.message || "Could not decline this expense claim. Please try again." });
        loadExpenses();
        return;
      }
      setFeedback({ tone: "success", message: "Expense claim declined." });
      setRejectingExpenseId(null);
      setRejectionReason("");
      loadExpenses();
      window.dispatchEvent(new CustomEvent("refreshExpenses"));
    } catch {
      setFeedback({ tone: "error", message: "Connection error while declining expense. Check your internet and try again." });
      loadExpenses();
    } finally {
      setRejectSubmitting(false);
    }
  };

  const handleOpenEditModal = (exp: ExpenseItem) => {
    setEditingExpense(exp);
    setEditTitle(cleanExpenseTitle(exp.title));
    const amtRupees = exp.amount ? exp.amount : (exp.amountPaise ? exp.amountPaise / 100 : 0);
    setEditAmount(amtRupees ? String(amtRupees) : "");
    setEditExpenseDate(exp.expenseDate ? new Date(exp.expenseDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);
    setEditCategory(exp.category || "MATERIALS");
    setEditPaidTo(exp.paidTo || "");
    setEditPaymentMode(exp.paymentMode || "PERSONAL_CASH");
    setEditSiteId(exp.site?.id || "");
    const cleanNotes = exp.notes?.replace(/^\[Out-of-Pocket Expense\]\s*/i, "").split("•").slice(2).join("•").trim() || "";
    setEditNotes(cleanNotes);
    setEditReceiptFile(null);
    setEditReceiptPreview(exp.receipt?.url || null);
    setEditReceiptError(null);
  };

  const handleEditPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setEditReceiptError("Receipt file is too large (max 5 MB). Please compress or take another photo.");
      return;
    }

    setEditReceiptError(null);
    setEditReceiptFile(file);

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setEditReceiptPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setEditReceiptPreview(null);
    }
  };

  const handleClearEditPhoto = () => {
    setEditReceiptFile(null);
    setEditReceiptPreview(null);
    if (editFileInputRef.current) editFileInputRef.current.value = "";
    if (editCameraInputRef.current) editCameraInputRef.current.value = "";
  };

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;

    const amtNum = parseFloat(editAmount);
    if (!amtNum || isNaN(amtNum) || amtNum <= 0) {
      setEditReceiptError("Please enter a valid amount greater than ₹0.");
      return;
    }

    if (!editTitle.trim()) {
      setEditReceiptError("Please provide an expense purpose.");
      return;
    }

    if (!editPaidTo.trim()) {
      setEditReceiptError("Please enter paid to (shop or person).");
      return;
    }

    setUpdatingExpense(true);
    setEditReceiptError(null);

    try {
      let newReceiptFileId: string | undefined = undefined;

      // Upload new receipt photo if changed
      if (editReceiptFile) {
        const uploadForm = new FormData();
        uploadForm.append("file", editReceiptFile);
        uploadForm.append("category", "RECEIPT");
        uploadForm.append("entityType", "PAYMENT");
        uploadForm.append("entityId", editingExpense.id);
        uploadForm.append("notes", `Updated receipt for ${editTitle.trim()}`);

        const uploadRes = await fetch("/api/uploads", {
          method: "POST",
          body: uploadForm,
        });

        const uploadJson = await uploadRes.json();
        if (uploadRes.ok && uploadJson.success) {
          newReceiptFileId = uploadJson.data?.fileId || uploadJson.data?.id;
        }
      }

      const res = await fetch(`/api/expenses/${editingExpense.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          amount: amtNum,
          expenseDate: editExpenseDate,
          category: editCategory,
          paidTo: editPaidTo.trim(),
          paymentMode: editPaymentMode,
          siteId: editSiteId || undefined,
          notes: editNotes.trim() || undefined,
          receiptFileId: newReceiptFileId || editingExpense.receipt?.fileId,
          receiptFileName: editReceiptFile?.name || editingExpense.receipt?.fileName,
          receiptFileSize: editReceiptFile?.size || editingExpense.receipt?.fileSize,
          receiptMimeType: editReceiptFile?.type || editingExpense.receipt?.mimeType,
        }),
      });

      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.error?.message || "Could not update the expense claim.");
      }

      setFeedback({
        tone: "success",
        message: `Expense "${cleanExpenseTitle(editTitle)}" updated successfully!`,
      });
      setEditingExpense(null);
      loadExpenses();
      window.dispatchEvent(new CustomEvent("refreshExpenses"));
    } catch (err: any) {
      setEditReceiptError(err.message || "Failed to update expense. Please try again.");
    } finally {
      setUpdatingExpense(false);
    }
  };

  const handleConfirmDelete = (exp: ExpenseItem) => {
    setDeletingExpense(exp);
  };

  const handleDeleteExpense = async () => {
    if (!deletingExpense) return;
    setDeletingLoading(true);
    try {
      const res = await fetch(`/api/expenses/${deletingExpense.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Could not delete this expense.");
      }

      setFeedback({
        tone: "success",
        message: `Expense "${cleanExpenseTitle(deletingExpense.title)}" deleted successfully!`,
      });
      setDeletingExpense(null);
      loadExpenses();
      window.dispatchEvent(new CustomEvent("refreshExpenses"));
    } catch (err: any) {
      setFeedback({
        tone: "error",
        message: err.message || "Could not delete this expense. Please try again.",
      });
    } finally {
      setDeletingLoading(false);
    }
  };

  // Metrics computation
  const metrics = useMemo(() => {
    let totalCount = expenses.length;
    let totalAmount = 0;
    let pendingCount = 0;
    let pendingAmount = 0;
    let approvedCount = 0;
    let approvedAmount = 0;
    let rejectedCount = 0;
    let rejectedAmount = 0;

    for (const exp of expenses) {
      const amtPaise = exp.amountPaise ?? (exp.amount ? Math.round(exp.amount * 100) : 0);
      totalAmount += amtPaise;
      if (exp.status === "PENDING_APPROVAL") {
        pendingCount += 1;
        pendingAmount += amtPaise;
      } else if (exp.status === "POSTED") {
        approvedCount += 1;
        approvedAmount += amtPaise;
      } else if (exp.status === "REJECTED") {
        rejectedCount += 1;
        rejectedAmount += amtPaise;
      }
    }

    return {
      totalCount,
      totalAmount,
      pendingCount,
      pendingAmount,
      approvedCount,
      approvedAmount,
      rejectedCount,
      rejectedAmount,
    };
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    let list = expenses;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (e) =>
          cleanExpenseTitle(e.title).toLowerCase().includes(q) ||
          e.paidTo.toLowerCase().includes(q) ||
          e.referenceNumber.toLowerCase().includes(q) ||
          e.creator?.name?.toLowerCase().includes(q) ||
          e.site?.name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [expenses, search]);

  const expenseColumns: ExcelColumn<ExpenseItem>[] = useMemo(
    () => [
      {
        key: "expenseDate",
        label: "Date",
        accessor: (e) => e.expenseDate,
        type: "date",
      },
      {
        key: "title",
        label: "Expense Purpose / Description",
        accessor: (e) => cleanExpenseTitle(e.title),
        type: "text",
      },
      {
        key: "category",
        label: "Category",
        accessor: (e) => CATEGORY_LABELS[e.category] || e.category,
        type: "text",
      },
      {
        key: "amount",
        label: "Amount (₹)",
        accessor: (e) => (e.amountPaise ? e.amountPaise / 100 : (Number(e.amount) || 0)),
        type: "currency",
        align: "right",
      },
      {
        key: "creator",
        label: "Claimed By",
        accessor: (e) => e.creator?.name || "Staff",
        type: "text",
      },
    ],
    []
  );

  const excelExpenses = useExcelTable({
    data: filteredExpenses,
    columns: expenseColumns,
  });

  return (
    <Shell>
      <div className="space-y-6">
        {/* Page Header */}
        <PageHeader
          icon={Receipt}
          title="Out-of-Pocket Expenses"
          subtitle="Record site expenses paid with your own money and upload the receipt photo to get reimbursed."
        >
          <button
            onClick={() => {
              setShowLogModal(true);
              setReceiptError(null);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Out-of-Pocket Expense</span>
          </button>
        </PageHeader>

        {/* Feedback Alert */}
        {feedback && (
          <Alert tone={feedback.tone}>
            <div className="flex items-center justify-between">
              <span>{feedback.message}</span>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </Alert>
        )}

        {/* Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
              <span>Total Claims</span>
              <Wallet className="w-4 h-4 text-slate-400" />
            </div>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight leading-tight truncate" title={formatCurrency(metrics.totalAmount)}>
              {formatCompactINR(metrics.totalAmount)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{metrics.totalCount} expense claim(s)</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs">
            <div className="flex items-center justify-between text-amber-800 text-xs font-semibold mb-1">
              <span>Waiting for Approval</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-amber-700 tabular-nums tracking-tight leading-tight truncate" title={formatCurrency(metrics.pendingAmount)}>
              {formatCompactINR(metrics.pendingAmount)}
            </div>
            <div className="text-[11px] text-amber-700 font-medium mt-1">
              {metrics.pendingCount} claim(s) waiting for approval
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
            <div className="flex items-center justify-between text-emerald-800 text-xs font-semibold mb-1">
              <span>Approved for Reimbursement</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-emerald-700 tabular-nums tracking-tight leading-tight truncate" title={formatCurrency(metrics.approvedAmount)}>
              {formatCompactINR(metrics.approvedAmount)}
            </div>
            <div className="text-[11px] text-emerald-700 font-medium mt-1">
              {metrics.approvedCount} claim(s) approved
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
              <span>Declined</span>
              <XCircle className="w-4 h-4 text-rose-400" />
            </div>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-slate-700 tabular-nums tracking-tight leading-tight truncate" title={formatCurrency(metrics.rejectedAmount)}>
              {formatCompactINR(metrics.rejectedAmount)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{metrics.rejectedCount} claim(s) declined</div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by item, shop name, reference #, or staff member..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0 overflow-x-auto max-w-full w-full sm:w-auto py-1 px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(["ALL", "PENDING_APPROVAL", "POSTED", "REJECTED"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === st
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                }`}
              >
                {st === "ALL"
                  ? "All Status"
                  : st === "PENDING_APPROVAL"
                  ? "Waiting for Approval"
                  : st === "POSTED"
                  ? "Approved"
                  : "Declined"}
              </button>
            ))}
          </div>
        </div>

        {/* Expenses Table */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-200/60 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <div className="text-base font-bold text-slate-800">No out-of-pocket expenses yet</div>
            <div className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              When you pay for site supplies, fuel, or travel with personal money, add the expense here with a receipt photo so finance can reimburse you.
            </div>
            <button
              onClick={() => setShowLogModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Your First Expense</span>
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <ExcelTableToolbar
              table={excelExpenses}
              columns={expenseColumns}
              tableName="expenses"
              showSearch={true}
              showExport={true}
            />
            {/* Desktop Table View (≥ lg screens) */}
            <div className="hidden lg:block overflow-x-auto min-h-[400px]">
              <table className="w-full text-left text-sm min-w-[850px]">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    {expenseColumns.map((col) => (
                      <ExcelColumnHeader
                        key={col.key}
                        column={col}
                        table={excelExpenses}
                        theme="darkHeader"
                      />
                    ))}
                    <th className="py-3 px-4 text-center">Receipt Photo</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {excelExpenses.filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={expenseColumns.length + 2} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Filter className="w-8 h-8 text-slate-300" />
                          <p className="font-semibold text-slate-700">No expenses match selected filters</p>
                          <button
                            type="button"
                            onClick={excelExpenses.clearAllFilters}
                            className="mt-2 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs"
                          >
                            Reset Filters
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    excelExpenses.paginatedData.map((exp) => {
                      const receipt = exp.receipt || (exp.attachments && exp.attachments[0]) || null;
                      const isPending = exp.status === "PENDING_APPROVAL";

                      return (
                        <tr key={exp.id} className="hover:bg-amber-50/30 transition-colors">
                          <td className="py-3.5 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                            {formatDate(exp.expenseDate)}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">{cleanExpenseTitle(exp.title)}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{exp.referenceNumber}</div>
                            {exp.site && (
                              <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                <Building2 className="w-3 h-3 text-slate-400" />
                                <span>{exp.site.name}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              {CATEGORY_LABELS[exp.category] || exp.category}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-slate-900 font-mono tabular-nums text-sm">
                            {formatCurrency(exp.amountPaise ?? (exp.amount ? Math.round(exp.amount * 100) : 0))}
                          </td>
                          <td className="py-3.5 px-4 text-slate-700 text-xs">
                            <div className="font-bold">{exp.creator?.name || "Staff"}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {exp.creator?.role?.replace("_", " ") || "Supervisor"}
                            </div>
                          </td>
                          {/* Receipt Photo Column */}
                          <td className="py-3.5 px-4 text-center">
                            {receipt ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setViewingReceipt({
                                    url: receipt.url,
                                    fileName: receipt.fileName,
                                    title: exp.title,
                                  })
                                }
                                className="group/rc inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 transition cursor-pointer text-xs font-semibold text-slate-700 hover:text-amber-800"
                                title="Click to view full receipt photo"
                              >
                                <Camera className="w-3.5 h-3.5 text-amber-500 group-hover/rc:text-amber-600" />
                                <span>View Receipt</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">No receipt</span>
                            )}
                          </td>
                          {/* Actions Column */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(exp)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
                                title="Update expense"
                              >
                                <Edit2 className="w-3.5 h-3.5 shrink-0" />
                                <span>Update</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleConfirmDelete(exp)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
                                title="Delete expense"
                              >
                                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Card View (< lg screens: No horizontal scroll, secondary fields hidden) */}
            <div className="lg:hidden p-3 bg-slate-50/60 space-y-3 min-h-[300px]">
              {excelExpenses.filteredData.length === 0 ? (
                <div className="py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                  <Filter className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">No expenses match selected filters</p>
                  <button
                    type="button"
                    onClick={excelExpenses.clearAllFilters}
                    className="mt-2 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                excelExpenses.paginatedData.map((exp) => {
                  const receipt = exp.receipt || (exp.attachments && exp.attachments[0]) || null;
                  const isPending = exp.status === "PENDING_APPROVAL";

                  return (
                    <div key={`exp-card-${exp.id}`} className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all">
                      {/* Top: Ref #, Staff & Title */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-400 font-mono truncate">{exp.referenceNumber}</span>
                          <span className="text-[11px] font-semibold text-slate-500">{exp.creator?.name || "Staff"}</span>
                        </div>
                        <h4 className="font-bold text-slate-900 text-sm leading-snug">{cleanExpenseTitle(exp.title)}</h4>
                        {exp.site && (
                          <div className="text-xs text-slate-500 flex items-center gap-1.5 min-w-0">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{exp.site.name}</span>
                          </div>
                        )}
                      </div>

                      {/* Middle: Key Data (Amount & Date) */}
                      <div className="flex items-center justify-between gap-3 mt-3 pt-2.5 border-t border-slate-100 text-xs">
                        <div className="min-w-0">
                          <div className="text-[11px] text-slate-400 font-medium">Amount</div>
                          <div className="font-display text-base font-extrabold text-slate-900 tabular-nums truncate" title={formatCurrency(exp.amountPaise ?? (exp.amount ? Math.round(exp.amount * 100) : 0))}>
                            {formatCompactINR(exp.amountPaise ?? (exp.amount ? Math.round(exp.amount * 100) : 0))}
                          </div>
                        </div>

                        <div className="text-right min-w-0">
                          <div className="text-[11px] text-slate-400 font-medium">Expense Date</div>
                          <div className="text-xs font-semibold text-slate-700 font-mono mt-0.5">
                            {formatDate(exp.expenseDate)}
                          </div>
                        </div>
                      </div>

                      {/* Rejection Note if present */}
                      {exp.rejectionReason && (
                        <div className="mt-2 p-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                          <span className="font-bold">Reason:</span> {exp.rejectionReason}
                        </div>
                      )}

                      {/* Footer Actions: Receipt View, Update & Delete */}
                      <div className={`mt-3 pt-2.5 border-t border-slate-100 grid ${receipt ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
                        {receipt ? (
                          <button
                            type="button"
                            onClick={() =>
                              setViewingReceipt({
                                url: receipt.url,
                                fileName: receipt.fileName,
                                title: exp.title,
                              })
                            }
                            className="h-8 w-full flex items-center justify-center gap-1.5 px-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition cursor-pointer shadow-2xs"
                          >
                            <Camera className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="truncate">View Receipt</span>
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(exp)}
                          className="h-8 w-full flex items-center justify-center gap-1.5 px-2 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-800 transition cursor-pointer shadow-2xs"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Update</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleConfirmDelete(exp)}
                          className="h-8 w-full flex items-center justify-center gap-1.5 px-2 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-800 transition cursor-pointer shadow-2xs"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <TablePagination
              currentPage={excelExpenses.currentPage}
              totalPages={excelExpenses.totalPages}
              totalItems={excelExpenses.filteredCount}
              totalUnfiltered={excelExpenses.totalRecords}
              pageSize={excelExpenses.pageSize}
              startItem={excelExpenses.startItem}
              endItem={excelExpenses.endItem}
              onPageChange={excelExpenses.setCurrentPage}
              itemLabel="expenses"
            />
          </div>
        )}

        {/* Modal: Log New Out-of-Pocket Expense */}
        {showLogModal && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[92dvh] flex flex-col overflow-hidden animate-scale-in">
              <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 shrink-0 bg-white flex items-start sm:items-center justify-between gap-2">
                <div className="font-bold text-slate-900 text-base sm:text-lg flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                  <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg shrink-0 mt-0.5 sm:mt-0">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="leading-snug">Add Out-of-Pocket Expense</div>
                    <div className="text-xs font-normal text-slate-500 mt-0.5 leading-snug">
                      Submit a personal site expense with a receipt photo for reimbursement
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowLogModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitExpense} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 sm:space-y-4">
                {receiptError && <Alert tone="error">{receiptError}</Alert>}

                {/* Expense Purpose / Title */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Expense Purpose / Items Purchased <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bought 2 bags cement & binding wire from local hardware"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Amount & Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Amount Spent (₹) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      placeholder="e.g. 1450"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Expense Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Paid To & Payment Mode */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Paid To (Shop / Person) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sharma Hardware / Petrol Pump"
                      value={paidTo}
                      onChange={(e) => setPaidTo(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      How You Paid <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="PERSONAL_UPI">Personal UPI (GPay / PhonePe / Paytm)</option>
                      <option value="PERSONAL_CASH">Personal Cash</option>
                      <option value="PERSONAL_CARD">Personal Debit / Credit Card</option>
                      <option value="OTHER">Other Personal Mode</option>
                    </select>
                  </div>
                </div>

                {/* Category & Site */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Expense Category <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="MATERIALS">Materials & Hardware</option>
                      <option value="EQUIPMENT">Fuel & Generator Diesel</option>
                      <option value="TRANSPORT">Transport & Delivery / Auto / Tempo</option>
                      <option value="LABOUR">Labour Tea & Refreshments</option>
                      <option value="SITE_OFFICE">Site Office & Consumables</option>
                      <option value="REPAIRS">Minor Repairs & Tools</option>
                      <option value="OTHER">Other Site Expense</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Construction Site
                    </label>
                    <select
                      value={selectedSiteId}
                      onChange={(e) => setSelectedSiteId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">General Site / HQ</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* MANDATORY RECEIPT PHOTO ATTACHMENT */}
                <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-300">
                  <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
                    <label className="text-xs font-black text-amber-950 uppercase tracking-wide whitespace-nowrap">
                      📷 Receipt Photo <span className="text-rose-600 font-black">* MANDATORY</span>
                    </label>
                    <span className="text-[11px] text-amber-700 font-semibold whitespace-nowrap">JPG, PNG, WebP or PDF</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mb-2.5">
                    Upload a clear, well-lit photo or PDF (under 5 MB) of the shop bill, cash memo, or UPI payment screenshot.
                  </p>

                  <div className="relative">
                    <input
                      type="file"
                      ref={cameraInputRef}
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoSelect}
                      className="sr-only"
                      id="receipt-camera-input"
                    />
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*,application/pdf"
                      onChange={handlePhotoSelect}
                      className="sr-only"
                      id="receipt-photo-input"
                    />

                    {receiptFile ? (
                      <div className="bg-white p-3 rounded-lg border border-amber-200 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {receiptPreview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={receiptPreview}
                              alt="Receipt preview"
                              className="w-12 h-12 object-cover rounded-md border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-md bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                              <Receipt className="w-6 h-6" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-slate-900 truncate">
                              {receiptFile.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {(receiptFile.size / 1024).toFixed(1)} KB • Receipt attached ✓
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleClearPhoto}
                          className="p-2 text-slate-400 hover:text-rose-600 rounded-md transition"
                          title="Remove receipt"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="py-3.5 px-3 border-2 border-dashed border-amber-300 hover:border-amber-500 rounded-lg bg-white/80 hover:bg-white text-center transition flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Camera className="w-4 h-4 text-amber-700" />
                          <span className="font-bold text-xs text-slate-900">Take Photo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="py-3.5 px-3 border-2 border-dashed border-slate-300 hover:border-slate-500 rounded-lg bg-white/80 hover:bg-white text-center transition flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Upload className="w-4 h-4 text-slate-700" />
                          <span className="font-bold text-xs text-slate-900">Choose Receipt / PDF</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Supervisor Remarks */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Notes / Remarks (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Add any extra notes for the admin or finance team..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowLogModal(false)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs whitespace-nowrap transition shrink-0"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !receiptFile}
                    className="px-4 sm:px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-slate-200 disabled:text-slate-400 text-slate-950 font-black text-xs whitespace-nowrap shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin shrink-0" />
                        <span>{uploadingReceipt ? "Uploading Photo..." : "Submitting..."}</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 shrink-0" />
                        <span className="sm:hidden">Submit Expense</span>
                        <span className="hidden sm:inline">Submit Expense for Approval</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: View Receipt Photo */}
        {viewingReceipt && (
          <div className="fixed inset-0 z-[80] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh] animate-scale-in">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
                <div>
                  <div className="font-bold text-slate-900 text-sm">{cleanExpenseTitle(viewingReceipt.title)}</div>
                  <div className="text-xs text-slate-400 font-mono">{viewingReceipt.fileName}</div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={viewingReceipt.url}
                    target="_blank"
                    rel="noreferrer"
                    download={viewingReceipt.fileName}
                    className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                    title="Open or Download"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setViewingReceipt(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4 bg-slate-900 flex items-center justify-center min-h-[300px]">
                {viewingReceipt.url.toLowerCase().includes(".pdf") || viewingReceipt.fileName.toLowerCase().endsWith(".pdf") ? (
                  <>
                    <div className="sm:hidden flex flex-col items-center justify-center text-center text-white p-6 space-y-3">
                      <FileText className="w-12 h-12 text-amber-400" />
                      <div className="text-sm font-bold">{viewingReceipt.fileName}</div>
                      <p className="text-xs text-slate-400 max-w-xs">
                        Tap below to view or download the full PDF receipt on your device.
                      </p>
                      <a
                        href={viewingReceipt.url}
                        target="_blank"
                        rel="noreferrer"
                        download={viewingReceipt.fileName}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-black"
                      >
                        <Download className="w-4 h-4" /> Open / Download PDF
                      </a>
                    </div>
                    <iframe
                      src={viewingReceipt.url}
                      title={viewingReceipt.fileName}
                      className="hidden sm:block w-full h-[70dvh] rounded-lg bg-white"
                    />
                  </>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={viewingReceipt.url}
                    alt={viewingReceipt.fileName}
                    className="max-h-[75dvh] max-w-full object-contain rounded shadow-lg"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal: Approve Expense Claim Confirmation */}
        {pendingApproveExpenseId && (
          <div className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto animate-scale-in space-y-3">
              <div className="font-bold text-slate-900 text-base">Approve Expense Claim</div>
              <p className="text-xs text-slate-600">
                Approve this expense claim for reimbursement?
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPendingApproveExpenseId(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmApproveExpense}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                >
                  Confirm Approval
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Reject Expense Claim Reason */}
        {rejectingExpenseId && (
          <div className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 animate-scale-in">
              <div className="font-bold text-slate-900 text-base mb-1">Decline Out-of-Pocket Claim</div>
              <div className="text-xs text-slate-500 mb-3">
                Provide a reason to inform the supervisor why this expense claim was not approved.
              </div>

              <form onSubmit={handleRejectSubmit} className="space-y-3">
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Bill is illegible / Amount does not match site requirement / Please upload full invoice"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
                />

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setRejectingExpenseId(null)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={rejectSubmitting || !rejectionReason.trim()}
                    className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition disabled:opacity-50"
                  >
                    {rejectSubmitting ? "Declining..." : "Decline Claim"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit / Update Out-of-Pocket Expense */}
        {editingExpense && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[92dvh] flex flex-col overflow-hidden animate-scale-in">
              <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 shrink-0 bg-white flex items-start sm:items-center justify-between gap-2">
                <div className="font-bold text-slate-900 text-base sm:text-lg flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                  <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg shrink-0 mt-0.5 sm:mt-0">
                    <Edit2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="leading-snug">Update Out-of-Pocket Expense</div>
                    <div className="text-xs font-normal text-slate-500 mt-0.5 leading-snug">
                      Modify expense details or update the receipt photo
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setEditingExpense(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateExpense} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 sm:space-y-4">
                {editReceiptError && <Alert tone="error">{editReceiptError}</Alert>}

                {/* Expense Purpose / Title */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Expense Purpose / Items Purchased <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bought 2 bags cement & binding wire"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Amount & Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Amount Spent (₹) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      placeholder="e.g. 1500"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Expense Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={editExpenseDate}
                      onChange={(e) => setEditExpenseDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Paid To & Payment Mode */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Paid To (Shop / Person) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sharma Hardware"
                      value={editPaidTo}
                      onChange={(e) => setEditPaidTo(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      How You Paid <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={editPaymentMode}
                      onChange={(e) => setEditPaymentMode(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="PERSONAL_UPI">Personal UPI (GPay / PhonePe / Paytm)</option>
                      <option value="PERSONAL_CASH">Personal Cash</option>
                      <option value="PERSONAL_CARD">Personal Debit / Credit Card</option>
                      <option value="OTHER">Other Personal Mode</option>
                    </select>
                  </div>
                </div>

                {/* Category & Site */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Expense Category <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="MATERIALS">Materials & Hardware</option>
                      <option value="EQUIPMENT">Fuel & Generator Diesel</option>
                      <option value="TRANSPORT">Transport & Delivery / Auto / Tempo</option>
                      <option value="LABOUR">Labour Tea & Refreshments</option>
                      <option value="SITE_OFFICE">Site Office & Consumables</option>
                      <option value="REPAIRS">Minor Repairs & Tools</option>
                      <option value="OTHER">Other Site Expense</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Construction Site
                    </label>
                    <select
                      value={editSiteId}
                      onChange={(e) => setEditSiteId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">General Site / HQ</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Receipt Photo Section */}
                <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-300">
                  <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
                    <label className="text-xs font-black text-amber-950 uppercase tracking-wide whitespace-nowrap">
                      📷 Receipt Photo
                    </label>
                    <span className="text-[11px] text-amber-700 font-semibold whitespace-nowrap">JPG, PNG, WebP or PDF</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mb-2.5">
                    Keep the existing receipt or choose a replacement photo/PDF.
                  </p>

                  <div className="relative">
                    <input
                      type="file"
                      ref={editCameraInputRef}
                      accept="image/*"
                      capture="environment"
                      onChange={handleEditPhotoSelect}
                      className="sr-only"
                      id="edit-receipt-camera-input"
                    />
                    <input
                      type="file"
                      ref={editFileInputRef}
                      accept="image/*,application/pdf"
                      onChange={handleEditPhotoSelect}
                      className="sr-only"
                      id="edit-receipt-photo-input"
                    />

                    {editReceiptPreview || editReceiptFile ? (
                      <div className="bg-white p-3 rounded-lg border border-amber-200 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {editReceiptPreview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={editReceiptPreview}
                              alt="Receipt preview"
                              className="w-12 h-12 object-cover rounded-md border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-md bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                              <Receipt className="w-6 h-6" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-slate-900 truncate">
                              {editReceiptFile?.name || editingExpense.receipt?.fileName || "receipt-photo.jpg"}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {editReceiptFile ? `${(editReceiptFile.size / 1024).toFixed(1)} KB • New file selected` : "Current receipt attached ✓"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => editFileInputRef.current?.click()}
                            className="px-2 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded border border-amber-200"
                          >
                            Change
                          </button>
                          <button
                            type="button"
                            onClick={handleClearEditPhoto}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md transition"
                            title="Remove receipt"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => editCameraInputRef.current?.click()}
                          className="py-3 px-3 border-2 border-dashed border-amber-300 hover:border-amber-500 rounded-lg bg-white/80 hover:bg-white text-center transition flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Camera className="w-4 h-4 text-amber-700" />
                          <span className="font-bold text-xs text-slate-900">Take Photo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => editFileInputRef.current?.click()}
                          className="py-3 px-3 border-2 border-dashed border-slate-300 hover:border-slate-500 rounded-lg bg-white/80 hover:bg-white text-center transition flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Upload className="w-4 h-4 text-slate-700" />
                          <span className="font-bold text-xs text-slate-900">Choose Receipt / PDF</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Remarks */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Notes / Remarks (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Add any extra notes..."
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingExpense(null)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updatingExpense}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {updatingExpense ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                        <span>Saving Changes...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 text-slate-950" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Delete Expense Confirmation */}
        {deletingExpense && (
          <div className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 animate-scale-in space-y-3">
              <div className="flex items-center gap-2.5 text-rose-600 font-bold text-base">
                <Trash2 className="w-5 h-5" />
                <span>Delete Expense</span>
              </div>
              <p className="text-xs text-slate-600">
                Are you sure you want to delete the expense <strong className="text-slate-900">"{cleanExpenseTitle(deletingExpense.title)}"</strong> for <strong className="text-slate-900">{formatCurrency(deletingExpense.amountPaise ?? (deletingExpense.amount ? Math.round(deletingExpense.amount * 100) : 0))}</strong>?
              </p>
              <p className="text-[11px] text-slate-400">
                This record and its attached receipt photo will be permanently removed.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={deletingLoading}
                  onClick={() => setDeletingExpense(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingLoading}
                  onClick={handleDeleteExpense}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {deletingLoading ? "Deleting..." : "Delete Permanently"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
