"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { useTablePagination, ShowEntriesControl, TablePagination } from "@/components/ui/ExcelTable";
import { cn } from "@/lib/cn";
import { formatCompactINR, formatCompactNumber } from "@/lib/formatters";
import { submitOrQueue } from "@/lib/offline-queue";
import {
  Building2,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Image as ImageIcon,
  Loader2,
  Package,
  PackageCheck,
  PackagePlus,
  Plus,
  Receipt,
  ShoppingCart,
  Trash2,
  Upload,
  X,
  XCircle,
  Zap,
} from "lucide-react";

const STATUS: Record<string, { label: string; pill: string }> = {
  PENDING: { label: "Waiting for approval", pill: "bg-amber-50 text-amber-800 ring-amber-200" },
  APPROVED: { label: "Approved", pill: "bg-blue-50 text-blue-700 ring-blue-200" },
  PARTLY_ORDERED: { label: "Partly ordered", pill: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  ORDERED: { label: "Ordered", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  REJECTED: { label: "Declined", pill: "bg-rose-50 text-rose-700 ring-rose-200" },
  CANCELLED: { label: "Cancelled", pill: "bg-slate-50 text-slate-500 ring-slate-200" },
};

const ORDER_STATUS: Record<string, { label: string; pill: string }> = {
  PENDING_APPROVAL: { label: "Pending Approval", pill: "bg-amber-50 text-amber-800 ring-amber-200" },
  APPROVED: { label: "Approved", pill: "bg-blue-50 text-blue-700 ring-blue-200" },
  PLACED: { label: "Placed with Vendor", pill: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  CONFIRMED: { label: "Confirmed", pill: "bg-purple-50 text-purple-700 ring-purple-200" },
  DELIVERED: { label: "Received & Billed", pill: "bg-emerald-50 text-emerald-800 ring-emerald-300 font-bold" },
  REJECTED: { label: "Rejected", pill: "bg-rose-50 text-rose-700 ring-rose-200" },
  CANCELLED: { label: "Cancelled", pill: "bg-slate-50 text-slate-500 ring-slate-200" },
};

const FILTERS = [
  { id: "", label: "All" },
  { id: "PENDING", label: "Waiting" },
  { id: "APPROVED,PARTLY_ORDERED", label: "To order" },
  { id: "ORDERED", label: "Ordered / In Transit" },
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

// ── Receive Order & Bill Modal ──────────────────────────────────────────────

function ReceiveOrderModal({
  order,
  item,
  request,
  stores,
  onClose,
  onReceived,
}: {
  order: any;
  item: any;
  request?: any;
  stores: any[];
  onClose: () => void;
  onReceived: (result: any) => void;
}) {
  const initialQty = item?.approvedQty ?? item?.quantity ?? order?.quantity ?? 1;
  const initialRate = order?.unitRate ? (order.unitRate > 1000 ? order.unitRate / 100 : order.unitRate) : 0;

  const [receivedQty, setReceivedQty] = useState(String(initialQty));
  const [storeId, setStoreId] = useState(order?.storeId || (stores[0]?.id || ""));
  const [billNumber, setBillNumber] = useState(`INV-${order?.orderNumber?.replace(/^PO-/, "") || Date.now().toString().slice(-6)}`);
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [unitRate, setUnitRate] = useState(initialRate > 0 ? String(initialRate) : "");
  const [totalAmount, setTotalAmount] = useState(initialRate > 0 ? (initialRate * initialQty).toFixed(2) : "");
  const [notes, setNotes] = useState("");
  const [billFile, setBillFile] = useState<File | null>(null);
  const [billPreview, setBillPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleQtyChange = (val: string) => {
    setReceivedQty(val);
    const q = parseFloat(val);
    const r = parseFloat(unitRate);
    if (!isNaN(q) && !isNaN(r) && q >= 0 && r >= 0) {
      setTotalAmount((q * r).toFixed(2));
    }
  };

  const handleRateChange = (val: string) => {
    setUnitRate(val);
    const q = parseFloat(receivedQty);
    const r = parseFloat(val);
    if (!isNaN(q) && !isNaN(r) && q >= 0 && r >= 0) {
      setTotalAmount((q * r).toFixed(2));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBillFile(file);
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setBillPreview(url);
    } else {
      setBillPreview(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qtyNum = parseFloat(receivedQty);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setError("Please enter a valid received quantity greater than zero.");
      return;
    }
    if (!storeId) {
      setError("Please choose a Store / Yard to receive the stock into.");
      return;
    }
    if (!billNumber.trim()) {
      setError("Please enter the Bill / Invoice number.");
      return;
    }
    if (!billFile) {
      setError("Please add or photograph the vendor bill / invoice to proceed.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("receivedQuantity", String(qtyNum));
      formData.append("storeId", storeId);
      formData.append("billNumber", billNumber.trim());
      formData.append("billDate", billDate);
      if (unitRate) formData.append("unitRate", unitRate);
      if (totalAmount) formData.append("totalAmount", totalAmount);
      if (notes) formData.append("notes", notes.trim());
      formData.append("file", billFile, billFile.name);

      const res = await fetch(`/api/orders/${order.id}/receive`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message || "Failed to record goods receipt and bill.");
      }
      onReceived(json.data);
    } catch (err: any) {
      setError(err.message || "Failed to record delivery.");
    } finally {
      setSubmitting(false);
    }
  };

  const materialName = order?.material?.name || item?.description || "Material";
  const unitCode = order?.unitCode || item?.unitCode || "NOS";
  const vendorName = order?.vendor?.name || "Vendor";
  const projectName = order?.project?.name || request?.project?.name || "Site Project";

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-2xl bg-white shadow-2xl animate-scale-in sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
              <PackageCheck className="h-5 w-5 text-emerald-600" /> Receive Goods & Record Bill
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Order <span className="font-mono font-bold text-slate-800">{order.orderNumber}</span> · {vendorName}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && <Alert tone="error">{error}</Alert>}

          {/* Order Snapshot Card */}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between font-bold text-emerald-950 text-sm">
              <span>{materialName}</span>
              <span className="font-mono">
                {fmtQty(initialQty)} {unitCode}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-emerald-800">
              <span>Project: {projectName}</span>
              {initialRate > 0 && <span>Agreed Rate: ₹{initialRate.toLocaleString("en-IN")}/{unitCode}</span>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Quantity Received */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Quantity Received ({unitCode}) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                step="any"
                required
                value={receivedQty}
                onChange={(e) => handleQtyChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900 tabular-nums focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                placeholder="e.g. 500"
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">Stock added to Materials & Stock</span>
            </div>

            {/* Store / Yard */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Store / Yard <span className="text-rose-500">*</span>
              </label>
              <SearchableSelect
                required
                options={stores.map((s) => ({
                  value: s.id,
                  label: s.name,
                  badge: s.code || undefined,
                  subLabel: s.site?.name ? `Site: ${s.site.name}` : undefined,
                }))}
                value={storeId}
                onChange={setStoreId}
                placeholder="Select store/yard..."
                searchPlaceholder="Search store or yard..."
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">Physical location for inventory</span>
            </div>
          </div>

          {/* Bill Photo Upload Card */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Bill / Invoice Photo <span className="text-rose-500">*</span>
            </label>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*,application/pdf"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
            {billFile ? (
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  {billPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={billPreview} alt="Bill Preview" className="h-12 w-12 rounded-lg object-cover border border-emerald-200 shrink-0" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                      <FileText className="h-6 w-6" />
                    </div>
                  )}
                  <div className="min-w-0 text-xs">
                    <div className="font-bold text-slate-900 truncate">{billFile.name}</div>
                    <div className="text-slate-500">{(billFile.size / 1024).toFixed(0)} KB · Ready to save</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBillFile(null);
                      setBillPreview(null);
                    }}
                    className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-5 text-center transition hover:border-emerald-400 hover:bg-emerald-50/20"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-2">
                  <Camera className="h-5 w-5" />
                </div>
                <div className="text-sm font-bold text-slate-800">Take Photo or Upload Bill</div>
                <p className="mt-0.5 text-xs text-slate-400">Attach vendor bill or delivery challan (JPG, PNG, PDF up to 15MB)</p>
                <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs ring-1 ring-slate-200">
                  <Upload className="h-3.5 w-3.5 text-slate-500" /> Browse File / Camera
                </span>
              </div>
            )}
            <span className="text-[11px] text-slate-400 mt-1 block">
              This photo will be attached to the new Bill in <strong className="text-slate-600">Payments & Bills</strong>.
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Bill / Invoice Number */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Bill / Invoice Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                placeholder="e.g. INV-2026-904"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            {/* Bill Date */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Bill / Delivery Date</label>
              <input
                type="date"
                required
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Unit Rate */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Rate per {unitCode} (₹)</label>
              <input
                type="number"
                min={0}
                step="any"
                value={unitRate}
                onChange={(e) => handleRateChange(e.target.value)}
                placeholder="e.g. 380"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm tabular-nums"
              />
            </div>

            {/* Total Bill Amount */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Total Bill Amount (₹)</label>
              <input
                type="number"
                min={0}
                step="any"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="e.g. 190000"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900 tabular-nums"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Lorry Receipt / Challan #</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Delivered by Truck RJ-19-GA-1234. Quality verified."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-3 rounded-b-2xl">
          <div className="text-xs text-slate-500">
            {totalAmount ? (
              <span>Bill: <strong className="text-slate-900">₹{Number(totalAmount).toLocaleString("en-IN")}</strong></span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">
              Cancel
            </button>
            <button
              disabled={submitting || !receivedQty || !billFile}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              OK — Add to Stock & Bills
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

// ── New Request Modal ───────────────────────────────────────────────────────

function NewRequestModal({ projects, materials, onClose, onCreated }: { projects: any[]; materials: any[]; onClose: () => void; onCreated: (r: any | null) => void }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [neededBy, setNeededBy] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ materialId: "", description: "", quantity: "", unitCode: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-xl animate-scale-in sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
            <PackagePlus className="h-5 w-5 text-amber-500" /> Request Material
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && <Alert tone="error">{error}</Alert>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <span className="text-xs font-bold text-slate-700 block mb-1">Project</span>
              <SearchableSelect
                required
                options={projects.map((p) => ({
                  value: p.id,
                  label: p.name,
                  badge: p.code || undefined,
                }))}
                value={projectId}
                onChange={setProjectId}
                placeholder="Select project..."
                searchPlaceholder="Search project name or code..."
              />
            </div>
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
        <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button disabled={saving || !projectId} className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-5 py-2 text-sm font-bold text-slate-950 shadow-sm disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Send Request
          </button>
        </footer>
      </form>
    </div>
  );
}

// ── Place Order Modal ───────────────────────────────────────────────────────

function OrderModal({ request, item, vendors, materials, onClose, onDone }: any) {
  const [vendorPartyId, setVendorPartyId] = useState("");
  const [materialId, setMaterialId] = useState(item.materialId || "");
  const [rate, setRate] = useState("");
  const [date, setDate] = useState(request.neededBy ? new Date(request.neededBy).toISOString().slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qty = item.approvedQty ?? item.quantity;
  const total = rate ? Number(rate) * qty * 100 : 0;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 pb-safe sm:p-4 backdrop-blur-sm overflow-y-auto animate-fade-in" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:pb-5 shadow-xl max-h-[90dvh] overflow-y-auto animate-scale-in">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
            <ShoppingCart className="h-5 w-5 text-amber-500" /> Place Order
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
        <p className="text-[11px] text-slate-400">The order is placed and vendor notified. When goods arrive, click Receive Goods & Bill.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create Order
          </button>
        </div>
      </form>
    </div>
  );
}

// ── One Request Card ────────────────────────────────────────────────────────

function RequestCard({
  r,
  me,
  highlight,
  onChange,
  onOrder,
  onReceive,
}: {
  r: any;
  me: any;
  highlight: boolean;
  onChange: (r: any) => void;
  onOrder: (item: any) => void;
  onReceive: (target: { order: any; item: any; request: any }) => void;
}) {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
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
      setRejecting(false);
      setConfirmCancel(false);
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
  const submitReject = (e: React.FormEvent) => {
    e.preventDefault();
    const note = rejectNote.trim();
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
          {r.status === "PENDING" && r.canManage && !approving && !rejecting && (
            <>
              <button onClick={() => { setConfirmCancel(false); setApproving(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800">
                <Check className="h-3.5 w-3.5" /> Review
              </button>
              <button onClick={() => { setConfirmCancel(false); setRejectNote(""); setRejecting(true); }} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-700">
                <XCircle className="h-3.5 w-3.5" /> Decline
              </button>
            </>
          )}
          {r.status === "PENDING" && r.requestedBy.id === me?.id && !confirmCancel && (
            <button
              onClick={() => { setRejecting(false); setConfirmCancel(true); }}
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

      {rejecting && (
        <form onSubmit={submitReject} className="mt-3 rounded-xl border border-rose-200 bg-rose-50/60 p-3 space-y-2">
          <label className="block text-xs font-bold text-rose-900">Reason for declining this request</label>
          <input
            type="text"
            required
            autoFocus
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="e.g. Stock already available at site"
            className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRejecting(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white">
              Cancel
            </button>
            <button type="submit" disabled={busy || !rejectNote.trim()} className="rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50">
              Decline Request
            </button>
          </div>
        </form>
      )}

      {confirmCancel && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs">
          <span className="font-semibold text-amber-950">Cancel this material request?</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmCancel(false)} className="rounded-lg px-3 py-1.5 font-semibold text-slate-600 hover:bg-white">
              Keep
            </button>
            <button
              type="button"
              onClick={() => act(() => api(`/api/material-requests/${r.id}/cancel`, post({})))}
              disabled={busy}
              className="rounded-lg bg-slate-900 px-3 py-1.5 font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Yes, Cancel
            </button>
          </div>
        </div>
      )}

      {/* Mobile Item Cards */}
      <div className="mt-3 space-y-2 sm:hidden">
        {r.items.map((i: any) => {
          const enough = i.stockAtSite !== null && i.stockAtSite >= i.quantity;
          const po = i.purchaseOrder;
          const isDelivered = po?.status === "DELIVERED";

          return (
            <div key={i.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900 text-sm">{i.description}</div>
                  {!i.materialId && <div className="text-[10px] text-slate-400">Not in catalogue</div>}
                </div>
                <span className="whitespace-nowrap rounded-md bg-white px-2 py-0.5 font-bold tabular-nums text-slate-800 ring-1 ring-slate-200">
                  Asked {fmtQty(i.quantity)} {i.unitCode}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                <span className={enough ? "font-semibold text-emerald-700" : ""}>
                  At site: {i.stockAtSite === null ? "—" : fmtQty(i.stockAtSite)}
                </span>
                {approving ? (
                  <label className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                    <span>Approve qty:</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={qty[i.id] ?? String(i.quantity)}
                      onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })}
                      className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-sm"
                    />
                  </label>
                ) : (
                  <span>
                    Approved: <strong className="text-slate-900 tabular-nums">{fmtQty(i.approvedQty)}</strong>
                  </span>
                )}
              </div>

              {po ? (
                <div className="flex flex-col gap-2 border-t border-slate-200/70 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                      <PackageCheck className="h-3.5 w-3.5" /> {po.orderNumber}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {po.vendor?.name} · {po.status.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </div>
                  {isDelivered ? (
                    <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Received & Billed
                    </div>
                  ) : (
                    <button
                      onClick={() => onReceive({ order: po, item: i, request: r })}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                    >
                      <Receipt className="h-3.5 w-3.5" /> Receive Goods & Bill
                    </button>
                  )}
                </div>
              ) : r.canManage && ["APPROVED", "PARTLY_ORDERED"].includes(r.status) && (i.approvedQty ?? 0) > 0 ? (
                <div className="flex justify-end border-t border-slate-200/70 pt-2">
                  <button onClick={() => onOrder(i)} className="rounded-lg bg-gradient-brand px-3 py-1.5 text-xs font-bold text-slate-950">
                    Order
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Desktop Item Table */}
      <div className="mt-3 hidden sm:block overflow-x-auto compact-table rounded-xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Material</th>
              <th className="px-3 py-2 text-right font-semibold">Asked</th>
              <th className="px-3 py-2 text-right font-semibold">At site</th>
              <th className="px-3 py-2 text-right font-semibold">Approved</th>
              <th className="px-3 py-2 text-right font-semibold">Order / Delivery Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {r.items.map((i: any) => {
              const enough = i.stockAtSite !== null && i.stockAtSite >= i.quantity;
              const po = i.purchaseOrder;
              const isDelivered = po?.status === "DELIVERED";

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
                    {po ? (
                      <span className="inline-flex flex-col items-end gap-1.5">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <PackageCheck className="h-3.5 w-3.5" /> {po.orderNumber}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {po.vendor?.name}
                        </span>
                        {isDelivered ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-emerald-300">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Received & Billed
                          </span>
                        ) : (
                          <button
                            onClick={() => onReceive({ order: po, item: i, request: r })}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs hover:bg-emerald-700 transition"
                          >
                            <Receipt className="h-3.5 w-3.5" /> Receive Goods & Bill
                          </button>
                        )}
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

// ── One Purchase Order Card (Direct Orders View) ────────────────────────────

function PurchaseOrderRow({
  po,
  onReceive,
}: {
  po: any;
  onReceive: (target: { order: any; item: any }) => void;
}) {
  const isDelivered = po.status === "DELIVERED";
  const st = ORDER_STATUS[po.status] || { label: po.status, pill: "bg-slate-100 text-slate-700" };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-800">{po.orderNumber}</code>
          <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1", st.pill)}>{st.label}</span>
          {po.createdAt && <span className="text-xs text-slate-400">{shortDate(po.createdAt)}</span>}
        </div>
        <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Package className="h-4 w-4 text-slate-400 shrink-0" />
          <span>{po.material?.name || "Material"}</span>
          <span className="text-xs font-semibold text-slate-600">
            ({fmtQty(po.quantity)} {po.unitCode || po.material?.unitCode})
          </span>
        </div>
        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Vendor: <strong className="text-slate-700">{po.vendor?.name || "Unknown"}</strong></span>
          {po.site?.name && <span>Site: <strong className="text-slate-700">{po.site.name}</strong></span>}
          {po.totalAmount && <span>Total: <strong className="text-slate-700">{formatCompactINR(po.totalAmount)}</strong></span>}
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-end gap-2">
        {isDelivered ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Received & Billed
          </span>
        ) : (
          <button
            onClick={() => onReceive({ order: po, item: { description: po.material?.name, unitCode: po.unitCode || po.material?.unitCode, quantity: po.quantity } })}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
          >
            <Receipt className="h-4 w-4" /> Receive Goods & Bill
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page Component ─────────────────────────────────────────────────────

export default function MaterialOrderHistoryPage() {
  const { refreshUser } = useAppSession();
  const [me, setMe] = useState<any>(null);
  const [requests, setRequests] = useState<any[] | null>(null);
  const [orders, setOrders] = useState<any[] | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);

  const [activeView, setActiveView] = useState<"requests" | "orders">("requests");
  const [filter, setFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [ordering, setOrdering] = useState<{ request: any; item: any } | null>(null);
  const [receivingOrder, setReceivingOrder] = useState<{ order: any; item: any; request?: any } | null>(null);

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

    // Also fetch purchase orders
    api<any[]>("/api/orders")
      .then(setOrders)
      .catch(() => setOrders([]));
  }, [filter, projectFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setHighlight(params.get("id"));
    const status = params.get("status");
    if (status && FILTERS.some((f) => f.id === status)) setFilter(status);
    refreshUser().then((u) => u && setMe(u)).catch(() => {});
    api<any>("/api/projects").then((d) => setProjects(Array.isArray(d) ? d : d?.projects || [])).catch(() => {});
    api<any[]>("/api/materials").then(setMaterials).catch(() => {});
    api<any[]>("/api/parties").then((d) => setVendors((d || []).filter((p: any) => p.partyType !== "CONTRACTOR"))).catch(() => {});
    api<any[]>("/api/stores").then(setStores).catch(() => {});
  }, [refreshUser]);

  const requestsList = useMemo(() => requests || [], [requests]);
  const requestsPagination = useTablePagination(requestsList);

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    let list = orders;
    if (projectFilter) {
      list = list.filter((o) => o.projectId === projectFilter || o.siteId === projectFilter);
    }
    if (filter === "ORDERED") {
      list = list.filter((o) => ["APPROVED", "PLACED", "CONFIRMED"].includes(o.status));
    } else if (filter === "PENDING") {
      list = list.filter((o) => o.status === "PENDING_APPROVAL");
    } else if (filter === "REJECTED,CANCELLED") {
      list = list.filter((o) => ["REJECTED", "CANCELLED"].includes(o.status));
    }
    return list;
  }, [orders, projectFilter, filter]);

  const ordersPagination = useTablePagination(filteredOrders);

  useEffect(() => {
    if (highlight && requests?.length) {
      const idx = requests.findIndex((r) => r.id === highlight);
      if (idx >= 0 && requestsPagination.pageSize > 0) {
        const targetPage = Math.floor(idx / requestsPagination.pageSize) + 1;
        if (targetPage !== requestsPagination.currentPage) {
          requestsPagination.setCurrentPage(targetPage);
          return;
        }
      }
      document.getElementById(`req-${highlight}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlight, requests, requestsPagination]);

  const replace = (updated: any) =>
    setRequests((list) => (list || []).map((r) => (r.id === updated.id ? { ...r, ...updated, canManage: r.canManage, items: mergeItems(r.items, updated.items) } : r)));

  const counts = useMemo(() => {
    const reqList = requests || [];
    const ordList = orders || [];
    const deliveredCount = ordList.filter((o) => o.status === "DELIVERED").length;
    return {
      waiting: reqList.filter((r) => r.status === "PENDING").length,
      toOrder: reqList.filter((r) => ["APPROVED", "PARTLY_ORDERED"].includes(r.status)).length,
      ordered: reqList.filter((r) => r.status === "ORDERED").length + ordList.filter((o) => ["APPROVED", "PLACED", "CONFIRMED"].includes(o.status)).length,
      delivered: deliveredCount,
    };
  }, [requests, orders]);

  return (
    <Shell>
      <div className="space-y-5">
        <PageHeader
          icon={PackageCheck}
          title="Material Order History"
          subtitle="Track material requests, vendor purchase orders, receive deliveries, and automatically add to Stock & Bills with bill photos."
        >
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

        {/* Top Metric Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger">
          {[
            { label: "Waiting for approval", value: counts.waiting, tone: "text-amber-600" },
            { label: "Approved, to order", value: counts.toOrder, tone: "text-blue-600" },
            { label: "Ordered / In Transit", value: counts.ordered, tone: "text-indigo-600" },
            { label: "Received & Billed", value: counts.delivered, tone: "text-emerald-600" },
          ].map((x) => (
            <div key={x.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
              <div className={cn("font-display text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight leading-tight truncate", x.tone)}>
                {requests ? formatCompactNumber(x.value) : "–"}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{x.label}</div>
            </div>
          ))}
        </div>

        {/* View Switcher: Site Requests vs Purchase Orders */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveView("requests")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition",
                activeView === "requests" ? "bg-white text-slate-950 shadow-xs" : "text-slate-600 hover:text-slate-900"
              )}
            >
              <PackagePlus className="h-3.5 w-3.5" /> Site Requests & Orders
              {requests && <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px]">{requests.length}</span>}
            </button>
            <button
              onClick={() => setActiveView("orders")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition",
                activeView === "orders" ? "bg-white text-slate-950 shadow-xs" : "text-slate-600 hover:text-slate-900"
              )}
            >
              <ShoppingCart className="h-3.5 w-3.5" /> All Purchase Orders
              {orders && <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px]">{orders.length}</span>}
            </button>
          </div>

          <div className="w-full sm:w-64 shrink-0">
            <SearchableSelect
              options={[
                { value: "", label: "All projects" },
                ...projects.map((p) => ({
                  value: p.id,
                  label: p.name,
                  badge: p.code || undefined,
                  subLabel: p.site?.name ? `Site: ${p.site.name}` : undefined,
                })),
              ]}
              value={projectFilter}
              onChange={(pid) => setProjectFilter(pid)}
              placeholder="All projects"
              searchPlaceholder="Search project name or code..."
            />
          </div>
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full py-1 px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "whitespace-nowrap shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
                filter === f.id ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* View 1: Site Requests & Orders */}
        {activeView === "requests" && (
          <>
            {requests === null ? (
              <div className="space-y-3">
                <div className="skeleton h-40 rounded-2xl" />
                <div className="skeleton h-40 rounded-2xl" />
              </div>
            ) : requests.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
                <PackagePlus className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-slate-700">No material requests or orders here</p>
                <p className="text-xs text-slate-500">When site needs cement, steel or anything else, raise a request or place an order.</p>
              </div>
            ) : (
              <div className="space-y-3 stagger">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 shadow-2xs">
                  <ShowEntriesControl
                    pageSize={requestsPagination.pageSize}
                    onPageSizeChange={requestsPagination.setPageSize}
                  />
                  <span className="text-xs text-slate-500">
                    Showing {requestsPagination.startItem} to {requestsPagination.endItem} of {requestsPagination.filteredCount} requests
                  </span>
                </div>
                {requestsPagination.paginatedData.map((r) => (
                  <RequestCard
                    key={r.id}
                    r={r}
                    me={me}
                    highlight={highlight === r.id}
                    onChange={replace}
                    onOrder={(item) => setOrdering({ request: r, item })}
                    onReceive={(target) => setReceivingOrder(target)}
                  />
                ))}
                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
                  <TablePagination
                    currentPage={requestsPagination.currentPage}
                    totalPages={requestsPagination.totalPages}
                    totalItems={requestsPagination.filteredCount}
                    totalUnfiltered={requestsPagination.totalRecords}
                    pageSize={requestsPagination.pageSize}
                    startItem={requestsPagination.startItem}
                    endItem={requestsPagination.endItem}
                    onPageChange={requestsPagination.setCurrentPage}
                    itemLabel="requests"
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* View 2: All Purchase Orders */}
        {activeView === "orders" && (
          <>
            {orders === null ? (
              <div className="space-y-3">
                <div className="skeleton h-32 rounded-2xl" />
                <div className="skeleton h-32 rounded-2xl" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
                <ShoppingCart className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-slate-700">No purchase orders found</p>
                <p className="text-xs text-slate-500">Orders placed with vendors for site materials will be listed here.</p>
              </div>
            ) : (
              <div className="space-y-3 stagger">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 shadow-2xs">
                  <ShowEntriesControl
                    pageSize={ordersPagination.pageSize}
                    onPageSizeChange={ordersPagination.setPageSize}
                  />
                  <span className="text-xs text-slate-500">
                    Showing {ordersPagination.startItem} to {ordersPagination.endItem} of {ordersPagination.filteredCount} orders
                  </span>
                </div>
                {ordersPagination.paginatedData.map((po) => (
                  <PurchaseOrderRow
                    key={po.id}
                    po={po}
                    onReceive={(target) => setReceivingOrder(target)}
                  />
                ))}
                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
                  <TablePagination
                    currentPage={ordersPagination.currentPage}
                    totalPages={ordersPagination.totalPages}
                    totalItems={ordersPagination.filteredCount}
                    totalUnfiltered={ordersPagination.totalRecords}
                    pageSize={ordersPagination.pageSize}
                    startItem={ordersPagination.startItem}
                    endItem={ordersPagination.endItem}
                    onPageChange={ordersPagination.setCurrentPage}
                    itemLabel="orders"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* New Request Modal */}
      {showNew && (
        <NewRequestModal
          projects={projects}
          materials={materials}
          onClose={() => setShowNew(false)}
          onCreated={(r) => {
            setShowNew(false);
            setNotice(r ? `${r.requestNumber} sent. The office has been told.` : "Request saved. It will sync once back online.");
            load();
          }}
        />
      )}

      {/* Place Order Modal */}
      {ordering && (
        <OrderModal
          request={ordering.request}
          item={ordering.item}
          vendors={vendors}
          materials={materials}
          onClose={() => setOrdering(null)}
          onDone={(updated: any) => {
            setOrdering(null);
            setNotice("Purchase order created. It can now be received when delivered at site.");
            replace(updated);
            load();
          }}
        />
      )}

      {/* Receive Goods & Record Bill Modal */}
      {receivingOrder && (
        <ReceiveOrderModal
          order={receivingOrder.order}
          item={receivingOrder.item}
          request={receivingOrder.request}
          stores={stores}
          onClose={() => setReceivingOrder(null)}
          onReceived={(res: any) => {
            setReceivingOrder(null);
            setNotice(res.message || "Goods received into Materials & Stock, and Bill added to Payments & Bills.");
            load();
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
