"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Field, StatTile, inputCls } from "@/components/ui/Modal";
import { api, rupees } from "@/lib/client-api";
import { formatCompactINR } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import { Download, FileSpreadsheet, FileCode2, Landmark, Building2, X, Filter } from "lucide-react";

const ist = () => new Date(Date.now() + 19_800_000);
const key = (d: Date) => d.toISOString().slice(0, 10);

/** Common ranges an accountant asks for: this month, last month, this quarter, this financial year. */
function presets() {
  const now = ist();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const monthStart = (yy: number, mm: number) => key(new Date(Date.UTC(yy, mm, 1)));
  const monthEnd = (yy: number, mm: number) => key(new Date(Date.UTC(yy, mm + 1, 0)));
  const q = Math.floor(((m + 9) % 12) / 3); // Indian FY quarters start in April
  const qStartMonth = (3 + q * 3) % 12;
  const qYear = m < 3 && qStartMonth >= 3 ? y - 1 : y;
  const fyStart = m < 3 ? y - 1 : y;
  return [
    { id: "today", label: "Today", from: key(now), to: key(now) },
    { id: "this-month", label: "This month", from: monthStart(y, m), to: key(now) },
    { id: "last-month", label: "Last month", from: monthStart(m === 0 ? y - 1 : y, (m + 11) % 12), to: monthEnd(m === 0 ? y - 1 : y, (m + 11) % 12) },
    { id: "quarter", label: `Q${q + 1} this year`, from: monthStart(qYear, qStartMonth), to: key(now) },
    { id: "fy", label: `FY ${fyStart}-${String(fyStart + 1).slice(2)}`, from: `${fyStart}-04-01`, to: key(now) },
  ];
}

type Part = "bills" | "payments" | "receipts";

function ExportsContent() {
  const searchParams = useSearchParams();
  const initialPartyId = searchParams.get("partyId") || "";

  const ranges = useMemo(presets, []);
  const [from, setFrom] = useState(ranges[0].from);
  const [to, setTo] = useState(ranges[0].to);
  const [selectedPartyId, setSelectedPartyId] = useState<string>(initialPartyId);
  const [parties, setParties] = useState<any[]>([]);
  const [parts, setParts] = useState<Record<Part, boolean>>({ bills: true, payments: true, receipts: true });
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Load parties list for filtering
  useEffect(() => {
    api("/api/parties")
      .then((data: any) => {
        if (Array.isArray(data)) {
          setParties(data);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch parties for export:", err);
      });
  }, []);

  // Sync initial party if URL param changes
  useEffect(() => {
    if (initialPartyId) {
      setSelectedPartyId(initialPartyId);
    }
  }, [initialPartyId]);

  // Load summary whenever from, to, or selectedPartyId changes
  useEffect(() => {
    if (!from || !to || from > to) return;
    setSummary(null);
    const partyQuery = selectedPartyId ? `&partyId=${encodeURIComponent(selectedPartyId)}` : "";
    api(`/api/exports/summary?from=${from}&to=${to}${partyQuery}`)
      .then(setSummary)
      .catch((e) => setError(e.message));
  }, [from, to, selectedPartyId]);

  const selectedParty = useMemo(() => {
    return parties.find((p) => p.id === selectedPartyId) || summary?.party || null;
  }, [parties, selectedPartyId, summary]);

  const vendors = useMemo(() => {
    return parties.filter((p) => p.partyType === "VENDOR" || p.partyType === "BOTH");
  }, [parties]);

  const contractors = useMemo(() => {
    return parties.filter((p) => p.partyType === "CONTRACTOR" || p.partyType === "BOTH");
  }, [parties]);

  const qs = `from=${from}&to=${to}${selectedPartyId ? `&partyId=${encodeURIComponent(selectedPartyId)}` : ""}`;
  const activeRange = ranges.find((r) => r.from === from && r.to === to)?.id;
  const chosen = (Object.keys(parts) as Part[]).filter((p) => parts[p] && (!selectedPartyId || p !== "receipts"));

  const download = (href: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Landmark}
        title="Accounts Export"
        subtitle="Download bills, payments, and receipts in formats your accountant can open in Tally or Excel."
      />
      {error && <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert>}

      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
            {ranges.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setFrom(r.from);
                  setTo(r.to);
                }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-center text-xs font-bold whitespace-nowrap transition",
                  activeRange === r.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="mt-1 grid w-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="From Date">
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
            </Field>
            <Field label="To Date">
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Contractor or Vendor Filter">
              <div className="relative">
                <select
                  value={selectedPartyId}
                  onChange={(e) => setSelectedPartyId(e.target.value)}
                  className={cn(inputCls, "truncate font-medium")}
                >
                  <option value="">All Contractors & Vendors (Company-wide)</option>
                  {contractors.length > 0 && (
                    <optgroup label="── Subcontractors / Contractors ──">
                      {contractors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Contractor)
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {vendors.length > 0 && (
                    <optgroup label="── Material Vendors / Suppliers ──">
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} (Vendor)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </Field>
          </div>

          {selectedParty && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50/80 border border-amber-200/90 px-3.5 py-2.5 text-xs text-amber-950 mt-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 p-1 rounded-md bg-amber-200/70 text-amber-900">
                  <Filter className="w-3.5 h-3.5" />
                </span>
                <span className="font-semibold text-slate-700">Specific Partner Export:</span>
                <span className="font-bold text-slate-950 truncate">{selectedParty.name}</span>
                <span className="rounded bg-amber-200/90 px-2 py-0.5 text-[10px] font-bold text-amber-900 uppercase tracking-wider">
                  {selectedParty.partyType}
                </span>
              </div>
              <button
                onClick={() => setSelectedPartyId("")}
                className="inline-flex items-center gap-1 font-bold text-amber-800 hover:text-amber-950 hover:underline text-xs"
              >
                <X className="w-3.5 h-3.5" /> Clear (Show All)
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          value={summary ? formatCompactINR(summary.bills.amount) : "…"}
          title={summary ? rupees(summary.bills.amount) : undefined}
          label={`Supplier bills (${summary?.bills.count ?? "…"})`}
          hint={selectedParty ? `Bills for ${selectedParty.name}` : undefined}
        />
        <StatTile
          value={summary ? formatCompactINR(summary.payments.amount) : "…"}
          title={summary ? rupees(summary.payments.amount) : undefined}
          label={`Payments made (${summary?.payments.count ?? "…"})`}
          tone="rose"
          hint={selectedParty ? `Paid to ${selectedParty.name}` : undefined}
        />
        <StatTile
          value={selectedParty ? "—" : summary ? formatCompactINR(summary.receipts.amount) : "…"}
          title={!selectedParty && summary ? rupees(summary.receipts.amount) : undefined}
          label={selectedParty ? "Customer receipts (N/A)" : `Received from customers (${summary?.receipts.count ?? "…"})`}
          tone={selectedParty ? "slate" : "emerald"}
          hint={selectedParty ? "Applies to client/sales receipts" : undefined}
        />
        <StatTile
          value={selectedParty ? "—" : summary ? formatCompactINR(summary.receipts.gst) : "…"}
          title={!selectedParty && summary ? rupees(summary.receipts.gst) : undefined}
          label={selectedParty ? "GST collected (N/A)" : "GST collected on customer receipts"}
          tone={selectedParty ? "slate" : "amber"}
          hint={selectedParty ? "Applies to customer sales" : summary ? `on ${formatCompactINR(summary.receipts.taxable)} taxable` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Tally Import Section */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileCode2 className="h-5 w-5 text-amber-500" />
              <h2 className="font-display font-bold text-slate-900">Tally import file</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {selectedParty
                ? `One XML file containing purchase and payment vouchers exclusively for ${selectedParty.name}, along with the ledgers used. Ready to import directly into Tally Prime.`
                : "One XML file containing vouchers and the ledgers they use. In Tally Prime, go to Gateway of Tally → Import → Vouchers and choose this file. Ledgers already in Tally stay unchanged."}
            </p>
            <div className="mt-3 space-y-2 text-sm">
              {(
                [
                  ["bills", selectedParty ? `Bills from ${selectedParty.name} as Purchase vouchers` : "Supplier bills as Purchase vouchers"],
                  ["payments", selectedParty ? `Payments made to ${selectedParty.name} as Payment vouchers` : "Payments as Payment vouchers (wages and salaries included)"],
                  ["receipts", "Customer receipts as a Sales invoice (with CGST/SGST) and a Receipt"],
                ] as [Part, string][]
              ).map(([p, label]) => {
                const isReceiptsDisabled = Boolean(selectedPartyId && p === "receipts");
                return (
                  <label key={p} className={cn("flex items-start gap-2", isReceiptsDisabled && "opacity-40 cursor-not-allowed")}>
                    <input
                      type="checkbox"
                      disabled={isReceiptsDisabled}
                      checked={isReceiptsDisabled ? false : parts[p]}
                      onChange={(e) => setParts({ ...parts, [p]: e.target.checked })}
                      className="mt-0.5 rounded border-slate-300"
                    />
                    <span className="text-slate-700">
                      {label}
                      {isReceiptsDisabled && " (N/A for contractor/vendor)"}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <button
            disabled={chosen.length === 0}
            onClick={() => download(`/api/exports/tally?${qs}&parts=${chosen.join(",")}`)}
            className="mt-5 inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 sm:py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-40 transition"
          >
            <Download className="h-4 w-4" />
            <span>Download for Tally{selectedParty ? ` (${selectedParty.name})` : ""}</span>
          </button>
        </section>

        {/* Sheets for GST & Bank Accounts Section */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              <h2 className="font-display font-bold text-slate-900">Sheets for GST & Bank Accounts</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {selectedParty
                ? `Spreadsheets (CSV) for ${selectedParty.name} that open in Excel. Use them to verify GST returns or reconcile specific ledger payments.`
                : "Spreadsheets (CSV) that open in Excel. Send them to your accountant for monthly GST returns."}
            </p>
            <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {[
                {
                  kind: "purchases",
                  title: selectedParty ? `Purchase register (${selectedParty.name})` : "Purchase register",
                  hint: selectedParty
                    ? `Supplier bills from ${selectedParty.name} with GSTIN & Reverse Charge info, to match input credit in GSTR-2B`
                    : "Supplier bills with GSTIN & Reverse Charge info, to match input credit in GSTR-2B",
                },
                {
                  kind: "payments",
                  title: selectedParty ? `Payments list (${selectedParty.name})` : "Payments list",
                  hint: selectedParty
                    ? `All completed payments to ${selectedParty.name} (net of TDS), to match with bank statement`
                    : "All completed payments (net of TDS), to match with your bank statement",
                },
              ].map((r) => (
                <li key={r.kind} className="flex flex-col gap-2.5 px-3.5 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900">{r.title}</div>
                    <div className="text-xs text-slate-500">{r.hint}</div>
                  </div>
                  <button
                    onClick={() => download(`/api/exports/${r.kind}?${qs}`)}
                    className="inline-flex w-full sm:w-auto shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 sm:px-2.5 sm:py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Download className="h-3.5 w-3.5" /> Download CSV
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function ExportsPage() {
  return (
    <Shell>
      <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading export configuration…</div>}>
        <ExportsContent />
      </Suspense>
    </Shell>
  );
}
