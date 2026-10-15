"use client";

import React, { useEffect, useState } from "react";
import Shell from "@/components/layout/Shell";
import { formatDateTime } from "@/lib/formatters";
import {
  ShieldCheck,
  Search,
  Filter,
  User,
  Clock,
  ArrowRight,
  RotateCcw,
  CreditCard,
  Boxes,
  Edit3,
} from "lucide-react";

export default function AuditPage() {
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/audit")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setAuditEvents(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredEvents = auditEvents.filter(
    (e) =>
      e.action.toLowerCase().includes(search.toLowerCase()) ||
      (e.actor?.name && e.actor.name.toLowerCase().includes(search.toLowerCase())) ||
      (e.reason && e.reason.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <ShieldCheck className="w-6 h-6 text-amber-500" />
              <span>Immutable System Audit Trail</span>
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Chronological log of sensitive operations: posted payments, reversals, stock adjustments, and attendance overrides.
            </p>
          </div>
          <span className="text-xs font-mono font-bold bg-slate-900 text-amber-400 px-3 py-1.5 rounded-lg w-max">
            Audit Trail Active
          </span>
        </div>

        {/* Search */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search audit trail by action, actor name, or justification reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Audit Log Table */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-200/60 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <div className="text-sm font-bold text-slate-700">No audit events recorded</div>
            <div className="text-xs text-slate-400 mt-1">Actions performed by users will appear here automatically.</div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Target Entity</th>
                    <th className="py-3 px-4">Reason / Notes</th>
                    <th className="py-3 px-4">Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-xs">
                  {filteredEvents.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        {formatDateTime(e.createdAt)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded uppercase tracking-wider text-[10px] ${
                            e.action.includes("REVERS")
                              ? "bg-rose-100 text-rose-800"
                              : e.action.includes("RECEIPT") || e.action.includes("PAYMENT")
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {e.action}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-sans">
                        <div className="font-bold text-slate-900">{e.actor?.name || "System"}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {e.actor?.role?.toLowerCase().replace("_", " ")}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        <div className="font-semibold text-slate-800">{e.entityType}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                          {e.entityId}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-sans text-xs text-slate-700">
                        {e.reason ? (
                          <span className="font-medium text-amber-900 bg-amber-50 px-2 py-1 rounded border border-amber-200/60 block">
                            {e.reason}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Standard transaction</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-[11px] text-slate-500 max-w-[200px] truncate">
                        {e.afterJson || e.beforeJson || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
