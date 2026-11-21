"use client";

import React, { useEffect, useState, useMemo } from "react";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { useActiveSite } from "@/hooks/useActiveSite";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import Link from "next/link";
import {
  Building2,
  FolderKanban,
  MapPin,
  User,
  Users,
  Search,
  CheckCircle2,
  Clock,
  RefreshCw,
  ExternalLink,
  Tag,
  Calendar,
  Layers,
  ChevronRight,
  ShieldCheck,
  Zap,
} from "lucide-react";

interface SiteItem {
  id: string;
  name: string;
  code: string;
  address: string;
  status: string;
  projects: Array<{
    id: string;
    name: string;
    code: string;
    status: string;
    budgetAmount: number;
    _count: { tasks: number; dailyReports: number };
  }>;
  stores?: Array<{ id: string; name: string }>;
  _count: {
    projects: number;
    workforceMembers: number;
    attendanceSessions: number;
  };
}

export default function SitesDirectoryPage() {
  const { session } = useAppSession();
  const { activeSiteId, setActiveSiteId } = useActiveSite();

  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [error, setError] = useState<string | null>(null);

  const fetchSites = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/sites?all=1");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load sites");
      }
      setSites(json.data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load sites directory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSites();
  }, []);

  // Compute deployment tag dynamically based on site code or role
  const getDeploymentTag = (site: SiteItem) => {
    const code = (site.code || "").toUpperCase();
    const name = (site.name || "").toUpperCase();

    if (name.includes("HEAD") || code.includes("HQ") || code.includes("CORP")) {
      return { label: "Headquarters (HQ)", color: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300" };
    }
    if (site.projects.length > 2) {
      return { label: "Active Mega Site", color: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300" };
    }
    if (site.status === "ACTIVE") {
      return { label: "Production Field Site", color: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300" };
    }
    return { label: "Staging / Planning", color: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300" };
  };

  const filteredSites = useMemo(() => {
    return sites.filter((s) => {
      if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
      const q = searchTerm.toLowerCase().trim();
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.projects.some((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
      );
    });
  }, [sites, searchTerm, statusFilter]);

  const handleSelectActiveSite = (siteId: string) => {
    setActiveSiteId(siteId === activeSiteId ? "" : siteId);
  };

  return (
    <Shell>
      <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <PageHeader
          title="Sites Directory & Deployment Tags"
          description="View enterprise worksites, project distribution, site deployment classifications, and switch your active operational site."
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Sites Directory" },
          ]}
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={fetchSites}
                disabled={loading}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              {activeSiteId && (
                <button
                  onClick={() => setActiveSiteId("")}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                >
                  Clear Active Site (Show All)
                </button>
              )}
            </div>
          }
        />

        {error && (
          <Alert variant="error" title="Notice" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Global Active Site Banner */}
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                Current Active Scope
              </div>
              <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                {activeSiteId ? (
                  <span>
                    {sites.find((s) => s.id === activeSiteId)?.name || "Selected Site"} (
                    {sites.find((s) => s.id === activeSiteId)?.code})
                  </span>
                ) : (
                  <span>All Accessible Worksites (Organization Scope)</span>
                )}
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Click &quot;Set as Active Scope&quot; on any site to filter all ERP views to that site.
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by site name, code, city, project..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Sites</option>
              <option value="ARCHIVED">Archived Sites</option>
            </select>
            <span className="text-xs text-slate-500 font-medium">
              Showing {filteredSites.length} of {sites.length} sites
            </span>
          </div>
        </div>

        {/* Sites Table (Desktop) & Cards (Mobile) */}
        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-amber-500 mb-3" />
            <p className="text-sm text-slate-500">Loading worksites and project deployments...</p>
          </div>
        ) : filteredSites.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center">
            <Building2 className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              No worksites found
            </h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
              No sites match your filter or search keywords.
            </p>
          </div>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider">
                    <th className="py-3 px-4">Site Name & Code</th>
                    <th className="py-3 px-4">Deployment Classification</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Linked Projects</th>
                    <th className="py-3 px-4 text-center">Workforce Crew</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Scope Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredSites.map((site) => {
                    const tag = getDeploymentTag(site);
                    const isCurrent = site.id === activeSiteId;

                    return (
                      <tr
                        key={site.id}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                          isCurrent ? "bg-amber-50/40 dark:bg-amber-950/20" : ""
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Building2 className={`w-4 h-4 ${isCurrent ? "text-amber-600" : "text-slate-400"}`} />
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {site.name}
                            </span>
                          </div>
                          <div className="text-xs font-mono text-slate-500 pl-6">
                            Code: {site.code}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${tag.color}`}
                          >
                            <Tag className="w-3 h-3" />
                            {tag.label}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 max-w-[220px]">
                          <div className="flex items-start gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <span className="truncate">{site.address}</span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            {site.projects.length === 0 ? (
                              <span className="text-xs text-slate-400 italic">No active projects</span>
                            ) : (
                              site.projects.slice(0, 2).map((p) => (
                                <Link
                                  key={p.id}
                                  href={`/projects/${p.id}`}
                                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                                >
                                  <FolderKanban className="w-3 h-3" />
                                  <span>{p.name}</span>
                                </Link>
                              ))
                            )}
                            {site.projects.length > 2 && (
                              <span className="text-[11px] text-slate-400">
                                +{site.projects.length - 2} more projects
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            {site._count?.workforceMembers || 0}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" />
                            {site.status}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleSelectActiveSite(site.id)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-2xs ${
                              isCurrent
                                ? "bg-amber-600 text-white hover:bg-amber-700"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200"
                            }`}
                          >
                            <Zap className="w-3.5 h-3.5" />
                            {isCurrent ? "Active Scope" : "Set Scope"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="block lg:hidden space-y-3">
              {filteredSites.map((site) => {
                const tag = getDeploymentTag(site);
                const isCurrent = site.id === activeSiteId;

                return (
                  <div
                    key={site.id}
                    className={`border rounded-xl p-4 shadow-xs space-y-3 ${
                      isCurrent
                        ? "bg-amber-50/30 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800"
                        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                          {site.name}
                        </h4>
                        <div className="text-xs font-mono text-slate-500">Code: {site.code}</div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${tag.color}`}
                      >
                        {tag.label}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{site.address}</span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-500 block">Projects</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {site.projects.length} Active
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Crew</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {site._count?.workforceMembers || 0} Registered
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Status</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {site.status}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                      {site.projects[0] ? (
                        <Link
                          href={`/projects/${site.projects[0].id}`}
                          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                        >
                          View Project &rarr;
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No projects</span>
                      )}

                      <button
                        onClick={() => handleSelectActiveSite(site.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          isCurrent
                            ? "bg-amber-600 text-white"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {isCurrent ? "Active Scope" : "Set Scope"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
