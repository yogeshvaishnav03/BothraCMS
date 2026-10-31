"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import React, { useEffect, useState, useMemo } from "react";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, ExcelColumn } from "@/components/ui/ExcelTable";
import Shell from "@/components/layout/Shell";
import { formatDateTime, formatCurrency } from "@/lib/formatters";
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  User,
  Clock,
  ArrowRight,
  Eye,
  Code2,
  Copy,
  Check,
  X,
  FileText,
  Layers,
  ChevronRight,
  Tag,
  Hash,
  Filter,
} from "lucide-react";

function parseJsonSafe(jsonStr: string | null | undefined): Record<string, any> | null {
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function formatKeyLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function formatFieldValue(key: string, val: any): React.ReactNode {
  if (val === null || val === undefined) return <span className="text-slate-400 italic">null</span>;
  if (typeof val === "boolean") {
    return (
      <span
        className={`px-2 py-0.5 rounded text-xs font-bold ${
          val ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
        }`}
      >
        {val ? "True" : "False"}
      </span>
    );
  }
  const lowerKey = key.toLowerCase();
  if (
    typeof val === "number" &&
    (lowerKey.includes("amount") ||
      lowerKey.includes("rate") ||
      lowerKey.includes("budget") ||
      lowerKey.includes("wage") ||
      lowerKey.includes("price"))
  ) {
    return <span className="font-bold text-emerald-700 tabular-nums">{formatCurrency(val)}</span>;
  }
  if (typeof val === "string" && (lowerKey.includes("at") || lowerKey.includes("date")) && val.includes("T")) {
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return <span className="text-slate-700">{formatDateTime(d)}</span>;
      }
    } catch {}
  }
  if (typeof val === "object") {
    return (
      <pre className="text-xs bg-slate-100 p-2 rounded text-slate-800 overflow-x-auto font-mono">
        {JSON.stringify(val, null, 2)}
      </pre>
    );
  }
  return <span className="font-medium text-slate-800 font-sans">{String(val)}</span>;
}

export default function AuditPage() {
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"attributes" | "diff" | "json">("attributes");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/audit")
      .then(async (r) => {
        if (r.status === 403) {
          setError("Access Denied: Your account role does not have authorization to view immutable audit logs.");
          return null;
        }
        if (!r.ok) {
          const errData = await r.json().catch(() => ({}));
          setError(errData.error || `Failed to fetch audit logs (HTTP ${r.status})`);
          return null;
        }
        return r.json();
      })
      .then((res) => {
        if (res && res.success) setAuditEvents(res.data);
        else if (res && res.error) setError(res.error);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Keyboard shortcut: Escape to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedEvent(null);
      }
    };
    if (selectedEvent) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [selectedEvent]);

  // Handle Copy to clipboard
  const handleCopyJson = (content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredEvents = auditEvents.filter((e) => {
    const query = search.toLowerCase();
    return (
      e.action.toLowerCase().includes(query) ||
      (e.actor?.name && e.actor.name.toLowerCase().includes(query)) ||
      (e.reason && e.reason.toLowerCase().includes(query)) ||
      (e.entityType && e.entityType.toLowerCase().includes(query)) ||
      (e.entityId && e.entityId.toLowerCase().includes(query)) ||
      (e.afterJson && e.afterJson.toLowerCase().includes(query)) ||
      (e.beforeJson && e.beforeJson.toLowerCase().includes(query))
    );
  });

  const auditColumns: ExcelColumn<any>[] = useMemo(
    () => [
      {
        key: "createdAt",
        label: "Timestamp",
        accessor: (e) => formatDateTime(e.createdAt),
        type: "date",
      },
      {
        key: "action",
        label: "Action",
        accessor: (e) => e.action,
        type: "text",
      },
      {
        key: "actor",
        label: "Actor",
        accessor: (e) => `${e.actor?.name || "System"} (${e.actor?.role || "SYSTEM"})`,
        type: "text",
      },
      {
        key: "entityType",
        label: "Target Entity",
        accessor: (e) => `${e.entityType} ${e.entityId || ""}`,
        type: "text",
      },
      {
        key: "reason",
        label: "Reason / Notes",
        accessor: (e) => e.reason || "Standard transaction",
        type: "text",
      },
      {
        key: "metadata",
        label: "Metadata & Details",
        accessor: (e) => (e.metadata ? JSON.stringify(e.metadata) : "—"),
        type: "text",
      },
    ],
    []
  );

  const excelAudit = useExcelTable({
    data: filteredEvents,
    columns: auditColumns,
  });

  const renderMetadataCell = (event: any) => {
    const after = parseJsonSafe(event.afterJson);
    const before = parseJsonSafe(event.beforeJson);
    const data = after || before;

    if (!data || Object.keys(data).length === 0) {
      return <span className="text-slate-400 italic text-xs">No payload</span>;
    }

    const chips: React.ReactNode[] = [];

    // Order Number
    if (data.orderNumber) {
      chips.push(
        <span
          key="order"
          className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200/80 px-2 py-0.5 rounded text-[11px] font-semibold font-mono"
        >
          PO: {data.orderNumber}
        </span>
      );
    }

    // Bill Number
    if (data.billNumber) {
      chips.push(
        <span
          key="bill"
          className="inline-flex items-center gap-1 bg-blue-50 text-blue-900 border border-blue-200/80 px-2 py-0.5 rounded text-[11px] font-semibold font-mono"
        >
          Bill #{data.billNumber}
        </span>
      );
    }

    // Name (Project / Store / Item)
    if (data.name) {
      chips.push(
        <span
          key="name"
          className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-medium font-sans break-words whitespace-normal"
          title={data.name}
        >
          {data.name}
        </span>
      );
    }

    // Party Name
    if (data.partyName) {
      chips.push(
        <span
          key="party"
          className="inline-flex items-center gap-1 bg-purple-50 text-purple-900 border border-purple-200/80 px-2 py-0.5 rounded text-[11px] font-medium font-sans break-words whitespace-normal"
          title={data.partyName}
        >
          {data.partyName}
        </span>
      );
    }

    // Amount / Total Amount
    if (data.totalAmount !== undefined || data.amount !== undefined) {
      const amt = data.totalAmount ?? data.amount;
      chips.push(
        <span
          key="amt"
          className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-900 border border-emerald-200/80 px-2 py-0.5 rounded text-[11px] font-bold font-mono"
        >
          {typeof amt === "number" ? formatCurrency(amt) : amt}
        </span>
      );
    }

    // Stock / Quantity
    if (data.stock !== undefined) {
      chips.push(
        <span
          key="stock"
          className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200/80 px-2 py-0.5 rounded text-[11px] font-semibold font-mono"
        >
          Stock: {data.stock}
        </span>
      );
    } else if (data.quantityDelta !== undefined) {
      chips.push(
        <span
          key="qty"
          className="inline-flex items-center gap-1 bg-cyan-50 text-cyan-900 border border-cyan-200/80 px-2 py-0.5 rounded text-[11px] font-semibold font-mono"
        >
          Qty: {data.quantityDelta > 0 ? `+${data.quantityDelta}` : data.quantityDelta} {data.unitCode || ""}
        </span>
      );
    }

    // Status
    if (data.status && chips.length < 2) {
      chips.push(
        <span
          key="status"
          className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono uppercase"
        >
          {data.status}
        </span>
      );
    }

    // Fallback: take first 1-2 keys if no specific primary fields matched
    if (chips.length === 0) {
      const keys = Object.keys(data).slice(0, 2);
      keys.forEach((k) => {
        const val = typeof data[k] === "object" ? "..." : String(data[k]);
        chips.push(
          <span
            key={k}
            className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-mono break-all whitespace-normal"
            title={`${k}: ${val}`}
          >
            {k}: {val}
          </span>
        );
      });
    }

    return (
      <div
        onClick={() => {
          setSelectedEvent(event);
          setActiveTab("attributes");
        }}
        className="flex items-center justify-between gap-2 p-1 -m-1 rounded-lg hover:bg-slate-100/90 cursor-pointer group transition-colors"
        title="Click to view detailed payload"
      >
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {chips.slice(0, 2)}
          {Object.keys(data).length > 2 && (
            <span className="text-[10px] text-slate-400 font-medium font-sans whitespace-nowrap">
              +{Object.keys(data).length - 2} more
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedEvent(event);
            setActiveTab("attributes");
          }}
          className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-white border border-slate-200 group-hover:border-amber-400 group-hover:text-amber-800 text-slate-600 rounded-md shadow-2xs shrink-0 transition-colors"
        >
          <Eye className="w-3.5 h-3.5 text-amber-600" />
          <span>Inspect</span>
        </button>
      </div>
    );
  };

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader icon={ShieldCheck} title="System Activity Log" subtitle="Track all important site actions: payments, reversals, stock changes, orders, and attendance edits.">
          <span className="text-xs font-mono font-bold bg-slate-900 text-amber-400 px-3 py-1.5 rounded-lg w-max">
            Audit Trail Active
          </span>
        </PageHeader>

        {/* Search */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search activity log by action, user, reason, order #, or vendor name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Audit Log Table */}
        {error ? (
          <div className="p-8 text-center bg-white rounded-xl border border-red-200 shadow-sm max-w-xl mx-auto my-12">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-200">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Access Denied (403 Forbidden)</h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              {error}
            </p>
            <a
              href="/"
              className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition"
            >
              Return to Dashboard
            </a>
          </div>
        ) : loading ? (
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
            <ExcelTableToolbar
              table={excelAudit}
              columns={auditColumns}
              tableName="audit events"
              showSearch={true}
              showExport={true}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[750px]">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    {auditColumns.map((col) => (
                      <ExcelColumnHeader
                        key={col.key}
                        column={col}
                        table={excelAudit}
                        theme="darkHeader"
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {excelAudit.filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={auditColumns.length} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Filter className="w-8 h-8 text-slate-300" />
                          <p className="font-semibold text-slate-700">No audit events match selected filters</p>
                          <p className="text-xs text-slate-400">Try clearing or adjusting column filters.</p>
                          <button
                            type="button"
                            onClick={excelAudit.clearAllFilters}
                            className="mt-2 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs"
                          >
                            Reset Filters
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    excelAudit.filteredData.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap font-mono">
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
                        <div className="text-[11px] text-slate-400 font-mono capitalize">
                          {e.actor?.role?.toLowerCase().replace("_", " ")}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-sans">
                        <div className="font-semibold text-slate-800">{e.entityType}</div>
                        <div className="text-[10px] text-slate-400 font-mono break-all whitespace-normal" title={e.entityId}>
                          {e.entityId}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-sans text-xs text-slate-700 max-w-[220px] break-words">
                        {e.reason ? (
                          <span className="font-medium text-amber-900 bg-amber-50 px-2 py-1 rounded border border-amber-200/60 block break-words whitespace-normal">
                            {e.reason}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Standard transaction</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-sans min-w-[240px]">
                        {renderMetadataCell(e)}
                      </td>
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Audit Detail Inspector Modal */}
        {selectedEvent && (() => {
          const after = parseJsonSafe(selectedEvent.afterJson);
          const before = parseJsonSafe(selectedEvent.beforeJson);
          const activeData = after || before || {};
          const hasDiff = before && after && Object.keys(before).length > 0;
          const rawJsonString = JSON.stringify(
            after ? { after, before: before || undefined } : (before || {}),
            null,
            2
          );

          return (
            <div
              className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
              onClick={() => setSelectedEvent(null)}
            >
              <div
                className="bg-white rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4 bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-900 text-amber-400 shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                          Audit Event Payload
                        </h3>
                        <span
                          className={`inline-flex items-center font-bold px-2.5 py-0.5 rounded-full text-xs uppercase tracking-wider ${
                            selectedEvent.action.includes("REVERS")
                              ? "bg-rose-100 text-rose-800"
                              : selectedEvent.action.includes("RECEIPT") || selectedEvent.action.includes("PAYMENT")
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {selectedEvent.action}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Immutable transaction log recorded at {formatDateTime(selectedEvent.createdAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                    aria-label="Close modal"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Context Summary Cards */}
                <div className="px-5 pt-4 pb-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs border-b border-slate-100">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Actor</div>
                    <div className="font-bold text-slate-900 mt-0.5">{selectedEvent.actor?.name || "System"}</div>
                    <div className="text-[11px] text-slate-500 font-mono capitalize">
                      {selectedEvent.actor?.role?.toLowerCase().replace("_", " ")}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Target Entity</div>
                    <div className="font-bold text-slate-900 mt-0.5">{selectedEvent.entityType}</div>
                    <div className="text-[10px] text-slate-500 font-mono truncate" title={selectedEvent.entityId}>
                      ID: {selectedEvent.entityId.slice(0, 14)}...
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 col-span-2 sm:col-span-1">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Timestamp</div>
                    <div className="font-semibold text-slate-800 mt-0.5 font-mono text-[11px]">
                      {formatDateTime(selectedEvent.createdAt)}
                    </div>
                  </div>
                </div>

                {/* Reason Highlight (if present) */}
                {selectedEvent.reason && (
                  <div className="mx-5 mt-3 p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-950 flex items-start gap-2">
                    <span className="font-bold uppercase tracking-wider text-[10px] bg-amber-200/80 text-amber-900 px-1.5 py-0.5 rounded shrink-0">
                      Reason
                    </span>
                    <span className="font-medium">{selectedEvent.reason}</span>
                  </div>
                )}

                {/* Tabs */}
                <div className="px-5 pt-3 flex items-center gap-2 border-b border-slate-100 text-xs">
                  <button
                    onClick={() => setActiveTab("attributes")}
                    className={`pb-2.5 px-3 font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                      activeTab === "attributes"
                        ? "border-amber-500 text-amber-700"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>Key Attributes ({Object.keys(activeData).length})</span>
                  </button>
                  {hasDiff && (
                    <button
                      onClick={() => setActiveTab("diff")}
                      className={`pb-2.5 px-3 font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                        activeTab === "diff"
                          ? "border-amber-500 text-amber-700"
                          : "border-transparent text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>State Diff</span>
                    </button>
                  )}
                  <button
                    onClick={() => setActiveTab("json")}
                    className={`pb-2.5 px-3 font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                      activeTab === "json"
                        ? "border-amber-500 text-amber-700"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>Raw JSON</span>
                  </button>
                </div>

                {/* Tab Contents */}
                <div className="p-5 flex-1 overflow-y-auto">
                  {activeTab === "attributes" && (
                    <div className="space-y-2">
                      {Object.keys(activeData).length === 0 ? (
                        <div className="py-8 text-center text-slate-400 text-xs italic">
                          No payload parameters recorded for this event.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {Object.entries(activeData).map(([key, value]) => (
                            <div
                              key={key}
                              className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 transition-colors"
                            >
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                {formatKeyLabel(key)}
                              </div>
                              <div className="text-xs break-words">
                                {formatFieldValue(key, value)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "diff" && hasDiff && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-3.5 rounded-xl bg-rose-50/60 border border-rose-200">
                        <div className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <span>Before Change</span>
                        </div>
                        <pre className="text-xs font-mono text-slate-800 bg-white p-3 rounded-lg border border-rose-100 overflow-x-auto">
                          {JSON.stringify(before, null, 2)}
                        </pre>
                      </div>
                      <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200">
                        <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <span>After Change</span>
                        </div>
                        <pre className="text-xs font-mono text-slate-800 bg-white p-3 rounded-lg border border-emerald-100 overflow-x-auto">
                          {JSON.stringify(after, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {activeTab === "json" && (
                    <div className="relative">
                      <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800 max-h-[45vh]">
                        {rawJsonString}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => handleCopyJson(rawJsonString)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-colors shadow-2xs"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                    <span>{copied ? "Copied!" : "Copy Payload"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedEvent(null)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </Shell>
  );
}
