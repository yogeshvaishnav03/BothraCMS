"use client";

import { Alert } from "@/components/ui/Alert";
import React, { useEffect, useState, useMemo, useRef } from "react";
import Shell from "@/components/layout/Shell";
import { ContactActions } from "@/components/ui/ContactActions";
import { formatDate, formatDateTime, formatCompactNumber } from "@/lib/formatters";
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
  Check,
} from "lucide-react";
import { canUser } from "@/lib/permissions";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, TablePagination, ExcelColumn } from "@/components/ui/ExcelTable";
import { useActiveSite } from "@/hooks/useActiveSite";
import { useAppSession } from "@/components/providers/AppSessionProvider";

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
  defaultSiteId?: string | null;
  defaultSite?: { id: string; name: string };
}

export default function WorkforcePage() {
  const { activeSiteId, setActiveSiteId } = useActiveSite();
  const { refreshUser, refreshSites } = useAppSession();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [sites, setSites] = useState<any[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);

  const [activeTab, setActiveTab] = useState<"headcount" | "roster">("headcount");
  const [records, setRecords] = useState<HeadcountRecord[]>([]);
  const [workers, setWorkers] = useState<WorkerRosterItem[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal: Upload / Record Headcount
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [modalSiteId, setModalSiteId] = useState("");
  const [modalProjectId, setModalProjectId] = useState<string>("");
  const [modalDate, setModalDate] = useState(new Date().toISOString().split("T")[0]);
  const [modalShift, setModalShift] = useState<"GENERAL" | "DAY" | "NIGHT">("GENERAL");

  const siteProjects = useMemo(() => {
    if (!modalSiteId) return [];
    return projects.filter((p) => p.siteId === modalSiteId);
  }, [projects, modalSiteId]);

  // Headcount breakdown state: Direct count for Artisan; Male & Female for Laborer
  const [artisanCount, setArtisanCount] = useState<number>(0);
  const [laborerMale, setLaborerMale] = useState<number>(0);
  const [laborerFemale, setLaborerFemale] = useState<number>(0);
  const [contractorName, setContractorName] = useState("");
  const [isCustomContractor, setIsCustomContractor] = useState(false);
  const [notes, setNotes] = useState("");

  const existingContractors = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.contractorName?.trim()) set.add(r.contractorName.trim());
    });
    set.add("Apex Civil Contractors");
    set.add("Direct Site Deployment / Company");
    return Array.from(set);
  }, [records]);

  const selectedWorker = useMemo(() => {
    if (!contractorName) return null;
    return workers.find(
      (w) =>
        contractorName.includes(w.employeeCode) ||
        contractorName.toLowerCase() === w.name.toLowerCase() ||
        contractorName === `${w.name} (${w.employeeCode})` ||
        contractorName === `${w.name} (${w.employeeCode} - ${w.workerType})`
    );
  }, [contractorName, workers]);

  // Searchable Contractor / Trade Worker Combobox state
  const [isContractorDropdownOpen, setIsContractorDropdownOpen] = useState(false);
  const [contractorSearchQuery, setContractorSearchQuery] = useState("");
  const contractorDropdownRef = useRef<HTMLDivElement>(null);

  // Close contractor dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      if (
        contractorDropdownRef.current &&
        !contractorDropdownRef.current.contains(event.target as Node)
      ) {
        setIsContractorDropdownOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const filteredWorkersForContractor = useMemo(() => {
    const q = contractorSearchQuery.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.employeeCode.toLowerCase().includes(q) ||
        w.workerType.toLowerCase().includes(q) ||
        (w.defaultSite?.name && w.defaultSite.name.toLowerCase().includes(q))
    );
  }, [workers, contractorSearchQuery]);

  const filteredContractorsList = useMemo(() => {
    const q = contractorSearchQuery.trim().toLowerCase();
    if (!q) return existingContractors;
    return existingContractors.filter((c) => c.toLowerCase().includes(q));
  }, [existingContractors, contractorSearchQuery]);

  const totalMatchingContractorOptions =
    filteredWorkersForContractor.length + filteredContractorsList.length;

  const handleSelectWorkerAsContractor = (w: any) => {
    const val = `${w.name} (${w.employeeCode} - ${w.workerType})`;
    setContractorName(val);
    setContractorSearchQuery("");
    setIsContractorDropdownOpen(false);
    setIsCustomContractor(false);
  };

  const handleSelectContractor = (c: string) => {
    setContractorName(c);
    setContractorSearchQuery("");
    setIsContractorDropdownOpen(false);
    setIsCustomContractor(false);
  };

  const handleSelectCustomContractor = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setContractorName(trimmed);
    setContractorSearchQuery("");
    setIsContractorDropdownOpen(false);
    setIsCustomContractor(true);
  };

  const handleClearContractor = () => {
    setContractorName("");
    setContractorSearchQuery("");
    setIsContractorDropdownOpen(false);
    setIsCustomContractor(false);
  };

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
  const [pendingDeleteRecord, setPendingDeleteRecord] = useState<{ id: string; siteName: string; date: string } | null>(null);

  useEffect(() => {
    if (!(showUploadModal || showRegisterWorkerModal || pendingDeleteRecord)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowUploadModal(false);
        setShowRegisterWorkerModal(false);
        setPendingDeleteRecord(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showUploadModal, showRegisterWorkerModal, pendingDeleteRecord]);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  const canWrite = canUser(currentUser, "attendance:write");

  // Calculate live totals for the modal form
  const modalLaborerTotal = laborerMale + laborerFemale;
  const modalGrandTotal = artisanCount + modalLaborerTotal;

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const ts = Date.now();
      const noCacheInit = {
        cache: "no-store" as RequestCache,
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      };
      const [authRes, sitesRes, headcountRes, workforceRes, projectsRes] = await Promise.all([
        refreshUser().then((user) => ({ success: Boolean(user), data: { user } })),
        refreshSites().then((data) => ({ success: true, data })),
        fetch(`/api/workforce/headcount?_t=${ts}`, noCacheInit).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/workforce?_t=${ts}`, noCacheInit).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/projects?_t=${ts}`, noCacheInit).then((r) => r.json()).catch(() => ({})),
      ]);

      if (authRes?.success && authRes.data?.user) {
        setCurrentUser(authRes.data.user);
      }

      if (sitesRes?.success && sitesRes.data) {
        const rawSites = sitesRes.data || [];
        setSites(rawSites);
        if (rawSites.length > 0 && !modalSiteId) {
          setModalSiteId(rawSites[0].id);
        }
      }

      if (projectsRes?.success && projectsRes.data) {
        setProjects(projectsRes.data || []);
      }

      if (headcountRes?.success) {
        setRecords(headcountRes.data || []);
      }

      if (workforceRes?.success) {
        setWorkers(workforceRes.data || []);
      }
    } catch (err: any) {
      console.error("Failed to load workforce data:", err);
      setErrorMessage("Failed to load worker deployment data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Synchronize workforce page with global active site filter
  useEffect(() => {
    setSelectedSiteId(activeSiteId || "");
    setSelectedProjectId("");
    if (activeSiteId) {
      setModalSiteId(activeSiteId);
    }
  }, [activeSiteId]);

  const openUploadModal = (existing?: HeadcountRecord) => {
    if (existing) {
      setModalSiteId(existing.siteId);
      setModalDate(existing.date);
      setModalShift(existing.shift);
      setArtisanCount(existing.artisanCount ?? existing.artisanTotal ?? 0);
      setLaborerMale(existing.laborerMale || 0);
      setLaborerFemale(existing.laborerFemale || 0);
      setContractorName(existing.contractorName || "");
      setNotes(existing.notes || "");
      setIsCustomContractor(false);
      setIsContractorDropdownOpen(false);
      setContractorSearchQuery("");

      if (existing.notes && existing.notes.includes("[Project: ")) {
        const match = existing.notes.match(/\[Project:\s*(.*?)(?:\s*\((.*?)\))?\]/);
        if (match) {
          const pName = match[1]?.trim().toLowerCase();
          const pCode = match[2]?.trim().toLowerCase();
          const found = projects.find(
            (p) =>
              p.siteId === existing.siteId &&
              ((pCode && p.code?.toLowerCase() === pCode) || (pName && p.name?.toLowerCase().includes(pName)))
          );
          if (found) setModalProjectId(found.id);
          else setModalProjectId("");
        } else {
          setModalProjectId("");
        }
      } else {
        setModalProjectId("");
      }
    } else {
      setModalSiteId(selectedSiteId || (sites.length > 0 ? sites[0].id : ""));
      setModalProjectId(selectedProjectId || "");
      setModalDate(selectedDate);
      setModalShift("GENERAL");
      setArtisanCount(0);
      setLaborerMale(0);
      setLaborerFemale(0);
      setContractorName("");
      setNotes("");
      setIsCustomContractor(false);
      setIsContractorDropdownOpen(false);
      setContractorSearchQuery("");
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
      setErrorMessage("Please enter worker count for at least one category (Artisan or Laborer).");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      let finalNotes = notes.trim();
      const selectedProj = siteProjects.find((p) => p.id === modalProjectId);
      if (selectedProj) {
        const projTag = `[Project: ${selectedProj.name} (${selectedProj.code})]`;
        if (!finalNotes.includes(projTag)) {
          finalNotes = finalNotes ? `${projTag} ${finalNotes}` : projTag;
        }
      }

      const res = await fetch("/api/workforce/headcount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: modalSiteId,
          projectId: modalProjectId || undefined,
          date: modalDate,
          shift: modalShift,
          artisanCount,
          craftsmanCount: 0,
          laborerMale,
          laborerFemale,
          contractorName: contractorName.trim() || undefined,
          notes: finalNotes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to save worker count");
      } else {
        const siteName = sites.find((s) => s.id === modalSiteId)?.name || "Site";
        const saved = data.data;
        setStatusMessage(
          `Worker count for ${siteName} on ${formatDate(modalDate)} saved! Total: ${saved.grandTotal} workers (Artisans: ${saved.artisanCount}, Laborers: ${saved.laborerTotal} [${saved.laborerMale}M / ${saved.laborerFemale}F]).`
        );
        setShowUploadModal(false);
        if (saved) {
          setSelectedSiteId(modalSiteId);
          setSelectedDate(modalDate);
          setRecords((prev) => {
            const normalized = {
              ...saved,
              siteName,
            };
            const remaining = prev.filter(
              (r) =>
                r.id !== saved.id &&
                !(r.siteId === saved.siteId && r.date === saved.date && r.shift === saved.shift)
            );
            return [normalized, ...remaining];
          });
        }
        await loadData();
      }
    } catch {
      setErrorMessage("Network error saving worker headcount");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRecord = (id: string, siteName: string, date: string) => {
    setPendingDeleteRecord({ id, siteName, date });
  };

  const executeDeleteRecord = async () => {
    if (!pendingDeleteRecord) return;
    const { id } = pendingDeleteRecord;
    setSubmitting(true);
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
        setStatusMessage(`Worker headcount record deleted.`);
        setRecords((prev) => prev.filter((r) => r.id !== id));
        await loadData();
      }
    } catch {
      setErrorMessage("Network error deleting record");
    } finally {
      setSubmitting(false);
      setPendingDeleteRecord(null);
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
          dailyWageRate: workerDailyWage ? Math.round(parseFloat(workerDailyWage) * 100) : undefined, // stored in paise
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
      if (selectedProjectId) {
        const proj = projects.find((p) => p.id === selectedProjectId);
        if (proj) {
          const matchCode = (proj.code || "").toLowerCase();
          const matchName = (proj.name || "").toLowerCase();
          const noteText = (r.notes || "").toLowerCase();
          if (!noteText.includes(matchCode) && !noteText.includes(matchName)) {
            return false;
          }
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const dateMatch = r.date.toLowerCase().includes(q);
        const siteMatch = r.siteName?.toLowerCase().includes(q) || false;
        const contractorMatch = r.contractorName?.toLowerCase().includes(q) || false;
        const notesMatch = r.notes?.toLowerCase().includes(q) || false;
        return dateMatch || siteMatch || contractorMatch || notesMatch;
      }
      return true;
    });
  }, [records, selectedSiteId, selectedProjectId, projects, searchQuery]);

  // Selected site summary for today
  const selectedSiteTodayRecord = useMemo(() => {
    return records.find((r) => r.siteId === selectedSiteId && r.date === selectedDate);
  }, [records, selectedSiteId, selectedDate]);

  // Summary statistics for the site
  const siteTotalArtisan = filteredRecords.reduce((s, r) => s + (r.artisanCount ?? r.artisanTotal ?? 0), 0);
  const siteTotalLaborer = filteredRecords.reduce((s, r) => s + (r.laborerTotal ?? 0), 0);
  const siteLaborerMale = filteredRecords.reduce((s, r) => s + (r.laborerMale ?? 0), 0);
  const siteLaborerFemale = filteredRecords.reduce((s, r) => s + (r.laborerFemale ?? 0), 0);
  const siteGrandTotal = siteTotalArtisan + siteTotalLaborer;

  const laborerMalePercent = siteTotalLaborer > 0 ? Math.round((siteLaborerMale / siteTotalLaborer) * 100) : 0;
  const laborerFemalePercent = siteTotalLaborer > 0 ? Math.round((siteLaborerFemale / siteTotalLaborer) * 100) : 0;

  const headcountColumns: ExcelColumn<any>[] = useMemo(
    () => [
      {
        key: "date",
        label: "Date & Shift",
        accessor: (r) => `${formatDate(r.date)} ${r.shift} SHIFT`,
        type: "text",
      },
      {
        key: "artisanCount",
        label: "Artisan (Direct Count)",
        accessor: (r) => Number(r.artisanCount ?? r.artisanTotal ?? 0),
        type: "number",
        align: "right",
      },
      {
        key: "laborer",
        label: "Laborer (M / F / Total)",
        accessor: (r) => `${r.laborerTotal} (M:${r.laborerMale}, F:${r.laborerFemale})`,
        type: "text",
      },
      {
        key: "grandTotal",
        label: "Total Workers",
        accessor: (r) => Number(r.grandTotal) || 0,
        type: "number",
        align: "right",
      },
      {
        key: "contractor",
        label: "Contractor / Agency",
        accessor: (r) => r.contractorName || r.contractor?.name || "Direct Site",
        type: "text",
      },
      {
        key: "loggedBy",
        label: "Logged By",
        accessor: (r) => r.creator?.name || "Supervisor",
        type: "text",
      },
    ],
    []
  );

  const excelHeadcount = useExcelTable({
    data: filteredRecords,
    columns: headcountColumns,
  });

  const workerColumns: ExcelColumn<any>[] = useMemo(
    () => [
      {
        key: "name",
        label: "Name & Code",
        accessor: (w) => `${w.name} ${w.employeeCode || ""}`,
        type: "text",
      },
      {
        key: "workerType",
        label: "Trade",
        accessor: (w) => w.workerType,
        type: "text",
      },
      {
        key: "phone",
        label: "Phone",
        accessor: (w) => w.phone || "—",
        type: "text",
      },
      {
        key: "dailyWageRate",
        label: "Daily Wage Rate",
        accessor: (w) => (Number(w.dailyWageRate) || 0) / 100,
        type: "currency",
        align: "right",
      },
      {
        key: "defaultSite",
        label: "Default Site",
        accessor: (w) => w.defaultSite?.name || "Main Site",
        type: "text",
      },
    ],
    []
  );

  const siteScopedWorkers = useMemo(() => {
    if (!selectedSiteId) return workers;
    return workers.filter((w) => w.defaultSiteId === selectedSiteId || (w as any).defaultSite?.id === selectedSiteId);
  }, [workers, selectedSiteId]);

  const excelWorkers = useExcelTable({
    data: siteScopedWorkers,
    columns: workerColumns,
  });

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
              <h1 className="font-display text-xl sm:text-[26px] font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Site Workers & Labor Headcount</span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Record daily counts of skilled workers and general laborers at each site.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {canWrite && (
              <button
                onClick={() => openUploadModal()}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-sm transition transform active:scale-98 cursor-pointer"
                title="Supervisor: Upload daily site worker count"
              >
                <Plus className="w-4 h-4" />
                <span>Upload Site Headcount</span>
              </button>
            )}

            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl transition shadow-2xs"
              title="Refresh worker records"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-amber-500" : ""}`} />
            </button>
          </div>
        </div>

        {/* Feedback Alerts */}
        {statusMessage && <Alert tone="success">{statusMessage}</Alert>}
        {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

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
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedSiteId(val);
                    setSelectedProjectId("");
                    setActiveSiteId(val);
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="">All Sites (All Deployments)</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code || "Site"})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Target Project Selector */}
            {selectedSiteId && (
              <div className="min-w-[200px]">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                  Target Project:
                </label>
                <div className="relative">
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="">All Projects on Site</option>
                    {projects.filter((p) => p.siteId === selectedSiteId).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {/* Grand Total */}
              <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 rounded-2xl shadow-xs border border-slate-700 min-w-0">
                <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider">
                  Total Site Workers
                </span>
                <div className="mt-1 flex items-baseline gap-1 min-w-0">
                  <span
                    className="font-display text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight leading-tight truncate"
                    title={String(selectedSiteTodayRecord ? selectedSiteTodayRecord.grandTotal : siteGrandTotal)}
                  >
                    {formatCompactNumber(selectedSiteTodayRecord ? selectedSiteTodayRecord.grandTotal : siteGrandTotal)}
                  </span>
                  <span className="text-xs font-normal text-slate-400 shrink-0">workers</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {selectedSiteTodayRecord ? "Logged on site today" : "Cumulative logged count"}
                </div>
              </div>

              {/* Artisans Card */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Skilled Workers (Artisans)
                  </span>
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                </div>
                <div
                  className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums tracking-tight leading-tight truncate"
                  title={String(selectedSiteTodayRecord ? (selectedSiteTodayRecord.artisanCount ?? selectedSiteTodayRecord.artisanTotal ?? 0) : siteTotalArtisan)}
                >
                  {formatCompactNumber(selectedSiteTodayRecord ? (selectedSiteTodayRecord.artisanCount ?? selectedSiteTodayRecord.artisanTotal ?? 0) : siteTotalArtisan)}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-1 flex items-center gap-1.5">
                  <span className="text-amber-700 font-bold">Direct Count</span>
                  <span>&bull;</span>
                  <span>Skilled Trades</span>
                </div>
              </div>

              {/* Laborers Card */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    General Laborers
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                </div>
                <div
                  className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums tracking-tight leading-tight truncate"
                  title={String(selectedSiteTodayRecord ? selectedSiteTodayRecord.laborerTotal : siteTotalLaborer)}
                >
                  {formatCompactNumber(selectedSiteTodayRecord ? selectedSiteTodayRecord.laborerTotal : siteTotalLaborer)}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 mt-1 flex items-center gap-1.5">
                  <span>M: {formatCompactNumber(selectedSiteTodayRecord ? selectedSiteTodayRecord.laborerMale : siteLaborerMale)}</span>
                  <span>&bull;</span>
                  <span>F: {formatCompactNumber(selectedSiteTodayRecord ? selectedSiteTodayRecord.laborerFemale : siteLaborerFemale)}</span>
                </div>
              </div>

              {/* Laborer Gender Split Card */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs min-w-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Laborer Gender Split
                </span>
                <div className="font-display text-xl sm:text-2xl font-extrabold text-purple-700 mt-1 tabular-nums tracking-tight leading-tight truncate">
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
                  <span>Loading site worker deployment...</span>
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="p-16 text-center max-w-sm mx-auto space-y-3">
                  <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                    <Users className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-bold text-slate-800">No Worker Headcount Logged</div>
                  <div className="text-xs text-slate-500 leading-relaxed">
                    No worker counts have been uploaded for {currentSelectedSite?.name || "this site"} yet.
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
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm min-h-[400px]">
                  <ExcelTableToolbar
                    table={excelHeadcount}
                    columns={headcountColumns}
                    tableName="headcount records"
                    showSearch={true}
                    showExport={true}
                  />
                  {/* Desktop Table View (≥ lg screens) */}
                  <div className="hidden lg:block overflow-x-auto min-h-[400px]">
                    <table className="w-full text-left text-xs min-w-[700px]">
                      <thead className="bg-slate-900 text-slate-200 uppercase tracking-wider text-[10px] font-semibold">
                        <tr>
                          {headcountColumns.map((col) => (
                            <ExcelColumnHeader
                              key={col.key}
                              column={col}
                              table={excelHeadcount}
                              theme="darkHeader"
                            />
                          ))}
                          {canWrite && <th className="py-3 px-4 text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {excelHeadcount.paginatedData.map((r) => (
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
                              Artisans: {r.artisanCount ?? r.artisanTotal ?? 0} &bull; Laborers: {r.laborerTotal}
                            </div>
                          </td>

                          {/* Contractor */}
                          <td className="py-3.5 px-4 text-slate-700">
                            {r.contractorName ? (
                              <span className="font-semibold text-slate-800">{r.contractorName}</span>
                            ) : (
                              <span className="text-slate-400 italic">Direct / Self</span>
                            )}
                            {r.notes && (
                              <div className="text-[10px] text-slate-500 break-words whitespace-normal mt-0.5">
                                {r.notes.includes("[Project:") ? (
                                  <>
                                    <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold mr-1">
                                      {r.notes.match(/\[Project:\s*(.*?)\]/)?.[1] || "Project"}
                                    </span>
                                    <span>{r.notes.replace(/\[Project:\s*.*?\]\s*/, "")}</span>
                                  </>
                                ) : (
                                  r.notes
                                )}
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

                {/* Mobile & Tablet Headcount Cards (< lg screens) */}
                <div className="lg:hidden p-3 bg-slate-50/60 space-y-3 min-h-[300px]">
                  {excelHeadcount.filteredData.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                      <Filter className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-slate-700">No headcount records found</p>
                      <p className="text-xs text-slate-400">Try adjusting your filters.</p>
                    </div>
                  ) : (
                    excelHeadcount.paginatedData.map((r) => (
                      <div key={`hc-card-${r.id}`} className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-slate-900 text-sm">{formatDate(r.date)}</div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 font-bold text-slate-700">
                                {r.shift} SHIFT
                              </span>
                              <span>·</span>
                              <span>{r.contractorName || "Direct Site / Self"}</span>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-black font-mono text-xs border border-emerald-200">
                              {r.grandTotal} Workers
                            </span>
                          </div>
                        </div>

                        {/* Supervisor info and notes */}
                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                          <div>
                            <span className="text-[11px] text-slate-400">Supervisor:</span>{" "}
                            <span className="font-semibold text-slate-700">{r.supervisorName}</span>
                          </div>

                          {canWrite && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openUploadModal(r)}
                                className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
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
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <TablePagination
                  currentPage={excelHeadcount.currentPage}
                  totalPages={excelHeadcount.totalPages}
                  totalItems={excelHeadcount.filteredCount}
                  totalUnfiltered={excelHeadcount.totalRecords}
                  pageSize={excelHeadcount.pageSize}
                  startItem={excelHeadcount.startItem}
                  endItem={excelHeadcount.endItem}
                  onPageChange={excelHeadcount.setCurrentPage}
                  itemLabel="headcount records"
                />
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
                  <span>Registered Workers</span>
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
                  <span>Register Worker</span>
                </button>
              )}
            </div>

            <ExcelTableToolbar
              table={excelWorkers}
              columns={workerColumns}
              tableName="workers"
              showSearch={true}
              showExport={true}
            />
            <div className="overflow-x-auto md:min-h-[400px]">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead className="bg-slate-900 text-slate-200 uppercase tracking-wider text-[10px] font-semibold">
                  <tr>
                    {workerColumns.map((col) => (
                      <ExcelColumnHeader
                        key={col.key}
                        column={col}
                        table={excelWorkers}
                        theme="darkHeader"
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {excelWorkers.paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={workerColumns.length} className="py-12 text-center text-slate-400">
                        No registered workers match your search or filters.
                      </td>
                    </tr>
                  ) : (
                    excelWorkers.paginatedData.map((w) => (
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
                      <td className="py-3 px-4">
                        {w.phone ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-600 whitespace-nowrap">{w.phone}</span>
                            <ContactActions phone={w.phone} message={`Namaste ${w.name},`} />
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-800 font-bold">
                        {w.dailyWageRate ? `₹${(w.dailyWageRate / 100).toLocaleString("en-IN")}/day` : "—"}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{w.defaultSite?.name || "Main Site"}</td>
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={excelWorkers.currentPage}
              totalPages={excelWorkers.totalPages}
              totalItems={excelWorkers.filteredCount}
              totalUnfiltered={excelWorkers.totalRecords}
              pageSize={excelWorkers.pageSize}
              startItem={excelWorkers.startItem}
              endItem={excelWorkers.endItem}
              onPageChange={excelWorkers.setCurrentPage}
              itemLabel="workers"
            />
          </div>
        )}

        {/* Modal: Upload Site Workforce Headcount */}
        {showUploadModal && canWrite && (
          <div className="fixed inset-0 z-[70] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in">
              <div className="flex items-center justify-between p-5 pb-3 border-b border-slate-100 shrink-0 bg-white">
                <div>
                  <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                    <Users className="w-5 h-5 text-amber-500" />
                    <span>Upload Site Worker Headcount</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Enter daily counts of skilled workers and general laborers for this site.
                  </p>
                </div>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="headcount-upload-modal-form" onSubmit={handleHeadcountSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                {/* Site, Project, Date & Shift Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Single Site: *
                    </label>
                    <select
                      value={modalSiteId}
                      onChange={(e) => {
                        setModalSiteId(e.target.value);
                        setModalProjectId("");
                      }}
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
                      Project:
                    </label>
                    <select
                      value={modalProjectId}
                      onChange={(e) => setModalProjectId(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    >
                      <option value="">
                        {siteProjects.length === 0
                          ? "All Projects / General Site"
                          : "All Projects / General Site Deployment"}
                      </option>
                      {siteProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.code})
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
                        <span>1. Skilled Workers (Masons, Carpenters, Plumbers)</span>
                      </div>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                        Direct Count: {artisanCount}
                      </span>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">
                        Skilled Workers Count:
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

                  {/* Category 2: Laborer (Male & Female) */}
                  <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200/80">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 font-black text-xs text-emerald-950">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                        <span>2. General Laborers & Helpers</span>
                      </div>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900">
                        Subtotal: {modalLaborerTotal}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-600 block mb-1">
                          Male Workers:
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
                          Female Workers:
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
                      Total Calculated Site Workers:
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5">
                      Artisans: <strong className="text-white">{artisanCount}</strong> &bull; Laborers: <strong className="text-white">{modalLaborerTotal}</strong> ({laborerMale}M / {laborerFemale}F)
                    </div>
                  </div>
                  <div className="text-2xl font-black font-mono text-emerald-400">
                    {modalGrandTotal} <span className="text-xs font-normal text-slate-300">workers</span>
                  </div>
                </div>

                {/* Optional Contractor & Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative" ref={contractorDropdownRef}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500 block">
                        Contractor / Labour Agency (Optional):
                      </label>
                      {(contractorName || contractorSearchQuery) && (
                        <button
                          type="button"
                          onClick={handleClearContractor}
                          className="text-[10px] text-rose-600 hover:underline cursor-pointer font-semibold"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {/* Searchable Combobox Input */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search worker, contractor or agency (or type custom)..."
                        value={contractorSearchQuery !== "" ? contractorSearchQuery : contractorName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setContractorSearchQuery(val);
                          setContractorName(val);
                          setIsContractorDropdownOpen(true);
                        }}
                        onFocus={() => setIsContractorDropdownOpen(true)}
                        className="w-full pl-8 pr-16 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                      <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
                        {(contractorSearchQuery || contractorName) && (
                          <button
                            type="button"
                            onClick={handleClearContractor}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                            title="Clear selection"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setIsContractorDropdownOpen((prev) => !prev)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                          title="Toggle dropdown list"
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              isContractorDropdownOpen ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Search Autocomplete Dropdown List */}
                    {isContractorDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 max-h-64 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
                        {/* Option to use custom typed text if entered */}
                        {(contractorSearchQuery || contractorName).trim() && (
                          <div
                            onClick={() => handleSelectCustomContractor(contractorSearchQuery || contractorName)}
                            className="p-2 bg-amber-50/80 hover:bg-amber-100/90 cursor-pointer flex items-center justify-between transition-colors border-b border-amber-100 text-xs"
                          >
                            <div className="flex items-center gap-1.5">
                              <Plus className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <div className="text-amber-950 font-medium truncate">
                                Use <strong className="font-bold">&quot;{(contractorSearchQuery || contractorName).trim()}&quot;</strong> as custom name
                              </div>
                            </div>
                            <span className="text-[9px] font-bold uppercase bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded-full shrink-0">
                              Custom
                            </span>
                          </div>
                        )}

                        {/* Summary Header */}
                        <div className="px-3 py-1.5 bg-slate-50 flex items-center justify-between text-[10px] font-semibold text-slate-500">
                          <span>
                            {(contractorSearchQuery || "").trim()
                              ? `Matching results (${totalMatchingContractorOptions})`
                              : "Registered Directory & Agencies (Click to select)"}
                          </span>
                          <span className="text-slate-400">Searchable list</span>
                        </div>

                        {/* Section 1: Registered Trade Workers Directory */}
                        {filteredWorkersForContractor.length > 0 && (
                          <div>
                            <div className="px-3 py-1 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 border-t border-slate-100">
                              <HardHat className="w-3 h-3 text-amber-500" />
                              <span>Registered Trade Workers ({filteredWorkersForContractor.length})</span>
                            </div>
                            <div className="py-0.5">
                              {filteredWorkersForContractor.map((w) => {
                                const wageStr = w.dailyWageRate ? ` • ₹${Number(w.dailyWageRate) / 100}/day` : "";
                                const siteStr = w.defaultSite?.name ? ` • ${w.defaultSite.name}` : "";
                                const val = `${w.name} (${w.employeeCode} - ${w.workerType})`;
                                const isSelected = contractorName === val;

                                return (
                                  <div
                                    key={w.id}
                                    onClick={() => handleSelectWorkerAsContractor(w)}
                                    className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between transition-colors ${
                                      isSelected
                                        ? "bg-amber-50 font-bold text-amber-900"
                                        : "hover:bg-slate-50 text-slate-800"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                                        {w.name.slice(0, 1).toUpperCase()}
                                      </div>
                                      <div className="truncate">
                                        <div className="font-semibold text-slate-900 flex items-center gap-1.5 truncate">
                                          <span>{w.name}</span>
                                          <span className="font-mono text-[10px] px-1 py-0.2 rounded bg-slate-100 text-slate-600 font-normal">
                                            {w.employeeCode}
                                          </span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 truncate">
                                          {w.workerType}{wageStr}{siteStr}
                                        </div>
                                      </div>
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded shrink-0 ml-2">
                                      {w.workerType}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Section 2: Contractors & Labour Agencies */}
                        {filteredContractorsList.length > 0 && (
                          <div>
                            <div className="px-3 py-1 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 border-t border-slate-100">
                              <Building2 className="w-3 h-3 text-sky-500" />
                              <span>Contractors & Labour Agencies ({filteredContractorsList.length})</span>
                            </div>
                            <div className="py-0.5">
                              {filteredContractorsList.map((c) => {
                                const isSelected = contractorName === c;
                                return (
                                  <div
                                    key={c}
                                    onClick={() => handleSelectContractor(c)}
                                    className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between transition-colors ${
                                      isSelected
                                        ? "bg-sky-50 font-bold text-sky-900"
                                        : "hover:bg-slate-50 text-slate-800"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                      <span className="truncate">{c}</span>
                                    </div>
                                    {isSelected && (
                                      <Check className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* No matching results state */}
                        {totalMatchingContractorOptions === 0 && !(contractorSearchQuery || contractorName).trim() && (
                          <div className="p-4 text-center text-xs text-slate-400">
                            No registered trade workers or contractors found. Type above to enter custom agency name.
                          </div>
                        )}

                        {totalMatchingContractorOptions === 0 && (contractorSearchQuery || contractorName).trim() && (
                          <div className="p-3 text-center">
                            <p className="text-xs text-slate-500">
                              No existing workers or contractors match &quot;{(contractorSearchQuery || contractorName).trim()}&quot;
                            </p>
                            <p className="text-[11px] text-amber-700 font-semibold mt-1">
                              Click the &quot;Use custom name&quot; option above to save this as a new contractor.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Rich Details Card when a Registered Trade Worker is Selected */}
                    {selectedWorker && (
                      <div className="mt-2 p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs space-y-1.5 shadow-2xs animate-in fade-in duration-150">
                        <div className="flex items-center justify-between pb-1 border-b border-amber-200/60">
                          <span className="font-bold text-amber-950 flex items-center gap-1.5">
                            <Briefcase className="w-3.5 h-3.5 text-amber-600" />
                            <span>Registered Trade Worker Details</span>
                          </span>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-200 text-amber-900">
                            {selectedWorker.employeeCode}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-700">
                          <div>
                            <span className="text-slate-400">Worker:</span>{" "}
                            <strong className="text-slate-900">{selectedWorker.name}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">Trade:</span>{" "}
                            <strong className="text-amber-800 uppercase font-mono">{selectedWorker.workerType}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">Daily Wage:</span>{" "}
                            <strong className="text-emerald-700">
                              ₹{(Number(selectedWorker.dailyWageRate) || 0) / 100} / day
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-400">Assigned Site:</span>{" "}
                            <strong className="text-slate-900">
                              {selectedWorker.defaultSite?.name || "Main Site"}
                            </strong>
                          </div>
                          {selectedWorker.phone && (
                            <div className="col-span-2">
                              <span className="text-slate-400">Contact Phone:</span>{" "}
                              <strong className="font-mono text-slate-900">{selectedWorker.phone}</strong>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Column 2: Work Details / Notes */}
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Work Details / Notes (Optional):
                    </label>
                    <textarea
                      rows={4}
                      placeholder="e.g. Core wall casting, shuttering, plastering work on 3rd floor"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
              </form>

              {/* Action Buttons */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-200/70 rounded-xl text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="headcount-upload-modal-form"
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
            </div>
          </div>
        )}

        {/* Modal: Register Individual Worker */}
        {showRegisterWorkerModal && canWrite && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-amber-500" />
                  <span>Register Worker</span>
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
                      Worker ID Code: * <span className="font-normal lowercase text-slate-400">(e.g. WRK-104)</span>
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
        {pendingDeleteRecord && (
          <div
            className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
            onClick={() => setPendingDeleteRecord(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto space-y-3 animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="font-bold text-slate-900 text-base">Delete Worker Count?</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to delete the worker count for{" "}
                <strong className="text-slate-900">{pendingDeleteRecord.siteName}</strong> on{" "}
                <strong className="text-slate-900">{formatDate(pendingDeleteRecord.date)}</strong>?
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPendingDeleteRecord(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={executeDeleteRecord}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg disabled:opacity-50"
                >
                  {submitting ? "Deleting..." : "Delete Record"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
