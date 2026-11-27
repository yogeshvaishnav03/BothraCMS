"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  X,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  User,
  CreditCard,
  DollarSign,
  Package,
  FileText,
  Paperclip,
  ExternalLink,
  Check,
  AlertCircle,
  RotateCcw,
  Send,
  Calendar,
  Phone,
  Layers,
  ShoppingBag,
  Ruler,
  HelpCircle,
  ArrowRight,
  Eye,
  Tag,
  MapPin,
  FileSpreadsheet,
  Download,
} from "lucide-react";
import { formatCurrency, formatDateTime, formatDate } from "@/lib/formatters";

export interface ApprovalItemDetails {
  referenceNumber?: string;
  createdAt?: string;
  notes?: string | null;
  approvalQuery?: string | null;
  rejectionReason?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  reviewedBy?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  reviewerComments?: string | null;
  creatorName?: string;
  creatorRole?: string;
  creatorEmail?: string;
  projectName?: string;
  projectCode?: string;
  siteName?: string;

  // Payment / Expense:
  recipientName?: string;
  recipientType?: string;
  partyType?: string;
  partyPhone?: string | null;
  paymentDate?: string;
  method?: string;
  payingAccount?: string | null;
  costHead?: string | null;
  currency?: string;
  attachments?: Array<{
    id: string;
    fileId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    url: string;
    category?: string;
  }>;
  bills?: Array<{
    id?: string;
    billNumber?: string;
    billDate?: string | null;
    totalRupees?: number;
    allocatedRupees?: number;
    costHead?: string | null;
  }>;

  // Purchase Order:
  orderNumber?: string;
  materialName?: string;
  materialSku?: string | null;
  vendorName?: string;
  vendorPhone?: string | null;
  vendorType?: string;
  quantity?: number;
  unitCode?: string;
  unitRateRupees?: number | null;
  totalAmountRupees?: number;
  deliveryLocation?: string;
  expectedDeliveryDate?: string | null;

  // Material Request:
  requestNumber?: string;
  priority?: string;
  neededBy?: string | null;
  reviewNote?: string | null;
  items?: Array<{
    id: string;
    description: string;
    sku?: string | null;
    quantity: number;
    approvedQty?: number | null;
    unitCode?: string;
    purchaseOrderNumber?: string | null;
  }>;

  // Measurement Change:
  requestType?: string;
  reason?: string;
  previousData?: any;
  proposedData?: any;
  contractorName?: string;
  entryName?: string;
  itemDescription?: string;
  measurementUnit?: string;
  measurementQty?: number;
  measurementRate?: number;
  measurementTotal?: number;
}

export interface ApprovalItem {
  id: string;
  type: "PAYMENT" | "EXPENSE" | "MATERIAL_REQUEST" | "MEASUREMENT_CHANGE" | "PURCHASE_ORDER";
  title: string;
  amountRupees: number;
  status: string;
  projectName: string;
  siteName: string;
  requestedBy: string;
  requestedByRole: string;
  rejectionReason: string | null;
  date: string;
  query?: string | null;
  details?: ApprovalItemDetails;
}

interface ApprovalDetailModalProps {
  item: ApprovalItem | null;
  isOpen: boolean;
  onClose: () => void;
  isApprover?: boolean;
  onApprove?: (item: ApprovalItem) => Promise<void> | void;
  onReject?: (item: ApprovalItem, reason?: string) => Promise<void> | void;
  onReRequest?: (item: ApprovalItem, note: string, amount?: number) => Promise<void> | void;
  actionLoading?: boolean;
}

export default function ApprovalDetailModal({
  item,
  isOpen,
  onClose,
  isApprover = false,
  onApprove,
  onReject,
  onReRequest,
  actionLoading = false,
}: ApprovalDetailModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isReRequesting, setIsReRequesting] = useState(false);
  const [reRequestNote, setReRequestNote] = useState("");
  const [reRequestAmount, setReRequestAmount] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsRejecting(false);
      setRejectReason("");
      setIsReRequesting(false);
      setReRequestNote(item?.query || item?.details?.approvalQuery || "");
      setReRequestAmount(item?.amountRupees ? String(item.amountRupees) : "");
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, item]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!mounted || !isOpen || !item) return null;

  const d = item.details;
  const isPending = item.status === "PENDING" || item.status === "PENDING_APPROVAL";
  const isApproved = item.status === "POSTED" || item.status === "APPROVED";
  const isRejected = item.status === "REJECTED";

  const getHeaderIcon = () => {
    switch (item.type) {
      case "PAYMENT":
        return <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      case "EXPENSE":
        return <CreditCard className="w-5 h-5 text-purple-600 dark:text-purple-400" />;
      case "PURCHASE_ORDER":
        return <ShoppingBag className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case "MATERIAL_REQUEST":
        return <Package className="w-5 h-5 text-amber-600 dark:text-amber-400" />;
      case "MEASUREMENT_CHANGE":
        return <Ruler className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />;
      default:
        return <FileText className="w-5 h-5 text-slate-600" />;
    }
  };

  const getPageLink = () => {
    switch (item.type) {
      case "PAYMENT":
      case "EXPENSE":
        return { href: "/day-book", label: "Open in Day Book" };
      case "PURCHASE_ORDER":
        return { href: "/material-requests", label: "Open in Material Requests" };
      case "MATERIAL_REQUEST":
        return { href: "/material-requests", label: "Open in Material Requests" };
      case "MEASUREMENT_CHANGE":
        return { href: "/measurement-book", label: "Open in Measurement Book" };
      default:
        return null;
    }
  };

  const pageLink = getPageLink();

  const formatFileSize = (bytes: number) => {
    if (!bytes) return "0 KB";
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0">
              {getHeaderIcon()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  {item.title}
                </h2>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    item.type === "PAYMENT"
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                      : item.type === "EXPENSE"
                      ? "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300"
                      : item.type === "PURCHASE_ORDER"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : item.type === "MATERIAL_REQUEST"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                      : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300"
                  }`}
                >
                  {item.type.replace(/_/g, " ")}
                </span>
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                <span>Ref: {d?.referenceNumber || d?.orderNumber || d?.requestNumber || item.id.slice(0, 10)}</span>
                <span>&bull;</span>
                <span>{formatDate(item.date)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                isApproved
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : isRejected
                  ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
              }`}
            >
              {isApproved ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : isRejected ? (
                <XCircle className="w-3.5 h-3.5" />
              ) : (
                <Clock className="w-3.5 h-3.5" />
              )}
              {item.status.replace(/_/g, " ")}
            </span>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs sm:text-sm">
          {/* Main Financial or Quantity Banner */}
          {item.amountRupees > 0 && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-200/80 dark:border-amber-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Total Requested Amount
                </span>
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                  ₹{item.amountRupees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {(d?.payingAccount || d?.method || d?.costHead) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {d.payingAccount && (
                    <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>{d.payingAccount}</span>
                    </span>
                  )}
                  {d.method && (
                    <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300">
                      Method: {d.method.replace(/_/g, " ")}
                    </span>
                  )}
                  {d.costHead && (
                    <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300">
                      Head: {d.costHead}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Justification / Note / Reason Card */}
          {(item.query || d?.approvalQuery || d?.notes) && (
            <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-xs text-amber-800 dark:text-amber-300">
                <HelpCircle className="w-4 h-4 shrink-0" />
                <span>Note / Reason / Justification Submitted:</span>
              </div>
              <p className="text-xs sm:text-sm pl-5 whitespace-pre-wrap leading-relaxed">
                {item.query || d?.approvalQuery || d?.notes}
              </p>
            </div>
          )}

          {/* Rejection Alert Box */}
          {isRejected && (item.rejectionReason || d?.rejectionReason) && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-xs text-rose-700 dark:text-rose-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Declined / Rejection Remarks:</span>
              </div>
              <p className="text-xs sm:text-sm pl-5 whitespace-pre-wrap leading-relaxed">
                {item.rejectionReason || d?.rejectionReason}
              </p>
            </div>
          )}

          {/* Core Overview Details Grid */}
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              <span>Request Information</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Target Project &amp; Site:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{item.siteName} &bull; {item.projectName}</span>
                </span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Requested By:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1 mt-0.5">
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{item.requestedBy} ({item.requestedByRole})</span>
                </span>
                {d?.creatorEmail && (
                  <span className="text-[11px] text-slate-500 block pl-4.5">{d.creatorEmail}</span>
                )}
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Submitted Date &amp; Time:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{formatDateTime(item.date)}</span>
                </span>
              </div>

              {(d?.recipientName || d?.vendorName) && (
                <div>
                  <span className="text-slate-400 block text-[11px]">Payee / Vendor / Party:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 block mt-0.5">
                    {d.recipientName || d.vendorName}
                    {(d.partyType || d.vendorType) && (
                      <span className="text-[10px] ml-1.5 font-semibold text-slate-500">
                        ({d.partyType || d.vendorType})
                      </span>
                    )}
                  </span>
                  {(d.partyPhone || d.vendorPhone) && (
                    <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3" />
                      <span>{d.partyPhone || d.vendorPhone}</span>
                    </span>
                  )}
                </div>
              )}

              {(d?.approvedBy || d?.reviewedBy || d?.reviewedByName) && (
                <div>
                  <span className="text-slate-400 block text-[11px]">Decision Made By:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block mt-0.5">
                    {d.approvedBy || d.reviewedBy || d.reviewedByName}
                  </span>
                  {(d.approvedAt || d.reviewedAt) && (
                    <span className="text-[11px] text-slate-500 block">
                      on {formatDateTime(d.approvedAt || d.reviewedAt)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Type-Specific: Material Request Items */}
          {item.type === "MATERIAL_REQUEST" && d?.items && d.items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" />
                  <span>Requested Items ({d.items.length})</span>
                </h3>
                {d.priority && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      d.priority === "URGENT"
                        ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    Priority: {d.priority}
                  </span>
                )}
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                    <tr>
                      <th className="p-2.5">Material Description</th>
                      <th className="p-2.5 text-right">Asked Qty</th>
                      <th className="p-2.5 text-right">Approved Qty</th>
                      <th className="p-2.5">Unit</th>
                      <th className="p-2.5">PO Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {d.items.map((it, idx) => (
                      <tr key={it.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="p-2.5 font-medium text-slate-900 dark:text-slate-100">
                          {it.description}
                          {it.sku && <span className="block text-[10px] text-slate-400">SKU: {it.sku}</span>}
                        </td>
                        <td className="p-2.5 text-right font-bold text-slate-900 dark:text-slate-100">
                          {it.quantity}
                        </td>
                        <td className="p-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {it.approvedQty !== null && it.approvedQty !== undefined ? it.approvedQty : "—"}
                        </td>
                        <td className="p-2.5 text-slate-600 dark:text-slate-400">{it.unitCode}</td>
                        <td className="p-2.5">
                          {it.purchaseOrderNumber ? (
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              PO: {it.purchaseOrderNumber}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Not Ordered</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Type-Specific: Purchase Order Details */}
          {item.type === "PURCHASE_ORDER" && (
            <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Purchase Order Specifications</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Material Name:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 block mt-0.5">
                    {d?.materialName || "Material"}
                  </span>
                  {d?.materialSku && (
                    <span className="text-[10px] text-slate-500">SKU: {d.materialSku}</span>
                  )}
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Quantity &amp; Rate:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 block mt-0.5">
                    {d?.quantity} {d?.unitCode}
                    {d?.unitRateRupees ? ` @ ₹${d.unitRateRupees.toFixed(2)}/${d.unitCode}` : ""}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Delivery Location:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block mt-0.5">
                    {d?.deliveryLocation || item.siteName}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Expected Delivery:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block mt-0.5">
                    {d?.expectedDeliveryDate ? formatDate(d.expectedDeliveryDate) : "—"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Type-Specific: Settled Bills / Invoices on Payment */}
          {(item.type === "PAYMENT" || item.type === "EXPENSE") && d?.bills && d.bills.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Settled Vendor Invoices / Bills ({d.bills.length})</span>
              </h3>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                    <tr>
                      <th className="p-2.5">Bill Number</th>
                      <th className="p-2.5">Bill Date</th>
                      <th className="p-2.5 text-right">Bill Total (₹)</th>
                      <th className="p-2.5 text-right">Settled in This Payment (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {d.bills.map((b, idx) => (
                      <tr key={b.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="p-2.5 font-bold text-slate-900 dark:text-slate-100">
                          {b.billNumber || "—"}
                        </td>
                        <td className="p-2.5 text-slate-600 dark:text-slate-400">
                          {b.billDate ? formatDate(b.billDate) : "—"}
                        </td>
                        <td className="p-2.5 text-right font-medium text-slate-800 dark:text-slate-200">
                          ₹{(b.totalRupees || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          ₹{(b.allocatedRupees || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Type-Specific: Measurement Change Details */}
          {item.type === "MEASUREMENT_CHANGE" && (
            <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Ruler className="w-3.5 h-3.5" />
                <span>Measurement Book Change Request</span>
              </h3>

              <div className="text-xs space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Item / Description:</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {d?.itemDescription || d?.entryName || "Measurement Entry"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Request Type:</span>
                    <span className="font-bold uppercase text-indigo-600 dark:text-indigo-400">
                      {d?.requestType || "UPDATE"}
                    </span>
                  </div>
                </div>

                {(d?.previousData || d?.proposedData) && (
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-white dark:bg-slate-900 text-[11px] space-y-1">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                      Proposed Changes:
                    </span>
                    <pre className="text-[10px] text-slate-600 dark:text-slate-400 overflow-x-auto p-2 bg-slate-50 dark:bg-slate-800 rounded">
                      {JSON.stringify(d.proposedData || d.previousData, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Attachments & Documents */}
          <div className="space-y-2">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5" />
              <span>Attachments &amp; Receipts ({d?.attachments?.length || 0})</span>
            </h3>

            {d?.attachments && d.attachments.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {d.attachments.map((att) => (
                  <a
                    key={att.id}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-amber-400 dark:hover:border-amber-500 bg-white dark:bg-slate-800 transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate block group-hover:text-amber-600 dark:group-hover:text-amber-400">
                          {att.fileName}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {formatFileSize(att.fileSize)}
                        </span>
                      </div>
                    </div>
                    <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-500 shrink-0" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No files or receipts attached to this request.</p>
            )}
          </div>
        </div>

        {/* Modal Footer / Actions */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col gap-3 shrink-0">
          {/* Re-request form (if expanding) */}
          {isReRequesting && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 space-y-2">
              <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                Resubmit Request for Approval
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {item.amountRupees > 0 && (
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 block mb-0.5">
                      Updated Amount (₹)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={reRequestAmount}
                      onChange={(e) => setReRequestAmount(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                )}
                <div className={item.amountRupees > 0 ? "sm:col-span-2" : "sm:col-span-3"}>
                  <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 block mb-0.5">
                    Explanation / Revised Details
                  </label>
                  <input
                    type="text"
                    value={reRequestNote}
                    onChange={(e) => setReRequestNote(e.target.value)}
                    placeholder="e.g. Revised quote attached / vendor agreed to discount"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsReRequesting(false)}
                  className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const parsedAmt = parseFloat(reRequestAmount);
                    onReRequest?.(item, reRequestNote, !isNaN(parsedAmt) && parsedAmt > 0 ? parsedAmt : undefined);
                  }}
                  disabled={actionLoading}
                  className="px-3 py-1 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition"
                >
                  {actionLoading ? "Submitting..." : "Confirm Resubmit"}
                </button>
              </div>
            </div>
          )}

          {/* Rejection input (if rejecting) */}
          {isRejecting && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 space-y-2">
              <div className="text-xs font-bold text-rose-900 dark:text-rose-200">
                Reason for Declining / Rejection
              </div>
              <input
                type="text"
                placeholder="Enter explanation for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                autoFocus
              />
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsRejecting(false)}
                  className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => onReject?.(item, rejectReason)}
                  disabled={actionLoading}
                  className="px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 transition"
                >
                  {actionLoading ? "Rejecting..." : "Confirm Rejection"}
                </button>
              </div>
            </div>
          )}

          {/* Action Row */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              {pageLink && (
                <Link
                  href={pageLink.href}
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                >
                  <span>{pageLink.label}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isApprover && isPending && !isRejecting && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsRejecting(true)}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onApprove?.(item)}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition disabled:opacity-50 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{actionLoading ? "Approving..." : "Approve"}</span>
                  </button>
                </>
              )}

              {isRejected && !isReRequesting && onReRequest && (
                <button
                  type="button"
                  onClick={() => setIsReRequesting(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Re-request Send</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
