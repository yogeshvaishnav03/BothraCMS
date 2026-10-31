"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  GitCommitHorizontal,
  History,
  Loader2,
  MessageSquare,
  Pencil,
  PlusCircle,
  Send,
  X,
} from "lucide-react";
import { formatDateTime } from "@/lib/formatters";
import { PhotoPicker, PickedPhoto } from "@/components/ui/PhotoPicker";

interface FieldChange {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
}

interface Entry {
  id: string;
  hash: string;
  kind: "CREATED" | "STATUS" | "EDIT" | "UPDATE" | "COMMENT" | "PHOTOS";
  at: string;
  author: { id: string; name: string; role: string | null } | null;
  message: string;
  note?: string | null;
  changes: FieldChange[];
  photos: { url: string; name?: string }[];
  commentType?: string;
}

const STATUS_LABEL: Record<string, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  VERIFIED: "Verified",
};

const STATUS_TONE: Record<string, string> = {
  TODO: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  BLOCKED: "bg-rose-100 text-rose-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  VERIFIED: "bg-indigo-100 text-indigo-800",
};

const KIND_STYLE: Record<Entry["kind"], { dot: string; icon: React.ElementType }> = {
  CREATED: { dot: "bg-slate-900 text-white", icon: PlusCircle },
  STATUS: { dot: "bg-blue-600 text-white", icon: ArrowRight },
  EDIT: { dot: "bg-violet-600 text-white", icon: Pencil },
  UPDATE: { dot: "bg-amber-500 text-slate-950", icon: GitCommitHorizontal },
  COMMENT: { dot: "bg-slate-200 text-slate-700", icon: MessageSquare },
  PHOTOS: { dot: "bg-emerald-600 text-white", icon: Camera },
};

const FILTERS: { id: string; label: string; kinds: Entry["kind"][] }[] = [
  { id: "all", label: "All", kinds: [] },
  { id: "status", label: "Status", kinds: ["STATUS", "CREATED"] },
  { id: "photos", label: "Photos", kinds: [] },
  { id: "notes", label: "Notes", kinds: ["UPDATE", "COMMENT"] },
  { id: "edits", label: "Edits", kinds: ["EDIT"] },
];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return formatDateTime(iso);
}

function initials(name?: string | null) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function showValue(change: FieldChange, value: string | null): string {
  if (value === null) return "—";
  if (change.field === "status") return STATUS_LABEL[value] || value;
  if (change.field === "dueAt" || change.field === "reminderAt") return formatDateTime(value);
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

export default function TaskTimeline({
  task,
  canWrite,
  onClose,
  onChanged,
}: {
  task: { id: string; title: string; status: string; projectId?: string | null };
  canWrite: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState(task.status);

  const [note, setNote] = useState("");
  const [nextStatus, setNextStatus] = useState<string>("");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}/timeline`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Could not load history");
      setEntries(json.data.entries || []);
      if (json.data.task?.status) setCurrentStatus(json.data.task.status);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [task.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") (lightbox ? setLightbox(null) : onClose());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, onClose]);

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note,
          status: nextStatus || undefined,
          photoUrls: photos.map((p) => p.url),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Could not post the update");
      setEntries(json.data.entries || []);
      if (nextStatus) setCurrentStatus(nextStatus);
      setNote("");
      setNextStatus("");
      setPhotos([]);
      onChanged?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPosting(false);
    }
  };

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter);
    if (!f || f.id === "all") return entries;
    if (f.id === "photos") return entries.filter((e) => e.photos.length > 0);
    return entries.filter((e) => f.kinds.includes(e.kind));
  }, [entries, filter]);

  const photoCount = entries.reduce((n, e) => n + e.photos.length, 0);
  const contributors = new Set(entries.map((e) => e.author?.id).filter(Boolean)).size;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/50 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-xl animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
        aria-label="Task history"
      >
        <header className="border-b border-slate-100 px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-600">
                <History className="h-3.5 w-3.5" /> Task history
              </div>
              <h2 className="mt-1 font-display text-lg font-bold leading-snug text-slate-900">{task.title}</h2>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[currentStatus] || STATUS_TONE.TODO}`}>
              {STATUS_LABEL[currentStatus] || currentStatus}
            </span>
            <span className="inline-flex items-center gap-1">
              <GitCommitHorizontal className="h-3.5 w-3.5" /> {entries.length} {entries.length === 1 ? "change" : "changes"}
            </span>
            <span>·</span>
            <span>
              {photoCount} {photoCount === 1 ? "photo" : "photos"}
            </span>
            <span>·</span>
            <span>
              {contributors} {contributors === 1 ? "person" : "people"}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {canWrite && (
            <form onSubmit={post} className="space-y-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
              <div className="text-xs font-bold text-slate-700">Post an update</div>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What was done? e.g. 3rd floor slab shuttering complete, 40% reinforcement tied"
                className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-semibold text-slate-500">Move to</span>
                {["IN_PROGRESS", "BLOCKED", "COMPLETED"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={s === currentStatus}
                    onClick={() => setNextStatus(nextStatus === s ? "" : s)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-40 ${
                      nextStatus === s ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              <PhotoPicker value={photos} onChange={setPhotos} entityType="TASK" entityId={task.id} projectId={task.projectId} />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-400">Admins and the person who assigned this task are notified.</p>
                <button
                  type="submit"
                  disabled={posting || (!note.trim() && photos.length === 0 && !nextStatus)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-brand px-3.5 py-2 text-xs font-bold text-slate-950 shadow-sm disabled:opacity-50"
                >
                  {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Post update
                </button>
              </div>
            </form>
          )}

          <div className="sticky top-0 z-10 flex gap-1.5 overflow-x-auto border-b border-slate-100 bg-white/90 px-5 py-2.5 backdrop-blur">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold transition ${
                  filter === f.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {error && <div className="mx-5 mt-4 rounded-lg bg-rose-50 p-3 text-xs font-medium text-rose-700">{error}</div>}

          {loading ? (
            <div className="space-y-4 p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-16 rounded-xl" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">Nothing here yet.</div>
          ) : (
            <ol className="relative px-5 py-5">
              <span className="absolute bottom-6 left-[37px] top-6 w-px bg-slate-200" aria-hidden />
              {visible.map((e) => {
                const style = KIND_STYLE[e.kind];
                const Icon = style.icon;
                return (
                  <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
                    <span className={`relative z-[1] mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${style.dot}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-600">
                          {initials(e.author?.name)}
                        </span>
                        <span className="text-xs font-bold text-slate-900">{e.author?.name || "System"}</span>
                        <span className="text-xs text-slate-600">{e.message.charAt(0).toLowerCase() + e.message.slice(1)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                        <code className="rounded bg-slate-100 px-1.5 py-px font-mono text-[10px] text-slate-500">{e.hash}</code>
                        <time dateTime={e.at} title={formatDateTime(e.at)}>
                          {relativeTime(e.at)}
                        </time>
                      </div>

                      {e.changes.length > 0 && (
                        <div className="mt-2 space-y-1 rounded-lg border border-slate-100 bg-slate-50/80 p-2 font-mono text-[11px]">
                          {e.changes.map((c) => (
                            <div key={c.field} className="flex flex-wrap items-center gap-1.5">
                              <span className="w-20 shrink-0 font-sans font-semibold text-slate-500">{c.label}</span>
                              <span className="rounded bg-rose-50 px-1.5 text-rose-700 line-through decoration-rose-300">{showValue(c, c.from)}</span>
                              <ArrowRight className="h-3 w-3 text-slate-400" />
                              <span className="rounded bg-emerald-50 px-1.5 text-emerald-700">{showValue(c, c.to)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {e.note && (
                        <p className="mt-2 whitespace-pre-wrap border-l-2 border-amber-300 pl-2.5 text-sm text-slate-700">{e.note}</p>
                      )}

                      {e.photos.length > 0 && (
                        <div className="mt-2 grid grid-cols-3 gap-1.5">
                          {e.photos.map((p) => (
                            <button
                              key={p.url}
                              type="button"
                              onClick={() => setLightbox(p.url)}
                              className="group aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.url} alt={p.name || "Task photo"} loading="lazy" className="h-full w-full object-cover transition group-hover:opacity-90" />
                            </button>
                          ))}
                        </div>
                      )}

                      {e.kind === "STATUS" && e.changes[0]?.to === "VERIFIED" && (
                        <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>

      {lightbox && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/90 p-4 overflow-y-auto cursor-pointer" onClick={(e) => (e.stopPropagation(), setLightbox(null))}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Task photo" className="max-h-full max-w-full rounded-lg shadow-xl" />
          <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close photo">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
