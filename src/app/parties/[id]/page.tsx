"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, TablePagination, ExcelColumn } from "@/components/ui/ExcelTable";
import Link from "next/link";
import { useParams } from "next/navigation";
import Shell from "@/components/layout/Shell";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import { formatCurrency, formatCompactINR, formatDate, formatQuantity, formatDateTime, rupeesToPaise, paiseToRupees } from "@/lib/formatters";
import {
  Building2,
  ArrowLeft,
  DollarSign,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  CreditCard,
  FileText,
  Clock,
  Printer,
  ShoppingCart,
  MessageSquare,
  ExternalLink,
  HardHat,
  Truck,
  Paperclip,
  History,
  Package,
  Landmark,
  ShieldAlert,
  Plus,
  RotateCcw,
  X,
  Trash2,
  Tag,
} from "lucide-react";
import PlaceOrderModal from "@/components/materials/PlaceOrderModal";
import AttachmentManager from "@/components/attachments/AttachmentManager";
import AuditHistoryModal from "@/components/audit/AuditHistoryModal";
import { canUser } from "@/lib/permissions";
import OrderWhatsAppButtons from "@/components/whatsapp/OrderWhatsAppButtons";

export default function PartyStatementPage() {
  const params = useParams();
  const partyId = params.id as string;

  const { refreshUser } = useAppSession();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [statementData, setStatementData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [showPlaceOrderModal, setShowPlaceOrderModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);

  // Liquidated Damages modal state
  const [showDamageModal, setShowDamageModal] = useState(false);
  const [damageAmount, setDamageAmount] = useState("");
  const [damageType, setDamageType] = useState("DELAY");
  const [damageReason, setDamageReason] = useState("");
  const [damageRef, setDamageRef] = useState("");
  const [damageDate, setDamageDate] = useState(new Date().toISOString().slice(0, 10));
  const [damageProjectId, setDamageProjectId] = useState("");
  const [damageNotes, setDamageNotes] = useState("");
  const [damageSubmitting, setDamageSubmitting] = useState(false);
  const [damageError, setDamageError] = useState<string | null>(null);

  // Waive damage modal state
  const [waiveTarget, setWaiveTarget] = useState<any | null>(null);
  const [waiveReason, setWaiveReason] = useState("");
  const [waiveSubmitting, setWaiveSubmitting] = useState(false);

  const loadStatementAndOrders = () => {
    if (!partyId) return;
    fetch(`/api/parties/${partyId}/statement`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setStatementData(res.data);
        } else {
          setStatementData(null);
        }
      })
      .catch((err) => {
        console.error("Authoritative party statement load failed:", err);
        setStatementData(null);
      })
      .finally(() => setLoading(false));

    fetch(`/api/orders?vendorPartyId=${partyId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setOrders(res.data);
        }
      })
      .catch((err) => {
        console.error("Failed to load vendor purchase orders:", err);
      });
  };

  useEffect(() => {
    refreshUser()
      .then((u) => {
        if (u) setCurrentUser(u);
      })
      .catch(() => {});
    loadStatementAndOrders();
    fetch("/api/projects")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) setProjects(res.data);
        else if (Array.isArray(res)) setProjects(res);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId, refreshUser]);

  const handleDamageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(damageAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setDamageError("Please enter a valid deduction amount in ₹.");
      return;
    }
    setDamageSubmitting(true);
    setDamageError(null);
    try {
      const res = await fetch(`/api/parties/${partyId}/damages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: rupeesToPaise(parsedAmount),
          damageType,
          reason: damageReason.trim(),
          referenceNumber: damageRef.trim() || undefined,
          deductionDate: damageDate || undefined,
          projectId: damageProjectId || undefined,
          notes: damageNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDamageError(data.error?.message || "Failed to record liquidated damage deduction.");
        return;
      }
      setShowDamageModal(false);
      loadStatementAndOrders();
    } catch (err: any) {
      setDamageError(err.message || "Network error. Please try again.");
    } finally {
      setDamageSubmitting(false);
    }
  };

  const handleWaiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waiveTarget) return;
    if (!waiveReason.trim()) return;
    setWaiveSubmitting(true);
    try {
      const res = await fetch(`/api/parties/damages/${waiveTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waiveReason: waiveReason.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWaiveTarget(null);
        setWaiveReason("");
        loadStatementAndOrders();
      }
    } catch {
      // ignore
    } finally {
      setWaiveSubmitting(false);
    }
  };

  const bills = useMemo(() => statementData?.bills || [], [statementData]);
  const payments = useMemo(() => statementData?.payments || [], [statementData]);

  const materialSummaries = useMemo(() => {
    const map: Record<string, { description: string; qty: number; spend: number }> = {};
    bills.forEach((b: any) => {
      (b.lines || []).forEach((line: any) => {
        const key = line.materialId || line.description || "General Supply";
        if (!map[key]) {
          map[key] = {
            description: line.description || "General Material Supply",
            qty: 0,
            spend: 0,
          };
        }
        map[key].qty += line.quantity || 0;
        map[key].spend += line.lineTotal || 0;
      });
    });
    return Object.values(map);
  }, [bills]);

  const materialSummaryColumns: ExcelColumn<any>[] = useMemo(
    () => [
      { key: "description", label: "Material / Item Description", accessor: (m) => m.description, type: "text" },
      { key: "qty", label: "Cumulative Quantity", accessor: (m) => Number(m.qty) || 0, type: "number", align: "right" },
      { key: "spend", label: "Total Spend", accessor: (m) => (Number(m.spend) || 0) / 100, type: "currency", align: "right" },
    ],
    []
  );

  const excelMaterialSummaries = useExcelTable({
    data: materialSummaries,
    columns: materialSummaryColumns,
  });

  const billColumns: ExcelColumn<any>[] = useMemo(
    () => [
      { key: "billNumber", label: "Bill #", accessor: (b) => b.billNumber, type: "text" },
      { key: "billDate", label: "Bill Date", accessor: (b) => formatDate(b.billDate), type: "date" },
      { key: "dueDate", label: "Due Date", accessor: (b) => b.dueDate ? formatDate(b.dueDate) : "—", type: "date" },
      { key: "totalAmount", label: "Bill Total", accessor: (b) => (Number(b.totalAmount) || 0) / 100, type: "currency", align: "right" },
      { key: "paidAmount", label: "Amount Paid", accessor: (b) => (Number(b.paidAmount) || 0) / 100, type: "currency", align: "right" },
      { key: "outstandingAmount", label: "Pending Balance", accessor: (b) => (Number(b.outstandingAmount) || 0) / 100, type: "currency", align: "right" },
      { key: "status", label: "Status", accessor: (b) => b.outstandingAmount === 0 ? "PAID" : "PENDING", type: "text", align: "center" },
    ],
    []
  );

  const excelBills = useExcelTable({
    data: bills,
    columns: billColumns,
  });

  const paymentColumns: ExcelColumn<any>[] = useMemo(
    () => [
      { key: "paymentDate", label: "Payment Date", accessor: (p) => formatDate(p.paymentDate), type: "date" },
      { key: "methodRef", label: "Method / UTR #", accessor: (p) => `${p.method} ${p.referenceNumber || ""}`, type: "text" },
      { key: "payingAccount", label: "Paying Account", accessor: (p) => p.payingAccount || "Primary Operating A/C", type: "text" },
      { key: "allocatedTo", label: "Allocated To Bill", accessor: (p) => (p.allocations && p.allocations.length > 0) ? p.allocations.map((a: any) => `Bill #${a.bill?.billNumber || a.billId}`).join(", ") : "Unallocated", type: "text" },
      { key: "amount", label: "Payment Amount", accessor: (p) => (Number(p.amount) || 0) / 100, type: "currency", align: "right" },
      { key: "status", label: "Status", accessor: (p) => p.status, type: "text", align: "center" },
    ],
    []
  );

  const excelPayments = useExcelTable({
    data: payments,
    columns: paymentColumns,
  });

  const liquidatedDamages = useMemo(() => statementData?.liquidatedDamages || [], [statementData]);
  const totalDamagesDeducted = statementData?.totalDamagesDeducted || 0;

  const damageColumns: ExcelColumn<any>[] = useMemo(
    () => [
      { key: "deductionDate", label: "Date", accessor: (d) => formatDate(d.deductionDate), type: "date" },
      { key: "referenceNumber", label: "Notice / Ref #", accessor: (d) => d.referenceNumber || "—", type: "text" },
      { key: "project", label: "Project / Site", accessor: (d) => d.project?.name || "General / Head Office", type: "text" },
      { key: "damageType", label: "Category", accessor: (d) => d.damageType || "DELAY", type: "text" },
      { key: "reason", label: "Damage Assessment / Reason", accessor: (d) => d.reason, type: "text" },
      { key: "amount", label: "Deducted Amount", accessor: (d) => (Number(d.amount) || 0) / 100, type: "currency", align: "right" },
      { key: "status", label: "Status", accessor: (d) => d.status, type: "text", align: "center" },
    ],
    []
  );

  const excelDamages = useExcelTable({
    data: liquidatedDamages,
    columns: damageColumns,
  });

  const orderColumns: ExcelColumn<any>[] = useMemo(
    () => [
      { key: "orderNumber", label: "PO Number", accessor: (po) => po.orderNumber, type: "text" },
      { key: "createdAt", label: "Date Placed", accessor: (po) => formatDateTime(po.createdAt), type: "date" },
      { key: "material", label: "Material Item", accessor: (po) => po.material?.name || "Material", type: "text" },
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

  if (loading) {
    return (
      <Shell>
        <div className="space-y-4">
          <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-slate-200 rounded-xl animate-pulse" />
        </div>
      </Shell>
    );
  }

  if (!statementData) {
    return (
      <Shell>
        <div className="text-center py-12">
          <div className="text-base font-bold text-slate-700">Vendor / Contractor not found</div>
          <Link href="/parties" className="text-xs text-amber-600 font-semibold hover:underline mt-2 inline-block">
            ← Back to Directory
          </Link>
        </div>
      </Shell>
    );
  }

  const { party, totalBilled, totalPaid, outstandingBalance } = statementData;
  const isContractor = party.partyType === "CONTRACTOR" || party.partyType === "BOTH";
  const isVendor = party.partyType === "VENDOR" || party.partyType === "BOTH";

  // Contractor contract progress
  const contractVal = party.contractValue || 0;
  const billedPct = contractVal > 0 ? Math.min(100, Math.round((totalBilled / contractVal) * 100)) : 0;
  const paidPct = contractVal > 0 ? Math.min(100, Math.round((totalPaid / contractVal) * 100)) : 0;
  const remainingContract = Math.max(0, contractVal - totalBilled);

  const canReadFinance = canUser(currentUser, "finance:read");
  const canWriteFinance = canUser(currentUser, "finance:write");
  const canPlaceOrder =
    canUser(currentUser, "inventory:receipt") ||
    canUser(currentUser, "inventory:adjust") ||
    canUser(currentUser, "projects:write") ||
    ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "SITE_SUPERVISOR", "STOREKEEPER"].includes(currentUser?.role);

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header & Breadcrumb */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Link
              href="/parties"
              className="mt-0.5 p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 shadow-2xs shrink-0 print:hidden"
              aria-label="Back to Vendors and Contractors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                {isContractor ? "Subcontractor Contract & Statement" : "Material Supplier Financial Statement"}
              </div>
              <h1 className="font-display text-xl sm:text-[26px] font-extrabold text-slate-900 tracking-tight leading-snug mt-0.5">
                {party.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span
                  className={`font-mono text-[11px] px-2.5 py-0.5 rounded-md font-bold ring-1 ${
                    isContractor
                      ? "bg-amber-50 text-amber-800 ring-amber-200"
                      : "bg-slate-100 text-slate-700 ring-slate-200"
                  }`}
                >
                  {party.partyType}
                </span>
                {party.taxIdentifier && (
                  <span className="text-xs font-mono text-slate-500 font-medium">
                    GSTIN: {party.taxIdentifier}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden w-full sm:w-auto shrink-0">
            {canWriteFinance && (
              <button
                onClick={() => {
                  setDamageAmount("");
                  setDamageReason("");
                  setDamageRef(`LD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
                  setDamageDate(new Date().toISOString().slice(0, 10));
                  setDamageProjectId("");
                  setDamageNotes("");
                  setDamageError(null);
                  setShowDamageModal(true);
                }}
                className="flex-1 sm:flex-initial justify-center flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 font-bold rounded-xl text-xs shadow-sm transition whitespace-nowrap cursor-pointer"
                title="Deduct Liquidated Damages for delays or site damages"
              >
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                <span>Deduct Liquidated Damages</span>
              </button>
            )}
            {isVendor && canPlaceOrder && (
              <button
                onClick={() => setShowPlaceOrderModal(true)}
                className="flex-1 sm:flex-initial justify-center flex items-center gap-1.5 px-3.5 py-2 bg-gradient-brand hover:brightness-105 text-slate-950 font-bold rounded-xl text-xs shadow-sm transition cursor-pointer whitespace-nowrap"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>New Purchase Order</span>
              </button>
            )}
            {isVendor && (
              <Link
                href={`/material-pricing?vendor=${party.id}&view=vendor`}
                className="flex-1 sm:flex-initial justify-center flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs shadow-sm transition whitespace-nowrap"
                title="Materials this vendor sells and their rates compared with other vendors"
              >
                <Tag className="w-4 h-4 text-emerald-600" />
                <span>Material Price List</span>
              </Link>
            )}
            <button
              onClick={() => setShowAuditModal(true)}
              className="flex-1 sm:flex-initial justify-center flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs shadow-sm transition whitespace-nowrap"
              title="Change History"
            >
              <History className="w-4 h-4 text-amber-600" />
              <span>Change History</span>
            </button>
            {canReadFinance && (
              <Link
                href={`/exports?partyId=${party.id}`}
                className="flex-1 sm:flex-initial justify-center flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs shadow-sm transition whitespace-nowrap"
                title="Download Tally XML and GST / Bank spreadsheets for this party"
              >
                <Landmark className="w-4 h-4 text-emerald-600" />
                <span>Export Tally & GST</span>
              </Link>
            )}
            <button
              onClick={() => window.print()}
              className="flex-1 sm:flex-initial justify-center flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>

        {/* Contractor Contract Summary (if Contractor) */}
        {canReadFinance && isContractor && contractVal > 0 && (
          <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-slate-800 rounded-2xl p-4 sm:p-5 text-white shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-700/70">
              <div>
                <div className="text-[11px] text-amber-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
                  <HardHat className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Subcontractor Contract Milestone Tracking</span>
                </div>
                <div className="font-display text-lg sm:text-xl font-extrabold mt-1 tabular-nums text-white" title={formatCurrency(contractVal)}>
                  Contract Value: {formatCompactINR(contractVal)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:flex sm:items-center sm:gap-6 text-sm">
                <div>
                  <div className="text-xs text-slate-400">Remaining Contract Balance</div>
                  <div className="font-display text-lg sm:text-xl font-extrabold text-amber-400 tabular-nums mt-0.5" title={formatCurrency(remainingContract)}>
                    {formatCompactINR(remainingContract)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Work Billed %</div>
                  <div className="font-display text-lg sm:text-xl font-extrabold text-white tabular-nums mt-0.5">{billedPct}%</div>
                </div>
              </div>
            </div>

            {/* Progress Bars */}
            <div className="pt-3 space-y-2">
              <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-300">
                <span className="tabular-nums" title={formatCurrency(totalBilled)}>
                  Progress Billed: <strong className="text-white">{formatCompactINR(totalBilled)}</strong> ({billedPct}%)
                </span>
                <span className="tabular-nums whitespace-nowrap" title={formatCurrency(totalPaid)}>
                  Total Paid: <strong className="text-emerald-400">{formatCompactINR(totalPaid)}</strong> ({paidPct}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-800 border border-slate-700/60 rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${paidPct}%` }}
                  className="bg-emerald-400 h-full rounded-l-full"
                  title={`Paid: ${paidPct}%`}
                />
                <div
                  style={{ width: `${Math.max(0, billedPct - paidPct)}%` }}
                  className="bg-amber-400 h-full"
                  title={`Billed Unpaid: ${billedPct - paidPct}%`}
                />
              </div>
            </div>
          </div>
        )}

        {/* Financial Summary Cards */}
        {canReadFinance ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isContractor ? "Cumulative Work Certified / Billed" : "Total Billed (Liability)"}
            </span>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums tracking-tight leading-tight truncate">
              <span title={formatCurrency(totalBilled)}>{formatCompactINR(totalBilled)}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Sum of all posted bills ({bills.length} bills)
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Paid
            </span>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-emerald-600 mt-1 tabular-nums tracking-tight leading-tight truncate">
              <span title={formatCurrency(totalPaid)}>{formatCompactINR(totalPaid)}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Payments released ({payments.length} payments)
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-sm bg-gradient-to-br from-rose-50/60 to-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-800 uppercase tracking-wider">
                Damages Deducted
              </span>
              {canWriteFinance && (
                <button
                  onClick={() => {
                    setDamageAmount("");
                    setDamageReason("");
                    setDamageRef(`LD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
                    setDamageDate(new Date().toISOString().slice(0, 10));
                    setDamageProjectId("");
                    setDamageNotes("");
                    setDamageError(null);
                    setShowDamageModal(true);
                  }}
                  className="text-[10px] font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 px-2 py-0.5 rounded-md transition cursor-pointer"
                >
                  + Deduct
                </button>
              )}
            </div>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-rose-600 mt-1 tabular-nums tracking-tight leading-tight truncate">
              <span title={formatCurrency(totalDamagesDeducted)}>{formatCompactINR(totalDamagesDeducted)}</span>
            </div>
            <div className="text-[11px] text-rose-700 font-medium mt-1">
              {liquidatedDamages.filter((d: any) => d.status === "APPLIED").length} applied deduction(s)
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm bg-gradient-to-br from-amber-50/50 to-white">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
              Net Unpaid Balance
            </span>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-amber-600 mt-1 tabular-nums tracking-tight leading-tight truncate">
              <span title={formatCurrency(outstandingBalance)}>{formatCompactINR(outstandingBalance)}</span>
            </div>
            <div className="text-[11px] text-amber-700 font-medium mt-1">
              Net balance = Billed − Paid − Damages
            </div>
          </div>
        </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Financial figures, invoices, and payment records for this vendor/contractor are restricted to Finance and Admin accounts.</span>
          </div>
        )}

        {/* Material-wise Purchase Breakdown for Vendors */}
        {materialSummaries.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-600" />
                <span>Material Supply & Item-wise Breakdown</span>
              </h2>
              <span className="text-xs font-mono font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                {materialSummaries.length} Items
              </span>
            </div>
            <ExcelTableToolbar
              table={excelMaterialSummaries}
              columns={materialSummaryColumns}
              tableName="materials"
              showSearch={true}
              showExport={true}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    {materialSummaryColumns.map((col) => (
                      <ExcelColumnHeader
                        key={col.key}
                        column={col}
                        table={excelMaterialSummaries}
                        theme="darkHeader"
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {excelMaterialSummaries.paginatedData.map((m, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-bold text-slate-900">{m.description}</td>
                      <td className="py-3 px-4 text-right font-medium text-slate-700">
                        {m.qty > 0 ? m.qty.toLocaleString() : "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                        {formatCurrency(m.spend)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={excelMaterialSummaries.currentPage}
              totalPages={excelMaterialSummaries.totalPages}
              totalItems={excelMaterialSummaries.filteredCount}
              totalUnfiltered={excelMaterialSummaries.totalRecords}
              pageSize={excelMaterialSummaries.pageSize}
              startItem={excelMaterialSummaries.startItem}
              endItem={excelMaterialSummaries.endItem}
              onPageChange={excelMaterialSummaries.setCurrentPage}
              itemLabel="material items"
            />
          </div>
        )}

        {/* Posted Bills Table */}
        {canReadFinance && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Receipt className="w-4 h-4 text-blue-600" />
              <span>Posted Invoices & Work Bills</span>
            </h2>
            <span className="text-xs font-mono font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
              {bills.length} Bills
            </span>
          </div>

          {bills.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No bills posted for this party yet.
            </div>
          ) : (
            <>
              <ExcelTableToolbar
                table={excelBills}
                columns={billColumns}
                tableName="bills"
                showSearch={true}
                showExport={true}
              />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    {billColumns.map((col) => (
                      <ExcelColumnHeader
                        key={col.key}
                        column={col}
                        table={excelBills}
                        theme="darkHeader"
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {excelBills.paginatedData.map((b: any) => (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {b.billNumber}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {formatDate(b.billDate)}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {b.dueDate ? formatDate(b.dueDate) : "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-900 tabular-nums">
                        {formatCurrency(b.totalAmount)}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-emerald-600 tabular-nums">
                        {formatCurrency(b.paidAmount)}
                      </td>
                      <td className="py-3 px-4 text-right font-black tabular-nums">
                        <span className={b.outstandingAmount > 0 ? "text-amber-600" : "text-slate-400"}>
                          {formatCurrency(b.outstandingAmount)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {b.outstandingAmount === 0 ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            SETTLED
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                            PENDING
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={excelBills.currentPage}
              totalPages={excelBills.totalPages}
              totalItems={excelBills.filteredCount}
              totalUnfiltered={excelBills.totalRecords}
              pageSize={excelBills.pageSize}
              startItem={excelBills.startItem}
              endItem={excelBills.endItem}
              onPageChange={excelBills.setCurrentPage}
              itemLabel="bills"
            />
            </>
          )}
        </div>
        )}

        {/* Liquidated Damages Deductions Register Table */}
        {canReadFinance && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <span>Liquidated Damages &amp; Deductions Register</span>
                    <span className="text-xs font-mono font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded">
                      {liquidatedDamages.length} Records
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {party.liquidatedDamagesTerms
                      ? `Contract Clause: ${party.liquidatedDamagesTerms}${party.liquidatedDamagesPercent ? ` (Max Cap: ${party.liquidatedDamagesPercent}%)` : ""}`
                      : "Deduct money for contractual milestone delays, defective works, or damaged materials."}
                  </p>
                </div>
              </div>
              {canWriteFinance && (
                <button
                  onClick={() => {
                    setDamageAmount("");
                    setDamageReason("");
                    setDamageRef(`LD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
                    setDamageDate(new Date().toISOString().slice(0, 10));
                    setDamageProjectId("");
                    setDamageNotes("");
                    setDamageError(null);
                    setShowDamageModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs shadow-xs transition cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Deduct Damages</span>
                </button>
              )}
            </div>

            {liquidatedDamages.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No liquidated damages or penalty deductions recorded for this party yet.
                {canWriteFinance && (
                  <div className="mt-2">
                    <button
                      onClick={() => {
                        setDamageAmount("");
                        setDamageReason("");
                        setDamageRef(`LD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
                        setDamageDate(new Date().toISOString().slice(0, 10));
                        setDamageProjectId("");
                        setDamageNotes("");
                        setDamageError(null);
                        setShowDamageModal(true);
                      }}
                      className="text-xs text-rose-600 font-semibold hover:underline"
                    >
                      + Deduct money for damages or delay penalties
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <ExcelTableToolbar
                  table={excelDamages}
                  columns={damageColumns}
                  tableName="liquidated damages"
                  showSearch={true}
                  showExport={true}
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                      <tr>
                        {damageColumns.map((col) => (
                          <ExcelColumnHeader
                            key={col.key}
                            column={col}
                            table={excelDamages}
                            theme="darkHeader"
                          />
                        ))}
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {excelDamages.paginatedData.map((d: any) => (
                        <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 text-xs font-mono text-slate-600">
                            {formatDate(d.deductionDate)}
                          </td>
                          <td className="py-3 px-4 text-xs font-mono font-bold text-slate-900">
                            {d.referenceNumber || "—"}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-700">
                            {d.project?.name || "General / Head Office"}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <span className="font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200/60">
                              {d.damageType === "DELAY"
                                ? "Timeline Delay"
                                : d.damageType === "DEFECT"
                                ? "Quality Defect"
                                : d.damageType === "BREAKAGE"
                                ? "Site Breakage"
                                : d.damageType === "SAFETY"
                                ? "Safety Breach"
                                : d.damageType === "BREACH"
                                ? "Contract Breach"
                                : "Damages"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-800">
                            <div className="font-medium text-slate-900">{d.reason}</div>
                            {d.notes && <div className="text-[11px] text-slate-500 mt-0.5">{d.notes}</div>}
                            {d.waiveReason && (
                              <div className="text-[11px] text-amber-700 font-medium mt-0.5 italic">
                                Waived: {d.waiveReason}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-rose-600 tabular-nums">
                            −{formatCurrency(d.amount)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                d.status === "APPLIED"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-slate-100 text-slate-600 line-through"
                              }`}
                            >
                              {d.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {canWriteFinance && d.status === "APPLIED" && (
                              <button
                                onClick={() => {
                                  setWaiveTarget(d);
                                  setWaiveReason("");
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                                title="Waive or reverse this damage deduction"
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                                <span>Waive</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  currentPage={excelDamages.currentPage}
                  totalPages={excelDamages.totalPages}
                  totalItems={excelDamages.filteredCount}
                  totalUnfiltered={excelDamages.totalRecords}
                  pageSize={excelDamages.pageSize}
                  startItem={excelDamages.startItem}
                  endItem={excelDamages.endItem}
                  onPageChange={excelDamages.setCurrentPage}
                  itemLabel="damage deductions"
                />
              </>
            )}
          </div>
        )}

        {/* Payments Register Table */}
        {canReadFinance && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              <span>Payments & Settlements Register</span>
            </h2>
            <span className="text-xs font-mono font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
              {payments.length} Payments
            </span>
          </div>

          {payments.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No payments recorded for this party yet.
            </div>
          ) : (
            <>
              <ExcelTableToolbar
                table={excelPayments}
                columns={paymentColumns}
                tableName="payments"
                showSearch={true}
                showExport={true}
              />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    {paymentColumns.map((col) => (
                      <ExcelColumnHeader
                        key={col.key}
                        column={col}
                        table={excelPayments}
                        theme="darkHeader"
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {excelPayments.paginatedData.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-xs font-mono text-slate-600">
                        {formatDate(p.paymentDate)}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-bold text-slate-900">{p.method}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          Ref: {p.referenceNumber || "—"}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">
                        <div className="flex items-center gap-1">
                          <Landmark className="w-3.5 h-3.5 text-slate-400" />
                          <span>{p.payingAccount || "Primary Operating A/C"}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {p.allocations && p.allocations.length > 0 ? (
                          p.allocations.map((a: any) => (
                            <div key={a.id} className="font-mono">
                              Bill #{a.bill?.billNumber || a.billId} ({formatCurrency(a.amount)})
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-400 italic">Advance / General</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-emerald-600 tabular-nums">
                        {formatCurrency(p.amount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                            p.status === "POSTED"
                              ? "bg-emerald-100 text-emerald-800"
                              : p.status === "PENDING_APPROVAL"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={excelPayments.currentPage}
              totalPages={excelPayments.totalPages}
              totalItems={excelPayments.filteredCount}
              totalUnfiltered={excelPayments.totalRecords}
              pageSize={excelPayments.pageSize}
              startItem={excelPayments.startItem}
              endItem={excelPayments.endItem}
              onPageChange={excelPayments.setCurrentPage}
              itemLabel="payments"
            />
            </>
          )}
        </div>
        )}

        {/* Purchase Orders to this Vendor */}
        {isVendor && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-800 flex items-center justify-center font-bold">
                  <ShoppingCart className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-sm">
                    Material Supply Purchase Orders
                  </h2>
                  <p className="text-xs text-slate-500">
                    All supply orders placed with this vendor, complete with automated notification tracking.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPlaceOrderModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>New Order</span>
              </button>
            </div>

            {orders.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No purchase orders placed with this vendor yet. Click &ldquo;New Order&rdquo; to send a purchase order.
              </div>
            ) : (
              <>
                <ExcelTableToolbar
                  table={excelOrders}
                  columns={orderColumns}
                  tableName="purchase orders"
                  showSearch={true}
                  showExport={true}
                />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
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
                          <div className="font-bold text-slate-900">{po.material?.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{po.material?.sku}</div>
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
                          <OrderWhatsAppButtons po={po} onSent={loadStatementAndOrders} />
                          {po.whatsappUrl ? (
                            <a
                              href={po.whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-bold transition shadow-2xs"
                              title="Open WhatsApp on this device with the order typed in"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Phone</span>
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
              </>
            )}
          </div>
        )}

        {/* Documents, Agreements & Challans */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <Paperclip className="w-5 h-5 text-amber-500" />
              <h2 className="font-bold text-slate-900 text-base">
                {isContractor ? "Subcontractor Documents & Work Agreements" : "Vendor Documents, GST & Invoices"}
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">Vendor &amp; Contractor Documents</span>
          </div>

          <AttachmentManager
            entityType="PARTY"
            entityId={party.id}
            title={`${party.name} Files`}
            allowUpload={canWriteFinance}
            categoryDefault="INVOICE"
            highlightMissing={false}
          />
        </div>

        {/* Audit History Modal */}
        {showAuditModal && (
          <AuditHistoryModal
            entityType="PARTY"
            entityId={party.id}
            title={`Change History: ${party.name}`}
            onClose={() => setShowAuditModal(false)}
          />
        )}
      </div>

      {/* Place Order Modal */}
      {showPlaceOrderModal && canPlaceOrder && (
        <PlaceOrderModal
          isOpen={showPlaceOrderModal}
          onClose={() => setShowPlaceOrderModal(false)}
          onOrderPlaced={() => loadStatementAndOrders()}
        />
      )}

      {/* Deduct Liquidated Damages Modal */}
      {showDamageModal && canWriteFinance && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-100 bg-rose-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-slate-900 text-base">
                    Deduct Liquidated Damages
                  </h3>
                  <p className="text-xs text-slate-500 font-medium truncate">
                    {party.name} ({party.partyType})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDamageModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDamageSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {damageError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
                  {damageError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Deduction Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    placeholder="e.g. 25000"
                    value={damageAmount}
                    onChange={(e) => setDamageAmount(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-mono font-bold text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Damage Category *
                  </label>
                  <select
                    value={damageType}
                    onChange={(e) => setDamageType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  >
                    <option value="DELAY">Timeline / Milestone Delay (LD)</option>
                    <option value="DEFECT">Work Quality / Defect Rectification</option>
                    <option value="BREAKAGE">Material Breakage &amp; Site Damage</option>
                    <option value="SAFETY">Safety &amp; Compliance Violation</option>
                    <option value="BREACH">Contract Breach / Non-Performance</option>
                    <option value="OTHER">Other Contractual Damages</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Project / Site (Optional)
                  </label>
                  <select
                    value={damageProjectId}
                    onChange={(e) => setDamageProjectId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  >
                    <option value="">-- General / Head Office --</option>
                    {projects.map((proj) => (
                      <option key={proj.id} value={proj.id}>
                        {proj.name} {proj.code ? `(${proj.code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Deduction Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={damageDate}
                    onChange={(e) => setDamageDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Notice / Reference # (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. LD-2026-081 or NOTICE-04"
                  value={damageRef}
                  onChange={(e) => setDamageRef(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Damage Assessment / Reason *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. 14 days delay in completion of Phase 2 RCC slab casting beyond agreed contractual milestone"
                  value={damageReason}
                  onChange={(e) => setDamageReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Contract Clause / Additional Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. As per Clause 14.2 of Subcontract Agreement"
                  value={damageNotes}
                  onChange={(e) => setDamageNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs">
                ℹ️ <strong>Financial Impact:</strong> This deduction will directly decrease the outstanding payable balance for this party and be recorded permanently in the financial audit trail.
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDamageModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={damageSubmitting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm disabled:opacity-50 transition flex items-center gap-1.5"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>{damageSubmitting ? "Deducting..." : "Confirm & Deduct Damages"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Waive Damage Deduction Modal */}
      {waiveTarget && canWriteFinance && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 p-5 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-600" />
                <h3 className="font-display font-bold text-slate-900 text-base">
                  Waive Damage Deduction
                </h3>
              </div>
              <button onClick={() => setWaiveTarget(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs leading-relaxed">
              Are you sure you want to waive / cancel deduction <strong className="font-mono">#{waiveTarget.referenceNumber || waiveTarget.id}</strong> of <strong>{formatCurrency(waiveTarget.amount)}</strong>? This will restore the party&apos;s payable balance.
            </div>

            <form onSubmit={handleWaiveSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Reason for Waiving Deduction *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Contractor rectified defective casting at their own expense / Extension of Time (EOT) granted"
                  value={waiveReason}
                  onChange={(e) => setWaiveReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setWaiveTarget(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={waiveSubmitting}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-sm disabled:opacity-50 transition"
                >
                  {waiveSubmitting ? "Waiving..." : "Confirm Waive"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Shell>
  );
}
