"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/cn";
import { submitOrQueue } from "@/lib/offline-queue";
import { api, rupees } from "@/lib/client-api";
import { ChevronLeft, ChevronRight, ClipboardCheck, CloudOff, Loader2, Lock, MapPin, Minus, Plus, Save, Search, Users } from "lucide-react";

type Mark = "PRESENT" | "HALF_DAY" | "ABSENT" | "NONE";
interface Worker {
  id: string;
  name: string;
  code: string;
  trade: string;
  dailyWage: number; // paise
  usualSite: boolean;
  mark: Mark;
  overtimeHours: number;
  locked: boolean;
  elsewhere: string | null;
}
interface Muster {
  project: { id: string; name: string; site: string };
  workDate: string;
  today: string;
  canEdit: boolean;
  backDays: number | null;
  workers: Worker[];
}

const MARKS: { id: Exclude<Mark, "NONE">; short: string; label: string; on: string }[] = [
  { id: "PRESENT", short: "P", label: "Present", on: "bg-emerald-600 text-white ring-emerald-600" },
  { id: "HALF_DAY", short: "½", label: "Half day", on: "bg-amber-500 text-white ring-amber-500" },
  { id: "ABSENT", short: "A", label: "Absent", on: "bg-rose-600 text-white ring-rose-600" },
];
const PROJECT_KEY = "bothra-muster-project";


function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayLabel(date: string, today: string) {
  if (date === today) return "Today";
  if (date === shiftDate(today, -1)) return "Yesterday";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}


function dayWage(w: Worker, mark: Mark, ot: number) {
  if (mark === "PRESENT") return w.dailyWage + (w.dailyWage / 8) * ot;
  if (mark === "HALF_DAY") return w.dailyWage / 2;
  return 0;
}

export default function MusterPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState("");
  const [muster, setMuster] = useState<Muster | null>(null);
  const [marks, setMarks] = useState<Record<string, { mark: Mark; ot: number }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "info"; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api<any>("/api/projects")
      .then((d) => {
        const list = (Array.isArray(d) ? d : d?.projects || []).filter((p: any) => p.status !== "ARCHIVED" && p.status !== "COMPLETED");
        setProjects(list);
        let saved = "";
        try {
          saved = localStorage.getItem(PROJECT_KEY) || "";
        } catch {}
        setProjectId(list.some((p: any) => p.id === saved) ? saved : list[0]?.id || "");
        if (list.length === 0) setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const load = useCallback((pid: string, d: string) => {
    setLoading(true);
    setError(null);
    api<Muster>(`/api/attendance/muster?projectId=${pid}${d ? `&date=${d}` : ""}`)
      .then((m) => {
        setMuster(m);
        setDate(m.workDate);
        setMarks(Object.fromEntries(m.workers.map((w) => [w.id, { mark: w.mark, ot: w.overtimeHours }])));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!projectId) return;
    try {
      localStorage.setItem(PROJECT_KEY, projectId);
    } catch {}
    load(projectId, date);
    // date changes go through goTo, so only the project is watched here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, load]);

  const goTo = (d: string) => {
    setNotice(null);
    setDate(d);
    load(projectId, d);
  };

  const workers = useMemo(() => muster?.workers || [], [muster]);
  const changed = workers.filter((w) => marks[w.id] && (marks[w.id].mark !== w.mark || marks[w.id].ot !== w.overtimeHours));
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workers.filter((w) => {
      if (q) return w.name.toLowerCase().includes(q) || w.code.toLowerCase().includes(q) || w.trade.toLowerCase().includes(q);
      // Others are hidden until asked for, unless already marked here.
      return showAll || w.usualSite || (marks[w.id]?.mark || "NONE") !== "NONE";
    });
  }, [workers, query, showAll, marks]);
  const hiddenCount = workers.length - workers.filter((w) => w.usualSite || (marks[w.id]?.mark || "NONE") !== "NONE").length;

  const totals = useMemo(() => {
    const t = { PRESENT: 0, HALF_DAY: 0, ABSENT: 0, NONE: 0, wages: 0, ot: 0 };
    for (const w of workers) {
      const m = marks[w.id] || { mark: "NONE" as Mark, ot: 0 };
      if (m.mark === "NONE" && !w.usualSite) continue;
      t[m.mark]++;
      t.wages += dayWage(w, m.mark, m.ot);
      if (m.mark === "PRESENT") t.ot += m.ot;
    }
    return t;
  }, [workers, marks]);

  const editable = !!muster?.canEdit;
  const setMark = (w: Worker, mark: Mark) =>
    setMarks((all) => {
      const cur = all[w.id] || { mark: "NONE", ot: 0 };
      // Tapping the chosen mark again clears it.
      const next = cur.mark === mark ? "NONE" : mark;
      return { ...all, [w.id]: { mark: next, ot: next === "PRESENT" ? cur.ot : 0 } };
    });
  const setOt = (w: Worker, delta: number) =>
    setMarks((all) => {
      const cur = all[w.id];
      return { ...all, [w.id]: { ...cur, ot: Math.min(8, Math.max(0, cur.ot + delta)) } };
    });
  const allPresent = () =>
    setMarks((all) => {
      const next = { ...all };
      for (const w of visible) if (!w.locked && (next[w.id]?.mark || "NONE") === "NONE") next[w.id] = { mark: "PRESENT", ot: 0 };
      return next;
    });

  const save = async () => {
    if (!muster || changed.length === 0) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const entries = changed.map((w) => ({ workerId: w.id, mark: marks[w.id].mark, overtimeHours: marks[w.id].ot }));
      const result = await submitOrQueue<Muster & { present: number; halfDay: number; absent: number; kept: number }>({
        label: `Muster: ${muster.project.name}, ${dayLabel(muster.workDate, muster.today).toLowerCase()} (${entries.length} worker${entries.length === 1 ? "" : "s"})`,
        url: "/api/attendance/muster",
        body: { projectId: muster.project.id, workDate: muster.workDate, entries },
      });
      if (result.queued) {
        // Show the marks as saved, so the supervisor can carry on.
        setMuster({ ...muster, workers: muster.workers.map((w) => ({ ...w, mark: marks[w.id]?.mark ?? w.mark, overtimeHours: marks[w.id]?.ot ?? w.overtimeHours })) });
        setNotice({ tone: "info", text: "No signal, so the muster is saved on this phone. It will be sent when you are back online." });
      } else {
        const r = result.data;
        setMuster(r);
        setMarks(Object.fromEntries(r.workers.map((w) => [w.id, { mark: w.mark, ot: w.overtimeHours }])));
        setNotice({
          tone: "success",
          text: `Muster saved for ${dayLabel(r.workDate, r.today).toLowerCase()}.${r.kept ? ` ${r.kept} already corrected by an admin ${r.kept === 1 ? "was" : "were"} left as is.` : ""}`,
        });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const today = muster?.today || "";
  const oldest = muster?.backDays != null && today ? shiftDate(today, -muster.backDays) : null;

  return (
    <Shell>
      <div className="mx-auto max-w-3xl space-y-4 pb-48 lg:pb-28">
        <PageHeader icon={ClipboardCheck} title="Site Muster" subtitle="Mark each worker present, half day or absent. It goes straight into their wages in payroll.">
          <Link href="/attendance" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Attendance
          </Link>
        </PageHeader>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
          <select
            value={projectId}
            onChange={(e) => {
              setNotice(null);
              setProjectId(e.target.value);
            }}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800"
            aria-label="Project"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex items-center rounded-xl border border-slate-200">
            <button
              onClick={() => goTo(shiftDate(date, -1))}
              disabled={!date || (!!oldest && date <= oldest) || loading}
              className="p-2.5 text-slate-500 hover:text-slate-900 disabled:opacity-30"
              aria-label="Day before"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[96px] text-center text-sm font-bold text-slate-800">{date && today ? dayLabel(date, today) : "…"}</span>
            <button
              onClick={() => goTo(shiftDate(date, 1))}
              disabled={!date || date >= today || loading}
              className="p-2.5 text-slate-500 hover:text-slate-900 disabled:opacity-30"
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {notice && (
          <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>
            <span className="inline-flex items-start gap-1.5">
              {notice.tone === "info" && <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />} {notice.text}
            </span>
          </Alert>
        )}
        {error && <Alert tone="error">{error}</Alert>}

        {muster && (
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { n: totals.PRESENT, label: "Present", tone: "text-emerald-700" },
              { n: totals.HALF_DAY, label: "Half day", tone: "text-amber-600" },
              { n: totals.ABSENT, label: "Absent", tone: "text-rose-600" },
              { n: totals.NONE, label: "Not marked", tone: "text-slate-500" },
            ].map((t) => (
              <div key={t.label} className="rounded-xl border border-slate-200/80 bg-white px-1 py-2.5">
                <div className={cn("font-display text-2xl font-extrabold tabular-nums", t.tone)}>{t.n}</div>
                <div className="text-[11px] font-semibold text-slate-500">{t.label}</div>
              </div>
            ))}
          </div>
        )}

        {muster && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a worker"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
            {editable && (
              <button onClick={allPresent} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100">
                <Users className="h-4 w-4" /> Rest present
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading workers…
          </div>
        ) : muster && workers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No site workers yet. Add them on the <Link href="/workforce" className="font-semibold text-amber-700 underline">Workforce</Link> page.
          </div>
        ) : (
          muster && (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
              {visible.map((w) => {
                const m = marks[w.id] || { mark: "NONE" as Mark, ot: 0 };
                const dirty = m.mark !== w.mark || m.ot !== w.overtimeHours;
                return (
                  <li key={w.id} className={cn("px-3 py-3 sm:px-4", dirty && "bg-amber-50/50")}>
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-bold text-slate-900">{w.name}</div>
                        <div className="truncate text-xs text-slate-500">
                          {w.trade.charAt(0) + w.trade.slice(1).toLowerCase().replace(/_/g, " ")} · {w.code}
                          {w.dailyWage > 0 && ` · ${rupees(w.dailyWage)}/day`}
                        </div>
                        {w.elsewhere && (
                          <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700">
                            <MapPin className="h-3 w-3" /> Also marked at {w.elsewhere} today
                          </div>
                        )}
                        {w.locked && (
                          <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                            <Lock className="h-3 w-3" /> Corrected by an admin
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1.5" role="group" aria-label={`Mark ${w.name}`}>
                        {MARKS.map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => setMark(w, opt.id)}
                            disabled={!editable || w.locked}
                            aria-pressed={m.mark === opt.id}
                            aria-label={`${opt.label}: ${w.name}`}
                            title={opt.label}
                            className={cn(
                              "h-11 w-11 rounded-xl text-base font-extrabold ring-1 transition disabled:cursor-not-allowed",
                              m.mark === opt.id ? opt.on : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
                            )}
                          >
                            {opt.short}
                          </button>
                        ))}
                      </div>
                    </div>
                    {m.mark === "PRESENT" && (editable || m.ot > 0) && !w.locked && (
                      <div className="mt-2 flex items-center justify-end gap-2 text-xs text-slate-600">
                        <span className="font-semibold">Overtime</span>
                        <button onClick={() => setOt(w, -0.5)} disabled={!editable || m.ot <= 0} className="rounded-lg p-1.5 ring-1 ring-slate-200 disabled:opacity-30" aria-label={`Less overtime for ${w.name}`}>
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-10 text-center font-bold tabular-nums text-slate-900">{m.ot}h</span>
                        <button onClick={() => setOt(w, 0.5)} disabled={!editable || m.ot >= 8} className="rounded-lg p-1.5 ring-1 ring-slate-200 disabled:opacity-30" aria-label={`More overtime for ${w.name}`}>
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
              {!query && !showAll && hiddenCount > 0 && (
                <li className="px-4 py-3 text-center">
                  <button onClick={() => setShowAll(true)} className="text-sm font-semibold text-amber-700 hover:underline">
                    Show {hiddenCount} worker{hiddenCount === 1 ? "" : "s"} from other sites
                  </button>
                </li>
              )}
            </ul>
          )
        )}
      </div>

      {muster && editable && (
        <div className="fixed inset-x-0 bottom-[72px] z-30 px-4 lg:bottom-4 lg:left-64">
          <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-xl">
            <div className="min-w-0 flex-1 text-xs">
              <div className="font-semibold text-slate-300">Wages for the day</div>
              <div className="text-lg font-extrabold tabular-nums">
                {rupees(totals.wages)}
                {totals.ot > 0 && <span className="ml-1.5 whitespace-nowrap text-xs font-semibold text-amber-300">+{totals.ot}h OT</span>}
              </div>
            </div>
            <button
              onClick={save}
              disabled={saving || changed.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {changed.length ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}` : "Saved"}
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}
