"use client";

import React, { useEffect, useState } from "react";
import { History, X, Clock, User, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";
import { formatDate } from "@/lib/formatters";

interface AuditEventItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: string | null;
  afterJson?: string | null;
  reason?: string | null;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

interface AuditHistoryModalProps {
  entityType: string;
  entityId: string;
  title?: string;
  onClose: () => void;
}

export default function AuditHistoryModal({
  entityType,
  entityId,
  title = "Audit History & Version Log",
  onClose,
}: AuditHistoryModalProps) {
  const [events, setEvents] = useState<AuditEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/audit?entityType=${entityType}&entityId=${entityId}&limit=50`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setEvents(res.data || []);
        } else {
          setError(res.error?.message || "Failed to load audit history");
        }
      })
      .catch((err) => {
        setError(err.message || "Network error loading audit history");
      })
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">{title}</h3>
              <p className="text-xs text-slate-500">
                Immutable audit trail for {entityType} ID: <span className="font-mono">{entityId.slice(0, 8)}...</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {loading ? (
            <div className="space-y-3 py-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs italic">
              No previous edits or version history recorded for this entry.
            </div>
          ) : (
            events.map((ev, idx) => {
              let beforeObj: any = null;
              let afterObj: any = null;
              try {
                if (ev.beforeJson) beforeObj = JSON.parse(ev.beforeJson);
                if (ev.afterJson) afterObj = JSON.parse(ev.afterJson);
              } catch {}

              return (
                <div key={ev.id} className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold px-2 py-0.5 rounded text-[10px] bg-slate-900 text-white font-mono">
                        {ev.action.replace("_", " ")}
                      </span>
                      <span className="text-slate-700 font-semibold flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{ev.actor.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({ev.actor.role})</span>
                      </span>
                    </div>
                    <span className="text-slate-400 text-[11px] font-mono flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      <span>{formatDate(ev.createdAt)}</span>
                    </span>
                  </div>

                  {ev.reason && (
                    <div className="p-2 bg-white rounded-lg border border-slate-200 text-slate-700 font-medium text-[11px]">
                      <span className="font-bold text-slate-900">Reason: </span>
                      <span>{ev.reason}</span>
                    </div>
                  )}

                  {/* Diff rendering if before/after present */}
                  {beforeObj && afterObj && (
                    <div className="space-y-1 pt-1 border-t border-slate-200/60 font-mono text-[10px]">
                      {Object.keys(afterObj).map((key) => {
                        const bVal = beforeObj[key];
                        const aVal = afterObj[key];
                        if (JSON.stringify(bVal) === JSON.stringify(aVal)) return null;
                        return (
                          <div key={key} className="flex items-center gap-1.5 p-1 bg-white rounded border border-slate-100">
                            <span className="font-bold text-slate-600">{key}:</span>
                            <span className="line-through text-rose-600">{JSON.stringify(bVal)}</span>
                            <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="text-emerald-700 font-bold">{JSON.stringify(aVal)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 mt-2 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Cryptographically sealed & tamper-resistant</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
