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
} from "lucide-react";

export default function FinancePage() {
  const [bills, setBills] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"BILLS" | "PAYMENTS">("PAYMENTS");

  // Payment Modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPartyId, setSelectedPartyId] = useState("");
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
      fetch("/api/finance/bills").then((r) => r.json()),
      fetch("/api/finance/payments").then((r) => r.json()),
      fetch("/api/parties").then((r) => r.json()),
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/materials").then((r) => r.json()),
    ])
      .then(([billsRes, paymentsRes, partiesRes, projRes, matRes]) => {
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

    try {
      const payload: any = {
        partyId: selectedPartyId,
        paymentDate: new Date().toISOString(),
        amount: paymentAmountPaise,
        method,
        referenceNumber,
        idempotencyKey,
        notes: notes || undefined,
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
        setStatusMessage(
          `Payment of ₹${amount} posted successfully with idempotency key ${idempotencyKey}`
        );
        setShowPaymentModal(false);
        setAmount("");
        setReferenceNumber("");
        setSelectedBillId("");
        setNotes("");
        loadData();
      }
    } catch {
      setErrorMessage("Network error during payment submission");
    } finally {
      setSubmitting(false);
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
        const totalAmountRupees = (parsedLines.reduce((s, l) => s + l.lineTotal, 0) / 100).toFixed(2);
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

  const totalBilledAll = bills.reduce((sum, b) => sum + b.totalAmount, 0);
  const totalPaidAll = payments
    .filter((p) => p.status === "POSTED")
    .reduce((sum, p) => sum + p.amount, 0);
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
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Payee / Vendor</th>
                    <th className="py-3 px-4">Method / Reference</th>
                    <th className="py-3 px-4">Allocated To</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => {
                    const isReversed = p.status === "REVERSED";
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 text-xs font-mono text-slate-600">
                          {formatDate(p.paymentDate)}
                        </td>
                        <td className="py-3 px-4">
                          <Link
                            href={`/parties/${p.partyId}`}
                            className="font-bold text-slate-900 hover:text-amber-600 hover:underline"
                          >
                            {p.party?.name}
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <div className="font-semibold text-slate-800">{p.method}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            Ref: {p.referenceNumber}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {p.allocations && p.allocations.length > 0 ? (
                            p.allocations.map((a: any) => (
                              <div key={a.id} className="font-mono text-[11px]">
                                Bill #{a.bill?.billNumber || a.billId} ({formatCurrency(a.amount)})
                              </div>
                            ))
                          ) : (
                            <span className="text-slate-400 italic">Unallocated</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-black tabular-nums">
                          <span className={isReversed ? "line-through text-slate-400" : "text-emerald-600"}>
                            {formatCurrency(p.amount)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                              isReversed
                                ? "bg-rose-100 text-rose-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {!isReversed && (
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
                          )}
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
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                  <span>Record Payment & Allocate</span>
                </div>
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handlePaymentSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Select Payee (Vendor / Contractor)
                  </label>
                  <select
                    value={selectedPartyId}
                    onChange={(e) => {
                      setSelectedPartyId(e.target.value);
                      setSelectedBillId("");
                    }}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — Outstanding: {formatCurrency(p.outstandingBalance)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Payment Amount (₹)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      placeholder="e.g. 4000"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Payment Method
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

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Reference / UTR / Cheque Number
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. UTR-HDFC-991823"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                  />
                </div>

                {partyBills.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Allocate to Pending Bill (Optional)
                    </label>
                    <select
                      value={selectedBillId}
                      onChange={(e) => setSelectedBillId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    >
                      <option value="">Leave as unallocated payment</option>
                      {partyBills.map((b) => (
                        <option key={b.id} value={b.id}>
                          Bill #{b.billNumber} — Pending: {formatCurrency(b.outstandingAmount)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Paid as per milestone 2 agreement"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

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
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {submitting ? "Processing..." : "Post Payment"}
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
                        .reduce((sum, l) => sum + (parseFloat(l.lineTotal) || 0), 0)
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
      </div>
    </Shell>
  );
}
