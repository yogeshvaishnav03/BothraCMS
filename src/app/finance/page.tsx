"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  DollarSign,
  Plus,
  Receipt,
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
} from "lucide-react";
import AttachmentManager from "@/components/attachments/AttachmentManager";

export default function FinancePage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
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
  const [payingAccount, setPayingAccount] = useState("HDFC Bank Operating A/C (A/C: ...4421)");
  const [customPayingAccount, setCustomPayingAccount] = useState("");
  const [approvalQuery, setApprovalQuery] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [selectedBillId, setSelectedBillId] = useState("");
  const [notes, setNotes] = useState("");

  // Bill Modal state
  const [showBillModal, setShowBillModal] = useState(false);
  const [billPartyId, setBillPartyId] = useState("");
  const [billProjectId, setBillProjectId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().split("T")[0]);
  const [billDueDate, setBillDueDate] = useState("");
  const [billNotes, setBillNotes] = useState("");
  const [billLines, setBillLines] = useState<
    Array<{ description: string; materialId: string; quantity: string; unitRate: string; lineTotal: string }>
  >([{ description: "", materialId: "", quantity: "", unitRate: "", lineTotal: "" }]);

  // Reversal Modal state
  const [showReverseModal, setShowReverseModal] = useState(false);
  const [paymentToReverse, setPaymentToReverse] = useState<any>(null);
  const [reverseReason, setReverseReason] = useState("");

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
    ])
      .then(([meRes, billsRes, paymentsRes, partiesRes, projRes, matRes]) => {
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
      })
      .catch((err) => {
        console.error("Authoritative finance data load failed:", err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

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
          lines: parsedLines,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to create bill");
      } else {
        const totalAmountRupees = (parsedLines.reduce((s: number, l: any) => s + (l.lineTotal || 0), 0) / 100).toFixed(2);
        setStatusMessage(`Bill #${billNumber} for ₹${totalAmountRupees} posted successfully!`);
        setShowBillModal(false);
        setBillNumber("");
        setBillDueDate("");
        setBillNotes("");
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
  const totalPaidAll = payments
    .filter((p: any) => p.status === "POSTED")
    .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  const totalOutstandingAll = totalBilledAll - totalPaidAll;

  const partyBills = bills.filter(
    (b) => b.partyId === selectedPartyId && b.outstandingAmount > 0
  );

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <DollarSign className="w-6 h-6 text-amber-500" />
              <span>Payments & Financial Ledger</span>
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Idempotency-protected payments, automated bill allocations, and reversible settlements with audit logs.
            </p>
          </div>

          <div className="flex items-center gap-2">
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
            <button
              onClick={() => {
                if (parties.length > 0) setSelectedPartyId(parties[0].id);
                setShowPaymentModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all"
            >
              <CreditCard className="w-4 h-4" />
              <span>+ Record Payment</span>
            </button>
          </div>
        </div>

        {/* Feedback alerts */}
        {statusMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

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
            <span>Payments Register ({payments.length})</span>
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
            <span>Vendor Bills ({bills.length})</span>
          </button>
        </div>

        {/* Payments Table */}
        {activeTab === "PAYMENTS" && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Date & Ref</th>
                    <th className="py-3 px-4">Payee & Type</th>
                    <th className="py-3 px-4">Paying Account (Source)</th>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4">Reason / Query</th>
                    <th className="py-3 px-4">Allocated To</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => {
                    const isReversed = p.status === "REVERSED";
                    const isPending = p.status === "PENDING_APPROVAL";
                    const isRejected = p.status === "REJECTED";
                    const payee = p.recipientName || p.party?.name || "Recipient";
                    const rType = p.recipientType || (p.party?.type) || "VENDOR";
                    const canSuperAdminAct = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ORG_ADMIN";

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
                              <span className="text-[11px] text-amber-700 font-medium italic">Awaiting Admin</span>
                            ) : p.status === "POSTED" && !isReversed ? (
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
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Bills Table */}
        {activeTab === "BILLS" && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Bill #</th>
                    <th className="py-3 px-4">Vendor</th>
                    <th className="py-3 px-4">Bill Date</th>
                    <th className="py-3 px-4 text-right">Total Amount</th>
                    <th className="py-3 px-4 text-right">Amount Paid</th>
                    <th className="py-3 px-4 text-right">Pending Balance</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bills.map((b) => (
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
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Record Payment */}
        {showPaymentModal && (
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
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Kumar (Site Supervisor)"
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
                      {parties
                        .filter((p) => (recipientType === "CONTRACTOR" ? p.type === "CONTRACTOR" : p.type === "VENDOR"))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — Outstanding: {formatCurrency(p.outstandingBalance)}
                          </option>
                        ))}
                    </select>
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
        {showReverseModal && paymentToReverse && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
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
        {showBillModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-500" />
                  <span>Record Vendor / Contractor Bill</span>
                </div>
                <button
                  onClick={() => setShowBillModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleBillSubmit} className="space-y-4">
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
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600">Calculated Bill Total:</span>
                    <span className="font-black font-mono text-sm text-slate-900">
                      ₹
                      {billLines
                        .reduce((sum: number, l: any) => sum + (parseFloat(l.lineTotal) || 0), 0)
                        .toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
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

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBillModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {submitting ? "Posting Bill..." : "Post Bill Liability"}
                  </button>
                </div>
              </form>
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
