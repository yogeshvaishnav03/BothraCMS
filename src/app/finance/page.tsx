"use client";

import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import SearchableSelect from "@/components/ui/SearchableSelect";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatCompactINR, formatDate, formatShortBillNumber, formatShortName } from "@/lib/formatters";
import {
  DollarSign,
  Plus,
  Receipt,
  FileText,
  CreditCard,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  X,
  Search,
  Trash2,
  Landmark,
  XCircle,
  Clock,
  UserCheck,
  Paperclip,
  Calendar,
  Filter,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Download,
  Building2,
  Users,
  Briefcase,
  FileSpreadsheet,
  Edit2,
} from "lucide-react";
import AttachmentManager from "@/components/attachments/AttachmentManager";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, TablePagination, ExcelColumn } from "@/components/ui/ExcelTable";
import { canUser } from "@/lib/permissions";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import { useActiveSite } from "@/hooks/useActiveSite";

export default function FinancePage() {
  const { activeSiteId, setActiveSiteId } = useActiveSite();
  const { refreshUser, refreshSites } = useAppSession();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const canReadFinance = canUser(currentUser, "finance:read");
  const canWriteFinance = canUser(currentUser, "finance:write");
  const canReverseFinance = canUser(currentUser, "finance:reverse");
  const [sites, setSites] = useState<any[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [bills, setBills] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"BILLS" | "PAYMENTS">("PAYMENTS");

  // Attachment Modal state (Priority 3)
  const [attachmentTarget, setAttachmentTarget] = useState<{
    type: string;
    id: string;
    title: string;
    categoryDefault?: string;
  } | null>(null);
  const [approvePaymentTarget, setApprovePaymentTarget] = useState<any | null>(null);
  const [rejectPaymentTarget, setRejectPaymentTarget] = useState<any | null>(null);
  const [rejectPaymentReason, setRejectPaymentReason] = useState("Payment request was declined");
  const [approvalActionSubmitting, setApprovalActionSubmitting] = useState(false);

  // Payment Modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [recipientType, setRecipientType] = useState<"VENDOR" | "CONTRACTOR" | "EMPLOYEE">("VENDOR");
  const [recipientName, setRecipientName] = useState("");
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [workforce, setWorkforce] = useState<any[]>([]);
  const [payingAccount, setPayingAccount] = useState("HDFC Bank Operating A/C (A/C: ...4421)");
  const [customPayingAccount, setCustomPayingAccount] = useState("");
  const [approvalQuery, setApprovalQuery] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [selectedBillId, setSelectedBillId] = useState("");
  const [notes, setNotes] = useState("");
  // TDS on a payment to a contractor (194C), professional (194J) or landlord (194I)
  const [tdsMode, setTdsMode] = useState<"AUTO" | "NONE" | "MANUAL">("AUTO");
  const [tdsManual, setTdsManual] = useState("");
  const [tdsReason, setTdsReason] = useState("");
  const [tdsPreview, setTdsPreview] = useState<any>(null);

  // Bill Modal state
  const [showBillModal, setShowBillModal] = useState(false);
  const [editingBill, setEditingBill] = useState<any>(null);
  const [editBillReason, setEditBillReason] = useState("");
  const [editBillNumber, setEditBillNumber] = useState("");
  const [editBillDate, setEditBillDate] = useState("");
  const [editBillDueDate, setEditBillDueDate] = useState("");
  const [editBillNotes, setEditBillNotes] = useState("");
  const [editBillCostHead, setEditBillCostHead] = useState("");
  const [billPartyId, setBillPartyId] = useState("");
  const [billProjectId, setBillProjectId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().split("T")[0]);
  const [billDueDate, setBillDueDate] = useState("");
  const [billNotes, setBillNotes] = useState("");
  const [billGstRate, setBillGstRate] = useState("");
  const [billTaxType, setBillTaxType] = useState<"AUTO" | "LOCAL" | "IGST">("AUTO");
  const [billItc, setBillItc] = useState(true);
  const [billRcm, setBillRcm] = useState(false);
  const [billLines, setBillLines] = useState<
    Array<{ description: string; materialId: string; quantity: string; unitRate: string; lineTotal: string; gstRate?: string }>
  >([{ description: "", materialId: "", quantity: "", unitRate: "", lineTotal: "" }]);

  // Reversal Modal state
  const [showReverseModal, setShowReverseModal] = useState(false);
  const [paymentToReverse, setPaymentToReverse] = useState<any>(null);
  const [reverseReason, setReverseReason] = useState("");

  // Search & Filter state for Payments Register
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentFromDate, setPaymentFromDate] = useState("");
  const [paymentToDate, setPaymentToDate] = useState("");
  const [paymentPayeeType, setPaymentPayeeType] = useState("ALL");
  const [paymentPayingAccount, setPaymentPayingAccount] = useState("ALL");
  const [paymentMethod, setPaymentMethod] = useState("ALL");
  const [paymentStatus, setPaymentStatus] = useState("ALL");
  const [paymentReason, setPaymentReason] = useState("");
  const [paymentAllocatedTo, setPaymentAllocatedTo] = useState("");
  const [paymentMinAmount, setPaymentMinAmount] = useState("");
  const [paymentMaxAmount, setPaymentMaxAmount] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [datePreset, setDatePreset] = useState<"ALL" | "TODAY" | "THIS_MONTH" | "LAST_30" | "CUSTOM">("ALL");
  const [amountPreset, setAmountPreset] = useState<"ALL" | "UNDER_50K" | "50K_2L" | "OVER_2L" | "CUSTOM">("ALL");

  // Search & Filter state for Vendor Bills
  const [billSearch, setBillSearch] = useState("");
  const [billStatus, setBillStatus] = useState("ALL");

  // Feedback states
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Synchronize finance page with global active site filter
  useEffect(() => {
    setSelectedSiteId(activeSiteId || "");
    setSelectedProjectId("");
  }, [activeSiteId]);

  const loadData = useCallback(() => {
    setLoading(true);
    const noCacheInit: RequestInit = {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    };
    const t = Date.now();
    Promise.all([
      refreshUser().then((user) => ({ success: Boolean(user), data: { user } })),
      refreshSites().then((data) => ({ success: true, data })),
      fetch(`/api/finance/bills?_t=${t}`, noCacheInit).then((r) => r.json()),
      fetch(`/api/finance/payments?_t=${t}`, noCacheInit).then((r) => r.json()),
      fetch(`/api/parties?_t=${t}`, noCacheInit).then((r) => r.json()),
      fetch(`/api/projects?_t=${t}`, noCacheInit).then((r) => r.json()),
      fetch(`/api/materials?_t=${t}`, noCacheInit).then((r) => r.json()),
      fetch(`/api/workforce?_t=${t}`, noCacheInit).then((r) => r.json()).catch(() => ({})),
    ])
      .then(([meRes, sitesRes, billsRes, paymentsRes, partiesRes, projRes, matRes, wfRes]) => {
        if (meRes.success && meRes.data) {
          setCurrentUser(meRes.data.user);
          if (meRes.data.user.role === "SUPER_ADMIN") {
            setAutoApprove(true);
          }
        }
        if (sitesRes && sitesRes.success && sitesRes.data) {
          setSites(sitesRes.data || []);
        }
        if (billsRes.success) setBills(billsRes.data || []);
        if (paymentsRes.success) setPayments(paymentsRes.data || []);
        if (partiesRes.success) setParties(partiesRes.data || []);
        if (projRes.success) setProjects(projRes.data || []);
        if (matRes.success) setMaterials(matRes.data || []);
        if (wfRes && wfRes.success) setWorkforce(wfRes.data || []);
      })
      .catch((err) => {
        console.error("Authoritative finance data load failed:", err);
      })
      .finally(() => setLoading(false));
  }, [refreshUser, refreshSites]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowPaymentModal(false);
        setShowBillModal(false);
        setShowReverseModal(false);
        setAttachmentTarget(null);
        setApprovePaymentTarget(null);
        setRejectPaymentTarget(null);
      }
    };
    if (showPaymentModal || showBillModal || showReverseModal || attachmentTarget || approvePaymentTarget || rejectPaymentTarget) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [showPaymentModal, showBillModal, showReverseModal, attachmentTarget, approvePaymentTarget, rejectPaymentTarget]);

  // Ask the server what TDS this payment would hold back, as the form changes.
  useEffect(() => {
    const paise = Math.round(parseFloat(amount || "0") * 100);
    if (!showPaymentModal || recipientType === "EMPLOYEE" || !selectedPartyId || !(paise > 0)) {
      setTdsPreview(null);
      return;
    }
    const t = setTimeout(() => {
      fetch("/api/finance/payments/tds-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId: selectedPartyId,
          amount: paise,
          paymentDate: new Date().toISOString(),
          allocations: selectedBillId ? [{ billId: selectedBillId, amount: paise }] : undefined,
          tds: { mode: tdsMode, amount: tdsMode === "MANUAL" ? Math.round(parseFloat(tdsManual || "0") * 100) : undefined, reason: tdsReason || null },
        }),
      })
        .then((r) => r.json())
        .then((d) => setTdsPreview(d?.success ? d.data : null))
        .catch(() => setTdsPreview(null));
    }, 300);
    return () => clearTimeout(t);
  }, [showPaymentModal, recipientType, selectedPartyId, amount, selectedBillId, tdsMode, tdsManual, tdsReason]);

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const paymentAmountPaise = Math.round(parseFloat(amount) * 100);
    const idempotencyKey = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const effectivePayingAccount =
      payingAccount === "CUSTOM" ? customPayingAccount.trim() : payingAccount.trim();

    if (!effectivePayingAccount) {
      setErrorMessage("Please enter the bank or cash account you are paying from.");
      setSubmitting(false);
      return;
    }

    if (!approvalQuery || approvalQuery.trim().length === 0) {
      setErrorMessage("Please enter the purpose of this payment before submitting.");
      setSubmitting(false);
      return;
    }

    let finalPartyId: string | undefined = undefined;
    let finalRecipientName = recipientName.trim();

    if (recipientType !== "EMPLOYEE" && selectedPartyId) {
      finalPartyId = selectedPartyId;
      const foundParty = parties.find((p) => p.id === selectedPartyId);
      if (foundParty) {
        finalRecipientName = foundParty.name;
      }
    }

    if (!finalPartyId && !finalRecipientName) {
      setErrorMessage("Please select a vendor or contractor, or enter who you are paying.");
      setSubmitting(false);
      return;
    }

    try {
      const payload: any = {
        partyId: finalPartyId,
        recipientType,
        recipientName: finalRecipientName,
        payingAccount: effectivePayingAccount,
        approvalQuery: approvalQuery.trim(),
        paymentDate: new Date().toISOString(),
        amount: paymentAmountPaise,
        method,
        referenceNumber,
        idempotencyKey,
        notes: notes || undefined,
        autoApprove: currentUser?.role === "SUPER_ADMIN" ? autoApprove : false,
      };

      if (tdsPreview) {
        payload.tds = {
          mode: tdsMode,
          amount: tdsMode === "MANUAL" ? Math.round(parseFloat(tdsManual || "0") * 100) : undefined,
          reason: tdsMode === "AUTO" ? null : tdsReason.trim() || null,
        };
      }

      if (selectedBillId) {
        payload.allocations = [
          {
            billId: selectedBillId,
            amount: paymentAmountPaise,
          },
        ];
      }

      const res = await fetch("/api/finance/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not save payment. Please check the details and try again.");
      } else {
        const isPending = data.data?.payment?.status === "PENDING_APPROVAL";
        setStatusMessage(
          isPending
            ? `Payment request of ₹${amount} for ${finalRecipientName} sent for approval (from "${effectivePayingAccount}").`
            : `Payment of ₹${amount} saved from "${effectivePayingAccount}".`
        );
        setShowPaymentModal(false);
        setAmount("");
        setReferenceNumber("");
        setSelectedBillId("");
        setSelectedPartyId("");
        setRecipientName("");
        setApprovalQuery("");
        setCustomPayingAccount("");
        setNotes("");
        setTdsMode("AUTO");
        setTdsManual("");
        setTdsReason("");
        setTdsPreview(null);
        loadData();
      }
    } catch {
      setErrorMessage("Connection error while saving payment. Check your internet connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprovePayment = (payment: any) => {
    setApprovePaymentTarget(payment);
  };

  const executeApprovePayment = async () => {
    if (!approvePaymentTarget) return;
    const payment = approvePaymentTarget;
    const payeeName = payment.recipientName || payment.party?.name || "Recipient";
    setApprovalActionSubmitting(true);
    try {
      const res = await fetch(`/api/finance/payments/${payment.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Approved via Finance Register" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setApprovePaymentTarget(null);
        setStatusMessage(data.data?.message || `Payment to ${payeeName} has been approved.`);
        // Optimistically update payment status immediately so UI updates without refreshing
        setPayments((prev) => prev.map((p) => (p.id === payment.id ? { ...p, status: "APPROVED" } : p)));
        loadData();
      } else {
        setErrorMessage(data.error?.message || "Could not approve payment. Please try again.");
      }
    } catch {
      setErrorMessage("Connection error while approving payment. Check your internet and try again.");
    } finally {
      setApprovalActionSubmitting(false);
    }
  };

  const handleRejectPayment = (payment: any) => {
    setRejectPaymentReason("Payment request was declined");
    setRejectPaymentTarget(payment);
  };

  const executeRejectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectPaymentTarget || !rejectPaymentReason.trim()) return;
    const payment = rejectPaymentTarget;
    const payeeName = payment.recipientName || payment.party?.name || "Recipient";
    setApprovalActionSubmitting(true);
    try {
      const res = await fetch(`/api/finance/payments/${payment.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectPaymentReason.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRejectPaymentTarget(null);
        setStatusMessage(`Payment request for ${payeeName} was declined.`);
        // Optimistically update payment status immediately so UI updates without refreshing
        setPayments((prev) => prev.map((p) => (p.id === payment.id ? { ...p, status: "REJECTED" } : p)));
        loadData();
      } else {
        setErrorMessage(data.error?.message || "Could not decline payment. Please try again.");
      }
    } catch {
      setErrorMessage("Connection error while declining payment. Check your internet and try again.");
    } finally {
      setApprovalActionSubmitting(false);
    }
  };

  const handleReverseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentToReverse) return;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/finance/payments/${paymentToReverse.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reverseReason }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not reverse payment. Please try again.");
      } else {
        setStatusMessage(
          `Payment #${paymentToReverse.referenceNumber} reversed. Unpaid bill balances are restored and saved to Change History.`
        );
        // Optimistically update payment status immediately so UI updates without refreshing
        setPayments((prev) =>
          prev.map((p) => (p.id === paymentToReverse.id ? { ...p, status: "REVERSED" } : p))
        );
        setShowReverseModal(false);
        setPaymentToReverse(null);
        setReverseReason("");
        loadData();
      }
    } catch {
      setErrorMessage("Connection error while reversing payment. Check your internet and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const addBillLine = () => {
    setBillLines([
      ...billLines,
      { description: "", materialId: "", quantity: "", unitRate: "", lineTotal: "" },
    ]);
  };

  const removeBillLine = (index: number) => {
    if (billLines.length > 1) {
      setBillLines(billLines.filter((_, i) => i !== index));
    }
  };

  const updateBillLine = (index: number, field: string, value: string) => {
    const updated = [...billLines];
    const item = { ...updated[index], [field]: value };
    if ((field === "quantity" || field === "unitRate") && item.quantity && item.unitRate) {
      const q = parseFloat(item.quantity);
      const r = parseFloat(item.unitRate);
      if (!isNaN(q) && !isNaN(r)) {
        item.lineTotal = (q * r).toFixed(2);
      }
    }
    updated[index] = item;
    setBillLines(updated);
  };

  const handleBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billPartyId) {
      setErrorMessage("Please choose a vendor or contractor before saving this bill.");
      return;
    }
    if (!billNumber.trim()) {
      setErrorMessage("Please enter the bill or invoice number.");
      return;
    }

    const parsedLines = billLines.map((l) => {
      const qty = l.quantity ? parseFloat(l.quantity) : undefined;
      const rate = l.unitRate ? Math.round(parseFloat(l.unitRate) * 100) : undefined;
      const total = Math.round(parseFloat(l.lineTotal || "0") * 100);
      return {
        description: l.description || "Service / Supply Item",
        materialId: l.materialId || undefined,
        quantity: qty,
        unitRate: rate,
        lineTotal: total,
        gstRate: billGstRate !== "" && l.gstRate ? Number(l.gstRate) : undefined,
      };
    });

    if (parsedLines.some((l) => isNaN(l.lineTotal) || l.lineTotal <= 0)) {
      setErrorMessage("Each item line must have an amount greater than 0.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/finance/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId: billPartyId,
          projectId: billProjectId || undefined,
          billNumber: billNumber.trim(),
          billDate: new Date(billDate).toISOString(),
          dueDate: billDueDate ? new Date(billDueDate).toISOString() : undefined,
          notes: billNotes || undefined,
          gst:
            billGstRate === ""
              ? undefined
              : {
                  rate: Number(billGstRate),
                  interState: billTaxType === "AUTO" ? null : billTaxType === "IGST",
                  itcEligible: billItc,
                  reverseCharge: billRcm,
                },
          lines: parsedLines,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not save bill. Please check the details and try again.");
      } else {
        const totalAmountRupees = ((data.data?.totalAmount ?? parsedLines.reduce((s: number, l: any) => s + (l.lineTotal || 0), 0)) / 100).toFixed(2);
        setStatusMessage(`Bill #${billNumber} for ₹${totalAmountRupees} saved!`);
        setShowBillModal(false);
        setBillNumber("");
        setBillDueDate("");
        setBillNotes("");
        setBillGstRate("");
        setBillTaxType("AUTO");
        setBillItc(true);
        setBillRcm(false);
        setBillLines([{ description: "", materialId: "", quantity: "", unitRate: "", lineTotal: "" }]);
        loadData();
      }
    } catch {
      setErrorMessage("Connection error while saving bill. Check your internet connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter bills & payments by active site and target project
  const siteScopedBills = useMemo(() => {
    if (!selectedSiteId && !selectedProjectId) return bills;
    const siteProjectIds = selectedSiteId
      ? new Set(projects.filter((p) => p.siteId === selectedSiteId).map((p) => p.id))
      : null;

    return bills.filter((b) => {
      if (selectedProjectId) {
        return b.projectId === selectedProjectId;
      }
      if (selectedSiteId && siteProjectIds) {
        const bSiteId = b.project?.siteId || (b.projectId ? projects.find((pr) => pr.id === b.projectId)?.siteId : null);
        return bSiteId === selectedSiteId || (b.projectId && siteProjectIds.has(b.projectId));
      }
      return true;
    });
  }, [bills, selectedSiteId, selectedProjectId, projects]);

  const siteScopedPayments = useMemo(() => {
    if (!selectedSiteId && !selectedProjectId) return payments;
    const siteProjectIds = selectedSiteId
      ? new Set(projects.filter((p) => p.siteId === selectedSiteId).map((p) => p.id))
      : null;

    return payments.filter((p) => {
      if (selectedProjectId) {
        return p.projectId === selectedProjectId;
      }
      if (selectedSiteId && siteProjectIds) {
        const pSiteId = p.project?.siteId || (p.projectId ? projects.find((pr) => pr.id === p.projectId)?.siteId : null);
        return pSiteId === selectedSiteId || (p.projectId && siteProjectIds.has(p.projectId));
      }
      return true;
    });
  }, [payments, selectedSiteId, selectedProjectId, projects]);

  const totalBilledAll = siteScopedBills.reduce((sum: number, b: any) => sum + (b.totalAmount || 0), 0);
  const posted = siteScopedPayments.filter((p: any) => p.status === "POSTED");
  // Out of the bank; TDS held back from contractors is counted when it is deposited.
  const totalPaidAll = posted.reduce((sum: number, p: any) => sum + (p.amount || 0) - (p.tdsAmount || 0), 0);
  // Bills are settled by the full amount, TDS included.
  const totalOutstandingAll = totalBilledAll - posted.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

  const partyBills = siteScopedBills.filter(
    (b) => b.partyId === selectedPartyId && b.outstandingAmount > 0
  );

  // Distinct Paying Accounts extracted from existing payments
  const distinctPayingAccounts = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => {
      const acc = p.payingAccount?.trim() || "Company Primary Account";
      if (acc) set.add(acc);
    });
    return Array.from(set).sort();
  }, [payments]);

  // Distinct Methods extracted from existing payments
  const distinctMethods = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => {
      if (p.method) set.add(p.method);
    });
    return Array.from(set).sort();
  }, [payments]);

  const activePaymentFiltersCount = useMemo(() => {
    let count = 0;
    if (paymentSearch.trim()) count++;
    if (paymentFromDate) count++;
    if (paymentToDate) count++;
    if (paymentPayeeType !== "ALL") count++;
    if (paymentPayingAccount !== "ALL") count++;
    if (paymentMethod !== "ALL") count++;
    if (paymentStatus !== "ALL") count++;
    if (paymentReason.trim()) count++;
    if (paymentAllocatedTo.trim()) count++;
    if (paymentMinAmount.trim()) count++;
    if (paymentMaxAmount.trim()) count++;
    return count;
  }, [
    paymentSearch,
    paymentFromDate,
    paymentToDate,
    paymentPayeeType,
    paymentPayingAccount,
    paymentMethod,
    paymentStatus,
    paymentReason,
    paymentAllocatedTo,
    paymentMinAmount,
    paymentMaxAmount,
  ]);

  const clearAllPaymentFilters = () => {
    setPaymentSearch("");
    setPaymentFromDate("");
    setPaymentToDate("");
    setPaymentPayeeType("ALL");
    setPaymentPayingAccount("ALL");
    setPaymentMethod("ALL");
    setPaymentStatus("ALL");
    setPaymentReason("");
    setPaymentAllocatedTo("");
    setPaymentMinAmount("");
    setPaymentMaxAmount("");
    setDatePreset("ALL");
    setAmountPreset("ALL");
  };

  const paymentCounts = useMemo(() => {
    return {
      all: siteScopedPayments.length,
      posted: siteScopedPayments.filter((p) => p.status === "POSTED" || p.status === "APPROVED").length,
      pending: siteScopedPayments.filter((p) => p.status === "PENDING_APPROVAL").length,
      rejected: siteScopedPayments.filter((p) => p.status === "REJECTED").length,
      reversed: siteScopedPayments.filter((p) => p.status === "REVERSED").length,
      vendors: siteScopedPayments.filter((p) => (p.recipientType || p.party?.type || "VENDOR") === "VENDOR").length,
      contractors: siteScopedPayments.filter((p) => (p.recipientType || p.party?.type) === "CONTRACTOR").length,
      employees: siteScopedPayments.filter((p) => (p.recipientType || p.party?.type) === "EMPLOYEE").length,
    };
  }, [siteScopedPayments]);

  const handleDatePreset = (preset: "ALL" | "TODAY" | "THIS_MONTH" | "LAST_30" | "CUSTOM") => {
    setDatePreset(preset);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === "ALL") {
      setPaymentFromDate("");
      setPaymentToDate("");
    } else if (preset === "TODAY") {
      const todayStr = fmt(now);
      setPaymentFromDate(todayStr);
      setPaymentToDate(todayStr);
    } else if (preset === "THIS_MONTH") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      setPaymentFromDate(fmt(first));
      setPaymentToDate(fmt(now));
    } else if (preset === "LAST_30") {
      const past = new Date();
      past.setDate(now.getDate() - 30);
      setPaymentFromDate(fmt(past));
      setPaymentToDate(fmt(now));
    } else if (preset === "CUSTOM") {
      setShowAdvancedFilters(true);
    }
  };

  const handleAmountPreset = (preset: "ALL" | "UNDER_50K" | "50K_2L" | "OVER_2L" | "CUSTOM") => {
    setAmountPreset(preset);
    if (preset === "ALL") {
      setPaymentMinAmount("");
      setPaymentMaxAmount("");
    } else if (preset === "UNDER_50K") {
      setPaymentMinAmount("");
      setPaymentMaxAmount("50000");
    } else if (preset === "50K_2L") {
      setPaymentMinAmount("50000");
      setPaymentMaxAmount("200000");
    } else if (preset === "OVER_2L") {
      setPaymentMinAmount("200000");
      setPaymentMaxAmount("");
    } else if (preset === "CUSTOM") {
      setShowAdvancedFilters(true);
    }
  };

  const exportPaymentsToCSV = () => {
    if (filteredPayments.length === 0) return;
    const headers = [
      "Payment Date",
      "Ref Number",
      "Payee Name",
      "Payee Type",
      "Paid From (Account)",
      "Method",
      "Payment Purpose",
      "Linked Bills",
      "Amount (Rupees)",
      "Status",
    ];

    const rows = filteredPayments.map((p) => {
      const payee = (p.recipientName || p.party?.name || "Recipient").replace(/"/g, '""');
      const rType = p.recipientType || p.party?.type || "VENDOR";
      const payingAcc = (p.payingAccount || "Company Primary Account").replace(/"/g, '""');
      const note = (p.approvalQuery || p.notes || p.rejectionReason || "").replace(/"/g, '""');
      const allocs = (
        p.allocations && p.allocations.length > 0
          ? p.allocations.map((a: any) => `Bill #${a.bill?.billNumber || a.billId} (₹${((a.amount || 0) / 100).toFixed(2)})`).join("; ")
          : "Unallocated"
      ).replace(/"/g, '""');
      const amtRupees = ((p.amount || 0) / 100).toFixed(2);
      const st = p.status || "POSTED";

      return [
        `"${formatDate(p.paymentDate)}"`,
        `"${p.referenceNumber || ""}"`,
        `"${payee}"`,
        `"${rType}"`,
        `"${payingAcc}"`,
        `"${p.method || ""}"`,
        `"${note}"`,
        `"${allocs}"`,
        amtRupees,
        `"${st}"`,
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payments_register_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredPayments = useMemo(() => {
    return siteScopedPayments.filter((p) => {
      const payee = (p.recipientName || p.party?.name || "Recipient").toLowerCase();
      const rType = (p.recipientType || p.party?.type || "VENDOR").toUpperCase();
      const payingAcc = (p.payingAccount || "Company Primary Account").toLowerCase();
      const methodStr = (p.method || "").toUpperCase();
      const reasonStr = `${p.approvalQuery || ""} ${p.notes || ""} ${p.rejectionReason || ""}`.toLowerCase();
      const refStr = (p.referenceNumber || "").toLowerCase();
      const creatorName = (p.creator?.name || "").toLowerCase();

      // Allocations
      const hasAllocations = p.allocations && p.allocations.length > 0;
      const allocationsStr = hasAllocations
        ? p.allocations
            .map((a: any) => `bill #${a.bill?.billNumber || a.billId} ${a.bill?.billNumber || a.billId}`)
            .join(" ")
            .toLowerCase()
        : "unallocated missing bill allocation";

      const pStatus = (p.status || "").toUpperCase();
      const amtRupees = (Number(p.amount) || 0) / 100;
      const formattedDateStr = formatDate(p.paymentDate).toLowerCase();

      // Normalize date to YYYY-MM-DD
      let pDateYMD = "";
      if (p.paymentDate) {
        try {
          const d = typeof p.paymentDate === "string" ? new Date(p.paymentDate) : p.paymentDate;
          if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            pDateYMD = `${y}-${m}-${day}`;
          }
        } catch {
          pDateYMD = "";
        }
      }

      // 1. Global Search (matches across all columns)
      if (paymentSearch.trim()) {
        const q = paymentSearch.trim().toLowerCase();
        const matchesGlobal =
          payee.includes(q) ||
          rType.toLowerCase().includes(q) ||
          refStr.includes(q) ||
          payingAcc.includes(q) ||
          methodStr.toLowerCase().includes(q) ||
          reasonStr.includes(q) ||
          allocationsStr.includes(q) ||
          creatorName.includes(q) ||
          pStatus.toLowerCase().includes(q) ||
          amtRupees.toString().includes(q) ||
          (p.amount / 100).toFixed(2).includes(q) ||
          pDateYMD.includes(q) ||
          formattedDateStr.includes(q);

        if (!matchesGlobal) return false;
      }

      // 2. Date Range: From Date & To Date
      if (paymentFromDate) {
        if (!pDateYMD || pDateYMD < paymentFromDate) return false;
      }
      if (paymentToDate) {
        if (!pDateYMD || pDateYMD > paymentToDate) return false;
      }

      // 3. Payee Type Filter
      if (paymentPayeeType !== "ALL") {
        if (rType !== paymentPayeeType) return false;
      }

      // 4. Paying Account (Source)
      if (paymentPayingAccount !== "ALL") {
        const acc = p.payingAccount?.trim() || "Company Primary Account";
        if (acc !== paymentPayingAccount) return false;
      }

      // 5. Method Filter
      if (paymentMethod !== "ALL") {
        if (methodStr !== paymentMethod.toUpperCase()) return false;
      }

      // 6. Reason / Query filter
      if (paymentReason.trim()) {
        const qReason = paymentReason.trim().toLowerCase();
        if (!reasonStr.includes(qReason)) return false;
      }

      // 7. Allocated To filter
      if (paymentAllocatedTo.trim()) {
        const qAlloc = paymentAllocatedTo.trim().toLowerCase();
        if (qAlloc === "unallocated") {
          if (hasAllocations) return false;
        } else if (qAlloc === "allocated") {
          if (!hasAllocations) return false;
        } else {
          if (!allocationsStr.includes(qAlloc)) return false;
        }
      }

      // 8. Amount Range (Min / Max in Rupees)
      if (paymentMinAmount.trim()) {
        const minVal = parseFloat(paymentMinAmount);
        if (!isNaN(minVal) && amtRupees < minVal) return false;
      }
      if (paymentMaxAmount.trim()) {
        const maxVal = parseFloat(paymentMaxAmount);
        if (!isNaN(maxVal) && amtRupees > maxVal) return false;
      }

      // 9. Status filter
      if (paymentStatus !== "ALL") {
        if (paymentStatus === "APPROVED" || paymentStatus === "POSTED") {
          if (p.status !== "POSTED" && p.status !== "APPROVED") return false;
        } else {
          if (p.status !== paymentStatus) return false;
        }
      }

      return true;
    });
  }, [
    siteScopedPayments,
    paymentSearch,
    paymentFromDate,
    paymentToDate,
    paymentPayeeType,
    paymentPayingAccount,
    paymentMethod,
    paymentStatus,
    paymentReason,
    paymentAllocatedTo,
    paymentMinAmount,
    paymentMaxAmount,
  ]);

  const filteredPaymentsTotal = useMemo(() => {
    return filteredPayments.reduce((sum, p) => {
      // Exclude rejected payment queries and reversed payments from the disbursed financial total
      if (p.status === "REJECTED" || p.status === "REVERSED" || p.reversedAt) {
        // Only include if user specifically filtered by that status
        if (paymentStatus !== "REJECTED" && paymentStatus !== "REVERSED") return sum;
      }
      return sum + (Number(p.amount) || 0);
    }, 0);
  }, [filteredPayments, paymentStatus]);

  const filteredBills = useMemo(() => {
    return siteScopedBills.filter((b) => {
      if (billSearch.trim()) {
        const q = billSearch.trim().toLowerCase();
        const match =
          (b.billNumber || "").toLowerCase().includes(q) ||
          (b.party?.name || "").toLowerCase().includes(q) ||
          formatDate(b.billDate).toLowerCase().includes(q) ||
          ((Number(b.totalAmount) || 0) / 100).toString().includes(q);
        if (!match) return false;
      }
      if (billStatus === "PAID" && b.outstandingAmount > 0) return false;
      if (billStatus === "PENDING" && b.outstandingAmount === 0) return false;
      return true;
    });
  }, [siteScopedBills, billSearch, billStatus]);

  const paymentColumns: ExcelColumn<any>[] = useMemo(
    () => [
      {
        key: "date",
        label: "Date & Ref",
        accessor: (p) => `${formatDate(p.paymentDate)} ${p.referenceNumber || ""}`,
        type: "text",
      },
      {
        key: "payee",
        label: "Payee & Type",
        accessor: (p) => p.recipientName || p.party?.name || "Recipient",
        type: "text",
      },
      {
        key: "payingAccount",
        label: "Paid From (Account)",
        accessor: (p) => p.payingAccount || "Company Primary Account",
        type: "text",
      },
      {
        key: "method",
        label: "Method",
        accessor: (p) => p.method || "—",
        type: "text",
      },
      {
        key: "reason",
        label: "Payment Purpose",
        accessor: (p) => p.approvalQuery || p.notes || "—",
        type: "text",
      },
      {
        key: "allocatedTo",
        label: "Linked Bill",
        accessor: (p) => {
          if (p.allocations && p.allocations.length > 0) {
            return p.allocations.map((a: any) => `Bill #${a.bill?.billNumber || a.billId}`).join(", ");
          }
          return "Unallocated";
        },
        type: "text",
      },
      {
        key: "amount",
        label: "Amount",
        accessor: (p) => (Number(p.amount) || 0) / 100,
        type: "currency",
        align: "right",
      },
      {
        key: "status",
        label: "Status",
        accessor: (p) => {
          if (p.status === "PENDING_APPROVAL") return "Pending Super Admin";
          if (p.status === "REJECTED") return "Rejected";
          if (p.status === "REVERSED") return "Reversed";
          return "Approved";
        },
        type: "text",
        align: "center",
      },
    ],
    []
  );

  const excelPayments = useExcelTable({
    data: filteredPayments,
    columns: paymentColumns,
  });

  const billColumns: ExcelColumn<any>[] = useMemo(
    () => [
      {
        key: "billNumber",
        label: "Bill #",
        accessor: (b) => b.billNumber,
        type: "text",
      },
      {
        key: "vendor",
        label: "Vendor",
        accessor: (b) => b.party?.name || "—",
        type: "text",
      },
      {
        key: "billDate",
        label: "Bill Date",
        accessor: (b) => formatDate(b.billDate),
        type: "date",
      },
      {
        key: "totalAmount",
        label: "Total Amount",
        accessor: (b) => (Number(b.totalAmount) || 0) / 100,
        type: "currency",
        align: "right",
      },
      {
        key: "paidAmount",
        label: "Amount Paid",
        accessor: (b) => (Number(b.paidAmount) || 0) / 100,
        type: "currency",
        align: "right",
      },
      {
        key: "outstandingAmount",
        label: "Unpaid Balance",
        accessor: (b) => (Number(b.outstandingAmount) || 0) / 100,
        type: "currency",
        align: "right",
      },
      {
        key: "status",
        label: "Status",
        accessor: (b) => (b.outstandingAmount === 0 ? "PAID" : "PENDING"),
        type: "text",
        align: "center",
      },
    ],
    []
  );

  const excelBills = useExcelTable({
    data: filteredBills,
    columns: billColumns,
  });

  if (!loading && currentUser && !canReadFinance) {
    return (
      <Shell>
        <div className="max-w-md mx-auto py-20 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <DollarSign className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-black text-slate-900">Access Restricted</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Payments and bills are restricted to Authorized Finance and Admin accounts. Your role ({currentUser.role}) does not have permission to view or manage financial records.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition shadow-sm"
          >
            Return to Dashboard
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader icon={DollarSign} title="Payments & Bills" subtitle="Record vendor & contractor bills, track unpaid balances, and manage payments in one place.">

          <div className="w-full sm:w-auto grid grid-cols-2 sm:flex sm:items-center gap-2">
            <a
              href="/payroll/tds-return?kind=contractors"
              className="order-3 sm:order-1 col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
              <span>TDS Return (26Q)</span>
            </a>
            {canWriteFinance && (
              <button
                onClick={() => {
                  if (parties.length > 0) setBillPartyId(parties[0].id);
                  setShowBillModal(true);
                }}
                className="order-1 sm:order-2 inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs whitespace-nowrap shrink-0 shadow-sm transition-all"
              >
                <Receipt className="w-4 h-4 shrink-0" />
                <span>Record Bill</span>
              </button>
            )}
            {canWriteFinance && (
              <button
                onClick={() => {
                  if (parties.length > 0) {
                    const firstVendor = parties.find((p) => {
                      const pt = (p.partyType || p.type || "VENDOR").toUpperCase();
                      return pt === "VENDOR" || pt === "BOTH";
                    }) || parties[0];
                    setSelectedPartyId(firstVendor.id);
                    setRecipientName(firstVendor.name);
                  }
                  setShowPaymentModal(true);
                }}
                className="order-2 sm:order-3 inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs whitespace-nowrap shrink-0 shadow-sm transition-all"
              >
                <CreditCard className="w-4 h-4 shrink-0" />
                <span>Record Payment</span>
              </button>
            )}
          </div>
        </PageHeader>

        {/* Feedback alerts */}
        {statusMessage && <Alert tone="success">{statusMessage}</Alert>}
        {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

        {/* Construction Site & Project Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
            {/* Target Construction Site Selector */}
            <div className="w-full sm:w-auto min-w-[200px]">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                Target Construction Site:
              </label>
              <div className="relative">
                <select
                  value={selectedSiteId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedSiteId(val);
                    setSelectedProjectId("");
                    setActiveSiteId(val);
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
                >
                  <option value="">All Sites (All Payments &amp; Bills)</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code || "Site"})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Target Project Selector */}
            {selectedSiteId && (
              <div className="w-full sm:w-auto min-w-[180px]">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                  Target Project:
                </label>
                <div className="relative">
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
                  >
                    <option value="">All Projects on Site</option>
                    {projects.filter((p) => p.siteId === selectedSiteId).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Financial KPI Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Billed (Liability)
            </span>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums tracking-tight leading-tight truncate" title={formatCurrency(totalBilledAll)}>
              {formatCompactINR(totalBilledAll)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Total across all recorded vendor &amp; contractor bills</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Paid
            </span>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-emerald-600 mt-1 tabular-nums tracking-tight leading-tight truncate" title={formatCurrency(totalPaidAll)}>
              {formatCompactINR(totalPaidAll)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Approved payments released (excluding reversed)</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm bg-gradient-to-br from-amber-50/50 to-white">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
              Unpaid Balance (Payables)
            </span>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-amber-600 mt-1 tabular-nums tracking-tight leading-tight truncate" title={formatCurrency(totalOutstandingAll)}>
              {formatCompactINR(totalOutstandingAll)}
            </div>
            <div className="text-[11px] text-amber-700 font-medium mt-1">
              Amount still owed across unpaid bills
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 border-b border-slate-200 pb-2 overflow-x-auto max-w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setActiveTab("PAYMENTS")}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === "PAYMENTS"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <CreditCard className="w-4 h-4 shrink-0" />
            <span>
              <span className="sm:hidden">Payments</span>
              <span className="hidden sm:inline">Payments Register</span>
              {" ("}
              {filteredPayments.length !== payments.length
                ? `${filteredPayments.length} of ${payments.length}`
                : payments.length}
              )
            </span>
          </button>
          <button
            onClick={() => setActiveTab("BILLS")}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === "BILLS"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <Receipt className="w-4 h-4 shrink-0" />
            <span>
              <span className="sm:hidden">Bills</span>
              <span className="hidden sm:inline">Vendor Bills</span>
              {" ("}
              {filteredBills.length !== bills.length
                ? `${filteredBills.length} of ${bills.length}`
                : bills.length}
              )
            </span>
          </button>
        </div>

        {/* Payments Table */}
        {activeTab === "PAYMENTS" && (
          <div className="space-y-4">
            {/* Payments Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <ExcelTableToolbar
                table={excelPayments}
                columns={paymentColumns}
                tableName="payments"
                showSearch={true}
                showExport={true}
              />
              {/* Desktop Payments Table (≥ lg screens) */}
              <div className="hidden lg:block overflow-x-auto min-h-[400px]">
                <table className="w-full text-left text-sm min-w-[760px]">
                  <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                    <tr>
                      {paymentColumns.map((col) => (
                        <ExcelColumnHeader
                          key={col.key}
                          column={col}
                          table={excelPayments}
                          theme="darkHeader"
                        />
                      ))}
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {excelPayments.paginatedData.map((p) => {
                      const isReversed = p.status === "REVERSED";
                      const isPending = p.status === "PENDING_APPROVAL";
                      const isRejected = p.status === "REJECTED";
                      const payee = p.recipientName || p.party?.name || "Recipient";
                      const rType = p.recipientType || p.party?.type || "VENDOR";
                      const canSuperAdminAct =
                        currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ORG_ADMIN";

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 text-xs font-mono text-slate-600">
                            <div className="font-bold text-slate-800">{formatDate(p.paymentDate)}</div>
                            <div className="text-[11px] text-slate-400">Ref: {p.referenceNumber}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                              {p.partyId ? (
                                <Link
                                  href={`/parties/${p.partyId}`}
                                  className="hover:text-amber-600 hover:underline"
                                >
                                  {payee}
                                </Link>
                              ) : (
                                <span>{payee}</span>
                              )}
                              <span
                                className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${
                                  rType === "EMPLOYEE"
                                    ? "bg-amber-50 text-amber-800 border-amber-300"
                                    : rType === "CONTRACTOR"
                                    ? "bg-purple-50 text-purple-800 border-purple-300"
                                    : "bg-blue-50 text-blue-800 border-blue-300"
                                }`}
                              >
                                {rType}
                              </span>
                            </div>
                            {p.creator?.name && (
                              <div className="text-[10px] text-slate-400">By: {p.creator.name}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                              <Landmark className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{p.payingAccount || "Company Primary Account"}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                              {p.method}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs min-w-[180px] max-w-xs break-words">
                            <div className="text-slate-700 break-words whitespace-normal" title={p.approvalQuery || p.notes || ""}>
                              {p.approvalQuery || p.notes || "—"}
                            </div>
                            {isRejected && p.rejectionReason && (
                              <div className="text-[10px] text-rose-600 font-semibold mt-0.5 break-words whitespace-normal">
                                Declined: {p.rejectionReason}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">
                            {p.allocations && p.allocations.length > 0 ? (
                              p.allocations.map((a: any) => (
                                <div key={a.id} className="font-mono text-[11px]" title={a.bill?.billNumber || a.billId}>
                                  Bill #{formatShortBillNumber(a.bill?.billNumber || a.billId)} ({formatCurrency(a.amount)})
                                </div>
                              ))
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-slate-400 italic">Advance / General</span>
                                <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded w-fit">
                                  Not Linked to a Bill
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-black tabular-nums">
                            <span
                              className={
                                isReversed || isRejected
                                  ? "line-through text-slate-400"
                                  : isPending
                                  ? "text-amber-700 font-bold"
                                  : "text-emerald-600"
                              }
                            >
                              {formatCurrency(p.amount)}
                            </span>
                            {p.tdsAmount > 0 && (
                              <div className="whitespace-nowrap text-[10px] font-semibold leading-tight text-indigo-700" title={p.tdsNote || undefined}>
                                <div>TDS {formatCurrency(p.tdsAmount)} held</div>
                                <div className="text-slate-500">Bank paid {formatCurrency(p.amount - p.tdsAmount)}</div>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isPending ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>Waiting for Approval</span>
                              </span>
                            ) : isRejected ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-rose-100 text-rose-800 border border-rose-200">
                                Rejected
                              </span>
                            ) : isReversed ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-slate-100 text-slate-700">
                                Reversed
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-emerald-100 text-emerald-800">
                                Approved
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() =>
                                  setAttachmentTarget({
                                    type: "PAYMENT",
                                    id: p.id,
                                    title: `Payment Receipt: ${p.referenceNumber || p.id.slice(0, 8)}`,
                                    categoryDefault: "PAYMENT_RECEIPT",
                                  })
                                }
                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                                title="Attach or view payment receipt"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                              </button>
                              {isPending && canSuperAdminAct ? (
                                <>
                                  <button
                                    onClick={() => handleApprovePayment(p)}
                                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-xs transition"
                                    title="Approve this payment"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Approve</span>
                                  </button>
                                  <button
                                    onClick={() => handleRejectPayment(p)}
                                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md transition"
                                    title="Decline this payment request"
                                  >
                                    <XCircle className="w-3 h-3" />
                                    <span>Decline</span>
                                  </button>
                                </>
                              ) : isPending ? (
                                <span className="text-[11px] text-amber-700 font-medium italic">
                                  Waiting for Approval
                                </span>
                              ) : p.status === "POSTED" && !isReversed && canReverseFinance ? (
                                <button
                                  onClick={() => {
                                    setPaymentToReverse(p);
                                    setShowReverseModal(true);
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:underline"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Reverse</span>
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {excelPayments.filteredData.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Filter className="w-8 h-8 text-slate-300" />
                            <p className="font-semibold text-slate-700">
                              No payments found matching the selected filters
                            </p>
                            <p className="text-xs text-slate-400">
                              Try adjusting your search terms, dates, or clearing some filters.
                            </p>
                            {excelPayments.activeFiltersCount > 0 && (
                              <button
                                onClick={excelPayments.clearAllFilters}
                                className="mt-2 px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition"
                              >
                                Reset all filters
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile & Tablet Payments Cards (< lg screens) */}
              <div className="lg:hidden p-3 bg-slate-50/60 space-y-3 min-h-[300px]">
                {excelPayments.filteredData.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                    <Filter className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">No payments found</p>
                    <p className="text-xs text-slate-400">Try adjusting your search terms or filters.</p>
                  </div>
                ) : (
                  excelPayments.paginatedData.map((p) => {
                    const isReversed = p.status === "REVERSED";
                    const isPending = p.status === "PENDING_APPROVAL";
                    const isRejected = p.status === "REJECTED";
                    const payee = p.recipientName || p.party?.name || "Recipient";
                    const rType = p.recipientType || p.party?.type || "VENDOR";
                    const canSuperAdminAct =
                      currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ORG_ADMIN";

                    return (
                      <div key={`p-card-${p.id}`} className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all">
                        {/* Top: Payee, Type Pill & Status Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {p.partyId ? (
                                <Link
                                  href={`/parties/${p.partyId}`}
                                  className="font-bold text-slate-900 hover:text-amber-600 text-sm truncate min-w-0"
                                  title={payee}
                                >
                                  <span className="sm:hidden">{formatShortName(payee)}</span>
                                  <span className="hidden sm:inline">{payee}</span>
                                </Link>
                              ) : (
                                <span className="font-bold text-slate-900 text-sm truncate min-w-0" title={payee}>
                                  <span className="sm:hidden">{formatShortName(payee)}</span>
                                  <span className="hidden sm:inline">{payee}</span>
                                </span>
                              )}
                              <span
                                className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0 whitespace-nowrap ${
                                  rType === "EMPLOYEE"
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : rType === "SUBCONTRACTOR"
                                    ? "bg-sky-50 text-sky-700 border-sky-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                }`}
                              >
                                {rType}
                              </span>
                            </div>
                            <div
                              className="text-xs text-slate-400 font-mono mt-0.5 truncate"
                              title={`${formatDate(p.paymentDate)} · Ref: ${p.referenceNumber}`}
                            >
                              {formatDate(p.paymentDate)} · Ref: {formatShortBillNumber(p.referenceNumber)}
                            </div>
                          </div>

                          {/* Status Badge */}
                          <div className="shrink-0">
                            {isReversed ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                                REVERSED
                              </span>
                            ) : isRejected ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700">
                                DECLINED
                              </span>
                            ) : isPending ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                                PENDING
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                APPROVED
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Amount & Method - Paying bank account & allocation internals hidden */}
                        <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs">
                          <div>
                            <div className="text-[11px] text-slate-400 font-medium">Payment Amount</div>
                            <div className="font-display text-base font-extrabold text-slate-900 tabular-nums truncate" title={formatCurrency(p.amount)}>
                              {formatCompactINR(p.amount)}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-[11px] text-slate-400 font-medium">Mode</div>
                            <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">
                              {p.method || "Direct Bank"}
                            </span>
                          </div>
                        </div>

                        {/* Actions Footer */}
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                          <button
                            onClick={() =>
                              setAttachmentTarget({
                                type: "PAYMENT",
                                id: p.id,
                                title: `Payment #${p.referenceNumber} Receipts`,
                                categoryDefault: "RECEIPT",
                              })
                            }
                            className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                          >
                            <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                            <span>Receipts & Docs</span>
                          </button>

                          <div className="flex items-center gap-1.5 ml-auto">
                            {isPending && canSuperAdminAct ? (
                              <>
                                <button
                                  onClick={() => handleApprovePayment(p)}
                                  className="px-2.5 py-1 rounded text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleRejectPayment(p)}
                                  className="px-2.5 py-1 rounded text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"
                                >
                                  Decline
                                </button>
                              </>
                            ) : null}

                            {!isReversed && !isRejected && !isPending && canReverseFinance && (
                              <button
                                onClick={() => {
                                  setPaymentToReverse(p);
                                  setShowReverseModal(true);
                                }}
                                className="px-2 py-1 rounded text-[11px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200"
                              >
                                Reverse
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <TablePagination
                currentPage={excelPayments.currentPage}
                totalPages={excelPayments.totalPages}
                totalItems={excelPayments.filteredCount}
                totalUnfiltered={excelPayments.totalRecords}
                pageSize={excelPayments.pageSize}
                startItem={excelPayments.startItem}
                endItem={excelPayments.endItem}
                onPageChange={excelPayments.setCurrentPage}
                itemLabel="payments"
              />
            </div>
          </div>
        )}

        {/* Bills Table */}
        {activeTab === "BILLS" && (
          <div className="space-y-4">
            {/* Bills Search & Filter Toolbar */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={billSearch}
                  onChange={(e) => setBillSearch(e.target.value)}
                  placeholder="Search bills by bill #, vendor name, date, amount..."
                  className="w-full pl-9 pr-8 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
                {billSearch && (
                  <button
                    onClick={() => setBillSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={billStatus}
                  onChange={(e) => setBillStatus(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value="ALL">All Bills</option>
                  <option value="PENDING">Unpaid Balance</option>
                  <option value="PAID">Paid in Full</option>
                </select>
                {(billSearch || billStatus !== "ALL") && (
                  <button
                    onClick={() => {
                      setBillSearch("");
                      setBillStatus("ALL");
                    }}
                    className="px-2.5 py-2 text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Bills Table Container */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <ExcelTableToolbar
                table={excelBills}
                columns={billColumns}
                tableName="vendor bills"
                showSearch={true}
                showExport={true}
              />
              {/* Desktop Bills Table (≥ lg screens) */}
              <div className="hidden lg:block overflow-x-auto min-h-[400px]">
                <table className="w-full text-left text-sm min-w-[720px]">
                  <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                    <tr>
                      {billColumns.map((col) => (
                        <ExcelColumnHeader
                          key={col.key}
                          column={col}
                          table={excelBills}
                          theme="darkHeader"
                        />
                      ))}
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {excelBills.paginatedData.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900" title={b.billNumber}>
                          {formatShortBillNumber(b.billNumber)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          <Link href={`/parties/${b.partyId}`} className="hover:text-amber-600 hover:underline">
                            {b.party?.name}
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">{formatDate(b.billDate)}</td>
                        <td className="py-3 px-4 text-right font-medium text-slate-900 tabular-nums">
                          {formatCurrency(b.totalAmount)}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-emerald-600 tabular-nums">
                          {formatCurrency(b.paidAmount)}
                        </td>
                        <td className="py-3 px-4 text-right font-black tabular-nums">
                          <span className={b.outstandingAmount > 0 ? "text-amber-600" : "text-slate-400"}>
                            {formatCurrency(b.outstandingAmount)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {b.outstandingAmount === 0 ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              PAID
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                              PENDING
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={() =>
                              setAttachmentTarget({
                                type: "BILL",
                                id: b.id,
                                title: `Bill #${formatShortBillNumber(b.billNumber)} Invoices & Challans`,
                                categoryDefault: "INVOICE",
                              })
                            }
                            className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                            title="Upload or view invoice / challan photograph"
                          >
                            <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                            <span>Attach</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {excelBills.filteredData.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Filter className="w-8 h-8 text-slate-300" />
                            <p className="font-semibold text-slate-700">No vendor bills found</p>
                            <p className="text-xs text-slate-400">Try adjusting your search terms or filter.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile & Tablet Vendor Bills Cards (< lg screens) */}
              <div className="lg:hidden p-3 bg-slate-50/60 space-y-3 min-h-[300px]">
                {excelBills.filteredData.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                    <Filter className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">No vendor bills found</p>
                    <p className="text-xs text-slate-400">Try adjusting your search terms or filter.</p>
                  </div>
                ) : (
                  excelBills.paginatedData.map((b) => (
                    <div key={`b-card-${b.id}`} className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all">
                      {/* Top: Bill Number, Vendor Link & Status Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold font-mono text-slate-900 text-sm truncate" title={b.billNumber}>
                            {formatShortBillNumber(b.billNumber)}
                          </div>
                          <div className="text-xs text-slate-700 font-semibold mt-0.5 min-w-0">
                            <Link
                              href={`/parties/${b.partyId}`}
                              className="hover:text-amber-600 hover:underline block truncate"
                              title={b.party?.name || "Vendor"}
                            >
                              <span className="sm:hidden">{formatShortName(b.party?.name || "Vendor")}</span>
                              <span className="hidden sm:inline">{b.party?.name || "Vendor"}</span>
                            </Link>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {formatDate(b.billDate)}
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0">
                          {b.outstandingAmount === 0 ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              PAID
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                              PENDING
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Middle: Pending Balance & Total Bill Amount (Paid Amount column hidden) */}
                      <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs">
                        <div>
                          <div className="text-[11px] text-slate-400 font-medium">Unpaid Balance</div>
                          <div className={`font-display text-base font-extrabold tabular-nums truncate ${b.outstandingAmount > 0 ? "text-amber-600" : "text-slate-400"}`} title={formatCurrency(b.outstandingAmount)}>
                            {formatCompactINR(b.outstandingAmount)}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[11px] text-slate-400 font-medium">Total Bill</div>
                          <div className="font-display text-sm font-extrabold text-slate-700 tabular-nums truncate" title={formatCurrency(b.totalAmount)}>
                            {formatCompactINR(b.totalAmount)}
                          </div>
                        </div>
                      </div>

                      {/* Footer Actions: Attach Invoices / Challans */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-400">
                          {b.outstandingAmount === 0 ? "Paid in Full" : "Balance Due"}
                        </span>

                        <button
                          onClick={() =>
                            setAttachmentTarget({
                              type: "BILL",
                              id: b.id,
                              title: `Bill #${b.billNumber} Invoices & Challans`,
                              categoryDefault: "INVOICE",
                            })
                          }
                          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 whitespace-nowrap shrink-0 transition cursor-pointer"
                        >
                          <Paperclip className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>Attach Invoice / Challan</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <TablePagination
                currentPage={excelBills.currentPage}
                totalPages={excelBills.totalPages}
                totalItems={excelBills.filteredCount}
                totalUnfiltered={excelBills.totalRecords}
                pageSize={excelBills.pageSize}
                startItem={excelBills.startItem}
                endItem={excelBills.endItem}
                onPageChange={excelBills.setCurrentPage}
                itemLabel="vendor bills"
              />
            </div>
          </div>
        )}

        {/* Modal: Record Payment */}
        {showPaymentModal && canWriteFinance && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 overflow-y-auto max-h-[90dvh]">
              <div className="flex items-start sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-base sm:text-lg flex items-start sm:items-center gap-2 min-w-0 leading-snug">
                  <CreditCard className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
                  <span>Record Payment &amp; Request Approval</span>
                </div>
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handlePaymentSubmit} className="space-y-4">
                {/* 1. Recipient Type Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Payee / Recipient Category
                  </label>
                  <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-lg">
                    {(["VENDOR", "CONTRACTOR", "EMPLOYEE"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setRecipientType(t);
                          setSelectedBillId("");
                          setSelectedPartyId("");
                          setSelectedEmployeeId("");
                          setRecipientName("");
                        }}
                        className={`py-1.5 text-xs font-bold rounded-md transition ${
                          recipientType === t
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {t === "VENDOR" ? "Vendor" : t === "CONTRACTOR" ? "Contractor" : "Employee"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Recipient Selector / Name */}
                {recipientType === "EMPLOYEE" ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Employee Name & Designation *
                    </label>
                    <select
                      value={selectedEmployeeId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedEmployeeId(val);
                        if (val === "CUSTOM") {
                          setRecipientName("");
                        } else {
                          const w = workforce.find((wk) => wk.id === val);
                          if (w) {
                            setRecipientName(`${w.name} (${w.workerType || "Staff"})`);
                          }
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium mb-2"
                    >
                      <option value="">-- Choose Employee / Worker --</option>
                      {workforce.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} — {w.workerType || "Staff"} (Code: {w.employeeCode || "N/A"})
                        </option>
                      ))}
                      <option value="CUSTOM">+ Enter Custom Employee / Staff Name</option>
                    </select>

                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Kumar (Site Supervisor) or Mahesh Thakur (Foreman)"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Select {recipientType === "VENDOR" ? "Vendor" : "Contractor"} *
                    </label>
                    {(() => {
                      const isVendor = recipientType === "VENDOR";
                      const typeFiltered = parties.filter((p) => {
                        const pt = (p.partyType || p.type || "VENDOR").toUpperCase();
                        return isVendor ? (pt === "VENDOR" || pt === "BOTH") : (pt === "CONTRACTOR" || pt === "BOTH");
                      });
                      const displayParties = typeFiltered.length > 0 ? typeFiltered : parties;

                      return (
                        <select
                          value={selectedPartyId}
                          onChange={(e) => {
                            setSelectedPartyId(e.target.value);
                            setSelectedBillId("");
                            const p = parties.find((pt) => pt.id === e.target.value);
                            if (p) setRecipientName(p.name);
                          }}
                          required
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                        >
                          <option value="">-- Choose {recipientType} --</option>
                          {displayParties.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} {p.partyType ? `(${p.partyType})` : ""} — Outstanding: {formatCurrency(p.outstandingBalance)}
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </div>
                )}

                {/* 3. Paying Account / Source Bank (Mandatory) */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 uppercase mb-1 flex items-center gap-1.5">
                    <Landmark className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span>Paid From (Bank / Cash Account) *</span>
                  </label>
                  <select
                    value={payingAccount}
                    onChange={(e) => setPayingAccount(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    <option value="HDFC Bank Operating A/C (A/C: ...4421)">
                      HDFC Bank Operating A/C (A/C: ...4421)
                    </option>
                    <option value="ICICI Bank Project Escrow A/C (A/C: ...9012)">
                      ICICI Bank Project Escrow A/C (A/C: ...9012)
                    </option>
                    <option value="State Bank of India CMS Current A/C (A/C: ...1109)">
                      State Bank of India CMS Current A/C (A/C: ...1109)
                    </option>
                    <option value="Site Office Petty Cash Wallet">Site Office Petty Cash Wallet</option>
                    <option value="CUSTOM">Other / Custom Bank Account...</option>
                  </select>

                  {payingAccount === "CUSTOM" && (
                    <input
                      type="text"
                      required
                      placeholder="Enter Bank Name, Branch & Account details"
                      value={customPayingAccount}
                      onChange={(e) => setCustomPayingAccount(e.target.value)}
                      className="w-full mt-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    />
                  )}
                </div>

                {/* 4. Amount and Method */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Payment Amount (₹) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      placeholder="e.g. 4000"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Payment Method *
                    </label>
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS)</option>
                      <option value="UPI">UPI Transfer</option>
                      <option value="CHEQUE">Bank Cheque</option>
                      <option value="CASH">Petty Cash</option>
                    </select>
                  </div>
                </div>

                {/* 5. Reference Number */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Reference / UTR / Cheque Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. UTR-HDFC-991823 / CHQ-10492"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                  />
                </div>

                {/* 6. Reason / Approval Query (Mandatory) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Payment Purpose (Shown for Approval) *
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="e.g. Advance payment for column rebar tying week 42, Steel shipment delivery settlement, Site food allowance reimbursement"
                    value={approvalQuery}
                    onChange={(e) => setApprovalQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm leading-relaxed"
                  />
                </div>

                {/* 7. Bill Allocation if Vendor / Contractor */}
                {recipientType !== "EMPLOYEE" && partyBills.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Link to an Unpaid Bill (Optional)
                    </label>
                    <select
                      value={selectedBillId}
                      onChange={(e) => setSelectedBillId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    >
                      <option value="">Leave blank for advance or general payment</option>
                      {partyBills.map((b) => (
                        <option key={b.id} value={b.id}>
                          Bill #{formatShortBillNumber(b.billNumber)} — Unpaid: {formatCurrency(b.outstandingAmount)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* TDS held back on this payment (194C, 194J or 194I) */}
                {tdsPreview && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-xs text-indigo-950">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold uppercase tracking-wide">TDS · {tdsPreview.label || "Contractor (194C)"}</span>
                      <select
                        value={tdsMode}
                        onChange={(e) => setTdsMode(e.target.value as any)}
                        className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-xs font-semibold"
                        aria-label="How TDS is calculated"
                      >
                        <option value="AUTO">Calculate automatically</option>
                        <option value="NONE">No TDS</option>
                        <option value="MANUAL">Enter amount manually</option>
                      </select>
                    </div>
                    {tdsMode === "MANUAL" && (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={tdsManual}
                        onChange={(e) => setTdsManual(e.target.value)}
                        placeholder="TDS ₹ (e.g. lower-deduction certificate rate)"
                        className="mt-2 w-full rounded-lg border border-indigo-200 bg-white p-2 text-sm font-mono"
                      />
                    )}
                    {tdsMode !== "AUTO" && (
                      <input
                        type="text"
                        value={tdsReason}
                        onChange={(e) => setTdsReason(e.target.value)}
                        required={tdsMode === "NONE"}
                        placeholder={tdsMode === "NONE" ? "Reason (e.g. transporter PAN declaration, or below annual limit)" : "Reason (e.g. Section 197 certificate number)"}
                        className="mt-2 w-full rounded-lg border border-indigo-200 bg-white p-2 text-sm"
                      />
                    )}
                    <div className="mt-2 space-y-0.5">
                      {tdsPreview.amount > 0 ? (
                        <>
                          <div>
                            {tdsPreview.rate}% of {formatCurrency(tdsPreview.base + tdsPreview.catchUpBase)} ={" "}
                            <strong>{formatCurrency(tdsPreview.amount)}</strong> held back and paid to the government.
                          </div>
                          <div className="text-sm font-bold">Bank pays {formatCurrency(tdsPreview.bankAmount)}</div>
                        </>
                      ) : (
                        <div>No TDS on this payment.</div>
                      )}
                      {tdsPreview.note && <div className="text-indigo-800">{tdsPreview.note}</div>}
                      {!tdsPreview.pan && <div className="font-semibold text-rose-700">No PAN on file for this vendor, so TDS applies at 20%. Add their PAN on the Vendors &amp; Contractors page.</div>}
                    </div>
                  </div>
                )}

                {/* 8. Super Admin Auto-Approve Checkbox or Normal User Alert */}
                {currentUser?.role === "SUPER_ADMIN" ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoApprove}
                        onChange={(e) => setAutoApprove(e.target.checked)}
                        className="w-4 h-4 text-emerald-600 rounded"
                      />
                      <span className="text-xs font-bold text-amber-950">
                        Approve and save immediately (Super Admin)
                      </span>
                    </label>
                    <p className="text-[11px] text-amber-800 mt-1">
                      Uncheck to send this payment for Super Admin approval first.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 leading-relaxed">
                    ℹ️ <strong>Admin Approval Required:</strong> This payment will be sent to the Super Admin for approval. The payment will be completed once approved.
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg whitespace-nowrap shrink-0"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 sm:px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="sm:hidden">
                      {submitting
                        ? "Sending..."
                        : currentUser?.role === "SUPER_ADMIN" && autoApprove
                        ? "Approve & Save"
                        : "Request Approval"}
                    </span>
                    <span className="hidden sm:inline">
                      {submitting
                        ? "Sending Request..."
                        : currentUser?.role === "SUPER_ADMIN" && autoApprove
                        ? "Approve & Save Payment"
                        : "Send Payment for Approval"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Reverse Payment */}
        {showReverseModal && paymentToReverse && canReverseFinance && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-rose-600" />
                  <span>Reverse Payment</span>
                </div>
                <button
                  onClick={() => setShowReverseModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs mb-4">
                <span className="font-bold">Notice:</span> Reversing payment{" "}
                <span className="font-mono font-bold">#{paymentToReverse.referenceNumber}</span> of{" "}
                <span className="font-bold">{formatCurrency(paymentToReverse.amount)}</span> to{" "}
                <span className="font-bold">{paymentToReverse.party?.name}</span> will restore the
                unpaid balance on any linked vendor bills, reverse its TDS effect, and save a permanent record in Change History.
              </div>

              <form onSubmit={handleReverseSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Reason for Reversing Payment *
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="e.g. Cheque returned unpaid by bank / Incorrect vendor account credited"
                    value={reverseReason}
                    onChange={(e) => setReverseReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReverseModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {submitting ? "Reversing..." : "Confirm Reversal"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Create Bill */}
        {showBillModal && canWriteFinance && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in">
              <div className="flex items-start sm:items-center justify-between gap-2 p-4 sm:p-5 pb-3.5 sm:pb-4 border-b border-slate-100 shrink-0 bg-white">
                <div className="font-bold text-slate-900 text-base sm:text-lg flex items-center gap-2 min-w-0">
                  <Receipt className="w-5 h-5 text-amber-500 shrink-0" />
                  <span className="truncate">Record Vendor / Contractor Bill</span>
                </div>
                <button
                  onClick={() => setShowBillModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="create-bill-modal-form" onSubmit={handleBillSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Vendor / Contractor *
                    </label>
                    <select
                      value={billPartyId}
                      onChange={(e) => setBillPartyId(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      <option value="">Select Vendor / Contractor</option>
                      {parties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.partyType})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Project / Site (Optional)
                    </label>
                    <SearchableSelect
                      options={[
                        { value: "", label: "Select Project" },
                        ...projects.map((p) => ({
                          value: p.id,
                          label: p.name,
                          badge: p.code || undefined,
                        })),
                      ]}
                      value={billProjectId}
                      onChange={setBillProjectId}
                      placeholder="Select Project"
                      searchPlaceholder="Search project name or code..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Bill / Invoice # *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. INV-2026-089"
                      value={billNumber}
                      onChange={(e) => setBillNumber(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Bill Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={billDate}
                      onChange={(e) => setBillDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Due Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={billDueDate}
                      onChange={(e) => setBillDueDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    />
                  </div>
                </div>

                {/* Line Items */}
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider min-w-0">
                      <span className="sm:hidden">Bill Line Items</span>
                      <span className="hidden sm:inline">Items / Services on This Bill</span>
                    </span>
                    <button
                      type="button"
                      onClick={addBillLine}
                      className="text-xs font-bold text-amber-700 hover:text-amber-600 bg-amber-100/70 hover:bg-amber-100 px-2.5 py-1 rounded-lg flex items-center gap-1 whitespace-nowrap shrink-0 transition"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>Add Line</span>
                    </button>
                  </div>

                  <div className="space-y-2.5 sm:max-h-60 sm:overflow-y-auto">
                    {billLines.map((line, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-2"
                      >
                        {billLines.length > 1 && (
                          <div className="flex sm:hidden items-center justify-between text-[11px] font-bold text-slate-500 pb-1 border-b border-slate-100">
                            <span>Item #{idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => removeBillLine(idx)}
                              className="p-1 text-slate-400 hover:text-rose-500 rounded inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <div className="sm:col-span-6">
                            <input
                              type="text"
                              required
                              placeholder="Item description (e.g. Reinforcement Steel Bars)"
                              value={line.description}
                              onChange={(e) => updateBillLine(idx, "description", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                            />
                          </div>
                          <div className="sm:col-span-5">
                            <select
                              value={line.materialId}
                              onChange={(e) => updateBillLine(idx, "materialId", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                            >
                              <option value="">Link Material (Optional)</option>
                              {materials.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name} ({m.sku})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="hidden sm:flex sm:col-span-1 justify-end items-center">
                            {billLines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeBillLine(idx)}
                                className="p-1.5 text-slate-400 hover:text-rose-500 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          <div>
                            <input
                              type="number"
                              step="any"
                              placeholder="Qty"
                              value={line.quantity}
                              onChange={(e) => updateBillLine(idx, "quantity", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono"
                            />
                          </div>
                          <div>
                            <input
                              type="number"
                              step="any"
                              placeholder="Unit Rate (₹)"
                              value={line.unitRate}
                              onChange={(e) => updateBillLine(idx, "unitRate", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono"
                            />
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <input
                              type="number"
                              step="any"
                              required
                              placeholder="Line Total (₹)"
                              value={line.lineTotal}
                              onChange={(e) => updateBillLine(idx, "lineTotal", e.target.value)}
                              className="w-full bg-amber-50/50 border border-amber-200 rounded-lg p-2 text-xs font-mono font-bold text-slate-900"
                            />
                          </div>
                        </div>
                        {billGstRate !== "" && (
                          <label className="flex items-center gap-2 text-[11px] text-slate-500">
                            GST on this line
                            <select
                              value={line.gstRate || ""}
                              onChange={(e) => updateBillLine(idx, "gstRate", e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px]"
                            >
                              <option value="">Same as bill ({billGstRate}%)</option>
                              {[0, 5, 12, 18, 28].map((r) => (
                                <option key={r} value={r}>
                                  {r}%
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    ))}
                  </div>

                  {(() => {
                    const taxable = billLines.reduce((sum: number, l: any) => sum + (parseFloat(l.lineTotal) || 0), 0);
                    const rate = billGstRate === "" ? 0 : Number(billGstRate);
                    const lineRate = (l: any) => (billGstRate === "" ? 0 : l.gstRate ? Number(l.gstRate) : rate);
                    const tax = billLines.reduce((sum: number, l: any) => sum + Math.round((parseFloat(l.lineTotal) || 0) * lineRate(l)) / 100, 0);
                    const mixed = new Set(billLines.map(lineRate)).size > 1;
                    const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    return (
                      <div className="pt-2 border-t border-slate-200 space-y-2 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <label className="block">
                            <span className="block font-semibold text-slate-600 mb-1">GST on this bill</span>
                            <select
                              value={billGstRate}
                              onChange={(e) => setBillGstRate(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs"
                            >
                              <option value="">No GST / composition supplier</option>
                              {[0, 5, 12, 18, 28].map((r) => (
                                <option key={r} value={r}>
                                  {r}% on top of the lines
                                </option>
                              ))}
                            </select>
                          </label>
                          {billGstRate !== "" && (
                            <label className="block">
                              <span className="block font-semibold text-slate-600 mb-1">Tax type</span>
                              <select
                                value={billTaxType}
                                onChange={(e) => setBillTaxType(e.target.value as "AUTO" | "LOCAL" | "IGST")}
                                className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs"
                              >
                                <option value="AUTO">Detect automatically from GSTIN</option>
                                <option value="LOCAL">Same state: CGST + SGST</option>
                                <option value="IGST">Other state: IGST</option>
                              </select>
                            </label>
                          )}
                          {billGstRate !== "" && (
                            <div className="space-y-1 sm:pt-4">
                              <label className="flex items-start gap-2">
                                <input type="checkbox" checked={billItc} onChange={(e) => setBillItc(e.target.checked)} className="mt-0.5" />
                                <span className="text-slate-600">
                                  <span className="font-medium text-slate-700">Claim GST Input Tax Credit (ITC)</span>
                                  <span className="block text-[10px] text-slate-400">Check if your company can claim GST credit on this purchase.</span>
                                </span>
                              </label>
                              <label className="flex items-start gap-2">
                                <input type="checkbox" checked={billRcm} onChange={(e) => setBillRcm(e.target.checked)} className="mt-0.5" />
                                <span className="text-slate-600">
                                  <span className="font-medium text-slate-700">Reverse Charge (RCM)</span>
                                  <span className="block text-[10px] text-slate-400">Company pays GST to the government instead of the vendor (e.g. GTA transport).</span>
                                </span>
                              </label>
                            </div>
                          )}
                        </div>
                        {billGstRate !== "" && (
                          <div className="flex items-center justify-between text-slate-600">
                            <span>
                              Taxable value ₹{fmt(taxable)} + GST {mixed ? "at line rates" : `${rate}%`} ₹{fmt(tax)}
                              {billRcm && " (you pay this GST to the government; the supplier is paid the taxable value)"}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-600">Calculated Bill Total:</span>
                          <span className="font-black font-mono text-sm text-slate-900">₹{fmt(billRcm ? taxable : taxable + tax)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Notes / Remarks
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. As per Purchase Order PO-2026-44"
                    value={billNotes}
                    onChange={(e) => setBillNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

              </form>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowBillModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="create-bill-modal-form"
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 transition"
                >
                  {submitting ? "Saving Bill..." : "Save Bill"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Attachment Modal (Priority 3) */}
        {attachmentTarget && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[85dvh] flex flex-col">
              <div className="flex items-start sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 mb-3 sm:mb-4">
                <div className="font-bold text-slate-900 text-base sm:text-lg flex items-start sm:items-center gap-2 min-w-0 leading-snug">
                  <Paperclip className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 sm:mt-0" />
                  <span className="break-words min-w-0">{attachmentTarget.title}</span>
                </div>
                <button
                  onClick={() => setAttachmentTarget(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <AttachmentManager
                  entityType={attachmentTarget.type}
                  entityId={attachmentTarget.id}
                  title="Uploaded Documents"
                  allowUpload={true}
                  categoryDefault={attachmentTarget.categoryDefault || "INVOICE"}
                  highlightMissing={true}
                  missingLabel="No invoice or receipt attached yet"
                />
              </div>
            </div>
          </div>
        )}

        {/* Modal: Confirm Payment Authorization */}
        {approvePaymentTarget && (
          <div className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto space-y-3">
              <div className="font-bold text-slate-900 text-base">Approve Payment</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Approve payment of{" "}
                <span className="font-bold text-slate-900">
                  ₹{(approvePaymentTarget.amount / 100).toFixed(2)}
                </span>{" "}
                to{" "}
                <span className="font-bold text-slate-900">
                  {approvePaymentTarget.recipientName || approvePaymentTarget.party?.name || "Recipient"}
                </span>
                ? Paid from:{" "}
                <span className="font-semibold text-slate-800">
                  {approvePaymentTarget.payingAccount || "Operating Account"}
                </span>
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setApprovePaymentTarget(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={approvalActionSubmitting}
                  onClick={executeApprovePayment}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg disabled:opacity-50"
                >
                  {approvalActionSubmitting ? "Approving..." : "Approve Payment"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Decline Payment Request */}
        {rejectPaymentTarget && (
          <div className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto space-y-3">
              <div className="font-bold text-slate-900 text-base">Decline Payment Request</div>
              <p className="text-xs text-slate-600">
                Enter a reason for declining this payment to{" "}
                <span className="font-bold text-slate-900">
                  {rejectPaymentTarget.recipientName || rejectPaymentTarget.party?.name || "Recipient"}
                </span>
                .
              </p>
              <form onSubmit={executeRejectPayment} className="space-y-3">
                <textarea
                  required
                  rows={3}
                  value={rejectPaymentReason}
                  onChange={(e) => setRejectPaymentReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                />
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setRejectPaymentTarget(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={approvalActionSubmitting || !rejectPaymentReason.trim()}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg disabled:opacity-50"
                  >
                    {approvalActionSubmitting ? "Declining..." : "Decline Payment"}
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
