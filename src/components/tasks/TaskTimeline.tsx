"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  GitCommitHorizontal,
  History,
  Loader2,
  MessageSquare,
  PackagePlus,
  Pencil,
  Plus,
  PlusCircle,
  Search,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { formatDateTime } from "@/lib/formatters";
import { PhotoPicker, PickedPhoto } from "@/components/ui/PhotoPicker";
import { submitOrQueue } from "@/lib/offline-queue";

interface FieldChange {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
}

interface Entry {
  id: string;
  hash: string;
  kind: "CREATED" | "STATUS" | "EDIT" | "UPDATE" | "COMMENT" | "PHOTOS";
  at: string;
  author: { id: string; name: string; role: string | null } | null;
  message: string;
  note?: string | null;
  changes: FieldChange[];
  photos: { url: string; name?: string; mimeType?: string; sizeBytes?: number }[];
  commentType?: string;
}

export function isPdfDocument(
  p: { url?: string; name?: string; mimeType?: string } | string | null | undefined
): boolean {
  if (!p) return false;
  const url = typeof p === "string" ? p : p.url || "";
  const name = typeof p === "string" ? "" : p.name || "";
  const mime = typeof p === "string" ? "" : p.mimeType || "";
  if (mime.toLowerCase() === "application/pdf") return true;
  const check = `${url} ${name}`.toLowerCase().split("?")[0].split("#")[0];
  return check.endsWith(".pdf") || check.includes(".pdf") || check.includes("application/pdf");
}

function formatBytes(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function TimelinePhotoThumb({
  photo,
  onOpen,
  onSwitchToPdf,
}: {
  photo: { url: string; name?: string; mimeType?: string; sizeBytes?: number };
  onOpen: () => void;
  onSwitchToPdf: () => void;
}) {
  const [loadError, setLoadError] = useState(false);

  if (loadError) {
    return (
      <button
        type="button"
        onClick={onSwitchToPdf}
        className="group flex flex-col items-center justify-center p-2 rounded-lg border border-rose-200 bg-rose-50/70 text-center aspect-square transition hover:bg-rose-100/70"
        title={photo.name || "Open document"}
      >
        <FileText className="h-5 w-5 text-rose-500 mb-1 group-hover:scale-110 transition-transform" />
        <span className="text-[10px] font-bold text-rose-800 truncate max-w-full leading-tight">
          {photo.name || "Document"}
        </span>
        <span className="text-[9px] font-semibold text-rose-600 mt-0.5">Click to view</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100 hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
      title={photo.name || "View photo"}
    >
      <img
        src={photo.url}
        alt={photo.name || "Task photo"}
        loading="lazy"
        onError={() => setLoadError(true)}
        className="h-full w-full object-cover transition group-hover:opacity-90 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <ExternalLink className="h-4 w-4 text-white drop-shadow" />
      </div>
    </button>
  );
}

const STATUS_LABEL: Record<string, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  VERIFIED: "Verified",
};

const STATUS_TONE: Record<string, string> = {
  TODO: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  BLOCKED: "bg-rose-100 text-rose-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  VERIFIED: "bg-indigo-100 text-indigo-800",
};

const KIND_STYLE: Record<Entry["kind"], { dot: string; icon: React.ElementType }> = {
  CREATED: { dot: "bg-slate-900 text-white", icon: PlusCircle },
  STATUS: { dot: "bg-blue-600 text-white", icon: ArrowRight },
  EDIT: { dot: "bg-violet-600 text-white", icon: Pencil },
  UPDATE: { dot: "bg-amber-500 text-slate-950", icon: GitCommitHorizontal },
  COMMENT: { dot: "bg-slate-200 text-slate-700", icon: MessageSquare },
  PHOTOS: { dot: "bg-emerald-600 text-white", icon: Camera },
};

const FILTERS: { id: string; label: string; kinds: Entry["kind"][] }[] = [
  { id: "all", label: "All", kinds: [] },
  { id: "photos", label: "Files & Photos", kinds: [] },
];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return formatDateTime(iso);
}

function initials(name?: string | null) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function showValue(change: FieldChange, value: string | null): string {
  if (value === null) return "—";
  if (change.field === "status") return STATUS_LABEL[value] || value;
  if (change.field === "dueAt" || change.field === "reminderAt") return formatDateTime(value);
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

interface TaskMember {
  id: string;
  name: string;
  email?: string;
  role: string;
  jobTitle?: string | null;
  isCurrentTaskAssignee?: boolean;
}

interface MaterialRequestLineItem {
  materialId: string;
  description: string;
  quantity: string;
  unitCode: string;
}

const COMMON_UNITS = [
  "BAG",
  "TONNE",
  "KG",
  "CFT",
  "CUM",
  "BRASS",
  "NOS",
  "PIECE",
  "BOX",
  "BUNDLE",
  "SHEET",
  "SQFT",
  "SQM",
  "RFT",
  "METER",
  "LITRE",
  "DRUM",
  "BUCKET",
  "TRUCK",
  "TROLLEY",
  "TRIP",
  "PACKET",
];

export function TaskMaterialRequestModal({
  taskId,
  taskTitle,
  initialProjectId,
  onClose,
  onSuccess,
}: {
  taskId: string;
  taskTitle: string;
  initialProjectId?: string | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [projects, setProjects] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [projectId, setProjectId] = useState<string>(initialProjectId || "");
  const [neededBy, setNeededBy] = useState<string>("");
  const [urgent, setUrgent] = useState(false);
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<MaterialRequestLineItem[]>([
    { materialId: "", description: "", quantity: "", unitCode: "NOS" },
  ]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/projects").then((r) => r.json()).catch(() => ({ success: false })),
      fetch("/api/materials").then((r) => r.json()).catch(() => ({ success: false })),
    ]).then(([projRes, matRes]) => {
      if (!active) return;
      const projs = projRes?.data?.projects || projRes?.data || [];
      const mats = matRes?.data?.materials || matRes?.data || [];
      const validProjs = Array.isArray(projs) ? projs : [];
      setProjects(validProjs);
      setMaterials(Array.isArray(mats) ? mats : []);
      if (validProjs.length > 0) {
        setProjectId((prev) => prev || initialProjectId || validProjs[0].id);
      }
      setLoadingInitial(false);
    });
    return () => {
      active = false;
    };
  }, [initialProjectId]);

  const updateItem = (index: number, patch: Partial<MaterialRequestLineItem>) => {
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        const updated = { ...it, ...patch };
        if (patch.materialId !== undefined) {
          if (patch.materialId && patch.materialId !== "OTHER") {
            const selectedMat = materials.find((m) => m.id === patch.materialId);
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

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { materialId: "", description: "", quantity: "", unitCode: "NOS" },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validItems = items.filter((it) => {
      const hasName = (it.materialId && it.materialId !== "OTHER") || it.description.trim().length > 0;
      const qty = parseFloat(it.quantity);
      return hasName && !isNaN(qty) && qty > 0;
    });

    if (validItems.length === 0) {
      setError("Please add at least one material with a quantity greater than 0.");
      return;
    }

    if (!projectId) {
      setError("Please select the project for this material request.");
      return;
    }

    setSubmitting(true);
    try {
      const payloadItems = validItems.map((it) => ({
        materialId: it.materialId && it.materialId !== "OTHER" ? it.materialId : null,
        description: it.materialId === "OTHER" || !it.materialId ? it.description.trim() : null,
        quantity: parseFloat(it.quantity),
        unitCode: (it.unitCode || "NOS").trim().toUpperCase(),
      }));

      const res = await submitOrQueue<any>({
        label: `Material request for "${taskTitle}"`,
        url: "/api/material-requests",
        body: {
          projectId,
          neededBy: neededBy || null,
          priority: urgent ? "URGENT" : "NORMAL",
          notes: `[Task: ${taskTitle}] ${notes || ""}`.trim(),
          items: payloadItems,
        },
      });

      // Post update to task timeline so everyone sees it in task history
      const summary = validItems
        .map((it) => {
          const matName =
            it.materialId && it.materialId !== "OTHER"
              ? materials.find((m) => m.id === it.materialId)?.name || it.description
              : it.description;
          return `${it.quantity} ${it.unitCode || "NOS"} ${matName}`;
        })
        .join(", ");

      const reqNum = res && "data" in res && (res.data as any)?.requestNumber ? ` (${(res.data as any).requestNumber})` : "";

      await fetch(`/api/tasks/${taskId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: `📦 Material Request Posted${reqNum} [${urgent ? "URGENT" : "Normal"}]:\n• ${summary.replace(/, /g, "\n• ")}${notes ? `\n\nNotes: ${notes}` : ""}`,
        }),
      }).catch((err) => console.error("Failed to post timeline update:", err));

      window.dispatchEvent(new CustomEvent("refreshNotifications"));
      onSuccess(`Material request${reqNum} posted successfully for this task!`);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to post material request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92dvh] animate-scale-in"
      >
        {/* Header */}
        <div className="p-4 bg-gradient-chrome text-white flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold shadow-sm">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold leading-tight">Request Material for Work</h3>
              <p className="text-[11px] text-slate-300 truncate max-w-xs">{taskTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-3.5 flex-1 text-xs">
          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Project & Needed By Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Project / Site *
              </label>
              {projects.length > 0 ? (
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                  required
                >
                  <option value="">Select project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.code ? `(${p.code})` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-xs text-slate-500 py-1.5">
                  {loadingInitial ? "Loading projects..." : "Current Project"}
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Needed by date (optional)
              </label>
              <input
                type="date"
                value={neededBy}
                onChange={(e) => setNeededBy(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"
              />
            </div>
          </div>

          {/* Priority radio */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-bold text-slate-700">Urgency:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setUrgent(false)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  !urgent
                    ? "bg-slate-900 text-amber-400 shadow-xs"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setUrgent(true)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
                  urgent
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
                onClick={addItem}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-800 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Another Material</span>
              </button>
            </div>

            <div className="space-y-2">
              {items.map((it, idx) => {
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
                          onChange={(e) => updateItem(idx, { materialId: e.target.value })}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                        >
                          <option value="">Select from catalogue or custom...</option>
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.unitCode || "NOS"})
                            </option>
                          ))}
                          <option value="OTHER">Custom material (type name below)</option>
                        </select>
                      </div>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
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
                        onChange={(e) => updateItem(idx, { description: e.target.value })}
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
                        onChange={(e) => updateItem(idx, { quantity: e.target.value })}
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

          {/* Notes / Work purpose */}
          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">
              Work Notes / Reason for requirement
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Carpenters need for 2nd floor shuttering work at Tilak Nagar site"
              className="w-full p-2.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-gradient-brand text-slate-950 text-xs font-bold rounded-lg shadow-sm hover:opacity-95 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PackagePlus className="w-3.5 h-3.5" />
            )}
            <span>Post Material Request</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export default function TaskTimeline({
  task,
  canWrite,
  employees = [],
  onClose,
  onChanged,
}: {
  task: { id: string; title: string; status: string; projectId?: string | null };
  canWrite: boolean;
  employees?: any[];
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [lightbox, setLightbox] = useState<{
    url: string;
    name?: string;
    isPdf?: boolean;
    mimeType?: string;
  } | null>(null);
  const [currentStatus, setCurrentStatus] = useState(task.status);

  // Members state
  const [members, setMembers] = useState<TaskMember[]>([]);
  const [availableEmployees, setAvailableEmployees] = useState<TaskMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null);
  const [memberFeedback, setMemberFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [note, setNote] = useState("");
  const [nextStatus, setNextStatus] = useState<string>("");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [posting, setPosting] = useState(false);
  const [taskProjectId, setTaskProjectId] = useState<string | null>(task.projectId || null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}/timeline`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Could not load history");
      setEntries(json.data.entries || []);
      if (json.data.task?.status) setCurrentStatus(json.data.task.status);
      if (json.data.task?.projectId) setTaskProjectId(json.data.task.projectId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [task.id]);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/members`);
      const json = await res.json();
      if (res.ok && json.success) {
        setMembers(json.data.members || []);
        if (Array.isArray(json.data.availableEmployees)) {
          setAvailableEmployees(json.data.availableEmployees);
        }
      }
    } catch (err) {
      console.error("Failed to load task members:", err);
    } finally {
      setMembersLoading(false);
    }
  }, [task.id]);

  useEffect(() => {
    load();
    loadMembers();
  }, [load, loadMembers]);

  const handleAddMember = async (userId: string) => {
    if (addingMemberId) return;
    setAddingMemberId(userId);
    setMemberFeedback(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || "Failed to add member to task");
      }
      setMemberFeedback({
        type: "success",
        text: json.data?.message || "Team member added to task successfully!",
      });
      await Promise.all([loadMembers(), load()]);
      onChanged?.();
      setTimeout(() => {
        setMemberFeedback(null);
      }, 4000);
    } catch (err: any) {
      setMemberFeedback({ type: "error", text: err.message || "Failed to add member" });
    } finally {
      setAddingMemberId(null);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") (lightbox ? setLightbox(null) : onClose());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, onClose]);

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note,
          status: nextStatus || undefined,
          photoUrls: photos.map((p) => p.url),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message || "Could not post the update");
      setEntries(json.data.entries || []);
      if (nextStatus) setCurrentStatus(nextStatus);
      setNote("");
      setNextStatus("");
      setPhotos([]);
      onChanged?.();
      window.dispatchEvent(new CustomEvent("refreshNotifications"));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPosting(false);
    }
  };

  const poolEmployees = availableEmployees.length > 0 ? availableEmployees : (employees || []);
  const assignedIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  const unassignedEmployees = useMemo(() => {
    const q = memberSearchQuery.toLowerCase().trim();
    return poolEmployees
      .filter((emp: any) => emp.id && !assignedIds.has(emp.id))
      .filter((emp: any) => {
        if (!q) return true;
        const name = (emp.name || "").toLowerCase();
        const role = (emp.role || "").toLowerCase().replace(/_/g, " ");
        const email = (emp.email || "").toLowerCase();
        return name.includes(q) || role.includes(q) || email.includes(q);
      });
  }, [poolEmployees, assignedIds, memberSearchQuery]);

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter);
    if (!f || f.id === "all") return entries;
    if (f.id === "photos") return entries.filter((e) => e.photos.length > 0);
    return entries.filter((e) => f.kinds.includes(e.kind));
  }, [entries, filter]);

  const photoCount = entries.reduce((n, e) => n + e.photos.length, 0);
  const totalPeopleCount = useMemo(() => {
    const ids = new Set<string>();
    entries.forEach((e) => {
      if (e.author?.id) ids.add(e.author.id);
    });
    members.forEach((m) => {
      if (m.id) ids.add(m.id);
    });
    return Math.max(ids.size, members.length);
  }, [entries, members]);

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/60 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-xl animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
        aria-label="Task history"
      >
        <header className="border-b border-slate-100 px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-600">
                <History className="h-3.5 w-3.5" /> Task history
              </div>
              <h2 className="mt-1 font-display text-lg font-bold leading-snug text-slate-900">{task.title}</h2>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[currentStatus] || STATUS_TONE.TODO}`}>
              {STATUS_LABEL[currentStatus] || currentStatus}
            </span>
            <span className="inline-flex items-center gap-1">
              <GitCommitHorizontal className="h-3.5 w-3.5" /> {entries.length} {entries.length === 1 ? "change" : "changes"}
            </span>
            <span>·</span>
            <span>
              {photoCount} {photoCount === 1 ? "file" : "files"}
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1 font-medium text-slate-700">
              <Users className="h-3 w-3 text-amber-600" />
              {totalPeopleCount} {totalPeopleCount === 1 ? "person" : "people"}
            </span>
          </div>
        </header>

        {/* Assigned Team Members Bar & Add Member Option */}
        <div className="border-b border-slate-200/80 bg-amber-50/40 px-5 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Users className="h-3.5 w-3.5 text-amber-600" />
              <span>Assigned Team Members ({members.length})</span>
            </div>
            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  setShowAddMember((prev) => !prev);
                  setMemberFeedback(null);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200/90 border border-amber-300/80 rounded-lg transition shadow-2xs cursor-pointer"
              >
                <UserPlus className="h-3.5 w-3.5 text-amber-700" />
                <span>{showAddMember ? "Close" : "+ Add Member"}</span>
              </button>
            )}
          </div>

          {/* Feedback toast / alert */}
          {memberFeedback && (
            <div
              className={`mt-2.5 p-2 rounded-lg text-xs font-medium flex items-center justify-between animate-fade-in ${
                memberFeedback.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              <div className="flex items-center gap-1.5">
                {memberFeedback.type === "success" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                )}
                <span>{memberFeedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setMemberFeedback(null)}
                className="text-slate-400 hover:text-slate-600 text-xs ml-2 cursor-pointer"
              >
                &times;
              </button>
            </div>
          )}

          {/* Member chips */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {membersLoading && members.length === 0 ? (
              <span className="text-xs text-slate-400 flex items-center gap-1 py-0.5">
                <Loader2 className="h-3 w-3 animate-spin text-amber-600" /> Loading members...
              </span>
            ) : members.length === 0 ? (
              <span className="text-xs text-slate-400 italic py-0.5">No team members assigned yet</span>
            ) : (
              members.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 shadow-2xs"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[9px] font-bold text-white shrink-0">
                    {initials(m.name)}
                  </span>
                  <span className="font-semibold text-slate-800">{m.name}</span>
                  {m.role && (
                    <span className="text-[9px] uppercase font-mono px-1 py-0.2 bg-amber-50 text-amber-800 border border-amber-200 rounded font-semibold">
                      {m.role.replace(/_/g, " ")}
                    </span>
                  )}
                </span>
              ))
            )}
          </div>

          {/* Add Member Dropdown Panel */}
          {showAddMember && (
            <div className="mt-2.5 rounded-xl border border-amber-300/80 bg-white p-3 shadow-lg ring-1 ring-black/5 animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <UserPlus className="h-3.5 w-3.5 text-amber-600" /> Assign Another Team Member
                </span>
                <span className="text-[10px] text-slate-400">Click a member to add</span>
              </div>

              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  placeholder="Search by name, role, or email..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                  autoFocus
                />
              </div>

              <div className="max-h-48 overflow-y-auto space-y-0.5 divide-y divide-slate-100">
                {unassignedEmployees.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-500">
                    {memberSearchQuery ? "No matching team members found." : "All available team members are already assigned to this task."}
                  </div>
                ) : (
                  unassignedEmployees.map((emp: any) => {
                    const isAdding = addingMemberId === emp.id;
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        disabled={Boolean(addingMemberId)}
                        onClick={() => handleAddMember(emp.id)}
                        className="w-full py-1.5 px-2 flex items-center justify-between rounded-lg hover:bg-amber-50 transition text-left group disabled:opacity-50 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white shrink-0 group-hover:bg-amber-600 transition-colors">
                            {initials(emp.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-amber-900">
                              {emp.name}
                            </p>
                            {emp.email && (
                              <p className="text-[10px] text-slate-400 truncate">{emp.email}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {emp.role && (
                            <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 bg-slate-100 group-hover:bg-amber-100 text-slate-600 group-hover:text-amber-800 rounded font-medium">
                              {emp.role.replace(/_/g, " ")}
                            </span>
                          )}
                          {isAdding ? (
                            <Loader2 className="h-3.5 w-3.5 text-amber-600 animate-spin" />
                          ) : (
                            <span className="text-[11px] font-bold text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity">
                              + Add
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {canWrite && (
            <form onSubmit={post} className="space-y-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
              <div className="text-xs font-bold text-slate-700">Post an update</div>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What was done? e.g. 3rd floor slab shuttering complete, 40% reinforcement tied"
                className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-semibold text-slate-500">Move to</span>
                {["IN_PROGRESS", "BLOCKED", "COMPLETED"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={s === currentStatus}
                    onClick={() => setNextStatus(nextStatus === s ? "" : s)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-40 ${
                      nextStatus === s ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PhotoPicker value={photos} onChange={setPhotos} entityType="TASK" entityId={task.id} projectId={taskProjectId} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-400">Admins and the person who assigned this task are notified.</p>
                <button
                  type="submit"
                  disabled={posting || (!note.trim() && photos.length === 0 && !nextStatus)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-brand px-3.5 py-2 text-xs font-bold text-slate-950 shadow-sm disabled:opacity-50"
                >
                  {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Post update
                </button>
              </div>
            </form>
          )}

          <div className="sticky top-0 z-10 flex gap-1.5 overflow-x-auto border-b border-slate-100 bg-white/90 px-5 py-2.5 backdrop-blur">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold transition ${
                  filter === f.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {error && <div className="mx-5 mt-4 rounded-lg bg-rose-50 p-3 text-xs font-medium text-rose-700">{error}</div>}

          {loading ? (
            <div className="space-y-4 p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-16 rounded-xl" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">Nothing here yet.</div>
          ) : (
            <ol className="relative px-5 py-5">
              <span className="absolute bottom-6 left-[37px] top-6 w-px bg-slate-200" aria-hidden />
              {visible.map((e) => {
                const style = KIND_STYLE[e.kind];
                const Icon = style.icon;
                return (
                  <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
                    <span className={`relative z-[1] mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${style.dot}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-600">
                          {initials(e.author?.name)}
                        </span>
                        <span className="text-xs font-bold text-slate-900">{e.author?.name || "System"}</span>
                        <span className="text-xs text-slate-600">{e.message.charAt(0).toLowerCase() + e.message.slice(1)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                        <code className="rounded bg-slate-100 px-1.5 py-px font-mono text-[10px] text-slate-500">{e.hash}</code>
                        <time dateTime={e.at} title={formatDateTime(e.at)}>
                          {relativeTime(e.at)}
                        </time>
                      </div>

                      {e.changes.length > 0 && (
                        <div className="mt-2 space-y-1 rounded-lg border border-slate-100 bg-slate-50/80 p-2 font-mono text-[11px]">
                          {e.changes.map((c) => (
                            <div key={c.field} className="flex flex-wrap items-center gap-1.5">
                              <span className="w-20 shrink-0 font-sans font-semibold text-slate-500">{c.label}</span>
                              <span className="rounded bg-rose-50 px-1.5 text-rose-700 line-through decoration-rose-300">{showValue(c, c.from)}</span>
                              <ArrowRight className="h-3 w-3 text-slate-400" />
                              <span className="rounded bg-emerald-50 px-1.5 text-emerald-700">{showValue(c, c.to)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {e.note && (
                        <p className="mt-2 whitespace-pre-wrap border-l-2 border-amber-300 pl-2.5 text-sm text-slate-700">{e.note}</p>
                      )}

                      {e.photos.length > 0 && (
                        <div className="mt-2.5 space-y-2">
                          {/* Dedicated PDF Documents */}
                          {e.photos
                            .filter((p) => isPdfDocument(p))
                            .map((p) => (
                              <div
                                key={p.url}
                                className="group flex items-center justify-between gap-3 p-2.5 rounded-xl border border-rose-200/90 bg-rose-50/50 hover:bg-rose-50/90 hover:border-rose-300 transition-all shadow-2xs"
                              >
                                <div
                                  onClick={() =>
                                    setLightbox({
                                      url: p.url,
                                      name: p.name || "document.pdf",
                                      isPdf: true,
                                      mimeType: p.mimeType,
                                    })
                                  }
                                  className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                                  title="Click to preview PDF"
                                >
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600 shadow-xs group-hover:bg-rose-600 group-hover:text-white transition-colors">
                                    <FileText className="h-5 w-5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="truncate text-xs font-bold text-slate-800 group-hover:text-rose-700 transition-colors">
                                        {p.name || "PDF Document"}
                                      </span>
                                      <span className="shrink-0 rounded bg-rose-200/80 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-800">
                                        PDF
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                      {p.sizeBytes ? <span>{formatBytes(p.sizeBytes)}</span> : <span>PDF document</span>}
                                      <span>·</span>
                                      <span className="text-rose-600 font-semibold group-hover:underline">Click to view</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLightbox({
                                        url: p.url,
                                        name: p.name || "document.pdf",
                                        isPdf: true,
                                        mimeType: p.mimeType,
                                      })
                                    }
                                    className="p-1.5 rounded-lg text-slate-600 hover:text-rose-700 hover:bg-rose-100/60 transition"
                                    title="Preview PDF"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </button>
                                  <a
                                    href={p.url}
                                    download={p.name || "document.pdf"}
                                    className="p-1.5 rounded-lg text-slate-600 hover:text-rose-700 hover:bg-rose-100/60 transition"
                                    title="Download PDF"
                                  >
                                    <Download className="h-4 w-4" />
                                  </a>
                                </div>
                              </div>
                            ))}

                          {/* Photos & Images Grid */}
                          {e.photos.filter((p) => !isPdfDocument(p)).length > 0 && (
                            <div className="grid grid-cols-3 gap-1.5">
                              {e.photos
                                .filter((p) => !isPdfDocument(p))
                                .map((p) => (
                                  <TimelinePhotoThumb
                                    key={p.url}
                                    photo={p}
                                    onOpen={() =>
                                      setLightbox({
                                        url: p.url,
                                        name: p.name,
                                        isPdf: false,
                                        mimeType: p.mimeType,
                                      })
                                    }
                                    onSwitchToPdf={() =>
                                      setLightbox({
                                        url: p.url,
                                        name: p.name || "document.pdf",
                                        isPdf: true,
                                        mimeType: "application/pdf",
                                      })
                                    }
                                  />
                                ))}
                            </div>
                          )}
                        </div>
                      )}

                      {e.kind === "STATUS" && e.changes[0]?.to === "VERIFIED" && (
                        <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>

      {/* Lightbox / PDF Viewer Modal */}
      {lightbox && lightbox.isPdf && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 sm:p-4 animate-fade-in"
          onClick={() => setLightbox(null)}
        >
          <div
            className="flex h-[92vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 bg-slate-50/90">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600 shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-xs sm:text-sm font-bold text-slate-900" title={lightbox.name || "PDF Document"}>
                    {lightbox.name || "PDF Document"}
                  </h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600">PDF Document</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={lightbox.url}
                  download={lightbox.name || "document.pdf"}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                  title="Download PDF"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </a>
                <a
                  href={lightbox.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-2.5 py-1.5 text-xs font-bold text-slate-950 shadow-2xs transition"
                  title="Open in new window"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Open Full</span>
                </a>
                <button
                  type="button"
                  onClick={() => setLightbox(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Embedded PDF viewer */}
            <div className="relative flex-1 bg-slate-100">
              <iframe
                src={`${lightbox.url}#toolbar=1&navpanes=0`}
                title={lightbox.name || "PDF Document"}
                className="h-full w-full border-0 bg-white"
              />
            </div>

            {/* Mobile / Fallback Helper Banner */}
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 flex items-center justify-between text-xs text-slate-500">
              <span className="text-[11px] truncate">
                Preview not loading on your device?
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={lightbox.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold text-amber-600 hover:underline inline-flex items-center gap-1"
                >
                  Open in Browser <ExternalLink className="h-3 w-3" />
                </a>
                <span className="text-slate-300">|</span>
                <a
                  href={lightbox.url}
                  download={lightbox.name || "document.pdf"}
                  className="text-[11px] font-bold text-rose-600 hover:underline inline-flex items-center gap-1"
                >
                  Save File <Download className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {lightbox && !lightbox.isPdf && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/90 p-4 overflow-y-auto cursor-pointer animate-fade-in"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightbox.url}
              alt={lightbox.name || "Task photo"}
              className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            />
            <div className="absolute right-3 top-3 flex items-center gap-2">
              <a
                href={lightbox.url}
                download={lightbox.name || "photo.jpg"}
                className="rounded-full bg-slate-900/80 p-2 text-white hover:bg-slate-900 transition shadow"
                title="Download photo"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="rounded-full bg-slate-900/80 p-2 text-white hover:bg-slate-900 transition shadow"
                aria-label="Close photo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
