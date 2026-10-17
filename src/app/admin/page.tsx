"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import {
  ShieldAlert,
  Building,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  FolderKanban,
  HardHat,
  Search,
  RefreshCw,
  CalendarDays,
  Sparkles,
  Database,
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

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setCurrentUser(res.data.user);
          if (res.data.user.role === "SUPER_ADMIN") {
            loadTenants();
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
      } else {
        setErrorMsg(data.error?.message || "Failed to seed demo data");
      }
    } catch (err: any) {
      setErrorMsg(`Network error: ${err.message || "Failed to seed demo data"}`);
    } finally {
      setSeeding(false);
    }
  }

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-xs text-amber-600 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" /> Global Platform Administration
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
              Super Admin Tenant Directory
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Multi-tenant isolation management, global telemetry, and organization state governance.
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
              href="/day-book"
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition shadow-sm"
            >
              <CalendarDays className="w-4 h-4" /> Open Day Book
            </Link>
            <button
              onClick={loadTenants}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition shadow-sm"
            >
              <RefreshCw className="w-4 h-4" /> Refresh Telemetry
            </button>
          </div>
        </div>

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

        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

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

        {errorMsg && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
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
