"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Shell from "@/components/layout/Shell";
import { Alert } from "@/components/ui/Alert";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { diffInto, renderSheet } from "@/lib/pdf-render";
import { ShapeView, type Shape } from "@/components/drawings/MarkupLayer";
import { ArrowLeft, ChevronLeft, ChevronRight, Columns2, Layers, Loader2, Minus, Plus } from "lucide-react";

type Mode = "side" | "overlay";

function Sheet({ rev, page, width, onDrawn, canvasRef, showMarks }: { rev: any; page: number; width: number; onDrawn: (r: { pages: number; height: number }) => void; canvasRef: React.RefObject<HTMLCanvasElement>; showMarks: boolean }) {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (!rev?.fileUrl || !canvasRef.current || width < 100) return;
    let live = true;
    renderSheet(canvasRef.current, rev.fileUrl, { fileName: rev.fileName, page, width }).then((r) => {
      if (!live) return;
      setH(r.height);
      onDrawn({ pages: r.pages, height: r.height });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev?.fileUrl, page, width]);
  const marks: Shape[] = (rev?.markups || []).filter((m: any) => m.page === page).flatMap((m: any) => m.shapes);
  return (
    <div className="relative" style={{ width, height: h || undefined }}>
      <canvas ref={canvasRef} className="block bg-white" />
      {showMarks && h > 0 && (
        <svg width={width} height={h} className="pointer-events-none absolute left-0 top-0">
          {marks.map((s, i) => (
            <ShapeView key={i} s={s} w={width} h={h} />
          ))}
        </svg>
      )}
    </div>
  );
}

function CompareDrawings() {
  const q = useSearchParams();
  const router = useRouter();
  const [a, setA] = useState<any>(null);
  const [b, setB] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("side");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [drawn, setDrawn] = useState({ a: 0, b: 0 });
  const [changed, setChanged] = useState<number | null>(null);
  const [showMarks, setShowMarks] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const ca = useRef<HTMLCanvasElement>(null);
  const cb = useRef<HTMLCanvasElement>(null);
  const out = useRef<HTMLCanvasElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);

  const aId = q.get("a");
  const bId = q.get("b");

  useEffect(() => {
    if (!aId || !bId) return;
    Promise.all([api<any>(`/api/drawing-revisions/${aId}`), api<any>(`/api/drawing-revisions/${bId}`)])
      .then(([x, y]) => {
        // Older on the left, newer on the right.
        const [older, newer] = new Date(x.createdAt) <= new Date(y.createdAt) ? [x, y] : [y, x];
        setA(older);
        setB(newer);
      })
      .catch((e) => setError(e.message));
  }, [aId, bId]);

  useEffect(() => {
    const fit = () => box.current && setWidth(Math.floor(((box.current.clientWidth - (mode === "side" ? 24 : 2)) / (mode === "side" ? 2 : 1)) * zoom));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [mode, zoom, a, b]);

  // The overlay is worked out once both sheets are drawn at the same size.
  useEffect(() => {
    if (mode !== "overlay" || !drawn.a || !drawn.b || !ca.current || !cb.current || !out.current) return;
    setChanged(diffInto(out.current, ca.current, cb.current).changedShare);
  }, [mode, drawn, page, width]);

  // Scroll both sheets together side by side.
  const sync = (from: "l" | "r") => {
    const [src, dst] = from === "l" ? [left.current, right.current] : [right.current, left.current];
    if (src && dst && Math.abs(dst.scrollTop - src.scrollTop) > 1) {
      dst.scrollTop = src.scrollTop;
      dst.scrollLeft = src.scrollLeft;
    }
  };

  const others = (rev: any) => (rev?.revisions || []).filter((r: any) => r.fileUrl);

  return (
    <Shell>
      <div className="space-y-3">
        <Link href={b ? `/drawings/view/${b.id}` : "/drawings"} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to the drawing
        </Link>
        {error && <Alert tone="error">{error}</Alert>}
        {!a || !b ? (
          <div className="h-[70vh] animate-pulse rounded-2xl bg-slate-100" />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  <span className="font-mono">{b.drawing.number}</span>: {a.revision} and {b.revision}
                </h1>
                <p className="text-sm text-slate-500">{b.drawing.title}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {(["a", "b"] as const).map((side) => (
                  <select
                    key={side}
                    value={(side === "a" ? a : b).id}
                    onChange={(e) => router.replace(`/drawings/compare?a=${side === "a" ? e.target.value : a.id}&b=${side === "b" ? e.target.value : b.id}`)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold"
                    aria-label={side === "a" ? "Older revision" : "Newer revision"}
                  >
                    {others(b).map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.revision}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
            </div>

            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
              <div className="flex rounded-xl bg-slate-100 p-0.5">
                <button onClick={() => setMode("side")} className={cn("inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold", mode === "side" ? "bg-white shadow-sm" : "text-slate-500")}>
                  <Columns2 className="h-4 w-4" /> Side by side
                </button>
                <button onClick={() => setMode("overlay")} className={cn("inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold", mode === "overlay" ? "bg-white shadow-sm" : "text-slate-500")}>
                  <Layers className="h-4 w-4" /> Overlay
                </button>
              </div>
              {mode === "side" ? (
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={showMarks} onChange={(e) => setShowMarks(e.target.checked)} className="h-4 w-4 accent-amber-600" /> Show marks
                </label>
              ) : (
                <span className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                  <span className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded-sm bg-red-600" /> Only in {a.revision} (removed)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded-sm bg-blue-600" /> Only in {b.revision} (added)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded-sm bg-slate-400" /> Same in both
                  </span>
                  {changed !== null && <span className="text-slate-500">{changed < 0.0005 ? "No visible change on this page" : `${(changed * 100).toFixed(1)}% of the sheet changed`}</span>}
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Zoom out">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-12 text-center text-xs font-bold tabular-nums">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Zoom in">
                  <Plus className="h-4 w-4" />
                </button>
                {pages > 1 && (
                  <span className="ml-2 flex items-center gap-1 text-xs font-semibold">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded-lg p-1 hover:bg-slate-100 disabled:opacity-40" aria-label="Previous page">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    Page {page} of {pages}
                    <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="rounded-lg p-1 hover:bg-slate-100 disabled:opacity-40" aria-label="Next page">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </span>
                )}
              </div>
            </div>

            <div ref={box} className="relative">
              <div className={cn(mode === "side" ? "grid grid-cols-2 gap-6" : "hidden")}>
                {[
                  { rev: a, ref: ca, scroll: left, side: "l" as const },
                  { rev: b, ref: cb, scroll: right, side: "r" as const },
                ].map(({ rev, ref, scroll, side }) => (
                  <div key={side}>
                    <div className="mb-1 text-xs font-bold text-slate-600">
                      {rev.revision} · {rev.status === "GFC" ? "on site" : rev.status.toLowerCase().replace("_", " ")}
                    </div>
                    <div ref={scroll} onScroll={() => sync(side)} className="overflow-auto rounded-xl border border-slate-200 bg-slate-100" style={{ maxHeight: "74vh" }}>
                      <Sheet rev={rev} page={page} width={width} canvasRef={ref} showMarks={showMarks} onDrawn={(r) => { setPages((p) => Math.max(p, r.pages)); setDrawn((d) => ({ ...d, [side === "l" ? "a" : "b"]: Date.now() })); }} />
                    </div>
                  </div>
                ))}
              </div>
              {mode === "overlay" && (
                <div className="overflow-auto rounded-xl border border-slate-200 bg-white" style={{ maxHeight: "78vh" }}>
                  {changed === null && <Loader2 className="m-6 h-6 w-6 animate-spin text-slate-400" />}
                  <canvas ref={out} className="block" />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

export default function CompareDrawingsPage() {
  return (
    <Suspense fallback={null}>
      <CompareDrawings />
    </Suspense>
  );
}
