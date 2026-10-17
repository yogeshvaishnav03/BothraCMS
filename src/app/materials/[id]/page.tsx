"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Shell from "@/components/layout/Shell";
import PlaceOrderModal from "@/components/materials/PlaceOrderModal";
import { formatCurrency, formatQuantity, formatDateTime, formatDate } from "@/lib/formatters";
import { useLanguage } from "@/lib/i18n";
import {
  Boxes,
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  ShieldCheck,
  Calendar,
  Building2,
  FileText,
  User,
  ShoppingCart,
  AlertTriangle,
  MessageSquare,
  Send,
  Mail,
  ExternalLink,
  Phone,
} from "lucide-react";

export default function MaterialDetailPage() {
  const params = useParams();
  const materialId = params.id as string;
  const { t } = useLanguage();

  const [ledgerData, setLedgerData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [showPlaceOrderModal, setShowPlaceOrderModal] = useState(false);

  const loadLedger = useCallback(() => {
    if (!materialId) return;
    fetch(`/api/materials/${materialId}/ledger`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setLedgerData(res.data);
        } else {
          setLedgerData(null);
        }
      })
      .catch((err) => {
        console.error("Authoritative material ledger load failed:", err);
        setLedgerData(null);
      })
      .finally(() => setLoading(false));
  }, [materialId]);

  const loadOrders = useCallback(() => {
    if (!materialId) return;
    fetch(`/api/orders?materialId=${materialId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setOrders(res.data);
        }
      })
      .catch((err) => {
        console.error("Failed to load material purchase orders:", err);
      });
  }, [materialId]);

  useEffect(() => {
    loadLedger();
    loadOrders();
  }, [loadLedger, loadOrders]);

  if (loading) {
    return (
      <Shell>
        <div className="space-y-4">
          <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-slate-200 rounded-xl animate-pulse" />
        </div>
      </Shell>
    );
  }

  if (!ledgerData) {
    return (
      <Shell>
        <div className="text-center py-12">
          <div className="text-base font-bold text-slate-700">Material not found</div>
          <Link href="/materials" className="text-xs text-amber-600 font-semibold hover:underline mt-2 inline-block">
            ← Back to Materials
          </Link>
        </div>
      </Shell>
    );
  }

  const { material, currentBalance, totalReceived, totalIssued, entries } = ledgerData;

  return (
    <Shell>
      <div className="space-y-6">
        {/* Breadcrumb & Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/materials"
              className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 shadow-sm transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Material Detail & Stock Ledger
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>{material.name}</span>
                <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-slate-200 text-slate-700 font-bold">
                  {material.sku}
                </span>
              </h1>
            </div>
          </div>

          <button
            onClick={() => setShowPlaceOrderModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-sm transition self-start sm:self-auto cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>{t("order.placeOrderToVendor", "Place Order to Vendor")}</span>
          </button>
        </div>

        {/* Low Stock Warning Banner */}
        {material.minStockQty > 0 && currentBalance < material.minStockQty && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center shrink-0 border border-amber-500/30">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <div className="text-sm font-bold text-amber-950 flex items-center gap-2 flex-wrap">
                  <span>Automatic Reorder Alert: Stock Below Minimum Threshold</span>
                  <span className="text-[10px] bg-rose-100 text-rose-700 font-black px-2 py-0.5 rounded-full border border-rose-200 uppercase">
                    Shortage: {formatQuantity(material.minStockQty - currentBalance, material.unitCode)}
                  </span>
                </div>
                <div className="text-xs text-amber-900/80 mt-0.5">
                  Current stock ({formatQuantity(currentBalance, material.unitCode)}) is below the required reserve ({formatQuantity(material.minStockQty, material.unitCode)}). Place a supply order with an authorized vendor.
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowPlaceOrderModal(true)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shrink-0 shadow-sm flex items-center gap-1.5 transition cursor-pointer"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>{t("order.placeOrder", "Place Order Now")} &rarr;</span>
            </button>
          </div>
        )}

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Current Stock on Hand
            </span>
            <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
              {formatQuantity(currentBalance, material.unitCode)}
            </div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-1">
              Authoritative Reconciled Balance
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Received to Date
            </span>
            <div className="text-2xl font-black text-emerald-600 mt-1 tabular-nums">
              {formatQuantity(totalReceived, material.unitCode)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">From vendor shipments</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Issued / Consumed
            </span>
            <div className="text-2xl font-black text-amber-600 mt-1 tabular-nums">
              {formatQuantity(totalIssued, material.unitCode)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Issued to site projects & tasks</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Minimum Threshold
            </span>
            <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
              {formatQuantity(material.minStockQty, material.unitCode)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Automatic reorder warning level</div>
          </div>
        </div>

        {/* Purchase Orders to Vendors Section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-800 flex items-center justify-center font-bold">
                <ShoppingCart className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-sm">
                  {t("order.recentOrders", "Purchase Orders to Vendors (सामग्री आपूर्ति आदेश)")}
                </h2>
                <p className="text-xs text-slate-500">
                  Authoritative material orders placed to suppliers with automated WhatsApp & Email dispatch tracking.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold bg-slate-200 text-slate-800 px-2.5 py-1 rounded">
                {orders.length} Placed Orders
              </span>
              <button
                onClick={() => setShowPlaceOrderModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>+ {t("order.placeOrder", "New Order")}</span>
              </button>
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No purchase orders placed for this material yet. Click &ldquo;Place Order to Vendor&rdquo; above to dispatch an order with instant vendor WhatsApp/Email notification.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">PO Number</th>
                    <th className="py-3 px-4">Date Placed</th>
                    <th className="py-3 px-4">Vendor / Supplier</th>
                    <th className="py-3 px-4 text-right">Quantity</th>
                    <th className="py-3 px-4 text-right">Estimated Total</th>
                    <th className="py-3 px-4">Expected Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Vendor Notification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((po: any) => (
                    <tr key={po.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-xs text-slate-900">
                        {po.orderNumber}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 font-mono whitespace-nowrap">
                        {formatDateTime(po.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-semibold text-slate-900">{po.vendor?.name || "—"}</div>
                        {po.vendor?.phone && (
                          <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{po.vendor.phone}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                        {formatQuantity(po.quantity, po.unitCode)}
                      </td>
                      <td className="py-3 px-4 text-right text-xs font-mono text-slate-700 tabular-nums">
                        {po.totalAmount ? formatCurrency(po.totalAmount) : "—"}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {po.expectedDeliveryDate ? formatDate(po.expectedDeliveryDate) : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            po.status === "DELIVERED"
                              ? "bg-emerald-100 text-emerald-800"
                              : po.status === "CONFIRMED"
                              ? "bg-blue-100 text-blue-800"
                              : po.status === "CANCELLED"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {po.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {po.whatsappUrl ? (
                          <a
                            href={po.whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-bold transition shadow-2xs"
                            title="Open WhatsApp notification to vendor"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                            <span>WhatsApp</span>
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Dispatched</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Chronological Stock Ledger Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-500" />
                <span>Authoritative Chronological Stock Ledger</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Every movement records store, date, type, vendor/source, received, issued, rate, and running balance.
              </p>
            </div>
            <span className="text-xs font-mono font-bold bg-slate-200 text-slate-800 px-2.5 py-1 rounded">
              {entries.length} Ledger Records
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No stock movements recorded for this material yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Date / Time</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Store</th>
                    <th className="py-3 px-4">Vendor / Ref</th>
                    <th className="py-3 px-4 text-right">Received</th>
                    <th className="py-3 px-4 text-right">Issued</th>
                    <th className="py-3 px-4 text-right">Rate (₹)</th>
                    <th className="py-3 px-4 text-right">Running Balance</th>
                    <th className="py-3 px-4">Project / Task</th>
                    <th className="py-3 px-4">Logged By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((m: any) => {
                    const isPositive = m.quantityDelta > 0;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 text-xs text-slate-600 font-mono whitespace-nowrap">
                          {formatDateTime(m.date)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                              m.type === "RECEIPT"
                                ? "bg-emerald-100 text-emerald-800"
                                : m.type === "ISSUE"
                                ? "bg-amber-100 text-amber-800"
                                : m.type.startsWith("TRANSFER")
                                ? "bg-blue-100 text-blue-800"
                                : "bg-purple-100 text-purple-800"
                            }`}
                          >
                            {isPositive ? (
                              <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <ArrowUpRight className="w-3 h-3 text-amber-600" />
                            )}
                            {m.type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs font-medium text-slate-700 whitespace-nowrap">
                          {m.storeName}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <div className="font-semibold text-slate-900">{m.vendorName || "—"}</div>
                          {m.referenceDoc && (
                            <div className="text-[10px] font-mono text-slate-500">
                              Ref: {m.referenceDoc}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-600 tabular-nums">
                          {isPositive ? formatQuantity(m.quantityDelta, m.unitCode) : "—"}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-amber-600 tabular-nums">
                          {!isPositive ? formatQuantity(Math.abs(m.quantityDelta), m.unitCode) : "—"}
                        </td>
                        <td className="py-3 px-4 text-right text-xs font-mono text-slate-600 tabular-nums">
                          {m.unitRate ? formatCurrency(m.unitRate) : "—"}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-slate-900 tabular-nums bg-amber-50/40">
                          {formatQuantity(m.runningBalance, m.unitCode)}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {m.projectName ? (
                            <div>
                              <span className="font-semibold text-slate-800">{m.projectName}</span>
                              {m.taskTitle && (
                                <div className="text-[10px] text-slate-500">{m.taskTitle}</div>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                          {m.createdByName}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Place Order to Vendor Modal */}
      <PlaceOrderModal
        isOpen={showPlaceOrderModal}
        onClose={() => setShowPlaceOrderModal(false)}
        onOrderPlaced={() => {
          loadLedger();
          loadOrders();
        }}
        initialMaterial={{
          id: material.id,
          name: material.name,
          sku: material.sku,
          unitCode: material.unitCode,
          minStockQty: material.minStockQty,
          reorderQty: material.reorderQty,
          currentStock: currentBalance,
        }}
      />
    </Shell>
  );
}
