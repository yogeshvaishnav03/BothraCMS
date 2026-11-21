"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import React, { useEffect, useState, useMemo } from "react";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, TablePagination, ExcelColumn } from "@/components/ui/ExcelTable";
import Shell from "@/components/layout/Shell";
import { formatDateTime, formatCurrency, formatFileSize } from "@/lib/formatters";
import {
  formatAuditKeyLabel,
  formatAuditEntityType,
  formatAuditCategory,
  formatAuditMimeType,
  EntityNameMap,
} from "@/lib/audit-resolver";
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
  Calendar,
  Users,
  MapPin,
  Building2,
  Briefcase,
  DollarSign,
  FileCheck,
} from "lucide-react";
import { istDateKey } from "@/lib/ist-date";

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
  return formatAuditKeyLabel(key);
}

function formatFieldValue(
  key: string,
  val: any,
  nameMap: EntityNameMap = {},
  allData: Record<string, any> = {}
): React.ReactNode {
  if (val === null || val === undefined) return <span className="text-slate-400 italic">Empty</span>;
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

  // Disk File Name: Hide scary internal hashes, show clean security badge
  if (key === "diskFileName" || lowerKey.includes("diskfile")) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-semibold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200/80">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>Stored Securely in Cloud Storage</span>
      </div>
    );
  }

  // File size / Byte length
  if (
    (typeof val === "number" || (typeof val === "string" && /^\d+$/.test(val))) &&
    (lowerKey.includes("size") || lowerKey.includes("bytes"))
  ) {
    const num = typeof val === "number" ? val : parseInt(val, 10);
    return (
      <span className="font-semibold text-slate-900 font-mono text-xs">
        {formatFileSize(num)}
      </span>
    );
  }

  // Document category
  if (key === "category") {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-xs px-2.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200/80">
        <Tag className="w-3 h-3 text-amber-600" />
        <span>{formatAuditCategory(String(val))}</span>
      </span>
    );
  }

  // MIME type
  if (key === "mimeType") {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-xs px-2.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
        <FileText className="w-3 h-3 text-slate-500" />
        <span>{formatAuditMimeType(String(val))}</span>
      </span>
    );
  }

  // Entity type
  if (key === "entityType") {
    return (
      <span className="inline-flex items-center gap-1 font-bold text-xs px-2.5 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200">
        <span>{formatAuditEntityType(String(val))}</span>
      </span>
    );
  }

  // Currency amounts
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

  // Dates
  if (typeof val === "string" && (lowerKey.includes("at") || lowerKey.includes("date")) && val.includes("T")) {
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return <span className="text-slate-700">{formatDateTime(d)}</span>;
      }
    } catch {}
  }

  // Check if val is a string UUID or known ID
  if (typeof val === "string") {
    const valTrimmed = val.trim();
    const valLower = valTrimmed.toLowerCase();

    // 1. Matched in nameMap
    if (nameMap[valLower]) {
      const resolved = nameMap[valLower];
      return (
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-slate-900 text-xs">{resolved.name}</span>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 font-semibold rounded">
              {resolved.type}
            </span>
            {resolved.code && <span className="font-mono text-slate-500">({resolved.code})</span>}
            {resolved.subtext && <span className="text-slate-400">• {resolved.subtext}</span>}
          </div>
        </div>
      );
    }

    // 2. UUID format
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valTrimmed);
    if (isUuid) {
      if (key === "fileId" && (allData.originalName || allData.fileName)) {
        return (
          <span className="font-bold text-slate-900 text-xs">
            {allData.originalName || allData.fileName}
          </span>
        );
      }
      if (key === "projectId" && allData.projectName) {
        return <span className="font-bold text-slate-900 text-xs">{allData.projectName}</span>;
      }
      if (key === "taskId" && (allData.taskTitle || allData.title)) {
        return <span className="font-bold text-slate-900 text-xs">{allData.taskTitle || allData.title}</span>;
      }
      if (key === "entityId") {
        if (allData.originalName || allData.fileName) {
          return <span className="font-bold text-slate-900 text-xs">{allData.originalName || allData.fileName}</span>;
        }
        if (allData.name) {
          return <span className="font-bold text-slate-900 text-xs">{allData.name}</span>;
        }
        if (allData.title) {
          return <span className="font-bold text-slate-900 text-xs">{allData.title}</span>;
        }
      }
      // Clean reference badge instead of raw 36-char encrypted-looking string
      return (
        <span className="font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[11px]" title={val}>
          Ref #{val.slice(0, 8)}
        </span>
      );
    }
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return <span className="text-slate-400 italic">None</span>;
    // Array of objects (e.g. added members, attachments, line items)
    if (typeof val[0] === "object" && val[0] !== null) {
      return (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {val.map((item, idx) => {
            const label =
              item.name ||
              item.title ||
              item.originalName ||
              item.fileName ||
              (item.id && nameMap[item.id.toLowerCase()]?.name) ||
              `Item #${idx + 1}`;
            const sub = item.role || item.category || item.quantity;
            return (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-800 shadow-2xs"
              >
                <span className="font-semibold">{String(label)}</span>
                {sub && (
                  <span className="text-[10px] uppercase font-mono px-1 py-0.2 bg-amber-50 text-amber-800 border border-amber-200 rounded font-semibold">
                    {String(sub).replace(/_/g, " ")}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      );
    }
    // Array of strings/numbers
    return (
      <div className="flex flex-wrap gap-1 mt-0.5">
        {val.map((item, idx) => (
          <span
            key={idx}
            className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-xs font-medium border border-slate-200"
          >
            {String(item)}
          </span>
        ))}
      </div>
    );
  }

  if (typeof val === "object" && val !== null) {
    // Render clean key-value mini table, NEVER raw <pre>!
    return (
      <div className="mt-1 p-2 rounded-lg bg-white border border-slate-200 space-y-1 text-xs">
        {Object.entries(val).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-2 py-0.5 border-b border-slate-50 last:border-none">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{formatKeyLabel(k)}:</span>
            <span className="font-semibold text-slate-800 text-right">{String(v)}</span>
          </div>
        ))}
      </div>
    );
  }

  return <span className="font-medium text-slate-800 font-sans">{String(val)}</span>;
}

function normalizeAuditPayload(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter((x) => x !== null && x !== undefined);
  if (typeof data === "object") return [data];
  return [{ value: data }];
}

function isWorkforceRecord(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  return Boolean(
    data.contractorName ||
    data.artisanCount !== undefined ||
    data.artisanTotal !== undefined ||
    data.laborerMale !== undefined ||
    data.grandTotal !== undefined ||
    data.shift ||
    data.source === "CONTRACTOR" ||
    data.source === "DIRECT"
  );
}

function WorkforceSummaryCard({ data, nameMap }: { data: Record<string, any>; nameMap: EntityNameMap }) {
  const siteName =
    data.siteName ||
    (data.siteId && nameMap[data.siteId.toLowerCase()]?.name) ||
    "Main Site";

  const contractor =
    data.contractorName ||
    (data.source === "CONTRACTOR" ? "Contractor Workforce" : "Direct / Company Staff");

  const dateFormatted = data.date ? formatDateTime(data.date).split(",")[0] || data.date : "Today";
  const shift = data.shift ? `${data.shift.replace(/_/g, " ")} Shift` : "General Shift";
  const supervisor =
    data.supervisorName ||
    (data.supervisorId && nameMap[data.supervisorId.toLowerCase()]?.name) ||
    "Site Supervisor";

  const artisans = Number(data.artisanCount ?? data.artisanTotal ?? data.skilledCount ?? 0);
  const maleLabor = Number(data.laborerMale ?? data.maleCount ?? 0);
  const femaleLabor = Number(data.laborerFemale ?? data.femaleCount ?? 0);
  const craftsmen = Number(data.craftsmanCount ?? data.craftsmanTotal ?? 0);
  const grandTotal = Number(data.grandTotal ?? (artisans + maleLabor + femaleLabor + craftsmen));
  const totalExpense = Number(data.totalExpense ?? 0);

  return (
    <div className="space-y-4">
      {/* Site & Contractor Details */}
      <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/80 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
          <div className="flex items-start gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-lg shrink-0 mt-0.5">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-amber-800">Site Location</span>
              <p className="font-bold text-slate-900 text-sm mt-0.5">{siteName}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-lg shrink-0 mt-0.5">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-amber-800">Contractor / Agency</span>
              <p className="font-bold text-slate-900 text-sm mt-0.5">{contractor}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-lg shrink-0 mt-0.5">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-amber-800">Date &amp; Shift</span>
              <p className="font-semibold text-slate-800 text-xs mt-0.5">
                {dateFormatted} &bull; <span className="text-amber-900 font-bold">{shift}</span>
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-lg shrink-0 mt-0.5">
              <User className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-amber-800">Logged By Supervisor</span>
              <p className="font-semibold text-slate-800 text-xs mt-0.5">{supervisor}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Headcount Stat Grid */}
      <div>
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5">
          <Users className="w-4 h-4 text-amber-600" />
          <span>Worker Count Breakdown</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Artisans / Skilled</span>
            <p className="text-xl font-black text-slate-900 mt-1">{artisans}</p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Male Laborers</span>
            <p className="text-xl font-black text-slate-900 mt-1">{maleLabor}</p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Female Laborers</span>
            <p className="text-xl font-black text-slate-900 mt-1">{femaleLabor}</p>
          </div>
          <div className="p-3.5 rounded-xl bg-amber-500 text-white text-center shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-100">Total Workers</span>
            <p className="text-2xl font-black mt-0.5">{grandTotal}</p>
          </div>
        </div>
      </div>

      {/* Financial Overview */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400">Total Wage Expense</span>
          <p className="text-base font-bold text-emerald-700 mt-0.5">{formatCurrency(totalExpense)}</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase font-bold text-slate-400">Billing Rate Unit</span>
          <p className="text-xs font-semibold text-slate-800 mt-0.5">Per {data.rateUnit || "Day"}</p>
        </div>
      </div>
    </div>
  );
}

function getDisplayableAttributes(obj: Record<string, any>): [string, any][] {
  if (!obj || typeof obj !== "object") return [];

  const hideKeys = new Set([
    "createdAt",
    "updatedAt",
    "isOverridden",
    "diskFileName",
  ]);

  if (obj.siteName) hideKeys.add("siteId");
  if (obj.projectName) hideKeys.add("projectId");
  if (obj.supervisorName) hideKeys.add("supervisorId");
  if (obj.contractorName) hideKeys.add("contractorId");
  if (obj.originalName || obj.fileName) hideKeys.add("fileId");
  if (obj.taskTitle || obj.title) hideKeys.add("taskId");

  return Object.entries(obj).filter(([k, v]) => {
    if (hideKeys.has(k)) return false;
    if (v === null || v === undefined) return false;
    if (Array.isArray(v) && v.length === 0) return false;
    if (typeof v === "string" && v.trim() === "") return false;
    return true;
  });
}

function formatDiffText(val: any, nameMap: EntityNameMap): string {
  if (val === null || val === undefined || val === "") return "None";
  if (typeof val === "boolean") return val ? "True" : "False";
  if (typeof val === "number") return val.toLocaleString("en-IN");
  if (typeof val === "string") {
    const valLower = val.trim().toLowerCase();
    if (nameMap[valLower]) return nameMap[valLower].name;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim())) {
      return `Ref #${val.trim().slice(0, 8)}`;
    }
    return val;
  }
  if (Array.isArray(val)) {
    return (
      val
        .map((x) => (typeof x === "object" ? x.name || x.title || JSON.stringify(x) : String(x)))
        .join(", ") || "None"
    );
  }
  return JSON.stringify(val);
}

export default function AuditPage() {
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [nameMap, setNameMap] = useState<EntityNameMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(() => istDateKey());
  const [toDate, setToDate] = useState(() => istDateKey());
  const [datePreset, setDatePreset] = useState<"ALL" | "TODAY" | "THIS_MONTH" | "CUSTOM">("TODAY");
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"attributes" | "diff" | "json">("attributes");
  const [copied, setCopied] = useState(false);

  const handleDatePreset = (preset: "ALL" | "TODAY" | "THIS_MONTH" | "CUSTOM") => {
    setDatePreset(preset);
    const now = new Date();
    const today = istDateKey(now);

    if (preset === "ALL") {
      setFromDate("");
      setToDate("");
    } else if (preset === "TODAY") {
      setFromDate(today);
      setToDate(today);
    } else if (preset === "THIS_MONTH") {
      const first = `${today.slice(0, 7)}-01`;
      setFromDate(first);
      setToDate(today);
    }
  };

  useEffect(() => {
    fetch("/api/audit")
      .then(async (r) => {
        if (r.status === 403) {
          setError("Access Restricted: Only Company Admins, Auditors, or Super Admins can view the system activity log.");
          return null;
        }
        if (!r.ok) {
          const errData = await r.json().catch(() => ({}));
          setError(errData.error || `Could not load activity log (Error ${r.status})`);
          return null;
        }
        return r.json();
      })
      .then((res) => {
        if (res && res.success) {
          const list = Array.isArray(res.data) ? res.data : (res.data?.events || []);
          const names = res.data?.nameMap || {};
          setAuditEvents(list);
          setNameMap(names);
        } else if (res && res.error) {
          setError(res.error);
        }
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

  const filteredEvents = useMemo(() => {
    return auditEvents.filter((e) => {
      // Date filtering in IST
      const eventDateKey = e.createdAt ? istDateKey(new Date(e.createdAt)) : "";
      if (fromDate && (!eventDateKey || eventDateKey < fromDate)) return false;
      if (toDate && (!eventDateKey || eventDateKey > toDate)) return false;

      return true;
    });
  }, [auditEvents, fromDate, toDate]);

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
        label: "Changed By",
        accessor: (e) => `${e.actor?.name || "System"} (${e.actor?.role || "SYSTEM"})`,
        type: "text",
      },
      {
        key: "entityType",
        label: "Record Type",
        accessor: (e) => `${formatAuditEntityType(e.entityType)} ${e.entityDisplayName || nameMap[e.entityId?.toLowerCase()]?.name || ""}`,
        type: "text",
      },
      {
        key: "reason",
        label: "Reason / Notes",
        accessor: (e) => e.reason || "Normal update",
        type: "text",
      },
      {
        key: "metadata",
        label: "Details",
        accessor: (e) => e.entityDisplayName || "View Details",
        type: "text",
      },
    ],
    [nameMap]
  );

  const excelAudit = useExcelTable({
    data: filteredEvents,
    columns: auditColumns,
  });

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader icon={ShieldCheck} title="System Activity Log" subtitle="Track all important site actions: payments, reversals, stock changes, orders, and attendance edits.">
          <span className="text-xs font-mono font-bold bg-slate-900 text-amber-400 px-3 py-1.5 rounded-lg w-max">
            All Changes Recorded
          </span>
        </PageHeader>


        {/* Quick Date Presets Bar for Activity Log */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1">
              <Calendar className="w-3.5 h-3.5 text-amber-500" />
              <span>Log Period:</span>
            </span>
            <button
              type="button"
              onClick={() => handleDatePreset("TODAY")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                datePreset === "TODAY"
                  ? "bg-amber-500 text-slate-950 shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleDatePreset("THIS_MONTH")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                datePreset === "THIS_MONTH"
                  ? "bg-amber-500 text-slate-950 shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => handleDatePreset("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                datePreset === "ALL"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
            >
              All Time
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-semibold text-[11px]">From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setDatePreset("CUSTOM");
                }}
                className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-semibold text-[11px]">To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setDatePreset("CUSTOM");
                }}
                className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => handleDatePreset("ALL")}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer"
                title="Clear date filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Audit Log Table */}
        {error ? (
          <div className="p-8 text-center bg-white rounded-xl border border-red-200 shadow-sm max-w-xl mx-auto my-12">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-200">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Access Restricted</h3>
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
            <div className="text-sm font-bold text-slate-700">No activity recorded yet</div>
            <div className="text-xs text-slate-400 mt-1">Actions performed by users will appear here automatically.</div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <ExcelTableToolbar
              table={excelAudit}
              columns={auditColumns}
              tableName="activity log"
              showSearch={true}
              showExport={true}
            />
            <div className="overflow-x-auto md:min-h-[400px]">
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
                    excelAudit.paginatedData.map((e) => (
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
                        <div className="font-semibold text-slate-800">
                          {formatAuditEntityType(e.entityType)}
                        </div>
                        <div
                          className="text-[11px] text-amber-700 font-medium font-sans truncate max-w-[210px]"
                          title={e.entityDisplayName || e.entityId}
                        >
                          {e.entityDisplayName || nameMap[e.entityId?.toLowerCase()]?.name || `Ref #${e.entityId?.slice(0, 8)}`}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-sans text-xs text-slate-700 max-w-[220px] break-words">
                        {e.reason ? (
                          <span className="font-medium text-amber-900 bg-amber-50 px-2 py-1 rounded border border-amber-200/60 block break-words whitespace-normal">
                            {e.reason}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Normal update</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-sans text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEvent(e);
                            setActiveTab("attributes");
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 bg-white hover:bg-amber-50 text-slate-700 hover:text-amber-900 border border-slate-200 hover:border-amber-400 rounded-lg shadow-2xs transition-all cursor-pointer group"
                          title="View change details"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-600 group-hover:scale-110 transition-transform" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={excelAudit.currentPage}
              totalPages={excelAudit.totalPages}
              totalItems={excelAudit.filteredCount}
              totalUnfiltered={excelAudit.totalRecords}
              pageSize={excelAudit.pageSize}
              startItem={excelAudit.startItem}
              endItem={excelAudit.endItem}
              onPageChange={excelAudit.setCurrentPage}
              itemLabel="activity entries"
            />
          </div>
        )}

        {/* Audit Detail Inspector Modal */}
        {selectedEvent && (() => {
          const after = parseJsonSafe(selectedEvent.afterJson);
          const before = parseJsonSafe(selectedEvent.beforeJson);

          const afterRecords = normalizeAuditPayload(after);
          const beforeRecords = normalizeAuditPayload(before);
          const primaryRecords = afterRecords.length > 0 ? afterRecords : beforeRecords;

          const isWorkforce =
            selectedEvent.action.includes("WORKFORCE") ||
            selectedEvent.entityType.includes("WORKFORCE") ||
            primaryRecords.some((r) => isWorkforceRecord(r));

          const hasDiff = Boolean(before && after && Object.keys(before).length > 0);
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
                className="bg-white rounded-2xl max-w-2xl w-full max-h-[88dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
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
                          Change Details
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
                        Recorded on {formatDateTime(selectedEvent.createdAt)}
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
                    <div className="text-[10px] uppercase font-bold text-slate-400">Changed By</div>
                    <div className="font-bold text-slate-900 mt-0.5">{selectedEvent.actor?.name || "System"}</div>
                    <div className="text-[11px] text-slate-500 font-mono capitalize">
                      {selectedEvent.actor?.role?.toLowerCase().replace("_", " ")}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Record Type</div>
                    <div className="font-bold text-slate-900 mt-0.5">
                      {formatAuditEntityType(selectedEvent.entityType)}
                    </div>
                    <div
                      className="text-[11px] text-amber-700 font-medium font-sans truncate"
                      title={selectedEvent.entityDisplayName || selectedEvent.entityId}
                    >
                      {selectedEvent.entityDisplayName || nameMap[selectedEvent.entityId?.toLowerCase()]?.name || `Ref #${selectedEvent.entityId.slice(0, 8)}`}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 col-span-2 sm:col-span-1">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Date &amp; Time</div>
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
                    <span>Summary {primaryRecords.length > 1 ? `(${primaryRecords.length} Entries)` : ""}</span>
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
                      <span>Before &amp; After</span>
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
                    <span>Technical Data</span>
                  </button>
                </div>

                {/* Tab Contents */}
                <div className="p-5 flex-1 overflow-y-auto">
                  {activeTab === "attributes" && (
                    <div className="space-y-4">
                      {primaryRecords.length === 0 ? (
                        <div className="py-8 text-center text-slate-400 text-xs italic">
                          No extra details were recorded for this action.
                        </div>
                      ) : isWorkforce ? (
                        <div className="space-y-4">
                          {primaryRecords.map((rec, index) => (
                            <div key={index} className="space-y-2">
                              {primaryRecords.length > 1 && (
                                <div className="text-xs font-bold text-slate-700 pb-1 border-b border-slate-100 flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                                  <span>Workforce Entry {index + 1} of {primaryRecords.length}</span>
                                </div>
                              )}
                              <WorkforceSummaryCard data={rec} nameMap={nameMap} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {primaryRecords.map((rec, recIndex) => {
                            const displayAttrs = getDisplayableAttributes(rec);
                            return (
                              <div key={recIndex} className="space-y-2">
                                {primaryRecords.length > 1 && (
                                  <div className="text-xs font-bold text-slate-700 pb-1 border-b border-slate-100 flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                                    <span>Entry {recIndex + 1} of {primaryRecords.length}</span>
                                  </div>
                                )}
                                {displayAttrs.length === 0 ? (
                                  <div className="py-4 text-center text-slate-400 text-xs italic">
                                    Standard record update
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    {displayAttrs.map(([key, value]) => (
                                      <div
                                        key={key}
                                        className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 transition-colors"
                                      >
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                          {formatKeyLabel(key)}
                                        </div>
                                        <div className="text-xs break-words">
                                          {formatFieldValue(key, value, nameMap, rec)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "diff" && hasDiff && (() => {
                    const allKeys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));
                    const changed = allKeys.filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));

                    return (
                      <div className="space-y-3">
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-amber-600" />
                            <span>Modified Fields Comparison ({changed.length})</span>
                          </div>
                          {changed.length === 0 ? (
                            <div className="py-4 text-center text-slate-400 text-xs italic">No attribute changes detected</div>
                          ) : (
                            <div className="space-y-2">
                              {changed.map((key) => (
                                <div
                                  key={key}
                                  className="p-3 rounded-lg bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                                >
                                  <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                                    {formatKeyLabel(key)}
                                  </span>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="line-through text-rose-600 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200 font-medium">
                                      {formatDiffText(before?.[key], nameMap)}
                                    </span>
                                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 font-bold">
                                      {formatDiffText(after?.[key], nameMap)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {activeTab === "json" && (
                    <div className="relative">
                      <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800 max-h-[45dvh]">
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
                    <span>{copied ? "Copied!" : "Copy Details"}</span>
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
