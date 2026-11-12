"use client";

import React, { useState, useEffect } from "react";
import { formatCurrency, formatQuantity } from "@/lib/formatters";
import { useLanguage } from "@/lib/i18n";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import {
  ShoppingCart,
  Send,
  CheckCircle2,
  Clock,
  ShieldAlert,
  MessageSquare,
  Mail,
  Copy,
  ExternalLink,
  X,
  Building2,
  Boxes,
  Calendar,
  DollarSign,
  AlertCircle,
  Phone,
  Check,
  Sparkles,
} from "lucide-react";
import SearchableSelect from "@/components/ui/SearchableSelect";

interface MaterialSummary {
  id: string;
  name: string;
  sku: string;
  unitCode: string;
  unitPrice?: number;
  minStockQty?: number;
  reorderQty?: number;
  currentStock?: number;
}

interface PlaceOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderPlaced?: () => void;
  initialMaterial?: MaterialSummary;
}

export default function PlaceOrderModal({
  isOpen,
  onClose,
  onOrderPlaced,
  initialMaterial,
}: PlaceOrderModalProps) {
  const { t } = useLanguage();
  const { refreshUser } = useAppSession();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);

  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("");
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [unitRate, setUnitRate] = useState<string>("");
  const [expectedDate, setExpectedDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [approvalQuery, setApprovalQuery] = useState<string>("");
  const [autoApprove, setAutoApprove] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Result state
  const [orderResult, setOrderResult] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  // Initialize and load dependencies
  useEffect(() => {
    if (!isOpen) {
      setOrderResult(null);
      setErrorMessage(null);
      setApprovalQuery("");
      setAutoApprove(false);
      return;
    }

    setLoading(true);

    refreshUser()
      .then((u) => {
        if (u) setCurrentUser(u);
      })
      .catch(() => {});

    const pVendors = fetch("/api/parties?type=VENDOR")
      .then((r) => r.json())
      .then((res) => (res.success && res.data ? res.data : []));

    const pStores = fetch("/api/stores")
      .then((r) => r.json())
      .then((res) => (res.success && res.data ? res.data : []));

    const pMaterials = initialMaterial
      ? Promise.resolve([initialMaterial])
      : fetch("/api/materials")
          .then((r) => r.json())
          .then((res) => (res.success && res.data ? res.data : []));

    Promise.all([pVendors, pStores, pMaterials])
      .then(([vList, sList, mList]) => {
        setVendors(vList);
        setStores(sList);
        setMaterials(mList);

        if (initialMaterial) {
          setSelectedMaterialId(initialMaterial.id);
          const shortage =
            (initialMaterial.minStockQty || 0) - (initialMaterial.currentStock || 0);
          const suggested =
            shortage > 0
              ? shortage
              : initialMaterial.reorderQty && initialMaterial.reorderQty > 0
              ? initialMaterial.reorderQty
              : 1000;
          setQuantity(suggested.toString());
          if (initialMaterial.unitPrice && Number(initialMaterial.unitPrice) > 0) {
            setUnitRate(String(initialMaterial.unitPrice));
          }
          setApprovalQuery(`Critical site stock shortage for ${initialMaterial.name}. Minimum stock is ${initialMaterial.minStockQty || 0} ${initialMaterial.unitCode}, current stock is ${initialMaterial.currentStock || 0} ${initialMaterial.unitCode}. Requesting PO confirmation.`);
        } else if (mList.length > 0) {
          setSelectedMaterialId(mList[0].id);
          if (mList[0].unitPrice && Number(mList[0].unitPrice) > 0) {
            setUnitRate(String(mList[0].unitPrice));
          }
        }

        if (vList.length > 0) {
          setSelectedVendorId(vList[0].id);
        }

        if (sList.length > 0) {
          setSelectedStoreId(sList[0].id);
        }

        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 2);
        setExpectedDate(targetDate.toISOString().split("T")[0]);
      })
      .catch((err) => {
        console.error("Failed to load order form references:", err);
        setErrorMessage("Failed to load required vendors and materials");
      })
      .finally(() => setLoading(false));
  }, [isOpen, initialMaterial, refreshUser]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentMaterial =
    initialMaterial && initialMaterial.id === selectedMaterialId
      ? initialMaterial
      : materials.find((m) => m.id === selectedMaterialId);

  const currentVendor = vendors.find((v) => v.id === selectedVendorId);
  const currentStore = stores.find((s) => s.id === selectedStoreId);

  const numQty = parseFloat(quantity) || 0;
  const numRate = parseFloat(unitRate) || 0;
  const estimatedTotal = numQty > 0 && numRate > 0 ? numQty * numRate : 0;

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterialId) {
      setErrorMessage("Please select a material.");
      return;
    }
    if (!selectedVendorId) {
      setErrorMessage("Please select a supplier / vendor.");
      return;
    }
    if (!numQty || numQty <= 0) {
      setErrorMessage("Please enter a valid order quantity greater than 0.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        materialId: selectedMaterialId,
        vendorPartyId: selectedVendorId,
        quantity: numQty,
        unitCode: currentMaterial?.unitCode || "PIECE",
        unitRate: numRate > 0 ? numRate : undefined,
        storeId: selectedStoreId || undefined,
        expectedDeliveryDate: expectedDate || undefined,
        notes: notes.trim() || undefined,
        approvalQuery: approvalQuery.trim() || undefined,
        autoApprove: currentUser?.role === "SUPER_ADMIN" ? autoApprove : undefined,
        notificationMethod: "WHATSAPP_AND_EMAIL",
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to place order.");
      }

      setOrderResult(json.data);
      if (onOrderPlaced) {
        onOrderPlaced();
      }
    } catch (err: any) {
      console.error("Order submission failed:", err);
      setErrorMessage(err.message || "Failed to place purchase order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyMessage = () => {
    if (orderResult?.notification?.message) {
      navigator.clipboard.writeText(orderResult.notification.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="place-order-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-4 py-3.5 sm:px-5 sm:py-4 flex items-start sm:items-center justify-between gap-2 border-b border-slate-800 shrink-0">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <ShoppingCart className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h2 id="place-order-modal-title" className="text-base font-bold text-white flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span>{t("order.placeOrderToVendor", "Place Order to Vendor")}</span>
                <span className="text-[10px] font-mono bg-amber-500 text-slate-950 font-black px-1.5 py-0.5 rounded uppercase whitespace-nowrap shrink-0">
                  <span className="sm:hidden">Admin Approval</span>
                  <span className="hidden sm:inline">Super Admin Approval Required</span>
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                Sends this purchase order for admin approval before contacting the vendor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition shrink-0"
            aria-label="Close order modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-slate-500 font-medium">
                Loading suppliers, stores, and inventory...
              </span>
            </div>
          ) : orderResult ? (
            /* RESULT STATES */
            orderResult.isPendingApproval ? (
              /* PENDING SUPER ADMIN APPROVAL SCREEN */
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-3">
                  <Clock className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-bold text-amber-950">
                      {t("order.queryRaised", "Purchase Order Sent for Approval!")}
                    </div>
                    <div className="text-xs text-amber-900 mt-1 leading-relaxed">
                      Purchase order <span className="font-mono font-bold">{orderResult.order.orderNumber}</span> has been created and is <strong className="font-bold underline">Waiting for Approval</strong>.
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 text-slate-100 rounded-xl p-4 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-amber-400">
                    <ShieldAlert className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Approval & Send Status
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400">Material:</span>
                      <div className="font-bold text-white">{orderResult.order.material?.name || currentMaterial?.name}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Quantity:</span>
                      <div className="font-bold text-white">{formatQuantity(orderResult.order.quantity, orderResult.order.unitCode)}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Supplier:</span>
                      <div className="font-bold text-white">{orderResult.order.vendor?.name || currentVendor?.name}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Estimated Total:</span>
                      <div className="font-bold text-amber-400">
                        {orderResult.order.totalAmount ? formatCurrency(orderResult.order.totalAmount) : "—"}
                      </div>
                    </div>
                  </div>

                  {orderResult.order.approvalQuery && (
                    <div className="mt-2 pt-2 border-t border-slate-800 text-xs">
                      <span className="text-slate-400 block text-[11px] mb-1">Reason / Notes:</span>
                      <div className="p-2.5 bg-slate-950 rounded border border-slate-800 font-mono text-slate-300 text-xs">
                        {orderResult.order.approvalQuery}
                      </div>
                    </div>
                  )}

                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-300 leading-relaxed">
                    ℹ️ Your request has been sent to an admin for review.
                    WhatsApp and Email send buttons will unlock as soon as it is approved.
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition"
                  >
                    {t("action.close", "Close")}
                  </button>
                </div>
              </div>
            ) : (
              /* APPROVED STATE WITH LIVE VENDOR DISPATCH */
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-bold text-emerald-950">
                      {t("order.successTitle", "Purchase Order Placed & Approved!")}
                    </div>
                    <div className="text-xs text-emerald-800 mt-0.5">
                      Order <span className="font-mono font-bold">{orderResult.order.orderNumber}</span> is approved and registered in the system.
                    </div>
                  </div>
                </div>

                {/* Vendor Notification Dispatch Center */}
                <div className="bg-slate-900 text-slate-100 rounded-xl p-4 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                        {t("order.vendorNotification", "Vendor Notification Dispatch")}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Vendor: <strong className="text-white">{orderResult.notification.vendorName}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {orderResult.notification.whatsappUrl ? (
                      <a
                        href={orderResult.notification.whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-900/30 transition transform active:scale-98"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>{t("order.sendWhatsApp", "Send WhatsApp to Vendor")}</span>
                        <ExternalLink className="w-3 h-3 opacity-70" />
                      </a>
                    ) : (
                      <div className="p-3 bg-slate-800/80 rounded-xl text-xs text-slate-400 flex items-center gap-2">
                        <Phone className="w-4 h-4 text-slate-500" />
                        <span>No vendor phone registered</span>
                      </div>
                    )}

                    {orderResult.notification.mailtoUrl ? (
                      <a
                        href={orderResult.notification.mailtoUrl}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-900/30 transition"
                      >
                        <Mail className="w-4 h-4" />
                        <span>{t("order.sendEmail", "Send Email to Vendor")}</span>
                      </a>
                    ) : (
                      <div className="p-3 bg-slate-800/80 rounded-xl text-xs text-slate-400 flex items-center gap-2">
                        <Mail className="w-4 h-4 text-slate-500" />
                        <span>No vendor email registered</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                      <span>Formatted Purchase Order Summary:</span>
                      <button
                        type="button"
                        onClick={handleCopyMessage}
                        className="flex items-center gap-1 text-amber-400 hover:underline font-semibold"
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copied ? "Copied!" : t("order.copyText", "Copy Text")}</span>
                      </button>
                    </div>
                    <pre className="p-3 bg-slate-950 rounded-lg text-[11px] font-mono text-slate-300 max-h-44 overflow-y-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
                      {orderResult.notification.message}
                    </pre>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition"
                  >
                    {t("action.close", "Close")}
                  </button>
                </div>
              </div>
            )
          ) : (
            /* ORDER FORM */
            <form onSubmit={handleSubmitOrder} className="space-y-4">
              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Material Info Card */}
              {currentMaterial && (
                <div className="p-3 sm:p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-800 flex items-center justify-center font-bold shrink-0 mt-0.5">
                      <Boxes className="w-4 h-4 text-amber-700" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                        <span>{currentMaterial.name}</span>
                        <span className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-amber-300 text-slate-700 font-semibold whitespace-nowrap">
                          {currentMaterial.sku}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span>Unit: <strong>{currentMaterial.unitCode}</strong></span>
                        {currentMaterial.minStockQty !== undefined && (
                          <span className="text-slate-500">
                            (Min: {currentMaterial.minStockQty} | Reorder: {currentMaterial.reorderQty || "—"})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {currentMaterial.currentStock !== undefined && (
                    <div className="flex sm:block items-center justify-between pt-2 sm:pt-0 border-t sm:border-t-0 border-amber-200/70 sm:text-right shrink-0">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">Stock on Hand</div>
                      <div className="text-sm font-black text-slate-900 whitespace-nowrap">
                        {formatQuantity(currentMaterial.currentStock, currentMaterial.unitCode)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Material Selector (if not preselected) */}
              {!initialMaterial && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Select Material *
                  </label>
                  <SearchableSelect
                    options={materials.map((m) => ({
                      value: m.id,
                      label: m.name,
                      badge: m.sku,
                      subLabel: `Unit: ${m.unitCode}${m.minStockQty ? ` • Min: ${m.minStockQty}` : ""}${m.currentStock !== undefined ? ` • Current Stock: ${m.currentStock} ${m.unitCode}` : ""}`,
                    }))}
                    value={selectedMaterialId}
                    onChange={(matId) => {
                      setSelectedMaterialId(matId);
                      const foundMat = materials.find((m) => m.id === matId);
                      if (foundMat?.unitPrice && Number(foundMat.unitPrice) > 0) {
                        setUnitRate(String(foundMat.unitPrice));
                      }
                    }}
                    placeholder="Search and select material..."
                    searchPlaceholder="Type to search (e.g. Cement, Steel, MAT-174)..."
                    required
                  />
                </div>
              )}

              {/* Vendor Selector */}
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase mb-1 flex flex-wrap items-center justify-between gap-1">
                  <span>{t("order.vendor", "Select Vendor / Supplier")} *</span>
                  {currentVendor?.phone && (
                    <span className="text-[11px] text-emerald-600 font-normal flex items-center gap-1 font-mono whitespace-nowrap">
                      <Phone className="w-3 h-3 shrink-0" /> {currentVendor.phone}
                    </span>
                  )}
                </label>
                <SearchableSelect
                  options={vendors.map((v) => ({
                    value: v.id,
                    label: v.name,
                    badge: v.taxIdentifier ? `GST: ${v.taxIdentifier}` : undefined,
                    subLabel: v.phone ? `Phone: ${v.phone}` : undefined,
                  }))}
                  value={selectedVendorId}
                  onChange={(vId) => setSelectedVendorId(vId)}
                  placeholder="Search and select vendor / supplier..."
                  searchPlaceholder="Type supplier name, phone, or GST..."
                  required
                />
              </div>

              {/* Quantity and Rate Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    {t("order.quantity", "Order Quantity")} * ({currentMaterial?.unitCode || "Units"})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    placeholder="e.g. 500"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold tabular-nums focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    {t("order.unitRate", "Estimated Rate (₹ per unit)")}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder={currentMaterial?.unitPrice ? `Rate: ₹${currentMaterial.unitPrice}` : "e.g. 85.00"}
                      value={unitRate}
                      onChange={(e) => setUnitRate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm tabular-nums focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                    <DollarSign className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Total Calculation Banner */}
              {estimatedTotal > 0 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-600">
                    {t("order.totalAmount", "Estimated Order Value")}:
                  </span>
                  <span className="font-black text-slate-900 text-sm tabular-nums">
                    ₹{estimatedTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              {/* Delivery Store & Expected Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    {t("order.deliveryStore", "Delivery Store / Site Yard")}
                  </label>
                  <SearchableSelect
                    options={stores.map((s) => ({
                      value: s.id,
                      label: s.name,
                      subLabel: s.site?.name ? `Site: ${s.site.name}` : undefined,
                    }))}
                    value={selectedStoreId}
                    onChange={(sId) => setSelectedStoreId(sId)}
                    placeholder="Select store / site yard..."
                    searchPlaceholder="Search store by name or site..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    {t("order.expectedDelivery", "Expected Delivery Date")}
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={expectedDate}
                      onChange={(e) => setExpectedDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                    <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Approval Query / Justification for Super Admin */}
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase mb-1 flex flex-wrap items-center justify-between gap-1">
                  <span>{t("order.approvalQuery", "Reason for Purchase Order")}</span>
                  <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider whitespace-nowrap">
                    Required for Confirmation
                  </span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain why this material order is required (site progress, urgency, shortage)..."
                  value={approvalQuery}
                  onChange={(e) => setApprovalQuery(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm leading-relaxed focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              {/* Instructions / Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  {t("order.notes", "Site Delivery Instructions / Notes")}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Unload at Tower 2 store. Call site supervisor before arrival."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              {/* Super Admin Immediate Approval Toggle */}
              {isSuperAdmin && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-start sm:items-center gap-2 min-w-0">
                    <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-amber-950 block">Super Admin Action</span>
                      <span className="text-[11px] text-amber-800 leading-snug block">Directly approve and unlock vendor notification immediately?</span>
                    </div>
                  </div>
                  <label className="flex items-center justify-center sm:justify-start gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-amber-300 shadow-2xs shrink-0 whitespace-nowrap w-full sm:w-auto">
                    <input
                      type="checkbox"
                      checked={autoApprove}
                      onChange={(e) => setAutoApprove(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 shrink-0"
                    />
                    <span className="text-xs font-bold text-slate-800">Auto-Approve</span>
                  </label>
                </div>
              )}

              {/* Order Query Workflow Notice */}
              <div className="p-3 bg-slate-900 text-slate-300 rounded-xl text-xs flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-bold text-white">Order Approval Flow: </span>
                  {autoApprove ? (
                    <span>This order will be approved right away, and WhatsApp/Email send options will be ready immediately.</span>
                  ) : (
                    <span>Submitting sends this order for admin approval. WhatsApp and Email send options unlock as soon as it is approved.</span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5 sm:gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 whitespace-nowrap transition"
                >
                  {t("action.cancel", "Cancel")}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs whitespace-nowrap shadow-md shadow-amber-500/20 transition disabled:opacity-50"
                >
                  <Send className="w-4 h-4 shrink-0" />
                  <span>
                    {submitting
                      ? "Submitting..."
                      : autoApprove
                      ? "Approve & Place Order"
                      : "Send Order for Approval"}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
