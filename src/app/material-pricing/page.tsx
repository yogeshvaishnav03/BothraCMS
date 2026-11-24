"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { FileUpload } from "@/components/ui/FileUpload";
import {
  Tag,
  Plus,
  Search,
  RefreshCw,
  Building2,
  Sparkles,
  Trash2,
  X,
  MapPin,
  Layers,
  Pencil,
  Package,
  List,
  History,
  UserPlus,
} from "lucide-react";

const COMMON_MATERIAL_UNITS = [
  { code: "BAG", label: "BAG (Bags — 50kg Cement, Putty, Adhesives)", group: "Weight & Bulk" },
  { code: "TON", label: "TON / MT (Metric Tonnes — TMT Steel, Rebar, Bulk)", group: "Weight & Bulk" },
  { code: "KG", label: "KG (Kilograms — Binding Wire, Nails, Hardware)", group: "Weight & Bulk" },
  { code: "QUINTAL", label: "QUINTAL (100 kg — Steel, Scaffolding)", group: "Weight & Bulk" },
  { code: "CFT", label: "CFT (Cubic Feet — Sand, Aggregate, Stone, Timber)", group: "Volume & Bulk Loads" },
  { code: "CUM", label: "CUM / M³ (Cubic Meters — RMC Concrete, Earthwork)", group: "Volume & Bulk Loads" },
  { code: "BRASS", label: "BRASS (100 CFT — Quarry Sand, Rubble, Murrum)", group: "Volume & Bulk Loads" },
  { code: "TRUCK", label: "TRUCK / DUMPER (Full Dumper Loads — Soil, Gravel)", group: "Volume & Bulk Loads" },
  { code: "TROLLEY", label: "TROLLEY (Tractor Trolley Loads — Bricks, Rubble)", group: "Volume & Bulk Loads" },
  { code: "SQFT", label: "SQFT (Square Feet — Tiles, Granite, Marble, Glass)", group: "Area & Flooring" },
  { code: "SQM", label: "SQM (Square Meters — Flooring, Plaster, Paint)", group: "Area & Flooring" },
  { code: "RFT", label: "RFT (Running Feet — Pipes, Railings, Beading)", group: "Length & Linear" },
  { code: "METER", label: "METER / RMT (Running Meters — Cables, Conduits)", group: "Length & Linear" },
  { code: "NOS", label: "NOS / PCS (Pieces — Bricks, AAC Blocks, Doors)", group: "Counts & Packages" },
  { code: "BOX", label: "BOX / PKT (Boxes / Packets — Screws, Spacers, Fittings)", group: "Counts & Packages" },
  { code: "BUNDLE", label: "BUNDLE (Bundles — Plywood, Rebar Bundles)", group: "Counts & Packages" },
  { code: "LTR", label: "LTR (Litres — Paint, Primer, Admixtures, Fuel)", group: "Liquids & Chemicals" },
  { code: "BARREL", label: "BARREL / DRUM (Drums — Bitumen, Waterproofing Liquid)", group: "Liquids & Chemicals" },
];
const UNIT_GROUPS = Array.from(new Set(COMMON_MATERIAL_UNITS.map((u) => u.group)));
const isCommonUnit = (code: string) => COMMON_MATERIAL_UNITS.some((u) => u.code === code);

interface QuotationItem {
  id: string;
  materialId: string;
  materialName: string;
  materialSku: string;
  materialCategory: string;
  vendorId: string;
  vendorName: string;
  vendorCity: string;
  vendorPhone: string;
  vendorRating: number | null;
  unitCode: string;
  baseRate: number;
  taxRatePercent: number;
  taxAmount: number;
  additionalCharges: number;
  totalLandingRate: number;
  isLowestPrice: boolean;
  rank: number | null;
  rankedVendorCount: number;
  isCurrent: boolean;
  isExpired: boolean;
  diffFromL1: number | null;
  diffFromL1Percent: number | null;
  quotationDate: string;
  validUntil: string | null;
  notes: string;
  createdBy: string;
}

interface MaterialOption {
  id: string;
  name: string;
  sku: string;
  unitCode: string;
  categoryName?: string;
}

interface VendorOption {
  id: string;
  name: string;
  phone?: string;
  city?: string;
}

type ViewMode = "material" | "vendor" | "all";

interface RateRow {
  vendorPartyId: string;
  baseRate: string;
  taxRatePercent: string;
  additionalCharges: string;
  notes: string;
}

const emptyRow = (vendorPartyId = ""): RateRow => ({
  vendorPartyId,
  baseRate: "",
  taxRatePercent: "18",
  additionalCharges: "0",
  notes: "",
});

const rupee = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const landing = (row: RateRow) => {
  const base = parseFloat(row.baseRate) || 0;
  const tax = (base * (parseFloat(row.taxRatePercent) || 0)) / 100;
  return base + tax + (parseFloat(row.additionalCharges) || 0);
};

const inputCls =
  "w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500";
const labelCls = "block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1";

function RankBadge({ q }: { q: QuotationItem }) {
  if (!q.isCurrent) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        Old rate
      </span>
    );
  }
  if (q.isExpired) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        Expired
      </span>
    );
  }
  if (q.rank === 1) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
        <Sparkles className="w-3 h-3" />
        L1
      </span>
    );
  }
  if (q.rank) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
        L{q.rank}
      </span>
    );
  }
  return null;
}

function DiffCell({ q }: { q: QuotationItem }) {
  if (q.diffFromL1 === null || q.rank === null) return <span className="text-slate-400">—</span>;
  if (q.rank === 1) {
    return <span className="text-emerald-600 dark:text-emerald-400 font-medium">Best price</span>;
  }
  return (
    <span className="text-rose-600 dark:text-rose-400">
      +{rupee(q.diffFromL1)}
      {q.diffFromL1Percent !== null && <span className="text-xs text-slate-500 ml-1">({q.diffFromL1Percent}%)</span>}
    </span>
  );
}

export default function MaterialPricingPage() {
  const [loading, setLoading] = useState(true);
  const [quotations, setQuotations] = useState<QuotationItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);

  // View + filters
  const [view, setView] = useState<ViewMode>("material");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("ALL");
  const [selectedVendorId, setSelectedVendorId] = useState<string>("ALL");
  const [lowestOnly, setLowestOnly] = useState(false);
  const [showOldRates, setShowOldRates] = useState(false);

  // Add / update modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [form, setForm] = useState({
    materialId: "",
    unitCode: "BAG",
    quotationDate: todayStr,
    validUntil: "",
  });
  const [rows, setRows] = useState<RateRow[]>([emptyRow()]);
  const [uploadedFile, setUploadedFile] = useState<{ url: string; name: string } | null>(null);

  // Inline "new material"
  const [newMat, setNewMat] = useState<{ open: boolean; name: string; unitCode: string; saving: boolean }>({
    open: false,
    name: "",
    unitCode: "BAG",
    saving: false,
  });

  const fetchQuotations = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/material-pricing`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.error || "Failed to load pricing data");
      }
      setQuotations(json.data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load quotations");
    } finally {
      setLoading(false);
    }
  };

  const fetchAuxiliary = async () => {
    try {
      const [matRes, partyRes] = await Promise.all([
        fetch("/api/materials?limit=500"),
        fetch("/api/parties?type=VENDOR&limit=500"),
      ]);
      if (matRes.ok) {
        const matJson = await matRes.json();
        setMaterials(
          (matJson.data || []).map((m: any) => ({
            id: m.id,
            name: m.name,
            sku: m.sku || "",
            unitCode: m.unitCode || "UNIT",
            categoryName: m.categoryName || m.category?.name || "General",
          }))
        );
      }
      if (partyRes.ok) {
        const pJson = await partyRes.json();
        setVendors(
          (pJson.data || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            phone: p.phone || p.whatsappNumber || "",
            city: p.city || "",
          }))
        );
      }
    } catch (e) {
      console.warn("Failed loading materials or vendors for pricing:", e);
    }
  };

  useEffect(() => {
    // Deep links: /material-pricing?vendor=<id>&view=vendor or ?material=<id>
    try {
      const sp = new URLSearchParams(window.location.search);
      const v = sp.get("vendor");
      const m = sp.get("material");
      const vw = sp.get("view");
      if (v) {
        setSelectedVendorId(v);
        setView("vendor");
      }
      if (m) setSelectedMaterialId(m);
      if (vw === "material" || vw === "vendor" || vw === "all") setView(vw);
    } catch {
      /* ignore */
    }
    fetchAuxiliary();
    fetchQuotations();
  }, []);

  // ---------- modal helpers ----------
  const openAddModal = (prefill?: { materialId?: string; unitCode?: string; vendorId?: string; from?: QuotationItem }) => {
    setError(null);
    const mat = prefill?.materialId ? materials.find((m) => m.id === prefill.materialId) : undefined;
    setForm({
      materialId: prefill?.materialId || "",
      unitCode: prefill?.unitCode || mat?.unitCode || "BAG",
      quotationDate: todayStr,
      validUntil: "",
    });
    if (prefill?.from) {
      const q = prefill.from;
      setRows([
        {
          vendorPartyId: q.vendorId,
          baseRate: String(q.baseRate),
          taxRatePercent: String(q.taxRatePercent),
          additionalCharges: String(q.additionalCharges),
          notes: q.notes,
        },
      ]);
    } else {
      setRows([emptyRow(prefill?.vendorId || "")]);
    }
    setUploadedFile(null);
    setNewMat({ open: false, name: "", unitCode: "BAG", saving: false });
    setShowAddModal(true);
  };

  const handleMaterialSelect = (matId: string) => {
    const mat = materials.find((m) => m.id === matId);
    setForm((prev) => ({ ...prev, materialId: matId, unitCode: mat?.unitCode || prev.unitCode }));
  };

  const updateRow = (idx: number, patch: Partial<RateRow>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const createMaterial = async () => {
    const name = newMat.name.trim();
    if (name.length < 2) {
      setError("Material name must be at least 2 characters");
      return;
    }
    try {
      setNewMat((p) => ({ ...p, saving: true }));
      const sku = `MAT-${Date.now().toString(36).toUpperCase()}`;
      const unitCode = (newMat.unitCode || "NOS").toUpperCase();
      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sku, unitCode }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.error || "Could not add material");
      }
      const m = json.data;
      const opt: MaterialOption = {
        id: m.id,
        name: m.name,
        sku: m.sku,
        unitCode: m.unitCode,
        categoryName: m.category?.name || "General",
      };
      setMaterials((prev) => [...prev, opt].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((prev) => ({ ...prev, materialId: opt.id, unitCode: opt.unitCode }));
      setNewMat({ open: false, name: "", unitCode: "BAG", saving: false });
    } catch (err: any) {
      setError(err?.message || "Could not add material");
      setNewMat((p) => ({ ...p, saving: false }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!form.materialId) return setError("Please select a material");
    if (!form.unitCode) return setError("Please choose a unit");
    const filled = rows.filter((r) => r.vendorPartyId || r.baseRate);
    if (filled.length === 0) return setError("Add at least one vendor rate");
    for (const r of filled) {
      if (!r.vendorPartyId) return setError("Choose a vendor for every rate row");
      const base = parseFloat(r.baseRate);
      if (isNaN(base) || base <= 0) return setError("Every base rate must be greater than zero");
    }
    const ids = filled.map((r) => r.vendorPartyId);
    if (new Set(ids).size !== ids.length) return setError("The same vendor is listed twice");

    try {
      setSubmitting(true);
      const attachNote = uploadedFile ? ` [Attached: ${uploadedFile.name}]` : "";
      const res = await fetch("/api/material-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: form.materialId,
          unitCode: form.unitCode,
          quotationDate: form.quotationDate,
          validUntil: form.validUntil || undefined,
          rates: filled.map((r, i) => ({
            vendorPartyId: r.vendorPartyId,
            baseRate: parseFloat(r.baseRate),
            taxRatePercent: parseFloat(r.taxRatePercent) || 0,
            additionalCharges: parseFloat(r.additionalCharges) || 0,
            notes: `${r.notes}${i === 0 ? attachNote : ""}`.trim() || undefined,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.error || "Failed to save rates");
      }
      setSuccessMsg(
        filled.length === 1 ? "Vendor rate saved." : `${filled.length} vendor rates saved for this material.`
      );
      setShowAddModal(false);
      fetchQuotations();
    } catch (err: any) {
      setError(err?.message || "Failed to save rates");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this vendor rate?")) return;
    try {
      const res = await fetch(`/api/material-pricing?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.error || "Failed to delete quotation");
      }
      setSuccessMsg("Vendor rate removed");
      fetchQuotations();
    } catch (err: any) {
      setError(err?.message || "Failed to delete quotation");
    }
  };

  // ---------- derived data ----------
  const filteredList = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return quotations.filter((q) => {
      if (!showOldRates && !q.isCurrent) return false;
      if (lowestOnly && q.rank !== 1) return false;
      if (selectedMaterialId !== "ALL" && q.materialId !== selectedMaterialId) return false;
      if (selectedVendorId !== "ALL" && q.vendorId !== selectedVendorId) return false;
      if (!term) return true;
      return (
        q.materialName.toLowerCase().includes(term) ||
        q.materialSku.toLowerCase().includes(term) ||
        q.materialCategory.toLowerCase().includes(term) ||
        q.vendorName.toLowerCase().includes(term) ||
        q.vendorCity.toLowerCase().includes(term)
      );
    });
  }, [quotations, searchTerm, lowestOnly, showOldRates, selectedMaterialId, selectedVendorId]);

  const sortForCompare = (a: QuotationItem, b: QuotationItem) => {
    const ra = a.isCurrent && a.rank ? a.rank : 999;
    const rb = b.isCurrent && b.rank ? b.rank : 999;
    if (ra !== rb) return ra - rb;
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    if (a.totalLandingRate !== b.totalLandingRate) return a.totalLandingRate - b.totalLandingRate;
    return b.quotationDate.localeCompare(a.quotationDate);
  };

  // Material → unit → vendor rates
  const byMaterial = useMemo(() => {
    const map = new Map<
      string,
      { materialId: string; name: string; sku: string; category: string; units: Map<string, QuotationItem[]> }
    >();
    for (const q of filteredList) {
      let g = map.get(q.materialId);
      if (!g) {
        g = { materialId: q.materialId, name: q.materialName, sku: q.materialSku, category: q.materialCategory, units: new Map() };
        map.set(q.materialId, g);
      }
      const arr = g.units.get(q.unitCode) || [];
      arr.push(q);
      g.units.set(q.unitCode, arr);
    }
    const groups = Array.from(map.values());
    groups.forEach((g) => g.units.forEach((arr) => arr.sort(sortForCompare)));
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredList]);

  // Vendor → materials they sell
  const byVendor = useMemo(() => {
    const map = new Map<string, { vendorId: string; name: string; city: string; phone: string; items: QuotationItem[] }>();
    for (const q of filteredList) {
      let g = map.get(q.vendorId);
      if (!g) {
        g = { vendorId: q.vendorId, name: q.vendorName, city: q.vendorCity, phone: q.vendorPhone, items: [] };
        map.set(q.vendorId, g);
      }
      g.items.push(q);
    }
    const groups = Array.from(map.values());
    groups.forEach((g) =>
      g.items.sort((a, b) =>
        a.materialName === b.materialName ? sortForCompare(a, b) : a.materialName.localeCompare(b.materialName)
      )
    );
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredList]);

  const metrics = useMemo(() => {
    const current = quotations.filter((q) => q.isCurrent);
    return {
      totalQuotes: current.length,
      materialsTracked: new Set(current.map((q) => q.materialId)).size,
      vendorsActive: new Set(current.map((q) => q.vendorId)).size,
      singleSource: (() => {
        // materials with only one vendor quoting (no comparison possible)
        const counts = new Map<string, Set<string>>();
        current.forEach((q) => {
          const s = counts.get(q.materialId) || new Set<string>();
          s.add(q.vendorId);
          counts.set(q.materialId, s);
        });
        return Array.from(counts.values()).filter((s) => s.size === 1).length;
      })(),
    };
  }, [quotations]);

  const filtersActive =
    !!searchTerm || selectedMaterialId !== "ALL" || selectedVendorId !== "ALL" || lowestOnly || showOldRates;

  const vendorRowActions = (q: QuotationItem, compact = false) => (
    <div className={`flex items-center ${compact ? "gap-3" : "justify-center gap-1"}`}>
      <button
        onClick={() => openAddModal({ materialId: q.materialId, unitCode: q.unitCode, from: q })}
        className="p-1 text-slate-400 hover:text-emerald-600 rounded transition-colors inline-flex items-center gap-1 text-xs"
        title="Update this vendor's rate (keeps the old rate in history)"
      >
        <Pencil className="w-4 h-4" />
        {compact && "Update rate"}
      </button>
      <button
        onClick={() => handleDelete(q.id)}
        className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors inline-flex items-center gap-1 text-xs"
        title="Delete rate"
      >
        <Trash2 className="w-4 h-4" />
        {compact && "Delete"}
      </button>
    </div>
  );

  const viewTabs: Array<{ key: ViewMode; label: string; Icon: typeof Layers }> = [
    { key: "material", label: "Compare by material", Icon: Layers },
    { key: "vendor", label: "Vendor price lists", Icon: Building2 },
    { key: "all", label: "All rates", Icon: List },
  ];

  return (
    <Shell>
      <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <PageHeader
          title="Material Pricing & Vendor Comparison Sheet"
          description="Each material can have rates from many vendors, and each vendor can quote many materials. Compare landing costs (with GST & freight) side by side and pick the lowest (L1)."
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Materials", href: "/materials" },
            { label: "Material Pricing" },
          ]}
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={fetchQuotations}
                disabled={loading}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
                title="Refresh Pricing"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                onClick={() =>
                  openAddModal({
                    materialId: selectedMaterialId !== "ALL" ? selectedMaterialId : undefined,
                    vendorId: selectedVendorId !== "ALL" ? selectedVendorId : undefined,
                  })
                }
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Vendor Rates
              </button>
            </div>
          }
        />

        {error && !showAddModal && (
          <Alert tone="error" title="Notice" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}
        {successMsg && (
          <Alert tone="success" title="Saved" onDismiss={() => setSuccessMsg(null)}>
            {successMsg}
          </Alert>
        )}

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Current Rates", value: metrics.totalQuotes, sub: "Latest rate per vendor & material", Icon: Tag, color: "text-blue-500", valueCls: "text-slate-900 dark:text-slate-100" },
            { label: "Materials Priced", value: metrics.materialsTracked, sub: "Materials with at least one rate", Icon: Layers, color: "text-purple-500", valueCls: "text-purple-600 dark:text-purple-400" },
            { label: "Vendors Quoting", value: metrics.vendorsActive, sub: "Suppliers with rates on file", Icon: Building2, color: "text-amber-500", valueCls: "text-amber-600 dark:text-amber-400" },
            { label: "Single-vendor Materials", value: metrics.singleSource, sub: "Get another quote to compare", Icon: Sparkles, color: "text-emerald-500", valueCls: "text-emerald-600 dark:text-emerald-400" },
          ].map((c) => (
            <div key={c.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
                <span>{c.label}</span>
                <c.Icon className={`w-4 h-4 ${c.color}`} />
              </div>
              <div className={`mt-2 text-2xl font-bold ${c.valueCls}`}>{c.value}</div>
              <div className="mt-1 text-xs text-slate-500">{c.sub}</div>
            </div>
          ))}
        </div>

        {/* View tabs + filters */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-xs">
          <div className="flex flex-wrap gap-2" role="tablist">
            {viewTabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={view === t.key}
                onClick={() => setView(t.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  view === t.key
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <t.Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search material, SKU, vendor name, city..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedMaterialId}
                onChange={(e) => setSelectedMaterialId(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              >
                <option value="ALL">All Materials</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedVendorId}
                onChange={(e) => setSelectedVendorId(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              >
                <option value="ALL">All Vendors</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>

              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lowestOnly}
                  onChange={(e) => setLowestOnly(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>L1 only</span>
              </label>

              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOldRates}
                  onChange={(e) => setShowOldRates(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="inline-flex items-center gap-1">
                  <History className="w-3.5 h-3.5" />
                  Show old rates
                </span>
              </label>

              {filtersActive && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedMaterialId("ALL");
                    setSelectedVendorId("ALL");
                    setLowestOnly(false);
                    setShowOldRates(false);
                  }}
                  className="text-xs text-slate-500 hover:text-emerald-600 underline"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-500 mb-3" />
            <p className="text-sm text-slate-500">Loading vendor price comparisons...</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center">
            <Tag className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">No vendor rates found</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
              Pick a material and enter each vendor's rate for it. You can add several vendors in one go.
            </p>
            <div className="mt-4">
              <button
                onClick={() =>
                  openAddModal({
                    materialId: selectedMaterialId !== "ALL" ? selectedMaterialId : undefined,
                    vendorId: selectedVendorId !== "ALL" ? selectedVendorId : undefined,
                  })
                }
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Vendor Rates
              </button>
            </div>
          </div>
        ) : view === "material" ? (
          /* ---------------- Compare by material ---------------- */
          <div className="space-y-4">
            {byMaterial.map((g) => (
              <div
                key={g.materialId}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <Package className="w-4 h-4 text-purple-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{g.name}</div>
                      <div className="text-xs text-slate-500">
                        {g.category} &bull; <span className="font-mono">{g.sku}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => openAddModal({ materialId: g.materialId, unitCode: Array.from(g.units.keys())[0] })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Add vendor rate
                  </button>
                </div>

                {Array.from(g.units.entries()).map(([unit, list]) => (
                  <div key={unit}>
                    {g.units.size > 1 && (
                      <div className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Rates per {unit}
                      </div>
                    )}
                    {/* Desktop */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="text-slate-500 dark:text-slate-400 text-[11px] uppercase tracking-wider">
                            <th className="py-2 px-4">Rank</th>
                            <th className="py-2 px-4">Vendor</th>
                            <th className="py-2 px-4 text-right">Base / {unit}</th>
                            <th className="py-2 px-4 text-right">GST</th>
                            <th className="py-2 px-4 text-right">Freight</th>
                            <th className="py-2 px-4 text-right">Landing / {unit}</th>
                            <th className="py-2 px-4 text-right">vs L1</th>
                            <th className="py-2 px-4 text-center">Quoted</th>
                            <th className="py-2 px-4">Terms</th>
                            <th className="py-2 px-4 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {list.map((q) => (
                            <tr
                              key={q.id}
                              className={`${q.rank === 1 && q.isCurrent ? "bg-emerald-50/40 dark:bg-emerald-950/20" : ""} ${
                                !q.isCurrent ? "opacity-60" : ""
                              }`}
                            >
                              <td className="py-2.5 px-4"><RankBadge q={q} /></td>
                              <td className="py-2.5 px-4">
                                <div className="font-medium text-slate-800 dark:text-slate-200">{q.vendorName}</div>
                                <div className="text-xs text-slate-500 flex items-center gap-2">
                                  {q.vendorCity && (
                                    <span className="inline-flex items-center gap-0.5">
                                      <MapPin className="w-3 h-3 text-slate-400" />
                                      {q.vendorCity}
                                    </span>
                                  )}
                                  {q.vendorPhone && <span>{q.vendorPhone}</span>}
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-right text-slate-700 dark:text-slate-300">{rupee(q.baseRate)}</td>
                              <td className="py-2.5 px-4 text-right text-xs text-slate-600 dark:text-slate-400">
                                {q.taxRatePercent}% ({rupee(q.taxAmount)})
                              </td>
                              <td className="py-2.5 px-4 text-right text-xs text-slate-600 dark:text-slate-400">{rupee(q.additionalCharges)}</td>
                              <td className="py-2.5 px-4 text-right font-bold text-slate-900 dark:text-slate-100">
                                <span className={q.rank === 1 && q.isCurrent ? "text-emerald-600 dark:text-emerald-400" : ""}>
                                  {rupee(q.totalLandingRate)}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right text-xs"><DiffCell q={q} /></td>
                              <td className="py-2.5 px-4 text-center text-xs text-slate-500 whitespace-nowrap">
                                {q.quotationDate}
                                {q.validUntil && (
                                  <div className={q.isExpired ? "text-amber-600" : "text-slate-400"}>till {q.validUntil}</div>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-xs text-slate-500 max-w-[200px] truncate" title={q.notes}>
                                {q.notes || "—"}
                              </td>
                              <td className="py-2.5 px-4">{vendorRowActions(q)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Mobile */}
                    <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                      {list.map((q) => (
                        <div key={q.id} className={`p-3 space-y-1.5 ${!q.isCurrent ? "opacity-60" : ""}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <RankBadge q={q} />
                                <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{q.vendorName}</span>
                              </div>
                              {q.vendorCity && <div className="text-xs text-slate-500 mt-0.5">{q.vendorCity}</div>}
                            </div>
                            <div className="text-right shrink-0">
                              <div className={`font-bold ${q.rank === 1 && q.isCurrent ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-slate-100"}`}>
                                {rupee(q.totalLandingRate)}
                              </div>
                              <div className="text-[11px] text-slate-500">per {unit}</div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>
                              Base {rupee(q.baseRate)} + GST {q.taxRatePercent}% + Freight {rupee(q.additionalCharges)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <DiffCell q={q} />
                            {vendorRowActions(q, true)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : view === "vendor" ? (
          /* ---------------- Vendor price lists ---------------- */
          <div className="space-y-4">
            {byVendor.map((g) => (
              <div
                key={g.vendorId}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <Link href={`/parties/${g.vendorId}`} className="font-semibold text-slate-900 dark:text-slate-100 hover:text-emerald-700 truncate block">
                        {g.name}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {[g.city, g.phone].filter(Boolean).join(" • ") || "—"} &bull;{" "}
                        {new Set(g.items.map((i) => i.materialId)).size} material(s)
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => openAddModal({ vendorId: g.vendorId })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add product rate
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="text-slate-500 dark:text-slate-400 text-[11px] uppercase tracking-wider">
                        <th className="py-2 px-4">Material</th>
                        <th className="py-2 px-4 text-center">Unit</th>
                        <th className="py-2 px-4 text-right">Landing rate</th>
                        <th className="py-2 px-4 text-center">Rank</th>
                        <th className="py-2 px-4 text-right hidden sm:table-cell">vs L1</th>
                        <th className="py-2 px-4 text-center hidden sm:table-cell">Quoted</th>
                        <th className="py-2 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {g.items.map((q) => (
                        <tr key={q.id} className={!q.isCurrent ? "opacity-60" : ""}>
                          <td className="py-2.5 px-4">
                            <button
                              onClick={() => {
                                setSelectedVendorId("ALL");
                                setSelectedMaterialId(q.materialId);
                                setView("material");
                              }}
                              className="font-medium text-slate-800 dark:text-slate-200 hover:text-emerald-700 text-left"
                              title="Compare all vendors for this material"
                            >
                              {q.materialName}
                            </button>
                            <div className="text-xs text-slate-500">{q.materialCategory}</div>
                          </td>
                          <td className="py-2.5 px-4 text-center font-mono text-xs text-slate-600 dark:text-slate-400">{q.unitCode}</td>
                          <td className="py-2.5 px-4 text-right font-bold text-slate-900 dark:text-slate-100">{rupee(q.totalLandingRate)}</td>
                          <td className="py-2.5 px-4 text-center">
                            <RankBadge q={q} />
                            {q.isCurrent && q.rank && (
                              <div className="text-[10px] text-slate-400 mt-0.5">of {q.rankedVendorCount}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right text-xs hidden sm:table-cell"><DiffCell q={q} /></td>
                          <td className="py-2.5 px-4 text-center text-xs text-slate-500 whitespace-nowrap hidden sm:table-cell">{q.quotationDate}</td>
                          <td className="py-2.5 px-4">{vendorRowActions(q)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ---------------- All rates (flat) ---------------- */
          <div className="overflow-x-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3 px-4">Material</th>
                  <th className="py-3 px-4">Vendor</th>
                  <th className="py-3 px-4 text-center">Unit</th>
                  <th className="py-3 px-4 text-right">Base</th>
                  <th className="py-3 px-4 text-right">GST %</th>
                  <th className="py-3 px-4 text-right">Freight</th>
                  <th className="py-3 px-4 text-right font-bold">Landing</th>
                  <th className="py-3 px-4 text-center">Rank</th>
                  <th className="py-3 px-4 text-center">Quote Date</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredList.map((q) => (
                  <tr key={q.id} className={`${q.rank === 1 && q.isCurrent ? "bg-emerald-50/30 dark:bg-emerald-950/20" : ""} ${!q.isCurrent ? "opacity-60" : ""}`}>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{q.materialName}</div>
                      <div className="text-xs text-slate-500">
                        {q.materialCategory} &bull; <span className="font-mono">{q.materialSku}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-800 dark:text-slate-200">{q.vendorName}</td>
                    <td className="py-3 px-4 text-center font-mono text-xs">{q.unitCode}</td>
                    <td className="py-3 px-4 text-right">{rupee(q.baseRate)}</td>
                    <td className="py-3 px-4 text-right text-xs">{q.taxRatePercent}%</td>
                    <td className="py-3 px-4 text-right text-xs">{rupee(q.additionalCharges)}</td>
                    <td className="py-3 px-4 text-right font-bold">{rupee(q.totalLandingRate)}</td>
                    <td className="py-3 px-4 text-center"><RankBadge q={q} /></td>
                    <td className="py-3 px-4 text-center text-xs text-slate-500 whitespace-nowrap">{q.quotationDate}</td>
                    <td className="py-3 px-4">{vendorRowActions(q)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ---------------- Add / update vendor rates modal ---------------- */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Add Vendor Rates</h3>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {error && (
                <Alert tone="error" onDismiss={() => setError(null)}>
                  {error}
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Material */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className={labelCls}>Material *</label>
                    {!newMat.open && (
                      <button
                        type="button"
                        onClick={() => setNewMat((p) => ({ ...p, open: true, unitCode: form.unitCode || "BAG" }))}
                        className="text-xs font-semibold text-emerald-700 hover:underline mb-1"
                      >
                        + New material
                      </button>
                    )}
                  </div>
                  {newMat.open ? (
                    <div className="flex flex-col sm:flex-row gap-2 p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
                      <input
                        type="text"
                        placeholder="Material name, e.g. TMT Steel 12mm"
                        value={newMat.name}
                        onChange={(e) => setNewMat((p) => ({ ...p, name: e.target.value }))}
                        className={inputCls}
                        autoFocus
                      />
                      <select
                        value={isCommonUnit(newMat.unitCode) ? newMat.unitCode : "NOS"}
                        onChange={(e) => setNewMat((p) => ({ ...p, unitCode: e.target.value }))}
                        className={`${inputCls} sm:w-40`}
                      >
                        {COMMON_MATERIAL_UNITS.map((u) => (
                          <option key={u.code} value={u.code}>
                            {u.code}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={createMaterial}
                          disabled={newMat.saving}
                          className="px-3 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                        >
                          {newMat.saving ? "Adding..." : "Add"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewMat((p) => ({ ...p, open: false }))}
                          className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <select value={form.materialId} onChange={(e) => handleMaterialSelect(e.target.value)} required className={inputCls}>
                      <option value="">-- Choose Material --</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.categoryName})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Unit + dates */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Rate per (unit) *</label>
                    <select
                      value={isCommonUnit(form.unitCode) ? form.unitCode : "CUSTOM"}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm((prev) => ({ ...prev, unitCode: val === "CUSTOM" ? "" : val }));
                      }}
                      className={inputCls}
                    >
                      {UNIT_GROUPS.map((grp) => (
                        <optgroup key={grp} label={grp}>
                          {COMMON_MATERIAL_UNITS.filter((u) => u.group === grp).map((u) => (
                            <option key={u.code} value={u.code}>
                              {u.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      <optgroup label="Other">
                        <option value="CUSTOM">+ Other / Custom Unit...</option>
                      </optgroup>
                    </select>
                    {!isCommonUnit(form.unitCode) && (
                      <input
                        type="text"
                        required
                        placeholder="Custom unit (e.g. ROLL, SET)"
                        value={form.unitCode}
                        onChange={(e) => setForm({ ...form, unitCode: e.target.value.toUpperCase() })}
                        className="mt-2 w-full px-3 py-1.5 text-xs rounded-lg border border-amber-300 bg-amber-50/50 text-slate-900 font-mono uppercase focus:ring-2 focus:ring-emerald-500"
                      />
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Quotation Date *</label>
                    <input
                      type="date"
                      required
                      value={form.quotationDate}
                      onChange={(e) => setForm({ ...form, quotationDate: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Valid Until</label>
                    <input
                      type="date"
                      value={form.validUntil}
                      onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Vendor rate rows */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className={labelCls}>Vendor rates *</label>
                    <Link href="/parties" className="text-xs text-slate-500 hover:text-emerald-700 hover:underline mb-1">
                      Vendor not listed? Add in Vendors &amp; Contractors
                    </Link>
                  </div>
                  {rows.map((row, idx) => {
                    const takenElsewhere = new Set(rows.filter((_, i) => i !== idx).map((r) => r.vendorPartyId));
                    return (
                      <div
                        key={idx}
                        className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end p-3 rounded-lg border border-slate-200 dark:border-slate-700"
                      >
                        <div className="col-span-2 sm:col-span-4">
                          <span className="block text-[11px] text-slate-500 mb-0.5">Vendor</span>
                          <select
                            value={row.vendorPartyId}
                            onChange={(e) => updateRow(idx, { vendorPartyId: e.target.value })}
                            className={inputCls}
                          >
                            <option value="">-- Select Vendor --</option>
                            {vendors.map((v) => (
                              <option key={v.id} value={v.id} disabled={takenElsewhere.has(v.id)}>
                                {v.name} {v.city ? `(${v.city})` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="block text-[11px] text-slate-500 mb-0.5">Base rate (₹)</span>
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            placeholder="e.g. 350"
                            value={row.baseRate}
                            onChange={(e) => updateRow(idx, { baseRate: e.target.value })}
                            className={inputCls}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <span className="block text-[11px] text-slate-500 mb-0.5">GST %</span>
                          <select
                            value={row.taxRatePercent}
                            onChange={(e) => updateRow(idx, { taxRatePercent: e.target.value })}
                            className={inputCls}
                          >
                            {["0", "5", "12", "18", "28"].map((t) => (
                              <option key={t} value={t}>
                                {t}%
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="block text-[11px] text-slate-500 mb-0.5">Freight (₹)</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={row.additionalCharges}
                            onChange={(e) => updateRow(idx, { additionalCharges: e.target.value })}
                            className={inputCls}
                          />
                        </div>
                        <div className="sm:col-span-2 flex items-center justify-between gap-2">
                          <div>
                            <span className="block text-[11px] text-slate-500">Landing</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">{rupee(landing(row))}</span>
                          </div>
                          {rows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                              className="p-1 text-slate-400 hover:text-red-600"
                              aria-label="Remove vendor row"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <div className="col-span-2 sm:col-span-12">
                          <input
                            type="text"
                            placeholder="Terms (optional): delivery days, min. order, payment terms..."
                            value={row.notes}
                            onChange={(e) => updateRow(idx, { notes: e.target.value })}
                            className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setRows((prev) => [...prev, emptyRow()])}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add another vendor
                  </button>
                  <p className="text-[11px] text-slate-500">
                    Saving a new rate for a vendor who already quoted this material replaces their current rate. The old
                    rate stays in history (tick "Show old rates").
                  </p>
                </div>

                {/* Attachment */}
                <div>
                  <label className={labelCls}>Quotation Document / Price Slip</label>
                  <FileUpload
                    value={uploadedFile}
                    onChange={setUploadedFile}
                    entityType="MATERIAL_QUOTATION"
                    category="QUOTATION"
                    label="Upload Quotation PDF / Photo"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || newMat.open}
                    className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Save Rates
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
