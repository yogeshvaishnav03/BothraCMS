"use client";

import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContactActions } from "@/components/ui/ContactActions";
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useExcelTable, useTablePagination, ExcelColumnHeader, ExcelTableToolbar, ShowEntriesControl, TablePagination, ExcelColumn } from "@/components/ui/ExcelTable";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatCompactINR, formatCompactNumber, rupeesToPaise, paiseToRupees, formatFileSize } from "@/lib/formatters";
import {
  Building2,
  Plus,
  Search,
  X,
  Trash2,
  Edit2,
  History,
  HardHat,
  Truck,
  Filter,
  Landmark,
  Copy,
  Check,
  Eye,
  LayoutGrid,
  List,
  MapPin,
  Star,
  ShieldAlert,
  IndianRupee,
  Users,
  FileText,
  Paperclip,
  Upload,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Loader2,
  AlertCircle,
  ChevronDown,
  Percent,
} from "lucide-react";
import AuditHistoryModal from "@/components/audit/AuditHistoryModal";
import { canUser } from "@/lib/permissions";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import { cn } from "@/lib/cn";
import { uploadClientMedia } from "@/lib/upload-client";

type PartyType = "VENDOR" | "CONTRACTOR" | "BOTH";

export function parsePartyGst(notes: string | null | undefined): { gstRate: string; cgstRate: string; sgstRate: string } {
  if (!notes) return { gstRate: "18", cgstRate: "9", sgstRate: "9" };
  try {
    const parsed = JSON.parse(notes);
    if (typeof parsed === "object" && parsed !== null) {
      const g = parsed.gstRate !== undefined ? String(parsed.gstRate) : "18";
      const c = parsed.cgstRate !== undefined ? String(parsed.cgstRate) : String((parseFloat(g) || 0) / 2 || 9);
      const s = parsed.sgstRate !== undefined ? String(parsed.sgstRate) : String((parseFloat(g) || 0) / 2 || 9);
      return { gstRate: g, cgstRate: c, sgstRate: s };
    }
  } catch {
    const gMatch = notes.match(/GST:\s*(\d+(?:\.\d+)?)%/i);
    const cMatch = notes.match(/CGST:\s*(\d+(?:\.\d+)?)%/i);
    const sMatch = notes.match(/SGST:\s*(\d+(?:\.\d+)?)%/i);
    if (gMatch || cMatch || sMatch) {
      const g = gMatch ? gMatch[1] : "18";
      const c = cMatch ? cMatch[1] : String((parseFloat(g) || 0) / 2 || 9);
      const s = sMatch ? sMatch[1] : String((parseFloat(g) || 0) / 2 || 9);
      return { gstRate: g, cgstRate: c, sgstRate: s };
    }
  }
  return { gstRate: "18", cgstRate: "9", sgstRate: "9" };
}

const EMPTY_FORM = {
  name: "",
  partyType: "VENDOR" as PartyType,
  phone: "",
  whatsappNumber: "",
  whatsappGroupLink: "",
  email: "",
  contactPerson: "",
  address: "",
  city: "",
  category: "",
  rating: "",
  taxIdentifier: "",
  panNumber: "",
  gstRate: "18",
  cgstRate: "9",
  sgstRate: "9",
  contractValueRupees: "",
  liquidatedDamagesTerms: "",
  liquidatedDamagesPercent: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankIfsc: "",
  bankName: "",
  bankBranch: "",
  upiId: "",
  editReason: "",
};

interface PendingPartyDoc {
  key: string;
  file: File;
  category: string;
  label: string;
  previewUrl?: string;
}

const KYC_DOCUMENT_SLOTS = [
  {
    key: "AADHAAR",
    category: "AADHAAR",
    label: "Aadhaar Card",
    hint: "Govt Identity Proof (PDF / Scan)",
    badge: "Identity",
    badgeCls: "bg-blue-50 text-blue-700 ring-1 ring-blue-200/80",
  },
  {
    key: "PAN",
    category: "PAN",
    label: "PAN Card",
    hint: "Tax & TDS Proof (PDF / Scan)",
    badge: "Statutory",
    badgeCls: "bg-purple-50 text-purple-700 ring-1 ring-purple-200/80",
  },
  {
    key: "BANK_DETAILS",
    category: "BANK_DETAILS",
    label: "Bank Details",
    hint: "Cancelled Cheque / Passbook (PDF)",
    badge: "Payouts",
    badgeCls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80",
  },
  {
    key: "CONTRACT",
    category: "CONTRACT",
    label: "Contract / Agreement",
    hint: "Signed agreement between us (PDF)",
    badge: "Legal",
    badgeCls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/80",
  },
];

const CATEGORY_SUGGESTIONS = [
  "Cement",
  "Steel / TMT",
  "Sand & Aggregate",
  "Bricks & Blocks",
  "Ready Mix Concrete",
  "Electrical",
  "Plumbing",
  "Tiles & Flooring",
  "Paint",
  "Hardware",
  "RCC work",
  "Masonry",
  "Shuttering",
  "Labour supply",
  "Waterproofing",
  "Machinery hire",
];

const TYPE_STYLE: Record<string, { label: string; avatar: string; chip: string }> = {
  VENDOR: { label: "Vendor", avatar: "from-sky-500 to-blue-600", chip: "bg-sky-50 text-sky-700 ring-sky-200" },
  CONTRACTOR: { label: "Contractor", avatar: "from-violet-500 to-purple-600", chip: "bg-violet-50 text-violet-700 ring-violet-200" },
  BOTH: { label: "Vendor + Contractor", avatar: "from-emerald-500 to-teal-600", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /[A-Za-z]/.test(w[0] || ""))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard not available */
        }
      }}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold ring-1 transition",
        copied ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
      )}
      aria-label={`Copy ${label || "value"}`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : label || "Copy"}
    </button>
  );
}

/** Full bank details, fetched on demand (finance roles only, audited server-side). */
function BankDetailsModal({ party, onClose }: { party: any; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/parties/${party.id}/bank`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => (res.success ? setData(res.data) : setError(res.error?.message || "Could not load bank details")))
      .catch(() => setError("Could not load bank details"));
  }, [party.id]);

  const rows: [string, string | null | undefined][] = data
    ? [
        ["Account holder", data.bankAccountName],
        ["Account number", data.bankAccountNumber],
        ["IFSC", data.bankIfsc],
        ["Bank", data.bankName],
        ["Branch", data.bankBranch],
        ["UPI ID", data.upiId],
        ["PAN", data.panNumber],
      ]
    : [];
  const allText = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-3xl max-w-md w-full shadow-xl ring-1 ring-slate-200 max-h-[90dvh] overflow-y-auto animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-chrome text-white p-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-amber-300 font-semibold flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5" /> Bank details
            </div>
            <div className="font-display text-lg font-bold mt-1 truncate">{party.name}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-2">
          {error && <Alert tone="error">{error}</Alert>}
          {!data && !error && (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-10" />
              ))}
            </div>
          )}
          {data &&
            rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-500">{k}</div>
                  <div className={cn("text-sm font-semibold text-slate-900 truncate", (k === "Account number" || k === "IFSC") && "font-mono tracking-wide")}>
                    {v || <span className="text-slate-400 font-normal">Not added</span>}
                  </div>
                </div>
                {v && <CopyButton value={v} />}
              </div>
            ))}
          {data && (
            <div className="pt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" /> Bank details views are saved to Change History for security.
              </p>
              {allText && <CopyButton value={allText} label="Copy all" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PartiesPage() {
  const { refreshUser } = useAppSession();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const canReadFinance = canUser(currentUser, "finance:read");
  const canWriteFinance = canUser(currentUser, "finance:write");
  const [parties, setParties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [typeFilter, setTypeFilter] = useState<"ALL" | "VENDOR" | "CONTRACTOR">("ALL");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [onlyOutstanding, setOnlyOutstanding] = useState(false);
  const [onlyMissingBank, setOnlyMissingBank] = useState(false);
  const [sortBy, setSortBy] = useState<"recent" | "name" | "outstanding" | "rating">("recent");
  const [view, setView] = useState<"cards" | "table">("cards");

  // Register / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [hadAccountOnFile, setHadAccountOnFile] = useState<string | null>(null);
  const isEditing = Boolean(editingPartyId);
  const setField = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleGstRateChange = (rateVal: string) => {
    const num = parseFloat(rateVal) || 0;
    const half = (num / 2).toString();
    setForm((prev) => ({
      ...prev,
      gstRate: rateVal,
      cgstRate: rateVal ? half : "",
      sgstRate: rateVal ? half : "",
    }));
  };

  const handleCgstRateChange = (cgstVal: string) => {
    setForm((prev) => {
      const c = parseFloat(cgstVal) || 0;
      const s = parseFloat(prev.sgstRate) || 0;
      return {
        ...prev,
        cgstRate: cgstVal,
        gstRate: (c + s).toString(),
      };
    });
  };

  const handleSgstRateChange = (sgstVal: string) => {
    setForm((prev) => {
      const s = parseFloat(sgstVal) || 0;
      const c = parseFloat(prev.cgstRate) || 0;
      return {
        ...prev,
        sgstRate: sgstVal,
        gstRate: (c + s).toString(),
      };
    });
  };

  // Custom Category / Trade management
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryText, setNewCategoryText] = useState("");
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // Close category dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCategoryDropdownOpen(false);
      }
    };
    if (isCategoryDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isCategoryDropdownOpen]);

  const selectedCategories: string[] = useMemo(() => {
    if (!form.category) return [];
    return form.category
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  }, [form.category]);

  const toggleCategory = (cat: string) => {
    const current = (form.category || "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const exists = current.some((c) => c.toLowerCase() === cat.toLowerCase());
    let next: string[];
    if (exists) {
      next = current.filter((c) => c.toLowerCase() !== cat.toLowerCase());
    } else {
      next = [...current, cat];
    }
    setForm((f) => ({ ...f, category: next.join(", ") }));
  };

  const removeCategory = (catToRemove: string) => {
    const current = (form.category || "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const next = current.filter((c) => c.toLowerCase() !== catToRemove.toLowerCase());
    setForm((f) => ({ ...f, category: next.join(", ") }));
  };

  const handleAddCategorySubmit = () => {
    const trimmed = newCategoryText.trim();
    if (!trimmed) return;
    setCustomCategories((prev) => Array.from(new Set([trimmed, ...prev])));
    const current = (form.category || "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    if (!current.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      current.push(trimmed);
    }
    setForm((f) => ({ ...f, category: current.join(", ") }));
    setIsAddingCategory(false);
    setNewCategoryText("");
  };

  const [auditParty, setAuditParty] = useState<{ id: string; name: string } | null>(null);
  const [bankParty, setBankParty] = useState<any>(null);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDeleteParty, setPendingDeleteParty] = useState<{ id: string; name: string } | null>(null);

  // KYC & Contract PDF Documents
  const [pendingDocs, setPendingDocs] = useState<PendingPartyDoc[]>([]);
  const [existingPartyDocs, setExistingPartyDocs] = useState<any[]>([]);
  const [loadingPartyDocs, setLoadingPartyDocs] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState<string | null>(null);

  // Non-blocking background upload status
  interface BackgroundUploadState {
    id: string;
    partyName: string;
    total: number;
    completed: number;
    failed: number;
    status: "uploading" | "done" | "error";
    errorDetails?: string[];
  }
  const [bgUpload, setBgUpload] = useState<BackgroundUploadState | null>(null);

  // Prevent accidental navigation while background upload is active
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (bgUpload?.status === "uploading") {
        e.preventDefault();
        e.returnValue = "Documents are still uploading in the background. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [bgUpload]);

  const startBackgroundUpload = (partyId: string, partyName: string, docs: PendingPartyDoc[]) => {
    const total = docs.length;
    let completedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    setBgUpload({
      id: partyId,
      partyName,
      total,
      completed: 0,
      failed: 0,
      status: "uploading",
    });

    setStatusMessage(`Added "${partyName}"! Uploading ${total} document(s) in background...`);

    Promise.allSettled(
      docs.map(async (doc) => {
        try {
          await uploadClientMedia(doc.file, {
            entityType: "PARTY",
            entityId: partyId,
            category: doc.category,
            createAttachment: true,
          });
          completedCount++;
        } catch (err: any) {
          failedCount++;
          errors.push(doc.label || doc.file.name);
          console.error(`Failed to upload ${doc.label}:`, err);
        } finally {
          setBgUpload((prev) =>
            prev && prev.id === partyId
              ? {
                  ...prev,
                  completed: completedCount,
                  failed: failedCount,
                }
              : prev
          );
        }
      })
    ).then(() => {
      if (failedCount === 0) {
        setBgUpload({
          id: partyId,
          partyName,
          total,
          completed: total,
          failed: 0,
          status: "done",
        });
        setStatusMessage(`✅ All ${total} KYC document(s) for "${partyName}" uploaded successfully!`);
        setTimeout(() => {
          setBgUpload((curr) => (curr?.status === "done" && curr.id === partyId ? null : curr));
        }, 5000);
      } else {
        setBgUpload({
          id: partyId,
          partyName,
          total,
          completed: completedCount,
          failed: failedCount,
          status: "error",
          errorDetails: errors,
        });
        setErrorMessage(
          `Uploaded ${completedCount} of ${total} documents for "${partyName}". ${failedCount} failed (${errors.join(", ")}). You can re-upload them by editing the vendor.`
        );
      }
      loadParties();
    });
  };

  const handleDocFileSelect = async (key: string, category: string, label: string, file: File) => {
    let processedFile = file;
    if (file.type.startsWith("image/") && !file.type.includes("svg")) {
      try {
        const { compressImageFile } = await import("@/lib/image-compression");
        processedFile = await compressImageFile(file, { preset: "document", fileName: file.name });
      } catch (err) {
        console.warn("Client image compression fallback:", err);
      }
    }
    const previewUrl = URL.createObjectURL(processedFile);
    setPendingDocs((prev) => [
      ...prev.filter((d) => d.key !== key),
      { key, file: processedFile, category, label, previewUrl },
    ]);
  };

  const handleRemovePendingDoc = (key: string) => {
    setPendingDocs((prev) => prev.filter((d) => d.key !== key));
  };

  const handleDeleteExistingDoc = async (attachmentId: string) => {
    try {
      const res = await fetch(`/api/attachments/${attachmentId}`, { method: "DELETE" });
      if (res.ok) {
        setExistingPartyDocs((prev) => prev.filter((d) => d.id !== attachmentId));
      }
    } catch (err) {
      console.error("Failed to delete attachment:", err);
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem("bothra_parties_view");
      if (saved === "cards" || saved === "table") setView(saved);
    } catch {}
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowModal(false);
        setBankParty(null);
        setAuditParty(null);
        setPendingDeleteParty(null);
      }
    };
    if (showModal || bankParty || auditParty || pendingDeleteParty) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [showModal, bankParty, auditParty, pendingDeleteParty]);
  const changeView = (v: "cards" | "table") => {
    setView(v);
    try {
      localStorage.setItem("bothra_parties_view", v);
    } catch {}
  };

  const loadParties = () => {
    setLoading(true);
    fetch(`/api/parties?type=ALL&_t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setParties(res.data || []);
      })
      .catch((err) => {
        console.error("Authoritative parties load failed:", err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refreshUser().then((u) => {
      if (u) setCurrentUser(u);
    });
    loadParties();
  }, [refreshUser]);

  const handleOpenCreate = () => {
    setEditingPartyId(null);
    setHadAccountOnFile(null);
    setPendingDocs([]);
    setExistingPartyDocs([]);
    setUploadProgressMsg(null);
    setIsAddingCategory(false);
    setNewCategoryText("");
    setIsCategoryDropdownOpen(false);
    setCategorySearch("");
    setForm({ ...EMPTY_FORM, partyType: typeFilter === "CONTRACTOR" ? "CONTRACTOR" : "VENDOR" });
    setShowModal(true);
  };

  const handleOpenEdit = async (p: any) => {
    setEditingPartyId(p.id);
    setHadAccountOnFile(p.bankAccountMasked || null);
    setPendingDocs([]);
    setExistingPartyDocs([]);
    setUploadProgressMsg(null);
    setIsAddingCategory(false);
    setNewCategoryText("");
    setIsCategoryDropdownOpen(false);
    setCategorySearch("");
    setForm({
      ...EMPTY_FORM,
      name: p.name,
      partyType: p.partyType,
      phone: p.phone || "",
      whatsappNumber: p.whatsappNumber || "",
      whatsappGroupLink: p.whatsappGroupLink || "",
      email: p.email || "",
      contactPerson: p.contactPerson || "",
      address: p.address || "",
      city: p.city || "",
      category: p.category || "",
      rating: p.rating ? String(p.rating) : "",
      taxIdentifier: p.taxIdentifier || "",
      panNumber: p.panNumber || "",
      gstRate: parsePartyGst(p.notes).gstRate,
      cgstRate: parsePartyGst(p.notes).cgstRate,
      sgstRate: parsePartyGst(p.notes).sgstRate,
      contractValueRupees: p.contractValue ? paiseToRupees(p.contractValue).toString() : "",
      liquidatedDamagesTerms: p.liquidatedDamagesTerms || "",
      liquidatedDamagesPercent: p.liquidatedDamagesPercent ? String(p.liquidatedDamagesPercent) : "",
      bankAccountName: p.bankAccountName || "",
      bankAccountNumber: "", // never pre-filled; leave empty to keep the number on file
      bankIfsc: p.bankIfsc || "",
      bankName: p.bankName || "",
      bankBranch: p.bankBranch || "",
      upiId: p.upiId || "",
    });
    setShowModal(true);

    // Fetch existing documents for this vendor / contractor
    try {
      setLoadingPartyDocs(true);
      const res = await fetch(`/api/attachments?entityType=PARTY&entityId=${p.id}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setExistingPartyDocs(data.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingPartyDocs(false);
    }
  };

  const handleDeleteParty = (id: string, partyName: string) => {
    setPendingDeleteParty({ id, name: partyName });
  };

  const executeDeleteParty = async () => {
    if (!pendingDeleteParty) return;
    const { id, name: partyName } = pendingDeleteParty;
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/parties?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not remove this vendor or contractor. Please try again.");
        setPendingDeleteParty(null);
        return;
      }
      setStatusMessage(`Removed "${partyName}".`);
      setParties((prev) => prev.filter((p) => p.id !== id));
      setPendingDeleteParty(null);
      loadParties();
    } catch (err: any) {
      setErrorMessage(`Connection error: ${err.message || "Could not remove this vendor or contractor. Check your internet and try again."}`);
      setPendingDeleteParty(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    const contractPaise =
      form.contractValueRupees && !isNaN(parseFloat(form.contractValueRupees))
        ? rupeesToPaise(parseFloat(form.contractValueRupees))
        : 0;

    const gstPayload = {
      gstRate: form.gstRate ? parseFloat(form.gstRate) : 0,
      cgstRate: form.cgstRate ? parseFloat(form.cgstRate) : 0,
      sgstRate: form.sgstRate ? parseFloat(form.sgstRate) : 0,
    };

    const payload: Record<string, unknown> = {
      name: form.name,
      partyType: form.partyType,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      taxIdentifier: form.taxIdentifier || null,
      contractValue: contractPaise,
      liquidatedDamagesTerms: form.liquidatedDamagesTerms || null,
      liquidatedDamagesPercent: form.liquidatedDamagesPercent ? parseFloat(form.liquidatedDamagesPercent) : null,
      contactPerson: form.contactPerson,
      whatsappNumber: form.whatsappNumber,
      whatsappGroupLink: form.whatsappGroupLink.trim(),
      city: form.city,
      category: form.category,
      rating: form.rating ? Number(form.rating) : null,
      panNumber: form.panNumber,
      tdsSection: "NONE",
      notes: JSON.stringify(gstPayload),
      bankAccountName: form.bankAccountName,
      bankIfsc: form.bankIfsc,
      bankName: form.bankName,
      bankBranch: form.bankBranch,
      upiId: form.upiId,
    };
    // An empty account number on edit keeps the number already on file.
    if (form.bankAccountNumber || !isEditing) payload.bankAccountNumber = form.bankAccountNumber;

    try {
      if (isEditing && editingPartyId) {
        payload.reason = form.editReason || undefined;
        const res = await fetch(`/api/parties/${editingPartyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setErrorMessage(data.error?.message || "Could not save changes. Please check the form and try again.");
          setSubmitting(false);
          return;
        }

        const partyName = form.name;
        const partyId = editingPartyId;
        const docsToUpload = [...pendingDocs];

        // 1. Dismiss modal instantly so the user is NEVER held hostage or blocked
        setShowModal(false);
        setSubmitting(false);
        setPendingDocs([]);
        loadParties();

        // 2. Upload any documents in the background without blocking the UI
        if (docsToUpload.length > 0) {
          startBackgroundUpload(partyId, partyName, docsToUpload);
        } else {
          setStatusMessage(`Saved changes for "${partyName}".`);
        }
      } else {
        // POST treats null as "not provided"; send undefined instead.
        const createBody = Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, v === null || v === "" ? undefined : v]));
        const res = await fetch("/api/parties", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createBody),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setErrorMessage(data.error?.message || "Could not add vendor or contractor. Please check the form and try again.");
          setSubmitting(false);
          return;
        }

        const createdPartyId = data.data?.id;
        const partyName = form.name;
        const docsToUpload = [...pendingDocs];

        // 1. Dismiss modal instantly and refresh vendor list in <0.3s!
        setShowModal(false);
        setSubmitting(false);
        setPendingDocs([]);
        loadParties();

        // 2. Upload KYC documents in the background with non-blocking progress indicator
        if (createdPartyId && docsToUpload.length > 0) {
          startBackgroundUpload(createdPartyId, partyName, docsToUpload);
        } else {
          setStatusMessage(`Vendor or contractor "${partyName}" added successfully!`);
        }
      }
    } catch {
      setErrorMessage("Connection error. Check your internet connection and try again.");
    } finally {
      setSubmitting(false);
      setUploadProgressMsg(null);
    }
  };

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          parties.flatMap((p) =>
            p.category ? p.category.split(",").map((c: string) => c.trim()) : []
          ).filter(Boolean)
        )
      ).sort() as string[],
    [parties]
  );

  const allCategoryOptions = useMemo(() => {
    return Array.from(
      new Set([
        ...customCategories,
        ...CATEGORY_SUGGESTIONS,
        ...categories,
        ...selectedCategories,
      ])
    ).filter(Boolean);
  }, [customCategories, categories, selectedCategories]);

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return allCategoryOptions;
    return allCategoryOptions.filter((cat) => cat.toLowerCase().includes(q));
  }, [allCategoryOptions, categorySearch]);

  const cities = useMemo(
    () => Array.from(new Set(parties.map((p) => p.city).filter(Boolean))).sort() as string[],
    [parties]
  );

  const filteredParties = useMemo(() => {
    const list = parties.filter((p) => {
      if (typeFilter !== "ALL" && p.partyType !== typeFilter && p.partyType !== "BOTH") return false;
      if (categoryFilter) {
        const partyCats = (p.category || "")
          .split(",")
          .map((c: string) => c.trim().toLowerCase());
        if (!partyCats.includes(categoryFilter.toLowerCase())) return false;
      }
      if (cityFilter && p.city !== cityFilter) return false;
      if (onlyOutstanding && !((p.outstandingBalance || 0) > 0)) return false;
      if (onlyMissingBank && p.hasBankDetails) return false;
      return true;
    });
    return list.sort((a, b) => {
      if (sortBy === "recent") {
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        return tb - ta;
      }
      if (sortBy === "outstanding") return (b.outstandingBalance || 0) - (a.outstandingBalance || 0);
      if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
      return a.name.localeCompare(b.name);
    });
  }, [parties, typeFilter, categoryFilter, cityFilter, onlyOutstanding, onlyMissingBank, sortBy]);

  const partyColumns: ExcelColumn<any>[] = useMemo(
    () => [
      { key: "name", label: "Vendor / Contractor", accessor: (p) => p.name, type: "text" },
      { key: "partyType", label: "Type", accessor: (p) => p.partyType, type: "text" },
      { key: "category", label: "Category", accessor: (p) => p.category || "—", type: "text" },
      { key: "city", label: "City", accessor: (p) => p.city || "—", type: "text" },
      { key: "contact", label: "Contact", accessor: (p) => `${p.phone || ""} ${p.email || ""}`.trim() || "—", type: "text" },
      {
        key: "bank",
        label: "Bank",
        accessor: (p) => (p.hasBankDetails ? `${p.bankName || "UPI"} ${p.bankAccountMasked || p.upiId || ""} ${p.bankIfsc || ""}` : "Missing"),
        type: "text",
      },
      ...(canReadFinance
        ? [
            { key: "totalBilled", label: "Total Billed", accessor: (p: any) => (Number(p.totalBilled) || 0) / 100, type: "currency" as const, align: "right" as const },
            { key: "totalPaid", label: "Total Paid", accessor: (p: any) => (Number(p.totalPaid) || 0) / 100, type: "currency" as const, align: "right" as const },
            { key: "totalDamagesDeducted", label: "Damages Deducted", accessor: (p: any) => (Number(p.totalDamagesDeducted) || 0) / 100, type: "currency" as const, align: "right" as const },
            { key: "outstandingBalance", label: "Net Due", accessor: (p: any) => (Number(p.outstandingBalance) || 0) / 100, type: "currency" as const, align: "right" as const },
          ]
        : []),
    ],
    [canReadFinance]
  );

  const excelParties = useExcelTable({ data: filteredParties, columns: partyColumns });

  const cardsPagination = useTablePagination(excelParties.filteredData);

  const stats = useMemo(() => {
    const vendors = parties.filter((p) => p.partyType === "VENDOR" || p.partyType === "BOTH").length;
    const contractors = parties.filter((p) => p.partyType === "CONTRACTOR" || p.partyType === "BOTH").length;
    const outstanding = parties.reduce((s, p) => s + Math.max(0, p.outstandingBalance || 0), 0);
    const missingBank = parties.filter((p) => !p.hasBankDetails).length;
    const totalDamages = parties.reduce((s, p) => s + (p.totalDamagesDeducted || 0), 0);
    return { vendors, contractors, outstanding, missingBank, totalDamages };
  }, [parties]);

  const filtersActive = Boolean(excelParties.globalSearch || categoryFilter || cityFilter || onlyOutstanding || onlyMissingBank || typeFilter !== "ALL");
  const clearFilters = () => {
    excelParties.setGlobalSearch("");
    excelParties.clearAllFilters();
    setTypeFilter("ALL");
    setCategoryFilter("");
    setCityFilter("");
    setOnlyOutstanding(false);
    setOnlyMissingBank(false);
  };

  const rowActions = (p: any) => (
    <>
      {canWriteFinance && p.hasBankDetails && (
        <button
          onClick={() => setBankParty(p)}
          title="View full bank details"
          className="p-1.5 rounded-lg ring-1 ring-slate-200 text-slate-500 hover:text-amber-700 hover:bg-amber-50 hover:ring-amber-200 transition"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      )}
      {canWriteFinance && (
        <button
          onClick={() => handleOpenEdit(p)}
          title="Edit vendor / contractor"
          className="p-1.5 rounded-lg ring-1 ring-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
      )}
      {canWriteFinance && (
        <Link
          href={`/parties/${p.id}`}
          title="Liquidated damages & deductions"
          className="p-1.5 rounded-lg ring-1 ring-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 hover:ring-rose-200 transition"
        >
          <ShieldAlert className="w-3.5 h-3.5" />
        </Link>
      )}
      <button
        onClick={() => setAuditParty({ id: p.id, name: p.name })}
        title="Change History"
        className="p-1.5 rounded-lg ring-1 ring-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:ring-indigo-200 transition"
      >
        <History className="w-3.5 h-3.5" />
      </button>
      {canWriteFinance && (
        <button
          onClick={() => handleDeleteParty(p.id, p.name)}
          title="Delete vendor / contractor"
          className="p-1.5 rounded-lg ring-1 ring-slate-200 text-slate-500 hover:text-rose-600 hover:ring-rose-200 hover:bg-rose-50 transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </>
  );

  const inputCls = "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm";
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1";

  return (
    <Shell>
      <div className="space-y-5">
        <PageHeader
          icon={Building2}
          title="Vendors & Contractors"
          subtitle="Manage suppliers and contractors, their phone numbers, bank details, bills, and pending dues."
        >
          {canWriteFinance && (
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-brand text-slate-950 font-bold text-sm shadow-glow hover:brightness-110 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add vendor / contractor</span>
            </button>
          )}
        </PageHeader>

        {statusMessage && <Alert tone="success" onDismiss={() => setStatusMessage(null)}>{statusMessage}</Alert>}
        {errorMessage && <Alert tone="error" onDismiss={() => setErrorMessage(null)}>{errorMessage}</Alert>}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
          {[
            { label: "Vendors", value: formatCompactNumber(stats.vendors), title: String(stats.vendors), Icon: Truck, tone: "bg-sky-50 text-sky-600 ring-sky-100", onClick: () => setTypeFilter("VENDOR") },
            { label: "Contractors", value: formatCompactNumber(stats.contractors), title: String(stats.contractors), Icon: HardHat, tone: "bg-violet-50 text-violet-600 ring-violet-100", onClick: () => setTypeFilter("CONTRACTOR") },
            { label: "Total Unpaid Balance", value: formatCompactINR(stats.outstanding), title: formatCurrency(stats.outstanding), Icon: IndianRupee, tone: "bg-amber-50 text-amber-600 ring-amber-100", onClick: () => { setOnlyOutstanding(true); setSortBy("outstanding"); } },
            { label: "Missing bank details", value: formatCompactNumber(stats.missingBank), title: String(stats.missingBank), Icon: Landmark, tone: "bg-rose-50 text-rose-600 ring-rose-100", onClick: () => setOnlyMissingBank(true) },
          ].map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={s.onClick}
              className="flex items-center gap-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md hover:border-slate-300 p-3.5 text-left transition-all"
            >
              <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1", s.tone)}>
                <s.Icon className="w-5 h-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums tracking-tight leading-tight truncate" title={s.title}>{s.value}</span>
                <span className="block text-xs text-slate-500 leading-tight">{s.label}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 shrink-0">
              {(
                [
                  ["ALL", "All", null],
                  ["VENDOR", "Vendors", Truck],
                  ["CONTRACTOR", "Contractors", HardHat],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setTypeFilter(key)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5",
                    typeFilter === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 shrink-0" role="group" aria-label="View">
              <button
                onClick={() => changeView("cards")}
                className={cn("p-1.5 rounded-lg transition", view === "cards" ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}
                title="Card view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => changeView("table")}
                className={cn("p-1.5 rounded-lg transition", view === "table" ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}
                title="Table view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <div className="grid grid-cols-2 gap-2 sm:contents">
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full sm:w-auto text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className="w-full sm:w-auto text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                <option value="">All cities</option>
                {cities.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="col-span-2 sm:col-span-1 w-full sm:w-auto text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                <option value="recent">Sort: Newest first</option>
                <option value="name">Sort: Name</option>
                <option value="outstanding">Sort: Highest due</option>
                <option value="rating">Sort: Best rated</option>
              </select>
              <button
                onClick={() => setOnlyOutstanding(!onlyOutstanding)}
                className={cn(
                  "w-full sm:w-auto px-2.5 py-1.5 rounded-lg text-xs font-semibold ring-1 transition text-center",
                  onlyOutstanding ? "bg-amber-50 text-amber-800 ring-amber-300" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
                )}
              >
                Amount due
              </button>
              <button
                onClick={() => setOnlyMissingBank(!onlyMissingBank)}
                className={cn(
                  "w-full sm:w-auto px-2.5 py-1.5 rounded-lg text-xs font-semibold ring-1 transition text-center",
                  onlyMissingBank ? "bg-rose-50 text-rose-700 ring-rose-300" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
                )}
              >
                No bank details
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 pt-0.5 sm:pt-0 sm:contents">
              {view === "cards" && (
                <ShowEntriesControl
                  pageSize={cardsPagination.pageSize}
                  onPageSizeChange={cardsPagination.setPageSize}
                />
              )}
              <span className="text-xs text-slate-500 ml-auto">
                {filteredParties.length} of {parties.length}
                {filtersActive && (
                  <button onClick={clearFilters} className="ml-2 font-semibold text-amber-600 hover:text-amber-700">
                    Clear
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-48 rounded-2xl" />
            ))}
          </div>
        ) : filteredParties.length === 0 ? (
          <div className="text-center py-14 bg-white rounded-2xl border border-dashed border-slate-300">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100 flex items-center justify-center animate-float">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="text-sm font-semibold text-slate-800 mt-3">
              {parties.length === 0 ? "No vendors or contractors yet" : "No one matches these filters"}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {parties.length === 0 ? "Add your first supplier or subcontractor to start tracking bills and payments." : "Try clearing a filter."}
            </div>
            {filtersActive && (
              <button onClick={clearFilters} className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white">
                Clear filters
              </button>
            )}
          </div>
        ) : view === "cards" ? (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
              <ExcelTableToolbar table={excelParties} columns={partyColumns} tableName="vendors & contractors" showSearch={true} showExport={true} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
            {cardsPagination.paginatedData.map((p) => {
              const style = TYPE_STYLE[p.partyType] || TYPE_STYLE.VENDOR;
              const due = p.outstandingBalance || 0;
              return (
                <div key={p.id} className="group bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-lg hover:border-slate-300 transition-all p-4 flex flex-col gap-3 min-w-0">
                  <div className="flex items-start gap-3">
                    <div className={cn("w-11 h-11 rounded-xl bg-gradient-to-br text-white font-bold flex items-center justify-center shrink-0 shadow-sm", style.avatar)}>
                      {initials(p.name) || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/parties/${p.id}`} className="block font-semibold text-slate-900 hover:text-amber-700 leading-snug line-clamp-2">
                        {p.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md ring-1", style.chip)}>{style.label}</span>
                        {p.category && (
                          <span className="flex flex-wrap items-center gap-1">
                            {p.category
                              .split(",")
                              .map((c: string) => c.trim())
                              .filter(Boolean)
                              .map((cat: string) => (
                                <span
                                  key={cat}
                                  className="text-[10px] font-medium bg-amber-500/10 text-amber-900 border border-amber-200/80 px-1.5 py-0.5 rounded"
                                >
                                  {cat}
                                </span>
                              ))}
                          </span>
                        )}
                        {p.city && (
                          <span className="text-[11px] text-slate-500 flex items-center gap-0.5">
                            <MapPin className="w-3 h-3" />
                            {p.city}
                          </span>
                        )}
                      </div>
                    </div>
                    {p.rating ? (
                      <span className="flex items-center gap-0.5 text-xs font-semibold text-amber-600 shrink-0" title={`Rated ${p.rating} of 5`}>
                        <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-500" />
                        {p.rating}
                      </span>
                    ) : null}
                  </div>

                  {p.contactPerson && (
                    <div className="text-xs text-slate-600 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {p.contactPerson}
                      {p.phone && <span className="text-slate-400">· {p.phone}</span>}
                    </div>
                  )}

                  {/* GST & Tax Details */}
                  {(() => {
                    const gst = parsePartyGst(p.notes);
                    return (
                      <div className="text-[11px] font-mono text-slate-600 flex items-center gap-1.5 flex-wrap">
                        {p.taxIdentifier && (
                          <span>
                            GSTIN: <strong className="text-slate-800">{p.taxIdentifier}</strong>
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-bold">
                          GST {gst.gstRate}% (CGST: {gst.cgstRate}%, SGST: {gst.sgstRate}%)
                        </span>
                      </div>
                    );
                  })()}

                  {/* Money */}
                  {canReadFinance && p.totalBilled !== undefined && (
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-center">
                      <div>
                        <div className="text-[10px] text-slate-500">Billed</div>
                        <div className="text-sm font-semibold text-slate-800 tabular-nums truncate" title={formatCurrency(p.totalBilled)}>{formatCompactINR(p.totalBilled)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">Paid</div>
                        <div className="text-sm font-semibold text-emerald-600 tabular-nums truncate" title={formatCurrency(p.totalPaid)}>{formatCompactINR(p.totalPaid)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">{due < 0 ? "Advance" : "Due"}</div>
                        <div
                          className={cn("text-sm font-bold tabular-nums", due > 0 ? "text-amber-600" : due < 0 ? "text-emerald-600" : "text-slate-400")}
                          title={formatCurrency(Math.abs(due))}
                        >
                          {formatCompactINR(Math.abs(due))}
                        </div>
                      </div>
                    </div>
                  )}

                  {canReadFinance && p.totalDamagesDeducted > 0 && (
                    <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-800">
                      <span className="flex items-center gap-1 font-medium">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        Damages Deducted
                      </span>
                      <strong className="font-mono font-bold">−{formatCurrency(p.totalDamagesDeducted)}</strong>
                    </div>
                  )}

                  {p.liquidatedDamagesTerms && (
                    <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200/60 rounded-lg px-2 py-1 truncate" title={p.liquidatedDamagesTerms}>
                      <span className="font-semibold text-slate-700">LD Clause:</span> {p.liquidatedDamagesTerms}
                    </div>
                  )}

                  {/* Bank */}
                  {p.hasBankDetails ? (
                    <div className="flex items-center justify-between gap-2 rounded-xl ring-1 ring-slate-200 px-3 py-2">
                      <div className="min-w-0 flex items-center gap-2">
                        <Landmark className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800 truncate">
                            {p.bankName || "UPI"} {p.bankAccountMasked && <span className="font-mono text-slate-500">{p.bankAccountMasked}</span>}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono truncate">{[p.bankIfsc, p.upiId].filter(Boolean).join(" · ")}</div>
                        </div>
                      </div>
                      {canWriteFinance && (
                        <button
                          onClick={() => setBankParty(p)}
                          className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1 shrink-0"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-rose-50/60 ring-1 ring-rose-100 px-3 py-2 text-xs text-rose-700">
                      <span className="flex items-center gap-1.5">
                        <Landmark className="w-3.5 h-3.5" /> No bank details yet
                      </span>
                      {canWriteFinance && (
                        <button onClick={() => handleOpenEdit(p)} className="font-semibold hover:underline">
                          Add
                        </button>
                      )}
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <ContactActions
                      phone={p.phone}
                      whatsappNumber={p.whatsappNumber}
                      email={p.email}
                      message={`Namaste ${p.contactPerson || p.name},`}
                    />
                    <div className="flex items-center gap-1 ml-auto">
                      <Link
                        href={`/parties/${p.id}`}
                        className="p-1.5 rounded-lg ring-1 ring-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition"
                        title="Statement"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </Link>
                      {rowActions(p)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
            <TablePagination
              currentPage={cardsPagination.currentPage}
              totalPages={cardsPagination.totalPages}
              totalItems={cardsPagination.totalItems}
              totalUnfiltered={parties.length}
              pageSize={cardsPagination.pageSize}
              startItem={cardsPagination.startItem}
              endItem={cardsPagination.endItem}
              onPageChange={cardsPagination.setCurrentPage}
              itemLabel="vendors & contractors"
            />
          </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs min-h-[400px]">
            <ExcelTableToolbar table={excelParties} columns={partyColumns} tableName="vendors & contractors" showSearch={true} showExport={true} />
            {/* Desktop Table View (≥ lg screens) */}
            <div className="hidden lg:block overflow-x-auto min-h-[400px]">
              <table className="w-full text-left text-sm min-w-[700px]">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider font-semibold border-b border-slate-200">
                  <tr>
                    {partyColumns.map((col) => (
                      <ExcelColumnHeader key={col.key} column={col} table={excelParties} />
                    ))}
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {excelParties.filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={partyColumns.length + 1} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Filter className="w-8 h-8 text-slate-300" />
                          <p className="font-semibold text-slate-700">No vendors or contractors match these filters</p>
                          <button
                            type="button"
                            onClick={excelParties.clearAllFilters}
                            className="mt-2 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs"
                          >
                            Reset Filters
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    excelParties.paginatedData.map((p) => {
                      const style = TYPE_STYLE[p.partyType] || TYPE_STYLE.VENDOR;
                      return (
                        <tr key={p.id} className="hover:bg-amber-50/40 transition-colors group">
                          <td className="py-3 px-4">
                            <Link href={`/parties/${p.id}`} className="block">
                              <div className="font-semibold text-slate-900 group-hover:text-amber-700 transition-colors">{p.name}</div>
                            </Link>
                            {(() => {
                              const gst = parsePartyGst(p.notes);
                              return (
                                <div className="text-[10px] font-mono text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                  {p.taxIdentifier && <span>GSTIN: {p.taxIdentifier} &bull;</span>}
                                  <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-900 border border-amber-200 font-bold">
                                    GST {gst.gstRate}% (C: {gst.cgstRate}%, S: {gst.sgstRate}%)
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-3 px-4">
                            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md ring-1 whitespace-nowrap", style.chip)}>{style.label}</span>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">
                            {p.category ? (
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {p.category
                                  .split(",")
                                  .map((c: string) => c.trim())
                                  .filter(Boolean)
                                  .map((cat: string) => (
                                    <span
                                      key={cat}
                                      className="text-[10px] font-medium bg-amber-500/10 text-amber-900 border border-amber-200/80 px-1.5 py-0.5 rounded"
                                    >
                                      {cat}
                                    </span>
                                  ))}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">{p.city || "—"}</td>
                          <td className="py-3 px-4">
                            <ContactActions phone={p.phone} whatsappNumber={p.whatsappNumber} email={p.email} message={`Namaste ${p.contactPerson || p.name},`} />
                          </td>
                          <td className="py-3 px-4 text-xs whitespace-nowrap">
                            {p.hasBankDetails ? (
                              <div>
                                <div className="font-semibold text-slate-800">
                                  {p.bankName || "UPI"} <span className="font-mono text-slate-500">{p.bankAccountMasked}</span>
                                </div>
                                <div className="font-mono text-slate-500">{p.bankIfsc || p.upiId}</div>
                              </div>
                            ) : (
                              <span className="text-rose-600 font-semibold">Missing</span>
                            )}
                          </td>
                          {canReadFinance && (
                            <>
                              <td className="py-3 px-4 text-right font-medium text-slate-700 tabular-nums">{formatCurrency(p.totalBilled)}</td>
                              <td className="py-3 px-4 text-right font-medium text-emerald-600 tabular-nums">{formatCurrency(p.totalPaid)}</td>
                              <td className="py-3 px-4 text-right font-bold tabular-nums">
                                <span className={p.outstandingBalance > 0 ? "text-amber-600" : p.outstandingBalance < 0 ? "text-emerald-600" : "text-slate-400"}>
                                  {formatCurrency(p.outstandingBalance)}
                                </span>
                              </td>
                            </>
                          )}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">{rowActions(p)}</div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Partners Cards (< lg screens) */}
            <div className="lg:hidden p-3 bg-slate-50/60 space-y-3 min-h-[300px]">
              {excelParties.filteredData.length === 0 ? (
                <div className="py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                  <Filter className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">No vendors or contractors match these filters</p>
                  <button
                    type="button"
                    onClick={excelParties.clearAllFilters}
                    className="mt-2 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                excelParties.paginatedData.map((p) => {
                  const style = TYPE_STYLE[p.partyType] || TYPE_STYLE.VENDOR;

                  return (
                    <div key={`p-card-${p.id}`} className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all">
                      {/* Top: Partner Name & Type Chip */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <Link href={`/parties/${p.id}`} className="font-bold text-slate-900 hover:text-amber-700 text-sm block">
                            {p.name}
                          </Link>
                        </div>

                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-md ring-1 shrink-0", style.chip)}>
                          {style.label}
                        </span>
                      </div>

                      {/* Middle: Outstanding Balance & Contact */}
                      <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs items-center">
                        <div>
                          {canReadFinance ? (
                            <>
                              <div className="text-[11px] text-slate-400 font-medium">Outstanding Balance</div>
                              <div className="text-base font-black tabular-nums mt-0.5">
                                <span className={p.outstandingBalance > 0 ? "text-amber-600" : p.outstandingBalance < 0 ? "text-emerald-600" : "text-slate-400"}>
                                  {formatCurrency(p.outstandingBalance)}
                                </span>
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-500">{p.city || "Direct Vendor"}</span>
                          )}
                        </div>

                        <div className="flex justify-end">
                          <ContactActions
                            phone={p.phone}
                            whatsappNumber={p.whatsappNumber}
                            email={p.email}
                            message={`Namaste ${p.contactPerson || p.name},`}
                          />
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                        <Link
                          href={`/parties/${p.id}`}
                          className="text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline"
                        >
                          View Profile &rarr;
                        </Link>

                        <div className="flex items-center gap-1">
                          {rowActions(p)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <TablePagination
              currentPage={excelParties.currentPage}
              totalPages={excelParties.totalPages}
              totalItems={excelParties.filteredCount}
              totalUnfiltered={excelParties.totalRecords}
              pageSize={excelParties.pageSize}
              startItem={excelParties.startItem}
              endItem={excelParties.endItem}
              onPageChange={excelParties.setCurrentPage}
              itemLabel="vendors & contractors"
            />
          </div>
        )}

        {/* Modal: Register / Edit Partner */}
        {showModal && canWriteFinance && (
          <div className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl ring-1 ring-slate-200 max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in">
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 shrink-0 bg-white">
                <div className="font-display font-bold text-slate-900 text-lg flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-gradient-brand text-white flex items-center justify-center shadow-glow">
                    <Building2 className="w-4 h-4" />
                  </span>
                  <span>{isEditing ? "Edit vendor / contractor" : "Add vendor / contractor"}</span>
                </div>
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="party-form" onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                <section className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Business</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Legal / business name *</label>
                      <input type="text" required placeholder="e.g. Shree Cement Agencies" value={form.name} onChange={setField("name")} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Type</label>
                      <select value={form.partyType} onChange={setField("partyType")} className={inputCls}>
                        <option value="VENDOR">Vendor (material supplier)</option>
                        <option value="CONTRACTOR">Contractor (labour / work)</option>
                        <option value="BOTH">Both (material + work)</option>
                      </select>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className={labelCls}>Category / trade</label>
                        {!isAddingCategory ? (
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddingCategory(true);
                              setNewCategoryText("");
                            }}
                            className="text-[11px] font-bold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+ Add new Category / trade</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setIsAddingCategory(false)}
                            className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            Choose from list
                          </button>
                        )}
                      </div>

                      {isAddingCategory ? (
                        <div className="space-y-1.5 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/90 animate-in fade-in">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span className="text-xs font-bold text-amber-900">Add New Category / Trade</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              autoFocus
                              placeholder="e.g. Glass & Glazing, HVAC, Solar..."
                              value={newCategoryText}
                              onChange={(e) => setNewCategoryText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddCategorySubmit();
                                } else if (e.key === "Escape") {
                                  setIsAddingCategory(false);
                                }
                              }}
                              className="flex-1 bg-white border border-amber-300 rounded-lg p-2 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                            />
                            <button
                              type="button"
                              disabled={!newCategoryText.trim()}
                              onClick={handleAddCategorySubmit}
                              className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition disabled:opacity-50 cursor-pointer whitespace-nowrap"
                            >
                              Add &amp; Select
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="relative" ref={categoryDropdownRef}>
                          {/* Trigger Button */}
                          <button
                            type="button"
                            onClick={() => setIsCategoryDropdownOpen((prev) => !prev)}
                            className={cn(
                              inputCls,
                              "w-full flex items-center justify-between text-left cursor-pointer transition",
                              isCategoryDropdownOpen ? "border-amber-500 ring-2 ring-amber-500/20" : ""
                            )}
                          >
                            <div className="flex-1 min-w-0 truncate">
                              {selectedCategories.length === 0 ? (
                                <span className="text-slate-400">Select categories / trades (multiple)...</span>
                              ) : (
                                <span className="font-semibold text-slate-800 flex items-center gap-1.5 truncate">
                                  <span>{selectedCategories.join(", ")}</span>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              {selectedCategories.length > 0 && (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-900">
                                  {selectedCategories.length}
                                </span>
                              )}
                              <ChevronDown
                                className={cn(
                                  "w-4 h-4 text-slate-400 transition-transform duration-200",
                                  isCategoryDropdownOpen ? "rotate-180 text-amber-600" : ""
                                )}
                              />
                            </div>
                          </button>

                          {/* Selected tags badges */}
                          {selectedCategories.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {selectedCategories.map((cat) => (
                                <span
                                  key={cat}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-950 border border-amber-300 shadow-2xs"
                                >
                                  <span>{cat}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeCategory(cat);
                                    }}
                                    className="p-0.5 hover:bg-amber-500/30 rounded text-amber-800 hover:text-amber-950 transition cursor-pointer"
                                    title={`Remove ${cat}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                              <button
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, category: "" }))}
                                className="text-[11px] text-slate-400 hover:text-rose-600 underline self-center ml-1 cursor-pointer font-medium"
                              >
                                Clear all
                              </button>
                            </div>
                          )}

                          {/* Dropdown Menu with Checkboxes */}
                          {isCategoryDropdownOpen && (
                            <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                              {/* Search box inside dropdown */}
                              <div className="p-2 border-b border-slate-100 bg-slate-50/80">
                                <div className="relative flex items-center">
                                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                                  <input
                                    type="text"
                                    value={categorySearch}
                                    onChange={(e) => setCategorySearch(e.target.value)}
                                    placeholder="Search categories (e.g. Cement, Steel)..."
                                    className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                                    autoFocus
                                  />
                                  {categorySearch && (
                                    <button
                                      type="button"
                                      onClick={() => setCategorySearch("")}
                                      className="absolute right-2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center justify-between px-1 pt-1.5 text-[11px] text-slate-500">
                                  <span>Check all categories supplied:</span>
                                  <span className="font-semibold text-amber-700">
                                    {selectedCategories.length} selected
                                  </span>
                                </div>
                              </div>

                              {/* Quick Add Custom Category if search query doesn't exist */}
                              {categorySearch.trim() &&
                                !allCategoryOptions.some(
                                  (c) => c.toLowerCase() === categorySearch.trim().toLowerCase()
                                ) && (
                                  <div className="p-2 border-b border-amber-100 bg-amber-50/60">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const trimmed = categorySearch.trim();
                                        setCustomCategories((prev) =>
                                          Array.from(new Set([trimmed, ...prev]))
                                        );
                                        toggleCategory(trimmed);
                                        setCategorySearch("");
                                      }}
                                      className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-amber-900 hover:bg-amber-50 transition cursor-pointer"
                                    >
                                      <Plus className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                      <span>
                                        Add &amp; check &quot;<strong>{categorySearch.trim()}</strong>&quot;
                                      </span>
                                    </button>
                                  </div>
                                )}

                              {/* Checkbox List */}
                              <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5 divide-y divide-slate-50">
                                {filteredCategories.length === 0 ? (
                                  <div className="py-6 text-center text-xs text-slate-500">
                                    No categories matched &quot;{categorySearch}&quot;
                                  </div>
                                ) : (
                                  filteredCategories.map((cat) => {
                                    const isChecked = selectedCategories.some(
                                      (c) => c.toLowerCase() === cat.toLowerCase()
                                    );
                                    return (
                                      <label
                                        key={cat}
                                        className={cn(
                                          "flex items-center justify-between gap-3 px-3 py-2 rounded-lg cursor-pointer transition select-none text-xs",
                                          isChecked
                                            ? "bg-amber-50/80 text-amber-950 font-semibold"
                                            : "hover:bg-slate-50 text-slate-700"
                                        )}
                                      >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => toggleCategory(cat)}
                                            className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer accent-amber-600"
                                          />
                                          <span className="truncate">{cat}</span>
                                        </div>
                                        {isChecked && (
                                          <Check className="w-3.5 h-3.5 text-amber-600 shrink-0 stroke-[2.5]" />
                                        )}
                                      </label>
                                    );
                                  })
                                )}
                              </div>

                              {/* Dropdown footer */}
                              <div className="p-2 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsAddingCategory(true);
                                    setIsCategoryDropdownOpen(false);
                                    setNewCategoryText("");
                                  }}
                                  className="text-xs text-amber-600 hover:text-amber-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>+ Add Custom</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsCategoryDropdownOpen(false)}
                                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition cursor-pointer"
                                >
                                  Done
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>GSTIN</label>
                      <input type="text" placeholder="27AAAAA0000A1Z5" value={form.taxIdentifier} onChange={setField("taxIdentifier")} className={cn(inputCls, "font-mono uppercase")} />
                    </div>
                    <div>
                      <label className={labelCls}>PAN</label>
                      <input type="text" maxLength={10} placeholder="ABCDE1234F" value={form.panNumber} onChange={setField("panNumber")} className={cn(inputCls, "font-mono uppercase")} />
                      <p className="mt-1 text-[11px] text-slate-400">10-digit PAN for business & tax compliance verification.</p>
                    </div>

                    {/* GST Rate (%), CGST (%), SGST (%) Section */}
                    <div className="sm:col-span-2 bg-amber-50/50 rounded-xl p-3 border border-amber-200/90 space-y-2.5">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-amber-950">
                          <Percent className="w-4 h-4 text-amber-600" />
                          <span>GST Tax Configuration</span>
                        </div>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                          Total: {form.gstRate || 0}% (CGST {form.cgstRate || 0}% + SGST {form.sgstRate || 0}%)
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* GST Rate (%) */}
                        <div>
                          <label className={labelCls}>GST Rate (%)</label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              placeholder="18"
                              value={form.gstRate}
                              onChange={(e) => handleGstRateChange(e.target.value)}
                              className={cn(inputCls, "font-mono font-bold pr-7")}
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                          </div>
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {["0", "5", "12", "18", "28"].map((rate) => (
                              <button
                                key={rate}
                                type="button"
                                onClick={() => handleGstRateChange(rate)}
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[10px] font-bold font-mono transition cursor-pointer",
                                  form.gstRate === rate
                                    ? "bg-amber-500 text-slate-950 shadow-2xs"
                                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                                )}
                              >
                                {rate}%
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* CGST (%) */}
                        <div>
                          <label className={labelCls}>CGST (%)</label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              max="50"
                              placeholder="9"
                              value={form.cgstRate}
                              onChange={(e) => handleCgstRateChange(e.target.value)}
                              className={cn(inputCls, "font-mono font-bold pr-7")}
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                          </div>
                          <p className="mt-1 text-[10px] text-slate-500 font-medium">Central Tax (e.g. 9%)</p>
                        </div>

                        {/* SGST (%) */}
                        <div>
                          <label className={labelCls}>SGST (%)</label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              max="50"
                              placeholder="9"
                              value={form.sgstRate}
                              onChange={(e) => handleSgstRateChange(e.target.value)}
                              className={cn(inputCls, "font-mono font-bold pr-7")}
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                          </div>
                          <p className="mt-1 text-[10px] text-slate-500 font-medium">State Tax (e.g. 9%)</p>
                        </div>
                      </div>
                    </div>

                    {form.partyType !== "VENDOR" && (
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Agreed contract value (₹)</label>
                        <input type="number" step="0.01" min="0" placeholder="500000" value={form.contractValueRupees} onChange={setField("contractValueRupees")} className={inputCls} />
                      </div>
                    )}
                    <div>
                      <label className={labelCls}>Liquidated Damages clause / penalty terms</label>
                      <input
                        type="text"
                        placeholder="e.g. 0.5% per week of delay (max 10% of contract value)"
                        value={form.liquidatedDamagesTerms}
                        onChange={setField("liquidatedDamagesTerms")}
                        className={inputCls}
                      />
                      <p className="mt-1 text-[11px] text-slate-400">Pre-agreed penalty terms to deduct money for milestone delays or defective work.</p>
                    </div>
                    <div>
                      <label className={labelCls}>Liquidated Damages max cap (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        placeholder="e.g. 10"
                        value={form.liquidatedDamagesPercent}
                        onChange={setField("liquidatedDamagesPercent")}
                        className={inputCls}
                      />
                      <p className="mt-1 text-[11px] text-slate-400">Maximum percentage of contract or bill value that can be deducted.</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Contact</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Contact person</label>
                      <input type="text" placeholder="e.g. Ramesh Sharma" value={form.contactPerson} onChange={setField("contactPerson")} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Phone</label>
                      <input type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={setField("phone")} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>WhatsApp number (if different)</label>
                      <input type="tel" placeholder="Same as phone" value={form.whatsappNumber} onChange={setField("whatsappNumber")} className={inputCls} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>WhatsApp group for orders (invite link)</label>
                      <input type="url" placeholder="https://chat.whatsapp.com/AbCdEf123456" value={form.whatsappGroupLink} onChange={setField("whatsappGroupLink")} className={inputCls} />
                      <p className="mt-1 text-[11px] text-slate-500">In the group: Group info → Invite via link → Copy link. Orders get a &quot;Group&quot; button that copies the order and opens it.</p>
                    </div>
                    <div>
                      <label className={labelCls}>Email</label>
                      <input type="email" placeholder="billing@partner.com" value={form.email} onChange={setField("email")} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>City</label>
                      <input list="party-cities" placeholder="e.g. Jaipur" value={form.city} onChange={setField("city")} className={inputCls} />
                      <datalist id="party-cities">
                        {cities.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className={labelCls}>Address</label>
                      <input type="text" placeholder="Registered address" value={form.address} onChange={setField("address")} className={inputCls} />
                    </div>
                  </div>
                </section>

                <section className="space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Landmark className="w-3.5 h-3.5" /> Bank details for payments
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Account holder name</label>
                      <input type="text" placeholder="As printed on the cheque / passbook" value={form.bankAccountName} onChange={setField("bankAccountName")} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Account number</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder={hadAccountOnFile ? `${hadAccountOnFile} on file — type to replace` : "9 to 18 digits"}
                        value={form.bankAccountNumber}
                        onChange={setField("bankAccountNumber")}
                        className={cn(inputCls, "font-mono")}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>IFSC</label>
                      <input type="text" maxLength={11} placeholder="HDFC0001234" value={form.bankIfsc} onChange={setField("bankIfsc")} className={cn(inputCls, "font-mono uppercase")} />
                    </div>
                    <div>
                      <label className={labelCls}>Bank name</label>
                      <input type="text" placeholder="e.g. HDFC Bank" value={form.bankName} onChange={setField("bankName")} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Branch</label>
                      <input type="text" placeholder="e.g. C-Scheme, Jaipur" value={form.bankBranch} onChange={setField("bankBranch")} className={inputCls} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>UPI ID</label>
                      <input type="text" placeholder="name@bank" value={form.upiId} onChange={setField("upiId")} className={inputCls} />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" /> Only admins and accountants can see the full account number. Others see the last 4 digits.
                  </p>
                </section>

                {/* KYC & Contract Documents (PDF Upload) */}
                <section className="space-y-3.5 rounded-2xl bg-amber-50/40 p-4 ring-1 ring-amber-200/80 border border-amber-100/60">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-700 flex items-center justify-center font-bold">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                          KYC &amp; Contract Documents (PDF / Scans)
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Upload official PDF documents: Aadhaar Card, PAN Card, Bank Details, and the Contract between us.
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                      PDF &amp; Scans
                    </span>
                  </div>

                  {/* 4 Dedicated Slots */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {KYC_DOCUMENT_SLOTS.map((slot) => {
                      const pending = pendingDocs.find((d) => d.key === slot.key);
                      const existing = existingPartyDocs.find((d) => d.category === slot.category);
                      const inputId = `kyc-upload-${slot.key}`;

                      return (
                        <div
                          key={slot.key}
                          className="bg-white rounded-xl p-3 border border-slate-200 hover:border-amber-300 transition-all flex flex-col justify-between gap-2.5 shadow-2xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs text-slate-900">{slot.label}</span>
                                <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", slot.badgeCls)}>
                                  {slot.badge}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{slot.hint}</p>
                            </div>
                            <span className="text-slate-400">
                              <Paperclip className="w-3.5 h-3.5" />
                            </span>
                          </div>

                          {/* File status */}
                          {pending ? (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-emerald-900 truncate" title={pending.file.name}>
                                    {pending.file.name}
                                  </div>
                                  <div className="text-[10px] text-emerald-700">
                                    {formatFileSize(pending.file.size)} • Ready to save
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {pending.previewUrl && (
                                  <a
                                    href={pending.previewUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 rounded text-xs"
                                    title="Preview file"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleRemovePendingDoc(slot.key)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                                  title="Remove"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : existing ? (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-blue-900 truncate" title={existing.fileName}>
                                    {existing.fileName}
                                  </div>
                                  <div className="text-[10px] text-blue-700">
                                    {formatFileSize(existing.fileSize)} • On file
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <a
                                  href={existing.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 text-blue-700 hover:text-blue-900 hover:bg-blue-100 rounded"
                                  title="View document"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteExistingDoc(existing.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                                  title="Delete document"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <input
                                id={inputId}
                                type="file"
                                accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleDocFileSelect(slot.key, slot.category, slot.label, file);
                                  e.target.value = "";
                                }}
                              />
                              <label
                                htmlFor={inputId}
                                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 border border-dashed border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:border-amber-400 hover:text-amber-800 hover:bg-amber-50/50 cursor-pointer transition"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span>Upload {slot.label} (PDF)</span>
                              </label>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Combined / Additional Documents Option */}
                  <div className="pt-2 border-t border-amber-200/50 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-500">
                      Have a single combined file or other certificate?
                    </p>
                    <div>
                      <input
                        id="kyc-upload-combined"
                        type="file"
                        accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const customKey = `EXTRA_${Date.now()}`;
                            handleDocFileSelect(customKey, "GENERAL", file.name, file);
                          }
                          e.target.value = "";
                        }}
                      />
                      <label
                        htmlFor="kyc-upload-combined"
                        className="inline-flex items-center gap-1.5 py-1.5 px-3 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-amber-400 cursor-pointer transition shadow-2xs"
                      >
                        <Plus className="w-3 h-3 text-amber-600" />
                        <span>Upload Combined PDF / Other</span>
                      </label>
                    </div>
                  </div>

                  {/* Any extra uploaded docs not in the 4 presets */}
                  {pendingDocs.filter((d) => !KYC_DOCUMENT_SLOTS.some((s) => s.key === d.key)).length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {pendingDocs
                        .filter((d) => !KYC_DOCUMENT_SLOTS.some((s) => s.key === d.key))
                        .map((extra) => (
                          <div
                            key={extra.key}
                            className="bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span className="font-semibold text-slate-800 truncate">{extra.file.name}</span>
                              <span className="text-[10px] text-slate-400">({formatFileSize(extra.file.size)})</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemovePendingDoc(extra.key)}
                              className="text-slate-400 hover:text-rose-600 p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                    </div>
                  )}

                  {uploadProgressMsg && (
                    <div className="text-xs font-semibold text-amber-800 bg-amber-100/80 rounded-lg p-2 text-center animate-pulse">
                      {uploadProgressMsg}
                    </div>
                  )}
                </section>

                {isEditing && (
                  <div>
                    <label className={labelCls}>Reason for change (saved in audit log)</label>
                    <input type="text" placeholder="e.g. New bank account as per letter dated 12 Oct" value={form.editReason} onChange={setField("editReason")} className={inputCls} />
                  </div>
                )}

              </form>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  form="party-form"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-gradient-brand text-slate-950 font-bold text-sm rounded-xl shadow-glow hover:brightness-110 disabled:opacity-50 transition"
                >
                  {submitting ? "Saving…" : isEditing ? "Save changes" : "Add vendor / contractor"}
                </button>
              </div>
            </div>
          </div>
        )}

        {pendingDeleteParty && (
          <div
            className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
            onClick={() => setPendingDeleteParty(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto space-y-3 animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="font-bold text-slate-900 text-base">Delete Vendor / Contractor?</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Remove <strong className="text-slate-900">{pendingDeleteParty.name}</strong> from your vendor &amp; contractor list?
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPendingDeleteParty(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={executeDeleteParty}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg disabled:opacity-50"
                >
                  {submitting ? "Deleting..." : "Delete Vendor / Contractor"}
                </button>
              </div>
            </div>
          </div>
        )}

        {bankParty && <BankDetailsModal party={bankParty} onClose={() => setBankParty(null)} />}

        {auditParty && (
          <AuditHistoryModal
            entityType="PARTY"
            entityId={auditParty.id}
            title={`Change History: ${auditParty.name}`}
            onClose={() => setAuditParty(null)}
          />
        )}

        {/* Floating Background Upload Indicator */}
        {bgUpload && (
          <aside
            aria-live="polite"
            className="fixed bottom-5 right-5 z-[90] max-w-sm w-[calc(100vw-2.5rem)] sm:w-96 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl p-4 shadow-2xl border border-slate-700/80 transition-all animate-in slide-in-from-bottom-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {bgUpload.status === "uploading" ? (
                  <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
                ) : bgUpload.status === "done" ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-100 truncate">
                    {bgUpload.status === "uploading"
                      ? `Uploading ${bgUpload.total} document(s)...`
                      : bgUpload.status === "done"
                      ? `All ${bgUpload.total} documents uploaded`
                      : `Upload completed with issues`}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {bgUpload.partyName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBgUpload(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg shrink-0"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {bgUpload.status === "uploading" && (
              <div className="mt-3 space-y-1.5">
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-amber-400 h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round(((bgUpload.completed + bgUpload.failed) / (bgUpload.total || 1)) * 100)}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>In background</span>
                  <span>{bgUpload.completed + bgUpload.failed} of {bgUpload.total} done</span>
                </div>
              </div>
            )}

            {bgUpload.status === "error" && bgUpload.errorDetails && bgUpload.errorDetails.length > 0 && (
              <p className="mt-2 text-[10px] text-rose-300">
                Failed: {bgUpload.errorDetails.join(", ")}
              </p>
            )}
          </aside>
        )}
      </div>
    </Shell>
  );
}
