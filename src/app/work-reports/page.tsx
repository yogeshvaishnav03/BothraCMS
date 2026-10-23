"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { ContactActions } from "@/components/ui/ContactActions";
import { PhotoPicker, PickedPhoto, splitPhotos } from "@/components/ui/PhotoPicker";
import { isOffline, submitOrQueue } from "@/lib/offline-queue";
import { cn } from "@/lib/cn";
import {
  CloudOff,
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Download,
  HelpCircle,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  NotebookPen,
  Sparkles,
  Timer,
  Users,
  X,
} from "lucide-react";

// ── Shared helpers ──────────────────────────────────────────────────────────

function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function timeOf(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}

function prettyDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function duration(fromIso: string, toMs: number): string {
  const mins = Math.max(0, Math.floor((toMs - new Date(fromIso).getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

function initials(name?: string | null) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.error?.message || json?.message || "Something went wrong");
  return json.data as T;
}

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    // The browser's timeout does not start until the person answers the
    // location prompt, so give up on our own if they never do.
    const giveUp = setTimeout(() => resolve(null), 8000);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(giveUp);
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        clearTimeout(giveUp);
        resolve(null);
      },
      { timeout: 5000, maximumAge: 60000 }
    );
  });
}

/** A camera photo made small (longest side 1024 px, JPEG) so it uploads quickly on site. */
async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b || file), "image/jpeg", 0.8));
  } catch {
    return file;
  }
}

/** Uploads the check-in selfie and returns its /api/uploads link. */
async function uploadSelfie(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", new File([await shrinkPhoto(file)], "selfie.jpg", { type: "image/jpeg" }));
  form.append("entityType", "ATTENDANCE");
  form.append("category", "PHOTO");
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data?.url) throw new Error(json?.error?.message || "Could not upload the selfie. Try again.");
  return json.data.url;
}

const ATT_TONE: Record<string, { label: string; short: string; cell: string; pill: string }> = {
  PRESENT: { label: "Present", short: "P", cell: "bg-emerald-500 text-white", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  HALF_DAY: { label: "Half day", short: "H", cell: "bg-amber-400 text-slate-900", pill: "bg-amber-50 text-amber-800 ring-amber-200" },
  LEAVE: { label: "Leave", short: "L", cell: "bg-sky-500 text-white", pill: "bg-sky-50 text-sky-700 ring-sky-200" },
  ABSENT: { label: "Absent", short: "A", cell: "bg-rose-500 text-white", pill: "bg-rose-50 text-rose-700 ring-rose-200" },
};

const REPORT_TONE: Record<string, { label: string; pill: string }> = {
  SUBMITTED: { label: "Submitted", pill: "bg-blue-50 text-blue-700 ring-blue-200" },
  REVIEWED: { label: "Reviewed", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  NEEDS_INFO: { label: "Needs more detail", pill: "bg-amber-50 text-amber-800 ring-amber-200" },
};

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1", className)}>{children}</span>;
}

function DateNav({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const today = todayIst();
  return (
    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-2xs">
      <button onClick={() => onChange(shiftDate(date, -1))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Previous day">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <input
        type="date"
        value={date}
        max={today}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="border-0 bg-transparent px-1 py-1 text-sm font-semibold text-slate-800 shadow-none focus:ring-0"
      />
      <button
        onClick={() => onChange(shiftDate(date, 1))}
        disabled={date >= today}
        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── My day ──────────────────────────────────────────────────────────────────

function AttendanceCard() {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => {
    api("/api/staff-attendance").then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const selfieInput = useRef<HTMLInputElement>(null);

  const act = async (action: "check-in" | "check-out", photo?: File) => {
    // The company wants a selfie: open the front camera first, and come back here with the photo.
    if (action === "check-in" && data?.rules?.requireSelfie && !photo && !isOffline()) {
      selfieInput.current?.click();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const pressed = new Date().toISOString();
      const [pos, selfie] = await Promise.all([getPosition(), photo && !isOffline() ? uploadSelfie(photo) : Promise.resolve(null)]);
      const result = await submitOrQueue({
        label: action === "check-in" ? "Check in" : "Check out",
        url: "/api/staff-attendance",
        body: { action, lat: pos?.lat ?? null, lng: pos?.lng ?? null, ...(selfie ? { selfie } : {}) },
        // Sent later, it still records the time the button was pressed.
        whenQueued: { at: pressed },
      });
      if (!result.queued) return load();
      // No signal: show the day as it will be once the phone sends it.
      setData((d: any) => ({
        ...d,
        today:
          action === "check-in"
            ? { status: "PRESENT", checkInAt: pressed, checkOutAt: null, pending: true }
            : { ...d.today, checkOutAt: pressed, pending: true },
      }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const today = data?.today;
  const checkedIn = today && (today.status === "PRESENT" || today.status === "HALF_DAY");
  const onLeave = today && (today.status === "LEAVE" || today.status === "ABSENT");
  const monthByDate = new Map<string, any>((data?.month || []).map((r: any) => [r.workDate, r]));
  const monthStart = (data?.date || todayIst()).slice(0, 8);
  const daysSoFar = Number((data?.date || todayIst()).slice(8, 10));

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-chrome p-5 text-white shadow-lg">
      <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-amber-400/20 blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-300">
            <Timer className="h-3.5 w-3.5" /> My attendance
          </div>
          <div className="mt-2 font-display text-3xl font-extrabold tabular-nums">
            {new Date(now).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}
          </div>
          <div className="mt-1 text-sm text-slate-300">
            {!data
              ? "Loading…"
              : onLeave
              ? `Marked ${ATT_TONE[today.status].label.toLowerCase()} today`
              : !today
              ? "You have not checked in today"
              : today.checkOutAt
              ? `Worked ${timeOf(today.checkInAt)} – ${timeOf(today.checkOutAt)} · ${duration(today.checkInAt, new Date(today.checkOutAt).getTime())}`
              : `Checked in at ${timeOf(today.checkInAt)} · ${duration(today.checkInAt, now)} so far`}
          </div>
          {today?.pending && (
            <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300">
              <CloudOff className="h-3 w-3" /> Saved on this phone, sent when there is signal
            </div>
          )}
          {today?.checkInFlag === "OFF_SITE" ? (
            <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-300">
              <MapPin className="h-3 w-3" /> Marked away from site
              {today.checkInDistanceM != null ? ` (${today.checkInDistanceM < 1000 ? `${today.checkInDistanceM} m` : `${(today.checkInDistanceM / 1000).toFixed(1)} km`} from the nearest)` : ""}
            </div>
          ) : today?.checkInLat != null ? (
            <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-400">
              <MapPin className="h-3 w-3" /> {today.checkInSiteId ? "At the site" : "Location recorded"}
            </div>
          ) : null}
        </div>
        <div className="flex gap-2">
          <input
            ref={selfieInput}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) act("check-in", f);
            }}
          />
          {(!today || onLeave) && (
            <button
              onClick={() => act("check-in")}
              disabled={busy || !data}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-5 py-3 text-sm font-bold text-slate-950 shadow-glow transition hover:brightness-105 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Check in
            </button>
          )}
          {checkedIn && !today.checkOutAt && (
            <button
              onClick={() => act("check-out")}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-bold text-white ring-1 ring-white/20 transition hover:bg-white/15 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Check out
            </button>
          )}
          {checkedIn && today.checkOutAt && (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm font-bold text-emerald-300 ring-1 ring-emerald-400/30">
              <Check className="h-4 w-4" /> Day closed
            </span>
          )}
        </div>
      </div>
      {error && <div className="relative mt-3 rounded-lg bg-rose-500/15 px-3 py-2 text-xs text-rose-200">{error}</div>}

      <div className="relative mt-5">
        <div className="mb-1.5 text-[11px] font-semibold text-slate-400">This month</div>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: daysSoFar }, (_, i) => {
            const d = `${monthStart}${String(i + 1).padStart(2, "0")}`;
            const r = monthByDate.get(d);
            const tone = r ? ATT_TONE[r.status] : null;
            return (
              <span
                key={d}
                title={`${prettyDate(d)}: ${tone ? tone.label : "No record"}`}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold",
                  tone ? tone.cell : "bg-white/5 text-slate-500 ring-1 ring-white/10"
                )}
              >
                {i + 1}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MyReport({ initialDate }: { initialDate: string }) {
  const [date, setDate] = useState(initialDate);
  const [draft, setDraft] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [summary, setSummary] = useState("");
  const [hours, setHours] = useState("");
  const [projectId, setProjectId] = useState("");
  const [blockers, setBlockers] = useState("");
  const [tomorrowPlan, setTomorrowPlan] = useState("");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);

  const applyDraft = (d: any, useSuggestion: boolean) => {
    const src = d.existing && !useSuggestion ? d.existing : null;
    if (src) {
      setSummary(src.summary || "");
      setHours(src.hoursWorked != null ? String(src.hoursWorked) : "");
      setProjectId(src.projectId || "");
      setBlockers(src.blockers || "");
      setTomorrowPlan(src.tomorrowPlan || "");
      setPhotos((src.photoUrls || []).map((url: string) => ({ url, name: "Photo" })));
      return;
    }
    const s = d.suggestion;
    setSummary((prev) => (useSuggestion && prev.trim() ? `${prev.trim()}\n${s.summary}` : s.summary));
    setHours(s.hoursWorked != null ? String(s.hoursWorked) : "");
    setProjectId(s.projectId || "");
    setPhotos((prev) => {
      const urls = new Set(prev.map((p) => p.url));
      return [...prev, ...s.photoUrls.filter((u: string) => !urls.has(u)).map((url: string) => ({ url, name: "Task photo" }))];
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaved(null);
    try {
      const [d, own] = await Promise.all([api(`/api/work-reports/draft?date=${date}`), api<any[]>("/api/work-reports")]);
      setDraft(d);
      setHistory(own);
      setSummary("");
      setBlockers("");
      setTomorrowPlan("");
      setPhotos([]);
      applyDraft(d, false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<any>("/api/projects")
      .then((d) => setProjects(Array.isArray(d) ? d : d?.projects || []))
      .catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { urls, pending } = splitPhotos(photos, { entityType: "WORK_REPORT" });
      const result = await submitOrQueue<any>({
        label: `Daily report for ${date}`,
        url: "/api/work-reports",
        body: {
          reportDate: date,
          summary,
          hoursWorked: hours === "" ? null : Number(hours),
          projectId: projectId || null,
          blockers: blockers || null,
          tomorrowPlan: tomorrowPlan || null,
          photoUrls: urls,
        },
        photos: pending,
        photoField: "photoUrls",
      });
      if (result.queued) {
        setSaved("No signal, so the report is saved on this phone. It will be sent to the admin when you are back online.");
        return;
      }
      const report = result.data;
      setDraft((d: any) => ({ ...d, existing: report }));
      setHistory((h) => [report, ...h.filter((r) => r.id !== (report as any).id)]);
      setSaved("Report sent to the admin.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const existing = draft?.existing;
  const locked = existing?.status === "REVIEWED";

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-5 xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-slate-900">
              <NotebookPen className="h-4 w-4 text-amber-500" /> What I did
            </h2>
            <p className="text-xs text-slate-500">
              {existing ? (
                <>
                  <Pill className={REPORT_TONE[existing.status]?.pill || ""}>{REPORT_TONE[existing.status]?.label || existing.status}</Pill>
                  {existing.reviewedBy && <span className="ml-1.5">by {existing.reviewedBy.name}</span>}
                </>
              ) : (
                "Not filed yet for this day"
              )}
            </p>
          </div>
          <DateNav date={date} onChange={setDate} />
        </div>

        {existing?.reviewNote && (
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="text-xs font-bold">Admin note</div>
              {existing.reviewNote}
            </div>
          </div>
        )}

        {error && <Alert tone="error">{error}</Alert>}
        {saved && <Alert tone="success">{saved}</Alert>}

        {loading ? (
          <div className="space-y-3">
            <div className="skeleton h-28 rounded-xl" />
            <div className="skeleton h-10 rounded-xl" />
          </div>
        ) : (
          <>
            {draft?.activityCount > 0 && !locked && (
              <button
                type="button"
                onClick={() => applyDraft(draft, true)}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-3 text-left transition hover:bg-amber-50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-slate-950">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="text-xs text-slate-700">
                  <span className="font-bold text-slate-900">Fill from my activity.</span> You made {draft.activityCount} task update
                  {draft.activityCount > 1 ? "s" : ""} on this day. Add them to the report with their photos.
                </span>
              </button>
            )}

            <label className="block">
              <span className="text-xs font-bold text-slate-700">Work done today</span>
              <textarea
                rows={6}
                value={summary}
                disabled={locked}
                onChange={(e) => setSummary(e.target.value)}
                placeholder={"• Checked shuttering for 3rd floor slab, Tower B\n• Met the steel supplier about the delayed TMT delivery\n• Updated BOQ quantities for plastering"}
                className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"
                required
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-xs font-bold text-slate-700">Hours worked</span>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={hours}
                  disabled={locked}
                  onChange={(e) => setHours(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold text-slate-700">Main project</span>
                <select
                  value={projectId}
                  disabled={locked}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Office / general</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold text-slate-700">Problems or blockers</span>
                <textarea
                  rows={2}
                  value={blockers}
                  disabled={locked}
                  onChange={(e) => setBlockers(e.target.value)}
                  placeholder="e.g. Cement short by 40 bags at site"
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-700">Plan for tomorrow</span>
                <textarea
                  rows={2}
                  value={tomorrowPlan}
                  disabled={locked}
                  onChange={(e) => setTomorrowPlan(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </label>
            </div>

            <div>
              <span className="text-xs font-bold text-slate-700">Photos</span>
              <div className="mt-1">
                {locked ? (
                  <div className="flex flex-wrap gap-2">
                    {photos.map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p.url} src={p.url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                    ))}
                  </div>
                ) : (
                  <PhotoPicker value={photos} onChange={setPhotos} entityType="WORK_REPORT" max={12} />
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-[11px] text-slate-400">{locked ? "Reviewed reports are locked." : "Goes straight to the admin."}</p>
              <button
                type="submit"
                disabled={saving || locked || summary.trim().length < 5}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-5 py-2.5 text-sm font-bold text-slate-950 shadow-sm disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                {existing ? "Update report" : "Submit report"}
              </button>
            </div>
          </>
        )}
      </form>

      <div className="space-y-4">
        <AttendanceCard />
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-slate-900">
            <CalendarDays className="h-4 w-4 text-amber-500" /> My recent reports
          </h2>
          {history.length === 0 ? (
            <p className="text-xs text-slate-500">Your filed reports will show here.</p>
          ) : (
            <ul className="space-y-1">
              {history.slice(0, 10).map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setDate(r.reportDate)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50",
                      r.reportDate === date && "bg-amber-50"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800">{prettyDate(r.reportDate)}</span>
                      <span className="block truncate text-[11px] text-slate-500">{r.summary.split("\n")[0]}</span>
                    </span>
                    <Pill className={REPORT_TONE[r.status]?.pill || ""}>{REPORT_TONE[r.status]?.label || r.status}</Pill>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Team (admin) ────────────────────────────────────────────────────────────

function TeamDay({ initialDate, canManage }: { initialDate: string; canManage: boolean }) {
  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "submitted" | "missing" | "blockers">("all");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setData(null);
    setError(null);
    api(`/api/work-reports/overview?date=${date}`).then(setData).catch((e) => setError(e.message));
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (reportId: string, status: "REVIEWED" | "NEEDS_INFO") => {
    let note: string | null = null;
    if (status === "NEEDS_INFO") {
      note = window.prompt("What should they add?");
      if (note === null) return;
    }
    setBusyId(reportId);
    try {
      const updated = await api(`/api/work-reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      });
      setData((d: any) => ({
        ...d,
        staff: d.staff.map((s: any) => (s.report?.id === reportId ? { ...s, report: updated } : s)),
      }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const staff = useMemo(() => {
    const list: any[] = data?.staff || [];
    if (filter === "submitted") return list.filter((s) => s.report);
    if (filter === "missing") return list.filter((s) => !s.report);
    if (filter === "blockers") return list.filter((s) => s.report?.blockers);
    return list;
  }, [data, filter]);

  const t = data?.totals;
  const tiles = [
    { label: "Reports in", value: t ? `${t.submitted}/${t.expected}` : "–", Icon: ClipboardCheck, tone: "bg-blue-50 text-blue-600 ring-blue-100" },
    { label: "Present", value: t ? String(t.present) : "–", Icon: Users, tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
    { label: "Hours logged", value: t ? String(t.hours) : "–", Icon: Clock, tone: "bg-violet-50 text-violet-600 ring-violet-100" },
    { label: "Blockers raised", value: t ? String(t.withBlockers) : "–", Icon: AlertTriangle, tone: "bg-rose-50 text-rose-600 ring-rose-100" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateNav date={date} onChange={setDate} />
        <div className="flex gap-1.5 overflow-x-auto">
          {(
            [
              ["all", "Everyone"],
              ["submitted", "Filed"],
              ["missing", "Not filed"],
              ["blockers", "Blockers"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
                filter === id ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 stagger">
        {tiles.map((x) => (
          <div key={x.label} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1", x.tone)}>
              <x.Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="font-display text-xl font-extrabold tabular-nums text-slate-900">{x.value}</div>
              <div className="truncate text-xs text-slate-500">{x.label}</div>
            </div>
          </div>
        ))}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {!data ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-40 rounded-2xl" />
          ))}
        </div>
      ) : staff.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Nobody matches this filter.</div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2 stagger">
          {staff.map((s: any) => {
            const r = s.report;
            const a = s.attendance;
            return (
              <article key={s.user.id} className={cn("rounded-2xl border bg-white p-4 shadow-xs", r ? "border-slate-200/80" : "border-dashed border-slate-300")}>
                <header className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-800 to-slate-600 text-xs font-bold text-amber-300">
                      {initials(s.user.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-slate-900">{s.user.name}</div>
                      <div className="truncate text-[11px] capitalize text-slate-500">
                        {s.user.jobTitle || s.user.role.toLowerCase().replace(/_/g, " ")}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {a ? (
                      <Pill className={ATT_TONE[a.status]?.pill || ""}>
                        {ATT_TONE[a.status]?.label}
                        {a.status !== "LEAVE" && a.status !== "ABSENT" && ` · ${timeOf(a.checkInAt)}${a.checkOutAt ? `–${timeOf(a.checkOutAt)}` : ""}`}
                      </Pill>
                    ) : (
                      <Pill className="bg-slate-50 text-slate-500 ring-slate-200">No check-in</Pill>
                    )}
                    {r && <Pill className={REPORT_TONE[r.status]?.pill || ""}>{REPORT_TONE[r.status]?.label}</Pill>}
                  </div>
                </header>

                {r ? (
                  <div className="mt-3 space-y-2.5">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{r.summary}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      {r.hoursWorked != null && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {r.hoursWorked} h
                        </span>
                      )}
                      {r.project && <span>{r.project.name}</span>}
                      <span>Filed {timeOf(r.updatedAt)}</span>
                    </div>
                    {r.blockers && (
                      <div className="flex gap-2 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-800">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{r.blockers}</span>
                      </div>
                    )}
                    {r.tomorrowPlan && (
                      <div className="text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">Tomorrow: </span>
                        {r.tomorrowPlan}
                      </div>
                    )}
                    {r.photoUrls?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {r.photoUrls.map((url: string) => (
                          <button key={url} onClick={() => setLightbox(url)} className="h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                    {r.reviewNote && <div className="text-[11px] italic text-slate-500">Note: {r.reviewNote}</div>}
                    {canManage && r.status !== "REVIEWED" && (
                      <div className="flex gap-2 border-t border-slate-100 pt-3">
                        <button
                          onClick={() => review(r.id, "REVIEWED")}
                          disabled={busyId === r.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" /> Mark reviewed
                        </button>
                        <button
                          onClick={() => review(r.id, "NEEDS_INFO")}
                          disabled={busyId === r.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <HelpCircle className="h-3.5 w-3.5" /> Ask for detail
                        </button>
                        <ContactActions
                          className="ml-auto"
                          size="sm"
                          phone={s.user.phone}
                          chatUserId={s.user.id}
                          message={`Hi ${s.user.name.split(" ")[0]}, about your work report for ${prettyDate(date)}: `}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3">
                    <span className="text-xs text-slate-500">No report filed for {prettyDate(date)}.</span>
                    <ContactActions
                      size="sm"
                      phone={s.user.phone}
                      chatUserId={s.user.id}
                      message={`Hi ${s.user.name.split(" ")[0]}, please file your daily work report for ${prettyDate(date)} in Bothra CMS (Daily Work).`}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/90 p-4" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Report photo" className="max-h-full max-w-full rounded-lg shadow-xl" />
          <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white" aria-label="Close photo">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Attendance register (admin) ─────────────────────────────────────────────

function Register({ canManage }: { canManage: boolean }) {
  const [month, setMonth] = useState(todayIst().slice(0, 7));
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ userId: string; name: string; date: string; status?: string } | null>(null);

  const load = useCallback(() => {
    setError(null);
    api(`/api/staff-attendance/register?month=${month}`).then(setData).catch((e) => setError(e.message));
  }, [month]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const mark = async (status: string) => {
    if (!editing) return;
    try {
      await api("/api/staff-attendance/register", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: editing.userId, date: editing.date, status }),
      });
      setEditing(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const downloadCsv = () => {
    if (!data) return;
    const header = ["Name", "Role", ...data.days.map((d: string) => d.slice(8)), "Present", "Half day", "Leave", "Hours"];
    const rows = data.members.map((m: any) => [
      m.user.name,
      m.user.jobTitle || m.user.role,
      ...data.days.map((d: string) => (m.cells[d] ? ATT_TONE[m.cells[d].status]?.short || "" : "")),
      m.totals.present,
      m.totals.halfDay,
      m.totals.leave,
      m.totals.hours,
    ]);
    const csv = [header, ...rows].map((r) => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `staff-attendance-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const today = todayIst();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="month"
          value={month}
          max={today.slice(0, 7)}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
        />
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          {Object.entries(ATT_TONE).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className={cn("flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold", v.cell)}>{v.short}</span>
              {v.label}
            </span>
          ))}
          <button
            onClick={downloadCsv}
            disabled={!data}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> CSV for payroll
          </button>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        {!data ? (
          <div className="skeleton m-4 h-48 rounded-xl" />
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-slate-500">
                <th className="sticky left-0 z-[1] min-w-[150px] bg-slate-50 px-3 py-2 text-left font-semibold">Staff</th>
                {data.days.map((d: string) => {
                  const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
                  return (
                    <th key={d} className={cn("px-0 py-2 text-center text-[10px] font-semibold", dow === 0 && "text-rose-400")}>
                      {Number(d.slice(8))}
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-right font-semibold">P</th>
                <th className="px-2 py-2 text-right font-semibold">L</th>
                <th className="px-3 py-2 text-right font-semibold">Hours</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m: any) => (
                <tr key={m.user.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="sticky left-0 z-[1] bg-white px-3 py-1.5">
                    <div className="truncate font-semibold text-slate-800">{m.user.name}</div>
                    <div className="truncate text-[10px] capitalize text-slate-400">{m.user.jobTitle || m.user.role.toLowerCase().replace(/_/g, " ")}</div>
                  </td>
                  {data.days.map((d: string) => {
                    const c = m.cells[d];
                    const tone = c ? ATT_TONE[c.status] : null;
                    const future = d > today;
                    return (
                      <td key={d} className="px-px py-1 text-center">
                        <button
                          disabled={!canManage || future}
                          onClick={() => setEditing({ userId: m.user.id, name: m.user.name, date: d, status: c?.status })}
                          title={
                            c
                              ? `${tone?.label} · ${timeOf(c.checkInAt)}${c.checkOutAt ? ` – ${timeOf(c.checkOutAt)}` : ""}${
                                  c.flag === "OFF_SITE" ? ` · away from site${c.site && c.distanceM != null ? ` (${c.distanceM} m from ${c.site})` : ""}` : c.flag === "NO_GPS" ? " · no location" : ""
                                }`
                              : prettyDate(d)
                          }
                          className={cn(
                            "mx-auto flex h-6 w-5 items-center justify-center rounded text-[10px] font-bold transition",
                            c?.flag === "OFF_SITE" && "ring-2 ring-rose-500 ring-offset-1",
                            tone ? tone.cell : future ? "bg-transparent" : "bg-slate-100 text-slate-300",
                            canManage && !future && "hover:ring-2 hover:ring-amber-400"
                          )}
                        >
                          {tone?.short || ""}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-2 text-right font-bold tabular-nums text-slate-800">{m.totals.present + m.totals.halfDay / 2}</td>
                  <td className="px-2 text-right tabular-nums text-slate-600">{m.totals.leave}</td>
                  <td className="px-3 text-right tabular-nums text-slate-600">{m.totals.hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-bold text-slate-900">{editing.name}</div>
            <div className="text-xs text-slate-500">{prettyDate(editing.date)}</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {Object.entries(ATT_TONE).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => mark(k)}
                  className={cn(
                    "rounded-xl px-3 py-2.5 text-xs font-bold ring-1 transition",
                    editing.status === k ? v.pill + " ring-2" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function WorkReportsPage() {
  const [user, setUser] = useState<any>(null);
  const [tab, setTab] = useState<"me" | "team" | "register">("me");
  const [initialDate, setInitialDate] = useState(todayIst());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setInitialDate(d);
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => {
        const u = j?.data?.user;
        setUser(u || null);
        const t = params.get("tab");
        const team = u && ["SUPER_ADMIN", "ORG_ADMIN", "HR_VIEWER"].includes(u.role);
        if (team && (t === "team" || t === "register")) setTab(t);
        else if (team && !t && u.role !== "HR_VIEWER") setTab("team");
      })
      .catch(() => {});
  }, []);

  const canViewTeam = !!user && ["SUPER_ADMIN", "ORG_ADMIN", "HR_VIEWER"].includes(user.role);
  const canManage = !!user && ["SUPER_ADMIN", "ORG_ADMIN"].includes(user.role);

  const tabs = [
    { id: "me" as const, label: "My day", Icon: NotebookPen },
    ...(canViewTeam
      ? [
          { id: "team" as const, label: "Team reports", Icon: Users },
          { id: "register" as const, label: "Attendance register", Icon: CalendarDays },
        ]
      : []),
  ];

  const selectTab = (id: typeof tab) => {
    setTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url.toString());
  };

  return (
    <Shell>
      <div className="space-y-5">
        <PageHeader
          icon={NotebookPen}
          title="Daily Work"
          subtitle={canViewTeam ? "Who came in, what each person did today, and the photos to prove it." : "Check in, then tell the office what you got done today."}
        />

        {tabs.length > 1 && (
          <div className="inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-2xs">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => selectTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition sm:text-sm",
                  tab === t.id ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <t.Icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>
        )}

        {!user ? (
          <div className="skeleton h-64 rounded-2xl" />
        ) : tab === "team" && canViewTeam ? (
          <TeamDay initialDate={initialDate} canManage={canManage} />
        ) : tab === "register" && canViewTeam ? (
          <Register canManage={canManage} />
        ) : (
          <MyReport initialDate={initialDate} />
        )}
      </div>
    </Shell>
  );
}
