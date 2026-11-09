"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Shell from "@/components/layout/Shell";
import { Alert } from "@/components/ui/Alert";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { renderSheet } from "@/lib/pdf-render";
import MarkupLayer, { type Shape, type Tool } from "@/components/drawings/MarkupLayer";
import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, Cloud, Columns2, ExternalLink, Hand, Loader2, Minus, PenLine, Plus, Save, Square, Trash2, Type, Undo2 } from "lucide-react";

const COLORS = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#111827"];
const TOOLS: { key: Tool; label: string; icon: any }[] = [
  { key: "none", label: "Move", icon: Hand },
  { key: "cloud", label: "Cloud", icon: Cloud },
  { key: "arrow", label: "Arrow", icon: ArrowUpRight },
  { key: "rect", label: "Box", icon: Square },
  { key: "pen", label: "Pen", icon: PenLine },
  { key: "text", label: "Note", icon: Type },
];

export default function DrawingViewerPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [rev, setRev] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [tool, setTool] = useState<Tool>("cloud");
  const [color, setColor] = useState(COLORS[0]);
  const [mine, setMine] = useState<Record<number, Shape[]>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(true);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteValue, setNoteValue] = useState("");
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const noteResolver = useRef<((v: string | null) => void) | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const askDrawingNote = () =>
    new Promise<string | null>((resolve) => {
      noteResolver.current = resolve;
      setNoteValue("");
      setNoteModalOpen(true);
    });

  const load = useCallback(async () => {
    const d = await api<any>(`/api/drawing-revisions/${id}`);
    setRev(d);
    const own: Record<number, Shape[]> = {};
    for (const m of d.markups) if (m.mine) own[m.page] = m.shapes;
    setMine(own);
    setDirty(false);
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  // Draw the sheet to fit the screen width, times the zoom.
  useEffect(() => {
    if (!rev?.fileUrl || !canvas.current || !box.current) return;
    let live = true;
    setRendering(true);
    const width = Math.max(320, Math.floor(box.current.clientWidth - 2)) * zoom;
    renderSheet(canvas.current, rev.fileUrl, { fileName: rev.fileName, page, width })
      .then((r) => {
        if (!live) return;
        setPages(r.pages);
        setSize({ width: r.width, height: r.height });
      })
      .catch((e) => live && setError(e?.message || "Could not open the drawing"))
      .finally(() => live && setRendering(false));
    return () => {
      live = false;
    };
  }, [rev?.fileUrl, rev?.fileName, page, zoom]);

  // Leaving with unsaved marks asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const others = useMemo(() => (rev?.markups || []).filter((m: any) => !m.mine && m.page === page).map((m: any) => ({ name: m.createdByName, shapes: m.shapes })), [rev, page]);
  const authors = useMemo(() => Array.from(new Set((rev?.markups || []).filter((m: any) => !m.mine).map((m: any) => m.createdByName))) as string[], [rev]);
  const myShapes = mine[page] || [];

  const change = (shapes: Shape[]) => {
    setMine({ ...mine, [page]: shapes });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const touched = Object.keys(mine).map(Number);
      for (const p of touched) await api(`/api/drawing-revisions/${id}/markup`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: p, shapes: mine[p] || [] }) });
      setDirty(false);
      setNotice("Marks saved. Everyone on the project sees them on this revision.");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const compareWith = rev?.revisions.filter((r: any) => r.id !== rev.id && r.fileUrl) || [];

  return (
    <Shell>
      <div className="space-y-3">
        <Link href={rev ? `/drawings?id=${rev.drawing.id}` : "/drawings"} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Drawings
        </Link>
        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        {!rev ? (
          <div className="h-[70dvh] animate-pulse rounded-2xl bg-slate-100" />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  <span className="font-mono">{rev.drawing.number}</span> {rev.revision}
                </h1>
                <p className="text-sm text-slate-500">
                  {rev.drawing.title} · {rev.drawing.project.name}
                  {rev.uploadedByName && ` · uploaded by ${rev.uploadedByName}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {compareWith.length > 0 && (
                  <select
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                    value=""
                    onChange={(e) => e.target.value && router.push(`/drawings/compare?a=${e.target.value}&b=${rev.id}`)}
                    aria-label="Compare with another revision"
                  >
                    <option value="">Compare with…</option>
                    {compareWith.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.revision}
                      </option>
                    ))}
                  </select>
                )}
                {rev.fileUrl && (
                  <a href={rev.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <ExternalLink className="h-4 w-4" /> File
                  </a>
                )}
                <button onClick={save} disabled={!dirty || saving} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save marks
                </button>
              </div>
            </div>

            {/* Tools */}
            <div className="sticky top-[calc(3.85rem+env(safe-area-inset-top,0px))] lg:top-[4.25rem] z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
              <div className="flex rounded-xl bg-slate-100 p-0.5">
                {TOOLS.map((t) => (
                  <button key={t.key} onClick={() => setTool(t.key)} className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold", tool === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")} title={t.label}>
                    <t.icon className="h-4 w-4" /> <span className="hidden sm:inline">{t.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setColor(c)} className={cn("h-6 w-6 rounded-full ring-2 ring-offset-1", color === c ? "ring-slate-900" : "ring-transparent")} style={{ background: c }} aria-label={`Colour ${c}`} />
                ))}
              </div>
              <button onClick={() => change(myShapes.slice(0, -1))} disabled={!myShapes.length} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                <Undo2 className="h-4 w-4" /> Undo
              </button>
              <button onClick={() => myShapes.length && setClearConfirmOpen(true)} disabled={!myShapes.length} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                <Trash2 className="h-4 w-4" /> Clear mine
              </button>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Zoom out">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-12 text-center text-xs font-bold tabular-nums">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Zoom in">
                  <Plus className="h-4 w-4" />
                </button>
                {pages > 1 && (
                  <span className="ml-2 flex items-center gap-1 text-xs font-semibold">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-40" aria-label="Previous page">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    Page {page} of {pages}
                    <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-40" aria-label="Next page">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </span>
                )}
              </div>
            </div>

            {authors.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={showOthers} onChange={(e) => setShowOthers(e.target.checked)} className="h-4 w-4 accent-amber-600" />
                Show marks by {authors.join(", ")} (lighter)
              </label>
            )}

            {!rev.fileUrl ? (
              <Alert tone="info">This revision has no file attached. Upload a revision with its PDF or image to mark it up.</Alert>
            ) : (
              <div ref={box} className="relative overflow-auto rounded-2xl border border-slate-200 bg-slate-100" style={{ maxHeight: "72dvh" }}>
                <div className="relative mx-auto" style={{ width: size?.width, height: size?.height }}>
                  <canvas ref={canvas} className="block bg-white" />
                  {size && (
                    <MarkupLayer
                      width={size.width}
                      height={size.height}
                      tool={tool}
                      color={color}
                      mine={myShapes}
                      others={showOthers ? others : []}
                      onChange={change}
                      onAskText={askDrawingNote}
                    />
                  )}
                </div>
                {rendering && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/40">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                  </div>
                )}
              </div>
            )}
            {compareWith.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Columns2 className="h-3.5 w-3.5" /> Use &quot;Compare with…&quot; to see this revision next to an older one, or both on top of each other with the changes in colour.
              </p>
            )}
          </>
        )}
      </div>

      {noteModalOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4 pb-safe backdrop-blur-sm"
          onClick={() => {
            setNoteModalOpen(false);
            noteResolver.current?.(null);
            noteResolver.current = null;
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Note on drawing"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setNoteModalOpen(false);
              noteResolver.current?.(noteValue.trim() || null);
              noteResolver.current = null;
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-3"
          >
            <h3 className="text-sm font-bold text-slate-900">Note on the drawing</h3>
            <input
              type="text"
              autoFocus
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              placeholder="Enter callout note..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setNoteModalOpen(false);
                  noteResolver.current?.(null);
                  noteResolver.current = null;
                }}
                className="rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button type="submit" className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700">
                Place Note
              </button>
            </div>
          </form>
        </div>
      )}

      {clearConfirmOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4 pb-safe backdrop-blur-sm"
          onClick={() => setClearConfirmOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Clear drawing marks"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-900">Remove all your marks on this page?</h3>
            <p className="text-xs text-slate-500">Other team members&apos; marks will stay intact.</p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setClearConfirmOpen(false)} className="rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                Keep Marks
              </button>
              <button
                type="button"
                onClick={() => {
                  setClearConfirmOpen(false);
                  change([]);
                }}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
              >
                Clear Page Marks
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
