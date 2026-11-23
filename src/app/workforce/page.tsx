"use client";

import { Alert } from "@/components/ui/Alert";
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import Shell from "@/components/layout/Shell";
import { ContactActions } from "@/components/ui/ContactActions";
import { formatDate, formatDateTime, formatCompactNumber } from "@/lib/formatters";
import { istDateKey } from "@/lib/ist-date";
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
  Calculator,
  Save,
  Coins,
  DollarSign,
  Layers,
  Info,
  BarChart3,
  TrendingUp,
  Loader2,
  Camera,
  UploadCloud,
  Eye,
  Download,
  Image as ImageIcon,
  FileText,
} from "lucide-react";
import { createPortal } from "react-dom";
import { uploadClientMedia } from "@/lib/upload-client";
import { canUser } from "@/lib/permissions";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, TablePagination, ExcelColumn } from "@/components/ui/ExcelTable";
import { useActiveSite } from "@/hooks/useActiveSite";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import SearchableSelect, { SearchableOption } from "@/components/ui/SearchableSelect";
import { matchContractorTradeCategory, validateWorkerPhone } from "@/lib/contractor-trade-mapping";

interface HeadcountRecord {
  id: string;
  organizationId: string;
  siteId: string;
  siteName: string;
  projectId?: string;
  projectName?: string;
  date: string;
  shift: "GENERAL" | "DAY" | "NIGHT";
  source?: "CONTRACTOR" | "DIRECT";
  contractorId?: string;
  contractorName?: string;
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
  skilledRate?: number;
  skilledAmount?: number;
  maleRate?: number;
  maleAmount?: number;
  femaleRate?: number;
  femaleAmount?: number;
  totalExpense?: number;
  rateUnit?: string;
  isOverridden?: boolean;
  overrideReason?: string;
  notes?: string;
  supervisorId: string;
  supervisorName: string;
  attachments?: Array<{
    id: string;
    fileId: string;
    fileName: string;
    fileSize?: number;
    mimeType?: string;
    url: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface StagedHeadcountEntry {
  id: string;
  source: "CONTRACTOR" | "DIRECT";
  contractorId?: string;
  contractorName?: string;
  skilledCount: number;
  skilledRate: number; // in rupees
  skilledAmount: number; // in rupees
  maleCount: number;
  maleRate: number; // in rupees
  maleAmount: number; // in rupees
  femaleCount: number;
  femaleRate: number; // in rupees
  femaleAmount: number; // in rupees
  totalWorkers: number;
  totalExpense: number; // in rupees
  isOverridden?: boolean;
  overrideReason?: string;
  notes?: string;
}

interface WorkerRosterItem {
  id: string;
  name: string;
  employeeCode: string;
  workerType: string;
  phone?: string;
  contractorId?: string | null;
  dailyWageRate?: number;
  maleHelperWageRate?: number;
  femaleHelperWageRate?: number;
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
  const [selectedDate, setSelectedDate] = useState<string>(() => istDateKey());

  const [activeTab, setActiveTab] = useState<"headcount" | "roster">("headcount");
  const [records, setRecords] = useState<HeadcountRecord[]>([]);
  const [workers, setWorkers] = useState<WorkerRosterItem[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal: Upload / Record Headcount
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [modalSiteId, setModalSiteId] = useState("");
  const [modalProjectId, setModalProjectId] = useState<string>("");
  const [modalDate, setModalDate] = useState(() => istDateKey());
  const [modalShift, setModalShift] = useState<"GENERAL" | "DAY" | "NIGHT">("GENERAL");

  const siteProjects = useMemo(() => {
    if (!modalSiteId) return [];
    return projects.filter((p) => p.siteId === modalSiteId);
  }, [projects, modalSiteId]);

  // Headcount breakdown state: Direct count for Artisan; Male & Female for Laborer
  const [artisanCount, setArtisanCount] = useState<number>(0);
  const [laborerMale, setLaborerMale] = useState<number>(0);
  const [laborerFemale, setLaborerFemale] = useState<number>(0);
  const [contractorName, setContractorName] = useState("ABC Labour Services Pvt. Ltd.");
  const [isCustomContractor, setIsCustomContractor] = useState(false);
  const [notes, setNotes] = useState("");

  // Parties & Contractor Rate Automation & Direct Labour Cost Management State
  const [parties, setParties] = useState<any[]>([]);
  const [stagedEntries, setStagedEntries] = useState<StagedHeadcountEntry[]>([]);

  // Contractor Workforce state
  const [contractorSkilledCount, setContractorSkilledCount] = useState<number>(0);
  const [contractorMaleCount, setContractorMaleCount] = useState<number>(0);
  const [contractorFemaleCount, setContractorFemaleCount] = useState<number>(0);
  const [contractorSkilledRate, setContractorSkilledRate] = useState<number>(0);
  const [contractorMaleRate, setContractorMaleRate] = useState<number>(0);
  const [contractorFemaleRate, setContractorFemaleRate] = useState<number>(0);
  const [hasContractorRates, setHasContractorRates] = useState<boolean>(false);
  const [contractorRateSource, setContractorRateSource] = useState<string>("NONE");
  const [selectedContractorId, setSelectedContractorId] = useState<string>("");

  // Extra Workers custom rate override
  const [isExtraWorkersRate, setIsExtraWorkersRate] = useState<boolean>(false);
  const [baseContractorRates, setBaseContractorRates] = useState<{ skilled: number; male: number; female: number }>({
    skilled: 0,
    male: 0,
    female: 0,
  });

  // Direct Workforce state
  const [directSkilledCount, setDirectSkilledCount] = useState<number>(0);
  const [directMaleCount, setDirectMaleCount] = useState<number>(0);
  const [directFemaleCount, setDirectFemaleCount] = useState<number>(0);
  const [directSkilledRate, setDirectSkilledRate] = useState<number>(1000);
  const [directMaleRate, setDirectMaleRate] = useState<number>(650);
  const [directFemaleRate, setDirectFemaleRate] = useState<number>(550);
  const [directNotes, setDirectNotes] = useState<string>("");

  const [editingStagedId, setEditingStagedId] = useState<string | null>(null);

  // Labour Financial Reports Modal state
  const [showReportsModal, setShowReportsModal] = useState<boolean>(false);
  const [reportsData, setReportsData] = useState<any>(null);
  const [reportsLoading, setReportsLoading] = useState<boolean>(false);
  const [reportsActiveTab, setReportsActiveTab] = useState<string>("daily");

  // Active Contractor calculations
  const contractorSkilledAmount = (contractorSkilledCount || 0) * (contractorSkilledRate || 0);
  const contractorMaleAmount = (contractorMaleCount || 0) * (contractorMaleRate || 0);
  const contractorFemaleAmount = (contractorFemaleCount || 0) * (contractorFemaleRate || 0);
  const contractorTotalExpense = contractorSkilledAmount + contractorMaleAmount + contractorFemaleAmount;
  const contractorTotalWorkers = (contractorSkilledCount || 0) + (contractorMaleCount || 0) + (contractorFemaleCount || 0);

  // Active Direct calculations
  const directSkilledAmount = (directSkilledCount || 0) * (directSkilledRate || 0);
  const directMaleAmount = (directMaleCount || 0) * (directMaleRate || 0);
  const directFemaleAmount = (directFemaleCount || 0) * (directFemaleRate || 0);
  const directTotalExpense = directSkilledAmount + directMaleAmount + directFemaleAmount;
  const directTotalWorkers = (directSkilledCount || 0) + (directMaleCount || 0) + (directFemaleCount || 0);

  // Live Summary for Card 4: Daily Site Labour Expense Summary
  // Exclude the item currently being edited so it's not double-counted with the active form
  const uneditedStagedEntries = useMemo(() => {
    if (!editingStagedId) return stagedEntries;
    return stagedEntries.filter((e) => e.id !== editingStagedId);
  }, [stagedEntries, editingStagedId]);

  const stagedContractorExpense = useMemo(() => {
    return uneditedStagedEntries.filter((e) => e.source === "CONTRACTOR").reduce((sum, e) => sum + e.totalExpense, 0);
  }, [uneditedStagedEntries]);

  const stagedDirectExpense = useMemo(() => {
    return uneditedStagedEntries.filter((e) => e.source === "DIRECT").reduce((sum, e) => sum + e.totalExpense, 0);
  }, [uneditedStagedEntries]);

  const stagedContractorWorkers = useMemo(() => {
    return uneditedStagedEntries.filter((e) => e.source === "CONTRACTOR").reduce((sum, e) => sum + e.totalWorkers, 0);
  }, [uneditedStagedEntries]);

  const stagedDirectWorkers = useMemo(() => {
    return uneditedStagedEntries.filter((e) => e.source === "DIRECT").reduce((sum, e) => sum + e.totalWorkers, 0);
  }, [uneditedStagedEntries]);

  const displayContractorExpense = stagedContractorExpense + contractorTotalExpense;
  const displayDirectExpense = stagedDirectExpense + directTotalExpense;
  const displayContractorWorkers = stagedContractorWorkers + contractorTotalWorkers;
  const displayDirectWorkers = stagedDirectWorkers + directTotalWorkers;
  const displayTotalWorkers = displayContractorWorkers + displayDirectWorkers;
  const displayTotalExpense = displayContractorExpense + displayDirectExpense;

  const totalEntriesCount = useMemo(() => {
    if (stagedEntries.length > 0) return stagedEntries.length;
    let count = 0;
    if (contractorTotalWorkers > 0) count++;
    if (directTotalWorkers > 0) count++;
    return count;
  }, [stagedEntries.length, contractorTotalWorkers, directTotalWorkers]);

  // Table live totals row
  const tableTotals = useMemo(() => {
    const totalSkilled = stagedEntries.reduce((s, e) => s + e.skilledCount, 0);
    const totalSkilledAmt = stagedEntries.reduce((s, e) => s + e.skilledAmount, 0);
    const totalMale = stagedEntries.reduce((s, e) => s + e.maleCount, 0);
    const totalMaleAmt = stagedEntries.reduce((s, e) => s + e.maleAmount, 0);
    const totalFemale = stagedEntries.reduce((s, e) => s + e.femaleCount, 0);
    const totalFemaleAmt = stagedEntries.reduce((s, e) => s + e.femaleAmount, 0);
    const totalWorkers = stagedEntries.reduce((s, e) => s + e.totalWorkers, 0);
    const totalExpense = stagedEntries.reduce((s, e) => s + e.totalExpense, 0);

    return {
      totalSkilled,
      totalSkilledAmt,
      totalMale,
      totalMaleAmt,
      totalFemale,
      totalFemaleAmt,
      totalWorkers,
      totalExpense,
    };
  }, [stagedEntries]);

  const existingContractors = useMemo(() => {
    const set = new Set<string>();
    // 1. Add contractors from historical headcount records (prioritize active site contractors):
    records.forEach((r) => {
      const name = r.contractorName?.trim();
      if (name && name !== "-" && name !== "Contractor Agency") {
        set.add(name);
      }
    });
    // 2. Add all registered contractors from parties:
    parties.forEach((p) => {
      const name = p.name?.trim();
      if (name && (p.partyType === "CONTRACTOR" || p.partyType === "BOTH")) {
        set.add(name);
      }
    });
    // 3. Add other parties if any:
    parties.forEach((p) => {
      const name = p.name?.trim();
      if (name) set.add(name);
    });
    // 4. Add contractors from registered workers directory:
    workers.forEach((w) => {
      if (w.contractorId || w.workerType === "FOREMAN") {
        if (w.name?.trim()) set.add(w.name.trim());
      }
    });
    // 5. Default fallback construction trades if database has none
    if (set.size === 0) {
      set.add("Ramesh RCC & Masonry Works");
      set.add("Apex Civil Contractors");
      set.add("Sharma Electricals & Contractors");
      set.add("ABC Labour Services Pvt. Ltd.");
    }
    return Array.from(set);
  }, [parties, records, workers]);

  const fetchContractorRates = useCallback(
    async (cNameOrId: string) => {
      const trimmed = cNameOrId.trim();
      if (!trimmed) {
        setContractorSkilledRate(0);
        setContractorMaleRate(0);
        setContractorFemaleRate(0);
        setBaseContractorRates({ skilled: 0, male: 0, female: 0 });
        setHasContractorRates(false);
        setContractorRateSource("NONE");
        setSelectedContractorId("");
        setIsExtraWorkersRate(false);
        return;
      }

      // Check preset standard contractors
      if (trimmed.toLowerCase().includes("abc labour") || trimmed === "ABC Labour Services Pvt. Ltd.") {
        setContractorSkilledRate(900);
        setContractorMaleRate(600);
        setContractorFemaleRate(500);
        setBaseContractorRates({ skilled: 900, male: 600, female: 500 });
        setHasContractorRates(true);
        setContractorRateSource("PARTY");
        return;
      }

      // Check parties from DB
      const partyMatch = parties.find(
        (p) => p.id === trimmed || p.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (partyMatch && (partyMatch.dailyWageRate || partyMatch.maleHelperWageRate || partyMatch.femaleHelperWageRate)) {
        const s = partyMatch.dailyWageRate ? partyMatch.dailyWageRate / 100 : 0;
        const m = partyMatch.maleHelperWageRate ? partyMatch.maleHelperWageRate / 100 : 0;
        const f = partyMatch.femaleHelperWageRate ? partyMatch.femaleHelperWageRate / 100 : 0;
        setContractorSkilledRate(s);
        setContractorMaleRate(m);
        setContractorFemaleRate(f);
        setBaseContractorRates({ skilled: s, male: m, female: f });
        setSelectedContractorId(partyMatch.id);
        setHasContractorRates(true);
        setContractorRateSource("PARTY");
        return;
      }

      // Check registered workers
      const wMatch = workers.find(
        (w) =>
          w.name.toLowerCase() === trimmed.toLowerCase() ||
          w.employeeCode.toLowerCase() === trimmed.toLowerCase() ||
          trimmed.includes(w.employeeCode)
      );
      if (wMatch && (wMatch.dailyWageRate || wMatch.maleHelperWageRate || wMatch.femaleHelperWageRate)) {
        const s = wMatch.dailyWageRate ? wMatch.dailyWageRate / 100 : 0;
        const m = wMatch.maleHelperWageRate ? wMatch.maleHelperWageRate / 100 : 0;
        const f = wMatch.femaleHelperWageRate ? wMatch.femaleHelperWageRate / 100 : 0;
        setContractorSkilledRate(s);
        setContractorMaleRate(m);
        setContractorFemaleRate(f);
        setBaseContractorRates({ skilled: s, male: m, female: f });
        setSelectedContractorId(wMatch.id);
        setHasContractorRates(true);
        setContractorRateSource("WORKER");
        return;
      }

      // Query database via API for historical rate card
      try {
        const res = await fetch(`/api/workforce/headcount?contractorRate=${encodeURIComponent(trimmed)}`);
        const json = await res.json();
        if (json.success && json.data && json.data.hasRates) {
          const s = json.data.skilledRate ? json.data.skilledRate / 100 : 0;
          const m = json.data.maleRate ? json.data.maleRate / 100 : 0;
          const f = json.data.femaleRate ? json.data.femaleRate / 100 : 0;
          setContractorSkilledRate(s);
          setContractorMaleRate(m);
          setContractorFemaleRate(f);
          setBaseContractorRates({ skilled: s, male: m, female: f });
          setHasContractorRates(true);
          setContractorRateSource(json.data.source);
          setSelectedContractorId(json.data.contractorId || "");
          return;
        }
      } catch (err) {
        console.warn("Could not fetch contractor rates:", err);
      }

      // If no rate card configured in DB
      setContractorSkilledRate(0);
      setContractorMaleRate(0);
      setContractorFemaleRate(0);
      setBaseContractorRates({ skilled: 0, male: 0, female: 0 });
      setHasContractorRates(false);
      setContractorRateSource("NONE");
    },
    [parties, workers]
  );

  const getDefaultContractor = useCallback(() => {
    const fromRecords = records.find(
      (r) => r.contractorName?.trim() && r.contractorName.trim() !== "-" && r.contractorName.trim() !== "Contractor Agency"
    )?.contractorName?.trim();
    if (fromRecords) return fromRecords;

    const fromPartiesContractor = parties.find(
      (p) => (p.partyType === "CONTRACTOR" || p.partyType === "BOTH") && p.name?.trim()
    )?.name?.trim();
    if (fromPartiesContractor) return fromPartiesContractor;

    const fromAnyParty = parties.find((p) => p.name?.trim())?.name?.trim();
    if (fromAnyParty) return fromAnyParty;

    if (existingContractors.length > 0) return existingContractors[0];

    return "Ramesh RCC & Masonry Works";
  }, [records, parties, existingContractors]);

  // Auto-populate default contractor if contractorName is empty and contractors exist
  useEffect(() => {
    if (!contractorName && (records.length > 0 || parties.length > 0 || existingContractors.length > 0)) {
      const defaultContractor = getDefaultContractor();
      if (defaultContractor) {
        setContractorName(defaultContractor);
        fetchContractorRates(defaultContractor);
      }
    }
  }, [records, parties, existingContractors, contractorName, getDefaultContractor, fetchContractorRates]);

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

  const handleToggleExtraWorkers = (checked: boolean) => {
    setIsExtraWorkersRate(checked);
    if (!checked) {
      // Revert to auto-fetched base rates when unchecked
      setContractorSkilledRate(baseContractorRates.skilled);
      setContractorMaleRate(baseContractorRates.male);
      setContractorFemaleRate(baseContractorRates.female);
    }
  };

  const handleSelectWorkerAsContractor = (w: any) => {
    const val = `${w.name} (${w.employeeCode} - ${w.workerType})`;
    setContractorName(val);
    setContractorSearchQuery("");
    setIsContractorDropdownOpen(false);
    setIsCustomContractor(false);
    fetchContractorRates(val);
  };

  const handleSelectContractor = (c: string) => {
    setContractorName(c);
    setContractorSearchQuery("");
    setIsContractorDropdownOpen(false);
    setIsCustomContractor(false);
    fetchContractorRates(c);
  };

  const handleSelectCustomContractor = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setContractorName(trimmed);
    setContractorSearchQuery("");
    setIsContractorDropdownOpen(false);
    setIsCustomContractor(true);
    fetchContractorRates(trimmed);
  };

  const handleClearContractor = () => {
    setContractorName("");
    setContractorSearchQuery("");
    setIsContractorDropdownOpen(false);
    setIsCustomContractor(false);
    fetchContractorRates("");
  };

  // Modal: Register / Edit Individual Worker
  const [showRegisterWorkerModal, setShowRegisterWorkerModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<WorkerRosterItem | null>(null);
  const [workerName, setWorkerName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [workerType, setWorkerType] = useState("MASON");
  const [workerPhone, setWorkerPhone] = useState("");
  const [workerDailyWage, setWorkerDailyWage] = useState("");
  const [workerMaleHelperWage, setWorkerMaleHelperWage] = useState("");
  const [workerFemaleHelperWage, setWorkerFemaleHelperWage] = useState("");

  // Dynamic Contractor Selection states
  const [selectedContractorPartyId, setSelectedContractorPartyId] = useState("");
  const [loadingContractors, setLoadingContractors] = useState(false);
  const [contractorFetchError, setContractorFetchError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

  // Eligible contractors from Vendors & Contractors database (CONTRACTOR or BOTH)
  const contractorParties = useMemo(() => {
    return parties.filter((p) => {
      const pType = (p.partyType || p.type || "").toUpperCase();
      return pType === "CONTRACTOR" || pType === "BOTH" || pType === "SUBCONTRACTOR";
    });
  }, [parties]);

  // Searchable contractor dropdown options
  const contractorSelectOptions: SearchableOption[] = useMemo(() => {
    return contractorParties.map((p) => {
      const registeredWorker = workers.find(
        (w) => (w.contractorId && w.contractorId === p.id) || w.name?.toLowerCase().trim() === p.name?.toLowerCase().trim()
      );
      const isRegistered = Boolean(registeredWorker);
      const details: string[] = [];
      if (p.phone) details.push(p.phone);
      if (p.category) details.push(p.category);
      if (p.city) details.push(p.city);

      return {
        value: p.id,
        label: p.name,
        subLabel: details.join(" • ") || "Vendor & Contractor Record",
        badge: isRegistered
          ? `Registered (${registeredWorker?.employeeCode})`
          : (p.category || "Contractor"),
        meta: {
          ...p,
          isRegistered,
          registeredWorkerCode: registeredWorker?.employeeCode,
        },
      };
    });
  }, [contractorParties, workers]);

  // Handle contractor selection from dropdown: auto-populates all required fields
  const handleSelectContractorForWorker = (partyId: string) => {
    setSelectedContractorPartyId(partyId);
    setDuplicateWarning(null);

    if (!partyId) {
      setWorkerName("");
      setWorkerPhone("");
      return;
    }

    const contractor = contractorParties.find((p) => p.id === partyId);
    if (!contractor) return;

    // 1. Populate Full Name
    setWorkerName(contractor.name || "");

    // 2. Populate Phone Number
    const phone = contractor.phone || contractor.whatsappNumber || "";
    setWorkerPhone(phone);

    // 3. Automatically select matching Trade Category
    const mappedTrade = matchContractorTradeCategory(contractor.category || contractor.name || "");
    setWorkerType(mappedTrade);

    // 4. Populate wage rates if present in contractor rate card
    if (contractor.dailyWageRate != null && contractor.dailyWageRate > 0) {
      setWorkerDailyWage(String(contractor.dailyWageRate / 100));
    }
    if (contractor.maleHelperWageRate != null && contractor.maleHelperWageRate > 0) {
      setWorkerMaleHelperWage(String(contractor.maleHelperWageRate / 100));
    }
    if (contractor.femaleHelperWageRate != null && contractor.femaleHelperWageRate > 0) {
      setWorkerFemaleHelperWage(String(contractor.femaleHelperWageRate / 100));
    }

    // 5. Check duplicate registration
    const existingWorker = workers.find(
      (w) => (w.contractorId && w.contractorId === contractor.id) || w.name?.toLowerCase().trim() === contractor.name?.toLowerCase().trim()
    );
    if (existingWorker) {
      setDuplicateWarning(
        `Notice: Contractor "${contractor.name}" is already registered as worker ${existingWorker.employeeCode}. Registering again may create a duplicate.`
      );
    }
  };

  // Feedback states
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDeleteRecord, setPendingDeleteRecord] = useState<{ id: string; siteName: string; date: string } | null>(null);
  const [pendingDeleteWorker, setPendingDeleteWorker] = useState<{ id: string; name: string; employeeCode: string } | null>(null);
  const [showClearWorkersModal, setShowClearWorkersModal] = useState<boolean>(false);

  // Editing and Photo Attachment states for Headcount
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [headcountPhotos, setHeadcountPhotos] = useState<File[]>([]);
  const [headcountPhotoPreviews, setHeadcountPhotoPreviews] = useState<
    Array<{ id: string; url: string; name: string; size: number }>
  >([]);
  const [existingAttachments, setExistingAttachments] = useState<
    Array<{ id: string; fileId: string; fileName: string; fileSize?: number; mimeType?: string; url: string }>
  >([]);
  const [activePhotoLightbox, setActivePhotoLightbox] = useState<string | null>(null);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState<boolean>(false);

  useEffect(() => {
    if (!(showUploadModal || showRegisterWorkerModal || pendingDeleteRecord || pendingDeleteWorker || showReportsModal || showClearWorkersModal || activePhotoLightbox)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activePhotoLightbox) {
          setActivePhotoLightbox(null);
          return;
        }
        setShowUploadModal(false);
        setEditingRecordId(null);
        setShowRegisterWorkerModal(false);
        setPendingDeleteRecord(null);
        setPendingDeleteWorker(null);
        setShowReportsModal(false);
        setShowClearWorkersModal(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showUploadModal, showRegisterWorkerModal, pendingDeleteRecord, pendingDeleteWorker, showReportsModal, showClearWorkersModal, activePhotoLightbox]);

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
      const [authRes, sitesRes, headcountRes, workforceRes, projectsRes, partiesRes] = await Promise.all([
        refreshUser().then((user) => ({ success: Boolean(user), data: { user } })),
        refreshSites().then((data) => ({ success: true, data })),
        fetch(`/api/workforce/headcount?_t=${ts}`, noCacheInit).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/workforce?_t=${ts}`, noCacheInit).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/projects?_t=${ts}`, noCacheInit).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/parties?type=CONTRACTOR&_t=${ts}`, noCacheInit).then((r) => r.json()).catch(() => ({})),
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

      if (partiesRes?.success && partiesRes.data) {
        setParties(partiesRes.data || []);
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
    headcountPhotoPreviews.forEach((p) => URL.revokeObjectURL(p.url));
    setHeadcountPhotos([]);
    setHeadcountPhotoPreviews([]);
    setPhotoUploadError(null);

    if (existing) {
      setEditingRecordId(existing.id);
      setModalSiteId(existing.siteId);
      setModalProjectId(existing.projectId || "");
      setModalDate(existing.date);
      setModalShift(existing.shift);
      setArtisanCount(existing.artisanCount ?? existing.artisanTotal ?? 0);
      setLaborerMale(existing.laborerMale || 0);
      setLaborerFemale(existing.laborerFemale || 0);
      setContractorName(existing.contractorName || "");
      setNotes(existing.notes || "");
      setExistingAttachments(existing.attachments || []);
      setIsCustomContractor(false);
      setIsContractorDropdownOpen(false);
      setContractorSearchQuery("");

      const sRate = existing.skilledRate ? existing.skilledRate / 100 : 900;
      const mRate = existing.maleRate ? existing.maleRate / 100 : 600;
      const fRate = existing.femaleRate ? existing.femaleRate / 100 : 500;

      if (existing.source === "DIRECT") {
        setDirectSkilledCount(existing.artisanCount || 0);
        setDirectMaleCount(existing.laborerMale || 0);
        setDirectFemaleCount(existing.laborerFemale || 0);
        setDirectSkilledRate(sRate);
        setDirectMaleRate(mRate);
        setDirectFemaleRate(fRate);
        setDirectNotes(existing.notes || "");
        setContractorSkilledCount(0);
        setContractorMaleCount(0);
        setContractorFemaleCount(0);
        setIsExtraWorkersRate(false);
      } else {
        const cName =
          existing.contractorName?.trim() && existing.contractorName.trim() !== "-" && existing.contractorName.trim() !== "Contractor Agency"
            ? existing.contractorName.trim()
            : getDefaultContractor();
        setContractorName(cName);
        fetchContractorRates(cName);
        setContractorSkilledCount(existing.artisanCount || 0);
        setContractorMaleCount(existing.laborerMale || 0);
        setContractorFemaleCount(existing.laborerFemale || 0);
        setContractorSkilledRate(sRate);
        setContractorMaleRate(mRate);
        setContractorFemaleRate(fRate);
        setBaseContractorRates({
          skilled: sRate,
          male: mRate,
          female: fRate,
        });
        setIsExtraWorkersRate(Boolean(existing.isOverridden));
        setHasContractorRates(true);
        setDirectSkilledCount(0);
        setDirectMaleCount(0);
        setDirectFemaleCount(0);
      }

      setStagedEntries([]);
      setEditingStagedId(null);
    } else {
      setEditingRecordId(null);
      setExistingAttachments([]);
      setModalSiteId(selectedSiteId || (sites.length > 0 ? sites[0].id : ""));
      setModalProjectId(selectedProjectId || "");
      setModalDate(selectedDate);
      setModalShift("GENERAL");

      const defaultContractor = getDefaultContractor();
      setContractorName(defaultContractor);
      if (defaultContractor) {
        fetchContractorRates(defaultContractor);
      }

      setContractorSkilledCount(0);
      setContractorMaleCount(0);
      setContractorFemaleCount(0);
      setIsExtraWorkersRate(false);

      setDirectSkilledCount(0);
      setDirectMaleCount(0);
      setDirectFemaleCount(0);
      setDirectSkilledRate(1000);
      setDirectMaleRate(650);
      setDirectFemaleRate(550);
      setDirectNotes("");

      setNotes("");
      setIsCustomContractor(false);
      setIsContractorDropdownOpen(false);
      setContractorSearchQuery("");

      setStagedEntries([]);
      setEditingStagedId(null);
    }
    setShowUploadModal(true);
  };

  const handleHeadcountPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (picked.length === 0) return;
    setPhotoUploadError(null);

    const validFiles: File[] = [];
    for (const file of picked) {
      const isImg = file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|heic|heif|bmp)$/i.test(file.name);
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isImg && !isPdf) {
        setPhotoUploadError(`File '${file.name}' is not supported. Please upload Images (JPG, PNG) or PDF.`);
        continue;
      }
      if (file.size > 25 * 1024 * 1024) {
        setPhotoUploadError(`File '${file.name}' exceeds the 25 MB size limit.`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    setHeadcountPhotos((prev) => [...prev, ...validFiles]);
    const newPreviews = validFiles.map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random()}`,
      url: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
    }));
    setHeadcountPhotoPreviews((prev) => [...prev, ...newPreviews]);
  };

  const handleRemoveHeadcountPhoto = (index: number) => {
    setHeadcountPhotos((prev) => prev.filter((_, i) => i !== index));
    setHeadcountPhotoPreviews((prev) => {
      if (prev[index]?.url) URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleDeleteExistingAttachment = async (attachmentId: string) => {
    try {
      const res = await fetch(`/api/attachments/${attachmentId}`, { method: "DELETE" });
      if (res.ok) {
        setExistingAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
        setRecords((prev) =>
          prev.map((r) =>
            r.id === editingRecordId
              ? { ...r, attachments: (r.attachments || []).filter((a) => a.id !== attachmentId) }
              : r
          )
        );
      }
    } catch (err) {
      console.error("Failed to delete attachment:", err);
    }
  };

  const handleAddEntryToList = () => {
    if (contractorTotalWorkers === 0 && directTotalWorkers === 0) {
      setErrorMessage("Please enter counts for Contractor Workforce or Direct Workforce before adding.");
      return;
    }

    setErrorMessage(null);
    const newStaged: StagedHeadcountEntry[] = [...stagedEntries];

    // Remove if editing
    if (editingStagedId) {
      const idx = newStaged.findIndex((e) => e.id === editingStagedId);
      if (idx !== -1) newStaged.splice(idx, 1);
      setEditingStagedId(null);
    }

    // Stage Contractor Entry
    if (contractorTotalWorkers > 0) {
      if (!contractorName.trim()) {
        setErrorMessage("Contractor / Labour Agency is MANDATORY when adding Contractor Workforce. Please select or enter a contractor.");
        setIsContractorDropdownOpen(true);
        return;
      }
      newStaged.push({
        id: `staged-c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        source: "CONTRACTOR",
        contractorId: selectedContractorId || undefined,
        contractorName: contractorName.trim(),
        skilledCount: contractorSkilledCount,
        skilledRate: contractorSkilledRate,
        skilledAmount: contractorSkilledAmount,
        maleCount: contractorMaleCount,
        maleRate: contractorMaleRate,
        maleAmount: contractorMaleAmount,
        femaleCount: contractorFemaleCount,
        femaleRate: contractorFemaleRate,
        femaleAmount: contractorFemaleAmount,
        totalWorkers: contractorTotalWorkers,
        totalExpense: contractorTotalExpense,
        isOverridden: isExtraWorkersRate,
        overrideReason: isExtraWorkersRate ? "Extra workers rate override" : undefined,
        notes: notes.trim() || "-",
      });
      setContractorSkilledCount(0);
      setContractorMaleCount(0);
      setContractorFemaleCount(0);
      setIsExtraWorkersRate(false);
      setContractorSkilledRate(baseContractorRates.skilled);
      setContractorMaleRate(baseContractorRates.male);
      setContractorFemaleRate(baseContractorRates.female);
    }

    // Stage Direct Entry
    if (directTotalWorkers > 0) {
      newStaged.push({
        id: `staged-d-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        source: "DIRECT",
        contractorName: "-",
        skilledCount: directSkilledCount,
        skilledRate: directSkilledRate,
        skilledAmount: directSkilledAmount,
        maleCount: directMaleCount,
        maleRate: directMaleRate,
        maleAmount: directMaleAmount,
        femaleCount: directFemaleCount,
        femaleRate: directFemaleRate,
        femaleAmount: directFemaleAmount,
        totalWorkers: directTotalWorkers,
        totalExpense: directTotalExpense,
        notes: directNotes.trim() || "-",
      });
      setDirectSkilledCount(0);
      setDirectMaleCount(0);
      setDirectFemaleCount(0);
      setDirectNotes("");
    }

    setStagedEntries(newStaged);
  };

  const handleDeleteStagedEntry = (id: string) => {
    setStagedEntries((prev) => prev.filter((e) => e.id !== id));
    if (editingStagedId === id) setEditingStagedId(null);
  };

  const handleEditStagedEntry = (entry: StagedHeadcountEntry) => {
    setEditingStagedId(entry.id);
    if (entry.source === "CONTRACTOR") {
      setContractorName(entry.contractorName || "");
      setSelectedContractorId(entry.contractorId || "");
      setContractorSkilledCount(entry.skilledCount);
      setContractorMaleCount(entry.maleCount);
      setContractorFemaleCount(entry.femaleCount);
      setContractorSkilledRate(entry.skilledRate);
      setContractorMaleRate(entry.maleRate);
      setContractorFemaleRate(entry.femaleRate);
      setHasContractorRates(true);
      setIsExtraWorkersRate(Boolean(entry.isOverridden));
      setNotes(entry.notes === "-" ? "" : entry.notes || "");
    } else {
      setDirectSkilledCount(entry.skilledCount);
      setDirectMaleCount(entry.maleCount);
      setDirectFemaleCount(entry.femaleCount);
      setDirectSkilledRate(entry.skilledRate);
      setDirectMaleRate(entry.maleRate);
      setDirectFemaleRate(entry.femaleRate);
      setDirectNotes(entry.notes === "-" ? "" : entry.notes || "");
    }
  };

  const handleSaveAllHeadcounts = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!modalSiteId) {
      setErrorMessage("Please select a target site.");
      return;
    }

    let entriesToSubmit: StagedHeadcountEntry[] = [];

    if (editingRecordId) {
      // Direct update of the single existing headcount record
      const existingRec = records.find((r) => r.id === editingRecordId);
      const isDirect = existingRec?.source === "DIRECT" || (contractorTotalWorkers === 0 && directTotalWorkers > 0);

      if (isDirect) {
        if (directTotalWorkers === 0) {
          setErrorMessage("Please enter direct worker counts before saving.");
          return;
        }
        entriesToSubmit.push({
          id: editingRecordId,
          source: "DIRECT",
          contractorName: "-",
          skilledCount: directSkilledCount,
          skilledRate: directSkilledRate,
          skilledAmount: directSkilledAmount,
          maleCount: directMaleCount,
          maleRate: directMaleRate,
          maleAmount: directMaleAmount,
          femaleCount: directFemaleCount,
          femaleRate: directFemaleRate,
          femaleAmount: directFemaleAmount,
          totalWorkers: directTotalWorkers,
          totalExpense: directTotalExpense,
          notes: directNotes.trim() || "-",
        });
      } else {
        if (contractorTotalWorkers === 0) {
          setErrorMessage("Please enter contractor worker counts before saving.");
          return;
        }
        if (!contractorName.trim()) {
          setErrorMessage("Contractor / Labour Agency is MANDATORY when adding Contractor Workforce. Please select or enter a contractor.");
          setIsContractorDropdownOpen(true);
          return;
        }
        entriesToSubmit.push({
          id: editingRecordId,
          source: "CONTRACTOR",
          contractorId: selectedContractorId || undefined,
          contractorName: contractorName.trim(),
          skilledCount: contractorSkilledCount,
          skilledRate: contractorSkilledRate,
          skilledAmount: contractorSkilledAmount,
          maleCount: contractorMaleCount,
          maleRate: contractorMaleRate,
          maleAmount: contractorMaleAmount,
          femaleCount: contractorFemaleCount,
          femaleRate: contractorFemaleRate,
          femaleAmount: contractorFemaleAmount,
          totalWorkers: contractorTotalWorkers,
          totalExpense: contractorTotalExpense,
          isOverridden: isExtraWorkersRate,
          overrideReason: isExtraWorkersRate ? "Extra workers rate override" : undefined,
          notes: notes.trim() || "-",
        });
      }
    } else {
      // 1. If currently editing a staged entry, update that entry in the list with current form values
      if (editingStagedId) {
        entriesToSubmit = stagedEntries.map((entry) => {
          if (entry.id !== editingStagedId) return entry;
          if (entry.source === "CONTRACTOR") {
            return {
              ...entry,
              contractorId: selectedContractorId || undefined,
              contractorName: contractorName.trim(),
              skilledCount: contractorSkilledCount,
              skilledRate: contractorSkilledRate,
              skilledAmount: contractorSkilledAmount,
              maleCount: contractorMaleCount,
              maleRate: contractorMaleRate,
              maleAmount: contractorMaleAmount,
              femaleCount: contractorFemaleCount,
              femaleRate: contractorFemaleRate,
              femaleAmount: contractorFemaleAmount,
              totalWorkers: contractorTotalWorkers,
              totalExpense: contractorTotalExpense,
              isOverridden: isExtraWorkersRate,
              overrideReason: isExtraWorkersRate ? "Extra workers rate override" : undefined,
              notes: notes.trim() || "-",
            };
          } else {
            return {
              ...entry,
              skilledCount: directSkilledCount,
              skilledRate: directSkilledRate,
              skilledAmount: directSkilledAmount,
              maleCount: directMaleCount,
              maleRate: directMaleRate,
              maleAmount: directMaleAmount,
              femaleCount: directFemaleCount,
              femaleRate: directFemaleRate,
              femaleAmount: directFemaleAmount,
              totalWorkers: directTotalWorkers,
              totalExpense: directTotalExpense,
              notes: directNotes.trim() || "-",
            };
          }
        });
      } else {
        entriesToSubmit = [...stagedEntries];

        // If active form values are present, include them as well
        if (contractorTotalWorkers > 0) {
          if (!contractorName.trim()) {
            setErrorMessage("Contractor / Labour Agency is MANDATORY when adding Contractor Workforce. Please select or enter a contractor.");
            setIsContractorDropdownOpen(true);
            return;
          }
          entriesToSubmit.push({
            id: `staged-c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            source: "CONTRACTOR",
            contractorId: selectedContractorId || undefined,
            contractorName: contractorName.trim(),
            skilledCount: contractorSkilledCount,
            skilledRate: contractorSkilledRate,
            skilledAmount: contractorSkilledAmount,
            maleCount: contractorMaleCount,
            maleRate: contractorMaleRate,
            maleAmount: contractorMaleAmount,
            femaleCount: contractorFemaleCount,
            femaleRate: contractorFemaleRate,
            femaleAmount: contractorFemaleAmount,
            totalWorkers: contractorTotalWorkers,
            totalExpense: contractorTotalExpense,
            isOverridden: isExtraWorkersRate,
            overrideReason: isExtraWorkersRate ? "Extra workers rate override" : undefined,
            notes: notes.trim() || "-",
          });
        }
        if (directTotalWorkers > 0) {
          entriesToSubmit.push({
            id: `staged-d-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            source: "DIRECT",
            contractorName: "-",
            skilledCount: directSkilledCount,
            skilledRate: directSkilledRate,
            skilledAmount: directSkilledAmount,
            maleCount: directMaleCount,
            maleRate: directMaleRate,
            maleAmount: directMaleAmount,
            femaleCount: directFemaleCount,
            femaleRate: directFemaleRate,
            femaleAmount: directFemaleAmount,
            totalWorkers: directTotalWorkers,
            totalExpense: directTotalExpense,
            notes: directNotes.trim() || "-",
          });
        }
      }
    }

    if (entriesToSubmit.length === 0) {
      setErrorMessage("No entries to save.");
      return;
    }

    const invalidContractorEntry = entriesToSubmit.find(
      (e) => e.source === "CONTRACTOR" && (!e.contractorName || !e.contractorName.trim() || e.contractorName === "-" || e.contractorName === "Contractor Agency")
    );
    if (invalidContractorEntry) {
      setErrorMessage("Contractor / Labour Agency is MANDATORY for all contractor workforce entries. Please provide a contractor name.");
      setIsContractorDropdownOpen(true);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const selectedProj = siteProjects.find((p) => p.id === modalProjectId);
      const projTag = selectedProj ? `[Project: ${selectedProj.name} (${selectedProj.code})]` : "";

      const payload = {
        entries: entriesToSubmit.map((entry) => {
          let entryNotes = entry.notes === "-" ? "" : (entry.notes || "");
          if (projTag && !entryNotes.includes(projTag)) {
            entryNotes = entryNotes ? `${projTag} ${entryNotes}` : projTag;
          }

          return {
            id: entry.id && !entry.id.startsWith("staged-") ? entry.id : undefined,
            siteId: modalSiteId,
            projectId: modalProjectId || undefined,
            date: modalDate,
            shift: modalShift,
            source: entry.source,
            contractorId: entry.contractorId || undefined,
            contractorName: entry.source === "CONTRACTOR" ? (entry.contractorName || undefined) : undefined,
            artisanCount: entry.skilledCount,
            skilledCount: entry.skilledCount,
            laborerMale: entry.maleCount,
            maleCount: entry.maleCount,
            laborerFemale: entry.femaleCount,
            femaleCount: entry.femaleCount,
            skilledRate: Math.round(entry.skilledRate * 100),
            skilledAmount: Math.round(entry.skilledAmount * 100),
            maleRate: Math.round(entry.maleRate * 100),
            maleAmount: Math.round(entry.maleAmount * 100),
            femaleRate: Math.round(entry.femaleRate * 100),
            femaleAmount: Math.round(entry.femaleAmount * 100),
            totalExpense: Math.round(entry.totalExpense * 100),
            rateUnit: "DAY",
            isOverridden: Boolean(entry.isOverridden),
            overrideReason: entry.overrideReason || (entry.isOverridden ? "Extra workers rate override" : undefined),
            notes: entryNotes || undefined,
          };
        }),
      };

      const res = await fetch("/api/workforce/headcount", {
        method: editingRecordId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to save headcount entries");
      } else {
        let savedRecordId = editingRecordId;
        if (!savedRecordId && data?.data) {
          if (Array.isArray(data.data?.entries) && data.data.entries[0]?.id) {
            savedRecordId = data.data.entries[0].id;
          } else if (data.data?.id) {
            savedRecordId = data.data.id;
          }
        }

        // Upload any selected photos linked to this record
        if (headcountPhotos.length > 0 && savedRecordId) {
          setIsUploadingPhotos(true);
          try {
            for (const photo of headcountPhotos) {
              await uploadClientMedia(photo, {
                entityType: "WORKFORCE",
                entityId: savedRecordId,
                projectId: modalProjectId || undefined,
                category: "SITE_PHOTO",
              });
            }
          } catch (uploadErr) {
            console.warn("Failed to upload headcount photos:", uploadErr);
          } finally {
            setIsUploadingPhotos(false);
          }
        }

        const siteName = sites.find((s) => s.id === modalSiteId)?.name || "Site";
        const totalWorkersCount = entriesToSubmit.reduce((s, e) => s + e.totalWorkers, 0);
        const totalExpenseAmt = entriesToSubmit.reduce((s, e) => s + e.totalExpense, 0);

        if (editingRecordId) {
          setStatusMessage(
            `Successfully updated headcount record (${totalWorkersCount} workers, ₹${totalExpenseAmt.toLocaleString("en-IN")}) for ${siteName} on ${formatDate(modalDate)}!`
          );
        } else {
          setStatusMessage(
            `Successfully saved ${entriesToSubmit.length} headcount entries (${totalWorkersCount} workers, ₹${totalExpenseAmt.toLocaleString("en-IN")}) for ${siteName} on ${formatDate(modalDate)}!`
          );
        }

        setShowUploadModal(false);
        setEditingRecordId(null);
        setStagedEntries([]);
        headcountPhotoPreviews.forEach((p) => URL.revokeObjectURL(p.url));
        setHeadcountPhotos([]);
        setHeadcountPhotoPreviews([]);
        setExistingAttachments([]);
        await loadData();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Network error saving worker headcount");
    } finally {
      setSubmitting(false);
    }
  };

  const fetchReports = async () => {
    setReportsLoading(true);
    try {
      const q = selectedSiteId ? `&siteId=${encodeURIComponent(selectedSiteId)}` : "";
      const res = await fetch(`/api/workforce/headcount?reports=true${q}`);
      const json = await res.json();
      if (json.success) {
        setReportsData(json.data);
      }
    } catch (err) {
      console.warn("Failed to fetch reports:", err);
    } finally {
      setReportsLoading(false);
    }
  };

  const openReportsModal = () => {
    setShowReportsModal(true);
    fetchReports();
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

  const handleDeleteWorker = (w: WorkerRosterItem) => {
    setPendingDeleteWorker({ id: w.id, name: w.name, employeeCode: w.employeeCode });
  };

  const executeDeleteWorker = async () => {
    if (!pendingDeleteWorker) return;
    const { id, name, employeeCode } = pendingDeleteWorker;
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/workforce?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to delete worker");
      } else {
        setStatusMessage(`Worker "${name}" (${employeeCode}) deleted successfully.`);
        setWorkers((prev) => prev.filter((w) => w.id !== id));
        if (editingWorker?.id === id) {
          setShowRegisterWorkerModal(false);
          setEditingWorker(null);
        }
        await loadData();
      }
    } catch {
      setErrorMessage("Network error deleting worker");
    } finally {
      setSubmitting(false);
      setPendingDeleteWorker(null);
    }
  };

  const executeClearAllWorkers = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/workforce?all=true", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to clear registered workers");
      } else {
        setStatusMessage("All registered workers removed from the roster.");
        setWorkers([]);
        await loadData();
      }
    } catch {
      setErrorMessage("Network error clearing registered workers");
    } finally {
      setSubmitting(false);
      setShowClearWorkersModal(false);
    }
  };

  // Register worker submit handler
  const openCreateWorkerModal = async () => {
    setEditingWorker(null);
    setSelectedContractorPartyId("");
    setDuplicateWarning(null);
    setWorkerName("");
    setEmployeeCode("");
    setWorkerType("MASON");
    setWorkerPhone("");
    setWorkerDailyWage("");
    setWorkerMaleHelperWage("");
    setWorkerFemaleHelperWage("");
    setIsGeneratingCode(true);
    setShowRegisterWorkerModal(true);

    try {
      const codeRes = await fetch("/api/workforce/next-code", { cache: "no-store" });
      const codeData = await codeRes.json();
      if (codeData?.success && codeData.data?.nextCode) {
        setEmployeeCode(codeData.data.nextCode);
      } else {
        setEmployeeCode(`WRK-${Date.now().toString().slice(-4)}`);
      }
    } catch {
      setEmployeeCode(`WRK-${Date.now().toString().slice(-4)}`);
    } finally {
      setIsGeneratingCode(false);
    }

    // Refresh contractor list so any newly added contractors appear immediately
    try {
      setLoadingContractors(true);
      setContractorFetchError(null);
      const res = await fetch(`/api/parties?type=CONTRACTOR&_t=${Date.now()}`);
      const pData = await res.json();
      if (pData?.success && Array.isArray(pData.data)) {
        setParties(pData.data);
      }
    } catch {
      setContractorFetchError("Could not refresh contractors list");
    } finally {
      setLoadingContractors(false);
    }
  };

  const openEditWorkerModal = (w: WorkerRosterItem) => {
    setEditingWorker(w);
    setSelectedContractorPartyId(w.contractorId || "");
    setDuplicateWarning(null);
    setWorkerName(w.name || "");
    setEmployeeCode(w.employeeCode || "");
    setWorkerType(w.workerType || "MASON");
    setWorkerPhone(w.phone || "");
    setWorkerDailyWage(w.dailyWageRate ? String(w.dailyWageRate / 100) : "");
    setWorkerMaleHelperWage(w.maleHelperWageRate ? String(w.maleHelperWageRate / 100) : "");
    setWorkerFemaleHelperWage(w.femaleHelperWageRate ? String(w.femaleHelperWageRate / 100) : "");
    setShowRegisterWorkerModal(true);
  };

  const handleRegisterWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerName.trim()) {
      setErrorMessage("Please select a contractor or enter worker name");
      return;
    }
    if (!employeeCode.trim()) {
      setErrorMessage("Worker ID code is required");
      return;
    }
    if (workerPhone.trim() && !validateWorkerPhone(workerPhone.trim())) {
      setErrorMessage("Phone number must contain between 10 and 15 digits");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const payload: Record<string, unknown> = {
        name: workerName.trim(),
        employeeCode: employeeCode.trim(),
        workerType,
        phone: workerPhone.trim() || (editingWorker ? null : undefined),
        contractorId: selectedContractorPartyId || (editingWorker ? editingWorker.contractorId ?? null : undefined),
        defaultSiteId: selectedSiteId || (editingWorker ? editingWorker.defaultSiteId ?? null : undefined),
        dailyWageRate: workerDailyWage
          ? Math.round(parseFloat(workerDailyWage) * 100)
          : editingWorker
          ? null
          : undefined, // stored in paise
        maleHelperWageRate: workerMaleHelperWage
          ? Math.round(parseFloat(workerMaleHelperWage) * 100)
          : editingWorker
          ? null
          : undefined,
        femaleHelperWageRate: workerFemaleHelperWage
          ? Math.round(parseFloat(workerFemaleHelperWage) * 100)
          : editingWorker
          ? null
          : undefined,
      };
      if (editingWorker) {
        payload.id = editingWorker.id;
      }

      const res = await fetch("/api/workforce", {
        method: editingWorker ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || `Failed to ${editingWorker ? "update" : "register"} worker`);
      } else {
        setStatusMessage(
          editingWorker
            ? `Worker ${data.data.name} (${data.data.employeeCode}) updated!`
            : `Worker ${data.data.name} (${data.data.employeeCode}) registered!`
        );
        setShowRegisterWorkerModal(false);
        setEditingWorker(null);
        setSelectedContractorPartyId("");
        setDuplicateWarning(null);
        setWorkerName("");
        setEmployeeCode("");
        setWorkerPhone("");
        setWorkerDailyWage("");
        setWorkerMaleHelperWage("");
        setWorkerFemaleHelperWage("");
        await loadData();
      }
    } catch {
      setErrorMessage(`Network error ${editingWorker ? "updating" : "registering"} worker`);
    } finally {
      setSubmitting(false);
    }
  };

  // Filter records for the selected site and date
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
      if (selectedDate && r.date !== selectedDate) return false;
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
  }, [records, selectedSiteId, selectedProjectId, selectedDate, projects, searchQuery]);

  // Selected site summary for report date (aggregating all entries for that site/all sites and date)
  const selectedSiteTodayRecord = useMemo(() => {
    if (!selectedDate) return null;
    const matching = records.filter((r) => (!selectedSiteId || r.siteId === selectedSiteId) && r.date === selectedDate);
    if (matching.length === 0) return null;
    const artisanTotal = matching.reduce((sum, r) => sum + (r.artisanCount ?? r.artisanTotal ?? 0), 0);
    return {
      siteId: selectedSiteId || "ALL",
      date: selectedDate,
      grandTotal: matching.reduce((sum, r) => sum + (Number(r.grandTotal) || 0), 0),
      artisanCount: artisanTotal,
      artisanTotal: artisanTotal,
      laborerTotal: matching.reduce((sum, r) => sum + (r.laborerTotal ?? 0), 0),
      laborerMale: matching.reduce((sum, r) => sum + (r.laborerMale ?? 0), 0),
      laborerFemale: matching.reduce((sum, r) => sum + (r.laborerFemale ?? 0), 0),
      totalExpense: matching.reduce((sum, r) => sum + (Number(r.totalExpense) || 0), 0),
    };
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
        key: "contractor",
        label: "Contractor / Vendor",
        accessor: (r) => r.contractorName || r.contractor?.name || "Direct Site",
        type: "text",
      },
      {
        key: "date",
        label: "Date & Shift",
        accessor: (r) => r.date,
        type: "date",
      },
      {
        key: "grandTotal",
        label: "Total Workers",
        accessor: (r) => `${Number(r.grandTotal) || 0} Workers (Artisans: ${r.artisanCount ?? r.artisanTotal ?? 0}, Laborers: ${r.laborerTotal} [M: ${r.laborerMale}, F: ${r.laborerFemale}])`,
        type: "text",
        align: "left",
      },
      {
        key: "rates",
        label: "Applied Rates (Day)",
        accessor: (r) =>
          `₹${Math.round((r.skilledRate || 0) / 100)} / ₹${Math.round((r.maleRate || 0) / 100)} / ₹${Math.round((r.femaleRate || 0) / 100)}${
            r.isOverridden ? " (Extra Workers)" : ""
          }`,
        type: "text",
        align: "center",
      },
      {
        key: "totalExpense",
        label: "Labour Expense",
        accessor: (r) => (Number(r.totalExpense) || 0) / 100,
        type: "currency",
        align: "right",
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

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {canWrite && (
              <button
                type="button"
                onClick={openCreateWorkerModal}
                className="flex items-center gap-1.5 px-3.5 h-9 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold rounded-xl text-xs shadow-sm transition transform active:scale-98 cursor-pointer whitespace-nowrap shrink-0"
                title="Register a new skilled worker, artisan, or trade specialist"
              >
                <UserPlus className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Register Worker</span>
              </button>
            )}

            {canWrite && (
              <button
                onClick={() => openUploadModal()}
                className="flex items-center gap-1.5 px-4 h-9 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-sm transition transform active:scale-98 cursor-pointer whitespace-nowrap shrink-0"
                title="Supervisor: Upload daily site worker count"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>Upload Site Headcount</span>
              </button>
            )}

            {canWrite && activeTab === "roster" && workers.length > 0 && (
              <button
                type="button"
                onClick={() => setShowClearWorkersModal(true)}
                className="flex items-center gap-1.5 px-3 h-9 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs transition shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
                title="Remove all registered workers from the roster"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>Clear Worker Roster</span>
              </button>
            )}

            <button
              onClick={loadData}
              disabled={loading}
              className="w-9 h-9 flex items-center justify-center border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl transition shadow-2xs shrink-0 cursor-pointer"
              title="Refresh worker records"
            >
              <RefreshCw className={`w-4 h-4 shrink-0 ${loading ? "animate-spin text-amber-500" : ""}`} />
            </button>
          </div>
        </div>

        {/* Feedback Alerts */}
        {statusMessage && <Alert tone="success">{statusMessage}</Alert>}
        {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

        {/* Single Site Selector & Navigation Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
            {/* Target Site Selector */}
            <div className="w-full sm:w-auto min-w-[200px]">
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
              <div className="w-full sm:w-auto min-w-[180px]">
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
            <div className="w-full sm:w-auto">
              <div className="flex items-center justify-between gap-1 mb-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Report Date:
                </label>
                {selectedDate && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate("")}
                    className="text-[10px] text-amber-600 hover:text-amber-800 font-bold hover:underline cursor-pointer"
                    title="Clear date filter to view all historical dates"
                  >
                    (✕ All Dates)
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full sm:w-auto bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                {!selectedDate && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(istDateKey())}
                    className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-[11px] font-bold transition whitespace-nowrap cursor-pointer"
                  >
                    Today
                  </button>
                )}
              </div>
            </div>

            {/* Today's Site Status Tag */}
            <div className="w-full sm:w-auto sm:self-end sm:pb-0.5">
              {selectedSiteTodayRecord ? (
                <div className="inline-flex w-full sm:w-auto justify-center sm:justify-start items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Today Logged: {selectedSiteTodayRecord.grandTotal} Workers</span>
                </div>
              ) : (
                <div className="inline-flex w-full sm:w-auto justify-center sm:justify-start items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-300 text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
                  <span>Pending Today&apos;s Headcount</span>
                </div>
              )}
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs font-bold w-full xl:w-auto shrink-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setActiveTab("headcount")}
              className={`flex-1 xl:flex-initial whitespace-nowrap shrink-0 px-3 py-1.5 rounded-lg transition text-center ${
                activeTab === "headcount"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Daily Site Headcount ({filteredRecords.length})
            </button>
            <button
              onClick={() => setActiveTab("roster")}
              className={`flex-1 xl:flex-initial whitespace-nowrap shrink-0 px-3 py-1.5 rounded-lg transition text-center ${
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
                  {selectedDate
                    ? selectedSiteTodayRecord
                      ? `Logged for ${formatDate(selectedDate)}`
                      : `No entries on ${formatDate(selectedDate)}`
                    : "Cumulative logged count across all dates"}
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
                  title={String(selectedSiteTodayRecord ? selectedSiteTodayRecord.artisanCount : siteTotalArtisan)}
                >
                  {formatCompactNumber(selectedSiteTodayRecord ? selectedSiteTodayRecord.artisanCount : siteTotalArtisan)}
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
                  M: {selectedSiteTodayRecord ? selectedSiteTodayRecord.laborerMale : siteLaborerMale} &bull; F: {selectedSiteTodayRecord ? selectedSiteTodayRecord.laborerFemale : siteLaborerFemale}
                </div>
              </div>
            </div>

            {/* Daily Headcount Deployment Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70">
                <div>
                  <h2 className="font-black text-sm text-slate-900 tracking-tight flex items-center gap-2">
                    <HardHat className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Deployment Log: {currentSelectedSite?.name || "Single Site"}</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Supervisor daily trade count submissions with gender distribution and contractor reference.
                  </p>
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
                <div>
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
                          {/* Contractor / Vendor */}
                          <td className="py-3.5 px-4 text-slate-700">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {r.contractorName ? (
                                <span className="font-semibold text-slate-800">{r.contractorName}</span>
                              ) : (
                                <span className="text-slate-400 italic">Direct / Self</span>
                              )}
                              {r.isOverridden && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  Extra Workers
                                </span>
                              )}
                              {r.attachments && r.attachments.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setActivePhotoLightbox(r.attachments![0].url)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300 transition cursor-pointer"
                                  title={`View ${r.attachments.length} attached muster roll photo(s)`}
                                >
                                  <Camera className="w-3 h-3 text-amber-700" />
                                  <span>{r.attachments.length} {r.attachments.length === 1 ? "Photo" : "Photos"}</span>
                                </button>
                              )}
                            </div>
                            {(!selectedSiteId || selectedSiteId === "ALL") && r.siteName && (
                              <div className="mt-0.5">
                                <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                                  {r.siteName}
                                </span>
                              </div>
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

                          {/* Date & Shift */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-bold text-slate-900">{formatDate(r.date)}</div>
                            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 font-bold text-slate-700">
                                {r.shift} SHIFT
                              </span>
                            </div>
                          </td>

                          {/* Total Workforce with Breakdown */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-black font-mono text-xs border border-emerald-200">
                              {r.grandTotal} {r.grandTotal === 1 ? "Worker" : "Workers"}
                            </span>
                            <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                              <span>
                                Artisans: <strong className="text-slate-700">{r.artisanCount ?? r.artisanTotal ?? 0}</strong>
                              </span>
                              <span className="text-slate-300">&bull;</span>
                              <span>
                                Laborers: <strong className="text-slate-700">{r.laborerTotal}</strong>{" "}
                                <span className="text-slate-500 font-medium">
                                  (M: {r.laborerMale}, F: {r.laborerFemale})
                                </span>
                              </span>
                            </div>
                          </td>

                          {/* Applied Rates */}
                          <td className="py-3.5 px-4 whitespace-nowrap text-center">
                            <div className="font-mono text-slate-800 font-bold text-xs inline-flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                              <span title="Skilled Worker Rate">₹{Math.round((r.skilledRate || 0) / 100)}</span>
                              <span className="text-slate-300 font-normal">/</span>
                              <span title="Male Labour Rate">₹{Math.round((r.maleRate || 0) / 100)}</span>
                              <span className="text-slate-300 font-normal">/</span>
                              <span title="Female Labour Rate">₹{Math.round((r.femaleRate || 0) / 100)}</span>
                            </div>
                            <div className="text-[9px] text-slate-400 mt-0.5">
                              Skilled / Male / Female
                            </div>
                            {r.isOverridden ? (
                              <div className="mt-1">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  ⚡ Extra Workers Rate
                                </span>
                              </div>
                            ) : (
                              <div className="mt-1">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-sky-50 text-sky-700">
                                  Rate Card
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Labour Expense */}
                          <td className="py-3.5 px-4 whitespace-nowrap text-right">
                            <div className="font-bold font-mono text-emerald-700">
                              {r.totalExpense ? `₹${Math.round(r.totalExpense / 100).toLocaleString("en-IN")}` : "—"}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {r.isOverridden ? (
                                <span className="text-amber-700 font-bold">Extra Workers Rate</span>
                              ) : r.source === "DIRECT" ? (
                                "Direct Labour"
                              ) : r.contractorName ? (
                                "Contractor Rate"
                              ) : (
                                "Direct Rate"
                              )}
                            </div>
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
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 text-sm truncate flex items-center gap-1.5 flex-wrap">
                              <span>{r.contractorName || "Direct Site / Self"}</span>
                              {r.isOverridden && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  Extra Workers
                                </span>
                              )}
                              {r.attachments && r.attachments.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setActivePhotoLightbox(r.attachments![0].url)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300 transition cursor-pointer"
                                  title={`View ${r.attachments.length} attached muster roll photo(s)`}
                                >
                                  <Camera className="w-3 h-3 text-amber-700" />
                                  <span>{r.attachments.length} {r.attachments.length === 1 ? "Photo" : "Photos"}</span>
                                </button>
                              )}
                            </div>
                            {(!selectedSiteId || selectedSiteId === "ALL") && r.siteName && (
                              <div className="mt-0.5">
                                <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                                  {r.siteName}
                                </span>
                              </div>
                            )}
                            <div className="text-xs text-slate-500 font-mono mt-1 flex items-center gap-1.5 min-w-0">
                              <span className="font-semibold text-slate-700">{formatDate(r.date)}</span>
                              <span className="shrink-0">·</span>
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 font-bold text-slate-700 shrink-0 whitespace-nowrap">
                                {r.shift} SHIFT
                              </span>
                            </div>
                            <div className="text-[10px] font-mono text-slate-600 mt-1">
                              Rates: ₹{Math.round((r.skilledRate || 0) / 100)} / ₹{Math.round((r.maleRate || 0) / 100)} / ₹{Math.round((r.femaleRate || 0) / 100)}
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <span className="inline-block whitespace-nowrap px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-black font-mono text-xs border border-emerald-200">
                              {r.grandTotal} {r.grandTotal === 1 ? "Worker" : "Workers"}
                            </span>
                            <div className="text-[10px] text-slate-500 mt-1 text-right">
                              Artisans: <strong className="text-slate-700">{r.artisanCount ?? r.artisanTotal ?? 0}</strong> &bull; Laborers: <strong className="text-slate-700">{r.laborerTotal}</strong> (M: {r.laborerMale}, F: {r.laborerFemale})
                            </div>
                            {r.totalExpense ? (
                              <div className="font-mono font-bold text-emerald-700 text-xs mt-1">
                                ₹{Math.round(r.totalExpense / 100).toLocaleString("en-IN")}
                              </div>
                            ) : null}
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
                  onClick={openCreateWorkerModal}
                  className="flex w-full sm:w-auto items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold rounded-xl text-xs transition"
                >
                  <UserPlus className="w-3.5 h-3.5 shrink-0" />
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
            <div className="hidden lg:block overflow-x-auto md:min-h-[400px]">
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
                    {canWrite && <th className="py-3 px-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {excelWorkers.paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={workerColumns.length + (canWrite ? 1 : 0)} className="py-12 text-center text-slate-400">
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
                        <div>{w.dailyWageRate ? `₹${(w.dailyWageRate / 100).toLocaleString("en-IN")}/day` : "—"}</div>
                        {(w.maleHelperWageRate || w.femaleHelperWageRate) && (
                          <div className="text-[10px] font-normal text-slate-500 mt-0.5 whitespace-nowrap">
                            {[
                              w.maleHelperWageRate ? `M: ₹${(w.maleHelperWageRate / 100).toLocaleString("en-IN")}` : null,
                              w.femaleHelperWageRate ? `F: ₹${(w.femaleHelperWageRate / 100).toLocaleString("en-IN")}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{w.defaultSite?.name || "Main Site"}</td>
                      {canWrite && (
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditWorkerModal(w)}
                              title={`Edit ${w.name}`}
                              className="p-1.5 rounded-lg ring-1 ring-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center justify-center transition"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteWorker(w)}
                              title={`Delete ${w.name}`}
                              className="p-1.5 rounded-lg ring-1 ring-rose-200 text-rose-600 hover:text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
            {/* Mobile & Tablet Registered Workers Cards (< lg screens) */}
            <div className="lg:hidden p-3 bg-slate-50/60 space-y-3">
              {excelWorkers.paginatedData.length === 0 ? (
                <div className="py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                  <Filter className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">No registered workers found</p>
                  <p className="text-xs text-slate-400">No registered workers match your search or filters.</p>
                </div>
              ) : (
                excelWorkers.paginatedData.map((w) => (
                  <div key={`wk-card-${w.id}`} className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-xs space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-sm truncate">{w.name}</div>
                        <div className="text-[11px] font-mono text-slate-400">{w.employeeCode}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <span className="font-mono text-xs font-bold text-slate-800 whitespace-nowrap block">
                            {w.dailyWageRate ? `₹${(w.dailyWageRate / 100).toLocaleString("en-IN")}/day` : "—"}
                          </span>
                          {(w.maleHelperWageRate || w.femaleHelperWageRate) && (
                            <span className="font-mono text-[10px] text-slate-500 whitespace-nowrap block">
                              {[
                                w.maleHelperWageRate ? `M: ₹${(w.maleHelperWageRate / 100).toLocaleString("en-IN")}` : null,
                                w.femaleHelperWageRate ? `F: ₹${(w.femaleHelperWageRate / 100).toLocaleString("en-IN")}` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </div>
                        {canWrite && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => openEditWorkerModal(w)}
                              title={`Edit ${w.name}`}
                              className="p-1.5 rounded-lg ring-1 ring-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center justify-center transition"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteWorker(w)}
                              title={`Delete ${w.name}`}
                              className="p-1.5 rounded-lg ring-1 ring-rose-200 text-rose-600 hover:text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold font-mono text-[11px] whitespace-nowrap">
                          {w.workerType}
                        </span>
                        <span className="text-slate-500 truncate">{w.defaultSite?.name || "Main Site"}</span>
                      </div>
                      {w.phone && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-mono text-slate-600 whitespace-nowrap">{w.phone}</span>
                          <ContactActions phone={w.phone} message={`Namaste ${w.name},`} />
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
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

        {/* Modal: Upload Site Workforce Headcount (Contractor Rate Automation & Direct Labour Cost Management) */}
        {showUploadModal && canWrite && (
          <div className="fixed inset-0 z-[70] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 max-h-[92dvh] flex flex-col overflow-hidden animate-scale-in my-auto">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 sm:p-5 pb-3 border-b border-slate-100 shrink-0 bg-white">
                <div>
                  <h3 className="font-black text-slate-900 text-base sm:text-lg flex items-center gap-2">
                    {editingRecordId ? (
                      <Edit2 className="w-5 h-5 text-amber-500" />
                    ) : (
                      <Users className="w-5 h-5 text-amber-500" />
                    )}
                    <span>{editingRecordId ? "Edit Site Worker Headcount" : "Upload Site Worker Headcount"}</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {editingRecordId
                      ? "Update worker counts, contractor rates, or site deployment details."
                      : "Enter daily counts of skilled workers and general laborers for this site."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadModal(false);
                    setEditingRecordId(null);
                    setExistingAttachments([]);
                    headcountPhotoPreviews.forEach((p) => URL.revokeObjectURL(p.url));
                    setHeadcountPhotos([]);
                    setHeadcountPhotoPreviews([]);
                    setPhotoUploadError(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
                {/* 1. Common Selectors: Site, Project, Date & Shift */}
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
                          ? "All Projects"
                          : "All Projects"}
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

                {/* 2. Contractor / Labour Agency Selection */}
                <div
                  className={`p-3 rounded-xl border relative transition-colors ${
                    contractorTotalWorkers > 0 && !contractorName.trim()
                      ? "bg-rose-50/50 border-rose-300 ring-1 ring-rose-200"
                      : "bg-slate-50/70 border-slate-200"
                  }`}
                  ref={contractorDropdownRef}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <label className="text-[10px] uppercase font-bold text-slate-700 block">
                        Contractor / Labour Agency:
                      </label>
                      {contractorTotalWorkers > 0 ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black tracking-wide uppercase bg-rose-100 text-rose-700 border border-rose-300 animate-pulse">
                          * MANDATORY
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-500">
                          (Optional if only logging Direct Workforce)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {hasContractorRates ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Rates Loaded</span>
                        </span>
                      ) : contractorName ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span>No Rates Configured</span>
                        </span>
                      ) : null}
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
                  </div>

                  {/* Searchable Combobox Input */}
                  <div className="relative">
                    <Search
                      className={`w-3.5 h-3.5 absolute left-2.5 top-2.5 pointer-events-none ${
                        contractorTotalWorkers > 0 && !contractorName.trim()
                          ? "text-rose-400"
                          : "text-slate-400"
                      }`}
                    />
                    <input
                      type="text"
                      placeholder="Search contractor or agency (or type custom)..."
                      value={contractorSearchQuery !== "" ? contractorSearchQuery : contractorName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setContractorSearchQuery(val);
                        setContractorName(val);
                        setIsContractorDropdownOpen(true);
                      }}
                      onFocus={() => setIsContractorDropdownOpen(true)}
                      className={`w-full pl-8 pr-14 rounded-lg px-2.5 py-2 text-xs font-medium focus:outline-none transition ${
                        contractorTotalWorkers > 0 && !contractorName.trim()
                          ? "bg-white border-2 border-rose-500 ring-2 ring-rose-200 text-rose-950 placeholder-rose-300"
                          : "bg-white border border-slate-300 text-slate-800 focus:ring-2 focus:ring-amber-500"
                      }`}
                    />
                    <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
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

                  {/* Mandatory Error Alert Banner */}
                  {contractorTotalWorkers > 0 && !contractorName.trim() && (
                    <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-700 text-xs">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <div className="font-semibold">
                        Contractor / Labour Agency is <span className="underline font-black">MANDATORY</span> because you have entered {contractorTotalWorkers} contractor worker(s) below. Please select or enter a contractor name.
                      </div>
                    </div>
                  )}

                  {/* Quick Select Contractor Pills */}
                  {existingContractors.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-200/80">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-amber-600" />
                          <span>Quick Select Contractor ({existingContractors.length}):</span>
                        </span>
                        {contractorName && (
                          <span className="text-[10px] text-slate-600 truncate max-w-[220px]">
                            Selected: <strong className="text-slate-800 font-bold">{contractorName}</strong>
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                        {existingContractors.map((c) => {
                          const isSelected = contractorName.trim().toLowerCase() === c.trim().toLowerCase();
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => handleSelectContractor(c)}
                              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                                isSelected
                                  ? "bg-amber-500 text-slate-950 font-black shadow-xs border border-amber-600 ring-1 ring-amber-400"
                                  : "bg-white hover:bg-amber-50 text-slate-700 border border-slate-200 hover:border-amber-300"
                              }`}
                            >
                              <span>{c}</span>
                              {isSelected && <Check className="w-3 h-3 text-slate-950 stroke-[3]" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Search Autocomplete Dropdown List */}
                  {isContractorDropdownOpen && (
                    <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 max-h-64 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
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

                      {/* Section 1: Registered Contractors & Labour Agencies */}
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

                      {/* Section 2: Registered Trade Workers Directory */}
                      {filteredWorkersForContractor.length > 0 && (
                        <div>
                          <div className="px-3 py-1 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1 border-t border-slate-100">
                            <HardHat className="w-3 h-3 text-amber-500" />
                            <span>Registered Trade Workers ({filteredWorkersForContractor.length})</span>
                          </div>
                          <div className="py-0.5">
                            {filteredWorkersForContractor.map((w) => {
                              const wageStr = w.dailyWageRate ? ` • ₹${Number(w.dailyWageRate) / 100}/day` : "";
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
                                        {w.workerType}{wageStr}
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
                    </div>
                  )}
                </div>

                {/* 3. Card 1: Contractor Rate Card (Auto-fetched) */}
                <div
                  className={`border rounded-xl p-3 sm:p-4 text-xs space-y-2.5 transition-colors ${
                    isExtraWorkersRate
                      ? "bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/30"
                      : "bg-sky-50/70 border-sky-200"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold text-sky-950 flex items-center gap-1.5">
                      <Briefcase className={`w-4 h-4 ${isExtraWorkersRate ? "text-amber-600" : "text-sky-600"}`} />
                      <span>Contractor Rate Card {isExtraWorkersRate ? "(Extra Workers Override)" : "(Auto-fetched)"}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="flex items-center gap-1.5 cursor-pointer select-none bg-white px-2.5 py-1 rounded-lg border border-sky-300 hover:border-sky-400 transition-colors shadow-2xs">
                        <input
                          type="checkbox"
                          checked={isExtraWorkersRate}
                          onChange={(e) => handleToggleExtraWorkers(e.target.checked)}
                          className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                        />
                        <span className="font-bold text-slate-800 text-xs">
                          Contractor sent extra workers (Change rates)
                        </span>
                      </label>
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                          isExtraWorkersRate ? "bg-amber-200 text-amber-900" : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {isExtraWorkersRate ? "Custom Rates Active" : "Rates per Day"}
                      </span>
                    </div>
                  </div>

                  {!isExtraWorkersRate ? (
                    <div className="grid grid-cols-3 divide-x divide-sky-200/80 pt-1 text-center bg-white/70 rounded-lg p-2.5 border border-sky-100">
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500">Skilled Worker Rate</div>
                        <div className="font-mono font-black text-slate-900 text-base sm:text-lg mt-0.5">
                          ₹{contractorSkilledRate ? contractorSkilledRate.toLocaleString("en-IN") : "0"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500">Male Labour Rate</div>
                        <div className="font-mono font-black text-slate-900 text-base sm:text-lg mt-0.5">
                          ₹{contractorMaleRate ? contractorMaleRate.toLocaleString("en-IN") : "0"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500">Female Labour Rate</div>
                        <div className="font-mono font-black text-slate-900 text-base sm:text-lg mt-0.5">
                          ₹{contractorFemaleRate ? contractorFemaleRate.toLocaleString("en-IN") : "0"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 bg-white rounded-lg p-3 border border-amber-300 shadow-2xs">
                        <div>
                          <label className="text-[10px] font-bold text-amber-950 uppercase block mb-1">
                            Skilled Worker Rate (₹/day)
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">₹</span>
                            <input
                              type="number"
                              min={0}
                              value={contractorSkilledRate || ""}
                              placeholder="0"
                              onChange={(e) => setContractorSkilledRate(Math.max(0, parseInt(e.target.value) || 0))}
                              className="w-full bg-amber-50/50 border border-amber-300 rounded-lg pl-6 pr-2 py-1.5 text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                            />
                          </div>
                          <span className="text-[9px] text-amber-800 font-medium">Extra skilled rate</span>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-amber-950 uppercase block mb-1">
                            Male Labour Rate (₹/day)
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">₹</span>
                            <input
                              type="number"
                              min={0}
                              value={contractorMaleRate || ""}
                              placeholder="0"
                              onChange={(e) => setContractorMaleRate(Math.max(0, parseInt(e.target.value) || 0))}
                              className="w-full bg-amber-50/50 border border-amber-300 rounded-lg pl-6 pr-2 py-1.5 text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                            />
                          </div>
                          <span className="text-[9px] text-amber-800 font-medium">Extra male labour rate</span>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-amber-950 uppercase block mb-1">
                            Female Labour Rate (₹/day)
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">₹</span>
                            <input
                              type="number"
                              min={0}
                              value={contractorFemaleRate || ""}
                              placeholder="0"
                              onChange={(e) => setContractorFemaleRate(Math.max(0, parseInt(e.target.value) || 0))}
                              className="w-full bg-amber-50/50 border border-amber-300 rounded-lg pl-6 pr-2 py-1.5 text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                            />
                          </div>
                          <span className="text-[9px] text-amber-800 font-medium">Extra female labour rate</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-amber-900 bg-amber-100/70 p-2 rounded-lg border border-amber-300 flex items-center justify-between gap-1.5 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>
                            <strong>Extra Workers Rates Active:</strong> Rates are unlocked. Editing these rates updates the Contractor Total and will be recorded in the table.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleExtraWorkers(false)}
                          className="text-[10px] font-bold text-amber-800 underline hover:text-amber-950 shrink-0 cursor-pointer"
                        >
                          Revert to rate card
                        </button>
                      </div>
                    </div>
                  )}

                  {!hasContractorRates && contractorName && !isExtraWorkersRate && (
                    <div className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>
                        Notice: No saved rate card found for &quot;{contractorName}&quot;. Check &quot;Contractor sent extra workers&quot; above to set rates or enter direct rates below.
                      </span>
                    </div>
                  )}
                </div>

                {/* 4. Card 2: Contractor Workforce */}
                <div className="bg-white rounded-xl border border-sky-200/90 p-3.5 sm:p-4 shadow-2xs space-y-2">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                    <UserCheck className="w-4 h-4 text-sky-600" />
                    <span>Contractor Workforce</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                        Skilled Workers
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={contractorSkilledCount || ""}
                        placeholder="0"
                        onChange={(e) => setContractorSkilledCount(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                        Male Labour
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={contractorMaleCount || ""}
                        placeholder="0"
                        onChange={(e) => setContractorMaleCount(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                        Female Labour
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={contractorFemaleCount || ""}
                        placeholder="0"
                        onChange={(e) => setContractorFemaleCount(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                      />
                    </div>

                    <div className="sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Contractor Total</div>
                      <div className="text-xl font-black font-mono text-emerald-600 mt-0.5">
                        ₹{contractorTotalExpense.toLocaleString("en-IN")}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        ({contractorTotalWorkers} Workers)
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. Card 3: Direct / Extra Workforce */}
                <div className="bg-amber-50/50 rounded-xl border border-amber-200/90 p-3.5 sm:p-4 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-amber-950 flex items-center gap-1.5 text-xs">
                      <HardHat className="w-4 h-4 text-amber-600" />
                      <span>Direct / Extra Workforce</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">
                      Independent Rates
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                        Skilled Workers
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          value={directSkilledCount || ""}
                          placeholder="0"
                          onChange={(e) => setDirectSkilledCount(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-14 bg-white border border-amber-300 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-2 text-[10px] font-bold text-slate-400">@ ₹</span>
                          <input
                            type="number"
                            min={0}
                            value={directSkilledRate || ""}
                            placeholder="1,000"
                            onChange={(e) => setDirectSkilledRate(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-white border border-amber-300 rounded-lg pl-7 pr-2 py-1.5 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                        Male Labour
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          value={directMaleCount || ""}
                          placeholder="0"
                          onChange={(e) => setDirectMaleCount(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-14 bg-white border border-amber-300 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-2 text-[10px] font-bold text-slate-400">@ ₹</span>
                          <input
                            type="number"
                            min={0}
                            value={directMaleRate || ""}
                            placeholder="650"
                            onChange={(e) => setDirectMaleRate(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-white border border-amber-300 rounded-lg pl-7 pr-2 py-1.5 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                        Female Labour
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          value={directFemaleCount || ""}
                          placeholder="0"
                          onChange={(e) => setDirectFemaleCount(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-14 bg-white border border-amber-300 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-2 text-[10px] font-bold text-slate-400">@ ₹</span>
                          <input
                            type="number"
                            min={0}
                            value={directFemaleRate || ""}
                            placeholder="550"
                            onChange={(e) => setDirectFemaleRate(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full bg-white border border-amber-300 rounded-lg pl-7 pr-2 py-1.5 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-amber-100">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Direct Total</div>
                      <div className="text-xl font-black font-mono text-amber-600 mt-0.5">
                        ₹{directTotalExpense.toLocaleString("en-IN")}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        ({directTotalWorkers} Workers)
                      </div>
                    </div>
                  </div>

                  {/* Direct workforce optional notes */}
                  <div className="pt-1">
                    <input
                      type="text"
                      placeholder="Optional notes / reason for direct team (e.g. Extra Team, Overtime shuttering)"
                      value={directNotes}
                      onChange={(e) => setDirectNotes(e.target.value)}
                      className="w-full bg-white/90 border border-amber-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* 6. Card 4: Daily Site Labour Expense Summary */}
                <div className="bg-emerald-50/70 rounded-xl border border-emerald-200 p-3 sm:p-4 shadow-2xs space-y-2">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5 text-xs">
                    <Calculator className="w-4 h-4 text-emerald-700" />
                    <span>Daily Site Labour Expense Summary</span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 bg-white/80 p-3 rounded-xl border border-emerald-100">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 font-bold text-xs text-slate-700">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-400 block">Contractor Expense</span>
                        <span className="text-base sm:text-lg font-black font-mono text-emerald-600">
                          ₹{displayContractorExpense.toLocaleString("en-IN")}
                        </span>
                      </div>

                      <span className="text-slate-300 font-bold text-lg">+</span>

                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-400 block">Direct Expense</span>
                        <span className="text-base sm:text-lg font-black font-mono text-emerald-600">
                          ₹{displayDirectExpense.toLocaleString("en-IN")}
                        </span>
                      </div>

                      <span className="text-slate-300 font-bold text-lg">=</span>

                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-400 block">Total Workers</span>
                        <span className="text-base sm:text-lg font-black font-mono text-slate-900">
                          {displayTotalWorkers}
                        </span>
                      </div>
                    </div>

                    <div className="bg-emerald-100/90 border border-emerald-300 rounded-xl px-4 py-2 text-right">
                      <span className="text-[10px] font-bold uppercase text-emerald-800 block">Total Labour Expense</span>
                      <span className="text-lg sm:text-xl font-black font-mono text-emerald-800">
                        ₹{displayTotalExpense.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-600 font-medium text-center">
                    Contractor: {displayContractorWorkers} workers &bull; Direct: {displayDirectWorkers} workers
                  </div>
                </div>

                {/* 7. Added Headcount Entries Section */}
                {!editingRecordId && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <div className="font-black text-slate-900 flex items-center gap-1.5 text-xs sm:text-sm">
                        <Layers className="w-4 h-4 text-blue-600" />
                        <span>Added Headcount Entries ({stagedEntries.length})</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddEntryToList}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-xs transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Add Entry to List</span>
                      </button>
                    </div>

                    {/* Bulk Table */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                      <table className="w-full text-left text-xs min-w-[760px]">
                        <thead className="bg-slate-100/90 text-slate-700 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-2.5 text-center w-8">#</th>
                            <th className="py-2.5 px-2.5">Source</th>
                            <th className="py-2.5 px-3">Contractor</th>
                            <th className="py-2.5 px-2 text-right">Skilled</th>
                            <th className="py-2.5 px-2 text-right">Skilled Rate</th>
                            <th className="py-2.5 px-2 text-right">Skilled Amt</th>
                            <th className="py-2.5 px-2 text-right">Male</th>
                            <th className="py-2.5 px-2 text-right">Male Rate</th>
                            <th className="py-2.5 px-2 text-right">Male Amt</th>
                            <th className="py-2.5 px-2 text-right">Female</th>
                            <th className="py-2.5 px-2 text-right">Female Rate</th>
                            <th className="py-2.5 px-2 text-right">Female Amt</th>
                            <th className="py-2.5 px-2 text-right font-black">Total</th>
                            <th className="py-2.5 px-3 text-right font-black">Amount</th>
                            <th className="py-2.5 px-3">Notes</th>
                            <th className="py-2.5 px-2 text-center w-16">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                          {stagedEntries.length === 0 ? (
                            <tr>
                              <td colSpan={16} className="py-6 text-center text-slate-400 text-xs">
                                No entries staged yet. Fill Contractor or Direct Workforce above and click &quot;+ Add Entry to List&quot;.
                              </td>
                            </tr>
                          ) : (
                            stagedEntries.map((e, idx) => (
                              <tr key={e.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-2.5 px-2.5 text-center font-mono text-slate-400">{idx + 1}</td>
                                <td className="py-2.5 px-2.5 whitespace-nowrap">
                                  <span
                                    className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                      e.source === "CONTRACTOR"
                                        ? "bg-blue-100 text-blue-700"
                                        : "bg-amber-100 text-amber-800"
                                    }`}
                                  >
                                    {e.source === "CONTRACTOR" ? "Contractor" : "Direct"}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap font-semibold text-slate-900 max-w-[160px] truncate">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="truncate">{e.contractorName || "-"}</span>
                                    {e.isOverridden && (
                                      <span className="shrink-0 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold border border-amber-300">
                                        Extra Workers
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-2 text-right font-mono">{e.skilledCount}</td>
                                <td className={`py-2.5 px-2 text-right font-mono ${e.isOverridden ? "text-amber-800 font-bold bg-amber-50/70" : "text-slate-500"}`}>
                                  ₹{e.skilledRate.toLocaleString("en-IN")}
                                </td>
                                <td className="py-2.5 px-2 text-right font-mono font-semibold">₹{e.skilledAmount.toLocaleString("en-IN")}</td>
                                <td className="py-2.5 px-2 text-right font-mono">{e.maleCount}</td>
                                <td className={`py-2.5 px-2 text-right font-mono ${e.isOverridden ? "text-amber-800 font-bold bg-amber-50/70" : "text-slate-500"}`}>
                                  ₹{e.maleRate.toLocaleString("en-IN")}
                                </td>
                                <td className="py-2.5 px-2 text-right font-mono font-semibold">₹{e.maleAmount.toLocaleString("en-IN")}</td>
                                <td className="py-2.5 px-2 text-right font-mono">{e.femaleCount}</td>
                                <td className={`py-2.5 px-2 text-right font-mono ${e.isOverridden ? "text-amber-800 font-bold bg-amber-50/70" : "text-slate-500"}`}>
                                  ₹{e.femaleRate.toLocaleString("en-IN")}
                                </td>
                                <td className="py-2.5 px-2 text-right font-mono font-semibold">₹{e.femaleAmount.toLocaleString("en-IN")}</td>
                                <td className="py-2.5 px-2 text-right font-mono font-bold">{e.totalWorkers}</td>
                                <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-600">
                                  ₹{e.totalExpense.toLocaleString("en-IN")}
                                </td>
                                <td className="py-2.5 px-3 text-slate-500 max-w-[120px] truncate">{e.notes || "-"}</td>
                                <td className="py-2.5 px-2 text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleEditStagedEntry(e)}
                                      title="Edit Entry"
                                      className="p-1 text-slate-400 hover:text-amber-600 rounded transition cursor-pointer"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteStagedEntry(e.id)}
                                      title="Delete Entry"
                                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>

                        {stagedEntries.length > 0 && (
                          <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-black text-slate-900">
                            <tr>
                              <td colSpan={3} className="py-2.5 px-3 font-bold text-xs">Total</td>
                              <td className="py-2.5 px-2 text-right font-mono">{tableTotals.totalSkilled}</td>
                              <td className="py-2.5 px-2 text-right text-slate-400 font-mono">-</td>
                              <td className="py-2.5 px-2 text-right font-mono">₹{tableTotals.totalSkilledAmt.toLocaleString("en-IN")}</td>
                              <td className="py-2.5 px-2 text-right font-mono">{tableTotals.totalMale}</td>
                              <td className="py-2.5 px-2 text-right text-slate-400 font-mono">-</td>
                              <td className="py-2.5 px-2 text-right font-mono">₹{tableTotals.totalMaleAmt.toLocaleString("en-IN")}</td>
                              <td className="py-2.5 px-2 text-right font-mono">{tableTotals.totalFemale}</td>
                              <td className="py-2.5 px-2 text-right text-slate-400 font-mono">-</td>
                              <td className="py-2.5 px-2 text-right font-mono">₹{tableTotals.totalFemaleAmt.toLocaleString("en-IN")}</td>
                              <td className="py-2.5 px-2 text-right font-mono text-xs">{tableTotals.totalWorkers}</td>
                              <td className="py-2.5 px-3 text-right font-mono text-emerald-700 text-xs font-black">
                                ₹{tableTotals.totalExpense.toLocaleString("en-IN")}
                              </td>
                              <td colSpan={2} className="py-2.5 px-3 text-slate-400 text-center">-</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                )}

                {/* 8. Muster Roll & Site Worker Photos (Image Upload Option) */}
                <div className="bg-slate-50/80 p-3.5 sm:p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-amber-600" />
                      <span>Site Muster Roll &amp; Worker Photos (Optional)</span>
                    </label>
                    {(headcountPhotos.length > 0 || existingAttachments.length > 0) && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        {existingAttachments.length + headcountPhotos.length} file{existingAttachments.length + headcountPhotos.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Upload muster roll attendance sheet, daily site worker group photo, or contractor slip.
                  </p>

                  {photoUploadError && (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>{photoUploadError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    {/* Option 1: Live Camera Shutter */}
                    <label className="relative flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 hover:bg-amber-100/70 cursor-pointer transition text-center group">
                      <Camera className="w-4 h-4 text-amber-600 group-hover:scale-110 transition shrink-0" />
                      <span className="text-xs font-bold text-amber-900">Click Photo / Camera</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleHeadcountPhotoSelect}
                        className="sr-only"
                      />
                    </label>

                    {/* Option 2: Choose / Upload Files or PDF */}
                    <label className="relative flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 cursor-pointer transition text-center group">
                      <UploadCloud className="w-4 h-4 text-slate-600 group-hover:scale-110 transition shrink-0" />
                      <span className="text-xs font-bold text-slate-700">Choose Photos / PDF</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        onChange={handleHeadcountPhotoSelect}
                        className="sr-only"
                      />
                    </label>
                  </div>

                  {/* Existing uploaded attachments (when editing) */}
                  {existingAttachments.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Attached Documents ({existingAttachments.length}):
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {existingAttachments.map((att) => {
                          const isPdf = att.fileName.toLowerCase().endsWith(".pdf") || att.mimeType?.includes("pdf");
                          return (
                            <div
                              key={att.id}
                              className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-900 shadow-2xs"
                            >
                              {isPdf ? (
                                <div
                                  onClick={() => setActivePhotoLightbox(att.url)}
                                  className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-white p-2 text-center cursor-pointer"
                                >
                                  <FileText className="w-6 h-6 text-amber-400 mb-1" />
                                  <span className="text-[10px] truncate max-w-full font-medium">{att.fileName}</span>
                                </div>
                              ) : (
                                <img
                                  src={att.url}
                                  alt={att.fileName}
                                  onClick={() => setActivePhotoLightbox(att.url)}
                                  className="w-full h-full object-cover cursor-pointer hover:scale-105 transition"
                                />
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                                <button
                                  type="button"
                                  onClick={() => setActivePhotoLightbox(att.url)}
                                  className="p-1.5 rounded-full bg-white/90 text-slate-900 hover:bg-white pointer-events-auto transition cursor-pointer"
                                  title="View full size"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteExistingAttachment(att.id)}
                                  className="p-1.5 rounded-full bg-rose-600 text-white hover:bg-rose-700 pointer-events-auto transition cursor-pointer"
                                  title="Delete file"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* New Photo / Document Previews to be uploaded */}
                  {headcountPhotoPreviews.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        New Photos Ready to Upload ({headcountPhotoPreviews.length}):
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {headcountPhotoPreviews.map((preview, index) => {
                          const isPdf = preview.name.toLowerCase().endsWith(".pdf");
                          return (
                            <div
                              key={preview.id}
                              className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-900 shadow-2xs"
                            >
                              {isPdf ? (
                                <div
                                  onClick={() => setActivePhotoLightbox(preview.url)}
                                  className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-white p-2 text-center cursor-pointer"
                                >
                                  <FileText className="w-6 h-6 text-amber-400 mb-1" />
                                  <span className="text-[10px] truncate max-w-full font-medium">{preview.name}</span>
                                </div>
                              ) : (
                                <img
                                  src={preview.url}
                                  alt={preview.name}
                                  onClick={() => setActivePhotoLightbox(preview.url)}
                                  className="w-full h-full object-cover cursor-pointer hover:scale-105 transition"
                                />
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                                <button
                                  type="button"
                                  onClick={() => setActivePhotoLightbox(preview.url)}
                                  className="p-1.5 rounded-full bg-white/90 text-slate-900 hover:bg-white pointer-events-auto transition cursor-pointer"
                                  title="View full size"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveHeadcountPhoto(index)}
                                  className="p-1.5 rounded-full bg-rose-600 text-white hover:bg-rose-700 pointer-events-auto transition cursor-pointer"
                                  title="Remove file"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="absolute bottom-1 left-1 bg-black/60 text-[9px] text-white px-1.5 py-0.5 rounded backdrop-blur-xs font-mono">
                                {(preview.size / 1024).toFixed(0)} KB
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Optional General Notes */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                    Work Details / Notes (Optional):
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Core wall casting, shuttering, plastering work on 3rd floor"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900">
                      {editingRecordId
                        ? `Editing 1 Record • ${displayTotalWorkers} Workers`
                        : `${totalEntriesCount} ${totalEntriesCount === 1 ? "Entry" : "Entries"} • ${displayTotalWorkers} Workers`}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {editingRecordId
                        ? "Updates will be applied to this headcount entry."
                        : "All entries will be saved together."}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                  {contractorTotalWorkers > 0 && !contractorName.trim() ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-100 text-rose-800 font-bold text-xs border border-rose-300 animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      <span>Contractor Required</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Ready to save</span>
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowUploadModal(false);
                      setEditingRecordId(null);
                      setExistingAttachments([]);
                      headcountPhotoPreviews.forEach((p) => URL.revokeObjectURL(p.url));
                      setHeadcountPhotos([]);
                      setHeadcountPhotoPreviews([]);
                      setPhotoUploadError(null);
                    }}
                    className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-200/70 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveAllHeadcounts()}
                    disabled={
                      submitting ||
                      isUploadingPhotos ||
                      (contractorTotalWorkers > 0 && !contractorName.trim()) ||
                      (editingRecordId
                        ? contractorTotalWorkers === 0 && directTotalWorkers === 0
                        : stagedEntries.length === 0 && contractorTotalWorkers === 0 && directTotalWorkers === 0)
                    }
                    className="flex items-center gap-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
                  >
                    {submitting || isUploadingPhotos ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                        <span>{isUploadingPhotos ? "Uploading Photos..." : editingRecordId ? "Saving Changes..." : "Saving All..."}</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 text-slate-950" />
                        <span>{editingRecordId ? "Save Changes" : `Save All Headcounts (${totalEntriesCount || 1})`}</span>
                      </>
                    )}
                  </button>
                </div>
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
                  <span>{editingWorker ? `Edit ${editingWorker.name}` : "Register Worker"}</span>
                </div>
                <button
                  onClick={() => {
                    setShowRegisterWorkerModal(false);
                    setEditingWorker(null);
                    setSelectedContractorPartyId("");
                    setDuplicateWarning(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleRegisterWorker} className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500 block">
                      Contractor / Full Name: *
                    </label>
                    {loadingContractors && (
                      <span className="text-[10px] text-amber-600 flex items-center gap-1 font-medium">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading contractors...
                      </span>
                    )}
                  </div>
                  {!editingWorker ? (
                    <div>
                      <SearchableSelect
                        options={contractorSelectOptions}
                        value={selectedContractorPartyId}
                        onChange={handleSelectContractorForWorker}
                        placeholder={loadingContractors ? "Loading contractors..." : "Search & select contractor from Vendors module..."}
                        searchPlaceholder="Type contractor name, trade, or phone..."
                        required
                      />
                      {contractorSelectOptions.length === 0 && !loadingContractors && (
                        <div className="mt-1.5 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-start gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                          <span>No contractor records found in Vendors &amp; Contractors. Please add a contractor in the Vendors module first.</span>
                        </div>
                      )}
                      {contractorFetchError && (
                        <p className="mt-1 text-[11px] text-red-600 font-medium">{contractorFetchError}</p>
                      )}
                      {duplicateWarning && (
                        <div className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-start gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                          <span>{duplicateWarning}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Kumar"
                      value={workerName}
                      onChange={(e) => setWorkerName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500 block">
                        Worker ID Code: *
                      </label>
                      <span className="text-[9px] text-emerald-600 font-semibold flex items-center gap-0.5">
                        ⚡ Auto-generated
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="e.g. WRK-8015"
                        value={employeeCode}
                        onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                      {isGeneratingCode && (
                        <div className="absolute right-2.5 top-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] uppercase font-bold text-slate-500 block">
                        Trade Category: *
                      </label>
                      {selectedContractorPartyId && (
                        <span className="text-[9px] text-emerald-600 font-semibold flex items-center gap-0.5">
                          ⚡ Auto-matched
                        </span>
                      )}
                    </div>
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

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500 block">
                      Phone Number:
                    </label>
                    {selectedContractorPartyId && workerPhone && (
                      <span className="text-[9px] text-emerald-600 font-semibold flex items-center gap-0.5">
                        ⚡ From contractor record
                      </span>
                    )}
                  </div>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={workerPhone}
                    onChange={(e) => setWorkerPhone(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">
                      Daily Wage Rates (₹ / day)
                    </div>
                    {selectedContractorPartyId && (workerDailyWage || workerMaleHelperWage || workerFemaleHelperWage) && (
                      <span className="text-[9px] text-emerald-600 font-semibold flex items-center gap-0.5">
                        ⚡ Pre-filled from rate card
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      1. Skilled Workers Rate (₹):
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 850"
                      value={workerDailyWage}
                      onChange={(e) => setWorkerDailyWage(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                        2. Laborers &amp; Helpers Male (₹):
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="e.g. 600"
                        value={workerMaleHelperWage}
                        onChange={(e) => setWorkerMaleHelperWage(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                        3. Laborers &amp; Helpers Female (₹):
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="e.g. 550"
                        value={workerFemaleHelperWage}
                        onChange={(e) => setWorkerFemaleHelperWage(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  {editingWorker ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteWorker(editingWorker)}
                      className="px-3 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Worker</span>
                    </button>
                  ) : <div />}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowRegisterWorkerModal(false);
                        setEditingWorker(null);
                        setSelectedContractorPartyId("");
                        setDuplicateWarning(null);
                      }}
                      className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold rounded-xl text-xs transition disabled:opacity-50 cursor-pointer"
                    >
                      {submitting ? "Saving..." : editingWorker ? "Save Changes" : "Register Worker"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Modal: Labour Cost & Financial Expense Reports */}
        {showReportsModal && (
          <div className="fixed inset-0 z-[75] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 max-h-[92dvh] flex flex-col overflow-hidden animate-scale-in my-auto">
              {/* Header */}
              <div className="flex items-center justify-between p-4 sm:p-5 pb-3 border-b border-slate-100 shrink-0 bg-white">
                <div>
                  <h3 className="font-black text-slate-900 text-base sm:text-lg flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-amber-500" />
                    <span>Labour Cost &amp; Financial Expense Reports</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Historical rate snapshots, contractor breakdowns, and direct workforce cost analysis.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReportsModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* KPI Strip */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Workers</span>
                    <span className="font-black font-mono text-lg text-slate-900 mt-0.5 block">
                      {reportsData?.totalWorkers || 0}
                    </span>
                    <span className="text-[10px] text-slate-500">across site records</span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase text-emerald-800 block">Total Labour Expense</span>
                    <span className="font-black font-mono text-lg text-emerald-700 mt-0.5 block">
                      ₹{reportsData?.grandTotalExpense ? Math.round(reportsData.grandTotalExpense / 100).toLocaleString("en-IN") : "0"}
                    </span>
                    <span className="text-[10px] text-emerald-600">rate snapshots</span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-blue-200 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase text-blue-800 block">Contractor Expense</span>
                    <span className="font-black font-mono text-lg text-blue-700 mt-0.5 block">
                      ₹{reportsData?.contractorReports ? Math.round(reportsData.contractorReports.reduce((s: number, c: any) => s + c.totalExpense, 0) / 100).toLocaleString("en-IN") : "0"}
                    </span>
                    <span className="text-[10px] text-blue-600">contractor agency</span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase text-amber-800 block">Direct Labour</span>
                    <span className="font-black font-mono text-lg text-amber-700 mt-0.5 block">
                      ₹{reportsData?.directReport?.totalExpense ? Math.round(reportsData.directReport.totalExpense / 100).toLocaleString("en-IN") : "0"}
                    </span>
                    <span className="text-[10px] text-amber-600">independent hire</span>
                  </div>
                </div>
              </div>

              {/* Tab Navigation */}
              <div className="px-4 pt-2 border-b border-slate-200 bg-white flex flex-wrap gap-1.5 shrink-0">
                {[
                  { id: "daily", label: "1. Daily Site Expense" },
                  { id: "contractor", label: "2. Contractor-wise" },
                  { id: "direct", label: "3. Direct Labour" },
                  { id: "project", label: "4. Project-wise" },
                  { id: "trades", label: "5. Skilled vs Unskilled" },
                  { id: "monthly", label: "6. Monthly Summary" },
                  { id: "worker_vs_expense", label: "7. Workers vs Expense" },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setReportsActiveTab(t.id)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition border-b-2 cursor-pointer ${
                      reportsActiveTab === t.id
                        ? "border-amber-500 text-slate-900 bg-amber-50/50"
                        : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab Content Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 text-xs">
                {reportsLoading ? (
                  <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                    <span>Generating financial reports...</span>
                  </div>
                ) : !reportsData ? (
                  <div className="py-12 text-center text-slate-400">
                    No report data available.
                  </div>
                ) : (
                  <>
                    {/* Tab 1: Daily Site Labour Expense Report */}
                    {reportsActiveTab === "daily" && (
                      <div className="space-y-3">
                        <div className="font-bold text-slate-900 text-xs flex items-center justify-between">
                          <span>Daily Site Labour Expense Report</span>
                          <span className="text-slate-500 font-normal">{(reportsData.dailyReports || []).length} days logged</span>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 uppercase text-[10px] font-bold text-slate-600">
                              <tr>
                                <th className="p-2.5">Date</th>
                                <th className="p-2.5">Site Name</th>
                                <th className="p-2.5 text-right">Contractor Workers</th>
                                <th className="p-2.5 text-right">Direct Workers</th>
                                <th className="p-2.5 text-right font-black">Total Workers</th>
                                <th className="p-2.5 text-right">Contractor Expense</th>
                                <th className="p-2.5 text-right">Direct Expense</th>
                                <th className="p-2.5 text-right font-black">Total Expense</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {(reportsData.dailyReports || []).map((d: any) => (
                                <tr key={`${d.date}-${d.siteId}`} className="hover:bg-slate-50">
                                  <td className="p-2.5 font-bold">{formatDate(d.date)}</td>
                                  <td className="p-2.5 text-slate-600">{d.siteName}</td>
                                  <td className="p-2.5 text-right font-mono">{d.contractorWorkers}</td>
                                  <td className="p-2.5 text-right font-mono">{d.directWorkers}</td>
                                  <td className="p-2.5 text-right font-mono font-bold">{d.totalWorkers}</td>
                                  <td className="p-2.5 text-right font-mono text-blue-700">₹{Math.round(d.contractorExpense / 100).toLocaleString("en-IN")}</td>
                                  <td className="p-2.5 text-right font-mono text-amber-700">₹{Math.round(d.directExpense / 100).toLocaleString("en-IN")}</td>
                                  <td className="p-2.5 text-right font-mono font-black text-emerald-700">₹{Math.round(d.totalExpense / 100).toLocaleString("en-IN")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tab 2: Contractor-wise Expense Report */}
                    {reportsActiveTab === "contractor" && (
                      <div className="space-y-3">
                        <div className="font-bold text-slate-900 text-xs">Contractor-wise Expense Report</div>
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 uppercase text-[10px] font-bold text-slate-600">
                              <tr>
                                <th className="p-2.5">Contractor Name</th>
                                <th className="p-2.5 text-center">Entries</th>
                                <th className="p-2.5 text-right">Skilled</th>
                                <th className="p-2.5 text-right">Male</th>
                                <th className="p-2.5 text-right">Female</th>
                                <th className="p-2.5 text-right font-black">Total Workers</th>
                                <th className="p-2.5 text-right">Skilled Expense</th>
                                <th className="p-2.5 text-right">Labourer Expense</th>
                                <th className="p-2.5 text-right font-black">Total Expense</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {(reportsData.contractorReports || []).map((c: any) => (
                                <tr key={c.contractorName} className="hover:bg-slate-50">
                                  <td className="p-2.5 font-bold text-slate-900">{c.contractorName}</td>
                                  <td className="p-2.5 text-center font-mono">{c.entriesCount}</td>
                                  <td className="p-2.5 text-right font-mono">{c.skilledCount}</td>
                                  <td className="p-2.5 text-right font-mono">{c.maleCount}</td>
                                  <td className="p-2.5 text-right font-mono">{c.femaleCount}</td>
                                  <td className="p-2.5 text-right font-mono font-bold">{c.totalWorkers}</td>
                                  <td className="p-2.5 text-right font-mono">₹{Math.round(c.skilledExpense / 100).toLocaleString("en-IN")}</td>
                                  <td className="p-2.5 text-right font-mono">₹{Math.round((c.maleExpense + c.femaleExpense) / 100).toLocaleString("en-IN")}</td>
                                  <td className="p-2.5 text-right font-mono font-black text-emerald-700">₹{Math.round(c.totalExpense / 100).toLocaleString("en-IN")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tab 3: Direct Labour Expense Report */}
                    {reportsActiveTab === "direct" && (
                      <div className="space-y-4">
                        <div className="font-bold text-slate-900 text-xs">Direct Labour Expense Report</div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                            <span className="text-[10px] font-bold uppercase text-amber-800">Total Direct Workers</span>
                            <span className="font-black font-mono text-2xl text-amber-950 block mt-1">
                              {reportsData.directReport?.totalWorkers || 0}
                            </span>
                            <span className="text-[11px] text-amber-700 mt-1 block">
                              Skilled: {reportsData.directReport?.skilledCount || 0} &bull; M: {reportsData.directReport?.maleCount || 0} &bull; F: {reportsData.directReport?.femaleCount || 0}
                            </span>
                          </div>

                          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                            <span className="text-[10px] font-bold uppercase text-emerald-800">Total Direct Expense</span>
                            <span className="font-black font-mono text-2xl text-emerald-950 block mt-1">
                              ₹{reportsData.directReport?.totalExpense ? Math.round(reportsData.directReport.totalExpense / 100).toLocaleString("en-IN") : "0"}
                            </span>
                            <span className="text-[11px] text-emerald-700 mt-1 block">
                              Independent site wages paid
                            </span>
                          </div>

                          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <span className="text-[10px] font-bold uppercase text-slate-500">Submissions Logged</span>
                            <span className="font-black font-mono text-2xl text-slate-900 block mt-1">
                              {reportsData.directReport?.entriesCount || 0}
                            </span>
                            <span className="text-[11px] text-slate-500 mt-1 block">
                              Daily direct attendance entries
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tab 4: Project-wise Labour Cost Report */}
                    {reportsActiveTab === "project" && (
                      <div className="space-y-3">
                        <div className="font-bold text-slate-900 text-xs">Project-wise Labour Cost Report</div>
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 uppercase text-[10px] font-bold text-slate-600">
                              <tr>
                                <th className="p-2.5">Project</th>
                                <th className="p-2.5 text-center">Entries</th>
                                <th className="p-2.5 text-right">Workers</th>
                                <th className="p-2.5 text-right">Contractor Cost</th>
                                <th className="p-2.5 text-right">Direct Cost</th>
                                <th className="p-2.5 text-right font-black">Total Project Labour Cost</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {(reportsData.projectReports || []).map((p: any) => (
                                <tr key={p.projectId} className="hover:bg-slate-50">
                                  <td className="p-2.5 font-bold text-slate-900">{p.projectName}</td>
                                  <td className="p-2.5 text-center font-mono">{p.entriesCount}</td>
                                  <td className="p-2.5 text-right font-mono">{p.totalWorkers}</td>
                                  <td className="p-2.5 text-right font-mono text-blue-700">₹{Math.round(p.contractorExpense / 100).toLocaleString("en-IN")}</td>
                                  <td className="p-2.5 text-right font-mono text-amber-700">₹{Math.round(p.directExpense / 100).toLocaleString("en-IN")}</td>
                                  <td className="p-2.5 text-right font-mono font-black text-emerald-700">₹{Math.round(p.totalExpense / 100).toLocaleString("en-IN")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tab 5: Skilled vs Unskilled Labour Cost */}
                    {reportsActiveTab === "trades" && (
                      <div className="space-y-4">
                        <div className="font-bold text-slate-900 text-xs">Skilled vs Unskilled Labour Cost Analysis</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-amber-950">Skilled Trades (Artisans)</span>
                              <span className="font-mono font-black text-amber-900 text-lg">
                                {reportsData.skilledVsUnskilled?.skilledCostRatio || 0}%
                              </span>
                            </div>
                            <div className="text-xl font-mono font-black text-amber-900">
                              ₹{reportsData.skilledVsUnskilled ? Math.round(reportsData.skilledVsUnskilled.skilledCost / 100).toLocaleString("en-IN") : "0"}
                            </div>
                            <div className="text-[11px] text-amber-800">
                              Total Workers: {reportsData.skilledVsUnskilled?.skilledWorkers || 0}
                            </div>
                          </div>

                          <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-emerald-950">Unskilled Laborers &amp; Helpers</span>
                              <span className="font-mono font-black text-emerald-900 text-lg">
                                {reportsData.skilledVsUnskilled?.unskilledCostRatio || 0}%
                              </span>
                            </div>
                            <div className="text-xl font-mono font-black text-emerald-900">
                              ₹{reportsData.skilledVsUnskilled ? Math.round(reportsData.skilledVsUnskilled.unskilledCost / 100).toLocaleString("en-IN") : "0"}
                            </div>
                            <div className="text-[11px] text-emerald-800">
                              Total Workers: {reportsData.skilledVsUnskilled?.unskilledWorkers || 0}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tab 6: Monthly Labour Expense Summary */}
                    {reportsActiveTab === "monthly" && (
                      <div className="space-y-3">
                        <div className="font-bold text-slate-900 text-xs">Monthly Labour Expense Summary</div>
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 uppercase text-[10px] font-bold text-slate-600">
                              <tr>
                                <th className="p-2.5">Month (YYYY-MM)</th>
                                <th className="p-2.5 text-center">Entries</th>
                                <th className="p-2.5 text-right">Total Workers</th>
                                <th className="p-2.5 text-right">Contractor Cost</th>
                                <th className="p-2.5 text-right">Direct Cost</th>
                                <th className="p-2.5 text-right font-black">Monthly Total Expense</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {(reportsData.monthlySummary || []).map((m: any) => (
                                <tr key={m.month} className="hover:bg-slate-50">
                                  <td className="p-2.5 font-bold text-slate-900">{m.month}</td>
                                  <td className="p-2.5 text-center font-mono">{m.entriesCount}</td>
                                  <td className="p-2.5 text-right font-mono">{m.totalWorkers}</td>
                                  <td className="p-2.5 text-right font-mono text-blue-700">₹{Math.round(m.contractorExpense / 100).toLocaleString("en-IN")}</td>
                                  <td className="p-2.5 text-right font-mono text-amber-700">₹{Math.round(m.directExpense / 100).toLocaleString("en-IN")}</td>
                                  <td className="p-2.5 text-right font-mono font-black text-emerald-700">₹{Math.round(m.totalExpense / 100).toLocaleString("en-IN")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tab 7: Total Worker Count vs Total Expense */}
                    {reportsActiveTab === "worker_vs_expense" && (
                      <div className="space-y-4">
                        <div className="font-bold text-slate-900 text-xs">Total Worker Count vs Total Expense Correlation</div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="bg-white p-3 rounded-lg border border-slate-200">
                              <span className="text-[10px] uppercase font-bold text-slate-400">Total Workers Deployed</span>
                              <span className="font-black font-mono text-xl text-slate-900 block mt-0.5">
                                {reportsData.totalWorkers}
                              </span>
                            </div>
                            <div className="bg-white p-3 rounded-lg border border-slate-200">
                              <span className="text-[10px] uppercase font-bold text-slate-400">Total Labour Expense</span>
                              <span className="font-black font-mono text-xl text-emerald-700 block mt-0.5">
                                ₹{Math.round(reportsData.grandTotalExpense / 100).toLocaleString("en-IN")}
                              </span>
                            </div>
                            <div className="bg-white p-3 rounded-lg border border-slate-200 col-span-2 sm:col-span-1">
                              <span className="text-[10px] uppercase font-bold text-slate-400">Avg Cost per Worker Day</span>
                              <span className="font-black font-mono text-xl text-amber-600 block mt-0.5">
                                ₹{reportsData.totalWorkers > 0 ? Math.round(reportsData.grandTotalExpense / reportsData.totalWorkers / 100).toLocaleString("en-IN") : "0"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setShowReportsModal(false)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Close Reports
                </button>
              </div>
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
        {pendingDeleteWorker && (
          <div
            className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
            onClick={() => setPendingDeleteWorker(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto space-y-3 animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 text-rose-600 font-bold text-base">
                <Trash2 className="w-5 h-5 shrink-0" />
                <span>Delete Registered Worker?</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to delete worker{" "}
                <strong className="text-slate-900">{pendingDeleteWorker.name}</strong>{" "}
                (<span className="font-mono text-slate-700 font-semibold">{pendingDeleteWorker.employeeCode}</span>)?
                This worker will be deactivated and removed from the active registered roster.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPendingDeleteWorker(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={executeDeleteWorker}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg disabled:opacity-50 transition"
                >
                  {submitting ? "Deleting..." : "Delete Worker"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clear All Workers Confirmation Modal */}
        {showClearWorkersModal && (
          <div
            className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
            onClick={() => setShowClearWorkersModal(false)}
          >
            <div
              className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto space-y-3 animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 text-rose-600 font-bold text-base">
                <Trash2 className="w-5 h-5 shrink-0" />
                <span>Clear All Registered Workers?</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to remove all{" "}
                <strong className="text-slate-900">{workers.length} registered workers</strong> from the roster?
                This will reset the worker directory to empty.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowClearWorkersModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={executeClearAllWorkers}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg disabled:opacity-50 transition"
                >
                  {submitting ? "Clearing..." : "Yes, Clear All Workers"}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Lightbox for Fullscreen Site Photo / Document Preview */}
        {activePhotoLightbox && typeof document !== "undefined" && createPortal(
          <div
            className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={() => setActivePhotoLightbox(null)}
          >
            <div
              className="relative max-w-4xl max-h-[90dvh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
                <a
                  href={activePhotoLightbox}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="p-2 rounded-full bg-black/60 hover:bg-black/90 text-white transition cursor-pointer"
                  title="Download / Open Full File"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setActivePhotoLightbox(null)}
                  className="p-2 rounded-full bg-black/60 hover:bg-black/90 text-white transition cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {activePhotoLightbox.toLowerCase().includes(".pdf") ? (
                <iframe
                  src={activePhotoLightbox}
                  className="w-[85vw] max-w-4xl h-[75dvh] rounded-b-xl bg-white"
                  title="Document Preview"
                />
              ) : (
                <img
                  src={activePhotoLightbox}
                  alt="Headcount Photo Preview"
                  className="max-h-[85dvh] w-auto object-contain mx-auto"
                />
              )}
            </div>
          </div>,
          document.body
        )}
      </div>
    </Shell>
  );
}
