"use client";

import React, { useEffect, useState } from "react";
import {
  LogOut,
  X,
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  IndianRupee,
  Clock,
  Building,
} from "lucide-react";
import { formatCompactINR, formatDate } from "@/lib/formatters";

export interface PendingTaskItem {
  id: string;
  title: string;
  priority: string;
  status: string;
  projectName: string;
  dueAt?: string | null;
}

export interface PendingPaymentItem {
  id: string;
  type: string;
  reference: string;
  partyName: string;
  projectName?: string | null;
  amount: number;
  totalAmount?: number;
  statusLabel: string;
}

export interface CheckOutStatusData {
  hasPendingTasks: boolean;
  isDirectlyAssigned: boolean;
  pendingTasksCount: number;
  pendingTasks: PendingTaskItem[];
  hasPendingPayments: boolean;
  pendingPaymentsCount: number;
  pendingPayments: PendingPaymentItem[];
  hasPendingItems: boolean;
  userName?: string;
}

interface CheckOutConfirmationModalProps {
  isOpen: boolean;
  siteId?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function CheckOutConfirmationModal({
  isOpen,
  siteId,
  isSubmitting = false,
  onClose,
  onConfirm,
}: CheckOutConfirmationModalProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CheckOutStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const url = siteId
      ? `/api/attendance/check-out-status?siteId=${encodeURIComponent(siteId)}&_t=${Date.now()}`
      : `/api/attendance/check-out-status?_t=${Date.now()}`;

    fetch(url, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (!isMounted) return;
        if (json.success && json.data) {
          setData(json.data);
        } else {
          setError(json.error?.message || "Could not retrieve status");
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || "Failed to load check-out status");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, siteId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <LogOut className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Confirm Daily Shift Check-Out
              </h3>
              <p className="text-[11px] text-slate-500">
                Checking pending tasks & payments before ending shift
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            title="Cancel and close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-sm flex-1">
          {loading ? (
            <div className="py-10 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-semibold text-slate-600">
                Checking if any tasks or payments are pending for your shift...
              </p>
            </div>
          ) : error ? (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
              <span className="font-bold">Notice:</span> {error}. You may still proceed with check-out or cancel to stay on site.
            </div>
          ) : data ? (
            <>
              {/* Primary Confirmation Notice */}
              {data.hasPendingItems ? (
                <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-900">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-xs uppercase tracking-wide text-amber-950">
                      Pending Items Detected Before Check-Out
                    </h4>
                    <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                      You still have pending tasks or payments recorded. If you need to finish them, please click{" "}
                      <strong>&quot;Cancel Check-Out&quot;</strong> below. If your work for today is finished, you can proceed with{" "}
                      <strong>&quot;Confirm & Check Out&quot;</strong>.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-emerald-50/90 border border-emerald-200 rounded-xl flex items-start gap-3 text-emerald-900">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-xs uppercase tracking-wide text-emerald-950">
                      All Clear! No Pending Tasks or Payments
                    </h4>
                    <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                      All assigned tasks are completed and there are no pending payments. You can safely submit your shift check-out.
                    </p>
                  </div>
                </div>
              )}

              {/* Tasks Checklist */}
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-slate-700">
                    <CheckSquare className="w-4 h-4 text-slate-500" />
                    <span>Tasks Status</span>
                  </div>
                  {data.hasPendingTasks ? (
                    <span className="px-2 py-0.5 bg-rose-100 text-rose-900 font-bold text-[11px] rounded-full">
                      {data.pendingTasksCount} Pending
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 font-bold text-[11px] rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>All Completed</span>
                    </span>
                  )}
                </div>

                {data.hasPendingTasks ? (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {data.pendingTasks.map((t) => (
                      <div
                        key={t.id}
                        className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs space-y-1"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-slate-800 line-clamp-2">
                            {t.title}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded font-bold text-[10px] shrink-0 ${
                              t.priority === "CRITICAL" || t.priority === "HIGH"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {t.priority}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Building className="w-3 h-3" />
                            {t.projectName}
                          </span>
                          {t.dueAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Due: {formatDate(t.dueAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-2.5 bg-emerald-50/50 border border-emerald-100 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>No pending or open tasks requiring your action.</span>
                  </div>
                )}
              </div>

              {/* Payments & Bills Checklist */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-slate-700">
                    <IndianRupee className="w-4 h-4 text-slate-500" />
                    <span>Payments & Bills Status</span>
                  </div>
                  {data.hasPendingPayments ? (
                    <span className="px-2 py-0.5 bg-rose-100 text-rose-900 font-bold text-[11px] rounded-full">
                      {data.pendingPaymentsCount} Pending
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 font-bold text-[11px] rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>All Paid / Cleared</span>
                    </span>
                  )}
                </div>

                {data.hasPendingPayments ? (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {data.pendingPayments.map((p) => (
                      <div
                        key={p.id}
                        className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-800 truncate">
                            {p.reference} &bull; {p.partyName}
                          </span>
                          <span className="font-mono font-bold text-amber-700 shrink-0">
                            {formatCompactINR(p.amount)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>{p.projectName || "General"}</span>
                          <span className="text-amber-800 font-medium">
                            {p.statusLabel}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-2.5 bg-emerald-50/50 border border-emerald-100 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>No unapproved payments, unpaid bills, or pending delivery challans.</span>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-200/80 bg-white border border-slate-300 rounded-xl transition cursor-pointer shadow-2xs"
          >
            Cancel Check-Out
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting || loading}
            className={`px-4 py-2 text-xs font-bold text-white rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
              data?.hasPendingItems
                ? "bg-amber-600 hover:bg-amber-500"
                : "bg-rose-600 hover:bg-rose-500"
            }`}
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Checking Out...</span>
              </>
            ) : (
              <>
                <LogOut className="w-4 h-4" />
                <span>
                  {data?.hasPendingItems ? "Confirm Check-Out" : "Submit Check-Out"}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
