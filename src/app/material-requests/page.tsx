"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/cn";
import { formatCompactINR } from "@/lib/formatters";
import { submitOrQueue } from "@/lib/offline-queue";
import {
  Building2,
  CalendarClock,
  Check,
  ClipboardList,
  Loader2,
  PackageCheck,
  PackagePlus,
  Plus,
  ShoppingCart,
  Trash2,
  X,
  XCircle,
  Zap,
} from "lucide-react";

const STATUS: Record<string, { label: string; pill: string }> = {
  PENDING: { label: "Waiting for approval", pill: "bg-amber-50 text-amber-800 ring-amber-200" },
  APPROVED: { label: "Approved", pill: "bg-blue-50 text-blue-700 ring-blue-200" },
  PARTLY_ORDERED: { label: "Partly ordered", pill: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  ORDERED: { label: "Ordered", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  REJECTED: { label: "Rejected", pill: "bg-rose-50 text-rose-700 ring-rose-200" },
  CANCELLED: { label: "Cancelled", pill: "bg-slate-50 text-slate-500 ring-slate-200" },
};

const FILTERS = [
  { id: "", label: "All" },
  { id: "PENDING", label: "Waiting" },
  { id: "APPROVED,PARTLY_ORDERED", label: "To order" },
  { id: "ORDERED", label: "Ordered" },
  { id: "REJECTED,CANCELLED", label: "Closed" },
];

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.error?.message || "Something went wrong");
  return json.data as T;
}
const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function shortDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

function fmtQty(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// ── New request ─────────────────────────────────────────────────────────────

function NewRequestModal({ projects, materials, onClose, onCreated }: { projects: any[]; materials: any[]; onClose: () => void; onCreated: (r: any | null) => void }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [neededBy, setNeededBy] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ materialId: "", description: "", quantity: "", unitCode: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setItem = (i: number, patch: Partial<(typeof items)[number]>) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const project = projects.find((p) => p.id === projectId);
      const result = await submitOrQueue<any>({
        label: `Material request for ${project?.name || "project"}`,
        url: "/api/material-requests",
        body: {
          projectId,
          neededBy: neededBy || null,
          priority: urgent ? "URGENT" : "NORMAL",
          notes: notes || null,
          items: items
            .filter((it) => it.materialId || it.description.trim())
            .map((it) => ({
              materialId: it.materialId && it.materialId !== "OTHER" ? it.materialId : null,
              description: it.materialId === "OTHER" || !it.materialId ? it.description : null,
              quantity: Number(it.quantity),
              unitCode: it.unitCode || null,
            })),
        },
      });
      onCreated(result.queued ? null : result.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-xl animate-scale-in sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
            <PackagePlus className="h-5 w-5 text-amber-500" /> Request material
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && <Alert tone="error">{error}</Alert>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="text-xs font-bold text-slate-700">Project</span>
              <select required value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-700">Needed by</span>
              <input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Materials</span>
              <button
                type="button"
                onClick={() => setItems([...items, { materialId: "", description: "", quantity: "", unitCode: "" }])}
                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800"
              >
                <Plus className="h-3.5 w-3.5" /> Add line
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => {
                const mat = materials.find((m) => m.id === it.materialId);
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 rounded-xl bg-slate-50 p-2">
                    <select
                      value={it.materialId}
                      onChange={(e) => setItem(i, { materialId: e.target.value })}
                      className="col-span-12 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm sm:col-span-6"
                      aria-label="Material"
                    >
                      <option value="">Choose material…</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.unitCode})
                        </option>
                      ))}
                      <option value="OTHER">Something else (type it)</option>
                    </select>
                    {it.materialId === "OTHER" && (
                      <input
                        value={it.description}
                        onChange={(e) => setItem(i, { description: e.target.value })}
                        placeholder="e.g. 12mm binding wire"
                        className="col-span-12 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm sm:col-span-6 sm:col-start-1 sm:row-start-2"
                      />
                    )}
                    <input
                      type="number"
                      min={0}
                      step="any"
                      required
                      value={it.quantity}
                      onChange={(e) => setItem(i, { quantity: e.target.value })}
                      placeholder="Qty"
                      className="col-span-5 rounded-lg border border-slate-200 bg-white px-2 py-2 text-right text-sm tabular-nums sm:col-span-3"
                      aria-label="Quantity"
                    />
                    <input
                      value={mat ? mat.unitCode : it.unitCode}
                      disabled={!!mat}
                      onChange={(e) => setItem(i, { unitCode: e.target.value.toUpperCase() })}
                      placeholder="Unit"
                      className="col-span-5 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm disabled:bg-slate-100 sm:col-span-2"
                      aria-label="Unit"
                    />
                    <button
                      type="button"
                      onClick={() => setItems(items.length > 1 ? items.filter((_, j) => j !== i) : items)}
                      className="col-span-2 flex items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-rose-600 sm:col-span-1"
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-bold text-slate-700">Note for the office</span>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. For 5th floor slab, casting planned Friday" className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm" />
          </label>

          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-4 w-4 accent-rose-500" />
            <Zap className="h-4 w-4 text-rose-500" /> Urgent: work will stop without it
          </label>
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button disabled={saving || !projectId} className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-5 py-2 text-sm font-bold text-slate-950 shadow-sm disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Send request
          </button>
        </footer>
      </form>
    </div>
  );
}

// ── Order one line ──────────────────────────────────────────────────────────

function OrderModal({ request, item, vendors, materials, onClose, onDone }: any) {
  const [vendorPartyId, setVendorPartyId] = useState("");
  const [materialId, setMaterialId] = useState(item.materialId || "");
  const [rate, setRate] = useState("");
  const [date, setDate] = useState(request.neededBy ? new Date(request.neededBy).toISOString().slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qty = item.approvedQty ?? item.quantity;
  const total = rate ? Number(rate) * qty * 100 : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onDone(
        await api(
          `/api/material-requests/${request.id}/order`,
          post({ itemId: item.id, vendorPartyId, materialId: materialId || null, unitRate: rate ? Number(rate) : null, expectedDeliveryDate: date || null })
        )
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-sm overflow-y-auto animate-fade-in" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto animate-scale-in">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
            <ShoppingCart className="h-5 w-5 text-amber-500" /> Place order
          </h2>
          <p className="text-sm text-slate-500">
            {fmtQty(qty)} {item.unitCode} {item.description} · {request.requestNumber}
          </p>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {!item.materialId && (
          <label className="block">
            <span className="text-xs font-bold text-slate-700">Match to catalogue material</span>
            <select required value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">Choose…</option>
              {materials.map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unitCode})
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="text-xs font-bold text-slate-700">Vendor</span>
          <select required value={vendorPartyId} onChange={(e) => setVendorPartyId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="">Choose vendor…</option>
            {vendors.map((v: any) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.category ? ` · ${v.category}` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold text-slate-700">Rate per {item.unitCode} (₹)</span>
            <input type="number" min={0} step="any" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm tabular-nums" />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-700">Delivery by</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </label>
        </div>
        {total > 0 && <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Order value about <span className="font-bold text-slate-900">{formatCompactINR(total)}</span></div>}
        <p className="text-[11px] text-slate-400">The order goes through the usual purchase order approval before the vendor is messaged.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create order
          </button>
        </div>
      </form>
    </div>
  );
}

// ── One request ─────────────────────────────────────────────────────────────

function RequestCard({ r, me, highlight, onChange, onOrder }: { r: any; me: any; highlight: boolean; onChange: (r: any) => void; onOrder: (item: any) => void }) {
  const [approving, setApproving] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const st = STATUS[r.status] || STATUS.PENDING;

  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await fn());
      setApproving(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const approve = () =>
    act(() =>
      api(
        `/api/material-requests/${r.id}/review`,
        post({ action: "APPROVE", items: r.items.map((i: any) => ({ id: i.id, approvedQty: qty[i.id] !== undefined ? Number(qty[i.id]) : i.quantity })) })
      )
    );
  const reject = () => {
    const note = window.prompt("Why is this request rejected?");
    if (!note) return;
    act(() => api(`/api/material-requests/${r.id}/review`, post({ action: "REJECT", note })));
  };

  return (
    <article
      id={`req-${r.id}`}
      className={cn("rounded-2xl border bg-white p-4 shadow-xs sm:p-5", highlight ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-200/80")}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-bold text-slate-700">{r.requestNumber}</code>
            {r.priority === "URGENT" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                <Zap className="h-3 w-3" /> Urgent
              </span>
            )}
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold ring-1", st.pill)}>{st.label}</span>
          </div>
          <Link href={`/projects/${r.project.id}`} className="mt-1.5 flex items-center gap-1.5 text-sm font-bold text-slate-900 hover:text-amber-700">
            <Building2 className="h-4 w-4 text-slate-400" /> {r.project.name}
          </Link>
          <div className="mt-0.5 text-xs text-slate-500">
            {r.requestedBy.name} · {shortDate(r.createdAt)}
            {r.neededBy && (
              <span className="ml-2 inline-flex items-center gap-1 font-semibold text-slate-700">
                <CalendarClock className="h-3.5 w-3.5" /> needed by {shortDate(r.neededBy)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.status === "PENDING" && r.canManage && !approving && (
            <>
              <button onClick={() => setApproving(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800">
                <Check className="h-3.5 w-3.5" /> Review
              </button>
              <button onClick={reject} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-700">
                <XCircle className="h-3.5 w-3.5" /> Reject
              </button>
            </>
          )}
          {r.status === "PENDING" && r.requestedBy.id === me?.id && (
            <button
              onClick={() => window.confirm("Cancel this request?") && act(() => api(`/api/material-requests/${r.id}/cancel`, post({})))}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
            >
              Cancel request
            </button>
          )}
        </div>
      </header>

      {r.notes && <p className="mt-3 border-l-2 border-amber-300 pl-2.5 text-sm text-slate-700">{r.notes}</p>}
      {r.reviewNote && (
        <p className="mt-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{r.reviewedBy?.name}:</span> {r.reviewNote}
        </p>
      )}
      {error && <div className="mt-3 rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700">{error}</div>}

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Material</th>
              <th className="px-3 py-2 text-right font-semibold">Asked</th>
              <th className="px-3 py-2 text-right font-semibold">At site</th>
              <th className="px-3 py-2 text-right font-semibold">Approved</th>
              <th className="px-3 py-2 text-right font-semibold">Order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {r.items.map((i: any) => {
              const enough = i.stockAtSite !== null && i.stockAtSite >= i.quantity;
              return (
                <tr key={i.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{i.description}</div>
                    {!i.materialId && <div className="text-[10px] text-slate-400">Not in catalogue</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                    {fmtQty(i.quantity)} <span className="text-[11px] text-slate-400">{i.unitCode}</span>
                  </td>
                  <td className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums", enough ? "font-semibold text-emerald-700" : "text-slate-500")}>
                    {i.stockAtSite === null ? "—" : fmtQty(i.stockAtSite)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {approving ? (
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={qty[i.id] ?? String(i.quantity)}
                        onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })}
                        className="w-20 rounded-md border border-slate-200 px-1.5 py-1 text-right text-sm"
                        aria-label={`Approved quantity for ${i.description}`}
                      />
                    ) : (
                      fmtQty(i.approvedQty)
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {i.purchaseOrder ? (
                      <span className="inline-flex flex-col items-end">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <PackageCheck className="h-3.5 w-3.5" /> {i.purchaseOrder.orderNumber}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {i.purchaseOrder.vendor?.name} · {i.purchaseOrder.status.replace(/_/g, " ").toLowerCase()}
                        </span>
                      </span>
                    ) : r.canManage && ["APPROVED", "PARTLY_ORDERED"].includes(r.status) && (i.approvedQty ?? 0) > 0 ? (
                      <button onClick={() => onOrder(i)} className="rounded-md bg-gradient-brand px-2.5 py-1 text-[11px] font-bold text-slate-950">
                        Order
                      </button>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {approving && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-slate-500">Cut a quantity to 0 to leave that line out.</span>
          <button onClick={() => setApproving(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
            Back
          </button>
          <button onClick={approve} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
          </button>
        </div>
      )}
    </article>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function MaterialRequestsPage() {
  const [me, setMe] = useState<any>(null);
  const [requests, setRequests] = useState<any[] | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [ordering, setOrdering] = useState<{ request: any; item: any } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (filter) qs.set("status", filter);
    if (projectFilter) qs.set("projectId", projectFilter);
    api<any[]>(`/api/material-requests?${qs}`)
      .then(setRequests)
      .catch((e) => setError(e.message));
  }, [filter, projectFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setHighlight(params.get("id"));
    const status = params.get("status");
    if (status && FILTERS.some((f) => f.id === status)) setFilter(status);
    api("/api/auth/me").then((d: any) => setMe(d.user)).catch(() => {});
    api<any>("/api/projects").then((d) => setProjects(Array.isArray(d) ? d : d?.projects || [])).catch(() => {});
    api<any[]>("/api/materials").then(setMaterials).catch(() => {});
    api<any[]>("/api/parties").then((d) => setVendors((d || []).filter((p: any) => p.partyType !== "CONTRACTOR"))).catch(() => {});
  }, []);

  useEffect(() => {
    if (highlight && requests?.some((r) => r.id === highlight)) {
      document.getElementById(`req-${highlight}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlight, requests]);

  const replace = (updated: any) =>
    setRequests((list) => (list || []).map((r) => (r.id === updated.id ? { ...r, ...updated, canManage: r.canManage, items: mergeItems(r.items, updated.items) } : r)));

  const counts = useMemo(() => {
    const list = requests || [];
    return {
      waiting: list.filter((r) => r.status === "PENDING").length,
      urgent: list.filter((r) => r.status === "PENDING" && r.priority === "URGENT").length,
      toOrder: list.filter((r) => ["APPROVED", "PARTLY_ORDERED"].includes(r.status)).length,
    };
  }, [requests]);

  return (
    <Shell>
      <div className="space-y-5">
        <PageHeader icon={ClipboardList} title="Material Requests" subtitle="Request materials from site, get office approval, and create vendor purchase orders.">
          <button
            onClick={() => setShowNew(true)}
            disabled={projects.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2.5 text-sm font-bold text-slate-950 shadow-glow disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> New request
          </button>
        </PageHeader>

        {error && <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert>}
        {notice && <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert>}

        <div className="grid grid-cols-3 gap-3 stagger">
          {[
            { label: "Waiting for approval", value: counts.waiting, tone: "text-amber-600" },
            { label: "Urgent", value: counts.urgent, tone: "text-rose-600" },
            { label: "Approved, not ordered", value: counts.toOrder, tone: "text-blue-600" },
          ].map((x) => (
            <div key={x.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
              <div className={cn("font-display text-2xl font-extrabold tabular-nums", x.tone)}>{requests ? x.value : "–"}</div>
              <div className="text-xs text-slate-500">{x.label}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1.5 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
                  filter === f.id ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {requests === null ? (
          <div className="space-y-3">
            <div className="skeleton h-40 rounded-2xl" />
            <div className="skeleton h-40 rounded-2xl" />
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <PackagePlus className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-700">No material requests here</p>
            <p className="text-xs text-slate-500">When site needs cement, steel or anything else, raise a request and the office is told straight away.</p>
          </div>
        ) : (
          <div className="space-y-3 stagger">
            {requests.map((r) => (
              <RequestCard key={r.id} r={r} me={me} highlight={highlight === r.id} onChange={replace} onOrder={(item) => setOrdering({ request: r, item })} />
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <NewRequestModal
          projects={projects}
          materials={materials}
          onClose={() => setShowNew(false)}
          onCreated={(r) => {
            setShowNew(false);
            setNotice(r ? `${r.requestNumber} sent. The office has been told.` : "No signal, so the request is saved on this phone. It will be sent to the office when you are back online.");
            load();
          }}
        />
      )}

      {ordering && (
        <OrderModal
          request={ordering.request}
          item={ordering.item}
          vendors={vendors}
          materials={materials}
          onClose={() => setOrdering(null)}
          onDone={(updated: any) => {
            setOrdering(null);
            setNotice("Purchase order created. It now waits for order approval.");
            replace(updated);
          }}
        />
      )}
    </Shell>
  );
}

/** Keep each line's stock-at-site figure when a review or order returns fresh lines. */
function mergeItems(old: any[], fresh: any[] | undefined) {
  if (!fresh) return old;
  return fresh.map((f) => ({ ...f, stockAtSite: old.find((o) => o.id === f.id)?.stockAtSite ?? null }));
}
