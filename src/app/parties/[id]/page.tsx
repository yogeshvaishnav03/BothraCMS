"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, ExcelColumn } from "@/components/ui/ExcelTable";
import Link from "next/link";
import { useParams } from "next/navigation";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatDate, formatQuantity, formatDateTime } from "@/lib/formatters";
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
} from "lucide-react";
import PlaceOrderModal from "@/components/materials/PlaceOrderModal";
import AttachmentManager from "@/components/attachments/AttachmentManager";
import AuditHistoryModal from "@/components/audit/AuditHistoryModal";
import { canUser } from "@/lib/permissions";

export default function PartyStatementPage() {
  const params = useParams();
  const partyId = params.id as string;

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [statementData, setStatementData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [showPlaceOrderModal, setShowPlaceOrderModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);

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
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setCurrentUser(res.data.user);
        }
      })
      .catch(() => {});
    loadStatementAndOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId]);

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
          <div className="grid grid-cols-3 gap-4">
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
          <div className="flex items-center gap-3">
            <Link
              href="/parties"
              className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 shadow-sm print:hidden"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-2">
                <span>{isContractor ? "Subcontractor Contract & Statement" : "Material Supplier Financial Statement"}</span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>{party.name}</span>
                <span
                  className={`font-mono text-xs px-2.5 py-0.5 rounded font-bold ${
                    isContractor ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {party.partyType}
                </span>
                {party.taxIdentifier && (
                  <span className="text-xs font-mono text-slate-500 font-medium">
                    (GSTIN: {party.taxIdentifier})
                  </span>
                )}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden self-start sm:self-auto">
            {isVendor && canPlaceOrder && (
              <button
                onClick={() => setShowPlaceOrderModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs shadow-sm transition cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Place Order to Vendor</span>
              </button>
            )}
            <button
              onClick={() => setShowAuditModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs shadow-sm transition"
              title="Audit & Version History"
            >
              <History className="w-4 h-4 text-indigo-600" />
              <span>Audit Log</span>
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition"
            >
              <Printer className="w-4 h-4" />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>

        {/* Contractor Contract Summary (if Contractor) */}
        {isContractor && contractVal > 0 && (
          <div className="bg-gradient-to-r from-purple-900 to-indigo-950 rounded-2xl p-5 text-white shadow-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-purple-800/60">
              <div>
                <div className="text-xs text-purple-300 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <HardHat className="w-4 h-4 text-amber-400" />
                  <span>Subcontractor Contract Milestone Tracking</span>
                </div>
                <div className="text-xl font-black mt-1">Sanctioned Value: {formatCurrency(contractVal)}</div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <div className="text-xs text-purple-300">Remaining Contract Balance</div>
                  <div className="text-lg font-bold text-amber-400">{formatCurrency(remainingContract)}</div>
                </div>
                <div>
                  <div className="text-xs text-purple-300">Work Billed %</div>
                  <div className="text-lg font-bold text-white">{billedPct}%</div>
                </div>
              </div>
            </div>

            {/* Progress Bars */}
            <div className="pt-3 space-y-2">
              <div className="flex justify-between text-xs text-purple-200">
                <span>Progress Billed: {formatCurrency(totalBilled)} ({billedPct}%)</span>
                <span>Payments Released: {formatCurrency(totalPaid)} ({paidPct}%)</span>
              </div>
              <div className="w-full h-3 bg-purple-950/60 rounded-full overflow-hidden flex">
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isContractor ? "Cumulative Work Certified / Billed" : "Total Invoiced Liability"}
            </span>
            <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
              {formatCurrency(totalBilled)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Sum of all posted bills ({bills.length} bills)
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Cumulative Amount Paid
            </span>
            <div className="text-2xl font-black text-emerald-600 mt-1 tabular-nums">
              {formatCurrency(totalPaid)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Disbursements released ({payments.length} payments)
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm bg-gradient-to-br from-amber-50/50 to-white">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
              Current Outstanding Balance
            </span>
            <div className="text-2xl font-black text-amber-600 mt-1 tabular-nums">
              {formatCurrency(outstandingBalance)}
            </div>
            <div className="text-[11px] text-amber-700 font-medium mt-1">
              Net balance payable = Total Billed − Total Paid
            </div>
          </div>
        </div>

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
                  {excelMaterialSummaries.filteredData.map((m, idx) => (
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
          </div>
        )}

        {/* Posted Bills Table */}
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
                  {excelBills.filteredData.map((b: any) => (
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
            </>
          )}
        </div>

        {/* Payments Register Table */}
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
                  {excelPayments.filteredData.map((p: any) => (
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
                          <span className="text-slate-400 italic">Unallocated</span>
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
            </>
          )}
        </div>

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
                <span>+ New Order</span>
              </button>
            </div>

            {orders.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No purchase orders placed with this vendor yet. Click &ldquo;+ New Order&rdquo; to place an order.
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
                    {excelOrders.filteredData.map((po: any) => (
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
                          {po.whatsappUrl ? (
                            <a
                              href={po.whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-bold transition shadow-2xs"
                              title="Send WhatsApp notification to vendor"
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
            <span className="text-xs text-slate-400 font-medium">Secured Storage Integration</span>
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
            title={`Audit History: ${party.name}`}
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
    </Shell>
  );
}
