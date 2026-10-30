"use client";

import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import React, { useEffect, useState, useMemo } from "react";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatDate } from "@/lib/formatters";
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
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  Building2,
  CheckCircle2,
  X,
  CreditCard,
  Layers,
  Filter,
  Users,
  Sparkles,
  CalendarX,
  Info,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { canUser } from "@/lib/permissions";
import ExcelTable, { ExcelColumn } from "@/components/ui/ExcelTable";

interface DayBookData {
  date: string;
  summary: {
    totalPaymentsAmount: number;
    totalBillsAmount: number;
    totalMoneyInAmount?: number;
    moneyInCount?: number;
    paymentsCount: number;
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
  headcount?: any[];
  dailyReports: any[];
  recentActivityDates?: string[];
}

export default function DayBookPage() {
  const { t } = useLanguage();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const canWriteFinance = !currentUser || canUser(currentUser, "finance:write");
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
          <span className="font-black text-rose-600">
            {formatCurrency(p.amount)}
          </span>
        ),
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
        render: (b) => <span className="font-mono font-bold text-amber-700">{b.billNumber || "—"}</span>,
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
        label: "Worker Name",
        accessor: (a) => a.workforceMember?.name || "Worker",
        render: (a) => <span className="font-bold text-slate-900">{a.workforceMember?.name || "Worker"}</span>,
      },
      {
        key: "trade",
        label: "Trade",
        accessor: (a) => a.workforceMember?.workerType || a.workforceMember?.trade || "Staff",
        render: (a) => (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
            {a.workforceMember?.workerType || a.workforceMember?.trade || "Staff"}
          </span>
        ),
      },
      {
        key: "site",
        label: "Site",
        accessor: (a) => a.site?.name || "Operational Site",
        render: (a) => <span className="text-slate-600">{a.site?.name || "Operational Site"}</span>,
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
  const [sites, setSites] = useState<any[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"ALL" | "PAYMENTS" | "BILLS" | "ATTENDANCE" | "REPORTS">("ALL");
  const [loading, setLoading] = useState(true);
  const [dayData, setDayData] = useState<DayBookData | null>(null);

  // Quick Action Modal states
  const [showLogModal, setShowLogModal] = useState(false);
  const [modalMode, setModalMode] = useState<"PAYMENT" | "BILL" | "WORKFORCE" | "DSR">("PAYMENT");
  const [kpiPopupType, setKpiPopupType] = useState<"PAYMENTS" | "BILLS" | "WORKFORCE" | "DSR" | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const modalModeGuidance = {
    PAYMENT: {
      title: "Record Payment Out (Cash / Bank)",
      tag: "Money Paid Out",
      description: "Record money paid to a vendor, contractor, or worker for site expenses, materials, or wages. You can also link this payment to a pending bill.",
      requiredFields: "Recipient / Party, Amount, Payment Method, Ref / Voucher No.",
      expectedAction: "Deducts from account balance and updates payment history.",
    },
    BILL: {
      title: "Add Vendor Bill / Invoice",
      tag: "Money to Pay Later",
      description: "Enter a bill or invoice from a supplier or contractor. This records what you owe without deducting money until you pay.",
      requiredFields: "Vendor / Supplier, Bill #, Bill Date, Due Date, Pre-Tax Amount, GST Rate",
      expectedAction: "Adds to pending bills to pay later.",
    },
    WORKFORCE: {
      title: "Record Daily Worker Count",
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setKpiPopupType(null);
        setShowLogModal(false);
      }
    };
    if (kpiPopupType || showLogModal) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [kpiPopupType, showLogModal]);

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

  // Form states - Bill
  const [billPartyId, setBillPartyId] = useState("");
  const [billProjectId, setBillProjectId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billNotes, setBillNotes] = useState("");

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

  const loadDayBook = (fromDate: string, toDateStr?: string, siteId?: string) => {
    setLoading(true);
    const to = toDateStr || fromDate;
    const query = new URLSearchParams({ from: fromDate, to });
    if (siteId) query.set("siteId", siteId);

    fetch(`/api/day-book?${query.toString()}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setDayData(res.data);
        }
      })
      .catch(() => {})
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
    // Load metadata (sites, parties, projects, auth)
    Promise.all([
      fetch("/api/sites").then((r) => r.json()),
      fetch("/api/parties").then((r) => r.json()),
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/auth/me").then((r) => r.json()).catch(() => ({})),
    ]).then(([siteRes, partyRes, projRes, meRes]) => {
      if (meRes.success && meRes.data) {
        setCurrentUser(meRes.data.user);
      }
      const rawSites = siteRes.data || [];
      setSites(rawSites);
      if (rawSites.length > 0) {
        setWfSiteId(rawSites[0].id);
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

    loadDayBook(selectedDate, toDate, selectedSiteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setStatusMessage("❌ Please select a recipient / party for this payment");
      return;
    }
    if (!paymentRef.trim()) {
      setStatusMessage("❌ Ref / Voucher No is mandatory when recording a payment");
      return;
    }

    if (selectedPaymentBillId) {
      const selectedBill = pendingPartyBills.find((b) => b.id === selectedPaymentBillId);
      if (selectedBill) {
        const pendingRupees = (selectedBill.outstandingAmount ?? selectedBill.totalAmount) / 100;
        if (Number(paymentAmount) > pendingRupees) {
          setStatusMessage(`❌ Payment amount (${formatCurrency(Number(paymentAmount))}) exceeds bill outstanding balance (${formatCurrency(pendingRupees)})`);
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
        setStatusMessage("✅ Day Book payment recorded successfully!");
        setShowLogModal(false);
        setPaymentAmount("");
        setPaymentNotes("");
        setPaymentRef("");
        setSelectedPaymentBillId("");
        loadDayBook(selectedDate, toDate, selectedSiteId);
      } else {
        setStatusMessage(`❌ Error: ${data.error?.message || "Could not record payment"}`);
      }
    } catch {
      setStatusMessage("❌ Server error while saving payment.");
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
        setStatusMessage("✅ Day Book bill entered successfully!");
        setShowLogModal(false);
        setBillAmount("");
        setBillNumber("");
        setBillNotes("");
        loadDayBook(selectedDate, selectedSiteId);
      } else {
        setStatusMessage(`❌ Error: ${data.error?.message || "Could not enter bill"}`);
      }
    } catch {
      setStatusMessage("❌ Server error while saving bill.");
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
      setStatusMessage("❌ Please enter at least 1 worker for the site master");
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
        loadDayBook(selectedDate, selectedSiteId);
      } else {
        setStatusMessage(`❌ Error: ${data.error?.message || "Could not save headcount"}`);
      }
    } catch {
      setStatusMessage("❌ Server error while saving workers master.");
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
        setStatusMessage("✅ Daily Site Progress logged in Day Book!");
        setShowLogModal(false);
        setDsrProgress("");
        setDsrBlockers("");
        setDsrSafety("");
        loadDayBook(selectedDate, selectedSiteId);
      } else {
        setStatusMessage(`❌ Error: ${data.error?.message || "Could not log progress"}`);
      }
    } catch {
      setStatusMessage("❌ Server error while saving daily report.");
    } finally {
      setActionLoading(false);
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
        setStatusMessage("✅ Demo records generated successfully for Day Book!");
        loadDayBook(selectedDate, selectedSiteId);
      } else {
        setStatusMessage(`❌ Error: ${data.error?.message || "Could not load demo data"}`);
      }
    } catch {
      setStatusMessage("❌ Server error while loading demo data.");
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
      ["Employee Code", "Worker Name", "Trade", "Status", "Site"],
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

    const csvContent =
      "data:text/csv;charset=utf-8," + rows.map((r) => r.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `DayBook_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isToday = selectedDate === todayStr;

  const totalActivityCount =
    (dayData?.payments.length || 0) +
    (dayData?.bills.length || 0) +
    (dayData?.headcount?.length || 0) +
    (dayData?.attendance.length || 0) +
    (dayData?.dailyReports.length || 0);

  return (
    <Shell>
      <div className="screen-only-section space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-xl">
                <CalendarDays className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  {t("daybook.title", "Day Book")}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t("daybook.subtitle", "Daily record of money in and out, materials moved, labor attendance, and site work.")}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Populate Demo Data Button (Super Admin only) */}
            {isSuperAdmin && (
            <button
              onClick={handleSeedDemoData}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-800 text-xs font-bold rounded-xl shadow-xs transition disabled:opacity-50"
              title="Generate complete realistic demo records for Day Book"
            >
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>{actionLoading ? "Loading..." : "Load Demo Data"}</span>
            </button>
            )}

            {/* Quick Action Button */}
            {canLogDayEntry && (
              <button
                onClick={() => {
                  setShowLogModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-sm transition"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{t("daybook.addEntry", "+ Log Day Entry")}</span>
              </button>
            )}

            {/* Export CSV */}
            <button
              onClick={exportDayBookCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-xs transition"
              title="Download CSV Statement"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>{t("action.export", "Export CSV")}</span>
            </button>

            {/* Print */}
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-xs transition"
              title="Print Day Book"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Date Navigator & Filters Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
            {/* Presets & Mode Selector */}
            <div className="flex flex-wrap items-center gap-1.5 w-full lg:w-auto">
              <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" />
                Filter:
              </span>
              <button
                type="button"
                onClick={() => handleApplyPreset("today")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
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
                className="px-2.5 py-1 rounded-lg text-xs font-bold border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 transition"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset("last7")}
                className="px-2.5 py-1 rounded-lg text-xs font-bold border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 transition"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset("thisMonth")}
                className="px-2.5 py-1 rounded-lg text-xs font-bold border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 transition"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => setDateFilterMode(dateFilterMode === "SINGLE" ? "RANGE" : "SINGLE")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                  dateFilterMode === "RANGE"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {dateFilterMode === "RANGE" ? "Switch to Single Day" : "Custom Date Range"}
              </button>
            </div>

            {/* Site Filter */}
            <div className="flex items-center gap-2 w-full lg:w-auto">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-xs font-semibold text-slate-500 shrink-0">Site:</span>
              <select
                value={selectedSiteId}
                onChange={(e) => handleSiteChange(e.target.value)}
                className="w-full lg:w-auto px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500 transition"
              >
                <option value="">All Operational Sites</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Picker Inputs */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            {dateFilterMode === "SINGLE" ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => shiftDate(-1)}
                  className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition"
                  title="Previous Day"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value, e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:border-amber-500 transition"
                />

                <button
                  type="button"
                  onClick={() => shiftDate(1)}
                  className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition"
                  title="Next Day"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <span className="text-xs font-semibold text-slate-600 ml-2">
                  Showing: <strong className="text-slate-900">{formatDate(selectedDate)}</strong>
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">From:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
                />
                <span className="text-xs font-semibold text-slate-500">To:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => handleDateChange(selectedDate, toDate)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition shadow-2xs"
                >
                  Apply Range
                </button>
                <span className="text-xs font-semibold text-slate-600 ml-2">
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

        {/* Empty state: no activity recorded for the selected date */}
        {!loading && totalActivityCount === 0 && (
          <EmptyState
            icon={CalendarX}
            title={`No Day Book entries found for ${selectedDate === toDate ? formatDate(selectedDate) : `${formatDate(selectedDate)} — ${formatDate(toDate)}`}`}
            description={
              canLogDayEntry
                ? "Nothing has been recorded for this date yet. Use “+ Log Day Entry” to add a payment, bill, stock movement, headcount or site report."
                : "Nothing has been recorded for this date yet. Pick another date to review earlier activity."
            }
          >
            {canLogDayEntry && (
              <Button icon={<PlusCircle className="w-4 h-4" />} onClick={() => setShowLogModal(true)}>
                {t("daybook.addEntry", "+ Log Day Entry")}
              </Button>
            )}
            {dayData?.recentActivityDates && dayData.recentActivityDates.map((dt) => (
              <Button key={dt} variant="secondary" size="sm" onClick={() => handleDateChange(dt)}>
                Jump to {formatDate(dt)}
              </Button>
            ))}
            {isSuperAdmin && (
              <Button
                variant="ghost"
                size="sm"
                loading={actionLoading}
                icon={<Sparkles className="w-3.5 h-3.5 text-amber-600" />}
                onClick={handleSeedDemoData}
              >
                Populate Demo Records
              </Button>
            )}
          </EmptyState>
        )}

        {/* Summary KPI Cards for Selected Date */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Payments Card */}
          <div
            onClick={() => setKpiPopupType("PAYMENTS")}
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs cursor-pointer hover:border-rose-300 hover:shadow-md transition-all group active:scale-[0.99] flex flex-col justify-between"
            role="button"
            tabIndex={0}
            title="Click to view Payments breakdown popup"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-rose-600 transition">Payments Out</span>
                <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600 group-hover:bg-rose-100 transition">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-rose-600">
                {dayData ? formatCurrency(dayData.summary.totalPaymentsAmount) : "₹0.00"}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 font-medium">
                {dayData?.summary.paymentsCount || 0} transactions disbursed
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-400 group-hover:text-rose-600 transition">
              <span>View details popup</span>
              <span>&rarr;</span>
            </div>
          </div>

          {/* Bills Card */}
          <div
            onClick={() => setKpiPopupType("BILLS")}
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs cursor-pointer hover:border-amber-300 hover:shadow-md transition-all group active:scale-[0.99] flex flex-col justify-between"
            role="button"
            tabIndex={0}
            title="Click to view Bills breakdown popup"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-amber-600 transition">Bills Incurred</span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 group-hover:bg-amber-100 transition">
                  <FileText className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900">
                {dayData ? formatCurrency(dayData.summary.totalBillsAmount) : "₹0.00"}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 font-medium">
                {dayData?.summary.billsCount || 0} vendor/contractor bills
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-400 group-hover:text-amber-600 transition">
              <span>View details popup</span>
              <span>&rarr;</span>
            </div>
          </div>

          {/* Attendance Card */}
          <div
            onClick={() => setKpiPopupType("WORKFORCE")}
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all group active:scale-[0.99] flex flex-col justify-between"
            role="button"
            tabIndex={0}
            title="Click to view Workers & Master breakdown popup"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-emerald-600 transition">Workers Present</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-100 transition">
                  <HardHat className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900">
                {dayData?.summary.workersPresentCount || 0}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 font-medium">
                {(() => {
                  if (!dayData?.summary) return "Daily labor master";
                  const parts: string[] = [];
                  if (dayData.summary.headcountArtisans) parts.push(`${dayData.summary.headcountArtisans} Artisans`);
                  if (dayData.summary.headcountCraftsmen) parts.push(`${dayData.summary.headcountCraftsmen} Craftsmen`);
                  if (dayData.summary.headcountLaborers) parts.push(`${dayData.summary.headcountLaborers} Laborers`);
                  const subSum = (dayData.summary.headcountArtisans || 0) + (dayData.summary.headcountCraftsmen || 0) + (dayData.summary.headcountLaborers || 0);
                  const total = dayData.summary.workersPresentCount || 0;
                  if (total > subSum) {
                    parts.push(`+${total - subSum} Staff`);
                  }
                  return parts.length > 0 ? parts.join(" · ") : "Daily labor master";
                })()}
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-400 group-hover:text-emerald-600 transition">
              <span>View details popup</span>
              <span>&rarr;</span>
            </div>
          </div>

          {/* Site Logs / DSR */}
          <div
            onClick={() => setKpiPopupType("DSR")}
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group active:scale-[0.99] flex flex-col justify-between"
            role="button"
            tabIndex={0}
            title="Click to view Site Logs breakdown popup"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-blue-600 transition">Site Logs (DSR)</span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-100 transition">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900">
                {dayData?.summary.reportsCount || 0}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 font-medium">
                Progress & safety updates
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-400 group-hover:text-blue-600 transition">
              <span>View details popup</span>
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
          <button
            onClick={() => setActiveTab("PAYMENTS")}
            className={`px-3 py-2 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "PAYMENTS" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span>Payments Out</span>
            <span className="px-1.5 py-0.2 bg-rose-500 text-white text-[10px] rounded-full">
              {dayData?.payments.length || 0}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("BILLS")}
            className={`px-3 py-2 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "BILLS" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span>Bills Incurred</span>
            <span className="px-1.5 py-0.2 bg-slate-200 text-slate-800 text-[10px] rounded-full">
              {dayData?.bills.length || 0}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("ATTENDANCE")}
            className={`px-3 py-2 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "ATTENDANCE" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
            title={`Total Workers: ${dayData?.summary.workersPresentCount || 0} workers (${(dayData?.headcount?.length || 0) + (dayData?.attendance?.length || 0)} master records)`}
          >
            <span>Workers Master</span>
            <span className="px-1.5 py-0.2 bg-emerald-600 text-white text-[10px] font-bold rounded-full">
              {dayData?.summary.workersPresentCount || ((dayData?.headcount?.length || 0) + (dayData?.attendance?.length || 0))}
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
            {activeTab === "ALL" && (dayData?.moneyIn?.length || 0) > 0 && (
              <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden shadow-xs">
                <div className="p-4 bg-emerald-50/60 border-b border-emerald-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-black text-slate-900">Money in from customers</h3>
                  </div>
                  <span className="text-xs font-bold text-emerald-700">{formatCurrency(dayData?.summary.totalMoneyInAmount || 0)}</span>
                </div>
                <div className="overflow-x-auto">
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
                      {dayData!.moneyIn!.map((r: any) => (
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
              </div>
            )}

            {/* 1. Payments Table */}
            {(activeTab === "ALL" || activeTab === "PAYMENTS") && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-4 bg-slate-50/60 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4 text-rose-500" />
                    <h3 className="text-sm font-black text-slate-900">Payments & Cash Outflow</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-rose-600">
                      {dayData ? formatCurrency(dayData.summary.totalPaymentsAmount) : "₹0.00"}
                    </span>
                    {canWriteFinance && (
                      <button
                        onClick={() => {
                          setModalMode("PAYMENT");
                          setShowLogModal(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-xs font-bold transition"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Add Payment</span>
                      </button>
                    )}
                  </div>
                </div>

                {dayData?.payments.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50/40 flex flex-col items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 mb-2">
                      <ArrowUpRight className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">No payments recorded on this date.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 mb-3">Record contractor advances, petty cash expenses, and vendor payments directly into Day Book.</p>
                    {canWriteFinance && (
                      <button
                        onClick={() => {
                          setModalMode("PAYMENT");
                          setShowLogModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition shadow-xs"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>+ Record Payment</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <ExcelTable
                    data={dayData?.payments || []}
                    columns={paymentColumns}
                    tableName="Payments"
                    showGlobalSearch={true}
                    showExport={true}
                    showToolbar={true}
                  />
                )}
              </div>
            )}

            {/* 2. Bills Table */}
            {(activeTab === "ALL" || activeTab === "BILLS") && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-4 bg-slate-50/60 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-black text-slate-900">Vendor & Contractor Bills Logged</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-900">
                      {dayData ? formatCurrency(dayData.summary.totalBillsAmount) : "₹0.00"}
                    </span>
                    {canWriteFinance && (
                      <button
                        onClick={() => {
                          setModalMode("BILL");
                          setShowLogModal(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-800 hover:bg-amber-100 rounded-lg text-xs font-bold transition"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
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
                        <span>+ Enter Bill</span>
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

            {/* 3. Workforce Attendance Master (Site Headcounts + Staff Sessions) */}
            {(activeTab === "ALL" || activeTab === "ATTENDANCE") && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-4 bg-slate-50/60 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardHat className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-black text-slate-900">Workers Attendance Master</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-emerald-700">
                      {dayData?.summary.workersPresentCount || 0} Present
                    </span>
                    {canWriteAttendance && (
                      <button
                        onClick={() => {
                          if (selectedSiteId) setWfSiteId(selectedSiteId);
                          setModalMode("WORKFORCE");
                          setShowLogModal(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 rounded-lg text-xs font-bold transition"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Log Worker Count</span>
                      </button>
                    )}
                  </div>
                </div>

                {(!dayData?.headcount || dayData.headcount.length === 0) &&
                (!dayData?.attendance || dayData.attendance.length === 0) ? (
                  <div className="p-8 text-center bg-slate-50/40 flex flex-col items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 mb-2">
                      <HardHat className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">No worker shifts or count logged for this date.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 mb-3">Log daily artisans, craftsmen, and laborers master counts for your active sites.</p>
                    {canWriteAttendance && (
                      <button
                        onClick={() => {
                          if (selectedSiteId) setWfSiteId(selectedSiteId);
                          setModalMode("WORKFORCE");
                          setShowLogModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow-xs"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>+ Log Worker Count</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {/* 3A. Site Headcount Records */}
                    {dayData?.headcount && dayData.headcount.length > 0 && (
                      <div>
                        <div className="p-3 bg-emerald-50/50 border-b border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-emerald-600" />
                            <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                              Site Labor Master Records ({dayData.headcount.length})
                            </span>
                          </div>
                          <span className="text-xs font-black text-emerald-700">
                            Total {dayData.headcount.reduce((s: number, r: any) => s + (r.grandTotal || 0), 0)} Workers
                          </span>
                        </div>
                        <ExcelTable
                          data={dayData.headcount}
                          columns={headcountColumns}
                          tableName="Headcount"
                          showGlobalSearch={true}
                          showExport={true}
                          showToolbar={true}
                        />
                      </div>
                    )}

                    {/* 3B. Staff Attendance Sessions */}
                    {dayData?.attendance && dayData.attendance.length > 0 && (
                      <div>
                        <div className="p-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                            Staff & Individual Worker Sessions ({dayData.attendance.length})
                          </span>
                        </div>
                        <div className="overflow-x-auto min-h-[400px]">
                          <table className="w-full text-left text-xs min-h-[400px]">
                            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                              <tr>
                                <th className="p-3">Emp Code</th>
                                <th className="p-3">Worker Name</th>
                                <th className="p-3">Trade</th>
                                <th className="p-3">Site</th>
                                <th className="p-3">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {dayData.attendance.map((a) => (
                                <tr key={a.id} className="hover:bg-slate-50/70 transition">
                                  <td className="p-3 font-mono font-bold text-slate-800">
                                    {a.workforceMember?.employeeCode || "—"}
                                  </td>
                                  <td className="p-3 font-bold text-slate-900">{a.workforceMember?.name || "N/A"}</td>
                                  <td className="p-3 text-slate-600">{a.workforceMember?.workerType || a.workforceMember?.trade || "Staff / Worker"}</td>
                                  <td className="p-3 text-slate-600">{a.site?.name || "Operational Site"}</td>
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
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 4. Daily Site Progress Reports (DSR) */}
            {(activeTab === "ALL" || activeTab === "REPORTS") && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-4 bg-slate-50/60 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-500" />
                    <h3 className="text-sm font-black text-slate-900">Daily Site Reports (DSR)</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-blue-700">
                      {dayData?.dailyReports.length || 0} Reports
                    </span>
                    {canWriteDsr && (
                      <button
                        onClick={() => {
                          setModalMode("DSR");
                          setShowLogModal(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
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
                    <p className="text-[11px] text-slate-400 mt-0.5 mb-3">Record work executed, site challenges, weather blockers, and safety notes.</p>
                    {canWriteDsr && (
                      <button
                        onClick={() => {
                          setModalMode("DSR");
                          setShowLogModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-xs"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>+ Log Daily Progress (DSR)</span>
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
                            <span><strong>Blockers:</strong> {r.blockers}</span>
                          </div>
                        )}
                        {r.safetyNotes && (
                          <div className="text-[11px] text-slate-500 font-medium">
                            <strong>Safety Notes:</strong> {r.safetyNotes}
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
            className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowLogModal(false);
            }}
          >
            <div
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
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
                  onClick={() => setShowLogModal(false)}
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
                            <option value="">No vendors found (create one under Parties)</option>
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
                        <select
                          value={paymentProjectId}
                          onChange={(e) => setPaymentProjectId(e.target.value)}
                          className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                        >
                          <option value="">General / Head Office</option>
                          {projects.map((pr) => (
                            <option key={pr.id} value={pr.id}>
                              {pr.name} ({pr.code})
                            </option>
                          ))}
                        </select>
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
                          <option value="">General Advance / Site Expense (No Specific Bill)</option>
                          {pendingPartyBills.map((b) => (
                            <option key={b.id} value={b.id}>
                              Bill #{b.billNumber} — Pending: {formatCurrency(b.outstandingAmount ?? b.totalAmount)}
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
                          Ref / Voucher No *
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
                            <option value="">No vendors found (create one under Parties)</option>
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
                        <select
                          value={billProjectId}
                          onChange={(e) => setBillProjectId(e.target.value)}
                          className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                        >
                          <option value="">General Project</option>
                          {projects.map((pr) => (
                            <option key={pr.id} value={pr.id}>
                              {pr.name} ({pr.code})
                            </option>
                          ))}
                        </select>
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
                        <span className="font-bold text-slate-600">Total Worker Master:</span>
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
                        {actionLoading ? "Saving..." : "Save Worker Master"}
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
                      <select
                        value={dsrProjectId}
                        onChange={(e) => setDsrProjectId(e.target.value)}
                        required
                        className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:outline-none focus:border-amber-500"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.code})
                          </option>
                        ))}
                      </select>
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
                        Blockers / Delays (Optional)
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
                        {actionLoading ? "Saving..." : "Save Daily Report"}
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
            className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 transition-all"
          >
            {/* 1. PAYMENTS POPUP */}
            {kpiPopupType === "PAYMENTS" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
                <div className="p-4 bg-rose-600 text-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-white/10 rounded-lg">
                      <ArrowUpRight className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-black text-base leading-tight">Payments Out — Details</h3>
                      <p className="text-xs text-rose-100">
                        {formatDate(selectedDate)} · {dayData?.payments.length || 0} transaction{(dayData?.payments.length || 0) === 1 ? "" : "s"} disbursed
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

                <div className="p-4 bg-rose-50/70 border-b border-rose-100 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Total Payments Disbursed</span>
                    <div className="text-2xl font-black text-rose-600">
                      {dayData ? formatCurrency(dayData.summary.totalPaymentsAmount) : "₹0.00"}
                    </div>
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
                      <span>+ Record Payment</span>
                    </button>
                  )}
                </div>

                <div className="p-4 overflow-y-auto space-y-3 flex-1">
                  {(!dayData?.payments || dayData.payments.length === 0) ? (
                    <div className="text-center py-10 text-slate-400">
                      <ArrowUpRight className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-600">No payments recorded on this date.</p>
                      <p className="text-[11px] text-slate-400 mt-1">Cash, UPI, and bank transfers recorded today will appear here.</p>
                    </div>
                  ) : (
                    dayData.payments.map((p: any, idx: number) => (
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
                        </div>
                        <div className="text-left sm:text-right shrink-0">
                          <div className="text-lg font-black text-rose-600">
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

            {/* 2. BILLS POPUP */}
            {kpiPopupType === "BILLS" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
                <div className="p-4 bg-amber-600 text-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-white/10 rounded-lg">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-black text-base leading-tight">Bills Incurred — Details</h3>
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
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Total Invoices & Bills</span>
                    <div className="text-2xl font-black text-slate-900">
                      {dayData ? formatCurrency(dayData.summary.totalBillsAmount) : "₹0.00"}
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
                      <span>+ Add Bill</span>
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
                            <span className="font-mono text-xs font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                              {b.billNumber || "BILL"}
                            </span>
                            <span className="font-bold text-sm text-slate-900">{b.party?.name || "Direct Party"}</span>
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
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
                <div className="p-4 bg-emerald-600 text-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-white/10 rounded-lg">
                      <HardHat className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-black text-base leading-tight">Workers Present — Master & Attendance</h3>
                      <p className="text-xs text-emerald-100">
                        {formatDate(selectedDate)} · Total: {dayData?.summary.workersPresentCount || 0} active workers & staff
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
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Artisans</span>
                      <div className="text-xl font-black text-slate-900">{dayData?.summary.headcountArtisans || 0}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Craftsmen</span>
                      <div className="text-xl font-black text-slate-900">{dayData?.summary.headcountCraftsmen || 0}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Laborers (M/F)</span>
                      <div className="text-xl font-black text-slate-900">{dayData?.summary.headcountLaborers || 0}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Staff Attendance</span>
                      <div className="text-xl font-black text-emerald-700">{dayData?.attendance?.length || 0}</div>
                    </div>
                  </div>
                </div>

                <div className="p-4 overflow-y-auto space-y-4 flex-1">
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

                  {/* Individual Staff Attendance */}
                  <div>
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <HardHat className="w-3.5 h-3.5 text-blue-600" />
                      <span>Individual Staff & Skilled Trades</span>
                    </h4>
                    {(!dayData?.attendance || dayData.attendance.length === 0) ? (
                      <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg border border-slate-200">
                        No individual attendance check-ins logged for this date.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {dayData.attendance.map((a: any, idx: number) => (
                          <div key={a.id || idx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                            <div>
                              <div className="font-bold text-xs text-slate-900">{a.workforceMember?.name || "Worker"}</div>
                              <div className="text-[11px] text-slate-500">
                                {a.workforceMember?.workerType || a.workforceMember?.trade || "Staff"}
                                {a.workforceMember?.employeeCode ? ` · ${a.workforceMember.employeeCode}` : ""}
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
                      <span>+ Log Labor Master</span>
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
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
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
                    <div className="text-2xl font-black text-blue-900">
                      {dayData?.summary.reportsCount || 0}
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
                      <span>+ Log Site Report</span>
                    </button>
                  )}
                </div>

                <div className="p-4 overflow-y-auto space-y-3 flex-1">
                  {(!dayData?.dailyReports || dayData.dailyReports.length === 0) ? (
                    <div className="text-center py-10 text-slate-400">
                      <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-600">No daily site progress reports logged for this date.</p>
                      <p className="text-[11px] text-slate-400 mt-1">Site supervisors can file daily work progress, blockers, and safety logs.</p>
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
                            Supervisor: {r.user?.name || "Site Engineer"}
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
                              <strong className="block font-bold">Blockers / Obstacles:</strong>
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
      </div>

      {/* ========================================================================= */}
      {/* PRINT-ONLY DAY BOOK OFFICIAL AUDIT STATEMENT & CASH LEDGER               */}
      {/* ========================================================================= */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 10mm;
          }
          aside, nav, header, [role="navigation"], .no-print, button, input, select, .quick-action-fab, .fixed {
            display: none !important;
          }
          body, main, div[class*="min-h-screen"], div[class*="bg-slate-50"] {
            background: #ffffff !important;
            color: #000000 !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
          .screen-only-section {
            display: none !important;
          }
          .print-only-sheet {
            display: block !important;
            font-family: ui-sans-serif, system-ui, -apple-system, sans-serif !important;
            color: #0f172a !important;
          }
          .print-table {
            width: 100% !important;
            border-collapse: collapse !important;
            margin-bottom: 16px !important;
            page-break-inside: auto !important;
          }
          .print-table tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }
          .print-table th, .print-table td {
            border: 1px solid #cbd5e1 !important;
            padding: 5px 8px !important;
            font-size: 10px !important;
            line-height: 1.3 !important;
          }
          .print-table th {
            background-color: #f8fafc !important;
            font-weight: 700 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.05em !important;
            color: #1e293b !important;
          }
          .print-page-break {
            page-break-before: always !important;
          }
        }
        @media screen {
          .print-only-sheet {
            display: none;
          }
        }
      `}</style>

      <div className="print-only-sheet p-6 bg-white text-slate-900">
        {/* Document Header */}
        <div className="border-b-2 border-slate-900 pb-3 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">
                Bothra Construction Management System
              </h1>
              <h2 className="text-sm font-bold text-slate-700 tracking-wide uppercase mt-0.5">
                Official Daily Site Record & Financial Day Book
              </h2>
            </div>
            <div className="text-right text-[11px] text-slate-600">
              <div className="font-bold text-slate-900">
                Site: {sites.find((s) => s.id === selectedSiteId)?.name || "All Operational Sites"}
              </div>
              <div>Period: {selectedDate === toDate ? formatDate(selectedDate) : `${formatDate(selectedDate)} — ${formatDate(toDate)}`}</div>
              <div>Generated: {new Date().toLocaleString("en-IN")}</div>
            </div>
          </div>
        </div>

        {/* Executive Summary Financial Cards */}
        <div className="grid grid-cols-4 gap-3 mb-4 border border-slate-300 rounded-lg p-3 bg-slate-50">
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-500">Total Money In (Receipts)</div>
            <div className="text-sm font-black text-emerald-700">{formatCurrency(dayData?.summary.totalMoneyInAmount || 0)}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-500">Total Disbursed (Payments)</div>
            <div className="text-sm font-black text-rose-700">{formatCurrency(dayData?.summary.totalPaymentsAmount || 0)}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-500">Net Flow</div>
            <div className="text-sm font-black text-slate-900">
              {formatCurrency((dayData?.summary.totalMoneyInAmount || 0) - (dayData?.summary.totalPaymentsAmount || 0))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-500">Worker Headcount</div>
            <div className="text-sm font-black text-blue-700">{dayData?.summary.workersPresentCount || 0} Workers</div>
          </div>
        </div>

        {/* Section 1: Disbursed Payments Table */}
        <div className="mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-1 border-b border-slate-300 pb-0.5">
            1. Disbursed Payments & Vouchers ({dayData?.payments.length || 0})
          </h3>
          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: "80px" }}>Date</th>
                <th style={{ width: "90px" }}>Voucher #</th>
                <th>Recipient / Vendor</th>
                <th style={{ width: "70px" }}>Mode</th>
                <th>Project / Site</th>
                <th>Description / Bill Ref</th>
                <th style={{ width: "90px", textAlign: "right" }}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {(!dayData?.payments || dayData.payments.length === 0) ? (
                <tr>
                  <td colSpan={7} className="text-center text-slate-400 italic py-2">
                    No payments recorded for this period.
                  </td>
                </tr>
              ) : (
                dayData.payments.map((p, idx) => (
                  <tr key={idx}>
                    <td>{formatDate(p.paymentDate || p.createdAt)}</td>
                    <td className="font-mono">{p.referenceNumber || "—"}</td>
                    <td className="font-semibold">{p.party?.name || "Direct Site Expense"}</td>
                    <td>{p.paymentMethod || p.method || "CASH"}</td>
                    <td>{p.project?.name || "General / HQ"}</td>
                    <td>{p.notes || (p.allocations?.[0]?.bill?.billNumber ? `Bill #${p.allocations[0].bill.billNumber}` : "—")}</td>
                    <td style={{ textAlign: "right", fontWeight: "bold" }}>{formatCurrency((p.amount || 0) / 100)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {dayData?.payments && dayData.payments.length > 0 && (
              <tfoot>
                <tr className="font-bold bg-slate-100">
                  <td colSpan={6} style={{ textAlign: "right" }}>Total Disbursed:</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(dayData.summary.totalPaymentsAmount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Section 2: Money In Table */}
        {dayData?.moneyIn && dayData.moneyIn.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-1 border-b border-slate-300 pb-0.5">
              2. Customer Collections & Money In ({dayData.moneyIn.length})
            </h3>
            <table className="print-table">
              <thead>
                <tr>
                  <th style={{ width: "80px" }}>Date</th>
                  <th style={{ width: "90px" }}>Receipt #</th>
                  <th>Customer / Booking</th>
                  <th>Unit / Project</th>
                  <th style={{ width: "70px" }}>Method</th>
                  <th style={{ width: "90px", textAlign: "right" }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {dayData.moneyIn.map((r, idx) => (
                  <tr key={idx}>
                    <td>{formatDate(r.date)}</td>
                    <td className="font-mono">{r.receiptNumber || `REC-${idx + 1}`}</td>
                    <td className="font-semibold">{r.booking?.customerName || "Customer"}</td>
                    <td>{r.booking?.unit?.project?.name} - Unit {r.booking?.unit?.unitNumber}</td>
                    <td>{r.paymentMethod || "BANK"}</td>
                    <td style={{ textAlign: "right", fontWeight: "bold" }}>{formatCurrency(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold bg-slate-100">
                  <td colSpan={5} style={{ textAlign: "right" }}>Total Collected:</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(dayData.summary.totalMoneyInAmount || 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Section 3: Vendor Bills Recorded */}
        {dayData?.bills && dayData.bills.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-1 border-b border-slate-300 pb-0.5">
              3. Vendor Bills Recorded ({dayData.bills.length})
            </h3>
            <table className="print-table">
              <thead>
                <tr>
                  <th style={{ width: "80px" }}>Date</th>
                  <th style={{ width: "90px" }}>Bill #</th>
                  <th>Vendor / Party</th>
                  <th>Project</th>
                  <th style={{ width: "90px", textAlign: "right" }}>Total (₹)</th>
                </tr>
              </thead>
              <tbody>
                {dayData.bills.map((b, idx) => (
                  <tr key={idx}>
                    <td>{formatDate(b.billDate || b.createdAt)}</td>
                    <td className="font-mono">{b.billNumber}</td>
                    <td className="font-semibold">{b.party?.name}</td>
                    <td>{b.project?.name || "General"}</td>
                    <td style={{ textAlign: "right", fontWeight: "bold" }}>{formatCurrency(b.totalAmount || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Section 4: Daily Site Reports & Observations */}
        {dayData?.dailyReports && dayData.dailyReports.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-1 border-b border-slate-300 pb-0.5">
              4. Daily Site Progress & Log Notes ({dayData.dailyReports.length})
            </h3>
            <div className="space-y-2 text-xs">
              {dayData.dailyReports.map((dr, idx) => (
                <div key={idx} className="border border-slate-300 rounded p-2 bg-slate-50">
                  <div className="font-bold text-slate-900 flex justify-between">
                    <span>{dr.project?.name} ({dr.project?.site?.name})</span>
                    <span className="text-[10px] text-slate-500">By {dr.creator?.name || "Supervisor"}</span>
                  </div>
                  {dr.progressSummary && <div className="mt-1 text-slate-700"><strong>Progress:</strong> {dr.progressSummary}</div>}
                  {dr.blockers && <div className="mt-0.5 text-rose-700"><strong>Issues:</strong> {dr.blockers}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Verification & Signatures Block */}
        <div className="mt-8 pt-4 border-t-2 border-slate-800">
          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-8 text-center">
            Verification & Authorization Sign-Off
          </div>
          <div className="grid grid-cols-3 gap-6 text-center text-xs">
            <div className="border-t border-slate-400 pt-2">
              <div className="font-bold text-slate-900">Prepared By</div>
              <div className="text-slate-500 text-[10px]">Site Supervisor / Accountant</div>
              <div className="text-slate-400 text-[10px] mt-4">Signature & Date</div>
            </div>
            <div className="border-t border-slate-400 pt-2">
              <div className="font-bold text-slate-900">Verified By</div>
              <div className="text-slate-500 text-[10px]">Project Manager / Resident Engineer</div>
              <div className="text-slate-400 text-[10px] mt-4">Signature & Date</div>
            </div>
            <div className="border-t border-slate-400 pt-2">
              <div className="font-bold text-slate-900">Approved By</div>
              <div className="text-slate-500 text-[10px]">Finance Controller / Authorized Signatory</div>
              <div className="text-slate-400 text-[10px] mt-4">Signature & Date</div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
