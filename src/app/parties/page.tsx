"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, ExcelColumn } from "@/components/ui/ExcelTable";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { formatCurrency, rupeesToPaise, paiseToRupees } from "@/lib/formatters";
import {
  Building2,
  Plus,
  Search,
  ArrowRight,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  X,
  Phone,
  Mail,
  Trash2,
  Edit2,
  History,
  HardHat,
  Truck,
  Briefcase,
  FileText,
  Filter,
} from "lucide-react";
import AuditHistoryModal from "@/components/audit/AuditHistoryModal";
import { canUser } from "@/lib/permissions";

export default function PartiesPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const canWriteFinance = canUser(currentUser, "finance:write");
  const [parties, setParties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL"); // ALL, VENDOR, CONTRACTOR

  // Register / Edit modal states
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [partyType, setPartyType] = useState<"VENDOR" | "CONTRACTOR" | "BOTH">("VENDOR");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [taxIdentifier, setTaxIdentifier] = useState("");
  const [contractValueRupees, setContractValueRupees] = useState("");
  const [editReason, setEditReason] = useState("");

  // Audit modal state
  const [auditParty, setAuditParty] = useState<{ id: string; name: string } | null>(null);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadParties = () => {
    setLoading(true);
    fetch(`/api/parties?type=${typeFilter}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const raw = res.data || [];
          setParties(typeFilter === "ALL" ? raw : raw.filter((p: any) => p.partyType === typeFilter || p.partyType === "BOTH"));
        }
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
        if (res.success && res.data) {
          setCurrentUser(res.data.user);
        }
      })
      .catch(() => {});
    loadParties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

  const handleOpenCreate = () => {
    setIsEditing(false);
    setEditingPartyId(null);
    setName("");
    setPartyType(typeFilter === "CONTRACTOR" ? "CONTRACTOR" : "VENDOR");
    setPhone("");
    setEmail("");
    setAddress("");
    setTaxIdentifier("");
    setContractValueRupees("");
    setEditReason("");
    setShowModal(true);
  };

  const handleOpenEdit = (p: any) => {
    setIsEditing(true);
    setEditingPartyId(p.id);
    setName(p.name);
    setPartyType(p.partyType);
    setPhone(p.phone || "");
    setEmail(p.email || "");
    setAddress(p.address || "");
    setTaxIdentifier(p.taxIdentifier || "");
    setContractValueRupees(p.contractValue ? (paiseToRupees(p.contractValue)).toString() : "");
    setEditReason("");
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

    const contractPaise = contractValueRupees && !isNaN(parseFloat(contractValueRupees))
      ? rupeesToPaise(parseFloat(contractValueRupees))
      : 0;

    try {
      if (isEditing && editingPartyId) {
        // Edit existing party
        const res = await fetch(`/api/parties/${editingPartyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            partyType,
            phone: phone || null,
            email: email || null,
            address: address || null,
            taxIdentifier: taxIdentifier || null,
            contractValue: contractPaise,
            reason: editReason || undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          setErrorMessage(data.error?.message || "Failed to update party");
        } else {
          setStatusMessage(`Party "${name}" updated successfully.`);
          setShowModal(false);
          loadParties();
        }
      } else {
        // Create new party
        const res = await fetch("/api/parties", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            partyType,
            phone: phone || undefined,
            email: email || undefined,
            address: address || undefined,
            taxIdentifier: taxIdentifier || undefined,
            contractValue: contractPaise,
          }),
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

  const filteredParties = parties.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.taxIdentifier && p.taxIdentifier.toLowerCase().includes(search.toLowerCase())) ||
      (p.phone && p.phone.includes(search))
  );

  const partyColumns: ExcelColumn<any>[] = useMemo(() => {
    const cols: ExcelColumn<any>[] = [
      {
        key: "name",
        label: "Partner Name / GSTIN",
        accessor: (p) => `${p.name} ${p.taxIdentifier || ""}`,
        type: "text",
      },
      {
        key: "partyType",
        label: "Type",
        accessor: (p) => p.partyType,
        type: "text",
      },
      {
        key: "contact",
        label: "Contact",
        accessor: (p) => `${p.phone || ""} ${p.email || ""}`.trim() || "—",
        type: "text",
      },
    ];

    if (typeFilter === "CONTRACTOR") {
      cols.push({
        key: "contractValue",
        label: "Contract Value",
        accessor: (p) => (Number(p.contractValue) || 0) / 100,
        type: "currency",
        align: "right",
      });
    }

    cols.push(
      {
        key: "totalBilled",
        label: "Total Billed",
        accessor: (p) => (Number(p.totalBilled) || 0) / 100,
        type: "currency",
        align: "right",
      },
      {
        key: "totalPaid",
        label: "Total Paid",
        accessor: (p) => (Number(p.totalPaid) || 0) / 100,
        type: "currency",
        align: "right",
      },
      {
        key: "outstandingBalance",
        label: "Outstanding Balance",
        accessor: (p) => (Number(p.outstandingBalance) || 0) / 100,
        type: "currency",
        align: "right",
      }
    );

    return cols;
  }, [typeFilter]);

  const excelParties = useExcelTable({
    data: filteredParties,
    columns: partyColumns,
  });

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <Building2 className="w-6 h-6 text-amber-500" />
              <span>Vendors & Contractors Directory</span>
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Separate supplier accounts and subcontractor contracts with cumulative bills, payments, and outstanding balances.
            </p>
          </div>

          {canWriteFinance && (
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>+ Register Partner</span>
            </button>
          )}
        </div>

        {/* Feedback alerts */}
        {statusMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Filters and Tabs */}
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by company name, GSTIN, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto">
            <button
              onClick={() => setTypeFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                typeFilter === "ALL"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <span>All ({parties.length})</span>
            </button>
            <button
              onClick={() => setTypeFilter("VENDOR")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                typeFilter === "VENDOR"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Vendors</span>
            </button>
            <button
              onClick={() => setTypeFilter("CONTRACTOR")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                typeFilter === "CONTRACTOR"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <HardHat className="w-3.5 h-3.5" />
              <span>Contractors</span>
            </button>
          </div>
        </div>

        {/* Parties Table */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-slate-200/60 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredParties.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <div className="text-sm font-bold text-slate-700">No parties found</div>
            <div className="text-xs text-slate-400 mt-1">Register a new vendor or contractor to begin.</div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <ExcelTableToolbar
              table={excelParties}
              columns={partyColumns}
              tableName="partners"
              showSearch={true}
              showExport={true}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    {partyColumns.map((col) => (
                      <ExcelColumnHeader
                        key={col.key}
                        column={col}
                        table={excelParties}
                        theme="darkHeader"
                      />
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
                          <p className="text-xs text-slate-400">Try clearing or adjusting column filters.</p>
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
                    const isContractor = p.partyType === "CONTRACTOR" || p.partyType === "BOTH";

                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-amber-50/40 transition-colors group"
                      >
                        <td className="py-3.5 px-4">
                          <Link href={`/parties/${p.id}`} className="block">
                            <div className="font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
                              {p.name}
                            </div>
                            {p.taxIdentifier && (
                              <div className="text-xs text-slate-500 font-mono">
                                GSTIN / PAN: {p.taxIdentifier}
                              </div>
                            )}
                          </Link>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                              p.partyType === "VENDOR"
                                ? "bg-blue-100 text-blue-800"
                                : p.partyType === "CONTRACTOR"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {p.partyType}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-600">
                          {p.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {p.phone}
                            </div>
                          )}
                          {p.email && (
                            <div className="flex items-center gap-1 text-[11px] text-slate-400">
                              <Mail className="w-3 h-3 text-slate-400" />
                              {p.email}
                            </div>
                          )}
                          {!p.phone && !p.email && "—"}
                        </td>
                        {typeFilter === "CONTRACTOR" && (
                          <td className="py-3.5 px-4 text-right font-medium text-purple-700 tabular-nums">
                            {p.contractValue > 0 ? formatCurrency(p.contractValue) : "—"}
                          </td>
                        )}
                        <td className="py-3.5 px-4 text-right font-medium text-slate-700 tabular-nums">
                          {formatCurrency(p.totalBilled)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-emerald-600 tabular-nums">
                          {formatCurrency(p.totalPaid)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-black tabular-nums">
                          <span
                            className={
                              p.outstandingBalance > 0
                                ? "text-amber-600"
                                : p.outstandingBalance < 0
                                ? "text-emerald-600"
                                : "text-slate-400"
                            }
                          >
                            {formatCurrency(p.outstandingBalance)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/parties/${p.id}`}
                              className="px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition"
                            >
                              Statement
                            </Link>

                            {canWriteFinance && (
                              <button
                                onClick={() => handleOpenEdit(p)}
                                title="Edit Party Details"
                                className="p-1 rounded-md border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              onClick={() => setAuditParty({ id: p.id, name: p.name })}
                              title="Audit History"
                              className="p-1 rounded-md border border-slate-200 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>

                            {canWriteFinance && (
                              <button
                                onClick={() => handleDeleteParty(p.id, p.name)}
                                title="Delete Party"
                                className="p-1 rounded-md border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
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
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 my-8">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-amber-500" />
                  <span>{isEditing ? "Edit Partner Details" : "Register Vendor / Contractor"}</span>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Partner Category
                  </label>
                  <select
                    value={partyType}
                    onChange={(e: any) => setPartyType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    <option value="VENDOR">Vendor (Material Supplier)</option>
                    <option value="CONTRACTOR">Contractor (Labour / Workmanship)</option>
                    <option value="BOTH">Both (Material + Turnkey Contractor)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Legal / Business Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Shree Cement Agencies / Apex Civil Works"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                {partyType !== "VENDOR" && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Agreed Contract Value (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 500000"
                      value={contractValueRupees}
                      onChange={(e) => setContractValueRupees(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    />
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Total sanctioned value of work order / subcontractor agreement.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. +91 98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. billing@partner.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    GSTIN / Tax ID / PAN
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    value={taxIdentifier}
                    onChange={(e) => setTaxIdentifier(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Billing / Physical Address
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Full registered address..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                {isEditing && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Reason for Change (Audit Log)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Contract value revised as per addendum #2"
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    />
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : isEditing ? "Save Changes" : "Register Partner"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Audit History Modal */}
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
