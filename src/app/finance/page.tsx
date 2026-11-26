"use client";

import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import SearchableSelect from "@/components/ui/SearchableSelect";
import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { formatCurrency, formatCompactINR, formatDate, formatShortBillNumber, formatShortName } from "@/lib/formatters";
import { istDateKey } from "@/lib/ist-date";
import {
  DollarSign,
  Plus,
  Receipt,
  FileText,
  CreditCard,
  Calculator,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  X,
  Search,
  Trash2,
  Landmark,
  XCircle,
  Clock,
  UserCheck,
  Paperclip,
  Calendar,
  LayoutGrid,
  List,
  Filter,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Download,
  Building2,
  Users,
  Briefcase,
  FileSpreadsheet,
  Edit2,
  Check,
  Camera,
  Upload,
  Play,
  Truck,
} from "lucide-react";
import AttachmentManager from "@/components/attachments/AttachmentManager";
import { FileUpload } from "@/components/ui/FileUpload";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, TablePagination, ExcelColumn } from "@/components/ui/ExcelTable";
import { canUser } from "@/lib/permissions";
import { useAppSession } from "@/components/providers/AppSessionProvider";
import { compressImageFile } from "@/lib/image-compression";
import { compressVideoFile } from "@/lib/video-compression";
import { uploadClientMedia } from "@/lib/upload-client";
import { useActiveSite } from "@/hooks/useActiveSite";
import { EXPENSE_CATEGORY_GROUPS, CATEGORY_LABELS } from "@/lib/expense-categories";

const CHALLAN_UNIT_GROUPS = [
  {
    category: "Site & Bulk Deliveries",
    options: [
      { code: "BAG", label: "BAG — Bags (Cement, Putty, Adhesive)" },
      { code: "TONNE", label: "TONNE — Metric Tonne / MT (Steel, Rebar, Bulk)" },
      { code: "KG", label: "KG — Kilograms (Binding Wire, Hardware, Nails)" },
      { code: "CFT", label: "CFT — Cubic Feet (Sand, Stone, Timber, Marble)" },
      { code: "CUM", label: "CUM — Cubic Meter (RMC Concrete, Bulk Soil)" },
      { code: "BRASS", label: "BRASS — Brass / 100 CFT (Sand, Aggregate)" },
      { code: "TRUCK", label: "TRUCK — Dumper Truck Load (Gitti, Sand, Murrum)" },
      { code: "TROLLEY", label: "TROLLEY — Tractor Trolley Load (Bricks, Sand)" },
      { code: "TRIP", label: "TRIP — Trip / Carriage Load" },
      { code: "LOAD", label: "LOAD — General Vehicle Load" },
    ],
  },
  {
    category: "Counts & Packaging",
    options: [
      { code: "PIECE", label: "PIECE / PCS — Pieces (Bricks, Blocks, Sanitary)" },
      { code: "NOS", label: "NOS — Numbers / Units (Electrical, Plumbing)" },
      { code: "BOX", label: "BOX — Boxes (Tiles, Screws, Fasteners)" },
      { code: "BUNDLE", label: "BUNDLE — Bundles (Steel Rods, Pipes, Timber)" },
      { code: "SHEET", label: "SHEET — Sheets (Plywood, Laminate, ACP, Glass)" },
      { code: "ROLL", label: "ROLL — Rolls (Mesh, Tarpaulin, Membrane)" },
      { code: "PACKET", label: "PACKET — Packets (Fasteners, Fittings)" },
      { code: "SET", label: "SET — Sets (Hardware, Lock Sets, Accessories)" },
      { code: "PAIR", label: "PAIR — Pairs (Safety Gloves, Boots)" },
    ],
  },
  {
    category: "Liquids, Paints & Chemicals",
    options: [
      { code: "DRUM", label: "DRUM — Drums (Paint, Admixture, Chemical, Tar)" },
      { code: "BUCKET", label: "BUCKET — Buckets (Texture, Primer, Putty)" },
      { code: "CAN", label: "CAN — Cans (Oil, Solvent, Additive)" },
      { code: "LITRE", label: "LITRE / LTR — Litres (Diesel, Curing Compound)" },
    ],
  },
  {
    category: "Area & Linear Length",
    options: [
      { code: "SQFT", label: "SQFT — Square Feet (Tiles, Granite, Marble, Glass)" },
      { code: "SQM", label: "SQM — Square Meter (Flooring, Plaster, Pavers)" },
      { code: "RFT", label: "RFT — Running Feet (Pipes, Skirting, Railing)" },
      { code: "RMT", label: "RMT — Running Meter (Cables, Conduits, Drainage)" },
      { code: "METER", label: "METER — Linear Meters" },
      { code: "FEET", label: "FEET — Linear Feet" },
      { code: "INCH", label: "INCH — Linear Inches" },
    ],
  },
  {
    category: "Bulk Weight & Contracts",
    options: [
      { code: "QUINTAL", label: "QUINTAL — 100 Kilograms" },
      { code: "LOT", label: "LOT — Lump Sum / Job Lot" },
      { code: "CUSTOM", label: "➕ Custom Unit (Type your own)..." },
    ],
  },
];

const POPULAR_CHALLAN_UNITS = ["BAG", "TONNE", "KG", "CFT", "SQFT", "PIECE", "BOX", "TRUCK", "TRIP", "NOS"];
const CHALLAN_ALL_CODES = new Set(
  CHALLAN_UNIT_GROUPS.flatMap((g) => g.options.map((o) => o.code)).filter((c) => c !== "CUSTOM")
);

export default function FinancePage() {
  const { activeSiteId, setActiveSiteId } = useActiveSite();
  const { refreshUser, refreshSites } = useAppSession();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const canReadFinance = canUser(currentUser, "finance:read");
  const canWriteFinance = canUser(currentUser, "finance:write");
  const canReverseFinance = canUser(currentUser, "finance:reverse");
  const canSuperAdminAct =
    currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ORG_ADMIN";
  const canRecordPayment =
    canWriteFinance ||
    canSuperAdminAct ||
    ["SITE_SUPERVISOR", "PROJECT_MANAGER", "SITE_ENGINEER", "STOREKEEPER"].includes(
      currentUser?.role
    );
  const [sites, setSites] = useState<any[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [bills, setBills] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"BILLS" | "PAYMENTS">("PAYMENTS");

  // Attachment Modal state (Priority 3)
  const [attachmentTarget, setAttachmentTarget] = useState<{
    type: string;
    id: string;
    title: string;
    categoryDefault?: string;
  } | null>(null);
  const [approvePaymentTarget, setApprovePaymentTarget] = useState<any | null>(null);
  const [rejectPaymentTarget, setRejectPaymentTarget] = useState<any | null>(null);
  const [rejectPaymentReason, setRejectPaymentReason] = useState("Payment request was declined");
  const [reRequestPaymentTarget, setReRequestPaymentTarget] = useState<any | null>(null);
  const [reRequestPaymentReason, setReRequestPaymentReason] = useState("");
  const [reRequestPaymentAmount, setReRequestPaymentAmount] = useState("");
  const [approvalActionSubmitting, setApprovalActionSubmitting] = useState(false);

  // Payment Modal state (Single unified form for direct payments, bill settlements, and site cash expenses)
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [recipientType, setRecipientType] = useState<"VENDOR" | "CONTRACTOR" | "EMPLOYEE" | "OTHER">("VENDOR");
  const [recipientName, setRecipientName] = useState("");
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [paymentSiteId, setPaymentSiteId] = useState("");
  const [paymentProjectId, setPaymentProjectId] = useState("");
  const [paymentCostHead, setPaymentCostHead] = useState("CEMENT_BINDING");
  const [workforce, setWorkforce] = useState<any[]>([]);
  const [payingAccount, setPayingAccount] = useState("HDFC Bank Operating A/C (A/C: ...4421)");
  const [customPayingAccount, setCustomPayingAccount] = useState("");
  const [approvalQuery, setApprovalQuery] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [selectedBillId, setSelectedBillId] = useState("");
  const [notes, setNotes] = useState("");
  // TDS on a payment to a contractor (194C), professional (194J) or landlord (194I)
  const [tdsMode, setTdsMode] = useState<"AUTO" | "NONE" | "MANUAL">("AUTO");
  const [tdsManual, setTdsManual] = useState("");
  const [tdsReason, setTdsReason] = useState("");
  const [tdsPreview, setTdsPreview] = useState<any>(null);
  const [paymentFile, setPaymentFile] = useState<{ url: string; name: string; fileId?: string } | null>(null);
  const [settlingEntry, setSettlingEntry] = useState<{
    id: string;
    type: "PAYMENT" | "BILL";
    referenceNumber: string;
    totalAmount: number;
    settledAmount: number;
    remainingAmount: number;
    recipientName?: string;
  } | null>(null);

  // Bill Modal state
  const [showBillModal, setShowBillModal] = useState(false);
  const [editingBill, setEditingBill] = useState<any>(null);
  const [editBillReason, setEditBillReason] = useState("");
  const [editBillNumber, setEditBillNumber] = useState("");
  const [editBillDate, setEditBillDate] = useState("");
  const [editBillDueDate, setEditBillDueDate] = useState("");
  const [editBillNotes, setEditBillNotes] = useState("");
  const [editBillCostHead, setEditBillCostHead] = useState("");
  const [billPartyId, setBillPartyId] = useState("");
  const [billProjectId, setBillProjectId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().split("T")[0]);
  const [billDueDate, setBillDueDate] = useState("");
  const [billNotes, setBillNotes] = useState("");
  const [billFile, setBillFile] = useState<{ url: string; name: string; fileId?: string } | null>(null);
  const [billGstRate, setBillGstRate] = useState("");
  const [billTaxType, setBillTaxType] = useState<"AUTO" | "LOCAL" | "IGST">("AUTO");
  const [billItc, setBillItc] = useState(true);
  const [billRcm, setBillRcm] = useState(false);
  const [billLines, setBillLines] = useState<
    Array<{ description: string; materialId: string; quantity: string; unitRate: string; lineTotal: string; gstRate?: string }>
  >([{ description: "", materialId: "", quantity: "", unitRate: "", lineTotal: "" }]);

  // Tab within Record Bill modal: "BILL" | "CHALLAN"
  const [billModalTab, setBillModalTab] = useState<"BILL" | "CHALLAN">("BILL");

  // Challan Form State
  const [challanPartyId, setChallanPartyId] = useState("");
  const [challanProjectId, setChallanProjectId] = useState("");
  const [challanNumber, setChallanNumber] = useState("");
  const [challanDate, setChallanDate] = useState(() => istDateKey());
  const [challanLines, setChallanLines] = useState<
    Array<{ description: string; materialId: string; quantity: string; unit: string; isCustomUnit?: boolean }>
  >([{ description: "", materialId: "", quantity: "", unit: "BAG", isCustomUnit: false }]);
  const [challanNotes, setChallanNotes] = useState("");
  const [challanFile, setChallanFile] = useState<{ url: string; name: string; fileId?: string } | null>(null);

  // Generate Bill Modal state (convert Challan to Bill)
  const [generateBillTarget, setGenerateBillTarget] = useState<any | null>(null);
  const [genInvoiceNumber, setGenInvoiceNumber] = useState("");
  const [genBillDate, setGenBillDate] = useState(() => istDateKey());
  const [genDueDate, setGenDueDate] = useState("");
  const [genGstRate, setGenGstRate] = useState("18");
  const [genTaxType, setGenTaxType] = useState<"AUTO" | "LOCAL" | "IGST">("AUTO");
  const [genItc, setGenItc] = useState(true);
  const [genRcm, setGenRcm] = useState(false);
  const [genLines, setGenLines] = useState<
    Array<{ id?: string; description: string; materialId?: string; quantity: number; unitRate: string; lineTotal: string; gstRate?: string }>
  >([]);
  const [genNotes, setGenNotes] = useState("");
  const [generatingBill, setGeneratingBill] = useState(false);

  // Reversal Modal state
  const [showReverseModal, setShowReverseModal] = useState(false);
  const [paymentToReverse, setPaymentToReverse] = useState<any>(null);
  const [reverseReason, setReverseReason] = useState("");

  // Search & Filter state for Payments Register
  const todayDateStr = useMemo(() => istDateKey(), []);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentFromDate, setPaymentFromDate] = useState(() => istDateKey());
  const [paymentToDate, setPaymentToDate] = useState(() => istDateKey());
  const [paymentPayeeType, setPaymentPayeeType] = useState("ALL");
  const [paymentPayingAccount, setPaymentPayingAccount] = useState("ALL");
  const [paymentMethod, setPaymentMethod] = useState("ALL");
  const [paymentStatus, setPaymentStatus] = useState("ALL");
  const [paymentViewMode, setPaymentViewMode] = useState<"CARDS" | "TABLE">("CARDS");
  const [paymentReason, setPaymentReason] = useState("");
  const [paymentAllocatedTo, setPaymentAllocatedTo] = useState("");
  const [paymentMinAmount, setPaymentMinAmount] = useState("");
  const [paymentMaxAmount, setPaymentMaxAmount] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [datePreset, setDatePreset] = useState<"ALL" | "TODAY" | "THIS_MONTH" | "LAST_30" | "CUSTOM">("TODAY");
  const [amountPreset, setAmountPreset] = useState<"ALL" | "UNDER_50K" | "50K_2L" | "OVER_2L" | "CUSTOM">("ALL");

  // Search & Filter state for Vendor Bills
  const [billStatus, setBillStatus] = useState("ALL");
  const [billFromDate, setBillFromDate] = useState(() => istDateKey());
  const [billToDate, setBillToDate] = useState(() => istDateKey());
  const [billDatePreset, setBillDatePreset] = useState<"ALL" | "TODAY" | "THIS_MONTH" | "LAST_30" | "CUSTOM">("TODAY");

  // Feedback states
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Synchronize finance page with global active site filter
  useEffect(() => {
    setSelectedSiteId(activeSiteId || "");
    setSelectedProjectId("");
  }, [activeSiteId]);

  // Synchronize finance tab, status filter, and date preset from URL parameters (e.g. ?tab=bills&status=pending)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncFromUrl = () => {
      const search = window.location.search;
      if (!search) return;
      const params = new URLSearchParams(search);
      const tabParam = params.get("tab")?.toLowerCase();
      const statusParam = (params.get("status") || params.get("filter") || params.get("view"))?.toLowerCase();

      if (
        tabParam === "bills" ||
        tabParam === "vendor-bills" ||
        tabParam === "vendor_bills" ||
        statusParam === "pending" ||
        statusParam === "unpaid" ||
        statusParam === "due"
      ) {
        setActiveTab("BILLS");
        if (statusParam === "pending" || statusParam === "unpaid" || statusParam === "due") {
          setBillStatus("PENDING");
          setBillDatePreset("ALL");
          setBillFromDate("");
          setBillToDate("");
        } else if (statusParam === "paid") {
          setBillStatus("PAID");
        } else if (statusParam === "all") {
          setBillStatus("ALL");
          setBillDatePreset("ALL");
          setBillFromDate("");
          setBillToDate("");
        }
      } else if (tabParam === "payments" || tabParam === "register" || statusParam === "paid" || statusParam === "posted") {
        setActiveTab("PAYMENTS");
        if (statusParam === "paid" || statusParam === "posted" || statusParam === "approved") {
          setPaymentStatus("POSTED");
          setDatePreset("ALL");
          setPaymentFromDate("");
          setPaymentToDate("");
        }
      }
    };

    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  const loadData = useCallback(() => {
    setLoading(true);
    const noCacheInit: RequestInit = {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    };
    const t = Date.now();
    Promise.all([
      refreshUser().then((user) => ({ success: Boolean(user), data: { user } })),
      refreshSites().then((data) => ({ success: true, data })),
      fetch(`/api/finance/bills?_t=${t}`, noCacheInit).then((r) => r.json()),
      fetch(`/api/finance/payments?_t=${t}`, noCacheInit).then((r) => r.json()),
      fetch(`/api/parties?_t=${t}`, noCacheInit).then((r) => r.json()),
      fetch(`/api/projects?_t=${t}`, noCacheInit).then((r) => r.json()),
      fetch(`/api/materials?_t=${t}`, noCacheInit).then((r) => r.json()),
      fetch(`/api/workforce?_t=${t}`, noCacheInit).then((r) => r.json()).catch(() => ({})),
    ])
      .then(([meRes, sitesRes, billsRes, paymentsRes, partiesRes, projRes, matRes, wfRes]) => {
        if (meRes.success && meRes.data) {
          setCurrentUser(meRes.data.user);
          if (meRes.data.user.role === "SUPER_ADMIN") {
            setAutoApprove(true);
          }
        }
        if (sitesRes && sitesRes.success && sitesRes.data) {
          setSites(sitesRes.data || []);
        }
        if (billsRes.success) setBills(billsRes.data || []);
        if (paymentsRes.success) setPayments(paymentsRes.data || []);
        if (partiesRes.success) setParties(partiesRes.data || []);
        if (projRes.success) setProjects(projRes.data || []);
        if (matRes.success) setMaterials(matRes.data || []);
        if (wfRes && wfRes.success) setWorkforce(wfRes.data || []);
      })
      .catch((err) => {
        console.error("Authoritative finance data load failed:", err);
      })
      .finally(() => setLoading(false));
  }, [refreshUser, refreshSites]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowPaymentModal(false);
        setSettlingEntry(null);
        setShowBillModal(false);
        setShowReverseModal(false);
        setAttachmentTarget(null);
        setApprovePaymentTarget(null);
        setRejectPaymentTarget(null);
        setReRequestPaymentTarget(null);
      }
    };
    if (showPaymentModal || showBillModal || showReverseModal || attachmentTarget || approvePaymentTarget || rejectPaymentTarget || reRequestPaymentTarget) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [showPaymentModal, showBillModal, showReverseModal, attachmentTarget, approvePaymentTarget, rejectPaymentTarget, reRequestPaymentTarget]);

  // Ask the server what TDS this payment would hold back, as the form changes.
  useEffect(() => {
    const paise = Math.round(parseFloat(amount || "0") * 100);
    if (!showPaymentModal || recipientType === "EMPLOYEE" || !selectedPartyId || !(paise > 0)) {
      setTdsPreview(null);
      return;
    }
    const t = setTimeout(() => {
      fetch("/api/finance/payments/tds-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId: selectedPartyId,
          amount: paise,
          paymentDate: new Date().toISOString(),
          allocations: selectedBillId ? [{ billId: selectedBillId, amount: paise }] : undefined,
          tds: { mode: tdsMode, amount: tdsMode === "MANUAL" ? Math.round(parseFloat(tdsManual || "0") * 100) : undefined, reason: tdsReason || null },
        }),
      })
        .then((r) => r.json())
        .then((d) => setTdsPreview(d?.success ? d.data : null))
        .catch(() => setTdsPreview(null));
    }, 300);
    return () => clearTimeout(t);
  }, [showPaymentModal, recipientType, selectedPartyId, amount, selectedBillId, tdsMode, tdsManual, tdsReason]);

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const paymentAmountPaise = Math.round(parseFloat(amount) * 100);
    const idempotencyKey = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const effectivePayingAccount =
      payingAccount === "CUSTOM" ? customPayingAccount.trim() : payingAccount.trim();

    if (!effectivePayingAccount) {
      setErrorMessage("Please enter the bank or cash account you are paying from.");
      setSubmitting(false);
      return;
    }

    if (!approvalQuery || approvalQuery.trim().length === 0) {
      setErrorMessage("Please enter the purpose of this payment before submitting.");
      setSubmitting(false);
      return;
    }

    let finalPartyId: string | undefined = undefined;
    let finalRecipientName = recipientName.trim();

    if ((recipientType === "VENDOR" || recipientType === "CONTRACTOR") && selectedPartyId) {
      finalPartyId = selectedPartyId;
      const foundParty = parties.find((p) => p.id === selectedPartyId);
      if (foundParty) {
        finalRecipientName = foundParty.name;
      }
    }

    if (!finalPartyId && !finalRecipientName) {
      setErrorMessage("Please select a vendor or contractor, or enter who you are paying.");
      setSubmitting(false);
      return;
    }

    const amtNum = parseFloat(amount);
    const isUnderThreshold = amtNum < 20000;
    const isExecutive = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ORG_ADMIN";

    try {
      let finalNotes = [
        notes?.trim(),
        paymentFile ? `[Attached Payment Proof: ${paymentFile.name} | ${paymentFile.url}]` : "",
      ]
        .filter(Boolean)
        .join(" ");

      const targetProjId = paymentProjectId || (paymentSiteId ? projects.find((p) => p.siteId === paymentSiteId)?.id : selectedProjectId) || undefined;

      const payload: any = {
        partyId: finalPartyId,
        recipientType,
        recipientName: finalRecipientName,
        payingAccount: effectivePayingAccount,
        approvalQuery: approvalQuery.trim(),
        paymentDate: new Date().toISOString(),
        amount: paymentAmountPaise,
        method,
        referenceNumber: referenceNumber.trim() || `PAY-${Date.now().toString().slice(-6)}`,
        idempotencyKey,
        costHead: paymentCostHead || undefined,
        projectId: targetProjId,
        notes: finalNotes || undefined,
        attachmentFileId: paymentFile?.fileId || undefined,
        autoApprove: isUnderThreshold ? true : (isExecutive ? autoApprove : false),
      };

      if (tdsPreview && recipientType !== "OTHER") {
        payload.tds = {
          mode: tdsMode,
          amount: tdsMode === "MANUAL" ? Math.round(parseFloat(tdsManual || "0") * 100) : undefined,
          reason: tdsMode === "AUTO" ? null : tdsReason.trim() || null,
        };
      }

      if (selectedBillId) {
        payload.allocations = [
          {
            billId: selectedBillId,
            amount: paymentAmountPaise,
          },
        ];
      }

      const res = await fetch("/api/finance/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not save payment. Please check the details and try again.");
      } else {
        const isPending = data.data?.payment?.status === "PENDING_APPROVAL";
        setStatusMessage(
          isPending
            ? `Payment of ₹${amount} for ${finalRecipientName} submitted for Admin approval (≥ ₹20,000 threshold).`
            : `Payment of ₹${amount} saved and approved from "${effectivePayingAccount}".`
        );
        setShowPaymentModal(false);
        setAmount("");
        setReferenceNumber("");
        setSelectedBillId("");
        setSelectedPartyId("");
        setRecipientName("");
        setApprovalQuery("");
        setCustomPayingAccount("");
        setNotes("");
        setTdsMode("AUTO");
        setTdsManual("");
        setTdsReason("");
        setTdsPreview(null);
        setSettlingEntry(null);
        setPaymentFile(null);
        loadData();
      }
    } catch {
      setErrorMessage("Connection error while saving payment. Check your internet connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprovePayment = (payment: any) => {
    setApprovePaymentTarget(payment);
  };

  const executeApprovePayment = async () => {
    if (!approvePaymentTarget) return;
    const payment = approvePaymentTarget;
    const payeeName = payment.recipientName || payment.party?.name || "Recipient";
    setApprovalActionSubmitting(true);
    try {
      const res = await fetch(`/api/finance/payments/${payment.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Approved via Finance Register" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setApprovePaymentTarget(null);
        setStatusMessage(data.data?.message || `Payment to ${payeeName} has been approved.`);
        // Optimistically update payment status immediately so UI updates without refreshing
        setPayments((prev) => prev.map((p) => (p.id === payment.id ? { ...p, status: "APPROVED" } : p)));
        loadData();
      } else {
        setErrorMessage(data.error?.message || "Could not approve payment. Please try again.");
      }
    } catch {
      setErrorMessage("Connection error while approving payment. Check your internet and try again.");
    } finally {
      setApprovalActionSubmitting(false);
    }
  };

  const handleRejectPayment = (payment: any) => {
    setRejectPaymentReason("Payment request was declined");
    setRejectPaymentTarget(payment);
  };

  const executeRejectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectPaymentTarget || !rejectPaymentReason.trim()) return;
    const payment = rejectPaymentTarget;
    const payeeName = payment.recipientName || payment.party?.name || "Recipient";
    setApprovalActionSubmitting(true);
    try {
      const res = await fetch(`/api/finance/payments/${payment.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectPaymentReason.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRejectPaymentTarget(null);
        setStatusMessage(`Payment request for ${payeeName} was declined.`);
        // Optimistically update payment status immediately so UI updates without refreshing
        setPayments((prev) => prev.map((p) => (p.id === payment.id ? { ...p, status: "REJECTED" } : p)));
        loadData();
      } else {
        setErrorMessage(data.error?.message || "Could not decline payment. Please try again.");
      }
    } catch {
      setErrorMessage("Connection error while declining payment. Check your internet and try again.");
    } finally {
      setApprovalActionSubmitting(false);
    }
  };

  const handleOpenReRequestPayment = (payment: any) => {
    setReRequestPaymentTarget(payment);
    setReRequestPaymentReason(payment.approvalQuery || payment.notes || "");
    setReRequestPaymentAmount(payment.amount ? String(payment.amount / 100) : "");
  };

  const executeReRequestPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reRequestPaymentTarget) return;
    const payment = reRequestPaymentTarget;
    const payeeName = payment.recipientName || payment.party?.name || "Recipient";
    setApprovalActionSubmitting(true);
    try {
      const parsedAmount = parseFloat(reRequestPaymentAmount);
      const isOop = payment.recipientType === "OUT_OF_POCKET";
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: isOop ? "EXPENSE" : "PAYMENT",
          entityId: payment.id,
          action: "RESUBMIT",
          reason: reRequestPaymentReason.trim() || undefined,
          amountRupees: !isNaN(parsedAmount) && parsedAmount > 0 ? parsedAmount : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReRequestPaymentTarget(null);
        setStatusMessage(`Payment request for ${payeeName} has been re-submitted for approval.`);
        const updatedPaise = !isNaN(parsedAmount) && parsedAmount > 0 ? Math.round(parsedAmount * 100) : payment.amount;
        setPayments((prev) =>
          prev.map((p) =>
            p.id === payment.id
              ? {
                  ...p,
                  status: "PENDING_APPROVAL",
                  rejectionReason: null,
                  amount: updatedPaise,
                }
              : p
          )
        );
        loadData();
      } else {
        setErrorMessage(data.error?.message || "Could not re-request payment. Please try again.");
      }
    } catch {
      setErrorMessage("Connection error while re-requesting payment. Check your internet and try again.");
    } finally {
      setApprovalActionSubmitting(false);
    }
  };

  const handleReverseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentToReverse) return;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/finance/payments/${paymentToReverse.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reverseReason }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not reverse payment. Please try again.");
      } else {
        setStatusMessage(
          `Payment #${paymentToReverse.referenceNumber} reversed. Unpaid bill balances are restored and saved to Change History.`
        );
        // Optimistically update payment status immediately so UI updates without refreshing
        setPayments((prev) =>
          prev.map((p) => (p.id === paymentToReverse.id ? { ...p, status: "REVERSED" } : p))
        );
        setShowReverseModal(false);
        setPaymentToReverse(null);
        setReverseReason("");
        loadData();
      }
    } catch {
      setErrorMessage("Connection error while reversing payment. Check your internet and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Map of target payment id -> total settled / reimbursed amount in paise
  const settlementMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const pay of payments) {
      if (pay.status === "REJECTED" || pay.status === "REVERSED") continue;
      if (!pay.notes) continue;
      const matches = pay.notes.matchAll(/\[(?:SETTLES_EXPENSE|SETTLES_PAYMENT):([a-zA-Z0-9_-]+)(?::(\d+))?\]/g);
      for (const m of matches) {
        const targetId = m[1];
        const settledAmt = m[2] ? parseInt(m[2], 10) : pay.amount;
        map.set(targetId, (map.get(targetId) || 0) + settledAmt);
      }
    }
    return map;
  }, [payments]);

  const getSettledAmountPaise = useCallback(
    (paymentId: string) => settlementMap.get(paymentId) || 0,
    [settlementMap]
  );

  const handleOpenPayForBill = useCallback((b: any) => {
    setRecipientType("VENDOR");
    setSelectedPartyId(b.partyId || "");
    setRecipientName(b.party?.name || "Vendor");
    setSelectedBillId(b.id);
    setAmount(((b.outstandingAmount || b.totalAmount) / 100).toFixed(2));
    setPayingAccount("HDFC Bank Operating A/C (A/C: ...4421)");
    setCustomPayingAccount("");
    setReferenceNumber("");
    setApprovalQuery(`Payment for Bill #${formatShortBillNumber(b.billNumber)} (${b.party?.name || "Vendor"})`);

    setSettlingEntry({
      id: b.id,
      type: "BILL",
      referenceNumber: b.billNumber,
      totalAmount: b.totalAmount,
      settledAmount: b.paidAmount,
      remainingAmount: b.outstandingAmount,
      recipientName: b.party?.name,
    });

    setPaymentFile(null);
    setShowPaymentModal(true);
  }, []);

  const addBillLine = () => {
    setBillLines([
      ...billLines,
      { description: "", materialId: "", quantity: "", unitRate: "", lineTotal: "" },
    ]);
  };

  const removeBillLine = (index: number) => {
    if (billLines.length > 1) {
      setBillLines(billLines.filter((_, i) => i !== index));
    }
  };

  const updateBillLine = (index: number, field: string, value: string) => {
    const updated = [...billLines];
    const item = { ...updated[index], [field]: value };
    if ((field === "quantity" || field === "unitRate") && item.quantity && item.unitRate) {
      const q = parseFloat(item.quantity);
      const r = parseFloat(item.unitRate);
      if (!isNaN(q) && !isNaN(r)) {
        item.lineTotal = (q * r).toFixed(2);
      }
    }
    updated[index] = item;
    setBillLines(updated);
  };

  const handleBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billPartyId) {
      setErrorMessage("Please choose a vendor or contractor before saving this bill.");
      return;
    }
    if (!billNumber.trim()) {
      setErrorMessage("Please enter the bill or invoice number.");
      return;
    }

    const parsedLines = billLines.map((l) => {
      const qty = l.quantity ? parseFloat(l.quantity) : undefined;
      const rate = l.unitRate ? Math.round(parseFloat(l.unitRate) * 100) : undefined;
      const total = Math.round(parseFloat(l.lineTotal || "0") * 100);
      return {
        description: l.description || "Service / Supply Item",
        materialId: l.materialId || undefined,
        quantity: qty,
        unitRate: rate,
        lineTotal: total,
        gstRate: billGstRate !== "" && l.gstRate ? Number(l.gstRate) : undefined,
      };
    });

    if (parsedLines.some((l) => isNaN(l.lineTotal) || l.lineTotal <= 0)) {
      setErrorMessage("Each item line must have an amount greater than 0.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const finalBillNotes = [
      billNotes.trim(),
      billFile ? `[Attached Invoice Photo: ${billFile.name} | ${billFile.url}]` : "",
    ]
      .filter(Boolean)
      .join(" ");

    try {
      const res = await fetch("/api/finance/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId: billPartyId,
          projectId: billProjectId || undefined,
          billNumber: billNumber.trim(),
          billDate: new Date(billDate).toISOString(),
          dueDate: billDueDate ? new Date(billDueDate).toISOString() : undefined,
          notes: finalBillNotes || undefined,
          attachmentFileId: billFile?.fileId || undefined,
          gst:
            billGstRate === ""
              ? undefined
              : {
                  rate: Number(billGstRate),
                  interState: billTaxType === "AUTO" ? null : billTaxType === "IGST",
                  itcEligible: billItc,
                  reverseCharge: billRcm,
                },
          lines: parsedLines,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not save bill. Please check the details and try again.");
      } else {
        const totalAmountRupees = ((data.data?.totalAmount ?? parsedLines.reduce((s: number, l: any) => s + (l.lineTotal || 0), 0)) / 100).toFixed(2);
        setStatusMessage(`Bill #${billNumber} for ₹${totalAmountRupees} saved!`);
        setShowBillModal(false);
        setBillNumber("");
        setBillDueDate("");
        setBillNotes("");
        setBillGstRate("");
        setBillTaxType("AUTO");
        setBillItc(true);
        setBillRcm(false);
        setBillLines([{ description: "", materialId: "", quantity: "", unitRate: "", lineTotal: "" }]);
        setBillFile(null);
        loadData();
      }
    } catch {
      setErrorMessage("Connection error while saving bill. Check your internet connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const addChallanLine = () => {
    setChallanLines((prev) => [...prev, { description: "", materialId: "", quantity: "", unit: "BAG", isCustomUnit: false }]);
  };

  const removeChallanLine = (index: number) => {
    setChallanLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const updateChallanLine = (index: number, field: string, value: any) => {
    setChallanLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const updated = { ...line, [field]: value };
        if (field === "materialId" && value) {
          const mat = materials.find((m) => m.id === value);
          if (mat) {
            updated.description = mat.name;
            if (mat.unitCode) {
              updated.unit = mat.unitCode;
              updated.isCustomUnit = !CHALLAN_ALL_CODES.has(mat.unitCode);
            }
          }
        }
        return updated;
      })
    );
  };

  const handleChallanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challanPartyId) {
      setErrorMessage("Please select a vendor or contractor for the delivery challan.");
      return;
    }
    if (!challanNumber.trim()) {
      setErrorMessage("Please enter a challan number.");
      return;
    }
    if (!challanDate) {
      setErrorMessage("Please select the challan date.");
      return;
    }

    const validLines = challanLines
      .map((l) => ({
        description: l.description.trim() || "Delivered Material",
        materialId: l.materialId || undefined,
        quantity: parseFloat(l.quantity) || 0,
        unit: l.unit.trim(),
      }))
      .filter((l) => l.description.length > 0 && l.quantity > 0);

    if (validLines.length === 0) {
      setErrorMessage("Please add at least one material with a quantity greater than 0.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const finalChallanNotes = [
      challanNotes.trim(),
      challanFile ? `[Attached Challan Document: ${challanFile.name} | ${challanFile.url}]` : "",
    ]
      .filter(Boolean)
      .join(" ");

    try {
      const res = await fetch("/api/finance/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId: challanPartyId,
          projectId: challanProjectId || undefined,
          billNumber: challanNumber.trim(),
          billDate: new Date(challanDate).toISOString(),
          status: "CHALLAN",
          notes: finalChallanNotes || undefined,
          attachmentFileId: challanFile?.fileId || undefined,
          lines: validLines.map((l) => ({
            description: `${l.description}${l.unit ? ` (${l.unit})` : ""}`,
            materialId: l.materialId,
            quantity: l.quantity,
            unitRate: 0,
            lineTotal: 0,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not save challan. Please check details and try again.");
      } else {
        setStatusMessage(`Delivery Challan #${challanNumber.trim()} recorded successfully!`);
        setShowBillModal(false);
        setChallanPartyId("");
        setChallanProjectId("");
        setChallanNumber("");
        setChallanDate(istDateKey());
        setChallanNotes("");
        setChallanFile(null);
        setChallanLines([{ description: "", materialId: "", quantity: "", unit: "BAG" }]);
        loadData();
      }
    } catch {
      setErrorMessage("Connection error while saving challan. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const openGenerateBillModal = (bill: any) => {
    setGenerateBillTarget(bill);
    setGenInvoiceNumber(bill.billNumber ? `INV-${bill.billNumber}` : "");
    setGenBillDate(istDateKey());
    setGenDueDate("");
    setGenGstRate("18");
    setGenTaxType("AUTO");
    setGenItc(true);
    setGenRcm(false);
    setGenNotes("");
    const initialLines = (bill.lines || []).map((l: any) => ({
      id: l.id,
      description: l.description,
      materialId: l.materialId,
      quantity: l.quantity && l.quantity > 0 ? l.quantity : 1,
      unitRate: "",
      lineTotal: "",
      gstRate: "",
    }));
    setGenLines(
      initialLines.length > 0
        ? initialLines
        : [{ description: "Delivered Items", quantity: 1, unitRate: "", lineTotal: "" }]
    );
  };

  const updateGenLine = (index: number, field: string, value: any) => {
    setGenLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const updated = { ...line, [field]: value };
        if (field === "unitRate" || field === "quantity") {
          const qty = field === "quantity" ? parseFloat(value) || 0 : line.quantity;
          const rate = field === "unitRate" ? parseFloat(value) || 0 : parseFloat(line.unitRate) || 0;
          if (qty > 0 && rate > 0) {
            updated.lineTotal = (qty * rate).toFixed(2);
          }
        }
        return updated;
      })
    );
  };

  const handleGenerateBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!generateBillTarget) return;

    if (!genInvoiceNumber.trim()) {
      setErrorMessage("Please enter an invoice / bill number.");
      return;
    }

    const parsedLines = genLines.map((l) => {
      const qty = Number(l.quantity) || 1;
      const ratePaise = Math.round((parseFloat(l.unitRate) || 0) * 100);
      const totalPaise = Math.round((parseFloat(l.lineTotal) || 0) * 100);
      return {
        description: l.description,
        materialId: l.materialId || undefined,
        quantity: qty,
        unitRate: ratePaise,
        lineTotal: totalPaise > 0 ? totalPaise : Math.round(qty * ratePaise),
        gstRate: genGstRate !== "" && l.gstRate ? Number(l.gstRate) : undefined,
      };
    });

    if (parsedLines.some((l) => l.unitRate <= 0 || l.lineTotal <= 0)) {
      setErrorMessage("Please enter a valid rate greater than 0 for all material items.");
      return;
    }

    setGeneratingBill(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/finance/bills/${generateBillTarget.id}/generate-bill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billNumber: genInvoiceNumber.trim(),
          billDate: new Date(genBillDate).toISOString(),
          dueDate: genDueDate ? new Date(genDueDate).toISOString() : undefined,
          notes: genNotes.trim() || undefined,
          gst:
            genGstRate === ""
              ? undefined
              : {
                  rate: Number(genGstRate),
                  interState: genTaxType === "AUTO" ? null : genTaxType === "IGST",
                  itcEligible: genItc,
                  reverseCharge: genRcm,
                },
          lines: parsedLines,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Could not generate bill from challan.");
      } else {
        const totalAmountRupees = ((data.data?.bill?.totalAmount || 0) / 100).toFixed(2);
        setStatusMessage(`Bill #${genInvoiceNumber.trim()} generated successfully for ₹${totalAmountRupees}!`);
        setGenerateBillTarget(null);
        loadData();
      }
    } catch {
      setErrorMessage("Connection error while generating bill. Check your network connection.");
    } finally {
      setGeneratingBill(false);
    }
  };

  // Filter bills & payments by active site and target project
  const siteScopedBills = useMemo(() => {
    if (!selectedSiteId && !selectedProjectId) return bills;
    const siteProjectIds = selectedSiteId
      ? new Set(projects.filter((p) => p.siteId === selectedSiteId).map((p) => p.id))
      : null;

    return bills.filter((b) => {
      if (selectedProjectId) {
        return b.projectId === selectedProjectId;
      }
      if (selectedSiteId && siteProjectIds) {
        const bSiteId = b.project?.siteId || (b.projectId ? projects.find((pr) => pr.id === b.projectId)?.siteId : null);
        return bSiteId === selectedSiteId || (b.projectId && siteProjectIds.has(b.projectId));
      }
      return true;
    });
  }, [bills, selectedSiteId, selectedProjectId, projects]);

  const siteScopedPayments = useMemo(() => {
    if (!selectedSiteId && !selectedProjectId) return payments;
    const siteProjectIds = selectedSiteId
      ? new Set(projects.filter((p) => p.siteId === selectedSiteId).map((p) => p.id))
      : null;

    return payments.filter((p) => {
      if (selectedProjectId) {
        return p.projectId === selectedProjectId;
      }
      if (selectedSiteId && siteProjectIds) {
        const pSiteId = p.project?.siteId || (p.projectId ? projects.find((pr) => pr.id === p.projectId)?.siteId : null);
        return pSiteId === selectedSiteId || (p.projectId && siteProjectIds.has(p.projectId));
      }
      return true;
    });
  }, [payments, selectedSiteId, selectedProjectId, projects]);

  const totalBilledAll = siteScopedBills
    .filter((b: any) => b.status !== "CHALLAN")
    .reduce((sum: number, b: any) => sum + (b.totalAmount || 0), 0);
  const posted = siteScopedPayments.filter((p: any) => p.status === "POSTED");
  // Out of the bank; TDS held back from contractors is counted when it is deposited.
  const totalPaidAll = posted.reduce((sum: number, p: any) => sum + (p.amount || 0) - (p.tdsAmount || 0), 0);
  // Bills are settled by the full amount, TDS included.
  const totalOutstandingAll = totalBilledAll - posted.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

  const partyBills = siteScopedBills.filter(
    (b) => b.partyId === selectedPartyId && b.status !== "CHALLAN" && b.outstandingAmount > 0
  );

  // Distinct Paying Accounts extracted from existing payments
  const distinctPayingAccounts = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => {
      const acc = p.payingAccount?.trim() || "Company Primary Account";
      if (acc) set.add(acc);
    });
    return Array.from(set).sort();
  }, [payments]);

  // Distinct Methods extracted from existing payments
  const distinctMethods = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => {
      if (p.method) set.add(p.method);
    });
    return Array.from(set).sort();
  }, [payments]);

  const activePaymentFiltersCount = useMemo(() => {
    let count = 0;
    if (paymentSearch.trim()) count++;
    if (paymentFromDate) count++;
    if (paymentToDate) count++;
    if (paymentPayeeType !== "ALL") count++;
    if (paymentPayingAccount !== "ALL") count++;
    if (paymentMethod !== "ALL") count++;
    if (paymentStatus !== "ALL") count++;
    if (paymentReason.trim()) count++;
    if (paymentAllocatedTo.trim()) count++;
    if (paymentMinAmount.trim()) count++;
    if (paymentMaxAmount.trim()) count++;
    return count;
  }, [
    paymentSearch,
    paymentFromDate,
    paymentToDate,
    paymentPayeeType,
    paymentPayingAccount,
    paymentMethod,
    paymentStatus,
    paymentReason,
    paymentAllocatedTo,
    paymentMinAmount,
    paymentMaxAmount,
  ]);

  const clearAllPaymentFilters = () => {
    setPaymentSearch("");
    setPaymentFromDate("");
    setPaymentToDate("");
    setPaymentPayeeType("ALL");
    setPaymentPayingAccount("ALL");
    setPaymentMethod("ALL");
    setPaymentStatus("ALL");
    setPaymentReason("");
    setPaymentAllocatedTo("");
    setPaymentMinAmount("");
    setPaymentMaxAmount("");
    setDatePreset("ALL");
    setAmountPreset("ALL");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/finance?tab=payments");
    }
  };

  const paymentCounts = useMemo(() => {
    return {
      all: siteScopedPayments.length,
      posted: siteScopedPayments.filter((p) => p.status === "POSTED" || p.status === "APPROVED").length,
      pending: siteScopedPayments.filter((p) => p.status === "PENDING_APPROVAL").length,
      rejected: siteScopedPayments.filter((p) => p.status === "REJECTED").length,
      reversed: siteScopedPayments.filter((p) => p.status === "REVERSED").length,
      vendors: siteScopedPayments.filter((p) => (p.recipientType || p.party?.type || "VENDOR") === "VENDOR").length,
      contractors: siteScopedPayments.filter((p) => (p.recipientType || p.party?.type) === "CONTRACTOR").length,
      employees: siteScopedPayments.filter((p) => (p.recipientType || p.party?.type) === "EMPLOYEE").length,
    };
  }, [siteScopedPayments]);

  const handleDatePreset = (preset: "ALL" | "TODAY" | "THIS_MONTH" | "LAST_30" | "CUSTOM") => {
    setDatePreset(preset);
    const now = new Date();
    const today = istDateKey(now);

    if (preset === "ALL") {
      setPaymentFromDate("");
      setPaymentToDate("");
    } else if (preset === "TODAY") {
      setPaymentFromDate(today);
      setPaymentToDate(today);
    } else if (preset === "THIS_MONTH") {
      const first = `${today.slice(0, 7)}-01`;
      setPaymentFromDate(first);
      setPaymentToDate(today);
    } else if (preset === "LAST_30") {
      const past = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      setPaymentFromDate(istDateKey(past));
      setPaymentToDate(today);
    } else if (preset === "CUSTOM") {
      setShowAdvancedFilters(true);
    }
  };

  const handleBillDatePreset = (preset: "ALL" | "TODAY" | "THIS_MONTH" | "LAST_30" | "CUSTOM") => {
    setBillDatePreset(preset);
    const now = new Date();
    const today = istDateKey(now);

    if (preset === "ALL") {
      setBillFromDate("");
      setBillToDate("");
    } else if (preset === "TODAY") {
      setBillFromDate(today);
      setBillToDate(today);
    } else if (preset === "THIS_MONTH") {
      const first = `${today.slice(0, 7)}-01`;
      setBillFromDate(first);
      setBillToDate(today);
    } else if (preset === "LAST_30") {
      const past = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      setBillFromDate(istDateKey(past));
      setBillToDate(today);
    }
  };

  const handleAmountPreset = (preset: "ALL" | "UNDER_50K" | "50K_2L" | "OVER_2L" | "CUSTOM") => {
    setAmountPreset(preset);
    if (preset === "ALL") {
      setPaymentMinAmount("");
      setPaymentMaxAmount("");
    } else if (preset === "UNDER_50K") {
      setPaymentMinAmount("");
      setPaymentMaxAmount("50000");
    } else if (preset === "50K_2L") {
      setPaymentMinAmount("50000");
      setPaymentMaxAmount("200000");
    } else if (preset === "OVER_2L") {
      setPaymentMinAmount("200000");
      setPaymentMaxAmount("");
    } else if (preset === "CUSTOM") {
      setShowAdvancedFilters(true);
    }
  };

  const scrollToTable = () => {
    if (typeof document !== "undefined") {
      const el = document.getElementById("finance-records-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  };

  const handleFilterTotalBilled = () => {
    setActiveTab("BILLS");
    setBillStatus("ALL");
    setBillDatePreset("ALL");
    setBillFromDate("");
    setBillToDate("");
    setBillSearch("");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/finance?tab=bills&status=all");
    }
    scrollToTable();
  };

  const handleFilterTotalPaid = () => {
    setActiveTab("PAYMENTS");
    setPaymentStatus("POSTED");
    setDatePreset("ALL");
    setPaymentFromDate("");
    setPaymentToDate("");
    setPaymentSearch("");
    setPaymentPayeeType("ALL");
    setPaymentPayingAccount("ALL");
    setPaymentMethod("ALL");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/finance?tab=payments&status=paid");
    }
    scrollToTable();
  };

  const handleFilterUnpaidBalance = () => {
    setActiveTab("BILLS");
    setBillStatus("PENDING");
    setBillDatePreset("ALL");
    setBillFromDate("");
    setBillToDate("");
    setBillSearch("");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/finance?tab=bills&status=pending");
    }
    scrollToTable();
  };

  const exportPaymentsToCSV = () => {
    if (filteredPayments.length === 0) return;
    const headers = [
      "Payment Date",
      "Ref Number",
      "Payee Name",
      "Payee Type",
      "Paid From (Account)",
      "Method",
      "Payment Purpose",
      "Linked Bills",
      "Amount (Rupees)",
      "Status",
    ];

    const rows = filteredPayments.map((p) => {
      const payee = (p.recipientName || p.party?.name || "Recipient").replace(/"/g, '""');
      const rType = p.recipientType || p.party?.type || "VENDOR";
      const payingAcc = (p.payingAccount || "Company Primary Account").replace(/"/g, '""');
      const note = (p.approvalQuery || p.notes || p.rejectionReason || "").replace(/"/g, '""');
      const allocs = (
        p.allocations && p.allocations.length > 0
          ? p.allocations.map((a: any) => `Bill #${a.bill?.billNumber || a.billId} (₹${((a.amount || 0) / 100).toFixed(2)})`).join("; ")
          : "Unallocated"
      ).replace(/"/g, '""');
      const amtRupees = ((p.amount || 0) / 100).toFixed(2);
      const st = p.status || "POSTED";

      return [
        `"${formatDate(p.paymentDate)}"`,
        `"${p.referenceNumber || ""}"`,
        `"${payee}"`,
        `"${rType}"`,
        `"${payingAcc}"`,
        `"${p.method || ""}"`,
        `"${note}"`,
        `"${allocs}"`,
        amtRupees,
        `"${st}"`,
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payments_register_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredPayments = useMemo(() => {
    return siteScopedPayments.filter((p) => {
      const payee = (p.recipientName || p.party?.name || "Recipient").toLowerCase();
      const rType = (p.recipientType || p.party?.type || "VENDOR").toUpperCase();
      const payingAcc = (p.payingAccount || "Company Primary Account").toLowerCase();
      const methodStr = (p.method || "").toUpperCase();
      const reasonStr = `${p.approvalQuery || ""} ${p.notes || ""} ${p.rejectionReason || ""}`.toLowerCase();
      const refStr = (p.referenceNumber || "").toLowerCase();
      const creatorName = (p.creator?.name || "").toLowerCase();

      // Allocations
      const hasAllocations = p.allocations && p.allocations.length > 0;
      const allocationsStr = hasAllocations
        ? p.allocations
            .map((a: any) => `bill #${a.bill?.billNumber || a.billId} ${a.bill?.billNumber || a.billId}`)
            .join(" ")
            .toLowerCase()
        : "unallocated missing bill allocation";

      const pStatus = (p.status || "").toUpperCase();
      const amtRupees = (Number(p.amount) || 0) / 100;
      const formattedDateStr = formatDate(p.paymentDate).toLowerCase();

      // Normalize date to YYYY-MM-DD in IST
      let pDateYMD = "";
      if (p.paymentDate) {
        try {
          const d = typeof p.paymentDate === "string" ? new Date(p.paymentDate) : p.paymentDate;
          if (!isNaN(d.getTime())) {
            pDateYMD = istDateKey(d);
          }
        } catch {
          pDateYMD = "";
        }
      }

      // 1. Global Search (matches across all columns)
      if (paymentSearch.trim()) {
        const q = paymentSearch.trim().toLowerCase();
        const matchesGlobal =
          payee.includes(q) ||
          rType.toLowerCase().includes(q) ||
          refStr.includes(q) ||
          payingAcc.includes(q) ||
          methodStr.toLowerCase().includes(q) ||
          reasonStr.includes(q) ||
          allocationsStr.includes(q) ||
          creatorName.includes(q) ||
          pStatus.toLowerCase().includes(q) ||
          amtRupees.toString().includes(q) ||
          (p.amount / 100).toFixed(2).includes(q) ||
          pDateYMD.includes(q) ||
          formattedDateStr.includes(q);

        if (!matchesGlobal) return false;
      }

      // 2. Date Range: From Date & To Date
      if (paymentFromDate) {
        if (!pDateYMD || pDateYMD < paymentFromDate) return false;
      }
      if (paymentToDate) {
        if (!pDateYMD || pDateYMD > paymentToDate) return false;
      }

      // 3. Payee Type Filter
      if (paymentPayeeType !== "ALL") {
        if (rType !== paymentPayeeType) return false;
      }

      // 4. Paying Account (Source)
      if (paymentPayingAccount !== "ALL") {
        const acc = p.payingAccount?.trim() || "Company Primary Account";
        if (acc !== paymentPayingAccount) return false;
      }

      // 5. Method Filter
      if (paymentMethod !== "ALL") {
        if (methodStr !== paymentMethod.toUpperCase()) return false;
      }

      // 6. Reason / Query filter
      if (paymentReason.trim()) {
        const qReason = paymentReason.trim().toLowerCase();
        if (!reasonStr.includes(qReason)) return false;
      }

      // 7. Allocated To filter
      if (paymentAllocatedTo.trim()) {
        const qAlloc = paymentAllocatedTo.trim().toLowerCase();
        if (qAlloc === "unallocated") {
          if (hasAllocations) return false;
        } else if (qAlloc === "allocated") {
          if (!hasAllocations) return false;
        } else {
          if (!allocationsStr.includes(qAlloc)) return false;
        }
      }

      // 8. Amount Range (Min / Max in Rupees)
      if (paymentMinAmount.trim()) {
        const minVal = parseFloat(paymentMinAmount);
        if (!isNaN(minVal) && amtRupees < minVal) return false;
      }
      if (paymentMaxAmount.trim()) {
        const maxVal = parseFloat(paymentMaxAmount);
        if (!isNaN(maxVal) && amtRupees > maxVal) return false;
      }

      // 9. Status filter
      if (paymentStatus !== "ALL") {
        if (paymentStatus === "APPROVED" || paymentStatus === "POSTED") {
          if (p.status !== "POSTED" && p.status !== "APPROVED") return false;
        } else {
          if (p.status !== paymentStatus) return false;
        }
      }

      return true;
    });
  }, [
    siteScopedPayments,
    paymentSearch,
    paymentFromDate,
    paymentToDate,
    paymentPayeeType,
    paymentPayingAccount,
    paymentMethod,
    paymentStatus,
    paymentReason,
    paymentAllocatedTo,
    paymentMinAmount,
    paymentMaxAmount,
  ]);

  const filteredPaymentsTotal = useMemo(() => {
    return filteredPayments.reduce((sum, p) => {
      // Exclude rejected payment queries and reversed payments from the disbursed financial total
      if (p.status === "REJECTED" || p.status === "REVERSED" || p.reversedAt) {
        // Only include if user specifically filtered by that status
        if (paymentStatus !== "REJECTED" && paymentStatus !== "REVERSED") return sum;
      }
      return sum + (Number(p.amount) || 0);
    }, 0);
  }, [filteredPayments, paymentStatus]);

  const filteredBills = useMemo(() => {
    return siteScopedBills.filter((b) => {
      if (billStatus === "CHALLAN") {
        if (b.status !== "CHALLAN") return false;
      } else if (billStatus === "PAID") {
        if (b.status === "CHALLAN" || b.outstandingAmount > 0) return false;
      } else if (billStatus === "PENDING") {
        if (b.status === "CHALLAN" || b.outstandingAmount === 0) return false;
      }

      // Date range filtering for bills
      let bDateYMD = "";
      if (b.billDate) {
        try {
          const d = typeof b.billDate === "string" ? new Date(b.billDate) : b.billDate;
          if (!isNaN(d.getTime())) {
            bDateYMD = istDateKey(d);
          }
        } catch {
          bDateYMD = "";
        }
      }
      if (billFromDate && (!bDateYMD || bDateYMD < billFromDate)) return false;
      if (billToDate && (!bDateYMD || bDateYMD > billToDate)) return false;

      return true;
    });
  }, [siteScopedBills, billStatus, billFromDate, billToDate]);

  // Feature 18: Filter-based dynamic payment totals
  const filteredPaymentsStats = useMemo(() => {
    let totalPaise = 0;
    let totalTdsPaise = 0;
    filteredPayments.forEach((p) => {
      totalPaise += p.amount || 0;
      totalTdsPaise += p.tdsAmount || 0;
    });
    return {
      count: filteredPayments.length,
      totalPaise,
      netPaidPaise: totalPaise - totalTdsPaise,
    };
  }, [filteredPayments]);

  // Feature 18: Filter-based dynamic bill totals
  const filteredBillsStats = useMemo(() => {
    let totalPaise = 0;
    let outstandingPaise = 0;
    let challanCount = 0;
    filteredBills.forEach((b) => {
      if (b.status === "CHALLAN") {
        challanCount++;
      } else {
        totalPaise += b.totalAmount || 0;
        outstandingPaise += b.outstandingAmount || 0;
      }
    });
    return {
      count: filteredBills.length,
      challanCount,
      totalPaise,
      outstandingPaise,
    };
  }, [filteredBills]);

  const paymentColumns: ExcelColumn<any>[] = useMemo(
    () => [
      {
        key: "date",
        label: "Date & Ref",
        accessor: (p) => `${formatDate(p.paymentDate)} ${p.referenceNumber || ""}`,
        type: "text",
      },
      {
        key: "payee",
        label: "Payee & Type",
        accessor: (p) => p.recipientName || p.party?.name || "Recipient",
        type: "text",
      },
      {
        key: "payingAccount",
        label: "Paid From (Account)",
        accessor: (p) => p.payingAccount || "Company Primary Account",
        type: "text",
      },
      {
        key: "method",
        label: "Method",
        accessor: (p) => p.method || "—",
        type: "text",
      },
      {
        key: "reason",
        label: "Payment Purpose",
        accessor: (p) => p.approvalQuery || p.notes || "—",
        type: "text",
      },
      {
        key: "allocatedTo",
        label: "Linked Bill",
        accessor: (p) => {
          if (p.allocations && p.allocations.length > 0) {
            return p.allocations.map((a: any) => `Bill #${a.bill?.billNumber || a.billId}`).join(", ");
          }
          return "Unallocated";
        },
        type: "text",
      },
      {
        key: "amount",
        label: "Amount",
        accessor: (p) => (Number(p.amount) || 0) / 100,
        type: "currency",
        align: "right",
      },
      {
        key: "status",
        label: "Status",
        accessor: (p) => {
          if (p.status === "PENDING_APPROVAL") return "Pending Super Admin";
          if (p.status === "REJECTED") return "Rejected";
          if (p.status === "REVERSED") return "Reversed";
          return "Approved";
        },
        type: "text",
        align: "center",
      },
    ],
    []
  );

  const excelPayments = useExcelTable({
    data: filteredPayments,
    columns: paymentColumns,
  });

  const billColumns: ExcelColumn<any>[] = useMemo(
    () => [
      {
        key: "billNumber",
        label: "Bill #",
        accessor: (b) => b.billNumber,
        type: "text",
      },
      {
        key: "vendor",
        label: "Vendor",
        accessor: (b) => b.party?.name || "—",
        type: "text",
      },
      {
        key: "billDate",
        label: "Bill Date",
        accessor: (b) => formatDate(b.billDate),
        type: "date",
      },
      {
        key: "totalAmount",
        label: "Total Amount",
        accessor: (b) => (Number(b.totalAmount) || 0) / 100,
        type: "currency",
        align: "right",
      },
      {
        key: "paidAmount",
        label: "Amount Paid",
        accessor: (b) => (Number(b.paidAmount) || 0) / 100,
        type: "currency",
        align: "right",
      },
      {
        key: "outstandingAmount",
        label: "Unpaid Balance",
        accessor: (b) => (Number(b.outstandingAmount) || 0) / 100,
        type: "currency",
        align: "right",
      },
      {
        key: "status",
        label: "Status",
        accessor: (b) => (b.status === "CHALLAN" ? "CHALLAN" : b.outstandingAmount === 0 ? "PAID" : "PENDING"),
        type: "text",
        align: "center",
      },
    ],
    []
  );

  const excelBills = useExcelTable({
    data: filteredBills,
    columns: billColumns,
  });

  // Option for Grand Total in tables (persisted in localStorage)
  const [showGrandTotal, setShowGrandTotal] = useState(true);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("bothra_show_grand_total");
      if (saved !== null) {
        setShowGrandTotal(saved === "true");
      }
    }
  }, []);

  const toggleGrandTotal = useCallback(() => {
    setShowGrandTotal((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("bothra_show_grand_total", String(next));
      }
      return next;
    });
  }, []);

  // Grand totals computed on the current filtered data of payments table
  const paymentsGrandTotal = useMemo(() => {
    let totalPaise = 0;
    let totalTdsPaise = 0;
    let totalSettledPaise = 0;
    let totalRemainingPaise = 0;
    let outOfPocketCount = 0;

    for (const p of excelPayments.filteredData) {
      if (p.status === "REJECTED" || p.status === "REVERSED") continue;
      const amt = Number(p.amount) || 0;
      totalPaise += amt;
      totalTdsPaise += Number(p.tdsAmount) || 0;

      const isOutOfPocket =
        p.payingAccount === "Supervisor Out-of-Pocket" ||
        p.recipientType === "OUT_OF_POCKET" ||
        (p.notes && p.notes.includes("[Cash Expense]"));

      if (isOutOfPocket) {
        outOfPocketCount++;
        const settled = getSettledAmountPaise(p.id);
        const rem = Math.max(0, amt - settled);
        totalSettledPaise += settled;
        totalRemainingPaise += rem;
      }
    }

    const activeCount = excelPayments.filteredData.filter(
      (p) => p.status !== "REJECTED" && p.status !== "REVERSED"
    ).length;

    return {
      count: excelPayments.filteredData.length,
      activeCount,
      totalPaise,
      totalTdsPaise,
      totalSettledPaise,
      totalRemainingPaise,
      outOfPocketCount,
    };
  }, [excelPayments.filteredData, getSettledAmountPaise]);

  // Grand totals computed on the current filtered data of vendor bills table
  const billsGrandTotal = useMemo(() => {
    let totalPaise = 0;
    let paidPaise = 0;
    let outstandingPaise = 0;
    let challanCount = 0;

    for (const b of excelBills.filteredData) {
      if (b.status === "CHALLAN") {
        challanCount++;
      } else {
        totalPaise += Number(b.totalAmount) || 0;
        paidPaise += Number(b.paidAmount) || 0;
        outstandingPaise += Number(b.outstandingAmount) || 0;
      }
    }

    return {
      count: excelBills.filteredData.length,
      challanCount,
      totalPaise,
      paidPaise,
      outstandingPaise,
    };
  }, [excelBills.filteredData]);

  if (!loading && currentUser && !canReadFinance) {
    return (
      <Shell>
        <div className="max-w-md mx-auto py-20 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <DollarSign className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-black text-slate-900">Access Restricted</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Payments and bills are restricted to Authorized Finance and Admin accounts. Your role ({currentUser.role}) does not have permission to view or manage financial records.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition shadow-sm"
          >
            Return to Dashboard
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader icon={DollarSign} title="Payments & Bills" subtitle="Record vendor & contractor bills, track unpaid balances, and manage payments in one place.">

          <div className="w-full sm:w-auto grid grid-cols-1 sm:flex sm:items-center gap-2">
            {canWriteFinance && (
              <button
                type="button"
                onClick={() => {
                  if (parties.length > 0) setBillPartyId(parties[0].id);
                  setShowBillModal(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs whitespace-nowrap shrink-0 shadow-sm transition-all cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>Record Bill</span>
              </button>
            )}
            {canRecordPayment && (
              <button
                type="button"
                onClick={() => {
                  if (parties.length > 0) {
                    const firstVendor = parties.find((p) => {
                      const pt = (p.partyType || p.type || "VENDOR").toUpperCase();
                      return pt === "VENDOR" || pt === "BOTH";
                    }) || parties[0];
                    setSelectedPartyId(firstVendor.id);
                    setRecipientName(firstVendor.name);
                  }
                  if (!paymentSiteId && (activeSiteId || sites.length > 0)) {
                    setPaymentSiteId(activeSiteId || sites[0]?.id || "");
                  }
                  setShowPaymentModal(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs whitespace-nowrap shrink-0 shadow-sm transition-all cursor-pointer"
              >
                <CreditCard className="w-4 h-4 shrink-0" />
                <span>Record Payment</span>
              </button>
            )}
          </div>
        </PageHeader>

        {/* Feedback alerts */}
        {statusMessage && <Alert tone="success">{statusMessage}</Alert>}
        {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

        {/* Construction Site & Project Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
            {/* Target Construction Site Selector */}
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
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
                >
                  <option value="">All Sites (All Payments &amp; Bills)</option>
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
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
          </div>
        </div>

        {/* Financial KPI Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={handleFilterTotalBilled}
            className={`text-left p-4 rounded-xl border transition-all duration-150 cursor-pointer shadow-xs hover:shadow-md hover:-translate-y-0.5 group focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
              activeTab === "BILLS" && billStatus === "ALL" && billDatePreset === "ALL"
                ? "bg-blue-50/50 border-blue-400 ring-2 ring-blue-500/20"
                : "bg-white border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-blue-700 transition-colors">
                Total Billed (Liability)
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                activeTab === "BILLS" && billStatus === "ALL" && billDatePreset === "ALL"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-700"
              }`}>
                {activeTab === "BILLS" && billStatus === "ALL" && billDatePreset === "ALL" ? "Filtering Table" : "Filter Bills"}
              </span>
            </div>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums tracking-tight leading-tight truncate" title={formatCurrency(totalBilledAll)}>
              {formatCompactINR(totalBilledAll)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Total across all recorded vendor &amp; contractor bills</div>
          </button>

          <button
            type="button"
            onClick={handleFilterTotalPaid}
            className={`text-left p-4 rounded-xl border transition-all duration-150 cursor-pointer shadow-xs hover:shadow-md hover:-translate-y-0.5 group focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
              activeTab === "PAYMENTS" && (paymentStatus === "POSTED" || paymentStatus === "APPROVED") && datePreset === "ALL"
                ? "bg-emerald-50/50 border-emerald-400 ring-2 ring-emerald-500/20"
                : "bg-white border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-emerald-700 transition-colors">
                Total Paid
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                activeTab === "PAYMENTS" && (paymentStatus === "POSTED" || paymentStatus === "APPROVED") && datePreset === "ALL"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-500 group-hover:bg-emerald-100 group-hover:text-emerald-700"
              }`}>
                {activeTab === "PAYMENTS" && (paymentStatus === "POSTED" || paymentStatus === "APPROVED") && datePreset === "ALL" ? "Filtering Table" : "Filter Payments"}
              </span>
            </div>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-emerald-600 mt-1 tabular-nums tracking-tight leading-tight truncate" title={formatCurrency(totalPaidAll)}>
              {formatCompactINR(totalPaidAll)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Approved payments released (excluding reversed)</div>
          </button>

          <button
            type="button"
            onClick={handleFilterUnpaidBalance}
            className={`text-left p-4 rounded-xl border transition-all duration-150 cursor-pointer shadow-xs hover:shadow-md hover:-translate-y-0.5 group focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${
              activeTab === "BILLS" && billStatus === "PENDING" && billDatePreset === "ALL"
                ? "bg-amber-50/70 border-amber-400 ring-2 ring-amber-500/20"
                : "bg-gradient-to-br from-amber-50/30 to-white border-slate-200 hover:border-amber-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider group-hover:text-amber-900 transition-colors">
                Unpaid Balance (Payables)
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                activeTab === "BILLS" && billStatus === "PENDING" && billDatePreset === "ALL"
                  ? "bg-amber-600 text-white"
                  : "bg-amber-100/80 text-amber-800 group-hover:bg-amber-200"
              }`}>
                {activeTab === "BILLS" && billStatus === "PENDING" && billDatePreset === "ALL" ? "Filtering Table" : "Filter Unpaid"}
              </span>
            </div>
            <div className="font-display text-xl sm:text-2xl font-extrabold text-amber-600 mt-1 tabular-nums tracking-tight leading-tight truncate" title={formatCurrency(totalOutstandingAll)}>
              {formatCompactINR(totalOutstandingAll)}
            </div>
            <div className="text-[11px] text-amber-700 font-medium mt-1">
              Amount still owed across unpaid bills
            </div>
          </button>
        </div>

        {/* Tab Controls */}
        <div id="finance-records-section" className="flex items-center gap-1.5 sm:gap-2 border-b border-slate-200 pb-2 overflow-x-auto max-w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setActiveTab("PAYMENTS")}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === "PAYMENTS"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <CreditCard className="w-4 h-4 shrink-0" />
            <span>
              <span className="sm:hidden">Payments</span>
              <span className="hidden sm:inline">Payments Register</span>
              {` (${
                filteredPayments.length !== payments.length
                  ? `${filteredPayments.length} of ${payments.length}`
                  : payments.length
              })`}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("BILLS")}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === "BILLS"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <Receipt className="w-4 h-4 shrink-0" />
            <span>
              <span className="sm:hidden">Bills</span>
              <span className="hidden sm:inline">Vendor Bills</span>
              {` (${
                filteredBills.length !== bills.length
                  ? `${filteredBills.length} of ${bills.length}`
                  : bills.length
              })`}
            </span>
          </button>
        </div>

        {/* Payments Table */}
        {activeTab === "PAYMENTS" && (
          <div className="space-y-4">
            {/* Quick Date Presets & Custom Picker */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1">
                  <Calendar className="w-3.5 h-3.5 text-amber-500" />
                  <span>Payments Date:</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleDatePreset("TODAY")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    datePreset === "TODAY"
                      ? "bg-amber-500 text-slate-950 shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => handleDatePreset("THIS_MONTH")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    datePreset === "THIS_MONTH"
                      ? "bg-amber-500 text-slate-950 shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => handleDatePreset("LAST_30")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    datePreset === "LAST_30"
                      ? "bg-amber-500 text-slate-950 shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  Last 30 Days
                </button>
                <button
                  type="button"
                  onClick={() => handleDatePreset("ALL")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    datePreset === "ALL"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  All Time
                </button>
              </div>

              {/* Date Inputs */}
              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-semibold text-[11px]">From:</span>
                  <input
                    type="date"
                    value={paymentFromDate}
                    onChange={(e) => {
                      setPaymentFromDate(e.target.value);
                      setDatePreset("CUSTOM");
                    }}
                    className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-semibold text-[11px]">To:</span>
                  <input
                    type="date"
                    value={paymentToDate}
                    onChange={(e) => {
                      setPaymentToDate(e.target.value);
                      setDatePreset("CUSTOM");
                    }}
                    className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                {(paymentFromDate || paymentToDate) && (
                  <button
                    type="button"
                    onClick={() => handleDatePreset("ALL")}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer"
                    title="Clear date filter"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Payee Type & Cash Expenses Integration (Feature 10) */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-semibold text-[11px]">Payee:</span>
                <select
                  value={paymentPayeeType}
                  onChange={(e) => setPaymentPayeeType(e.target.value)}
                  className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="ALL">All Payees (Vendors, Labor & Expenses)</option>
                  <option value="VENDOR">Vendors / Suppliers</option>
                  <option value="CONTRACTOR">Contractors & Labor</option>
                  <option value="EMPLOYEE">Employees / Staff</option>
                  <option value="OUT_OF_POCKET">Cash Expenses (Petty Cash)</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-semibold text-[11px]">Status:</span>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                  className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="POSTED">Approved & Released</option>
                  <option value="PENDING_APPROVAL">Pending Approval</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="REVERSED">Reversed</option>
                </select>
              </div>

              {(paymentStatus !== "ALL" || paymentPayeeType !== "ALL" || paymentFromDate || paymentToDate || paymentSearch) && (
                <button
                  type="button"
                  onClick={clearAllPaymentFilters}
                  className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Dynamic Filtered Total Banner (Feature 18) */}
            <div className="bg-gradient-to-r from-emerald-50 via-teal-50/50 to-white dark:from-emerald-950/20 dark:to-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-xs">
                  ₹
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                    Filtered Total Payments
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(filteredPaymentsStats.totalPaise)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                <div>
                  <span className="text-slate-500 block">Matched Payments</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{filteredPaymentsStats.count} records</span>
                </div>
                <div className="border-l border-slate-200 dark:border-slate-700 pl-4">
                  <span className="text-slate-500 block">Net Released (excl. TDS)</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(filteredPaymentsStats.netPaidPaise)}</span>
                </div>
              </div>
            </div>

            {/* Payments Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <ExcelTableToolbar
                table={excelPayments}
                columns={paymentColumns}
                tableName="payments"
                showSearch={true}
                showExport={true}
              />

              {/* Option of Grand Total Toolbar Bar */}
              <div className="bg-slate-50 border-b border-slate-200 px-3 sm:px-4 py-2 flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 text-amber-600" />
                    <span>Grand Total:</span>
                  </span>
                  <span className="font-mono font-black text-slate-900 bg-amber-100/90 text-amber-950 px-2 py-0.5 rounded border border-amber-300 text-xs sm:text-sm">
                    {formatCurrency(paymentsGrandTotal.totalPaise)}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    ({paymentsGrandTotal.activeCount} payments)
                  </span>
                </div>

                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  {/* View Mode Switcher: Cards (Default) / Table */}
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setPaymentViewMode("CARDS")}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                        paymentViewMode === "CARDS"
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
                      onClick={() => setPaymentViewMode("TABLE")}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                        paymentViewMode === "TABLE"
                          ? "bg-slate-900 text-white shadow-2xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                      title="Table View"
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>Table</span>
                    </button>
                  </div>

                  {paymentViewMode === "TABLE" && (
                    <button
                      type="button"
                      onClick={toggleGrandTotal}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition border cursor-pointer ${
                        showGrandTotal
                          ? "bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-600 shadow-2xs"
                          : "bg-white hover:bg-slate-100 text-slate-600 border-slate-300"
                      }`}
                      title="Toggle Grand Total footer row in the table"
                    >
                      <Calculator className="w-3 h-3" />
                      <span>{showGrandTotal ? "Grand Total Row: ON" : "Grand Total Row: OFF"}</span>
                    </button>
                  )}
                </div>
              </div>
              {/* Payments Content: Cards (Default) vs Table */}
              {paymentViewMode === "TABLE" ? (
                <div className="overflow-x-auto min-h-[400px]">
                <table className="w-full text-left text-sm min-w-[760px]">
                  <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                    <tr>
                      {paymentColumns.map((col) => (
                        <ExcelColumnHeader
                          key={col.key}
                          column={col}
                          table={excelPayments}
                          theme="darkHeader"
                        />
                      ))}
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {excelPayments.paginatedData.map((p) => {
                      const isReversed = p.status === "REVERSED";
                      const isPending = p.status === "PENDING_APPROVAL";
                      const isRejected = p.status === "REJECTED";
                      const payee = p.recipientName || p.party?.name || "Recipient";
                      const rType = p.recipientType || p.party?.type || "VENDOR";
                      const canSuperAdminAct =
                        currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ORG_ADMIN";
                      const isOutOfPocket =
                        p.payingAccount === "Supervisor Out-of-Pocket" ||
                        p.recipientType === "OUT_OF_POCKET" ||
                        (p.notes && p.notes.includes("[Cash Expense]"));
                      const settledPaise = getSettledAmountPaise(p.id);
                      const remainingPaise = Math.max(0, p.amount - settledPaise);

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 text-xs font-mono text-slate-600">
                            <div className="font-bold text-slate-800">{formatDate(p.paymentDate)}</div>
                            <div className="text-[11px] text-slate-400">Ref: {p.referenceNumber}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                              {p.partyId ? (
                                <Link
                                  href={`/parties/${p.partyId}`}
                                  className="hover:text-amber-600 hover:underline"
                                >
                                  {payee}
                                </Link>
                              ) : (
                                <span>{payee}</span>
                              )}
                              <span
                                className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${
                                  rType === "EMPLOYEE"
                                    ? "bg-amber-50 text-amber-800 border-amber-300"
                                    : rType === "CONTRACTOR"
                                    ? "bg-purple-50 text-purple-800 border-purple-300"
                                    : "bg-blue-50 text-blue-800 border-blue-300"
                                }`}
                              >
                                {rType}
                              </span>
                            </div>
                            {p.creator?.name && (
                              <div className="text-[10px] text-slate-400">By: {p.creator.name}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                              <Landmark className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{p.payingAccount || "Company Primary Account"}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                              {p.method}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs min-w-[180px] max-w-xs break-words">
                            <div className="text-slate-700 break-words whitespace-normal" title={p.approvalQuery || p.notes || ""}>
                              {p.approvalQuery || p.notes || "—"}
                            </div>
                            {isRejected && p.rejectionReason && (
                              <div className="text-[10px] text-rose-600 font-semibold mt-0.5 break-words whitespace-normal">
                                Declined: {p.rejectionReason}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">
                            {p.allocations && p.allocations.length > 0 ? (
                              p.allocations.map((a: any) => (
                                <div key={a.id} className="font-mono text-[11px]" title={a.bill?.billNumber || a.billId}>
                                  Bill #{formatShortBillNumber(a.bill?.billNumber || a.billId)} ({formatCurrency(a.amount)})
                                </div>
                              ))
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-slate-400 italic">Advance / General</span>
                                <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded w-fit">
                                  Not Linked to a Bill
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-black tabular-nums">
                            <span
                              className={
                                isReversed || isRejected
                                  ? "line-through text-slate-400"
                                  : isPending
                                  ? "text-amber-700 font-bold"
                                  : "text-emerald-600"
                              }
                            >
                              {formatCurrency(p.amount)}
                            </span>
                            {p.tdsAmount > 0 && (
                              <div className="whitespace-nowrap text-[10px] font-semibold leading-tight text-indigo-700" title={p.tdsNote || undefined}>
                                <div>TDS {formatCurrency(p.tdsAmount)} held</div>
                                <div className="text-slate-500">Bank paid {formatCurrency(p.amount - p.tdsAmount)}</div>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isPending ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>Waiting for Approval</span>
                              </span>
                            ) : isRejected ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-rose-100 text-rose-800 border border-rose-200">
                                Rejected
                              </span>
                            ) : isReversed ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-slate-100 text-slate-700">
                                Reversed
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Approved</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() =>
                                  setAttachmentTarget({
                                    type: "PAYMENT",
                                    id: p.id,
                                    title: `Payment Receipt: ${p.referenceNumber || p.id.slice(0, 8)}`,
                                    categoryDefault: "PAYMENT_RECEIPT",
                                  })
                                }
                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                                title="Attach or view payment receipt"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                              </button>
                              {isPending && canSuperAdminAct ? (
                                <>
                                  <button
                                    onClick={() => handleApprovePayment(p)}
                                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-xs transition"
                                    title="Approve this payment"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Approve</span>
                                  </button>
                                  <button
                                    onClick={() => handleRejectPayment(p)}
                                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md transition"
                                    title="Decline this payment request"
                                  >
                                    <XCircle className="w-3 h-3" />
                                    <span>Decline</span>
                                  </button>
                                </>
                              ) : isPending ? (
                                <span className="text-[11px] text-amber-700 font-medium italic">
                                  Waiting for Approval
                                </span>
                              ) : isRejected ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReRequestPayment(p)}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-md transition cursor-pointer shadow-2xs"
                                  title="Re-request Send: Resubmit this rejected payment for approval"
                                >
                                  <RotateCcw className="w-3 h-3 text-amber-600" />
                                  <span>Re-request</span>
                                </button>
                              ) : p.status === "POSTED" && !isReversed && canReverseFinance ? (
                                <button
                                  onClick={() => {
                                    setPaymentToReverse(p);
                                    setShowReverseModal(true);
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:underline"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Reverse</span>
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {excelPayments.filteredData.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Filter className="w-8 h-8 text-slate-300" />
                            <p className="font-semibold text-slate-700">
                              No payments found matching the selected filters
                            </p>
                            <p className="text-xs text-slate-400">
                              Try adjusting your search terms, dates, or clearing some filters.
                            </p>
                            {excelPayments.activeFiltersCount > 0 && (
                              <button
                                onClick={excelPayments.clearAllFilters}
                                className="mt-2 px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition"
                              >
                                Reset all filters
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {showGrandTotal && excelPayments.filteredData.length > 0 && (
                    <tfoot className="bg-slate-900 text-white font-semibold text-xs border-t-2 border-amber-400">
                      <tr>
                        {/* 1. Date & Ref */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 font-bold tracking-wider uppercase text-amber-400 text-xs">
                            <Calculator className="w-4 h-4 text-amber-400 shrink-0" />
                            <span>Grand Total</span>
                          </div>
                          <div className="text-[11px] text-slate-300 font-normal">
                            {paymentsGrandTotal.activeCount} payment{paymentsGrandTotal.activeCount === 1 ? "" : "s"}
                          </div>
                        </td>

                        {/* 2. Payee & Type */}
                        <td className="py-3 px-4 text-slate-300 text-xs">
                          {paymentsGrandTotal.outOfPocketCount > 0 ? (
                            <span>{paymentsGrandTotal.outOfPocketCount} out-of-pocket</span>
                          ) : (
                            <span>All payees</span>
                          )}
                        </td>

                        {/* 3. Paid From Account */}
                        <td className="py-3 px-4 text-slate-400 text-xs">
                          —
                        </td>

                        {/* 4. Method */}
                        <td className="py-3 px-4 text-slate-400 text-xs">
                          —
                        </td>

                        {/* 5. Payment Purpose */}
                        <td className="py-3 px-4 text-slate-300 text-xs">
                          <span className="text-amber-300 font-medium">
                            Total Disbursed
                          </span>
                        </td>

                        {/* 6. Linked Bill */}
                        <td className="py-3 px-4 text-slate-400 text-xs">
                          —
                        </td>

                        {/* 7. Amount: Grand Total */}
                        <td className="py-3 px-4 text-right">
                          <div className="font-mono font-black text-sm text-amber-400">
                            {formatCurrency(paymentsGrandTotal.totalPaise)}
                          </div>
                          {paymentsGrandTotal.totalTdsPaise > 0 && (
                            <div className="text-[10px] text-indigo-300 font-bold mt-0.5 whitespace-nowrap">
                              TDS held: {formatCurrency(paymentsGrandTotal.totalTdsPaise)}
                            </div>
                          )}
                        </td>

                        {/* 8. Status */}
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40 uppercase">
                            Total
                          </span>
                        </td>

                        {/* 9. Actions */}
                        <td className="py-3 px-4 text-right text-slate-500 text-xs">
                          —
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            ) : (
              /* Cards View (Responsive Grid across all devices) */
              <div className="p-3 bg-slate-50/60 space-y-3 min-h-[300px]">
                {excelPayments.filteredData.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                    <Filter className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">No payments found</p>
                    <p className="text-xs text-slate-400">Try adjusting your search terms or filters.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                    {excelPayments.paginatedData.map((p) => {
                      const isReversed = p.status === "REVERSED";
                      const isPending = p.status === "PENDING_APPROVAL";
                      const isRejected = p.status === "REJECTED";
                      const payee = p.recipientName || p.party?.name || "Recipient";
                      const rType = p.recipientType || p.party?.type || "VENDOR";
                      const canSuperAdminAct =
                        currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ORG_ADMIN";
                      const isOutOfPocket =
                        p.payingAccount === "Supervisor Out-of-Pocket" ||
                        p.recipientType === "OUT_OF_POCKET" ||
                        (p.notes && p.notes.includes("[Cash Expense]"));
                      const settledPaise = getSettledAmountPaise(p.id);
                      const remainingPaise = Math.max(0, p.amount - settledPaise);

                      return (
                        <div
                          key={`p-card-${p.id}`}
                          className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all flex flex-col justify-between"
                        >
                          <div>
                            {/* Top: Payee, Type Pill & Status Badge */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                  {p.partyId ? (
                                    <Link
                                      href={`/parties/${p.partyId}`}
                                      className="font-bold text-slate-900 hover:text-amber-600 text-sm truncate min-w-0"
                                      title={payee}
                                    >
                                      {payee}
                                    </Link>
                                  ) : (
                                    <span className="font-bold text-slate-900 text-sm truncate min-w-0" title={payee}>
                                      {payee}
                                    </span>
                                  )}
                                  <span
                                    className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0 whitespace-nowrap ${
                                      rType === "EMPLOYEE"
                                        ? "bg-purple-50 text-purple-700 border-purple-200"
                                        : rType === "SUBCONTRACTOR"
                                        ? "bg-sky-50 text-sky-700 border-sky-200"
                                        : rType === "OUT_OF_POCKET"
                                        ? "bg-amber-50 text-amber-800 border-amber-300 font-bold"
                                        : "bg-slate-100 text-slate-700 border-slate-200"
                                    }`}
                                  >
                                    {rType}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  By: {p.creator?.name || p.approvedBy || "Admin"}
                                </div>
                                <div
                                  className="text-xs text-slate-500 font-mono mt-1"
                                  title={`${formatDate(p.paymentDate)} · Ref: ${p.referenceNumber}`}
                                >
                                  <span className="font-semibold text-slate-700">{formatDate(p.paymentDate)}</span>
                                  <span className="text-slate-300 mx-1">·</span>
                                  <span>Ref: {p.referenceNumber}</span>
                                </div>
                              </div>

                              {/* Status Badge */}
                              <div className="shrink-0">
                                {isReversed ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                                    REVERSED
                                  </span>
                                ) : isRejected ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700">
                                    DECLINED
                                  </span>
                                ) : isPending ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                                    PENDING
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                    APPROVED
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Paid From Account & Method */}
                            <div className="mt-2.5 flex items-center justify-between gap-1 text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-100">
                              <div className="flex items-center gap-1.5 min-w-0 text-slate-700">
                                <Landmark className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="truncate font-medium">{p.payingAccount || "Supervisor Out-of-Pocket"}</span>
                              </div>
                              <span className="shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-800 font-bold uppercase">
                                {p.method || "Direct Bank"}
                              </span>
                            </div>

                            {/* Payment Purpose / Notes */}
                            {(p.approvalQuery || p.notes) && (
                              <div className="mt-2 text-xs text-slate-700 bg-slate-50/70 p-2 rounded-lg border border-slate-100 break-words">
                                <span className="text-slate-400 text-[10px] uppercase font-bold block mb-0.5">
                                  Purpose:
                                </span>
                                <span className="text-[11px] leading-relaxed">
                                  {p.approvalQuery || p.notes}
                                </span>
                                {isRejected && p.rejectionReason && (
                                  <div className="text-[10px] text-rose-600 font-semibold mt-1">
                                    Declined: {p.rejectionReason}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Linked Bill & Allocation Info */}
                            <div className="mt-2 text-[11px]">
                              {p.allocations && p.allocations.length > 0 ? (
                                <div className="space-y-0.5">
                                  {p.allocations.map((a: any) => (
                                    <div key={a.id} className="font-mono text-[11px] text-slate-600" title={a.bill?.billNumber || a.billId}>
                                      Bill #{formatShortBillNumber(a.bill?.billNumber || a.billId)} ({formatCurrency(a.amount)})
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                  Advance / Not Linked to a Bill
                                </span>
                              )}
                            </div>

                            {/* Amount */}
                            <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs items-baseline">
                              <div>
                                <div className="text-[11px] text-slate-400 font-medium">Payment Amount</div>
                                <div
                                  className={`font-mono text-base font-extrabold tabular-nums truncate ${
                                    isReversed || isRejected
                                      ? "line-through text-slate-400"
                                      : isPending
                                      ? "text-amber-700 font-bold"
                                      : "text-slate-900"
                                  }`}
                                  title={formatCurrency(p.amount)}
                                >
                                  {formatCurrency(p.amount)}
                                </div>
                              </div>

                              <div className="text-right">
                                <div className="text-[11px] text-slate-400 font-medium">Ref #</div>
                                <span className="font-mono text-[11px] font-semibold text-slate-600">
                                  {formatShortBillNumber(p.referenceNumber)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Actions Footer */}
                          <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                            <button
                              onClick={() =>
                                setAttachmentTarget({
                                  type: "PAYMENT",
                                  id: p.id,
                                  title: `Payment #${p.referenceNumber} Receipts`,
                                  categoryDefault: "RECEIPT",
                                })
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                            >
                              <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                              <span>Receipts & Docs</span>
                            </button>

                            <div className="flex items-center gap-1.5 ml-auto">
                              {isPending && canSuperAdminAct ? (
                                <>
                                  <button
                                    onClick={() => handleApprovePayment(p)}
                                    className="px-2.5 py-1 rounded text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleRejectPayment(p)}
                                    className="px-2.5 py-1 rounded text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer"
                                  >
                                    Decline
                                  </button>
                                </>
                              ) : null}

                              {isRejected && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReRequestPayment(p)}
                                  className="px-2.5 py-1 rounded text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1 cursor-pointer"
                                  title="Re-request Send: Resubmit this rejected payment for approval"
                                >
                                  <RotateCcw className="w-3 h-3 text-amber-600" />
                                  <span>Re-request</span>
                                </button>
                              )}

                              {!isReversed && !isRejected && !isPending && canReverseFinance && (
                                <button
                                  onClick={() => {
                                    setPaymentToReverse(p);
                                    setShowReverseModal(true);
                                  }}
                                  className="px-2 py-1 rounded text-[11px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 cursor-pointer"
                                >
                                  Reverse
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Grand Total Card in Cards View */}
                {showGrandTotal && excelPayments.filteredData.length > 0 && (
                  <div className="p-4 bg-slate-900 text-white rounded-xl border-2 border-amber-400/80 shadow-md">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 font-bold tracking-wider uppercase text-amber-400 text-xs">
                        <Calculator className="w-4 h-4 text-amber-400" />
                        <span>Grand Total ({paymentsGrandTotal.activeCount} payments)</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 uppercase">
                        Summary
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between pt-1 border-t border-slate-800">
                      <span className="text-xs text-slate-300 font-medium">Total Amount:</span>
                      <span className="font-mono font-black text-base text-amber-400">
                        {formatCurrency(paymentsGrandTotal.totalPaise)}
                      </span>
                    </div>
                    {paymentsGrandTotal.totalTdsPaise > 0 && (
                      <div className="flex items-baseline justify-between text-xs mt-1">
                        <span className="text-slate-400">TDS Held:</span>
                        <span className="font-mono font-bold text-indigo-300">
                          {formatCurrency(paymentsGrandTotal.totalTdsPaise)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
              <TablePagination
                currentPage={excelPayments.currentPage}
                totalPages={excelPayments.totalPages}
                totalItems={excelPayments.filteredCount}
                totalUnfiltered={excelPayments.totalRecords}
                pageSize={excelPayments.pageSize}
                startItem={excelPayments.startItem}
                endItem={excelPayments.endItem}
                onPageChange={excelPayments.setCurrentPage}
                itemLabel="payments"
              />
            </div>
          </div>
        )}

        {/* Bills Table */}
        {activeTab === "BILLS" && (
          <div className="space-y-4">
            {/* Quick Date Presets & Custom Picker for Bills */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1">
                  <Calendar className="w-3.5 h-3.5 text-amber-500" />
                  <span>Bills Date:</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleBillDatePreset("TODAY")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    billDatePreset === "TODAY"
                      ? "bg-amber-500 text-slate-950 shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => handleBillDatePreset("THIS_MONTH")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    billDatePreset === "THIS_MONTH"
                      ? "bg-amber-500 text-slate-950 shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => handleBillDatePreset("LAST_30")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    billDatePreset === "LAST_30"
                      ? "bg-amber-500 text-slate-950 shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  Last 30 Days
                </button>
                <button
                  type="button"
                  onClick={() => handleBillDatePreset("ALL")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    billDatePreset === "ALL"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  All Time
                </button>
              </div>

              {/* Date Inputs */}
              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-semibold text-[11px]">From:</span>
                  <input
                    type="date"
                    value={billFromDate}
                    onChange={(e) => {
                      setBillFromDate(e.target.value);
                      setBillDatePreset("CUSTOM");
                    }}
                    className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-semibold text-[11px]">To:</span>
                  <input
                    type="date"
                    value={billToDate}
                    onChange={(e) => {
                      setBillToDate(e.target.value);
                      setBillDatePreset("CUSTOM");
                    }}
                    className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                {(billFromDate || billToDate) && (
                  <button
                    type="button"
                    onClick={() => handleBillDatePreset("ALL")}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer"
                    title="Clear date filter"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Dynamic Filtered Total Bills Banner (Feature 18) */}
            <div className="bg-gradient-to-r from-blue-50 via-indigo-50/50 to-white dark:from-blue-950/20 dark:to-slate-900 border border-blue-200 dark:border-blue-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-xs">
                  ₹
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wider">
                    Filtered Total Bills
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-400">
                    {formatCurrency(filteredBillsStats.totalPaise)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                <div>
                  <span className="text-slate-500 block">Matched Invoices</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{filteredBillsStats.count} bills</span>
                </div>
                <div className="border-l border-slate-200 dark:border-slate-700 pl-4">
                  <span className="text-slate-500 block">Unpaid Balance</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">{formatCurrency(filteredBillsStats.outstandingPaise)}</span>
                </div>
              </div>
            </div>

            {/* Bills Filter Toolbar */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Bill Status:</span>
                <select
                  value={billStatus}
                  onChange={(e) => setBillStatus(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value="ALL">All Records (Bills & Challans)</option>
                  <option value="PENDING">Unpaid Balance</option>
                  <option value="PAID">Paid in Full</option>
                  <option value="CHALLAN">Delivery Challans</option>
                </select>
                {billStatus !== "ALL" && (
                  <button
                    onClick={() => {
                      setBillStatus("ALL");
                      if (typeof window !== "undefined") {
                        window.history.replaceState(null, "", "/finance?tab=bills");
                      }
                    }}
                    className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Bills Table Container */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <ExcelTableToolbar
                table={excelBills}
                columns={billColumns}
                tableName="vendor bills"
                showSearch={true}
                showExport={true}
              />

              {/* Option of Grand Total Toolbar Bar */}
              <div className="bg-slate-50 border-b border-slate-200 px-3 sm:px-4 py-2 flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 text-amber-600" />
                    <span>Grand Total:</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">Invoiced:</span>
                    <span className="font-mono font-black text-slate-900 bg-amber-100/90 text-amber-950 px-2 py-0.5 rounded border border-amber-300 text-xs sm:text-sm">
                      {formatCurrency(billsGrandTotal.totalPaise)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">Paid:</span>
                    <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs">
                      {formatCurrency(billsGrandTotal.paidPaise)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">Balance:</span>
                    <span className="font-mono font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-xs">
                      {formatCurrency(billsGrandTotal.outstandingPaise)}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    ({billsGrandTotal.count} bills)
                  </span>
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    type="button"
                    onClick={toggleGrandTotal}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition border cursor-pointer ${
                      showGrandTotal
                        ? "bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-600 shadow-2xs"
                        : "bg-white hover:bg-slate-100 text-slate-600 border-slate-300"
                    }`}
                    title="Toggle Grand Total footer row in the table"
                  >
                    <Calculator className="w-3 h-3" />
                    <span>{showGrandTotal ? "Grand Total Row: ON" : "Grand Total Row: OFF"}</span>
                  </button>
                </div>
              </div>
              {/* Desktop Bills Table (≥ lg screens) */}
              <div className="hidden lg:block overflow-x-auto min-h-[400px]">
                <table className="w-full text-left text-sm min-w-[720px]">
                  <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                    <tr>
                      {billColumns.map((col) => (
                        <ExcelColumnHeader
                          key={col.key}
                          column={col}
                          table={excelBills}
                          theme="darkHeader"
                        />
                      ))}
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {excelBills.paginatedData.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900" title={b.billNumber}>
                          <div className="flex items-center gap-1.5">
                            <span>{formatShortBillNumber(b.billNumber)}</span>
                            {b.status === "CHALLAN" && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                                DC
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          <Link href={`/parties/${b.partyId}`} className="hover:text-amber-600 hover:underline">
                            {b.party?.name}
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">{formatDate(b.billDate)}</td>
                        <td className="py-3 px-4 text-right font-medium text-slate-900 tabular-nums">
                          {b.status === "CHALLAN" ? (
                            <span className="text-xs text-slate-400 italic">No rate (Challan)</span>
                          ) : (
                            formatCurrency(b.totalAmount)
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-emerald-600 tabular-nums">
                          {b.status === "CHALLAN" ? "—" : formatCurrency(b.paidAmount)}
                        </td>
                        <td className="py-3 px-4 text-right font-black tabular-nums">
                          {b.status === "CHALLAN" ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span className={b.outstandingAmount > 0 ? "text-amber-600" : "text-slate-400"}>
                              {formatCurrency(b.outstandingAmount)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {b.status === "CHALLAN" ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                              CHALLAN
                            </span>
                          ) : b.outstandingAmount === 0 ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              PAID
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                              PENDING
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {(canWriteFinance || canSuperAdminAct) && b.status !== "CHALLAN" && b.outstandingAmount > 0 && (
                              <button
                                type="button"
                                onClick={() => handleOpenPayForBill(b)}
                                className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 bg-gradient-brand hover:brightness-105 text-slate-950 rounded-md shadow-2xs transition cursor-pointer"
                                title="Pay bill — amount is changeable and remaining balance is updated"
                              >
                                <CreditCard className="w-3 h-3 text-slate-950" />
                                <span>Pay Bill</span>
                              </button>
                            )}
                            {b.status === "CHALLAN" && canWriteFinance && (
                              <button
                                onClick={() => openGenerateBillModal(b)}
                                className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-2xs cursor-pointer"
                                title="Enter rates and generate official bill"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                                <span>Generate Bill</span>
                              </button>
                            )}
                            <button
                              onClick={() =>
                                setAttachmentTarget({
                                  type: "BILL",
                                  id: b.id,
                                  title: `${b.status === "CHALLAN" ? "Challan" : "Bill"} #${formatShortBillNumber(b.billNumber)} Invoices & Challans`,
                                  categoryDefault: "INVOICE",
                                })
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                              title="Upload or view invoice / challan photograph"
                            >
                              <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                              <span>Attach</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {excelBills.filteredData.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Filter className="w-8 h-8 text-slate-300" />
                            <p className="font-semibold text-slate-700">No vendor bills found</p>
                            <p className="text-xs text-slate-400">Try adjusting your search terms or filter.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {showGrandTotal && excelBills.filteredData.length > 0 && (
                    <tfoot className="bg-slate-900 text-white font-semibold text-xs border-t-2 border-amber-400">
                      <tr>
                        {/* 1. Bill # */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 font-bold tracking-wider uppercase text-amber-400 text-xs">
                            <Calculator className="w-4 h-4 text-amber-400 shrink-0" />
                            <span>Grand Total</span>
                          </div>
                          <div className="text-[11px] text-slate-300 font-normal">
                            {billsGrandTotal.count} bill{billsGrandTotal.count === 1 ? "" : "s"}
                            {billsGrandTotal.challanCount > 0 && ` (${billsGrandTotal.challanCount} DCs)`}
                          </div>
                        </td>

                        {/* 2. Vendor */}
                        <td className="py-3 px-4 text-slate-300 text-xs">
                          All filtered vendors
                        </td>

                        {/* 3. Bill Date */}
                        <td className="py-3 px-4 text-slate-400 text-xs">
                          —
                        </td>

                        {/* 4. Total Amount */}
                        <td className="py-3 px-4 text-right">
                          <div className="font-mono font-black text-sm text-amber-400">
                            {formatCurrency(billsGrandTotal.totalPaise)}
                          </div>
                        </td>

                        {/* 5. Paid Amount */}
                        <td className="py-3 px-4 text-right">
                          <div className="font-mono font-bold text-xs text-emerald-300">
                            {formatCurrency(billsGrandTotal.paidPaise)}
                          </div>
                        </td>

                        {/* 6. Outstanding Amount */}
                        <td className="py-3 px-4 text-right">
                          <div className="font-mono font-bold text-xs text-rose-300">
                            {formatCurrency(billsGrandTotal.outstandingPaise)}
                          </div>
                        </td>

                        {/* 7. Status */}
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40 uppercase">
                            Total
                          </span>
                        </td>

                        {/* 8. Actions */}
                        <td className="py-3 px-4 text-right text-slate-500 text-xs">
                          —
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Mobile & Tablet Vendor Bills Cards (< lg screens) */}
              <div className="lg:hidden p-3 bg-slate-50/60 space-y-3 min-h-[300px]">
                {excelBills.filteredData.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                    <Filter className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">No vendor bills found</p>
                    <p className="text-xs text-slate-400">Try adjusting your search terms or filter.</p>
                  </div>
                ) : (
                  excelBills.paginatedData.map((b) => (
                    <div key={`b-card-${b.id}`} className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all">
                      {/* Top: Bill Number, Vendor Link & Status Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold font-mono text-slate-900 text-sm truncate" title={b.billNumber}>
                            {formatShortBillNumber(b.billNumber)}
                          </div>
                          <div className="text-xs text-slate-700 font-semibold mt-0.5 min-w-0">
                            <Link
                              href={`/parties/${b.partyId}`}
                              className="hover:text-amber-600 hover:underline block truncate"
                              title={b.party?.name || "Vendor"}
                            >
                              <span className="sm:hidden">{formatShortName(b.party?.name || "Vendor")}</span>
                              <span className="hidden sm:inline">{b.party?.name || "Vendor"}</span>
                            </Link>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {formatDate(b.billDate)}
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0">
                          {b.status === "CHALLAN" ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                              CHALLAN
                            </span>
                          ) : b.outstandingAmount === 0 ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              PAID
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                              PENDING
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Middle: Delivery Challan materials OR Pending Balance & Total Bill Amount */}
                      {b.status === "CHALLAN" ? (
                        <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs">
                          <div className="text-[11px] text-indigo-700 font-semibold mb-1">Delivered Materials (Rate Pending):</div>
                          <div className="bg-indigo-50/50 p-2 rounded-lg border border-indigo-100 space-y-1">
                            {b.lines && b.lines.length > 0 ? (
                              b.lines.map((l: any, i: number) => (
                                <div key={i} className="text-slate-800 font-medium truncate">
                                  • {l.quantity ? `${l.quantity} × ` : ""}{l.description}
                                </div>
                              ))
                            ) : (
                              <div className="text-slate-500 italic">No material lines listed</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs">
                          <div>
                            <div className="text-[11px] text-slate-400 font-medium">Unpaid Balance</div>
                            <div className={`font-display text-base font-extrabold tabular-nums truncate ${b.outstandingAmount > 0 ? "text-amber-600" : "text-slate-400"}`} title={formatCurrency(b.outstandingAmount)}>
                              {formatCompactINR(b.outstandingAmount)}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-[11px] text-slate-400 font-medium">Total Bill</div>
                            <div className="font-display text-sm font-extrabold text-slate-700 tabular-nums truncate" title={formatCurrency(b.totalAmount)}>
                              {formatCompactINR(b.totalAmount)}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Footer Actions: Attach Invoices / Challans & Generate Bill */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-400">
                          {b.status === "CHALLAN"
                            ? "Delivery Challan"
                            : b.outstandingAmount === 0
                            ? "Paid in Full"
                            : "Balance Due"}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {(canWriteFinance || canSuperAdminAct) && b.status !== "CHALLAN" && b.outstandingAmount > 0 && (
                            <button
                              type="button"
                              onClick={() => handleOpenPayForBill(b)}
                              className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-gradient-brand hover:brightness-105 text-slate-950 transition shadow-xs cursor-pointer"
                            >
                              <CreditCard className="w-3.5 h-3.5 text-slate-950" />
                              <span>Pay Bill</span>
                            </button>
                          )}
                          {b.status === "CHALLAN" && canWriteFinance && (
                            <button
                              onClick={() => openGenerateBillModal(b)}
                              className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-xs cursor-pointer"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span>Generate Bill</span>
                            </button>
                          )}
                          <button
                            onClick={() =>
                              setAttachmentTarget({
                                type: "BILL",
                                id: b.id,
                                title: `${b.status === "CHALLAN" ? "Challan" : "Bill"} #${b.billNumber} Invoices & Challans`,
                                categoryDefault: "INVOICE",
                              })
                            }
                            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 whitespace-nowrap shrink-0 transition cursor-pointer"
                          >
                            <Paperclip className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>Attach</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {/* Mobile Grand Total Card for Vendor Bills */}
                {showGrandTotal && excelBills.filteredData.length > 0 && (
                  <div className="p-4 bg-slate-900 text-white rounded-xl border-2 border-amber-400/80 shadow-md space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-bold tracking-wider uppercase text-amber-400 text-xs">
                        <Calculator className="w-4 h-4 text-amber-400" />
                        <span>Grand Total ({billsGrandTotal.count} bills)</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 uppercase">
                        Summary
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-center">
                      <div className="bg-slate-800/60 p-2 rounded-lg">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Bills</div>
                        <div className="font-mono font-bold text-xs text-amber-400 mt-0.5">
                          {formatCurrency(billsGrandTotal.totalPaise)}
                        </div>
                      </div>
                      <div className="bg-slate-800/60 p-2 rounded-lg">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Paid</div>
                        <div className="font-mono font-bold text-xs text-emerald-300 mt-0.5">
                          {formatCurrency(billsGrandTotal.paidPaise)}
                        </div>
                      </div>
                      <div className="bg-slate-800/60 p-2 rounded-lg">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Balance</div>
                        <div className="font-mono font-bold text-xs text-rose-300 mt-0.5">
                          {formatCurrency(billsGrandTotal.outstandingPaise)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <TablePagination
                currentPage={excelBills.currentPage}
                totalPages={excelBills.totalPages}
                totalItems={excelBills.filteredCount}
                totalUnfiltered={excelBills.totalRecords}
                pageSize={excelBills.pageSize}
                startItem={excelBills.startItem}
                endItem={excelBills.endItem}
                onPageChange={excelBills.setCurrentPage}
                itemLabel="vendor bills"
              />
            </div>
          </div>
        )}

        {/* Modal: Record Payment */}
        {showPaymentModal && canRecordPayment && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 overflow-y-auto max-h-[90dvh]">
              <div className="flex items-start sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-base sm:text-lg flex items-start sm:items-center gap-2 min-w-0 leading-snug">
                  <CreditCard className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
                  <span>Record Payment</span>
                </div>
                <button
                  onClick={() => {
                    setShowPaymentModal(false);
                    setSettlingEntry(null);
                    setPaymentFile(null);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 shrink-0 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handlePaymentSubmit} className="space-y-4">
                {/* Linked Settlement Banner if opened from bill */}
                {settlingEntry && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-amber-900">
                      <span className="flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-amber-700" />
                        <span>
                          Paying for Bill #{formatShortBillNumber(settlingEntry.referenceNumber)}
                          {settlingEntry.recipientName ? ` (${settlingEntry.recipientName})` : ""}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setSettlingEntry(null)}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                        title="Clear pre-fill link"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-[11px] text-amber-800 flex items-center gap-3 flex-wrap">
                      <span>Total Bill: <strong>{formatCurrency(settlingEntry.totalAmount)}</strong></span>
                      {settlingEntry.settledAmount > 0 && (
                        <span>Paid So Far: <strong>{formatCurrency(settlingEntry.settledAmount)}</strong></span>
                      )}
                      <span>Remaining Balance: <strong className="text-rose-700">{formatCurrency(settlingEntry.remainingAmount)}</strong></span>
                    </div>
                  </div>
                )}

                {/* 1. Recipient Type Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Payee / Recipient Category
                  </label>
                  <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-lg">
                    {(["VENDOR", "CONTRACTOR", "EMPLOYEE", "OTHER"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setRecipientType(t);
                          setSelectedBillId("");
                          setSelectedPartyId("");
                          setSelectedEmployeeId("");
                          setRecipientName("");
                        }}
                        className={`py-1.5 px-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
                          recipientType === t
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {t === "VENDOR" ? "Vendor" : t === "CONTRACTOR" ? "Contractor" : t === "EMPLOYEE" ? "Employee" : "Other / Expense"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Recipient Selector / Name */}
                {recipientType === "OTHER" ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Paid To (Shop / Person Name) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sharma Hardware, Local Petrol Pump, Ramesh Kumar"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    />
                  </div>
                ) : recipientType === "EMPLOYEE" ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Employee Name & Designation *
                    </label>
                    <select
                      value={selectedEmployeeId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedEmployeeId(val);
                        if (val === "CUSTOM") {
                          setRecipientName("");
                        } else {
                          const w = workforce.find((wk) => wk.id === val);
                          if (w) {
                            setRecipientName(`${w.name} (${w.workerType || "Staff"})`);
                          }
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium mb-2"
                    >
                      <option value="">-- Choose Employee / Worker --</option>
                      {workforce.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} — {w.workerType || "Staff"} (Code: {w.employeeCode || "N/A"})
                        </option>
                      ))}
                      <option value="CUSTOM">+ Enter Custom Employee / Staff Name</option>
                    </select>

                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Kumar (Site Supervisor) or Mahesh Thakur (Foreman)"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Select {recipientType === "VENDOR" ? "Vendor" : "Contractor"} *
                    </label>
                    {(() => {
                      const isVendor = recipientType === "VENDOR";
                      const typeFiltered = parties.filter((p) => {
                        const pt = (p.partyType || p.type || "VENDOR").toUpperCase();
                        return isVendor ? (pt === "VENDOR" || pt === "BOTH") : (pt === "CONTRACTOR" || pt === "BOTH");
                      });
                      const displayParties = typeFiltered.length > 0 ? typeFiltered : parties;

                      return (
                        <>
                          <select
                            value={selectedPartyId}
                            onChange={(e) => {
                              setSelectedPartyId(e.target.value);
                              setSelectedBillId("");
                              const p = parties.find((pt) => pt.id === e.target.value);
                              if (p) setRecipientName(p.name);
                            }}
                            required
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                          >
                            <option value="">-- Choose {recipientType} --</option>
                            {displayParties.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} {p.partyType ? `(${p.partyType})` : ""} — Outstanding: {formatCurrency(p.outstandingBalance)}
                              </option>
                            ))}
                          </select>
                          {(() => {
                            const p = parties.find((pt) => pt.id === selectedPartyId);
                            if (p && p.totalDamagesDeducted > 0) {
                              return (
                                <div className="mt-1.5 p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center justify-between">
                                  <span className="flex items-center gap-1 font-medium">
                                    <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                    Liquidated Damages deducted:
                                  </span>
                                  <strong className="font-mono font-bold">−{formatCurrency(p.totalDamagesDeducted)}</strong>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* 3. Construction Site & Expense Category / Cost Head */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Construction Site
                    </label>
                    <select
                      value={paymentSiteId}
                      onChange={(e) => {
                        const sId = e.target.value;
                        setPaymentSiteId(sId);
                        const pForSite = projects.filter((p) => p.siteId === sId);
                        setPaymentProjectId(pForSite.length > 0 ? pForSite[0].id : "");
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      <option value="">-- General / Office --</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code || "SITE"})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Cost Head / Category *
                    </label>
                    <select
                      value={paymentCostHead}
                      onChange={(e) => setPaymentCostHead(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      {EXPENSE_CATEGORY_GROUPS.map((g) => (
                        <optgroup key={g.group} label={g.group}>
                          {g.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 4. Paying Account / Source Bank (Mandatory) */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 uppercase mb-1 flex items-center gap-1.5">
                    <Landmark className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span>Paid From (Bank / Cash Account) *</span>
                  </label>
                  <select
                    value={payingAccount}
                    onChange={(e) => setPayingAccount(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    <option value="HDFC Bank Operating A/C (A/C: ...4421)">
                      HDFC Bank Operating A/C (A/C: ...4421)
                    </option>
                    <option value="ICICI Bank Project Escrow A/C (A/C: ...9012)">
                      ICICI Bank Project Escrow A/C (A/C: ...9012)
                    </option>
                    <option value="State Bank of India CMS Current A/C (A/C: ...1109)">
                      State Bank of India CMS Current A/C (A/C: ...1109)
                    </option>
                    <option value="Site Office Petty Cash Wallet">Site Office Petty Cash Wallet</option>
                    <option value="Supervisor Out-of-Pocket">Supervisor Out-of-Pocket / Personal UPI</option>
                    <option value="CUSTOM">Other / Custom Bank Account...</option>
                  </select>

                  {payingAccount === "CUSTOM" && (
                    <input
                      type="text"
                      required
                      placeholder="Enter Bank Name, Branch & Account details"
                      value={customPayingAccount}
                      onChange={(e) => setCustomPayingAccount(e.target.value)}
                      className="w-full mt-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    />
                  )}
                </div>

                {/* 5. Amount and Method */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Payment Amount (₹) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      placeholder="e.g. 4000"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Payment Method *
                    </label>
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS)</option>
                      <option value="UPI">UPI Transfer</option>
                      <option value="CASH">Petty Cash / Cash</option>
                      <option value="CHEQUE">Bank Cheque</option>
                    </select>
                  </div>
                </div>

                {/* Live Dynamic Approval Threshold Badge */}
                {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && (
                  parseFloat(amount) < 20000 ? (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">✓ Auto-Approved (&lt; ₹20,000)</span>
                        <p className="text-[11px] text-emerald-800 mt-0.5">
                          Payments under ₹20,000 are recorded and approved immediately without requiring Admin review.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">⚠️ Admin Approval Required (≥ ₹20,000)</span>
                        <p className="text-[11px] text-amber-900 mt-0.5">
                          Payments of ₹20,000 or above require Super Admin / Admin review. An approval request will be sent to the Admins.
                        </p>
                      </div>
                    </div>
                  )
                )}

                {/* 6. Payment Purpose / Items Purchased */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Payment Purpose / Items Purchased *
                  </label>
                  <textarea
                    required
                    rows={2}
                    placeholder="e.g. Bought 2 bags cement & binding wire from local hardware, Advance for column rebar tying"
                    value={approvalQuery}
                    onChange={(e) => setApprovalQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm leading-relaxed"
                  />
                </div>

                {/* 7. Reference Number (Optional) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Reference / UTR / Cheque Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UTR-HDFC-991823 / UPI Ref (auto-generated if empty)"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                  />
                </div>

                {/* 8. Bill Allocation if Vendor / Contractor */}
                {recipientType !== "EMPLOYEE" && recipientType !== "OTHER" && partyBills.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Link to an Unpaid Bill (Optional)
                    </label>
                    <select
                      value={selectedBillId}
                      onChange={(e) => setSelectedBillId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    >
                      <option value="">Leave blank for advance or general payment</option>
                      {partyBills.map((b) => (
                        <option key={b.id} value={b.id}>
                          Bill #{formatShortBillNumber(b.billNumber)} — Unpaid: {formatCurrency(b.outstandingAmount)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* TDS held back on this payment (194C, 194J or 194I) */}
                {tdsPreview && recipientType !== "OTHER" && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-xs text-indigo-950">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold uppercase tracking-wide">TDS · {tdsPreview.label || "Contractor (194C)"}</span>
                      <select
                        value={tdsMode}
                        onChange={(e) => setTdsMode(e.target.value as any)}
                        className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-xs font-semibold"
                        aria-label="How TDS is calculated"
                      >
                        <option value="AUTO">Calculate automatically</option>
                        <option value="NONE">No TDS</option>
                        <option value="MANUAL">Enter amount manually</option>
                      </select>
                    </div>
                    {tdsMode === "MANUAL" && (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={tdsManual}
                        onChange={(e) => setTdsManual(e.target.value)}
                        placeholder="TDS ₹ (e.g. lower-deduction certificate rate)"
                        className="mt-2 w-full rounded-lg border border-indigo-200 bg-white p-2 text-sm font-mono"
                      />
                    )}
                    {tdsMode !== "AUTO" && (
                      <input
                        type="text"
                        value={tdsReason}
                        onChange={(e) => setTdsReason(e.target.value)}
                        required={tdsMode === "NONE"}
                        placeholder={tdsMode === "NONE" ? "Reason (e.g. transporter PAN declaration, or below annual limit)" : "Reason (e.g. Section 197 certificate number)"}
                        className="mt-2 w-full rounded-lg border border-indigo-200 bg-white p-2 text-sm"
                      />
                    )}
                    <div className="mt-2 space-y-0.5">
                      {tdsPreview.amount > 0 ? (
                        <>
                          <div>
                            {tdsPreview.rate}% of {formatCurrency(tdsPreview.base + tdsPreview.catchUpBase)} ={" "}
                            <strong>{formatCurrency(tdsPreview.amount)}</strong> held back and paid to the government.
                          </div>
                          <div className="text-sm font-bold">Bank pays {formatCurrency(tdsPreview.bankAmount)}</div>
                        </>
                      ) : (
                        <div>No TDS on this payment.</div>
                      )}
                      {tdsPreview.note && <div className="text-indigo-800">{tdsPreview.note}</div>}
                      {!tdsPreview.pan && <div className="font-semibold text-rose-700">No PAN on file for this vendor, so TDS applies at 20%. Add their PAN on the Vendors &amp; Contractors page.</div>}
                    </div>
                  </div>
                )}

                {/* 9. Payment Proof / Receipt Photo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Payment Proof / Receipt Photo / Video / PDF (Optional)
                  </label>
                  <FileUpload
                    value={paymentFile}
                    onChange={setPaymentFile}
                    entityType="PAYMENT"
                    projectId={paymentProjectId || selectedProjectId || undefined}
                    category="RECEIPT"
                    label="Upload Payment Receipt, Shop Bill, Cheque, or Transfer Screenshot"
                  />
                </div>

                {/* 10. Admin Direct Approval Checkbox (Only for >= ₹20,000) */}
                {(currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ORG_ADMIN") && parseFloat(amount || "0") >= 20000 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoApprove}
                        onChange={(e) => setAutoApprove(e.target.checked)}
                        className="w-4 h-4 text-emerald-600 rounded"
                      />
                      <span className="text-xs font-bold text-amber-950">
                        Approve and save immediately (Admin Direct Approval)
                      </span>
                    </label>
                    <p className="text-[11px] text-amber-800 mt-1">
                      Uncheck to submit this payment for review first.
                    </p>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPaymentModal(false);
                      setSettlingEntry(null);
                      setPaymentFile(null);
                    }}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 sm:px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {submitting
                        ? "Saving..."
                        : parseFloat(amount || "0") < 20000
                        ? "Save Payment"
                        : (currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ORG_ADMIN") && autoApprove
                        ? "Approve & Save Payment"
                        : "Submit for Approval (₹20,000+)"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Reverse Payment */}
        {showReverseModal && paymentToReverse && canReverseFinance && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-rose-600" />
                  <span>Reverse Payment</span>
                </div>
                <button
                  onClick={() => setShowReverseModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs mb-4">
                <span className="font-bold">Notice:</span> Reversing payment{" "}
                <span className="font-mono font-bold">#{paymentToReverse.referenceNumber}</span> of{" "}
                <span className="font-bold">{formatCurrency(paymentToReverse.amount)}</span> to{" "}
                <span className="font-bold">{paymentToReverse.party?.name}</span> will restore the
                unpaid balance on any linked vendor bills, reverse its TDS effect, and save a permanent record in Change History.
              </div>

              <form onSubmit={handleReverseSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Reason for Reversing Payment *
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="e.g. Cheque returned unpaid by bank / Incorrect vendor account credited"
                    value={reverseReason}
                    onChange={(e) => setReverseReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReverseModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {submitting ? "Reversing..." : "Confirm Reversal"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Create Bill */}
        {showBillModal && canWriteFinance && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in">
              <div className="flex items-start sm:items-center justify-between gap-2 p-4 sm:p-5 pb-3.5 sm:pb-4 border-b border-slate-100 shrink-0 bg-white">
                <div className="font-bold text-slate-900 text-base sm:text-lg flex items-center gap-2 min-w-0">
                  {billModalTab === "CHALLAN" ? (
                    <>
                      <Truck className="w-5 h-5 text-indigo-600 shrink-0" />
                      <span className="truncate">Record Delivery Challan</span>
                    </>
                  ) : (
                    <>
                      <Receipt className="w-5 h-5 text-amber-500 shrink-0" />
                      <span className="truncate">Record Vendor / Contractor Bill</span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowBillModal(false);
                    setBillFile(null);
                    setChallanFile(null);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg shrink-0 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs: Bill / Invoice vs Delivery Challan */}
              <div className="flex border-b border-slate-200 bg-slate-50 px-4 sm:px-6 pt-2.5 gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setBillModalTab("BILL")}
                  className={`pb-2.5 px-3.5 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                    billModalTab === "BILL"
                      ? "border-amber-500 text-amber-900 bg-white rounded-t-lg shadow-2xs"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Receipt className="w-4 h-4 text-amber-500" />
                  <span>Bill / Invoice</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBillModalTab("CHALLAN")}
                  className={`pb-2.5 px-3.5 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                    billModalTab === "CHALLAN"
                      ? "border-indigo-600 text-indigo-900 bg-white rounded-t-lg shadow-2xs"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Truck className="w-4 h-4 text-indigo-600" />
                  <span>Delivery Challan</span>
                </button>
              </div>

              {billModalTab === "BILL" ? (
                <form id="create-bill-modal-form" onSubmit={handleBillSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Vendor / Contractor *
                    </label>
                    <select
                      value={billPartyId}
                      onChange={(e) => setBillPartyId(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      <option value="">Select Vendor / Contractor</option>
                      {parties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.partyType})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Project / Site (Optional)
                    </label>
                    <SearchableSelect
                      options={[
                        { value: "", label: "Select Project" },
                        ...projects.map((p) => ({
                          value: p.id,
                          label: p.name,
                          badge: p.code || undefined,
                        })),
                      ]}
                      value={billProjectId}
                      onChange={setBillProjectId}
                      placeholder="Select Project"
                      searchPlaceholder="Search project name or code..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Bill / Invoice # *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. INV-2026-089"
                      value={billNumber}
                      onChange={(e) => setBillNumber(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Bill Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={billDate}
                      onChange={(e) => setBillDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Due Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={billDueDate}
                      onChange={(e) => setBillDueDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    />
                  </div>
                </div>

                {/* Line Items */}
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider min-w-0">
                      <span className="sm:hidden">Bill Line Items</span>
                      <span className="hidden sm:inline">Items / Services on This Bill</span>
                    </span>
                    <button
                      type="button"
                      onClick={addBillLine}
                      className="text-xs font-bold text-amber-700 hover:text-amber-600 bg-amber-100/70 hover:bg-amber-100 px-2.5 py-1 rounded-lg flex items-center gap-1 whitespace-nowrap shrink-0 transition"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>Add Line</span>
                    </button>
                  </div>

                  <div className="space-y-2.5 sm:max-h-60 sm:overflow-y-auto">
                    {billLines.map((line, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-2"
                      >
                        {billLines.length > 1 && (
                          <div className="flex sm:hidden items-center justify-between text-[11px] font-bold text-slate-500 pb-1 border-b border-slate-100">
                            <span>Item #{idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => removeBillLine(idx)}
                              className="p-1 text-slate-400 hover:text-rose-500 rounded inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <div className="sm:col-span-6">
                            <input
                              type="text"
                              required
                              placeholder="Item description (e.g. Reinforcement Steel Bars)"
                              value={line.description}
                              onChange={(e) => updateBillLine(idx, "description", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                            />
                          </div>
                          <div className="sm:col-span-5">
                            <select
                              value={line.materialId}
                              onChange={(e) => updateBillLine(idx, "materialId", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                            >
                              <option value="">Link Material (Optional)</option>
                              {materials.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name} ({m.sku})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="hidden sm:flex sm:col-span-1 justify-end items-center">
                            {billLines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeBillLine(idx)}
                                className="p-1.5 text-slate-400 hover:text-rose-500 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          <div>
                            <input
                              type="number"
                              step="any"
                              placeholder="Qty"
                              value={line.quantity}
                              onChange={(e) => updateBillLine(idx, "quantity", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono"
                            />
                          </div>
                          <div>
                            <input
                              type="number"
                              step="any"
                              placeholder="Unit Rate (₹)"
                              value={line.unitRate}
                              onChange={(e) => updateBillLine(idx, "unitRate", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono"
                            />
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <input
                              type="number"
                              step="any"
                              required
                              placeholder="Line Total (₹)"
                              value={line.lineTotal}
                              onChange={(e) => updateBillLine(idx, "lineTotal", e.target.value)}
                              className="w-full bg-amber-50/50 border border-amber-200 rounded-lg p-2 text-xs font-mono font-bold text-slate-900"
                            />
                          </div>
                        </div>
                        {billGstRate !== "" && (
                          <label className="flex items-center gap-2 text-[11px] text-slate-500">
                            GST on this line
                            <select
                              value={line.gstRate || ""}
                              onChange={(e) => updateBillLine(idx, "gstRate", e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px]"
                            >
                              <option value="">Same as bill ({billGstRate}%)</option>
                              {[0, 5, 12, 18, 28].map((r) => (
                                <option key={r} value={r}>
                                  {r}%
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    ))}
                  </div>

                  {(() => {
                    const taxable = billLines.reduce((sum: number, l: any) => sum + (parseFloat(l.lineTotal) || 0), 0);
                    const rate = billGstRate === "" ? 0 : Number(billGstRate);
                    const lineRate = (l: any) => (billGstRate === "" ? 0 : l.gstRate ? Number(l.gstRate) : rate);
                    const tax = billLines.reduce((sum: number, l: any) => sum + Math.round((parseFloat(l.lineTotal) || 0) * lineRate(l)) / 100, 0);
                    const mixed = new Set(billLines.map(lineRate)).size > 1;
                    const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    return (
                      <div className="pt-2 border-t border-slate-200 space-y-2 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <label className="block">
                            <span className="block font-semibold text-slate-600 mb-1">GST on this bill</span>
                            <select
                              value={billGstRate}
                              onChange={(e) => setBillGstRate(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs"
                            >
                              <option value="">No GST / composition supplier</option>
                              {[0, 5, 12, 18, 28].map((r) => (
                                <option key={r} value={r}>
                                  {r}% on top of the lines
                                </option>
                              ))}
                            </select>
                          </label>
                          {billGstRate !== "" && (
                            <label className="block">
                              <span className="block font-semibold text-slate-600 mb-1">Tax type</span>
                              <select
                                value={billTaxType}
                                onChange={(e) => setBillTaxType(e.target.value as "AUTO" | "LOCAL" | "IGST")}
                                className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs"
                              >
                                <option value="AUTO">Detect automatically from GSTIN</option>
                                <option value="LOCAL">Same state: CGST + SGST</option>
                                <option value="IGST">Other state: IGST</option>
                              </select>
                            </label>
                          )}
                          {billGstRate !== "" && (
                            <div className="space-y-1 sm:pt-4">
                              <label className="flex items-start gap-2">
                                <input type="checkbox" checked={billItc} onChange={(e) => setBillItc(e.target.checked)} className="mt-0.5" />
                                <span className="text-slate-600">
                                  <span className="font-medium text-slate-700">Claim GST Input Tax Credit (ITC)</span>
                                  <span className="block text-[10px] text-slate-400">Check if your company can claim GST credit on this purchase.</span>
                                </span>
                              </label>
                              <label className="flex items-start gap-2">
                                <input type="checkbox" checked={billRcm} onChange={(e) => setBillRcm(e.target.checked)} className="mt-0.5" />
                                <span className="text-slate-600">
                                  <span className="font-medium text-slate-700">Reverse Charge (RCM)</span>
                                  <span className="block text-[10px] text-slate-400">Company pays GST to the government instead of the vendor (e.g. GTA transport).</span>
                                </span>
                              </label>
                            </div>
                          )}
                        </div>
                        {billGstRate !== "" && (
                          <div className="flex items-center justify-between text-slate-600">
                            <span>
                              Taxable value ₹{fmt(taxable)} + GST {mixed ? "at line rates" : `${rate}%`} ₹{fmt(tax)}
                              {billRcm && " (you pay this GST to the government; the supplier is paid the taxable value)"}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-600">Calculated Bill Total:</span>
                          <span className="font-black font-mono text-sm text-slate-900">₹{fmt(billRcm ? taxable : taxable + tax)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Notes / Remarks
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. As per Purchase Order PO-2026-44"
                    value={billNotes}
                    onChange={(e) => setBillNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                {/* Photo / Invoice Document Upload */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Bill / Invoice Photo / Document (Optional)
                  </label>
                  <FileUpload
                    value={billFile}
                    onChange={setBillFile}
                    entityType="BILL"
                    projectId={billProjectId || undefined}
                    category="INVOICE"
                    label="Upload Bill Photo, Tax Invoice, or Delivery Challan"
                  />
                </div>

              </form>
            ) : (
              <form id="create-challan-modal-form" onSubmit={handleChallanSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Vendor / Contractor *
                    </label>
                    <select
                      value={challanPartyId}
                      onChange={(e) => setChallanPartyId(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      <option value="">Select Vendor / Contractor</option>
                      {parties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.partyType})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Project / Site (Optional)
                    </label>
                    <SearchableSelect
                      options={[
                        { value: "", label: "Select Project" },
                        ...projects.map((p) => ({
                          value: p.id,
                          label: p.name,
                          badge: p.code || undefined,
                        })),
                      ]}
                      value={challanProjectId}
                      onChange={setChallanProjectId}
                      placeholder="Select Project"
                      searchPlaceholder="Search project name or code..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Challan No. *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. DC-2026-0042 / CH-981"
                      value={challanNumber}
                      onChange={(e) => setChallanNumber(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Challan Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={challanDate}
                      onChange={(e) => setChallanDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    />
                  </div>
                </div>

                {/* Material & Quantity Received */}
                <div className="border border-indigo-200/80 rounded-xl p-3 bg-indigo-50/20 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Materials & Quantity Received</span>
                    </span>
                    <button
                      type="button"
                      onClick={addChallanLine}
                      className="text-xs font-bold text-indigo-700 hover:text-indigo-600 bg-indigo-100 hover:bg-indigo-200/70 px-2.5 py-1 rounded-lg flex items-center gap-1 whitespace-nowrap shrink-0 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>Add Material</span>
                    </button>
                  </div>

                  <div className="space-y-2.5 sm:max-h-60 sm:overflow-y-auto">
                    {challanLines.map((line, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-2 shadow-2xs"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <div className="sm:col-span-6">
                            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                              Material Name / Description *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. PPC Cement / 12mm TMT Steel"
                              value={line.description}
                              onChange={(e) => updateChallanLine(idx, "description", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                            />
                          </div>
                          <div className="sm:col-span-5">
                            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                              Link to Catalog (Optional)
                            </label>
                            <select
                              value={line.materialId}
                              onChange={(e) => updateChallanLine(idx, "materialId", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                            >
                              <option value="">Select Catalog Material</option>
                              {materials.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name} ({m.sku})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="hidden sm:flex sm:col-span-1 justify-end items-end pb-1">
                            {challanLines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeChallanLine(idx)}
                                className="p-1.5 text-slate-400 hover:text-rose-500 rounded cursor-pointer"
                                title="Remove item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                          <div className="sm:col-span-4">
                            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                              Quantity Received *
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0.01"
                              required
                              placeholder="e.g. 100"
                              value={line.quantity}
                              onChange={(e) => updateChallanLine(idx, "quantity", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono font-bold text-slate-900"
                            />
                          </div>
                          <div className="sm:col-span-8">
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[11px] font-semibold text-slate-500 uppercase">
                                Unit of Measurement *
                              </label>
                              {line.isCustomUnit && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateChallanLine(idx, "isCustomUnit", false);
                                    updateChallanLine(idx, "unit", "BAG");
                                  }}
                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold underline cursor-pointer"
                                >
                                  Standard list
                                </button>
                              )}
                            </div>
                            {line.isCustomUnit ? (
                              <input
                                type="text"
                                required
                                placeholder="Type custom unit (e.g. Coil, Sack, Pail...)"
                                value={line.unit}
                                onChange={(e) => updateChallanLine(idx, "unit", e.target.value)}
                                className="w-full bg-indigo-50/40 border border-indigo-300 rounded-lg p-2 text-xs font-bold text-slate-900 uppercase focus:bg-white"
                                autoFocus
                              />
                            ) : (
                              <select
                                value={CHALLAN_ALL_CODES.has(line.unit) ? line.unit : (line.unit ? "CUSTOM" : "BAG")}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "CUSTOM") {
                                    updateChallanLine(idx, "isCustomUnit", true);
                                    updateChallanLine(idx, "unit", "");
                                  } else {
                                    updateChallanLine(idx, "unit", val);
                                  }
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-semibold text-slate-800 focus:bg-white cursor-pointer"
                              >
                                {CHALLAN_UNIT_GROUPS.map((grp) => (
                                  <optgroup key={grp.category} label={grp.category}>
                                    {grp.options.map((opt) => (
                                      <option key={opt.code} value={opt.code}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            )}

                            {/* Quick selection pills */}
                            <div className="flex items-center flex-wrap gap-1 mt-1.5">
                              <span className="text-[10px] text-slate-400 font-medium mr-0.5">Quick:</span>
                              {POPULAR_CHALLAN_UNITS.map((u) => {
                                const isSelected = !line.isCustomUnit && line.unit === u;
                                return (
                                  <button
                                    key={u}
                                    type="button"
                                    onClick={() => {
                                      updateChallanLine(idx, "isCustomUnit", false);
                                      updateChallanLine(idx, "unit", u);
                                    }}
                                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold transition cursor-pointer ${
                                      isSelected
                                        ? "bg-indigo-600 text-white shadow-2xs"
                                        : "bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 border border-slate-200/60"
                                    }`}
                                  >
                                    {u}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Notes / Vehicle / Driver Details (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Vehicle RJ-14-1234, driver Ram Lal, verified on site"
                    value={challanNotes}
                    onChange={(e) => setChallanNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                {/* Photo / Challan Document Upload */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Delivery Challan Photo / Document (Optional)
                  </label>
                  <FileUpload
                    value={challanFile}
                    onChange={setChallanFile}
                    entityType="BILL"
                    projectId={challanProjectId || undefined}
                    category="INVOICE"
                    label="Upload Signed Delivery Challan Photo or PDF"
                  />
                </div>
              </form>
            )}

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowBillModal(false);
                  setBillFile(null);
                  setChallanFile(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              {billModalTab === "BILL" ? (
                <button
                  type="submit"
                  form="create-bill-modal-form"
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 transition cursor-pointer"
                >
                  {submitting ? "Saving Bill..." : "Save Bill"}
                </button>
              ) : (
                <button
                  type="submit"
                  form="create-challan-modal-form"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>{submitting ? "Saving Challan..." : "Save Delivery Challan"}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Generate Bill from Challan */}
      {generateBillTarget && canWriteFinance && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 max-h-[90dvh] flex flex-col overflow-hidden animate-scale-in">
            <div className="flex items-start sm:items-center justify-between gap-2 p-4 sm:p-5 pb-3.5 sm:pb-4 border-b border-slate-100 shrink-0 bg-white">
              <div className="min-w-0">
                <div className="font-bold text-slate-900 text-base sm:text-lg flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-500 shrink-0" />
                  <span>Generate Bill from Challan #{generateBillTarget.billNumber}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5 truncate">
                  Vendor: <strong className="text-slate-700">{generateBillTarget.party?.name || "Vendor"}</strong>
                  {generateBillTarget.project && (
                    <span> • Project: <strong className="text-slate-700">{generateBillTarget.project.name}</strong></span>
                  )}
                  <span> • Delivered on {formatDate(generateBillTarget.billDate)}</span>
                </div>
              </div>
              <button
                onClick={() => setGenerateBillTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form id="generate-bill-form" onSubmit={handleGenerateBillSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Bill / Invoice # *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. INV-2026-089"
                    value={genInvoiceNumber}
                    onChange={(e) => setGenInvoiceNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Bill Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={genBillDate}
                    onChange={(e) => setGenBillDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Due Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={genDueDate}
                    onChange={(e) => setGenDueDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  />
                </div>
              </div>

              {/* Line Items with Rate Inputs */}
              <div className="border border-amber-200 rounded-xl p-3 bg-amber-50/30 space-y-3">
                <div className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center justify-between">
                  <span>Material Rates & Totals</span>
                  <span className="text-[11px] font-normal text-amber-700 normal-case">Enter the agreed unit rate (₹) per item</span>
                </div>

                <div className="space-y-2.5 sm:max-h-60 sm:overflow-y-auto">
                  {genLines.map((line, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200 space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-xs text-slate-800 truncate" title={line.description}>
                          {line.description}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded shrink-0">
                          Qty: {line.quantity}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                            Unit Rate (₹) *
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            required
                            placeholder="e.g. 350.00"
                            value={line.unitRate}
                            onChange={(e) => updateGenLine(idx, "unitRate", e.target.value)}
                            className="w-full bg-amber-50/50 border border-amber-300 rounded-lg p-2 text-xs font-mono font-bold text-slate-900 focus:bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">
                            Line Total (₹)
                          </label>
                          <input
                            type="number"
                            step="any"
                            required
                            placeholder="0.00"
                            value={line.lineTotal}
                            onChange={(e) => updateGenLine(idx, "lineTotal", e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono font-bold text-slate-800"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* GST Calculation Section */}
                {(() => {
                  const taxable = genLines.reduce((sum, l) => sum + (parseFloat(l.lineTotal) || 0), 0);
                  const rate = genGstRate === "" ? 0 : Number(genGstRate);
                  const tax = Math.round((taxable * rate) / 100 * 100) / 100;
                  const grandTotal = genRcm ? taxable : taxable + tax;
                  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  return (
                    <div className="pt-2 border-t border-amber-200 space-y-2 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="block">
                          <span className="block font-semibold text-slate-700 mb-1">GST on this bill</span>
                          <select
                            value={genGstRate}
                            onChange={(e) => setGenGstRate(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs"
                          >
                            <option value="">No GST / Composition</option>
                            {[0, 5, 12, 18, 28].map((r) => (
                              <option key={r} value={r}>
                                {r}% GST
                              </option>
                            ))}
                          </select>
                        </label>
                        {genGstRate !== "" && (
                          <label className="block">
                            <span className="block font-semibold text-slate-700 mb-1">Tax Type</span>
                            <select
                              value={genTaxType}
                              onChange={(e) => setGenTaxType(e.target.value as "AUTO" | "LOCAL" | "IGST")}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs"
                            >
                              <option value="AUTO">Detect automatically from GSTIN</option>
                              <option value="LOCAL">Same State: CGST + SGST</option>
                              <option value="IGST">Other State: IGST</option>
                            </select>
                          </label>
                        )}
                      </div>

                      {genGstRate !== "" && (
                        <div className="flex items-center justify-between text-slate-600 pt-1">
                          <span>Subtotal Taxable: ₹{fmt(taxable)}</span>
                          <span>+ GST ({rate}%): ₹{fmt(tax)}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-amber-200/60">
                        <span className="font-bold text-slate-800">Calculated Grand Total:</span>
                        <span className="font-black font-mono text-base text-amber-700">₹{fmt(grandTotal)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Notes / Remarks (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rate finalized as per contract"
                  value={genNotes}
                  onChange={(e) => setGenNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                />
              </div>
            </form>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setGenerateBillTarget(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="generate-bill-form"
                disabled={generatingBill}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Receipt className="w-4 h-4" />
                <span>{generatingBill ? "Generating Bill..." : "Generate & Post Bill"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Attachment Modal (Priority 3) */}
        {attachmentTarget && (
          <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[85dvh] flex flex-col">
              <div className="flex items-start sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 mb-3 sm:mb-4">
                <div className="font-bold text-slate-900 text-base sm:text-lg flex items-start sm:items-center gap-2 min-w-0 leading-snug">
                  <Paperclip className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 sm:mt-0" />
                  <span className="break-words min-w-0">{attachmentTarget.title}</span>
                </div>
                <button
                  onClick={() => setAttachmentTarget(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <AttachmentManager
                  entityType={attachmentTarget.type}
                  entityId={attachmentTarget.id}
                  title="Uploaded Documents"
                  allowUpload={true}
                  categoryDefault={attachmentTarget.categoryDefault || "INVOICE"}
                  highlightMissing={true}
                  missingLabel="No invoice or receipt attached yet"
                />
              </div>
            </div>
          </div>
        )}

        {/* Modal: Confirm Payment Authorization */}
        {approvePaymentTarget && (
          <div className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto space-y-3">
              <div className="font-bold text-slate-900 text-base">Approve Payment</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Approve payment of{" "}
                <span className="font-bold text-slate-900">
                  ₹{(approvePaymentTarget.amount / 100).toFixed(2)}
                </span>{" "}
                to{" "}
                <span className="font-bold text-slate-900">
                  {approvePaymentTarget.recipientName || approvePaymentTarget.party?.name || "Recipient"}
                </span>
                ? Paid from:{" "}
                <span className="font-semibold text-slate-800">
                  {approvePaymentTarget.payingAccount || "Operating Account"}
                </span>
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setApprovePaymentTarget(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={approvalActionSubmitting}
                  onClick={executeApprovePayment}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg disabled:opacity-50"
                >
                  {approvalActionSubmitting ? "Approving..." : "Approve Payment"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Decline Payment Request */}
        {rejectPaymentTarget && (
          <div className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto space-y-3">
              <div className="font-bold text-slate-900 text-base">Decline Payment Request</div>
              <p className="text-xs text-slate-600">
                Enter a reason for declining this payment to{" "}
                <span className="font-bold text-slate-900">
                  {rejectPaymentTarget.recipientName || rejectPaymentTarget.party?.name || "Recipient"}
                </span>
                .
              </p>
              <form onSubmit={executeRejectPayment} className="space-y-3">
                <textarea
                  required
                  rows={3}
                  value={rejectPaymentReason}
                  onChange={(e) => setRejectPaymentReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                />
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setRejectPaymentTarget(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={approvalActionSubmitting || !rejectPaymentReason.trim()}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg disabled:opacity-50"
                  >
                    {approvalActionSubmitting ? "Declining..." : "Decline Payment"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Re-request / Resubmit Payment Request */}
        {reRequestPaymentTarget && (
          <div className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 max-h-[90dvh] overflow-y-auto space-y-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <RotateCcw className="w-5 h-5 text-amber-600" />
                <span>Re-request Send (Resubmit for Approval)</span>
              </div>
              <p className="text-xs text-slate-600">
                Resubmit the rejected payment request for{" "}
                <span className="font-bold text-slate-900">
                  {reRequestPaymentTarget.recipientName || reRequestPaymentTarget.party?.name || "Recipient"}
                </span>{" "}
                back to Pending Approval status.
              </p>

              {reRequestPaymentTarget.rejectionReason && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  <span className="font-bold">Original Rejection Reason: </span>
                  {reRequestPaymentTarget.rejectionReason}
                </div>
              )}

              <form onSubmit={executeReRequestPayment} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Requested Amount (₹) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      value={reRequestPaymentAmount}
                      onChange={(e) => setReRequestPaymentAmount(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-slate-300 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Re-request Note / Clarification *
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Enter clarification or reason for resubmitting (e.g. Rate updated as requested, revised bill attached)..."
                    value={reRequestPaymentReason}
                    onChange={(e) => setReRequestPaymentReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setReRequestPaymentTarget(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={approvalActionSubmitting || !reRequestPaymentReason.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {approvalActionSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Confirm &amp; Re-request Send</span>
                      </>
                    )}
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
