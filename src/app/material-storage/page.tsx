"use client";

import React, { useEffect, useState, useMemo } from "react";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { FileUpload } from "@/components/ui/FileUpload";
import { useActiveSite } from "@/hooks/useActiveSite";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import { formatQuantity } from "@/lib/formatters";
import {
  Boxes,
  PackageMinus,
  Search,
  Filter,
  Calendar,
  Plus,
  RefreshCw,
  Building2,
  User,
  Clock,
  CheckCircle2,
  FileText,
  Paperclip,
  X,
  ExternalLink,
  ChevronDown,
  Warehouse,
  AlertTriangle,
} from "lucide-react";

interface StorageMovement {
  id: string;
  materialId: string;
  materialName: string;
  materialSku: string;
  materialCategory: string;
  totalMaterial: number;
  issuedMaterial: number;
  remainingMaterial: number;
  unit: string;
  storeId: string;
  storeName: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  siteId: string;
  siteName: string;
  responsiblePerson: string;
  issuedBy: string;
  issuedByRole: string;
  creationDate: string;
  status: string;
  notes: string;
  attachments?: Array<{
    id: string;
    fileId: string;
    fileName: string;
    mimeType: string;
    category: string;
  }>;
}

interface MaterialOption {
  id: string;
  name: string;
  sku: string;
  unitCode: string;
  categoryName?: string;
  quantityOnHand?: number;
}

interface StoreOption {
  id: string;
  name: string;
  code: string;
  siteId?: string;
}

interface ProjectOption {
  id: string;
  name: string;
  code: string;
  siteId?: string;
  siteName?: string;
}

export default function MaterialStoragePage() {
  const { session } = useAppSession();
  const { activeSiteId } = useActiveSite();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [movements, setMovements] = useState<StorageMovement[]>([]);

  // Metadata options for issuing
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  // Filters (Default to Today)
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [fromDate, setFromDate] = useState<string>(todayStr);
  const [toDate, setToDate] = useState<string>(todayStr);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [datePreset, setDatePreset] = useState<"today" | "last7" | "month" | "all" | "custom">("today");

  // Modal State
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [issueForm, setIssueForm] = useState({
    materialId: "",
    storeId: "",
    projectId: "",
    quantity: "",
    issuedToName: "",
    notes: "",
    movementAt: todayStr,
  });
  const [uploadedFile, setUploadedFile] = useState<{ url: string; name: string } | null>(null);

  const fetchMovements = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (datePreset !== "all") {
        if (fromDate) params.set("from", fromDate);
        if (toDate) params.set("to", toDate);
      }
      if (activeSiteId) params.set("siteId", activeSiteId);
      if (selectedStatus !== "ALL") params.set("status", selectedStatus);

      const res = await fetch(`/api/material-storage?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load material storage data");
      }
      setMovements(json.data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load material storage");
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const [matRes, storeRes, projRes] = await Promise.all([
        fetch("/api/materials?limit=200"),
        fetch("/api/stores"),
        fetch("/api/projects?limit=200"),
      ]);

      if (matRes.ok) {
        const matJson = await matRes.json();
        const rawMats = matJson.data || [];
        setMaterials(
          rawMats.map((m: any) => ({
            id: m.id,
            name: m.name,
            sku: m.sku || "",
            unitCode: m.unitCode || "UNIT",
            categoryName: m.category?.name || "General",
            quantityOnHand: m.totalStock || m.quantityOnHand || 0,
          }))
        );
      }

      if (storeRes.ok) {
        const sJson = await storeRes.json();
        setStores(sJson.data || sJson || []);
      }

      if (projRes.ok) {
        const pJson = await projRes.json();
        const rawProjs = pJson.data || [];
        setProjects(
          rawProjs.map((p: any) => ({
            id: p.id,
            name: p.name,
            code: p.code || "",
            siteId: p.siteId || "",
            siteName: p.site?.name || "",
          }))
        );
      }
    } catch (e) {
      console.warn("Failed loading auxiliary storage options:", e);
    }
  };

  useEffect(() => {
    fetchOptions();
  }, []);

  useEffect(() => {
    fetchMovements();
  }, [fromDate, toDate, datePreset, activeSiteId, selectedStatus]);

  const handlePresetChange = (preset: "today" | "last7" | "month" | "all" | "custom") => {
    setDatePreset(preset);
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    if (preset === "today") {
      setFromDate(today);
      setToDate(today);
    } else if (preset === "last7") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setFromDate(d.toISOString().split("T")[0]);
      setToDate(today);
    } else if (preset === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      setFromDate(start);
      setToDate(today);
    } else if (preset === "all") {
      setFromDate("");
      setToDate("");
    }
  };

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const qty = parseFloat(issueForm.quantity);
    if (!issueForm.materialId) {
      setError("Please select a material to issue");
      return;
    }
    if (!issueForm.storeId) {
      setError("Please select the dispatch warehouse/store");
      return;
    }
    if (!issueForm.projectId) {
      setError("Please select a project");
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      setError("Quantity must be greater than zero");
      return;
    }
    if (!issueForm.issuedToName.trim()) {
      setError("Please specify the responsible person receiving the material");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/material-storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: issueForm.materialId,
          storeId: issueForm.storeId,
          projectId: issueForm.projectId,
          quantity: qty,
          issuedToName: issueForm.issuedToName.trim(),
          notes: issueForm.notes ? `${issueForm.notes}${uploadedFile ? ` [Attached: ${uploadedFile.name}]` : ""}` : (uploadedFile ? `[Attached: ${uploadedFile.name}]` : undefined),
          movementAt: issueForm.movementAt ? `${issueForm.movementAt}T12:00:00.000Z` : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to issue material");
      }

      setSuccessMsg("Material successfully issued and storage inventory updated!");
      setShowIssueModal(false);
      setIssueForm({
        materialId: "",
        storeId: "",
        projectId: "",
        quantity: "",
        issuedToName: "",
        notes: "",
        movementAt: todayStr,
      });
      setUploadedFile(null);
      fetchMovements();
    } catch (err: any) {
      setError(err?.message || "Failed to issue material");
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered movements based on search query
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const q = searchTerm.toLowerCase().trim();
      if (!q) return true;
      return (
        m.materialName.toLowerCase().includes(q) ||
        m.materialSku.toLowerCase().includes(q) ||
        m.materialCategory.toLowerCase().includes(q) ||
        m.projectName.toLowerCase().includes(q) ||
        m.siteName.toLowerCase().includes(q) ||
        m.responsiblePerson.toLowerCase().includes(q) ||
        m.issuedBy.toLowerCase().includes(q)
      );
    });
  }, [movements, searchTerm]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let totalIssuedQty = 0;
    let totalRemainingQty = 0;
    let totalInitialQty = 0;

    filteredMovements.forEach((m) => {
      totalIssuedQty += m.issuedMaterial;
      totalRemainingQty += m.remainingMaterial;
      totalInitialQty += m.totalMaterial;
    });

    return {
      count: filteredMovements.length,
      totalIssuedQty,
      totalRemainingQty,
      totalInitialQty,
    };
  }, [filteredMovements]);

  return (
    <Shell>
      <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <PageHeader
          title="Material Storage & Issue Management"
          description="Track warehouse storage levels, record material issues to sites/projects, and manage responsible personnel."
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Materials", href: "/materials" },
            { label: "Material Storage" },
          ]}
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={fetchMovements}
                disabled={loading}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
                title="Refresh Storage Records"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                onClick={() => setShowIssueModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-colors"
              >
                <PackageMinus className="w-4 h-4" />
                Issue Material
              </button>
            </div>
          }
        />

        {error && (
          <Alert variant="error" title="Storage Operation Notice" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {successMsg && (
          <Alert variant="success" title="Success" onClose={() => setSuccessMsg(null)}>
            {successMsg}
          </Alert>
        )}

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
              <span>Total Transactions</span>
              <Boxes className="w-4 h-4 text-blue-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {metrics.count}
            </div>
            <div className="mt-1 text-xs text-slate-500">Recorded issues in period</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
              <span>Total Issued Qty</span>
              <PackageMinus className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
              {formatQuantity(metrics.totalIssuedQty)}
            </div>
            <div className="mt-1 text-xs text-slate-500">Dispatched to worksites</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
              <span>Remaining In Store</span>
              <Warehouse className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatQuantity(metrics.totalRemainingQty)}
            </div>
            <div className="mt-1 text-xs text-slate-500">Live stock balance</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
              <span>Initial Available</span>
              <Boxes className="w-4 h-4 text-purple-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-800 dark:text-slate-200">
              {formatQuantity(metrics.totalInitialQty)}
            </div>
            <div className="mt-1 text-xs text-slate-500">Issued + Remaining balance</div>
          </div>
        </div>

        {/* Mega Filter Header */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search material, SKU, site, project, receiver..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
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

            {/* Quick Date Presets */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-lg">
              {(
                [
                  { id: "today", label: "Today" },
                  { id: "last7", label: "7 Days" },
                  { id: "month", label: "This Month" },
                  { id: "all", label: "All Time" },
                  { id: "custom", label: "Custom" },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetChange(preset.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    datePreset === preset.id
                      ? "bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 font-semibold shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Secondary Filter Row */}
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            {datePreset === "custom" && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Status:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              >
                <option value="ALL">All Statuses</option>
                <option value="ISSUED">Issued</option>
                <option value="COMPLETED">Completed</option>
                <option value="RETURNED">Returned</option>
              </select>
            </div>

            <button
              onClick={() => {
                setSearchTerm("");
                setSelectedStatus("ALL");
                handlePresetChange("today");
              }}
              className="ml-auto text-xs text-slate-500 hover:text-amber-600 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        </div>

        {/* Content Section: Desktop Table & Mobile Cards */}
        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-amber-500 mb-3" />
            <p className="text-sm text-slate-500">Loading storage movements and stock ledger...</p>
          </div>
        ) : filteredMovements.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center">
            <Boxes className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              No storage records found
            </h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
              No materials were issued matching the selected period or filters.
            </p>
            <div className="mt-4">
              <button
                onClick={() => setShowIssueModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
              >
                <PackageMinus className="w-4 h-4" />
                Issue Material Now
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Desktop Table View (hidden on mobile) */}
            <div className="hidden md:block overflow-x-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider">
                    <th className="py-3 px-4">Material & Category</th>
                    <th className="py-3 px-4 text-right">Total Material</th>
                    <th className="py-3 px-4 text-right">Issued Material</th>
                    <th className="py-3 px-4 text-right">Remaining Material</th>
                    <th className="py-3 px-4">Site & Project</th>
                    <th className="py-3 px-4">Responsible Person</th>
                    <th className="py-3 px-4">Issued By</th>
                    <th className="py-3 px-4">Creation Date</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Attachments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredMovements.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.materialName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {item.materialCategory} &bull; <span className="font-mono">{item.materialSku}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-medium text-slate-700 dark:text-slate-300">
                        {formatQuantity(item.totalMaterial)} {item.unit}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-amber-600 dark:text-amber-400">
                        {formatQuantity(item.issuedMaterial)} {item.unit}
                      </td>

                      <td className="py-3 px-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatQuantity(item.remainingMaterial)} {item.unit}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {item.siteName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {item.projectName}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="inline-flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-medium">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{item.responsiblePerson}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-slate-700 dark:text-slate-300">{item.issuedBy}</div>
                        <div className="text-[11px] text-slate-400">{item.issuedByRole}</div>
                      </td>

                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{new Date(item.creationDate).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          <CheckCircle2 className="w-3 h-3" />
                          {item.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {item.attachments && item.attachments.length > 0 ? (
                          <div className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline">
                            <Paperclip className="w-3.5 h-3.5" />
                            <span>{item.attachments.length} file{item.attachments.length > 1 ? "s" : ""}</span>
                          </div>
                        ) : item.notes && item.notes.includes("[Attached:") ? (
                          <span className="text-xs text-slate-400 italic">Photo attached</span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (hidden on desktop) */}
            <div className="block md:hidden space-y-3">
              {filteredMovements.map((item) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-base">
                        {item.materialName}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {item.materialCategory} &bull; <span className="font-mono">{item.materialSku}</span>
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      {item.status}
                    </span>
                  </div>

                  {/* Stock Quantities Grid */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg text-xs">
                    <div>
                      <span className="text-slate-500 block">Total</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {formatQuantity(item.totalMaterial)} {item.unit}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Issued</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">
                        {formatQuantity(item.issuedMaterial)} {item.unit}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Remaining</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {formatQuantity(item.remainingMaterial)} {item.unit}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs space-y-1 text-slate-600 dark:text-slate-400">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Site & Project:</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {item.siteName} &bull; {item.projectName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Responsible Person:</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {item.responsiblePerson}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Issued By:</span>
                      <span>{item.issuedBy} ({item.issuedByRole})</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Date:</span>
                      <span>
                        {new Date(item.creationDate).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>

                  {item.notes && (
                    <div className="text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded text-slate-600 dark:text-slate-300">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Notes: </span>
                      {item.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Issue Material Modal */}
        {showIssueModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <PackageMinus className="w-5 h-5 text-amber-600" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Issue Material to Worksite
                  </h3>
                </div>
                <button
                  onClick={() => setShowIssueModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleIssueSubmit} className="space-y-4">
                {/* Material Select */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Select Material *
                  </label>
                  <select
                    value={issueForm.materialId}
                    onChange={(e) => setIssueForm({ ...issueForm, materialId: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">-- Choose Material --</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.categoryName}) - Stock: {m.quantityOnHand || 0} {m.unitCode}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Warehouse & Project */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Dispatch Store / Warehouse *
                    </label>
                    <select
                      value={issueForm.storeId}
                      onChange={(e) => setIssueForm({ ...issueForm, storeId: e.target.value })}
                      required
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">-- Select Store --</option>
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code || "Store"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Destination Project *
                    </label>
                    <select
                      value={issueForm.projectId}
                      onChange={(e) => setIssueForm({ ...issueForm, projectId: e.target.value })}
                      required
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">-- Select Project --</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.siteName ? `(${p.siteName})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Quantity & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Issue Quantity *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      placeholder="e.g. 50"
                      value={issueForm.quantity}
                      onChange={(e) => setIssueForm({ ...issueForm, quantity: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Issue Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={issueForm.movementAt}
                      onChange={(e) => setIssueForm({ ...issueForm, movementAt: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Responsible Person */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Responsible Person (Receiver) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar (Site Supervisor)"
                    value={issueForm.issuedToName}
                    onChange={(e) => setIssueForm({ ...issueForm, issuedToName: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Dispatch Notes / Remarks
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Dispatched for 2nd floor slab casting..."
                    value={issueForm.notes}
                    onChange={(e) => setIssueForm({ ...issueForm, notes: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* File / Photo Upload */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Attachment / Delivery Slip Photo
                  </label>
                  <FileUpload
                    value={uploadedFile}
                    onChange={setUploadedFile}
                    entityType="STOCK_MOVEMENT"
                    projectId={issueForm.projectId || undefined}
                    category="DELIVERY_CHALLAN"
                    label="Upload Delivery Slip / Loading Photo"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowIssueModal(false)}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-colors disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Recording Issue...
                      </>
                    ) : (
                      <>
                        <PackageMinus className="w-4 h-4" />
                        Confirm & Issue Stock
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
