"use client";

import React, { useEffect, useState, useMemo } from "react";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatQuantity, rupeesToPaise } from "@/lib/formatters";
import { canUser } from "@/lib/permissions";
import { useActiveSite } from "@/hooks/useActiveSite";
import {
  MEASUREMENT_UNIT_GROUPS,
  MEASUREMENT_TYPE_GROUPS,
  getUnitMetadata,
  type UnitOption,
} from "@/lib/measurement-units";
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  FileCheck,
  Receipt,
  Download,
  AlertCircle,
  Clock,
  Building2,
  Ruler,
  Calculator,
  Eye,
  X,
  FileText,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Layers,
  Image as ImageIcon,
  History,
  Edit2,
  Trash2,
  Copy,
  Printer,
  ShieldCheck,
  Upload,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  GitPullRequest,
  Check,
} from "lucide-react";

interface AttachmentItem {
  id: string;
  entryId: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number | null;
  mimeType?: string | null;
  caption?: string | null;
  version: number;
  isDeleted: boolean;
  deleteReason?: string | null;
  replacedById?: string | null;
  replaceReason?: string | null;
  uploadedBy: string;
  uploadedByName?: string | null;
  createdAt: string;
}

interface MeasurementEntryItem {
  id: string;
  organizationId: string;
  projectId: string;
  partyId: string;
  groupId?: string | null;
  subgroupId?: string | null;
  referenceNumber?: string | null;
  entryName?: string | null;
  itemDescription: string;
  measurementType: string;
  formula: string;
  unit: string;
  count: number;
  length: number;
  breadth?: number | null;
  depth?: number | null;
  grossQuantity: number;
  deduction: number;
  quantity: number;
  unitRate: number; // paise
  totalAmount: number; // paise
  status: "DRAFT" | "SUBMITTED" | "VERIFIED" | "APPROVED" | "REJECTED" | "BILLED";
  billId?: string | null;
  notes?: string | null;
  remarks?: string | null;
  measurementDate: string;
  version: number;
  isDeleted: boolean;
  createdBy: string;
  createdByName?: string | null;
  approvedBy?: string | null;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string; code: string; siteId?: string | null; site?: { id: string; name: string } | null };
  party?: { id: string; name: string; partyType?: string | null };
  attachments?: AttachmentItem[];
}

interface SubgroupItem {
  id: string;
  organizationId: string;
  groupId: string;
  name: string;
  type: string;
  description?: string | null;
  remarks?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  entries?: MeasurementEntryItem[];
  entriesCount?: number;
  quantitiesByUnit?: Record<string, number>;
  totalAmount?: number;
}

interface MainGroupItem {
  id: string;
  organizationId: string;
  projectId: string;
  partyId: string;
  siteId?: string | null;
  name?: string | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string; code: string; siteId?: string | null; site?: { id: string; name: string } | null };
  party?: { id: string; name: string; partyType?: string | null };
  subgroups: SubgroupItem[];
  subgroupsCount?: number;
  entriesCount?: number;
  quantitiesByUnit?: Record<string, number>;
  totalAmount?: number;
}

const STANDARD_ROOMS = [
  "General / Main Work Section",
  "Living Room / Hall",
  "Master Bedroom",
  "Bedroom 1",
  "Bedroom 2",
  "Kitchen",
  "Dining Area",
  "Balcony / Terrace",
  "Bathroom / Toilet",
  "Passage / Corridor",
  "Staircase",
  "External Elevation / Plaster",
  "Boundary Wall / Compound",
  "Basement / Parking",
];

function getKpiAmountClass(text: string): string {
  const len = text.length;
  if (len >= 16) {
    return "text-xs sm:text-sm md:text-base lg:text-xs xl:text-sm 2xl:text-base";
  }
  if (len >= 12) {
    return "text-sm sm:text-base md:text-lg lg:text-sm xl:text-base";
  }
  return "text-base sm:text-lg md:text-xl";
}

export default function MeasurementBookPage() {
  const { activeSiteId, setActiveSiteId } = useActiveSite();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const canWriteProjects = canUser(currentUser, "projects:write");
  const canWriteFinance = canUser(currentUser, "finance:write");
  const isSuperAdminOrAdmin = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ORG_ADMIN";
  const isSupervisor = currentUser?.role === "SITE_SUPERVISOR" || (currentUser?.role as string) === "SUPERVISOR";
  const canManageMeasurements = canWriteProjects || isSupervisor;

  const [groups, setGroups] = useState<MainGroupItem[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters & search
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState("ALL");
  const [selectedSite, setSelectedSite] = useState("ALL");
  const [selectedPartyType, setSelectedPartyType] = useState("ALL");
  const [selectedParty, setSelectedParty] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");

  // Expansion state
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedSubgroups, setExpandedSubgroups] = useState<Record<string, boolean>>({});

  // Notifications
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showAddSubgroupModal, setShowAddSubgroupModal] = useState(false);
  const [showAddEntryModal, setShowAddEntryModal] = useState(false);
  const [showEditEntryModal, setShowEditEntryModal] = useState(false);
  const [showDeleteEntryModal, setShowDeleteEntryModal] = useState(false);
  const [showDeleteGroupModal, setShowDeleteGroupModal] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<MainGroupItem | null>(null);
  const [showDeleteSubgroupModal, setShowDeleteSubgroupModal] = useState(false);
  const [subgroupToDelete, setSubgroupToDelete] = useState<{ subgroup: SubgroupItem; group: MainGroupItem } | null>(null);
  const [showImagesModal, setShowImagesModal] = useState(false);
  const [showChangeRequestsModal, setShowChangeRequestsModal] = useState(false);
  const [showAbstractModal, setShowAbstractModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);

  // Modal active targets
  const [targetGroupForSubgroup, setTargetGroupForSubgroup] = useState<string>("");
  const [targetGroupForEntry, setTargetGroupForEntry] = useState<string>("");
  const [targetSubgroupForEntry, setTargetSubgroupForEntry] = useState<string>("");
  const [activeEntry, setActiveEntry] = useState<MeasurementEntryItem | null>(null);
  const [billTargetEntry, setBillTargetEntry] = useState<MeasurementEntryItem | null>(null);

  // Change requests list
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [abstractData, setAbstractData] = useState<any>(null);

  // Add Group Form
  const [grpProjectId, setGrpProjectId] = useState("");
  const [grpPartyId, setGrpPartyId] = useState("");
  const [grpSiteId, setGrpSiteId] = useState("");
  const [grpName, setGrpName] = useState("");
  const [grpDescription, setGrpDescription] = useState("");

  // Add Subgroup Form
  const [subgrpGroupId, setSubgrpGroupId] = useState("");
  const [subgrpName, setSubgrpName] = useState("");
  const [subgrpType, setSubgrpType] = useState("ROOM");
  const [subgrpDescription, setSubgrpDescription] = useState("");

  // Add/Edit Measurement Form
  const [formGroupId, setFormGroupId] = useState("");
  const [formSubgroupId, setFormSubgroupId] = useState("");
  const [formProjectId, setFormProjectId] = useState("");
  const [formPartyId, setFormPartyId] = useState("");
  const [formCustomRoom, setFormCustomRoom] = useState("");
  const [isCustomRoom, setIsCustomRoom] = useState(false);
  const [useDirectSelection, setUseDirectSelection] = useState(false);
  const [formRefNumber, setFormRefNumber] = useState("");
  const [formEntryName, setFormEntryName] = useState("Wall 1");
  const [formItemDesc, setFormItemDesc] = useState("");
  const [formMeasurementType, setFormMeasurementType] = useState("WALL");
  const [formFormula, setFormFormula] = useState("AREA");
  const [formUnit, setFormUnit] = useState("SQFT");
  const activeUnitMeta = useMemo(() => getUnitMetadata(formUnit), [formUnit]);

  const handleSelectQuickUnit = (unitCode: string, recommendedFormula: string) => {
    setFormUnit(unitCode);
    if (recommendedFormula) {
      setFormFormula(recommendedFormula);
    }
  };
  const [formCount, setFormCount] = useState<number | string>(1);
  const [formLength, setFormLength] = useState<number | string>(1);
  const [formBreadth, setFormBreadth] = useState<number | string>("");
  const [formDepth, setFormDepth] = useState<number | string>("");
  const [formDeduction, setFormDeduction] = useState<number | string>(0);
  const [formRateRupees, setFormRateRupees] = useState<number | string>("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formNotes, setFormNotes] = useState("");
  const [formRemarks, setFormRemarks] = useState("");

  // Mandatory Reason State
  const [mandatoryReason, setMandatoryReason] = useState("");
  const [formBillNumber, setFormBillNumber] = useState("");

  // Image upload & replace state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [replaceTargetAtt, setReplaceTargetAtt] = useState<AttachmentItem | null>(null);
  const [imageReason, setImageReason] = useState("");
  const [imageModalTab, setImageModalTab] = useState<"ACTIVE" | "HISTORY">("ACTIVE");

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        hierarchical: "true",
      });
      if (selectedProject !== "ALL") queryParams.set("projectId", selectedProject);
      if (selectedSite !== "ALL") queryParams.set("siteId", selectedSite);
      if (selectedParty !== "ALL") queryParams.set("partyId", selectedParty);
      if (selectedPartyType !== "ALL") queryParams.set("partyType", selectedPartyType);
      if (selectedStatus !== "ALL") queryParams.set("status", selectedStatus);
      if (search.trim()) queryParams.set("search", search.trim());
      queryParams.set("_t", Date.now().toString());

      const noCacheInit: RequestInit = {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      };

      const [mbRes, projRes, partyRes, siteRes, meRes, crRes] = await Promise.all([
        fetch(`/api/measurement-book?${queryParams.toString()}`, noCacheInit),
        fetch(`/api/projects?_t=${Date.now()}`, noCacheInit),
        fetch(`/api/parties?_t=${Date.now()}`, noCacheInit),
        fetch(`/api/sites?_t=${Date.now()}`, noCacheInit),
        fetch("/api/auth/me", noCacheInit).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/measurement-book/change-requests?_t=${Date.now()}`, noCacheInit),
      ]);

      const mbData = await mbRes.json();
      const projData = await projRes.json();
      const partyData = await partyRes.json();
      const siteData = await siteRes.json();
      const crData = await crRes.json();

      if (meRes.success && meRes.data) {
        setCurrentUser(meRes.data.user);
      }

      if (mbData.success && Array.isArray(mbData.data)) {
        setGroups(mbData.data);
        if (mbData.data.length > 0 && !formGroupId) {
          setFormGroupId(mbData.data[0].id);
          setFormProjectId(mbData.data[0].projectId);
          setFormPartyId(mbData.data[0].partyId);
          setFormSubgroupId(mbData.data[0].subgroups?.[0]?.id || STANDARD_ROOMS[0]);
        }
        // Default expand first 2 groups
        const initExpanded: Record<string, boolean> = {};
        const initSubExpanded: Record<string, boolean> = {};
        mbData.data.forEach((g: MainGroupItem, idx: number) => {
          if (idx < 3) initExpanded[g.id] = true;
          g.subgroups.forEach((sg: SubgroupItem) => {
            initSubExpanded[sg.id] = true;
          });
        });
        setExpandedGroups((prev) => (Object.keys(prev).length === 0 ? initExpanded : prev));
        setExpandedSubgroups((prev) => (Object.keys(prev).length === 0 ? initSubExpanded : prev));
      }

      if (projData.success && Array.isArray(projData.data)) {
        setProjects(projData.data);
        if (projData.data.length > 0 && !grpProjectId) {
          setGrpProjectId(projData.data[0].id);
        }
        if (projData.data.length > 0 && !formProjectId) {
          setFormProjectId(projData.data[0].id);
        }
      }

      if (partyData.success && Array.isArray(partyData.data)) {
        setParties(partyData.data);
        if (partyData.data.length > 0 && !grpPartyId) {
          setGrpPartyId(partyData.data[0].id);
        }
        if (partyData.data.length > 0 && !formPartyId) {
          setFormPartyId(partyData.data[0].id);
        }
      }

      if (siteData.success && Array.isArray(siteData.data)) {
        setSites(siteData.data);
      }

      if (crData.success && Array.isArray(crData.data)) {
        setChangeRequests(crData.data);
      }
    } catch (err: any) {
      setErrorMessage("Failed to load Measurement Book data: " + (err.message || "Network error"));
    } finally {
      setLoading(false);
    }
  };

  // Synchronize Measurement Book with activeSiteId
  useEffect(() => {
    setSelectedSite(activeSiteId || "ALL");
    if (activeSiteId) {
      setGrpSiteId(activeSiteId);
    }
  }, [activeSiteId]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, selectedSite, selectedPartyType, selectedParty, selectedStatus, search]);

  // Expand / Collapse All
  const handleExpandAll = () => {
    const grpExp: Record<string, boolean> = {};
    const subExp: Record<string, boolean> = {};
    groups.forEach((g) => {
      grpExp[g.id] = true;
      g.subgroups.forEach((sg) => {
        subExp[sg.id] = true;
      });
    });
    setExpandedGroups(grpExp);
    setExpandedSubgroups(subExp);
  };

  const handleCollapseAll = () => {
    setExpandedGroups({});
    setExpandedSubgroups({});
  };

  // Toggle individual
  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSubgroup = (id: string) => {
    setExpandedSubgroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Calculated Quantity & Total for Add/Edit Form
  const calculatedFormGross = useMemo(() => {
    const n = Number(formCount) || 1;
    const l = Number(formLength) || 1;
    const b = Number(formBreadth) || 1;
    const h = Number(formDepth) || 1;
    const f = (formFormula || "AREA").toUpperCase();

    let raw = 0;
    if (f === "AREA") {
      const heightOrBreadth = formDepth !== "" ? h : b;
      raw = n * l * heightOrBreadth;
    } else if (f === "VOLUME") {
      raw = n * l * b * h;
    } else if (f === "LENGTH") {
      raw = n * l;
    } else {
      raw = n * l;
    }
    return Math.round(raw * 10000) / 10000;
  }, [formCount, formLength, formBreadth, formDepth, formFormula]);

  const calculatedFormNet = useMemo(() => {
    const ded = Number(formDeduction) || 0;
    return Math.round(Math.max(0, calculatedFormGross - ded) * 10000) / 10000;
  }, [calculatedFormGross, formDeduction]);

  const calculatedFormTotalRupees = useMemo(() => {
    const rate = Number(formRateRupees) || 0;
    return Math.round(calculatedFormNet * rate * 100) / 100;
  }, [calculatedFormNet, formRateRupees]);

  // Overall KPIs
  const kpis = useMemo(() => {
    let totalEntries = 0;
    let totalPaise = 0;
    let submittedCount = 0;
    let verifiedCount = 0;
    let approvedCount = 0;
    let billedCount = 0;
    const unitQuantities: Record<string, number> = {};

    groups.forEach((g) => {
      g.subgroups.forEach((sg) => {
        (sg.entries || []).forEach((e) => {
          totalEntries += 1;
          totalPaise += e.totalAmount;
          const u = e.unit.toUpperCase();
          unitQuantities[u] = Math.round(((unitQuantities[u] || 0) + e.quantity) * 10000) / 10000;

          if (e.status === "SUBMITTED") submittedCount++;
          if (e.status === "VERIFIED") verifiedCount++;
          if (e.status === "APPROVED") approvedCount++;
          if (e.status === "BILLED") billedCount++;
        });
      });
    });

    const pendingChangeRequestsCount = changeRequests.filter((cr) => cr.status === "PENDING").length;

    return {
      totalGroups: groups.length,
      totalEntries,
      totalPaise,
      submittedCount,
      verifiedCount,
      approvedCount,
      billedCount,
      unitQuantities,
      pendingChangeRequestsCount,
    };
  }, [groups, changeRequests]);

  // Form Subgroups available based on selected Group
  const currentSubgroupsForForm = useMemo(() => {
    if (!formGroupId) return [];
    const grp = groups.find((g) => g.id === formGroupId);
    return grp ? grp.subgroups : [];
  }, [groups, formGroupId]);

  // Handlers for Add Group
  const handleAddGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grpProjectId || !grpPartyId) {
      setErrorMessage("Please select both a Project and Contractor/Vendor.");
      return;
    }
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/measurement-book/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: grpProjectId,
          partyId: grpPartyId,
          siteId: grpSiteId || undefined,
          name: grpName || undefined,
          description: grpDescription || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to create Main Group");
      }
      setStatusMessage("Measurement Main Group created successfully!");
      setShowAddGroupModal(false);
      setGrpName("");
      setGrpDescription("");
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to add Main Group.");
    } finally {
      setActionLoading(false);
    }
  };

  // Handlers for Add Subgroup
  const handleAddSubgroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const gId = subgrpGroupId || targetGroupForSubgroup;
    if (!gId || !subgrpName.trim()) {
      setErrorMessage("Main Group and Subgroup Name are required.");
      return;
    }
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/measurement-book/subgroups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: gId,
          name: subgrpName.trim(),
          type: subgrpType,
          description: subgrpDescription || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to create Subgroup");
      }
      setStatusMessage(`Subgroup "${subgrpName}" created successfully!`);
      setShowAddSubgroupModal(false);
      setSubgrpName("");
      setSubgrpDescription("");
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to add Subgroup.");
    } finally {
      setActionLoading(false);
    }
  };

  // Open Add Measurement modal prefilled with group and subgroup
  const openAddMeasurementModal = (groupId?: string, subgroupId?: string) => {
    setErrorMessage(null);
    setStatusMessage(null);
    let targetG = groupId || formGroupId || (groups.length > 0 ? groups[0].id : "");
    if (!targetG && groups.length > 0) {
      targetG = groups[0].id;
    }
    setFormGroupId(targetG);

    const grp = groups.find((g) => g.id === targetG);
    if (grp) {
      setFormProjectId(grp.projectId);
      setFormPartyId(grp.partyId);
      const targetS = subgroupId || (grp.subgroups.length > 0 ? grp.subgroups[0].id : STANDARD_ROOMS[0]);
      setFormSubgroupId(targetS);
      setUseDirectSelection(false);
    } else {
      setUseDirectSelection(true);
      if (projects.length > 0) setFormProjectId(selectedProject !== "ALL" ? selectedProject : projects[0].id);
      if (parties.length > 0) setFormPartyId(selectedParty !== "ALL" ? selectedParty : parties[0].id);
      setFormSubgroupId(STANDARD_ROOMS[0]);
    }

    setIsCustomRoom(false);
    setFormCustomRoom("");
    setFormRefNumber("");
    setFormEntryName("Wall 1");
    setFormItemDesc("");
    setFormMeasurementType("WALL");
    setFormFormula("AREA");
    setFormUnit("SQFT");
    setFormCount(1);
    setFormLength(1);
    setFormBreadth(1);
    setFormDepth("");
    setFormDeduction(0);
    setFormRateRupees("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormNotes("");
    setFormRemarks("");
    setShowAddEntryModal(true);
  };

  // Open Duplicate modal
  const openDuplicateMeasurementModal = (entry: MeasurementEntryItem) => {
    setErrorMessage(null);
    setStatusMessage(null);
    setFormGroupId(entry.groupId || "");
    setFormSubgroupId(entry.subgroupId || STANDARD_ROOMS[0]);
    if (entry.groupId) {
      const grp = groups.find((g) => g.id === entry.groupId);
      if (grp) {
        setFormProjectId(grp.projectId);
        setFormPartyId(grp.partyId);
        setUseDirectSelection(false);
      }
    } else {
      if (entry.projectId) setFormProjectId(entry.projectId);
      if (entry.partyId) setFormPartyId(entry.partyId);
      setUseDirectSelection(true);
    }
    setIsCustomRoom(false);
    setFormCustomRoom("");
    setFormRefNumber(entry.referenceNumber ? `${entry.referenceNumber}-COPY` : "");
    setFormEntryName(`${entry.entryName || "Entry"} (Copy)`);
    setFormItemDesc(entry.itemDescription);
    setFormMeasurementType(entry.measurementType);
    setFormFormula(entry.formula);
    setFormUnit(entry.unit);
    setFormCount(entry.count);
    setFormLength(entry.length);
    setFormBreadth(entry.breadth !== null && entry.breadth !== undefined ? entry.breadth : "");
    setFormDepth(entry.depth !== null && entry.depth !== undefined ? entry.depth : "");
    setFormDeduction(entry.deduction);
    setFormRateRupees(entry.unitRate / 100);
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormNotes(entry.notes || "");
    setFormRemarks(entry.remarks || "");
    setShowAddEntryModal(true);
  };

  // Handle Add Measurement submit
  const handleAddMeasurementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let targetProjectId = formProjectId;
    let targetPartyId = formPartyId;
    let targetGroupId: string | undefined = undefined;

    if (!useDirectSelection && formGroupId && formGroupId !== "__DIRECT_PICK__") {
      const grp = groups.find((g) => g.id === formGroupId);
      if (grp) {
        targetProjectId = grp.projectId;
        targetPartyId = grp.partyId;
        targetGroupId = grp.id;
      }
    }

    if (!targetProjectId || !targetPartyId) {
      setErrorMessage("Please select both a Project and a Contractor/Vendor Party.");
      return;
    }
    if (!formItemDesc.trim() || !formRateRupees) {
      setErrorMessage("Work Description and Unit Rate are required.");
      return;
    }

    // Resolve room / subgroup
    let targetSubgroupId: string | undefined = undefined;
    let targetSubgroupName: string | undefined = undefined;

    if (isCustomRoom || formSubgroupId === "__CUSTOM__") {
      targetSubgroupName = formCustomRoom.trim() || STANDARD_ROOMS[0];
    } else if (STANDARD_ROOMS.includes(formSubgroupId)) {
      const matchingSg = currentSubgroupsForForm.find((sg) => sg.name.toLowerCase() === formSubgroupId.toLowerCase());
      if (matchingSg) {
        targetSubgroupId = matchingSg.id;
      } else {
        targetSubgroupName = formSubgroupId;
      }
    } else if (formSubgroupId) {
      targetSubgroupId = formSubgroupId;
    } else {
      targetSubgroupName = STANDARD_ROOMS[0];
    }

    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/measurement-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE",
          projectId: targetProjectId,
          partyId: targetPartyId,
          groupId: targetGroupId,
          subgroupId: targetSubgroupId,
          subgroupName: targetSubgroupName,
          referenceNumber: formRefNumber || undefined,
          entryName: formEntryName || "Wall 1",
          itemDescription: formItemDesc.trim(),
          measurementType: formMeasurementType,
          formula: formFormula,
          unit: formUnit,
          count: Number(formCount) || 1,
          length: Number(formLength) || 1,
          breadth: formBreadth !== "" ? Number(formBreadth) : null,
          depth: formDepth !== "" ? Number(formDepth) : null,
          deduction: Number(formDeduction) || 0,
          agreedRate: rupeesToPaise(Number(formRateRupees)),
          notes: formNotes || undefined,
          remarks: formRemarks || undefined,
          measurementDate: formDate,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to create measurement entry");
      }

      setStatusMessage("Measurement entry recorded successfully!");
      setShowAddEntryModal(false);
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to record measurement.");
    } finally {
      setActionLoading(false);
    }
  };

  // Open Edit Modal with Mandatory Reason
  const openEditModal = (entry: MeasurementEntryItem) => {
    setActiveEntry(entry);
    setMandatoryReason("");
    setFormEntryName(entry.entryName || "");
    setFormItemDesc(entry.itemDescription);
    setFormMeasurementType(entry.measurementType);
    setFormFormula(entry.formula);
    setFormUnit(entry.unit);
    setFormCount(entry.count);
    setFormLength(entry.length);
    setFormBreadth(entry.breadth !== null && entry.breadth !== undefined ? entry.breadth : "");
    setFormDepth(entry.depth !== null && entry.depth !== undefined ? entry.depth : "");
    setFormDeduction(entry.deduction);
    setFormRateRupees(entry.unitRate / 100);
    setFormDate(entry.measurementDate ? entry.measurementDate.split("T")[0] : new Date().toISOString().split("T")[0]);
    setFormNotes(entry.notes || "");
    setFormRemarks(entry.remarks || "");
    setShowEditEntryModal(true);
  };

  // Submit Edit Measurement
  const handleEditMeasurementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEntry) return;
    if (!mandatoryReason.trim()) {
      setErrorMessage("Mandatory reason is strictly required to update this measurement.");
      return;
    }
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/measurement-book/entries/${activeEntry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: mandatoryReason.trim(),
          entryName: formEntryName,
          itemDescription: formItemDesc,
          measurementType: formMeasurementType,
          formula: formFormula,
          unit: formUnit,
          count: Number(formCount) || 1,
          length: Number(formLength) || 1,
          breadth: formBreadth !== "" ? Number(formBreadth) : null,
          depth: formDepth !== "" ? Number(formDepth) : null,
          deduction: Number(formDeduction) || 0,
          agreedRate: rupeesToPaise(Number(formRateRupees)),
          notes: formNotes,
          remarks: formRemarks,
          measurementDate: formDate,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to update measurement.");
      }

      if (data.data?.changeRequestCreated) {
        setStatusMessage("Change Request submitted to Project Managers for approval.");
      } else {
        setStatusMessage("Measurement updated and version incremented successfully!");
      }
      setShowEditEntryModal(false);
      setActiveEntry(null);
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to update measurement.");
    } finally {
      setActionLoading(false);
    }
  };

  // Open Delete Modal
  const openDeleteModal = (entry: MeasurementEntryItem) => {
    setActiveEntry(entry);
    setMandatoryReason("");
    setShowDeleteEntryModal(true);
  };

  // Submit Delete Measurement
  const handleDeleteMeasurementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEntry) return;
    if (!mandatoryReason.trim()) {
      setErrorMessage("Mandatory reason is strictly required to delete this measurement.");
      return;
    }
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/measurement-book/entries/${activeEntry.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: mandatoryReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to delete measurement.");
      }

      if (data.data?.changeRequestCreated) {
        setStatusMessage("Deletion Change Request submitted to Project Managers for review.");
      } else {
        setStatusMessage("Measurement successfully archived with audit trail.");
        // Optimistically remove measurement from local state immediately so UI updates without refreshing
        setGroups((prevGroups) =>
          prevGroups.map((g) => ({
            ...g,
            subgroups: (g.subgroups || []).map((sg) => ({
              ...sg,
              entries: (sg.entries || []).filter((ent) => ent.id !== activeEntry.id),
            })),
          }))
        );
      }
      setShowDeleteEntryModal(false);
      setActiveEntry(null);
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to delete measurement.");
    } finally {
      setActionLoading(false);
    }
  };

  // Open Delete Group Modal
  const openDeleteGroupModal = (grp: MainGroupItem) => {
    setGroupToDelete(grp);
    setShowDeleteGroupModal(true);
  };

  // Submit Delete Group
  const handleDeleteGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupToDelete) return;
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/measurement-book/groups/${groupToDelete.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to delete Main Group.");
      }
      setStatusMessage(`Main Group "${groupToDelete.project?.name || "Project"} - ${groupToDelete.party?.name || "Party"}" deleted successfully.`);
      // Optimistically remove group from local state immediately so UI updates without refreshing
      setGroups((prevGroups) => prevGroups.filter((g) => g.id !== groupToDelete.id));
      setShowDeleteGroupModal(false);
      setGroupToDelete(null);
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to delete Main Group.");
    } finally {
      setActionLoading(false);
    }
  };

  // Open Delete Subgroup Modal
  const openDeleteSubgroupModal = (subgroup: SubgroupItem, group: MainGroupItem) => {
    setSubgroupToDelete({ subgroup, group });
    setShowDeleteSubgroupModal(true);
  };

  // Submit Delete Subgroup
  const handleDeleteSubgroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subgroupToDelete) return;
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/measurement-book/subgroups/${subgroupToDelete.subgroup.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to delete Room / Subgroup.");
      }
      setStatusMessage(`Room / Subgroup "${subgroupToDelete.subgroup.name}" deleted successfully.`);
      // Optimistically remove subgroup from local state immediately so UI updates without refreshing
      setGroups((prevGroups) =>
        prevGroups.map((g) => ({
          ...g,
          subgroups: g.subgroups.filter((sg) => sg.id !== subgroupToDelete.subgroup.id),
        }))
      );
      setShowDeleteSubgroupModal(false);
      setSubgroupToDelete(null);
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to delete Room / Subgroup.");
    } finally {
      setActionLoading(false);
    }
  };

  // Evidence Images Modal Handler
  const openImagesModal = (entry: MeasurementEntryItem) => {
    setActiveEntry(entry);
    setUploadFile(null);
    setReplaceTargetAtt(null);
    setImageReason("");
    setImageModalTab("ACTIVE");
    setShowImagesModal(true);
  };

  const handleUploadOrReplaceImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEntry || !uploadFile) {
      setErrorMessage("Please choose an image file to upload.");
      return;
    }

    if (replaceTargetAtt && !imageReason.trim()) {
      setErrorMessage("Mandatory reason is required to replace an evidence image.");
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);

    try {
      // Step 1: Upload to backend storage via /api/uploads
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("category", "MEASUREMENT_EVIDENCE");
      formData.append("entityType", "MEASUREMENT_BOOK");
      formData.append("entityId", activeEntry.id);
      formData.append("notes", imageReason || "Evidence image");

      const upRes = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      const upData = await upRes.json();
      if (!upRes.ok || !upData.success) {
        throw new Error(upData.error?.message || "File upload failed.");
      }

      const fileUrl = upData.data.url;
      const fileName = upData.data.name;
      const fileSize = upData.data.sizeBytes;
      const mimeType = upData.data.mimeType;

      // Step 2: Register in MeasurementAttachments
      const isReplace = Boolean(replaceTargetAtt);
      const mbImgRes = await fetch(`/api/measurement-book/entries/${activeEntry.id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isReplace ? "REPLACE" : "UPLOAD",
          fileUrl,
          fileName,
          fileSize,
          mimeType,
          attachmentId: replaceTargetAtt?.id,
          reason: isReplace ? imageReason.trim() : undefined,
        }),
      });

      const mbImgData = await mbImgRes.json();
      if (!mbImgRes.ok || !mbImgData.success) {
        throw new Error(mbImgData.error?.message || "Failed to record image evidence.");
      }

      setStatusMessage(isReplace ? "Image replaced successfully and past version retained!" : "Evidence photo uploaded successfully!");
      setUploadFile(null);
      setReplaceTargetAtt(null);
      setImageReason("");

      // Refresh entry data
      const refEntry = await fetch(`/api/measurement-book/entries/${activeEntry.id}`);
      const refData = await refEntry.json();
      if (refData.success) {
        setActiveEntry(refData.data);
      }
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || "Image operation failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteImage = async (att: AttachmentItem) => {
    const reason = prompt("Enter mandatory reason for removing this photo (e.g. wrong photo, duplicate):");
    if (!reason || !reason.trim()) {
      alert("Removal cancelled: Mandatory reason is strictly required.");
      return;
    }

    if (!activeEntry) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/measurement-book/entries/${activeEntry.id}/images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachmentId: att.id,
          reason: reason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to remove image.");
      }

      setStatusMessage("Image removed from active evidence (metadata retained).");
      const refEntry = await fetch(`/api/measurement-book/entries/${activeEntry.id}`);
      const refData = await refEntry.json();
      if (refData.success) {
        setActiveEntry(refData.data);
      }
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to delete image.");
    } finally {
      setActionLoading(false);
    }
  };

  // Status transitions
  const handleStatusChange = async (entryId: string, newStatus: "VERIFIED" | "APPROVED" | "REJECTED") => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/measurement-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_STATUS",
          entryId,
          status: newStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || `Failed to update status to ${newStatus}`);
      }

      setStatusMessage(`Status successfully updated to ${newStatus}`);
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || "Status change failed.");
    } finally {
      setActionLoading(false);
    }
  };

  // Convert to Bill
  const openConvertBillModal = (entry: MeasurementEntryItem) => {
    setBillTargetEntry(entry);
    setFormBillNumber(`MB-BILL-${entry.id.slice(0, 6).toUpperCase()}`);
    setShowBillModal(true);
  };

  const handleConvertBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billTargetEntry || !formBillNumber.trim()) return;
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/measurement-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CONVERT_TO_BILL",
          entryId: billTargetEntry.id,
          billNumber: formBillNumber.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to convert measurement to bill.");
      }

      setStatusMessage(`Measurement converted to Contractor Bill (${data.data?.bill?.billNumber || formBillNumber}) successfully!`);
      setShowBillModal(false);
      setBillTargetEntry(null);
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || "Conversion to bill failed.");
    } finally {
      setActionLoading(false);
    }
  };

  // Review Change Request
  const handleReviewChangeRequest = async (requestId: string, action: "APPROVE" | "REJECT") => {
    const comments = prompt(`Enter optional comments for ${action === "APPROVE" ? "approving" : "rejecting"} this request:`);
    setActionLoading(true);
    try {
      const res = await fetch(`/api/measurement-book/change-requests/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reviewerComments: comments || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || `Failed to ${action} change request.`);
      }

      setStatusMessage(`Change request #${requestId.slice(0, 8)} ${action}D successfully.`);
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || "Review action failed.");
    } finally {
      setActionLoading(false);
    }
  };

  // Open Abstract Modal
  const openAbstractModal = async () => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/measurement-book/abstract");
      const data = await res.json();
      if (data.success) {
        setAbstractData(data.data);
        setShowAbstractModal(true);
      }
    } catch (err: any) {
      setErrorMessage("Failed to load Abstract calculations.");
    } finally {
      setActionLoading(false);
    }
  };

  // Open History Modal
  const openHistoryModal = async (entryId?: string) => {
    setActionLoading(true);
    try {
      const url = entryId ? `/api/measurement-book/history?entryId=${entryId}` : "/api/measurement-book/history";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setHistoryList(data.data);
        setShowHistoryModal(true);
      }
    } catch (err: any) {
      setErrorMessage("Failed to load audit history.");
    } finally {
      setActionLoading(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const rows: string[][] = [
      [
        "Project",
        "Party",
        "Party Type",
        "Subgroup / Room",
        "Reference",
        "Wall / Item",
        "Measurement Type",
        "Formula",
        "N",
        "L",
        "B",
        "H/D",
        "Gross Qty",
        "Deduction",
        "Net Qty",
        "Unit",
        "Rate (Rs)",
        "Amount (Rs)",
        "Status",
        "Date",
      ],
    ];

    groups.forEach((g) => {
      g.subgroups.forEach((sg) => {
        (sg.entries || []).forEach((e) => {
          rows.push([
            `"${g.project?.name || ""}"`,
            `"${g.party?.name || ""}"`,
            `"${g.party?.partyType || ""}"`,
            `"${sg.name}"`,
            `"${e.referenceNumber || ""}"`,
            `"${e.entryName || ""}"`,
            `"${e.measurementType}"`,
            `"${e.formula}"`,
            String(e.count),
            String(e.length),
            String(e.breadth ?? ""),
            String(e.depth ?? ""),
            String(e.grossQuantity),
            String(e.deduction),
            String(e.quantity),
            `"${e.unit}"`,
            (e.unitRate / 100).toFixed(2),
            (e.totalAmount / 100).toFixed(2),
            `"${e.status}"`,
            `"${e.measurementDate.split("T")[0]}"`,
          ]);
        });
      });
    });

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((r) => r.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Measurement_Book_Hierarchical_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUBMITTED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <Clock className="w-3 h-3" /> Submitted
          </span>
        );
      case "VERIFIED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            <FileCheck className="w-3 h-3" /> Verified
          </span>
        );
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3" /> Approved
          </span>
        );
      case "BILLED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-300">
            <Receipt className="w-3 h-3" /> Billed
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-3 h-3" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <Shell>
      <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20 shadow-sm">
                <BookOpen className="w-7 h-7" />
              </span>
              <div>
                <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Measurement Book (MB Record)
                </h1>
                <p className="text-xs md:text-sm text-slate-500 mt-0.5">
                  Professional 3-Level Construction Measurement Hierarchy & Complete Audit Trail
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={openAbstractModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs md:text-sm font-semibold shadow-sm transition"
            >
              <Calculator className="w-4 h-4 text-amber-600" />
              MB Abstract
            </button>

            <button
              onClick={() => openHistoryModal()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs md:text-sm font-semibold shadow-sm transition"
            >
              <History className="w-4 h-4 text-slate-500" />
              Audit Trail
            </button>

            {isSuperAdminOrAdmin && kpis.pendingChangeRequestsCount > 0 && (
              <button
                onClick={() => setShowChangeRequestsModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs md:text-sm font-semibold shadow-sm animate-pulse transition"
              >
                <GitPullRequest className="w-4 h-4" />
                Change Requests ({kpis.pendingChangeRequestsCount})
              </button>
            )}

            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs md:text-sm font-semibold shadow-sm transition"
            >
              <Download className="w-4 h-4 text-slate-500" />
              Export
            </button>

            {canManageMeasurements && (
              <>
                <button
                  onClick={() => setShowAddGroupModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs md:text-sm font-semibold shadow-sm transition"
                >
                  <FolderPlus className="w-4 h-4 text-amber-700" />
                  + Main Group
                </button>

                <button
                  onClick={() => {
                    if (groups.length === 0) {
                      setShowAddGroupModal(true);
                    } else {
                      setTargetGroupForSubgroup(groups[0].id);
                      setSubgrpGroupId(groups[0].id);
                      setShowAddSubgroupModal(true);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-400 bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs md:text-sm font-semibold shadow-sm transition"
                >
                  <Layers className="w-4 h-4 text-blue-700" />
                  + Room / Subgroup
                </button>

                <button
                  onClick={() => openAddMeasurementModal()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs md:text-sm shadow-md transition"
                >
                  <Plus className="w-4 h-4" />
                  + Add Measurement
                </button>
              </>
            )}
          </div>
        </div>

        {/* Feedback Messages */}
        {statusMessage && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-sm flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="font-medium">{statusMessage}</span>
            </div>
            <button onClick={() => setStatusMessage(null)} className="text-emerald-700 hover:text-emerald-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-sm flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span className="font-medium">{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-rose-700 hover:text-rose-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* KPI Summary Cards */}
        {(() => {
          const unitEntries = Object.entries(kpis.unitQuantities);
          const hasUnits = unitEntries.length > 0;
          const [primaryUnit, primaryQty] = hasUnits ? unitEntries[0] : ["", 0];
          const otherUnits = hasUnits ? unitEntries.slice(1) : [];
          const verifiedOrAbove = kpis.verifiedCount + kpis.approvedCount + kpis.billedCount;

          return (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
              {/* Card 1: Hierarchy Overview */}
              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col justify-between min-h-[116px] min-w-0 hover:border-slate-300 transition">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 font-bold leading-tight">Hierarchy Overview</span>
                  <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-600 shrink-0">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="my-1 flex items-baseline gap-1.5 min-w-0">
                  <span className="text-base sm:text-lg md:text-xl font-black text-slate-900 tabular-nums tracking-tight leading-tight whitespace-nowrap">
                    {kpis.totalGroups}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">Groups</span>
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-500 leading-tight">
                  {kpis.totalEntries} measurement {kpis.totalEntries === 1 ? "entry" : "entries"} recorded
                </div>
              </div>

              {/* Card 2: Total Measured Value */}
              {(() => {
                const totalMeasuredFormatted = formatCurrency(kpis.totalPaise);
                return (
                  <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col justify-between min-h-[116px] min-w-0 hover:border-slate-300 transition">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 font-bold leading-tight">Total Measured Value</span>
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-600 shrink-0">
                        <Receipt className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <div className="my-1 min-w-0">
                      <div
                        className={`font-black text-emerald-600 tabular-nums tracking-tight leading-tight whitespace-nowrap ${getKpiAmountClass(totalMeasuredFormatted)}`}
                        title={totalMeasuredFormatted}
                      >
                        {totalMeasuredFormatted}
                      </div>
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-slate-500 leading-tight">Approved & Pending Works</div>
                  </div>
                );
              })()}

              {/* Card 3: Quantities by Unit */}
              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col justify-between min-h-[116px] min-w-0 hover:border-slate-300 transition">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 font-bold leading-tight">Quantities by Unit</span>
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-600 shrink-0">
                    <Ruler className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="my-1 min-w-0">
                  {hasUnits ? (
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-base sm:text-lg md:text-xl font-black text-slate-900 tabular-nums tracking-tight leading-tight whitespace-nowrap">
                        {formatQuantity(primaryQty)}
                      </span>
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                        {primaryUnit}
                      </span>
                    </div>
                  ) : (
                    <div className="text-base sm:text-lg md:text-xl font-black text-slate-400 tabular-nums tracking-tight leading-tight whitespace-nowrap">0.00</div>
                  )}
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-500 leading-tight">
                  {otherUnits.length > 0 ? (
                    <span className="text-indigo-600 font-medium truncate block">
                      + {otherUnits.map(([u, q]) => `${formatQuantity(q)} ${u}`).join(" · ")}
                    </span>
                  ) : hasUnits ? (
                    <span>Total measured across entries</span>
                  ) : (
                    <span>No measurements yet</span>
                  )}
                </div>
              </div>

              {/* Card 4: Verification Pipeline */}
              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col justify-between min-h-[116px] min-w-0 hover:border-slate-300 transition">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 font-bold leading-tight">Verification Pipeline</span>
                  <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600 shrink-0">
                    <FileCheck className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="my-1 flex items-baseline gap-1.5 min-w-0">
                  <span className="text-base sm:text-lg md:text-xl font-black text-blue-700 tabular-nums tracking-tight leading-tight whitespace-nowrap">
                    {verifiedOrAbove}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    / {kpis.totalEntries} Verified
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    {kpis.submittedCount} Sub
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                    {kpis.verifiedCount} Ver
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {kpis.approvedCount} App
                  </span>
                  {kpis.billedCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                      {kpis.billedCount} Billed
                    </span>
                  )}
                </div>
              </div>

              {/* Card 5: Supervisor Requests */}
              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col justify-between min-h-[116px] min-w-0 hover:border-slate-300 transition">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 font-bold leading-tight">Supervisor Requests</span>
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 ${
                      kpis.pendingChangeRequestsCount > 0
                        ? "bg-amber-50 border-amber-200 text-amber-600"
                        : "bg-emerald-50 border-emerald-200/60 text-emerald-600"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="my-1 flex items-baseline gap-1.5 min-w-0">
                  <span
                    className={`text-base sm:text-lg md:text-xl font-black tabular-nums tracking-tight leading-tight whitespace-nowrap ${
                      kpis.pendingChangeRequestsCount > 0 ? "text-amber-600" : "text-slate-900"
                    }`}
                  >
                    {kpis.pendingChangeRequestsCount}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">Pending</span>
                </div>
                <div className="text-[10px] sm:text-[11px]">
                  {kpis.pendingChangeRequestsCount > 0 ? (
                    <span className="text-amber-700 font-semibold block">Requires Admin review</span>
                  ) : (
                    <span className="text-emerald-700 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      All requests cleared
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Filter and Search Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-3 items-center justify-between">
          <div className="relative w-full lg:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search project, party, room, wall..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs md:text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {/* Project Filter */}
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="text-xs font-medium px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Site Filter */}
            <select
              value={selectedSite}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedSite(val);
                setActiveSiteId(val === "ALL" ? "" : val);
              }}
              className="text-xs font-medium px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">All Sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {/* Party Type Filter */}
            <select
              value={selectedPartyType}
              onChange={(e) => setSelectedPartyType(e.target.value)}
              className="text-xs font-medium px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">All Party Types</option>
              <option value="CONTRACTOR">Contractor</option>
              <option value="VENDOR">Vendor</option>
              <option value="CLIENT">Client</option>
            </select>

            {/* Party Filter */}
            <select
              value={selectedParty}
              onChange={(e) => setSelectedParty(e.target.value)}
              className="text-xs font-medium px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500 max-w-[200px]"
            >
              <option value="ALL">All Contractors/Vendors</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.partyType})
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="text-xs font-medium px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="VERIFIED">Verified</option>
              <option value="APPROVED">Approved</option>
              <option value="BILLED">Billed</option>
              <option value="REJECTED">Rejected</option>
            </select>

            {/* Expand / Collapse All */}
            <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
              <button
                onClick={handleExpandAll}
                className="px-2 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition"
                title="Expand All Levels"
              >
                Expand All
              </button>
              <button
                onClick={handleCollapseAll}
                className="px-2 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition"
                title="Collapse All Levels"
              >
                Collapse All
              </button>
            </div>
          </div>
        </div>

        {/* 3-Level Hierarchical Grouped Table Container */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-amber-500 mb-2" />
              <p className="font-semibold text-slate-700">Loading hierarchical measurement records...</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
              <BookOpen className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-lg font-bold text-slate-800">No Measurement Groups Found</p>
              <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
                Start by creating a Main Group (linking a Project and Contractor/Vendor), or click &quot;Add Measurement&quot; to record site work.
              </p>
              {canManageMeasurements && (
                <button
                  onClick={() => setShowAddGroupModal(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow transition"
                >
                  <FolderPlus className="w-4 h-4" />
                  Create First Main Group
                </button>
              )}
            </div>
          ) : (
            groups.map((grp) => {
              const isGrpExpanded = Boolean(expandedGroups[grp.id]);
              const partyBadge = grp.party?.partyType === "VENDOR" ? "bg-purple-100 text-purple-800 border-purple-200" : "bg-blue-100 text-blue-800 border-blue-200";

              return (
                <div
                  key={grp.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-200"
                >
                  {/* LEVEL 1: MAIN GROUP HEADER */}
                  <div className="bg-slate-900 text-slate-100 px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleGroup(grp.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                      >
                        {isGrpExpanded ? <ChevronDown className="w-5 h-5 text-amber-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                      </button>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-base md:text-lg text-white tracking-wide">
                            {grp.project?.name || "Project"}
                          </span>
                          {grp.project?.code && (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono font-bold">
                              {grp.project.code}
                            </span>
                          )}
                          <span className="text-slate-500 font-semibold">•</span>
                          <span className="font-bold text-amber-400 text-sm md:text-base">
                            {grp.party?.name || "Party"}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${partyBadge}`}>
                            {grp.party?.partyType || "CONTRACTOR"}
                          </span>
                        </div>
                        {grp.project?.site?.name && (
                          <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-500" />
                            Site: {grp.project.site.name}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap justify-between md:justify-end">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 text-xs font-medium">
                          {grp.subgroupsCount || grp.subgroups.length} Subgroups
                        </span>
                        <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 text-xs font-medium">
                          {grp.entriesCount || 0} Measurements
                        </span>
                      </div>

                      {/* Group Unit Quantities */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {Object.entries(grp.quantitiesByUnit || {}).map(([unit, qty]) => (
                          <span key={unit} className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-bold font-mono">
                            {formatQuantity(qty)} {unit}
                          </span>
                        ))}
                      </div>

                      {/* Group Total Amount */}
                      <div className="text-right">
                        <div className="text-xs text-slate-400 font-semibold uppercase">Group Total</div>
                        <div className="text-sm md:text-base font-black text-emerald-400">
                          {formatCurrency(grp.totalAmount || 0)}
                        </div>
                      </div>

                      {canManageMeasurements && (
                        <div className="flex items-center gap-1.5 ml-2">
                          <button
                            onClick={() => {
                              setTargetGroupForSubgroup(grp.id);
                              setSubgrpGroupId(grp.id);
                              setShowAddSubgroupModal(true);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-blue-600/90 hover:bg-blue-600 text-white text-xs font-semibold shadow transition"
                            title="Add Room or Area to this Main Group"
                          >
                            + Subgroup
                          </button>
                          <button
                            onClick={() => openAddMeasurementModal(grp.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow transition"
                            title="Add measurement to this group"
                          >
                            + Measurement
                          </button>
                          {canWriteProjects && (
                            <button
                              onClick={() => openDeleteGroupModal(grp)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                              title="Delete this Main Group"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* LEVEL 2 & 3: EXPANDED SUBGROUPS */}
                  {isGrpExpanded && (
                    <div className="divide-y divide-slate-100 bg-slate-50/50">
                      {grp.subgroups.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-sm">
                          No subgroups in this main group. Click &quot;+ Subgroup&quot; above to add rooms, floors, or work areas.
                        </div>
                      ) : (
                        grp.subgroups.map((sg) => {
                          const isSubExpanded = Boolean(expandedSubgroups[sg.id]);
                          const entries = sg.entries || [];

                          return (
                            <div key={sg.id} className="border-b border-slate-200/80 last:border-b-0">
                              {/* SUBGROUP ROW HEADER */}
                              <div className="bg-slate-100/90 hover:bg-slate-100 px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2 transition">
                                <div className="flex items-center gap-2.5 pl-3">
                                  <button
                                    onClick={() => toggleSubgroup(sg.id)}
                                    className="p-1 rounded bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 transition"
                                  >
                                    {isSubExpanded ? <ChevronDown className="w-4 h-4 text-blue-600" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                  </button>

                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-slate-900 text-sm md:text-base">
                                      {sg.name}
                                    </span>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                      {sg.type}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                      ({entries.length} wall/work entries)
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 flex-wrap justify-between md:justify-end pl-10 md:pl-0">
                                  {/* Subgroup Quantities */}
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {Object.entries(sg.quantitiesByUnit || {}).map(([unit, qty]) => (
                                      <span key={unit} className="px-2 py-0.5 rounded bg-white border border-slate-300 text-slate-800 text-xs font-bold font-mono">
                                        {formatQuantity(qty)} {unit}
                                      </span>
                                    ))}
                                  </div>

                                  <div className="text-right">
                                    <span className="text-xs font-bold text-slate-800">
                                      {formatCurrency(sg.totalAmount || 0)}
                                    </span>
                                  </div>

                                  {canManageMeasurements && (
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={() => openAddMeasurementModal(grp.id, sg.id)}
                                        className="px-2 py-1 rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold shadow-xs transition"
                                        title="Add wall measurement to this room"
                                      >
                                        + Add Wall
                                      </button>
                                      {canWriteProjects && (
                                        <button
                                          onClick={() => openDeleteSubgroupModal(sg, grp)}
                                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition"
                                          title="Delete Room / Subgroup"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* LEVEL 3: MEASUREMENT ENTRIES TABLE */}
                              {isSubExpanded && (
                                <div className="overflow-x-auto bg-white">
                                  {entries.length === 0 ? (
                                    <div className="p-5 text-center text-xs text-slate-400">
                                      No measurements recorded in {sg.name} yet. Click &quot;+ Add Wall&quot; to create one.
                                    </div>
                                  ) : (
                                    <table className="w-full text-left border-collapse text-xs">
                                      <thead>
                                        <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold uppercase tracking-wider text-[11px]">
                                          <th className="py-2.5 px-3">Ref & Wall / Item</th>
                                          <th className="py-2.5 px-3">Type</th>
                                          <th className="py-2.5 px-3">Formula</th>
                                          <th className="py-2.5 px-3 text-right">Dimensions (N × L × B × H)</th>
                                          <th className="py-2.5 px-3 text-right">Gross Qty</th>
                                          <th className="py-2.5 px-3 text-right">Deduction</th>
                                          <th className="py-2.5 px-3 text-right font-bold text-slate-900">Net Qty</th>
                                          <th className="py-2.5 px-3">Unit</th>
                                          <th className="py-2.5 px-3 text-right">Rate</th>
                                          <th className="py-2.5 px-3 text-right font-bold text-slate-900">Amount</th>
                                          <th className="py-2.5 px-3">Date</th>
                                          <th className="py-2.5 px-3">Status</th>
                                          <th className="py-2.5 px-3 text-center">Evidence</th>
                                          <th className="py-2.5 px-3 text-right">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {entries.map((entry) => {
                                          const photosCount = (entry.attachments || []).filter((a) => !a.isDeleted).length;

                                          return (
                                            <tr key={entry.id} className="hover:bg-amber-50/40 transition">
                                              {/* Ref & Wall / Item */}
                                              <td className="py-2.5 px-3">
                                                <div className="font-bold text-slate-900">
                                                  {entry.entryName || "Wall 1"}
                                                </div>
                                                <div className="text-[11px] text-slate-500 line-clamp-1">
                                                  {entry.itemDescription}
                                                </div>
                                                {entry.referenceNumber && (
                                                  <span className="text-[10px] text-slate-400 font-mono">
                                                    Ref: {entry.referenceNumber}
                                                  </span>
                                                )}
                                              </td>

                                              {/* Measurement Type */}
                                              <td className="py-2.5 px-3">
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                                                  {entry.measurementType.replace(/_/g, " ")}
                                                </span>
                                              </td>

                                              {/* Formula */}
                                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                                                {entry.formula}
                                              </td>

                                              {/* Dimensions */}
                                              <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-700">
                                                {entry.count} × {entry.length}
                                                {entry.breadth !== null && entry.breadth !== undefined ? ` × ${entry.breadth}` : ""}
                                                {entry.depth !== null && entry.depth !== undefined ? ` × ${entry.depth}` : ""}
                                              </td>

                                              {/* Gross Qty */}
                                              <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                                                {formatQuantity(entry.grossQuantity)}
                                              </td>

                                              {/* Deduction */}
                                              <td className="py-2.5 px-3 text-right font-mono text-rose-600">
                                                {entry.deduction > 0 ? `-${formatQuantity(entry.deduction)}` : "0"}
                                              </td>

                                              {/* Net Qty */}
                                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                                                {formatQuantity(entry.quantity)}
                                              </td>

                                              {/* Unit */}
                                              <td className="py-2.5 px-3 font-semibold">
                                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${getUnitMetadata(entry.unit).badgeBg}`}>
                                                  {entry.unit}
                                                </span>
                                              </td>

                                              {/* Rate */}
                                              <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                                                {formatCurrency(entry.unitRate)}
                                              </td>

                                              {/* Total Amount */}
                                              <td className="py-2.5 px-3 text-right font-bold text-slate-900 font-mono">
                                                {formatCurrency(entry.totalAmount)}
                                              </td>

                                              {/* Date */}
                                              <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                                                {entry.measurementDate ? entry.measurementDate.split("T")[0] : ""}
                                              </td>

                                              {/* Status */}
                                              <td className="py-2.5 px-3 whitespace-nowrap">
                                                {getStatusBadge(entry.status)}
                                              </td>

                                              {/* Evidence Photos */}
                                              <td className="py-2.5 px-3 text-center">
                                                <button
                                                  onClick={() => openImagesModal(entry)}
                                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition ${
                                                    photosCount > 0
                                                      ? "bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300"
                                                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                                  }`}
                                                  title="Evidence photos & version history"
                                                >
                                                  <ImageIcon className="w-3.5 h-3.5" />
                                                  {photosCount > 0 ? `${photosCount} Photos` : "+ Add"}
                                                </button>
                                              </td>

                                              {/* Actions Dropdown / Menu */}
                                              <td className="py-2.5 px-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                  {/* Edit with Reason */}
                                                  {canManageMeasurements && entry.status !== "BILLED" && (
                                                    <button
                                                      onClick={() => openEditModal(entry)}
                                                      className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition"
                                                      title="Edit with mandatory reason"
                                                    >
                                                      <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                  )}

                                                  {/* Duplicate */}
                                                  {canManageMeasurements && (
                                                    <button
                                                      onClick={() => openDuplicateMeasurementModal(entry)}
                                                      className="p-1 rounded text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition"
                                                      title="Duplicate measurement entry"
                                                    >
                                                      <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                  )}

                                                  {/* History */}
                                                  <button
                                                    onClick={() => openHistoryModal(entry.id)}
                                                    className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                                                    title="View audit history & diffs"
                                                  >
                                                    <History className="w-3.5 h-3.5" />
                                                  </button>

                                                  {/* Status Verification Actions */}
                                                  {canManageMeasurements && entry.status === "SUBMITTED" && (
                                                    <button
                                                      onClick={() => handleStatusChange(entry.id, "VERIFIED")}
                                                      className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition"
                                                      title="Mark as site verified"
                                                    >
                                                      Verify
                                                    </button>
                                                  )}

                                                  {canWriteFinance && entry.status === "VERIFIED" && (
                                                    <button
                                                      onClick={() => handleStatusChange(entry.id, "APPROVED")}
                                                      className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                                                      title="Approve measurement for contractor billing"
                                                    >
                                                      Approve
                                                    </button>
                                                  )}

                                                  {/* Convert to Bill */}
                                                  {canWriteFinance && entry.status === "APPROVED" && !entry.billId && (
                                                    <button
                                                      onClick={() => openConvertBillModal(entry)}
                                                      className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition flex items-center gap-1"
                                                      title="Generate Contractor Bill"
                                                    >
                                                      <Receipt className="w-3 h-3" /> Bill
                                                    </button>
                                                  )}

                                                  {/* Delete with Reason */}
                                                  {canManageMeasurements && entry.status !== "BILLED" && (
                                                    <button
                                                      onClick={() => openDeleteModal(entry)}
                                                      className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                                      title="Delete with mandatory reason"
                                                    >
                                                      <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                  )}
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ================= MODALS ================= */}

        {/* 1. ADD MAIN GROUP MODAL */}
        {showAddGroupModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 my-8 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                  <FolderPlus className="w-5 h-5 text-amber-600" />
                  Add Main Group (Level 1)
                </div>
                <button onClick={() => setShowAddGroupModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddGroupSubmit} className="space-y-4 mt-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Project <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={grpProjectId}
                    onChange={(e) => setGrpProjectId(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">-- Choose Project --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Contractor / Vendor <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={grpPartyId}
                    onChange={(e) => setGrpPartyId(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">-- Choose Party --</option>
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — [{p.partyType}]
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Site Location (Optional)
                  </label>
                  <select
                    value={grpSiteId}
                    onChange={(e) => setGrpSiteId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">-- Auto-detect from Project --</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Custom Group Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Kohinoor Villa - Asian Paints Painting Works"
                    value={grpName}
                    onChange={(e) => setGrpName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Notes</label>
                  <textarea
                    rows={2}
                    value={grpDescription}
                    onChange={(e) => setGrpDescription(e.target.value)}
                    placeholder="Work scope, agreed schedule or contract reference..."
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAddGroupModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 rounded-lg shadow"
                  >
                    {actionLoading ? "Saving..." : "Create Main Group"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 2. ADD SUBGROUP MODAL */}
        {showAddSubgroupModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 my-8 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                  <Layers className="w-5 h-5 text-blue-600" />
                  Add Room / Subgroup (Level 2)
                </div>
                <button onClick={() => setShowAddSubgroupModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddSubgroupSubmit} className="space-y-4 mt-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Main Group <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={subgrpGroupId || targetGroupForSubgroup}
                    onChange={(e) => setSubgrpGroupId(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">-- Choose Main Group --</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.project?.name} + {g.party?.name} ({g.party?.partyType})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Room / Subgroup Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Drawing Room, Bedroom 1, Ground Floor, Exterior Wall"
                    value={subgrpName}
                    onChange={(e) => setSubgrpName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Subgroup Classification</label>
                  <select
                    value={subgrpType}
                    onChange={(e) => setSubgrpType(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="ROOM">Room (Drawing Room, Bedroom, Kitchen, etc.)</option>
                    <option value="FLOOR">Floor (Ground Floor, 1st Floor, Basement, Terrace)</option>
                    <option value="AREA">Area (Front Yard, Parking, Corridor, Lobby)</option>
                    <option value="LOCATION">Location (Tower A, Block 3, North Wing)</option>
                    <option value="WORK_SECTION">Work Section (Foundation, RCC Slab, Masonry)</option>
                    <option value="CUSTOM">Custom Section</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Remarks</label>
                  <textarea
                    rows={2}
                    value={subgrpDescription}
                    onChange={(e) => setSubgrpDescription(e.target.value)}
                    placeholder="Optional notes regarding this area or drawings..."
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAddSubgroupModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow"
                  >
                    {actionLoading ? "Saving..." : "Create Subgroup"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 3. ADD / DUPLICATE MEASUREMENT MODAL */}
        {showAddEntryModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200/90 max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-slate-100 bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 shadow-sm shrink-0">
                    <Ruler className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900 tracking-tight">Record Measurement Entry</h2>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        Item Record
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Record site measurements with automatic quantity calculations, segregated units & rates
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddEntryModal(false)}
                  className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddMeasurementSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="p-4 sm:px-6 sm:py-3.5 overflow-y-auto space-y-3 flex-1">
                {groups.length > 0 && !useDirectSelection ? (
                  <div className="p-3 bg-slate-50/70 border border-slate-200/80 rounded-xl">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold text-slate-700">
                            Main Group (Project + Party) <span className="text-rose-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setUseDirectSelection(true);
                              if (!formProjectId && projects.length > 0) setFormProjectId(projects[0].id);
                              if (!formPartyId && parties.length > 0) setFormPartyId(parties[0].id);
                            }}
                            className="text-[11px] text-amber-600 hover:text-amber-700 font-semibold hover:underline"
                          >
                            + Pick Project & Party Directly
                          </button>
                        </div>
                        <select
                          value={formGroupId}
                          onChange={(e) => {
                            if (e.target.value === "__DIRECT_PICK__") {
                              setUseDirectSelection(true);
                              if (!formProjectId && projects.length > 0) setFormProjectId(projects[0].id);
                              if (!formPartyId && parties.length > 0) setFormPartyId(parties[0].id);
                              return;
                            }
                            setFormGroupId(e.target.value);
                            const g = groups.find((grp) => grp.id === e.target.value);
                            if (g) {
                              setFormProjectId(g.projectId);
                              setFormPartyId(g.partyId);
                              if (g.subgroups.length > 0) {
                                setFormSubgroupId(g.subgroups[0].id);
                              } else {
                                setFormSubgroupId(STANDARD_ROOMS[0]);
                              }
                            }
                          }}
                          required
                          className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-medium text-slate-800"
                        >
                          <option value="">-- Select Main Group --</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.project?.name || "Project"} — {g.party?.name || "Party"} ({g.party?.partyType || "Party"})
                            </option>
                          ))}
                          <option value="__DIRECT_PICK__">+ Select Different Project & Contractor...</option>
                        </select>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold text-slate-700">
                            Room / Subgroup <span className="text-rose-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomRoom(!isCustomRoom);
                              if (!isCustomRoom) setFormSubgroupId("__CUSTOM__");
                            }}
                            className="text-[11px] text-amber-600 hover:text-amber-700 font-semibold hover:underline"
                          >
                            {isCustomRoom ? "Select From List" : "+ Type Custom Room"}
                          </button>
                        </div>
                        {isCustomRoom ? (
                          <input
                            type="text"
                            placeholder="e.g. Master Bedroom, Living Room, External Plaster"
                            value={formCustomRoom}
                            onChange={(e) => setFormCustomRoom(e.target.value)}
                            required
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-medium text-slate-800"
                          />
                        ) : (
                          <select
                            value={formSubgroupId}
                            onChange={(e) => {
                              if (e.target.value === "__CUSTOM__") {
                                setIsCustomRoom(true);
                              } else {
                                setFormSubgroupId(e.target.value);
                              }
                            }}
                            required
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-medium text-slate-800"
                          >
                            {currentSubgroupsForForm.length > 0 && (
                              <optgroup label="Existing Rooms / Sections in Group">
                                {currentSubgroupsForForm.map((sg) => (
                                  <option key={sg.id} value={sg.id}>
                                    {sg.name} ({sg.type})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label="Standard Rooms / Work Sections">
                              {STANDARD_ROOMS.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </optgroup>
                            <option value="__CUSTOM__">+ Type Custom Room / Subgroup...</option>
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50/70 border border-amber-200/90 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-amber-600" />
                        Direct Project, Contractor & Room Selection
                      </span>
                      {groups.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setUseDirectSelection(false);
                            if (groups.length > 0) setFormGroupId(groups[0].id);
                          }}
                          className="text-[11px] text-amber-800 hover:underline font-bold"
                        >
                          Use Existing Groups
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-1">
                          Project <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={formProjectId}
                          onChange={(e) => setFormProjectId(e.target.value)}
                          required
                          className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-medium text-slate-800"
                        >
                          <option value="">-- Select Project --</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} {p.code ? `(${p.code})` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-1">
                          Contractor / Vendor <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={formPartyId}
                          onChange={(e) => setFormPartyId(e.target.value)}
                          required
                          className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-medium text-slate-800"
                        >
                          <option value="">-- Select Contractor / Party --</option>
                          {parties.map((pa) => (
                            <option key={pa.id} value={pa.id}>
                              {pa.name} ({pa.partyType})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-semibold text-slate-800">
                            Room / Subgroup <span className="text-rose-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomRoom(!isCustomRoom);
                              if (!isCustomRoom) setFormSubgroupId("__CUSTOM__");
                            }}
                            className="text-[11px] text-amber-700 hover:underline font-semibold"
                          >
                            {isCustomRoom ? "Select From List" : "+ Type Custom"}
                          </button>
                        </div>
                        {isCustomRoom ? (
                          <input
                            type="text"
                            placeholder="e.g. Master Bedroom, Living Room"
                            value={formCustomRoom}
                            onChange={(e) => setFormCustomRoom(e.target.value)}
                            required
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-medium text-slate-800"
                          />
                        ) : (
                          <select
                            value={formSubgroupId}
                            onChange={(e) => {
                              if (e.target.value === "__CUSTOM__") {
                                setIsCustomRoom(true);
                              } else {
                                setFormSubgroupId(e.target.value);
                              }
                            }}
                            required
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-medium text-slate-800"
                          >
                            <optgroup label="Standard Rooms / Work Sections">
                              {STANDARD_ROOMS.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </optgroup>
                            <option value="__CUSTOM__">+ Type Custom Room / Subgroup...</option>
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Entry / Component Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Wall 1, Beam B1, Floor Plaster"
                      value={formEntryName}
                      onChange={(e) => setFormEntryName(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50/70 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-semibold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Reference Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. MB-04-W1"
                      value={formRefNumber}
                      onChange={(e) => setFormRefNumber(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50/70 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Measurement Date
                    </label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50/70 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-800 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Work / Item Description <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 12mm thick internal cement plaster (1:4) with sponge finish"
                    value={formItemDesc}
                    onChange={(e) => setFormItemDesc(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50/70 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Measurement Element / Type
                    </label>
                    <select
                      value={formMeasurementType}
                      onChange={(e) => setFormMeasurementType(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50/70 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-800"
                    >
                      {MEASUREMENT_TYPE_GROUPS.map((grp) => (
                        <optgroup key={grp.category} label={`🔹 ${grp.category}`}>
                          {grp.types.map((t) => (
                            <option key={t.code} value={t.code}>
                              {t.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Calculation Formula
                    </label>
                    <select
                      value={formFormula}
                      onChange={(e) => setFormFormula(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50/70 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-semibold text-slate-800"
                    >
                      <option value="AREA">AREA (N × L × H/B)</option>
                      <option value="VOLUME">VOLUME (N × L × B × H)</option>
                      <option value="LENGTH">LENGTH (N × L)</option>
                      <option value="QUANTITY">QUANTITY (N × Unit Qty)</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">Unit of Measure</label>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${activeUnitMeta.badgeBg}`}>
                        {activeUnitMeta.systemLabel}
                      </span>
                    </div>
                    <select
                      value={formUnit}
                      onChange={(e) => {
                        const newUnit = e.target.value;
                        setFormUnit(newUnit);
                        const meta = getUnitMetadata(newUnit);
                        if (meta.formula) setFormFormula(meta.formula);
                      }}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50/70 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-bold text-slate-900"
                    >
                      {MEASUREMENT_UNIT_GROUPS.map((grp) => (
                        <optgroup
                          key={grp.system}
                          label={`${grp.system === "IMPERIAL" ? "📐" : grp.system === "METRIC" ? "📏" : "📦"} ${grp.category} (${grp.badge})`}
                        >
                          {grp.units.map((u) => (
                            <option key={u.code} value={u.code}>
                              {u.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Quick Unit Selection Bar (Segregated Systems) */}
                <div className="p-2.5 bg-gradient-to-b from-slate-50 to-slate-100/70 rounded-xl border border-slate-200/90 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Ruler className="w-3.5 h-3.5 text-amber-600" />
                      Quick Unit Selection (Segregated Systems)
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Click any unit to auto-apply formula & dimension units
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                    {/* Imperial / FPS (Square Feet, Inch, CFT, RFT) */}
                    <div className="flex flex-wrap items-center gap-1 bg-amber-50/90 border border-amber-200/90 rounded-lg p-1.5">
                      <span className="text-[10px] font-black text-amber-900 uppercase tracking-tight px-1 flex items-center gap-1 w-full sm:w-auto">
                        <span>📐</span> FPS / Imperial:
                      </span>
                      <div className="flex flex-wrap items-center gap-1">
                        {MEASUREMENT_UNIT_GROUPS[0].units.map((u) => {
                          const isSelected = formUnit.toUpperCase() === u.code;
                          return (
                            <button
                              key={u.code}
                              type="button"
                              onClick={() => handleSelectQuickUnit(u.code, u.formula)}
                              title={u.description}
                              className={`px-2 py-0.5 rounded text-[11px] font-bold transition flex items-center gap-1 ${
                                isSelected
                                  ? "bg-amber-600 text-white shadow-sm ring-2 ring-amber-500/40"
                                  : "bg-white text-amber-950 border border-amber-200/80 hover:bg-amber-100"
                              }`}
                            >
                              <span>{u.code}</span>
                              <span className={`text-[9px] ${isSelected ? "text-amber-100" : "text-amber-700"}`}>
                                ({u.dimUnit})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Metric System (MKS / SI - MM, SQM, CUM, RMT) */}
                    <div className="flex flex-wrap items-center gap-1 bg-blue-50/90 border border-blue-200/90 rounded-lg p-1.5">
                      <span className="text-[10px] font-black text-blue-900 uppercase tracking-tight px-1 flex items-center gap-1 w-full sm:w-auto">
                        <span>📏</span> Metric (SI):
                      </span>
                      <div className="flex flex-wrap items-center gap-1">
                        {MEASUREMENT_UNIT_GROUPS[1].units.map((u) => {
                          const isSelected = formUnit.toUpperCase() === u.code;
                          return (
                            <button
                              key={u.code}
                              type="button"
                              onClick={() => handleSelectQuickUnit(u.code, u.formula)}
                              title={u.description}
                              className={`px-2 py-0.5 rounded text-[11px] font-bold transition flex items-center gap-1 ${
                                isSelected
                                  ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-500/40"
                                  : "bg-white text-blue-950 border border-blue-200/80 hover:bg-blue-100"
                              }`}
                            >
                              <span>{u.code}</span>
                              <span className={`text-[9px] ${isSelected ? "text-blue-100" : "text-blue-700"}`}>
                                ({u.dimUnit})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Counts, Bulk & Site Units */}
                    <div className="flex flex-wrap items-center gap-1 bg-emerald-50/90 border border-emerald-200/90 rounded-lg p-1.5">
                      <span className="text-[10px] font-black text-emerald-900 uppercase tracking-tight px-1 flex items-center gap-1 w-full sm:w-auto">
                        <span>📦</span> Counts & Bulk:
                      </span>
                      <div className="flex flex-wrap items-center gap-1">
                        {MEASUREMENT_UNIT_GROUPS[2].units.map((u) => {
                          const isSelected = formUnit.toUpperCase() === u.code;
                          return (
                            <button
                              key={u.code}
                              type="button"
                              onClick={() => handleSelectQuickUnit(u.code, u.formula)}
                              title={u.description}
                              className={`px-2 py-0.5 rounded text-[11px] font-bold transition flex items-center gap-1 ${
                                isSelected
                                  ? "bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/40"
                                  : "bg-white text-emerald-950 border border-emerald-200/80 hover:bg-emerald-100"
                              }`}
                            >
                              <span>{u.code}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dimension Inputs & Calculation */}
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/90 space-y-2.5">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-slate-900">
                      <Calculator className="w-4 h-4 text-amber-600" />
                      <span>Dimensions & Quantity Calculation</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${activeUnitMeta.badgeBg}`}>
                      Active Unit: {activeUnitMeta.code} · Dimensions in {activeUnitMeta.dimUnit} ({activeUnitMeta.systemLabel})
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <div>
                      <div className="flex items-center justify-between mb-1 min-h-[16px]">
                        <label className="text-[11px] font-bold text-slate-700">Count</label>
                        <span className="text-[10px] text-slate-400 font-medium">Nos</span>
                      </div>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={formCount}
                        onChange={(e) => setFormCount(e.target.value)}
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono text-center font-bold text-slate-800"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1 min-h-[16px]">
                        <label className="text-[11px] font-bold text-slate-700">Length (L)</label>
                        <span className="text-[10px] text-slate-500 font-medium">{activeUnitMeta.dimUnit}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={formLength}
                        onChange={(e) => setFormLength(e.target.value)}
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono text-center font-bold text-slate-800"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1 min-h-[16px]">
                        <label className="text-[11px] font-bold text-slate-700">Breadth (B)</label>
                        <span className="text-[10px] text-slate-500 font-medium">{activeUnitMeta.dimUnit}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        placeholder="Optional"
                        value={formBreadth}
                        onChange={(e) => setFormBreadth(e.target.value)}
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono text-center font-medium text-slate-800"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1 min-h-[16px]">
                        <label className="text-[11px] font-bold text-slate-700">Height / Depth (H)</label>
                        <span className="text-[10px] text-slate-500 font-medium">{activeUnitMeta.dimUnit}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        placeholder="Optional"
                        value={formDepth}
                        onChange={(e) => setFormDepth(e.target.value)}
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono text-center font-medium text-slate-800"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1 min-h-[16px]">
                        <label className="text-[11px] font-bold text-rose-700">Deduction (−)</label>
                        <span className="text-[10px] text-rose-500 font-medium">{activeUnitMeta.code}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        placeholder="0.00"
                        value={formDeduction}
                        onChange={(e) => setFormDeduction(e.target.value)}
                        className="w-full px-2 py-1 text-xs bg-white border border-rose-200 rounded-lg focus:ring-2 focus:ring-rose-400 font-mono text-center font-bold text-rose-600"
                      />
                    </div>
                  </div>

                  {/* Realtime Formula & Quantity Breakdown */}
                  <div className="mt-1.5 pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-slate-600 font-medium">
                      <span>Gross: <strong className="font-mono text-slate-800">{formatQuantity(calculatedFormGross)}</strong></span>
                      <span className="text-slate-400 font-black">−</span>
                      <span>Ded: <strong className="font-mono text-rose-600">{formatQuantity(Number(formDeduction) || 0)}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-700 font-bold text-xs">Net Billable Quantity:</span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-950 font-mono font-black text-sm shadow-xs">
                        {formatQuantity(calculatedFormNet)} {formUnit}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Rate & Total Amount - Perfectly Aligned */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700">
                        Agreed Unit Rate <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[11px] text-slate-500 font-medium">
                        ₹ per {formUnit}
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs select-none">₹</span>
                      <input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        placeholder="0.00"
                        value={formRateRupees}
                        onChange={(e) => setFormRateRupees(e.target.value)}
                        className="w-full pl-7 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono font-bold text-slate-800 h-[36px]"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-amber-950">
                        Computed Work Total
                      </label>
                      <span className="text-[11px] text-amber-800 font-medium">
                        Net Qty × Agreed Rate
                      </span>
                    </div>
                    <div className="h-[36px] px-3 bg-gradient-to-r from-amber-50 to-amber-100/80 rounded-lg border border-amber-300/80 flex items-center justify-between shadow-xs">
                      <span className="text-[11px] font-bold text-amber-900 uppercase tracking-tight">Total Amount:</span>
                      <span className="text-base font-black text-amber-950 font-mono">
                        ₹{calculatedFormTotalRupees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Site Notes / Remarks</label>
                    <span className="text-[10px] text-slate-400">Optional specifications, location or elevation</span>
                  </div>
                  <textarea
                    rows={2}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="e.g. Specific grid line, 1st floor exterior, 1:4 cement mortar with waterproofing compound..."
                    className="w-full px-3 py-1.5 text-xs bg-slate-50/70 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none text-slate-800"
                  />
                </div>
                </div>

                {/* Modal Footer */}
                <div className="px-5 sm:px-6 py-3 bg-slate-50/95 border-t border-slate-200 flex items-center justify-between shrink-0">
                  <div className="hidden sm:flex items-center gap-2 text-xs">
                    <span className="text-slate-500">Summary:</span>
                    <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {formatQuantity(calculatedFormNet)} {formUnit}
                    </span>
                    <span className="text-slate-400">×</span>
                    <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                      ₹{Number(formRateRupees || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-slate-400">=</span>
                    <span className="font-mono font-black text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-300">
                      ₹{calculatedFormTotalRupees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setShowAddEntryModal(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-xl transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="px-5 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 rounded-xl shadow-md shadow-amber-500/20 active:scale-95 transition flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4 text-slate-950" />
                      <span>{actionLoading ? "Saving..." : "Record Measurement"}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 4. EDIT MEASUREMENT MODAL (WITH MANDATORY REASON) */}
        {showEditEntryModal && activeEntry && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200/90 max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 shadow-sm shrink-0">
                    <Edit2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900 tracking-tight">Edit Measurement Entry</h2>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                        v{activeEntry.version} · Audit Tracked
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Modify site measurements with strict immutable audit trail logging
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEditEntryModal(false)}
                  className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleEditMeasurementSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="p-4 sm:px-6 sm:py-3.5 overflow-y-auto space-y-3 flex-1">
                  {/* Notice for Supervisor vs Admin */}
                  <div className="p-2.5 bg-blue-50/80 border border-blue-200/90 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Strict Audit Requirement:</span> Silently overwriting measurement entries is prohibited. Every modification creates an immutable audit record with previous vs new values.
                      {currentUser?.role === "SITE_SUPERVISOR" && (
                        <span className="block mt-1 font-semibold text-amber-900">
                          Note: As Site Supervisor, modifying approved records will automatically generate a Change Request for Admin approval.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* MANDATORY REASON FIELD */}
                  <div className="p-3 bg-amber-50/80 border-2 border-amber-300 rounded-xl space-y-1">
                    <label className="block text-xs font-bold text-amber-950">
                      Mandatory Reason for Modification <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Wall height adjusted following on-site remeasurement..."
                      value={mandatoryReason}
                      onChange={(e) => setMandatoryReason(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-medium text-slate-900"
                    />
                    <span className="text-[10px] text-amber-800 block">
                      This reason will be permanently recorded in the immutable audit history.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Component / Entry Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formEntryName}
                        onChange={(e) => setFormEntryName(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50/70 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-semibold text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Measurement Date</label>
                      <input
                        type="date"
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50/70 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-800 font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Work / Item Description <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formItemDesc}
                      onChange={(e) => setFormItemDesc(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50/70 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Measurement Element / Type
                      </label>
                      <select
                        value={formMeasurementType}
                        onChange={(e) => setFormMeasurementType(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50/70 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-800"
                      >
                        {MEASUREMENT_TYPE_GROUPS.map((grp) => (
                          <optgroup key={grp.category} label={`🔹 ${grp.category}`}>
                            {grp.types.map((t) => (
                              <option key={t.code} value={t.code}>
                                {t.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Calculation Formula</label>
                      <select
                        value={formFormula}
                        onChange={(e) => setFormFormula(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50/70 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-semibold text-slate-800"
                      >
                        <option value="AREA">AREA (N × L × H/B)</option>
                        <option value="VOLUME">VOLUME (N × L × B × H)</option>
                        <option value="LENGTH">LENGTH (N × L)</option>
                        <option value="QUANTITY">QUANTITY (N × Unit Qty)</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-700">Unit of Measure</label>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${activeUnitMeta.badgeBg}`}>
                          {activeUnitMeta.systemLabel}
                        </span>
                      </div>
                      <select
                        value={formUnit}
                        onChange={(e) => {
                          const newUnit = e.target.value;
                          setFormUnit(newUnit);
                          const meta = getUnitMetadata(newUnit);
                          if (meta.formula) setFormFormula(meta.formula);
                        }}
                        className="w-full px-3 py-1.5 text-xs bg-slate-50/70 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-bold text-slate-900"
                      >
                        {MEASUREMENT_UNIT_GROUPS.map((grp) => (
                          <optgroup
                            key={grp.system}
                            label={`${grp.system === "IMPERIAL" ? "📐" : grp.system === "METRIC" ? "📏" : "📦"} ${grp.category} (${grp.badge})`}
                          >
                            {grp.units.map((u) => (
                              <option key={u.code} value={u.code}>
                                {u.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Quick Unit Selection Bar in Edit Modal */}
                  <div className="p-2.5 bg-gradient-to-b from-slate-50 to-slate-100/70 rounded-xl border border-slate-200/90 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Ruler className="w-3.5 h-3.5 text-blue-600" />
                        Quick Unit Selection (Segregated Systems)
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Click any unit to auto-apply formula & dimension units
                      </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                      {/* Imperial / FPS (Square Feet, Inch, CFT, RFT) */}
                      <div className="flex flex-wrap items-center gap-1 bg-amber-50/90 border border-amber-200/90 rounded-lg p-1.5">
                        <span className="text-[10px] font-black text-amber-900 uppercase tracking-tight px-1 flex items-center gap-1 w-full sm:w-auto">
                          <span>📐</span> FPS / Imperial:
                        </span>
                        <div className="flex flex-wrap items-center gap-1">
                          {MEASUREMENT_UNIT_GROUPS[0].units.map((u) => {
                            const isSelected = formUnit.toUpperCase() === u.code;
                            return (
                              <button
                                key={u.code}
                                type="button"
                                onClick={() => handleSelectQuickUnit(u.code, u.formula)}
                                title={u.description}
                                className={`px-2 py-0.5 rounded text-[11px] font-bold transition flex items-center gap-1 ${
                                  isSelected
                                    ? "bg-amber-600 text-white shadow-sm ring-2 ring-amber-500/40"
                                    : "bg-white text-amber-950 border border-amber-200/80 hover:bg-amber-100"
                                }`}
                              >
                                <span>{u.code}</span>
                                <span className={`text-[9px] ${isSelected ? "text-amber-100" : "text-amber-700"}`}>
                                  ({u.dimUnit})
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Metric System (MKS / SI - MM, SQM, CUM, RMT) */}
                      <div className="flex flex-wrap items-center gap-1 bg-blue-50/90 border border-blue-200/90 rounded-lg p-1.5">
                        <span className="text-[10px] font-black text-blue-900 uppercase tracking-tight px-1 flex items-center gap-1 w-full sm:w-auto">
                          <span>📏</span> Metric (SI):
                        </span>
                        <div className="flex flex-wrap items-center gap-1">
                          {MEASUREMENT_UNIT_GROUPS[1].units.map((u) => {
                            const isSelected = formUnit.toUpperCase() === u.code;
                            return (
                              <button
                                key={u.code}
                                type="button"
                                onClick={() => handleSelectQuickUnit(u.code, u.formula)}
                                title={u.description}
                                className={`px-2 py-0.5 rounded text-[11px] font-bold transition flex items-center gap-1 ${
                                  isSelected
                                    ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-500/40"
                                    : "bg-white text-blue-950 border border-blue-200/80 hover:bg-blue-100"
                                }`}
                              >
                                <span>{u.code}</span>
                                <span className={`text-[9px] ${isSelected ? "text-blue-100" : "text-blue-700"}`}>
                                  ({u.dimUnit})
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Counts, Bulk & Site Units */}
                      <div className="flex flex-wrap items-center gap-1 bg-emerald-50/90 border border-emerald-200/90 rounded-lg p-1.5">
                        <span className="text-[10px] font-black text-emerald-900 uppercase tracking-tight px-1 flex items-center gap-1 w-full sm:w-auto">
                          <span>📦</span> Counts & Bulk:
                        </span>
                        <div className="flex flex-wrap items-center gap-1">
                          {MEASUREMENT_UNIT_GROUPS[2].units.map((u) => {
                            const isSelected = formUnit.toUpperCase() === u.code;
                            return (
                              <button
                                key={u.code}
                                type="button"
                                onClick={() => handleSelectQuickUnit(u.code, u.formula)}
                                title={u.description}
                                className={`px-2 py-0.5 rounded text-[11px] font-bold transition flex items-center gap-1 ${
                                  isSelected
                                    ? "bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/40"
                                    : "bg-white text-emerald-950 border border-emerald-200/80 hover:bg-emerald-100"
                                }`}
                              >
                                <span>{u.code}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dimensions & Modification Calculation */}
                  <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/90 space-y-2.5">
                    <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-slate-900">
                        <Calculator className="w-4 h-4 text-blue-600" />
                        <span>Dimensions & Modification Calculation</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${activeUnitMeta.badgeBg}`}>
                        Active Unit: {activeUnitMeta.code} · Dimensions in {activeUnitMeta.dimUnit} ({activeUnitMeta.systemLabel})
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <div>
                        <div className="flex items-center justify-between mb-1 min-h-[16px]">
                          <label className="text-[11px] font-bold text-slate-700">Count</label>
                          <span className="text-[10px] text-slate-400 font-medium">Nos</span>
                        </div>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={formCount}
                          onChange={(e) => setFormCount(e.target.value)}
                          className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-center font-bold text-slate-800"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1 min-h-[16px]">
                          <label className="text-[11px] font-bold text-slate-700">Length (L)</label>
                          <span className="text-[10px] text-slate-500 font-medium">{activeUnitMeta.dimUnit}</span>
                        </div>
                        <input
                          type="number"
                          step="0.001"
                          value={formLength}
                          onChange={(e) => setFormLength(e.target.value)}
                          className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-center font-bold text-slate-800"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1 min-h-[16px]">
                          <label className="text-[11px] font-bold text-slate-700">Breadth (B)</label>
                          <span className="text-[10px] text-slate-500 font-medium">{activeUnitMeta.dimUnit}</span>
                        </div>
                        <input
                          type="number"
                          step="0.001"
                          placeholder="Optional"
                          value={formBreadth}
                          onChange={(e) => setFormBreadth(e.target.value)}
                          className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-center font-medium text-slate-800"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1 min-h-[16px]">
                          <label className="text-[11px] font-bold text-slate-700">Height / Depth (H)</label>
                          <span className="text-[10px] text-slate-500 font-medium">{activeUnitMeta.dimUnit}</span>
                        </div>
                        <input
                          type="number"
                          step="0.001"
                          placeholder="Optional"
                          value={formDepth}
                          onChange={(e) => setFormDepth(e.target.value)}
                          className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-center font-medium text-slate-800"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1 min-h-[16px]">
                          <label className="text-[11px] font-bold text-rose-700">Deduction (−)</label>
                          <span className="text-[10px] text-rose-500 font-medium">{activeUnitMeta.code}</span>
                        </div>
                        <input
                          type="number"
                          step="0.001"
                          placeholder="0.00"
                          value={formDeduction}
                          onChange={(e) => setFormDeduction(e.target.value)}
                          className="w-full px-2 py-1 text-xs bg-white border border-rose-200 rounded-lg focus:ring-2 focus:ring-rose-400 font-mono text-center font-bold text-rose-600"
                        />
                      </div>
                    </div>

                    {/* Realtime Formula & Quantity Breakdown */}
                    <div className="mt-1.5 pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 text-slate-600 font-medium">
                        <span>Gross: <strong className="font-mono text-slate-800">{formatQuantity(calculatedFormGross)}</strong></span>
                        <span className="text-slate-400 font-black">−</span>
                        <span>Ded: <strong className="font-mono text-rose-600">{formatQuantity(Number(formDeduction) || 0)}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-700 font-bold text-xs">New Net Billable:</span>
                        <span className="px-2.5 py-0.5 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-950 font-mono font-black text-sm shadow-xs">
                          {formatQuantity(calculatedFormNet)} {formUnit}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Rate & Total Amount - Perfectly Aligned */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700">
                          Agreed Unit Rate <span className="text-rose-500">*</span>
                        </label>
                        <span className="text-[11px] text-slate-500 font-medium">
                          ₹ per {formUnit}
                        </span>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs select-none">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          value={formRateRupees}
                          onChange={(e) => setFormRateRupees(e.target.value)}
                          className="w-full pl-7 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono font-bold text-slate-800 h-[36px]"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-blue-950">
                          Computed Work Total
                        </label>
                        <span className="text-[11px] text-blue-800 font-medium">
                          Net Qty × Agreed Rate
                        </span>
                      </div>
                      <div className="h-[36px] px-3 bg-gradient-to-r from-blue-50 to-blue-100/80 rounded-lg border border-blue-300/80 flex items-center justify-between shadow-xs">
                        <span className="text-[11px] font-bold text-blue-900 uppercase tracking-tight">Total Amount:</span>
                        <span className="text-base font-black text-blue-950 font-mono">
                          ₹{calculatedFormTotalRupees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="px-5 sm:px-6 py-3 bg-slate-50/95 border-t border-slate-200 flex items-center justify-between shrink-0">
                  <div className="hidden sm:flex items-center gap-2 text-xs">
                    <span className="text-slate-500">New Total:</span>
                    <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {formatQuantity(calculatedFormNet)} {formUnit}
                    </span>
                    <span className="text-slate-400">×</span>
                    <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                      ₹{Number(formRateRupees || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-slate-400">=</span>
                    <span className="font-mono font-black text-blue-900 bg-blue-100/80 px-2 py-0.5 rounded border border-blue-300">
                      ₹{calculatedFormTotalRupees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setShowEditEntryModal(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-xl transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4 text-white" />
                      <span>{actionLoading ? "Saving..." : "Confirm & Update with Audit Reason"}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 5. DELETE MEASUREMENT MODAL (WITH MANDATORY REASON) */}
        {showDeleteEntryModal && activeEntry && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 my-8 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100 text-rose-600">
                <Trash2 className="w-6 h-6 shrink-0" />
                <h3 className="text-lg font-bold text-slate-900">Delete Wall Measurement</h3>
              </div>

              <div className="mt-3 space-y-2 text-xs text-slate-600">
                <p>
                  You are deleting entry <strong className="text-slate-900">{activeEntry.entryName || activeEntry.itemDescription}</strong>.
                </p>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded font-mono text-[11px]">
                  Net Qty: {formatQuantity(activeEntry.quantity)} {activeEntry.unit} • Amount: {formatCurrency(activeEntry.totalAmount)}
                </div>
              </div>

              <form onSubmit={handleDeleteMeasurementSubmit} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-900 mb-1">
                    Mandatory Reason for Deletion <span className="text-rose-600">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="e.g. Wall demolished, duplicate measurement entry, canceled work order..."
                    value={mandatoryReason}
                    onChange={(e) => setMandatoryReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 font-medium"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowDeleteEntryModal(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow"
                  >
                    {actionLoading ? "Archiving..." : "Confirm Deletion with Reason"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 5B. DELETE MAIN GROUP MODAL */}
        {showDeleteGroupModal && groupToDelete && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 my-8 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100 text-rose-600">
                <div className="p-2 bg-rose-50 rounded-xl text-rose-600">
                  <Trash2 className="w-6 h-6 shrink-0" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Delete Main Group</h3>
                  <p className="text-xs text-slate-500">Project & Contractor Linkage</p>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-xs text-slate-600">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Project:</span>
                    <span className="font-bold text-slate-900">
                      {groupToDelete.project?.name || "Unknown Project"}
                      {groupToDelete.project?.code ? ` (${groupToDelete.project.code})` : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Party / Contractor:</span>
                    <span className="font-bold text-slate-900">
                      {groupToDelete.party?.name || "Unknown Party"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                    <span className="text-slate-500 font-medium">Rooms / Subgroups:</span>
                    <span className="font-semibold text-slate-800">
                      {groupToDelete.subgroups?.length || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Measurement Total:</span>
                    <span className="font-bold text-emerald-700">
                      {formatCurrency(groupToDelete.totalAmount)}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-rose-50/80 border border-rose-200 rounded-xl text-rose-900 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Permanent Deletion:</span> This action will remove this Main Group and all of its rooms, measurement entries, evidence photos, and audit logs.
                    <span className="block mt-1 text-[11px] text-rose-700 font-medium">
                      If any measurement in this group has already been BILLED, deletion is prohibited.
                    </span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleDeleteGroupSubmit} className="mt-5 flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteGroupModal(false);
                    setGroupToDelete(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow transition disabled:opacity-50"
                >
                  {actionLoading ? "Deleting..." : "Confirm & Delete Main Group"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 5C. DELETE ROOM / SUBGROUP MODAL */}
        {showDeleteSubgroupModal && subgroupToDelete && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 my-8 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100 text-rose-600">
                <div className="p-2 bg-rose-50 rounded-xl text-rose-600">
                  <Trash2 className="w-6 h-6 shrink-0" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Delete Room / Subgroup</h3>
                  <p className="text-xs text-slate-500">Work Section or Room</p>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-xs text-slate-600">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Room / Subgroup:</span>
                    <span className="font-bold text-slate-900">
                      {subgroupToDelete.subgroup.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Group:</span>
                    <span className="font-semibold text-slate-800 text-right truncate max-w-[200px]">
                      {subgroupToDelete.group.project?.name} • {subgroupToDelete.group.party?.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                    <span className="text-slate-500 font-medium">Measurement Entries:</span>
                    <span className="font-semibold text-slate-800">
                      {subgroupToDelete.subgroup.entries?.length || 0} entries
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Subgroup Total:</span>
                    <span className="font-bold text-emerald-700">
                      {formatCurrency(subgroupToDelete.subgroup.totalAmount)}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-rose-50/80 border border-rose-200 rounded-xl text-rose-900 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Permanent Deletion:</span> This will delete this room/subgroup and all associated wall measurements and photos.
                    <span className="block mt-1 text-[11px] text-rose-700 font-medium">
                      If any measurement in this room has already been BILLED, deletion is prohibited.
                    </span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleDeleteSubgroupSubmit} className="mt-5 flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteSubgroupModal(false);
                    setSubgroupToDelete(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow transition disabled:opacity-50"
                >
                  {actionLoading ? "Deleting..." : "Confirm & Delete Room"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 6. EVIDENCE IMAGES MANAGEMENT MODAL */}
        {showImagesModal && activeEntry && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0 bg-white">
                <div className="flex items-center gap-2.5 text-slate-900 font-bold text-base sm:text-lg">
                  <ImageIcon className="w-5 h-5 text-amber-600 shrink-0" />
                  <span>Evidence Photos — {activeEntry.entryName || "Wall"} ({activeEntry.itemDescription})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowImagesModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
                {/* Tabs: Active Photos vs Archived Version History */}
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <button
                  onClick={() => setImageModalTab("ACTIVE")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                    imageModalTab === "ACTIVE" ? "bg-amber-500 text-slate-950" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Active Evidence Photos ({(activeEntry.attachments || []).filter((a) => !a.isDeleted).length})
                </button>
                <button
                  onClick={() => setImageModalTab("HISTORY")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                    imageModalTab === "HISTORY" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Past Versions & Audit ({(activeEntry.attachments || []).filter((a) => a.isDeleted).length})
                </button>
              </div>

              {imageModalTab === "ACTIVE" ? (
                <div className="mt-4 space-y-4">
                  {/* Active Photos Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {(activeEntry.attachments || [])
                      .filter((a) => !a.isDeleted)
                      .map((att) => (
                        <div key={att.id} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 shadow-xs flex flex-col">
                          <div className="relative aspect-4/3 bg-slate-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={att.fileUrl}
                              alt={att.fileName}
                              className="w-full h-full object-cover"
                              onError={(e: any) => {
                                e.target.src = "https://placehold.co/400x300?text=Evidence+Photo";
                              }}
                            />
                            <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-slate-900/80 text-white text-[10px] font-mono font-bold">
                              v{att.version}
                            </span>
                          </div>

                          <div className="p-2.5 flex-1 flex flex-col justify-between text-xs">
                            <div className="truncate font-semibold text-slate-800" title={att.fileName}>
                              {att.fileName}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {att.uploadedByName || "Site User"} • {att.createdAt.split("T")[0]}
                            </div>

                            <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between gap-1">
                              <a
                                href={att.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 rounded text-slate-600 hover:bg-slate-200"
                                title="Open full size"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setReplaceTargetAtt(att);
                                    setImageReason("");
                                  }}
                                  className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-[11px]"
                                >
                                  Replace
                                </button>
                                <button
                                  onClick={() => handleDeleteImage(att)}
                                  className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold text-[11px]"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* Upload / Replace Box */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
                    <div className="text-xs font-bold text-slate-900 mb-2 flex items-center gap-2">
                      <Upload className="w-4 h-4 text-amber-600" />
                      {replaceTargetAtt ? `Replace Image (v${replaceTargetAtt.version}: ${replaceTargetAtt.fileName})` : "Upload New Evidence Photo"}
                    </div>

                    <form onSubmit={handleUploadOrReplaceImage} className="space-y-3">
                      <div>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          capture="environment"
                          required
                          onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                          className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-500 file:text-slate-950 hover:file:bg-amber-600 cursor-pointer"
                        />
                      </div>

                      {replaceTargetAtt && (
                        <div>
                          <label className="block text-[11px] font-bold text-amber-950 mb-1">
                            Mandatory Reason for Replacing Image <span className="text-rose-600">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Previous photo was blurry and did not clearly show wall measurement..."
                            value={imageReason}
                            onChange={(e) => setImageReason(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-medium"
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-1">
                        {replaceTargetAtt && (
                          <button
                            type="button"
                            onClick={() => {
                              setReplaceTargetAtt(null);
                              setImageReason("");
                            }}
                            className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded"
                          >
                            Cancel Replace
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={actionLoading}
                          className="px-4 py-1.5 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 rounded-lg shadow"
                        >
                          {actionLoading ? "Uploading..." : replaceTargetAtt ? "Confirm Image Replacement" : "Upload Evidence"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              ) : (
                /* Archived Past Versions */
                <div className="mt-4 space-y-3">
                  {(activeEntry.attachments || [])
                    .filter((a) => a.isDeleted)
                    .map((att) => (
                      <div key={att.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 rounded bg-slate-300 text-slate-800 text-[10px] font-mono font-bold">
                            v{att.version} (Archived)
                          </span>
                          <div>
                            <div className="font-semibold text-slate-800">{att.fileName}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {att.replaceReason && <span>Replaced: &quot;{att.replaceReason}&quot;</span>}
                              {att.deleteReason && <span>Removed: &quot;{att.deleteReason}&quot;</span>}
                            </div>
                          </div>
                        </div>

                        <a
                          href={att.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold"
                        >
                          View Archived File
                        </a>
                      </div>
                    ))}
                  {(activeEntry.attachments || []).filter((a) => a.isDeleted).length === 0 && (
                    <div className="p-6 text-center text-xs text-slate-400">
                      No archived or replaced past versions.
                    </div>
                  )}
                </div>
              )}
              </div>

              <div className="flex justify-end p-4 bg-slate-50 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowImagesModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 7. CHANGE REQUESTS REVIEW MODAL (FOR SUPER ADMIN / ORG ADMIN) */}
        {showChangeRequestsModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0 bg-white">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-base sm:text-lg">
                  <GitPullRequest className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>Supervisor Change Requests & Audits</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowChangeRequestsModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1">
                {changeRequests.filter((cr) => cr.status === "PENDING").length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    No pending change requests awaiting manager approval.
                  </div>
                ) : (
                  changeRequests
                    .filter((cr) => cr.status === "PENDING")
                    .map((cr) => (
                      <div key={cr.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              cr.requestType === "DELETE" ? "bg-rose-100 text-rose-800" : "bg-blue-100 text-blue-800"
                            }`}>
                              {cr.requestType} REQUEST
                            </span>
                            <span className="font-bold text-slate-900 text-sm">
                              {cr.entry?.entryName || "Entry"} — {cr.entry?.itemDescription}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400">{cr.createdAt.split("T")[0]}</span>
                        </div>

                        <div className="text-xs text-slate-700 bg-white p-2.5 rounded border border-slate-200">
                          <strong className="text-slate-900">Supervisor Reason: </strong>
                          {cr.reason}
                        </div>

                        <div className="text-[11px] text-slate-500">
                          Requested by: <strong>{cr.requestedByName || cr.requestedBy}</strong> ({cr.requestedRole})
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                          <button
                            onClick={() => handleReviewChangeRequest(cr.id, "REJECT")}
                            className="px-3 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold border border-rose-200"
                          >
                            Reject Request
                          </button>
                          <button
                            onClick={() => handleReviewChangeRequest(cr.id, "APPROVE")}
                            className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow"
                          >
                            Approve & Apply
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* 8. MB ABSTRACT MODAL / PRINT VIEW */}
        {showAbstractModal && abstractData && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0 bg-white print:hidden">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-base sm:text-lg">
                  <Calculator className="w-5 h-5 text-amber-600 shrink-0" />
                  <span>Measurement Book Abstract Summary</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition"
                  >
                    <Printer className="w-4 h-4" /> Print Abstract
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAbstractModal(false)}
                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
                {/* Abstract Header */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">Overall Abstract of Measurements</h3>
                    <p className="text-xs text-slate-500">Grouped and verified by Unit & Contractual Party</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs uppercase text-slate-400 font-semibold block">Total Abstract Value</span>
                    <span className="text-lg font-black text-emerald-700">
                      {formatCurrency(abstractData.totalOverallAmount)}
                    </span>
                  </div>
                </div>

                {/* Units Abstract Table */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    1. Summary by Unit of Measurement
                  </h4>
                  <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                    <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[11px]">
                      <tr>
                        <th className="py-2 px-3">Unit</th>
                        <th className="py-2 px-3 text-right">Total Net Quantity</th>
                        <th className="py-2 px-3 text-right">Entries Count</th>
                        <th className="py-2 px-3 text-right">Total Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(abstractData.unitTotals || {}).map(([unit, data]: any) => (
                        <tr key={unit} className="hover:bg-slate-50 font-mono">
                          <td className="py-2 px-3 font-bold text-slate-900">{unit}</td>
                          <td className="py-2 px-3 text-right font-black text-amber-700">{formatQuantity(data.quantity)}</td>
                          <td className="py-2 px-3 text-right text-slate-600">{data.count}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">{formatCurrency(data.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Subcontractors Abstract Table */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    2. Summary by Contractor / Vendor
                  </h4>
                  <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                    <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[11px]">
                      <tr>
                        <th className="py-2 px-3">Party Name</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Quantities by Unit</th>
                        <th className="py-2 px-3 text-right">Work Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(abstractData.partiesSummary || {}).map(([id, p]: any) => (
                        <tr key={id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold text-slate-900">{p.name}</td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                              {p.partyType}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px]">
                            {Object.entries(p.unitTotals || {}).map(([u, q]: any) => (
                              <span key={u} className="mr-2 font-bold text-slate-800">
                                {formatQuantity(q)} {u}
                              </span>
                            ))}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-emerald-800 font-mono">
                            {formatCurrency(p.totalAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 9. AUDIT TRAIL / HISTORY DRAWER */}
        {showHistoryModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 shrink-0 bg-white">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-base sm:text-lg">
                  <History className="w-5 h-5 text-slate-700 shrink-0" />
                  <span>Append-Only Audit Trail (All Modifications)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1">
                {historyList.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    No audit records found.
                  </div>
                ) : (
                  historyList.map((hist) => (
                    <div key={hist.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-slate-900">
                          {hist.action}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {hist.createdAt.replace("T", " ").slice(0, 19)}
                        </span>
                      </div>
                      <div className="text-slate-700">
                        <strong>Reason: </strong>{hist.reason || "N/A"}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Actor: {hist.actorName || hist.actorUserId} ({hist.actorRole})
                      </div>
                      {hist.diff && (
                        <pre className="mt-1 p-2 bg-slate-900 text-slate-200 rounded text-[10px] overflow-x-auto font-mono">
                          {(() => {
                            try {
                              return JSON.stringify(JSON.parse(hist.diff), null, 2);
                            } catch {
                              return hist.diff;
                            }
                          })()}
                        </pre>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* 10. CONVERT TO BILL MODAL */}
        {showBillModal && billTargetEntry && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 my-8 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                  <Receipt className="w-5 h-5 text-purple-600" />
                  Convert to Contractor Bill
                </div>
                <button onClick={() => setShowBillModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConvertBillSubmit} className="mt-4 space-y-4">
                <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-950 space-y-1">
                  <div><strong>Item:</strong> {billTargetEntry.entryName} — {billTargetEntry.itemDescription}</div>
                  <div><strong>Quantity:</strong> {formatQuantity(billTargetEntry.quantity)} {billTargetEntry.unit}</div>
                  <div><strong>Billable Amount:</strong> {formatCurrency(billTargetEntry.totalAmount)}</div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Bill / Invoice Reference Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formBillNumber}
                    onChange={(e) => setFormBillNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowBillModal(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow"
                  >
                    {actionLoading ? "Converting..." : "Generate Bill"}
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
