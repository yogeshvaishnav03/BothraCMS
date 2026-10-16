"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatQuantity, formatDateTime } from "@/lib/formatters";
import {
  Boxes,
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  ShieldCheck,
  Calendar,
  Building2,
  FileText,
  User,
} from "lucide-react";

export default function MaterialDetailPage() {
  const params = useParams();
  const materialId = params.id as string;

  const [ledgerData, setLedgerData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!materialId) return;
    fetch(`/api/materials/${materialId}/ledger`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setLedgerData(res.data);
        } else {
          setLedgerData(null);
        }
      })
      .catch((err) => {
        console.error("Authoritative material ledger load failed:", err);
        setLedgerData(null);
      })
      .finally(() => setLoading(false));
  }, [materialId]);

  if (loading) {
    return (
      <Shell>
        <div className="space-y-4">
          <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
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

  if (!ledgerData) {
    return (
      <Shell>
        <div className="text-center py-12">
          <div className="text-base font-bold text-slate-700">Material not found</div>
          <Link href="/materials" className="text-xs text-amber-600 font-semibold hover:underline mt-2 inline-block">
            ← Back to Materials
          </Link>
        </div>
      </Shell>
    );
  }

  const { material, currentBalance, totalReceived, totalIssued, entries } = ledgerData;

  return (
    <Shell>
      <div className="space-y-6">
        {/* Breadcrumb & Navigation */}
        <div className="flex items-center gap-3">
          <Link
            href="/materials"
            className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              Material Detail & Stock Ledger
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>{material.name}</span>
              <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-slate-200 text-slate-700 font-bold">
                {material.sku}
              </span>
            </h1>
          </div>
        </div>

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Current Stock on Hand
            </span>
            <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
              {formatQuantity(currentBalance, material.unitCode)}
            </div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-1">
              Authoritative Reconciled Balance
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Received to Date
            </span>
            <div className="text-2xl font-black text-emerald-600 mt-1 tabular-nums">
              {formatQuantity(totalReceived, material.unitCode)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">From vendor shipments</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Issued / Consumed
            </span>
            <div className="text-2xl font-black text-amber-600 mt-1 tabular-nums">
              {formatQuantity(totalIssued, material.unitCode)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Issued to site projects & tasks</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Minimum Threshold
            </span>
            <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
              {formatQuantity(material.minStockQty, material.unitCode)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Automatic reorder warning level</div>
          </div>
        </div>

        {/* Chronological Stock Ledger Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-500" />
                <span>Authoritative Chronological Stock Ledger</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Every movement records store, date, type, vendor/source, received, issued, rate, and running balance.
              </p>
            </div>
            <span className="text-xs font-mono font-bold bg-slate-200 text-slate-800 px-2.5 py-1 rounded">
              {entries.length} Ledger Records
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No stock movements recorded for this material yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Date / Time</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Store</th>
                    <th className="py-3 px-4">Vendor / Ref</th>
                    <th className="py-3 px-4 text-right">Received</th>
                    <th className="py-3 px-4 text-right">Issued</th>
                    <th className="py-3 px-4 text-right">Rate (₹)</th>
                    <th className="py-3 px-4 text-right">Running Balance</th>
                    <th className="py-3 px-4">Project / Task</th>
                    <th className="py-3 px-4">Logged By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((m: any) => {
                    const isPositive = m.quantityDelta > 0;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 text-xs text-slate-600 font-mono whitespace-nowrap">
                          {formatDateTime(m.date)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                              m.type === "RECEIPT"
                                ? "bg-emerald-100 text-emerald-800"
                                : m.type === "ISSUE"
                                ? "bg-amber-100 text-amber-800"
                                : m.type.startsWith("TRANSFER")
                                ? "bg-blue-100 text-blue-800"
                                : "bg-purple-100 text-purple-800"
                            }`}
                          >
                            {isPositive ? (
                              <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <ArrowUpRight className="w-3 h-3 text-amber-600" />
                            )}
                            {m.type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs font-medium text-slate-700 whitespace-nowrap">
                          {m.storeName}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <div className="font-semibold text-slate-900">{m.vendorName || "—"}</div>
                          {m.referenceDoc && (
                            <div className="text-[10px] font-mono text-slate-500">
                              Ref: {m.referenceDoc}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-600 tabular-nums">
                          {isPositive ? formatQuantity(m.quantityDelta, m.unitCode) : "—"}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-amber-600 tabular-nums">
                          {!isPositive ? formatQuantity(Math.abs(m.quantityDelta), m.unitCode) : "—"}
                        </td>
                        <td className="py-3 px-4 text-right text-xs font-mono text-slate-600 tabular-nums">
                          {m.unitRate ? formatCurrency(m.unitRate) : "—"}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-slate-900 tabular-nums bg-amber-50/40">
                          {formatQuantity(m.runningBalance, m.unitCode)}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {m.projectName ? (
                            <div>
                              <span className="font-semibold text-slate-800">{m.projectName}</span>
                              {m.taskTitle && (
                                <div className="text-[10px] text-slate-500">{m.taskTitle}</div>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                          {m.createdByName}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
