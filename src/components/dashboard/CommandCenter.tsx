"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  BookOpenCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  HardHat,
  IndianRupee,
  PackageMinus,
  PackagePlus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  Wallet,
  GitCommitHorizontal,
  NotebookPen,
  Building2,
} from "lucide-react";
import { ContactActions } from "@/components/ui/ContactActions";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCompactINR, formatCurrency } from "@/lib/formatters";
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
  approvals: { paymentsPendingCount: number; paymentsPendingAmount: number; ordersPendingCount: number; materialRequestsPending: number };
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
  team: { userId: string; name: string; role: string; actions: number; taskUpdates: number; lastActiveAt: string }[];
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
}

const HEALTH_TONE: Record<string, { label: string; hiLabel: string; pill: string; bar: string }> = {
  OK: { label: "On budget", hiLabel: "बजट में", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", bar: "bg-emerald-500" },
  WATCH: { label: "Near limit", hiLabel: "सीमा के पास", pill: "bg-amber-50 text-amber-800 ring-amber-200", bar: "bg-amber-500" },
  OVER: { label: "Over budget", hiLabel: "बजट से ज़्यादा", pill: "bg-rose-50 text-rose-700 ring-rose-200", bar: "bg-rose-500" },
  NO_BUDGET: { label: "No budget", hiLabel: "बजट नहीं", pill: "bg-slate-50 text-slate-600 ring-slate-200", bar: "bg-slate-400" },
};

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
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  sub?: string;
  Icon: LucideIcon;
  tone: string;
  href: string;
}) {
  const shown = useCountUp(value);
  return (
    <Link
      href={href}
      className="group relative rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] ring-1 ring-white/10 hover:ring-white/20 p-4 transition-colors min-w-0"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 leading-tight">{label}</span>
        <span className={cn("hidden sm:flex w-8 h-8 rounded-xl items-center justify-center shrink-0", tone)}>
          <Icon className="w-4 h-4" aria-hidden />
        </span>
      </div>
      <div className="mt-2 font-display text-2xl sm:text-[28px] font-extrabold text-white tabular-nums tracking-tight">
        {format(shown)}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-400 line-clamp-2">{sub}</div>}
      <ArrowUpRight className="absolute right-3 bottom-3 w-4 h-4 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
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
        <div className="font-display text-lg font-extrabold text-slate-900 tabular-nums leading-tight">{value}</div>
        <div className="text-xs text-slate-500 leading-tight line-clamp-2">{label}</div>
      </div>
    </Link>
  );
}

/** Seven days of cash paid vs bills booked, as paired bars with hover values. */
function CashTrend({ trend, hi }: { trend: Overview["finance"]["trend"]; hi: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...trend.map((d) => Math.max(d.paid, d.billed, d.received || 0)));
  const showIn = trend.some((d) => (d.received || 0) > 0);
  const W = 280;
  const H = 120;
  const slot = W / trend.length;
  const barW = showIn ? Math.min(9, slot / 4) : Math.min(12, slot / 3);
  const active = hover !== null ? trend[hover] : trend[trend.length - 1];

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="text-xs text-slate-500">
          {new Date(`${active?.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
            {hi ? "भुगतान" : "Paid"} <b className="text-slate-900 tabular-nums">{formatCompactINR(active?.paid)}</b>
          </span>
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-400" />
            {hi ? "बिल" : "Billed"} <b className="text-slate-900 tabular-nums">{formatCompactINR(active?.billed)}</b>
          </span>
          {showIn && (
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-sm bg-teal-500" />
              {hi ? "प्राप्त" : "Received"} <b className="text-slate-900 tabular-nums">{formatCompactINR(active?.received || 0)}</b>
            </span>
          )}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full h-auto" role="img" aria-label="Cash paid and bills booked over the last seven days">
        <line x1="0" x2={W} y1={H} y2={H} stroke="#e3e7ef" strokeWidth="1" />
        {trend.map((d, i) => {
          const cx = slot * i + slot / 2;
          const hp = (d.paid / max) * (H - 8);
          const hb = (d.billed / max) * (H - 8);
          const dim = hover !== null && hover !== i;
          return (
            <g key={d.date} opacity={dim ? 0.4 : 1} style={{ transition: "opacity 150ms" }}>
              {showIn ? (
                <>
                  <rect x={cx - barW * 1.5 - 2} y={H - hp} width={barW} height={Math.max(hp, 0)} rx="3" fill="#f59e0b" />
                  <rect x={cx - barW / 2} y={H - hb} width={barW} height={Math.max(hb, 0)} rx="3" fill="#94a3b8" />
                  <rect x={cx + barW / 2 + 2} y={H - ((d.received || 0) / max) * (H - 8)} width={barW} height={Math.max(((d.received || 0) / max) * (H - 8), 0)} rx="3" fill="#14b8a6" />
                </>
              ) : (
                <>
                  <rect x={cx - barW - 1} y={H - hp} width={barW} height={Math.max(hp, 0)} rx="3" fill="#f59e0b" />
                  <rect x={cx + 1} y={H - hb} width={barW} height={Math.max(hb, 0)} rx="3" fill="#94a3b8" />
                </>
              )}
              <text x={cx} y={H + 13} textAnchor="middle" fontSize="9" fill="#64748b">
                {new Date(`${d.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "narrow" })}
              </text>
              <rect
                x={slot * i}
                y="0"
                width={slot}
                height={H + 18}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <title>{`${d.date}: paid ${formatCurrency(d.paid)}, billed ${formatCurrency(d.billed)}${showIn ? `, received ${formatCurrency(d.received || 0)}` : ""}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
    </div>
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
  const isToday = date === todayIst();

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
    const id = setInterval(() => load(true), 60_000);
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
  const approvalsCount = (data?.approvals.paymentsPendingCount || 0) + (data?.approvals.ordersPendingCount || 0);
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
            label={hi ? "आज भुगतान" : "Cash paid"}
            value={s?.totalPaymentsAmount || 0}
            format={formatCompactINR}
            sub={`${s?.paymentsCount || 0} ${hi ? "भुगतान" : "payments"}${s?.totalMoneyInAmount ? ` · ${formatCompactINR(s.totalMoneyInAmount)} ${hi ? "प्राप्त" : "received"}` : ""}`}
            Icon={ArrowUpRight}
            tone="bg-rose-500/15 text-rose-300"
            href="/finance"
          />
          <HeroStat
            label={hi ? "बिल दर्ज" : "Bills booked"}
            value={s?.totalBillsAmount || 0}
            format={formatCompactINR}
            sub={`${s?.billsCount || 0} ${hi ? "बिल" : "bills"}`}
            Icon={ArrowDownLeft}
            tone="bg-violet-500/15 text-violet-300"
            href="/finance"
          />
          <HeroStat
            label={hi ? "साइट पर लोग" : "People on site"}
            value={s?.workersPresentCount || 0}
            format={(n) => Math.round(n).toLocaleString("en-IN")}
            sub={`${s?.staffPresentCount || 0} ${hi ? "स्टाफ हाज़िर" : "staff checked in"}`}
            Icon={HardHat}
            tone="bg-amber-500/15 text-amber-300"
            href="/workforce"
          />
          <HeroStat
            label={hi ? "मंज़ूरी बाकी" : "Waiting approval"}
            value={approvalsCount}
            format={(n) => Math.round(n).toString()}
            sub={
              data
                ? `${formatCompactINR(data.approvals.paymentsPendingAmount)} ${hi ? "भुगतान" : "in payments"} · ${data.approvals.ordersPendingCount} ${hi ? "ऑर्डर" : "POs"}`
                : undefined
            }
            Icon={BadgeCheck}
            tone="bg-emerald-500/15 text-emerald-300"
            href="/finance"
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
              Retry
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
              Sync Database Schema
            </button>
          </div>
        </div>
      )}

      {/* ── Secondary stats ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
        <MiniStat
          label={hi ? "सामग्री प्राप्त (GRN)" : "Material receipts"}
          value={String(s?.receiptsCount ?? "–")}
          Icon={PackagePlus}
          tone="bg-emerald-50 text-emerald-600 ring-emerald-100"
          href="/materials"
        />
        <MiniStat
          label={hi ? "सामग्री जारी" : "Material issues"}
          value={String(s?.issuesCount ?? "–")}
          Icon={PackageMinus}
          tone="bg-amber-50 text-amber-600 ring-amber-100"
          href="/materials"
        />
        <MiniStat
          label={hi ? "साइट रिपोर्ट" : "Site reports filed"}
          value={String(s?.reportsCount ?? "–")}
          Icon={ClipboardList}
          tone="bg-indigo-50 text-indigo-600 ring-indigo-100"
          href="/day-book"
        />
        <MiniStat
          label={hi ? "कुल बकाया देनदारी" : "Total payables due"}
          value={data ? formatCompactINR(data.finance.outstandingPayables) : "–"}
          Icon={IndianRupee}
          tone="bg-rose-50 text-rose-600 ring-rose-100"
          href="/finance"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* ── Day Book timeline ───────────────────────────────────────────── */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-[15px] font-bold text-slate-900 flex items-center gap-2">
                <BookOpenCheck className="w-4 h-4 text-amber-500" aria-hidden />
                {hi ? "आज की डे बुक" : "Day Book timeline"}
              </h2>
              <p className="text-xs text-slate-500">
                {data
                  ? `${data.timelineTotal} ${hi ? "प्रविष्टियाँ" : "entries across all modules"}`
                  : hi
                  ? "लोड हो रहा है…"
                  : "Loading…"}
              </p>
            </div>
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
            <ol className="relative mt-2 max-h-[560px] overflow-y-auto pr-1 stagger">
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
                          {typeof e.amount === "number" && (
                            <div
                              className={cn(
                                "text-sm font-bold tabular-nums",
                                e.kind === "PAYMENT" ? "text-rose-600" : "text-slate-900"
                              )}
                            >
                              {e.kind === "PAYMENT" ? "−" : ""}
                              {formatCurrency(e.amount)}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-400 tabular-nums">{timeOf(e.at)}</div>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* ── Right rail ──────────────────────────────────────────────────── */}
        <div className="space-y-4 min-w-0">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5">
            <h2 className="text-[15px] font-bold text-slate-900 flex items-center gap-2 mb-3">
              <IndianRupee className="w-4 h-4 text-amber-500" aria-hidden />
              {hi ? "पिछले 7 दिन का कैश" : "Cash, last 7 days"}
            </h2>
            {data ? <CashTrend trend={data.finance.trend} hi={hi} /> : <div className="skeleton h-32" />}
          </div>

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
              <ul className="space-y-2.5">
                {data.team.slice(0, 8).map((m) => (
                  <li key={m.userId} className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-800 to-slate-600 text-amber-300 text-xs font-bold flex items-center justify-center shrink-0">
                      {initials(m.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 truncate">{m.name}</div>
                      <div className="text-[11px] text-slate-500 truncate capitalize">
                        {m.role.toLowerCase().replace(/_/g, " ")} · {hi ? "आखिरी" : "last"} {timeOf(m.lastActiveAt)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-slate-900 tabular-nums">{m.actions + m.taskUpdates}</div>
                      <div className="text-[10px] text-slate-400">{hi ? "काम" : "updates"}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-500" aria-hidden />
                {hi ? "लाइव गतिविधि" : "Live activity"}
              </h2>
              <Link href="/audit" className="text-xs font-semibold text-amber-600 hover:text-amber-700">
                {hi ? "सब देखें" : "View all"}
              </Link>
            </div>
            {!data ? (
              <div className="skeleton h-24" />
            ) : data.activity.length === 0 ? (
              <p className="text-xs text-slate-500">{hi ? "कोई बदलाव दर्ज नहीं।" : "No changes recorded on this day."}</p>
            ) : (
              <ul className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {data.activity.map((a) => (
                  <li key={a.id} className="flex gap-2.5 text-xs">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-900">{a.actor}</span>{" "}
                      <span className="text-slate-600">{humanize(a.action)}</span>
                      {a.reason && <div className="text-slate-500 truncate">{a.reason}</div>}
                      <div className="text-[11px] text-slate-400">{timeOf(a.at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* ── Task updates from the field ─────────────────────────────────── */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 min-w-0">
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
                  <Link href={`/tasks?task=${f.taskId}`} className="flex gap-3 py-2.5 rounded-lg hover:bg-slate-50 px-1 -mx-1 transition-colors">
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
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Staff today: attendance and work reports ───────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-bold text-slate-900 flex items-center gap-2">
              <NotebookPen className="w-4 h-4 text-amber-500" aria-hidden />
              {hi ? "स्टाफ़ की रिपोर्ट" : "Staff work reports"}
            </h2>
            <Link href={`/work-reports?tab=team&date=${date}`} className="text-xs font-semibold text-amber-600 hover:text-amber-700">
              {hi ? "खोलें" : "Open"}
            </Link>
          </div>
          {!data ? (
            <div className="skeleton h-32" />
          ) : (
            <>
              <div className="flex items-end gap-2">
                <span className="font-display text-3xl font-extrabold text-slate-900 tabular-nums">{data.people.submitted}</span>
                <span className="text-sm text-slate-500 pb-1">/ {data.people.expected} {hi ? "रिपोर्ट आईं" : "reports in"}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-brand transition-all"
                  style={{ width: `${data.people.expected ? Math.min(100, (data.people.submitted / data.people.expected) * 100) : 0}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                {[
                  { v: data.people.present, l: hi ? "हाज़िर" : "Present" },
                  { v: data.people.hours, l: hi ? "घंटे" : "Hours" },
                  { v: data.people.withBlockers, l: hi ? "रुकावटें" : "Blockers" },
                ].map((x) => (
                  <div key={x.l} className="rounded-xl bg-slate-50 py-2">
                    <div className="text-base font-bold text-slate-900 tabular-nums">{x.v}</div>
                    <div className="text-[11px] text-slate-500">{x.l}</div>
                  </div>
                ))}
              </div>
              {data.people.missing.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs font-semibold text-slate-700 mb-2">{hi ? "रिपोर्ट बाकी" : "Not filed yet"}</div>
                  <ul className="space-y-2">
                    {data.people.missing.map((m) => (
                      <li key={m.userId} className="flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-800 truncate">{m.name}</span>
                        <ContactActions
                          phone={m.phone}
                          chatUserId={m.userId}
                          message={`Hi ${m.name.split(" ")[0]}, please file your daily work report in Bothra CMS (Daily Work).`}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Project health: progress vs budget used ──────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-[15px] font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-500" aria-hidden />
            {hi ? "प्रोजेक्ट की स्थिति" : "Project health"}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {data?.attention &&
              [
                { n: data.attention.drawingsWaiting, href: "/drawings", en: "drawings to approve", one: "drawing to approve", hi: "ड्रॉइंग स्वीकृति बाकी", tone: "bg-blue-50 text-blue-700 ring-blue-200" },
                { n: data.attention.payrollDraft, href: "/payroll", en: "payrolls to approve", one: "payroll to approve", hi: "वेतन स्वीकृति बाकी", tone: "bg-violet-50 text-violet-700 ring-violet-200" },
              ]
                .filter((c) => c.n > 0)
                .map((c) => (
                  <Link key={c.href} href={c.href} className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ring-1 ${c.tone}`}>
                    {c.n} {hi ? c.hi : c.n === 1 ? c.one : c.en}
                  </Link>
                ))}
            {data?.attention && data.attention.customerOverdue > 0 && (
              <span className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-200">
                {formatCompactINR(data.attention.customerOverdue)} {hi ? "ग्राहक बकाया" : "overdue from customers"}
              </span>
            )}
            {data && data.approvals.materialRequestsPending > 0 && (
              <Link
                href="/material-requests?status=PENDING"
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                {data.approvals.materialRequestsPending} {hi ? "सामग्री मांग बाकी" : data.approvals.materialRequestsPending === 1 ? "material request waiting" : "material requests waiting"}
              </Link>
            )}
            <Link href="/projects" className="text-xs font-semibold text-amber-600 hover:text-amber-700">
              {hi ? "सभी प्रोजेक्ट" : "All projects"}
            </Link>
          </div>
        </div>
        {!data ? (
          <div className="skeleton h-32" />
        ) : data.projects.length === 0 ? (
          <p className="text-xs text-slate-500">{hi ? "कोई सक्रिय प्रोजेक्ट नहीं।" : "No active projects."}</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1">
            <div className="hidden lg:grid col-span-full grid-cols-[minmax(0,1.4fr)_1fr_1fr] gap-4 text-[11px] text-slate-400 pb-1">
              <span>{hi ? "प्रोजेक्ट" : "Project"}</span>
              <span>{hi ? "काम पूरा" : "Work done"}</span>
              <span>{hi ? "बजट खर्च" : "Budget spent"}</span>
            </div>
            {data.projects.map((p) => {
              const tone = HEALTH_TONE[p.health];
              return (
                <Link
                  key={p.projectId}
                  href={`/projects/${p.projectId}?tab=PROGRESS`}
                  className="col-span-full grid grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_1fr_1fr] items-center gap-2 sm:gap-4 rounded-xl px-2 py-2.5 -mx-2 hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{p.name}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      <span className={cn("rounded-full px-1.5 py-px text-[10px] font-bold ring-1", tone.pill)}>{hi ? tone.hiLabel : tone.label}</span>
                      {p.delayedStages > 0 && (
                        <span className="rounded-full px-1.5 py-px text-[10px] font-bold ring-1 bg-rose-50 text-rose-700 ring-rose-200">
                          {p.delayedStages} {hi ? "चरण लेट" : p.delayedStages === 1 ? "stage late" : "stages late"}
                        </span>
                      )}
                      {p.siteName && <span className="text-[11px] text-slate-400 truncate">{p.siteName}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${p.progress ?? 0}%` }} />
                    </div>
                    <span className="w-12 text-right text-xs font-bold tabular-nums text-slate-800">{p.progress === null ? "—" : `${Math.round(p.progress)}%`}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                      <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${Math.min(100, p.usedPercent ?? 0)}%` }} />
                    </div>
                    <span className="w-12 text-right text-xs font-bold tabular-nums text-slate-800" title={`${formatCompactINR(p.actual)} of ${formatCompactINR(p.budget)}`}>
                      {p.usedPercent === null ? "—" : `${Math.round(p.usedPercent)}%`}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
