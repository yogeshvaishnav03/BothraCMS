"use client";

import React, { useEffect, useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Building2,
  User,
  DollarSign,
  Package,
  BookOpen,
  AlertCircle,
  Check,
  X,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface ApprovalItem {
  id: string;
  type: "PAYMENT" | "EXPENSE" | "MATERIAL_REQUEST" | "MEASUREMENT_CHANGE" | "PURCHASE_ORDER";
  title: string;
  amountRupees: number;
  status: string;
  projectName: string;
  siteName: string;
  requestedBy: string;
  requestedByRole: string;
  rejectionReason: string | null;
  date: string;
  query?: string | null;
}

interface ApprovalsWidgetProps {
  onActionComplete?: () => void;
  className?: string;
  showHeader?: boolean;
}

export default function ApprovalsWidget({
  onActionComplete,
  className = "",
  showHeader = true,
}: ApprovalsWidgetProps = {}) {
  const [loading, setLoading] = useState(true);
  const [isApprover, setIsApprover] = useState(false);
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [activeFilter, setActiveFilter] = useState<"ALL" | "PENDING" | "REJECTED">("ALL");
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchApprovals = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch("/api/approvals");
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setLoadError(json.error?.message || "Failed to load approval records.");
        return;
      }
      if (json.data) {
        setIsApprover(Boolean(json.data.isApprover));
        setItems(json.data.items || []);
      }
    } catch (e: any) {
      console.warn("Failed to load approvals widget:", e);
      setLoadError(e.message || "Network error loading approvals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const handleAction = async (item: ApprovalItem, action: "APPROVE" | "REJECT", reason?: string) => {
    try {
      setActionLoading(item.id);
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: item.type,
          entityId: item.id,
          action,
          reason,
        }),
      });
      if (res.ok) {
        setRejectingId(null);
        setRejectReason("");
        await fetchApprovals();
        onActionComplete?.();
      }
    } catch (e) {
      console.error("Approval action failed:", e);
    } finally {
      setActionLoading(null);
    }
  };

  const pendingItems = items.filter((i) => i.status === "PENDING" || i.status === "PENDING_APPROVAL");
  const rejectedItems = items.filter((i) => i.status === "REJECTED");

  const filteredItems = (
    activeFilter === "PENDING"
      ? pendingItems
      : activeFilter === "REJECTED"
      ? rejectedItems
      : items
  ).slice().sort((a, b) => {
    const aPri = a.status === "REJECTED" ? 2 : a.status === "PENDING" || a.status === "PENDING_APPROVAL" ? 1 : 0;
    const bPri = b.status === "REJECTED" ? 2 : b.status === "PENDING" || b.status === "PENDING_APPROVAL" ? 1 : 0;
    if (aPri !== bPri) return bPri - aPri;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4 ${className}`}>
      {showHeader && (
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                <span>{isApprover ? "Pending Approvals Queue" : "My Requests & Approval Status"}</span>
                {pendingItems.length > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full">
                    {pendingItems.length} Pending
                  </span>
                )}
                {rejectedItems.length > 0 && (
                  <span className="text-xs bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />
                    {rejectedItems.length} Rejected
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500">
                {isApprover
                  ? "Review and authorize expenditures, material orders, and change requests"
                  : "Real-time verification status, payment decisions, and audit feedback from leadership"}
              </p>
            </div>
          </div>

          <button
            onClick={fetchApprovals}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Refresh Queue"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex items-center gap-1.5 pb-1">
          <button
            type="button"
            onClick={() => setActiveFilter("ALL")}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
              activeFilter === "ALL"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("PENDING")}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
              activeFilter === "PENDING"
                ? "bg-amber-600 text-white shadow-2xs"
                : "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
            }`}
          >
            Pending ({pendingItems.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("REJECTED")}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${
              activeFilter === "REJECTED"
                ? "bg-rose-600 text-white shadow-2xs"
                : "bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300"
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Rejected ({rejectedItems.length})</span>
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-xs text-slate-400">Loading approval records...</div>
      ) : loadError ? (
        <div className="py-6 px-4 text-center text-xs space-y-2">
          <div className="text-rose-600 font-semibold">{loadError}</div>
          <button
            type="button"
            onClick={fetchApprovals}
            className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-xs">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-70" />
          <div className="font-semibold text-slate-700 dark:text-slate-300">All caught up!</div>
          <p className="mt-0.5">
            {isApprover
              ? "No pending approvals currently awaiting authorization."
              : "You have no active pending or rejected requests."}
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-xs">
          <p>
            {activeFilter === "REJECTED"
              ? "No rejected payment requests or purchase orders."
              : "No pending requests awaiting approval."}
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {filteredItems.map((item) => {
            const isPending = item.status === "PENDING" || item.status === "PENDING_APPROVAL";
            const isApproved = item.status === "POSTED" || item.status === "APPROVED";
            const isRejected = item.status === "REJECTED";

            return (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border transition-all space-y-2.5 ${
                  isRejected
                    ? "bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900"
                    : isApproved
                    ? "bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900"
                    : "bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                        {item.title}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          item.type === "PAYMENT"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                            : item.type === "EXPENSE"
                            ? "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300"
                            : item.type === "PURCHASE_ORDER"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : item.type === "MATERIAL_REQUEST"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                            : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300"
                        }`}
                      >
                        {item.type.replace(/_/g, " ")}
                      </span>
                      {item.amountRupees > 0 && (
                        <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                          ₹{item.amountRupees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>

                    {item.query && (
                      <div className="text-xs bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-2 rounded-lg text-amber-900 dark:text-amber-200 mt-1 flex items-start gap-1.5">
                        <span className="font-semibold shrink-0">Note / Reason:</span>
                        <span className="truncate">{item.query}</span>
                      </div>
                    )}

                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                      <span>{item.siteName} &bull; {item.projectName}</span>
                      <span>&bull; By: {item.requestedBy} ({item.requestedByRole})</span>
                    </div>
                  </div>

                  {/* Status Badge or Approver Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isApprover && isPending ? (
                      rejectingId === item.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="Reason for rejection..."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className="px-2 py-1 text-xs rounded border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-800"
                          />
                          <button
                            onClick={() => handleAction(item, "REJECT", rejectReason)}
                            disabled={actionLoading === item.id}
                            className="px-2.5 py-1 text-xs font-bold rounded bg-rose-600 text-white hover:bg-rose-700"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setRejectingId(null)}
                            className="p-1 text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleAction(item, "APPROVE")}
                            disabled={actionLoading === item.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Approve
                          </button>
                          <button
                            onClick={() => setRejectingId(item.id)}
                            disabled={actionLoading === item.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        </div>
                      )
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                          isApproved
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : isRejected
                            ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                        }`}
                      >
                        {isApproved ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : isRejected ? (
                          <XCircle className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                        {item.status.replace("_", " ")}
                      </span>
                    )}
                  </div>
                </div>

                {isRejected && item.rejectionReason && (
                  <div className="text-xs bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 p-2 rounded-lg text-rose-800 dark:text-rose-300 flex items-start gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                    <div>
                      <span className="font-semibold">Rejection Note: </span>
                      {item.rejectionReason}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
