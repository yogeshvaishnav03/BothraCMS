"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { useActiveSite } from "@/hooks/useActiveSite";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { compressImageFile } from "@/lib/image-compression";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, ExcelColumn } from "@/components/ui/ExcelTable";
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

  const isApprover = currentUser?.role && ["SUPER_ADMIN", "ORG_ADMIN", "ACCOUNTANT"].includes(currentUser.role);

  useEffect(() => {
    const anyModal = showLogModal || Boolean(viewingReceipt) || Boolean(rejectingExpenseId) || Boolean(pendingApproveExpenseId);
    if (!anyModal) return;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowLogModal(false);
        setViewingReceipt(null);
        setRejectingExpenseId(null);
        setPendingApproveExpenseId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showLogModal, viewingReceipt, rejectingExpenseId, pendingApproveExpenseId]);

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
      setReceiptError("Please upload an image (JPG, PNG, WebP) or PDF receipt.");
      return;
    }

    if (rawFile.type === "application/pdf" && rawFile.size > 5 * 1024 * 1024) {
      setReceiptError("Receipt PDF exceeds 5MB limit. Please upload a smaller file.");
      return;
    }

    const file = rawFile.type.startsWith("image/")
      ? await compressImageFile(rawFile, { preset: "receipt" })
      : rawFile;

    if (file.size > 5 * 1024 * 1024) {
      setReceiptError("Receipt file exceeds 5MB limit. Please upload a smaller photo.");
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
      setReceiptError("Attaching a photo of the receipt/bill is mandatory for out-of-pocket expenses.");
      return;
    }

    const amtNum = parseFloat(amount);
    if (isNaN(amtNum) || amtNum <= 0) {
      setFeedback({ tone: "error", message: "Please enter a valid expense amount in Rupees." });
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
        throw new Error(uploadJson.error?.message || "Failed to upload receipt photo. Please retry.");
      }

      const receiptFileId = uploadJson.data?.fileId || uploadJson.data?.id;
      if (!receiptFileId) {
        throw new Error("Invalid file identifier received from upload service.");
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
        throw new Error(resJson.error?.message || "Failed to submit out-of-pocket expense claim.");
      }

      setFeedback({
        tone: "success",
        message: `Expense claim of ₹${amtNum.toLocaleString("en-IN")} submitted successfully! Admin & Finance notified.`,
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
      setFeedback({ tone: "error", message: err.message || "Failed to submit expense." });
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
        setFeedback({ tone: "error", message: data.error?.message || "Failed to approve expense" });
        loadExpenses();
        return;
      }
      setFeedback({ tone: "success", message: "Expense claim approved successfully for reimbursement!" });
      loadExpenses();
      window.dispatchEvent(new CustomEvent("refreshExpenses"));
    } catch {
      setFeedback({ tone: "error", message: "Network error approving expense" });
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
        setFeedback({ tone: "error", message: data.error?.message || "Failed to decline expense" });
        loadExpenses();
        return;
      }
      setFeedback({ tone: "success", message: "Expense claim declined." });
      setRejectingExpenseId(null);
      setRejectionReason("");
      loadExpenses();
      window.dispatchEvent(new CustomEvent("refreshExpenses"));
    } catch {
      setFeedback({ tone: "error", message: "Network error declining expense" });
      loadExpenses();
    } finally {
      setRejectSubmitting(false);
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
      const amt = exp.amount || 0;
      totalAmount += amt;
      if (exp.status === "PENDING_APPROVAL") {
        pendingCount += 1;
        pendingAmount += amt;
      } else if (exp.status === "POSTED") {
        approvedCount += 1;
        approvedAmount += amt;
      } else if (exp.status === "REJECTED") {
        rejectedCount += 1;
        rejectedAmount += amt;
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
          e.title.toLowerCase().includes(q) ||
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
        accessor: (e) => e.title,
        type: "text",
      },
      {
        key: "paidTo",
        label: "Paid To (Shop / Recipient)",
        accessor: (e) => e.paidTo,
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
        accessor: (e) => Number(e.amount) || 0,
        type: "currency",
        align: "right",
      },
      {
        key: "creator",
        label: "Claimed By",
        accessor: (e) => e.creator?.name || "Staff",
        type: "text",
      },
      {
        key: "status",
        label: "Status",
        accessor: (e) =>
          e.status === "POSTED"
            ? "Approved"
            : e.status === "REJECTED"
            ? "Declined"
            : "Pending Review",
        type: "text",
        align: "center",
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
          subtitle="Supervisors can log site expenses paid out of personal funds with mandatory photo receipts for review & reimbursement."
        >
          <button
            onClick={() => {
              setShowLogModal(true);
              setReceiptError(null);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Log Out-of-Pocket Expense</span>
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
            <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
              {formatCurrency(metrics.totalAmount)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{metrics.totalCount} expense claim(s)</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs">
            <div className="flex items-center justify-between text-amber-800 text-xs font-semibold mb-1">
              <span>Pending Review</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-700 font-mono">
              {formatCurrency(metrics.pendingAmount)}
            </div>
            <div className="text-[11px] text-amber-700 font-medium mt-1">
              {metrics.pendingCount} claim(s) awaiting approval
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
            <div className="flex items-center justify-between text-emerald-800 text-xs font-semibold mb-1">
              <span>Approved / Reimbursed</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-700 font-mono">
              {formatCurrency(metrics.approvedAmount)}
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
            <div className="text-xl sm:text-2xl font-black text-slate-700 font-mono">
              {formatCurrency(metrics.rejectedAmount)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{metrics.rejectedCount} claim(s) rejected</div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search expenses by title, shop name, ref no, or supervisor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0 overflow-x-auto w-full sm:w-auto">
            {(["ALL", "PENDING_APPROVAL", "POSTED", "REJECTED"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  statusFilter === st
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                }`}
              >
                {st === "ALL"
                  ? "All Status"
                  : st === "PENDING_APPROVAL"
                  ? "Pending Review"
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
            <div className="text-base font-bold text-slate-800">No out-of-pocket expenses found</div>
            <div className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Supervisors who pay for materials, local transport, diesel, or site refreshments using their own money can
              log them here. Photo receipt is mandatory.
            </div>
            <button
              onClick={() => setShowLogModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Log First Expense Claim</span>
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
                    excelExpenses.filteredData.map((exp) => {
                      const receipt = exp.receipt || (exp.attachments && exp.attachments[0]) || null;
                      const isPending = exp.status === "PENDING_APPROVAL";

                      return (
                        <tr key={exp.id} className="hover:bg-amber-50/30 transition-colors">
                          <td className="py-3.5 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                            {formatDate(exp.expenseDate)}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">{exp.title}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{exp.referenceNumber}</div>
                            {exp.site && (
                              <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                <Building2 className="w-3 h-3 text-slate-400" />
                                <span>{exp.site.name}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-700">
                            <div className="font-semibold text-slate-900">{exp.paidTo}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {exp.paymentMode === "PERSONAL_UPI"
                                ? "Personal UPI / GPay"
                                : exp.paymentMode === "PERSONAL_CASH"
                                ? "Personal Cash"
                                : exp.paymentMode === "PERSONAL_CARD"
                                ? "Personal Card"
                                : "Other"}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              {CATEGORY_LABELS[exp.category] || exp.category}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-slate-900 font-mono tabular-nums text-sm">
                            {formatCurrency(exp.amount)}
                          </td>
                          <td className="py-3.5 px-4 text-slate-700 text-xs">
                            <div className="font-bold">{exp.creator?.name || "Staff"}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {exp.creator?.role?.replace("_", " ") || "Supervisor"}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {exp.status === "POSTED" ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Approved
                              </span>
                            ) : exp.status === "REJECTED" ? (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-800"
                                title={exp.rejectionReason || "Declined"}
                              >
                                <XCircle className="w-3.5 h-3.5 text-rose-600" /> Declined
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                                <Clock className="w-3.5 h-3.5 text-amber-600" /> Pending Review
                              </span>
                            )}
                            {exp.rejectionReason && (
                              <div className="text-[10px] text-rose-600 font-medium mt-0.5 max-w-[150px] mx-auto truncate" title={exp.rejectionReason}>
                                {exp.rejectionReason}
                              </div>
                            )}
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
                                <span>View Bill</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">No receipt</span>
                            )}
                          </td>
                          {/* Actions Column */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isApprover && isPending ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleApproveExpense(exp.id)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer shadow-xs"
                                    title="Approve for reimbursement"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Approve</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRejectingExpenseId(exp.id);
                                      setRejectionReason("");
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer"
                                    title="Decline reimbursement"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    <span>Decline</span>
                                  </button>
                                </>
                              ) : receipt ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setViewingReceipt({
                                      url: receipt.url,
                                      fileName: receipt.fileName,
                                      title: exp.title,
                                    })
                                  }
                                  className="text-amber-600 hover:text-amber-700 text-xs font-bold inline-flex items-center gap-1"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Details</span>
                                </button>
                              ) : (
                                <span className="text-slate-400 text-xs">—</span>
                              )}
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
                excelExpenses.filteredData.map((exp) => {
                  const receipt = exp.receipt || (exp.attachments && exp.attachments[0]) || null;
                  const isPending = exp.status === "PENDING_APPROVAL";

                  return (
                    <div key={`exp-card-${exp.id}`} className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all">
                      {/* Top: Title, Ref # and Status Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-slate-900 text-sm leading-snug">{exp.title}</h4>
                          <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>{exp.referenceNumber}</span>
                            {exp.site && (
                              <span className="text-[11px] text-slate-500 flex items-center gap-1 font-sans">
                                <Building2 className="w-3 h-3 text-slate-400" />
                                <span>{exp.site.name}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0">
                          {exp.status === "POSTED" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Approved
                            </span>
                          ) : exp.status === "REJECTED" ? (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800"
                              title={exp.rejectionReason || "Declined"}
                            >
                              <XCircle className="w-3 h-3 text-rose-600" /> Declined
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              <Clock className="w-3 h-3 text-amber-600" /> Pending Review
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Middle: Key Data Grid (Amount, Paid To, Date) - Category & user ID hidden */}
                      <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs">
                        <div>
                          <div className="text-[11px] text-slate-400 font-medium">Amount</div>
                          <div className="text-base font-black text-slate-900 font-mono tabular-nums">
                            {formatCurrency(exp.amount)}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[11px] text-slate-400 font-medium">Paid To / Shop</div>
                          <div className="font-semibold text-slate-800 truncate" title={exp.paidTo}>
                            {exp.paidTo}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
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

                      {/* Footer Actions: Receipt View & Approvals */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
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
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 text-xs font-semibold text-slate-700 hover:text-amber-800 transition cursor-pointer"
                          >
                            <Camera className="w-3.5 h-3.5 text-amber-500" />
                            <span>View Bill Photo</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No receipt attached</span>
                        )}

                        <div className="flex items-center gap-1.5 ml-auto">
                          {isApprover && isPending ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApproveExpense(exp.id)}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer shadow-xs"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Approve</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectingExpenseId(exp.id);
                                  setRejectionReason("");
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Decline</span>
                              </button>
                            </>
                          ) : receipt ? (
                            <button
                              type="button"
                              onClick={() =>
                                setViewingReceipt({
                                  url: receipt.url,
                                  fileName: receipt.fileName,
                                  title: exp.title,
                                })
                              }
                              className="text-amber-600 hover:text-amber-700 text-xs font-bold inline-flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Details</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Modal: Log New Out-of-Pocket Expense */}
        {showLogModal && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[92dvh] flex flex-col overflow-hidden animate-scale-in">
              <div className="p-5 pb-3 border-b border-slate-100 shrink-0 bg-white flex items-center justify-between">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <div>Log Out-of-Pocket Expense</div>
                    <div className="text-xs font-normal text-slate-500">
                      Supervisor / Staff Site Expense Claim
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowLogModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitExpense} className="flex-1 overflow-y-auto p-5 space-y-4">
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
                <div className="grid grid-cols-2 gap-3">
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
                <div className="grid grid-cols-2 gap-3">
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
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-black text-amber-950 uppercase tracking-wide">
                      📷 Receipt / Bill Photo <span className="text-rose-600 font-black">* MANDATORY</span>
                    </label>
                    <span className="text-[11px] text-amber-700 font-semibold">JPG, PNG, WebP or PDF</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mb-2.5">
                    Supervisors must attach a clear photo of the shop receipt, cash memo, or UPI transaction screenshot.
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
                    className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !receiptFile}
                    className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-slate-200 disabled:text-slate-400 text-slate-950 font-black text-xs shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        <span>{uploadingReceipt ? "Uploading Photo..." : "Submitting..."}</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Submit Expense Claim</span>
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
                  <div className="font-bold text-slate-900 text-sm">{viewingReceipt.title}</div>
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
                Confirm approval of this out-of-pocket expense claim for reimbursement?
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
      </div>
    </Shell>
  );
}
