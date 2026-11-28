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
  Users,
  DollarSign,
  Package,
  BookOpen,
  AlertCircle,
  Check,
  X,
  RotateCcw,
  Send,
  Eye,
} from "lucide-react";
import { formatCurrency, stripAssignedTag } from "@/lib/formatters";
import ApprovalDetailModal, { ApprovalItem } from "./ApprovalDetailModal";

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
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [reRequestingId, setReRequestingId] = useState<string | null>(null);
  const [reRequestNote, setReRequestNote] = useState("");
  const [reRequestAmount, setReRequestAmount] = useState("");
  const [statusNotification, setStatusNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
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

  const handleReRequest = async (item: ApprovalItem, customNote?: string, customAmount?: number) => {
    try {
      setActionLoading(item.id);
      const noteToUse = customNote !== undefined ? customNote : reRequestNote;
      const amtToUse = customAmount !== undefined ? customAmount : parseFloat(reRequestAmount);
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: item.type,
          entityId: item.id,
          action: "RESUBMIT",
          reason: noteToUse.trim() || undefined,
          amountRupees: !isNaN(amtToUse) && amtToUse > 0 ? amtToUse : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setReRequestingId(null);
        setReRequestNote("");
        setReRequestAmount("");
        setStatusNotification({
          message: `Request "${item.title}" successfully re-submitted for approval! Status updated to Pending.`,
          type: "success",
        });
        setTimeout(() => setStatusNotification(null), 5000);
        await fetchApprovals();
        onActionComplete?.();
      } else {
        alert(data.error?.message || "Failed to resubmit request.");
      }
    } catch (e: any) {
      console.error("Re-request failed:", e);
      alert(e.message || "Network error while resubmitting request");
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

      {statusNotification && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between animate-in fade-in ${
            statusNotification.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
              : "bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusNotification.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{statusNotification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotification(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
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
                onClick={() => setSelectedItem(item)}
                className={`p-3.5 rounded-xl border transition-all space-y-2.5 cursor-pointer hover:border-amber-400 dark:hover:border-amber-500 hover:shadow-md group relative ${
                  isRejected
                    ? "bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900"
                    : isApproved
                    ? "bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900"
                    : "bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800"
                }`}
                title="Click to view full details"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
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

                    {Boolean(item.query && stripAssignedTag(item.query)) && (
                      <div className="text-xs bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-2 rounded-lg text-amber-900 dark:text-amber-200 mt-1 flex items-start gap-1.5">
                        <span className="font-semibold shrink-0">Note / Reason:</span>
                        <span className="truncate">{stripAssignedTag(item.query)}</span>
                      </div>
                    )}

                    {Array.isArray(item.details?.assignedUsers) && item.details.assignedUsers.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="text-[10px] font-semibold text-slate-500">Assigned:</span>
                        {item.details.assignedUsers.map((u: any) => (
                          <span
                            key={u.id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-900/60"
                          >
                            <Users className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                            <span>{u.name}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                      <span>{item.siteName} &bull; {item.projectName}</span>
                      <span>&bull; By: {item.requestedBy} ({item.requestedByRole})</span>
                    </div>
                  </div>

                  {/* Status Badge or Approver Actions */}
                  <div
                    className="flex items-center gap-2 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedItem(item);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 rounded-lg border border-amber-200/80 dark:border-amber-800/70 transition-colors shadow-2xs cursor-pointer"
                      title="View full details"
                    >
                      <Eye className="w-3.5 h-3.5 text-amber-500" />
                      <span>View Details</span>
                    </button>

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
                            className="px-2.5 py-1 text-xs font-bold rounded bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setRejectingId(null)}
                            className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleAction(item, "APPROVE")}
                            disabled={actionLoading === item.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Approve
                          </button>
                          <button
                            onClick={() => setRejectingId(item.id)}
                            disabled={actionLoading === item.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
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

                        {isRejected && (
                          <button
                            type="button"
                            onClick={() => {
                              if (reRequestingId === item.id) {
                                setReRequestingId(null);
                              } else {
                                setReRequestingId(item.id);
                                setReRequestNote(stripAssignedTag(item.query) || "");
                                setReRequestAmount(item.amountRupees > 0 ? String(item.amountRupees) : "");
                              }
                            }}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer ${
                              reRequestingId === item.id
                                ? "bg-amber-700 text-white ring-2 ring-amber-400"
                                : "bg-amber-500 hover:bg-amber-600 text-white"
                            }`}
                            title="Re-request Send: Resubmit for approval with updated details"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${reRequestingId === item.id ? "rotate-180" : ""}`} />
                            <span>Re-request Send</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {isRejected && item.rejectionReason && (
                  <div className="text-xs bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 p-2.5 rounded-lg text-rose-800 dark:text-rose-300 flex items-start gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                    <div>
                      <span className="font-semibold">Rejection Note: </span>
                      {item.rejectionReason}
                    </div>
                  </div>
                )}

                {reRequestingId === item.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 space-y-3 animate-in fade-in duration-150"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-amber-900 dark:text-amber-200 pb-2 border-b border-amber-200/70 dark:border-amber-900/50">
                      <span className="flex items-center gap-1.5">
                        <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span>Re-request Send &bull; Resubmit for Approval</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setReRequestingId(null)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {item.amountRupees > 0 && (
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">
                            Requested Amount (₹)
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">
                              ₹
                            </span>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={reRequestAmount}
                              onChange={(e) => setReRequestAmount(e.target.value)}
                              placeholder={String(item.amountRupees)}
                              className="w-full pl-6 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                        </div>
                      )}

                      <div className={`space-y-1 ${item.amountRupees > 0 ? "sm:col-span-2" : "sm:col-span-3"}`}>
                        <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">
                          Re-request Note / Explanation for Resubmitting
                        </label>
                        <input
                          type="text"
                          value={reRequestNote}
                          onChange={(e) => setReRequestNote(e.target.value)}
                          placeholder="e.g. Revised quote attached / vendor agreed to discount / clarification provided"
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-200/60 dark:border-amber-900/40">
                      <button
                        type="button"
                        onClick={() => setReRequestingId(null)}
                        disabled={actionLoading === item.id}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReRequest(item)}
                        disabled={actionLoading === item.id}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {actionLoading === item.id ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Submitting...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>Confirm &amp; Re-request Send</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ApprovalDetailModal
        item={selectedItem}
        isOpen={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        isApprover={isApprover}
        onApprove={async (it) => {
          await handleAction(it, "APPROVE");
          setSelectedItem(null);
        }}
        onReject={async (it, reason) => {
          await handleAction(it, "REJECT", reason);
          setSelectedItem(null);
        }}
        onReRequest={async (it, note, amt) => {
          await handleReRequest(it, note, amt);
          setSelectedItem(null);
        }}
        actionLoading={Boolean(actionLoading)}
      />
    </div>
  );
}
