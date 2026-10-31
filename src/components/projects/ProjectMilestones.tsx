"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  Flag,
  History,
  Loader2,
  PauseCircle,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { PhotoPicker, PickedPhoto, splitPhotos } from "@/components/ui/PhotoPicker";
import { submitOrQueue } from "@/lib/offline-queue";

type Schedule = "ON_TRACK" | "AT_RISK" | "DELAYED" | "DONE" | "UNPLANNED";

interface Update {
  id: string;
  progressFrom: number;
  progressTo: number;
  statusTo: string | null;
  note: string | null;
  photoUrls: string[];
  createdAt: string;
  user: { id: string; name: string };
}

interface Milestone {
  id: string;
  name: string;
  description: string | null;
  weight: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  progressPercent: number;
  status: string;
  expectedPercent: number | null;
  behindBy: number;
  lateByDays: number;
  schedule: Schedule;
  updates: Update[];
}

interface Data {
  milestones: Milestone[];
  summary: { overallProgress: number; plannedProgress: number | null; total: number; completed: number; delayed: number; atRisk: number };
}

const SCHEDULE: Record<Schedule, { label: (m: Milestone) => string; pill: string; bar: string }> = {
  DONE: { label: () => "Done", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", bar: "bg-emerald-500" },
  ON_TRACK: { label: () => "On track", pill: "bg-blue-50 text-blue-700 ring-blue-200", bar: "bg-blue-500" },
  AT_RISK: { label: (m) => `${m.behindBy}% behind plan`, pill: "bg-amber-50 text-amber-800 ring-amber-200", bar: "bg-amber-500" },
  DELAYED: { label: (m) => `Late by ${m.lateByDays} day${m.lateByDays === 1 ? "" : "s"}`, pill: "bg-rose-50 text-rose-700 ring-rose-200", bar: "bg-rose-500" },
  UNPLANNED: { label: () => "No dates", pill: "bg-slate-50 text-slate-600 ring-slate-200", bar: "bg-slate-500" },
};

function shortDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" });
}

function toInputDate(iso: string | null) {
  return iso ? new Date(new Date(iso).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10) : "";
}

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.error?.message || "Something went wrong");
  return json.data;
}

function ProgressPanel({ m, onSaved, onClose, onQueued }: { m: Milestone; onSaved: (d: Data) => void; onClose: () => void; onQueued?: (msg: string) => void }) {
  const [progress, setProgress] = useState(m.progressPercent);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [hold, setHold] = useState(m.status === "ON_HOLD");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { urls, pending } = splitPhotos(photos, { entityType: "MILESTONE", entityId: m.id });
      const result = await submitOrQueue<Data>({
        label: `${m.name}: ${progress}%`,
        url: `/api/milestones/${m.id}/progress`,
        body: {
          progressPercent: progress,
          note: note || null,
          photoUrls: urls,
          status: hold ? "ON_HOLD" : m.status === "ON_HOLD" ? "IN_PROGRESS" : undefined,
        },
        photos: pending,
        photoField: "photoUrls",
      });
      if (result.queued) onQueued?.(`${m.name} at ${progress}% is saved on this phone. It will be sent when there is signal.`);
      else onSaved(result.data);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3 animate-fade-up">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={progress}
          onChange={(e) => setProgress(Number(e.target.value))}
          className="h-2 flex-1 cursor-pointer accent-amber-500"
          aria-label="Percent done"
        />
        <span className="w-12 text-right font-display text-lg font-extrabold tabular-nums text-slate-900">{progress}%</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[25, 50, 75, 100].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setProgress(v)}
            className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold ring-1", progress === v ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200")}
          >
            {v === 100 ? "Done" : `${v}%`}
          </button>
        ))}
        <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
          <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} className="accent-amber-500" />
          Work on hold
        </label>
      </div>
      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What was done? e.g. 4th floor slab cast, curing started"
        className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm"
      />
      <PhotoPicker value={photos} onChange={setPhotos} entityType="MILESTONE" entityId={m.id} />
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white">
          Cancel
        </button>
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-brand px-3.5 py-1.5 text-xs font-bold text-slate-950 disabled:opacity-50">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save progress
        </button>
      </div>
    </div>
  );
}

export default function ProjectMilestones({
  projectId,
  canPlan,
  canUpdate,
}: {
  projectId: string;
  canPlan: boolean;
  canUpdate: boolean;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", plannedStart: "", plannedEnd: "", weight: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ plannedStart: "", plannedEnd: "" });

  const load = useCallback(async () => {
    try {
      setData(await call(`/api/projects/${projectId}/milestones`, "GET"));
    } catch (e: any) {
      setError(e.message);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<Data>) => {
    setBusy(true);
    setError(null);
    try {
      setData(await fn());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Shared date range so every stage's planned window lines up like a Gantt chart.
  const range = useMemo(() => {
    const times = (data?.milestones || []).flatMap((m) => [m.plannedStart, m.plannedEnd].filter(Boolean).map((d) => new Date(d!).getTime()));
    if (times.length < 2) return null;
    const min = Math.min(...times);
    const max = Math.max(...times);
    return max > min ? { min, max } : null;
  }, [data]);
  const pos = (iso: string) => (range ? ((new Date(iso).getTime() - range.min) / (range.max - range.min)) * 100 : 0);
  const todayPos = range ? ((Date.now() - range.min) / (range.max - range.min)) * 100 : null;

  if (!data) {
    return error ? <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : <div className="skeleton h-64 rounded-2xl" />;
  }

  const s = data.summary;
  const open = data.milestones.filter((m) => m.status !== "COMPLETED");
  const current = open.find((m) => m.progressPercent > 0) || open[0];
  const next = current ? open.find((m) => m !== current && m.progressPercent === 0) : undefined;

  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700">{error}</div>}
      {queued && (
        <div className="flex items-start justify-between gap-3 rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
          <span>{queued}</span>
          <button onClick={() => setQueued(null)} className="font-bold text-amber-900">
            OK
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-chrome p-5 text-white shadow-lg lg:col-span-2">
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-amber-400/20 blur-3xl" aria-hidden />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">Overall progress</div>
              <div className="mt-1 font-display text-5xl font-extrabold tabular-nums">{s.overallProgress}%</div>
              <div className="mt-1 text-sm text-slate-300">
                {s.plannedProgress === null
                  ? "Add planned dates to compare with the schedule"
                  : s.overallProgress >= s.plannedProgress
                  ? `Plan says ${s.plannedProgress}% by today. Ahead of schedule.`
                  : `Plan says ${s.plannedProgress}% by today. ${Math.round((s.plannedProgress - s.overallProgress) * 10) / 10}% behind.`}
              </div>
            </div>
            <div className="flex gap-4 text-center">
              {[
                { v: `${s.completed}/${s.total}`, l: "Stages done" },
                { v: s.atRisk, l: "At risk" },
                { v: s.delayed, l: "Late" },
              ].map((x) => (
                <div key={x.l}>
                  <div className="font-display text-2xl font-extrabold tabular-nums">{x.v}</div>
                  <div className="text-[11px] text-slate-400">{x.l}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-white/10">
            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-brand transition-all" style={{ width: `${s.overallProgress}%` }} />
            {s.plannedProgress !== null && (
              <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${s.plannedProgress}%` }} title={`Planned: ${s.plannedProgress}%`} />
            )}
          </div>
          {s.plannedProgress !== null && <div className="relative mt-1.5 text-[11px] text-slate-400">White line: where the plan says you should be today</div>}
        </div>

        <div className="flex flex-col justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          {current && (
            <div className="mb-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Working on now</div>
              <div className="mt-1 font-display text-base font-extrabold text-slate-900">{current.name}</div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${current.progressPercent}%` }} />
                </div>
                <span className="text-xs font-bold tabular-nums text-slate-700">{current.progressPercent}%</span>
              </div>
              <div className="mt-1.5 text-xs text-slate-500">
                {current.plannedEnd ? `Due ${shortDate(current.plannedEnd)}` : "No due date set"}
                {current.lateByDays > 0 && <span className="font-semibold text-rose-600"> · {current.lateByDays} days late</span>}
                {next && <> · Next: {next.name}</>}
              </div>
            </div>
          )}
          {canPlan && s.total === 0 && (
            <button
              onClick={() => run(() => call(`/api/projects/${projectId}/milestones`, "POST", { template: "STANDARD" }))}
              disabled={busy}
              className="flex items-center gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-3 text-left transition hover:bg-amber-50 disabled:opacity-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-slate-950">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-xs text-slate-700">
                <span className="block font-bold text-slate-900">Add the standard building stages</span>
                Excavation to handover, spread over the project dates.
              </span>
            </button>
          )}
          {canPlan && (
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" /> Add a stage
            </button>
          )}
          {!canPlan && <p className="text-xs text-slate-500">Stages are set up by the project manager. Use “Update” on a stage to record progress and photos.</p>}
        </div>
      </div>

      {showAdd && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const d = await call(`/api/projects/${projectId}/milestones`, "POST", {
                name: form.name,
                plannedStart: form.plannedStart || null,
                plannedEnd: form.plannedEnd || null,
                weight: form.weight ? Number(form.weight) : undefined,
              });
              setForm({ name: "", plannedStart: "", plannedEnd: "", weight: "" });
              setShowAdd(false);
              return d;
            });
          }}
          className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:grid-cols-5 animate-fade-up"
        >
          <input
            required
            minLength={2}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Stage name, e.g. 5th floor slab"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm sm:col-span-2"
          />
          <input type="date" value={form.plannedStart} onChange={(e) => setForm({ ...form, plannedStart: e.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" aria-label="Planned start" />
          <input type="date" value={form.plannedEnd} onChange={(e) => setForm({ ...form, plannedEnd: e.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" aria-label="Planned end" />
          <button disabled={busy} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50">
            Add stage
          </button>
        </form>
      )}

      {data.milestones.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Flag className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-700">No stages yet</p>
          <p className="text-xs text-slate-500">Break the project into stages to track progress against the plan.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs">
          {range && (
            <div className="hidden items-center gap-4 border-b border-slate-100 px-5 py-2 text-[11px] text-slate-400 md:flex">
              <div className="w-[38%]">Stage</div>
              <div className="flex flex-1 justify-between">
                <span>{shortDate(new Date(range.min).toISOString())}</span>
                <span>Planned window · today</span>
                <span>{shortDate(new Date(range.max).toISOString())}</span>
              </div>
            </div>
          )}
          <ol className="divide-y divide-slate-100">
            {data.milestones.map((m, i) => {
              const sch = SCHEDULE[m.schedule];
              const last = m.updates[0];
              return (
                <li key={m.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                    <div className="flex min-w-0 items-start gap-3 md:w-[38%]">
                      <span
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                          m.status === "COMPLETED" ? "bg-emerald-500 text-white" : m.status === "ON_HOLD" ? "bg-slate-200 text-slate-600" : "bg-slate-900 text-amber-300"
                        )}
                      >
                        {m.status === "COMPLETED" ? <CheckCircle2 className="h-4 w-4" /> : m.status === "ON_HOLD" ? <PauseCircle className="h-4 w-4" /> : i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900">{m.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                          <span className={cn("inline-flex rounded-full px-1.5 py-px font-bold ring-1", sch.pill)}>{m.status === "ON_HOLD" ? "On hold" : sch.label(m)}</span>
                          {editing === m.id ? null : (
                            <button
                              type="button"
                              disabled={!canPlan}
                              onClick={() => {
                                setEditing(m.id);
                                setEditForm({ plannedStart: toInputDate(m.plannedStart), plannedEnd: toInputDate(m.plannedEnd) });
                              }}
                              className="inline-flex items-center gap-1 enabled:hover:text-slate-800"
                            >
                              <CalendarRange className="h-3 w-3" />
                              {m.plannedEnd ? `${shortDate(m.plannedStart)} – ${shortDate(m.plannedEnd)}` : canPlan ? "Set dates" : "No dates"}
                            </button>
                          )}
                        </div>
                        {editing === m.id && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <input type="date" value={editForm.plannedStart} onChange={(e) => setEditForm({ ...editForm, plannedStart: e.target.value })} className="rounded-md border border-slate-200 px-2 py-1 text-xs" aria-label="Planned start" />
                            <input type="date" value={editForm.plannedEnd} onChange={(e) => setEditForm({ ...editForm, plannedEnd: e.target.value })} className="rounded-md border border-slate-200 px-2 py-1 text-xs" aria-label="Planned end" />
                            <button
                              onClick={() =>
                                run(async () => {
                                  const d = await call(`/api/milestones/${m.id}`, "PATCH", { plannedStart: editForm.plannedStart || null, plannedEnd: editForm.plannedEnd || null });
                                  setEditing(null);
                                  return d;
                                })
                              }
                              className="rounded-md bg-slate-900 px-2 py-1 text-[11px] font-bold text-white"
                            >
                              Save
                            </button>
                            <button onClick={() => setEditing(null)} className="rounded-md px-1.5 py-1 text-slate-400 hover:text-slate-700" aria-label="Cancel">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      {range && m.plannedStart && m.plannedEnd && (
                        <div className="relative h-2 rounded-full bg-slate-50">
                          <div
                            className="absolute inset-y-0 rounded-full bg-slate-200"
                            style={{ left: `${pos(m.plannedStart)}%`, width: `${Math.max(1, pos(m.plannedEnd) - pos(m.plannedStart))}%` }}
                          />
                          <div
                            className={cn("absolute inset-y-0 rounded-full", sch.bar)}
                            style={{
                              left: `${pos(m.plannedStart)}%`,
                              width: `${Math.max(0, ((pos(m.plannedEnd) - pos(m.plannedStart)) * m.progressPercent) / 100)}%`,
                            }}
                          />
                          {todayPos !== null && todayPos >= 0 && todayPos <= 100 && (
                            <div className="absolute -inset-y-1 w-px bg-rose-400" style={{ left: `${todayPos}%` }} title="Today" />
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className={cn("h-full rounded-full transition-all", sch.bar)} style={{ width: `${m.progressPercent}%` }} />
                        </div>
                        <span className="w-12 shrink-0 whitespace-nowrap text-right text-sm font-bold tabular-nums text-slate-900">{m.progressPercent}%</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {canUpdate && m.status !== "COMPLETED" && (
                        <button
                          onClick={() => setOpenPanel(openPanel === m.id ? null : m.id)}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                        >
                          Update
                        </button>
                      )}
                      {m.updates.length > 0 && (
                        <button
                          onClick={() => setOpenHistory(openHistory === m.id ? null : m.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          aria-expanded={openHistory === m.id}
                        >
                          <History className="h-3.5 w-3.5" /> {m.updates.length}
                          <ChevronDown className={cn("h-3 w-3 transition-transform", openHistory === m.id && "rotate-180")} />
                        </button>
                      )}
                      {canPlan && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Remove the stage "${m.name}" and its progress history?`)) run(() => call(`/api/milestones/${m.id}`, "DELETE"));
                          }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          aria-label={`Remove ${m.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {last && openHistory !== m.id && (last.note || last.photoUrls.length > 0) && (
                    <div className="mt-2 flex items-start gap-2 pl-10 text-xs text-slate-500">
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold text-slate-700">{last.user.name}:</span> {last.note || `${last.progressFrom}% → ${last.progressTo}%`}
                      </span>
                      {last.photoUrls.slice(0, 3).map((url) => (
                        <button key={url} onClick={() => setLightbox(url)} className="h-8 w-8 shrink-0 overflow-hidden rounded-md border border-slate-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}

                  {openPanel === m.id && (
                    <div className="md:pl-10">
                      <ProgressPanel m={m} onSaved={setData} onClose={() => setOpenPanel(null)} onQueued={setQueued} />
                    </div>
                  )}

                  {openHistory === m.id && (
                    <ol className="mt-3 space-y-3 border-l-2 border-slate-100 pl-4 md:ml-10">
                      {m.updates.map((u) => (
                        <li key={u.id} className="text-xs">
                          <div className="text-slate-500">
                            <span className="font-semibold text-slate-800">{u.user.name}</span> moved {u.progressFrom}% → <span className="font-bold text-slate-900">{u.progressTo}%</span>
                            {u.statusTo === "ON_HOLD" && " and put it on hold"} · {shortDate(u.createdAt)}
                          </div>
                          {u.note && <p className="mt-0.5 text-sm text-slate-700">{u.note}</p>}
                          {u.photoUrls.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {u.photoUrls.map((url) => (
                                <button key={url} onClick={() => setLightbox(url)} className="h-14 w-14 overflow-hidden rounded-lg border border-slate-200">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                                </button>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/90 p-4 overflow-y-auto cursor-pointer" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Site photo" className="max-h-full max-w-full rounded-lg shadow-xl" />
        </div>
      )}
    </div>
  );
}
