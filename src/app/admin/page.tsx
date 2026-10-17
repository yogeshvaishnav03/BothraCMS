"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatQuantity } from "@/lib/formatters";
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
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Order Approvals State
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [approvedNotification, setApprovedNotification] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setCurrentUser(res.data.user);
          if (res.data.user.role === "SUPER_ADMIN") {
            loadTenants();
            loadPendingOrders();
          } else {
            setLoading(false);
          }
        }
      })
      .catch(() => setLoading(false));
  }, []);

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
        setErrorMsg(json.error?.message || "Failed to load tenant data");
      }
    } catch {
      setErrorMsg("Network error communicating with tenant administration service");
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

  async function handleApproveOrder(order: any) {
    const confirmed = confirm(
      `Approve Purchase Order ${order.orderNumber} for ${order.material.name} (${order.quantity} ${order.unitCode})?\n\nThis will confirm the order and activate vendor WhatsApp/Email notification.`
    );
    if (!confirmed) return;

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
        if (json.data?.notification) {
          setApprovedNotification(json.data.notification);
        }
        await loadPendingOrders();
      } else {
        setErrorMsg(json.error?.message || "Failed to approve order");
      }
    } catch {
      setErrorMsg("Network error approving order");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRejectOrder(order: any) {
    const reason = prompt(
      `Please provide rejection reason for Purchase Order ${order.orderNumber}:`,
      "Order query not approved at this time"
    );
    if (!reason) return;

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
        setSuccessMsg(`Order ${order.orderNumber} rejected.`);
        await loadPendingOrders();
      } else {
        setErrorMsg(json.error?.message || "Failed to reject order");
      }
    } catch {
      setErrorMsg("Network error rejecting order");
    } finally {
      setActionLoading(null);
    }
  }

  async function toggleTenantStatus(orgId: string, currentStatus: string) {
    const nextStatus = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const promptReason = prompt(
      `Please provide an administrative reason to change status to ${nextStatus}:`,
      `Administrative override by ${currentUser?.name || "Super Admin"}`
    );
    if (!promptReason) return;

    setActionLoading(orgId);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/admin/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          status: nextStatus,
          reason: promptReason,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSuccessMsg(json.data.message || `Tenant status updated to ${nextStatus}`);
        loadTenants();
      } else {
        setErrorMsg(json.error?.message || "Failed to change tenant status");
      }
    } catch {
      setErrorMsg("Network error updating tenant status");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSeedDemoData(targetOrgId?: string, targetOrgName?: string) {
    const orgLabel = targetOrgName ? `organization "${targetOrgName}"` : "the platform demo environment";
    const confirmed = confirm(
      `Populate full realistic demo data for ${orgLabel} in 1 click?\n\nThis will seed Sites, Projects, Stores, Materials, Vendors, Attendance, Tasks, and Bills.`
    );
    if (!confirmed) return;

    setSeeding(true);
    setErrorMsg("");
    setSuccessMsg("");
    setSeedSummary(null);

    try {
      const res = await fetch("/api/admin/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: targetOrgId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(data.data.message || "Demo data populated successfully!");
        setSeedSummary(data.data.summary);
        await loadTenants();
        await loadPendingOrders();
      } else {
        setErrorMsg(data.error?.message || "Failed to seed demo data");
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

  if (loading) {
    return (
      <Shell>
        <div className="space-y-4">
          <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
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

  // Access Denied for Non-Super Admins
  if (currentUser?.role !== "SUPER_ADMIN") {
    return (
      <Shell>
        <div className="max-w-xl mx-auto my-12 bg-white rounded-2xl border border-rose-200 p-8 text-center shadow-lg space-y-4">
          <div className="w-14 h-14 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            Restricted Platform Administration
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            The Super Admin dashboard and global tenant management controls require global{" "}
            <span className="font-mono font-bold text-rose-600">SUPER_ADMIN</span> credentials. Your
            account (<span className="font-semibold">{currentUser?.email}</span>) holds the role of{" "}
            <span className="font-semibold">{currentUser?.role}</span>.
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

  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Shell>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-xs text-amber-600 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" /> Global Platform Administration
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
              Super Admin Executive Console
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Order approval queries, multi-tenant isolation management, and global platform governance.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => handleSeedDemoData()}
              disabled={seeding || loading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50"
              title="Populate complete sample sites, projects, materials, workforce, bills and attendance in 1 click"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              {seeding ? "Populating Demo Data..." : "Add Demo Data (1-Click)"}
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
                  <span>Order Approval Queries & Confirmations</span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black">
                    {pendingOrders.length} Pending Super Admin Decision
                  </span>
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Review site material requisitions submitted by supervisors and storekeepers. Approve to dispatch vendor notification.
                </p>
              </div>
            </div>

            <button
              onClick={loadPendingOrders}
              disabled={ordersLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-50 text-amber-900 rounded-lg text-xs font-bold transition shadow-2xs self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${ordersLoading ? "animate-spin" : ""}`} />
              <span>Refresh Queries</span>
            </button>
          </div>

          {ordersLoading ? (
            <div className="py-10 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <span>Loading pending order queries...</span>
            </div>
          ) : pendingOrders.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2.5">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="text-sm font-bold text-slate-900">All Order Queries Cleared!</div>
              <div className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                There are no material purchase orders currently awaiting Super Admin approval. When any user places an order, it will appear here for review and confirmation.
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-200 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">PO Number & Date</th>
                    <th className="py-3 px-4">Requester</th>
                    <th className="py-3 px-4">Site / Store</th>
                    <th className="py-3 px-4">Material Details</th>
                    <th className="py-3 px-4 text-right">Quantity</th>
                    <th className="py-3 px-4 text-right">Estimated Total</th>
                    <th className="py-3 px-4">Supplier / Vendor</th>
                    <th className="py-3 px-4">Approval Query / Reason</th>
                    <th className="py-3 px-4 text-right">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingOrders.map((o) => (
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
                            title="Confirm & Approve order, activating vendor notification"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{actionLoading === o.id ? "Approving..." : "Approve & Dispatch"}</span>
                          </button>
                          <button
                            onClick={() => handleRejectOrder(o)}
                            disabled={actionLoading === o.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition disabled:opacity-50"
                            title="Reject order query"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal for Super Admin Approved Vendor Dispatch */}
        {approvedNotification && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
            onClick={() => setApprovedNotification(null)}
          >
            <div
              className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800">
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

              <div className="p-5 space-y-4">
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

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setApprovedNotification(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* One-Click Demo Data Showcase Banner */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-5 rounded-2xl border border-slate-800 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
              <Sparkles className="w-4 h-4" /> Instant Demo Environment
            </div>
            <h3 className="text-base font-bold text-white">
              One-Click Comprehensive Demo Data Generator
            </h3>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Instantly populate authoritative construction operations data: 2 active sites (Skyline Heights & Riverside Enclave), 2 projects, 4 material categories, stock receipts & balances, 4 vendor/contractor accounts with posted bills and payments, 5 workforce members with today&apos;s attendance register, and daily site reports.
            </p>
          </div>
          <button
            onClick={() => handleSeedDemoData()}
            disabled={seeding || loading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition disabled:opacity-50 shrink-0"
          >
            <Database className="w-4 h-4" />
            {seeding ? "Generating Demo Records..." : "Load Demo Data (1-Click)"}
          </button>
        </div>

        {seedSummary && (
          <div className="p-4 rounded-2xl bg-emerald-900/10 border border-emerald-300 text-emerald-950 text-xs shadow-sm">
            <div className="font-bold flex items-center gap-2 text-sm text-emerald-900 mb-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Demo Records Seeded for {seedSummary.organizationName}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
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
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Parties / Vendors</div>
                <div className="text-base font-black text-slate-900">{seedSummary.partiesCreated} Parties</div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200 text-center">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Workforce</div>
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
                Total Organizations
              </span>
              <Building className="w-5 h-5 text-amber-500" />
            </div>
            <div className="text-3xl font-black text-slate-900 mt-2">{totalTenants}</div>
            <div className="text-xs text-slate-500 mt-1">Total provisioned tenant databases</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Active Tenants
              </span>
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="text-3xl font-black text-emerald-600 mt-2">{activeTenants}</div>
            <div className="text-xs text-slate-500 mt-1">Operational with live site traffic</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
                Suspended Tenants
              </span>
              <XCircle className="w-5 h-5 text-rose-500" />
            </div>
            <div className="text-3xl font-black text-rose-600 mt-2">{suspendedTenants}</div>
            <div className="text-xs text-slate-500 mt-1">Temporarily locked from platform mutation</div>
          </div>
        </div>

        {/* Search & Directory Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search organizations by name or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            </div>
            <div className="text-xs text-slate-500 font-semibold">
              Showing {filteredTenants.length} of {tenants.length} organizations
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-200 uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Organization Name</th>
                  <th className="py-3 px-4">Tenant ID</th>
                  <th className="py-3 px-4">Currency</th>
                  <th className="py-3 px-4">Users</th>
                  <th className="py-3 px-4">Sites & Projects</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Administrative Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No matching organizations found.
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((t) => (
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
                            title={`Seed sample demo records for ${t.name}`}
                          >
                            <Database className="w-3.5 h-3.5 text-amber-600" />
                            <span>Seed Data</span>
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
        </div>
      </div>
    </Shell>
  );
}
