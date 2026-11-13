"use client";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Link from "next/link";
import React, { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatDate, formatCompactINR, formatCompactNumber, formatShortBillNumber, formatShortName } from "@/lib/formatters";
import { downloadCsv } from "@/lib/csv-download";
import { compressImageFile } from "@/lib/image-compression";
import {
  CalendarDays,
  DollarSign,
  Boxes,
  HardHat,
  FileText,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  PlusCircle,
  Receipt,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  Building2,
  CheckCircle2,
  XCircle,
  X,
  CreditCard,
  Layers,
  Filter,
  Users,
  UserCheck,
  Sparkles,
  Info,
  Camera,
  UploadCloud,
  Eye,
  Trash2,
  Image as ImageIcon,
  BarChart2,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { canUser } from "@/lib/permissions";
import ExcelTable, { ExcelColumn, useTablePagination, ShowEntriesControl, TablePagination } from "@/components/ui/ExcelTable";
import { useActiveSite } from "@/hooks/useActiveSite";
import { useAppSession } from "@/components/providers/AppSessionProvider";

interface DayBookData {
  date: string;
  summary: {
    totalPaymentsAmount: number;
    totalRejectedPaymentsAmount?: number;
    totalBillsAmount: number;
    totalMoneyInAmount?: number;
    moneyInCount?: number;
    paymentsCount: number;
    rejectedPaymentsCount?: number;
    billsCount: number;
    receiptsCount: number;
    issuesCount: number;
    workersPresentCount: number;
    headcountTotal?: number;
    headcountArtisans?: number;
    headcountCraftsmen?: number;
    headcountLaborers?: number;
    staffPresentCount?: number;
    reportsCount: number;
  };
  payments: any[];
  moneyIn?: any[];
  bills: any[];
  receipts: any[];
  issues: any[];
  attendance: any[];
  staffAttendance?: any[];
  workerAttendance?: any[];
  headcount?: any[];
  dailyReports: any[];
  recentActivityDates?: string[];
}

interface PrintSectionConfig {
  summary: boolean;
  payments: boolean;
  rejected: boolean;
  moneyIn: boolean;
  bills: boolean;
  headcount: boolean;
  attendance: boolean;
  materials: boolean;
  reports: boolean;
  signatures: boolean;
}

const DEFAULT_PRINT_SECTIONS: PrintSectionConfig = {
  summary: true,
  payments: true,
  rejected: true,
  moneyIn: true,
  bills: true,
  headcount: true,
  attendance: true,
  materials: true,
  reports: true,
  signatures: true,
};

function SectionCheckboxCard({
  checked,
  onChange,
  icon,
  title,
  badge,
  highlight,
  description,
  isWarning,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  icon: React.ReactNode;
  title: string;
  badge?: string;
  highlight?: string;
  description?: string;
  isWarning?: boolean;
}) {
  return (
    <label
      className={`p-3 rounded-xl border transition flex items-start gap-2.5 cursor-pointer select-none ${
        checked
          ? "border-amber-400 bg-amber-50/40 shadow-xs ring-1 ring-amber-300/60"
          : "border-slate-200 bg-white hover:bg-slate-50 opacity-75"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="shrink-0">{icon}</span>
          <span className="font-bold text-slate-900 text-xs truncate">{title}</span>
          {badge && (
            <span
              className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${
                isWarning
                  ? "bg-rose-100 text-rose-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {badge}
            </span>
          )}
        </div>
        {highlight && (
          <div className="text-[11px] font-bold text-slate-700 mt-0.5">
            {highlight}
          </div>
        )}
        {description && (
          <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
            {description}
          </div>
        )}
      </div>
    </label>
  );
}

export default function DayBookPage() {
  const { t } = useLanguage();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const canReadFinance = currentUser ? canUser(currentUser, "finance:read") : false;
  const canWriteFinance = currentUser ? canUser(currentUser, "finance:write") : false;
  const canWriteProjects = !currentUser || canUser(currentUser, "projects:write");
  const canWriteTasks = !currentUser || canUser(currentUser, "tasks:write");
  const canWriteAttendance = !currentUser || canUser(currentUser, "attendance:write");
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const canWriteDsr = canWriteProjects || canWriteTasks;
  const canLogDayEntry = canWriteFinance || canWriteDsr || canWriteAttendance;

  // Excel Column Definitions
  const paymentColumns: ExcelColumn[] = useMemo(
    () => [
      {
        key: "party",
        label: "Party / Vendor",
        width: "220px",
        accessor: (p) => p.party?.name || (p.recipientType === "OUT_OF_POCKET" ? `Cash Expense: ${p.recipientName || "Expense"}` : "Direct Expense"),
        render: (p) => (
          <div>
            <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
              <span>{p.party?.name || p.recipientName || "Direct Expense"}</span>
              {p.recipientType === "OUT_OF_POCKET" && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                  Cash Expense
                </span>
              )}
            </div>
            {p.notes && <div className="text-[11px] text-slate-400 italic break-words whitespace-normal">{p.notes}</div>}
            {p.status === "REJECTED" && p.rejectionReason && (
              <div className="text-[10px] text-rose-600 font-semibold mt-0.5 break-words whitespace-normal">
                Declined: {p.rejectionReason}
              </div>
            )}
          </div>
        ),
      },
      {
        key: "paymentMethod",
        label: "Method",
        width: "120px",
        accessor: (p) => p.paymentMethod || "CASH",
        render: (p) => (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
            {p.paymentMethod || "CASH"}
          </span>
        ),
      },
      {
        key: "referenceNumber",
        label: "Reference No",
        width: "150px",
        accessor: (p) => p.referenceNumber || "—",
        render: (p) => <span className="font-mono text-slate-600">{p.referenceNumber || "—"}</span>,
      },
      {
        key: "project",
        label: "Project / Site",
        accessor: (p) => p.project?.name || "General / HQ",
        render: (p) => <span className="text-slate-600">{p.project?.name || "General / HQ"}</span>,
      },
      {
        key: "status",
        label: "Status",
        accessor: (p) => p.status || "POSTED",
        render: (p) => (
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              p.status === "POSTED"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : p.status === "REJECTED"
                ? "bg-rose-50 text-rose-700 border border-rose-200"
                : "bg-amber-50 text-amber-700 border border-amber-200"
            }`}
          >
            {p.status || "POSTED"}
          </span>
        ),
      },
      {
        key: "amount",
        label: "Amount (₹)",
        type: "currency",
        align: "right",
        accessor: (p) => p.amount,
        render: (p) => (
          <span className={`font-black ${p.status === "REJECTED" ? "text-rose-500 line-through decoration-rose-400" : "text-rose-600"}`}>
            {formatCurrency(p.amount)}
          </span>
        ),
      },
      {
        key: "attachment",
        label: "Receipt / Doc",
        accessor: (p) => (p.attachments && p.attachments.length > 0 ? "Attached" : "None"),
        render: (p) => {
          const att = p.attachments?.[0];
          if (!att) return <span className="text-slate-300 text-xs">—</span>;
          return (
            <button
              type="button"
              onClick={() => setActivePhotoLightbox(att.url)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200 transition"
              title={`View ${att.fileName}`}
            >
              <ImageIcon className="w-3 h-3 text-rose-600" />
              <span>Voucher</span>
            </button>
          );
        },
      },
    ],
    []
  );

  const rejectedPaymentColumns: ExcelColumn[] = useMemo(
    () => [
      {
        key: "party",
        label: "Party / Vendor",
        width: "220px",
        accessor: (p) => p.party?.name || "Direct Expense",
        render: (p) => (
          <div>
            <div className="font-bold text-slate-900">{p.party?.name || "Direct Expense"}</div>
            {p.notes && <div className="text-[11px] text-slate-400 italic break-words whitespace-normal">{p.notes}</div>}
          </div>
        ),
      },
      {
        key: "paymentMethod",
        label: "Method",
        width: "120px",
        accessor: (p) => p.paymentMethod || "CASH",
        render: (p) => (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
            {p.paymentMethod || "CASH"}
          </span>
        ),
      },
      {
        key: "referenceNumber",
        label: "Reference No",
        width: "140px",
        accessor: (p) => p.referenceNumber || "—",
        render: (p) => <span className="font-mono text-slate-600">{p.referenceNumber || "—"}</span>,
      },
      {
        key: "project",
        label: "Project / Site",
        accessor: (p) => p.project?.name || "General / HQ",
        render: (p) => <span className="text-slate-600">{p.project?.name || "General / HQ"}</span>,
      },
      {
        key: "status",
        label: "Status",
        accessor: () => "REJECTED",
        render: () => (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
            REJECTED
          </span>
        ),
      },
      {
        key: "rejectionReason",
        label: "Declined Reason",
        width: "250px",
        accessor: (p) => p.rejectionReason || "No remarks provided",
        render: (p) => (
          <div className="text-xs text-rose-700 font-medium break-words whitespace-normal flex items-start gap-1">
            <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
            <span>{p.rejectionReason || "No remarks provided"}</span>
          </div>
        ),
      },
      {
        key: "amount",
        label: "Amount (₹)",
        type: "currency",
        align: "right",
        accessor: (p) => p.amount,
        render: (p) => (
          <span className="font-black text-rose-600 font-mono">
            {formatCurrency(p.amount)}
          </span>
        ),
      },
      {
        key: "attachment",
        label: "Receipt / Doc",
        accessor: (p) => (p.attachments && p.attachments.length > 0 ? "Attached" : "None"),
        render: (p) => {
          const att = p.attachments?.[0];
          if (!att) return <span className="text-slate-300 text-xs">—</span>;
          return (
            <button
              type="button"
              onClick={() => setActivePhotoLightbox(att.url)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200 transition"
              title={`View ${att.fileName}`}
            >
              <ImageIcon className="w-3 h-3 text-rose-600" />
              <span>Voucher</span>
            </button>
          );
        },
      },
    ],
    []
  );

  const billColumns: ExcelColumn[] = useMemo(
    () => [
      {
        key: "billNumber",
        label: "Bill Number",
        accessor: (b) => b.billNumber || "—",
        render: (b) => (
          <span className="font-mono font-bold text-amber-700" title={b.billNumber || "—"}>
            {formatShortBillNumber(b.billNumber)}
          </span>
        ),
      },
      {
        key: "party",
        label: "Party / Vendor",
        width: "220px",
        accessor: (b) => b.party?.name || "N/A",
        render: (b) => <span className="font-bold text-slate-900">{b.party?.name || "N/A"}</span>,
      },
      {
        key: "project",
        label: "Project",
        accessor: (b) => b.project?.name || "General",
        render: (b) => <span className="text-slate-600">{b.project?.name || "General"}</span>,
      },
      {
        key: "status",
        label: "Status",
        accessor: (b) => b.status || "POSTED",
        render: (b) => (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            {b.status || "POSTED"}
          </span>
        ),
      },
      {
        key: "totalAmount",
        label: "Total (₹)",
        type: "currency",
        align: "right",
        accessor: (b) => b.totalAmount,
        render: (b) => (
          <span className="font-black text-slate-900">
            {formatCurrency(b.totalAmount)}
          </span>
        ),
      },
      {
        key: "attachment",
        label: "Doc / Image",
        accessor: (b) => (b.attachments && b.attachments.length > 0 ? "Attached" : "None"),
        render: (b) => {
          const att = b.attachments?.[0];
          if (!att) return <span className="text-slate-300 text-xs">—</span>;
          return (
            <button
              type="button"
              onClick={() => setActivePhotoLightbox(att.url)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition"
              title={`View ${att.fileName}`}
            >
              <ImageIcon className="w-3 h-3 text-amber-600" />
              <span>View Doc</span>
            </button>
          );
        },
      },
    ],
    []
  );

  const headcountColumns: ExcelColumn[] = useMemo(
    () => [
      {
        key: "siteName",
        label: "Site",
        accessor: (h) => h.siteName || "Operational Site",
        render: (h) => <span className="font-bold text-slate-900">{h.siteName || "Operational Site"}</span>,
      },
      {
        key: "shift",
        label: "Shift",
        accessor: (h) => h.shift || "GENERAL",
        render: (h) => (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
            {h.shift}
          </span>
        ),
      },
      {
        key: "artisanCount",
        label: "Artisans",
        type: "number",
        align: "center",
        accessor: (h) => h.artisanCount ?? h.artisanTotal ?? 0,
        render: (h) => <span className="font-semibold text-slate-700">{h.artisanCount ?? h.artisanTotal ?? 0}</span>,
      },
      {
        key: "craftsmanCount",
        label: "Craftsmen",
        type: "number",
        align: "center",
        accessor: (h) => h.craftsmanCount ?? h.craftsmanTotal ?? 0,
        render: (h) => <span className="font-semibold text-slate-700">{h.craftsmanCount ?? h.craftsmanTotal ?? 0}</span>,
      },
      {
        key: "laborers",
        label: "Laborers",
        type: "number",
        align: "center",
        accessor: (h) => h.laborerTotal || ((h.laborerMale || 0) + (h.laborerFemale || 0)) || 0,
        render: (h) => (
          <span>
            <strong className="text-slate-900">{h.laborerTotal || ((h.laborerMale || 0) + (h.laborerFemale || 0)) || 0}</strong>
            {((h.laborerMale || 0) > 0 || (h.laborerFemale || 0) > 0) && (
              <span className="text-[10px] text-slate-400 ml-1">
                ({h.laborerMale || 0}M / {h.laborerFemale || 0}F)
              </span>
            )}
          </span>
        ),
      },
      {
        key: "grandTotal",
        label: "Total Workers",
        type: "number",
        align: "center",
        accessor: (h) => h.grandTotal || 0,
        render: (h) => (
          <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
            {h.grandTotal || 0} workers
          </span>
        ),
      },
      {
        key: "contractorName",
        label: "Contractor / Gang",
        accessor: (h) => h.contractorName || "Direct Site Gang",
        render: (h) => <span className="text-slate-600">{h.contractorName || "Direct Site Gang"}</span>,
      },
      {
        key: "notes",
        label: "Notes",
        accessor: (h) => h.notes || "—",
        render: (h) => <span className="text-slate-500 break-words whitespace-normal block" title={h.notes || ""}>{h.notes || "—"}</span>,
      },
    ],
    []
  );

  const attendanceColumns: ExcelColumn[] = useMemo(
    () => [
      {
        key: "employeeCode",
        label: "Emp Code",
        accessor: (a) => a.workforceMember?.employeeCode || "—",
        render: (a) => <span className="font-mono text-slate-600">{a.workforceMember?.employeeCode || "—"}</span>,
      },
      {
        key: "workerName",
        label: "Staff Name",
        accessor: (a) => a.workforceMember?.name || "Staff",
        render: (a) => <span className="font-bold text-slate-900">{a.workforceMember?.name || "Staff"}</span>,
      },
      {
        key: "trade",
        label: "Role / Designation",
        accessor: (a) => a.workforceMember?.workerType || a.workforceMember?.trade || "Staff",
        render: (a) => (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
            {a.workforceMember?.workerType || a.workforceMember?.trade || "Staff"}
          </span>
        ),
      },
      {
        key: "status",
        label: "Status",
        accessor: (a) => a.status || "PRESENT",
        render: (a) => (
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              a.status === "PRESENT"
                ? "bg-emerald-100 text-emerald-800"
                : a.status === "HALF_DAY"
                ? "bg-amber-100 text-amber-800"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {a.status}
          </span>
        ),
      },
    ],
    []
  );

    const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [selectedDate, setSelectedDate] = useState(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("date") || new URLSearchParams(window.location.search).get("from");
      if (p && /^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
    }
    return todayStr;
  });
  const [toDate, setToDate] = useState(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("to") || new URLSearchParams(window.location.search).get("date");
      if (p && /^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
    }
    return todayStr;
  });
  const [dateFilterMode, setDateFilterMode] = useState<"SINGLE" | "RANGE">("SINGLE");
  const { activeSiteId, setActiveSiteId } = useActiveSite();
  const { refreshUser, refreshSites } = useAppSession();
  const [sites, setSites] = useState<any[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"ALL" | "PAYMENTS" | "REJECTED" | "BILLS" | "ATTENDANCE" | "REPORTS">("ALL");

  useEffect(() => {
    if (currentUser && !canReadFinance && ["PAYMENTS", "REJECTED", "BILLS"].includes(activeTab)) {
      setActiveTab("ALL");
    }
  }, [currentUser, canReadFinance, activeTab]);
  const [loading, setLoading] = useState(true);
  const [dayData, setDayData] = useState<DayBookData | null>(null);
  const [mounted, setMounted] = useState(false);

  // Quick Action Modal states
  const [showLogModal, setShowLogModal] = useState(false);
  const [modalMode, setModalMode] = useState<"PAYMENT" | "BILL" | "WORKFORCE" | "DSR">("PAYMENT");
  const [kpiPopupType, setKpiPopupType] = useState<"PAYMENTS" | "REJECTED_PAYMENTS" | "BILLS" | "WORKFORCE" | "DSR" | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Segregated disbursed and rejected payments
  const { disbursedPayments, rejectedPayments, disbursedTotal, rejectedTotal } = useMemo(() => {
    if (!dayData?.payments) {
      return { disbursedPayments: [], rejectedPayments: [], disbursedTotal: 0, rejectedTotal: 0 };
    }
    const disbursed = dayData.payments.filter((p: any) => p.status !== "REJECTED");
    const rejected = dayData.payments.filter((p: any) => p.status === "REJECTED");

    const dTotal =
      dayData.summary?.totalPaymentsAmount ??
      disbursed.reduce((sum: number, p: any) => sum + (p.amount || 0) - (p.tdsAmount || 0), 0);
    const rTotal =
      dayData.summary?.totalRejectedPaymentsAmount ??
      rejected.reduce((sum: number, p: any) => sum + (p.amount || 0) - (p.tdsAmount || 0), 0);

    return {
      disbursedPayments: disbursed,
      rejectedPayments: rejected,
      disbursedTotal: dTotal,
      rejectedTotal: rTotal,
    };
  }, [dayData]);

  const moneyInList = useMemo(() => dayData?.moneyIn || [], [dayData?.moneyIn]);
  const staffAttendanceList = useMemo(() => dayData?.attendance || [], [dayData?.attendance]);
  const workerAttendanceList = useMemo(() => dayData?.workerAttendance || [], [dayData?.workerAttendance]);
  const moneyInPagination = useTablePagination(moneyInList);
  const staffAttPagination = useTablePagination(staffAttendanceList);
  const workerAttPagination = useTablePagination(workerAttendanceList);

  // Print & Filter states
  const [showPrintFilterModal, setShowPrintFilterModal] = useState(false);
  const [printSections, setPrintSections] = useState<PrintSectionConfig>(DEFAULT_PRINT_SECTIONS);
  const [hideEmptySectionsInPrint, setHideEmptySectionsInPrint] = useState(false);
  const [printProjectFilter, setPrintProjectFilter] = useState("ALL");

  // Filtered print datasets based on printProjectFilter
  const printDisbursedPayments = useMemo(() => {
    return disbursedPayments.filter((p: any) => {
      if (!printProjectFilter || printProjectFilter === "ALL") return true;
      return p.projectId === printProjectFilter || p.project?.id === printProjectFilter;
    });
  }, [disbursedPayments, printProjectFilter]);

  const printRejectedPayments = useMemo(() => {
    return rejectedPayments.filter((p: any) => {
      if (!printProjectFilter || printProjectFilter === "ALL") return true;
      return p.projectId === printProjectFilter || p.project?.id === printProjectFilter;
    });
  }, [rejectedPayments, printProjectFilter]);

  const printMoneyIn = useMemo(() => {
    return (dayData?.moneyIn || []).filter((r: any) => {
      if (!printProjectFilter || printProjectFilter === "ALL") return true;
      return r.projectId === printProjectFilter || r.booking?.unit?.project?.id === printProjectFilter;
    });
  }, [dayData?.moneyIn, printProjectFilter]);

  const printBills = useMemo(() => {
    return (dayData?.bills || []).filter((b: any) => {
      if (!printProjectFilter || printProjectFilter === "ALL") return true;
      return b.projectId === printProjectFilter || b.project?.id === printProjectFilter;
    });
  }, [dayData?.bills, printProjectFilter]);

  const printHeadcount = useMemo(() => {
    return (dayData?.headcount || []).filter((h: any) => {
      if (!printProjectFilter || printProjectFilter === "ALL") return true;
      return h.projectId === printProjectFilter;
    });
  }, [dayData?.headcount, printProjectFilter]);

  const printAttendance = useMemo(() => {
    return (dayData?.attendance || []).filter((a: any) => {
      if (!printProjectFilter || printProjectFilter === "ALL") return true;
      return a.projectId === printProjectFilter;
    });
  }, [dayData?.attendance, printProjectFilter]);

  const printReceipts = useMemo(() => {
    return (dayData?.receipts || []).filter((m: any) => {
      if (!printProjectFilter || printProjectFilter === "ALL") return true;
      return m.projectId === printProjectFilter;
    });
  }, [dayData?.receipts, printProjectFilter]);

  const printIssues = useMemo(() => {
    return (dayData?.issues || []).filter((m: any) => {
      if (!printProjectFilter || printProjectFilter === "ALL") return true;
      return m.projectId === printProjectFilter;
    });
  }, [dayData?.issues, printProjectFilter]);

  const printDailyReports = useMemo(() => {
    return (dayData?.dailyReports || []).filter((dr: any) => {
      if (!printProjectFilter || printProjectFilter === "ALL") return true;
      return dr.projectId === printProjectFilter || dr.project?.id === printProjectFilter;
    });
  }, [dayData?.dailyReports, printProjectFilter]);

  const printDisbursedTotal = useMemo(() => {
    return printDisbursedPayments.reduce((sum: number, p: any) => sum + (p.amount || 0) - (p.tdsAmount || 0), 0);
  }, [printDisbursedPayments]);

  const printRejectedTotal = useMemo(() => {
    return printRejectedPayments.reduce((sum: number, p: any) => sum + (p.amount || 0) - (p.tdsAmount || 0), 0);
  }, [printRejectedPayments]);

  const printMoneyInTotal = useMemo(() => {
    return printMoneyIn.reduce((sum: number, r: any) => sum + (r.amount || 0), 0);
  }, [printMoneyIn]);

  const printBillsTotal = useMemo(() => {
    return printBills.reduce((sum: number, b: any) => sum + (b.totalAmount || 0), 0);
  }, [printBills]);

  // Presets and print modal handlers
  const openPrintModal = () => {
    if (activeTab === "PAYMENTS") {
      setPrintSections({
        summary: true,
        payments: true,
        rejected: false,
        moneyIn: false,
        bills: false,
        headcount: false,
        attendance: false,
        materials: false,
        reports: false,
        signatures: true,
      });
    } else if (activeTab === "REJECTED") {
      setPrintSections({
        summary: true,
        payments: false,
        rejected: true,
        moneyIn: false,
        bills: false,
        headcount: false,
        attendance: false,
        materials: false,
        reports: false,
        signatures: true,
      });
    } else if (activeTab === "BILLS") {
      setPrintSections({
        summary: true,
        payments: false,
        rejected: false,
        moneyIn: false,
        bills: true,
        headcount: false,
        attendance: false,
        materials: false,
        reports: false,
        signatures: true,
      });
    } else if (activeTab === "ATTENDANCE") {
      setPrintSections({
        summary: false,
        payments: false,
        rejected: false,
        moneyIn: false,
        bills: false,
        headcount: false,
        attendance: true,
        materials: false,
        reports: false,
        signatures: true,
      });
    } else if (activeTab === "REPORTS") {
      setPrintSections({
        summary: false,
        payments: false,
        rejected: false,
        moneyIn: false,
        bills: false,
        headcount: false,
        attendance: false,
        materials: false,
        reports: true,
        signatures: true,
      });
    }
    setShowPrintFilterModal(true);
  };

  const openPrintModalForSection = (section: keyof PrintSectionConfig | "ATTENDANCE_ALL") => {
    if (section === "ATTENDANCE_ALL") {
      setPrintSections({
        summary: false,
        payments: false,
        rejected: false,
        moneyIn: false,
        bills: false,
        headcount: true,
        attendance: true,
        materials: false,
        reports: false,
        signatures: true,
      });
    } else {
      setPrintSections({
        summary: section !== "reports",
        payments: section === "payments",
        rejected: section === "rejected",
        moneyIn: section === "moneyIn",
        bills: section === "bills",
        headcount: section === "headcount",
        attendance: section === "attendance",
        materials: section === "materials",
        reports: section === "reports",
        signatures: true,
      });
    }
    setShowPrintFilterModal(true);
  };

  const applyPresetAll = () => {
    setPrintSections(DEFAULT_PRINT_SECTIONS);
    setHideEmptySectionsInPrint(false);
  };

  const applyPresetActiveTab = () => {
    openPrintModal();
  };

  const applyPresetNonEmpty = () => {
    setHideEmptySectionsInPrint(true);
    setPrintSections({
      summary: true,
      payments: disbursedPayments.length > 0,
      rejected: rejectedPayments.length > 0,
      moneyIn: (dayData?.moneyIn?.length || 0) > 0,
      bills: (dayData?.bills?.length || 0) > 0,
      headcount: (dayData?.headcount?.length || 0) > 0,
      attendance: (dayData?.attendance?.length || 0) > 0,
      materials: ((dayData?.receipts?.length || 0) + (dayData?.issues?.length || 0)) > 0,
      reports: (dayData?.dailyReports?.length || 0) > 0,
      signatures: true,
    });
  };

  const applyPresetFinancial = () => {
    setPrintSections({
      summary: true,
      payments: true,
      rejected: true,
      moneyIn: true,
      bills: true,
      headcount: false,
      attendance: false,
      materials: false,
      reports: false,
      signatures: true,
    });
  };

  const selectAllSections = () => {
    setPrintSections(DEFAULT_PRINT_SECTIONS);
  };

  const deselectAllSections = () => {
    setPrintSections({
      summary: false,
      payments: false,
      rejected: false,
      moneyIn: false,
      bills: false,
      headcount: false,
      attendance: false,
      materials: false,
      reports: false,
      signatures: false,
    });
  };

  const selectedSectionsCount = useMemo(() => {
    return Object.values(printSections).filter(Boolean).length;
  }, [printSections]);

  const handleExecutePrint = () => {
    setShowPrintFilterModal(false);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const getActiveTabLabel = () => {
    switch (activeTab) {
      case "PAYMENTS": return "Payments Out";
      case "REJECTED": return "Rejected Payments";
      case "BILLS": return "Bills Incurred";
      case "ATTENDANCE": return "Staff Present";
      case "REPORTS": return "Site Reports (DSR)";
      default: return "All Activity";
    }
  };

  const getActiveTabShortLabel = () => {
    switch (activeTab) {
      case "PAYMENTS": return "Payments";
      case "REJECTED": return "Rejected";
      case "BILLS": return "Bills";
      case "ATTENDANCE": return "Staff";
      case "REPORTS": return "DSR";
      default: return "All";
    }
  };

  const modalModeGuidance = {
    PAYMENT: {
      title: "Log Payment Out (Cash / Bank Disbursement)",
      tag: "Money Paid Out",
      description: "Record money paid to a vendor, contractor, or worker for site expenses, materials, or wages. You can also link this payment to a pending bill.",
      requiredFields: "Recipient / Party, Amount, Payment Method, Ref / Voucher No.",
      expectedAction: "Deducts from account balance and updates payment history.",
    },
    BILL: {
      title: "Enter Incoming Bill / Tax Invoice",
      tag: "Money to Pay Later",
      description: "Enter a bill or invoice from a supplier or contractor. This records what you owe without deducting money until you pay.",
      requiredFields: "Vendor / Supplier, Bill #, Bill Date, Due Date, Pre-Tax Amount, GST Rate",
      expectedAction: "Adds to pending bills to pay later.",
    },
    WORKFORCE: {
      title: "Record Daily Workforce Headcount",
      tag: "Site Labor Master",
      description: "Enter today's total worker count at the site for skilled, semi-skilled, and helper laborers.",
      requiredFields: "Site, Skilled, Semi-Skilled, Helpers",
      expectedAction: "Updates daily attendance and labor reports.",
    },
    DSR: {
      title: "Submit Daily Site Report (DSR)",
      tag: "Site Progress",
      description: "Submit end-of-day summary of work done, materials used, weather, and any site delays.",
      requiredFields: "Project / Site, Work Done Summary",
      expectedAction: "Saves official daily site report for office review.",
    },
  };

  // Form states - Payment & Bill selection
  const [parties, setParties] = useState<any[]>([]);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentPartyId, setPaymentPartyId] = useState("");
  const [paymentProjectId, setPaymentProjectId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "BANK_TRANSFER" | "UPI" | "CHEQUE">("CASH");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [pendingPartyBills, setPendingPartyBills] = useState<any[]>([]);
  const [selectedPaymentBillId, setSelectedPaymentBillId] = useState<string>("");
  const [paymentPhotos, setPaymentPhotos] = useState<File[]>([]);
  const [paymentPhotoPreviews, setPaymentPhotoPreviews] = useState<{ id: string; url: string; name: string; size: number }[]>([]);

  // Form states - Bill
  const [billPartyId, setBillPartyId] = useState("");
  const [billProjectId, setBillProjectId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billNotes, setBillNotes] = useState("");
  const [billPhotos, setBillPhotos] = useState<File[]>([]);
  const [billPhotoPreviews, setBillPhotoPreviews] = useState<{ id: string; url: string; name: string; size: number }[]>([]);

  // Form states - Workforce Headcount
  const [wfSiteId, setWfSiteId] = useState("");
  const [wfShift, setWfShift] = useState<"GENERAL" | "DAY" | "NIGHT">("GENERAL");
  const [wfArtisans, setWfArtisans] = useState("0");
  const [wfCraftsmen, setWfCraftsmen] = useState("0");
  const [wfLaborerMale, setWfLaborerMale] = useState("0");
  const [wfLaborerFemale, setWfLaborerFemale] = useState("0");
  const [wfContractor, setWfContractor] = useState("");
  const [wfNotes, setWfNotes] = useState("");

  // Form states - DSR
  const [projects, setProjects] = useState<any[]>([]);
  const [dsrProjectId, setDsrProjectId] = useState("");
  const [dsrProgress, setDsrProgress] = useState("");
  const [dsrBlockers, setDsrBlockers] = useState("");
  const [dsrSafety, setDsrSafety] = useState("");
  const [dsrPhotos, setDsrPhotos] = useState<File[]>([]);
  const [dsrPhotoPreviews, setDsrPhotoPreviews] = useState<{ id: string; url: string; name: string; size: number }[]>([]);
  const [activePhotoLightbox, setActivePhotoLightbox] = useState<string | null>(null);
  const [uploadingPhotosCount, setUploadingPhotosCount] = useState<number>(0);
  const [fileValidationError, setFileValidationError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setKpiPopupType(null);
        setShowLogModal(false);
        setShowPrintFilterModal(false);
        setActivePhotoLightbox(null);
      }
    };
    if (kpiPopupType || showLogModal || showPrintFilterModal || activePhotoLightbox) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [kpiPopupType, showLogModal, showPrintFilterModal, activePhotoLightbox]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (picked.length === 0) return;
    setFileValidationError(null);

    const validFiles: File[] = [];
    for (const rawFile of picked) {
      if (!rawFile.type.startsWith("image/")) {
        setFileValidationError(`File "${rawFile.name}" is not an image.`);
        continue;
      }
      if (rawFile.size > 40 * 1024 * 1024) {
        setFileValidationError(`Image "${rawFile.name}" is too large to process.`);
        continue;
      }
      const compressed = await compressImageFile(rawFile, { preset: "photo" });
      if (compressed.size > 10 * 1024 * 1024) {
        setFileValidationError(`Image "${compressed.name}" exceeds the 10 MB limit.`);
        continue;
      }
      validFiles.push(compressed);
    }

    if (validFiles.length === 0) return;

    setDsrPhotos((prev) => [...prev, ...validFiles]);
    const newPreviews = validFiles.map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random()}`,
      url: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
    }));
    setDsrPhotoPreviews((prev) => [...prev, ...newPreviews]);
  };

  const handleRemovePhoto = (index: number) => {
    setDsrPhotos((prev) => prev.filter((_, i) => i !== index));
    setDsrPhotoPreviews((prev) => {
      if (prev[index]?.url) URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleBillPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (picked.length === 0) return;
    setFileValidationError(null);

    const validFiles: File[] = [];
    for (const rawFile of picked) {
      if (!rawFile.type.startsWith("image/") && rawFile.type !== "application/pdf") {
        setFileValidationError(`File "${rawFile.name}" is not a supported image or PDF document.`);
        continue;
      }
      if (rawFile.type === "application/pdf" && rawFile.size > 10 * 1024 * 1024) {
        setFileValidationError(`File "${rawFile.name}" exceeds the 10 MB limit.`);
        continue;
      }
      const processed = rawFile.type.startsWith("image/")
        ? await compressImageFile(rawFile, { preset: "receipt" })
        : rawFile;
      if (processed.size > 10 * 1024 * 1024) {
        setFileValidationError(`File "${processed.name}" exceeds the 10 MB limit.`);
        continue;
      }
      validFiles.push(processed);
    }

    if (validFiles.length === 0) return;

    setBillPhotos((prev) => [...prev, ...validFiles]);
    const newPreviews = validFiles.map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random()}`,
      url: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
    }));
    setBillPhotoPreviews((prev) => [...prev, ...newPreviews]);
  };

  const handleRemoveBillPhoto = (index: number) => {
    setBillPhotos((prev) => prev.filter((_, i) => i !== index));
    setBillPhotoPreviews((prev) => {
      if (prev[index]?.url) URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handlePaymentPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (picked.length === 0) return;
    setFileValidationError(null);

    const validFiles: File[] = [];
    for (const rawFile of picked) {
      if (!rawFile.type.startsWith("image/") && rawFile.type !== "application/pdf") {
        setFileValidationError(`File "${rawFile.name}" is not a supported image or PDF document.`);
        continue;
      }
      if (rawFile.type === "application/pdf" && rawFile.size > 10 * 1024 * 1024) {
        setFileValidationError(`File "${rawFile.name}" exceeds the 10 MB limit.`);
        continue;
      }
      const processed = rawFile.type.startsWith("image/")
        ? await compressImageFile(rawFile, { preset: "receipt" })
        : rawFile;
      if (processed.size > 10 * 1024 * 1024) {
        setFileValidationError(`File "${processed.name}" exceeds the 10 MB limit.`);
        continue;
      }
      validFiles.push(processed);
    }

    if (validFiles.length === 0) return;

    setPaymentPhotos((prev) => [...prev, ...validFiles]);
    const newPreviews = validFiles.map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random()}`,
      url: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
    }));
    setPaymentPhotoPreviews((prev) => [...prev, ...newPreviews]);
  };

  const handleRemovePaymentPhoto = (index: number) => {
    setPaymentPhotos((prev) => prev.filter((_, i) => i !== index));
    setPaymentPhotoPreviews((prev) => {
      if (prev[index]?.url) URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleCloseLogModal = () => {
    setFileValidationError(null);
    dsrPhotoPreviews.forEach((p) => URL.revokeObjectURL(p.url));
    setDsrPhotos([]);
    setDsrPhotoPreviews([]);
    billPhotoPreviews.forEach((p) => URL.revokeObjectURL(p.url));
    setBillPhotos([]);
    setBillPhotoPreviews([]);
    paymentPhotoPreviews.forEach((p) => URL.revokeObjectURL(p.url));
    setPaymentPhotos([]);
    setPaymentPhotoPreviews([]);
    setShowLogModal(false);
  };

  const loadDayBook = (fromDate?: string, toDateStr?: string, siteId?: string) => {
    setLoading(true);
    const isValidDate = (d?: string) => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d));

    // Handle case where caller might have called loadDayBook(date, siteId) with 2 arguments
    let from = isValidDate(fromDate) ? (fromDate as string) : selectedDate;
    let to = isValidDate(toDateStr) ? (toDateStr as string) : (isValidDate(toDate) ? toDate : from);
    let effectiveSiteId = siteId !== undefined ? siteId : (isValidDate(toDateStr) ? (selectedSiteId || activeSiteId || "") : (toDateStr || selectedSiteId || activeSiteId || ""));

    const query = new URLSearchParams({ from, to });
    if (effectiveSiteId) query.set("siteId", effectiveSiteId);
    query.set("_t", Date.now().toString());

    fetch(`/api/day-book?${query.toString()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setDayData(res.data);
        }
      })
      .catch((err) => {
        console.error("Day Book load error:", err);
      })
      .finally(() => setLoading(false));
  };

  // Fetch unpaid bills when paymentPartyId changes
  useEffect(() => {
    if (paymentPartyId) {
      fetch(`/api/finance/bills?partyId=${paymentPartyId}&status=PENDING_PAYMENT,PARTIALLY_PAID`)
        .then((r) => r.json())
        .then((res) => {
          if (res.success && Array.isArray(res.data)) {
            setPendingPartyBills(res.data.filter((b: any) => (b.outstandingAmount || b.totalAmount) > 0));
          } else {
            setPendingPartyBills([]);
          }
        })
        .catch(() => setPendingPartyBills([]));
    } else {
      setPendingPartyBills([]);
    }
    setSelectedPaymentBillId("");
  }, [paymentPartyId]);

  useEffect(() => {
    setMounted(true);
    // Load metadata (sites, parties, projects, auth)
    Promise.all([
      refreshSites().then((data) => ({ data })),
      fetch("/api/parties").then((r) => r.json()),
      fetch("/api/projects").then((r) => r.json()),
      refreshUser().then((user) => ({ success: Boolean(user), data: { user } })),
    ]).then(([siteRes, partyRes, projRes, meRes]) => {
      if (meRes.success && meRes.data) {
        setCurrentUser(meRes.data.user);
      }
      const rawSites = siteRes.data || [];
      setSites(rawSites);
      if (rawSites.length > 0) {
        setWfSiteId((prev) => prev || activeSiteId || rawSites[0].id);
      }

      const rawParties = partyRes.data || [];
      setParties(rawParties);
      if (rawParties.length > 0) {
        setPaymentPartyId(rawParties[0].id);
        setBillPartyId(rawParties[0].id);
      }

      const rawProjs = projRes.data || [];
      setProjects(rawProjs);
      if (rawProjs.length > 0) {
        setDsrProjectId(rawProjs[0].id);
        setPaymentProjectId(rawProjs[0].id);
        setBillProjectId(rawProjs[0].id);
      }
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Synchronize Day Book with global active site
  useEffect(() => {
    setSelectedSiteId(activeSiteId || "");
    if (activeSiteId) setWfSiteId(activeSiteId);
    loadDayBook(selectedDate, toDate, activeSiteId || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, selectedDate, toDate]);

  useEffect(() => {
    const handleRefresh = () => {
      loadDayBook(selectedDate, toDate, selectedSiteId || activeSiteId || "");
    };
    window.addEventListener("refreshDayBook", handleRefresh);
    return () => window.removeEventListener("refreshDayBook", handleRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, toDate, selectedSiteId, activeSiteId]);

  const handleDateChange = (newFrom: string, newTo?: string) => {
    const to = newTo || newFrom;
    setSelectedDate(newFrom);
    setToDate(to);
    loadDayBook(newFrom, to, selectedSiteId);
  };

  const handleApplyPreset = (preset: "today" | "yesterday" | "last7" | "thisMonth") => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    if (preset === "today") {
      setDateFilterMode("SINGLE");
      handleDateChange(today, today);
    } else if (preset === "yesterday") {
      setDateFilterMode("SINGLE");
      const y = new Date(now.getTime() - 24 * 3600 * 1000).toISOString().split("T")[0];
      handleDateChange(y, y);
    } else if (preset === "last7") {
      setDateFilterMode("RANGE");
      const d7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString().split("T")[0];
      handleDateChange(d7, today);
    } else if (preset === "thisMonth") {
      setDateFilterMode("RANGE");
      const mStart = `${today.slice(0, 7)}-01`;
      handleDateChange(mStart, today);
    }
  };

  const handleSiteChange = (newSiteId: string) => {
    setSelectedSiteId(newSiteId);
    if (newSiteId) setWfSiteId(newSiteId);
    setActiveSiteId(newSiteId);
    loadDayBook(selectedDate, toDate, newSiteId);
  };

  const shiftDate = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    const nextStr = current.toISOString().split("T")[0];
    setDateFilterMode("SINGLE");
    handleDateChange(nextStr, nextStr);
  };

  const handleCreateQuickPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      setStatusMessage("❌ Please enter a valid payment amount");
      return;
    }
    if (!paymentPartyId) {
      setStatusMessage("❌ Please select a vendor, contractor, or recipient for this payment.");
      return;
    }
    if (!paymentRef.trim()) {
      setStatusMessage("❌ Please enter a Reference / Receipt No. before saving this payment.");
      return;
    }

    if (selectedPaymentBillId) {
      const selectedBill = pendingPartyBills.find((b) => b.id === selectedPaymentBillId);
      if (selectedBill) {
        const pendingRupees = (selectedBill.outstandingAmount ?? selectedBill.totalAmount) / 100;
        if (Number(paymentAmount) > pendingRupees) {
          setStatusMessage(`❌ Payment amount (${formatCurrency(Number(paymentAmount))}) exceeds this bill's unpaid balance (${formatCurrency(pendingRupees)}).`);
          return;
        }
      }
    }

    setActionLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/finance/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId: paymentPartyId,
          projectId: paymentProjectId || undefined,
          amount: Math.round(Number(paymentAmount) * 100), // convert rupees to paise
          method: paymentMethod,
          payingAccount: "Primary Operating Account",
          idempotencyKey: `DB-PAY-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          paymentDate: `${selectedDate}T12:00:00.000Z`,
          referenceNumber: paymentRef.trim(),
          notes: paymentNotes || "Day Book Direct Expense / Cash Outflow",
          autoApprove: true,
          allocations: selectedPaymentBillId
            ? [{ billId: selectedPaymentBillId, amount: Math.round(Number(paymentAmount) * 100) }]
            : undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const paymentId = data.data?.payment?.id || data.data?.id;
        if (paymentId && paymentPhotos.length > 0) {
          for (let i = 0; i < paymentPhotos.length; i++) {
            const photo = paymentPhotos[i];
            const fd = new FormData();
            fd.append("file", photo);
            fd.append("entityType", "PAYMENT");
            fd.append("entityId", paymentId);
            if (paymentProjectId) fd.append("projectId", paymentProjectId);
            fd.append("category", "RECEIPT");
            fd.append("notes", `Payment voucher ${paymentRef.trim()}`);
            try {
              await fetch("/api/attachments", {
                method: "POST",
                body: fd,
              });
            } catch (err) {
              console.error("Failed uploading payment photo:", photo.name, err);
            }
          }
        }
        paymentPhotoPreviews.forEach((p) => URL.revokeObjectURL(p.url));
        setPaymentPhotos([]);
        setPaymentPhotoPreviews([]);

        setStatusMessage(
          paymentPhotos.length > 0
            ? `✅ Day Book payment & ${paymentPhotos.length} voucher file(s) recorded successfully!`
            : "✅ Day Book payment recorded successfully!"
        );
        setShowLogModal(false);
        setPaymentAmount("");
        setPaymentNotes("");
        setPaymentRef("");
        setSelectedPaymentBillId("");
        loadDayBook(selectedDate, toDate, selectedSiteId);
        window.dispatchEvent(new CustomEvent("refreshDayBook"));
      } else {
        setStatusMessage(`❌ Could not save payment: ${data.error?.message || "Please check your entries and try again."}`);
      }
    } catch {
      setStatusMessage("❌ Network error while saving payment. Check your connection and try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateQuickBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billAmount || Number(billAmount) <= 0) {
      setStatusMessage("❌ Please enter a valid bill amount");
      return;
    }
    if (!billPartyId) {
      setStatusMessage("❌ Please select a vendor / contractor for this bill");
      return;
    }

    setActionLoading(true);
    setStatusMessage(null);
    try {
      const generatedBillNo = billNumber.trim() || `BILL-${Date.now().toString().slice(-6)}`;
      const res = await fetch("/api/finance/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId: billPartyId,
          projectId: billProjectId || undefined,
          billNumber: generatedBillNo,
          billDate: `${selectedDate}T12:00:00.000Z`,
          notes: billNotes || "Direct Day Book Bill Incurred",
          lines: [
            {
              description: billNotes || "Direct Day Book Bill Item",
              lineTotal: Math.round(Number(billAmount) * 100),
            },
          ],
        }),
      });

      const data = await res.json();
      if (data.success) {
        const billId = data.data?.id;
        if (billId && billPhotos.length > 0) {
          for (let i = 0; i < billPhotos.length; i++) {
            const photo = billPhotos[i];
            const fd = new FormData();
            fd.append("file", photo);
            fd.append("entityType", "BILL");
            fd.append("entityId", billId);
            if (billProjectId) fd.append("projectId", billProjectId);
            fd.append("category", "INVOICE");
            fd.append("notes", `Bill #${generatedBillNo} document`);
            try {
              await fetch("/api/attachments", {
                method: "POST",
                body: fd,
              });
            } catch (err) {
              console.error("Failed uploading bill photo:", photo.name, err);
            }
          }
        }
        billPhotoPreviews.forEach((p) => URL.revokeObjectURL(p.url));
        setBillPhotos([]);
        setBillPhotoPreviews([]);

        setStatusMessage(
          billPhotos.length > 0
            ? `✅ Day Book bill & ${billPhotos.length} document file(s) saved successfully!`
            : "✅ Day Book bill entered successfully!"
        );
        setShowLogModal(false);
        setBillAmount("");
        setBillNumber("");
        setBillNotes("");
        loadDayBook(selectedDate, toDate, selectedSiteId);
        window.dispatchEvent(new CustomEvent("refreshDayBook"));
      } else {
        setStatusMessage(`❌ Could not save bill: ${data.error?.message || "Please check the bill details and try again."}`);
      }
    } catch {
      setStatusMessage("❌ Network error while saving bill. Check your connection and try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateQuickWorkforce = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetSiteId = wfSiteId || selectedSiteId || sites[0]?.id;
    if (!targetSiteId) {
      setStatusMessage("❌ Please select a site for worker count");
      return;
    }

    const artisans = Number(wfArtisans) || 0;
    const craftsmen = Number(wfCraftsmen) || 0;
    const laborerMale = Number(wfLaborerMale) || 0;
    const laborerFemale = Number(wfLaborerFemale) || 0;
    const total = artisans + craftsmen + laborerMale + laborerFemale;

    if (total <= 0) {
      setStatusMessage("❌ Please enter at least 1 worker to save today's count.");
      return;
    }

    setActionLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/workforce/headcount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: targetSiteId,
          date: selectedDate,
          shift: wfShift,
          artisanCount: artisans,
          craftsmanCount: craftsmen,
          laborerMale,
          laborerFemale,
          contractorName: wfContractor.trim() || undefined,
          notes: wfNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatusMessage(`✅ Worker count saved (${total} workers)!`);
        setShowLogModal(false);
        setWfArtisans("0");
        setWfCraftsmen("0");
        setWfLaborerMale("0");
        setWfLaborerFemale("0");
        setWfContractor("");
        setWfNotes("");
        loadDayBook(selectedDate, toDate, selectedSiteId);
        window.dispatchEvent(new CustomEvent("refreshDayBook"));
        window.dispatchEvent(new CustomEvent("refreshDayBook"));
      } else {
        setStatusMessage(`❌ Could not save worker count: ${data.error?.message || "Please try again."}`);
      }
    } catch {
      setStatusMessage("❌ Network error while saving worker count. Check your connection and try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateQuickDsr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dsrProjectId || !dsrProgress.trim()) return;

    setActionLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/daily-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: dsrProjectId,
          reportDate: selectedDate,
          progress: dsrProgress.trim(),
          blockers: dsrBlockers.trim() || undefined,
          safetyNotes: dsrSafety.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const reportId = data.data?.id;

        // Upload any attached photos to /api/attachments linked to this report
        if (reportId && dsrPhotos.length > 0) {
          setUploadingPhotosCount(dsrPhotos.length);
          for (let i = 0; i < dsrPhotos.length; i++) {
            const photo = dsrPhotos[i];
            const fd = new FormData();
            fd.append("file", photo);
            fd.append("entityType", "DAILY_REPORT");
            fd.append("entityId", reportId);
            fd.append("projectId", dsrProjectId);
            fd.append("category", "PHOTO");
            fd.append("notes", `Site DSR Photo - ${selectedDate}`);
            try {
              await fetch("/api/attachments", {
                method: "POST",
                body: fd,
              });
            } catch (photoErr) {
              console.error("Failed uploading photo:", photo.name, photoErr);
            }
          }
          setUploadingPhotosCount(0);
        }

        // Clean up preview URLs
        dsrPhotoPreviews.forEach((p) => URL.revokeObjectURL(p.url));
        setDsrPhotos([]);
        setDsrPhotoPreviews([]);

        setStatusMessage(
          dsrPhotos.length > 0
            ? `✅ Daily Site Progress & ${dsrPhotos.length} site photo(s) saved in Day Book!`
            : "✅ Daily Site Progress logged in Day Book!"
        );
        setShowLogModal(false);
        setDsrProgress("");
        setDsrBlockers("");
        setDsrSafety("");
        loadDayBook(selectedDate, toDate, selectedSiteId);
        window.dispatchEvent(new CustomEvent("refreshDayBook"));
        window.dispatchEvent(new CustomEvent("refreshDayBook"));
      } else {
        setStatusMessage(`❌ Could not save daily report: ${data.error?.message || "Please try again."}`);
      }
    } catch {
      setStatusMessage("❌ Network error while saving daily report. Check your connection and try again.");
    } finally {
      setActionLoading(false);
      setUploadingPhotosCount(0);
    }
  };

  const handleSeedDemoData = async () => {
    setActionLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/day-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, siteId: selectedSiteId || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage("✅ Sample entries added to Day Book!");
        loadDayBook(selectedDate, toDate, selectedSiteId);
        window.dispatchEvent(new CustomEvent("refreshDayBook"));
        window.dispatchEvent(new CustomEvent("refreshDayBook"));
      } else {
        setStatusMessage(`❌ Could not load sample entries: ${data.error?.message || "Please try again."}`);
      }
    } catch {
      setStatusMessage("❌ Network error while loading sample entries. Check your connection and try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const exportDayBookCSV = () => {
    if (!dayData) return;
    const rows = [
      ["BOTHRA CMS - DAY BOOK / DAILY REGISTER"],
      [`Date: ${selectedDate}`, `Site: ${selectedSiteId || "All Sites"}`],
      [],
      ["--- SUMMARY ---"],
      ["Total Payments Made", (dayData.summary.totalPaymentsAmount / 100).toFixed(2)],
      ["Total Bills Incurred", (dayData.summary.totalBillsAmount / 100).toFixed(2)],
      ["Workers Present", dayData.summary.workersPresentCount.toString()],
      ["Material Receipts", dayData.summary.receiptsCount.toString()],
      ["Material Issues", dayData.summary.issuesCount.toString()],
      ["Daily Site Logs", dayData.summary.reportsCount.toString()],
      [],
      ["--- PAYMENTS (MONEY OUT) ---"],
      ["Payment ID", "Party", "Amount (INR)", "Method", "Reference", "Status"],
      ...dayData.payments.map((p) => [
        p.id,
        `"${p.party?.name || "N/A"}"`,
        (p.amount / 100).toFixed(2),
        p.paymentMethod,
        `"${p.referenceNumber || ""}"`,
        p.status,
      ]),
      [],
      ["--- VENDOR & CONTRACTOR BILLS ---"],
      ["Bill Number", "Party", "Project", "Amount (INR)", "Status"],
      ...dayData.bills.map((b) => [
        `"${b.billNumber || ""}"`,
        `"${b.party?.name || "N/A"}"`,
        `"${b.project?.name || "General"}"`,
        (b.totalAmount / 100).toFixed(2),
        b.status,
      ]),
      [],
      ["--- WORKERS SITE HEADCOUNT MASTER ---"],
      ["Site", "Shift", "Total Workers", "Artisans", "Craftsmen", "Laborers (M/F)", "Contractor", "Notes"],
      ...(dayData.headcount || []).map((h) => [
        `"${h.siteName || ""}"`,
        h.shift,
        h.grandTotal,
        h.artisanCount ?? 0,
        h.craftsmanCount ?? 0,
        `"${h.laborerMale || 0}M / ${h.laborerFemale || 0}F"`,
        `"${h.contractorName || ""}"`,
        `"${(h.notes || "").replace(/"/g, '""')}"`,
      ]),
      [],
      ["--- STAFF ATTENDANCE SESSIONS ---"],
      ["Employee Code", "Staff Name", "Role / Designation", "Status", "Site"],
      ...dayData.attendance.map((a) => [
        a.workforceMember?.employeeCode || "",
        `"${a.workforceMember?.name || ""}"`,
        a.workforceMember?.workerType || a.workforceMember?.trade || "",
        a.status,
        `"${a.site?.name || ""}"`,
      ]),
      [],
      ["--- DAILY SITE LOGS (DSR) ---"],
      ["Project", "Progress", "Blockers", "Safety"],
      ...dayData.dailyReports.map((r) => [
        `"${r.project?.name || ""}"`,
        `"${(r.progress || "").replace(/"/g, '""')}"`,
        `"${(r.blockers || "").replace(/"/g, '""')}"`,
        `"${(r.safetyNotes || "").replace(/"/g, '""')}"`,
      ]),
    ];

    const csvString = rows.map((r) => r.join(",")).join("\n");
    downloadCsv(`DayBook_${selectedDate}.csv`, csvString);
  };

  const isToday = selectedDate === todayStr;

  return (
    <Shell>
      <div className="screen-only-section space-y-4 sm:space-y-6 print:hidden">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 border-b border-slate-200 pb-4 sm:pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 sm:p-2.5 bg-amber-500/10 text-amber-600 rounded-xl shrink-0">
                <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-xl sm:text-[26px] font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  {t("daybook.title", "Day Book")}
                </h1>
                <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
                  {t("daybook.subtitle", "Daily record of money in and out, materials moved, labor attendance, and site work.")}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {/* Populate Demo Data Button (Super Admin only - desktop) */}
            {isSuperAdmin && (
              <button
                onClick={handleSeedDemoData}
                disabled={actionLoading}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-800 text-xs font-bold rounded-xl shadow-xs transition disabled:opacity-50"
                title="Add sample entries to see how Day Book works"
              >
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>{actionLoading ? "Loading..." : "Load Sample Data"}</span>
              </button>
            )}

            {/* Quick Action Button */}
            {canLogDayEntry && (
              <button
                onClick={() => {
                  setShowLogModal(true);
                }}
                className="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 px-3.5 py-2.5 sm:py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-sm transition"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{t("daybook.addEntry", "Add Day Book Entry")}</span>
              </button>
            )}

            {/* Export CSV (desktop) */}
            <button
              onClick={exportDayBookCSV}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-xs transition"
              title="Download CSV"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>{t("action.export", "Export CSV")}</span>
            </button>

            {/* Print (desktop) */}
            <button
              onClick={() => openPrintModal()}
              disabled={loading || !dayData}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed group"
              title="Filter sections and print official Day Book statement"
            >
              <Printer className="w-4 h-4 text-slate-500 group-hover:text-amber-600 transition" />
              <span>{loading ? "Loading..." : "Print Day Book"}</span>
              <Filter className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 transition" />
            </button>
          </div>
        </div>

        {/* Date Navigator & Filters Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-xs space-y-2.5 sm:space-y-3">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-2.5 sm:gap-3">
            {/* Presets & Mode Selector */}
            <div className="flex items-center gap-1.5 w-full lg:w-auto overflow-x-auto sm:flex-wrap [scrollbar-width:none] pb-0.5 sm:pb-0">
              <span className="hidden sm:flex text-xs font-bold text-slate-500 mr-1 items-center gap-1 shrink-0">
                <CalendarDays className="w-3.5 h-3.5" />
                Filter:
              </span>
              <button
                type="button"
                onClick={() => handleApplyPreset("today")}
                className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 sm:py-1 rounded-lg text-xs font-bold border transition ${
                  dateFilterMode === "SINGLE" && selectedDate === todayStr
                    ? "bg-amber-500 text-slate-950 border-amber-500 shadow-2xs"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset("yesterday")}
                className="shrink-0 whitespace-nowrap px-2.5 py-1.5 sm:py-1 rounded-lg text-xs font-bold border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 transition"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset("last7")}
                className="shrink-0 whitespace-nowrap px-2.5 py-1.5 sm:py-1 rounded-lg text-xs font-bold border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 transition"
              >
                <span className="sm:hidden">7D</span>
                <span className="hidden sm:inline">Last 7 Days</span>
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset("thisMonth")}
                className="shrink-0 whitespace-nowrap px-2.5 py-1.5 sm:py-1 rounded-lg text-xs font-bold border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 transition"
              >
                <span className="sm:hidden">Month</span>
                <span className="hidden sm:inline">This Month</span>
              </button>
              <button
                type="button"
                onClick={() => setDateFilterMode(dateFilterMode === "SINGLE" ? "RANGE" : "SINGLE")}
                className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 sm:py-1 rounded-lg text-xs font-bold border transition ${
                  dateFilterMode === "RANGE"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {dateFilterMode === "RANGE" ? (
                  <>
                    <span className="sm:hidden">Single Day</span>
                    <span className="hidden sm:inline">Switch to Single Day</span>
                  </>
                ) : (
                  <>
                    <span className="sm:hidden">Range</span>
                    <span className="hidden sm:inline">Custom Date Range</span>
                  </>
                )}
              </button>
            </div>

            {/* Site Filter */}
            <div className="flex items-center gap-2 w-full lg:w-auto">
              <Filter className="hidden sm:block w-4 h-4 text-slate-400 shrink-0" />
              <span className="hidden sm:inline text-xs font-semibold text-slate-500 shrink-0">Site:</span>
              <select
                value={selectedSiteId}
                onChange={(e) => handleSiteChange(e.target.value)}
                aria-label="Filter by site"
                className="w-full lg:w-auto min-w-0 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500 transition"
              >
                <option value="">All Sites</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Picker Inputs */}
          <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
            {dateFilterMode === "SINGLE" ? (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => shiftDate(-1)}
                  className="shrink-0 w-9 h-9 flex items-center justify-center border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-700 transition"
                  title="Previous Day"
                  aria-label="Previous Day"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value, e.target.value)}
                  className="flex-1 min-w-0 sm:flex-none px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:border-amber-500 transition"
                />

                <button
                  type="button"
                  onClick={() => shiftDate(1)}
                  className="shrink-0 w-9 h-9 flex items-center justify-center border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-700 transition"
                  title="Next Day"
                  aria-label="Next Day"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <span className="hidden sm:inline text-xs font-semibold text-slate-600 ml-2 whitespace-nowrap">
                  Showing: <strong className="text-slate-900">{formatDate(selectedDate)}</strong>
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <span className="text-xs font-semibold text-slate-500">From:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="flex-1 min-w-0 sm:flex-none px-2.5 sm:px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
                />
                <span className="text-xs font-semibold text-slate-500">To:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="flex-1 min-w-0 sm:flex-none px-2.5 sm:px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => handleDateChange(selectedDate, toDate)}
                  className="w-full sm:w-auto px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition shadow-2xs"
                >
                  Apply Range
                </button>
                <span className="hidden sm:inline text-xs font-semibold text-slate-600 ml-2">
                  Period: <strong className="text-slate-900">{formatDate(selectedDate)} to {formatDate(toDate)}</strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Feedback message */}
        {statusMessage && (
          <Alert
            tone={statusMessage.startsWith("❌") ? "error" : statusMessage.startsWith("✅") ? "success" : "warning"}
            onDismiss={() => setStatusMessage(null)}
          >
            {statusMessage.replace(/^(❌|✅)\s*/u, "")}
          </Alert>
        )}

        {/* Summary KPI Cards for Selected Date */}
        <div className={`grid grid-cols-2 ${canReadFinance ? "md:grid-cols-3 lg:grid-cols-5" : "md:grid-cols-2 lg:grid-cols-2"} gap-3 sm:gap-4`}>
          {/* Payments Out Card (Disbursed only) */}
          {canReadFinance && (() => {
            const disbursedFormatted = dayData ? formatCurrency(disbursedTotal) : "₹0.00";
            return (
              <div
                onClick={() => setKpiPopupType("PAYMENTS")}
                className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200 shadow-xs cursor-pointer hover:border-rose-300 hover:shadow-md transition-all group active:scale-[0.99] flex flex-col justify-between min-w-0"
                role="button"
                tabIndex={0}
                title="Click to view payment details"
              >
                <div className="min-w-0">
                  <div className="flex items-center justify-between mb-2 gap-1.5">
                    <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-rose-600 transition leading-tight">Payments Out</span>
                    <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600 group-hover:bg-rose-100 transition shrink-0">
                      <ArrowUpRight className="w-4 h-4" />
                    </div>
                  </div>
                  <div
                    className="font-display text-xl sm:text-2xl font-extrabold text-rose-600 tabular-nums tracking-tight leading-tight truncate"
                    title={disbursedFormatted}
                  >
                    {formatCompactINR(dayData ? disbursedTotal : 0)}
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-slate-400 mt-1 font-medium leading-tight">
                    {disbursedPayments.length} payment{disbursedPayments.length === 1 ? "" : "s"} paid out
                  </div>
                </div>
                <div className="hidden sm:flex mt-2.5 pt-2 border-t border-slate-100 items-center justify-between text-[11px] font-semibold text-slate-400 group-hover:text-rose-600 transition">
                  <span>View details</span>
                  <span>&rarr;</span>
                </div>
              </div>
            );
          })()}

          {/* Rejected Payments Card (Separate Card on Day Book page) */}
          {canReadFinance && (() => {
            const rejectedFormatted = dayData ? formatCurrency(rejectedTotal) : "₹0.00";
            return (
              <div
                onClick={() => setKpiPopupType("REJECTED_PAYMENTS")}
                className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200 shadow-xs cursor-pointer hover:border-rose-300 hover:shadow-md transition-all group active:scale-[0.99] flex flex-col justify-between min-w-0"
                role="button"
                tabIndex={0}
                title="Click to view declined payments"
              >
                <div className="min-w-0">
                  <div className="flex items-center justify-between mb-2 gap-1.5">
                    <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-rose-600 transition leading-tight">Declined Payments</span>
                    <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600 group-hover:bg-rose-100 transition shrink-0">
                      <XCircle className="w-4 h-4" />
                    </div>
                  </div>
                  <div
                    className={`font-display text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight leading-tight truncate ${
                      rejectedPayments.length > 0 ? "text-rose-600" : "text-slate-900"
                    }`}
                    title={rejectedFormatted}
                  >
                    {formatCompactINR(dayData ? rejectedTotal : 0)}
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-slate-400 mt-1 font-medium leading-tight">
                    {rejectedPayments.length} declined request{rejectedPayments.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="hidden sm:flex mt-2.5 pt-2 border-t border-slate-100 items-center justify-between text-[11px] font-semibold text-slate-400 group-hover:text-rose-600 transition">
                  <span>View details</span>
                  <span>&rarr;</span>
                </div>
              </div>
            );
          })()}

          {/* Bills Card */}
          {canReadFinance && (() => {
            const billsFormatted = dayData ? formatCurrency(dayData.summary.totalBillsAmount) : "₹0.00";
            return (
              <div
                onClick={() => setKpiPopupType("BILLS")}
                className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200 shadow-xs cursor-pointer hover:border-amber-300 hover:shadow-md transition-all group active:scale-[0.99] flex flex-col justify-between min-w-0"
                role="button"
                tabIndex={0}
                title="Click to view bills breakdown"
              >
                <div className="min-w-0">
                  <div className="flex items-center justify-between mb-2 gap-1.5">
                    <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-amber-600 transition leading-tight">Bills Recorded</span>
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 group-hover:bg-amber-100 transition shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                  </div>
                  <div
                    className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight leading-tight truncate"
                    title={billsFormatted}
                  >
                    {formatCompactINR(dayData ? dayData.summary.totalBillsAmount : 0)}
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-slate-400 mt-1 font-medium leading-tight">
                    {dayData?.summary.billsCount || 0} vendor/contractor bills
                  </div>
                </div>
                <div className="hidden sm:flex mt-2.5 pt-2 border-t border-slate-100 items-center justify-between text-[11px] font-semibold text-slate-400 group-hover:text-amber-600 transition">
                  <span>View details</span>
                  <span>&rarr;</span>
                </div>
              </div>
            );
          })()}

          {/* Staff Present (Staff only) */}
          <div
            onClick={() => setKpiPopupType("WORKFORCE")}
            className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200 shadow-xs cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all group active:scale-[0.99] flex flex-col justify-between min-w-0"
            role="button"
            tabIndex={0}
            title="Click to view Staff attendance breakdown popup"
          >
            <div className="min-w-0">
              <div className="flex items-center justify-between mb-2 gap-1.5">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-emerald-600 transition leading-tight">Staff Present</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-100 transition shrink-0">
                  <UserCheck className="w-4 h-4" />
                </div>
              </div>
              <div
                className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight leading-tight truncate"
                title={String(dayData?.summary?.staffPresentCount ?? (dayData?.attendance?.filter((a: any) => ["PRESENT", "HALF_DAY", "OVERTIME", "CORRECTED"].includes(a.status)).length || 0))}
              >
                {formatCompactNumber(dayData?.summary?.staffPresentCount ?? (dayData?.attendance?.filter((a: any) => ["PRESENT", "HALF_DAY", "OVERTIME", "CORRECTED"].includes(a.status)).length || 0))}
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 mt-1 font-medium leading-tight">
                {(dayData?.summary?.staffPresentCount || dayData?.attendance?.length || 0) > 0
                  ? `${dayData?.summary?.staffPresentCount || dayData?.attendance?.length} Staff checked in`
                  : "No staff logged today"}
              </div>
            </div>
            <div className="hidden sm:flex mt-2.5 pt-2 border-t border-slate-100 items-center justify-between text-[11px] font-semibold text-slate-400 group-hover:text-emerald-600 transition">
              <span>View details</span>
              <span>&rarr;</span>
            </div>
          </div>

          {/* Site Logs / DSR */}
          <div
            onClick={() => setKpiPopupType("DSR")}
            className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200 shadow-xs cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group active:scale-[0.99] flex flex-col justify-between min-w-0"
            role="button"
            tabIndex={0}
            title="Click to view Site Logs breakdown popup"
          >
            <div className="min-w-0">
              <div className="flex items-center justify-between mb-2 gap-1.5">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-blue-600 transition leading-tight">Site Logs (DSR)</span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-100 transition shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div
                className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight leading-tight truncate"
                title={String(dayData?.summary.reportsCount || 0)}
              >
                {formatCompactNumber(dayData?.summary.reportsCount || 0)}
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 mt-1 font-medium leading-tight">
                Progress & safety updates
              </div>
            </div>
            <div className="hidden sm:flex mt-2.5 pt-2 border-t border-slate-100 items-center justify-between text-[11px] font-semibold text-slate-400 group-hover:text-blue-600 transition">
              <span>View details</span>
              <span>&rarr;</span>
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto pb-1 text-xs font-bold">
          <button
            onClick={() => setActiveTab("ALL")}
            className={`px-3 py-2 rounded-lg transition whitespace-nowrap ${
              activeTab === "ALL" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            All Activity
          </button>
          {canReadFinance && (
            <>
              <button
                onClick={() => setActiveTab("PAYMENTS")}
                className={`px-3 py-2 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === "PAYMENTS" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span>Payments Out</span>
                <span className="px-1.5 py-0.2 bg-rose-500 text-white text-[10px] rounded-full">
                  {disbursedPayments.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab("REJECTED")}
                className={`px-3 py-2 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === "REJECTED" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span>Declined Payments</span>
                <span className={`px-1.5 py-0.2 text-[10px] rounded-full ${
                  rejectedPayments.length > 0 ? "bg-rose-600 text-white font-bold" : "bg-slate-200 text-slate-700"
                }`}>
                  {rejectedPayments.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab("BILLS")}
                className={`px-3 py-2 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === "BILLS" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span>Bills Recorded</span>
                <span className="px-1.5 py-0.2 bg-slate-200 text-slate-800 text-[10px] rounded-full">
                  {dayData?.bills.length || 0}
                </span>
              </button>
            </>
          )}
          <button
            onClick={() => setActiveTab("ATTENDANCE")}
            className={`px-3 py-2 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "ATTENDANCE" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
            title={`Staff Present: ${dayData?.summary?.staffPresentCount ?? (dayData?.attendance?.filter((a: any) => ["PRESENT", "HALF_DAY", "OVERTIME", "CORRECTED"].includes(a.status)).length || dayData?.attendance?.length || 0)} staff checked in`}
          >
            <span>Staff Present</span>
            <span className="px-1.5 py-0.2 bg-emerald-600 text-white text-[10px] font-bold rounded-full">
              {dayData?.summary?.staffPresentCount ?? (dayData?.attendance?.filter((a: any) => ["PRESENT", "HALF_DAY", "OVERTIME", "CORRECTED"].includes(a.status)).length || dayData?.attendance?.length || 0)}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("REPORTS")}
            className={`px-3 py-2 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "REPORTS" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span>Site Reports (DSR)</span>
            <span className="px-1.5 py-0.2 bg-blue-600 text-white text-[10px] rounded-full">
              {dayData?.dailyReports.length || 0}
            </span>
          </button>
        </div>

        {/* Content Section */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
            <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <span className="text-xs font-semibold">Loading Day Book records for {formatDate(selectedDate)}...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 0. Money in from buyers (Sales receipts) */}
            {canReadFinance && activeTab === "ALL" && (dayData?.moneyIn?.length || 0) > 0 && (
              <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden shadow-xs">
                <div className="p-4 bg-emerald-50/60 border-b border-emerald-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-black text-slate-900">Money in from customers</h3>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <ShowEntriesControl
                      pageSize={moneyInPagination.pageSize}
                      onPageSizeChange={moneyInPagination.setPageSize}
                    />
                    <span
                      className="text-xs font-bold text-emerald-700 tabular-nums whitespace-nowrap"
                      title={formatCurrency(dayData?.summary.totalMoneyInAmount || 0)}
                    >
                      {formatCompactINR(dayData?.summary.totalMoneyInAmount || 0)}
                    </span>
                  </div>
                </div>
                {/* Desktop Table View (≥ lg screens) */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-4 py-2 text-left">Receipt</th>
                        <th className="px-4 py-2 text-left">Customer</th>
                        <th className="px-4 py-2 text-left">For</th>
                        <th className="px-4 py-2 text-left">Mode</th>
                        <th className="px-4 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moneyInPagination.paginatedData.map((r: any) => (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="px-4 py-2">
                            <Link href={`/sales/receipt/${r.id}`} className="font-mono text-xs font-bold text-slate-900 hover:underline">
                              {r.receiptNumber}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-slate-800">
                            {r.booking.customerName}
                            <div className="text-xs text-slate-500">
                              {r.booking.unit.unitNumber} · {r.booking.unit.project.name}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-slate-600">{r.installment.label}</td>
                          <td className="px-4 py-2 text-slate-600">
                            {({ NEFT_RTGS: "NEFT / RTGS", HOME_LOAN: "Home loan", UPI: "UPI", CHEQUE: "Cheque", CASH: "Cash" } as Record<string, string>)[r.mode] || r.mode}
                            {r.reference ? <div className="text-xs text-slate-400">{r.reference}</div> : null}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums text-emerald-700">
                            {formatCurrency(r.amount)}
                            {r.gstAmount > 0 && <div className="text-[11px] font-normal text-slate-400">incl. GST {formatCurrency(r.gstAmount)}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile & Tablet Card View (< lg screens: No horizontal scroll) */}
                <div className="lg:hidden p-3 bg-slate-50/60 space-y-3">
                  {moneyInPagination.paginatedData.map((r: any) => (
                    <div key={`m-in-card-${r.id}`} className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 text-sm">
                            {r.booking.customerName}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {r.booking.unit.unitNumber} · {r.booking.unit.project.name}
                          </div>
                        </div>
                        <div className="text-right shrink-0 min-w-0">
                          <div className="font-display text-base font-extrabold text-emerald-700 tabular-nums truncate" title={formatCurrency(r.amount)}>
                            {formatCompactINR(r.amount)}
                          </div>
                          <span className="inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {({ NEFT_RTGS: "NEFT / RTGS", HOME_LOAN: "Home loan", UPI: "UPI", CHEQUE: "Cheque", CASH: "Cash" } as Record<string, string>)[r.mode] || r.mode}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-mono">
                        <Link href={`/sales/receipt/${r.id}`} className="font-bold text-slate-700 hover:text-amber-600 hover:underline">
                          Receipt #{r.receiptNumber}
                        </Link>
                        <span>{r.installment.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <TablePagination
                  currentPage={moneyInPagination.currentPage}
                  totalPages={moneyInPagination.totalPages}
                  totalItems={moneyInPagination.filteredCount}
                  totalUnfiltered={moneyInPagination.totalRecords}
                  pageSize={moneyInPagination.pageSize}
                  startItem={moneyInPagination.startItem}
                  endItem={moneyInPagination.endItem}
                  onPageChange={moneyInPagination.setCurrentPage}
                  itemLabel="receipts"
                />
              </div>
            )}

            {/* 1. Payments Table (Disbursed Only) */}
            {canReadFinance && (activeTab === "ALL" || activeTab === "PAYMENTS") && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-3.5 sm:p-4 bg-slate-50/60 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <ArrowUpRight className="w-4 h-4 text-rose-500 shrink-0" />
                      <h3 className="text-sm font-black text-slate-900 whitespace-nowrap">Payments &amp; Cash Out</h3>
                    </div>
                    <span
                      className="sm:hidden text-xs font-bold text-rose-600 font-mono tabular-nums whitespace-nowrap"
                      title={dayData ? formatCurrency(disbursedTotal) : "₹0.00"}
                    >
                      {dayData ? formatCompactINR(disbursedTotal) : "₹0"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <span
                      className="hidden sm:inline text-xs font-bold text-rose-600 font-mono tabular-nums whitespace-nowrap"
                      title={dayData ? formatCurrency(disbursedTotal) : "₹0.00"}
                    >
                      {dayData ? formatCompactINR(disbursedTotal) : "₹0"}
                    </span>
                    <button
                      onClick={() => openPrintModalForSection("payments")}
                      className="hidden sm:inline-flex p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Print Approved Payments only"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    <Link
                      href="/expenses"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 sm:py-1 bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-bold whitespace-nowrap transition"
                      title="Supervisors can log personal site expenses with mandatory receipt photos"
                    >
                      <Receipt className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="sm:hidden">Expense</span>
                      <span className="hidden sm:inline">Cash Expense</span>
                    </Link>
                    {canWriteFinance && (
                      <button
                        onClick={() => {
                          setModalMode("PAYMENT");
                          setShowLogModal(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 sm:py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-xs font-bold whitespace-nowrap transition"
                      >
                        <PlusCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Add Payment</span>
                      </button>
                    )}
                  </div>
                </div>

                {disbursedPayments.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50/40 flex flex-col items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 mb-2">
                      <ArrowUpRight className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">No payments recorded on this date.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 mb-3">Record contractor advances, petty cash expenses, and vendor payments directly into Day Book.</p>
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                      <Link
                        href="/expenses"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-xl transition shadow-xs"
                      >
                        <Receipt className="w-4 h-4" />
                        <span>Cash Expense</span>
                      </Link>
                      {canWriteFinance && (
                        <button
                          onClick={() => {
                            setModalMode("PAYMENT");
                            setShowLogModal(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition shadow-xs"
                        >
                          <PlusCircle className="w-4 h-4" />
                          <span>Record Payment</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <ExcelTable
                    data={disbursedPayments}
                    columns={paymentColumns}
                    tableName="Payments Out"
                    showGlobalSearch={true}
                    showExport={true}
                    showToolbar={true}
                  />
                )}
              </div>
            )}

            {/* 1B. Rejected Payments Table */}
            {canReadFinance && (activeTab === "REJECTED" || (activeTab === "ALL" && rejectedPayments.length > 0)) && (
              <div className="bg-white rounded-2xl border border-rose-200 overflow-hidden shadow-xs">
                <div className="p-3.5 sm:p-4 bg-rose-50/60 border-b border-rose-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <h3 className="text-sm font-black text-slate-900">Declined Payments & Claims</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 whitespace-nowrap">
                      {rejectedPayments.length} Declined
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="text-xs font-bold text-rose-600 font-mono tabular-nums whitespace-nowrap"
                      title={formatCurrency(rejectedTotal)}
                    >
                      Total Declined: {formatCompactINR(rejectedTotal)}
                    </span>
                    <button
                      onClick={() => openPrintModalForSection("rejected")}
                      className="hidden sm:inline-flex p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Print Declined Claims only"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {rejectedPayments.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50/40 flex flex-col items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 mb-2">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">No declined payments on this date.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">All submitted payments were approved.</p>
                  </div>
                ) : (
                  <ExcelTable
                    data={rejectedPayments}
                    columns={rejectedPaymentColumns}
                    tableName="Declined Payments"
                    showGlobalSearch={true}
                    showExport={true}
                    showToolbar={true}
                  />
                )}
              </div>
            )}

            {/* 2. Bills Table */}
            {canReadFinance && (activeTab === "ALL" || activeTab === "BILLS") && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-3.5 sm:p-4 bg-slate-50/60 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                      <h3 className="text-sm font-black text-slate-900 truncate">
                        <span className="sm:hidden">Bills Logged</span>
                        <span className="hidden sm:inline">Vendor &amp; Contractor Bills Logged</span>
                      </h3>
                    </div>
                    <span
                      className="sm:hidden text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap"
                      title={dayData ? formatCurrency(dayData.summary.totalBillsAmount) : "₹0.00"}
                    >
                      {dayData ? formatCompactINR(dayData.summary.totalBillsAmount) : "₹0"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span
                      className="hidden sm:inline text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap"
                      title={dayData ? formatCurrency(dayData.summary.totalBillsAmount) : "₹0.00"}
                    >
                      {dayData ? formatCompactINR(dayData.summary.totalBillsAmount) : "₹0"}
                    </span>
                    <button
                      onClick={() => openPrintModalForSection("bills")}
                      className="hidden sm:inline-flex p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                      title="Print Vendor Bills only"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    {canWriteFinance && (
                      <button
                        onClick={() => {
                          setModalMode("BILL");
                          setShowLogModal(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 sm:py-1 bg-amber-50 text-amber-800 hover:bg-amber-100 rounded-lg text-xs font-bold whitespace-nowrap transition"
                      >
                        <PlusCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Add Bill</span>
                      </button>
                    )}
                  </div>
                </div>

                {dayData?.bills.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50/40 flex flex-col items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 mb-2">
                      <FileText className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">No bills entered on this date.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 mb-3">Track invoices and bills incurred today from material suppliers and contractors.</p>
                    {canWriteFinance && (
                      <button
                        onClick={() => {
                          setModalMode("BILL");
                          setShowLogModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition shadow-xs"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>Record Bill</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <ExcelTable
                    data={dayData?.bills || []}
                    columns={billColumns}
                    tableName="Bills"
                    showGlobalSearch={true}
                    showExport={true}
                    showToolbar={true}
                  />
                )}
              </div>
            )}

            {/* 3. Staff Present (Staff Attendance Sessions) */}
            {(activeTab === "ALL" || activeTab === "ATTENDANCE") && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-3.5 sm:p-4 bg-slate-50/60 border-b border-slate-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <h3 className="text-sm font-black text-slate-900 truncate">Staff Present</h3>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-bold text-emerald-700 whitespace-nowrap">
                      {dayData?.summary?.staffPresentCount ?? (dayData?.attendance?.filter((a: any) => ["PRESENT", "HALF_DAY", "OVERTIME", "CORRECTED"].includes(a.status)).length || dayData?.attendance?.length || 0)} Present
                    </span>
                    <button
                      onClick={() => openPrintModalForSection("attendance")}
                      className="hidden sm:inline-flex p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                      title="Print Staff Attendance only"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {(!dayData?.attendance || dayData.attendance.length === 0) ? (
                  <div className="p-8 text-center bg-slate-50/40 flex flex-col items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 mb-2">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">No staff attendance logged for this date.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Staff check-ins recorded via attendance banner or mobile check-in will appear here.</p>
                  </div>
                ) : (
                  <div>
                    <div className="p-3 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                        Staff Attendance Sessions ({dayData.attendance.length})
                      </span>
                      <ShowEntriesControl
                        pageSize={staffAttPagination.pageSize}
                        onPageSizeChange={staffAttPagination.setPageSize}
                      />
                    </div>
                    <div className="hidden lg:block overflow-x-auto min-h-[400px]">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                          <tr>
                            <th className="p-3">Emp Code</th>
                            <th className="p-3">Staff Name</th>
                            <th className="p-3">Role / Designation</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {staffAttPagination.paginatedData.map((a) => (
                            <tr key={a.id} className="hover:bg-slate-50/70 transition">
                              <td className="p-3 font-mono font-bold text-slate-800">
                                {a.employeeCode || a.workforceMember?.employeeCode || "—"}
                              </td>
                              <td className="p-3 font-bold text-slate-900">{a.name || a.workforceMember?.name || "N/A"}</td>
                              <td className="p-3 text-slate-600 font-medium">{a.role || a.workforceMember?.workerType || "Staff"}</td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  {a.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile & Tablet Card List */}
                    <div className="lg:hidden p-3 bg-slate-50/60 space-y-2.5">
                      {staffAttPagination.paginatedData.map((a) => (
                        <div key={`staff-att-card-${a.id}`} className="p-3.5 bg-white rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-bold text-slate-900 text-xs">{a.name || a.workforceMember?.name || "N/A"}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {a.role || a.workforceMember?.workerType || "Staff"} · <span className="font-mono">{a.employeeCode || a.workforceMember?.employeeCode || "—"}</span>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 shrink-0">
                            {a.status}
                          </span>
                        </div>
                      ))}
                    </div>
                    <TablePagination
                      currentPage={staffAttPagination.currentPage}
                      totalPages={staffAttPagination.totalPages}
                      totalItems={staffAttPagination.filteredCount}
                      totalUnfiltered={staffAttPagination.totalRecords}
                      pageSize={staffAttPagination.pageSize}
                      startItem={staffAttPagination.startItem}
                      endItem={staffAttPagination.endItem}
                      onPageChange={staffAttPagination.setCurrentPage}
                      itemLabel="staff"
                    />
                  </div>
                )}
              </div>
            )}

            {/* 3b. Site Workers & Contractor Labour (Trade workers & contractor deployment) */}
            {(activeTab === "ALL" || activeTab === "ATTENDANCE") && ((dayData?.workerAttendance?.length || 0) > 0 || (dayData?.headcount?.length || 0) > 0) && (
              <div className="bg-white rounded-2xl border border-amber-200/80 overflow-hidden shadow-xs">
                <div className="p-3.5 sm:p-4 bg-amber-50/50 border-b border-amber-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Users className="w-4 h-4 text-amber-600 shrink-0" />
                    <div className="min-w-0">
                      <h3 className="text-sm font-black text-slate-900">Site Workers & Contractor Labour</h3>
                      <p className="hidden sm:block text-[11px] text-slate-500">Daily trade workers (Masons, Carpenters, Helpers, Electricians) & contractor headcount</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-amber-700 bg-amber-100/70 px-2.5 py-1 rounded-lg whitespace-nowrap">
                      {dayData?.summary?.workersPresentCount || 0} Total Workers
                    </span>
                  </div>
                </div>

                {/* Sub-section 1: Trade Workers Attendance Sessions */}
                {(dayData?.workerAttendance?.length || 0) > 0 && (
                  <div className="border-b border-slate-100">
                    <div className="p-3 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                        <HardHat className="w-3.5 h-3.5 text-amber-600" />
                        <span>Daily Trade Workers ({dayData?.workerAttendance?.length || 0})</span>
                      </span>
                      <ShowEntriesControl
                        pageSize={workerAttPagination.pageSize}
                        onPageSizeChange={workerAttPagination.setPageSize}
                      />
                    </div>
                    <div className="hidden lg:block overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                          <tr>
                            <th className="p-3">Worker Code</th>
                            <th className="p-3">Worker Name</th>
                            <th className="p-3">Trade / Skill</th>
                            <th className="p-3">Site / Project</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {workerAttPagination.paginatedData.map((w: any) => (
                            <tr key={w.id} className="hover:bg-slate-50/70 transition">
                              <td className="p-3 font-mono font-bold text-slate-800">
                                {w.workforceMember?.employeeCode || "—"}
                              </td>
                              <td className="p-3 font-bold text-slate-900">{w.workforceMember?.name || "Worker"}</td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900">
                                  {w.workforceMember?.workerType || "Labour"}
                                </span>
                              </td>
                              <td className="p-3 text-slate-600">{w.site?.name || w.project?.name || "Operational Site"}</td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  {w.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile & Tablet Trade Workers Card List */}
                    <div className="lg:hidden p-3 bg-slate-50/60 space-y-2.5">
                      {workerAttPagination.paginatedData.map((w: any) => (
                        <div key={`w-att-card-${w.id}`} className="p-3.5 bg-white rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 text-xs truncate">{w.workforceMember?.name || "Worker"}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-900">
                                {w.workforceMember?.workerType || "Labour"}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400">{w.workforceMember?.employeeCode || "—"}</span>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 shrink-0">
                            {w.status}
                          </span>
                        </div>
                      ))}
                    </div>
                    <TablePagination
                      currentPage={workerAttPagination.currentPage}
                      totalPages={workerAttPagination.totalPages}
                      totalItems={workerAttPagination.filteredCount}
                      totalUnfiltered={workerAttPagination.totalRecords}
                      pageSize={workerAttPagination.pageSize}
                      startItem={workerAttPagination.startItem}
                      endItem={workerAttPagination.endItem}
                      onPageChange={workerAttPagination.setCurrentPage}
                      itemLabel="workers"
                    />
                  </div>
                )}

                {/* Sub-section 2: Contractor Labour Headcount */}
                {(dayData?.headcount?.length || 0) > 0 && (
                  <div className="p-3 space-y-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      <span>Contractor Deployment Headcounts ({dayData?.headcount?.length || 0})</span>
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(dayData?.headcount || []).map((h: any, idx: number) => (
                        <div key={h.id || idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-bold text-xs text-slate-900">{h.contractorName || h.siteName || "Contractor"}</span>
                            <span className="text-xs font-black text-amber-700">{h.grandTotal} Workers</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                            <span className="px-1.5 py-0.5 bg-white rounded border border-slate-200">Artisans: {h.artisanCount ?? 0}</span>
                            <span className="px-1.5 py-0.5 bg-white rounded border border-slate-200">Craftsmen: {h.craftsmanCount ?? 0}</span>
                            <span className="px-1.5 py-0.5 bg-white rounded border border-slate-200">Labourers: {(h.laborerMale || 0) + (h.laborerFemale || 0)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. Daily Site Progress Reports (DSR) */}
            {(activeTab === "ALL" || activeTab === "REPORTS") && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-3.5 sm:p-4 bg-slate-50/60 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Layers className="w-4 h-4 text-blue-500 shrink-0" />
                      <h3 className="text-sm font-black text-slate-900 truncate">
                        <span className="sm:hidden">Site Reports (DSR)</span>
                        <span className="hidden sm:inline">Daily Site Reports (DSR)</span>
                      </h3>
                    </div>
                    <span className="sm:hidden text-xs font-bold text-blue-700 whitespace-nowrap shrink-0">
                      {dayData?.dailyReports.length || 0} Reports
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="hidden sm:inline text-xs font-bold text-blue-700 whitespace-nowrap">
                      {dayData?.dailyReports.length || 0} Reports
                    </span>
                    <button
                      onClick={() => openPrintModalForSection("reports")}
                      className="hidden sm:inline-flex p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title="Print Daily Site Reports only"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    {canWriteDsr && (
                      <button
                        onClick={() => {
                          setModalMode("DSR");
                          setShowLogModal(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 sm:py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold whitespace-nowrap transition"
                      >
                        <PlusCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Add DSR</span>
                      </button>
                    )}
                  </div>
                </div>

                {dayData?.dailyReports.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50/40 flex flex-col items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 mb-2">
                      <Layers className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">No daily site reports logged for this date.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 mb-3">Record work completed, any site delays, and safety notes.</p>
                    {canWriteDsr && (
                      <button
                        onClick={() => {
                          setModalMode("DSR");
                          setShowLogModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-xs"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>Submit Daily Site Report</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 p-4 space-y-4">
                    {dayData?.dailyReports.map((r) => (
                      <div key={r.id} className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-900">
                            {r.project?.name || "Site Progress Log"}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-500">
                            Reported by {r.creator?.name || "Site Supervisor"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 font-medium leading-relaxed">
                          {r.progress}
                        </p>
                        {r.blockers && (
                          <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px] font-medium flex items-center gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span><strong>Delays / Issues:</strong> {r.blockers}</span>
                          </div>
                        )}
                        {r.safetyNotes && (
                          <div className="text-[11px] text-slate-500 font-medium">
                            <strong>Safety Notes:</strong> {r.safetyNotes}
                          </div>
                        )}
                        {r.attachments && r.attachments.length > 0 && (
                          <div className="pt-2 border-t border-slate-200/70">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                              <Camera className="w-3 h-3 text-blue-600" />
                              Attached Photos ({r.attachments.length})
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {r.attachments.map((att: any) => (
                                <button
                                  key={att.id}
                                  type="button"
                                  onClick={() => setActivePhotoLightbox(att.url)}
                                  className="relative w-16 h-12 rounded-lg overflow-hidden border border-slate-300 hover:opacity-90 transition group shadow-2xs cursor-pointer"
                                  title={att.fileName || "View site photo"}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={att.url}
                                    alt={att.fileName || "Site photo"}
                                    className="w-full h-full object-cover group-hover:scale-105 transition"
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Modal: Log Day Entry (Multi-category) */}
        {showLogModal && canLogDayEntry && (
          <div
            className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) handleCloseLogModal();
            }}
          >
            <div
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden max-h-[90dvh] flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-labelledby="daybook-modal-title"
            >
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-amber-400" />
                  <span id="daybook-modal-title" className="font-bold text-sm">Add Entry to Day Book ({formatDate(selectedDate)})</span>
                </div>
                <button
                  type="button"
                  onClick={handleCloseLogModal}
                  className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-slate-800"
                  aria-label="Close Day Book entry modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mode switch tabs */}
              <div className="p-2 bg-slate-100 flex gap-1 border-b border-slate-200 overflow-x-auto shrink-0" role="tablist">
                {canWriteFinance && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={modalMode === "PAYMENT"}
                    onClick={() => setModalMode("PAYMENT")}
                    className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
                      modalMode === "PAYMENT"
                        ? "bg-amber-500 text-slate-950 shadow-xs"
                        : "bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Payment Out
                  </button>
                )}
                {canWriteFinance && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={modalMode === "BILL"}
                    onClick={() => setModalMode("BILL")}
                    className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
                      modalMode === "BILL"
                        ? "bg-amber-500 text-slate-950 shadow-xs"
                        : "bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Enter Bill
                  </button>
                )}
                {canWriteAttendance && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={modalMode === "WORKFORCE"}
                    onClick={() => {
                      if (selectedSiteId) setWfSiteId(selectedSiteId);
                      setModalMode("WORKFORCE");
                    }}
                    className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
                      modalMode === "WORKFORCE"
                        ? "bg-amber-500 text-slate-950 shadow-xs"
                        : "bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Worker Count
                  </button>
                )}
                {canWriteDsr && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={modalMode === "DSR"}
                    onClick={() => setModalMode("DSR")}
                    className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
                      modalMode === "DSR"
                        ? "bg-amber-500 text-slate-950 shadow-xs"
                        : "bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Site DSR
                  </button>
                )}
              </div>

              <div className="overflow-y-auto p-5">
                {fileValidationError && (
                  <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center justify-between gap-2">
                    <span>{fileValidationError}</span>
                    <button
                      type="button"
                      onClick={() => setFileValidationError(null)}
                      className="text-rose-600 hover:text-rose-800 p-0.5 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {/* Modal Explanatory Guidance Banner */}
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-slate-800 flex items-start gap-2.5 shadow-2xs">
                  <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="font-bold text-slate-900 flex items-center justify-between flex-wrap gap-1">
                      <span>{modalModeGuidance[modalMode].title}</span>
                      <span className="text-[10px] font-semibold text-amber-900 bg-amber-200/70 px-2 py-0.5 rounded-full">
                        {modalModeGuidance[modalMode].tag}
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      {modalModeGuidance[modalMode].description}
                    </p>
                    <div className="text-[10px] text-slate-500 pt-1 border-t border-amber-200/60 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span><strong className="text-slate-700">Required:</strong> {modalModeGuidance[modalMode].requiredFields}</span>
                      <span><strong className="text-slate-700">Effect:</strong> {modalModeGuidance[modalMode].expectedAction}</span>
                    </div>
                  </div>
                </div>

                {/* Form 1: Payment */}
                {modalMode === "PAYMENT" && canWriteFinance && (
                  <form onSubmit={handleCreateQuickPayment} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Recipient / Party *
                        </label>
                        <select
                          value={paymentPartyId}
                          onChange={(e) => setPaymentPartyId(e.target.value)}
                          required
                          className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                        >
                          {parties.length === 0 ? (
                            <option value="">No vendors yet (add one under Vendors & Contractors)</option>
                          ) : (
                            parties.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.partyType || p.type || "Vendor"})
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Project (Optional)
                        </label>
                        <SearchableSelect
                          options={[
                            { value: "", label: "General / Head Office" },
                            ...projects.map((pr) => ({
                              value: pr.id,
                              label: pr.name,
                              badge: pr.code || undefined,
                            })),
                          ]}
                          value={paymentProjectId}
                          onChange={setPaymentProjectId}
                          placeholder="General / Head Office"
                          searchPlaceholder="Search project name or code..."
                        />
                      </div>
                    </div>

                    {/* Bill Selection / Allocation */}
                    {paymentPartyId && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold text-slate-700">
                            Allocate to Bill (Optional)
                          </label>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {pendingPartyBills.length} unpaid bill(s) available
                          </span>
                        </div>
                        <select
                          value={selectedPaymentBillId}
                          onChange={(e) => {
                            const bId = e.target.value;
                            setSelectedPaymentBillId(bId);
                            if (bId) {
                              const b = pendingPartyBills.find((pb) => pb.id === bId);
                              if (b) {
                                const pendingRupees = (b.outstandingAmount ?? b.totalAmount) / 100;
                                if (!paymentAmount || Number(paymentAmount) > pendingRupees) {
                                  setPaymentAmount(String(pendingRupees));
                                }
                              }
                            }
                          }}
                          className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                        >
                          <option value="">Advance / General Expense (Not linked to a bill)</option>
                          {pendingPartyBills.map((b) => (
                            <option key={b.id} value={b.id}>
                              Bill #{formatShortBillNumber(b.billNumber)} — Pending: {formatCurrency(b.outstandingAmount ?? b.totalAmount)}
                            </option>
                          ))}
                        </select>
                        {selectedPaymentBillId && (
                          <p className="text-[11px] text-emerald-600 mt-1 font-medium">
                            ✓ Payment will be allocated to Bill #{pendingPartyBills.find((b) => b.id === selectedPaymentBillId)?.billNumber} and deduct its balance.
                          </p>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Amount (₹ Rupees) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="e.g. 5000"
                        className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Payment Mode
                        </label>
                        <select
                          value={paymentMethod}
                          onChange={(e: any) => setPaymentMethod(e.target.value)}
                          className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                        >
                          <option value="CASH">Cash</option>
                          <option value="BANK_TRANSFER">Bank Transfer</option>
                          <option value="UPI">UPI</option>
                          <option value="CHEQUE">Cheque</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Reference / Receipt No. *
                        </label>
                        <input
                          type="text"
                          required
                          value={paymentRef}
                          onChange={(e) => setPaymentRef(e.target.value)}
                          placeholder="e.g. VCH-001 / UTR-991823"
                          className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Notes / Purpose
                      </label>
                      <input
                        type="text"
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        placeholder="e.g. Site petty cash / transport charges"
                        className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {/* Payment Receipt / Voucher Upload */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Camera className="w-4 h-4 text-amber-600" />
                          <span>Payment Receipt / Voucher (Optional)</span>
                        </label>
                        {paymentPhotos.length > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            {paymentPhotos.length} {paymentPhotos.length === 1 ? "file" : "files"} selected
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="relative flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 hover:bg-amber-100/70 cursor-pointer transition text-center group">
                          <Camera className="w-4 h-4 text-amber-600 group-hover:scale-110 transition" />
                          <span className="text-xs font-bold text-amber-900">Click Photo</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handlePaymentPhotoSelect}
                            className="sr-only"
                          />
                        </label>

                        <label className="relative flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 cursor-pointer transition text-center group">
                          <UploadCloud className="w-4 h-4 text-slate-600 group-hover:scale-110 transition" />
                          <span className="text-xs font-bold text-slate-700">Choose Receipt / PDF</span>
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            multiple
                            onChange={handlePaymentPhotoSelect}
                            className="sr-only"
                          />
                        </label>
                      </div>

                      {paymentPhotoPreviews.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 pt-1">
                          {paymentPhotoPreviews.map((preview, index) => (
                            <div
                              key={preview.id}
                              className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-900 shadow-2xs"
                            >
                              {preview.url.startsWith("blob:") && !preview.name.toLowerCase().endsWith(".pdf") ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={preview.url}
                                  alt={preview.name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition"
                                />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-white p-2 bg-slate-800">
                                  <FileText className="w-6 h-6 text-amber-400" />
                                  <span className="text-[10px] truncate max-w-full text-slate-300 mt-1">{preview.name}</span>
                                </div>
                              )}
                              <div className="absolute inset-0 bg-slate-950/40 lg:bg-slate-950/50 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setActivePhotoLightbox(preview.url)}
                                  title="View preview"
                                  className="p-1.5 rounded-full bg-white/90 hover:bg-white text-slate-900 transition"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemovePaymentPhoto(index)}
                                  title="Remove image"
                                  className="p-1 rounded-full bg-rose-500 hover:bg-rose-600 text-white transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowLogModal(false)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={actionLoading}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm"
                      >
                        {actionLoading ? "Saving..." : "Save Payment"}
                      </button>
                    </div>
                  </form>
                )}

                {/* Form 2: Bill */}
                {modalMode === "BILL" && canWriteFinance && (
                  <form onSubmit={handleCreateQuickBill} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Vendor / Contractor *
                        </label>
                        <select
                          value={billPartyId}
                          onChange={(e) => setBillPartyId(e.target.value)}
                          required
                          className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                        >
                          {parties.length === 0 ? (
                            <option value="">No vendors yet (add one under Vendors & Contractors)</option>
                          ) : (
                            parties.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.partyType || p.type || "Vendor"})
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Project (Optional)
                        </label>
                        <SearchableSelect
                          options={[
                            { value: "", label: "General Project" },
                            ...projects.map((pr) => ({
                              value: pr.id,
                              label: pr.name,
                              badge: pr.code || undefined,
                            })),
                          ]}
                          value={billProjectId}
                          onChange={setBillProjectId}
                          placeholder="General Project"
                          searchPlaceholder="Search project name or code..."
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Bill / Invoice Number
                        </label>
                        <input
                          type="text"
                          value={billNumber}
                          onChange={(e) => setBillNumber(e.target.value)}
                          placeholder="e.g. INV-2026-001"
                          className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Total Amount (₹) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={billAmount}
                          onChange={(e) => setBillAmount(e.target.value)}
                          placeholder="e.g. 25000"
                          className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Bill Description / Notes
                      </label>
                      <input
                        type="text"
                        value={billNotes}
                        onChange={(e) => setBillNotes(e.target.value)}
                        placeholder="e.g. Supply of 100 bags cement or shuttering labor charge"
                        className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {/* Bill / Invoice Image or Document Upload */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Camera className="w-4 h-4 text-amber-600" />
                          <span>Bill / Invoice Photo or Document (Optional)</span>
                        </label>
                        {billPhotos.length > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            {billPhotos.length} {billPhotos.length === 1 ? "file" : "files"} selected
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {/* Option 1: Live Camera Capture */}
                        <label className="relative flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 hover:bg-amber-100/70 cursor-pointer transition text-center group">
                          <Camera className="w-4 h-4 text-amber-600 group-hover:scale-110 transition" />
                          <span className="text-xs font-bold text-amber-900">Click Photo</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleBillPhotoSelect}
                            className="sr-only"
                          />
                        </label>

                        {/* Option 2: Choose / Upload Files or PDF */}
                        <label className="relative flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 cursor-pointer transition text-center group">
                          <UploadCloud className="w-4 h-4 text-slate-600 group-hover:scale-110 transition" />
                          <span className="text-xs font-bold text-slate-700">Choose Files / PDF</span>
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            multiple
                            onChange={handleBillPhotoSelect}
                            className="sr-only"
                          />
                        </label>
                      </div>

                      {/* Photo / Document Previews */}
                      {billPhotoPreviews.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 pt-1">
                          {billPhotoPreviews.map((preview, index) => (
                            <div
                              key={preview.id}
                              className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-900 shadow-2xs"
                            >
                              {preview.url.startsWith("blob:") && !preview.name.toLowerCase().endsWith(".pdf") ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={preview.url}
                                  alt={preview.name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition"
                                />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-white p-2 bg-slate-800">
                                  <FileText className="w-6 h-6 text-amber-400" />
                                  <span className="text-[10px] truncate max-w-full text-slate-300 mt-1">{preview.name}</span>
                                </div>
                              )}
                              <div className="absolute inset-0 bg-slate-950/40 lg:bg-slate-950/50 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setActivePhotoLightbox(preview.url)}
                                  title="View preview"
                                  className="p-1.5 rounded-full bg-white/90 hover:bg-white text-slate-900 transition"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBillPhoto(index)}
                                  title="Remove image"
                                  className="p-1 rounded-full bg-rose-500 hover:bg-rose-600 text-white transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowLogModal(false)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={actionLoading}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm"
                      >
                        {actionLoading ? "Saving..." : "Save Bill"}
                      </button>
                    </div>
                  </form>
                )}

                {/* Form 3: Workforce Headcount */}
                {modalMode === "WORKFORCE" && canWriteAttendance && (
                  <form onSubmit={handleCreateQuickWorkforce} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Operational Site *
                        </label>
                        <select
                          value={wfSiteId}
                          onChange={(e) => setWfSiteId(e.target.value)}
                          required
                          className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                        >
                          {sites.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Shift
                        </label>
                        <select
                          value={wfShift}
                          onChange={(e: any) => setWfShift(e.target.value)}
                          className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                        >
                          <option value="GENERAL">General Shift</option>
                          <option value="DAY">Day Shift</option>
                          <option value="NIGHT">Night Shift</option>
                        </select>
                      </div>
                    </div>

                    {/* Trade Breakdowns */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block">
                        Worker Count Breakdown
                      </span>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Artisans (Masons, Carpenters)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={wfArtisans}
                            onChange={(e) => setWfArtisans(e.target.value)}
                            className="w-full text-xs font-semibold px-3 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-amber-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Craftsmen (Electrician, Plumber)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={wfCraftsmen}
                            onChange={(e) => setWfCraftsmen(e.target.value)}
                            className="w-full text-xs font-semibold px-3 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Laborers (Male)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={wfLaborerMale}
                            onChange={(e) => setWfLaborerMale(e.target.value)}
                            className="w-full text-xs font-semibold px-3 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-amber-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Laborers (Female)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={wfLaborerFemale}
                            onChange={(e) => setWfLaborerFemale(e.target.value)}
                            className="w-full text-xs font-semibold px-3 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                        <span className="font-bold text-slate-600">Total Workers:</span>
                        <span className="font-black text-emerald-700 text-sm">
                          {(Number(wfArtisans) || 0) +
                            (Number(wfCraftsmen) || 0) +
                            (Number(wfLaborerMale) || 0) +
                            (Number(wfLaborerFemale) || 0)}{" "}
                          Workers
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Contractor / Sub-contractor
                        </label>
                        <input
                          type="text"
                          value={wfContractor}
                          onChange={(e) => setWfContractor(e.target.value)}
                          placeholder="e.g. Sharma Gang"
                          className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Site Notes / Remarks
                        </label>
                        <input
                          type="text"
                          value={wfNotes}
                          onChange={(e) => setWfNotes(e.target.value)}
                          placeholder="e.g. 2nd floor slab casting"
                          className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowLogModal(false)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={actionLoading}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm"
                      >
                        {actionLoading ? "Saving..." : "Save Worker Count"}
                      </button>
                    </div>
                  </form>
                )}

                {/* Form 4: DSR */}
                {modalMode === "DSR" && canWriteDsr && (
                  <form onSubmit={handleCreateQuickDsr} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Project *
                      </label>
                      <SearchableSelect
                        required
                        options={projects.map((p) => ({
                          value: p.id,
                          label: p.name,
                          badge: p.code || undefined,
                        }))}
                        value={dsrProjectId}
                        onChange={setDsrProjectId}
                        placeholder="Select Project..."
                        searchPlaceholder="Search project name or code..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Work Completed Today *
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={dsrProgress}
                        onChange={(e) => setDsrProgress(e.target.value)}
                        placeholder="e.g. Poured 40 cubic meters of concrete on 3rd floor slab."
                        className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Delays / Issues (Optional)
                      </label>
                      <input
                        type="text"
                        value={dsrBlockers}
                        onChange={(e) => setDsrBlockers(e.target.value)}
                        placeholder="e.g. Rain halted exterior plastering for 2 hours"
                        className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Safety & Site Observations
                      </label>
                      <input
                        type="text"
                        value={dsrSafety}
                        onChange={(e) => setDsrSafety(e.target.value)}
                        placeholder="e.g. All workers wearing helmets and safety boots."
                        className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {/* Site Photos & Visual Evidence */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Camera className="w-4 h-4 text-amber-600" />
                          <span>Site Photos & Evidence (Optional)</span>
                        </label>
                        {dsrPhotos.length > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            {dsrPhotos.length} {dsrPhotos.length === 1 ? "photo" : "photos"} selected
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {/* Option 1: Live Camera Shutter / Mobile Capture */}
                        <label className="relative flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 hover:bg-amber-100/70 cursor-pointer transition text-center group">
                          <Camera className="w-4 h-4 text-amber-600 group-hover:scale-110 transition" />
                          <span className="text-xs font-bold text-amber-900">Click Photo</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handlePhotoSelect}
                            className="sr-only"
                          />
                        </label>

                        {/* Option 2: Choose / Upload from Files */}
                        <label className="relative flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 cursor-pointer transition text-center group">
                          <UploadCloud className="w-4 h-4 text-slate-600 group-hover:scale-110 transition" />
                          <span className="text-xs font-bold text-slate-700">Choose Files</span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handlePhotoSelect}
                            className="sr-only"
                          />
                        </label>
                      </div>

                      {/* Photo Previews Grid */}
                      {dsrPhotoPreviews.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 pt-1">
                          {dsrPhotoPreviews.map((preview, index) => (
                            <div
                              key={preview.id}
                              className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-900 shadow-2xs"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={preview.url}
                                alt={preview.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition"
                              />
                              <div className="absolute inset-0 bg-slate-950/40 lg:bg-slate-950/50 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setActivePhotoLightbox(preview.url)}
                                  title="View full size"
                                  className="p-1.5 rounded-full bg-white/90 hover:bg-white text-slate-900 transition"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemovePhoto(index)}
                                  title="Remove image"
                                  className="p-1 rounded-full bg-rose-600/90 hover:bg-rose-600 text-white transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="absolute bottom-0 inset-x-0 bg-slate-950/75 px-1 py-0.5 text-[9px] text-white truncate font-medium">
                                {preview.name} ({(preview.size / 1024).toFixed(0)} KB)
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <p className="text-[10px] text-slate-400">
                        Accepted: JPEG, PNG, WEBP (Max 10 MB per photo). Attached images will be stored with this DSR.
                      </p>
                    </div>

                    <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={handleCloseLogModal}
                        className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={actionLoading}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm flex items-center gap-1.5"
                      >
                        {actionLoading ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                            <span>
                              {uploadingPhotosCount > 0
                                ? `Uploading ${uploadingPhotosCount} Photo(s)...`
                                : "Saving Report..."}
                            </span>
                          </>
                        ) : (
                          "Save Daily Report"
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal: KPI Short Detail Popups (Payments, Bills, Workforce, DSR) */}
        {kpiPopupType && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setKpiPopupType(null);
            }}
            className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto transition-all"
          >
            {/* 1. PAYMENTS POPUP (DISBURSED ONLY) */}
            {kpiPopupType === "PAYMENTS" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85dvh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
                <div className="p-4 bg-rose-600 text-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-white/10 rounded-lg">
                      <ArrowUpRight className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-black text-base leading-tight">Payments Out — Details</h3>
                      <p className="text-xs text-rose-100">
                        {formatDate(selectedDate)} · {disbursedPayments.length} payment{disbursedPayments.length === 1 ? "" : "s"} paid out
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setKpiPopupType(null)}
                    className="text-rose-100 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
                    title="Close (Esc)"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 bg-rose-50/70 border-b border-rose-100 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Total Paid Out</span>
                    <div className="font-display text-xl sm:text-2xl font-extrabold text-rose-600 tabular-nums tracking-tight truncate" title={formatCurrency(disbursedTotal)}>
                      {formatCompactINR(disbursedTotal)}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      Total cash, UPI, cheque, and bank payments made
                    </p>
                  </div>
                  {canWriteFinance && (
                    <button
                      onClick={() => {
                        setKpiPopupType(null);
                        setModalMode("PAYMENT");
                        setShowLogModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>Record Payment</span>
                    </button>
                  )}
                </div>

                <div className="p-4 overflow-y-auto space-y-3 flex-1">
                  {disbursedPayments.length === 0 ? (
                    <div className="text-center py-10 text-slate-400">
                      <ArrowUpRight className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-600">No payments recorded on this date.</p>
                      <p className="text-[11px] text-slate-400 mt-1">Cash, UPI, and bank transfers recorded today will appear here.</p>
                    </div>
                  ) : (
                    disbursedPayments.map((p: any, idx: number) => (
                      <div
                        key={p.id || idx}
                        className="p-3.5 bg-slate-50 hover:bg-slate-100/70 rounded-xl border border-slate-200/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm text-slate-900">{p.party?.name || "Direct Expense / Recipient"}</span>
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded-md">
                              {p.paymentMethod || "CASH"}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                                p.status === "POSTED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {p.status || "POSTED"}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            {p.project?.name && <span>🏗️ {p.project.name}</span>}
                            {p.referenceNumber && (
                              <span>
                                Ref: <strong className="text-slate-700 font-mono">{p.referenceNumber}</strong>
                              </span>
                            )}
                            {p.payingAccount && <span>A/C: {p.payingAccount}</span>}
                          </div>
                          {p.notes && (
                            <p className="text-xs text-slate-600 italic bg-white/70 p-1.5 rounded border border-slate-100 mt-1">
                              &ldquo;{p.notes}&rdquo;
                            </p>
                          )}
                          {p.attachments && p.attachments.length > 0 && (
                            <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-slate-200/60">
                              <span className="text-[11px] font-bold text-slate-500">📎 Voucher:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {p.attachments.map((att: any, aIdx: number) => (
                                  <button
                                    key={att.id || aIdx}
                                    type="button"
                                    onClick={() => setActivePhotoLightbox(att.url)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-800 rounded-lg text-[10px] font-bold transition border border-rose-200"
                                  >
                                    <ImageIcon className="w-3 h-3 text-rose-600" />
                                    <span>View Voucher {p.attachments.length > 1 ? `#${aIdx + 1}` : ""}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="text-left sm:text-right shrink-0">
                          <div className="text-lg font-black text-rose-600 font-mono">
                            {formatCurrency(p.amount)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
                  <button
                    onClick={() => setKpiPopupType(null)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* 1B. REJECTED PAYMENTS POPUP (SEPARATE MODAL) */}
            {kpiPopupType === "REJECTED_PAYMENTS" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85dvh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
                <div className="p-4 bg-rose-600 text-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-white/10 rounded-lg">
                      <XCircle className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-black text-base leading-tight">Declined Payments — Details</h3>
                      <p className="text-xs text-rose-100">
                        {formatDate(selectedDate)} · {rejectedPayments.length} declined request{rejectedPayments.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setKpiPopupType(null)}
                    className="text-rose-100 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
                    title="Close (Esc)"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 bg-rose-50/70 border-b border-rose-100 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Total Declined Amount</span>
                    <div className="font-display text-xl sm:text-2xl font-extrabold text-rose-600 tabular-nums tracking-tight truncate" title={formatCurrency(rejectedTotal)}>
                      {formatCompactINR(rejectedTotal)}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      Declined requests (excluded from balance & cash outflow)
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-rose-100 text-rose-800 text-xs font-bold rounded-lg border border-rose-200">
                    {rejectedPayments.length} Declined
                  </span>
                </div>

                <div className="p-4 overflow-y-auto space-y-3 flex-1">
                  {rejectedPayments.length === 0 ? (
                    <div className="text-center py-10 text-slate-400">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-700">No declined payments on this date.</p>
                      <p className="text-[11px] text-slate-400 mt-1">All submitted payments were approved.</p>
                    </div>
                  ) : (
                    rejectedPayments.map((p: any, idx: number) => (
                      <div
                        key={p.id || idx}
                        className="p-3.5 bg-rose-50/40 hover:bg-rose-50/70 rounded-xl border border-rose-200 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm text-slate-900">{p.party?.name || "Direct Expense / Recipient"}</span>
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded-md">
                              {p.paymentMethod || "CASH"}
                            </span>
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-100 text-rose-800 border border-rose-200">
                              REJECTED
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            {p.project?.name && <span>🏗️ {p.project.name}</span>}
                            {p.referenceNumber && (
                              <span>
                                Ref: <strong className="text-slate-700 font-mono">{p.referenceNumber}</strong>
                              </span>
                            )}
                            {p.payingAccount && <span>A/C: {p.payingAccount}</span>}
                          </div>
                          {p.notes && (
                            <p className="text-xs text-slate-600 italic bg-white/70 p-1.5 rounded border border-slate-100 mt-1">
                              &ldquo;{p.notes}&rdquo;
                            </p>
                          )}
                          <div className="mt-1.5 p-2 bg-rose-100/70 rounded-lg border border-rose-200 text-xs text-rose-900 flex items-start gap-1.5">
                            <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold">Declined Reason:</span>{" "}
                              <span>{p.rejectionReason || "No specific reason provided."}</span>
                            </div>
                          </div>
                          {p.attachments && p.attachments.length > 0 && (
                            <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-slate-200/60">
                              <span className="text-[11px] font-bold text-slate-500">📎 Voucher:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {p.attachments.map((att: any, aIdx: number) => (
                                  <button
                                    key={att.id || aIdx}
                                    type="button"
                                    onClick={() => setActivePhotoLightbox(att.url)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-800 rounded-lg text-[10px] font-bold transition border border-rose-200"
                                  >
                                    <ImageIcon className="w-3 h-3 text-rose-600" />
                                    <span>View Voucher {p.attachments.length > 1 ? `#${aIdx + 1}` : ""}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="text-left sm:text-right shrink-0">
                          <div className="text-lg font-black font-mono text-rose-600">
                            {formatCurrency(p.amount)}
                          </div>
                          <div className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">
                            Declined
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
                  <button
                    onClick={() => setKpiPopupType(null)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* 2. BILLS POPUP */}
            {kpiPopupType === "BILLS" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85dvh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
                <div className="p-4 bg-amber-600 text-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-white/10 rounded-lg">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-black text-base leading-tight">Bills Recorded — Details</h3>
                      <p className="text-xs text-amber-100">
                        {formatDate(selectedDate)} · {dayData?.bills.length || 0} vendor/contractor bill{(dayData?.bills.length || 0) === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setKpiPopupType(null)}
                    className="text-amber-100 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
                    title="Close (Esc)"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 bg-amber-50/70 border-b border-amber-100 flex items-center justify-between">
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Total Invoices & Bills</span>
                    <div className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight truncate" title={dayData ? formatCurrency(dayData.summary.totalBillsAmount) : "₹0.00"}>
                      {formatCompactINR(dayData ? dayData.summary.totalBillsAmount : 0)}
                    </div>
                  </div>
                  {canWriteFinance && (
                    <button
                      onClick={() => {
                        setKpiPopupType(null);
                        setModalMode("BILL");
                        setShowLogModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>Record Bill</span>
                    </button>
                  )}
                </div>

                <div className="p-4 overflow-y-auto space-y-3 flex-1">
                  {(!dayData?.bills || dayData.bills.length === 0) ? (
                    <div className="text-center py-10 text-slate-400">
                      <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-600">No vendor or contractor bills recorded on this date.</p>
                      <p className="text-[11px] text-slate-400 mt-1">Invoices from cement, steel, RMC, and labor contractors will appear here.</p>
                    </div>
                  ) : (
                    dayData.bills.map((b: any, idx: number) => (
                      <div
                        key={b.id || idx}
                        className="p-3.5 bg-slate-50 hover:bg-slate-100/70 rounded-xl border border-slate-200/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded" title={b.billNumber || "BILL"}>
                              {b.billNumber ? formatShortBillNumber(b.billNumber) : "BILL"}
                            </span>
                            <span className="font-bold text-sm text-slate-900" title={b.party?.name || "Direct Party"}>
                              <span className="sm:hidden">{formatShortName(b.party?.name || "Direct Party")}</span>
                              <span className="hidden sm:inline">{b.party?.name || "Direct Party"}</span>
                            </span>
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                                b.status === "POSTED" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {b.status || "POSTED"}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            {b.project?.name && <span>🏗️ {b.project.name}</span>}
                            {b.party?.partyType && <span>Type: {b.party.partyType}</span>}
                          </div>
                          {b.notes && (
                            <p className="text-xs text-slate-600 italic bg-white/70 p-1.5 rounded border border-slate-100 mt-1">
                              &ldquo;{b.notes}&rdquo;
                            </p>
                          )}
                          {b.attachments && b.attachments.length > 0 && (
                            <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-slate-200/60">
                              <span className="text-[11px] font-bold text-slate-500">📎 Bill / Doc:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {b.attachments.map((att: any, aIdx: number) => (
                                  <button
                                    key={att.id || aIdx}
                                    type="button"
                                    onClick={() => setActivePhotoLightbox(att.url)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-[10px] font-bold transition border border-amber-200"
                                  >
                                    <ImageIcon className="w-3 h-3 text-amber-600" />
                                    <span>View Image {b.attachments.length > 1 ? `#${aIdx + 1}` : ""}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="text-left sm:text-right shrink-0">
                          <div className="text-lg font-black text-slate-900">
                            {formatCurrency(b.totalAmount)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
                  <button
                    onClick={() => setKpiPopupType(null)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* 3. WORKFORCE POPUP */}
            {kpiPopupType === "WORKFORCE" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85dvh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
                <div className="p-4 bg-emerald-600 text-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-white/10 rounded-lg">
                      <UserCheck className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-black text-base leading-tight">Staff Present — Attendance Logs</h3>
                      <p className="text-xs text-emerald-100">
                        {formatDate(selectedDate)} · Total: {dayData?.summary?.staffPresentCount ?? (dayData?.attendance?.filter((a: any) => ["PRESENT", "HALF_DAY", "OVERTIME", "CORRECTED"].includes(a.status)).length || 0)} active staff checked in
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setKpiPopupType(null)}
                    className="text-emerald-100 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
                    title="Close (Esc)"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 bg-emerald-50/70 border-b border-emerald-100">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Staff Present</span>
                      <div className="font-display text-lg sm:text-xl font-extrabold text-emerald-700 tabular-nums truncate">{formatCompactNumber(dayData?.summary?.staffPresentCount ?? (dayData?.attendance?.filter((a: any) => ["PRESENT", "HALF_DAY", "OVERTIME", "CORRECTED"].includes(a.status)).length || 0))}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Present</span>
                      <div className="font-display text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums truncate">{formatCompactNumber(dayData?.attendance?.filter((a: any) => a.status === "PRESENT").length || 0)}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Half Day / Overtime</span>
                      <div className="font-display text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums truncate">{formatCompactNumber(dayData?.attendance?.filter((a: any) => ["HALF_DAY", "OVERTIME"].includes(a.status)).length || 0)}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Total Logged</span>
                      <div className="font-display text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums truncate">{formatCompactNumber(dayData?.attendance?.length || 0)}</div>
                    </div>
                  </div>
                </div>

                <div className="p-4 overflow-y-auto space-y-4 flex-1">
                  {/* Individual Staff Attendance */}
                  <div>
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Individual Staff & Team Attendance</span>
                    </h4>
                    {(!dayData?.attendance || dayData.attendance.length === 0) ? (
                      <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg border border-slate-200">
                        No staff attendance check-ins logged for this date.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {dayData.attendance.map((a: any, idx: number) => (
                          <div key={a.id || idx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                            <div>
                              <div className="font-bold text-xs text-slate-900">{a.name || a.workforceMember?.name || "Staff Member"}</div>
                              <div className="text-[11px] text-slate-500">
                                {a.role || a.workforceMember?.workerType || a.workforceMember?.trade || "Staff"}
                                {(a.employeeCode || a.workforceMember?.employeeCode) ? ` · ${a.employeeCode || a.workforceMember.employeeCode}` : ""}
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                                a.status === "PRESENT"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : a.status === "HALF_DAY"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {a.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Labor Headcount Master */}
                  <div>
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Contractor & Site Labor Headcount</span>
                    </h4>
                    {(!dayData?.headcount || dayData.headcount.length === 0) ? (
                      <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg border border-slate-200">
                        No contractor headcount groups logged on this date.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {dayData.headcount.map((h: any, idx: number) => (
                          <div key={h.id || idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-xs text-slate-900">{h.siteName || "Operational Site"}</span>
                                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">
                                  Shift: {h.shift || "GENERAL"}
                                </span>
                                {h.contractorName && (
                                  <span className="text-xs text-slate-500">· {h.contractorName}</span>
                                )}
                              </div>
                              <span className="text-sm font-black text-emerald-700">{h.grandTotal} Workers</span>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                              <span className="px-2 py-0.5 bg-white rounded border border-slate-200">
                                Artisans: <strong>{h.artisanCount ?? 0}</strong>
                              </span>
                              <span className="px-2 py-0.5 bg-white rounded border border-slate-200">
                                Craftsmen: <strong>{h.craftsmanCount ?? 0}</strong>
                              </span>
                              <span className="px-2 py-0.5 bg-white rounded border border-slate-200">
                                Laborers: <strong>{h.laborerMale ?? 0} M / {h.laborerFemale ?? 0} F</strong>
                              </span>
                            </div>
                            {h.notes && (
                              <p className="text-[11px] text-slate-500 italic mt-1.5">&ldquo;{h.notes}&rdquo;</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                  {canWriteAttendance && (
                    <button
                      onClick={() => {
                        setKpiPopupType(null);
                        setModalMode("WORKFORCE");
                        setShowLogModal(true);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Add Worker Count</span>
                    </button>
                  )}
                  <button
                    onClick={() => setKpiPopupType(null)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition ml-auto"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* 4. DSR / SITE LOGS POPUP */}
            {kpiPopupType === "DSR" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85dvh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
                <div className="p-4 bg-blue-600 text-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-white/10 rounded-lg">
                      <Layers className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-black text-base leading-tight">Site Logs (DSR) — Progress & Updates</h3>
                      <p className="text-xs text-blue-100">
                        {formatDate(selectedDate)} · {dayData?.dailyReports.length || 0} report{(dayData?.dailyReports.length || 0) === 1 ? "" : "s"} logged
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setKpiPopupType(null)}
                    className="text-blue-100 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
                    title="Close (Esc)"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">Daily Site Progress Reports</span>
                    <div className="font-display text-xl sm:text-2xl font-extrabold text-blue-900 tabular-nums tracking-tight truncate" title={String(dayData?.summary.reportsCount || 0)}>
                      {formatCompactNumber(dayData?.summary.reportsCount || 0)}
                    </div>
                  </div>
                  {canWriteDsr && (
                    <button
                      onClick={() => {
                        setKpiPopupType(null);
                        setModalMode("DSR");
                        setShowLogModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>Submit Daily Site Report</span>
                    </button>
                  )}
                </div>

                <div className="p-4 overflow-y-auto space-y-3 flex-1">
                  {(!dayData?.dailyReports || dayData.dailyReports.length === 0) ? (
                    <div className="text-center py-10 text-slate-400">
                      <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-600">No daily site progress reports logged for this date.</p>
                      <p className="text-[11px] text-slate-400 mt-1">Site supervisors can record daily work progress, delays, and safety notes.</p>
                    </div>
                  ) : (
                    dayData.dailyReports.map((r: any, idx: number) => (
                      <div key={r.id || idx} className="p-4 bg-slate-50 hover:bg-slate-100/70 rounded-xl border border-slate-200/80 transition space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                            <Building2 className="w-4 h-4 text-blue-600" />
                            {r.project?.name || "General Site Operations"}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">
                            Supervisor: {r.creator?.name || r.user?.name || "Site Engineer"}
                          </span>
                        </div>

                        <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1">
                          <span className="font-bold text-slate-900 block text-[11px] uppercase tracking-wider">Progress & Executed Work:</span>
                          <p className="whitespace-pre-line leading-relaxed">{r.progress || "No progress text recorded."}</p>
                        </div>

                        {r.blockers && (
                          <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-lg text-xs text-rose-800 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <strong className="block font-bold">Delays / Issues:</strong>
                              <span>{r.blockers}</span>
                            </div>
                          </div>
                        )}

                        {r.safetyNotes && (
                          <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg text-xs text-emerald-800 flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <strong className="block font-bold">Safety & Weather:</strong>
                              <span>{r.safetyNotes}</span>
                            </div>
                          </div>
                        )}

                        {r.attachments && r.attachments.length > 0 && (
                          <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                            <span className="font-bold text-slate-900 block text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                              <Camera className="w-3.5 h-3.5 text-blue-600" />
                              Site Photos & Visual Evidence ({r.attachments.length}):
                            </span>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                              {r.attachments.map((att: any) => (
                                <button
                                  key={att.id}
                                  type="button"
                                  onClick={() => setActivePhotoLightbox(att.url)}
                                  className="group relative rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-900 hover:ring-2 hover:ring-blue-500 transition shadow-2xs cursor-pointer"
                                  title={att.fileName || "View site photo"}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={att.url}
                                    alt={att.fileName || "Site photo"}
                                    className="w-full h-full object-cover group-hover:scale-105 transition"
                                  />
                                  <div className="absolute inset-0 bg-slate-950/20 group-hover:bg-slate-950/40 transition flex items-center justify-center">
                                    <Eye className="w-4 h-4 text-white opacity-90 lg:opacity-0 lg:group-hover:opacity-100 transition drop-shadow-md" />
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
                  <button
                    onClick={() => setKpiPopupType(null)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Print Filter & Configuration Modal */}
        {showPrintFilterModal && (
          <div
            className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowPrintFilterModal(false);
            }}
          >
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90dvh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                      <span>Print & Filter Day Book</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                        Official Statement
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Select specific sections and filters to customize your printed report.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPrintFilterModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
                {/* Presets */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Quick Presets
                    </label>
                    <span className="text-[11px] text-slate-400">
                      1-click report filters
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={applyPresetAll}
                      className="px-2.5 py-2 rounded-xl text-xs font-bold border border-slate-200 hover:border-amber-500 hover:bg-amber-50 text-slate-700 transition text-center shadow-2xs"
                    >
                      📄 Full Day Book
                    </button>
                    <button
                      type="button"
                      onClick={applyPresetActiveTab}
                      className="px-2.5 py-2 rounded-xl text-xs font-bold border border-blue-200 bg-blue-50/60 hover:bg-blue-100 text-blue-900 transition text-center shadow-2xs"
                      title={`Pre-selects active screen tab: ${getActiveTabLabel()}`}
                    >
                      🎯 {getActiveTabShortLabel()} Only
                    </button>
                    <button
                      type="button"
                      onClick={applyPresetNonEmpty}
                      className="px-2.5 py-2 rounded-xl text-xs font-bold border border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50 text-emerald-800 transition text-center shadow-2xs"
                    >
                      ✨ Non-Empty Only
                    </button>
                    <button
                      type="button"
                      onClick={applyPresetFinancial}
                      className="px-2.5 py-2 rounded-xl text-xs font-bold border border-slate-200 hover:border-amber-500 hover:bg-amber-50 text-slate-700 transition text-center shadow-2xs"
                    >
                      💰 Financial Only
                    </button>
                  </div>
                </div>

                {/* Scope Filters */}
                <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Filter by Project Scope
                    </label>
                    <SearchableSelect
                      options={[
                        { value: "ALL", label: "All Projects (Company-wide)" },
                        ...projects.map((p) => ({
                          value: p.id,
                          label: p.name,
                          badge: p.code || undefined,
                        })),
                      ]}
                      value={printProjectFilter}
                      onChange={setPrintProjectFilter}
                      placeholder="All Projects (Company-wide)"
                      searchPlaceholder="Search project name or code..."
                    />
                  </div>
                  <div className="sm:pt-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={hideEmptySectionsInPrint}
                        onChange={(e) => setHideEmptySectionsInPrint(e.target.checked)}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-slate-800">
                        Omit Empty Sections
                      </span>
                    </label>
                    <p className="text-[11px] text-slate-500 pl-6 mt-0.5">
                      Omits tables that have 0 records to eliminate blank paper sections.
                    </p>
                  </div>
                </div>

                {/* Section Checkboxes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Sections to Print ({selectedSectionsCount} of 10)
                    </label>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={selectAllSections}
                        className="text-amber-600 hover:text-amber-700 font-bold"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={deselectAllSections}
                        className="text-slate-400 hover:text-slate-600 font-bold"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <SectionCheckboxCard
                      checked={printSections.summary}
                      onChange={(val) => setPrintSections((prev) => ({ ...prev, summary: val }))}
                      icon={<BarChart2 className="w-4 h-4 text-slate-600" />}
                      title="Executive Summary & KPIs"
                      description="5 top-level financial & workforce cards"
                    />

                    <SectionCheckboxCard
                      checked={printSections.payments}
                      onChange={(val) => setPrintSections((prev) => ({ ...prev, payments: val }))}
                      icon={<ArrowUpRight className="w-4 h-4 text-rose-500" />}
                      title="1. Approved Payments"
                      badge={`${printDisbursedPayments.length} paid`}
                      highlight={printDisbursedPayments.length > 0 ? formatCurrency(printDisbursedTotal) : undefined}
                    />

                    <SectionCheckboxCard
                      checked={printSections.rejected}
                      onChange={(val) => setPrintSections((prev) => ({ ...prev, rejected: val }))}
                      icon={<XCircle className="w-4 h-4 text-rose-600" />}
                      title="2. Declined Claims"
                      badge={`${printRejectedPayments.length} declined`}
                      highlight={printRejectedPayments.length > 0 ? formatCurrency(printRejectedTotal) : undefined}
                      isWarning={printRejectedPayments.length > 0}
                    />

                    <SectionCheckboxCard
                      checked={printSections.moneyIn}
                      onChange={(val) => setPrintSections((prev) => ({ ...prev, moneyIn: val }))}
                      icon={<ArrowDownLeft className="w-4 h-4 text-emerald-600" />}
                      title="3. Customer Collections"
                      badge={`${printMoneyIn.length} receipts`}
                      highlight={printMoneyIn.length > 0 ? formatCurrency(printMoneyInTotal) : undefined}
                    />

                    <SectionCheckboxCard
                      checked={printSections.bills}
                      onChange={(val) => setPrintSections((prev) => ({ ...prev, bills: val }))}
                      icon={<FileText className="w-4 h-4 text-amber-500" />}
                      title="4. Vendor & Contractor Bills"
                      badge={`${printBills.length} bills`}
                      highlight={printBills.length > 0 ? formatCurrency(printBillsTotal) : undefined}
                    />

                    <SectionCheckboxCard
                      checked={printSections.headcount}
                      onChange={(val) => setPrintSections((prev) => ({ ...prev, headcount: val }))}
                      icon={<HardHat className="w-4 h-4 text-blue-600" />}
                      title="5. Workforce Headcount"
                      badge={`${printHeadcount.length} shifts`}
                      highlight={printHeadcount.length > 0 ? `${dayData?.summary.headcountTotal || 0} workers` : undefined}
                    />

                    <SectionCheckboxCard
                      checked={printSections.attendance}
                      onChange={(val) => setPrintSections((prev) => ({ ...prev, attendance: val }))}
                      icon={<Clock className="w-4 h-4 text-emerald-600" />}
                      title="6. Staff Site Attendance"
                      badge={`${printAttendance.length} sessions`}
                      highlight={printAttendance.length > 0 ? `${dayData?.summary.staffPresentCount || 0} present` : undefined}
                    />

                    <SectionCheckboxCard
                      checked={printSections.materials}
                      onChange={(val) => setPrintSections((prev) => ({ ...prev, materials: val }))}
                      icon={<Boxes className="w-4 h-4 text-slate-600" />}
                      title="7. Material Movements"
                      badge={`${printReceipts.length + printIssues.length} logs`}
                    />

                    <SectionCheckboxCard
                      checked={printSections.reports}
                      onChange={(val) => setPrintSections((prev) => ({ ...prev, reports: val }))}
                      icon={<Layers className="w-4 h-4 text-blue-500" />}
                      title="8. Site Reports (DSR)"
                      badge={`${printDailyReports.length} logs`}
                    />

                    <SectionCheckboxCard
                      checked={printSections.signatures}
                      onChange={(val) => setPrintSections((prev) => ({ ...prev, signatures: val }))}
                      icon={<CheckCircle2 className="w-4 h-4 text-slate-700" />}
                      title="Corporate Sign-Off Block"
                      description="Prepared, Verified & Approved signatures"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 sm:p-5 border-t border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
                <div className="text-xs text-slate-500 hidden sm:block">
                  <span className="font-bold text-slate-800">{selectedSectionsCount}</span> of 10 sections selected
                  {hideEmptySectionsInPrint && " • empty sections omitted"}
                  {printProjectFilter !== "ALL" && " • filtered by project"}
                </div>
                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setShowPrintFilterModal(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-200 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExecutePrint}
                    disabled={selectedSectionsCount === 0}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs sm:text-sm font-bold rounded-xl shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Statement</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PRINT-ONLY DAY BOOK OFFICIAL AUDIT STATEMENT & CASH LEDGER               */}
      {/* ========================================================================= */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 10mm 12mm 10mm;
          }
          /* Hide everything in document.body except the print portal */
          body > *:not(.print-portal-root) {
            display: none !important;
          }
          aside, nav, header, [role="navigation"], .no-print, .print-hidden, button, input, select, .quick-action-fab, .fixed, .sticky, div[class*="glass"] {
            display: none !important;
          }
          *, ::before, ::after {
            animation: none !important;
            -webkit-animation: none !important;
            transition: none !important;
            opacity: 1 !important;
            visibility: visible !important;
          }
          html, body {
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
            font-size: 10pt !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .screen-only-section {
            display: none !important;
          }
          .print-portal-root,
          .print-only-sheet {
            display: block !important;
            opacity: 1 !important;
            visibility: visible !important;
            position: static !important;
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            color: #0f172a !important;
            background: #ffffff !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-portal-root *,
          .print-only-sheet * {
            opacity: 1 !important;
            visibility: visible !important;
          }
          .print-section {
            margin-bottom: 14px !important;
            page-break-inside: auto !important;
          }
          .print-section-header {
            font-size: 10.5pt !important;
            font-weight: 800 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.04em !important;
            color: #0f172a !important;
            border-bottom: 1.5px solid #0f172a !important;
            padding-bottom: 3px !important;
            margin-bottom: 5px !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
          }
          .print-table {
            width: 100% !important;
            border-collapse: collapse !important;
            margin-bottom: 4px !important;
            page-break-inside: auto !important;
          }
          .print-table thead {
            display: table-header-group !important;
          }
          .print-table tfoot {
            display: table-footer-group !important;
          }
          .print-table tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }
          .print-table th, .print-table td {
            border: 1px solid #94a3b8 !important;
            padding: 4px 6px !important;
            font-size: 8pt !important;
            line-height: 1.25 !important;
            vertical-align: top !important;
          }
          .print-table th {
            background-color: #f1f5f9 !important;
            font-weight: 700 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.03em !important;
            color: #0f172a !important;
            font-size: 7.5pt !important;
          }
          .print-table tbody tr:nth-child(even) {
            background-color: #f8fafc !important;
          }
          .print-table tfoot tr {
            background-color: #f1f5f9 !important;
            font-weight: 800 !important;
            border-top: 2px solid #0f172a !important;
          }
          .print-avoid-break {
            page-break-inside: avoid !important;
          }
          .print-page-break {
            page-break-before: always !important;
          }
        }
        @media screen {
          .print-portal-root,
          .print-only-sheet {
            display: none !important;
            visibility: hidden !important;
          }
        }
      `}</style>

      {mounted && typeof document !== "undefined" && createPortal(
        <div className="print-portal-root print-only-sheet bg-white text-slate-900">
        {/* Document Header */}
        <div className="border-b-2 border-slate-900 pb-3 mb-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] font-black tracking-widest text-amber-700 uppercase">
                Bothra Infrastructure & Builders
              </div>
              <h1 className="text-lg font-black uppercase tracking-tight text-slate-900 leading-tight">
                Official Daily Site Record & Financial Day Book
              </h1>
              <p className="text-[10px] text-slate-600 font-medium">
                Certified Daily Operational, Workforce & Financial Audit Trail
              </p>
            </div>
            <div className="text-right text-[10px] text-slate-700 space-y-0.5 border border-slate-300 rounded p-2 bg-slate-50 min-w-[240px]">
              <div>
                <strong className="text-slate-900">Site:</strong>{" "}
                {sites.find((s) => s.id === selectedSiteId)?.name || "All Operational Sites (Company-wide)"}
              </div>
              {printProjectFilter !== "ALL" && (
                <div>
                  <strong className="text-slate-900">Project:</strong>{" "}
                  {projects.find((p) => p.id === printProjectFilter)?.name || printProjectFilter}
                </div>
              )}
              <div>
                <strong className="text-slate-900">Period:</strong>{" "}
                {selectedDate === toDate ? formatDate(selectedDate) : `${formatDate(selectedDate)} — ${formatDate(toDate)}`}
              </div>
              <div>
                <strong className="text-slate-900">Generated:</strong>{" "}
                {new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
              </div>
              <div>
                <strong className="text-slate-900">Operator:</strong>{" "}
                {currentUser?.name || "System User"} ({currentUser?.role || "Staff"})
              </div>
              {selectedSectionsCount < 10 && (
                <div className="text-amber-800 font-semibold pt-0.5 text-[9px]">
                  Filtered Statement: {selectedSectionsCount} of 10 sections included
                </div>
              )}
            </div>
          </div>
        </div>

        {(() => {
          let sectionIndex = 1;

          return (
            <>
              {/* Executive Summary Financial & Workforce KPIs */}
              {printSections.summary && (
                <div className="grid grid-cols-5 gap-2 mb-4 border border-slate-300 rounded p-2 bg-slate-50 text-slate-900">
                  <div className="border-r border-slate-200 pr-2">
                    <div className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500">Total Money In</div>
                    <div className="text-xs font-black text-emerald-700">
                      {formatCurrency(printMoneyInTotal)}
                    </div>
                    <div className="text-[8px] text-slate-500">{printMoneyIn.length} customer receipts</div>
                  </div>
                  <div className="border-r border-slate-200 pr-2">
                    <div className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500">Total Paid Out</div>
                    <div className="text-xs font-black text-rose-700">
                      {formatCurrency(printDisbursedTotal)}
                    </div>
                    <div className="text-[8px] text-slate-500">{printDisbursedPayments.length} vouchers paid</div>
                  </div>
                  <div className="border-r border-slate-200 pr-2">
                    <div className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500">Net Daily Cash Flow</div>
                    <div className={`text-xs font-black ${
                      (printMoneyInTotal - printDisbursedTotal) >= 0
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }`}>
                      {formatCurrency(printMoneyInTotal - printDisbursedTotal)}
                    </div>
                    <div className="text-[8px] text-slate-500">Collections vs Outflows</div>
                  </div>
                  <div className="border-r border-slate-200 pr-2">
                    <div className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500">Workforce Deployed</div>
                    <div className="text-xs font-black text-blue-800">
                      {dayData?.summary.workersPresentCount || 0} Workers
                    </div>
                    <div className="text-[8px] text-slate-500">
                      {dayData?.summary.headcountArtisans || 0} Art / {dayData?.summary.headcountCraftsmen || 0} Crf / {dayData?.summary.headcountLaborers || 0} Lab
                    </div>
                  </div>
                  <div>
                    <div className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500">Vendor Bills</div>
                    <div className="text-xs font-black text-amber-800">
                      {formatCurrency(printBillsTotal)}
                    </div>
                    <div className="text-[8px] text-slate-500">{printBills.length} vendor invoices</div>
                  </div>
                </div>
              )}

              {/* Section 1: Disbursed Payments & Vouchers Table (Disbursed Only) */}
              {printSections.payments && (!hideEmptySectionsInPrint || printDisbursedPayments.length > 0) && (
                <div className="print-section">
                  <div className="print-section-header">
                    <span>{sectionIndex++}. Approved Payments & Receipts ({printDisbursedPayments.length})</span>
                    <span className="text-[9pt] font-black text-slate-900">
                      Total Paid: {formatCurrency(printDisbursedTotal)}
                    </span>
                  </div>
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th style={{ width: "70px" }}>Date</th>
                        <th style={{ width: "85px" }}>Voucher #</th>
                        <th>Recipient / Vendor</th>
                        <th style={{ width: "85px" }}>Mode / A/C</th>
                        <th style={{ width: "110px" }}>Project / Site</th>
                        <th>Description / Bill Ref</th>
                        <th style={{ width: "65px", textAlign: "center" }}>Status</th>
                        <th style={{ width: "90px", textAlign: "right" }}>Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printDisbursedPayments.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center text-slate-400 italic py-2">
                            No approved payments recorded for this period.
                          </td>
                        </tr>
                      ) : (
                        printDisbursedPayments.map((p: any, idx: number) => (
                          <tr key={p.id || idx}>
                            <td className="whitespace-nowrap">{formatDate(p.paymentDate || p.createdAt)}</td>
                            <td className="font-mono font-bold text-slate-900">{p.referenceNumber || "—"}</td>
                            <td>
                              <div className="font-bold text-slate-900">{p.party?.name || p.recipientName || "Direct Site Expense"}</div>
                              {p.recipientType && <span className="text-[7.5pt] text-slate-500 uppercase">{p.recipientType}</span>}
                            </td>
                            <td>
                              <div className="font-semibold">{p.paymentMethod || p.method || "CASH"}</div>
                              {p.payingAccount && <div className="text-[7.5pt] text-slate-500 truncate">{p.payingAccount}</div>}
                            </td>
                            <td>{p.project?.name || "General / HQ"}</td>
                            <td>
                              <div className="text-slate-800">{p.notes || "—"}</div>
                              {p.allocations?.[0]?.bill?.billNumber && (
                                <div className="text-[7.5pt] text-amber-700 font-medium">Against Bill #{p.allocations[0].bill.billNumber}</div>
                              )}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span className="font-semibold text-[7.5pt]">{p.status || "POSTED"}</span>
                            </td>
                            <td style={{ textAlign: "right", fontWeight: "bold" }}>
                              {formatCurrency(p.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {printDisbursedPayments.length > 0 && (
                      <tfoot>
                        <tr>
                          <td colSpan={7} style={{ textAlign: "right" }}>Total Paid:</td>
                          <td style={{ textAlign: "right" }}>{formatCurrency(printDisbursedTotal)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}

              {/* Section 2: Rejected Payments & Claims Table (Dedicated Section) */}
              {printSections.rejected && (!hideEmptySectionsInPrint || printRejectedPayments.length > 0) && (
                <div className="print-section">
                  <div className="print-section-header">
                    <span className="text-rose-900">{sectionIndex++}. Declined Payments & Claims ({printRejectedPayments.length})</span>
                    <span className="text-[9pt] font-black text-rose-700">
                      Total Declined: {formatCurrency(printRejectedTotal)}
                    </span>
                  </div>
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th style={{ width: "70px" }}>Date</th>
                        <th style={{ width: "85px" }}>Voucher #</th>
                        <th>Recipient / Vendor</th>
                        <th style={{ width: "85px" }}>Mode / A/C</th>
                        <th style={{ width: "110px" }}>Project / Site</th>
                        <th>Declined Reason / Remarks</th>
                        <th style={{ width: "65px", textAlign: "center" }}>Status</th>
                        <th style={{ width: "90px", textAlign: "right" }}>Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printRejectedPayments.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center text-slate-400 italic py-2">
                            No declined payments or claims for this period.
                          </td>
                        </tr>
                      ) : (
                        printRejectedPayments.map((p: any, idx: number) => (
                          <tr key={p.id || idx}>
                            <td className="whitespace-nowrap">{formatDate(p.paymentDate || p.createdAt)}</td>
                            <td className="font-mono font-bold text-slate-900">{p.referenceNumber || "—"}</td>
                            <td>
                              <div className="font-bold text-slate-900">{p.party?.name || p.recipientName || "Vendor"}</div>
                              {p.recipientType && <span className="text-[7.5pt] text-slate-500 uppercase">{p.recipientType}</span>}
                            </td>
                            <td>
                              <div className="font-semibold">{p.paymentMethod || p.method || "CASH"}</div>
                              {p.payingAccount && <div className="text-[7.5pt] text-slate-500 truncate">{p.payingAccount}</div>}
                            </td>
                            <td>{p.project?.name || "General / HQ"}</td>
                            <td>
                              <div className="text-rose-800 font-medium">{p.declineReason || p.notes || "Payment request declined"}</div>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span className="font-bold text-[7.5pt] text-rose-700 uppercase">{p.status || "REJECTED"}</span>
                            </td>
                            <td style={{ textAlign: "right", fontWeight: "bold", color: "#b91c1c" }}>
                              {formatCurrency(p.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {printRejectedPayments.length > 0 && (
                      <tfoot>
                        <tr>
                          <td colSpan={7} style={{ textAlign: "right" }}>Total Declined:</td>
                          <td style={{ textAlign: "right", color: "#b91c1c" }}>{formatCurrency(printRejectedTotal)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}

              {/* Section 3: Money In / Customer Collections Table */}
              {printSections.moneyIn && (!hideEmptySectionsInPrint || printMoneyIn.length > 0) && (
                <div className="print-section">
                  <div className="print-section-header">
                    <span>{sectionIndex++}. Customer Collections & Money In ({printMoneyIn.length})</span>
                    <span className="text-[9pt] font-black text-emerald-800">
                      Total Collected: {formatCurrency(printMoneyInTotal)}
                    </span>
                  </div>
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th style={{ width: "70px" }}>Date</th>
                        <th style={{ width: "85px" }}>Receipt #</th>
                        <th>Customer / Booking Name</th>
                        <th style={{ width: "130px" }}>Unit / Project</th>
                        <th style={{ width: "80px" }}>Method</th>
                        <th style={{ width: "90px", textAlign: "right" }}>Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printMoneyIn.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center text-slate-400 italic py-2">
                            No customer collections or money in recorded for this period.
                          </td>
                        </tr>
                      ) : (
                        printMoneyIn.map((r: any, idx: number) => (
                          <tr key={r.id || idx}>
                            <td className="whitespace-nowrap">{formatDate(r.date)}</td>
                            <td className="font-mono font-bold">{r.receiptNumber || `REC-${idx + 1}`}</td>
                            <td className="font-semibold text-slate-900">{r.booking?.customerName || "Customer"}</td>
                            <td>{r.booking?.unit?.project?.name ? `${r.booking.unit.project.name} - Unit ${r.booking.unit.unitNumber || ""}` : "Direct Sale"}</td>
                            <td>{r.paymentMethod || r.mode || "BANK"}</td>
                            <td style={{ textAlign: "right", fontWeight: "bold", color: "#065f46" }}>
                              {formatCurrency(r.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {printMoneyIn.length > 0 && (
                      <tfoot>
                        <tr>
                          <td colSpan={5} style={{ textAlign: "right" }}>Total Collected:</td>
                          <td style={{ textAlign: "right" }}>{formatCurrency(printMoneyInTotal)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}

              {/* Section 4: Vendor Bills Recorded */}
              {printSections.bills && (!hideEmptySectionsInPrint || printBills.length > 0) && (
                <div className="print-section">
                  <div className="print-section-header">
                    <span>{sectionIndex++}. Vendor & Contractor Invoices Recorded ({printBills.length})</span>
                    <span className="text-[9pt] font-black text-amber-900">
                      Total Invoiced: {formatCurrency(printBillsTotal)}
                    </span>
                  </div>
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th style={{ width: "70px" }}>Date</th>
                        <th style={{ width: "85px" }}>Bill #</th>
                        <th>Vendor / Party</th>
                        <th style={{ width: "110px" }}>Project / Site</th>
                        <th style={{ width: "75px" }}>Due Date</th>
                        <th>Description / Cost Head</th>
                        <th style={{ width: "65px", textAlign: "center" }}>Status</th>
                        <th style={{ width: "90px", textAlign: "right" }}>Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printBills.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center text-slate-400 italic py-2">
                            No vendor or contractor bills recorded for this period.
                          </td>
                        </tr>
                      ) : (
                        printBills.map((b: any, idx: number) => (
                          <tr key={b.id || idx}>
                            <td className="whitespace-nowrap">{formatDate(b.billDate || b.createdAt)}</td>
                            <td className="font-mono font-bold text-amber-800">{b.billNumber || "—"}</td>
                            <td className="font-semibold text-slate-900">{b.party?.name || "Vendor"}</td>
                            <td>{b.project?.name || "General"}</td>
                            <td>{b.dueDate ? formatDate(b.dueDate) : "—"}</td>
                            <td>{b.notes || b.costHead || "Materials / Contracting"}</td>
                            <td style={{ textAlign: "center" }}>{b.status || "POSTED"}</td>
                            <td style={{ textAlign: "right", fontWeight: "bold" }}>{formatCurrency(b.totalAmount || 0)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {printBills.length > 0 && (
                      <tfoot>
                        <tr>
                          <td colSpan={7} style={{ textAlign: "right" }}>Total Invoiced:</td>
                          <td style={{ textAlign: "right" }}>{formatCurrency(printBillsTotal)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}

              {/* Section 5: Workforce Headcount & Labour Deployments */}
              {printSections.headcount && (!hideEmptySectionsInPrint || printHeadcount.length > 0) && (
                <div className="print-section">
                  <div className="print-section-header">
                    <span>{sectionIndex++}. Workforce Headcount & Labour Deployments ({printHeadcount.length} Shift Logs)</span>
                    <span className="text-[9pt] font-black text-blue-900">
                      Total: {dayData?.summary.headcountTotal || dayData?.summary.workersPresentCount || 0} Workers
                    </span>
                  </div>
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th style={{ width: "120px" }}>Site Location</th>
                        <th style={{ width: "75px", textAlign: "center" }}>Shift</th>
                        <th>Contractor / Gang Name</th>
                        <th style={{ width: "65px", textAlign: "center" }}>Artisans</th>
                        <th style={{ width: "70px", textAlign: "center" }}>Craftsmen</th>
                        <th style={{ width: "95px", textAlign: "center" }}>Laborers (M/F)</th>
                        <th style={{ width: "75px", textAlign: "center" }}>Total</th>
                        <th>Remarks / Work Area</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printHeadcount.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center text-slate-400 italic py-2">
                            No workforce headcount logs recorded for this period.
                          </td>
                        </tr>
                      ) : (
                        printHeadcount.map((h: any, idx: number) => (
                          <tr key={h.id || idx}>
                            <td className="font-semibold text-slate-900">{h.siteName || "Operational Site"}</td>
                            <td style={{ textAlign: "center" }}>
                              <span className="font-bold text-[7.5pt]">{h.shift || "GENERAL"}</span>
                            </td>
                            <td className="font-bold text-slate-800">{h.contractorName || "Direct Site Gang"}</td>
                            <td style={{ textAlign: "center" }}>{h.artisanCount ?? h.artisanTotal ?? 0}</td>
                            <td style={{ textAlign: "center" }}>{h.craftsmanCount ?? h.craftsmanTotal ?? 0}</td>
                            <td style={{ textAlign: "center" }}>
                              <strong>{h.laborerTotal || ((h.laborerMale || 0) + (h.laborerFemale || 0)) || 0}</strong>
                              {((h.laborerMale || 0) > 0 || (h.laborerFemale || 0) > 0) && (
                                <span className="text-[7pt] text-slate-500 ml-1">
                                  ({h.laborerMale || 0}M/{h.laborerFemale || 0}F)
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: "center", fontWeight: "bold", color: "#1e3a8a" }}>
                              {h.grandTotal || 0}
                            </td>
                            <td>{h.notes || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {printHeadcount.length > 0 && (
                      <tfoot>
                        <tr>
                          <td colSpan={6} style={{ textAlign: "right" }}>Total Labour Headcount:</td>
                          <td style={{ textAlign: "center" }}>
                            {printHeadcount.reduce((s: number, r: any) => s + (r.grandTotal || 0), 0)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}

              {/* Section 6: Staff & Supervisor Site Attendance */}
              {printSections.attendance && (!hideEmptySectionsInPrint || printAttendance.length > 0) && (
                <div className="print-section">
                  <div className="print-section-header">
                    <span>{sectionIndex++}. Staff & Supervisor Site Attendance ({printAttendance.length} Sessions)</span>
                    <span className="text-[9pt] font-black text-slate-900">
                      Present: {dayData?.summary.staffPresentCount || printAttendance.filter((a: any) => a.status === "PRESENT").length}
                    </span>
                  </div>
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th style={{ width: "80px" }}>Emp Code</th>
                        <th>Staff / Worker Name</th>
                        <th style={{ width: "130px" }}>Trade / Designation</th>
                        <th style={{ width: "70px", textAlign: "center" }}>Status</th>
                        <th style={{ width: "70px", textAlign: "center" }}>Check-In</th>
                        <th style={{ width: "70px", textAlign: "center" }}>Check-Out</th>
                        <th style={{ width: "60px", textAlign: "center" }}>Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printAttendance.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center text-slate-400 italic py-2">
                            No staff attendance records logged for this period.
                          </td>
                        </tr>
                      ) : (
                        printAttendance.map((a: any, idx: number) => (
                          <tr key={a.id || idx}>
                            <td className="font-mono">{a.employeeCode || a.workforceMember?.employeeCode || "—"}</td>
                            <td className="font-bold text-slate-900">{a.name || a.workforceMember?.name || "Staff Member"}</td>
                            <td>{a.role || a.workforceMember?.workerType || a.workforceMember?.trade || "Staff"}</td>
                            <td style={{ textAlign: "center", fontWeight: "bold" }}>{a.status || "PRESENT"}</td>
                            <td style={{ textAlign: "center" }}>
                              {a.checkInAt ? new Date(a.checkInAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—"}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {a.checkOutAt ? new Date(a.checkOutAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : (a.status === "PRESENT" ? "Active" : "—")}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {a.totalHours ? `${a.totalHours}h` : "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Section 7: Material Stock Movements (Receipts & Issues) */}
              {printSections.materials && (!hideEmptySectionsInPrint || (printReceipts.length + printIssues.length) > 0) && (
                <div className="print-section">
                  <div className="print-section-header">
                    <span>{sectionIndex++}. Site Material Stock Movements ({printReceipts.length + printIssues.length} Movements)</span>
                    <span className="text-[9pt] font-black text-slate-700">
                      {printReceipts.length} Inward / {printIssues.length} Outward
                    </span>
                  </div>
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th style={{ width: "75px", textAlign: "center" }}>Type</th>
                        <th style={{ width: "75px" }}>Date</th>
                        <th>Material Name (SKU)</th>
                        <th style={{ width: "80px", textAlign: "right" }}>Quantity</th>
                        <th style={{ width: "110px" }}>Store Location</th>
                        <th>Notes / Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printReceipts.length === 0 && printIssues.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center text-slate-400 italic py-2">
                            No material stock movements logged for this period.
                          </td>
                        </tr>
                      ) : (
                        <>
                          {printReceipts.map((m: any, idx: number) => (
                            <tr key={`rec-${m.id || idx}`}>
                              <td style={{ textAlign: "center", fontWeight: "bold", color: "#047857" }}>RECEIPT (IN)</td>
                              <td>{formatDate(m.movementAt || m.createdAt)}</td>
                              <td className="font-semibold text-slate-900">{m.material?.name} ({m.material?.sku || "—"})</td>
                              <td style={{ textAlign: "right", fontWeight: "bold" }}>{m.quantity} {m.material?.unitCode || ""}</td>
                              <td>{m.store?.name || "Central Store"}</td>
                              <td>{m.notes || m.creator?.name || "Stock Receipt"}</td>
                            </tr>
                          ))}
                          {printIssues.map((m: any, idx: number) => (
                            <tr key={`iss-${m.id || idx}`}>
                              <td style={{ textAlign: "center", fontWeight: "bold", color: "#b91c1c" }}>ISSUE (OUT)</td>
                              <td>{formatDate(m.movementAt || m.createdAt)}</td>
                              <td className="font-semibold text-slate-900">{m.material?.name} ({m.material?.sku || "—"})</td>
                              <td style={{ textAlign: "right", fontWeight: "bold" }}>{m.quantity} {m.material?.unitCode || ""}</td>
                              <td>{m.store?.name || "Site Store"}</td>
                              <td>{m.notes || m.creator?.name || "Material Issue"}</td>
                            </tr>
                          ))}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Section 8: Daily Site Progress Reports & Observations */}
              {printSections.reports && (!hideEmptySectionsInPrint || printDailyReports.length > 0) && (
                <div className="print-section print-avoid-break">
                  <div className="print-section-header">
                    <span>{sectionIndex++}. Daily Site Progress Reports & Field Logs ({printDailyReports.length})</span>
                  </div>
                  <div className="space-y-2 text-[8.5pt]">
                    {printDailyReports.length === 0 ? (
                      <div className="border border-slate-300 rounded p-2 bg-slate-50 text-slate-400 italic text-center">
                        No daily site progress reports logged for this period.
                      </div>
                    ) : (
                      printDailyReports.map((dr: any, idx: number) => (
                        <div key={dr.id || idx} className="border border-slate-300 rounded p-2 bg-slate-50">
                          <div className="font-bold text-slate-900 flex justify-between border-b border-slate-200 pb-1 mb-1">
                            <span>
                              {dr.project?.name} {dr.project?.site?.name ? `(${dr.project.site.name})` : ""}
                            </span>
                            <span className="text-[7.5pt] text-slate-600 font-normal">
                              Logged By: <strong>{dr.creator?.name || "Site Supervisor"}</strong> ({dr.creator?.role || "Field Officer"})
                            </span>
                          </div>
                          {dr.progressSummary && (
                            <div className="text-slate-800">
                              <strong>Work Progress Executed:</strong> {dr.progressSummary}
                            </div>
                          )}
                          {dr.blockers && (
                            <div className="mt-1 text-rose-800">
                              <strong>Delays / Issues:</strong> {dr.blockers}
                            </div>
                          )}
                          {dr.safetyNotes && (
                            <div className="mt-1 text-slate-700">
                              <strong>Safety & Quality Observations:</strong> {dr.safetyNotes}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Section 9: Formal Verification & Signatures Block */}
              {printSections.signatures && (
                <div className="print-avoid-break mt-6 pt-3 border-t-2 border-slate-900">
                  <div className="text-[8pt] uppercase font-extrabold text-slate-700 tracking-wider mb-8 text-center">
                    Official Corporate Verification & Authorization Sign-Off
                  </div>
                  <div className="grid grid-cols-3 gap-6 text-center text-[8.5pt]">
                    <div className="border-t border-slate-400 pt-2">
                      <div className="font-bold text-slate-900">Prepared By</div>
                      <div className="text-slate-500 text-[7.5pt]">Site Supervisor / Site Accountant</div>
                      <div className="text-slate-400 text-[7.5pt] mt-6">Signature & Date: ____________________</div>
                    </div>
                    <div className="border-t border-slate-400 pt-2">
                      <div className="font-bold text-slate-900">Verified By</div>
                      <div className="text-slate-500 text-[7.5pt]">Project Manager / Resident Engineer</div>
                      <div className="text-slate-400 text-[7.5pt] mt-6">Signature & Date: ____________________</div>
                    </div>
                    <div className="border-t border-slate-400 pt-2">
                      <div className="font-bold text-slate-900">Approved By</div>
                      <div className="text-slate-500 text-[7.5pt]">Finance Controller / Authorized Signatory</div>
                      <div className="text-slate-400 text-[7.5pt] mt-6">Signature & Date: ____________________</div>
                    </div>
                  </div>
                  <div className="text-center text-[7pt] text-slate-400 mt-4">
                    System generated document from Bothra CMS. Certified valid for audit and accounting reconciliation.
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>,
      document.body
    )}

      {/* Lightbox for Fullscreen Site Photo Preview */}
      {activePhotoLightbox && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setActivePhotoLightbox(null)}
        >
          <div
            className="relative max-w-4xl w-full sm:w-auto max-h-[90dvh] bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
              <a
                href={activePhotoLightbox}
                target="_blank"
                rel="noreferrer"
                download
                className="p-2 rounded-full bg-black/60 hover:bg-black/90 text-white transition"
                title="Download / Open original"
              >
                <Download className="w-5 h-5" />
              </a>
              <button
                type="button"
                onClick={() => setActivePhotoLightbox(null)}
                className="p-2 rounded-full bg-black/60 hover:bg-black/90 text-white transition"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {activePhotoLightbox.toLowerCase().includes(".pdf") ? (
              <>
                <div className="sm:hidden flex flex-col items-center justify-center p-8 text-center text-white space-y-3 min-h-[260px]">
                  <FileText className="w-12 h-12 text-amber-400" />
                  <div className="text-sm font-bold">PDF Document Preview</div>
                  <p className="text-xs text-slate-400 max-w-xs">
                    Open or download this PDF to read and zoom across all pages cleanly on mobile.
                  </p>
                  <a
                    href={activePhotoLightbox}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-black"
                  >
                    <Download className="w-4 h-4" /> Open / Download PDF
                  </a>
                </div>
                <iframe
                  src={activePhotoLightbox}
                  className="hidden sm:block w-[85vw] max-w-4xl h-[75dvh] rounded-b-xl bg-white"
                  title="Document Preview"
                />
              </>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={activePhotoLightbox}
                alt="Document / Photo Preview"
                className="max-h-[85dvh] w-auto object-contain mx-auto"
              />
            )}
          </div>
        </div>,
        document.body
      )}
    </Shell>
  );
}
