"use client";

import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatDate } from "@/lib/formatters";
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
} from "lucide-react";
import AttachmentManager from "@/components/attachments/AttachmentManager";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, ExcelColumn } from "@/components/ui/ExcelTable";
import { canUser } from "@/lib/permissions";

export default function FinancePage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const canWriteFinance = canUser(currentUser, "finance:write");
  const canReverseFinance = canUser(currentUser, "finance:reverse");
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

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()).catch(() => ({})),
      fetch("/api/finance/bills").then((r) => r.json()),
      fetch("/api/finance/payments").then((r) => r.json()),
      fetch("/api/parties").then((r) => r.json()),
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/materials").then((r) => r.json()),
      fetch("/api/workforce").then((r) => r.json()).catch(() => ({})),
    ])
      .then(([meRes, billsRes, paymentsRes, partiesRes, projRes, matRes, wfRes]) => {
        if (meRes.success && meRes.data) {
          setCurrentUser(meRes.data.user);
          if (meRes.data.user.role === "SUPER_ADMIN") {
            setAutoApprove(true);
          }
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
  };

  useEffect(() => {
    loadData();
  }, []);

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
      setErrorMessage("Please specify the paying account / bank source from which to pay");
      setSubmitting(false);
      return;
    }

    if (!approvalQuery || approvalQuery.trim().length === 0) {
      setErrorMessage("Please specify the reason / purpose of this payment query");
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
      setErrorMessage("Please select a vendor/contractor or enter the recipient name");
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
        setErrorMessage(data.error?.message || "Failed to record payment");
      } else {
        const isPending = data.data?.payment?.status === "PENDING_APPROVAL";
        setStatusMessage(
          isPending
            ? `Payment approval query of ₹${amount} for ${finalRecipientName} submitted to Super Admin for confirmation from account "${effectivePayingAccount}".`
            : `Payment of ₹${amount} posted successfully from account "${effectivePayingAccount}".`
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
      setErrorMessage("Network error during payment submission");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprovePayment = async (payment: any) => {
    const payeeName = payment.recipientName || payment.party?.name || "Recipient";
    const confirmed = confirm(
      `Confirm & Authorize Payment of ₹${(payment.amount / 100).toFixed(2)} to ${payeeName}?\nPaid from: ${
        payment.payingAccount || "Operating Account"
      }`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/finance/payments/${payment.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Approved via Finance Register" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage(data.data?.message || `Payment to ${payeeName} approved and posted.`);
        loadData();
      } else {
        setErrorMessage(data.error?.message || "Failed to approve payment");
      }
    } catch {
      setErrorMessage("Network error approving payment");
    }
  };

  const handleRejectPayment = async (payment: any) => {
    const payeeName = payment.recipientName || payment.party?.name || "Recipient";
    const reason = prompt(
      `Provide rejection reason for payment to ${payeeName}:`,
      "Payment query not approved"
    );
    if (!reason) return;

    try {
      const res = await fetch(`/api/finance/payments/${payment.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage(`Payment query to ${payeeName} rejected.`);
        loadData();
      } else {
        setErrorMessage(data.error?.message || "Failed to reject payment");
      }
    } catch {
      setErrorMessage("Network error rejecting payment");
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
        setErrorMessage(data.error?.message || "Failed to reverse payment");
      } else {
        setStatusMessage(
          `Payment #${paymentToReverse.referenceNumber} reversed. Bill balances restored and audit trail recorded.`
        );
        setShowReverseModal(false);
        setPaymentToReverse(null);
        setReverseReason("");
        loadData();
      }
    } catch {
      setErrorMessage("Network error during reversal");
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
      setErrorMessage("Please select a vendor or contractor");
      return;
    }
    if (!billNumber.trim()) {
      setErrorMessage("Bill number is required");
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
      setErrorMessage("Each line item must have a positive total amount");
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
        setErrorMessage(data.error?.message || "Failed to create bill");
      } else {
        const totalAmountRupees = ((data.data?.totalAmount ?? parsedLines.reduce((s: number, l: any) => s + (l.lineTotal || 0), 0)) / 100).toFixed(2);
        setStatusMessage(`Bill #${billNumber} for ₹${totalAmountRupees} posted successfully!`);
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
      setErrorMessage("Network error during bill creation");
    } finally {
      setSubmitting(false);
    }
  };

  const totalBilledAll = bills.reduce((sum: number, b: any) => sum + (b.totalAmount || 0), 0);
  const posted = payments.filter((p: any) => p.status === "POSTED");
  // Out of the bank; TDS held back from contractors is counted when it is deposited.
  const totalPaidAll = posted.reduce((sum: number, p: any) => sum + (p.amount || 0) - (p.tdsAmount || 0), 0);
  // Bills are settled by the full amount, TDS included.
  const totalOutstandingAll = totalBilledAll - posted.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

  const partyBills = bills.filter(
    (b) => b.partyId === selectedPartyId && b.outstandingAmount > 0
  );

  // Distinct Paying Accounts extracted from existing payments
  const distinctPayingAccounts = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => {
      const acc = p.payingAccount?.trim() || "Company Primary A/C";
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
      all: payments.length,
      posted: payments.filter((p) => p.status === "POSTED" || p.status === "APPROVED").length,
      pending: payments.filter((p) => p.status === "PENDING_APPROVAL").length,
      rejected: payments.filter((p) => p.status === "REJECTED").length,
      reversed: payments.filter((p) => p.status === "REVERSED").length,
      vendors: payments.filter((p) => (p.recipientType || p.party?.type || "VENDOR") === "VENDOR").length,
      contractors: payments.filter((p) => (p.recipientType || p.party?.type) === "CONTRACTOR").length,
      employees: payments.filter((p) => (p.recipientType || p.party?.type) === "EMPLOYEE").length,
    };
  }, [payments]);

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
      "Paying Account (Source)",
      "Method",
      "Reason / Query",
      "Allocated Bills",
      "Amount (Rupees)",
      "Status",
    ];

    const rows = filteredPayments.map((p) => {
      const payee = (p.recipientName || p.party?.name || "Recipient").replace(/"/g, '""');
      const rType = p.recipientType || p.party?.type || "VENDOR";
      const payingAcc = (p.payingAccount || "Company Primary A/C").replace(/"/g, '""');
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
    return payments.filter((p) => {
      const payee = (p.recipientName || p.party?.name || "Recipient").toLowerCase();
      const rType = (p.recipientType || p.party?.type || "VENDOR").toUpperCase();
      const payingAcc = (p.payingAccount || "Company Primary A/C").toLowerCase();
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
        const acc = p.payingAccount?.trim() || "Company Primary A/C";
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
    payments,
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
    return filteredPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [filteredPayments]);

  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
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
  }, [bills, billSearch, billStatus]);

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
        label: "Paying Account (Source)",
        accessor: (p) => p.payingAccount || "Company Primary A/C",
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
        label: "Reason / Query",
        accessor: (p) => p.approvalQuery || p.notes || "—",
        type: "text",
      },
      {
        key: "allocatedTo",
        label: "Allocated To",
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
        label: "Pending Balance",
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

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader icon={DollarSign} title="Payments & Financial Ledger" subtitle="Idempotency-protected payments, automated bill allocations, and reversible settlements with audit logs.">

          <div className="flex items-center gap-2">
            <a
              href="/payroll/tds-return?kind=contractors"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <FileText className="h-4 w-4 text-indigo-600" />
              <span>TDS return (26Q)</span>
            </a>
            {canWriteFinance && (
              <button
                onClick={() => {
                  if (parties.length > 0) setBillPartyId(parties[0].id);
                  setShowBillModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-all"
              >
                <Receipt className="w-4 h-4" />
                <span>+ Record Bill</span>
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
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all"
              >
                <CreditCard className="w-4 h-4" />
                <span>+ Record Payment</span>
              </button>
            )}
          </div>
        </PageHeader>

        {/* Feedback alerts */}
        {statusMessage && <Alert tone="success">{statusMessage}</Alert>}
        {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

        {/* Financial KPI Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Invoiced Liability
            </span>
            <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
              {formatCurrency(totalBilledAll)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Across all posted vendor bills</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Disbursed (Paid)
            </span>
            <div className="text-2xl font-black text-emerald-600 mt-1 tabular-nums">
              {formatCurrency(totalPaidAll)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Verified non-reversed payments</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm bg-gradient-to-br from-amber-50/50 to-white">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
              Total Outstanding Payables
            </span>
            <div className="text-2xl font-black text-amber-600 mt-1 tabular-nums">
              {formatCurrency(totalOutstandingAll)}
            </div>
            <div className="text-[11px] text-amber-700 font-medium mt-1">
              Active company liability
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setActiveTab("PAYMENTS")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "PAYMENTS"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>
              Payments Register (
              {filteredPayments.length !== payments.length
                ? `${filteredPayments.length} of ${payments.length}`
                : payments.length}
              )
            </span>
          </button>
          <button
            onClick={() => setActiveTab("BILLS")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "BILLS"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>
              Vendor Bills (
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
            {/* Search & Filter Toolbar */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3.5 transition-all">
              {/* Row 1: Search Bar & Primary Actions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                {/* Global Search Input */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={paymentSearch}
                    onChange={(e) => setPaymentSearch(e.target.value)}
                    placeholder="Search by date, payee, ref #, source account, method, bill #, amount, reason..."
                    className="w-full pl-9 pr-9 py-2.5 text-xs bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-amber-500 rounded-xl focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all font-medium placeholder:text-slate-400"
                  />
                  {paymentSearch && (
                    <button
                      onClick={() => setPaymentSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 bg-slate-200/60 hover:bg-slate-200 p-1 rounded-full transition"
                      title="Clear search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Primary Action Buttons */}
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {/* Filter Options (Expand/Collapse) */}
                  <button
                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold rounded-xl border transition-all shadow-xs cursor-pointer ${
                      showAdvancedFilters || activePaymentFiltersCount > 0
                        ? "bg-amber-50 border-amber-300 text-amber-900 shadow-amber-100"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Filter Options</span>
                    {activePaymentFiltersCount > 0 && (
                      <span className="w-4 h-4 rounded-full bg-amber-600 text-white text-[10px] flex items-center justify-center font-bold">
                        {activePaymentFiltersCount}
                      </span>
                    )}
                    {showAdvancedFilters ? (
                      <ChevronUp className="w-3.5 h-3.5 text-amber-700" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>

                  {/* Export CSV button */}
                  <button
                    onClick={exportPaymentsToCSV}
                    disabled={filteredPayments.length === 0}
                    className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
                    title="Export currently filtered payments to CSV"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="hidden md:inline">Export CSV</span>
                  </button>

                  {/* Reset All Filters button */}
                  {activePaymentFiltersCount > 0 && (
                    <button
                      onClick={clearAllPaymentFilters}
                      className="flex items-center gap-1 px-3 py-2.5 text-xs font-bold rounded-xl text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all cursor-pointer"
                      title="Reset all filters"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: Interactive Status Pills (Clickable Segmented Control) */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">
                  Status:
                </span>

                {/* ALL Status */}
                <button
                  onClick={() => setPaymentStatus("ALL")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    paymentStatus === "ALL"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  <span>All</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      paymentStatus === "ALL" ? "bg-slate-700 text-slate-200" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {paymentCounts.all}
                  </span>
                </button>

                {/* APPROVED / POSTED */}
                <button
                  onClick={() => setPaymentStatus(paymentStatus === "POSTED" ? "ALL" : "POSTED")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    paymentStatus === "POSTED"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/60"
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approved</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      paymentStatus === "POSTED"
                        ? "bg-emerald-700 text-emerald-100"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {paymentCounts.posted}
                  </span>
                </button>

                {/* PENDING APPROVAL */}
                <button
                  onClick={() =>
                    setPaymentStatus(paymentStatus === "PENDING_APPROVAL" ? "ALL" : "PENDING_APPROVAL")
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    paymentStatus === "PENDING_APPROVAL"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/70"
                  }`}
                >
                  {paymentCounts.pending > 0 && (
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block" />
                  )}
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Pending Super Admin</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      paymentStatus === "PENDING_APPROVAL"
                        ? "bg-amber-700 text-amber-100"
                        : "bg-amber-200/80 text-amber-900"
                    }`}
                  >
                    {paymentCounts.pending}
                  </span>
                </button>

                {/* REJECTED */}
                <button
                  onClick={() => setPaymentStatus(paymentStatus === "REJECTED" ? "ALL" : "REJECTED")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    paymentStatus === "REJECTED"
                      ? "bg-rose-600 text-white shadow-xs"
                      : "bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200/60"
                  }`}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Rejected</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      paymentStatus === "REJECTED" ? "bg-rose-700 text-rose-100" : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {paymentCounts.rejected}
                  </span>
                </button>

                {/* REVERSED */}
                <button
                  onClick={() => setPaymentStatus(paymentStatus === "REVERSED" ? "ALL" : "REVERSED")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    paymentStatus === "REVERSED"
                      ? "bg-slate-700 text-white shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                  }`}
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reversed</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      paymentStatus === "REVERSED" ? "bg-slate-600 text-slate-200" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {paymentCounts.reversed}
                  </span>
                </button>
              </div>

              {/* Row 3: Interactive Quick Preset Pills (Payee Type & Date Shortcuts) */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                {/* Payee Type Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                    Payee:
                  </span>
                  {[
                    { key: "ALL", label: "All Types", count: paymentCounts.all },
                    { key: "VENDOR", label: "Vendors", count: paymentCounts.vendors, icon: Building2 },
                    { key: "CONTRACTOR", label: "Contractors", count: paymentCounts.contractors, icon: Briefcase },
                    { key: "EMPLOYEE", label: "Employees", count: paymentCounts.employees, icon: Users },
                  ].map((tab) => {
                    const active = paymentPayeeType === tab.key;
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setPaymentPayeeType(active && tab.key !== "ALL" ? "ALL" : tab.key)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                          active
                            ? "bg-slate-900 text-white shadow-xs"
                            : "bg-slate-100/80 hover:bg-slate-200/80 text-slate-700 border border-transparent"
                        }`}
                      >
                        {Icon && <Icon className="w-3 h-3" />}
                        <span>{tab.label}</span>
                        <span
                          className={`text-[9px] px-1 rounded font-mono ${
                            active ? "bg-slate-700 text-white" : "text-slate-500"
                          }`}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Date Presets */}
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                    Date:
                  </span>
                  {[
                    { key: "ALL", label: "All Dates" },
                    { key: "TODAY", label: "Today" },
                    { key: "THIS_MONTH", label: "This Month" },
                    { key: "LAST_30", label: "Last 30 Days" },
                    { key: "CUSTOM", label: "Custom ▾" },
                  ].map((p) => {
                    const active = datePreset === p.key;
                    return (
                      <button
                        key={p.key}
                        onClick={() => handleDatePreset(p.key as any)}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer ${
                          active
                            ? "bg-amber-100 text-amber-900 border border-amber-300 font-bold"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 4: Expanded Advanced Filters Drawer */}
              {showAdvancedFilters && (
                <div className="pt-3 border-t border-slate-100 space-y-3 bg-slate-50/70 -mx-4 -mb-4 p-4 rounded-b-2xl border-t">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
                      <span>Advanced Search & Column Filters</span>
                    </div>
                    <button
                      onClick={() => setShowAdvancedFilters(false)}
                      className="text-slate-400 hover:text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <span>Close</span>
                      <ChevronUp className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* From Date */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>From Date</span>
                        </span>
                        {paymentFromDate && (
                          <button
                            onClick={() => {
                              setPaymentFromDate("");
                              setDatePreset("ALL");
                            }}
                            className="text-[10px] text-rose-600 hover:underline cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </label>
                      <input
                        type="date"
                        value={paymentFromDate}
                        onChange={(e) => {
                          setPaymentFromDate(e.target.value);
                          setDatePreset("CUSTOM");
                        }}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>

                    {/* To Date */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>To Date</span>
                        </span>
                        {paymentToDate && (
                          <button
                            onClick={() => {
                              setPaymentToDate("");
                              setDatePreset("ALL");
                            }}
                            className="text-[10px] text-rose-600 hover:underline cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </label>
                      <input
                        type="date"
                        value={paymentToDate}
                        onChange={(e) => {
                          setPaymentToDate(e.target.value);
                          setDatePreset("CUSTOM");
                        }}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>

                    {/* Paying Account (Source) */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                        <Landmark className="w-3 h-3 text-slate-400" />
                        <span>Paying Account (Source)</span>
                      </label>
                      <select
                        value={paymentPayingAccount}
                        onChange={(e) => setPaymentPayingAccount(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 truncate"
                      >
                        <option value="ALL">All Paying Accounts ({distinctPayingAccounts.length})</option>
                        {distinctPayingAccounts.map((acc) => (
                          <option key={acc} value={acc}>
                            {acc}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Method */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                        <CreditCard className="w-3 h-3 text-slate-400" />
                        <span>Payment Method</span>
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      >
                        <option value="ALL">All Methods</option>
                        <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS/IMPS)</option>
                        <option value="CHEQUE">Cheque</option>
                        <option value="CASH">Cash</option>
                        <option value="UPI">UPI</option>
                        {distinctMethods
                          .filter((m) => !["BANK_TRANSFER", "CHEQUE", "CASH", "UPI"].includes(m))
                          .map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Reason / Query */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Reason / Query / Notes
                      </label>
                      <input
                        type="text"
                        value={paymentReason}
                        onChange={(e) => setPaymentReason(e.target.value)}
                        placeholder="e.g. advance, cement, query..."
                        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>

                    {/* Allocated To */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-bold text-slate-700">
                          Allocated Bill #
                        </label>
                        <div className="flex items-center gap-1 text-[10px]">
                          <button
                            type="button"
                            onClick={() =>
                              setPaymentAllocatedTo(paymentAllocatedTo === "unallocated" ? "" : "unallocated")
                            }
                            className={`px-1.5 py-0.2 rounded font-semibold transition cursor-pointer ${
                              paymentAllocatedTo === "unallocated"
                                ? "bg-amber-100 text-amber-800"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            Unallocated
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={paymentAllocatedTo}
                        onChange={(e) => setPaymentAllocatedTo(e.target.value)}
                        placeholder="e.g. Bill #, unallocated..."
                        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>

                    {/* Min Amount */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Min Amount (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={paymentMinAmount}
                        onChange={(e) => {
                          setPaymentMinAmount(e.target.value);
                          setAmountPreset("CUSTOM");
                        }}
                        placeholder="₹ Min (e.g. 1000)"
                        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>

                    {/* Max Amount */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Max Amount (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={paymentMaxAmount}
                        onChange={(e) => {
                          setPaymentMaxAmount(e.target.value);
                          setAmountPreset("CUSTOM");
                        }}
                        placeholder="₹ Max (e.g. 50000)"
                        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                  </div>

                  {/* Quick Amount presets */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1 text-xs">
                    <span className="text-[11px] font-bold text-slate-400">Quick Amount:</span>
                    {[
                      { key: "ALL", label: "All Amounts" },
                      { key: "UNDER_50K", label: "< ₹50,000" },
                      { key: "50K_2L", label: "₹50,000 – ₹2,00,000" },
                      { key: "OVER_2L", label: "> ₹2,00,000" },
                    ].map((p) => (
                      <button
                        key={p.key}
                        onClick={() => handleAmountPreset(p.key as any)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                          amountPreset === p.key
                            ? "bg-slate-900 text-white"
                            : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Row 5: Summary & Interactive Active Filter Chips */}
              <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-600">
                    Showing <strong className="text-slate-900 font-bold">{filteredPayments.length}</strong> of{" "}
                    <strong className="text-slate-900 font-bold">{payments.length}</strong> payments
                  </span>
                  {filteredPayments.length > 0 && (
                    <span className="font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200 text-xs shadow-xs flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Filtered Total: {formatCurrency(filteredPaymentsTotal)}</span>
                    </span>
                  )}
                </div>

                {activePaymentFiltersCount > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-400">Active:</span>
                    {paymentSearch && (
                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 px-2.5 py-0.5 rounded-md text-[10px] font-bold border border-amber-200/80">
                        &quot;{paymentSearch}&quot;
                        <button onClick={() => setPaymentSearch("")} className="hover:text-amber-950 cursor-pointer">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    )}
                    {paymentStatus !== "ALL" && (
                      <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-md text-[10px] font-bold border border-slate-300">
                        Status: {paymentStatus}
                        <button onClick={() => setPaymentStatus("ALL")} className="hover:text-black cursor-pointer">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    )}
                    {paymentPayeeType !== "ALL" && (
                      <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-md text-[10px] font-bold border border-slate-300">
                        Type: {paymentPayeeType}
                        <button onClick={() => setPaymentPayeeType("ALL")} className="hover:text-black cursor-pointer">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    )}
                    {(paymentFromDate || paymentToDate) && (
                      <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-md text-[10px] font-bold border border-slate-300">
                        Date: {paymentFromDate || "Start"} → {paymentToDate || "End"}
                        <button
                          onClick={() => {
                            setPaymentFromDate("");
                            setPaymentToDate("");
                            setDatePreset("ALL");
                          }}
                          className="hover:text-black cursor-pointer"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    )}
                    {paymentPayingAccount !== "ALL" && (
                      <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-md text-[10px] font-bold border border-slate-300">
                        Account: {paymentPayingAccount.slice(0, 18)}...
                        <button onClick={() => setPaymentPayingAccount("ALL")} className="hover:text-black cursor-pointer">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    )}
                    {paymentMethod !== "ALL" && (
                      <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-md text-[10px] font-bold border border-slate-300">
                        Method: {paymentMethod}
                        <button onClick={() => setPaymentMethod("ALL")} className="hover:text-black cursor-pointer">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    )}
                    {paymentReason && (
                      <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-md text-[10px] font-bold border border-slate-300">
                        Reason: {paymentReason}
                        <button onClick={() => setPaymentReason("")} className="hover:text-black cursor-pointer">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    )}
                    {paymentAllocatedTo && (
                      <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-md text-[10px] font-bold border border-slate-300">
                        Allocated: {paymentAllocatedTo}
                        <button onClick={() => setPaymentAllocatedTo("")} className="hover:text-black cursor-pointer">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    )}
                    {(paymentMinAmount || paymentMaxAmount) && (
                      <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-md text-[10px] font-bold border border-slate-300">
                        Amount: ₹{paymentMinAmount || "0"} – ₹{paymentMaxAmount || "∞"}
                        <button
                          onClick={() => {
                            setPaymentMinAmount("");
                            setPaymentMaxAmount("");
                            setAmountPreset("ALL");
                          }}
                          className="hover:text-black cursor-pointer"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    )}
                    <button
                      onClick={clearAllPaymentFilters}
                      className="text-[11px] text-rose-600 hover:text-rose-800 font-bold ml-1 hover:underline cursor-pointer"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Payments Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <ExcelTableToolbar
                table={excelPayments}
                columns={paymentColumns}
                tableName="payments"
                showSearch={true}
                showExport={true}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
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
                    {excelPayments.filteredData.map((p) => {
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
                              <span>{p.payingAccount || "Company Primary A/C"}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                              {p.method}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs max-w-xs">
                            <div className="text-slate-700 truncate" title={p.approvalQuery || p.notes || ""}>
                              {p.approvalQuery || p.notes || "—"}
                            </div>
                            {isRejected && p.rejectionReason && (
                              <div className="text-[10px] text-rose-600 font-semibold mt-0.5">
                                Declined: {p.rejectionReason}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">
                            {p.allocations && p.allocations.length > 0 ? (
                              p.allocations.map((a: any) => (
                                <div key={a.id} className="font-mono text-[11px]">
                                  Bill #{a.bill?.billNumber || a.billId} ({formatCurrency(a.amount)})
                                </div>
                              ))
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-slate-400 italic">Unallocated</span>
                                <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded w-fit">
                                  Missing Bill Allocation
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
                                <span>Pending Super Admin</span>
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
                                title="Upload or view payment receipt / voucher"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                              </button>
                              {isPending && canSuperAdminAct ? (
                                <>
                                  <button
                                    onClick={() => handleApprovePayment(p)}
                                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-xs transition"
                                    title="Confirm & Approve disbursement"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Approve</span>
                                  </button>
                                  <button
                                    onClick={() => handleRejectPayment(p)}
                                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md transition"
                                    title="Reject disbursement query"
                                  >
                                    <XCircle className="w-3 h-3" />
                                    <span>Reject</span>
                                  </button>
                                </>
                              ) : isPending ? (
                                <span className="text-[11px] text-amber-700 font-medium italic">
                                  Awaiting Admin
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
                            {activePaymentFiltersCount > 0 && (
                              <button
                                onClick={clearAllPaymentFilters}
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
                  <option value="PENDING">Pending Balance</option>
                  <option value="PAID">Fully Paid</option>
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
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
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
                    {excelBills.filteredData.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {b.billNumber}
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
                                title: `Bill #${b.billNumber} Invoices & Challans`,
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
            </div>
          </div>
        )}

        {/* Modal: Record Payment */}
        {showPaymentModal && canWriteFinance && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                  <span>Record Payment & Raise Approval Query</span>
                </div>
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
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
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1 flex items-center gap-1.5">
                    <Landmark className="w-3.5 h-3.5 text-slate-600" />
                    <span>Account From Which To Pay (Source Account) *</span>
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
                <div className="grid grid-cols-2 gap-3">
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
                    Reason & Purpose for Payment (Approval Query) *
                  </label>
                  <textarea
                    required
                    rows={2}
                    placeholder="e.g. Advance payment for column rebar tying week 42, Steel shipment delivery settlement, Site food allowance reimbursement"
                    value={approvalQuery}
                    onChange={(e) => setApprovalQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                {/* 7. Bill Allocation if Vendor / Contractor */}
                {recipientType !== "EMPLOYEE" && partyBills.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Allocate to Pending Bill (Optional)
                    </label>
                    <select
                      value={selectedBillId}
                      onChange={(e) => setSelectedBillId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    >
                      <option value="">Leave as unallocated payment / general advance</option>
                      {partyBills.map((b) => (
                        <option key={b.id} value={b.id}>
                          Bill #{b.billNumber} — Pending: {formatCurrency(b.outstandingAmount)}
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
                        aria-label="How TDS is worked out"
                      >
                        <option value="AUTO">Work it out</option>
                        <option value="NONE">No TDS</option>
                        <option value="MANUAL">Type the amount</option>
                      </select>
                    </div>
                    {tdsMode === "MANUAL" && (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={tdsManual}
                        onChange={(e) => setTdsManual(e.target.value)}
                        placeholder="TDS ₹, e.g. under a lower-deduction certificate"
                        className="mt-2 w-full rounded-lg border border-indigo-200 bg-white p-2 text-sm font-mono"
                      />
                    )}
                    {tdsMode !== "AUTO" && (
                      <input
                        type="text"
                        value={tdsReason}
                        onChange={(e) => setTdsReason(e.target.value)}
                        required={tdsMode === "NONE"}
                        placeholder={tdsMode === "NONE" ? "Why? e.g. transporter's declaration, or the yearly total stays under the limit" : "Why? e.g. section 197 certificate no."}
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
                      {!tdsPreview.pan && <div className="font-semibold text-rose-700">No PAN for this party, so TDS is 20%. Add it on the Vendors &amp; Contractors page.</div>}
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
                        Direct Authorize / Instant Super Admin Approval (Immediate Post)
                      </span>
                    </label>
                    <p className="text-[11px] text-amber-800 mt-1">
                      Uncheck to submit as a pending query for review on the Super Admin console.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 leading-relaxed">
                    ℹ️ <strong>Super Admin Confirmation Required:</strong> Submitting this form will raise an approval query to Super Admin with your specified reason and paying account. Disbursement will be posted once confirmed.
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {submitting
                        ? "Submitting Query..."
                        : currentUser?.role === "SUPER_ADMIN" && autoApprove
                        ? "Post & Confirm Payment"
                        : "Submit Payment Approval Query"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Reverse Payment */}
        {showReverseModal && paymentToReverse && canReverseFinance && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-rose-600" />
                  <span>Reverse Posted Payment</span>
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
                vendor bills outstanding balance and log an immutable audit entry.
              </div>

              <form onSubmit={handleReverseSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Mandatory Audit Reversal Reason
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
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
            <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
              <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-100 shrink-0 bg-white">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-500" />
                  <span>Record Vendor / Contractor Bill</span>
                </div>
                <button
                  onClick={() => setShowBillModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="create-bill-modal-form" onSubmit={handleBillSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Party (Vendor / Contractor) *
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
                      Target Project (Optional)
                    </label>
                    <select
                      value={billProjectId}
                      onChange={(e) => setBillProjectId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    >
                      <option value="">Select Project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.code})
                        </option>
                      ))}
                    </select>
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
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Bill Line Items
                    </span>
                    <button
                      type="button"
                      onClick={addBillLine}
                      className="text-xs font-bold text-amber-600 hover:text-amber-500 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Line</span>
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-56 overflow-y-auto">
                    {billLines.map((line, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-2"
                      >
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
                          <div className="sm:col-span-1 flex justify-end items-center">
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

                        <div className="grid grid-cols-3 gap-2">
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
                          <div>
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
                                <option value="AUTO">Work out from GSTINs</option>
                                <option value="LOCAL">Same state: CGST + SGST</option>
                                <option value="IGST">Other state: IGST</option>
                              </select>
                            </label>
                          )}
                          {billGstRate !== "" && (
                            <div className="space-y-1 sm:pt-4">
                              <label className="flex items-center gap-2">
                                <input type="checkbox" checked={billItc} onChange={(e) => setBillItc(e.target.checked)} />
                                <span className="text-slate-600">Claim input tax credit</span>
                              </label>
                              <label className="flex items-center gap-2" title="For example GTA transport or an unregistered supplier under notified services: you pay the GST to the government, not the supplier.">
                                <input type="checkbox" checked={billRcm} onChange={(e) => setBillRcm(e.target.checked)} />
                                <span className="text-slate-600">Reverse charge</span>
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
                  {submitting ? "Posting Bill..." : "Post Bill Liability"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Attachment Modal (Priority 3) */}
        {attachmentTarget && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Paperclip className="w-5 h-5 text-amber-500" />
                  <span>{attachmentTarget.title}</span>
                </div>
                <button
                  onClick={() => setAttachmentTarget(null)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <AttachmentManager
                  entityType={attachmentTarget.type}
                  entityId={attachmentTarget.id}
                  title={attachmentTarget.title}
                  allowUpload={true}
                  categoryDefault={attachmentTarget.categoryDefault || "INVOICE"}
                  highlightMissing={true}
                  missingLabel="No invoice or receipt attached yet"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
