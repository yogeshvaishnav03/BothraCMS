"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import SearchableSelect from "@/components/ui/SearchableSelect";
import SearchableMultiSelect from "@/components/ui/SearchableMultiSelect";
import { formatCurrency, formatDate, formatCompactINR, formatCompactNumber } from "@/lib/formatters";
import { compressImageFile } from "@/lib/image-compression";
import { istDateKey } from "@/lib/ist-date";
import {
  TASK_PRIORITY_OPTIONS,
  formatPriorityLabel,
  getAutoReminderMessage,
  normalizePriority,
} from "@/lib/task-reminder";
import {
  FolderKanban,
  CheckSquare,
  HardHat,
  AlertTriangle,
  Boxes,
  DollarSign,
  TrendingDown,
  PlusCircle,
  PackagePlus,
  PackageMinus,
  UserCheck,
  Clock,
  CheckCircle2,
  Check,
  XCircle,
  X,
  Plus,
  ExternalLink,
  ArrowRight,
  Building2,
  MapPin,
  Globe,
  Camera,
  User,
  Image as ImageIcon,
  ShieldCheck,
  Calendar,
  Users,
  Upload,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Search,
  LayoutGrid,
  List,
  Play,
  Loader2,
} from "lucide-react";
import { submitOrQueue } from "@/lib/offline-queue";
import { clientCache } from "@/lib/client-cache";
import { useLanguage } from "@/lib/i18n";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import CommandCenter from "@/components/dashboard/CommandCenter";
import ApprovalsWidget from "@/components/dashboard/ApprovalsWidget";
import TaskTimeline from "@/components/tasks/TaskTimeline";
import { canUser } from "@/lib/permissions";

export default function DashboardPage() {
  const { t } = useLanguage();
  const { user: sessionUser, refreshUser, refreshSites } = useAppSession();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [dashboardMode, setDashboardMode] = useState<"EXECUTIVE" | "EMPLOYEE">("EXECUTIVE");
  const [recentPhotos, setRecentPhotos] = useState<any[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);

  const isRelevantSitePhoto = (photo: any) => {
    if (!photo) return false;
    const name = (photo.fileName || "").toLowerCase();
    const notes = (photo.notes || "").toLowerCase();
    return (
      !name.includes("academy") &&
      !name.includes("screenshot") &&
      !name.includes("wallpaper") &&
      !name.includes("logo") &&
      !name.includes("test_") &&
      !name.includes("mockup") &&
      !name.includes("placeholder") &&
      !name.includes("dummy") &&
      !notes.includes("dummy") &&
      !notes.includes("mockup") &&
      !notes.includes("placeholder") &&
      Boolean(photo.fileId || photo.url)
    );
  };

  const refreshRecentPhotos = async (siteId?: string) => {
    try {
      const q = siteId
        ? `?category=PHOTO&entityType=SITE_PHOTO&limit=12&projectId=${siteId}`
        : "?category=PHOTO&entityType=SITE_PHOTO&limit=12";
      const res = await fetch(`/api/attachments${q}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setRecentPhotos((data.data || []).filter(isRelevantSitePhoto));
      }
    } catch {
      // Ignore
    }
  };

  const handleDashboardPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (picked.length === 0) return;

    setUploadingPhoto(true);
    setPhotoMsg(null);

    try {
      for (const rawFile of picked) {
        const file = await compressImageFile(rawFile, { preset: "photo" });
        const formData = new FormData();
        formData.append("file", file, file.name);
        formData.append("category", "PHOTO");
        formData.append("entityType", "SITE_PHOTO");
        formData.append("entityId", activeSiteId || "SITE");
        if (activeSiteId) formData.append("projectId", activeSiteId);

        const res = await fetch("/api/attachments", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || "Failed to upload site photo");
        }
      }
      setPhotoMsg("Site photograph clicked with camera and saved successfully!");
      await refreshRecentPhotos(activeSiteId);
    } catch (err: any) {
      setPhotoError(err.message || "Failed to upload clicked photo");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const uploadSingleSitePhoto = async (rawFile: File) => {
    setUploadingPhoto(true);
    setPhotoMsg(null);
    try {
      const file = await compressImageFile(rawFile, { preset: "photo" });
      const formData = new FormData();
      formData.append("file", file, file.name);
      formData.append("category", "PHOTO");
      formData.append("entityType", "SITE_PHOTO");
      formData.append("entityId", activeSiteId || "SITE");
      if (activeSiteId) formData.append("projectId", activeSiteId);

      const res = await fetch("/api/attachments", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to save clicked site photo");
      }
      setPhotoMsg("Site photograph clicked with camera and saved successfully!");
      await refreshRecentPhotos(activeSiteId);
    } catch (err: any) {
      setPhotoError(err.message || "Failed to save photo");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const startLiveCamera = async () => {
    setCameraError(null);
    setCameraModalOpen(true);
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error("Live in-browser camera stream is not supported on this browser. Please use the mobile camera app.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn("Direct getUserMedia camera failed or permission denied:", err);
      setCameraError(err.message || "Camera access permission denied or unavailable. Please enable camera permissions or use the mobile camera app.");
    }
  };

  const stopLiveCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setCameraModalOpen(false);
    setCameraError(null);
  };

  const takeSnapshotAndUpload = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("Camera feed is warming up. Please wait a moment.");
      return;
    }

    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      async (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) return;
        const clickedFile = new File([blob], `site-photo-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        stopLiveCamera();
        await uploadSingleSitePhoto(clickedFile);
      },
      "image/jpeg",
      0.8
    );
  };

  const handleDashboardPhotoReplace = async (photoId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    e.target.value = "";
    if (!rawFile) return;

    setUploadingPhoto(true);
    setPhotoMsg(null);
    try {
      const file = await compressImageFile(rawFile, { preset: "photo" });
      const formData = new FormData();
      formData.append("file", file, file.name);

      const res = await fetch(`/api/attachments/${photoId}`, {
        method: "PUT",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        // Fallback: POST new and DELETE old
        const postData = new FormData();
        postData.append("file", file, file.name);
        postData.append("category", "PHOTO");
        postData.append("entityType", "SITE_PHOTO");
        postData.append("entityId", activeSiteId || "SITE");
        const postRes = await fetch("/api/attachments", { method: "POST", body: postData });
        const postJson = await postRes.json();
        if (!postRes.ok || !postJson.success) {
          throw new Error(data.error?.message || postJson.error?.message || "Failed to replace photo");
        }
        await fetch(`/api/attachments/${photoId}`, { method: "DELETE" });
      }

      setPhotoMsg("Photo replaced successfully!");
      await refreshRecentPhotos();
    } catch (err: any) {
      setPhotoError(err.message || "Failed to replace photo");
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const handleCopyHeadcountToToday = async (recordsToCopy: any[]) => {
    if (!recordsToCopy || recordsToCopy.length === 0) return;
    const todayStr = istDateKey();
    setLoading(true);
    try {
      for (const rec of recordsToCopy) {
        await fetch("/api/workforce/headcount", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteId: rec.siteId,
            date: todayStr,
            shift: rec.shift || "GENERAL",
            artisanCount: rec.artisanCount ?? rec.artisanTotal ?? 0,
            craftsmanCount: rec.craftsmanCount ?? rec.craftsmanTotal ?? 0,
            laborerMale: rec.laborerMale || 0,
            laborerFemale: rec.laborerFemale || 0,
            contractorName: rec.contractorName,
            notes: `Copied from ${rec.date ? formatDate(rec.date) : "previous count"}`,
          }),
        });
      }
      loadDashboard(activeSiteId);
    } catch {
      setErrorMessage("Failed to copy headcount to today");
    } finally {
      setLoading(false);
    }
  };

  const [pendingDeletePhoto, setPendingDeletePhoto] = useState<{ id: string; fileName: string } | null>(null);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const handleDashboardPhotoDelete = (photoId: string, fileName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPhotoError(null);
    setPendingDeletePhoto({ id: photoId, fileName });
  };

  const executeDashboardPhotoDelete = async () => {
    if (!pendingDeletePhoto) return;
    setDeletingPhoto(true);
    setPhotoError(null);
    try {
      const res = await fetch(`/api/attachments/${pendingDeletePhoto.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to delete photo");
      }
      setRecentPhotos((prev) => prev.filter((p) => p.id !== pendingDeletePhoto.id));
      setPendingDeletePhoto(null);
      setPhotoMsg("Photo deleted successfully!");
    } catch (err: any) {
      setPhotoError(err.message || "Failed to delete photo");
      setPendingDeletePhoto(null);
    } finally {
      setDeletingPhoto(false);
    }
  };

  const activeUser = currentUser || sessionUser;
  const isSuperAdmin = activeUser?.role === "SUPER_ADMIN";
  const isAdminUser = activeUser?.role === "SUPER_ADMIN" || activeUser?.role === "ORG_ADMIN";
  const isSupervisor = activeUser?.role === "SITE_SUPERVISOR" || (activeUser?.role as string) === "SUPERVISOR";
  const isProjectManager = activeUser?.role === "PROJECT_MANAGER";
  const canViewFinance = !isProjectManager && (canUser(activeUser, "finance:read") || isAdminUser);
  const canViewStock = canUser(activeUser, "inventory:read") || isAdminUser || isProjectManager;
  const [selectedPhoto, setSelectedPhoto] = useState<any | null>(null);

  // Live Camera state for Site Supervisors
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cameraModalOpen && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraModalOpen, cameraStream]);
  const [kpi, setKpi] = useState<any>(null);
  const [activeKpiModal, setActiveKpiModal] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSiteId, setActiveSiteId] = useState<string>("");
  const [dashboardDate, setDashboardDate] = useState<string>(() => istDateKey());
  const [dashboardHeadcountRecords, setDashboardHeadcountRecords] = useState<any[]>([]);
  const [headcountViewMode, setHeadcountViewMode] = useState<"CARDS" | "TABLE">("CARDS");

  // Quick Task Modal & Filter
  const [showQuickTaskModal, setShowQuickTaskModal] = useState(false);
  const [taskFilterOverdueOnly, setTaskFilterOverdueOnly] = useState(false);
  const [taskViewFilter, setTaskViewFilter] = useState<"ALL" | "MINE">("ALL");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickDescription, setQuickDescription] = useState("");
  const [quickProjectId, setQuickProjectId] = useState("");
  const [quickAssigneeId, setQuickAssigneeId] = useState("");
  const [quickAssigneeIds, setQuickAssigneeIds] = useState<string[]>([]);
  const [isBulkTaskMode, setIsBulkTaskMode] = useState(false);
  const [bulkTaskTitles, setBulkTaskTitles] = useState<string[]>([""]);
  const [taskModalSuccessNotice, setTaskModalSuccessNotice] = useState<string | null>(null);
  const [quickPriority, setQuickPriority] = useState<string>("DAILY");
  const [quickDueAt, setQuickDueAt] = useState(() => istDateKey());
  const [employees, setEmployees] = useState<any[]>([]);

  // Attendance state for logged in user
  const [todaySessions, setTodaySessions] = useState<any[]>([]);

  // Feedback notifications
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittingTask, setSubmittingTask] = useState(false);
  const [submittingCheckIn, setSubmittingCheckIn] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [selectedTimelineTask, setSelectedTimelineTask] = useState<{
    id: string;
    title: string;
    status: string;
    projectId?: string | null;
  } | null>(null);

  // Interactive Dashboard View & Section Navigation
  type DashboardSectionTab = "ALL" | "SITES" | "TASKS" | "PROJECTS" | "PHOTOS" | "MATERIALS";
  const [activeSectionTab, setActiveSectionTab] = useState<DashboardSectionTab>("ALL");
  const [dashboardFilterQuery, setDashboardFilterQuery] = useState("");
  const [kpiDensity, setKpiDensity] = useState<"compact" | "cards">("compact");

  // Material Requests State & Modal
  const [recentMaterialRequests, setRecentMaterialRequests] = useState<any[]>([]);
  const [materialCatalog, setMaterialCatalog] = useState<any[]>([]);
  const [showQuickMaterialModal, setShowQuickMaterialModal] = useState(false);
  const [quickMaterialProjectId, setQuickMaterialProjectId] = useState<string>("");
  const [quickMaterialAssignedUserIds, setQuickMaterialAssignedUserIds] = useState<string[]>([]);
  const [quickMaterialUrgent, setQuickMaterialUrgent] = useState(false);
  const [quickMaterialNeededBy, setQuickMaterialNeededBy] = useState("");
  const [quickMaterialNotes, setQuickMaterialNotes] = useState("");
  const [quickMaterialItems, setQuickMaterialItems] = useState([
    { materialId: "", description: "", quantity: "", unitCode: "NOS" },
  ]);
  const [submittingQuickMaterial, setSubmittingQuickMaterial] = useState(false);
  const [quickMaterialError, setQuickMaterialError] = useState<string | null>(null);
  const [materialRequestNotice, setMaterialRequestNotice] = useState<string | null>(null);

  const resetQuickMaterialForm = () => {
    setQuickMaterialProjectId(activeSiteId || projects[0]?.id || "");
    setQuickMaterialAssignedUserIds([]);
    setQuickMaterialUrgent(false);
    setQuickMaterialNeededBy("");
    setQuickMaterialNotes("");
    setQuickMaterialItems([{ materialId: "", description: "", quantity: "", unitCode: "NOS" }]);
    setQuickMaterialError(null);
  };

  const updateQuickMaterialItem = (index: number, patch: Partial<{ materialId: string; description: string; quantity: string; unitCode: string }>) => {
    setQuickMaterialItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        const updated = { ...it, ...patch };
        if (patch.materialId !== undefined) {
          if (patch.materialId && patch.materialId !== "OTHER") {
            const selectedMat = materialCatalog.find((m) => m.id === patch.materialId);
            if (selectedMat) {
              updated.description = selectedMat.name;
              updated.unitCode = selectedMat.unitCode || "NOS";
            }
          } else if (patch.materialId === "OTHER") {
            updated.description = "";
          }
        }
        return updated;
      })
    );
  };

  const addQuickMaterialItem = () => {
    setQuickMaterialItems((prev) => [
      ...prev,
      { materialId: "", description: "", quantity: "", unitCode: "NOS" },
    ]);
  };

  const removeQuickMaterialItem = (index: number) => {
    if (quickMaterialItems.length <= 1) return;
    setQuickMaterialItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleQuickMaterialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickMaterialError(null);

    const validItems = quickMaterialItems.filter((it) => {
      const hasName = (it.materialId && it.materialId !== "OTHER") || it.description.trim().length > 0;
      const qty = parseFloat(it.quantity);
      return hasName && !isNaN(qty) && qty > 0;
    });

    if (validItems.length === 0) {
      setQuickMaterialError("Please add at least one material with a quantity greater than 0.");
      return;
    }

    const pId = quickMaterialProjectId || projects[0]?.id;
    if (!pId) {
      setQuickMaterialError("Please select a project.");
      return;
    }

    setSubmittingQuickMaterial(true);
    try {
      const project = projects.find((p) => p.id === pId);
      const payloadItems = validItems.map((it) => ({
        materialId: it.materialId && it.materialId !== "OTHER" ? it.materialId : null,
        description: it.materialId === "OTHER" || !it.materialId ? it.description.trim() : null,
        quantity: parseFloat(it.quantity),
        unitCode: (it.unitCode || "NOS").trim().toUpperCase(),
      }));

      const res = await submitOrQueue<any>({
        label: `Material request for "${project?.name || "Project"}"`,
        url: "/api/material-requests",
        body: {
          projectId: pId,
          assignedUserIds: quickMaterialAssignedUserIds,
          neededBy: quickMaterialNeededBy || null,
          priority: quickMaterialUrgent ? "URGENT" : "NORMAL",
          notes: quickMaterialNotes || null,
          items: payloadItems,
        },
      });

      const reqNum = res && "data" in res && (res.data as any)?.requestNumber ? ` (${(res.data as any).requestNumber})` : "";
      setMaterialRequestNotice(`Material request${reqNum} posted successfully! The office has been notified.`);
      setShowQuickMaterialModal(false);
      resetQuickMaterialForm();

      // Refresh material requests list
      fetch(`/api/material-requests?_t=${Date.now()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          if (data?.success && Array.isArray(data.data)) {
            setRecentMaterialRequests(data.data);
          }
        })
        .catch(() => {});

      window.dispatchEvent(new CustomEvent("refreshNotifications"));
      setTimeout(() => setMaterialRequestNotice(null), 6000);
    } catch (err: any) {
      setQuickMaterialError(err?.message || "Failed to submit material request. Please try again.");
    } finally {
      setSubmittingQuickMaterial(false);
    }
  };

  // Collapsible section states for custom workspace layout
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    quickDock: false,
    sites: false,
    tasks: false,
    projects: false,
    photos: false,
  });

  const toggleSectionCollapse = (sectionKey: string) => {
    setCollapsedSections((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  // 1. Site-by-site on-site workforce breakdown for 100% mathematical consistency (e.g. Chaupasni: 54, Skyline: 4 -> Total: 58)
  const siteOnSiteBreakdown = useMemo(() => {
    return sites.map((site) => {
      const siteHeadcountList = (kpi?.workforceHeadcount?.records || []).filter(
        (r: any) => r.siteId === site.id || r.siteName?.toLowerCase() === site.name?.toLowerCase()
      );
      const siteHeadcountSum = siteHeadcountList.reduce((s: number, r: any) => s + (r.grandTotal || 0), 0);
      const siteWorkersPresent = (kpi?.workersPresentToday || []).filter((w: any) => w.siteName === site.name);
      const count = siteHeadcountList.length > 0 ? siteHeadcountSum : siteWorkersPresent.length;
      return { siteId: site.id, siteName: site.name, count };
    });
  }, [sites, kpi]);

  // Total workers on site: accurately aggregate active site numbers from the site cards (Chaupasni: 54, Riverside: 0, Skyline: 4 -> 58)
  const displayTotalWorkersOnSite = useMemo(() => {
    if (activeSiteId) {
      const siteItem = siteOnSiteBreakdown.find((s) => s.siteId === activeSiteId);
      return siteItem ? siteItem.count : 0;
    }
    return siteOnSiteBreakdown.reduce((sum, s) => sum + s.count, 0);
  }, [activeSiteId, siteOnSiteBreakdown]);

  // Sub-category string correctly accounting for Artisans, Craftsmen, Laborers, and Staff/Crew with exact sum
  const { workerSubCategorySummary, workerSubCategoryFull, staffDifference } = useMemo(() => {
    const art = kpi?.workforceHeadcount?.totalArtisan || 0;
    const craft = kpi?.workforceHeadcount?.totalCraftsman || 0;
    const lab = kpi?.workforceHeadcount?.totalLaborer || 0;
    const subSum = art + craft + lab;
    const diff = displayTotalWorkersOnSite > subSum ? displayTotalWorkersOnSite - subSum : 0;

    const parts: string[] = [];
    if (art > 0) parts.push(`${art} Skilled`);
    if (craft > 0) parts.push(`${craft} Craftsmen`);
    if (lab > 0) parts.push(`${lab} Laborers`);
    if (diff > 0) parts.push(`+${diff} Staff Checked In`);

    if (parts.length === 0) {
      return {
        workerSubCategorySummary: `${displayTotalWorkersOnSite} checked in today`,
        workerSubCategoryFull: `${displayTotalWorkersOnSite} checked in today`,
        staffDifference: diff,
      };
    }

    const subcategoryText = parts.join(", ");
    const fullStr = `${displayTotalWorkersOnSite} on site (${subcategoryText})`;
    return {
      workerSubCategorySummary: subcategoryText,
      workerSubCategoryFull: fullStr,
      staffDifference: diff,
    };
  }, [kpi, displayTotalWorkersOnSite]);

  // Incomplete tasks and overdue detection
  const isTaskOverdue = (t: any) => {
    if (["COMPLETED", "VERIFIED", "ARCHIVED"].includes(t.status)) return false;
    if (t.isArchived || t.completedAt) return false;
    if (!t.dueAt) return false;
    return new Date(t.dueAt).getTime() < Date.now();
  };

  const pendingIncompleteTasks = useMemo(() => {
    return allTasks
      .filter((t: any) => {
        if (["COMPLETED", "VERIFIED", "ARCHIVED"].includes(t.status)) return false;
        if (t.isArchived || t.completedAt) return false;
        if (activeSiteId) {
          return t.project?.siteId === activeSiteId || t.projectId === activeSiteId;
        }
        return true;
      })
      .sort((a: any, b: any) => {
        const aOverdue = isTaskOverdue(a) ? 1 : 0;
        const bOverdue = isTaskOverdue(b) ? 1 : 0;
        if (bOverdue !== aOverdue) return bOverdue - aOverdue; // Overdue tasks first
        return new Date(a.dueAt || 0).getTime() - new Date(b.dueAt || 0).getTime();
      });
  }, [allTasks, activeSiteId]);

  const overdueTasksCount = useMemo(() => {
    return pendingIncompleteTasks.filter(isTaskOverdue).length;
  }, [pendingIncompleteTasks]);

  // Feature 9: Count of tasks assigned specifically to current user
  const myAssignedTasksCount = useMemo(() => {
    const uid = currentUser?.id || currentUser?.userId;
    if (!uid) return 0;
    return pendingIncompleteTasks.filter(
      (t: any) => t.assignedToId === uid || t.assignee?.id === uid || t.assigneeUserId === uid
    ).length;
  }, [pendingIncompleteTasks, currentUser]);

  // Filtered collections responding to the live interactive search bar and active section tab
  const displayedPendingTasks = useMemo(() => {
    let list = pendingIncompleteTasks;
    if (taskViewFilter === "MINE") {
      const uid = currentUser?.id || currentUser?.userId;
      if (uid) {
        list = list.filter(
          (t: any) => t.assignedToId === uid || t.assignee?.id === uid || t.assigneeUserId === uid
        );
      }
    }
    if (taskFilterOverdueOnly) {
      list = list.filter(isTaskOverdue);
    }
    if (dashboardFilterQuery.trim()) {
      const q = dashboardFilterQuery.toLowerCase();
      list = list.filter(
        (t: any) =>
          (t.title && t.title.toLowerCase().includes(q)) ||
          (t.project?.name && t.project.name.toLowerCase().includes(q)) ||
          (t.assignee?.name && t.assignee.name.toLowerCase().includes(q)) ||
          (t.priority && t.priority.toLowerCase().includes(q))
      );
    }
    return activeSectionTab === "TASKS" ? list : list.slice(0, 8);
  }, [pendingIncompleteTasks, taskViewFilter, taskFilterOverdueOnly, dashboardFilterQuery, activeSectionTab, currentUser]);

  const displayedProjects = useMemo(() => {
    let list = projects;
    if (dashboardFilterQuery.trim()) {
      const q = dashboardFilterQuery.toLowerCase();
      list = list.filter(
        (p: any) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.code && p.code.toLowerCase().includes(q)) ||
          (p.site?.name && p.site.name.toLowerCase().includes(q))
      );
    }
    return activeSectionTab === "PROJECTS" ? list : list.slice(0, 6);
  }, [projects, dashboardFilterQuery, activeSectionTab]);

  const displayedSites = useMemo(() => {
    let list = sites;
    if (dashboardFilterQuery.trim()) {
      const q = dashboardFilterQuery.toLowerCase();
      list = list.filter(
        (s: any) =>
          (s.name && s.name.toLowerCase().includes(q)) ||
          (s.code && s.code.toLowerCase().includes(q)) ||
          (s.address && s.address.toLowerCase().includes(q))
      );
    }
    return list;
  }, [sites, dashboardFilterQuery]);

  const displayedPhotos = useMemo(() => {
    let list = recentPhotos;
    if (dashboardFilterQuery.trim()) {
      const q = dashboardFilterQuery.toLowerCase();
      list = list.filter(
        (p: any) =>
          (p.fileName && p.fileName.toLowerCase().includes(q)) ||
          (p.notes && p.notes.toLowerCase().includes(q))
      );
    }
    return list;
  }, [recentPhotos, dashboardFilterQuery]);

  const displayedMaterialRequests = useMemo(() => {
    let list = recentMaterialRequests;
    if (dashboardFilterQuery.trim()) {
      const q = dashboardFilterQuery.toLowerCase();
      list = list.filter(
        (r: any) =>
          (r.requestNumber && r.requestNumber.toLowerCase().includes(q)) ||
          (r.project?.name && r.project.name.toLowerCase().includes(q)) ||
          (r.project?.site?.name && r.project.site.name.toLowerCase().includes(q)) ||
          (r.requestedBy?.name && r.requestedBy.name.toLowerCase().includes(q)) ||
          (r.notes && r.notes.toLowerCase().includes(q)) ||
          (r.items && r.items.some((it: any) => (it.material?.name || it.description || "").toLowerCase().includes(q)))
      );
    }
    return activeSectionTab === "MATERIALS" ? list : list.slice(0, 6);
  }, [recentMaterialRequests, dashboardFilterQuery, activeSectionTab]);

  const refreshKpis = (serverKpi?: any, siteId?: string) => {
    const computed = clientCache.calculateKpis(serverKpi, siteId);
    setKpi(computed);
  };

  const handleDateChange = (newDate: string) => {
    if (!newDate) return;
    setDashboardDate(newDate);
    loadDashboard(activeSiteId, newDate);
  };

  const handleDeleteHeadcountRecord = async (recordId: string) => {
    if (!confirm("Are you sure you want to delete this headcount record?")) return;
    try {
      const res = await fetch(`/api/workforce/headcount?id=${recordId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage("Headcount record deleted successfully.");
        loadDashboard(activeSiteId, dashboardDate);
      } else {
        setErrorMessage(data.error?.message || "Failed to delete headcount record.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to delete record.");
    }
  };

  const loadDashboard = (siteId?: string, targetDate?: string) => {
    setLoading(true);
    const cb = `_t=${Date.now()}`;
    const effectiveDate = targetDate || dashboardDate || istDateKey();
    const kpiUrl = siteId ? `/api/dashboard/kpi?siteId=${siteId}&date=${effectiveDate}&${cb}` : `/api/dashboard/kpi?date=${effectiveDate}&${cb}`;
    const projUrl = siteId ? `/api/projects?siteId=${siteId}&${cb}` : `/api/projects?${cb}`;
    const headcountUrl = siteId ? `/api/workforce/headcount?siteId=${siteId}&date=${effectiveDate}&${cb}` : `/api/workforce/headcount?date=${effectiveDate}&${cb}`;

    Promise.all([
      fetch(kpiUrl, { cache: "no-store" }).then((r) => r.json()),
      fetch(projUrl, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/tasks?${cb}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/attendance?workDate=${effectiveDate}${siteId ? `&siteId=${siteId}` : ""}&${cb}`, { cache: "no-store" }).then((r) => r.json()),

      fetch(`/api/workforce${siteId ? `?siteId=${siteId}` : ""}${siteId ? `&${cb}` : `?${cb}`}`, { cache: "no-store" }).then((r) => r.json()),
      refreshSites().then((data) => ({ data })),
      refreshUser().then((user) => ({ success: Boolean(user), data: { user } })),

      fetch(`/api/attachments?category=PHOTO&entityType=SITE_PHOTO&limit=12${siteId ? `&projectId=${siteId}` : ""}&${cb}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/chat/employees?${cb}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch(headcountUrl, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ success: false })),
    ])
      .then(([kpiRes, projRes, taskRes, attRes, wfRes, sitesRes, meRes, photoRes, usersRes, headcountRes]) => {
        if (headcountRes?.success && Array.isArray(headcountRes.data)) {
          setDashboardHeadcountRecords(headcountRes.data);
        } else if (kpiRes?.data?.workforceHeadcount?.records) {
          setDashboardHeadcountRecords(kpiRes.data.workforceHeadcount.records);
        } else {
          setDashboardHeadcountRecords([]);
        }
        if (usersRes?.success && usersRes?.data) {
          const rawUsers = Array.isArray(usersRes.data?.employees)
            ? usersRes.data.employees
            : Array.isArray(usersRes.data)
            ? usersRes.data
            : [];
          setEmployees(rawUsers);
        }
        if (meRes.success && meRes.data) {
          setCurrentUser(meRes.data.user);
        }
        if (photoRes.success && photoRes.data) {
          setRecentPhotos((photoRes.data || []).filter(isRelevantSitePhoto));
        }
        if (attRes.success) {
          setTodaySessions(attRes.data || []);
        }

        const rawProjs = projRes.data || [];
        const rawTasks = taskRes.data || [];
        const rawWorkers = wfRes.data || [];
        const rawSites = sitesRes.data || [];

        setSites(rawSites);
        setWorkers(rawWorkers);

        const filteredProjs = siteId ? rawProjs.filter((p: any) => p.siteId === siteId) : rawProjs;
        const filteredTasks = siteId
          ? rawTasks.filter((t: any) => t.project?.siteId === siteId || filteredProjs.some((p: any) => p.id === t.projectId))
          : rawTasks;

        setProjects(filteredProjs);
        if (filteredProjs.length > 0 && !quickProjectId) {
          setQuickProjectId(filteredProjs[0].id);
        }
        if (filteredProjs.length > 0 && !quickMaterialProjectId) {
          setQuickMaterialProjectId(filteredProjs[0].id);
        }

        // Fetch material requests and catalog for dashboard
        fetch(`/api/material-requests?${cb}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((res) => {
            if (res?.success && Array.isArray(res.data)) {
              setRecentMaterialRequests(res.data);
            }
          })
          .catch(() => {});

        fetch(`/api/materials?${cb}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((res) => {
            const mats = res?.data?.materials || res?.data || [];
            if (Array.isArray(mats)) {
              setMaterialCatalog(mats);
            }
          })
          .catch(() => {});

        setAllTasks(filteredTasks);
        setTasks(filteredTasks.filter((t: any) => !["COMPLETED", "VERIFIED", "ARCHIVED"].includes(t.status) && !t.completedAt));
        refreshKpis(kpiRes.data, siteId);
      })
      .catch((err) => {
        console.error("Dashboard authoritative load failed:", err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const savedSite = typeof window !== "undefined" ? localStorage.getItem("buildtrack_active_site") || "" : "";
    setActiveSiteId(savedSite);
    loadDashboard(savedSite);

    const onSiteChanged = (e: any) => {
      const newSiteId = e.detail?.siteId || "";
      setActiveSiteId(newSiteId);
      loadDashboard(newSiteId);
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === "buildtrack_active_site") {
        const newSiteId = e.newValue || "";
        setActiveSiteId(newSiteId);
        loadDashboard(newSiteId);
      }
    };

    window.addEventListener("siteChanged", onSiteChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("siteChanged", onSiteChanged);
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetQuickTaskForm = (keepSettings = false) => {
    setQuickTitle("");
    setQuickDescription("");
    setBulkTaskTitles([""]);
    setTaskModalSuccessNotice(null);
    if (!keepSettings) {
      setQuickDueAt(istDateKey());
      setQuickAssigneeId("");
      setQuickAssigneeIds([]);
      setQuickPriority("DAILY");
      setQuickProjectId(projects.length > 0 ? projects[0].id : "OTHER");
      setIsBulkTaskMode(false);
    }
  };

  const handleQuickTaskSubmit = async (e?: React.FormEvent, keepFormOpen = false) => {
    if (e) e.preventDefault();
    if (submittingTask) return;

    // Determine task titles
    const titlesToCreate: string[] = isBulkTaskMode
      ? bulkTaskTitles.map((t) => t.trim()).filter(Boolean)
      : quickTitle.trim() ? [quickTitle.trim()] : [];

    if (titlesToCreate.length === 0) {
      setErrorMessage("Please enter at least one task title.");
      return;
    }

    const targetProjId = quickProjectId || (projects.length > 0 ? projects[0].id : "OTHER");
    const targetAssignees = quickAssigneeIds.length > 0
      ? quickAssigneeIds
      : quickAssigneeId ? [quickAssigneeId] : [];

    setSubmittingTask(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setTaskModalSuccessNotice(null);

    try {
      let createdCount = 0;

      for (const tTitle of titlesToCreate) {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: targetProjId,
            title: tTitle,
            description: quickDescription ? quickDescription.trim() : undefined,
            priority: quickPriority,
            assigneeUserId: targetAssignees.length === 1 ? targetAssignees[0] : undefined,
            assigneeUserIds: targetAssignees.length > 0 ? targetAssignees : undefined,
            dueAt: quickDueAt ? new Date(quickDueAt).toISOString() : new Date().toISOString(),
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || `Failed to create task "${tTitle}"`);
        }
        createdCount += (targetAssignees.length > 1 ? targetAssignees.length : 1);
      }

      const successText = createdCount > 1
        ? `Successfully created & assigned ${createdCount} task items!`
        : `Task "${titlesToCreate[0]}" created & assigned successfully!`;

      setStatusMessage(successText);
      loadDashboard(activeSiteId);

      if (keepFormOpen) {
        setTaskModalSuccessNotice(`✓ ${successText} Details preserved for your next task.`);
        setQuickTitle("");
        setQuickDescription("");
        setBulkTaskTitles([""]);
      } else {
        setShowQuickTaskModal(false);
        resetQuickTaskForm();
      }
    } catch (err: any) {
      setErrorMessage(`Error: ${err.message || "Failed to create task"}`);
    } finally {
      setSubmittingTask(false);
    }
  };

  const handleQuickCompleteTask = async (taskId: string, title: string) => {
    if (completingTaskId === taskId) return;
    setCompletingTaskId(taskId);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/tasks/${taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to complete task on server");
        return;
      }

      setStatusMessage(`Task "${title}" marked completed in database!`);
      loadDashboard(activeSiteId);
      window.dispatchEvent(new CustomEvent("refreshNotifications"));
    } catch (err: any) {
      setErrorMessage(`Network error: ${err.message || "Failed to complete task"}`);
    } finally {
      setCompletingTaskId(null);
    }
  };

  const currentUserSession = todaySessions.find((s) => {
    const userEmpCode = currentUser?.id ? `USR-${currentUser.id.slice(-6).toUpperCase()}` : "";
    if (userEmpCode && s.workforceMember?.employeeCode === userEmpCode) return true;
    if (currentUser?.name && s.workforceMember?.name?.trim().toLowerCase() === currentUser.name?.trim().toLowerCase()) return true;
    return false;
  });
  const isUserCheckedIn = !!currentUserSession;
  const isUserCheckedOut = !!currentUserSession?.checkOutAt;

  const getGpsCoords = async (mandatory: boolean = false): Promise<{ lat?: number; lng?: number; acc?: number }> => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      if (mandatory) {
        throw new Error("📍 Geolocation is not supported by your browser or connection. GPS capture is mandatory to check in.");
      }
      return {};
    }
    return new Promise<{ lat?: number; lng?: number; acc?: number }>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            acc: pos.coords.accuracy,
          });
        },
        (err) => {
          if (mandatory) {
            let msg = "📍 GPS location is mandatory to check in.";
            if (err.code === 1) {
              msg = "📍 Location access denied. GPS capture is mandatory before check-in can be submitted. Please allow location permissions in your browser/device settings and try again.";
            } else if (err.code === 2) {
              msg = "📍 GPS location unavailable. Please ensure device location/GPS is enabled and try again.";
            } else if (err.code === 3) {
              msg = "📍 GPS location request timed out. Please check your GPS signal and try again.";
            } else {
              msg = `📍 GPS error: ${err.message || "Failed to capture GPS coordinates. GPS is mandatory to check in."}`;
            }
            reject(new Error(msg));
          } else {
            resolve({});
          }
        },
        {
          timeout: 10000,
          enableHighAccuracy: true,
          maximumAge: 0,
        }
      );
    });
  };

  const handleQuickCheckInOut = async () => {
    if (submittingCheckIn) return;
    setSubmittingCheckIn(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      if (!isUserCheckedIn) {
        // Enforce mandatory GPS capture before check-in
        let gps: { lat?: number; lng?: number; acc?: number };
        try {
          gps = await getGpsCoords(true);
        } catch (err: any) {
          setErrorMessage(err.message || "📍 GPS location capture is mandatory before check-in can be submitted.");
          return;
        }

        if (gps.lat == null || gps.lng == null || isNaN(gps.lat) || isNaN(gps.lng)) {
          setErrorMessage("📍 GPS location capture is mandatory before check-in can be submitted. Please allow location permissions and try again.");
          return;
        }

        // Perform self check-in
        const res = await fetch("/api/attendance/check-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteId: activeSiteId || (sites.length > 0 ? sites[0].id : undefined),
            workDate: istDateKey(),
            latitude: gps.lat,
            longitude: gps.lng,
            accuracyM: gps.acc,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setErrorMessage(data.error?.message || "Failed to check in");
          return;
        }
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const gpsStr = ` (GPS: ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)})`;
        setStatusMessage(`Checked in successfully at ${timeStr}${gpsStr}!`);
        loadDashboard(activeSiteId);
      } else if (!isUserCheckedOut) {
        // Perform self check-out
        const gps = await getGpsCoords(false);
        const res = await fetch("/api/attendance/check-out", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: currentUserSession?.id,
            latitude: gps.lat,
            longitude: gps.lng,
            accuracyM: gps.acc,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setErrorMessage(data.error?.message || "Failed to check out");
          return;
        }
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const gpsStr = gps.lat ? ` (GPS: ${gps.lat.toFixed(4)}, ${gps.lng?.toFixed(4)})` : "";
        setStatusMessage(`Checked out successfully at ${timeStr}${gpsStr}!`);
        loadDashboard(activeSiteId);
      }
    } catch (err: any) {
      setErrorMessage(`Network error: ${err.message || "Failed to update attendance"}`);
    } finally {
      setSubmittingCheckIn(false);
    }
  };

  useEffect(() => {
    if (!(selectedPhoto || cameraModalOpen || activeKpiModal || showQuickTaskModal || showQuickMaterialModal || pendingDeletePhoto)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedPhoto(null);
        if (cameraModalOpen) stopLiveCamera();
        setActiveKpiModal(null);
        setShowQuickTaskModal(false);
        setShowQuickMaterialModal(false);
        setPendingDeletePhoto(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhoto, cameraModalOpen, activeKpiModal, showQuickTaskModal, showQuickMaterialModal, pendingDeletePhoto]);

  const renderKpiModalContent = () => {
    if (!canViewStock && activeKpiModal === "lowStockItems") return null;
    if (!canViewFinance && (activeKpiModal === "paymentsMadeToday" || activeKpiModal === "outstandingPayables")) return null;
    switch (activeKpiModal) {
      case "activeProjects": {
        const list = kpi?.activeProjects || [];
        return {
          icon: <FolderKanban className="w-5 h-5 text-blue-600" />,
          title: t("kpi.activeProjects", "Active Projects"),
          badge: `${kpi?.activeProjectsCount ?? 0} Active`,
          badgeColor: "bg-blue-100 text-blue-800",
          subtitle: "Projects currently active or in planning across your sites",
          actionUrl: "/projects",
          actionLabel: "View All Projects",
          emptyTitle: "No active projects",
          emptyDesc: "There are currently no active or planning projects recorded in the system.",
          content: list.length > 0 ? (
            <div className="space-y-2.5 max-h-[60dvh] overflow-y-auto pr-1">
              {list.map((p: any) => (
                <div
                  key={p.id}
                  className="p-3.5 bg-slate-50 hover:bg-blue-50/40 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{p.name}</span>
                      {p.code && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-mono font-medium">
                          {p.code}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          p.status === "ACTIVE" || p.status === "IN_PROGRESS"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-3">
                      {p.siteName && (
                        <span>
                          Site: <strong className="text-slate-700">{p.siteName}</strong>
                        </span>
                      )}
                      {p.managerName && (
                        <span>
                          Manager: <strong className="text-slate-700">{p.managerName}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <div className="text-[11px] text-slate-500 font-medium">Budget</div>
                    <div className="text-sm font-black text-slate-900 tabular-nums whitespace-nowrap" title={formatCurrency(p.budgetAmount || 0)}>
                      {formatCompactINR(p.budgetAmount || 0)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null,
        };
      }
      case "workersPresentToday": {
        const list = (todaySessions || []).filter((s) => !activeSiteId || s.siteId === activeSiteId);
        const headcountRecords = (dashboardHeadcountRecords && dashboardHeadcountRecords.length > 0)
          ? dashboardHeadcountRecords
          : (kpi?.workforceHeadcount?.records || []);

        const filteredRecords = activeSiteId
          ? headcountRecords.filter((r: any) => r.siteId === activeSiteId)
          : headcountRecords;

        const totalArtisans = filteredRecords.reduce((s: number, r: any) => s + (r.artisanCount ?? r.artisanTotal ?? 0), 0);
        const totalCraftsmen = filteredRecords.reduce((s: number, r: any) => s + (r.craftsmanCount ?? r.craftsmanTotal ?? 0), 0);
        const totalLaborerMale = filteredRecords.reduce((s: number, r: any) => s + (r.laborerMale || 0), 0);
        const totalLaborerFemale = filteredRecords.reduce((s: number, r: any) => s + (r.laborerFemale || 0), 0);
        const totalLaborers = filteredRecords.reduce((s: number, r: any) => s + (r.laborerTotal || 0), 0);
        const totalHeadcount = filteredRecords.reduce((s: number, r: any) => s + (r.grandTotal || 0), 0);
        const totalLabourExpense = filteredRecords.reduce((s: number, r: any) => s + (r.totalExpense || 0), 0);

        const totalStaff = list.length;
        const displayTotal = totalHeadcount > 0 ? totalHeadcount : totalStaff;
        const isToday = dashboardDate === istDateKey();

        return {
          icon: <HardHat className="w-5 h-5 text-emerald-600" />,
          title: "Workers on Site",
          badge: `${displayTotal} on Site (${formatDate(dashboardDate)})`,
          badgeColor: totalHeadcount > 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700",
          subtitle: `Workforce headcount breakdown and daily wage expense for ${formatDate(dashboardDate)}`,
          actionUrl: `/workforce?date=${dashboardDate}${activeSiteId ? `&siteId=${activeSiteId}` : ""}`,
          actionLabel: "+ Log Headcount",
          content: (
            <div className="space-y-4 max-h-[70dvh] overflow-y-auto pr-1">
              {/* Top Navigation & Date Bar inside Modal */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Date Navigator */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-slate-600 mr-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-600" />
                    <span>Select Date:</span>
                  </span>
                  <div className="flex items-center bg-white rounded-lg p-0.5 border border-slate-200 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(dashboardDate);
                        d.setDate(d.getDate() - 1);
                        handleDateChange(d.toISOString().split("T")[0]);
                      }}
                      className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition cursor-pointer"
                      title="Previous Day"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="date"
                      value={dashboardDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                      className="px-2 py-0.5 bg-transparent text-xs font-bold text-slate-900 border-0 focus:ring-0 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(dashboardDate);
                        d.setDate(d.getDate() + 1);
                        handleDateChange(d.toISOString().split("T")[0]);
                      }}
                      className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition cursor-pointer"
                      title="Next Day"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {!isToday && (
                    <button
                      type="button"
                      onClick={() => handleDateChange(istDateKey())}
                      className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-black uppercase tracking-wider transition cursor-pointer"
                      title="Jump to Today"
                    >
                      Today
                    </button>
                  )}
                </div>

                {/* Right side: View toggle, Site filter info & Log Headcount button */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setHeadcountViewMode("CARDS")}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                        headcountViewMode === "CARDS"
                          ? "bg-slate-900 text-white shadow-2xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                      title="Cards View"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Cards</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHeadcountViewMode("TABLE")}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                        headcountViewMode === "TABLE"
                          ? "bg-slate-900 text-white shadow-2xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                      title="Table View"
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>Table</span>
                    </button>
                  </div>
                  {activeSiteId ? (
                    <span className="text-xs font-bold px-2 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300">
                      📍 {sites.find((s) => s.id === activeSiteId)?.name || "Selected Site"}
                    </span>
                  ) : (
                    <span className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-200 text-slate-700">
                      🌐 All Active Sites
                    </span>
                  )}
                  <Link
                    href={`/workforce?date=${dashboardDate}${activeSiteId ? `&siteId=${activeSiteId}` : ""}`}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Log Headcount</span>
                  </Link>
                </div>
              </div>

              {/* KPI Summary Strip for the Date */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200 shadow-2xs">
                  <div className="text-[10px] text-emerald-800 font-bold uppercase tracking-wider">Total Workers</div>
                  <div className="text-xl font-black text-emerald-950 mt-0.5 tabular-nums">
                    {totalHeadcount}
                  </div>
                  <div className="text-[10px] text-emerald-700 mt-0.5">On site on {formatDate(dashboardDate)}</div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Skilled / Artisans</div>
                  <div className="text-xl font-black text-slate-900 mt-0.5 tabular-nums">
                    {totalArtisans + totalCraftsmen}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {totalArtisans} Artisans, {totalCraftsmen} Craftsmen
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Laborers</div>
                  <div className="text-xl font-black text-slate-900 mt-0.5 tabular-nums">
                    {totalLaborers}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {totalLaborerMale} Male • {totalLaborerFemale} Female
                  </div>
                </div>

                <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200 shadow-2xs">
                  <div className="text-[10px] text-amber-900 font-bold uppercase tracking-wider">Labour Expense</div>
                  <div className="text-xl font-black text-amber-950 mt-0.5 tabular-nums">
                    ₹{Math.round(totalLabourExpense / 100).toLocaleString("en-IN")}
                  </div>
                  <div className="text-[10px] text-amber-800 mt-0.5">Daily Wages / Expense</div>
                </div>
              </div>

              {/* Workers Records (Cards / Table) */}
              {filteredRecords.length > 0 ? (
                headcountViewMode === "CARDS" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {filteredRecords.map((r: any) => (
                      <div
                        key={r.id}
                        className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all flex flex-col justify-between"
                      >
                        <div>
                          {/* Card Top: Contractor / Vendor & Total Workers */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-900 text-sm truncate">
                                  {r.contractorName || "Direct / Self"}
                                </span>
                                {r.isOverridden && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                    Extra Workers
                                  </span>
                                )}
                                {r.attachments && r.attachments.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedPhoto(r.attachments[0].url)}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300 transition cursor-pointer"
                                    title={`View ${r.attachments.length} muster roll photo(s)`}
                                  >
                                    <Camera className="w-3 h-3 text-amber-700" />
                                    <span>{r.attachments.length} {r.attachments.length === 1 ? "Photo" : "Photos"}</span>
                                  </button>
                                )}
                              </div>

                              {r.siteName && (
                                <div className="mt-1">
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                                    📍 {r.siteName}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="shrink-0 text-right">
                              <span className="inline-block whitespace-nowrap px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-black font-mono text-xs border border-emerald-200">
                                {r.grandTotal} {r.grandTotal === 1 ? "Worker" : "Workers"}
                              </span>
                              {r.totalExpense ? (
                                <div className="font-mono font-bold text-emerald-700 text-xs mt-1">
                                  ₹{Math.round(r.totalExpense / 100).toLocaleString("en-IN")}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          {/* Date, Shift, Unit & Pair Badges */}
                          <div className="text-xs text-slate-500 font-mono mt-2.5 flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-700">{formatDate(r.date)}</span>
                            <span className="text-slate-300">·</span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 font-bold text-slate-700 text-[10px] uppercase">
                              {r.shift || "GENERAL"} SHIFT
                            </span>
                            {r.rateUnit && r.rateUnit !== "DAY" && (
                              <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-bold border border-sky-200 text-[10px]">
                                ⏱ {r.rateUnit}
                              </span>
                            )}
                            {(r.overrideReason?.toLowerCase().includes("pair") || r.rateUnit?.toLowerCase().includes("pair")) && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-bold border border-purple-200 text-[10px]">
                                👥 Pair
                              </span>
                            )}
                          </div>

                          {/* Worker Category Breakdown */}
                          <div className="mt-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-[11px] grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Artisans / Skilled</span>
                              <strong className="text-slate-800 text-xs">{r.artisanCount ?? r.artisanTotal ?? 0}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Laborers</span>
                              <strong className="text-slate-800 text-xs">
                                {r.laborerTotal}{" "}
                                <span className="text-slate-500 font-normal text-[10px]">
                                  (M: {r.laborerMale}, F: {r.laborerFemale})
                                </span>
                              </strong>
                            </div>
                          </div>

                          {/* Applied Rates Strip */}
                          <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-500">
                            <span>Rates (Skilled / M / F):</span>
                            <span className="font-mono font-semibold text-slate-700 bg-slate-100/80 px-1.5 py-0.5 rounded">
                              ₹{Math.round((r.skilledRate || 0) / 100)} / ₹{Math.round((r.maleRate || 0) / 100)} / ₹{Math.round((r.femaleRate || 0) / 100)}
                            </span>
                          </div>

                          {r.notes && (
                            <div className="mt-2.5 text-[11px] text-slate-600 bg-amber-50/50 p-2 rounded border border-amber-100/60 line-clamp-2">
                              {r.notes}
                            </div>
                          )}
                        </div>

                        {/* Card Footer: Logged By & Actions */}
                        <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                          <div className="text-[11px] text-slate-500">
                            <span className="text-slate-400">By</span>{" "}
                            <span className="font-semibold text-slate-700">{r.supervisorName || "Supervisor"}</span>
                            {r.createdAt && (
                              <span className="text-slate-400 ml-1">
                                · {new Date(r.updatedAt || r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/workforce?date=${r.date}&siteId=${r.siteId || ''}`}
                              className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                              title="Edit in Workforce"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleDeleteHeadcountRecord(r.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Delete Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    {/* Desktop Table View */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs min-w-[700px]">
                      <thead className="bg-slate-900 text-slate-200 uppercase tracking-wider text-[10px] font-semibold">
                        <tr>
                          <th className="py-3 px-4">Contractor / Vendor</th>
                          <th className="py-3 px-4">Date &amp; Shift</th>
                          <th className="py-3 px-4">Total Workers</th>
                          <th className="py-3 px-4 text-center">Applied Rates (Day)</th>
                          <th className="py-3 px-4 text-right">Labour Expense</th>
                          <th className="py-3 px-4">Logged By</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium bg-white">
                        {filteredRecords.map((r: any) => (
                          <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                            {/* Contractor / Vendor */}
                            <td className="py-3 px-4 text-slate-700">
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
                                    onClick={() => setSelectedPhoto(r.attachments[0].url)}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300 transition cursor-pointer"
                                    title={`View ${r.attachments.length} muster roll photo(s)`}
                                  >
                                    <Camera className="w-3 h-3 text-amber-700" />
                                    <span>{r.attachments.length} {r.attachments.length === 1 ? "Photo" : "Photos"}</span>
                                  </button>
                                )}
                              </div>
                              {r.siteName && (
                                <div className="mt-0.5">
                                  <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                                    {r.siteName}
                                  </span>
                                </div>
                              )}
                              {r.notes && (
                                <div className="text-[10px] text-slate-500 break-words whitespace-normal mt-0.5">
                                  {r.notes}
                                </div>
                              )}
                            </td>

                            {/* Date & Shift */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="font-bold text-slate-900">{formatDate(r.date)}</div>
                              <div className="text-[10px] font-mono text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
                                <span className="px-1.5 py-0.2 rounded bg-slate-100 font-bold text-slate-700 uppercase">
                                  {r.shift || "GENERAL"} SHIFT
                                </span>
                                {r.rateUnit && r.rateUnit !== "DAY" && (
                                  <span className="px-1.5 py-0.2 rounded bg-sky-50 text-sky-700 font-bold border border-sky-200">
                                    ⏱ {r.rateUnit}
                                  </span>
                                )}
                                {(r.overrideReason?.toLowerCase().includes("pair") || r.rateUnit?.toLowerCase().includes("pair")) && (
                                  <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 font-bold border border-purple-200">
                                    👥 Pair
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Total Workforce */}
                            <td className="py-3 px-4 whitespace-nowrap">
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
                            <td className="py-3 px-4 whitespace-nowrap text-center">
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
                            <td className="py-3 px-4 whitespace-nowrap text-right">
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

                            {/* Logged By */}
                            <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                              <div className="font-semibold text-slate-800">{r.supervisorName || "Supervisor"}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {r.createdAt ? new Date(r.updatedAt || r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-4 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Link
                                  href={`/workforce?date=${r.date}&siteId=${r.siteId || ''}`}
                                  className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                                  title="Edit in Workforce"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteHeadcountRecord(r.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                  title="Delete Record"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                )
              ) : (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <HardHat className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                  <div className="font-bold text-slate-800 text-sm">
                    No worker headcount logged for {formatDate(dashboardDate)}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    There are no workforce headcount entries recorded for this date{activeSiteId ? " on this site" : ""}.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                    <Link
                      href={`/workforce?date=${dashboardDate}${activeSiteId ? `&siteId=${activeSiteId}` : ""}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Log Headcount for {formatDate(dashboardDate)}</span>
                    </Link>
                    {kpi?.workforceHeadcount?.activeDate && kpi.workforceHeadcount.activeDate !== dashboardDate && (
                      <button
                        type="button"
                        onClick={() => handleDateChange(kpi.workforceHeadcount.activeDate)}
                        className="px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-lg transition cursor-pointer"
                      >
                        View {formatDate(kpi.workforceHeadcount.activeDate)} Records →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Checked-In Staff & Supervisors Section */}
              {list.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Checked-In Staff &amp; Supervisors ({list.length})</span>
                    </span>
                    <Link
                      href="/attendance"
                      className="text-[11px] font-semibold text-blue-600 hover:underline"
                    >
                      Attendance Page &rarr;
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {list.map((s: any) => (
                      <div
                        key={s.id}
                        className="p-2.5 bg-slate-50 hover:bg-slate-100/60 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-900">{s.workforceMember?.name || s.workerName || "Staff Member"}</span>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {s.workforceMember?.trade || s.trade || "Staff"} &bull; {s.site?.name || s.siteName || "Main Site"}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase">
                            PRESENT
                          </span>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {s.checkInAt ? new Date(s.checkInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Today"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ),
        };
      }
      case "lowStockItems": {
        const list = kpi?.lowStockItems || [];
        return {
          icon: <Boxes className="w-5 h-5 text-amber-600" />,
          title: t("kpi.criticalMaterials", "Low Stock Items"),
          badge: `${kpi?.lowStockItemsCount ?? 0} Alerts`,
          badgeColor: "bg-amber-100 text-amber-800",
          subtitle: "Materials currently at or below safety reorder thresholds",
          actionUrl: "/materials",
          actionLabel: "View Materials & Reorder",
          emptyTitle: "All stocks healthy",
          emptyDesc: "Every active material is currently stocked above its defined minimum reorder threshold.",
          content: list.length > 0 ? (
            <div className="space-y-2.5 max-h-[60dvh] overflow-y-auto pr-1">
              {list.map((m: any) => (
                <div
                  key={m.id}
                  className="p-3.5 bg-slate-50 hover:bg-amber-50/40 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{m.name}</span>
                      {m.code && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-mono font-medium">
                          {m.code}
                        </span>
                      )}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 uppercase tracking-wider">
                        Reorder Needed
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5">
                      Category: <strong className="text-slate-700">{m.category}</strong>
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <div className="text-[11px] text-slate-500 font-medium">Stock / Min Threshold</div>
                    <div className="text-sm font-black text-rose-600 tabular-nums">
                      {m.quantityOnHand}{" "}
                      <span className="text-xs text-slate-500 font-normal">
                        / {m.minStockQty} {m.unitCode}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null,
        };
      }
      case "tasksOverdue": {
        const list = kpi?.tasksOverdue || [];
        return {
          icon: <AlertTriangle className="w-5 h-5 text-rose-600" />,
          title: "Overdue Tasks",
          badge: `${kpi?.tasksOverdueCount ?? 0} Overdue`,
          badgeColor: "bg-rose-100 text-rose-800",
          subtitle: "Uncompleted work items that have exceeded their target deadline",
          actionUrl: "/tasks",
          actionLabel: "Resolve Overdue Tasks",
          emptyTitle: "No overdue tasks",
          emptyDesc: "Outstanding tasks are proceeding on schedule with zero overdue items.",
          content: list.length > 0 ? (
            <div className="space-y-2.5 max-h-[60dvh] overflow-y-auto pr-1">
              {list.map((t: any) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTimelineTask({
                    id: t.id,
                    title: t.title,
                    status: t.status || "TODO",
                    projectId: t.projectId || null,
                  })}
                  className="p-3.5 bg-slate-50 hover:bg-rose-50/70 rounded-xl border border-slate-200 hover:border-rose-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition cursor-pointer group shadow-2xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm group-hover:text-rose-700 transition-colors">{t.title}</span>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 border ${
                          normalizePriority(t.priority) === "CRITICAL"
                            ? "bg-rose-100 text-rose-800 border-rose-300"
                            : normalizePriority(t.priority) === "GENERAL"
                            ? "bg-sky-100 text-sky-800 border-sky-300"
                            : "bg-amber-100 text-amber-800 border-amber-300"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            normalizePriority(t.priority) === "CRITICAL"
                              ? "bg-rose-600"
                              : normalizePriority(t.priority) === "GENERAL"
                              ? "bg-sky-600"
                              : "bg-amber-600"
                          }`}
                        />
                        <span>{formatPriorityLabel(t.priority)}</span>
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-3">
                      {t.projectName && (
                        <span>
                          Project: <strong className="text-slate-700">{t.projectName}</strong>
                        </span>
                      )}
                      {t.assigneeName && (
                        <span>
                          Assignee: <strong className="text-slate-700">{t.assigneeName}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1.5 shrink-0">
                    <div className="text-left sm:text-right">
                      <div className="text-[11px] text-slate-500 font-medium">Target Due Date</div>
                      <div className="text-sm font-bold text-rose-600">
                        {t.dueAt ? formatDate(t.dueAt) : "Overdue"}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 group-hover:translate-x-0.5 transition-transform">
                      <span>View Details</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : null,
        };
      }
      case "tasksDueToday": {
        const list = kpi?.tasksDueToday || [];
        return {
          icon: <CheckSquare className="w-5 h-5 text-indigo-600" />,
          title: "Tasks Due Today",
          badge: `${kpi?.tasksDueTodayCount ?? 0} Due Today`,
          badgeColor: "bg-indigo-100 text-indigo-800",
          subtitle: "Deliverables and milestones scheduled for completion today",
          actionUrl: "/tasks",
          actionLabel: "Manage Today's Tasks",
          emptyTitle: "No tasks due today",
          emptyDesc: "There are no tasks specifically scheduled to be completed by today.",
          content: list.length > 0 ? (
            <div className="space-y-2.5 max-h-[60dvh] overflow-y-auto pr-1">
              {list.map((t: any) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTimelineTask({
                    id: t.id,
                    title: t.title,
                    status: t.status || "TODO",
                    projectId: t.projectId || null,
                  })}
                  className="p-3.5 bg-slate-50 hover:bg-indigo-50/70 rounded-xl border border-slate-200 hover:border-indigo-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition cursor-pointer group shadow-2xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm group-hover:text-indigo-700 transition-colors">{t.title}</span>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 border ${
                          normalizePriority(t.priority) === "CRITICAL"
                            ? "bg-rose-100 text-rose-800 border-rose-300"
                            : normalizePriority(t.priority) === "GENERAL"
                            ? "bg-sky-100 text-sky-800 border-sky-300"
                            : "bg-amber-100 text-amber-800 border-amber-300"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            normalizePriority(t.priority) === "CRITICAL"
                              ? "bg-rose-600"
                              : normalizePriority(t.priority) === "GENERAL"
                              ? "bg-sky-600"
                              : "bg-amber-600"
                          }`}
                        />
                        <span>{formatPriorityLabel(t.priority)}</span>
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-3">
                      {t.projectName && (
                        <span>
                          Project: <strong className="text-slate-700">{t.projectName}</strong>
                        </span>
                      )}
                      {t.assigneeName && (
                        <span>
                          Assignee: <strong className="text-slate-700">{t.assigneeName}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1.5 shrink-0">
                    <div className="text-left sm:text-right">
                      <div className="text-[11px] text-slate-500 font-medium">Due Schedule</div>
                      <div className="text-sm font-bold text-indigo-700">
                        {t.dueAt
                          ? new Date(t.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "Today"}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 group-hover:translate-x-0.5 transition-transform">
                      <span>View Details</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : null,
        };
      }
      case "paymentsMadeToday": {
        const list = kpi?.paymentsMadeToday || [];
        const rejected = kpi?.rejectedPayments || [];
        return {
          icon: <DollarSign className="w-5 h-5 text-emerald-600" />,
          title: "Paid Today",
          badge: `${formatCompactINR(kpi?.paymentsMadeTodayAmount ?? 0)} Paid${rejected.length ? ` · ${rejected.length} Rejected` : ""}`,
          badgeColor: "bg-emerald-100 text-emerald-800",
          subtitle: "Approved payments and rejected payment requests",
          actionUrl: "/finance",
          actionLabel: "Go to Finance & Payments",
          emptyTitle: rejected.length > 0 ? "No approved payments today" : "No payments recorded today",
          emptyDesc: rejected.length > 0 ? "Only rejected payment requests exist for this period." : "No payments have been recorded for today yet.",
          content: (list.length > 0 || rejected.length > 0) ? (
            <div className="space-y-4 max-h-[60dvh] overflow-y-auto pr-1">
              {/* Rejected Payment Requests */}
              {rejected.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                    <XCircle className="w-4 h-4 text-rose-500" />
                    <span>Rejected Payment Requests ({rejected.length})</span>
                  </div>
                  {rejected.map((p: any) => (
                    <div
                      key={p.id}
                      className="p-3.5 bg-rose-50/50 hover:bg-rose-50 rounded-xl border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">{p.recipientName}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 uppercase tracking-wider">
                            REJECTED
                          </span>
                        </div>
                        {p.rejectionReason && (
                          <div className="text-xs text-rose-700 font-medium mt-1">
                            Reason: {p.rejectionReason}
                          </div>
                        )}
                        <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                          {p.referenceNumber && (
                            <span>Ref: <strong className="text-slate-700">{p.referenceNumber}</strong></span>
                          )}
                          {p.approvedBy && (
                            <span>Declined by: <strong className="text-slate-700">{p.approvedBy}</strong></span>
                          )}
                        </div>
                      </div>
                      <div className="text-left sm:text-right shrink-0">
                        <div className="text-[11px] text-rose-500 font-medium">Requested</div>
                        <div className="font-display text-sm font-extrabold text-rose-700 tabular-nums whitespace-nowrap" title={formatCurrency(p.amount || 0)}>
                          {formatCompactINR(p.amount || 0)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Approved Payments */}
              {list.length > 0 && (
                <div className="space-y-2">
                  {rejected.length > 0 && (
                    <div className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                      Approved Payments ({list.length})
                    </div>
                  )}
                  {list.map((p: any) => (
                    <div
                      key={p.id}
                      className="p-3.5 bg-slate-50 hover:bg-emerald-50/40 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">{p.recipientName}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                            {p.method}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-3">
                          {p.referenceNumber && (
                            <span>
                              Ref: <strong className="text-slate-700">{p.referenceNumber}</strong>
                            </span>
                          )}
                          {p.payingAccount && (
                            <span>
                              Account: <strong className="text-slate-700">{p.payingAccount}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-left sm:text-right shrink-0">
                        <div className="text-[11px] text-slate-500 font-medium">Paid</div>
                        <div className="font-display text-sm font-extrabold text-emerald-700 tabular-nums whitespace-nowrap" title={formatCurrency(p.amount || 0)}>
                          {formatCompactINR(p.amount || 0)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null,
        };
      }
      case "outstandingPayables": {
        const list = kpi?.outstandingPayables || [];
        return {
          icon: <TrendingDown className="w-5 h-5 text-amber-700" />,
          title: "Total Outstanding Payables",
          badge: `${formatCompactINR(kpi?.totalOutstandingPayablesAmount ?? 0)} Outstanding`,
          badgeColor: "bg-amber-100 text-amber-800",
          subtitle: "Unpaid vendor & contractor invoices and verified bills",
          actionUrl: "/finance?tab=bills&status=pending",
          actionLabel: "View Unpaid Bills in Payments & Bills",
          emptyTitle: "Zero outstanding payables",
          emptyDesc: "All verified vendor and contractor invoices are completely settled.",
          content: list.length > 0 ? (
            <div className="space-y-2.5 max-h-[60dvh] overflow-y-auto pr-1">
              {list.map((b: any) => (
                <div
                  key={b.id}
                  className="p-3.5 bg-slate-50 hover:bg-amber-50/40 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{b.billNumber}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-medium">
                        {b.partyName}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-3">
                      <span>
                        Total Bill: <strong className="text-slate-700 tabular-nums" title={formatCurrency(b.totalAmount || 0)}>{formatCompactINR(b.totalAmount || 0)}</strong>
                      </span>
                      {b.dueDate && (
                        <span>
                          Due: <strong className="text-slate-700">{formatDate(b.dueDate)}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <div className="text-[11px] text-slate-500 font-medium">Remaining Balance</div>
                    <div className="text-sm font-black text-amber-600 tabular-nums whitespace-nowrap" title={formatCurrency(b.remainingAmount || 0)}>
                      {formatCompactINR(b.remainingAmount || 0)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null,
        };
      }
      default:
        return null;
    }
  };

  const renderRequestedMaterialsSection = (isFullView: boolean) => {
    const list = isFullView ? displayedMaterialRequests : displayedMaterialRequests.slice(0, 6);
    return (
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold">
              <PackagePlus className="w-4 h-4 text-amber-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Requested Materials</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold">
                  {recentMaterialRequests.length} Requests
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Site material requisitions, approvals, and order tracking
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                resetQuickMaterialForm();
                setShowQuickMaterialModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-brand text-slate-950 font-bold text-xs rounded-lg shadow-sm hover:brightness-105 transition cursor-pointer"
            >
              <PackagePlus className="w-3.5 h-3.5 text-slate-950" />
              <span>Request Material</span>
            </button>
            <Link
              href="/material-requests"
              className="text-xs font-semibold text-amber-600 hover:underline inline-flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {materialRequestNotice && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-semibold flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{materialRequestNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setMaterialRequestNotice(null)}
              className="text-emerald-700 hover:text-emerald-950 text-xs font-bold cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {list.length === 0 ? (
          <div className="py-8 px-4 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200">
            <PackagePlus className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">No material requests yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Need cement, rebar, timber, or site supplies? Raise a material request and office/store teams will be notified immediately.
            </p>
            <button
              type="button"
              onClick={() => {
                resetQuickMaterialForm();
                setShowQuickMaterialModal(true);
              }}
              className="mt-3.5 inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-brand text-slate-950 text-xs font-bold rounded-lg shadow-sm hover:brightness-105 cursor-pointer"
            >
              <PackagePlus className="w-3.5 h-3.5 text-slate-950" />
              <span>+ Request Material for Work</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {list.map((req: any) => {
              const statusConfig: Record<string, { label: string; cls: string }> = {
                PENDING: { label: "Waiting for approval", cls: "bg-amber-100 text-amber-900 border-amber-300" },
                APPROVED: { label: "Approved", cls: "bg-blue-100 text-blue-900 border-blue-300" },
                PARTLY_ORDERED: { label: "Partly Ordered", cls: "bg-indigo-100 text-indigo-900 border-indigo-300" },
                ORDERED: { label: "Ordered / In Transit", cls: "bg-emerald-100 text-emerald-900 border-emerald-300" },
                DELIVERED: { label: "Received & Billed", cls: "bg-emerald-100 text-emerald-950 font-bold border-emerald-400" },
                REJECTED: { label: "Declined", cls: "bg-rose-100 text-rose-900 border-rose-300" },
                CANCELLED: { label: "Cancelled", cls: "bg-slate-100 text-slate-600 border-slate-300" },
              };
              const st = statusConfig[req.status] || { label: req.status, cls: "bg-slate-100 text-slate-700 border-slate-200" };
              const isUrgent = req.priority === "URGENT";

              return (
                <div
                  key={req.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-amber-300 hover:shadow-xs transition space-y-2.5 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-slate-500">
                        #{req.requestNumber || req.id.slice(0, 8)}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {isUrgent && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-600 text-white uppercase tracking-wider animate-pulse">
                            URGENT
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>
                          {st.label}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {req.project?.name || "Project Requisition"}
                      </div>
                      {req.project?.site?.name && (
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span>{req.project.site.name}</span>
                        </div>
                      )}
                    </div>

                    {/* Items summary */}
                    <div className="bg-white rounded-lg p-2 border border-slate-200/80 space-y-1">
                      {(req.items || []).slice(0, 3).map((it: any, idx: number) => {
                        const name = it.material?.name || it.description || "Material";
                        return (
                          <div key={idx} className="flex items-center justify-between text-xs gap-2">
                            <span className="text-slate-800 font-medium truncate">• {name}</span>
                            <span className="font-mono font-bold text-slate-900 shrink-0 text-[11px]">
                              {it.quantity} {it.unitCode || it.material?.unitCode || "NOS"}
                            </span>
                          </div>
                        );
                      })}
                      {(req.items?.length || 0) > 3 && (
                        <div className="text-[10px] text-amber-700 font-semibold pt-0.5">
                          + {req.items.length - 3} more item(s)...
                        </div>
                      )}
                    </div>

                    {req.notes && (
                      <p className="text-[11px] text-slate-500 line-clamp-2 italic">
                        &ldquo;{req.notes}&rdquo;
                      </p>
                    )}

                    {Array.isArray(req.assignedUsers) && req.assignedUsers.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        <span className="text-[10px] font-semibold text-slate-500">Assigned:</span>
                        {req.assignedUsers.map((u: any) => (
                          <span
                            key={u.id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200"
                          >
                            <Users className="w-2.5 h-2.5 text-amber-600" />
                            <span>{u.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
                    <span>
                      By {req.requestedBy?.name || "Staff"} · {formatDate(req.createdAt)}
                    </span>
                    <Link
                      href={`/material-requests?id=${req.id}`}
                      className="font-bold text-amber-600 hover:underline flex items-center gap-0.5"
                    >
                      <span>Details</span>
                      <ArrowRight className="w-2.5 h-2.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <Shell>
      <div className="space-y-4">
        {/* Supervisor Quick Actions Toolbar - AT VERY TOP OF DASHBOARD */}
        <div className="bg-slate-900 text-white rounded-xl px-4 py-2.5 border border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3 transition-all">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-black text-amber-400 flex items-center gap-1.5">
              <span>⚡ Field Actions:</span>
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {canViewStock && (
              <>
                <Link
                  href="/materials"
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow-2xs"
                >
                  <PackagePlus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Receive Goods</span>
                </Link>
                <Link
                  href="/material-storage"
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow-2xs"
                >
                  <PackageMinus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Provide to Contractor</span>
                </Link>
              </>
            )}
            {!isSuperAdmin && activeUser && (
              !isUserCheckedIn ? (
                <button
                  type="button"
                  onClick={handleQuickCheckInOut}
                  disabled={submittingCheckIn}
                  className="px-3 py-1.5 bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 font-bold text-xs rounded-lg transition flex items-center gap-1.5 border border-emerald-600/50 cursor-pointer disabled:opacity-50"
                >
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{submittingCheckIn ? "Checking In..." : "Check In"}</span>
                </button>
              ) : !isUserCheckedOut ? (
                <button
                  type="button"
                  onClick={handleQuickCheckInOut}
                  disabled={submittingCheckIn}
                  className="px-3 py-1.5 bg-rose-900/80 hover:bg-rose-800 text-rose-200 font-bold text-xs rounded-lg transition flex items-center gap-1.5 border border-rose-600/50 cursor-pointer disabled:opacity-50"
                >
                  <Clock className="w-3.5 h-3.5 text-rose-400" />
                  <span>{submittingCheckIn ? "Checking Out..." : "Check Out"}</span>
                </button>
              ) : (
                <Link
                  href="/attendance"
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg transition flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Shift Done</span>
                </Link>
              )
            )}
            <button
              type="button"
              onClick={() => {
                resetQuickMaterialForm();
                setShowQuickMaterialModal(true);
              }}
              className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap"
              title="Raise a site material requisition"
            >
              <PackagePlus className="w-3.5 h-3.5 text-slate-950" />
              <span>Request Material</span>
            </button>
            <button
              type="button"
              onClick={() => setShowQuickTaskModal(true)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap"
              title="Create a new site task"
            >
              <PlusCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Create Site Task</span>
            </button>
          </div>
        </div>

        {/* Admin Command Center: the whole company's Day Book at a glance */}
        {isAdminUser && dashboardMode === "EXECUTIVE" && (
          <CommandCenter userName={currentUser?.name} siteId={activeSiteId || undefined} />
        )}

        {/* Unified Dashboard Command Hub */}
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200/90 shadow-xs space-y-2.5 sm:space-y-3">
          {/* Top Row: Title, Site Indicator, Mode Toggle, and Actions */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-2.5 flex-wrap">
              <h1 className="font-display text-lg sm:text-[26px] font-extrabold text-slate-900 tracking-tight">
                Site Operations Dashboard
              </h1>
              {!activeSiteId ? (
                <span className="hidden sm:flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 items-center gap-1 shadow-2xs">
                  <span>🌐 All Active Sites</span>
                  {sites.length > 0 && <span className="opacity-75 font-mono">({sites.length})</span>}
                </span>
              ) : (
                <div className="hidden sm:flex items-center gap-1.5">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1 shadow-2xs">
                    <span>📍 {sites.find((s) => s.id === activeSiteId)?.name || "Selected Site"}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSiteId("");
                      if (typeof window !== "undefined") {
                        localStorage.setItem("buildtrack_active_site", "");
                        document.cookie = "buildtrack_active_site=; path=/; max-age=31536000; SameSite=Lax";
                        window.dispatchEvent(new CustomEvent("siteChanged", { detail: { siteId: "" } }));
                      }
                    }}
                    className="text-[11px] text-amber-600 hover:text-amber-700 font-bold hover:underline"
                    title="Clear filter and view all sites"
                  >
                    (✕ Reset)
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Header Request Material Quick Button */}
              <button
                type="button"
                onClick={() => {
                  resetQuickMaterialForm();
                  setShowQuickMaterialModal(true);
                }}
                className="px-3 py-1.5 bg-gradient-brand hover:brightness-105 text-slate-950 font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow-2xs border border-amber-400/50 cursor-pointer whitespace-nowrap"
                title="Raise a site material requisition"
              >
                <PackagePlus className="w-3.5 h-3.5 text-slate-950" />
                <span>Request Material</span>
              </button>

              {/* Dashboard Date Selector */}
              <div className="flex items-center bg-white rounded-lg p-0.5 border border-slate-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(dashboardDate);
                    d.setDate(d.getDate() - 1);
                    handleDateChange(d.toISOString().split("T")[0]);
                  }}
                  className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition cursor-pointer"
                  title="Previous Day"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-center gap-1 px-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <input
                    type="date"
                    value={dashboardDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-800 border-0 p-0 focus:ring-0 cursor-pointer"
                    title="Filter Dashboard by Date"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(dashboardDate);
                    d.setDate(d.getDate() + 1);
                    handleDateChange(d.toISOString().split("T")[0]);
                  }}
                  className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition cursor-pointer"
                  title="Next Day"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                {dashboardDate !== istDateKey() && (
                  <button
                    type="button"
                    onClick={() => handleDateChange(istDateKey())}
                    className="ml-1 px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded text-[10px] font-black uppercase tracking-wider transition cursor-pointer"
                    title="Jump to Today"
                  >
                    Today
                  </button>
                )}
              </div>

              {/* Mode Toggle: Executive / Employee */}
              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setDashboardMode("EXECUTIVE")}
                  className={`flex-1 sm:flex-none justify-center px-2.5 py-1.5 sm:py-1 rounded-md text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                    dashboardMode === "EXECUTIVE"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  title="Owner & Executive Overview"
                >
                  <Building2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Overview</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardMode("EMPLOYEE")}
                  className={`flex-1 sm:flex-none justify-center px-2.5 py-1.5 sm:py-1 rounded-md text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                    dashboardMode === "EMPLOYEE"
                      ? "bg-amber-500 text-slate-950 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  title="Personalized Employee Workspace"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>My Work</span>
                </button>
              </div>

              {/* KPI Density Toggle (desktop) */}
              <button
                type="button"
                onClick={() => setKpiDensity(kpiDensity === "compact" ? "cards" : "compact")}
                className="hidden sm:flex px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs transition items-center gap-1 cursor-pointer"
                title={kpiDensity === "compact" ? "Expand KPI Cards" : "Compact KPI Strip"}
              >
                <LayoutGrid className="w-3.5 h-3.5 text-slate-500" />
                <span>{kpiDensity === "compact" ? "Compact" : "Expanded"}</span>
              </button>
            </div>
          </div>

          {/* Dedicated Site Selection: compact select on mobile, pill ribbon on desktop */}
          <div className="pt-2 border-t border-slate-100">
            <div className="sm:hidden">
              <select
                aria-label="Filter by site"
                value={activeSiteId || ""}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setActiveSiteId(nextId);
                  if (typeof window !== "undefined") {
                    localStorage.setItem("buildtrack_active_site", nextId);
                    document.cookie = `buildtrack_active_site=${nextId}; path=/; max-age=31536000; SameSite=Lax`;
                    window.dispatchEvent(new CustomEvent("siteChanged", { detail: { siteId: nextId } }));
                  }
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-500"
              >
                <option value="">All Active Sites ({sites.length})</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.code ? `(${s.code})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="hidden sm:flex items-center gap-2 flex-wrap pb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 shrink-0 mr-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span>Sites:</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setActiveSiteId("");
                  if (typeof window !== "undefined") {
                    localStorage.setItem("buildtrack_active_site", "");
                    document.cookie = "buildtrack_active_site=; path=/; max-age=31536000; SameSite=Lax";
                    window.dispatchEvent(new CustomEvent("siteChanged", { detail: { siteId: "" } }));
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                  !activeSiteId
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <span>🌐 All Active Sites</span>
                <span className="text-[10px] opacity-75 font-mono">({sites.length})</span>
              </button>
              {sites.map((s) => {
                const isSelected = activeSiteId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setActiveSiteId(s.id);
                      if (typeof window !== "undefined") {
                        localStorage.setItem("buildtrack_active_site", s.id);
                        document.cookie = `buildtrack_active_site=${s.id}; path=/; max-age=31536000; SameSite=Lax`;
                        window.dispatchEvent(new CustomEvent("siteChanged", { detail: { siteId: s.id } }));
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                      isSelected
                        ? "bg-amber-500 text-slate-950 ring-2 ring-amber-300"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <span>{s.name}</span>
                    {s.code && <span className="text-[10px] opacity-75 font-mono">({s.code})</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Section Tabs + Live Search Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg w-full sm:w-auto max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setActiveSectionTab("ALL")}
                  className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                    activeSectionTab === "ALL"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="sm:hidden">All</span>
                  <span className="hidden sm:inline">All-In-One</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSectionTab("SITES")}
                  className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                    activeSectionTab === "SITES"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Sites</span>
                  <span className="text-[10px] font-mono font-bold bg-slate-200 px-1 py-0.2 rounded">
                    {displayedSites.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSectionTab("TASKS")}
                  className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                    activeSectionTab === "TASKS"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <CheckSquare className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>Tasks</span>
                  <span className="text-[10px] font-mono font-bold bg-slate-200 px-1 py-0.2 rounded">
                    {pendingIncompleteTasks.length}
                  </span>
                  {overdueTasksCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-600 text-white font-bold animate-pulse">
                      <span className="sm:hidden">{overdueTasksCount}!</span>
                      <span className="hidden sm:inline">{overdueTasksCount} Overdue</span>
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSectionTab("PROJECTS")}
                  className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                    activeSectionTab === "PROJECTS"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <FolderKanban className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  <span>Projects</span>
                  <span className="text-[10px] font-mono font-bold bg-slate-200 px-1 py-0.2 rounded">
                    {displayedProjects.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSectionTab("PHOTOS")}
                  className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                    activeSectionTab === "PHOTOS"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Camera className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>Photos</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSectionTab("MATERIALS")}
                  className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                    activeSectionTab === "MATERIALS"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <PackagePlus className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>Material Requests</span>
                  {recentMaterialRequests.length > 0 && (
                    <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-1 py-0.2 rounded">
                      {recentMaterialRequests.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Quick Filter Search Input */}
              <div className="relative w-full sm:w-44">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Quick filter..."
                  value={dashboardFilterQuery}
                  onChange={(e) => setDashboardFilterQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-800 pl-8 pr-6 py-1 rounded-lg focus:outline-none focus:border-amber-400 transition"
                />
                {dashboardFilterQuery && (
                  <button
                    type="button"
                    onClick={() => setDashboardFilterQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    title="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

        {/* Status notification banner */}
        {statusMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center justify-between gap-2 shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusMessage}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-emerald-700 hover:text-emerald-900 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Error notification banner */}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center justify-between gap-2 shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-700 hover:text-rose-900 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Personalized Employee Workspace */}
        {dashboardMode === "EMPLOYEE" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <Link
                href="/tasks?filter=my_tasks"
                className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group select-none block"
              >
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">My Open Tasks</span>
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-600 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                    <CheckSquare className="w-4 h-4" />
                  </div>
                </div>
                {(() => {
                  const count = allTasks.filter((t: any) => (t.assigneeUserId === currentUser?.id || t.assignee?.id === currentUser?.id) && t.status !== "COMPLETED" && t.status !== "VERIFIED").length;
                  return (
                    <div className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight leading-tight truncate" title={String(count)}>
                      {formatCompactNumber(count)}
                    </div>
                  );
                })()}
                <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                  <span>Assigned to you</span>
                  <span className="text-amber-600 font-medium group-hover:underline">Open List →</span>
                </div>
              </Link>

              <Link
                href="/tasks?filter=overdue"
                className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-rose-400 hover:shadow-md transition-all cursor-pointer group select-none block"
              >
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">My Overdue Tasks</span>
                  <div className="p-2 rounded-lg bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                </div>
                {(() => {
                  const count = allTasks.filter((t: any) => (t.assigneeUserId === currentUser?.id || t.assignee?.id === currentUser?.id) && t.dueAt && new Date(t.dueAt).getTime() < Date.now() && t.status !== "COMPLETED" && t.status !== "VERIFIED").length;
                  return (
                    <div className="font-display text-xl sm:text-2xl font-extrabold text-rose-600 tabular-nums tracking-tight leading-tight truncate" title={String(count)}>
                      {formatCompactNumber(count)}
                    </div>
                  );
                })()}
                <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                  <span>Needs urgent action</span>
                  <span className="text-rose-600 font-medium group-hover:underline">View →</span>
                </div>
              </Link>

              <Link
                href="/tasks?filter=completed"
                className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group select-none block"
              >
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Completed By Me</span>
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
                {(() => {
                  const count = allTasks.filter((t: any) => (t.assigneeUserId === currentUser?.id || t.completedById === currentUser?.id) && (t.status === "COMPLETED" || t.status === "VERIFIED")).length;
                  return (
                    <div className="font-display text-xl sm:text-2xl font-extrabold text-emerald-600 tabular-nums tracking-tight leading-tight truncate" title={String(count)}>
                      {formatCompactNumber(count)}
                    </div>
                  );
                })()}
                <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                  <span>Delivered work</span>
                  <span className="text-emerald-700 font-medium group-hover:underline">View →</span>
                </div>
              </Link>

              <Link
                href="/tasks?filter=requests"
                className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group select-none block"
              >
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">My Approval Requests</span>
                  <div className="p-2 rounded-lg bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                </div>
                {(() => {
                  const count = allTasks.filter((t: any) => t.createdBy === currentUser?.id && t.taskType && t.taskType !== "STANDARD").length;
                  return (
                    <div className="font-display text-xl sm:text-2xl font-extrabold text-purple-600 tabular-nums tracking-tight leading-tight truncate" title={String(count)}>
                      {formatCompactNumber(count)}
                    </div>
                  );
                })()}
                <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                  <span>Sent to Owner or Architect</span>
                  <span className="text-purple-600 font-medium group-hover:underline">Track →</span>
                </div>
              </Link>
            </div>

            {/* Employee Active Tasks Work Queue */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-amber-500" />
                    <span>My Assigned Tasks</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">Tasks assigned to you that need to be completed</p>
                </div>
                <Link href="/tasks" className="text-xs font-bold text-amber-600 hover:underline">
                  Go to All Site Tasks →
                </Link>
              </div>

              {allTasks.filter((t: any) => (t.assigneeUserId === currentUser?.id || t.assignee?.id === currentUser?.id) && t.status !== "COMPLETED" && t.status !== "VERIFIED").length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <div className="font-bold text-slate-700 text-sm">All caught up!</div>
                  <p className="mt-0.5">No open tasks currently assigned to you. Create a personal task or request from the tasks page.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {allTasks
                    .filter((t: any) => (t.assigneeUserId === currentUser?.id || t.assignee?.id === currentUser?.id) && t.status !== "COMPLETED" && t.status !== "VERIFIED")
                    .slice(0, 6)
                    .map((t: any) => {
                      const isOverdue = t.dueAt && new Date(t.dueAt).getTime() < Date.now();
                      return (
                        <div
                          key={t.id}
                          className="p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setSelectedTimelineTask({
                                  id: t.id,
                                  title: t.title,
                                  status: t.status || "TODO",
                                  projectId: t.projectId || t.project?.id || null,
                                })}
                                className="font-bold text-slate-900 text-sm hover:text-blue-600 hover:underline text-left cursor-pointer"
                              >
                                {t.title}
                              </button>
                              <span
                                className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 border ${
                                  normalizePriority(t.priority) === "CRITICAL"
                                    ? "bg-rose-100 text-rose-800 border-rose-300"
                                    : normalizePriority(t.priority) === "GENERAL"
                                    ? "bg-sky-100 text-sky-800 border-sky-300"
                                    : "bg-amber-100 text-amber-800 border-amber-300"
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    normalizePriority(t.priority) === "CRITICAL"
                                      ? "bg-rose-600"
                                      : normalizePriority(t.priority) === "GENERAL"
                                      ? "bg-sky-600"
                                      : "bg-amber-600"
                                  }`}
                                />
                                <span>{formatPriorityLabel(t.priority)}</span>
                              </span>
                              {isOverdue && (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-600 text-white uppercase tracking-wider inline-flex items-center gap-1 shadow-2xs animate-pulse">
                                  <AlertTriangle className="w-3 h-3 text-white" />
                                  <span>OVERDUE</span>
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                              <span>Project: <strong className="text-slate-700">{t.project?.name || "General"}</strong></span>
                              {t.dueAt && (
                                <span className={isOverdue ? "text-rose-600 font-bold flex items-center gap-1" : "text-slate-500"}>
                                  Due: <strong className={isOverdue ? "text-rose-600 font-bold" : "text-slate-700"}>{formatDate(t.dueAt)}</strong> {isOverdue && <span className="text-rose-600 font-bold">(Past Due)</span>}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              disabled={completingTaskId === t.id}
                              onClick={() => handleQuickCompleteTask(t.id, t.title)}
                              title="Mark task as completed"
                              className="px-3 py-1.5 bg-slate-900 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg shadow-xs transition flex items-center gap-1.5 cursor-pointer group"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 group-hover:text-white transition-colors" />
                              <span>Complete</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedTimelineTask({
                                id: t.id,
                                title: t.title,
                                status: t.status || "TODO",
                                projectId: t.projectId || t.project?.id || null,
                              })}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition cursor-pointer"
                            >
                              Details
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Real KPI Cards Strip (Executive Mode) */}
        {dashboardMode === "EXECUTIVE" && (loading ? (
          <div className={`grid grid-cols-2 sm:grid-cols-4 ${canViewFinance || canViewStock ? "lg:grid-cols-7" : "lg:grid-cols-4"} gap-2.5`}>
            {[...Array(canViewFinance || canViewStock ? 7 : 4)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-slate-200/60 animate-pulse" />
            ))}
          </div>
        ) : kpiDensity === "compact" ? (
          <div className={`grid grid-cols-2 sm:grid-cols-4 ${canViewFinance || canViewStock ? "lg:grid-cols-7" : "lg:grid-cols-4"} gap-2.5`}>
            {/* Active Projects */}
            <div
              onClick={() => setActiveSectionTab("PROJECTS")}
              className="bg-white rounded-xl p-3 border border-slate-200 hover:border-blue-400 shadow-2xs hover:shadow-xs transition-all cursor-pointer group"
              title="Click to view Active Projects"
            >
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider truncate">{t("kpi.activeProjects", "Projects")}</span>
                <FolderKanban className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              </div>
              <div className="font-display text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums tracking-tight leading-tight truncate" title={String(kpi?.activeProjectsCount ?? 0)}>
                {formatCompactNumber(kpi?.activeProjectsCount ?? 0)}
              </div>
              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                {!activeSiteId ? `${sites.length} Active Sites` : "This Site"}
              </div>
            </div>

            {/* Workforce on Site Today */}
            <div
              onClick={() => setActiveKpiModal("workersPresentToday")}
              className="bg-white rounded-xl p-3 border border-slate-200 hover:border-emerald-400 shadow-2xs hover:shadow-xs transition-all cursor-pointer group"
              title={workerSubCategoryFull}
            >
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider truncate">{t("kpi.workersOnSite", "On Site")}</span>
                <HardHat className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              </div>
              <div className="font-display text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums tracking-tight leading-tight truncate" title={String(displayTotalWorkersOnSite)}>
                {formatCompactNumber(displayTotalWorkersOnSite)}
              </div>
              <div className="text-[10px] text-emerald-700 font-semibold truncate mt-0.5" title={workerSubCategoryFull}>
                {workerSubCategorySummary}
              </div>
            </div>

            {/* Critical Materials */}
            {canViewStock && (
              <div
                onClick={() => setActiveKpiModal("lowStockItems")}
                className="bg-white rounded-xl p-3 border border-slate-200 hover:border-amber-400 shadow-2xs hover:shadow-xs transition-all cursor-pointer group"
                title="Click to view Low Stock Inventory details"
              >
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider truncate">{t("kpi.criticalMaterials", "Low Stock")}</span>
                  <Boxes className={`w-3.5 h-3.5 shrink-0 ${(kpi?.lowStockItemsCount || 0) > 0 ? "text-amber-600" : "text-slate-400"}`} />
                </div>
                <div className={`font-display text-lg sm:text-xl font-extrabold tabular-nums tracking-tight leading-tight truncate ${(kpi?.lowStockItemsCount || 0) > 0 ? "text-amber-600" : "text-slate-900"}`} title={String(kpi?.lowStockItemsCount ?? 0)}>
                  {formatCompactNumber(kpi?.lowStockItemsCount ?? 0)}
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                  Below reorder
                </div>
              </div>
            )}

            {/* Overdue Tasks */}
            <div
              onClick={() => {
                setActiveKpiModal("tasksOverdue");
                setActiveSectionTab("TASKS");
                setTaskFilterOverdueOnly(true);
                setTaskViewFilter("ALL");
                setCollapsedSections((prev) => ({ ...prev, tasks: false }));
              }}
              className="bg-white rounded-xl p-3 border border-slate-200 hover:border-rose-400 shadow-2xs hover:shadow-xs transition-all cursor-pointer group"
              title="Click to view Overdue Tasks"
            >
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider truncate">Overdue</span>
                <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${(kpi?.tasksOverdueCount || 0) > 0 ? "text-rose-600" : "text-slate-400"}`} />
              </div>
              <div className={`font-display text-lg sm:text-xl font-extrabold tabular-nums tracking-tight leading-tight truncate ${(kpi?.tasksOverdueCount || 0) > 0 ? "text-rose-600" : "text-slate-900"}`} title={String(kpi?.tasksOverdueCount ?? 0)}>
                {formatCompactNumber(kpi?.tasksOverdueCount ?? 0)}
              </div>
              <div className="text-[10px] text-rose-600 font-bold truncate mt-0.5">
                Past deadline
              </div>
            </div>

            {/* Tasks Due Today */}
            <div
              onClick={() => {
                setActiveKpiModal("tasksDueToday");
                setActiveSectionTab("TASKS");
                setTaskFilterOverdueOnly(false);
                setTaskViewFilter("ALL");
                setCollapsedSections((prev) => ({ ...prev, tasks: false }));
              }}
              className="bg-white rounded-xl p-3 border border-slate-200 hover:border-indigo-400 shadow-2xs hover:shadow-xs transition-all cursor-pointer group"
              title="Click to view Tasks due today"
            >
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider truncate">Due Today</span>
                <CheckSquare className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              </div>
              <div className="font-display text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums tracking-tight leading-tight truncate" title={String(kpi?.tasksDueTodayCount ?? 0)}>
                {formatCompactNumber(kpi?.tasksDueTodayCount ?? 0)}
              </div>
              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                Today schedule
              </div>
            </div>

            {/* Paid Today */}
            {canViewFinance && (
              <div
                onClick={() => setActiveKpiModal("paymentsMadeToday")}
                className="bg-white rounded-xl p-3 border border-slate-200 hover:border-emerald-400 shadow-2xs hover:shadow-xs transition-all cursor-pointer group"
                title="Click to view payments made today"
              >
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider truncate">Paid Today</span>
                  <DollarSign className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                </div>
                <div className="font-display text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums tracking-tight leading-tight truncate" title={formatCurrency(kpi?.paymentsMadeTodayAmount ?? 0)}>
                  {formatCompactINR(kpi?.paymentsMadeTodayAmount ?? 0)}
                </div>
                <div className="text-[10px] text-emerald-700 font-semibold truncate mt-0.5 flex items-center justify-between">
                  <span>Paid Out</span>
                  {Boolean(kpi?.rejectedPaymentsCount) && (
                    <span className="text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded-full">
                      {kpi.rejectedPaymentsCount} rejected
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Total Outstanding Payables */}
            {canViewFinance && (
              <div
                onClick={() => setActiveKpiModal("outstandingPayables")}
                className="bg-white rounded-xl p-3 border border-slate-200 hover:border-amber-400 shadow-2xs hover:shadow-xs transition-all cursor-pointer group"
                title="Click to view payables breakdown"
              >
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider truncate">Payables</span>
                  <TrendingDown className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                </div>
                <div className="font-display text-lg sm:text-xl font-extrabold text-amber-600 tabular-nums tracking-tight leading-tight truncate" title={formatCurrency(kpi?.totalOutstandingPayablesAmount ?? 0)}>
                  {formatCompactINR(kpi?.totalOutstandingPayablesAmount ?? 0)}
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                  Vendor & contractor
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Active Projects */}
            <div
              onClick={() => setActiveSectionTab("PROJECTS")}
              className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group select-none active:scale-[0.99]"
              title="Click to view Active Projects"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">{t("kpi.activeProjects", "Active Projects")}</span>
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <FolderKanban className="w-4 h-4" />
                </div>
              </div>
              <div className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight leading-tight truncate" title={String(kpi?.activeProjectsCount ?? 0)}>
                {formatCompactNumber(kpi?.activeProjectsCount ?? 0)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>
                  {!activeSiteId
                    ? `Across all ${sites.length} Active Sites`
                    : (sites.find((s) => s.id === activeSiteId)?.name || projects[0]?.name || "Active Site")}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveKpiModal("activeProjects");
                  }}
                  className="text-blue-600 font-semibold opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center gap-0.5 cursor-pointer"
                >
                  Details <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Workforce on Site Today */}
            <div
              onClick={() => setActiveKpiModal("workersPresentToday")}
              className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group select-none active:scale-[0.99]"
              title="Click to view full Workers & Crew details"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">{t("kpi.workersOnSite", "Workers on Site")}</span>
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <HardHat className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight leading-tight truncate" title={String(displayTotalWorkersOnSite)}>
                  {formatCompactNumber(displayTotalWorkersOnSite)}
                </span>
                {kpi?.workforceHeadcount?.isLatestFallback && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    Latest: {kpi.workforceHeadcount.activeDate ? formatDate(kpi.workforceHeadcount.activeDate) : "Recent"}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-emerald-600 font-medium mt-1 flex items-center justify-between">
                <span className="truncate max-w-[280px]" title={workerSubCategoryFull}>
                  {workerSubCategorySummary}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveKpiModal("workersPresentToday");
                  }}
                  className="text-emerald-700 font-semibold opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0 cursor-pointer"
                >
                  Details <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Low Stock Alerts */}
            {canViewStock && (
              <div
                onClick={() => setActiveKpiModal("lowStockItems")}
                className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group select-none active:scale-[0.99]"
                title="Click to view Low Stock Inventory details"
              >
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">{t("kpi.criticalMaterials", "Low Stock Items")}</span>
                  <div
                    className={`p-2 rounded-lg transition-colors ${
                      (kpi?.lowStockItemsCount || 0) > 0
                        ? "bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white"
                        : "bg-slate-50 text-slate-500 group-hover:bg-slate-200"
                    }`}
                  >
                    <Boxes className="w-4 h-4" />
                  </div>
                </div>
                <div
                  className={`font-display text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight leading-tight truncate ${
                    (kpi?.lowStockItemsCount || 0) > 0 ? "text-amber-600" : "text-slate-900"
                  }`}
                  title={String(kpi?.lowStockItemsCount ?? 0)}
                >
                  {formatCompactNumber(kpi?.lowStockItemsCount ?? 0)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                  <span>Items below reorder limit</span>
                  <span className="text-amber-600 font-medium opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                    Details <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              </div>
            )}

            {/* Overdue Tasks */}
            <div
              onClick={() => {
                setActiveKpiModal("tasksOverdue");
                setActiveSectionTab("TASKS");
                setTaskFilterOverdueOnly(true);
                setTaskViewFilter("ALL");
                setCollapsedSections((prev) => ({ ...prev, tasks: false }));
              }}
              className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-rose-400 hover:shadow-md transition-all cursor-pointer group select-none active:scale-[0.99]"
              title="Click to view Overdue Tasks in page"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Overdue Tasks</span>
                <div
                  className={`p-2 rounded-lg transition-colors ${
                    (kpi?.tasksOverdueCount || 0) > 0
                      ? "bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white"
                      : "bg-slate-50 text-slate-500 group-hover:bg-slate-200"
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div
                className={`font-display text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight leading-tight truncate ${
                  (kpi?.tasksOverdueCount || 0) > 0 ? "text-rose-600" : "text-slate-900"
                }`}
                title={String(kpi?.tasksOverdueCount ?? 0)}
              >
                {formatCompactNumber(kpi?.tasksOverdueCount ?? 0)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>Needs supervisor action</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveKpiModal("tasksOverdue");
                  }}
                  className="text-rose-600 font-semibold opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center gap-0.5 cursor-pointer"
                >
                  Details <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Tasks Due Today */}
            <div
              onClick={() => {
                setActiveKpiModal("tasksDueToday");
                setActiveSectionTab("TASKS");
                setTaskFilterOverdueOnly(false);
                setTaskViewFilter("ALL");
                setCollapsedSections((prev) => ({ ...prev, tasks: false }));
              }}
              className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group select-none active:scale-[0.99]"
              title="Click to view Tasks in page"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Tasks Due Today</span>
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <CheckSquare className="w-4 h-4" />
                </div>
              </div>
              <div className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight leading-tight truncate" title={String(kpi?.tasksDueTodayCount ?? 0)}>
                {formatCompactNumber(kpi?.tasksDueTodayCount ?? 0)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>Scheduled completion today</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveKpiModal("tasksDueToday");
                  }}
                  className="text-indigo-600 font-semibold opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center gap-0.5 cursor-pointer"
                >
                  Details <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Payments Today */}
            {canViewFinance && (
              <div
                onClick={() => setActiveKpiModal("paymentsMadeToday")}
                className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group select-none active:scale-[0.99]"
                title="Click to view Payments Made Today details"
              >
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Paid Today</span>
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight leading-tight truncate" title={formatCurrency(kpi?.paymentsMadeTodayAmount ?? 0)}>
                  {formatCompactINR(kpi?.paymentsMadeTodayAmount ?? 0)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                  <span>Approved payments today</span>
                  {Boolean(kpi?.rejectedPaymentsCount) && (
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                      <XCircle className="w-3 h-3 text-rose-500" />
                      {kpi.rejectedPaymentsCount} rejected
                    </span>
                  )}
                  <span className="text-emerald-700 font-medium opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                    Details <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              </div>
            )}

            {/* Total Outstanding Payables */}
            {canViewFinance && (
              <div
                onClick={() => setActiveKpiModal("outstandingPayables")}
                className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:border-amber-400 hover:shadow-md transition-all col-span-2 cursor-pointer group select-none active:scale-[0.99]"
                title="Click to view Outstanding Payables breakdown"
              >
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Total Outstanding Payables</span>
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <TrendingDown className="w-4 h-4" />
                  </div>
                </div>
                <div className="font-display text-xl sm:text-2xl font-extrabold text-amber-600 tabular-nums tracking-tight leading-tight truncate" title={formatCurrency(kpi?.totalOutstandingPayablesAmount ?? 0)}>
                  {formatCompactINR(kpi?.totalOutstandingPayablesAmount ?? 0)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                  <span>Verified across vendor & contractor bills</span>
                  <span className="text-amber-600 font-semibold group-hover:underline flex items-center gap-0.5">
                    View Breakdown →
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* ALL-IN-ONE VIEW: Balanced 2-Column Command Center */}
        {activeSectionTab === "ALL" && (
          <div className="space-y-5">
            {/* Feature 14: Unified Approval Queue */}
            <ApprovalsWidget />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {/* Left Column: Active Site & Projects */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4 min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <h2 className="text-base font-bold text-slate-900">
                    {!activeSiteId ? "Active Construction Sites" : "Selected Site Operations"}
                  </h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold shrink-0 whitespace-nowrap">
                    {!activeSiteId ? `${displayedSites.length} Sites` : (sites.find((s) => s.id === activeSiteId)?.code || "Site")}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveSectionTab("SITES")}
                    className="text-xs font-semibold text-amber-600 hover:underline cursor-pointer whitespace-nowrap"
                  >
                    View All Sites &rarr;
                  </button>
                </div>
              </div>

              {/* Site Display: if activeSiteId is set, show that site in focus; else show compact list of active sites */}
              {activeSiteId ? (() => {
                const site = sites.find((s) => s.id === activeSiteId) || sites[0];
                const siteProjs = projects.filter((p) => p.siteId === site?.id);
                const totalSiteBudget = siteProjs.reduce((sum, p) => sum + (p.budgetAmount || 0), 0);
                const siteWorkers = workers.filter((w) => w.defaultSiteId === site?.id);
                const siteHeadcountList = (kpi?.workforceHeadcount?.records || []).filter(
                  (r: any) => r.siteId === site?.id || r.siteName?.toLowerCase() === site?.name?.toLowerCase()
                );
                const siteHeadcountSum = siteHeadcountList.reduce((s: number, r: any) => s + (r.grandTotal || 0), 0);
                const siteWorkersPresent = (kpi?.workersPresentToday || []).filter((w: any) => w.siteName === site?.name);
                const siteOnSiteCount = siteHeadcountList.length > 0 ? siteHeadcountSum : siteWorkersPresent.length;
                const directCrew = siteWorkers.length || site?._count?.workforceMembers || 0;
                const externalGang = siteOnSiteCount > directCrew ? siteOnSiteCount - directCrew : 0;

                return (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-300 overflow-hidden">
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-sm break-words min-w-0">{site?.name}</span>
                            {site?.code && (
                              <span className="text-[10px] font-mono font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap">
                                {site.code}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 min-w-0">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{site?.address || "Active Site Location"}</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSiteId("");
                            if (typeof window !== "undefined") {
                              localStorage.setItem("buildtrack_active_site", "");
                              document.cookie = "buildtrack_active_site=; path=/; max-age=31536000; SameSite=Lax";
                              window.dispatchEvent(new CustomEvent("siteChanged", { detail: { siteId: "" } }));
                            }
                          }}
                          className="text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-white px-2 py-1 rounded border border-slate-200 shadow-2xs hover:bg-slate-50 cursor-pointer shrink-0 whitespace-nowrap"
                        >
                          ✕ Show All Sites
                        </button>
                      </div>

                      {/* Site Statistics Bar */}
                      <div className="grid grid-cols-3 gap-2 py-2 my-2 border-y border-amber-200/80 text-center bg-white/80 rounded-lg">
                        <div>
                          <div className="text-[10px] text-slate-500 font-medium">Projects</div>
                          <div className="text-sm font-black text-slate-900">{siteProjs.length}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 font-medium">On-Site Today</div>
                          <div className="text-sm font-black text-emerald-600">{siteOnSiteCount}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 font-medium" title="Monthly-salary staff &amp; permanent workers">Permanent Staff</div>
                          <div className="text-sm font-black text-slate-700">{directCrew}</div>
                        </div>
                      </div>

                      {/* Subcontractor gang label if on-site > direct crew */}
                      {externalGang > 0 && (
                        <div className="text-[10px] bg-amber-100/80 border border-amber-300 px-2.5 py-1.5 rounded-md space-y-0.5 mb-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-700 font-medium">Contract / Agency Workers:</span>
                            <span className="font-bold text-amber-950">+{externalGang} Contract Workers</span>
                          </div>
                          <div className="text-[9.5px] text-amber-900 font-medium text-right">
                            ({directCrew} Permanent Staff + {externalGang} Contract = {siteOnSiteCount} On Site)
                          </div>
                        </div>
                      )}

                      {/* Crew attendance clarification if on-site < direct crew (e.g. absent workers) */}
                      {siteOnSiteCount < directCrew && (() => {
                        const absentCount = directCrew - siteOnSiteCount;
                        return (
                          <div className="text-[10px] bg-blue-50/90 border border-blue-200/80 px-2.5 py-1.5 rounded-md space-y-0.5 mb-2 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-600 font-medium">Staff Absence:</span>
                              <span className="font-bold text-blue-900">-{absentCount} Staff Absent</span>
                            </div>
                            <div className="text-[9.5px] text-blue-800 font-medium text-right">
                              ({directCrew} Permanent Staff - {absentCount} Absent = {siteOnSiteCount} On Site)
                            </div>
                          </div>
                        );
                      })()}

                      {/* Active Projects List */}
                      <div className="space-y-1.5 mt-2">
                        <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                          <span>Site Projects ({siteProjs.length}):</span>
                          {totalSiteBudget > 0 && (
                            <span className="text-slate-500 font-mono text-[10px] font-semibold" title={formatCurrency(totalSiteBudget)}>
                              Budget: {formatCompactINR(totalSiteBudget)}
                            </span>
                          )}
                        </div>
                        {siteProjs.length === 0 ? (
                          <div className="text-xs text-slate-400 italic p-2 bg-white rounded border border-slate-200">
                            No projects currently logged for this site.
                          </div>
                        ) : (
                          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                            {siteProjs.map((p) => (
                              <Link
                                key={p.id}
                                href={`/projects/${p.id}`}
                                className="flex items-center justify-between text-xs bg-white p-2.5 rounded-lg border border-slate-200 hover:border-amber-400 transition-colors block shadow-2xs"
                              >
                                <span className="font-bold text-slate-900 truncate max-w-[200px]">{p.name}</span>
                                <span className="font-display font-extrabold text-slate-900 tabular-nums text-xs shrink-0" title={formatCurrency(p.budgetAmount || 0)}>
                                  {formatCompactINR(p.budgetAmount || 0)}
                                </span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto overflow-x-hidden pr-1">
                  {displayedSites.map((site) => {
                    const siteProjs = projects.filter((p) => p.siteId === site.id);
                    const siteWorkers = workers.filter((w) => w.defaultSiteId === site.id);
                    const siteHeadcountList = (kpi?.workforceHeadcount?.records || []).filter(
                      (r: any) => r.siteId === site.id || r.siteName?.toLowerCase() === site.name?.toLowerCase()
                    );
                    const siteHeadcountSum = siteHeadcountList.reduce((s: number, r: any) => s + (r.grandTotal || 0), 0);
                    const siteWorkersPresent = (kpi?.workersPresentToday || []).filter((w: any) => w.siteName === site.name);
                    const siteOnSiteCount = siteHeadcountList.length > 0 ? siteHeadcountSum : siteWorkersPresent.length;
                    const directCrew = siteWorkers.length || site._count?.workforceMembers || 0;
                    const externalGang = siteOnSiteCount > directCrew ? siteOnSiteCount - directCrew : 0;

                    return (
                      <div
                        key={site.id}
                        className="p-3 sm:p-3.5 rounded-xl border border-slate-200 hover:border-amber-400 bg-slate-50/50 hover:bg-white transition-all shadow-2xs space-y-2.5 min-w-0 overflow-hidden"
                      >
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 text-xs sm:text-sm break-words min-w-0">{site.name}</span>
                              {site.code && (
                                <span className="text-[10px] font-mono font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap">
                                  {site.code}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                              {site.address || "Active Site"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveSiteId(site.id);
                              if (typeof window !== "undefined") {
                                localStorage.setItem("buildtrack_active_site", site.id);
                                document.cookie = `buildtrack_active_site=${site.id}; path=/; max-age=31536000; SameSite=Lax`;
                                window.dispatchEvent(new CustomEvent("siteChanged", { detail: { siteId: site.id } }));
                              }
                            }}
                            className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-900 hover:bg-slate-800 text-white transition shrink-0 whitespace-nowrap cursor-pointer"
                          >
                            Filter Site &rarr;
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 py-1.5 border-y border-slate-200/60 text-center bg-white rounded-lg">
                          <div>
                            <div className="text-[9px] text-slate-500 uppercase font-medium">Projects</div>
                            <div className="text-xs font-black text-slate-900">{siteProjs.length}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-500 uppercase font-medium">On-Site</div>
                            <div className="text-xs font-black text-emerald-600">{siteOnSiteCount}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-500 uppercase font-medium">Crew</div>
                            <div className="text-xs font-black text-slate-700">{directCrew}</div>
                          </div>
                        </div>

                        {externalGang > 0 ? (
                          <div className="text-[9.5px] bg-amber-50 border border-amber-200 px-2 py-1 rounded text-amber-900 flex flex-wrap items-center justify-between gap-1">
                            <span>Contract / Agency Workers:</span>
                            <span className="font-bold">+{externalGang} Contract Workers</span>
                          </div>
                        ) : siteOnSiteCount < directCrew ? (
                          <div className="text-[9.5px] bg-blue-50 border border-blue-200 px-2 py-1 rounded text-blue-900 flex flex-wrap items-center justify-between gap-1">
                            <span>Staff Absence:</span>
                            <span className="font-bold">-{directCrew - siteOnSiteCount} Absent ({siteOnSiteCount} of {directCrew} On-Site)</span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Pending Incomplete Tasks */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-blue-500" />
                  <h2 className="text-base font-bold text-slate-900">
                    {!activeSiteId
                      ? "Pending Tasks"
                      : `Pending Tasks (${sites.find((s) => s.id === activeSiteId)?.name || "Selected Site"})`}
                  </h2>
                  <span className="text-xs bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full">
                    {displayedPendingTasks.length}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Feature 9: My Tasks vs All Tasks Toggle */}
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={() => setTaskViewFilter("ALL")}
                      className={`px-2 py-1 rounded-md font-semibold transition ${
                        taskViewFilter === "ALL"
                          ? "bg-white text-slate-900 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      All Tasks
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskViewFilter("MINE")}
                      className={`px-2 py-1 rounded-md font-semibold transition flex items-center gap-1 ${
                        taskViewFilter === "MINE"
                          ? "bg-white text-amber-600 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <span>My Tasks</span>
                      {myAssignedTasksCount > 0 && (
                        <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                          {myAssignedTasksCount}
                        </span>
                      )}
                    </button>
                  </div>

                  {(overdueTasksCount > 0 || taskFilterOverdueOnly) && (
                    <button
                      type="button"
                      onClick={() => setTaskFilterOverdueOnly(!taskFilterOverdueOnly)}
                      className={`px-2.5 py-1 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        taskFilterOverdueOnly
                          ? "bg-rose-600 text-white shadow-xs"
                          : "bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-300"
                      }`}
                      title="Click to toggle overdue tasks only"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{taskFilterOverdueOnly ? "✕ Clear Overdue Filter" : `${overdueTasksCount} Overdue`}</span>
                    </button>
                  )}
                  <Link href="/tasks" className="text-xs font-semibold text-amber-600 hover:underline">
                    Task Board &rarr;
                  </Link>
                </div>
              </div>

              {displayedPendingTasks.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs space-y-2">
                  <p>
                    {taskFilterOverdueOnly
                      ? "No overdue tasks found in this view."
                      : dashboardFilterQuery
                      ? `No tasks match "${dashboardFilterQuery}"`
                      : taskViewFilter === "MINE"
                      ? "No open tasks currently assigned to you."
                      : "No pending tasks found. All caught up!"}
                  </p>
                  {taskFilterOverdueOnly && (
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setTaskFilterOverdueOnly(false);
                          setTaskViewFilter("ALL");
                        }}
                        className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs transition cursor-pointer"
                      >
                        Show All Tasks
                      </button>
                      {(kpi?.tasksOverdueCount || 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setActiveKpiModal("tasksOverdue")}
                          className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-semibold text-xs border border-rose-200 transition cursor-pointer"
                        >
                          View {kpi.tasksOverdueCount} Overdue Tasks &rarr;
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                  {displayedPendingTasks.map((t: any) => {
                    const isOverdue = isTaskOverdue(t);
                    return (
                      <div
                        key={t.id}
                        className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                          isOverdue
                            ? "bg-rose-50/70 border-rose-300 hover:border-rose-400 shadow-2xs"
                            : "bg-slate-50/60 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setSelectedTimelineTask({
                                id: t.id,
                                title: t.title,
                                status: t.status || "TODO",
                                projectId: t.projectId || t.project?.id || null,
                              })}
                              className="text-xs sm:text-sm font-bold text-slate-900 hover:text-blue-600 hover:underline text-left cursor-pointer"
                            >
                              {t.title}
                            </button>
                            <span
                              className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 border ${
                                normalizePriority(t.priority) === "CRITICAL"
                                  ? "bg-rose-100 text-rose-800 border-rose-300"
                                  : normalizePriority(t.priority) === "GENERAL"
                                  ? "bg-sky-100 text-sky-800 border-sky-300"
                                  : "bg-amber-100 text-amber-800 border-amber-300"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  normalizePriority(t.priority) === "CRITICAL"
                                    ? "bg-rose-600"
                                    : normalizePriority(t.priority) === "GENERAL"
                                    ? "bg-sky-600"
                                    : "bg-amber-600"
                                }`}
                              />
                              <span>{formatPriorityLabel(t.priority)}</span>
                            </span>

                            {isOverdue && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-600 text-white uppercase tracking-wider inline-flex items-center gap-1 shadow-2xs animate-pulse">
                                <AlertTriangle className="w-3 h-3 text-white" />
                                <span>OVERDUE</span>
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                            <span>{t.project?.name || "General Work"}</span>
                            {t.dueAt && (
                              <span
                                className={
                                  isOverdue
                                    ? "text-rose-600 font-bold flex items-center gap-1"
                                    : "text-slate-500"
                                }
                              >
                                • Due: <strong className={isOverdue ? "text-rose-600 font-bold" : "text-slate-700"}>{formatDate(t.dueAt)}</strong> {isOverdue && <span className="text-rose-600 font-bold">(Past Due)</span>}
                              </span>
                            )}
                            {t.assignee?.name && (
                              <span className="text-slate-400">• {t.assignee.name}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={completingTaskId === t.id}
                              onClick={() => handleQuickCompleteTask(t.id, t.title)}
                              title="Mark task as completed"
                              className="px-3 py-1.5 bg-slate-900 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer group"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 group-hover:text-white transition-colors" />
                            <span>Complete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Requested Materials in All-In-One View */}
          {renderRequestedMaterialsSection(false)}
          </div>
        )}

        {/* FULL SITES VIEW */}
        {activeSectionTab === "SITES" && (
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>Active Sites Overview</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                      {displayedSites.length} Active {displayedSites.length === 1 ? "Location" : "Locations"}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Work progress and status for all active construction sites
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!activeSiteId ? (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 w-max flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>All Sites Unified</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSiteId("");
                      if (typeof window !== "undefined") {
                        localStorage.setItem("buildtrack_active_site", "");
                        document.cookie = "buildtrack_active_site=; path=/; max-age=31536000; SameSite=Lax";
                        window.dispatchEvent(new CustomEvent("siteChanged", { detail: { siteId: "" } }));
                      }
                    }}
                    className="text-amber-600 hover:text-amber-700 font-bold text-xs hover:underline flex items-center gap-1"
                  >
                    <span>← Show All Sites Overview</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggleSectionCollapse("sites")}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  title={collapsedSections.sites ? "Expand Sites Section" : "Collapse Sites Section"}
                >
                  <span>{collapsedSections.sites ? "Expand" : "Collapse"}</span>
                  {collapsedSections.sites ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {!collapsedSections.sites && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayedSites.map((site) => {
                  const siteProjs = projects.filter((p) => p.siteId === site.id);
                  const isSelected = activeSiteId === site.id;
                  const totalSiteBudget = siteProjs.reduce((sum, p) => sum + (p.budgetAmount || 0), 0);
                  const siteWorkers = workers.filter((w) => w.defaultSiteId === site.id);
                  const siteHeadcountList = (kpi?.workforceHeadcount?.records || []).filter(
                    (r: any) => r.siteId === site.id || r.siteName?.toLowerCase() === site.name?.toLowerCase()
                  );
                  const siteHeadcountSum = siteHeadcountList.reduce((s: number, r: any) => s + (r.grandTotal || 0), 0);
                  const siteWorkersPresent = (kpi?.workersPresentToday || []).filter((w: any) => w.siteName === site.name);
                  const siteOnSiteCount = siteHeadcountList.length > 0 ? siteHeadcountSum : siteWorkersPresent.length;

                  return (
                    <div
                      key={site.id}
                      className={`p-4 rounded-xl border transition-all flex flex-col justify-between min-w-0 overflow-hidden ${
                        isSelected
                          ? "bg-amber-50/50 border-amber-400 ring-2 ring-amber-300/70 shadow-sm"
                          : "bg-slate-50/60 hover:bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2 min-w-0">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm break-words min-w-0">{site.name}</span>
                              {site.code && (
                                <span className="text-[10px] font-mono font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap">
                                  {site.code}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 min-w-0">
                              <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                              <span className="truncate">{site.address || "Active Site"}</span>
                            </p>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase tracking-wider shrink-0 whitespace-nowrap">
                            {site.status}
                          </span>
                        </div>

                        {/* Site Statistics Bar */}
                        <div className="grid grid-cols-3 gap-2 py-2.5 my-2 border-y border-slate-200/60 text-center bg-white/70 rounded-lg">
                          <div>
                            <div className="text-[10px] text-slate-500 font-medium">Projects</div>
                            <div className="text-sm font-black text-slate-900">
                              {siteProjs.length || site._count?.projects || 0}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 font-medium">On-Site Today</div>
                            <div className="text-sm font-black text-emerald-600">
                              {siteOnSiteCount}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 font-medium" title="Monthly-salary staff &amp; permanent workers">
                              Permanent Staff
                            </div>
                            <div className="text-sm font-black text-slate-700">
                              {siteWorkers.length || site._count?.workforceMembers || 0}
                            </div>
                          </div>
                        </div>

                        {/* Breakdown clarification when on-site includes external subcontractor labor */}
                        {siteOnSiteCount > (siteWorkers.length || site._count?.workforceMembers || 0) && (() => {
                          const directCrew = siteWorkers.length || site._count?.workforceMembers || 0;
                          const externalGang = siteOnSiteCount - directCrew;
                          return (
                            <div className="text-[10px] bg-amber-50/90 border border-amber-200/70 px-2.5 py-1.5 rounded-md space-y-0.5 mb-2 shadow-2xs">
                              <div className="flex flex-wrap items-center justify-between gap-1">
                                <span className="text-slate-600 font-medium">Contract / Agency Workers:</span>
                                <span className="font-bold text-amber-900">
                                  +{externalGang} Contract Workers
                                </span>
                              </div>
                              <div className="text-[9.5px] text-amber-800 font-medium text-right">
                                ({directCrew} Permanent Staff + {externalGang} Contract = {siteOnSiteCount} On Site)
                              </div>
                            </div>
                          );
                        })()}

                        {/* Breakdown clarification when on-site is less than direct crew (e.g. absent workers) */}
                        {siteOnSiteCount < (siteWorkers.length || site._count?.workforceMembers || 0) && (() => {
                          const directCrew = siteWorkers.length || site._count?.workforceMembers || 0;
                          const absentCount = directCrew - siteOnSiteCount;
                          return (
                            <div className="text-[10px] bg-blue-50/90 border border-blue-200/70 px-2.5 py-1.5 rounded-md space-y-0.5 mb-2 shadow-2xs">
                              <div className="flex flex-wrap items-center justify-between gap-1">
                                <span className="text-slate-600 font-medium">Staff Absence:</span>
                                <span className="font-bold text-blue-900">
                                  -{absentCount} Staff Absent
                                </span>
                              </div>
                              <div className="text-[9.5px] text-blue-800 font-medium text-right">
                                ({directCrew} Permanent Staff - {absentCount} Absent = {siteOnSiteCount} On Site)
                              </div>
                            </div>
                          );
                        })()}

                        {/* Site Projects List */}
                        <div className="space-y-1.5 my-2">
                          <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between gap-2 flex-wrap">
                            <span>Active Projects:</span>
                            {totalSiteBudget > 0 && (
                              <span className="text-slate-500 font-mono text-[10px] font-semibold" title={formatCurrency(totalSiteBudget)}>
                                Budget: {formatCompactINR(totalSiteBudget)}
                              </span>
                            )}
                          </div>
                          {siteProjs.length === 0 ? (
                            <div className="text-[11px] text-slate-400 italic p-2 bg-white/60 rounded border border-slate-100">
                              No active projects logged for this site.
                            </div>
                          ) : (
                            <div className="max-h-36 overflow-y-auto overflow-x-hidden space-y-1.5 pr-1">
                              {siteProjs.map((p) => (
                                <Link
                                  key={p.id}
                                  href={`/projects/${p.id}`}
                                  className="flex items-center justify-between gap-2 text-xs bg-white p-2 rounded-lg border border-slate-200/80 hover:border-amber-400 transition-colors"
                                >
                                  <span className="font-semibold text-slate-800 truncate min-w-0 flex-1">{p.name}</span>
                                  <span className="font-display font-extrabold text-slate-900 tabular-nums text-xs shrink-0" title={formatCurrency(p.budgetAmount || 0)}>
                                    {formatCompactINR(p.budgetAmount || 0)}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Filter action button */}
                      <div className="pt-3 border-t border-slate-200/60 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            const nextId = isSelected ? "" : site.id;
                            setActiveSiteId(nextId);
                            if (typeof window !== "undefined") {
                              localStorage.setItem("buildtrack_active_site", nextId);
                              document.cookie = `buildtrack_active_site=${nextId}; path=/; max-age=31536000; SameSite=Lax`;
                              window.dispatchEvent(new CustomEvent("siteChanged", { detail: { siteId: nextId } }));
                            }
                          }}
                          className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                            isSelected
                              ? "bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-2xs"
                              : "bg-slate-900 text-white hover:bg-slate-800 shadow-2xs"
                          }`}
                        >
                          <span>{isSelected ? "✓ Filtering Active" : "Filter Dashboard to this Site →"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* FULL PROJECTS VIEW */}
        {activeSectionTab === "PROJECTS" && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-amber-500" />
                <h2 className="text-base font-bold text-slate-900">
                  {!activeSiteId
                    ? "All Active Sites & Projects"
                    : `Active Projects (${sites.find((s) => s.id === activeSiteId)?.name || "Selected Site"})`}
                </h2>
                <span className="text-xs bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full">
                  {displayedProjects.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/projects" className="text-xs font-semibold text-amber-600 hover:underline">
                  View All Projects &rarr;
                </Link>
                <button
                  type="button"
                  onClick={() => toggleSectionCollapse("projects")}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  title={collapsedSections.projects ? "Expand Projects" : "Collapse Projects"}
                >
                  <span>{collapsedSections.projects ? "Expand" : "Collapse"}</span>
                  {collapsedSections.projects ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {!collapsedSections.projects && (
              displayedProjects.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  {dashboardFilterQuery ? `No projects match "${dashboardFilterQuery}"` : "No active projects found."}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {displayedProjects.map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="p-3.5 rounded-lg border border-slate-100 hover:border-slate-300 hover:shadow-xs bg-slate-50/50 flex flex-col gap-2 transition block"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-slate-900 text-sm truncate">{p.name}</div>
                        <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded shrink-0">
                          {p.code}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex items-center justify-between gap-2">
                        <span className="truncate">Site: {p.site?.name || "Main Site"}</span>
                        <span className="font-semibold text-slate-700 tabular-nums shrink-0" title={formatCurrency(p.budgetAmount || 0)}>
                          Budget: {formatCompactINR(p.budgetAmount || 0)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                        <span>Tasks: {p._count?.tasks ?? 0}</span>
                        <span>Daily Reports: {p._count?.dailyReports ?? 0}</span>
                        <span className="ml-auto font-medium text-emerald-600">
                          ● {p.status}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {/* FULL TASKS VIEW */}
        {activeSectionTab === "TASKS" && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-blue-500" />
                <h2 className="text-base font-bold text-slate-900">
                  {!activeSiteId
                    ? "Pending Tasks"
                    : `Pending Tasks (${sites.find((s) => s.id === activeSiteId)?.name || "Selected Site"})`}
                </h2>
                <span className="text-xs bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full">
                  {displayedPendingTasks.length}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Feature 9: My Tasks vs All Tasks Toggle */}
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => setTaskViewFilter("ALL")}
                    className={`px-2 py-1 rounded-md font-semibold transition ${
                      taskViewFilter === "ALL"
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    All Tasks
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskViewFilter("MINE")}
                    className={`px-2 py-1 rounded-md font-semibold transition flex items-center gap-1 ${
                      taskViewFilter === "MINE"
                        ? "bg-white text-amber-600 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <span>My Tasks</span>
                    {myAssignedTasksCount > 0 && (
                      <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                        {myAssignedTasksCount}
                      </span>
                    )}
                  </button>
                </div>

                {(overdueTasksCount > 0 || taskFilterOverdueOnly) && (
                  <button
                    type="button"
                    onClick={() => setTaskFilterOverdueOnly(!taskFilterOverdueOnly)}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      taskFilterOverdueOnly
                        ? "bg-rose-600 text-white shadow-xs"
                        : "bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-300"
                    }`}
                    title="Click to toggle overdue tasks only"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{taskFilterOverdueOnly ? "✕ Clear Overdue Filter" : `${overdueTasksCount} Overdue`}</span>
                  </button>
                )}
                <Link href="/tasks" className="text-xs font-semibold text-amber-600 hover:underline">
                  Open Task Board &rarr;
                </Link>
                <button
                  type="button"
                  onClick={() => toggleSectionCollapse("tasks")}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  title={collapsedSections.tasks ? "Expand Tasks" : "Collapse Tasks"}
                >
                  <span>{collapsedSections.tasks ? "Expand" : "Collapse"}</span>
                  {collapsedSections.tasks ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {!collapsedSections.tasks && (
              displayedPendingTasks.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs space-y-2">
                  <p>
                    {taskFilterOverdueOnly
                      ? "No overdue tasks found in this view."
                      : dashboardFilterQuery
                      ? `No tasks match "${dashboardFilterQuery}"`
                      : taskViewFilter === "MINE"
                      ? "No open tasks currently assigned to you."
                      : "No pending tasks found. All caught up!"}
                  </p>
                  {taskFilterOverdueOnly && (
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setTaskFilterOverdueOnly(false);
                          setTaskViewFilter("ALL");
                        }}
                        className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-xs transition cursor-pointer"
                      >
                        Show All Tasks
                      </button>
                      {(kpi?.tasksOverdueCount || 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setActiveKpiModal("tasksOverdue")}
                          className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-semibold text-xs border border-rose-200 transition cursor-pointer"
                        >
                          View {kpi.tasksOverdueCount} Overdue Tasks &rarr;
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {displayedPendingTasks.map((t: any) => {
                    const isOverdue = isTaskOverdue(t);
                    return (
                      <div
                        key={t.id}
                        className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isOverdue
                            ? "bg-rose-50/70 border-rose-300 hover:border-rose-400 shadow-2xs"
                            : "bg-slate-50/60 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setSelectedTimelineTask({
                                id: t.id,
                                title: t.title,
                                status: t.status || "TODO",
                                projectId: t.projectId || t.project?.id || null,
                              })}
                              className="text-xs sm:text-sm font-bold text-slate-900 hover:text-blue-600 hover:underline text-left cursor-pointer"
                            >
                              {t.title}
                            </button>
                            <span
                              className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1 border ${
                                normalizePriority(t.priority) === "CRITICAL"
                                  ? "bg-rose-100 text-rose-800 border-rose-300"
                                  : normalizePriority(t.priority) === "GENERAL"
                                  ? "bg-sky-100 text-sky-800 border-sky-300"
                                  : "bg-amber-100 text-amber-800 border-amber-300"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  normalizePriority(t.priority) === "CRITICAL"
                                    ? "bg-rose-600"
                                    : normalizePriority(t.priority) === "GENERAL"
                                    ? "bg-sky-600"
                                    : "bg-amber-600"
                                }`}
                              />
                              <span>{formatPriorityLabel(t.priority)}</span>
                            </span>

                            {isOverdue && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-600 text-white uppercase tracking-wider inline-flex items-center gap-1 shadow-2xs animate-pulse">
                                <AlertTriangle className="w-3 h-3 text-white" />
                                <span>OVERDUE</span>
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2.5 flex-wrap">
                            <span>{t.project?.name || "General Work"}</span>
                            {t.dueAt && (
                              <span
                                className={
                                  isOverdue
                                    ? "text-rose-600 font-bold flex items-center gap-1"
                                    : "text-slate-500"
                                }
                              >
                                • Due: <strong className={isOverdue ? "text-rose-600 font-bold" : "text-slate-700"}>{formatDate(t.dueAt)}</strong> {isOverdue && <span className="text-rose-600 font-bold">(Past Due)</span>}
                              </span>
                            )}
                            {t.assignee?.name && (
                              <span className="text-slate-400">• Assigned to: {t.assignee.name}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={completingTaskId === t.id}
                              onClick={() => handleQuickCompleteTask(t.id, t.title)}
                              title="Mark task as completed"
                              className="px-3 py-1.5 bg-slate-900 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer group"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 group-hover:text-white transition-colors" />
                            <span>Complete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        )}

        {/* Recent Site Photographs & Quality Inspection Gallery */}
        {(activeSectionTab === "ALL" || activeSectionTab === "PHOTOS") && (
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Recent Site Photos & Quality Checks</h2>
                  <p className="text-xs text-slate-500">Live site photos and quality inspections clicked directly via camera by field staff</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {displayedPhotos.length > 0 && (
                  <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                    {displayedPhotos.length} Photos
                  </span>
                )}
                {isSupervisor && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={startLiveCamera}
                      disabled={uploadingPhoto}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg cursor-pointer transition shadow-xs disabled:opacity-50"
                      title="Open live camera viewfinder to click photo"
                    >
                      <Camera className="w-3.5 h-3.5 text-amber-400" />
                      <span>{uploadingPhoto ? "Saving..." : "Click Photo (Camera)"}</span>
                    </button>
                    <label
                      className="relative p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer transition"
                      title="Direct Device Native Camera App (Mobile)"
                    >
                      <Camera className="w-4 h-4 text-amber-600" />
                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*,video/*"
                        capture="environment"
                        onChange={handleDashboardPhotoUpload}
                        disabled={uploadingPhoto}
                        className="sr-only"
                      />
                    </label>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => toggleSectionCollapse("photos")}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  title={collapsedSections.photos ? "Expand Photos" : "Collapse Photos"}
                >
                  <span>{collapsedSections.photos ? "Expand" : "Collapse"}</span>
                  {collapsedSections.photos ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {photoError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{photoError}</span>
                </div>
                <button onClick={() => setPhotoError(null)} className="text-rose-600 hover:text-rose-800 p-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {photoMsg && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{photoMsg}</span>
                </div>
                <button onClick={() => setPhotoMsg(null)} className="text-emerald-600 hover:text-emerald-800 p-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {!collapsedSections.photos && (
              displayedPhotos.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <Camera className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <div className="font-bold text-slate-700">No site photographs uploaded yet</div>
                  <p className="mt-0.5 mb-3">
                    {isSupervisor
                      ? "Capture live site inspection photos, delivery receipts, and work progress directly using your device camera."
                      : "Site photographs will appear here once captured and uploaded by site supervisors in the field."}
                  </p>
                  {isSupervisor && (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={startLiveCamera}
                        disabled={uploadingPhoto}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl cursor-pointer transition shadow-xs"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Click Photo (Live Camera)</span>
                      </button>
                      <label className="relative inline-flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer transition shadow-xs">
                        <Camera className="w-3.5 h-3.5 text-amber-400" />
                        <span>Open Mobile Camera / Video</span>
                        <input
                          type="file"
                          accept="image/*,video/*"
                          capture="environment"
                          onChange={handleDashboardPhotoUpload}
                          disabled={uploadingPhoto}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {displayedPhotos.map((photo: any) => {
                    const isVid = /\.(mp4|webm|mov|3gp|avi)($|\?)/i.test(photo.url) || photo.mimeType?.startsWith("video/");
                    return (
                      <div
                        key={photo.id}
                        onClick={() => setSelectedPhoto(photo)}
                        className="group relative aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-200 shadow-xs hover:border-amber-400 transition cursor-pointer"
                      >
                        {isVid ? (
                          <div className="relative w-full h-full bg-slate-950 flex items-center justify-center">
                            <video
                              src={photo.url}
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                              muted
                              preload="metadata"
                            />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="w-9 h-9 rounded-full bg-slate-950/70 border border-white/30 flex items-center justify-center text-white shadow-lg">
                                <Play className="w-4 h-4 ml-0.5 fill-current" />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <img
                            src={photo.url}
                            alt={photo.fileName}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          />
                        )}

                        {/* Card Action Controls */}
                        <div className="absolute top-2 right-2 flex items-center gap-1 z-10 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity bg-black/65 backdrop-blur-sm p-1.5 rounded-xl">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPhoto(photo);
                            }}
                            className="p-1 text-slate-300 hover:text-amber-400 transition cursor-pointer"
                            title="View enlarged photo"
                            aria-label={`View enlarged photo ${photo.fileName}`}
                          >
                            <Search className="w-3.5 h-3.5" />
                          </button>
                          <a
                            href={photo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-slate-300 hover:text-amber-400 transition"
                            title="Open photo in new tab"
                            aria-label={`Open photo ${photo.fileName} in new tab`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          {(isSupervisor || isAdminUser) && (
                            <>
                              <label
                                onClick={(e) => e.stopPropagation()}
                                className="relative p-1.5 text-slate-300 hover:text-amber-400 cursor-pointer transition"
                                title="Re-click photo or video with camera"
                                aria-label={`Re-click photo with camera ${photo.fileName}`}
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <input
                                  type="file"
                                  accept="image/*,video/*"
                                  capture="environment"
                                  onChange={(e) => handleDashboardPhotoReplace(photo.id, e)}
                                  disabled={uploadingPhoto}
                                  className="sr-only"
                                />
                              </label>
                            <button
                              type="button"
                              onClick={(e) => handleDashboardPhotoDelete(photo.id, photo.fileName, e)}
                              className="p-1 text-slate-300 hover:text-rose-400 transition cursor-pointer"
                              title="Delete photo"
                              aria-label={`Delete photo ${photo.fileName}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>

                      <div
                        className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent p-2.5 flex flex-col justify-end text-white pointer-events-none"
                      >
                        <div className="text-[11px] font-bold truncate">{photo.fileName}</div>
                        <div className="text-[10px] text-slate-300 flex items-center justify-between mt-0.5">
                          <span>{photo.uploadedBy || "Site Team"}</span>
                          <span>{formatDate(photo.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}

      {/* FULL MATERIAL REQUESTS VIEW */}
      {activeSectionTab === "MATERIALS" && renderRequestedMaterialsSection(true)}

        {/* Modal: Confirm Dashboard Photo Delete */}
        {pendingDeletePhoto && (
          <div
            className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
            onClick={() => setPendingDeletePhoto(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto space-y-3 animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="font-bold text-slate-900 text-base">Delete Site Photo?</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to delete <strong className="text-slate-900">{pendingDeletePhoto.fileName}</strong>?
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPendingDeletePhoto(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingPhoto}
                  onClick={executeDashboardPhotoDelete}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg disabled:opacity-50"
                >
                  {deletingPhoto ? "Deleting..." : "Delete Photo"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Quick Task Creation */}
        {showQuickTaskModal && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in">
              <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-100 shrink-0 bg-white">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-amber-500" />
                  <span>Create Site Task</span>
                </div>
                <button
                  onClick={() => {
                    setShowQuickTaskModal(false);
                    resetQuickTaskForm();
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="quick-task-modal-form" onSubmit={(e) => handleQuickTaskSubmit(e, false)} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                {/* Success Notice if user created a task with 'Create & Add Another' */}
                {taskModalSuccessNotice && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900 font-semibold animate-in fade-in">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="truncate">{taskModalSuccessNotice}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTaskModalSuccessNotice(null)}
                      className="p-1 text-emerald-600 hover:text-emerald-800 rounded cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Target Project
                  </label>
                  <SearchableSelect
                    options={[
                      ...projects.map((p) => ({
                        value: p.id,
                        label: p.name,
                        badge: p.code || undefined,
                        subLabel: p.site?.name || sites.find((s) => s.id === p.siteId)?.name || undefined,
                      })),
                      {
                        value: "OTHER",
                        label: "Other / General Operations",
                        subLabel: projects.length === 0 ? "Default Site" : "Not site-specific",
                      },
                    ]}
                    value={quickProjectId || (projects.length > 0 ? projects[0].id : "OTHER")}
                    onChange={(val) => setQuickProjectId(val)}
                    searchPlaceholder="Search project by name or code..."
                  />
                  {projects.length === 0 ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      No project-specific site assigned. Task will be logged under General Site Operations.
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400">
                      Select specific project or choose &apos;Other / General Operations&apos; for unlinked tasks.
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 uppercase">
                      {isBulkTaskMode ? "Task Titles (Batch Mode)" : "Task Title"}
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsBulkTaskMode(!isBulkTaskMode)}
                      className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 cursor-pointer transition"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{isBulkTaskMode ? "Switch to Single Task" : "+ Add Multiple Tasks at once"}</span>
                    </button>
                  </div>

                  {!isBulkTaskMode ? (
                    <input
                      type="text"
                      required
                      placeholder="e.g. Tie rebar on 6th floor columns / Submit electrical drawings"
                      value={quickTitle}
                      onChange={(e) => setQuickTitle(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    />
                  ) : (
                    <div className="space-y-2">
                      {bulkTaskTitles.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-400 w-5 text-right shrink-0">{idx + 1}.</span>
                          <input
                            type="text"
                            required={idx === 0}
                            placeholder={idx === 0 ? "e.g. Tie rebar on 6th floor columns" : `Task ${idx + 1} title...`}
                            value={item}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBulkTaskTitles((prev) => {
                                const next = [...prev];
                                next[idx] = val;
                                return next;
                              });
                            }}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm"
                          />
                          {bulkTaskTitles.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setBulkTaskTitles((prev) => prev.filter((_, i) => i !== idx))}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer shrink-0"
                              title="Remove this task row"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setBulkTaskTitles((prev) => [...prev, ""])}
                        className="text-xs font-bold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add another task row</span>
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Description & Specifications
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Provide execution details, materials required, and safety instructions..."
                    value={quickDescription}
                    onChange={(e) => setQuickDescription(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Assign To Employee(s)
                    </label>
                    <SearchableMultiSelect
                      options={(Array.isArray(employees) ? employees : []).map((emp) => ({
                        value: emp.id,
                        label: emp.name,
                        badge: emp.role,
                      }))}
                      values={quickAssigneeIds}
                      onChange={setQuickAssigneeIds}
                      placeholder="Select one or more employees..."
                      searchPlaceholder="Search employee name or role..."
                      unassignedLabel="Unassigned / Current User"
                    />
                    {quickAssigneeIds.length > 1 && (
                      <p className="mt-1 text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>Assigns task to all {quickAssigneeIds.length} employees</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Priority
                    </label>
                    <SearchableSelect
                      options={TASK_PRIORITY_OPTIONS}
                      value={quickPriority}
                      onChange={(v) => setQuickPriority(v as any)}
                      placeholder="Select Priority..."
                      searchPlaceholder="Search priority..."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={quickDueAt}
                    onChange={(e) => setQuickDueAt(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                {/* Auto Reminder notification banner */}
                <div className="p-3 bg-amber-50/90 border border-amber-200/80 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{getAutoReminderMessage(quickPriority)}</span>
                    <p className="text-[11px] text-amber-800/80 mt-0.5">
                      Recurring notifications are automatically dispatched until the task is marked completed or verified.
                    </p>
                  </div>
                </div>

              </form>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickTaskModal(false);
                    resetQuickTaskForm();
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={submittingTask}
                    onClick={() => handleQuickTaskSubmit(undefined, true)}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-lg transition disabled:opacity-50 cursor-pointer shadow-2xs"
                    title="Creates this task and keeps project, assignees, and date pre-filled for your next task"
                  >
                    <span>Create & Add Another</span>
                  </button>
                  <button
                    type="submit"
                    form="quick-task-modal-form"
                    disabled={submittingTask}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 transition cursor-pointer"
                  >
                    {submittingTask
                      ? "Creating..."
                      : quickAssigneeIds.length > 1
                      ? `Create & Assign to ${quickAssigneeIds.length} Employees`
                      : isBulkTaskMode && bulkTaskTitles.filter(Boolean).length > 1
                      ? `Create ${bulkTaskTitles.filter(Boolean).length} Tasks`
                      : "Create Task"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Quick Material Request */}
        {showQuickMaterialModal && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in">
              <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-100 shrink-0 bg-white">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center font-bold">
                    <PackagePlus className="w-4 h-4" />
                  </div>
                  <span>Request Material for Site Work</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuickMaterialModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleQuickMaterialSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs">
                {quickMaterialError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{quickMaterialError}</span>
                  </div>
                )}

                {/* Project Selection & Needed By */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Project / Site *
                    </label>
                    <select
                      value={quickMaterialProjectId || (projects[0]?.id || "")}
                      onChange={(e) => setQuickMaterialProjectId(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                      required
                    >
                      <option value="">Select project...</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.code ? `(${p.code})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Needed by date (optional)
                    </label>
                    <input
                      type="date"
                      value={quickMaterialNeededBy}
                      onChange={(e) => setQuickMaterialNeededBy(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Assign Request To (Multiple People) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-amber-600" />
                      <span>Assign Request To (Multiple People)</span>
                    </label>
                    {quickMaterialAssignedUserIds.length > 0 && (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        {quickMaterialAssignedUserIds.length} {quickMaterialAssignedUserIds.length === 1 ? "person" : "people"} selected
                      </span>
                    )}
                  </div>
                  <SearchableMultiSelect
                    options={(Array.isArray(employees) ? employees : []).filter((emp: any) => emp && emp.id && emp.name).map((emp: any) => ({
                      value: emp.id,
                      label: emp.name,
                      badge: emp.role ? emp.role.replace(/_/g, " ") : undefined,
                    }))}
                    values={quickMaterialAssignedUserIds}
                    onChange={setQuickMaterialAssignedUserIds}
                    placeholder="Select project managers, storekeepers, or team members..."
                    searchPlaceholder="Search person by name or role..."
                    unassignedLabel="Unassigned (Default Project Reviewers)"
                  />
                </div>

                {/* Urgency */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-700">Urgency:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setQuickMaterialUrgent(false)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        !quickMaterialUrgent
                          ? "bg-slate-900 text-amber-400 shadow-xs"
                          : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      Normal
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickMaterialUrgent(true)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
                        quickMaterialUrgent
                          ? "bg-rose-600 text-white shadow-xs"
                          : "bg-white text-slate-600 border border-slate-200 hover:bg-rose-50 hover:text-rose-600"
                      }`}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      <span>Urgent (Site Blocking)</span>
                    </button>
                  </div>
                </div>

                {/* Materials List */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                      Required Material(s) *
                    </span>
                    <button
                      type="button"
                      onClick={addQuickMaterialItem}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-800 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Another Material</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {quickMaterialItems.map((it, idx) => {
                      const isCustom = it.materialId === "OTHER" || !it.materialId;
                      return (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <select
                                value={it.materialId}
                                onChange={(e) => updateQuickMaterialItem(idx, { materialId: e.target.value })}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                              >
                                <option value="">Select from catalog or custom...</option>
                                {materialCatalog.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name} ({m.unitCode || "NOS"})
                                  </option>
                                ))}
                                <option value="OTHER">Custom material (type name below)</option>
                              </select>
                            </div>
                            {quickMaterialItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeQuickMaterialItem(idx)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition shrink-0 cursor-pointer"
                                title="Remove item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {isCustom && (
                            <input
                              type="text"
                              value={it.description}
                              onChange={(e) => updateQuickMaterialItem(idx, { description: e.target.value })}
                              placeholder="e.g. Laminate sheet, 12mm binding wire, 2x1 timber..."
                              className="w-full px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50/40 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                              required
                            />
                          )}

                          <div>
                            <span className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                              Quantity *
                            </span>
                            <input
                              type="number"
                              min="0.01"
                              step="any"
                              value={it.quantity}
                              onChange={(e) => updateQuickMaterialItem(idx, { quantity: e.target.value })}
                              placeholder="e.g. 10"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                              required
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Work Notes */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Work Notes / Reason for requirement
                  </label>
                  <textarea
                    rows={2}
                    value={quickMaterialNotes}
                    onChange={(e) => setQuickMaterialNotes(e.target.value)}
                    placeholder="e.g. Needed for 2nd floor shuttering work at site"
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowQuickMaterialModal(false)}
                      className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <Link
                      href="/material-requests"
                      className="text-xs text-amber-600 hover:underline inline-flex items-center gap-1 font-semibold"
                    >
                      <span>Full Page</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>

                  <button
                    type="submit"
                    disabled={submittingQuickMaterial}
                    className="px-4 py-2 bg-gradient-brand text-slate-950 text-xs font-bold rounded-lg shadow-sm hover:brightness-105 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    {submittingQuickMaterial ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <PackagePlus className="w-3.5 h-3.5" />
                    )}
                    <span>Post Material Request</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: KPI Short Details */}
        {activeKpiModal && (() => {
          const modalData = renderKpiModalContent();
          if (!modalData) return null;
          return (
            <div
              className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
              onClick={() => setActiveKpiModal(null)}
            >
              <div
                className={`bg-white rounded-2xl ${
                  activeKpiModal === "workersPresentToday" ? "max-w-4xl lg:max-w-5xl" : "max-w-xl"
                } w-full max-h-[88dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200/60 shrink-0">
                      {modalData.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                          {modalData.title}
                        </h3>
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${modalData.badgeColor}`}>
                          {modalData.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {modalData.subtitle}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveKpiModal(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                    aria-label="Close modal"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Body / Items List */}
                <div className="p-5 flex-1 overflow-y-auto">
                  {modalData.content ? (
                    modalData.content
                  ) : (
                    <div className="py-12 px-4 text-center flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                        <CheckCircle2 className="w-6 h-6 text-slate-400" />
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{modalData.emptyTitle}</p>
                      <p className="text-xs text-slate-500 max-w-xs mt-1">{modalData.emptyDesc}</p>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveKpiModal(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/80 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                  <Link
                    href={modalData.actionUrl}
                    onClick={() => setActiveKpiModal(null)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <span>{modalData.actionLabel}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Task Details & Timeline Drawer Modal */}
        {selectedTimelineTask && (
          <TaskTimeline
            task={selectedTimelineTask}
            canWrite={canUser(activeUser, "tasks:write") || isAdminUser || isProjectManager}
            employees={employees}
            onClose={() => setSelectedTimelineTask(null)}
            onChanged={() => {
              loadDashboard(activeSiteId);
            }}
          />
        )}

        {/* Fullscreen Photo Lightbox Modal — viewable by Admin, Super Admin, and Supervisor */}
        {selectedPhoto && typeof document !== "undefined" && createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/85 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150"
            onClick={() => setSelectedPhoto(null)}
          >
            <div
              className="relative max-w-4xl w-full bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 overflow-hidden flex flex-col max-h-[92dvh] animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-5 py-3.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-3 text-white">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                    <Camera className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-white truncate">{selectedPhoto.fileName}</div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                      <span>Uploaded by: <strong className="text-slate-300">{selectedPhoto.uploadedBy || "Site Supervisor"}</strong></span>
                      <span>•</span>
                      <span>{formatDate(selectedPhoto.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={selectedPhoto.url}
                    download={selectedPhoto.fileName || "site-photo.jpg"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white font-medium transition"
                    title="Open full size / Download"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Open Full Size</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setSelectedPhoto(null)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                    aria-label="Close photo preview"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Media Display (Photo or Video) */}
              <div className="flex-1 overflow-auto p-2 sm:p-4 bg-black/90 flex items-center justify-center min-h-[220px] sm:min-h-[300px]">
                {/\.(mp4|webm|mov|3gp|avi)($|\?)/i.test(selectedPhoto.url) || selectedPhoto.mimeType?.startsWith("video/") ? (
                  <video
                    src={selectedPhoto.url}
                    controls
                    autoPlay
                    playsInline
                    className="max-h-[72dvh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
                  />
                ) : (
                  <img
                    src={selectedPhoto.url}
                    alt={selectedPhoto.fileName}
                    className="max-h-[72dvh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
                  />
                )}
              </div>

              {/* Optional Notes */}
              {selectedPhoto.notes && (
                <div className="px-5 py-2.5 bg-slate-950 border-t border-slate-800 text-xs text-slate-300">
                  <span className="font-semibold text-amber-400">Notes: </span>
                  {selectedPhoto.notes}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

        {/* Live Camera Viewfinder Modal for Site Supervisor */}
        {cameraModalOpen && typeof document !== "undefined" && createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 backdrop-blur-md overflow-y-auto animate-in fade-in duration-150"
            onClick={stopLiveCamera}
          >
            <div
              className="relative max-w-2xl w-full bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 overflow-hidden flex flex-col max-h-[92dvh] animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Camera Header */}
              <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3 text-white">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                  <div className="font-bold text-sm flex items-center gap-2">
                    <Camera className="w-4 h-4 text-amber-400" />
                    <span>Live Site Camera Viewfinder</span>
                  </div>
                  <span className="text-[10px] font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
                    Camera Only
                  </span>
                </div>
                <button
                  type="button"
                  onClick={stopLiveCamera}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                  aria-label="Close camera"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Viewfinder Video Area */}
              <div className="relative bg-black flex items-center justify-center min-h-[240px] sm:min-h-[400px] overflow-hidden">
                {cameraError ? (
                  <div className="p-6 text-center max-w-md space-y-3">
                    <Camera className="w-12 h-12 text-rose-400 mx-auto" />
                    <div className="text-white font-bold text-sm">Camera Permission / Access Error</div>
                    <p className="text-xs text-slate-400 leading-relaxed">{cameraError}</p>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          stopLiveCamera();
                          cameraInputRef.current?.click();
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Use Native Device Camera App</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover max-h-[55dvh]"
                    />

                    {/* Viewfinder Crosshair & Overlay */}
                    <div className="absolute inset-0 pointer-events-none border-2 border-white/20 m-4 rounded-xl flex items-center justify-center">
                      <div className="w-12 h-12 border border-white/40 rounded-full" />
                      <div className="absolute top-2 left-3 text-[10px] text-white/70 font-mono tracking-wider">
                        BOTHRA CMS · LIVE INSPECTION
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Camera Shutter Footer */}
              <div className="px-4 sm:px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))] sm:pb-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    stopLiveCamera();
                    cameraInputRef.current?.click();
                  }}
                  className="text-xs text-slate-400 hover:text-amber-400 font-semibold flex items-center gap-1.5 transition"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Switch to Phone Camera App</span>
                </button>

                {!cameraError && (
                  <button
                    type="button"
                    onClick={takeSnapshotAndUpload}
                    disabled={uploadingPhoto}
                    className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-brand text-slate-950 font-black text-sm rounded-full shadow-lg hover:brightness-110 active:scale-95 transition cursor-pointer"
                  >
                    <div className="w-3.5 h-3.5 rounded-full bg-slate-950" />
                    <span>{uploadingPhoto ? "Saving..." : "CLICK PHOTO"}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={stopLiveCamera}
                  className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white font-semibold transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </Shell>
  );
}
