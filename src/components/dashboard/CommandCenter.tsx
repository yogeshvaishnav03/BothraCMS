"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  BookOpenCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  HardHat,
  IndianRupee,
  PackageMinus,
  PackagePlus,
  ReceiptText,
  RefreshCw,
  Sparkles,
  Timer,
  Users,
  Wallet,
  GitCommitHorizontal,
  ExternalLink,
  X,
  AlertTriangle,
  CheckSquare,
  Clock,
  CheckCircle2,
  User,
  Search,
  Building2,
  Tag,
  FileText,
  Check,
  Receipt,
  Paperclip,
} from "lucide-react";
import ApprovalsWidget from "@/components/dashboard/ApprovalsWidget";
import TaskTimeline from "@/components/tasks/TaskTimeline";
import { ContactActions } from "@/components/ui/ContactActions";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCompactINR, formatCompactNumber, formatCurrency, formatDate, formatDateTime } from "@/lib/formatters";
import { useLanguage } from "@/lib/i18n";

type Kind = "PAYMENT" | "MONEY_IN" | "BILL" | "RECEIPT" | "ISSUE" | "ATTENDANCE" | "HEADCOUNT" | "SITE_REPORT";

interface TimelineEntry {
  id: string;
  kind: Kind;
  at: string;
  title: string;
  detail: string;
  amount?: number;
  actor?: string;
  href: string;
}

interface Overview {
  date: string;
  summary: {
    totalPaymentsAmount: number;
    totalMoneyInAmount?: number;
    totalBillsAmount: number;
    paymentsCount: number;
    billsCount: number;
    receiptsCount: number;
    issuesCount: number;
    workersPresentCount: number;
    headcountTotal: number;
    staffPresentCount: number;
    reportsCount: number;
  };
  timeline: TimelineEntry[];
  timelineTotal: number;
  approvals: {
    paymentsPendingCount: number;
    paymentsPendingAmount: number;
    pendingPaymentsList?: {
      id: string;
      amount: number;
      referenceNumber: string;
      recipientName: string;
      recipientType: string;
      costHead?: string | null;
      method?: string | null;
      notes?: string | null;
      approvalQuery?: string | null;
      paymentDate: string | Date;
      createdAt: string | Date;
      projectName?: string | null;
      siteName?: string | null;
      creatorName?: string | null;
    }[];
    paymentsRejectedCount?: number;
    ordersPendingCount: number;
    materialRequestsPending: number;
  };
  payments?: {
    id: string;
    amount: number;
    referenceNumber: string;
    recipientName: string;
    recipientType: string;
    costHead?: string | null;
    method?: string | null;
    payingAccount?: string | null;
    notes?: string | null;
    approvalQuery?: string | null;
    status: string;
    paymentDate: string | Date;
    createdAt: string | Date;
    projectName?: string | null;
    siteName?: string | null;
    creatorName?: string | null;
    attachments?: any[];
  }[];
  bills?: {
    id: string;
    billNumber: string;
    totalAmount: number;
    paidAmount: number;
    outstandingAmount: number;
    partyName?: string | null;
    projectName?: string | null;
    billDate: string | Date;
    dueDate?: string | Date | null;
    status: string;
  }[];
  unpaidBills?: {
    id: string;
    billNumber: string;
    totalAmount: number;
    paidAmount: number;
    outstandingAmount: number;
    partyName?: string | null;
    projectName?: string | null;
    siteName?: string | null;
    billDate: string | Date;
    dueDate?: string | Date | null;
    status: string;
  }[];
  attention?: { openSafety: number; drawingsWaiting: number; payrollDraft: number; equipmentDown: number; customerOverdue: number };
  projects: {
    projectId: string;
    name: string;
    siteName: string | null;
    budget: number;
    actual: number;
    committed: number;
    usedPercent: number | null;
    health: "NO_BUDGET" | "OK" | "WATCH" | "OVER";
    progress: number | null;
    delayedStages: number;
  }[];
  finance: { outstandingPayables: number; trend: { date: string; paid: number; billed: number; received?: number }[] };
  team: {
    userId: string;
    name: string;
    role: string;
    actions: number;
    taskUpdates: number;
    lastActiveAt: string;
    updates?: {
      id: string;
      at: string;
      action: string;
      details: string | null;
      entityType?: string | null;
      entityId?: string | null;
      before?: string | null;
      after?: string | null;
    }[];
  }[];
  activity: { id: string; at: string; actor: string; action: string; entityType: string; reason: string | null }[];
  taskFeed: {
    id: string;
    at: string;
    actor: string;
    taskId: string;
    taskTitle: string;
    kind: "STATUS" | "UPDATE" | "COMMENT";
    text: string;
    status: string | null;
    note: string | null;
    photos: string[];
  }[];
  people: {
    expected: number;
    submitted: number;
    missing: { userId: string; name: string; phone: string | null }[];
    present: number;
    onLeave: number;
    hours: number;
    withBlockers: number;
  };
  recentActivityDates: string[];
  dueTasks?: {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    status: string;
    dueAt: string | null;
    isOverdue: boolean;
    projectName: string;
    assigneeName: string;
    assigneeRole: string | null;
    creatorName: string | null;
    createdAt: string;
  }[];
  dueTasksCount?: number;
  overdueTasksCount?: number;
}

const FEED_STATUS_TONE: Record<string, string> = {
  IN_PROGRESS: "bg-blue-50 text-blue-700 ring-blue-200",
  BLOCKED: "bg-rose-50 text-rose-700 ring-rose-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  VERIFIED: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  TODO: "bg-slate-50 text-slate-600 ring-slate-200",
};

const KIND_META: Record<Kind, { label: string; hiLabel: string; Icon: LucideIcon; dot: string; chip: string }> = {
  PAYMENT: { label: "Payments", hiLabel: "भुगतान", Icon: Wallet, dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700 ring-rose-200" },
  MONEY_IN: { label: "Money in", hiLabel: "प्राप्ति", Icon: IndianRupee, dot: "bg-teal-500", chip: "bg-teal-50 text-teal-700 ring-teal-200" },
  BILL: { label: "Bills", hiLabel: "बिल", Icon: ReceiptText, dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700 ring-violet-200" },
  RECEIPT: { label: "Material in", hiLabel: "सामग्री प्राप्त", Icon: PackagePlus, dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  ISSUE: { label: "Material out", hiLabel: "सामग्री जारी", Icon: PackageMinus, dot: "bg-amber-500", chip: "bg-amber-50 text-amber-800 ring-amber-200" },
  ATTENDANCE: { label: "Attendance", hiLabel: "हाज़िरी", Icon: Timer, dot: "bg-sky-500", chip: "bg-sky-50 text-sky-700 ring-sky-200" },
  HEADCOUNT: { label: "Labour", hiLabel: "मज़दूर", Icon: HardHat, dot: "bg-orange-500", chip: "bg-orange-50 text-orange-700 ring-orange-200" },
  SITE_REPORT: { label: "Site reports", hiLabel: "साइट रिपोर्ट", Icon: ClipboardList, dot: "bg-indigo-500", chip: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
};

function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime()) || d.getTime() === 0) return "";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

function greeting(hi: boolean): string {
  const hour = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  if (hi) return hour < 12 ? "सुप्रभात" : hour < 17 ? "नमस्कार" : "शुभ संध्या";
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function humanize(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function parseJsonSafe(str?: string | null): Record<string, any> | null {
  if (!str) return null;
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Counts up from 0 to `value` when it first appears or changes. */
function useCountUp(value: number, durationMs = 700): number {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      setShown(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);
  return shown;
}

function HeroStat({
  label,
  value,
  format,
  sub,
  Icon,
  tone,
  href,
  onClick,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  sub?: string;
  Icon: LucideIcon;
  tone: string;
  href?: string;
  onClick?: () => void;
}) {
  const shown = useCountUp(value);
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 leading-tight">{label}</span>
        <span className={cn("hidden sm:flex w-8 h-8 rounded-xl items-center justify-center shrink-0", tone)}>
          <Icon className="w-4 h-4" aria-hidden />
        </span>
      </div>
      <div className="mt-2 font-display text-2xl sm:text-[28px] font-extrabold text-white tabular-nums tracking-tight truncate">
        {format(shown)}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-400 line-clamp-2">{sub}</div>}
      <ArrowUpRight className="absolute right-3 bottom-3 w-4 h-4 text-slate-400 lg:text-slate-500 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity" aria-hidden />
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="text-left w-full group relative rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] ring-1 ring-white/10 hover:ring-white/20 p-4 transition-colors min-w-0 cursor-pointer"
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href || "#"}
      className="group relative rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] ring-1 ring-white/10 hover:ring-white/20 p-4 transition-colors min-w-0"
    >
      {content}
    </Link>
  );
}

function MiniStat({ label, value, Icon, tone, href }: { label: string; value: string; Icon: LucideIcon; tone: string; href: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md hover:border-slate-300 p-3.5 transition-all min-w-0"
    >
      <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1", tone)}>
        <Icon className="w-5 h-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="font-display text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums tracking-tight leading-tight truncate">{value}</div>
        <div className="text-xs text-slate-500 leading-tight line-clamp-2">{label}</div>
      </div>
    </Link>
  );
}

export default function CommandCenter({ userName, siteId }: { userName?: string; siteId?: string }) {
  const { language, t } = useLanguage();
  const hi = language === "hi";
  const [date, setDate] = useState<string>(todayIst());
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<Kind | "ALL">("ALL");
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [expandedTeamUsers, setExpandedTeamUsers] = useState<Record<string, boolean>>({});
  const [expandedUpdateId, setExpandedUpdateId] = useState<string | null>(null);
  const [showApprovalsModal, setShowApprovalsModal] = useState(false);
  const [showPaidModal, setShowPaidModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [paidSearch, setPaidSearch] = useState("");
  const [pendingTab, setPendingTab] = useState<"APPROVALS" | "BILLS">("APPROVALS");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const totalPendingPaise = useMemo(() => {
    const pendingApprovals = data?.approvals?.paymentsPendingAmount || 0;
    const pendingPayables = data?.finance?.outstandingPayables || 0;
    return pendingApprovals + pendingPayables;
  }, [data]);

  const filteredPaidPayments = useMemo(() => {
    const list = data?.payments || [];
    if (!paidSearch.trim()) return list;
    const q = paidSearch.toLowerCase();
    return list.filter(
      (p) =>
        p.recipientName?.toLowerCase().includes(q) ||
        p.referenceNumber?.toLowerCase().includes(q) ||
        p.notes?.toLowerCase().includes(q) ||
        p.approvalQuery?.toLowerCase().includes(q) ||
        p.costHead?.toLowerCase().includes(q) ||
        p.projectName?.toLowerCase().includes(q) ||
        p.siteName?.toLowerCase().includes(q) ||
        p.creatorName?.toLowerCase().includes(q)
    );
  }, [data?.payments, paidSearch]);

  const handleApprovePayment = async (paymentId: string) => {
    try {
      setApprovingId(paymentId);
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "PAYMENT",
          entityId: paymentId,
          action: "APPROVE",
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        await load();
      }
    } catch (e) {
      console.error("Failed to approve payment:", e);
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectPayment = async (paymentId: string) => {
    const reason = prompt("Enter decline reason (optional):") || undefined;
    try {
      setRejectingId(paymentId);
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "PAYMENT",
          entityId: paymentId,
          action: "REJECT",
          reason,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        await load();
      }
    } catch (e) {
      console.error("Failed to decline payment:", e);
    } finally {
      setRejectingId(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowPaidModal(false);
        setShowPendingModal(false);
        setShowApprovalsModal(false);
        setSelectedTimelineTask(null);
      }
    };
    if (showPaidModal || showPendingModal || showApprovalsModal || selectedTimelineTask) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [showPaidModal, showPendingModal, showApprovalsModal, selectedTimelineTask]);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [taskDueFilter, setTaskDueFilter] = useState<"ALL" | "OVERDUE">("ALL");
  const [selectedTimelineTask, setSelectedTimelineTask] = useState<{
    id: string;
    title: string;
    status: string;
    projectId?: string | null;
  } | null>(null);
  const isToday = date === todayIst();

  const filteredDueTasks = useMemo(() => {
    const list = data?.dueTasks || [];
    if (taskDueFilter === "OVERDUE") {
      return list.filter((t) => t.isOverdue);
    }
    return list;
  }, [data?.dueTasks, taskDueFilter]);

  const handleCompleteTask = async (taskId: string) => {
    if (completingTaskId === taskId) return;
    try {
      setCompletingTaskId(taskId);
      const res = await fetch(`/api/tasks/${taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to mark task as completed");
      }
      setData((prev) => {
        if (!prev) return prev;
        const updatedList = (prev.dueTasks || []).filter((t) => t.id !== taskId);
        const updatedOverdue = updatedList.filter((t) => t.isOverdue).length;
        return {
          ...prev,
          dueTasks: updatedList,
          dueTasksCount: updatedList.length,
          overdueTasksCount: updatedOverdue,
        };
      });
      load(true);
    } catch (e: any) {
      alert(e.message || "Failed to complete task");
    } finally {
      setCompletingTaskId(null);
    }
  };

  const toggleTeamUser = (userId: string) => {
    setExpandedTeamUsers((prev) => ({
      ...prev,
      [userId]: !(prev[userId] ?? (data?.team.length === 1 || (data?.team.find((m) => m.userId === userId)?.updates?.length || 0) > 0)),
    }));
  };

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const q = new URLSearchParams({ date });
        if (siteId) q.set("siteId", siteId);
        const res = await fetch(`/api/dashboard/command-center?${q}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message || "Could not load the Command Center");
        setData(json.data);
        setError(null);
        setRefreshedAt(new Date());
      } catch (e: any) {
        setError(e.message || "Could not load the Command Center");
      } finally {
        setLoading(false);
      }
    },
    [date, siteId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Keep today's view live without a manual refresh.
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => { if (typeof document === "undefined" || !document.hidden) load(true); }, 60_000);
    return () => clearInterval(id);
  }, [isToday, load]);

  const timeline = useMemo(
    () => (data?.timeline || []).filter((e) => kindFilter === "ALL" || e.kind === kindFilter),
    [data, kindFilter]
  );
  const kindCounts = useMemo(() => {
    const c: Partial<Record<Kind, number>> = {};
    (data?.timeline || []).forEach((e) => (c[e.kind] = (c[e.kind] || 0) + 1));
    return c;
  }, [data]);

  const s = data?.summary;
  const approvalsCount =
    (data?.approvals.paymentsPendingCount || 0) +
    (data?.approvals.ordersPendingCount || 0) +
    (data?.approvals.materialRequestsPending || 0) +
    (data?.approvals.paymentsRejectedCount || 0);
  const longDate = new Date(`${date}T00:00:00`).toLocaleDateString(hi ? "hi-IN" : "en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section className="space-y-4" aria-label={t("cc.title", "Command Center")}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-chrome text-white p-5 sm:p-6 shadow-xl ring-1 ring-white/5 animate-fade-up">
        <div className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl" />

        <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
              <Sparkles className="w-3.5 h-3.5" aria-hidden />
              {t("cc.title", "Command Center")}
              {isToday && (
                <span className="ml-1 inline-flex items-center gap-1 text-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-ring" />
                  {hi ? "लाइव" : "Live"}
                </span>
              )}
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight">
              {greeting(hi)}
              {userName ? `, ${userName.split(" ")[0]}` : ""}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {hi ? "पूरी कंपनी की आज की डे बुक — " : "The whole company's Day Book for "}
              <span className="text-slate-200 font-medium">{longDate}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl bg-white/10 ring-1 ring-white/15 p-1">
              <button
                type="button"
                onClick={() => setDate(shiftDate(date, -1))}
                className="p-1.5 rounded-lg hover:bg-white/10"
                aria-label={hi ? "पिछला दिन" : "Previous day"}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <label className="flex items-center gap-1.5 px-1.5 text-sm">
                <CalendarDays className="w-4 h-4 text-amber-300" aria-hidden />
                <input
                  type="date"
                  value={date}
                  max={todayIst()}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  className="bg-transparent border-0 p-0 text-sm text-white focus:ring-0 focus:shadow-none [color-scheme:dark] w-[8.5rem]"
                  aria-label={hi ? "तारीख चुनें" : "Choose date"}
                />
              </label>
              <button
                type="button"
                onClick={() => setDate(shiftDate(date, 1))}
                disabled={isToday}
                className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label={hi ? "अगला दिन" : "Next day"}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            {!isToday && (
              <button
                type="button"
                onClick={() => setDate(todayIst())}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/10 ring-1 ring-white/15 hover:bg-white/15"
              >
                {hi ? "आज" : "Today"}
              </button>
            )}
            <button
              type="button"
              onClick={() => load()}
              className="p-2 rounded-xl bg-white/10 ring-1 ring-white/15 hover:bg-white/15"
              title={refreshedAt ? `${hi ? "अपडेट" : "Updated"} ${refreshedAt.toLocaleTimeString("en-IN")}` : undefined}
              aria-label={hi ? "रिफ्रेश" : "Refresh"}
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </button>
            <Link
              href="/day-book"
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-brand shadow-glow hover:brightness-110 transition flex items-center gap-1.5"
            >
              <BookOpenCheck className="w-4 h-4" aria-hidden />
              {hi ? "पूरी डे बुक" : "Full Day Book"}
            </Link>
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
          <HeroStat
            label={hi ? "कुल भुगतान" : "Total Paid"}
            value={s?.totalPaymentsAmount || 0}
            format={formatCompactINR}
            sub={`${s?.paymentsCount || 0} ${hi ? "भुगतान" : "payments"}${s?.totalMoneyInAmount ? ` · ${formatCompactINR(s.totalMoneyInAmount)} ${hi ? "प्राप्त" : "received"}` : ""}`}
            Icon={CheckCircle2}
            tone="bg-emerald-500/15 text-emerald-300"
            onClick={() => setShowPaidModal(true)}
          />
          <HeroStat
            label={hi ? "कुल लंबित" : "Total Pending"}
            value={totalPendingPaise}
            format={formatCompactINR}
            sub={`${data?.approvals?.paymentsPendingCount || 0} ${hi ? "मंज़ूरी लंबित" : "pending approval"}${
              (data?.unpaidBills?.length || 0) > 0 ? ` · ${data?.unpaidBills?.length} ${hi ? "देय बिल" : "bills due"}` : ""
            }`}
            Icon={Clock}
            tone="bg-amber-500/15 text-amber-300"
            onClick={() => setShowPendingModal(true)}
          />
          <HeroStat
            label={hi ? "साइट पर लोग" : "People on site"}
            value={s?.workersPresentCount || 0}
            format={formatCompactNumber}
            sub={`${s?.staffPresentCount || 0} ${hi ? "स्टाफ हाज़िर" : "staff checked in"}`}
            Icon={HardHat}
            tone="bg-amber-500/15 text-amber-300"
            href="/workforce"
          />
          <HeroStat
            label={hi ? "मंज़ूरी बाकी" : "Waiting approval"}
            value={approvalsCount}
            format={formatCompactNumber}
            sub={
              data
                ? `${formatCompactINR(data.approvals.paymentsPendingAmount)} ${hi ? "भुगतान" : "in payments"}${
                    data.approvals.paymentsRejectedCount ? ` · ${data.approvals.paymentsRejectedCount} ${hi ? "अस्वीकृत" : "rejected"}` : ""
                  } · ${data.approvals.ordersPendingCount} ${hi ? "खरीद ऑर्डर" : "purchase orders"}`
                : undefined
            }
            Icon={BadgeCheck}
            tone="bg-emerald-500/15 text-emerald-300"
            onClick={() => setShowApprovalsModal(true)}
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 text-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>{error}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load()}
              className="px-3 py-1 bg-white border border-rose-300 rounded-lg text-rose-700 font-medium hover:bg-rose-100 text-xs shadow-sm transition"
            >
              {hi ? "फिर कोशिश करें" : "Try Again"}
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await fetch("/api/admin/db-sync");
                  const json = await res.json();
                  if (json.success) {
                    await load();
                  }
                } catch {}
              }}
              className="px-3 py-1 bg-rose-700 text-white rounded-lg font-medium hover:bg-rose-800 text-xs shadow-sm transition"
            >
              {hi ? "डेटा रिफ्रेश करें" : "Refresh & Repair Data"}
            </button>
          </div>
        </div>
      )}

      {/* ── Secondary stats (Material receipts & issues removed; Due & Overdue tasks added) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
        <MiniStat
          label={hi ? "लंबित देय कार्य" : "Due tasks"}
          value={data ? formatCompactNumber(data.dueTasksCount ?? 0) : "–"}
          Icon={CheckSquare}
          tone="bg-amber-50 text-amber-600 ring-amber-100"
          href="#command-center-due-tasks"
        />
        <MiniStat
          label={hi ? "समय सीमा समाप्त" : "Overdue tasks"}
          value={data ? formatCompactNumber(data.overdueTasksCount ?? 0) : "–"}
          Icon={AlertTriangle}
          tone={
            (data?.overdueTasksCount || 0) > 0
              ? "bg-rose-50 text-rose-600 ring-rose-200"
              : "bg-emerald-50 text-emerald-600 ring-emerald-100"
          }
          href="/tasks?filter=overdue"
        />
        <MiniStat
          label={hi ? "साइट रिपोर्ट" : "Site reports filed"}
          value={s ? formatCompactNumber(s.reportsCount) : "–"}
          Icon={ClipboardList}
          tone="bg-indigo-50 text-indigo-600 ring-indigo-100"
          href="/day-book"
        />
        <MiniStat
          label={hi ? "कुल बकाया देनदारी" : "Total payables due"}
          value={data ? formatCompactINR(data.finance.outstandingPayables) : "–"}
          Icon={IndianRupee}
          tone="bg-rose-50 text-rose-600 ring-rose-100"
          href="/finance?tab=bills&status=pending"
        />
      </div>

      {/* ── Pending Approvals & Requests Queue (Dashboard View) ── */}
      {approvalsCount > 0 && (
        <div id="command-center-approvals" className="animate-in fade-in duration-200">
          <ApprovalsWidget onActionComplete={() => load()} />
        </div>
      )}

      {/* ── Due Tasks Awaiting Completion (Dashboard View) ── */}
      <div id="command-center-due-tasks" className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 min-w-0 space-y-4 animate-in fade-in duration-200">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-amber-500/15 text-amber-600">
              <CheckSquare className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                <span>{hi ? "लंबित एवं देय कार्य" : "Due Tasks Awaiting Completion"}</span>
                {data && (data.dueTasksCount || 0) > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    {data.dueTasksCount} {hi ? "बाकी" : "pending"}
                  </span>
                )}
                {data && (data.overdueTasksCount || 0) > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 flex items-center gap-1 animate-pulse">
                    <AlertTriangle className="w-3 h-3" />
                    {data.overdueTasksCount} {hi ? "अतिदेय" : "overdue"}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500">
                {hi
                  ? "ये कार्य पूरे होने तक डैशबोर्ड पर दिखते रहेंगे।"
                  : "Tasks due for completion — remains on the dashboard until marked completed."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {data && (data.overdueTasksCount || 0) > 0 && (
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setTaskDueFilter("ALL")}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-semibold transition cursor-pointer",
                    taskDueFilter === "ALL"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  {hi ? "सभी देय" : "All Due"} ({data.dueTasksCount || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setTaskDueFilter("OVERDUE")}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-semibold transition flex items-center gap-1 cursor-pointer",
                    taskDueFilter === "OVERDUE"
                      ? "bg-rose-600 text-white shadow-2xs"
                      : "text-rose-600 hover:text-rose-700"
                  )}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>{hi ? "अतिदेय" : "Overdue"}</span>
                  <span className="text-[10px] bg-rose-200 text-rose-900 px-1.5 py-0.2 rounded-full font-bold">
                    {data.overdueTasksCount}
                  </span>
                </button>
              </div>
            )}
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline shrink-0"
            >
              <span>{hi ? "टास्क बोर्ड खोलें" : "Open Task Board"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* List of Due Tasks */}
        {!data ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading due tasks...</div>
        ) : filteredDueTasks.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
            <div className="font-semibold text-slate-700 text-sm">
              {hi ? "शानदार! सभी कार्य पूरे हो चुके हैं" : "All Caught Up!"}
            </div>
            <p className="mt-0.5 text-slate-500">
              {taskDueFilter === "OVERDUE"
                ? (hi ? "वर्तमान में कोई अतिदेय कार्य नहीं है। सब कुछ समय पर है!" : "No overdue tasks found. Everything is on schedule!")
                : (hi ? "वर्तमान में कोई लंबित या देय कार्य नहीं है।" : "No outstanding tasks pending completion.")}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
            {filteredDueTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => setSelectedTimelineTask({
                  id: task.id,
                  title: task.title,
                  status: task.status,
                  projectId: null,
                })}
                className={cn(
                  "p-3.5 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group shadow-2xs",
                  task.isOverdue
                    ? "bg-rose-50/40 border-rose-200 hover:border-rose-300 hover:bg-rose-50/70"
                    : "bg-slate-50/60 border-slate-200 hover:border-slate-300 hover:bg-slate-100/70"
                )}
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm group-hover:text-amber-700 transition-colors">
                      {task.title}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 border",
                        task.priority === "CRITICAL"
                          ? "bg-rose-100 text-rose-800 border-rose-300"
                          : task.priority === "DAILY"
                          ? "bg-purple-100 text-purple-800 border-purple-300"
                          : task.priority === "HIGH"
                          ? "bg-amber-100 text-amber-800 border-amber-300"
                          : "bg-slate-100 text-slate-700 border-slate-300"
                      )}
                    >
                      {task.priority}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700">
                      {task.status.replace("_", " ")}
                    </span>
                    {task.isOverdue && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-600 text-white uppercase tracking-wider inline-flex items-center gap-1 shadow-2xs animate-pulse">
                        <AlertTriangle className="w-3 h-3" />
                        <span>OVERDUE</span>
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <span className="text-slate-400">Project:</span>
                      <strong className="text-slate-700">{task.projectName}</strong>
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <strong className="text-slate-700">{task.assigneeName}</strong>
                    </span>
                    {task.dueAt && (
                      <span className={cn("flex items-center gap-1 font-semibold", task.isOverdue ? "text-rose-600" : "text-slate-600")}>
                        <Clock className="w-3.5 h-3.5" />
                        <span>Due: {formatDate(task.dueAt)}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={completingTaskId === task.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCompleteTask(task.id);
                    }}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                    title={hi ? "कार्य पूर्ण के रूप में चिह्नित करें" : "Mark task as completed"}
                  >
                    {completingTaskId === task.id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>{hi ? "पूरा करें" : "Mark Complete"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTimelineTask({
                        id: task.id,
                        title: task.title,
                        status: task.status,
                        projectId: null,
                      });
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>{hi ? "विवरण" : "Details"}</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2 space-y-4 min-w-0">
        {/* ── Day Book timeline ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-[15px] font-bold text-slate-900 flex items-center gap-2">
                <BookOpenCheck className="w-4 h-4 text-amber-500" aria-hidden />
                {hi ? "आज की डे बुक" : "Day Book timeline"}
              </h2>
              <p className="text-xs text-slate-500">
                {data
                  ? `${data.timelineTotal} ${hi ? "प्रविष्टियाँ" : "entries across all areas"}`
                  : hi
                  ? "लोड हो रहा है…"
                  : "Loading…"}
              </p>
            </div>
            <Link
              href={`/day-book?from=${date}&to=${date}${siteId ? `&siteId=${siteId}` : ""}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-bold text-xs transition"
            >
              <BookOpenCheck className="w-3.5 h-3.5 text-amber-600" />
              <span>{hi ? "पूरी डे बुक" : "Full Day Book"}</span>
              <ArrowRight className="w-3 h-3 text-amber-600" />
            </Link>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setKindFilter("ALL")}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ring-1 transition",
                kindFilter === "ALL" ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
              )}
            >
              {hi ? "सभी" : "All"} {data ? `· ${data.timeline.length}` : ""}
            </button>
            {(Object.keys(KIND_META) as Kind[])
              .filter((k) => kindCounts[k])
              .map((k) => {
                const m = KIND_META[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKindFilter(kindFilter === k ? "ALL" : k)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ring-1 transition flex items-center gap-1.5",
                      kindFilter === k ? m.chip : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
                    )}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full", m.dot)} />
                    {hi ? m.hiLabel : m.label} · {kindCounts[k]}
                  </button>
                );
              })}
          </div>

          {loading && !data ? (
            <div className="space-y-3 mt-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="skeleton w-9 h-9 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-3.5 w-2/3" />
                    <div className="skeleton h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : timeline.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100 flex items-center justify-center animate-float">
                <CalendarDays className="w-5 h-5" />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-800">
                {hi ? "इस दिन कोई प्रविष्टि नहीं" : "Nothing recorded on this day yet"}
              </p>
              {data?.recentActivityDates?.length ? (
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {data.recentActivityDates.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDate(d)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700"
                    >
                      {hi ? "देखें" : "Jump to"} {d}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <ol className="relative mt-2 max-h-[640px] overflow-y-auto pr-1.5 [scrollbar-width:thin] stagger">
                {timeline.map((e) => {
                  const m = KIND_META[e.kind];
                  return (
                    <li key={e.id} className="relative pl-12 pb-3 last:pb-0">
                      <span className="absolute left-[17px] top-9 bottom-0 w-px bg-slate-200" aria-hidden />
                      <span className={cn("absolute left-0 top-0 w-9 h-9 rounded-xl flex items-center justify-center ring-1", m.chip)}>
                        <m.Icon className="w-4 h-4" aria-hidden />
                      </span>
                      <Link
                        href={e.href}
                        className="block rounded-xl px-3 py-2 -mx-1 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">{e.title}</div>
                            <div className="text-xs text-slate-500 truncate">
                              {[e.detail, e.actor && `${hi ? "द्वारा" : "by"} ${e.actor}`].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {typeof e.amount === "number" ? (
                              <div
                                className={cn(
                                  "text-sm font-bold tabular-nums whitespace-nowrap",
                                  e.kind === "PAYMENT" ? "text-rose-600" : "text-slate-900"
                                )}
                                title={formatCurrency(e.amount)}
                              >
                                {e.kind === "PAYMENT" ? "−" : ""}
                                {formatCompactINR(e.amount)}
                              </div>
                            ) : e.kind === "HEADCOUNT" ? (
                              <div className="text-[11px] font-bold text-orange-800 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-md inline-block">
                                {e.title.split(" ")[0]} {hi ? "श्रमिक" : "Workers"}
                              </div>
                            ) : e.kind === "ATTENDANCE" ? (
                              <div className="text-[10px] font-bold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md inline-block uppercase">
                                {hi ? "चेक-इन" : "Check-In"}
                              </div>
                            ) : e.kind === "SITE_REPORT" ? (
                              <div className="text-[10px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md inline-block uppercase">
                                {hi ? "दैनिक रिपोर्ट" : "Daily Report"}
                              </div>
                            ) : null}
                            <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">{timeOf(e.at)}</div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ol>

              {/* Timeline Footer */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  {hi ? "दिखाए जा रहे हैं" : "Showing"} <strong className="font-semibold text-slate-900">{timeline.length}</strong> {hi ? "में से" : "of"} <strong className="font-semibold text-slate-900">{data?.timelineTotal || timeline.length}</strong> {hi ? "प्रविष्टियाँ" : "entries"}
                </span>
                <Link
                  href={`/day-book?from=${date}&to=${date}${siteId ? `&siteId=${siteId}` : ""}`}
                  className="font-bold text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1"
                >
                  <span>{hi ? "पूरी डे बुक लेज़र देखें" : "View complete Day Book ledger"}</span>
                  <span>&rarr;</span>
                </Link>
              </div>
            </>
          )}
        </div>

        {/* ── Task updates from the field ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-bold text-slate-900 flex items-center gap-2">
              <GitCommitHorizontal className="w-4 h-4 text-amber-500" aria-hidden />
              {hi ? "काम की अपडेट" : "Task updates"}
            </h2>
            <Link href="/tasks" className="text-xs font-semibold text-amber-600 hover:text-amber-700">
              {hi ? "सभी काम" : "All tasks"}
            </Link>
          </div>
          {!data ? (
            <div className="skeleton h-32" />
          ) : data.taskFeed.length === 0 ? (
            <p className="text-xs text-slate-500">{hi ? "इस दिन कोई अपडेट नहीं।" : "No task updates on this day."}</p>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto pr-1">
              {data.taskFeed.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedTimelineTask({
                      id: f.taskId,
                      title: f.taskTitle,
                      status: f.status || "TODO",
                      projectId: null,
                    })}
                    className="w-full text-left flex gap-3 py-2.5 rounded-lg hover:bg-slate-50 px-1 -mx-1 transition-colors cursor-pointer"
                  >
                    <span className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-800 to-slate-600 text-amber-300 text-[10px] font-bold flex items-center justify-center shrink-0">
                      {initials(f.actor)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">{f.actor}</span> {f.text}
                        {f.status && (
                          <span className={cn("ml-1.5 inline-flex rounded-full px-1.5 py-px text-[10px] font-bold ring-1 align-middle", FEED_STATUS_TONE[f.status] || FEED_STATUS_TONE.TODO)}>
                            {f.status.replace("_", " ").toLowerCase()}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-medium text-slate-500 truncate">{f.taskTitle}</div>
                      {f.note && <div className="text-xs text-slate-600 mt-0.5 line-clamp-2">{f.note}</div>}
                      {f.photos.length > 0 && (
                        <div className="flex gap-1.5 mt-1.5">
                          {f.photos.slice(0, 4).map((url) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={url} src={url} alt="" loading="lazy" className="w-12 h-12 rounded-lg object-cover border border-slate-200" />
                          ))}
                          {f.photos.length > 4 && (
                            <span className="w-12 h-12 rounded-lg bg-slate-100 text-xs font-bold text-slate-500 flex items-center justify-center">+{f.photos.length - 4}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{timeOf(f.at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        </div>

        {/* ── Right rail ──────────────────────────────────────────────────── */}
        <div className="space-y-4 min-w-0">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5">
            <h2 className="text-[15px] font-bold text-slate-900 flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-amber-500" aria-hidden />
              {hi ? "टीम ने आज क्या किया" : "Who did what"}
            </h2>
            {!data ? (
              <div className="space-y-2">
                <div className="skeleton h-9" />
                <div className="skeleton h-9" />
              </div>
            ) : data.team.length === 0 ? (
              <p className="text-xs text-slate-500">{hi ? "इस दिन कोई गतिविधि दर्ज नहीं हुई।" : "No recorded activity by staff on this day."}</p>
            ) : (
              <ul className="space-y-3">
                {data.team.slice(0, 8).map((m) => {
                  const totalUpdates = m.actions + m.taskUpdates;
                  const isExpanded = expandedTeamUsers[m.userId] ?? (data.team.length === 1);

                  return (
                    <li key={m.userId} className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-2.5 transition hover:border-slate-300">
                      <div
                        onClick={() => toggleTeamUser(m.userId)}
                        className="flex items-center gap-3 cursor-pointer select-none"
                      >
                        <span className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-800 to-slate-600 text-amber-300 text-xs font-bold flex items-center justify-center shrink-0 shadow-2xs">
                          {initials(m.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900 truncate">{m.name}</span>
                            <span className="text-[10px] text-amber-800 bg-amber-50 font-bold px-1.5 py-0.2 rounded border border-amber-200/60 uppercase">
                              {m.role.replace(/_/g, " ")}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            {hi ? "आखिरी" : "Last"} {timeOf(m.lastActiveAt)}
                            {m.updates?.[0] && !isExpanded && (
                              <span className="text-slate-600 font-medium ml-1.5 truncate">
                                · {humanize(m.updates[0].action)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <div className="text-sm font-bold text-slate-900 tabular-nums">{totalUpdates}</div>
                            <div className="text-[10px] text-slate-400">{hi ? "काम" : "updates"}</div>
                          </div>
                          <div className="text-slate-400 hover:text-slate-600 p-0.5">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-slate-500" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-500" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Updates Breakdown */}
                      {isExpanded && (
                        <div className="mt-2.5 pt-2 border-t border-slate-200/80 space-y-1.5">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between mb-1 px-1">
                            <span>{hi ? "हाल के काम / अपडेट" : "Recorded Updates & Activity"}</span>
                            <span className="text-[10px] font-normal text-slate-400">({m.updates?.length || 0})</span>
                          </div>
                          {m.updates && m.updates.length > 0 ? (
                            m.updates.map((u) => {
                              const isItemExpanded = expandedUpdateId === u.id;

                              return (
                                <div
                                  key={u.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedUpdateId(isItemExpanded ? null : u.id);
                                  }}
                                  className={cn(
                                    "text-xs bg-white rounded-xl p-2.5 border transition cursor-pointer select-none shadow-2xs",
                                    isItemExpanded
                                      ? "border-amber-400 ring-2 ring-amber-400/20 bg-amber-50/20"
                                      : "border-slate-200/80 hover:border-amber-300 hover:bg-slate-50/90"
                                  )}
                                  title={hi ? "पूरा विवरण देखें" : "Click to see full details"}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                        <span>{humanize(u.action)}</span>
                                        {u.entityType && (
                                          <span className="text-[9px] font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                                            {u.entityType}
                                          </span>
                                        )}
                                      </div>
                                      {u.details && !isItemExpanded && (
                                        <div className="text-[11px] text-slate-600 truncate mt-0.5 pl-3.5">
                                          {u.details}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-[10px] font-mono font-medium text-slate-500 bg-slate-100/90 px-1.5 py-0.5 rounded border border-slate-200/70">
                                        {timeOf(u.at)}
                                      </span>
                                      <div className="text-slate-400 hover:text-slate-600">
                                        {isItemExpanded ? (
                                          <ChevronUp className="w-3.5 h-3.5 text-amber-600" />
                                        ) : (
                                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Expanded Full Detail View */}
                                  {isItemExpanded && (
                                    <div className="mt-2.5 pt-2.5 border-t border-slate-200/90 space-y-2 text-xs animate-in fade-in duration-150">
                                      {/* Full un-truncated description */}
                                      {u.details && (
                                        <div className="bg-amber-50/90 p-2.5 rounded-lg border border-amber-200/90 text-slate-800 leading-relaxed font-medium">
                                          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-900 mb-0.5">
                                            {hi ? "पूरा विवरण:" : "Details:"}
                                          </div>
                                          <div className="text-xs break-words">{u.details}</div>
                                        </div>
                                      )}

                                      {/* Exact timestamp & entity metadata */}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                                        <div>
                                          <span className="text-slate-400">{hi ? "समय:" : "Time:"}</span>{" "}
                                          <strong className="text-slate-900 font-mono">{formatDateTime(u.at)}</strong>
                                        </div>
                                        {u.entityType && (
                                          <div>
                                            <span className="text-slate-400">{hi ? "रिकॉर्ड प्रकार:" : "Record Type:"}</span>{" "}
                                            <strong className="text-slate-900 font-mono">{u.entityType}</strong>
                                            {u.entityId && (
                                              <span className="text-slate-400 font-mono text-[10px] ml-1">
                                                ({u.entityId.slice(0, 8)}...)
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>

                                      {/* Diff & Field Changes Table */}
                                      {(() => {
                                        const before = parseJsonSafe(u.before);
                                        const after = parseJsonSafe(u.after);
                                        if (!before && !after) return null;

                                        const allKeys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));
                                        const diffKeys = allKeys.filter((k) => !["createdAt", "updatedAt", "version", "id"].includes(k));

                                        if (diffKeys.length === 0) return null;

                                        return (
                                          <div className="bg-white rounded-lg border border-slate-200 p-2.5 space-y-1.5 shadow-2xs">
                                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between">
                                              <span>{hi ? "किए गए बदलाव:" : "What Changed:"}</span>
                                              <span className="text-[9px] text-slate-400">({diffKeys.length} {hi ? "बदलाव" : "fields"})</span>
                                            </div>
                                            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 text-[11px] pr-1">
                                              {diffKeys.map((k) => {
                                                const bVal = before?.[k];
                                                const aVal = after?.[k];
                                                const hasChanged = JSON.stringify(bVal) !== JSON.stringify(aVal);

                                                return (
                                                  <div key={k} className="py-1 flex items-start justify-between gap-2">
                                                    <span className="font-semibold text-slate-700 capitalize shrink-0 max-w-[40%] truncate">
                                                      {humanize(k)}:
                                                    </span>
                                                    <div className="text-right text-slate-800 break-all font-mono text-[10px]">
                                                      {before && bVal !== undefined && hasChanged && (
                                                        <span className="text-rose-600 line-through mr-1.5 opacity-80">
                                                          {typeof bVal === "object" ? JSON.stringify(bVal) : String(bVal)}
                                                        </span>
                                                      )}
                                                      <span className={hasChanged ? "text-emerald-700 font-bold" : "text-slate-700"}>
                                                        {aVal !== undefined
                                                          ? typeof aVal === "object"
                                                            ? JSON.stringify(aVal)
                                                            : String(aVal)
                                                          : "—"}
                                                      </span>
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })()}

                                      {/* Action Navigation Links */}
                                      <div className="flex items-center justify-between pt-1">
                                        <div className="flex items-center gap-3">
                                          {u.entityType === "PARTY" && (
                                            <Link
                                              href={u.entityId ? `/parties?q=${encodeURIComponent(u.entityId)}` : "/parties"}
                                              onClick={(e) => e.stopPropagation()}
                                              className="text-[11px] font-bold text-amber-700 hover:text-amber-800 hover:underline inline-flex items-center gap-1"
                                            >
                                              <span>{hi ? "वेंडर / ठेकेदार देखें" : "View Vendor / Contractor"}</span>
                                              <ExternalLink className="w-3 h-3" />
                                            </Link>
                                          )}
                                          {u.entityType === "BILL" && (
                                            <Link
                                              href="/finance?tab=bills"
                                              onClick={(e) => e.stopPropagation()}
                                              className="text-[11px] font-bold text-amber-700 hover:text-amber-800 hover:underline inline-flex items-center gap-1"
                                            >
                                              <span>{hi ? "बिल देखें" : "View Bills"}</span>
                                              <ExternalLink className="w-3 h-3" />
                                            </Link>
                                          )}
                                          {u.entityType === "TASK" && (
                                            <Link
                                              href="/tasks"
                                              onClick={(e) => e.stopPropagation()}
                                              className="text-[11px] font-bold text-amber-700 hover:text-amber-800 hover:underline inline-flex items-center gap-1"
                                            >
                                              <span>{hi ? "काम देखें" : "View Tasks"}</span>
                                              <ExternalLink className="w-3 h-3" />
                                            </Link>
                                          )}
                                          <Link
                                            href="/audit"
                                            onClick={(e) => e.stopPropagation()}
                                            className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:underline inline-flex items-center gap-1"
                                          >
                                            <span>{hi ? "बदलाव इतिहास" : "Change History"}</span>
                                            <ExternalLink className="w-3 h-3" />
                                          </Link>
                                        </div>

                                        <span className="text-[10px] text-amber-700 hover:text-amber-900 font-semibold">
                                          {hi ? "बंद करें ▴" : "Hide details ▴"}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-xs text-slate-400 italic py-1 px-1">
                              {hi ? "कोई विस्तृत रिकॉर्ड नहीं मिला" : "No detailed updates found for this day."}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ── Pending Approvals Modal ── */}
      {showApprovalsModal && (
        <div 
          className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in"
          onClick={() => setShowApprovalsModal(false)}
        >
          <div 
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
              <div className="font-bold text-slate-900 dark:text-slate-100 text-lg flex items-center gap-2.5">
                <span className="p-2 bg-amber-500/15 text-amber-600 rounded-xl">
                  <BadgeCheck className="w-5 h-5" />
                </span>
                <span>{hi ? "मंज़ूरी के लिए लंबित अनुरोध" : "Pending Requests Waiting for Approval"}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowApprovalsModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <ApprovalsWidget
                showHeader={false}
                onActionComplete={() => {
                  load();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Total Paid Details Modal ── */}
      {showPaidModal && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in"
          onClick={() => setShowPaidModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
              <div className="font-bold text-slate-900 dark:text-slate-100 text-lg flex items-center gap-2.5">
                <span className="p-2 bg-emerald-500/15 text-emerald-600 rounded-xl">
                  <CheckCircle2 className="w-5 h-5" />
                </span>
                <div>
                  <div className="leading-snug">{hi ? "कुल भुगतान का विवरण" : "Total Paid Details"}</div>
                  <div className="text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                    {longDate} • {formatCurrency(s?.totalPaymentsAmount || 0)} ({s?.paymentsCount || 0} {hi ? "भुगतान" : "payments"})
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPaidModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={hi ? "भुगतान खोजें (प्राप्तकर्ता, संदर्भ, कारण)..." : "Search payments by payee, ref #, or purpose..."}
                  value={paidSearch}
                  onChange={(e) => setPaidSearch(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>
            </div>

            {/* Body: Payments List */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
              {filteredPaidPayments.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <CheckCircle2 className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">
                    {paidSearch ? (hi ? "कोई भुगतान नहीं मिला" : "No matching payments found") : (hi ? "इस तारीख पर कोई भुगतान दर्ज नहीं है" : "No payments recorded for this date")}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {hi ? "पेमेंट्स और बिल सेक्शन से नया भुगतान जोड़ें।" : "Record a payment in the Finance section."}
                  </p>
                </div>
              ) : (
                filteredPaidPayments.map((p: any) => {
                  const rType = p.recipientType || "VENDOR";
                  return (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs hover:border-slate-300 transition"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate">
                              {p.recipientName}
                            </span>
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded border bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700">
                              {rType === "OUT_OF_POCKET" ? "CASH EXPENSE" : rType}
                            </span>
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              PAID
                            </span>
                          </div>

                          {/* Account & Method */}
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-700 dark:text-slate-300">{p.payingAccount || "Company Account"}</span>
                            <span>•</span>
                            <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-bold">{p.method || "BANK"}</span>
                            {p.siteName && (
                              <>
                                <span>•</span>
                                <span className="text-amber-700 dark:text-amber-400">📍 {p.siteName}</span>
                              </>
                            )}
                          </div>

                          {/* Purpose / Query */}
                          {(p.approvalQuery || p.notes) && (
                            <div className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg break-words">
                              {p.approvalQuery || p.notes}
                            </div>
                          )}

                          <div className="text-[10px] text-slate-400 mt-1.5 font-mono flex items-center gap-2">
                            <span>Ref: {p.referenceNumber}</span>
                            {p.creatorName && <span>• By: {p.creatorName}</span>}
                          </div>
                        </div>

                        {/* Amount */}
                        <div className="text-right shrink-0">
                          <div className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-base">
                            {formatCurrency(p.amount)}
                          </div>
                          {p.attachments && p.attachments.length > 0 && (
                            <a
                              href={`/api/uploads/${p.attachments[0].fileId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 hover:text-amber-700 mt-1 hover:underline"
                            >
                              <Paperclip className="w-3 h-3" />
                              <span>Receipt</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex items-center justify-between gap-3 shrink-0">
              <Link
                href="/finance?tab=payments"
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 flex items-center gap-1 hover:underline"
              >
                <span>{hi ? "पेमेंट्स रजिस्टर में सभी देखें" : "Open Payments Register"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => setShowPaidModal(false)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                {hi ? "बंद करें" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Total Pending Details Modal ── */}
      {showPendingModal && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in"
          onClick={() => setShowPendingModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
              <div className="font-bold text-slate-900 dark:text-slate-100 text-lg flex items-center gap-2.5">
                <span className="p-2 bg-amber-500/15 text-amber-600 rounded-xl">
                  <Clock className="w-5 h-5" />
                </span>
                <div>
                  <div className="leading-snug">{hi ? "कुल लंबित विवरण" : "Total Pending Details"}</div>
                  <div className="text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                    {hi ? "कुल लंबित राशि:" : "Total Pending Obligations:"} <span className="font-bold text-amber-700 dark:text-amber-400">{formatCurrency(totalPendingPaise)}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPendingModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab switch: Pending Approvals vs Unpaid Bills */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-2 gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setPendingTab("APPROVALS")}
                className={cn(
                  "flex-1 py-2 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer",
                  pendingTab === "APPROVALS"
                    ? "bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs border border-slate-200 dark:border-slate-800"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                )}
              >
                <BadgeCheck className="w-4 h-4" />
                <span>{hi ? "मंज़ूरी के लिए लंबित" : "Payments Waiting Approval"}</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                  {data?.approvals?.pendingPaymentsList?.length || data?.approvals?.paymentsPendingCount || 0}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPendingTab("BILLS")}
                className={cn(
                  "flex-1 py-2 px-3 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer",
                  pendingTab === "BILLS"
                    ? "bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs border border-slate-200 dark:border-slate-800"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                )}
              >
                <ReceiptText className="w-4 h-4" />
                <span>{hi ? "देय वेंडर बिल" : "Unpaid Vendor Bills"}</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-300">
                  {data?.unpaidBills?.length || 0}
                </span>
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
              {pendingTab === "APPROVALS" ? (
                /* Tab 1: Pending Approvals list with direct Approve / Decline */
                (!data?.approvals?.pendingPaymentsList || data.approvals.pendingPaymentsList.length === 0) ? (
                  <div className="py-12 text-center text-slate-400">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">
                      {hi ? "कोई लंबित मंज़ूरी नहीं है" : "No pending payments waiting for approval"}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {hi ? "₹20,000 या अधिक के भुगतान मंज़ूरी के लिए यहाँ दिखेंगे।" : "Payments of ₹20,000 or above requiring admin approval will appear here."}
                    </p>
                  </div>
                ) : (
                  data.approvals.pendingPaymentsList.map((p: any) => (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/20 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate">
                              {p.recipientName}
                            </span>
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                              {p.recipientType === "OUT_OF_POCKET" ? "CASH EXPENSE" : p.recipientType}
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-mono">
                              APPROVAL PENDING (₹20,000+)
                            </span>
                          </div>

                          {(p.approvalQuery || p.notes) && (
                            <div className="text-xs text-slate-700 dark:text-slate-300 mt-1.5 bg-white/80 dark:bg-slate-900/80 p-2 rounded-lg break-words">
                              {p.approvalQuery || p.notes}
                            </div>
                          )}

                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                            {p.siteName && <span className="text-amber-700 dark:text-amber-400">📍 {p.siteName}</span>}
                            {p.creatorName && <span>• Submitted By: {p.creatorName}</span>}
                            <span>• Ref: {p.referenceNumber}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-mono font-black text-amber-700 dark:text-amber-400 text-base">
                            {formatCurrency(p.amount)}
                          </div>
                          <div className="flex items-center gap-1.5 mt-2 justify-end">
                            <button
                              type="button"
                              onClick={() => handleApprovePayment(p.id)}
                              disabled={approvingId === p.id}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-lg shadow-xs transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <Check className="w-3 h-3" />
                              <span>{approvingId === p.id ? "..." : (hi ? "मंज़ूर करें" : "Approve")}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRejectPayment(p.id)}
                              disabled={rejectingId === p.id}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] rounded-lg shadow-xs transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <X className="w-3 h-3" />
                              <span>{rejectingId === p.id ? "..." : (hi ? "अस्वीकार" : "Decline")}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )
              ) : (
                /* Tab 2: Unpaid Vendor Bills */
                (!data?.unpaidBills || data.unpaidBills.length === 0) ? (
                  <div className="py-12 text-center text-slate-400">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">
                      {hi ? "कोई देय बिल लंबित नहीं है" : "All vendor bills are fully paid"}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {hi ? "सभी बिल चुकता हैं।" : "No outstanding payables currently owed."}
                    </p>
                  </div>
                ) : (
                  data.unpaidBills.map((b: any) => (
                    <div
                      key={b.id}
                      className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate">
                              {b.partyName}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">
                              Bill #{b.billNumber}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                            {b.siteName && <span>📍 {b.siteName}</span>}
                            <span>• Bill Date: {formatDate(b.billDate)}</span>
                            {b.dueDate && <span className="text-rose-600 font-semibold">• Due: {formatDate(b.dueDate)}</span>}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-[11px] text-slate-400">{hi ? "बकाया राशि" : "Balance Due"}</div>
                          <div className="font-mono font-black text-rose-600 dark:text-rose-400 text-base">
                            {formatCurrency(b.outstandingAmount)}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Total: {formatCurrency(b.totalAmount)}
                          </div>
                          <Link
                            href="/finance?tab=bills"
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700 mt-1.5 hover:underline"
                          >
                            <span>{hi ? "भुगतान करें" : "Pay Bill →"}</span>
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex items-center justify-between gap-3 shrink-0">
              <Link
                href="/finance"
                className="text-xs font-bold text-amber-700 hover:text-amber-800 dark:text-amber-400 flex items-center gap-1 hover:underline"
              >
                <span>{hi ? "फाइनेंस और बिल सेक्शन खोलें" : "Open Payments & Bills"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => setShowPendingModal(false)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                {hi ? "बंद करें" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Task Details / Timeline Sheet ── */}
      {selectedTimelineTask && (
        <TaskTimeline
          task={selectedTimelineTask}
          canWrite={true}
          onClose={() => setSelectedTimelineTask(null)}
          onChanged={() => {
            load(true);
          }}
        />
      )}
    </section>
  );
}
