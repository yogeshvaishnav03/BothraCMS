"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { FileUpload } from "@/components/ui/FileUpload";
import { formatCurrency } from "@/lib/formatters";
import MaterialProcurementNav from "@/components/materials/MaterialProcurementNav";
import {
  Tag,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Building2,
  Calendar,
  Sparkles,
  Paperclip,
  Trash2,
  X,
  CheckCircle2,
  Phone,
  MapPin,
  TrendingDown,
  Layers,
} from "lucide-react";

export const COMMON_MATERIAL_UNITS = [
  { code: "BAG", label: "BAG (Bags — 50kg Cement, Putty, Adhesives)" },
  { code: "TON", label: "TON / MT (Metric Tonnes — TMT Steel, Rebar, Bulk)" },
  { code: "KG", label: "KG (Kilograms — Binding Wire, Nails, Hardware)" },
  { code: "QUINTAL", label: "QUINTAL (100 kg — Steel, Scaffolding)" },
  { code: "CFT", label: "CFT (Cubic Feet — Sand, Aggregate, Stone, Timber)" },
  { code: "CUM", label: "CUM / M³ (Cubic Meters — RMC Concrete, Earthwork)" },
  { code: "BRASS", label: "BRASS (100 CFT — Quarry Sand, Rubble, Murrum)" },
  { code: "TRUCK", label: "TRUCK / DUMPER (Full Dumper Loads — Soil, Gravel)" },
  { code: "TROLLEY", label: "TROLLEY (Tractor Trolley Loads — Bricks, Rubble)" },
  { code: "SQFT", label: "SQFT (Square Feet — Tiles, Granite, Marble, Glass)" },
  { code: "SQM", label: "SQM (Square Meters — Flooring, Plaster, Paint)" },
  { code: "RFT", label: "RFT (Running Feet — Pipes, Railings, Beading)" },
  { code: "METER", label: "METER / RMT (Running Meters — Cables, Conduits)" },
  { code: "NOS", label: "NOS / PCS (Pieces — Bricks, AAC Blocks, Doors)" },
  { code: "BOX", label: "BOX / PKT (Boxes / Packets — Screws, Spacers, Fittings)" },
  { code: "BUNDLE", label: "BUNDLE (Bundles — Plywood, Rebar Bundles)" },
  { code: "LTR", label: "LTR (Litres — Paint, Primer, Admixtures, Fuel)" },
  { code: "BARREL", label: "BARREL / DRUM (Drums — Bitumen, Waterproofing Liquid)" },
];

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
  quotationDate: string;
  validUntil: string | null;
  notes: string;
  createdBy: string;
  attachments?: Array<{
    id: string;
    fileId: string;
    fileName: string;
    mimeType: string;
  }>;
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

export default function MaterialPricingPage() {
  const [loading, setLoading] = useState(true);
  const [quotations, setQuotations] = useState<QuotationItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter options
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("ALL");
  const [selectedVendorId, setSelectedVendorId] = useState<string>("ALL");
  const [lowestOnly, setLowestOnly] = useState(false);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  const [form, setForm] = useState({
    materialId: "",
    vendorPartyId: "",
    unitCode: "BAG",
    baseRate: "",
    taxRatePercent: "18",
    additionalCharges: "0",
    quotationDate: todayStr,
    validUntil: "",
    notes: "",
  });
  const [uploadedFile, setUploadedFile] = useState<{ url: string; name: string } | null>(null);

  const fetchQuotations = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (selectedMaterialId !== "ALL") params.set("materialId", selectedMaterialId);
      if (selectedVendorId !== "ALL") params.set("vendorPartyId", selectedVendorId);

      const res = await fetch(`/api/material-pricing?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load pricing data");
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
        fetch("/api/materials?limit=200"),
        fetch("/api/parties?limit=200"),
      ]);

      if (matRes.ok) {
        const matJson = await matRes.json();
        const raw = matJson.data || [];
        setMaterials(
          raw.map((m: any) => ({
            id: m.id,
            name: m.name,
            sku: m.sku || "",
            unitCode: m.unitCode || "UNIT",
            categoryName: m.category?.name || "General",
          }))
        );
      }

      if (partyRes.ok) {
        const pJson = await partyRes.json();
        const raw = pJson.data || [];
        setVendors(
          raw.map((p: any) => ({
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
    fetchAuxiliary();
  }, []);

  useEffect(() => {
    fetchQuotations();
  }, [selectedMaterialId, selectedVendorId]);

  // Handle Material select inside form to auto-set unitCode
  const handleMaterialSelect = (matId: string) => {
    const mat = materials.find((m) => m.id === matId);
    setForm((prev) => ({
      ...prev,
      materialId: matId,
      unitCode: mat?.unitCode || prev.unitCode,
    }));
  };

  // Real-time calculation of landing rate in form
  const calculatedLandingRate = useMemo(() => {
    const base = parseFloat(form.baseRate) || 0;
    const taxPct = parseFloat(form.taxRatePercent) || 0;
    const addl = parseFloat(form.additionalCharges) || 0;
    const taxAmt = (base * taxPct) / 100;
    return {
      taxAmount: taxAmt,
      totalLandingRate: base + taxAmt + addl,
    };
  }, [form.baseRate, form.taxRatePercent, form.additionalCharges]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const base = parseFloat(form.baseRate);
    if (!form.materialId) {
      setError("Please select a material");
      return;
    }
    if (!form.vendorPartyId) {
      setError("Please select a vendor/supplier");
      return;
    }
    if (isNaN(base) || base <= 0) {
      setError("Base rate must be greater than zero");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/material-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: form.materialId,
          vendorPartyId: form.vendorPartyId,
          unitCode: form.unitCode,
          baseRate: base,
          taxRatePercent: parseFloat(form.taxRatePercent) || 0,
          additionalCharges: parseFloat(form.additionalCharges) || 0,
          quotationDate: form.quotationDate,
          validUntil: form.validUntil || undefined,
          notes: form.notes ? `${form.notes}${uploadedFile ? ` [Attached: ${uploadedFile.name}]` : ""}` : (uploadedFile ? `[Attached: ${uploadedFile.name}]` : undefined),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to create quotation");
      }

      setSuccessMsg("Quotation successfully added to pricing data sheet!");
      setShowAddModal(false);
      setForm({
        materialId: "",
        vendorPartyId: "",
        unitCode: "BAG",
        baseRate: "",
        taxRatePercent: "18",
        additionalCharges: "0",
        quotationDate: todayStr,
        validUntil: "",
        notes: "",
      });
      setUploadedFile(null);
      fetchQuotations();
    } catch (err: any) {
      setError(err?.message || "Failed to save quotation");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to remove this quotation?")) return;
    try {
      const res = await fetch(`/api/material-pricing?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to delete quotation");
      }
      setSuccessMsg("Quotation removed successfully");
      fetchQuotations();
    } catch (err: any) {
      setError(err?.message || "Failed to delete quotation");
    }
  };

  // Filtered quotations
  const filteredList = useMemo(() => {
    return quotations.filter((q) => {
      if (lowestOnly && !q.isLowestPrice) return false;
      const term = searchTerm.toLowerCase().trim();
      if (!term) return true;
      return (
        q.materialName.toLowerCase().includes(term) ||
        q.materialSku.toLowerCase().includes(term) ||
        q.materialCategory.toLowerCase().includes(term) ||
        q.vendorName.toLowerCase().includes(term) ||
        q.vendorCity.toLowerCase().includes(term)
      );
    });
  }, [quotations, searchTerm, lowestOnly]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const uniqueMats = new Set(quotations.map((q) => q.materialId)).size;
    const uniqueVendors = new Set(quotations.map((q) => q.vendorId)).size;
    const lowestItems = quotations.filter((q) => q.isLowestPrice);

    return {
      totalQuotes: quotations.length,
      materialsTracked: uniqueMats,
      vendorsActive: uniqueVendors,
      lowestCount: lowestItems.length,
    };
  }, [quotations]);

  return (
    <Shell>
      <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Page Header */}
        <PageHeader
          title="Material Pricing & Vendor Comparison Sheet"
          description="Compare multi-vendor rate sheets, landing costs (with GST & freight), and identify the lowest market rates."
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
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Quotation
              </button>
            </div>
          }
        />

        {/* Interlinked Material & Procurement Hub Navigation */}
        <MaterialProcurementNav activeTab="pricing" />

        {error && (
          <Alert variant="error" title="Notice" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {successMsg && (
          <Alert variant="success" title="Success" onClose={() => setSuccessMsg(null)}>
            {successMsg}
          </Alert>
        )}

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
              <span>Total Quotations</span>
              <Tag className="w-4 h-4 text-blue-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {metrics.totalQuotes}
            </div>
            <div className="mt-1 text-xs text-slate-500">Active market quotes</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
              <span>Materials Tracked</span>
              <Layers className="w-4 h-4 text-purple-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-purple-600 dark:text-purple-400">
              {metrics.materialsTracked}
            </div>
            <div className="mt-1 text-xs text-slate-500">Distinct inventory items</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
              <span>Suppliers / Vendors</span>
              <Building2 className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
              {metrics.vendorsActive}
            </div>
            <div className="mt-1 text-xs text-slate-500">Participating vendors</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
              <span>Best Price (L1) Picks</span>
              <Sparkles className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {metrics.lowestCount}
            </div>
            <div className="mt-1 text-xs text-slate-500">Lowest landing rates</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-xs">
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
                <span>Best Price (L1) Only</span>
              </label>

              {(searchTerm || selectedMaterialId !== "ALL" || selectedVendorId !== "ALL" || lowestOnly) && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedMaterialId("ALL");
                    setSelectedVendorId("ALL");
                    setLowestOnly(false);
                  }}
                  className="text-xs text-slate-500 hover:text-emerald-600 underline"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Section: Table for Desktop & Cards for Mobile */}
        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-500 mb-3" />
            <p className="text-sm text-slate-500">Loading vendor price comparisons...</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center">
            <Tag className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              No quotations found
            </h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
              Add vendor rates to start comparing market prices and landing costs.
            </p>
            <div className="mt-4">
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add First Quotation
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider">
                    <th className="py-3 px-4">Material & Category</th>
                    <th className="py-3 px-4">Vendor / Supplier</th>
                    <th className="py-3 px-4 text-center">Unit</th>
                    <th className="py-3 px-4 text-right">Base Rate</th>
                    <th className="py-3 px-4 text-right">GST %</th>
                    <th className="py-3 px-4 text-right">Tax (₹)</th>
                    <th className="py-3 px-4 text-right">Freight/Addl.</th>
                    <th className="py-3 px-4 text-right font-bold">Landing Rate</th>
                    <th className="py-3 px-4 text-center">Best Price</th>
                    <th className="py-3 px-4 text-center">Quote Date</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredList.map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                        item.isLowestPrice ? "bg-emerald-50/30 dark:bg-emerald-950/20" : ""
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.materialName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {item.materialCategory} &bull; <span className="font-mono">{item.materialSku}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {item.vendorName}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                          {item.vendorCity && (
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              {item.vendorCity}
                            </span>
                          )}
                          {item.vendorPhone && <span>{item.vendorPhone}</span>}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center font-mono text-xs text-slate-600 dark:text-slate-400">
                        {item.unitCode}
                      </td>

                      <td className="py-3 px-4 text-right font-medium text-slate-700 dark:text-slate-300">
                        ₹{item.baseRate.toFixed(2)}
                      </td>

                      <td className="py-3 px-4 text-right text-xs text-slate-600 dark:text-slate-400">
                        {item.taxRatePercent}%
                      </td>

                      <td className="py-3 px-4 text-right text-xs text-slate-600 dark:text-slate-400">
                        ₹{item.taxAmount.toFixed(2)}
                      </td>

                      <td className="py-3 px-4 text-right text-xs text-slate-600 dark:text-slate-400">
                        ₹{item.additionalCharges.toFixed(2)}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-base text-slate-900 dark:text-slate-100">
                        <span className={item.isLowestPrice ? "text-emerald-600 dark:text-emerald-400" : ""}>
                          ₹{item.totalLandingRate.toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {item.isLowestPrice ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                            <Sparkles className="w-3 h-3" />
                            Lowest (L1)
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center text-xs text-slate-500 whitespace-nowrap">
                        {item.quotationDate}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                          title="Delete quotation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="block md:hidden space-y-3">
              {filteredList.map((item) => (
                <div
                  key={item.id}
                  className={`border rounded-xl p-4 shadow-xs space-y-3 ${
                    item.isLowestPrice
                      ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-base">
                        <Link
                          href={`/materials?search=${encodeURIComponent(item.materialName)}`}
                          className="hover:text-amber-600 transition-colors inline-flex items-center gap-1 group"
                          title="View material in Stock Register"
                        >
                          {item.materialName}
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
                        </Link>
                      </h4>
                      <p className="text-xs text-slate-500">
                        {item.materialCategory} &bull; <span className="font-mono">{item.materialSku}</span>
                      </p>
                    </div>
                    {item.isLowestPrice && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <Sparkles className="w-3 h-3" />
                        L1
                      </span>
                    )}
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-500 block">Supplier</span>
                      <Link
                        href={`/parties?search=${encodeURIComponent(item.vendorName)}`}
                        className="font-semibold text-slate-800 dark:text-slate-200 hover:text-amber-600 transition-colors inline-flex items-center gap-1 group"
                        title="View vendor details"
                      >
                        {item.vendorName}
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
                      </Link>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 block">Landing Rate / {item.unitCode}</span>
                      <span className="font-bold text-base text-emerald-600 dark:text-emerald-400">
                        ₹{item.totalLandingRate.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <div>
                      <span className="text-slate-500 block">Base Rate</span>
                      <span>₹{item.baseRate.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">GST ({item.taxRatePercent}%)</span>
                      <span>₹{item.taxAmount.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Freight</span>
                      <span>₹{item.additionalCharges.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                    <span>Date: {item.quotationDate}</span>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-red-500 hover:text-red-700 text-xs font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add Quotation Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Add Material Vendor Quotation
                  </h3>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Material */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Material *
                  </label>
                  <select
                    value={form.materialId}
                    onChange={(e) => handleMaterialSelect(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Choose Material --</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.categoryName})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Vendor & Unit */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Vendor / Supplier *
                    </label>
                    <select
                      value={form.vendorPartyId}
                      onChange={(e) => setForm({ ...form, vendorPartyId: e.target.value })}
                      required
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">-- Select Vendor --</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} {v.city ? `(${v.city})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Unit of Measure *
                    </label>
                    <select
                      value={
                        COMMON_MATERIAL_UNITS.some((u) => u.code === form.unitCode)
                          ? form.unitCode
                          : form.unitCode ? "CUSTOM" : ""
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "CUSTOM") {
                          setForm((prev) => ({
                            ...prev,
                            unitCode: COMMON_MATERIAL_UNITS.some((u) => u.code === prev.unitCode) ? "" : prev.unitCode,
                          }));
                        } else {
                          setForm((prev) => ({ ...prev, unitCode: val }));
                        }
                      }}
                      required
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 font-medium"
                    >
                      <option value="">-- Choose Unit of Measure --</option>
                      <optgroup label="Weight & Bulk">
                        <option value="BAG">BAG (Bags — 50kg Cement, Putty, Adhesives)</option>
                        <option value="TON">TON / MT (Metric Tonnes — TMT Steel, Rebar, Bulk)</option>
                        <option value="KG">KG (Kilograms — Binding Wire, Nails, Hardware)</option>
                        <option value="QUINTAL">QUINTAL (100 kg — Steel, Scaffolding)</option>
                      </optgroup>
                      <optgroup label="Volume & Bulk Loads">
                        <option value="CFT">CFT (Cubic Feet — Sand, Aggregate, Stone, Timber)</option>
                        <option value="CUM">CUM / M³ (Cubic Meters — RMC Concrete, Earthwork)</option>
                        <option value="BRASS">BRASS (100 CFT — Quarry Sand, Rubble, Murrum)</option>
                        <option value="TRUCK">TRUCK / DUMPER (Full Dumper Loads — Soil, Gravel)</option>
                        <option value="TROLLEY">TROLLEY (Tractor Trolley Loads — Bricks, Rubble)</option>
                      </optgroup>
                      <optgroup label="Area & Flooring">
                        <option value="SQFT">SQFT (Square Feet — Tiles, Granite, Marble, Glass)</option>
                        <option value="SQM">SQM (Square Meters — Flooring, Plaster, Paint)</option>
                      </optgroup>
                      <optgroup label="Length & Linear">
                        <option value="RFT">RFT (Running Feet — Pipes, Railings, Beading)</option>
                        <option value="METER">METER / RMT (Running Meters — Cables, Conduits)</option>
                      </optgroup>
                      <optgroup label="Counts & Packages">
                        <option value="NOS">NOS / PCS (Pieces — Bricks, AAC Blocks, Doors)</option>
                        <option value="BOX">BOX / PKT (Boxes / Packets — Screws, Spacers, Fittings)</option>
                        <option value="BUNDLE">BUNDLE (Bundles — Plywood, Rebar Bundles)</option>
                      </optgroup>
                      <optgroup label="Liquids & Chemicals">
                        <option value="LTR">LTR (Litres — Paint, Primer, Admixtures, Fuel)</option>
                        <option value="BARREL">BARREL / DRUM (Drums — Bitumen, Waterproofing Liquid)</option>
                      </optgroup>
                      <optgroup label="Other">
                        <option value="CUSTOM">+ Other / Custom Unit...</option>
                      </optgroup>
                    </select>

                    {/* Custom Unit Input if selected or non-standard */}
                    {(!COMMON_MATERIAL_UNITS.some((u) => u.code === form.unitCode) || form.unitCode === "") && (
                      <div className="mt-2">
                        <input
                          type="text"
                          required
                          placeholder="Type custom unit (e.g. ROLL, DRUM, SET)"
                          value={form.unitCode}
                          onChange={(e) => setForm({ ...form, unitCode: e.target.value.toUpperCase() })}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-amber-300 bg-amber-50/50 text-slate-900 font-mono uppercase focus:ring-2 focus:ring-emerald-500"
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Rates & Taxes */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Base Rate (₹) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      placeholder="e.g. 350"
                      value={form.baseRate}
                      onChange={(e) => setForm({ ...form, baseRate: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      GST Rate %
                    </label>
                    <select
                      value={form.taxRatePercent}
                      onChange={(e) => setForm({ ...form, taxRatePercent: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="0">0% (Nil)</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Freight / Addl. (₹)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0"
                      value={form.additionalCharges}
                      onChange={(e) => setForm({ ...form, additionalCharges: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Auto Calculated Landing Rate Banner */}
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl p-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                      Calculated Landing Rate:
                    </div>
                    <div className="text-xs text-slate-500">
                      Tax: ₹{calculatedLandingRate.taxAmount.toFixed(2)} / unit
                    </div>
                  </div>
                  <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    ₹{calculatedLandingRate.totalLandingRate.toFixed(2)}
                    <span className="text-xs font-normal text-slate-500 ml-1">/{form.unitCode}</span>
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Quotation Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={form.quotationDate}
                      onChange={(e) => setForm({ ...form, quotationDate: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Valid Until
                    </label>
                    <input
                      type="date"
                      value={form.validUntil}
                      onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Terms & Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Payment within 30 days, Includes site unloading..."
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Attachment */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Quotation Document / Price Slip
                  </label>
                  <FileUpload
                    value={uploadedFile}
                    onChange={setUploadedFile}
                    entityType="MATERIAL_QUOTATION"
                    category="QUOTATION"
                    label="Upload Quotation PDF / Photo"
                  />
                </div>

                {/* Action Buttons */}
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
                    disabled={submitting}
                    className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Saving Quote...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Save Quotation
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
