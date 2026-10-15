"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatQuantity } from "@/lib/formatters";
import {
  Boxes,
  Plus,
  PackagePlus,
  PackageMinus,
  Search,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  X,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { clientCache } from "@/lib/client-cache";

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Create Material Modal state
  const [showCreateMaterialModal, setShowCreateMaterialModal] = useState(false);
  const [newMatName, setNewMatName] = useState("");
  const [newMatSku, setNewMatSku] = useState("");
  const [newMatUnit, setNewMatUnit] = useState("BAG");
  const [newMatMinStock, setNewMatMinStock] = useState("");
  const [newMatReorder, setNewMatReorder] = useState("");

  // Modal states
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [parties, setParties] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Form states
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitRate, setUnitRate] = useState("");
  const [vendorPartyId, setVendorPartyId] = useState("");
  const [referenceDoc, setReferenceDoc] = useState("");
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [notes, setNotes] = useState("");

  // Transfer Form states
  const [transferSourceStoreId, setTransferSourceStoreId] = useState("");
  const [transferTargetStoreId, setTransferTargetStoreId] = useState("");
  const [transferMaterialId, setTransferMaterialId] = useState("");
  const [transferQty, setTransferQty] = useState("");
  const [transferRefDoc, setTransferRefDoc] = useState("");
  const [transferNotes, setTransferNotes] = useState("");

  const loadMaterials = () => {
    setLoading(true);
    fetch("/api/materials")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const merged = clientCache.mergeMaterials(res.data);
          setMaterials(merged);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMaterials();
    fetch("/api/stores")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setStores(res.data);
          if (res.data.length > 0) {
            setSelectedStoreId(res.data[0].id);
            setTransferSourceStoreId(res.data[0].id);
            if (res.data.length > 1) {
              setTransferTargetStoreId(res.data[1].id);
            }
          }
        }
      });
    fetch("/api/parties?type=VENDOR")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setParties(clientCache.mergeParties(res.data || []));
      });
    fetch("/api/projects")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setProjects(clientCache.mergeProjects(res.data || []));
      });
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setTasks(clientCache.mergeTasks(res.data || []));
      });
  }, []);

  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: newMatSku.trim().toUpperCase(),
          name: newMatName.trim(),
          unitCode: newMatUnit,
          minStockQty: newMatMinStock ? parseFloat(newMatMinStock) : 0,
          reorderQty: newMatReorder ? parseFloat(newMatReorder) : 0,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to create material");
      } else {
        clientCache.saveMaterial(data.data);
        setStatusMessage(`Material "${data.data.name}" added to master inventory!`);
        setShowCreateMaterialModal(false);
        setNewMatName("");
        setNewMatSku("");
        setNewMatMinStock("");
        setNewMatReorder("");
        loadMaterials();
      }
    } catch {
      setErrorMessage("Network error during material creation");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    if (!confirm("Are you sure you want to remove this material from inventory?")) return;
    clientCache.deleteMaterial(id);
    setMaterials((prev) => prev.filter((m) => m.id !== id));
    try {
      await fetch(`/api/materials?id=${id}`, { method: "DELETE" });
      setStatusMessage("Material removed successfully.");
    } catch {
      // client cache updated
    }
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const storeToUse = selectedStoreId || (stores.length > 0 ? stores[0].id : "store-skyline-main");

    try {
      const res = await fetch("/api/inventory/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: storeToUse,
          vendorPartyId: vendorPartyId || undefined,
          referenceDoc: referenceDoc || undefined,
          notes: notes || undefined,
          items: [
            {
              materialId: selectedMaterialId,
              quantity: parseFloat(quantity),
              unitRate: unitRate ? parseFloat(unitRate) * 100 : undefined, // store paise
            },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to receive goods");
      } else {
        clientCache.adjustMaterialStock(selectedMaterialId, parseFloat(quantity));
        setStatusMessage("Goods received and authoritative ledger updated successfully!");
        setShowReceiveModal(false);
        setQuantity("");
        setUnitRate("");
        setReferenceDoc("");
        setNotes("");
        loadMaterials();
      }
    } catch {
      setErrorMessage("Network error during receipt");
    } finally {
      setActionLoading(false);
    }
  };

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const storeToUse = selectedStoreId || (stores.length > 0 ? stores[0].id : "store-skyline-main");

    try {
      const res = await fetch("/api/inventory/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: storeToUse,
          materialId: selectedMaterialId,
          quantity: parseFloat(quantity),
          projectId: projectId || undefined,
          taskId: taskId || undefined,
          notes: notes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to issue material");
      } else {
        clientCache.adjustMaterialStock(selectedMaterialId, -parseFloat(quantity));
        setStatusMessage("Material issued and project consumption logged successfully!");
        setShowIssueModal(false);
        setQuantity("");
        setNotes("");
        loadMaterials();
      }
    } catch {
      setErrorMessage("Network error during issue");
    } finally {
      setActionLoading(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (transferSourceStoreId === transferTargetStoreId) {
      setErrorMessage("Source store and destination store cannot be the same");
      return;
    }
    const qtyNum = parseFloat(transferQty);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setErrorMessage("Transfer quantity must be greater than zero");
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/inventory/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceStoreId: transferSourceStoreId,
          targetStoreId: transferTargetStoreId,
          materialId: transferMaterialId || (materials.length > 0 ? materials[0].id : ""),
          quantity: qtyNum,
          referenceDoc: transferRefDoc || undefined,
          notes: transferNotes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to transfer material");
      } else {
        setStatusMessage("Material transferred successfully across stores!");
        setShowTransferModal(false);
        setTransferQty("");
        setTransferRefDoc("");
        setTransferNotes("");
        loadMaterials();
      }
    } catch {
      setErrorMessage("Network error during transfer");
    } finally {
      setActionLoading(false);
    }
  };

  const filteredMaterials = materials.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <Boxes className="w-6 h-6 text-amber-500" />
              <span>Materials Master & Site Inventory</span>
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Authoritative stock ledger per store. Click any material to open its running balance ledger.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateMaterialModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span>+ Add Material</span>
            </button>
            <button
              onClick={() => {
                if (materials.length > 0) setSelectedMaterialId(materials[0].id);
                setShowReceiveModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all"
            >
              <PackagePlus className="w-4 h-4" />
              <span>+ Goods Receipt</span>
            </button>
            <button
              onClick={() => {
                if (materials.length > 0) setSelectedMaterialId(materials[0].id);
                setShowIssueModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-all"
            >
              <PackageMinus className="w-4 h-4" />
              <span>- Issue Stock</span>
            </button>
            <button
              onClick={() => {
                if (materials.length > 0) setTransferMaterialId(materials[0].id);
                if (stores.length > 0) setTransferSourceStoreId(stores[0].id);
                if (stores.length > 1) setTransferTargetStoreId(stores[1].id);
                setShowTransferModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-sm transition-all"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>⇄ Transfer Stock</span>
            </button>
          </div>
        </div>

        {/* Feedback alerts */}
        {statusMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by material name or SKU code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Materials Table & Cards */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-200/60 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <Boxes className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <div className="text-sm font-bold text-slate-700">No materials found</div>
            <div className="text-xs text-slate-400 mt-1">Try clearing your search query.</div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Material / SKU</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Unit</th>
                    <th className="py-3 px-4 text-right">Current Stock</th>
                    <th className="py-3 px-4 text-right">Min Threshold</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMaterials.map((m) => (
                    <tr
                      key={m.id}
                      className="hover:bg-amber-50/40 transition-colors group cursor-pointer"
                    >
                      <td className="py-3.5 px-4">
                        <Link href={`/materials/${m.id}`} className="block">
                          <div className="font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
                            {m.name}
                          </div>
                          <div className="text-xs text-slate-400 font-mono">{m.sku}</div>
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {m.category?.name || "General"}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {m.unitCode}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-slate-900 tabular-nums">
                        {formatQuantity(m.totalStock, m.unitCode)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-500 tabular-nums">
                        {formatQuantity(m.minStockQty, m.unitCode)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {m.isLowStock ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                            <AlertTriangle className="w-3 h-3" /> Low Stock
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            Adequate
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/materials/${m.id}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline"
                          >
                            <span>Open Ledger</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMaterial(m.id);
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 transition"
                            title="Delete Material"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Goods Receipt */}
        {showReceiveModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <PackagePlus className="w-5 h-5 text-emerald-600" />
                  <span>Receive Goods into Site Store</span>
                </div>
                <button
                  onClick={() => setShowReceiveModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleReceiveSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Select Material
                  </label>
                  <select
                    value={selectedMaterialId}
                    onChange={(e) => setSelectedMaterialId(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.sku}) — {m.unitCode}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Receiving Store / Yard
                  </label>
                  <select
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.site?.name || "General Yard"})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Received Quantity
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      placeholder="e.g. 50"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Unit Rate (₹ per unit)
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 380"
                      value={unitRate}
                      onChange={(e) => setUnitRate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Vendor / Supplier
                    </label>
                    <select
                      value={vendorPartyId}
                      onChange={(e) => setVendorPartyId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    >
                      <option value="">Select Vendor (Optional)</option>
                      {parties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Delivery Challan #
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. DC-9901"
                      value={referenceDoc}
                      onChange={(e) => setReferenceDoc(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Notes
                  </label>
                  <input
                    type="text"
                    placeholder="Batch inspection passed, gate entry verified"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReceiveModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {actionLoading ? "Receiving..." : "Confirm Goods Receipt"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Issue Material */}
        {showIssueModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <PackageMinus className="w-5 h-5 text-amber-500" />
                  <span>Issue Material to Project / Task</span>
                </div>
                <button
                  onClick={() => setShowIssueModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleIssueSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Select Material to Issue
                  </label>
                  <select
                    value={selectedMaterialId}
                    onChange={(e) => setSelectedMaterialId(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — Current Stock: {m.totalStock} {m.unitCode}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Issuing Store / Yard
                  </label>
                  <select
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.site?.name || "General Yard"})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Issue Quantity
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    placeholder="e.g. 10"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Target Project
                    </label>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    >
                      <option value="">Select Project (Optional)</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Target Task
                    </label>
                    <select
                      value={taskId}
                      onChange={(e) => setTaskId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    >
                      <option value="">Select Task (Optional)</option>
                      {tasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Purpose / Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Issued to sub-contractor for 5th floor casting"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowIssueModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {actionLoading ? "Issuing..." : "Confirm Material Issue"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Transfer Material */}
        {showTransferModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-sky-600" />
                  <span>Transfer Stock Across Stores</span>
                </div>
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleTransferSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Source Store (From)
                    </label>
                    <select
                      value={transferSourceStoreId}
                      onChange={(e) => setTransferSourceStoreId(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Target Store (To)
                    </label>
                    <select
                      value={transferTargetStoreId}
                      onChange={(e) => setTransferTargetStoreId(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Select Material
                  </label>
                  <select
                    value={transferMaterialId}
                    onChange={(e) => setTransferMaterialId(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.sku}) — Available: {m.totalStock} {m.unitCode}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Transfer Quantity
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      placeholder="e.g. 20"
                      value={transferQty}
                      onChange={(e) => setTransferQty(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Gate Pass / Challan #
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. TR-2026-001"
                      value={transferRefDoc}
                      onChange={(e) => setTransferRefDoc(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Transfer Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Inter-site surplus redistribution"
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTransferModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {actionLoading ? "Transferring..." : "Confirm Stock Transfer"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Create Material */}
        {showCreateMaterialModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-amber-500" />
                  <span>Add Master Material</span>
                </div>
                <button
                  onClick={() => setShowCreateMaterialModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateMaterial} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Material Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. UltraTech Super Cement 53"
                    value={newMatName}
                    onChange={(e) => setNewMatName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      SKU / Code *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. MAT-CEM-53"
                      value={newMatSku}
                      onChange={(e) => setNewMatSku(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Unit of Measure *
                    </label>
                    <select
                      value={newMatUnit}
                      onChange={(e) => setNewMatUnit(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      <option value="BAG">BAG (Bags)</option>
                      <option value="KG">KG (Kilograms)</option>
                      <option value="TONNE">TONNE (Metric Tonnes)</option>
                      <option value="LITRE">LITRE (Litres)</option>
                      <option value="METER">METER (Meters)</option>
                      <option value="PIECE">PIECE (Pieces)</option>
                      <option value="BOX">BOX (Boxes)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Min Stock Threshold
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="e.g. 50"
                      value={newMatMinStock}
                      onChange={(e) => setNewMatMinStock(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Reorder Quantity
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="e.g. 200"
                      value={newMatReorder}
                      onChange={(e) => setNewMatReorder(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateMaterialModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {actionLoading ? "Saving..." : "Add to Inventory"}
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
