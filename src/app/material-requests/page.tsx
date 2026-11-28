"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import SearchableSelect from "@/components/ui/SearchableSelect";
import SearchableMultiSelect from "@/components/ui/SearchableMultiSelect";
import { useTablePagination, ShowEntriesControl, TablePagination } from "@/components/ui/ExcelTable";
import { cn } from "@/lib/cn";
import { formatCompactINR, formatCompactNumber } from "@/lib/formatters";
import { submitOrQueue } from "@/lib/offline-queue";
import { compressImageFile } from "@/lib/image-compression";
import { compressVideoFile } from "@/lib/video-compression";
import { istDateKey } from "@/lib/ist-date";
import { uploadClientMedia } from "@/lib/upload-client";
import { resolveDeliveryLocation } from "@/lib/order-notifications";
import {
  ArrowRightLeft,
  Building2,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mail,
  MessageSquare,
  Package,
  PackageCheck,
  PackagePlus,
  Phone,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  Upload,
  Users,
  X,
  XCircle,
  Zap,
  Play,
  Sparkles,
} from "lucide-react";
import { parseBillText } from "@/lib/bill-ocr";

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
  { id: "APPROVED,PARTLY_ORDERED", label: "To Order" },
  { id: "ORDERED", label: "Ordered" },
  { id: "DELIVERED", label: "Received & Billed" },
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
  const [billDate, setBillDate] = useState(() => istDateKey());
  const [unitRate, setUnitRate] = useState(initialRate > 0 ? String(initialRate) : "");
  const [totalAmount, setTotalAmount] = useState(initialRate > 0 ? (initialRate * initialQty).toFixed(2) : "");
  const [notes, setNotes] = useState("");
  const [billFile, setBillFile] = useState<File | null>(null);
  const [billPreview, setBillPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScanningBill, setIsScanningBill] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [scanSuccessBanner, setScanSuccessBanner] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const scanBillImage = async (file: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    setIsScanningBill(true);
    setScanStatus("Analyzing bill with AI...");
    setScanSuccessBanner(null);

    try {
      let extracted: any = null;

      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/inventory/scan-bill", { method: "POST", body: formData });
        const json = await res.json();
        if (res.ok && json.success && json.data && !json.useClientOcr) {
          extracted = json.data;
        }
      } catch {}

      if (!extracted || (!extracted.challanNumber && !extracted.quantity)) {
        setScanStatus("Reading bill text via OCR engine...");
        const loadTesseract = async (): Promise<any> => {
          if ((window as any).Tesseract) return (window as any).Tesseract;
          return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
            script.async = true;
            script.onload = () => resolve((window as any).Tesseract);
            script.onerror = () => reject(new Error("Could not load OCR engine."));
            document.head.appendChild(script);
          });
        };

        const Tesseract = await loadTesseract();
        const worker = await Tesseract.createWorker("eng");
        const ret = await worker.recognize(file);
        await worker.terminate();

        const ocrText = ret?.data?.text || "";
        if (ocrText.trim()) {
          extracted = parseBillText(ocrText, [], []);
        }
      }

      if (extracted) {
        const filled: string[] = [];
        if (extracted.challanNumber) {
          setBillNumber(extracted.challanNumber);
          filled.push(`Invoice #${extracted.challanNumber}`);
        }
        if (extracted.quantity) {
          handleQtyChange(String(extracted.quantity));
          filled.push(`Qty: ${extracted.quantity}`);
        }
        if (extracted.unitRate) {
          handleRateChange(String(extracted.unitRate));
          filled.push(`Rate: ₹${extracted.unitRate}`);
        }
        if (extracted.totalAmount) {
          setTotalAmount(String(extracted.totalAmount));
        }
        if (extracted.date) {
          filled.push(`Date: ${extracted.date}`);
        }
        if (extracted.notes) {
          setNotes((prev) => (prev ? `${prev} | ${extracted.notes}` : extracted.notes));
        }
        if (filled.length > 0) {
          setScanSuccessBanner(`Auto-filled: ${filled.join(" • ")}`);
        }
      }
    } catch (err) {
      console.warn("Scan warning:", err);
    } finally {
      setIsScanningBill(false);
      setScanStatus(null);
    }
  };

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith("video/") || /\.(mp4|mov|webm|3gp|avi)$/i.test(file.name);
    let finalFile = file;

    if (isVideo) {
      if (file.size > 250 * 1024 * 1024) {
        setError("Video exceeds the 250 MB limit.");
        return;
      }
      finalFile = await compressVideoFile(file);
    } else if (file.type.startsWith("image/")) {
      finalFile = await compressImageFile(file, { preset: "receipt" });
    }

    setBillFile(finalFile);
    if (finalFile.type.startsWith("image/") || finalFile.type.startsWith("video/") || /\.(mp4|webm|mov|3gp|avi)$/i.test(finalFile.name)) {
      const url = URL.createObjectURL(finalFile);
      setBillPreview(url);
    } else {
      setBillPreview(null);
    }

    if (finalFile.type.startsWith("image/")) {
      scanBillImage(finalFile);
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

      // If file is > 3.5 MB, upload via chunked client first to prevent Vercel 413 error
      if (billFile.size > 3.5 * 1024 * 1024) {
        const uploadResult = await uploadClientMedia(billFile, {
          category: "INVOICE",
          entityType: "BILL",
          projectId: order.projectId,
          createAttachment: true,
        });
        if (uploadResult?.fileId) {
          formData.append("attachmentId", uploadResult.fileId);
        }
      } else {
        formData.append("file", billFile, billFile.name);
      }

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

          {/* Bill Photo / Video Upload Card */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Bill / Invoice Photo or Video <span className="text-rose-500">*</span>
            </label>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*,video/*,application/pdf"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
            {billFile ? (
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  {billPreview && (billFile.type.startsWith("video/") || /\.(mp4|webm|mov|3gp|avi)$/i.test(billFile.name)) ? (
                    <div className="relative h-12 w-12 rounded-lg bg-slate-950 overflow-hidden flex items-center justify-center border border-emerald-200 shrink-0">
                      <video src={billPreview} className="h-full w-full object-cover" muted preload="metadata" />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Play className="h-4 w-4 text-white fill-current" />
                      </div>
                    </div>
                  ) : billPreview ? (
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
                <div className="text-sm font-bold text-slate-800">Take Photo / Video or Upload Bill</div>
                <p className="mt-0.5 text-xs text-slate-400">Attach vendor bill, delivery challan, photo or video (up to 250MB)</p>
                <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs ring-1 ring-slate-200">
                  <Upload className="h-3.5 w-3.5 text-slate-500" /> Browse File / Camera
                </span>
              </div>
            )}
            <span className="text-[11px] text-slate-400 mt-1 block">
              This photo/video will be attached to the new Bill in <strong className="text-slate-600">Payments & Bills</strong>.
            </span>

            {/* Scanning status banner */}
            {isScanningBill && (
              <div className="mt-2 p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/90 flex items-center gap-2 text-xs text-emerald-800 font-semibold animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
                <span>{scanStatus || "Analyzing bill with AI & auto-fetching details..."}</span>
              </div>
            )}
            {scanSuccessBanner && !isScanningBill && (
              <div className="mt-2 p-2.5 rounded-xl border border-emerald-300 bg-emerald-100/90 text-emerald-950 text-xs flex items-center justify-between gap-2 animate-in fade-in">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-medium text-[11px] leading-tight break-words">{scanSuccessBanner}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setScanSuccessBanner(null)}
                  className="text-emerald-700 hover:text-emerald-900 p-0.5 rounded cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
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

function NewRequestModal({
  projects,
  materials,
  employees: propEmployees,
  onClose,
  onCreated,
}: {
  projects: any[];
  materials: any[];
  employees?: any[];
  onClose: () => void;
  onCreated: (r: any | null) => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  const [employees, setEmployees] = useState<any[]>(propEmployees || []);
  const [neededBy, setNeededBy] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ materialId: "", description: "", quantity: "", unitCode: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (propEmployees && propEmployees.length > 0) {
      setEmployees(propEmployees);
    } else {
      fetch("/api/chat/employees")
        .then((r) => r.json())
        .then((d) => {
          const emps = Array.isArray(d?.data?.employees)
            ? d.data.employees
            : Array.isArray(d?.employees)
            ? d.employees
            : Array.isArray(d?.data)
            ? d.data
            : [];
          setEmployees(emps);
        })
        .catch(() => {});
    }
  }, [propEmployees]);

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
          assignedUserIds,
          neededBy: neededBy || null,
          priority: urgent ? "URGENT" : "NORMAL",
          notes: notes || null,
          items: items
            .filter((it) => it.materialId || it.description.trim())
            .map((it) => {
              const mat = materials.find((m) => m.id === it.materialId);
              return {
                materialId: it.materialId && it.materialId !== "OTHER" ? it.materialId : null,
                description: it.materialId === "OTHER" || !it.materialId ? it.description : null,
                quantity: Number(it.quantity),
                unitCode: mat?.unitCode || it.unitCode || "NOS",
              };
            }),
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

          {/* Whom to assign the request (Multi-select) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-amber-600" />
                <span>Assign Request To (Multiple People)</span>
              </label>
              {assignedUserIds.length > 0 && (
                <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  {assignedUserIds.length} {assignedUserIds.length === 1 ? "person" : "people"} selected
                </span>
              )}
            </div>
            <SearchableMultiSelect
              options={(Array.isArray(employees) ? employees : []).filter((emp: any) => emp && emp.id && emp.name).map((emp: any) => ({
                value: emp.id,
                label: emp.name,
                badge: emp.role ? emp.role.replace(/_/g, " ") : undefined,
              }))}
              values={assignedUserIds}
              onChange={setAssignedUserIds}
              placeholder="Select project managers, storekeepers, or team members..."
              searchPlaceholder="Search person by name or role..."
              unassignedLabel="Unassigned (Default Project Reviewers)"
            />
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
                      className="col-span-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm tabular-nums sm:col-span-5"
                      aria-label="Quantity"
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

// ── Transfer Material Across Stores Modal ──────────────────────────────────

function TransferMaterialModal({
  request,
  item,
  stores = [],
  materials = [],
  onClose,
  onDone,
  onSwitchToOrder,
}: {
  request: any;
  item: any;
  stores?: any[];
  materials?: any[];
  onClose: () => void;
  onDone: (data: { result: any; message: string }) => void;
  onSwitchToOrder?: () => void;
}) {
  const reqQty = item.approvedQty ?? item.quantity;
  const mat = materials.find((m: any) => m.id === item.materialId);

  // 1. Gather all stores with available stock for this material
  const stockStoreMap = useMemo(() => {
    const map = new Map<string, number>();
    if (Array.isArray(item.availableStores)) {
      for (const st of item.availableStores) {
        map.set(st.storeId, Number(st.quantityOnHand) || 0);
      }
    }
    if (Array.isArray(mat?.stockBalances)) {
      for (const sb of mat.stockBalances) {
        const qty = Number(sb.quantityOnHand) || 0;
        if (qty > 0) {
          map.set(sb.storeId, Math.max(map.get(sb.storeId) || 0, qty));
        }
      }
    }
    return map;
  }, [item.availableStores, mat?.stockBalances]);

  // 2. Target Store (Destination): Auto-populate based on the request's site
  const defaultTargetStore = useMemo(() => {
    const siteId = request.project?.siteId || request.project?.site?.id;
    const siteStores = stores.filter((s: any) => s.siteId === siteId && !s.isArchived);
    return siteStores[0] || stores.find((s: any) => s.siteId === siteId) || item.defaultTargetStore || null;
  }, [request, stores, item.defaultTargetStore]);

  // 3. Source Store (Origin): Auto-populate with the store where stock is available
  const defaultSourceStore = useMemo(() => {
    const targetId = defaultTargetStore?.id;
    // Get all stores that have stock > 0
    const available = stores
      .filter((s: any) => (stockStoreMap.get(s.id) || 0) > 0)
      .sort((a: any, b: any) => (stockStoreMap.get(b.id) || 0) - (stockStoreMap.get(a.id) || 0));

    // Prefer a store with stock that is different from target store
    const nonTarget = available.find((s: any) => s.id !== targetId);
    return nonTarget || available[0] || item.bestSourceStore || null;
  }, [stores, stockStoreMap, defaultTargetStore, item.bestSourceStore]);

  const [sourceStoreId, setSourceStoreId] = useState(
    defaultSourceStore?.id || defaultSourceStore?.storeId || ""
  );
  const [targetStoreId, setTargetStoreId] = useState(defaultTargetStore?.id || "");
  const [quantity, setQuantity] = useState(String(reqQty));
  const [referenceDoc, setReferenceDoc] = useState(request.requestNumber || "");
  const [notes, setNotes] = useState(
    `Transfer for Material Request ${request.requestNumber} · ${request.project?.name || "Project"} (${request.project?.site?.name || "Site"})`
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const currentSourceStock = stockStoreMap.get(sourceStoreId) || 0;
  const currentTargetStore = stores.find((s: any) => s.id === targetStoreId);
  const currentSourceStore = stores.find((s: any) => s.id === sourceStoreId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const qtyNum = Number(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setError("Please enter a valid transfer quantity greater than 0.");
      return;
    }
    if (!sourceStoreId) {
      setError("Please select the Source Store where stock is available.");
      return;
    }
    if (!targetStoreId) {
      setError("Please select the Target Store for the request's site.");
      return;
    }
    if (sourceStoreId === targetStoreId) {
      setError("Source Store and Target Store cannot be the same store. Please select a different source store with stock.");
      return;
    }
    if (currentSourceStock > 0 && qtyNum > currentSourceStock) {
      setError(
        `Requested transfer quantity (${qtyNum} ${item.unitCode}) exceeds available stock in ${currentSourceStore?.name || "source store"} (${currentSourceStock} ${item.unitCode}).`
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/inventory/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceStoreId,
          targetStoreId,
          materialId: item.materialId,
          quantity: qtyNum,
          referenceDoc: referenceDoc.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Could not transfer material between stores. Check source store balance.");
      }

      onDone({
        result: data.data,
        message: `Successfully transferred ${qtyNum} ${item.unitCode} ${item.description} from ${currentSourceStore?.name || "Source Store"} to ${currentTargetStore?.name || "Target Store"}!`,
      });
    } catch (e: any) {
      setError(e.message || "Failed to transfer material across stores.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 pb-safe sm:p-4 backdrop-blur-sm overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:pb-5 shadow-xl max-h-[90dvh] overflow-y-auto animate-scale-in border border-slate-200"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200 mb-1">
              <ArrowRightLeft className="w-3 h-3 text-sky-600" />
              <span>Internal Stock Transfer</span>
            </div>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
              Transfer Material for Request
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Available in Material &amp; Stock · {request.requestNumber} ({request.project?.name})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        {/* Request Context Summary */}
        <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-500">Requested Material:</span>
            <span className="font-bold text-slate-900 text-sm">{item.description}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
            <div>
              <span className="text-slate-400 block text-[11px]">Approved Quantity:</span>
              <span className="font-bold text-slate-800">
                {fmtQty(reqQty)} {item.unitCode}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Destination Project &amp; Site:</span>
              <span className="font-bold text-slate-800 truncate block">
                {request.project?.name} ({request.project?.site?.name || "Site"})
              </span>
            </div>
          </div>
        </div>

        {/* Source and Target Store Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                Source Store (From)
              </label>
              {currentSourceStock > 0 && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  {currentSourceStock} {item.unitCode} avail
                </span>
              )}
            </div>
            <SearchableSelect
              options={stores.map((s: any) => {
                const stock = stockStoreMap.get(s.id) || 0;
                return {
                  value: s.id,
                  label: s.name,
                  subLabel: `${s.site?.name || "Yard"} • Available: ${stock} ${item.unitCode}`,
                  badge: stock > 0 ? "In Stock" : "0 Stock",
                };
              })}
              value={sourceStoreId}
              onChange={(val) => setSourceStoreId(val)}
              placeholder="Select store with stock..."
              searchPlaceholder="Search source store..."
              required
            />
            <span className="text-[10px] text-slate-400 block mt-1">
              Auto-filled with store where stock is available.
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                Target Store (To)
              </label>
              {currentTargetStore?.site?.name && (
                <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 truncate max-w-[130px]">
                  {currentTargetStore.site.name}
                </span>
              )}
            </div>
            <SearchableSelect
              options={stores.map((s: any) => ({
                value: s.id,
                label: s.name,
                subLabel: s.site?.name || "Site",
                badge: s.siteId === (request.project?.siteId || request.project?.site?.id) ? "Target Site" : undefined,
              }))}
              value={targetStoreId}
              onChange={(val) => setTargetStoreId(val)}
              placeholder="Select target store..."
              searchPlaceholder="Search target store..."
              required
            />
            <span className="text-[10px] text-slate-400 block mt-1">
              Auto-filled with store for this request&apos;s site.
            </span>
          </div>
        </div>

        {/* Quantity and Reference Doc */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Transfer Quantity ({item.unitCode})
            </label>
            <input
              type="number"
              step="any"
              min="0.01"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-mono font-bold text-slate-900 focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Gate Pass / Reference #
            </label>
            <input
              type="text"
              value={referenceDoc}
              onChange={(e) => setReferenceDoc(e.target.value)}
              placeholder="e.g. MR-2611-003"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 focus:bg-white"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
            Transfer Notes / Purpose
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm text-slate-800 focus:bg-white"
          />
        </div>

        {/* Visual Route Indicator */}
        <div className="p-3 bg-sky-50/70 border border-sky-100 rounded-xl text-xs flex items-center justify-between gap-2 text-sky-950 font-medium">
          <div className="truncate">
            <span className="text-[10px] uppercase text-sky-600 block font-bold">From</span>
            <span className="font-bold truncate">{currentSourceStore?.name || "Source Store"}</span>
          </div>
          <div className="flex flex-col items-center shrink-0 px-2 text-sky-600">
            <span className="text-[10px] font-bold">{quantity || reqQty} {item.unitCode}</span>
            <ArrowRightLeft className="w-4 h-4" />
          </div>
          <div className="text-right truncate">
            <span className="text-[10px] uppercase text-sky-600 block font-bold">To</span>
            <span className="font-bold truncate">{currentTargetStore?.name || "Target Store"}</span>
          </div>
        </div>

        {/* Actions & Switch to Order Option */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
          {onSwitchToOrder ? (
            <button
              type="button"
              onClick={onSwitchToOrder}
              className="text-xs text-slate-500 hover:text-amber-700 underline cursor-pointer"
            >
              Order from vendor instead
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 px-4 py-2 text-sm font-bold text-white shadow-xs transition disabled:opacity-50 cursor-pointer"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
              <span>{saving ? "Transferring..." : "Confirm & Transfer"}</span>
            </button>
          </div>
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
  onTransfer,
  materials = [],
  stores = [],
  onReceive,
  onDeleteOrder,
  onApproveOrder,
  onRejectOrder,
}: {
  r: any;
  me: any;
  highlight: boolean;
  onChange: (r: any) => void;
  onOrder: (item: any) => void;
  onTransfer?: (target: { request: any; item: any }) => void;
  materials?: any[];
  stores?: any[];
  onReceive: (target: { order: any; item: any; request: any }) => void;
  onDeleteOrder?: (po: any) => void;
  onApproveOrder?: (po: any) => void;
  onRejectOrder?: (po: any) => void;
}) {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const st = STATUS[r.status] || STATUS.PENDING;

  const isAdmin =
    me?.role === "SUPER_ADMIN" ||
    me?.role === "ORG_ADMIN" ||
    (me?.role as string) === "ADMIN" ||
    me?.role === "SITE_SUPERVISOR" ||
    me?.role === "PROJECT_MANAGER" ||
    Boolean(me?.name && me.name.toLowerCase().includes("ranjan"));
  const canReview = r.canManage || isAdmin;

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
          {Array.isArray(r.assignedUsers) && r.assignedUsers.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500">Assigned to:</span>
              {r.assignedUsers.map((u: any) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs"
                >
                  <Users className="w-2.5 h-2.5 text-amber-600" />
                  <span>{u.name}</span>
                  {u.role && <span className="opacity-70 text-[9px] font-medium">({u.role.replace(/_/g, " ")})</span>}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {r.status === "PENDING" && canReview && !approving && !rejecting && (
            <>
              <button onClick={() => { setConfirmCancel(false); setApproving(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800">
                <Check className="h-3.5 w-3.5" /> Review
              </button>
              <button onClick={() => { setConfirmCancel(false); setRejectNote(""); setRejecting(true); }} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-700">
                <XCircle className="h-3.5 w-3.5" /> Decline
              </button>
            </>
          )}
          {r.status === "PENDING" && (r.requestedBy.id === me?.id || canReview) && !confirmCancel && (
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
          const mat = materials.find((m: any) => m.id === i.materialId);
          const matStock = Number(mat?.totalStock ?? mat?.totalStockCompany ?? 0);
          const totalAvailableStock = i.totalStock !== undefined ? Number(i.totalStock) : matStock;
          const isAvailableInStock =
            i.isAvailableInStock === true ||
            totalAvailableStock > 0 ||
            (Array.isArray(i.availableStores) && i.availableStores.length > 0) ||
            (Array.isArray(mat?.stockBalances) && mat.stockBalances.some((sb: any) => Number(sb.quantityOnHand) > 0));

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
              ) : (canReview || r.canManage || isAdmin) && ["APPROVED", "PARTLY_ORDERED"].includes(r.status) && (i.approvedQty ?? 0) > 0 ? (
                <div className="flex justify-end border-t border-slate-200/70 pt-2">
                  {isAvailableInStock && onTransfer ? (
                    <button
                      type="button"
                      onClick={() => onTransfer({ request: r, item: i })}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 text-xs font-bold shadow-2xs transition"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      <span>Transfer Material</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOrder(i)}
                      className="rounded-lg bg-gradient-brand px-3 py-1.5 text-xs font-bold text-slate-950"
                    >
                      Order
                    </button>
                  )}
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
              const mat = materials.find((m: any) => m.id === i.materialId);
              const matStock = Number(mat?.totalStock ?? mat?.totalStockCompany ?? 0);
              const totalAvailableStock = i.totalStock !== undefined ? Number(i.totalStock) : matStock;
              const isAvailableInStock =
                i.isAvailableInStock === true ||
                totalAvailableStock > 0 ||
                (Array.isArray(i.availableStores) && i.availableStores.length > 0) ||
                (Array.isArray(mat?.stockBalances) && mat.stockBalances.some((sb: any) => Number(sb.quantityOnHand) > 0));

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
                        {po.status === "PENDING_APPROVAL" ? (
                          <div className="inline-flex items-center gap-1.5">
                            {isAdmin ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onApproveOrder?.(po)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white shadow-2xs hover:bg-emerald-700 transition"
                                  title="Approve purchase order"
                                >
                                  <CheckCircle2 className="h-3 w-3" /> Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRejectOrder?.(po)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-rose-50 border border-rose-200 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition"
                                  title="Decline purchase order"
                                >
                                  <XCircle className="h-3 w-3" /> Decline
                                </button>
                              </>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full ring-1 ring-amber-200">
                                <Clock className="h-3 w-3 text-amber-600" /> Pending Approval
                              </span>
                            )}
                            {onDeleteOrder && (
                              <button
                                type="button"
                                onClick={() => onDeleteOrder(po)}
                                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition"
                                title="Delete purchase order"
                                aria-label={`Delete purchase order ${po.orderNumber}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ) : isDelivered ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-emerald-300">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Received & Billed
                          </span>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => onReceive({ order: po, item: i, request: r })}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs hover:bg-emerald-700 transition"
                            >
                              <Receipt className="h-3.5 w-3.5" /> Receive Goods & Bill
                            </button>
                            {onDeleteOrder && (
                              <button
                                type="button"
                                onClick={() => onDeleteOrder(po)}
                                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition"
                                title="Delete purchase order"
                                aria-label={`Delete purchase order ${po.orderNumber}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </span>
                    ) : (canReview || r.canManage || isAdmin) && ["APPROVED", "PARTLY_ORDERED"].includes(r.status) && (i.approvedQty ?? 0) > 0 ? (
                      isAvailableInStock && onTransfer ? (
                        <button
                          type="button"
                          onClick={() => onTransfer({ request: r, item: i })}
                          className="inline-flex items-center gap-1 rounded-md bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white px-2.5 py-1 text-[11px] font-bold shadow-2xs transition cursor-pointer"
                          title={`In Stock (${fmtQty(totalAvailableStock)} ${i.unitCode} available in Material & Stock). Click to transfer to site store.`}
                        >
                          <ArrowRightLeft className="h-3 w-3" />
                          <span>Transfer Material</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOrder(i)}
                          className="rounded-md bg-gradient-brand px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:opacity-90 transition shadow-2xs cursor-pointer"
                          title="Out of stock in Material & Stock. Place purchase order with vendor"
                        >
                          Order
                        </button>
                      )
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
  isAdmin,
  onReceive,
  onDelete,
  onApprove,
  onReject,
}: {
  po: any;
  isAdmin?: boolean;
  onReceive: (target: { order: any; item: any }) => void;
  onDelete?: (po: any) => void;
  onApprove?: (po: any) => void;
  onReject?: (po: any) => void;
}) {
  const isPending = po.status === "PENDING_APPROVAL";
  const isDelivered = po.status === "DELIVERED";
  const isApproved = ["APPROVED", "PLACED", "CONFIRMED"].includes(po.status);
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
        {isPending ? (
          isAdmin ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onApprove?.(po)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                title="Approve purchase order"
              >
                <CheckCircle2 className="h-4 w-4" /> Approve
              </button>
              <button
                type="button"
                onClick={() => onReject?.(po)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                title="Decline purchase order"
              >
                <XCircle className="h-4 w-4" /> Decline
              </button>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
              <Clock className="h-4 w-4 text-amber-600" /> Pending Approval
            </span>
          )
        ) : isDelivered ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Received & Billed
          </span>
        ) : isApproved ? (
          <button
            onClick={() => onReceive({ order: po, item: { description: po.material?.name, unitCode: po.unitCode || po.material?.unitCode, quantity: po.quantity } })}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
          >
            <Receipt className="h-4 w-4" /> Receive Goods & Bill
          </button>
        ) : (
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1", st.pill)}>
            {st.label}
          </span>
        )}
        {onDelete && !isDelivered && (
          <button
            type="button"
            onClick={() => onDelete(po)}
            className="inline-flex items-center justify-center p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition shadow-2xs"
            title="Delete purchase order"
            aria-label={`Delete purchase order ${po.orderNumber}`}
          >
            <Trash2 className="h-4 w-4" />
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
  const [employees, setEmployees] = useState<any[]>([]);

  const [activeView, setActiveView] = useState<"requests" | "orders">("requests");
  const [filter, setFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [ordering, setOrdering] = useState<{ request: any; item: any } | null>(null);
  const [transferring, setTransferring] = useState<{ request: any; item: any } | null>(null);
  const [receivingOrder, setReceivingOrder] = useState<{ order: any; item: any; request?: any } | null>(null);
  const [pendingDeleteOrder, setPendingDeleteOrder] = useState<any | null>(null);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [approvedNotification, setApprovedNotification] = useState<any | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const isAdmin =
    me?.role === "SUPER_ADMIN" ||
    me?.role === "ORG_ADMIN" ||
    (me?.role as string) === "ADMIN" ||
    me?.role === "SITE_SUPERVISOR" ||
    me?.role === "PROJECT_MANAGER" ||
    Boolean(me?.name && me.name.toLowerCase().includes("ranjan"));

  const handleCopyNotificationMessage = () => {
    if (approvedNotification?.message) {
      navigator.clipboard.writeText(approvedNotification.message);
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2000);
    }
  };

  const handleApproveOrder = async (po: any) => {
    try {
      const res = await fetch(`/api/orders/${po.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to approve purchase order");
      }
      setNotice(`Purchase order ${po.orderNumber} successfully approved!`);
      if (data.data?.notification) {
        setApprovedNotification({
          ...data.data.notification,
          order: data.data.order || po,
        });
      }
      load();
    } catch (err: any) {
      setError(err.message || "Failed to approve purchase order");
    }
  };

  const handleRejectOrder = async (po: any) => {
    const reason = window.prompt(`Enter reason for declining purchase order ${po.orderNumber}:`);
    if (reason === null) return;
    try {
      const res = await fetch(`/api/orders/${po.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || "Rejected by administrator" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to decline purchase order");
      }
      setNotice(`Purchase order ${po.orderNumber} declined.`);
      load();
    } catch (err: any) {
      setError(err.message || "Failed to decline purchase order");
    }
  };

  const executeDeleteOrder = async () => {
    if (!pendingDeleteOrder) return;
    const po = pendingDeleteOrder;
    setDeletingOrder(true);
    try {
      await api(`/api/orders/${po.id}`, { method: "DELETE" });
      setOrders((prev) => (prev ? prev.filter((o) => o.id !== po.id) : prev));
      setNotice(`Purchase order ${po.orderNumber} deleted successfully.`);
      setPendingDeleteOrder(null);
      load();
    } catch (err: any) {
      setError(err.message || "Failed to delete purchase order");
    } finally {
      setDeletingOrder(false);
    }
  };

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (projectFilter) qs.set("projectId", projectFilter);

    api<any[]>(`/api/material-requests?${qs}`)
      .then(setRequests)
      .catch((e) => setError(e.message));

    // Also fetch purchase orders
    api<any[]>("/api/orders")
      .then(setOrders)
      .catch(() => setOrders([]));
  }, [projectFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setHighlight(params.get("id"));
    const status = params.get("status");
    if (status && FILTERS.some((f) => f.id === status)) setFilter(status);
    if (params.get("new") === "true" || params.get("new") === "1" || params.get("action") === "new") {
      setShowNew(true);
    }
    refreshUser().then((u) => u && setMe(u)).catch(() => {});
    api<any>("/api/projects").then((d) => setProjects(Array.isArray(d) ? d : d?.projects || [])).catch(() => {});
    api<any[]>("/api/materials").then(setMaterials).catch(() => {});
    api<any[]>("/api/parties").then((d) => setVendors((d || []).filter((p: any) => p.partyType !== "CONTRACTOR"))).catch(() => {});
    api<any[]>("/api/stores").then(setStores).catch(() => {});
    api<any>("/api/chat/employees").then((d) => setEmployees(Array.isArray(d?.employees) ? d.employees : Array.isArray(d?.data?.employees) ? d.data.employees : Array.isArray(d) ? d : [])).catch(() => {});
  }, [refreshUser]);

  const requestsList = useMemo(() => {
    if (!requests) return [];
    let list = requests;

    // Filter by status if filter is selected
    if (filter === "PENDING") {
      list = list.filter((r) => r.status === "PENDING");
    } else if (filter === "APPROVED,PARTLY_ORDERED") {
      list = list.filter((r) => ["APPROVED", "PARTLY_ORDERED"].includes(r.status));
    } else if (filter === "ORDERED") {
      list = list.filter((r) => r.status === "ORDERED");
    } else if (filter === "DELIVERED") {
      list = list.filter((r) => r.status === "DELIVERED" || r.status === "FULFILLED");
    } else if (filter === "REJECTED,CANCELLED") {
      list = list.filter((r) => ["REJECTED", "CANCELLED"].includes(r.status));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => {
        // 1. Search in request number or project info
        if (r.requestNumber?.toLowerCase().includes(q)) return true;
        if (r.project?.name?.toLowerCase().includes(q) || r.project?.code?.toLowerCase().includes(q)) return true;
        if (r.project?.site?.name?.toLowerCase().includes(q)) return true;
        // 2. Search in requested items: material name, category, SKU, description
        return r.items?.some((i: any) => {
          if (i.description?.toLowerCase().includes(q)) return true;
          if (i.material?.name?.toLowerCase().includes(q)) return true;
          if (i.material?.sku?.toLowerCase().includes(q)) return true;
          if (i.material?.category?.name?.toLowerCase().includes(q)) return true;
          if (i.purchaseOrder?.orderNumber?.toLowerCase().includes(q)) return true;
          if (i.purchaseOrder?.vendor?.name?.toLowerCase().includes(q)) return true;
          return false;
        });
      });
    }
    return list;
  }, [requests, filter, searchQuery]);

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
    } else if (filter === "DELIVERED") {
      list = list.filter((o) => o.status === "DELIVERED");
    } else if (filter === "APPROVED,PARTLY_ORDERED") {
      list = list.filter((o) => o.status === "APPROVED" && !o.notificationSent);
    } else if (filter === "REJECTED,CANCELLED") {
      list = list.filter((o) => ["REJECTED", "CANCELLED"].includes(o.status));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((o) => {
        if (o.orderNumber?.toLowerCase().includes(q)) return true;
        if (o.material?.name?.toLowerCase().includes(q)) return true;
        if (o.material?.sku?.toLowerCase().includes(q)) return true;
        if (o.material?.category?.name?.toLowerCase().includes(q)) return true;
        if (o.vendor?.name?.toLowerCase().includes(q)) return true;
        if (o.site?.name?.toLowerCase().includes(q)) return true;
        return false;
      });
    }
    return list;
  }, [orders, projectFilter, filter, searchQuery]);

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
    const deliveredCount =
      ordList.filter((o) => o.status === "DELIVERED").length +
      reqList.filter((r) => r.status === "DELIVERED" || r.status === "FULFILLED").length;
    return {
      waiting:
        reqList.filter((r) => r.status === "PENDING").length +
        ordList.filter((o) => o.status === "PENDING_APPROVAL").length,
      toOrder: reqList.filter((r) => ["APPROVED", "PARTLY_ORDERED"].includes(r.status)).length,
      ordered:
        reqList.filter((r) => r.status === "ORDERED").length +
        ordList.filter((o) => ["APPROVED", "PLACED", "CONFIRMED"].includes(o.status)).length,
      delivered: deliveredCount,
    };
  }, [requests, orders]);

  return (
    <Shell>
      <div className="space-y-5">
        <PageHeader
          icon={PackagePlus}
          title="Material Requests"
          subtitle="Track site material requisitions, approvals, vendor purchase orders, and site deliveries."
        >
          <button
            onClick={() => setShowNew(true)}
            disabled={projects.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2.5 text-sm font-bold text-slate-950 shadow-glow disabled:opacity-50 cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Request Material
          </button>
        </PageHeader>

        {error && <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert>}
        {notice && <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert>}

        {/* Top Metric Summary Cards with Click-to-Filter */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 stagger">
          {[
            {
              id: "PENDING",
              label: "Waiting for approval",
              value: counts.waiting,
              tone: "text-amber-600",
              activeBorder: "border-amber-500 ring-2 ring-amber-500/30 bg-amber-50/50 shadow-xs",
              activeBadge: "bg-amber-100 text-amber-800",
            },
            {
              id: "APPROVED,PARTLY_ORDERED",
              label: "Approved, to order",
              value: counts.toOrder,
              tone: "text-blue-600",
              activeBorder: "border-blue-500 ring-2 ring-blue-500/30 bg-blue-50/50 shadow-xs",
              activeBadge: "bg-blue-100 text-blue-800",
            },
            {
              id: "ORDERED",
              label: "Ordered / In Transit",
              value: counts.ordered,
              tone: "text-indigo-600",
              activeBorder: "border-indigo-500 ring-2 ring-indigo-500/30 bg-indigo-50/50 shadow-xs",
              activeBadge: "bg-indigo-100 text-indigo-800",
            },
            {
              id: "DELIVERED",
              label: "Received & Billed",
              value: counts.delivered,
              tone: "text-emerald-600",
              activeBorder: "border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-50/50 shadow-xs",
              activeBadge: "bg-emerald-100 text-emerald-800",
            },
          ].map((x) => {
            const isActive = filter === x.id;
            return (
              <button
                key={x.label}
                type="button"
                onClick={() => {
                  if (isActive) {
                    setFilter("");
                  } else {
                    setFilter(x.id);
                    if (x.id === "APPROVED,PARTLY_ORDERED" && activeView === "orders" && counts.toOrder > 0) {
                      setActiveView("requests");
                    }
                  }
                }}
                title={isActive ? `Active filter: ${x.label} (Click to show all)` : `Click to filter by ${x.label}`}
                className={cn(
                  "rounded-xl sm:rounded-2xl border p-3 sm:p-4 text-left transition-all duration-150 cursor-pointer relative group",
                  isActive
                    ? x.activeBorder
                    : "border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs hover:-translate-y-0.5"
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className={cn("font-display text-xl sm:text-2xl font-black tabular-nums tracking-tight leading-none", x.tone)}>
                    {requests ? formatCompactNumber(x.value) : "–"}
                  </div>
                  {isActive && (
                    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0", x.activeBadge)}>
                      Filter Active ✓
                    </span>
                  )}
                </div>
                <div className="text-[11px] sm:text-xs font-medium text-slate-500 mt-1 truncate group-hover:text-slate-800 transition">
                  {x.label}
                </div>
              </button>
            );
          })}
        </div>

        {/* View Switcher: Site Requests vs Purchase Orders */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 border-b border-slate-200 pb-3">
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setActiveView("requests")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg py-2 px-2.5 text-xs font-bold transition whitespace-nowrap",
                activeView === "requests" ? "bg-white text-slate-950 shadow-xs" : "text-slate-600 hover:text-slate-900"
              )}
            >
              <PackagePlus className="h-3.5 w-3.5 shrink-0" />
              <span>Site Requests</span>
              {requests && <span className="ml-0.5 rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] font-bold">{requests.length}</span>}
            </button>
            <button
              onClick={() => setActiveView("orders")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg py-2 px-2.5 text-xs font-bold transition whitespace-nowrap",
                activeView === "orders" ? "bg-white text-slate-950 shadow-xs" : "text-slate-600 hover:text-slate-900"
              )}
            >
              <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
              <span>Purchase Orders</span>
              {orders && <span className="ml-0.5 rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] font-bold">{orders.length}</span>}
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

        {/* Search Bar and Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search material name, category, SKU code, PO number, or project..."
                className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {searchQuery && (
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                Found {activeView === "requests" ? requestsList.length : filteredOrders.length} result(s)
              </span>
            )}
          </div>

          {/* Status Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full py-0.5 px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "whitespace-nowrap shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition cursor-pointer",
                  filter === f.id ? "bg-slate-900 text-white ring-slate-900 shadow-xs" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
                )}
              >
                {f.label}
              </button>
            ))}
            {filter && (
              <button
                type="button"
                onClick={() => setFilter("")}
                className="whitespace-nowrap shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-rose-200 transition cursor-pointer ml-1"
                title="Reset status filter to All"
              >
                ✕ Clear Filter
              </button>
            )}
          </div>
        </div>

        {/* View 1: Site Requests & Orders */}
        {activeView === "requests" && (
          <>
            {requests === null ? (
              <div className="space-y-3">
                <div className="skeleton h-40 rounded-2xl" />
                <div className="skeleton h-40 rounded-2xl" />
              </div>
            ) : requestsList.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
                {searchQuery ? (
                  <>
                    <Search className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                    <p className="text-sm font-bold text-slate-800">No material requests match &quot;{searchQuery}&quot;</p>
                    <p className="text-xs text-slate-500 mt-1">Try checking your spelling, using broader search terms, or clearing your search.</p>
                    <button
                      onClick={() => setSearchQuery("")}
                      className="mt-3.5 px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition"
                    >
                      Clear search
                    </button>
                  </>
                ) : (
                  <>
                    <PackagePlus className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm font-semibold text-slate-700">No material requests or orders here</p>
                    <p className="text-xs text-slate-500">When site needs cement, steel or anything else, raise a request or place an order.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3 stagger">
                <div className="flex items-center justify-between gap-2 px-1 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">
                    Showing {requestsPagination.startItem}–{requestsPagination.endItem} of {requestsPagination.filteredCount} requests
                  </span>
                  <div className="hidden sm:block">
                    <ShowEntriesControl
                      pageSize={requestsPagination.pageSize}
                      onPageSizeChange={requestsPagination.setPageSize}
                    />
                  </div>
                </div>
                {requestsPagination.paginatedData.map((r) => (
                  <RequestCard
                    key={r.id}
                    r={r}
                    me={me}
                    highlight={highlight === r.id}
                    onChange={replace}
                    onOrder={(item) => setOrdering({ request: r, item })}
                    onTransfer={(target) => setTransferring(target)}
                    materials={materials}
                    stores={stores}
                    onReceive={(target) => setReceivingOrder(target)}
                    onDeleteOrder={(targetPo) => setPendingDeleteOrder(targetPo)}
                    onApproveOrder={handleApproveOrder}
                    onRejectOrder={handleRejectOrder}
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
                {searchQuery ? (
                  <>
                    <Search className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                    <p className="text-sm font-bold text-slate-800">No purchase orders match &quot;{searchQuery}&quot;</p>
                    <p className="text-xs text-slate-500 mt-1">Try clearing your search query or changing active project and status filters.</p>
                    <button
                      onClick={() => setSearchQuery("")}
                      className="mt-3.5 px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition"
                    >
                      Clear search
                    </button>
                  </>
                ) : (
                  <>
                    <ShoppingCart className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm font-semibold text-slate-700">No purchase orders found</p>
                    <p className="text-xs text-slate-500">Orders placed with vendors for site materials will be listed here.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3 stagger">
                <div className="flex items-center justify-between gap-2 px-1 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">
                    Showing {ordersPagination.startItem}–{ordersPagination.endItem} of {ordersPagination.filteredCount} orders
                  </span>
                  <div className="hidden sm:block">
                    <ShowEntriesControl
                      pageSize={ordersPagination.pageSize}
                      onPageSizeChange={ordersPagination.setPageSize}
                    />
                  </div>
                </div>
                {ordersPagination.paginatedData.map((po) => (
                  <PurchaseOrderRow
                    key={po.id}
                    po={po}
                    isAdmin={isAdmin}
                    onReceive={(target) => setReceivingOrder(target)}
                    onDelete={(targetPo) => setPendingDeleteOrder(targetPo)}
                    onApprove={handleApproveOrder}
                    onReject={handleRejectOrder}
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
          employees={employees}
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
          onDone={async (updated: any) => {
            const currentItem = ordering.item;
            setOrdering(null);
            setNotice("Purchase order created. It can now be received when delivered at site.");
            replace(updated);
            load();

            // If the ordered line was auto-approved into a purchase order, fetch PO details and show WhatsApp dispatch modal
            const orderedLine = updated?.items?.find((i: any) => i.id === currentItem.id);
            if (orderedLine?.purchaseOrderId) {
              try {
                const poData = await api<any>(`/api/orders/${orderedLine.purchaseOrderId}`);
                if (poData && poData.status === "APPROVED") {
                  setApprovedNotification({
                    sent: true,
                    orderNumber: poData.orderNumber,
                    materialName: poData.material?.name,
                    materialSku: poData.material?.sku,
                    quantity: poData.quantity,
                    unitCode: poData.unitCode,
                    unitRate: poData.unitRate,
                    totalAmount: poData.totalAmount,
                    deliveryLocation: resolveDeliveryLocation({ store: poData.store, site: poData.site }),
                    siteName: poData.site?.name,
                    expectedDeliveryDate: poData.expectedDeliveryDate ? new Date(poData.expectedDeliveryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null,
                    approvedBy: poData.approvedBy,
                    vendorName: poData.vendor?.name,
                    vendorPhone: poData.vendor?.phone,
                    vendorEmail: poData.vendor?.email,
                    message: poData.notificationMessage,
                    whatsappUrl: poData.whatsappUrl,
                    mailtoUrl: poData.mailtoUrl,
                    order: poData,
                  });
                }
              } catch (e) {
                console.warn("Could not load PO details for notification dispatch", e);
              }
            }
          }}
        />
      )}

      {/* Transfer Material Modal */}
      {transferring && (
        <TransferMaterialModal
          request={transferring.request}
          item={transferring.item}
          stores={stores}
          materials={materials}
          onClose={() => setTransferring(null)}
          onDone={({ message }: any) => {
            setTransferring(null);
            load();
            api<any[]>("/api/materials").then(setMaterials).catch(() => {});
            api<any[]>("/api/stores").then(setStores).catch(() => {});
            setNotice(message || "Material transferred successfully across stores!");
          }}
          onSwitchToOrder={() => {
            const current = transferring;
            setTransferring(null);
            setOrdering(current);
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

      {/* Delete Purchase Order Confirmation Modal */}
      {pendingDeleteOrder && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs animate-fade-in"
          onClick={() => !deletingOrder && setPendingDeleteOrder(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-full bg-rose-50 ring-1 ring-rose-200 shrink-0">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-900 text-base">Delete Purchase Order?</h3>
                <p className="font-mono text-xs text-slate-500">{pendingDeleteOrder.orderNumber}</p>
              </div>
            </div>

            <p className="text-sm text-slate-600">
              Are you sure you want to delete purchase order{" "}
              <strong className="text-slate-900 font-semibold">{pendingDeleteOrder.orderNumber}</strong> (
              <span className="font-medium text-slate-800">{pendingDeleteOrder.material?.name || "Material"}</span>
              )?
            </p>
            <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
              This will remove the purchase order and re-open any associated material request line for ordering.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingDeleteOrder(null)}
                disabled={deletingOrder}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={executeDeleteOrder}
                disabled={deletingOrder}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-xs disabled:opacity-50"
              >
                {deletingOrder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                <span>{deletingOrder ? "Deleting..." : "Delete Order"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Approved Order Vendor Notification & WhatsApp Details Modal */}
      {approvedNotification && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto animate-fade-in"
          onClick={() => setApprovedNotification(null)}
        >
          <div
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[92dvh] flex flex-col overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-800 to-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white leading-tight">Order Request Approved</h3>
                  <p className="text-[11px] text-emerald-200">Ready for WhatsApp Vendor Dispatch</p>
                </div>
              </div>
              <button
                onClick={() => setApprovedNotification(null)}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 flex-1 overflow-y-auto">
              {/* Target Vendor & WhatsApp Destination Highlight */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-xs space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-100 pb-2.5">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                      Target Vendor Full Name
                    </span>
                    <h4 className="text-base font-extrabold text-slate-900">
                      {approvedNotification.vendorName || "Vendor Name Unavailable"}
                    </h4>
                  </div>
                  {approvedNotification.vendorPhone ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-black shadow-xs">
                      <Phone className="w-3.5 h-3.5" />
                      <span>{approvedNotification.vendorPhone}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 font-semibold">
                      No phone registered
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-emerald-900">
                  <MessageSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    WhatsApp message will be shared to:{" "}
                    {approvedNotification.vendorPhone ? (
                      <strong className="font-bold underline decoration-emerald-500 text-emerald-950">
                        {approvedNotification.vendorPhone}
                      </strong>
                    ) : (
                      <span className="italic text-slate-500">None (phone number missing)</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Complete Order Details Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Order Details</span>
                  <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-slate-200 text-slate-800">
                    {approvedNotification.orderNumber || approvedNotification.order?.orderNumber || "PO"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Material</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {approvedNotification.materialName || approvedNotification.order?.material?.name || "Material"}
                    </span>
                    {approvedNotification.materialSku && (
                      <span className="text-[10px] text-slate-500 block font-mono">
                        SKU: {approvedNotification.materialSku}
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Quantity</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {approvedNotification.quantity?.toLocaleString("en-IN") || approvedNotification.order?.quantity || "0"}{" "}
                      {approvedNotification.unitCode || approvedNotification.order?.unitCode || ""}
                    </span>
                  </div>

                  {(approvedNotification.unitRate || approvedNotification.order?.unitRate) && (
                    <div>
                      <span className="text-slate-400 block text-[11px]">Unit Rate</span>
                      <span className="font-bold text-slate-800">
                        ₹{((approvedNotification.unitRate || approvedNotification.order?.unitRate) / 100).toFixed(2)} / {approvedNotification.unitCode || approvedNotification.order?.unitCode}
                      </span>
                    </div>
                  )}

                  {(approvedNotification.totalAmount || approvedNotification.order?.totalAmount) && (
                    <div>
                      <span className="text-slate-400 block text-[11px]">Total Estimated Amount</span>
                      <span className="font-black text-emerald-700 text-sm">
                        ₹{((approvedNotification.totalAmount || approvedNotification.order?.totalAmount) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  <div>
                    <span className="text-slate-400 block text-[11px]">Delivery Location</span>
                    <span className="font-semibold text-slate-800">
                      {approvedNotification.deliveryLocation || approvedNotification.siteName || approvedNotification.order?.site?.name || "Main Site"}
                    </span>
                  </div>

                  {approvedNotification.expectedDeliveryDate && (
                    <div>
                      <span className="text-slate-400 block text-[11px]">Expected Delivery</span>
                      <span className="font-semibold text-slate-800">
                        {approvedNotification.expectedDeliveryDate}
                      </span>
                    </div>
                  )}

                  {approvedNotification.approvedBy && (
                    <div className="sm:col-span-2 pt-1 border-t border-slate-200/60 flex items-center gap-1.5 text-[11px] text-slate-600">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Approved by: <strong>{approvedNotification.approvedBy}</strong></span>
                    </div>
                  )}
                </div>
              </div>

              {/* WhatsApp & Email Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {approvedNotification.whatsappUrl ? (
                  <a
                    href={approvedNotification.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition group"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Send WhatsApp ({approvedNotification.vendorPhone || "Vendor"})</span>
                    <ExternalLink className="w-3.5 h-3.5 opacity-70 group-hover:translate-x-0.5 transition-transform" />
                  </a>
                ) : (
                  <div className="p-3 bg-slate-100 rounded-xl text-xs text-slate-500 text-center font-medium">
                    No vendor phone registered for WhatsApp
                  </div>
                )}

                {approvedNotification.mailtoUrl ? (
                  <a
                    href={approvedNotification.mailtoUrl}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md transition"
                  >
                    <Mail className="w-4 h-4" />
                    <span>Send Email to Vendor</span>
                  </a>
                ) : (
                  <div className="p-3 bg-slate-100 rounded-xl text-xs text-slate-500 text-center font-medium">
                    No vendor email registered
                  </div>
                )}
              </div>

              {/* Formatted Message Preview & Copy */}
              {approvedNotification.message && (
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
                    <span className="font-semibold">WhatsApp Message Preview:</span>
                    <button
                      type="button"
                      onClick={handleCopyNotificationMessage}
                      className="flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-bold"
                    >
                      {copiedNotification ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Text</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-900 text-slate-200 rounded-xl text-[11px] font-mono max-h-40 overflow-y-auto whitespace-pre-wrap border border-slate-800">
                    {approvedNotification.message}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500">
                The purchase order has been approved in the system.
              </span>
              <button
                type="button"
                onClick={() => setApprovedNotification(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

/** Keep each line's stock-at-site figure when a review or order returns fresh lines. */
function mergeItems(old: any[], fresh: any[] | undefined) {
  if (!fresh) return old;
  return fresh.map((f) => ({ ...f, stockAtSite: old.find((o) => o.id === f.id)?.stockAtSite ?? null }));
}
