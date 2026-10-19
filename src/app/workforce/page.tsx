"use client";

import React, { useEffect, useState, useMemo } from "react";
import Shell from "@/components/layout/Shell";
import { formatDate, formatDateTime } from "@/lib/formatters";
import {
  Users,
  HardHat,
  Plus,
  Building2,
  Calendar,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  Trash2,
  Edit2,
  FileSpreadsheet,
  X,
  UserPlus,
  Briefcase,
  ChevronDown,
  UserCheck,
} from "lucide-react";
import { canUser } from "@/lib/permissions";

interface HeadcountRecord {
  id: string;
  organizationId: string;
  siteId: string;
  siteName: string;
  date: string;
  shift: "GENERAL" | "DAY" | "NIGHT";
  artisanCount: number;
  craftsmanCount: number;
  laborerMale: number;
  laborerFemale: number;
  laborerTotal: number;
  artisanTotal?: number;
  craftsmanTotal?: number;
  totalMale?: number;
  totalFemale?: number;
  grandTotal: number;
  contractorName?: string;
  notes?: string;
  supervisorId: string;
  supervisorName: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkerRosterItem {
  id: string;
  name: string;
  employeeCode: string;
  workerType: string;
  phone?: string;
  dailyWageRate?: number;
  defaultSite?: { id: string; name: string };
}

export default function WorkforcePage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [sites, setSites] = useState<any[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);

  const [activeTab, setActiveTab] = useState<"headcount" | "roster">("headcount");
  const [records, setRecords] = useState<HeadcountRecord[]>([]);
  const [workers, setWorkers] = useState<WorkerRosterItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal: Upload / Record Headcount
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [modalSiteId, setModalSiteId] = useState("");
  const [modalDate, setModalDate] = useState(new Date().toISOString().split("T")[0]);
  const [modalShift, setModalShift] = useState<"GENERAL" | "DAY" | "NIGHT">("GENERAL");

  // Headcount breakdown state: Direct counts for Artisan & Craftsman; Male & Female for Laborer
  const [artisanCount, setArtisanCount] = useState<number>(0);
  const [craftsmanCount, setCraftsmanCount] = useState<number>(0);
  const [laborerMale, setLaborerMale] = useState<number>(0);
  const [laborerFemale, setLaborerFemale] = useState<number>(0);
  const [contractorName, setContractorName] = useState("");
  const [notes, setNotes] = useState("");

  // Modal: Register Individual Worker
  const [showRegisterWorkerModal, setShowRegisterWorkerModal] = useState(false);
  const [workerName, setWorkerName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [workerType, setWorkerType] = useState("MASON");
  const [workerPhone, setWorkerPhone] = useState("");
  const [workerDailyWage, setWorkerDailyWage] = useState("");

  // Feedback states
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  const canWrite = canUser(currentUser, "attendance:write");

  // Calculate live totals for the modal form
  const modalLaborerTotal = laborerMale + laborerFemale;
  const modalGrandTotal = artisanCount + craftsmanCount + modalLaborerTotal;

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [authRes, sitesRes, headcountRes, workforceRes] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/sites", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/workforce/headcount", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/workforce", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      ]);

      if (authRes?.success && authRes.data?.user) {
        setCurrentUser(authRes.data.user);
      }

      if (sitesRes?.success && sitesRes.data) {
        const rawSites = sitesRes.data || [];
        setSites(rawSites);
        if (rawSites.length > 0 && !selectedSiteId) {
          setSelectedSiteId(rawSites[0].id);
          setModalSiteId(rawSites[0].id);
        }
      }

      if (headcountRes?.success) {
        setRecords(headcountRes.data || []);
      }

      if (workforceRes?.success) {
        setWorkers(workforceRes.data || []);
      }
    } catch (err: any) {
      console.error("Failed to load workforce data:", err);
      setErrorMessage("Failed to load workforce deployment data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openUploadModal = (existing?: HeadcountRecord) => {
    if (existing) {
      setModalSiteId(existing.siteId);
      setModalDate(existing.date);
      setModalShift(existing.shift);
      setArtisanCount(existing.artisanCount ?? existing.artisanTotal ?? 0);
      setCraftsmanCount(existing.craftsmanCount ?? existing.craftsmanTotal ?? 0);
      setLaborerMale(existing.laborerMale || 0);
      setLaborerFemale(existing.laborerFemale || 0);
      setContractorName(existing.contractorName || "");
      setNotes(existing.notes || "");
    } else {
      setModalSiteId(selectedSiteId || (sites.length > 0 ? sites[0].id : ""));
      setModalDate(selectedDate);
      setModalShift("GENERAL");
      setArtisanCount(0);
      setCraftsmanCount(0);
      setLaborerMale(0);
      setLaborerFemale(0);
      setContractorName("");
      setNotes("");
    }
    setShowUploadModal(true);
  };

  const handleHeadcountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalSiteId) {
      setErrorMessage("Please select a target site.");
      return;
    }

    if (modalGrandTotal === 0) {
      setErrorMessage("Please enter worker count for at least one category (Artisan, Craftsman, or Laborer).");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/workforce/headcount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: modalSiteId,
          date: modalDate,
          shift: modalShift,
          artisanCount,
          craftsmanCount,
          laborerMale,
          laborerFemale,
          contractorName: contractorName.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to save workforce count");
      } else {
        const siteName = sites.find((s) => s.id === modalSiteId)?.name || "Site";
        const saved = data.data;
        setStatusMessage(
          `Workforce count for ${siteName} on ${formatDate(modalDate)} saved! Total: ${saved.grandTotal} workers (Artisans: ${saved.artisanCount}, Craftsmen: ${saved.craftsmanCount}, Laborers: ${saved.laborerTotal} [${saved.laborerMale}M / ${saved.laborerFemale}F]).`
        );
        setShowUploadModal(false);
        await loadData();
      }
    } catch {
      setErrorMessage("Network error saving workforce headcount");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRecord = async (id: string, siteName: string, date: string) => {
    if (!confirm(`Are you sure you want to delete the workforce count for ${siteName} on ${formatDate(date)}?`)) return;

    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/workforce/headcount?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to delete record");
      } else {
        setStatusMessage(`Workforce headcount record deleted.`);
        await loadData();
      }
    } catch {
      setErrorMessage("Network error deleting record");
    }
  };

  // Register worker submit handler
  const handleRegisterWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerName.trim() || !employeeCode.trim()) {
      setErrorMessage("Worker name and employee code are required");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/workforce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workerName.trim(),
          employeeCode: employeeCode.trim(),
          workerType,
          phone: workerPhone.trim() || undefined,
          defaultSiteId: selectedSiteId || undefined,
          dailyWageRate: workerDailyWage ? parseFloat(workerDailyWage) : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to register worker");
      } else {
        setStatusMessage(`Worker ${data.data.name} (${data.data.employeeCode}) registered!`);
        setShowRegisterWorkerModal(false);
        setWorkerName("");
        setEmployeeCode("");
        setWorkerPhone("");
        setWorkerDailyWage("");
        await loadData();
      }
    } catch {
      setErrorMessage("Network error registering worker");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter records for the selected site
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (selectedSiteId && r.siteId !== selectedSiteId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const dateMatch = r.date.toLowerCase().includes(q);
        const siteMatch = r.siteName?.toLowerCase().includes(q) || false;
        const contractorMatch = r.contractorName?.toLowerCase().includes(q) || false;
        return dateMatch || siteMatch || contractorMatch;
      }
      return true;
    });
  }, [records, selectedSiteId, searchQuery]);

  // Selected site summary for today
  const selectedSiteTodayRecord = useMemo(() => {
    return records.find((r) => r.siteId === selectedSiteId && r.date === selectedDate);
  }, [records, selectedSiteId, selectedDate]);

  // Summary statistics for the site
  const siteTotalArtisan = filteredRecords.reduce((s, r) => s + (r.artisanCount ?? r.artisanTotal ?? 0), 0);
  const siteTotalCraftsman = filteredRecords.reduce((s, r) => s + (r.craftsmanCount ?? r.craftsmanTotal ?? 0), 0);
  const siteTotalLaborer = filteredRecords.reduce((s, r) => s + (r.laborerTotal ?? 0), 0);
  const siteLaborerMale = filteredRecords.reduce((s, r) => s + (r.laborerMale ?? 0), 0);
  const siteLaborerFemale = filteredRecords.reduce((s, r) => s + (r.laborerFemale ?? 0), 0);
  const siteGrandTotal = siteTotalArtisan + siteTotalCraftsman + siteTotalLaborer;

  const laborerMalePercent = siteTotalLaborer > 0 ? Math.round((siteLaborerMale / siteTotalLaborer) * 100) : 0;
  const laborerFemalePercent = siteTotalLaborer > 0 ? Math.round((siteLaborerFemale / siteTotalLaborer) * 100) : 0;

  const currentSelectedSite = sites.find((s) => s.id === selectedSiteId);

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Site Workforce Headcount</span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload and track daily site labour deployment of Artisans, Craftsmen, and Laborers (Male and Female) for a single site.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {canWrite && (
              <button
                onClick={() => openUploadModal()}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-sm transition transform active:scale-98 cursor-pointer"
                title="Supervisor: Upload daily site workforce count"
              >
                <Plus className="w-4 h-4" />
                <span>Upload Site Headcount</span>
              </button>
            )}

            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl transition shadow-2xs"
              title="Refresh workforce records"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-amber-500" : ""}`} />
            </button>
          </div>
        </div>

        {/* Feedback Alerts */}
        {statusMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Single Site Selector & Navigation Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 min-w-0">
            {/* Target Site Selector */}
            <div className="min-w-[220px]">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                Target Construction Site:
              </label>
              <div className="relative">
                <select
                  value={selectedSiteId}
                  onChange={(e) => setSelectedSiteId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code || "Site"})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date Filter */}
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                Report Date:
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            {/* Today's Site Status Tag */}
            <div className="self-end pb-1">
              {selectedSiteTodayRecord ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Today Logged: {selectedSiteTodayRecord.grandTotal} Workers</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-300 text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                  <span>Pending Today&apos;s Headcount</span>
                </div>
              )}
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs font-bold self-start md:self-auto">
            <button
              onClick={() => setActiveTab("headcount")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === "headcount"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Daily Site Headcount ({filteredRecords.length})
            </button>
            <button
              onClick={() => setActiveTab("roster")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === "roster"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Registered Workers ({workers.length})
            </button>
          </div>
        </div>

        {activeTab === "headcount" ? (
          <>
            {/* KPI Summary Cards for the Site */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              {/* Grand Total */}
              <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 rounded-2xl shadow-xs border border-slate-700">
                <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider">
                  Total Site Workforce
                </span>
                <div className="text-2xl font-black mt-1 tabular-nums">
                  {selectedSiteTodayRecord ? selectedSiteTodayRecord.grandTotal : siteGrandTotal}
                  <span className="text-xs font-normal text-slate-400 ml-1">workers</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {selectedSiteTodayRecord ? "Logged on site today" : "Cumulative logged count"}
                </div>
              </div>

              {/* Artisans Card */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Artisans (कारीगर)
                  </span>
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                </div>
                <div className="text-xl font-black text-slate-900 mt-1 tabular-nums">
                  {selectedSiteTodayRecord ? (selectedSiteTodayRecord.artisanCount ?? selectedSiteTodayRecord.artisanTotal ?? 0) : siteTotalArtisan}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-1 flex items-center gap-1.5">
                  <span className="text-amber-700 font-bold">Direct Count</span>
                  <span>&bull;</span>
                  <span>Skilled Trades</span>
                </div>
              </div>

              {/* Craftsmen Card */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Craftsmen (शिल्पकार)
                  </span>
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                </div>
                <div className="text-xl font-black text-slate-900 mt-1 tabular-nums">
                  {selectedSiteTodayRecord ? (selectedSiteTodayRecord.craftsmanCount ?? selectedSiteTodayRecord.craftsmanTotal ?? 0) : siteTotalCraftsman}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-1 flex items-center gap-1.5">
                  <span className="text-blue-700 font-bold">Direct Count</span>
                  <span>&bull;</span>
                  <span>Trade Technicians</span>
                </div>
              </div>

              {/* Laborers Card */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Laborers (मजदूर)
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                </div>
                <div className="text-xl font-black text-slate-900 mt-1 tabular-nums">
                  {selectedSiteTodayRecord ? selectedSiteTodayRecord.laborerTotal : siteTotalLaborer}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-1 flex items-center gap-1.5">
                  <span>M: {selectedSiteTodayRecord ? selectedSiteTodayRecord.laborerMale : siteLaborerMale}</span>
                  <span>&bull;</span>
                  <span>F: {selectedSiteTodayRecord ? selectedSiteTodayRecord.laborerFemale : siteLaborerFemale}</span>
                </div>
              </div>

              {/* Laborer Gender Split Card */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Laborer Gender Split
                </span>
                <div className="text-xl font-black text-purple-700 mt-1 tabular-nums">
                  {laborerMalePercent}% M / {laborerFemalePercent}% F
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-1">
                  Male: {selectedSiteTodayRecord ? selectedSiteTodayRecord.laborerMale : siteLaborerMale} &bull; Female: {selectedSiteTodayRecord ? selectedSiteTodayRecord.laborerFemale : siteLaborerFemale}
                </div>
              </div>
            </div>

            {/* Daily Headcount Deployment Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-black text-sm text-slate-900 tracking-tight flex items-center gap-2">
                    <HardHat className="w-4 h-4 text-amber-500" />
                    <span>Deployment Log: {currentSelectedSite?.name || "Single Site"}</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Supervisor daily trade count submissions with gender distribution and contractor reference.
                  </p>
                </div>

                <div className="relative min-w-[200px]">
                  <input
                    type="text"
                    placeholder="Search logs by date, contractor..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                </div>
              </div>

              {loading ? (
                <div className="p-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>Loading site workforce deployment...</span>
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="p-16 text-center max-w-sm mx-auto space-y-3">
                  <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                    <Users className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-bold text-slate-800">No Workforce Headcount Logged</div>
                  <div className="text-xs text-slate-500 leading-relaxed">
                    No workforce counts have been uploaded for {currentSelectedSite?.name || "this site"} yet.
                  </div>
                  {canWrite && (
                    <button
                      onClick={() => openUploadModal()}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-sm transition"
                    >
                      + Upload First Headcount
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-200 uppercase tracking-wider text-[10px] font-semibold">
                      <tr>
                        <th className="py-3 px-4">Date & Shift</th>
                        <th className="py-3 px-4">Artisan (Direct Count)</th>
                        <th className="py-3 px-4">Craftsman (Direct Count)</th>
                        <th className="py-3 px-4">Laborer (M / F / Total)</th>
                        <th className="py-3 px-4">Total Workforce</th>
                        <th className="py-3 px-4">Contractor / Agency</th>
                        <th className="py-3 px-4">Logged By</th>
                        {canWrite && <th className="py-3 px-4 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredRecords.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-bold text-slate-900">{formatDate(r.date)}</div>
                            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 font-bold text-slate-700">
                                {r.shift} SHIFT
                              </span>
                            </div>
                          </td>

                          {/* Artisan */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-bold text-slate-900 tabular-nums">
                              {r.artisanCount ?? r.artisanTotal ?? 0}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Direct Count
                            </div>
                          </td>

                          {/* Craftsman */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-bold text-slate-900 tabular-nums">
                              {r.craftsmanCount ?? r.craftsmanTotal ?? 0}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Direct Count
                            </div>
                          </td>

                          {/* Laborer */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-bold text-slate-800">{r.laborerTotal} total</div>
                            <div className="text-[10px] text-slate-500">
                              M: {r.laborerMale} &bull; F: {r.laborerFemale}
                            </div>
                          </td>

                          {/* Total Workforce */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-black font-mono text-xs border border-emerald-200">
                              {r.grandTotal} Workers
                            </span>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              A:{r.artisanCount ?? r.artisanTotal ?? 0} &bull; C:{r.craftsmanCount ?? r.craftsmanTotal ?? 0} &bull; L:{r.laborerTotal}
                            </div>
                          </td>

                          {/* Contractor */}
                          <td className="py-3.5 px-4 whitespace-nowrap text-slate-700">
                            {r.contractorName ? (
                              <span className="font-semibold text-slate-800">{r.contractorName}</span>
                            ) : (
                              <span className="text-slate-400 italic">Direct / Self</span>
                            )}
                            {r.notes && (
                              <div className="text-[10px] text-slate-500 truncate max-w-[150px]">
                                {r.notes}
                              </div>
                            )}
                          </td>

                          {/* Supervisor */}
                          <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                            <div className="font-semibold text-slate-800">{r.supervisorName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {new Date(r.updatedAt || r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </td>

                          {/* Actions */}
                          {canWrite && (
                            <td className="py-3.5 px-4 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => openUploadModal(r)}
                                  className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                                  title="Edit Headcount"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteRecord(r.id, r.siteName, r.date)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                  title="Delete Record"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          /* TAB 2: Registered Named Trade Workers Roster */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-black text-sm text-slate-900 tracking-tight flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-amber-500" />
                  <span>Registered Trade Workers Directory</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Named trade specialists registered with wage rates and employee codes.
                </p>
              </div>

              {canWrite && (
                <button
                  onClick={() => setShowRegisterWorkerModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold rounded-xl text-xs transition"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Register Worker</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-200 uppercase tracking-wider text-[10px] font-semibold">
                  <tr>
                    <th className="py-3 px-4">Name & Code</th>
                    <th className="py-3 px-4">Trade</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">Daily Wage Rate</th>
                    <th className="py-3 px-4">Default Site</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {workers.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{w.name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{w.employeeCode}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold font-mono">
                          {w.workerType}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">{w.phone || "—"}</td>
                      <td className="py-3 px-4 font-mono text-slate-800 font-bold">
                        {w.dailyWageRate ? `₹${w.dailyWageRate}/day` : "—"}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{w.defaultSite?.name || "Main Site"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Upload Site Workforce Headcount */}
        {showUploadModal && canWrite && (
          <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 my-8">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div>
                  <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                    <Users className="w-5 h-5 text-amber-500" />
                    <span>Upload Site Workforce Headcount</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Supervisor submission for Artisan, Craftsman, and Laborer counts on a single site.
                  </p>
                </div>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleHeadcountSubmit} className="space-y-4">
                {/* Site & Date Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Single Site: *
                    </label>
                    <select
                      value={modalSiteId}
                      onChange={(e) => setModalSiteId(e.target.value)}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    >
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Date: *
                    </label>
                    <input
                      type="date"
                      value={modalDate}
                      onChange={(e) => setModalDate(e.target.value)}
                      required
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Shift:
                    </label>
                    <select
                      value={modalShift}
                      onChange={(e) => setModalShift(e.target.value as any)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    >
                      <option value="GENERAL">General Shift</option>
                      <option value="DAY">Day Shift</option>
                      <option value="NIGHT">Night Shift</option>
                    </select>
                  </div>
                </div>

                {/* The 3 Categories (Artisan: Direct, Craftsman: Direct, Laborer: Male & Female) */}
                <div className="space-y-3">
                  {/* Category 1: Artisan (Direct Count) */}
                  <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200/80">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 font-black text-xs text-amber-950">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                        <span>1. Artisan (कारीगर / कुशल शिल्पी)</span>
                      </div>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                        Direct Count: {artisanCount}
                      </span>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">
                        Artisan Headcount (Direct Count):
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={artisanCount || ""}
                        placeholder="0"
                        onChange={(e) => setArtisanCount(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Category 2: Craftsman (Direct Count) */}
                  <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200/80">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 font-black text-xs text-blue-950">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                        <span>2. Craftsman (शिल्पकार / मिस्त्री / ट्रेडमैन)</span>
                      </div>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-blue-200 text-blue-900">
                        Direct Count: {craftsmanCount}
                      </span>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">
                        Craftsman Headcount (Direct Count):
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={craftsmanCount || ""}
                        placeholder="0"
                        onChange={(e) => setCraftsmanCount(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-white border border-blue-300 rounded-lg px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Category 3: Laborer (Male & Female) */}
                  <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200/80">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 font-black text-xs text-emerald-950">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                        <span>3. Laborer / Helper (मजदूर / बेलदार / हेल्पर)</span>
                      </div>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900">
                        Subtotal: {modalLaborerTotal}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">
                          Male Laborer (पुरुष):
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={laborerMale || ""}
                          placeholder="0"
                          onChange={(e) => setLaborerMale(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full bg-white border border-emerald-300 rounded-lg px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">
                          Female Laborer (महिला):
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={laborerFemale || ""}
                          placeholder="0"
                          onChange={(e) => setLaborerFemale(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full bg-white border border-emerald-300 rounded-lg px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Total Calculation Card */}
                <div className="p-3.5 bg-slate-900 text-white rounded-xl flex items-center justify-between shadow-sm">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-mono text-amber-400">
                      Total Calculated Site Workforce:
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5">
                      Artisan: <strong className="text-white">{artisanCount}</strong> &bull; Craftsman: <strong className="text-white">{craftsmanCount}</strong> &bull; Laborer: <strong className="text-white">{modalLaborerTotal}</strong> ({laborerMale}M / {laborerFemale}F)
                    </div>
                  </div>
                  <div className="text-2xl font-black font-mono text-emerald-400">
                    {modalGrandTotal} <span className="text-xs font-normal text-slate-300">workers</span>
                  </div>
                </div>

                {/* Optional Contractor & Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Contractor / Labour Agency (Optional):
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Apex Civil Contractors / Direct"
                      value={contractorName}
                      onChange={(e) => setContractorName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Work Details / Notes (Optional):
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Core wall casting and shuttering"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                        <span>Saving Count...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-slate-950" />
                        <span>Save Headcount</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Register Individual Worker */}
        {showRegisterWorkerModal && canWrite && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-amber-500" />
                  <span>Register Trade Specialist</span>
                </div>
                <button
                  onClick={() => setShowRegisterWorkerModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleRegisterWorker} className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                    Worker Full Name: *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Employee Code: *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={`WRK-${Date.now().toString().slice(-4)}`}
                      value={employeeCode}
                      onChange={(e) => setEmployeeCode(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Trade Category: *
                    </label>
                    <select
                      value={workerType}
                      onChange={(e) => setWorkerType(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    >
                      <option value="MASON">Mason</option>
                      <option value="CARPENTER">Carpenter</option>
                      <option value="ELECTRICIAN">Electrician</option>
                      <option value="PLUMBER">Plumber</option>
                      <option value="HELPER">Helper / Laborer</option>
                      <option value="FOREMAN">Foreman</option>
                      <option value="SITE_ENGINEER">Site Engineer</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Phone Number:
                    </label>
                    <input
                      type="text"
                      placeholder="+91 98765 43210"
                      value={workerPhone}
                      onChange={(e) => setWorkerPhone(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Daily Wage Rate (₹):
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 850"
                      value={workerDailyWage}
                      onChange={(e) => setWorkerDailyWage(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowRegisterWorkerModal(false)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold rounded-xl text-xs transition disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : "Register Worker"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
