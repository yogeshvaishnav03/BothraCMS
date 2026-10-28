"use client";

import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContactActions } from "@/components/ui/ContactActions";
import React, { useEffect, useState, useMemo } from "react";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, ExcelColumn } from "@/components/ui/ExcelTable";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatCompactINR, rupeesToPaise, paiseToRupees } from "@/lib/formatters";
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
} from "lucide-react";
import AuditHistoryModal from "@/components/audit/AuditHistoryModal";
import { canUser } from "@/lib/permissions";
import { cn } from "@/lib/cn";

type PartyType = "VENDOR" | "CONTRACTOR" | "BOTH";

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
  tdsSection: "",
  contractValueRupees: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankIfsc: "",
  bankName: "",
  bankBranch: "",
  upiId: "",
  editReason: "",
};

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
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-3xl max-w-md w-full shadow-xl ring-1 ring-slate-200 max-h-[90vh] overflow-y-auto animate-scale-in"
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
                <ShieldAlert className="w-3.5 h-3.5" /> This view is recorded in the audit log.
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
  const [currentUser, setCurrentUser] = useState<any>(null);
  const canWriteFinance = canUser(currentUser, "finance:write");
  const [parties, setParties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "VENDOR" | "CONTRACTOR">("ALL");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [onlyOutstanding, setOnlyOutstanding] = useState(false);
  const [onlyMissingBank, setOnlyMissingBank] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "outstanding" | "rating">("name");
  const [view, setView] = useState<"cards" | "table">("cards");

  // Register / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [hadAccountOnFile, setHadAccountOnFile] = useState<string | null>(null);
  const isEditing = Boolean(editingPartyId);
  const setField = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const [auditParty, setAuditParty] = useState<{ id: string; name: string } | null>(null);
  const [bankParty, setBankParty] = useState<any>(null);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      }
    };
    if (showModal || bankParty || auditParty) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [showModal, bankParty, auditParty]);
  const changeView = (v: "cards" | "table") => {
    setView(v);
    try {
      localStorage.setItem("bothra_parties_view", v);
    } catch {}
  };

  const loadParties = () => {
    setLoading(true);
    fetch(`/api/parties?type=ALL`)
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
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) setCurrentUser(res.data.user);
      })
      .catch(() => {});
    loadParties();
  }, []);

  const handleOpenCreate = () => {
    setEditingPartyId(null);
    setHadAccountOnFile(null);
    setForm({ ...EMPTY_FORM, partyType: typeFilter === "CONTRACTOR" ? "CONTRACTOR" : "VENDOR" });
    setShowModal(true);
  };

  const handleOpenEdit = (p: any) => {
    setEditingPartyId(p.id);
    setHadAccountOnFile(p.bankAccountMasked || null);
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
      tdsSection: p.tdsSection || "",
      contractValueRupees: p.contractValue ? paiseToRupees(p.contractValue).toString() : "",
      bankAccountName: p.bankAccountName || "",
      bankAccountNumber: "", // never pre-filled; leave empty to keep the number on file
      bankIfsc: p.bankIfsc || "",
      bankName: p.bankName || "",
      bankBranch: p.bankBranch || "",
      upiId: p.upiId || "",
    });
    setShowModal(true);
  };

  const handleDeleteParty = async (id: string, partyName: string) => {
    if (!confirm(`Are you sure you want to delete party "${partyName}"?`)) return;
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/parties?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to delete party");
        return;
      }
      setStatusMessage(`Party "${partyName}" deleted.`);
      loadParties();
    } catch (err: any) {
      setErrorMessage(`Network error: ${err.message || "Failed to delete party"}`);
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

    const payload: Record<string, unknown> = {
      name: form.name,
      partyType: form.partyType,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      taxIdentifier: form.taxIdentifier || null,
      contractValue: contractPaise,
      contactPerson: form.contactPerson,
      whatsappNumber: form.whatsappNumber,
      whatsappGroupLink: form.whatsappGroupLink.trim(),
      city: form.city,
      category: form.category,
      rating: form.rating ? Number(form.rating) : null,
      panNumber: form.panNumber,
      tdsSection: form.tdsSection,
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
          setErrorMessage(data.error?.message || "Failed to update party");
        } else {
          setStatusMessage(`Party "${form.name}" updated successfully.`);
          setShowModal(false);
          loadParties();
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
          setErrorMessage(data.error?.message || "Failed to register party");
        } else {
          setStatusMessage("Party registered successfully!");
          setShowModal(false);
          loadParties();
        }
      }
    } catch {
      setErrorMessage("Network error during operation");
    } finally {
      setSubmitting(false);
    }
  };

  const categories = useMemo(
    () => Array.from(new Set(parties.map((p) => p.category).filter(Boolean))).sort() as string[],
    [parties]
  );
  const cities = useMemo(
    () => Array.from(new Set(parties.map((p) => p.city).filter(Boolean))).sort() as string[],
    [parties]
  );

  const filteredParties = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = parties.filter((p) => {
      if (typeFilter !== "ALL" && p.partyType !== typeFilter && p.partyType !== "BOTH") return false;
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (cityFilter && p.city !== cityFilter) return false;
      if (onlyOutstanding && !((p.outstandingBalance || 0) > 0)) return false;
      if (onlyMissingBank && p.hasBankDetails) return false;
      if (!q) return true;
      return [p.name, p.taxIdentifier, p.panNumber, p.phone, p.whatsappNumber, p.city, p.category, p.contactPerson, p.bankIfsc, p.bankName, p.upiId, p.email]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(q));
    });
    return list.sort((a, b) =>
      sortBy === "outstanding"
        ? (b.outstandingBalance || 0) - (a.outstandingBalance || 0)
        : sortBy === "rating"
        ? (b.rating || 0) - (a.rating || 0)
        : a.name.localeCompare(b.name)
    );
  }, [parties, search, typeFilter, categoryFilter, cityFilter, onlyOutstanding, onlyMissingBank, sortBy]);

  const stats = useMemo(() => {
    const vendors = parties.filter((p) => p.partyType === "VENDOR" || p.partyType === "BOTH").length;
    const contractors = parties.filter((p) => p.partyType === "CONTRACTOR" || p.partyType === "BOTH").length;
    const outstanding = parties.reduce((s, p) => s + Math.max(0, p.outstandingBalance || 0), 0);
    const missingBank = parties.filter((p) => !p.hasBankDetails).length;
    return { vendors, contractors, outstanding, missingBank };
  }, [parties]);

  const filtersActive = Boolean(search || categoryFilter || cityFilter || onlyOutstanding || onlyMissingBank || typeFilter !== "ALL");
  const clearFilters = () => {
    setSearch("");
    setTypeFilter("ALL");
    setCategoryFilter("");
    setCityFilter("");
    setOnlyOutstanding(false);
    setOnlyMissingBank(false);
  };

  const partyColumns: ExcelColumn<any>[] = useMemo(
    () => [
      { key: "name", label: "Partner Name / GSTIN", accessor: (p) => `${p.name} ${p.taxIdentifier || ""}`, type: "text" },
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
      { key: "totalBilled", label: "Total Billed", accessor: (p) => (Number(p.totalBilled) || 0) / 100, type: "currency", align: "right" },
      { key: "totalPaid", label: "Total Paid", accessor: (p) => (Number(p.totalPaid) || 0) / 100, type: "currency", align: "right" },
      { key: "outstandingBalance", label: "Outstanding", accessor: (p) => (Number(p.outstandingBalance) || 0) / 100, type: "currency", align: "right" },
    ],
    []
  );

  const excelParties = useExcelTable({ data: filteredParties, columns: partyColumns });

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
          title="Edit Party Details"
          className="p-1.5 rounded-lg ring-1 ring-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        onClick={() => setAuditParty({ id: p.id, name: p.name })}
        title="Audit History"
        className="p-1.5 rounded-lg ring-1 ring-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:ring-indigo-200 transition"
      >
        <History className="w-3.5 h-3.5" />
      </button>
      {canWriteFinance && (
        <button
          onClick={() => handleDeleteParty(p.id, p.name)}
          title="Delete Party"
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
          subtitle="Every supplier and subcontractor with contacts, bank details, bills, payments and what is still due."
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
            { label: "Vendors", value: String(stats.vendors), Icon: Truck, tone: "bg-sky-50 text-sky-600 ring-sky-100", onClick: () => setTypeFilter("VENDOR") },
            { label: "Contractors", value: String(stats.contractors), Icon: HardHat, tone: "bg-violet-50 text-violet-600 ring-violet-100", onClick: () => setTypeFilter("CONTRACTOR") },
            { label: "Total due to parties", value: formatCompactINR(stats.outstanding), Icon: IndianRupee, tone: "bg-amber-50 text-amber-600 ring-amber-100", onClick: () => { setOnlyOutstanding(true); setSortBy("outstanding"); } },
            { label: "Missing bank details", value: String(stats.missingBank), Icon: Landmark, tone: "bg-rose-50 text-rose-600 ring-rose-100", onClick: () => setOnlyMissingBank(true) },
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
                <span className="block font-display text-lg font-extrabold text-slate-900 tabular-nums leading-tight">{s.value}</span>
                <span className="block text-xs text-slate-500 leading-tight">{s.label}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search name, GSTIN, PAN, phone, city, IFSC, UPI…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 shrink-0 self-start">
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
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 shrink-0 self-start" role="group" aria-label="View">
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
          <div className="flex flex-wrap items-center gap-2">
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
              <option value="name">Sort: Name</option>
              <option value="outstanding">Sort: Highest due</option>
              <option value="rating">Sort: Best rated</option>
            </select>
            <button
              onClick={() => setOnlyOutstanding(!onlyOutstanding)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-semibold ring-1 transition",
                onlyOutstanding ? "bg-amber-50 text-amber-800 ring-amber-300" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
              )}
            >
              Amount due
            </button>
            <button
              onClick={() => setOnlyMissingBank(!onlyMissingBank)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-semibold ring-1 transition",
                onlyMissingBank ? "bg-rose-50 text-rose-700 ring-rose-300" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
              )}
            >
              No bank details
            </button>
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
            {filteredParties.map((p) => {
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
                        {p.category && <span className="text-[11px] text-slate-500">{p.category}</span>}
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

                  {/* Money */}
                  {p.totalBilled !== undefined && (
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-center">
                      <div>
                        <div className="text-[10px] text-slate-500">Billed</div>
                        <div className="text-sm font-semibold text-slate-800 tabular-nums">{formatCompactINR(p.totalBilled)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">Paid</div>
                        <div className="text-sm font-semibold text-emerald-600 tabular-nums">{formatCompactINR(p.totalPaid)}</div>
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
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
            <ExcelTableToolbar table={excelParties} columns={partyColumns} tableName="partners" showSearch={true} showExport={true} />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
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
                          <p className="font-semibold text-slate-700">No partners match selected filters</p>
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
                    excelParties.filteredData.map((p) => {
                      const style = TYPE_STYLE[p.partyType] || TYPE_STYLE.VENDOR;
                      return (
                        <tr key={p.id} className="hover:bg-amber-50/40 transition-colors group">
                          <td className="py-3 px-4">
                            <Link href={`/parties/${p.id}`} className="block">
                              <div className="font-semibold text-slate-900 group-hover:text-amber-700 transition-colors">{p.name}</div>
                              {p.taxIdentifier && <div className="text-xs text-slate-500 font-mono">GSTIN: {p.taxIdentifier}</div>}
                            </Link>
                          </td>
                          <td className="py-3 px-4">
                            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md ring-1 whitespace-nowrap", style.chip)}>{style.label}</span>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">{p.category || "—"}</td>
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
                          <td className="py-3 px-4 text-right font-medium text-slate-700 tabular-nums">{formatCurrency(p.totalBilled)}</td>
                          <td className="py-3 px-4 text-right font-medium text-emerald-600 tabular-nums">{formatCurrency(p.totalPaid)}</td>
                          <td className="py-3 px-4 text-right font-bold tabular-nums">
                            <span className={p.outstandingBalance > 0 ? "text-amber-600" : p.outstandingBalance < 0 ? "text-emerald-600" : "text-slate-400"}>
                              {formatCurrency(p.outstandingBalance)}
                            </span>
                          </td>
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
          </div>
        )}

        {/* Modal: Register / Edit Partner */}
        {showModal && canWriteFinance && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
            <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl ring-1 ring-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
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
                      <label className={labelCls}>Category / trade</label>
                      <input list="party-categories" placeholder="e.g. Cement, RCC work" value={form.category} onChange={setField("category")} className={inputCls} />
                      <datalist id="party-categories">
                        {Array.from(new Set([...CATEGORY_SUGGESTIONS, ...categories])).map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className={labelCls}>GSTIN</label>
                      <input type="text" placeholder="27AAAAA0000A1Z5" value={form.taxIdentifier} onChange={setField("taxIdentifier")} className={cn(inputCls, "font-mono uppercase")} />
                    </div>
                    <div>
                      <label className={labelCls}>PAN</label>
                      <input type="text" maxLength={10} placeholder="ABCDE1234F" value={form.panNumber} onChange={setField("panNumber")} className={cn(inputCls, "font-mono uppercase")} />
                    </div>
                    <div>
                      <label className={labelCls}>TDS on payments</label>
                      <select value={form.tdsSection} onChange={setField("tdsSection")} className={inputCls}>
                        <option value="">{form.partyType === "VENDOR" ? "None (goods supplier)" : "Automatic: contractor (194C)"}</option>
                        <option value="194C">Contractor (194C)</option>
                        <option value="194J_PROF">Professional fees, 10% (194J)</option>
                        <option value="194J_TECH">Technical services, 2% (194J)</option>
                        <option value="194I_LB">Rent of land or building, 10% (194I)</option>
                        <option value="194I_PM">Machinery on hire, 2% (194I)</option>
                        <option value="194Q">Goods over ₹50 lakh a year, 0.1% (194Q)</option>
                        <option value="NONE">No TDS</option>
                      </select>
                    </div>
                    {form.partyType !== "VENDOR" && (
                      <div>
                        <label className={labelCls}>Agreed contract value (₹)</label>
                        <input type="number" step="0.01" min="0" placeholder="500000" value={form.contractValueRupees} onChange={setField("contractValueRupees")} className={inputCls} />
                      </div>
                    )}
                    <div>
                      <label className={labelCls}>Rating</label>
                      <select value={form.rating} onChange={setField("rating")} className={inputCls}>
                        <option value="">Not rated</option>
                        {[5, 4, 3, 2, 1].map((r) => (
                          <option key={r} value={r}>
                            {"★".repeat(r)} ({r})
                          </option>
                        ))}
                      </select>
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
                  {submitting ? "Saving…" : isEditing ? "Save changes" : "Add partner"}
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
            title={`Audit History: ${auditParty.name}`}
            onClose={() => setAuditParty(null)}
          />
        )}
      </div>
    </Shell>
  );
}
