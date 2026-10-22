"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Edit2, IndianRupee, Loader2, Save, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCompactINR, formatCurrency } from "@/lib/formatters";

type Health = "NO_BUDGET" | "OK" | "WATCH" | "OVER";

interface HeadRow {
  costHead: string;
  label: string;
  budget: number;
  actual: number;
  committed: number;
  forecast: number;
  variance: number;
  usedPercent: number | null;
  health: Health;
  notes: string | null;
}

interface BudgetData {
  heads: HeadRow[];
  totals: {
    budget: number;
    allocated: number;
    unallocated: number;
    actual: number;
    committed: number;
    forecast: number;
    variance: number;
    paid: number;
    usedPercent: number | null;
    health: Health;
  };
  monthly: { month: string; actual: number }[];
  topParties: { name: string; amount: number }[];
}

const HEALTH: Record<Health, { label: string; pill: string; Icon: React.ElementType }> = {
  OK: { label: "On budget", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: CheckCircle2 },
  WATCH: { label: "Close to limit", pill: "bg-amber-50 text-amber-800 ring-amber-200", Icon: AlertTriangle },
  OVER: { label: "Over budget", pill: "bg-rose-50 text-rose-700 ring-rose-200", Icon: AlertTriangle },
  NO_BUDGET: { label: "No budget set", pill: "bg-slate-50 text-slate-600 ring-slate-200", Icon: AlertTriangle },
};

function monthLabel(key: string) {
  return new Date(`${key}-15T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
}

/** Budget track with actual (solid) and committed (light) spend laid over it. */
function SpendBar({ budget, actual, committed }: { budget: number; actual: number; committed: number }) {
  const scale = Math.max(budget, actual + committed, 1);
  const a = (actual / scale) * 100;
  const c = (committed / scale) * 100;
  const over = budget > 0 && actual + committed > budget;
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={cn("absolute inset-y-0 left-0 rounded-l-full", over ? "bg-rose-500" : "bg-amber-500")} style={{ width: `${a}%` }} />
      <div
        className={cn("absolute inset-y-0", over ? "bg-rose-200" : "bg-amber-200")}
        style={{ left: `calc(${a}% + ${a > 0 ? 2 : 0}px)`, width: `${c}%` }}
      />
      {budget > 0 && budget < scale && (
        <div className="absolute inset-y-0 w-0.5 bg-slate-900" style={{ left: `${(budget / scale) * 100}%` }} title="Budget" />
      )}
    </div>
  );
}

function MonthlyChart({ months }: { months: { month: string; actual: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...months.map((m) => m.actual), 1);
  return (
    <div>
      <div className="flex h-32 items-end gap-2">
        {months.map((m, i) => (
          <div
            key={m.month}
            className="relative flex h-full flex-1 flex-col items-center justify-end"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && (
              <div className="absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white shadow-lg">
                {formatCompactINR(m.actual)}
              </div>
            )}
            <div
              className={cn("w-full max-w-[36px] rounded-t transition-colors", hover === i ? "bg-amber-600" : "bg-amber-500")}
              style={{ height: `${Math.max(m.actual > 0 ? 4 : 0, (m.actual / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2 border-t border-slate-200 pt-1.5">
        {months.map((m) => (
          <div key={m.month} className="flex-1 text-center text-[11px] text-slate-500">
            {monthLabel(m.month)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProjectBudget({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [data, setData] = useState<BudgetData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/budget`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Could not load the budget");
      setData(json.data);
    } catch (e: any) {
      setError(e.message);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = () => {
    if (!data) return;
    setDraft(Object.fromEntries(data.heads.map((h) => [h.costHead, h.budget ? String(h.budget / 100) : ""])));
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const lines = Object.entries(draft).map(([costHead, v]) => ({ costHead, budgetAmount: Math.round((parseFloat(v) || 0) * 100) }));
      const res = await fetch(`/api/projects/${projectId}/budget`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Could not save the budget");
      setData(json.data);
      setEditing(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return error ? (
      <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
    ) : (
      <div className="space-y-3">
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  const t = data.totals;
  const health = HEALTH[t.health];
  const draftTotal = Object.values(draft).reduce((s, v) => s + (parseFloat(v) || 0) * 100, 0);
  const tiles = [
    { label: "Budget", value: formatCompactINR(t.budget), sub: t.unallocated > 0 ? `${formatCompactINR(t.unallocated)} not split by head` : "Split by cost head" },
    { label: "Spent (billed)", value: formatCompactINR(t.actual), sub: t.usedPercent !== null ? `${t.usedPercent}% of budget` : "No budget yet" },
    { label: "Committed", value: formatCompactINR(t.committed), sub: "Open orders and approved RA work" },
    {
      label: t.variance >= 0 ? "Left after commitments" : "Expected overrun",
      value: formatCompactINR(Math.abs(t.variance)),
      sub: `Paid out so far ${formatCompactINR(t.paid)}`,
      tone: t.variance < 0 ? "text-rose-600" : "text-emerald-600",
    },
  ];

  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 stagger">
        {tiles.map((x) => (
          <div key={x.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
            <div className="text-xs font-semibold text-slate-500">{x.label}</div>
            <div className={cn("mt-1 font-display text-2xl font-extrabold tabular-nums text-slate-900", x.tone)}>{x.value}</div>
            <div className="mt-0.5 truncate text-[11px] text-slate-400">{x.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-5 xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="flex items-center gap-2 text-[15px] font-bold text-slate-900">
                <IndianRupee className="h-4 w-4 text-amber-500" /> Budget vs actual by cost head
              </h3>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1", health.pill)}>
                <health.Icon className="h-3 w-3" /> {health.label}
              </span>
            </div>
            {canEdit &&
              (editing ? (
                <div className="flex gap-2">
                  <button onClick={() => setEditing(false)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="inline-flex items-center gap-1 rounded-lg bg-gradient-brand px-3 py-1.5 text-xs font-bold text-slate-950 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save budget
                  </button>
                </div>
              ) : (
                <button onClick={startEdit} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Edit2 className="h-3.5 w-3.5" /> Set budget
                </button>
              ))}
          </div>

          {!editing && (
            <div className="mb-3 flex flex-wrap gap-4 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-sm bg-amber-500" /> Spent
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-sm bg-amber-200" /> Committed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-0.5 bg-slate-900" /> Budget line (when spend passes it)
              </span>
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {data.heads.map((h) => {
              const hh = HEALTH[h.health];
              const idle = h.budget === 0 && h.actual === 0 && h.committed === 0;
              if (!editing && idle) return null;
              return (
                <div key={h.costHead} className="py-3 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <div className="text-sm font-semibold text-slate-800">{h.label}</div>
                    {editing ? (
                      <label className="flex items-center gap-1.5 text-xs text-slate-500">
                        ₹
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={draft[h.costHead] ?? ""}
                          onChange={(e) => setDraft({ ...draft, [h.costHead]: e.target.value })}
                          placeholder="0"
                          className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm tabular-nums"
                          aria-label={`${h.label} budget in rupees`}
                        />
                      </label>
                    ) : (
                      <div className="text-xs tabular-nums text-slate-500">
                        <span className="font-bold text-slate-900">{formatCompactINR(h.actual)}</span>
                        {h.committed > 0 && <span> + {formatCompactINR(h.committed)} committed</span>}
                        <span> of {h.budget ? formatCompactINR(h.budget) : "no budget"}</span>
                      </div>
                    )}
                  </div>
                  {!editing && (
                    <>
                      <div className="mt-2">
                        <SpendBar budget={h.budget} actual={h.actual} committed={h.committed} />
                      </div>
                      {(h.health === "OVER" || h.health === "WATCH" || h.health === "NO_BUDGET") && (
                        <div className={cn("mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold", h.health === "OVER" ? "text-rose-600" : "text-amber-700")}>
                          <hh.Icon className="h-3 w-3" />
                          {h.health === "OVER"
                            ? `Over by ${formatCompactINR(-h.variance)}`
                            : h.health === "WATCH"
                            ? `Only ${formatCompactINR(h.variance)} left`
                            : "Spending with no budget set"}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {editing && (
            <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="font-semibold text-slate-700">Total</span>
              <span className="font-bold tabular-nums text-slate-900">{formatCurrency(draftTotal)}</span>
            </div>
          )}
          {!editing && data.heads.every((h) => h.budget === 0 && h.actual === 0 && h.committed === 0) && (
            <p className="py-6 text-center text-sm text-slate-500">No budget or spending recorded on this project yet.</p>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-5">
            <h3 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-slate-900">
              <TrendingUp className="h-4 w-4 text-amber-500" /> Spend per month
            </h3>
            <MonthlyChart months={data.monthly} />
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-5">
            <h3 className="mb-3 text-[15px] font-bold text-slate-900">Biggest payees</h3>
            {data.topParties.length === 0 ? (
              <p className="text-xs text-slate-500">No bills or payments on this project yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {data.topParties.map((p) => (
                  <li key={p.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-slate-700">{p.name}</span>
                    <span className="shrink-0 font-bold tabular-nums text-slate-900">{formatCompactINR(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
