"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  Building2,
  ArrowLeft,
  DollarSign,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  CreditCard,
  FileText,
  Clock,
  Printer,
} from "lucide-react";

export default function PartyStatementPage() {
  const params = useParams();
  const partyId = params.id as string;

  const [statementData, setStatementData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!partyId) return;
    fetch(`/api/parties/${partyId}/statement`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setStatementData(res.data);
        } else {
          setStatementData(null);
        }
      })
      .catch((err) => {
        console.error("Authoritative party statement load failed:", err);
        setStatementData(null);
      })
      .finally(() => setLoading(false));
  }, [partyId]);

  if (loading) {
    return (
      <Shell>
        <div className="space-y-4">
          <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-slate-200 rounded-xl animate-pulse" />
        </div>
      </Shell>
    );
  }

  if (!statementData) {
    return (
      <Shell>
        <div className="text-center py-12">
          <div className="text-base font-bold text-slate-700">Vendor / Contractor not found</div>
          <Link href="/parties" className="text-xs text-amber-600 font-semibold hover:underline mt-2 inline-block">
            ← Back to Directory
          </Link>
        </div>
      </Shell>
    );
  }

  const { party, totalBilled, totalPaid, outstandingBalance, bills, payments } = statementData;

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header & Breadcrumb */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/parties"
              className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 shadow-sm print:hidden"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Vendor / Contractor Financial Statement
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>{party.name}</span>
                <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">
                  {party.partyType}
                </span>
              </h1>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition print:hidden self-start sm:self-auto"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save as PDF</span>
          </button>
        </div>

        {/* Financial Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Invoiced / Billed
            </span>
            <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
              {formatCurrency(totalBilled)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Sum of all posted bills ({bills.length} bills)
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Amount Paid
            </span>
            <div className="text-2xl font-black text-emerald-600 mt-1 tabular-nums">
              {formatCurrency(totalPaid)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Verified disbursements ({payments.length} payments)
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm bg-gradient-to-br from-amber-50/50 to-white">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
              Current Outstanding Payable
            </span>
            <div className="text-2xl font-black text-amber-600 mt-1 tabular-nums">
              {formatCurrency(outstandingBalance)}
            </div>
            <div className="text-[11px] text-amber-700 font-medium mt-1">
              Reconciled liability = Total Billed − Total Paid
            </div>
          </div>
        </div>

        {/* Posted Bills Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Receipt className="w-4 h-4 text-blue-600" />
              <span>Posted Invoices & Bills</span>
            </h2>
            <span className="text-xs font-mono font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
              {bills.length} Bills
            </span>
          </div>

          {bills.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No bills posted for this party yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Bill #</th>
                    <th className="py-3 px-4">Bill Date</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4 text-right">Bill Total</th>
                    <th className="py-3 px-4 text-right">Amount Paid</th>
                    <th className="py-3 px-4 text-right">Pending Balance</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bills.map((b: any) => (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {b.billNumber}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {formatDate(b.billDate)}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {b.dueDate ? formatDate(b.dueDate) : "—"}
                      </td>
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
                            SETTLED
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
          )}
        </div>

        {/* Payments Register Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              <span>Payments & Settlements</span>
            </h2>
            <span className="text-xs font-mono font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
              {payments.length} Payments
            </span>
          </div>

          {payments.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No payments recorded for this party yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Payment Date</th>
                    <th className="py-3 px-4">Method / UTR #</th>
                    <th className="py-3 px-4">Allocated To Bill</th>
                    <th className="py-3 px-4 text-right">Payment Amount</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-xs font-mono text-slate-600">
                        {formatDate(p.paymentDate)}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-bold text-slate-900">{p.method}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          Ref: {p.referenceNumber}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {p.allocations && p.allocations.length > 0 ? (
                          p.allocations.map((a: any) => (
                            <div key={a.id} className="font-mono">
                              Bill #{a.bill?.billNumber || a.billId} ({formatCurrency(a.amount)})
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-400 italic">Unallocated</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-emerald-600 tabular-nums">
                        {formatCurrency(p.amount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                            p.status === "POSTED"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
