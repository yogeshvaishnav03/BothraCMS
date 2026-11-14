"use client";

import { useEffect, useState, useMemo } from "react";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, TablePagination, ExcelColumn } from "@/components/ui/ExcelTable";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import { formatCurrency, formatQuantity, formatCompactNumber } from "@/lib/formatters";
import {
  ShieldAlert,
  Building,
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
          if (u.role === "SUPER_ADMIN") {
            loadTenants();
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

  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase())
  );

  const tenantColumns: ExcelColumn<any>[] = useMemo(
    () => [
      {
        key: "name",
        label: "Company Name",
        accessor: (t) => t.name,
        type: "text",
      },
      {
        key: "id",
        label: "Company ID",
        accessor: (t) => t.id,
        type: "text",
      },
      {
        key: "currency",
        label: "Currency",
        accessor: (t) => t.currency,
        type: "text",
      },
      {
        key: "usersCount",
        label: "Users",
        accessor: (t) => Number(t.stats.usersCount) || 0,
        type: "number",
        align: "right",
      },
      {
        key: "sitesProjects",
        label: "Sites & Projects",
        accessor: (t) => `${t.stats.sitesCount} sites, ${t.stats.projectsCount} projects`,
        type: "text",
      },
      {
        key: "status",
        label: "Status",
        accessor: (t) => t.status,
        type: "text",
        align: "center",
      },
    ],
    []
  );

  const excelTenants = useExcelTable({
    data: filteredTenants,
    columns: tenantColumns,
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

  // Access Denied for Non-Super Admins
  if (currentUser?.role !== "SUPER_ADMIN") {
    return (
      <Shell>
        <div className="max-w-xl mx-auto my-12 bg-white rounded-2xl border border-rose-200 p-8 text-center shadow-lg space-y-4">
          <div className="w-14 h-14 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="font-display text-xl font-extrabold text-slate-900 tracking-tight">
            Super Admin Access Required
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Only <span className="font-semibold text-rose-600">Super Admin</span> accounts can open the
            Super Admin Console and manage companies. Your account (
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
              Super Admin Console
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Approve orders and payments, manage companies, and configure system settings.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => handleSeedDemoData()}
              disabled={seeding || loading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50"
              title="Add sample sites, projects, materials, workers, bills, and attendance for testing"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              {seeding ? "Loading Sample Data..." : "Load Sample Data"}
            </button>
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
                loadTenants();
                loadPendingOrders();
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
        {approvedNotification && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto animate-fade-in"
            onClick={() => setApprovedNotification(null)}
          >
            <div
              className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="font-bold text-sm">Order Approved — Dispatch to Vendor</span>
                </div>
                <button
                  onClick={() => setApprovedNotification(null)}
                  className="p-1 text-slate-400 hover:text-white rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 flex-1 overflow-y-auto">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950">
                  <div className="font-bold">Super Admin Approval Recorded</div>
                  <div className="text-[11px] text-emerald-800 mt-0.5">
                    Vendor WhatsApp message and email have been prepared for{" "}
                    <strong>{approvedNotification.vendorName}</strong>.
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {approvedNotification.whatsappUrl ? (
                    <a
                      href={approvedNotification.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Send WhatsApp to Vendor</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                    </a>
                  ) : (
                    <div className="p-3 bg-slate-100 rounded-xl text-xs text-slate-500">
                      No vendor phone registered
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
                    <div className="p-3 bg-slate-100 rounded-xl text-xs text-slate-500">
                      No vendor email registered
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                    <span>Approved Order Summary Text:</span>
                    <button
                      type="button"
                      onClick={handleCopyMessage}
                      className="flex items-center gap-1 text-amber-600 hover:underline font-bold"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? "Copied!" : "Copy Text"}</span>
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-950 text-slate-200 rounded-lg text-[11px] font-mono max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {approvedNotification.message}
                  </pre>
                </div>

              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end shrink-0">
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

        
        {/* One-Click Demo Data Showcase Banner */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-5 rounded-2xl border border-slate-800 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
              <Sparkles className="w-4 h-4" /> Sample Testing Data
            </div>
            <h3 className="text-base font-bold text-white">
              Load Sample Company Data
            </h3>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Add sample construction records (2 sites, projects, material stock, vendor bills, worker attendance, and daily reports) so new users can explore safely.
            </p>
          </div>
          <button
            onClick={() => handleSeedDemoData()}
            disabled={seeding || loading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition disabled:opacity-50 shrink-0"
          >
            <Sparkles className="w-4 h-4 text-slate-950" />
            <span>{seeding ? "Loading Sample Data..." : "Load Sample Data"}</span>
          </button>
        </div>

        {/* Demo Data Seeding Summary Modal/Card */}
        {seedSummary && (
          <div className="bg-emerald-50 border border-emerald-300 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Sample Data Loaded</span>
              </div>
              <button onClick={() => setSeedSummary(null)} className="text-emerald-700 hover:text-emerald-900 text-xs">
                Dismiss
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-1">
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200 text-center">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Sites</div>
                <div className="text-base font-black text-slate-900">{seedSummary.sitesCreated} Sites</div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200 text-center">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Projects</div>
                <div className="text-base font-black text-slate-900">{seedSummary.projectsCreated} Projects</div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200 text-center">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Stores</div>
                <div className="text-base font-black text-slate-900">{seedSummary.storesCreated} Stores</div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200 text-center">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Materials</div>
                <div className="text-base font-black text-slate-900">{seedSummary.materialsCreated} Items</div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200 text-center">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Vendors &amp; Contractors</div>
                <div className="text-base font-black text-slate-900">{seedSummary.partiesCreated} Vendors</div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200 text-center">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Workers</div>
                <div className="text-base font-black text-slate-900">{seedSummary.workforceCreated} Workers</div>
              </div>
            </div>
          </div>
        )}

        {/* Global Telemetry KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Total Companies
              </span>
              <Building className="w-5 h-5 text-amber-500" />
            </div>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-2 tabular-nums tracking-tight leading-tight truncate" title={String(totalTenants)}>{formatCompactNumber(totalTenants)}</div>
            <div className="text-xs text-slate-500 mt-1">Companies set up on this workspace</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Active Companies
              </span>
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-emerald-600 mt-2 tabular-nums tracking-tight leading-tight truncate" title={String(activeTenants)}>{formatCompactNumber(activeTenants)}</div>
            <div className="text-xs text-slate-500 mt-1">Currently active and running</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
                Suspended Companies
              </span>
              <XCircle className="w-5 h-5 text-rose-500" />
            </div>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-rose-600 mt-2 tabular-nums tracking-tight leading-tight truncate" title={String(suspendedTenants)}>{formatCompactNumber(suspendedTenants)}</div>
            <div className="text-xs text-slate-500 mt-1">Temporarily paused (read-only access)</div>
          </div>
        </div>

        {/* Search & Directory Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search companies by name or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            </div>
            <div className="text-xs text-slate-500 font-semibold">
              Showing {filteredTenants.length} of {tenants.length} companies
            </div>
          </div>

          <ExcelTableToolbar
            table={excelTenants}
            columns={tenantColumns}
            tableName="companies"
            showSearch={true}
            showExport={true}
          />
          <div className="overflow-x-auto md:min-h-[400px]">
            <table className="w-full text-left text-xs min-w-[650px]">
              <thead className="bg-slate-900 text-slate-200 uppercase font-semibold">
                <tr>
                  {tenantColumns.map((col) => (
                    <ExcelColumnHeader
                      key={col.key}
                      column={col}
                      table={excelTenants}
                      theme="darkHeader"
                    />
                  ))}
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {excelTenants.filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No matching companies found.
                    </td>
                  </tr>
                ) : (
                  excelTenants.paginatedData.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-bold text-slate-900">{t.name}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">{t.id}</td>
                      <td className="py-3 px-4 font-bold text-slate-700">{t.currency}</td>
                      <td className="py-3 px-4">
                        <span className="flex items-center gap-1 font-semibold text-slate-700">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          {t.stats.usersCount}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 text-slate-600 font-medium">
                          <span>{t.stats.sitesCount} sites</span>
                          <span>&bull;</span>
                          <span>{t.stats.projectsCount} projects</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                            t.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              : "bg-rose-100 text-rose-800 border border-rose-200"
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleSeedDemoData(t.id, t.name)}
                            disabled={seeding || actionLoading === t.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 transition disabled:opacity-50"
                            title={`Add sample test records to ${t.name}`}
                          >
                            <Database className="w-3.5 h-3.5 text-amber-600" />
                            <span>Load Sample</span>
                          </button>
                          <button
                            onClick={() => toggleTenantStatus(t.id, t.status)}
                            disabled={actionLoading === t.id}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-50 ${
                              t.status === "ACTIVE"
                                ? "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                            }`}
                          >
                            {actionLoading === t.id
                              ? "Updating..."
                              : t.status === "ACTIVE"
                              ? "Suspend"
                              : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={excelTenants.currentPage}
            totalPages={excelTenants.totalPages}
            totalItems={excelTenants.filteredCount}
            totalUnfiltered={excelTenants.totalRecords}
            pageSize={excelTenants.pageSize}
            startItem={excelTenants.startItem}
            endItem={excelTenants.endItem}
            onPageChange={excelTenants.setCurrentPage}
            itemLabel="companies"
          />
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
                    : "Load Sample Data"}
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
