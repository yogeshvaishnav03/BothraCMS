"use client";

import React, { useEffect, useState, useMemo } from "react";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatQuantity, rupeesToPaise } from "@/lib/formatters";
import { canUser } from "@/lib/permissions";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, ExcelColumn } from "@/components/ui/ExcelTable";
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
} from "lucide-react";

interface MeasurementRecord {
  id: string;
  organizationId: string;
  projectId: string;
  partyId: string;
  itemDescription: string;
  unit: string;
  count: number;
  length: number;
  breadth?: number;
  depth?: number;
  quantity: number;
  unitRate: number; // paise
  totalAmount: number; // paise
  status: "DRAFT" | "SUBMITTED" | "VERIFIED" | "APPROVED" | "REJECTED" | "BILLED";
  billId?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export default function MeasurementBookPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const canWriteProjects = canUser(currentUser, "projects:write");
  const canWriteFinance = canUser(currentUser, "finance:write");

  const [entries, setEntries] = useState<MeasurementRecord[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters & search
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState("ALL");
  const [selectedParty, setSelectedParty] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");

  // Notifications
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formProjectId, setFormProjectId] = useState("");
  const [formPartyId, setFormPartyId] = useState("");
  const [formItemDesc, setFormItemDesc] = useState("");
  const [formUnit, setFormUnit] = useState("SQM");
  const [formCount, setFormCount] = useState<number | string>(1);
  const [formLength, setFormLength] = useState<number | string>(1);
  const [formBreadth, setFormBreadth] = useState<number | string>(1);
  const [formDepth, setFormDepth] = useState<number | string>(1);
  const [formRateRupees, setFormRateRupees] = useState<number | string>("");
  const [formNotes, setFormNotes] = useState("");

  // Convert to Bill Modal State
  const [showBillModal, setShowBillModal] = useState(false);
  const [billTargetEntry, setBillTargetEntry] = useState<MeasurementRecord | null>(null);
  const [formBillNumber, setFormBillNumber] = useState("");

  // Detail Modal State
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailEntry, setDetailEntry] = useState<MeasurementRecord | null>(null);

  // Fetch initial data
  const loadData = async () => {
    setLoading(true);
    try {
      const [mbRes, projRes, partyRes, meRes] = await Promise.all([
        fetch("/api/measurement-book"),
        fetch("/api/projects"),
        fetch("/api/parties"),
        fetch("/api/auth/me").then((r) => r.json()).catch(() => ({})),
      ]);

      const mbData = await mbRes.json();
      const projData = await projRes.json();
      const partyData = await partyRes.json();

      if (meRes.success && meRes.data) {
        setCurrentUser(meRes.data.user);
      }

      if (mbData.success && Array.isArray(mbData.data)) {
        setEntries(mbData.data);
      }
      if (projData.success && Array.isArray(projData.data)) {
        setProjects(projData.data);
        if (projData.data.length > 0 && !formProjectId) {
          setFormProjectId(projData.data[0].id);
        }
      }
      if (partyData.success && Array.isArray(partyData.data)) {
        setParties(partyData.data);
        if (partyData.data.length > 0 && !formPartyId) {
          setFormPartyId(partyData.data[0].id);
        }
      }
    } catch (err: any) {
      setErrorMessage("Failed to load Measurement Book data: " + (err.message || "Network error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculated Quantity & Total for Form
  const calculatedFormQuantity = useMemo(() => {
    const c = Number(formCount) || 1;
    const l = Number(formLength) || 1;
    const b = Number(formBreadth) || 1;
    const d = Number(formDepth) || 1;
    return Math.round(c * l * b * d * 10000) / 10000;
  }, [formCount, formLength, formBreadth, formDepth]);

  const calculatedFormTotalRupees = useMemo(() => {
    const rate = Number(formRateRupees) || 0;
    return Math.round(calculatedFormQuantity * rate * 100) / 100;
  }, [calculatedFormQuantity, formRateRupees]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const matchSearch =
        !search ||
        e.itemDescription.toLowerCase().includes(search.toLowerCase()) ||
        (e.notes && e.notes.toLowerCase().includes(search.toLowerCase())) ||
        e.id.toLowerCase().includes(search.toLowerCase());

      const matchProj = selectedProject === "ALL" || e.projectId === selectedProject;
      const matchParty = selectedParty === "ALL" || e.partyId === selectedParty;
      const matchStatus = selectedStatus === "ALL" || e.status === selectedStatus;

      return matchSearch && matchProj && matchParty && matchStatus;
    });
  }, [entries, search, selectedProject, selectedParty, selectedStatus]);

  const measurementColumns: ExcelColumn<any>[] = useMemo(
    () => [
      {
        key: "itemDescription",
        label: "Reference & Item",
        accessor: (entry) => `${entry.itemDescription} ${entry.id.slice(0, 8)}`,
        type: "text",
      },
      {
        key: "projectParty",
        label: "Project & Subcontractor",
        accessor: (entry) => {
          const proj = projects.find((p) => p.id === entry.projectId)?.name || "Project";
          const party = parties.find((p) => p.id === entry.partyId)?.name || "Contractor";
          return `${proj} ${party}`;
        },
        type: "text",
      },
      {
        key: "dimensions",
        label: "Dimensions (L × B × D × N)",
        accessor: (entry) =>
          `${entry.length}m × ${entry.breadth ?? 1}m × ${entry.depth ?? 1}m × ${entry.count}nos`,
        type: "text",
      },
      {
        key: "quantity",
        label: "Total Qty",
        accessor: (entry) => Number(entry.quantity) || 0,
        type: "number",
        align: "right",
      },
      {
        key: "unitRate",
        label: "Unit Rate",
        accessor: (entry) => (Number(entry.unitRate) || 0) / 100,
        type: "currency",
        align: "right",
      },
      {
        key: "totalAmount",
        label: "Amount (₹)",
        accessor: (entry) => (Number(entry.totalAmount) || 0) / 100,
        type: "currency",
        align: "right",
      },
      {
        key: "status",
        label: "Status",
        accessor: (entry) => entry.status || "DRAFT",
        type: "text",
        align: "center",
      },
    ],
    [projects, parties]
  );

  const excelMeasurements = useExcelTable({
    data: filteredEntries,
    columns: measurementColumns,
  });

  // Aggregate KPIs
  const kpis = useMemo(() => {
    const totalCount = entries.length;
    const totalPaise = entries.reduce((sum: number, e: any) => sum + (e.totalAmount || 0), 0);
    const submittedCount = entries.filter((e) => e.status === "SUBMITTED").length;
    const verifiedCount = entries.filter((e) => e.status === "VERIFIED").length;
    const approvedCount = entries.filter((e) => e.status === "APPROVED" || e.status === "BILLED").length;
    return {
      totalCount,
      totalPaise,
      submittedCount,
      verifiedCount,
      approvedCount,
    };
  }, [entries]);

  // Handle Form Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    if (!formProjectId) {
      setErrorMessage("Please select a project.");
      return;
    }
    if (!formPartyId) {
      setErrorMessage("Please select a subcontractor/contractor.");
      return;
    }
    if (!formItemDesc.trim()) {
      setErrorMessage("Item description is required.");
      return;
    }
    const rateRupees = Number(formRateRupees);
    if (!rateRupees || rateRupees <= 0) {
      setErrorMessage("Please provide a valid agreed rate.");
      return;
    }

    setActionLoading(true);
    try {
      const rateInPaise = rupeesToPaise(rateRupees);
      const res = await fetch("/api/measurement-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE",
          projectId: formProjectId,
          partyId: formPartyId,
          itemDescription: formItemDesc.trim(),
          unit: formUnit,
          count: Number(formCount) || 1,
          length: Number(formLength) || 1,
          breadth: Number(formBreadth) || 1,
          depth: Number(formDepth) || 1,
          agreedRate: rateInPaise,
          notes: formNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to record measurement.");
      }

      setStatusMessage("Measurement recorded successfully with auto-calculated quantities!");
      setShowCreateModal(false);
      // Reset form
      setFormItemDesc("");
      setFormRateRupees("");
      setFormNotes("");
      setFormCount(1);
      setFormLength(1);
      setFormBreadth(1);
      setFormDepth(1);
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred.");
    } finally {
      setActionLoading(false);
    }
  };

  // Status transition handler
  const handleUpdateStatus = async (
    entryId: string,
    newStatus: "VERIFIED" | "APPROVED" | "REJECTED"
  ) => {
    setErrorMessage(null);
    setStatusMessage(null);
    setActionLoading(true);
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

      setStatusMessage(`Measurement entry successfully updated to ${newStatus}`);
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || "Status update failed.");
    } finally {
      setActionLoading(false);
    }
  };

  // Convert to Bill submit
  const handleConvertBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billTargetEntry || !formBillNumber.trim()) {
      setErrorMessage("Bill number is required to generate contractor invoice.");
      return;
    }

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

      setStatusMessage(
        `Measurement converted to Contractor Bill (${data.data?.bill?.billNumber || formBillNumber}) successfully!`
      );
      setShowBillModal(false);
      setBillTargetEntry(null);
      setFormBillNumber("");
      loadData();
    } catch (err: any) {
      setErrorMessage(err.message || "Conversion to bill failed.");
    } finally {
      setActionLoading(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredEntries.length === 0) {
      setErrorMessage("No measurement records to export.");
      return;
    }

    const headers = [
      "ID",
      "Project",
      "Subcontractor",
      "Item Description",
      "Unit",
      "Count",
      "Length",
      "Breadth",
      "Depth",
      "Quantity",
      "Rate (Rs)",
      "Total Amount (Rs)",
      "Status",
      "Bill ID",
      "Created At",
    ];

    const rows = filteredEntries.map((e) => {
      const proj = projects.find((p) => p.id === e.projectId)?.name || e.projectId;
      const party = parties.find((p) => p.id === e.partyId)?.name || e.partyId;
      return [
        `"${e.id}"`,
        `"${proj}"`,
        `"${party}"`,
        `"${e.itemDescription.replace(/"/g, '""')}"`,
        `"${e.unit}"`,
        e.count,
        e.length,
        e.breadth ?? 1,
        e.depth ?? 1,
        e.quantity,
        (e.unitRate / 100).toFixed(2),
        (e.totalAmount / 100).toFixed(2),
        `"${e.status}"`,
        `"${e.billId || ""}"`,
        `"${e.createdAt}"`,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Measurement_Book_${new Date().toISOString().split("T")[0]}.csv`);
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
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
                <BookOpen className="w-6 h-6" />
              </span>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Measurement Book (MB Record)
              </h1>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Record site work measurements, formulas, supervisor checks, and contractor billing.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium shadow-sm transition"
            >
              <Download className="w-4 h-4 text-slate-500" />
              Export CSV
            </button>
            {canWriteProjects && (
              <button
                onClick={() => {
                  setErrorMessage(null);
                  setStatusMessage(null);
                  setShowCreateModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm shadow transition"
              >
                <Plus className="w-4 h-4" />
                Record Measurement
              </button>
            )}
          </div>
        </div>

        {/* Feedback Messages */}
        {statusMessage && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{statusMessage}</span>
            </div>
            <button onClick={() => setStatusMessage(null)} className="text-emerald-600 hover:text-emerald-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-rose-600 hover:text-rose-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Total Measured Value</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(kpis.totalPaise)}</div>
              <div className="text-xs text-slate-500 mt-0.5">{kpis.totalCount} total entries recorded</div>
            </div>
            <span className="p-3 bg-amber-100 text-amber-700 rounded-xl">
              <Calculator className="w-6 h-6" />
            </span>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Pending Verification</div>
              <div className="text-xl font-bold text-amber-600 mt-1">{kpis.submittedCount}</div>
              <div className="text-xs text-slate-500 mt-0.5">Awaiting supervisor site review</div>
            </div>
            <span className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-6 h-6" />
            </span>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Verified Ready</div>
              <div className="text-xl font-bold text-blue-600 mt-1">{kpis.verifiedCount}</div>
              <div className="text-xs text-slate-500 mt-0.5">Ready for Project Manager approval</div>
            </div>
            <span className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <FileCheck className="w-6 h-6" />
            </span>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Approved & Billed</div>
              <div className="text-xl font-bold text-emerald-600 mt-1">{kpis.approvedCount}</div>
              <div className="text-xs text-slate-500 mt-0.5">Locked & eligible for contractor invoice</div>
            </div>
            <span className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="w-6 h-6" />
            </span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search items, notes, ref ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Project Filter */}
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="text-xs font-medium px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Contractor Filter */}
            <select
              value={selectedParty}
              onChange={(e) => setSelectedParty(e.target.value)}
              className="text-xs font-medium px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">All Subcontractors</option>
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
              className="text-xs font-medium px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="VERIFIED">Verified</option>
              <option value="APPROVED">Approved</option>
              <option value="BILLED">Billed</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>

        {/* Measurement Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-500">
              <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <span>Loading Measurement Book records...</span>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <Ruler className="w-12 h-12 text-slate-300 mx-auto" />
              <div className="text-base font-semibold text-slate-700">No Measurement Entries Found</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No measurement entries match your current search and filters. Click &quot;Record Measurement&quot; to log new site work.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <ExcelTableToolbar
                table={excelMeasurements}
                columns={measurementColumns}
                tableName="measurement entries"
                showSearch={true}
                showExport={true}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse min-w-[700px]">
                  <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                    <tr>
                      {measurementColumns.map((col) => (
                        <ExcelColumnHeader
                          key={col.key}
                          column={col}
                          table={excelMeasurements}
                          theme="darkHeader"
                        />
                      ))}
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {excelMeasurements.filteredData.map((entry) => {
                    const proj = projects.find((p) => p.id === entry.projectId)?.name || "Project";
                    const party = parties.find((p) => p.id === entry.partyId)?.name || "Contractor";
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4">
                          <div className="font-semibold text-slate-900">{entry.itemDescription}</div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">
                            ID: {entry.id} | {new Date(entry.createdAt).toLocaleDateString("en-IN")}
                          </div>
                        </td>

                        <td className="p-4">
                          <div className="font-medium text-slate-800">{proj}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            {party}
                          </div>
                        </td>

                        <td className="p-4 text-xs font-mono text-slate-700">
                          {entry.length}m × {entry.breadth ?? 1}m × {entry.depth ?? 1}m × {entry.count}nos
                        </td>

                        <td className="p-4 font-semibold text-slate-900">
                          {formatQuantity(entry.quantity, entry.unit)}
                        </td>

                        <td className="p-4 text-slate-600 text-xs font-mono">
                          {formatCurrency(entry.unitRate)} / {entry.unit}
                        </td>

                        <td className="p-4 font-bold text-slate-900">
                          {formatCurrency(entry.totalAmount)}
                        </td>

                        <td className="p-4">
                          {getStatusBadge(entry.status)}
                        </td>

                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setDetailEntry(entry);
                                setShowDetailModal(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                              title="View Full Breakdown"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {entry.status === "SUBMITTED" && canWriteProjects && (
                              <>
                                <button
                                  disabled={actionLoading}
                                  onClick={() => handleUpdateStatus(entry.id, "VERIFIED")}
                                  className="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold border border-blue-200 transition"
                                  title="Verify site measurements"
                                >
                                  Verify
                                </button>
                                <button
                                  disabled={actionLoading}
                                  onClick={() => handleUpdateStatus(entry.id, "REJECTED")}
                                  className="px-2 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold border border-rose-200 transition"
                                  title="Reject measurement"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {entry.status === "VERIFIED" && canWriteFinance && (
                              <>
                                <button
                                  disabled={actionLoading}
                                  onClick={() => handleUpdateStatus(entry.id, "APPROVED")}
                                  className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold border border-emerald-200 transition"
                                  title="Approve for contractor billing"
                                >
                                  Approve
                                </button>
                                <button
                                  disabled={actionLoading}
                                  onClick={() => handleUpdateStatus(entry.id, "REJECTED")}
                                  className="px-2 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold border border-rose-200 transition"
                                  title="Reject measurement"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {entry.status === "APPROVED" && canWriteFinance && (
                              <button
                                disabled={actionLoading}
                                onClick={() => {
                                  setBillTargetEntry(entry);
                                  setFormBillNumber(`BILL-MB-${Date.now().toString().slice(-4)}`);
                                  setShowBillModal(true);
                                }}
                                className="px-2 py-1 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs font-semibold border border-purple-200 transition inline-flex items-center gap-1"
                                title="Convert directly to contractor bill"
                              >
                                <Receipt className="w-3 h-3" />
                                Convert to Bill
                              </button>
                            )}

                            {entry.status === "BILLED" && entry.billId && (
                              <span className="text-xs text-purple-600 font-mono font-medium">
                                Bill #{entry.billId.slice(0, 6)}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </div>

        {/* Modal: Record Measurement */}
        {showCreateModal && canWriteProjects && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                    <Ruler className="w-5 h-5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Record Measurement Book Entry</h2>
                    <p className="text-xs text-slate-500">Calculate physical volume/area and commit to permanent ledger</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Project *</label>
                    <select
                      value={formProjectId}
                      onChange={(e) => setFormProjectId(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      required
                    >
                      <option value="">Select Project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Subcontractor / Party *</label>
                    <select
                      value={formPartyId}
                      onChange={(e) => setFormPartyId(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      required
                    >
                      <option value="">Select Contractor</option>
                      {parties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.partyType})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Work Item Description *</label>
                  <input
                    type="text"
                    placeholder="e.g. RCC Column 1:1.5:3 Concrete Pouring (Ground Floor Grid A-C)"
                    value={formItemDesc}
                    onChange={(e) => setFormItemDesc(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Unit</label>
                    <select
                      value={formUnit}
                      onChange={(e) => setFormUnit(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold text-amber-700"
                    >
                      <option value="SQM">SQM (Area)</option>
                      <option value="CUM">CUM (Volume)</option>
                      <option value="RMT">RMT (Running)</option>
                      <option value="NOS">NOS (Count)</option>
                      <option value="TONNE">TONNE (Weight)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Count (Nos)</label>
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      value={formCount}
                      onChange={(e) => setFormCount(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Length (m)</label>
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      value={formLength}
                      onChange={(e) => setFormLength(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Breadth (m)</label>
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      value={formBreadth}
                      onChange={(e) => setFormBreadth(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Depth/Height (m)</label>
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      value={formDepth}
                      onChange={(e) => setFormDepth(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                    />
                  </div>
                </div>

                {/* Live Formula Preview Box */}
                <div className="p-4 rounded-xl bg-slate-900 text-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-inner">
                  <div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1.5">
                      <Calculator className="w-3.5 h-3.5 text-amber-400" />
                      Dynamic Quantity Formula
                    </div>
                    <div className="text-sm font-mono mt-1 text-slate-200">
                      {formCount || 1} × {formLength || 1} × {formBreadth || 1} × {formDepth || 1} ={" "}
                      <span className="text-amber-400 font-bold font-mono text-base">
                        {calculatedFormQuantity} {formUnit}
                      </span>
                    </div>
                  </div>

                  <div className="md:text-right border-t md:border-t-0 md:border-l border-slate-800 pt-2 md:pt-0 md:pl-4">
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Estimated Amount</div>
                    <div className="text-lg font-bold text-emerald-400">
                      ₹{calculatedFormTotalRupees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Agreed Rate (₹ per {formUnit}) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="e.g. 4500.00"
                      value={formRateRupees}
                      onChange={(e) => setFormRateRupees(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono font-semibold"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Site Notes & Reference</label>
                    <input
                      type="text"
                      placeholder="e.g. Verified against architectural drawing D-402"
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-5 py-2 text-sm font-semibold text-slate-950 bg-amber-500 hover:bg-amber-600 rounded-lg shadow transition disabled:opacity-50"
                  >
                    {actionLoading ? "Saving..." : "Commit Measurement Record"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Convert to Bill */}
        {showBillModal && billTargetEntry && canWriteFinance && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto animate-scale-in">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                    <Receipt className="w-5 h-5" />
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">Convert to Contractor Bill</h2>
                </div>
                <button
                  onClick={() => setShowBillModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConvertBillSubmit} className="space-y-4 mt-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                  <div className="font-semibold text-slate-800">{billTargetEntry.itemDescription}</div>
                  <div className="text-slate-500">
                    Quantity: {formatQuantity(billTargetEntry.quantity, billTargetEntry.unit)}
                  </div>
                  <div className="font-bold text-slate-900">
                    Billable Value: {formatCurrency(billTargetEntry.totalAmount)}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Contractor Bill Number *</label>
                  <input
                    type="text"
                    value={formBillNumber}
                    onChange={(e) => setFormBillNumber(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    An official Finance Bill will be generated, posted to accounts payable, and linked to this MB entry.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowBillModal(false)}
                    className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow transition disabled:opacity-50"
                  >
                    {actionLoading ? "Generating..." : "Generate Bill"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: View Details */}
        {showDetailModal && detailEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto animate-scale-in">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                    <FileText className="w-5 h-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Measurement Audit Record</h2>
                    <span className="text-xs font-mono text-slate-400">{detailEntry.id}</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 mt-4 text-xs text-slate-700">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-slate-400 uppercase font-semibold text-[10px]">Description</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">{detailEntry.itemDescription}</div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-slate-400 uppercase font-semibold text-[10px]">Project</div>
                    <div className="font-medium text-slate-800 mt-0.5">
                      {projects.find((p) => p.id === detailEntry.projectId)?.name || detailEntry.projectId}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-slate-400 uppercase font-semibold text-[10px]">Subcontractor</div>
                    <div className="font-medium text-slate-800 mt-0.5">
                      {parties.find((p) => p.id === detailEntry.partyId)?.name || detailEntry.partyId}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 bg-slate-100 rounded">
                    <span className="text-slate-400 block text-[10px]">Count</span>
                    <span className="font-mono font-bold text-slate-800">{detailEntry.count}</span>
                  </div>
                  <div className="p-2 bg-slate-100 rounded">
                    <span className="text-slate-400 block text-[10px]">Length</span>
                    <span className="font-mono font-bold text-slate-800">{detailEntry.length}m</span>
                  </div>
                  <div className="p-2 bg-slate-100 rounded">
                    <span className="text-slate-400 block text-[10px]">Breadth</span>
                    <span className="font-mono font-bold text-slate-800">{detailEntry.breadth ?? 1}m</span>
                  </div>
                  <div className="p-2 bg-slate-100 rounded">
                    <span className="text-slate-400 block text-[10px]">Depth</span>
                    <span className="font-mono font-bold text-slate-800">{detailEntry.depth ?? 1}m</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-900 text-slate-100 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Total Quantity</span>
                    <span className="text-amber-400 font-mono font-bold text-sm">
                      {formatQuantity(detailEntry.quantity, detailEntry.unit)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Total Amount</span>
                    <span className="text-emerald-400 font-bold text-sm">{formatCurrency(detailEntry.totalAmount)}</span>
                  </div>
                </div>

                {detailEntry.notes && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-slate-400 uppercase font-semibold text-[10px]">Site Notes</div>
                    <div className="text-slate-700 mt-0.5">{detailEntry.notes}</div>
                  </div>
                )}

                <div className="flex items-center justify-between text-slate-400 pt-2 border-t border-slate-100">
                  <span>Created: {new Date(detailEntry.createdAt).toLocaleString("en-IN")}</span>
                  <span>Status: {detailEntry.status}</span>
                </div>
              </div>

              <div className="flex justify-end mt-4 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
