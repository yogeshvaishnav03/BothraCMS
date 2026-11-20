"use client";

import { useEffect, useState, useMemo } from "react";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, TablePagination, ExcelColumn } from "@/components/ui/ExcelTable";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import { formatCurrency, formatQuantity, formatCompactNumber } from "@/lib/formatters";
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  Search,
  RefreshCw,
  CalendarDays,
  Sparkles,
  Database,
  ShoppingCart,
  Clock,
  Send,
  MessageSquare,
  Mail,
  Copy,
  Check,
  ExternalLink,
  X,
  Phone,
  Landmark,
  CreditCard,
  Wallet,
  Trash2,
} from "lucide-react";

interface Tenant {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  status: string;
  createdAt: string;
  stats: {
    usersCount: number;
    sitesCount: number;
    projectsCount: number;
    materialsCount: number;
    billsCount: number;
    auditEventsCount: number;
  };
}

export default function SuperAdminDashboardPage() {
  const { refreshUser } = useAppSession();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [totalTenants, setTotalTenants] = useState(0);
  const [activeTenants, setActiveTenants] = useState(0);
  const [suspendedTenants, setSuspendedTenants] = useState(0);
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedSummary, setSeedSummary] = useState<any>(null);
  const [seedCredentials, setSeedCredentials] = useState<{ password: string; emails: string[] } | null>(null);
  const [clearingData, setClearingData] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Order Approvals State
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [approvedNotification, setApprovedNotification] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  // Payment Approvals State
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // Unified non-blocking confirmation & reason prompt modal (iOS/Android WebView safe)
  const [adminDialog, setAdminDialog] = useState<
    | { kind: "approveOrder"; order: any }
    | { kind: "rejectOrder"; order: any }
    | { kind: "approvePayment"; payment: any }
    | { kind: "rejectPayment"; payment: any }
    | { kind: "toggleTenant"; orgId: string; nextStatus: string }
    | { kind: "seedDemo"; targetOrgId?: string; targetOrgName?: string }
    | null
  >(null);
  const [adminDialogReason, setAdminDialogReason] = useState("");

  useEffect(() => {
    if (!(adminDialog || approvedNotification)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAdminDialog(null);
        setApprovedNotification(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [adminDialog, approvedNotification]);

  useEffect(() => {
    refreshUser()
      .then((u) => {
        if (u) {
          setCurrentUser(u);
          const isAdminRole = u.role === "SUPER_ADMIN" || u.role === "ORG_ADMIN" || (u.role as string) === "ADMIN";
          if (isAdminRole) {
            if (u.role === "SUPER_ADMIN") {
              loadTenants();
            }
            loadPendingOrders();
            loadPendingPayments();
          } else {
            setLoading(false);
          }
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, [refreshUser]);

  async function loadTenants() {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/tenants");
      const json = await res.json();
      if (json.success) {
        setTenants(json.data.tenants || []);
        setTotalTenants(json.data.totalTenants || 0);
        setActiveTenants(json.data.activeTenants || 0);
        setSuspendedTenants(json.data.suspendedTenants || 0);
      } else {
        setErrorMsg(json.error?.message || "Could not load company list.");
      }
    } catch {
      setErrorMsg("Unable to connect while loading companies. Check your internet connection.");
    } finally {
      setLoading(false);
    }
  }

  async function loadPendingOrders() {
    setOrdersLoading(true);
    try {
      const res = await fetch("/api/orders?status=PENDING_APPROVAL&allTenants=true");
      const json = await res.json();
      if (json.success) {
        setPendingOrders(json.data || []);
      }
    } catch (e) {
      console.error("Failed to load pending order queries:", e);
    } finally {
      setOrdersLoading(false);
    }
  }

  function handleApproveOrder(order: any) {
    setAdminDialog({ kind: "approveOrder", order });
  }

  function handleRejectOrder(order: any) {
    setAdminDialogReason("Purchase order request declined");
    setAdminDialog({ kind: "rejectOrder", order });
  }

  async function loadPendingPayments() {
    setPaymentsLoading(true);
    try {
      const res = await fetch("/api/finance/payments?status=PENDING_APPROVAL&allTenants=true");
      const json = await res.json();
      if (json.success) {
        setPendingPayments(json.data || []);
      }
    } catch (e) {
      console.error("Failed to load pending payment queries:", e);
    } finally {
      setPaymentsLoading(false);
    }
  }

  function handleApprovePayment(payment: any) {
    setAdminDialog({ kind: "approvePayment", payment });
  }

  function handleRejectPayment(payment: any) {
    setAdminDialogReason("Payment request declined");
    setAdminDialog({ kind: "rejectPayment", payment });
  }

  function toggleTenantStatus(orgId: string, currentStatus: string) {
    const nextStatus = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setAdminDialogReason(`Administrative override by ${currentUser?.name || "Super Admin"}`);
    setAdminDialog({ kind: "toggleTenant", orgId, nextStatus });
  }

  function handleSeedDemoData(targetOrgId?: string, targetOrgName?: string) {
    setAdminDialog({ kind: "seedDemo", targetOrgId, targetOrgName });
  }

  async function executeAdminDialog(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!adminDialog) return;

    if (adminDialog.kind === "approveOrder") {
      const { order } = adminDialog;
      setAdminDialog(null);
      setActionLoading(order.id);
      setErrorMsg("");
      setSuccessMsg("");
      try {
        const res = await fetch(`/api/orders/${order.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: "Approved via Super Admin Console" }),
        });
        const json = await res.json();
        if (res.ok && json.success) {
          setSuccessMsg(`Order ${order.orderNumber} successfully approved!`);
          if (json.data?.notification) setApprovedNotification(json.data.notification);
          await loadPendingOrders();
        } else {
          setErrorMsg(json.error?.message || "Failed to approve order");
        }
      } catch {
        setErrorMsg("Network error approving order");
      } finally {
        setActionLoading(null);
      }
      return;
    }

    if (adminDialog.kind === "rejectOrder") {
      const reason = adminDialogReason.trim();
      if (!reason) return;
      const { order } = adminDialog;
      setAdminDialog(null);
      setActionLoading(order.id);
      setErrorMsg("");
      setSuccessMsg("");
      try {
        const res = await fetch(`/api/orders/${order.id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        const json = await res.json();
        if (res.ok && json.success) {
          setSuccessMsg(`Order ${order.orderNumber} declined.`);
          await loadPendingOrders();
        } else {
          setErrorMsg(json.error?.message || "Failed to reject order");
        }
      } catch {
        setErrorMsg("Network error rejecting order");
      } finally {
        setActionLoading(null);
      }
      return;
    }

    if (adminDialog.kind === "approvePayment") {
      const { payment } = adminDialog;
      const payeeName = payment.recipientName || payment.party?.name || "Recipient";
      const amountStr = (payment.amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });
      setAdminDialog(null);
      setActionLoading(payment.id);
      setErrorMsg("");
      setSuccessMsg("");
      try {
        const res = await fetch(`/api/finance/payments/${payment.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: "Approved and confirmed via Super Admin Console" }),
        });
        const json = await res.json();
        if (res.ok && json.success) {
          setSuccessMsg(json.data?.message || `Payment of ₹${amountStr} to ${payeeName} successfully approved!`);
          await loadPendingPayments();
        } else {
          setErrorMsg(json.error?.message || "Failed to approve payment");
        }
      } catch {
        setErrorMsg("Network error approving payment");
      } finally {
        setActionLoading(null);
      }
      return;
    }

    if (adminDialog.kind === "rejectPayment") {
      const reason = adminDialogReason.trim();
      if (!reason) return;
      const { payment } = adminDialog;
      const payeeName = payment.recipientName || payment.party?.name || "Recipient";
      setAdminDialog(null);
      setActionLoading(payment.id);
      setErrorMsg("");
      setSuccessMsg("");
      try {
        const res = await fetch(`/api/finance/payments/${payment.id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        const json = await res.json();
        if (res.ok && json.success) {
          setSuccessMsg(`Payment request to ${payeeName} declined.`);
          await loadPendingPayments();
        } else {
          setErrorMsg(json.error?.message || "Failed to reject payment");
        }
      } catch {
        setErrorMsg("Network error rejecting payment");
      } finally {
        setActionLoading(null);
      }
      return;
    }

    if (adminDialog.kind === "toggleTenant") {
      const reason = adminDialogReason.trim();
      if (!reason) return;
      const { orgId, nextStatus } = adminDialog;
      setAdminDialog(null);
      setActionLoading(orgId);
      setErrorMsg("");
      setSuccessMsg("");
      try {
        const res = await fetch("/api/admin/tenants", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId: orgId, status: nextStatus, reason }),
        });
        const json = await res.json();
        if (json.success) {
          setSuccessMsg(json.data.message || `Company status updated to ${nextStatus === "ACTIVE" ? "Active" : "Suspended"}`);
          loadTenants();
        } else {
          setErrorMsg(json.error?.message || "Could not update company status.");
        }
      } catch {
        setErrorMsg("Unable to connect while updating company status.");
      } finally {
        setActionLoading(null);
      }
      return;
    }

    const { targetOrgId } = adminDialog;
    setAdminDialog(null);
    setSeeding(true);
    setErrorMsg("");
    setSuccessMsg("");
    setSeedSummary(null);
    setSeedCredentials(null);

    try {
      const res = await fetch("/api/admin/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: targetOrgId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(data.data.message || "Sample company data added successfully!");
        setSeedSummary(data.data.summary);
        setSeedCredentials(data.data.demoCredentials || null);
        await loadTenants();
        await loadPendingOrders();
      } else {
        setErrorMsg(data.error?.message || "Could not load sample data.");
      }
    } catch (err: any) {
      setErrorMsg(`Network error: ${err.message || "Failed to seed demo data"}`);
    } finally {
      setSeeding(false);
    }
  }

  async function handleClearDemoData() {
    setShowClearConfirm(false);
    setClearingData(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch("/api/admin/clear-demo-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg("All demo data deleted successfully! The database is now completely clean for your manual data entry.");
        await loadTenants();
        await loadPendingOrders();
      } else {
        setErrorMsg(data.error || "Failed to clear demo data.");
      }
    } catch (err: any) {
      setErrorMsg(`Error: ${err.message || "Failed to clear demo data"}`);
    } finally {
      setClearingData(false);
    }
  }

  const handleCopyMessage = () => {
    if (approvedNotification?.message) {
      navigator.clipboard.writeText(approvedNotification.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const orderColumns: ExcelColumn<any>[] = useMemo(
    () => [
      {
        key: "orderNumber",
        label: "PO Number & Date",
        accessor: (o) => `${o.orderNumber} ${new Date(o.createdAt).toLocaleDateString("en-IN")}`,
        type: "text",
      },
      {
        key: "requester",
        label: "Requester",
        accessor: (o) => `${o.creator?.name || "Site Supervisor"} (${o.creator?.role || "USER"})`,
        type: "text",
      },
      {
        key: "site",
        label: "Site / Store",
        accessor: (o) => `${o.site?.name || "General Site"} ${o.store?.name ? `(${o.store.name})` : ""}`,
        type: "text",
      },
      {
        key: "material",
        label: "Material Details",
        accessor: (o) => o.material?.name || "Material",
        type: "text",
      },
      {
        key: "quantity",
        label: "Quantity",
        accessor: (o) => Number(o.quantity) || 0,
        type: "number",
        align: "right",
      },
      {
        key: "estimatedTotal",
        label: "Estimated Total",
        accessor: (o) => (Number(o.totalAmount || o.estimatedTotalCost) || 0) / 100,
        type: "currency",
        align: "right",
      },
      {
        key: "supplier",
        label: "Supplier / Vendor",
        accessor: (o) => o.vendor?.name || o.vendorName || "Market Vendor",
        type: "text",
      },
      {
        key: "query",
        label: "Reason for Request",
        accessor: (o) => o.approvalQuery || o.notes || "—",
        type: "text",
      },
    ],
    []
  );

  const excelOrders = useExcelTable({
    data: pendingOrders,
    columns: orderColumns,
  });

  const paymentColumns: ExcelColumn<any>[] = useMemo(
    () => [
      {
        key: "referenceNumber",
        label: "Ref & Date",
        accessor: (p) => `${p.referenceNumber} ${new Date(p.paymentDate || p.createdAt).toLocaleDateString("en-IN")}`,
        type: "text",
      },
      {
        key: "recipient",
        label: "Recipient / Payee",
        accessor: (p) => p.recipientName || p.party?.name || "Recipient",
        type: "text",
      },
      {
        key: "amount",
        label: "Amount",
        accessor: (p) => (Number(p.amount) || 0) / 100,
        type: "currency",
        align: "right",
      },
      {
        key: "payingAccount",
        label: "Paying Account (Source)",
        accessor: (p) => p.payingAccount || "Company Primary A/C",
        type: "text",
      },
      {
        key: "method",
        label: "Payment Method",
        accessor: (p) => p.method || "—",
        type: "text",
      },
      {
        key: "purpose",
        label: "Purpose / Reason",
        accessor: (p) => p.approvalQuery || p.notes || "—",
        type: "text",
      },
      {
        key: "requester",
        label: "Requester",
        accessor: (p) => p.creator?.name || "Finance Clerk",
        type: "text",
      },
    ],
    []
  );

  const excelAdminPayments = useExcelTable({
    data: pendingPayments,
    columns: paymentColumns,
  });

  if (loading) {
    return (
      <Shell>
        <div className="space-y-4">
          <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
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

  // Access Denied for Non-Admins
  const isAdminRole = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ORG_ADMIN" || (currentUser?.role as string) === "ADMIN";
  if (!isAdminRole) {
    return (
      <Shell>
        <div className="max-w-xl mx-auto my-12 bg-white rounded-2xl border border-rose-200 p-8 text-center shadow-lg space-y-4">
          <div className="w-14 h-14 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="font-display text-xl font-extrabold text-slate-900 tracking-tight">
            Administrator Access Required
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Only <span className="font-semibold text-rose-600">Administrator</span> accounts can open the
            Admin Approval Console and manage operations. Your account (
            <span className="font-semibold">{currentUser?.email}</span>) has the{" "}
            <span className="font-semibold">{currentUser?.role}</span> role.
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              &larr; Return to Workspace Dashboard
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-xs text-amber-600 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" /> Platform Admin
            </div>
            <h1 className="font-display text-xl sm:text-[26px] font-extrabold text-slate-900 tracking-tight mt-0.5">
              {currentUser?.role === "SUPER_ADMIN" ? "Super Admin Console" : "Admin Approval Console"}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Approve pending material purchase orders and payment disbursements for your organization.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <Link
              href="/chat"
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-amber-400 rounded-xl text-xs font-bold transition shadow-sm"
            >
              <MessageSquare className="w-4 h-4" /> Chat with Employees
            </Link>
            <Link
              href="/day-book"
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition shadow-sm"
            >
              <CalendarDays className="w-4 h-4" /> Open Day Book
            </Link>
            <button
              onClick={() => {
                loadPendingOrders();
                loadPendingPayments();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition shadow-sm"
            >
              <RefreshCw className="w-4 h-4" /> Refresh All
            </button>
          </div>
        </div>

        {/* Global Alert Messages */}
        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg("")} className="text-emerald-700 hover:text-emerald-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg("")} className="text-rose-700 hover:text-rose-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 1. ORDER APPROVAL QUERIES PANEL (HIGHLIGHTED SECTION) */}
        <div className="bg-white rounded-2xl border-2 border-amber-400/80 shadow-md overflow-hidden animate-in fade-in">
          <div className="p-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-white border-b border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 font-black flex items-center justify-center shadow-xs">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span>Purchase Orders Waiting for Approval</span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black">
                    {pendingOrders.length} Waiting for Approval
                  </span>
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Review material purchase orders requested by supervisors and storekeepers. Approving prepares the vendor notification.
                </p>
              </div>
            </div>

            <button
              onClick={loadPendingOrders}
              disabled={ordersLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-50 text-amber-900 rounded-lg text-xs font-bold transition shadow-2xs self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${ordersLoading ? "animate-spin" : ""}`} />
              <span>Refresh Orders</span>
            </button>
          </div>

          {ordersLoading ? (
            <div className="py-10 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <span>Loading pending purchase orders...</span>
            </div>
          ) : pendingOrders.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2.5">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="text-sm font-bold text-slate-900">All Purchase Orders Reviewed!</div>
              <div className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                There are no material purchase orders waiting for approval right now. New requests from your team will appear here.
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm min-h-[400px]">
              <ExcelTableToolbar
                table={excelOrders}
                columns={orderColumns}
                tableName="purchase orders"
                showSearch={true}
                showExport={true}
              />
              <div className="overflow-x-auto md:min-h-[400px]">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-slate-900 text-slate-200 uppercase font-semibold">
                    <tr>
                      {orderColumns.map((col) => (
                        <ExcelColumnHeader
                          key={col.key}
                          column={col}
                          table={excelOrders}
                          theme="darkHeader"
                        />
                      ))}
                      <th className="py-3 px-4 text-right">Decision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {excelOrders.paginatedData.map((o) => (
                    <tr key={o.id} className="hover:bg-amber-50/40 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-slate-900">{o.orderNumber}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {new Date(o.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{o.creator?.name || "Site Supervisor"}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {o.creator?.role || "USER"}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800">{o.site?.name || "General Site"}</div>
                        {o.store?.name && (
                          <div className="text-[10px] text-slate-500">Store: {o.store.name}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{o.material.name}</span>
                          <span className="font-mono text-[9px] bg-slate-100 text-slate-700 px-1 py-0.5 rounded border border-slate-300">
                            {o.material.sku}
                          </span>
                        </div>
                        {o.unitRate && (
                          <div className="text-[10px] text-slate-500">
                            Rate: ₹{(o.unitRate / 100).toFixed(2)} / {o.unitCode}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-slate-900 tabular-nums">
                        {formatQuantity(o.quantity, o.unitCode)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-amber-700 tabular-nums">
                        {o.totalAmount ? formatCurrency(o.totalAmount) : "—"}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{o.vendor.name}</div>
                        {o.vendor.phone && (
                          <div className="text-[10px] text-emerald-700 font-mono flex items-center gap-1">
                            <Phone className="w-3 h-3 text-emerald-600" />
                            <span>{o.vendor.phone}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="p-2 bg-amber-50 rounded border border-amber-200 text-[11px] text-amber-950 font-medium leading-snug">
                          {o.approvalQuery || o.notes || "Urgent material shortage requiring PO approval."}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleApproveOrder(o)}
                            disabled={actionLoading === o.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition disabled:opacity-50"
                            title="Approve purchase order and prepare vendor message"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{actionLoading === o.id ? "Approving..." : "Approve Order"}</span>
                          </button>
                          <button
                            onClick={() => handleRejectOrder(o)}
                            disabled={actionLoading === o.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition disabled:opacity-50"
                            title="Decline purchase order"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Decline</span>
                          </button>
                        </div>
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

        {/* Modal for Super Admin Approved Vendor Dispatch */}
        {/* Approved Order Vendor Notification Modal */}
        {approvedNotification && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto animate-fade-in"
            onClick={() => setApprovedNotification(null)}
          >
            <div
              className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[92dvh] flex flex-col overflow-hidden animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-emerald-800 to-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white leading-tight">Order Request Approved</h3>
                    <p className="text-[11px] text-emerald-200">Ready for WhatsApp Vendor Dispatch</p>
                  </div>
                </div>
                <button
                  onClick={() => setApprovedNotification(null)}
                  className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 flex-1 overflow-y-auto">
                {/* Target Vendor & WhatsApp Destination Highlight */}
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-xs space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-100 pb-2.5">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                        Target Vendor Full Name
                      </span>
                      <h4 className="text-base font-extrabold text-slate-900">
                        {approvedNotification.vendorName || "Vendor Name Unavailable"}
                      </h4>
                    </div>
                    {approvedNotification.vendorPhone ? (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-black shadow-xs">
                        <Phone className="w-3.5 h-3.5" />
                        <span>{approvedNotification.vendorPhone}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 font-semibold">
                        No phone registered
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-emerald-900">
                    <MessageSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      WhatsApp message will be shared to:{" "}
                      {approvedNotification.vendorPhone ? (
                        <strong className="font-bold underline decoration-emerald-500 text-emerald-950">
                          {approvedNotification.vendorPhone}
                        </strong>
                      ) : (
                        <span className="italic text-slate-500">None (phone number missing)</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Complete Order Details Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Order Details</span>
                    <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-slate-200 text-slate-800">
                      {approvedNotification.orderNumber || approvedNotification.order?.orderNumber || "PO"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Material</span>
                      <span className="font-bold text-slate-900 text-sm">
                        {approvedNotification.materialName || approvedNotification.order?.material?.name || "Material"}
                      </span>
                      {approvedNotification.materialSku && (
                        <span className="text-[10px] text-slate-500 block font-mono">
                          SKU: {approvedNotification.materialSku}
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[11px]">Quantity</span>
                      <span className="font-bold text-slate-900 text-sm">
                        {approvedNotification.quantity?.toLocaleString("en-IN") || approvedNotification.order?.quantity || "0"}{" "}
                        {approvedNotification.unitCode || approvedNotification.order?.unitCode || ""}
                      </span>
                    </div>

                    {(approvedNotification.unitRate || approvedNotification.order?.unitRate) && (
                      <div>
                        <span className="text-slate-400 block text-[11px]">Unit Rate</span>
                        <span className="font-bold text-slate-800">
                          ₹{((approvedNotification.unitRate || approvedNotification.order?.unitRate) / 100).toFixed(2)} / {approvedNotification.unitCode || approvedNotification.order?.unitCode}
                        </span>
                      </div>
                    )}

                    {(approvedNotification.totalAmount || approvedNotification.order?.totalAmount) && (
                      <div>
                        <span className="text-slate-400 block text-[11px]">Total Estimated Amount</span>
                        <span className="font-black text-emerald-700 text-sm">
                          ₹{((approvedNotification.totalAmount || approvedNotification.order?.totalAmount) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    <div>
                      <span className="text-slate-400 block text-[11px]">Delivery Location</span>
                      <span className="font-semibold text-slate-800">
                        {approvedNotification.deliveryLocation || approvedNotification.siteName || approvedNotification.order?.site?.name || "Main Site"}
                      </span>
                    </div>

                    {approvedNotification.expectedDeliveryDate && (
                      <div>
                        <span className="text-slate-400 block text-[11px]">Expected Delivery</span>
                        <span className="font-semibold text-slate-800">
                          {approvedNotification.expectedDeliveryDate}
                        </span>
                      </div>
                    )}

                    {approvedNotification.approvedBy && (
                      <div className="sm:col-span-2 pt-1 border-t border-slate-200/60 flex items-center gap-1.5 text-[11px] text-slate-600">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Approved by: <strong>{approvedNotification.approvedBy}</strong></span>
                      </div>
                    )}
                  </div>
                </div>

                {/* WhatsApp & Email Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {approvedNotification.whatsappUrl ? (
                    <a
                      href={approvedNotification.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition group"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Send WhatsApp ({approvedNotification.vendorPhone || "Vendor"})</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-70 group-hover:translate-x-0.5 transition-transform" />
                    </a>
                  ) : (
                    <div className="p-3 bg-slate-100 rounded-xl text-xs text-slate-500 text-center font-medium">
                      No vendor phone registered for WhatsApp
                    </div>
                  )}

                  {approvedNotification.mailtoUrl ? (
                    <a
                      href={approvedNotification.mailtoUrl}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md transition"
                    >
                      <Mail className="w-4 h-4" />
                      <span>Send Email to Vendor</span>
                    </a>
                  ) : (
                    <div className="p-3 bg-slate-100 rounded-xl text-xs text-slate-500 text-center font-medium">
                      No vendor email registered
                    </div>
                  )}
                </div>

                {/* Formatted Message Preview & Copy */}
                {approvedNotification.message && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
                      <span className="font-semibold">WhatsApp Message Preview:</span>
                      <button
                        type="button"
                        onClick={handleCopyMessage}
                        className="flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-bold"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Text</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="p-3 bg-slate-900 text-slate-200 rounded-xl text-[11px] font-mono max-h-40 overflow-y-auto whitespace-pre-wrap border border-slate-800">
                      {approvedNotification.message}
                    </pre>
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
                <span className="text-[11px] text-slate-500">
                  The purchase order has been approved in the system.
                </span>
                <button
                  type="button"
                  onClick={() => setApprovedNotification(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. PAYMENT APPROVAL QUERIES & CONFIRMATIONS PANEL */}
        <div className="bg-white rounded-2xl border-2 border-emerald-500/80 shadow-md overflow-hidden animate-in fade-in">
          <div className="p-4 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-white border-b border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center shadow-xs">
                <Landmark className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-black text-slate-900">
                    Payments Waiting for Approval
                  </h2>
                  <span className="inline-flex items-center text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-bold whitespace-nowrap shrink-0 shadow-2xs leading-normal">
                    {pendingPayments.length} Pending
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Approve payments to Vendors, Contractors, and Employees. Check the paying bank account and approve.
                </p>
              </div>
            </div>

            <button
              onClick={loadPendingPayments}
              disabled={paymentsLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-900 rounded-lg text-xs font-bold transition shadow-2xs self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${paymentsLoading ? "animate-spin" : ""}`} />
              <span>Refresh Payment Requests</span>
            </button>
          </div>

          {paymentsLoading ? (
            <div className="py-10 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span>Loading pending payments...</span>
            </div>
          ) : pendingPayments.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2.5">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="text-sm font-bold text-slate-900">All Payments Cleared!</div>
              <div className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                There are no vendor, contractor, or employee payments waiting for approval. When anyone records a payment, it will appear here for review and confirmation.
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm min-h-[400px]">
              <ExcelTableToolbar
                table={excelAdminPayments}
                columns={paymentColumns}
                tableName="payments"
                showSearch={true}
                showExport={true}
              />
              <div className="overflow-x-auto md:min-h-[400px]">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-slate-900 text-slate-200 uppercase font-semibold">
                    <tr>
                      {paymentColumns.map((col) => (
                        <ExcelColumnHeader
                          key={col.key}
                          column={col}
                          table={excelAdminPayments}
                          theme="darkHeader"
                        />
                      ))}
                      <th className="py-3 px-4 text-right">Decision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {excelAdminPayments.paginatedData.map((p) => {
                    const payee = p.recipientName || p.party?.name || "Recipient";
                    const rType = p.recipientType || (p.party?.type) || "VENDOR";
                    return (
                      <tr key={p.id} className="hover:bg-emerald-50/40 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold text-slate-900">{p.referenceNumber}</div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {new Date(p.paymentDate || p.createdAt).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{payee}</span>
                            <span
                              className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border whitespace-nowrap ${
                                rType === "EMPLOYEE"
                                  ? "bg-amber-50 text-amber-800 border-amber-300"
                                  : rType === "CONTRACTOR"
                                  ? "bg-purple-50 text-purple-800 border-purple-300"
                                  : rType === "OUT_OF_POCKET"
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                  : "bg-blue-50 text-blue-800 border-blue-300"
                              }`}
                            >
                              {rType === "OUT_OF_POCKET" ? "Cash Expense" : rType}
                            </span>
                          </div>
                          {p.party && (
                            <div className="text-[10px] text-slate-500">Saved Vendor / Contractor Account</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-emerald-700 text-sm tabular-nums">
                          ₹{(p.amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <Landmark className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>{p.payingAccount || "Company Primary Operating A/C"}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                            {p.method}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="p-2 bg-emerald-50/70 rounded border border-emerald-200 text-[11px] text-emerald-950 font-medium leading-snug">
                            {p.approvalQuery || p.notes || "Payment approval requested."}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{p.creator?.name || "Finance User"}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{p.creator?.role || "USER"}</div>
                          {p.organization?.name && (
                            <div className="text-[10px] text-slate-400">{p.organization.name}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleApprovePayment(p)}
                              disabled={actionLoading === p.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition disabled:opacity-50"
                              title="Approve payment from this bank or cash account"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{actionLoading === p.id ? "Approving..." : "Confirm & Approve"}</span>
                            </button>
                            <button
                              onClick={() => handleRejectPayment(p)}
                              disabled={actionLoading === p.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition disabled:opacity-50"
                              title="Decline payment request"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Decline</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={excelAdminPayments.currentPage}
              totalPages={excelAdminPayments.totalPages}
              totalItems={excelAdminPayments.filteredCount}
              totalUnfiltered={excelAdminPayments.totalRecords}
              pageSize={excelAdminPayments.pageSize}
              startItem={excelAdminPayments.startItem}
              endItem={excelAdminPayments.endItem}
              onPageChange={excelAdminPayments.setCurrentPage}
              itemLabel="payments"
            />
          </div>
          )}
        </div>

        {/* Unified Admin Action Confirmation / Reason Modal */}
        {adminDialog && (
          <div
            className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
            onClick={() => setAdminDialog(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto space-y-3 animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="font-bold text-slate-900 text-base">
                  {adminDialog.kind === "approveOrder"
                    ? "Approve Purchase Order"
                    : adminDialog.kind === "rejectOrder"
                    ? "Decline Purchase Order"
                    : adminDialog.kind === "approvePayment"
                    ? "Confirm & Approve Payment"
                    : adminDialog.kind === "rejectPayment"
                    ? "Decline Payment Request"
                    : adminDialog.kind === "toggleTenant"
                    ? `${adminDialog.nextStatus === "SUSPENDED" ? "Suspend Company" : "Activate Company"}`
                    : "Confirm Action"}
                </h3>
                <button
                  type="button"
                  onClick={() => setAdminDialog(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {(adminDialog.kind === "rejectOrder" ||
                adminDialog.kind === "rejectPayment" ||
                adminDialog.kind === "toggleTenant") ? (
                <form onSubmit={executeAdminDialog} className="space-y-3">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {adminDialog.kind === "rejectOrder"
                      ? `Enter a short reason for declining Purchase Order ${adminDialog.order.orderNumber}.`
                      : adminDialog.kind === "rejectPayment"
                      ? `Enter a short reason for declining payment to ${
                          adminDialog.payment.recipientName || adminDialog.payment.party?.name || "Recipient"
                        }.`
                      : `Enter a reason to ${adminDialog.nextStatus === "SUSPENDED" ? "suspend" : "reactivate"} this company.`}
                  </p>
                  <textarea
                    required
                    rows={3}
                    value={adminDialogReason}
                    onChange={(e) => setAdminDialogReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setAdminDialog(null)}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!adminDialogReason.trim()}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {adminDialog.kind === "approveOrder" ? (
                      <>
                        Approve Purchase Order <strong className="font-mono text-slate-900">{adminDialog.order.orderNumber}</strong> for{" "}
                        <strong className="text-slate-900">{adminDialog.order.material.name}</strong> ({adminDialog.order.quantity}{" "}
                        {adminDialog.order.unitCode})? This approves the order and prepares the vendor message.
                      </>
                    ) : adminDialog.kind === "approvePayment" ? (
                      <>
                        Confirm &amp; authorize payment of{" "}
                        <strong className="text-slate-900">
                          ₹{(adminDialog.payment.amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </strong>{" "}
                        to{" "}
                        <strong className="text-slate-900">
                          {adminDialog.payment.recipientName || adminDialog.payment.party?.name || "Recipient"}
                        </strong>{" "}
                        from <strong className="text-slate-800">{adminDialog.payment.payingAccount || "Company Account"}</strong>?
                      </>
                    ) : (
                      <>
                        Add sample sites, projects, stores, materials, vendors, attendance, tasks, and bills to{" "}
                        <strong className="text-slate-900">
                          {adminDialog.targetOrgName || "the platform demo environment"}
                        </strong>
                        ?
                      </>
                    )}
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setAdminDialog(null)}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => executeAdminDialog()}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg"
                    >
                      Confirm
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

      </div>
    </Shell>
  );
}
