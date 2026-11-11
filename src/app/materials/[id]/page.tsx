"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, TablePagination, ExcelColumn } from "@/components/ui/ExcelTable";
import Link from "next/link";
import { useParams } from "next/navigation";
import Shell from "@/components/layout/Shell";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import PlaceOrderModal from "@/components/materials/PlaceOrderModal";
import { formatCurrency, formatCompactINR, formatQuantity, formatCompactQuantity, formatDateTime, formatDate } from "@/lib/formatters";
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
  Clock,
  CheckCircle2,
  XCircle,
  X,
} from "lucide-react";
import { canUser } from "@/lib/permissions";

export default function MaterialDetailPage() {
  const params = useParams();
  const materialId = params.id as string;
  const { t } = useLanguage();

  const { refreshUser } = useAppSession();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [ledgerData, setLedgerData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [showPlaceOrderModal, setShowPlaceOrderModal] = useState(false);
  const [orderDialog, setOrderDialog] = useState<{ type: "approve" | "reject"; order: any } | null>(null);
  const [orderRejectReason, setOrderRejectReason] = useState("Purchase order declined by administrator");
  const [orderFeedback, setOrderFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!orderDialog) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOrderDialog(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [orderDialog]);

  const canPlaceOrder =
    canUser(currentUser, "inventory:receipt") ||
    canUser(currentUser, "inventory:adjust") ||
    canUser(currentUser, "projects:write") ||
    (currentUser?.role &&
      ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "SITE_SUPERVISOR", "STOREKEEPER"].includes(
        currentUser.role
      ));

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
    refreshUser()
      .then((u) => {
        if (u) setCurrentUser(u);
      })
      .catch(() => {});
  }, [refreshUser]);

  const handleApproveOrder = (order: any) => {
    setOrderFeedback(null);
    setOrderDialog({ type: "approve", order });
  };

  const handleRejectOrder = (order: any) => {
    setOrderFeedback(null);
    setOrderRejectReason("Purchase order declined by administrator");
    setOrderDialog({ type: "reject", order });
  };

  const executeOrderDialog = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!orderDialog) return;
    const { type, order } = orderDialog;
    if (type === "reject" && !orderRejectReason.trim()) return;

    setActionLoading(order.id);
    try {
      if (type === "approve") {
        const res = await fetch(`/api/orders/${order.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: "Approved from material ledger" }),
        });
        const json = await res.json();
        if (res.ok && json.success) {
          setOrderDialog(null);
          setOrderFeedback({ tone: "success", text: `Order ${order.orderNumber} approved!` });
          loadOrders();
        } else {
          setOrderFeedback({ tone: "error", text: json.error?.message || "Failed to approve order" });
        }
      } else {
        const res = await fetch(`/api/orders/${order.id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: orderRejectReason.trim() }),
        });
        const json = await res.json();
        if (res.ok && json.success) {
          setOrderDialog(null);
          setOrderFeedback({ tone: "success", text: `Order ${order.orderNumber} rejected.` });
          loadOrders();
        } else {
          setOrderFeedback({ tone: "error", text: json.error?.message || "Failed to reject order" });
        }
      }
    } catch {
      setOrderFeedback({ tone: "error", text: `Network error ${type === "approve" ? "approving" : "rejecting"} order` });
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    loadLedger();
    loadOrders();
  }, [loadLedger, loadOrders]);

  const orderColumns: ExcelColumn<any>[] = useMemo(
    () => [
      { key: "orderNumber", label: "PO Number", accessor: (po) => po.orderNumber, type: "text" },
      { key: "createdAt", label: "Date Placed", accessor: (po) => formatDateTime(po.createdAt), type: "date" },
      { key: "vendor", label: "Vendor / Supplier", accessor: (po) => po.vendor?.name || "—", type: "text" },
      { key: "quantity", label: "Quantity", accessor: (po) => Number(po.quantity) || 0, type: "number", align: "right" },
      { key: "totalAmount", label: "Estimated Total", accessor: (po) => (Number(po.totalAmount) || 0) / 100, type: "currency", align: "right" },
      { key: "expectedDate", label: "Expected Date", accessor: (po) => po.expectedDeliveryDate ? formatDate(po.expectedDeliveryDate) : "—", type: "date" },
      { key: "status", label: "Status", accessor: (po) => po.status, type: "text" },
    ],
    []
  );

  const excelOrders = useExcelTable({
    data: orders,
    columns: orderColumns,
  });

  const entries = useMemo(() => ledgerData?.entries || [], [ledgerData]);

  const ledgerColumns: ExcelColumn<any>[] = useMemo(
    () => [
      { key: "date", label: "Date / Time", accessor: (m) => formatDateTime(m.date), type: "date" },
      { key: "type", label: "Type", accessor: (m) => m.type, type: "text" },
      { key: "store", label: "Store", accessor: (m) => m.store?.name || "Site Store", type: "text" },
      { key: "vendorRef", label: "Vendor / Ref", accessor: (m) => m.referenceNumber || m.party?.name || "—", type: "text" },
      { key: "received", label: "Received", accessor: (m) => m.quantityDelta > 0 ? Number(m.quantityDelta) : 0, type: "number", align: "right" },
      { key: "issued", label: "Issued", accessor: (m) => m.quantityDelta < 0 ? Math.abs(Number(m.quantityDelta)) : 0, type: "number", align: "right" },
      { key: "unitRate", label: "Rate (₹)", accessor: (m) => (Number(m.unitCost) || 0) / 100, type: "currency", align: "right" },
      { key: "runningBalance", label: "Running Balance", accessor: (m) => Number(m.runningBalance) || 0, type: "number", align: "right" },
      { key: "project", label: "Project / Task", accessor: (m) => m.project?.name || "—", type: "text" },
      { key: "creator", label: "Logged By", accessor: (m) => m.creator?.name || "Supervisor", type: "text" },
    ],
    []
  );

  const excelLedger = useExcelTable({
    data: entries,
    columns: ledgerColumns,
  });

  if (loading) {
    return (
      <Shell>
        <div className="space-y-4">
          <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

  const { material, currentBalance, totalReceived, totalIssued } = ledgerData;

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
              <h1 className="font-display text-xl sm:text-[26px] font-extrabold text-slate-900 tracking-tight flex items-center gap-2 flex-wrap">
                <span>{material.name}</span>
                <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-slate-200 text-slate-700 font-bold">
                  {material.sku}
                </span>
                {material.unitPrice ? (
                  <span className="font-semibold text-xs px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Rate: ₹{Number(material.unitPrice).toLocaleString("en-IN", { minimumFractionDigits: 2 })} / {material.unitCode}
                  </span>
                ) : null}
              </h1>
            </div>
          </div>

          {canPlaceOrder && (
            <button
              onClick={() => setShowPlaceOrderModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-sm transition self-start sm:self-auto cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>{t("order.placeOrderToVendor", "Place Order to Vendor")}</span>
            </button>
          )}
        </div>

        {orderFeedback && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
              orderFeedback.tone === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            <span>{orderFeedback.text}</span>
            <button onClick={() => setOrderFeedback(null)} className="p-0.5 rounded hover:bg-black/5">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

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
                  Current stock ({formatQuantity(currentBalance, material.unitCode)}) is below the required reserve ({formatQuantity(material.minStockQty, material.unitCode)}).
                </div>
              </div>
            </div>
            {canPlaceOrder && (
              <button
                onClick={() => setShowPlaceOrderModal(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shrink-0 shadow-sm flex items-center gap-1.5 transition cursor-pointer"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>{t("order.placeOrder", "Place Order Now")} &rarr;</span>
              </button>
            )}
          </div>
        )}

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Current Stock on Hand
            </span>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums tracking-tight leading-tight truncate">
              <span title={formatQuantity(currentBalance, material.unitCode)}>{formatCompactQuantity(currentBalance, material.unitCode)}</span>
            </div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-1">
              Verified Closing Stock
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Received to Date
            </span>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-emerald-600 mt-1 tabular-nums tracking-tight leading-tight truncate">
              <span title={formatQuantity(totalReceived, material.unitCode)}>{formatCompactQuantity(totalReceived, material.unitCode)}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">From vendor shipments</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Issued / Consumed
            </span>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-amber-600 mt-1 tabular-nums tracking-tight leading-tight truncate">
              <span title={formatQuantity(totalIssued, material.unitCode)}>{formatCompactQuantity(totalIssued, material.unitCode)}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Issued to site projects & tasks</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Unit Rate (Price)
            </span>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums tracking-tight leading-tight truncate">
              <span title={material.unitPrice ? `₹${Number(material.unitPrice).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : undefined}>{material.unitPrice ? formatCompactINR(Math.round(Number(material.unitPrice) * 100)) : "—"}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Standard rate per {material.unitCode}</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Minimum Threshold
            </span>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums tracking-tight leading-tight truncate">
              <span title={formatQuantity(material.minStockQty, material.unitCode)}>{formatCompactQuantity(material.minStockQty, material.unitCode)}</span>
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
                  {t("order.recentOrders", "Purchase Orders to Vendors")}
                </h2>
                <p className="text-xs text-slate-500">
                  Material orders sent to suppliers with WhatsApp and Email tracking.
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
                <span>{t("order.placeOrder", "New Order")}</span>
              </button>
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No purchase orders placed for this material yet. Click &ldquo;New Order&rdquo; above to send an order to a supplier.
            </div>
          ) : (
            <div className="overflow-hidden">
              <ExcelTableToolbar
                table={excelOrders}
                columns={orderColumns}
                tableName="purchase orders"
                showSearch={true}
                showExport={true}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[650px]">
                  <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                    <tr>
                      {orderColumns.map((col) => (
                        <ExcelColumnHeader
                          key={col.key}
                          column={col}
                          table={excelOrders}
                          theme="darkHeader"
                        />
                      ))}
                      <th className="py-3 px-4 text-right">Vendor Notification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {excelOrders.paginatedData.map((po: any) => (
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
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider inline-flex items-center gap-1 ${
                              po.status === "PENDING_APPROVAL"
                                ? "bg-amber-100 text-amber-900 border border-amber-300"
                                : po.status === "APPROVED"
                                ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                : po.status === "REJECTED"
                                ? "bg-rose-100 text-rose-900 border border-rose-300"
                                : po.status === "DELIVERED"
                                ? "bg-purple-100 text-purple-900 border border-purple-300"
                                : po.status === "CONFIRMED"
                                ? "bg-blue-100 text-blue-900 border border-blue-300"
                                : "bg-slate-100 text-slate-800 border border-slate-300"
                            }`}
                          >
                            {po.status === "PENDING_APPROVAL" && <Clock className="w-3 h-3 text-amber-700" />}
                            {po.status === "APPROVED" && <CheckCircle2 className="w-3 h-3 text-emerald-700" />}
                            {po.status === "REJECTED" && <XCircle className="w-3 h-3 text-rose-700" />}
                            <span>{po.status.replace("_", " ")}</span>
                          </span>
                          {po.status === "PENDING_APPROVAL" && (
                            <span className="text-[10px] text-amber-700 font-medium">
                              Awaiting Super Admin
                            </span>
                          )}
                          {po.approvedBy && (
                            <span className="text-[10px] text-slate-500 font-medium">
                              By: {po.approvedBy}
                            </span>
                          )}
                          {po.rejectionReason && (
                            <span className="text-[10px] text-rose-600 italic break-words whitespace-normal" title={po.rejectionReason}>
                              Reason: {po.rejectionReason}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {po.status === "PENDING_APPROVAL" ? (
                          currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ORG_ADMIN" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleApproveOrder(po)}
                                disabled={actionLoading === po.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-2xs disabled:opacity-50"
                                title="Approve purchase order and activate vendor notification"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{actionLoading === po.id ? "..." : "Approve"}</span>
                              </button>
                              <button
                                onClick={() => handleRejectOrder(po)}
                                disabled={actionLoading === po.id}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition disabled:opacity-50"
                                title="Decline purchase order"
                              >
                                <XCircle className="w-3 h-3" />
                                <span>Decline</span>
                              </button>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>Pending Approval</span>
                            </span>
                          )
                        ) : po.status === "REJECTED" ? (
                          <span className="text-xs text-rose-500 font-semibold italic">Declined</span>
                        ) : po.whatsappUrl ? (
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
                          <span className="text-xs text-slate-400 italic">Sent</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={excelOrders.currentPage}
              totalPages={excelOrders.totalPages}
              totalItems={excelOrders.filteredCount}
              totalUnfiltered={excelOrders.totalRecords}
              pageSize={excelOrders.pageSize}
              startItem={excelOrders.startItem}
              endItem={excelOrders.endItem}
              onPageChange={excelOrders.setCurrentPage}
              itemLabel="purchase orders"
            />
          </div>
          )}
        </div>

        {/* Chronological Stock Ledger Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-500" />
                <span>Complete Stock History</span>
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
            <div className="overflow-hidden">
              <ExcelTableToolbar
                table={excelLedger}
                columns={ledgerColumns}
                tableName="stock movements"
                showSearch={true}
                showExport={true}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[650px]">
                  <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                    <tr>
                      {ledgerColumns.map((col) => (
                        <ExcelColumnHeader
                          key={col.key}
                          column={col}
                          table={excelLedger}
                          theme="darkHeader"
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {excelLedger.paginatedData.map((m: any) => {
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
            <TablePagination
              currentPage={excelLedger.currentPage}
              totalPages={excelLedger.totalPages}
              totalItems={excelLedger.filteredCount}
              totalUnfiltered={excelLedger.totalRecords}
              pageSize={excelLedger.pageSize}
              startItem={excelLedger.startItem}
              endItem={excelLedger.endItem}
              onPageChange={excelLedger.setCurrentPage}
              itemLabel="stock movements"
            />
          </div>
          )}
        </div>
      </div>

      {/* Modal: Approve / Reject Purchase Order */}
      {orderDialog && (
        <div
          className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setOrderDialog(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="font-bold text-slate-900 text-base">
                {orderDialog.type === "approve" ? "Approve Purchase Order" : "Reject Purchase Order"}
              </h3>
              <button
                type="button"
                onClick={() => setOrderDialog(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {orderDialog.type === "approve" ? (
              <>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Approve Purchase Order{" "}
                  <strong className="font-mono text-slate-900">{orderDialog.order.orderNumber}</strong> for{" "}
                  <strong className="text-slate-900">{orderDialog.order.material?.name || "material"}</strong> (
                  {orderDialog.order.quantity} {orderDialog.order.unitCode})? This confirms the order and activates
                  vendor WhatsApp/Email notification.
                </p>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setOrderDialog(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading === orderDialog.order.id}
                    onClick={() => executeOrderDialog()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg disabled:opacity-50"
                  >
                    {actionLoading === orderDialog.order.id ? "Approving..." : "Confirm & Approve"}
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={executeOrderDialog} className="space-y-3">
                <p className="text-xs text-slate-600">
                  Reason for declining Purchase Order{" "}
                  <strong className="font-mono text-slate-900">{orderDialog.order.orderNumber}</strong>.
                </p>
                <textarea
                  required
                  rows={3}
                  value={orderRejectReason}
                  onChange={(e) => setOrderRejectReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                />
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setOrderDialog(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading === orderDialog.order.id || !orderRejectReason.trim()}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg disabled:opacity-50"
                  >
                    {actionLoading === orderDialog.order.id ? "Declining..." : "Decline Order"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Interactive Place Order to Vendor Modal */}
      <PlaceOrderModal
        isOpen={showPlaceOrderModal && canPlaceOrder}
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
