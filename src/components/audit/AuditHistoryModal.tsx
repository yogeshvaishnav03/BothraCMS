"use client";

import React, { useEffect, useState } from "react";
import { History, X, Clock, User, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";
import { formatDate, formatFileSize } from "@/lib/formatters";
import {
  formatAuditKeyLabel,
  formatAuditEntityType,
  formatAuditCategory,
  formatAuditMimeType,
  EntityNameMap,
} from "@/lib/audit-resolver";

interface AuditEventItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  entityDisplayName?: string;
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

function formatDiffValue(key: string, val: any, nameMap: EntityNameMap): string {
  if (val === null || val === undefined || val === "") return "Not set";
  const lowerKey = key.toLowerCase();
  if (key === "diskFileName" || lowerKey.includes("diskfile")) {
    return "Stored Securely in Cloud Storage";
  }
  if ((typeof val === "number" || (typeof val === "string" && /^\d+$/.test(val))) && (lowerKey.includes("size") || lowerKey.includes("bytes"))) {
    return formatFileSize(typeof val === "number" ? val : parseInt(val, 10));
  }
  if (key === "category") return formatAuditCategory(String(val));
  if (key === "mimeType") return formatAuditMimeType(String(val));
  if (key === "entityType") return formatAuditEntityType(String(val));

  if (typeof val === "string") {
    const valLower = val.trim().toLowerCase();
    if (nameMap[valLower]) {
      return nameMap[valLower].name;
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim())) {
      return `Ref #${val.trim().slice(0, 8)}`;
    }
  }
  return String(typeof val === "object" ? JSON.stringify(val) : val);
}

export default function AuditHistoryModal({
  entityType,
  entityId,
  title = "Change History",
  onClose,
}: AuditHistoryModalProps) {
  const [events, setEvents] = useState<AuditEventItem[]>([]);
  const [nameMap, setNameMap] = useState<EntityNameMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/audit?entityType=${entityType}&entityId=${entityId}&limit=50`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const list = Array.isArray(res.data) ? res.data : (res.data?.events || []);
          const names = res.data?.nameMap || {};
          setEvents(list);
          setNameMap(names);
        } else {
          setError(res.error?.message || "Could not load change history. Try closing and opening again.");
        }
      })
      .catch((err) => {
        setError(err.message || "Could not connect to load change history. Check your internet connection.");
      })
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const targetEntityInfo = nameMap[entityId.toLowerCase()];

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[85dvh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 id="audit-modal-title" className="font-bold text-slate-900 text-base">{title}</h3>
              <p className="text-xs text-slate-500">
                {targetEntityInfo ? (
                  <span>
                    Permanent history for <strong className="text-slate-800">{targetEntityInfo.name}</strong> ({targetEntityInfo.type})
                  </span>
                ) : (
                  <span>
                    Permanent change history for {formatAuditEntityType(entityType)} (#{entityId.slice(0, 8)})
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition"
            aria-label="Close change history"
          >
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
              No edits have been recorded for this item yet.
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
                        {ev.action.replace(/_/g, " ")}
                      </span>
                      <span className="text-slate-700 font-semibold flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{ev.actor.name}</span>
                        <span className="text-[10px] text-slate-400 capitalize">({ev.actor.role.toLowerCase().replace(/_/g, " ")})</span>
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
                        const label = formatAuditKeyLabel(key);
                        const bFormatted = formatDiffValue(key, bVal, nameMap);
                        const aFormatted = formatDiffValue(key, aVal, nameMap);
                        return (
                          <div key={key} className="flex items-center gap-1.5 p-1 bg-white rounded border border-slate-100 flex-wrap">
                            <span className="font-bold text-slate-700">{label}:</span>
                            <span className="line-through text-rose-600">{bFormatted}</span>
                            <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="text-emerald-700 font-bold">{aFormatted}</span>
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
            <span>Permanent history — saved automatically and cannot be deleted</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
