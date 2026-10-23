"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Tabs } from "@/components/ui/Modal";
import { api, rupees, shortDate } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, FileText, Loader2 } from "lucide-react";

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const shiftFy = (fy: string, by: number) => {
  const y = Number(fy.slice(0, 4)) + by;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
};
const QUARTERS = ["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"];

const STATE: Record<string, { label: string; pill: string }> = {
  PAID: {
    label: "Deposited",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  LATE: {
    label: "Deposited late",
    pill: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  PART_PAID: {
    label: "Part deposited",
    pill: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  NOT_PAID: {
    label: "Not deposited",
    pill: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  NIL: { label: "No TDS", pill: "bg-slate-50 text-slate-500 ring-slate-200" },
  NO_DATA: {
    label: "Nothing to report yet",
    pill: "bg-slate-50 text-slate-500 ring-slate-200",
  },
  FUTURE: {
    label: "Month not over",
    pill: "bg-slate-50 text-slate-400 ring-slate-200",
  },
};

/** The quarter now running, or the last one finished when its return is the one to file. */
function currentQuarter() {
  const now = new Date(Date.now() + 5.5 * 3600_000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const fyStart = m >= 4 ? y : y - 1;
  const q = m >= 4 ? Math.floor((m - 4) / 3) + 1 : 4;
  // Show the quarter just ended; that is the return due next.
  if (q === 1)
    return {
      fy: `${fyStart - 1}-${String(fyStart % 100).padStart(2, "0")}`,
      quarter: 4,
    };
  return {
    fy: `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`,
    quarter: q - 1,
  };
}

type Kind = "salary" | "contractors";
const KINDS: Record<Kind, { api: string; title: string; subtitle: string; paid: string; noData: string }> = {
  salary: {
    api: "/api/payroll/tds-return",
    title: "TDS Return on Salary (24Q)",
    subtitle: "Each quarter's salary, TDS and challans, ready to copy into the return utility.",
    paid: "Salary paid",
    noData: "Payroll not approved",
  },
  contractors: {
    api: "/api/finance/tds-return",
    title: "TDS Return on Contractors, Fees and Rent (26Q)",
    subtitle: "TDS held back from payments to contractors (194C), professionals (194J), landlords (194I) and large goods suppliers (194Q), and the challans.",
    paid: "Paid to parties",
    noData: "Nothing recorded",
  },
};
/** Form 16A is due 15 days after the quarter's 26Q. */
const form16ADue = (fy: string, q: number) => {
  const y = Number(fy.slice(0, 4));
  return [`${y}-08-15`, `${y}-11-15`, `${y + 1}-02-15`, `${y + 1}-06-15`][q - 1];
};
function certificateParties(deductees: any[]) {
  const by = new Map<string, { partyId: string; name: string; tds: number; sections: string[] }>();
  for (const d of deductees) {
    if (!d.partyId || !(d.tds > 0)) continue;
    const row = by.get(d.partyId) || { partyId: d.partyId, name: d.name, tds: 0, sections: [] as string[] };
    row.tds += d.tds;
    if (!row.sections.includes(d.section)) row.sections.push(d.section);
    by.set(d.partyId, row);
  }
  return Array.from(by.values()).sort((a, b) => a.name.localeCompare(b.name));
}

const REMARK: Record<string, string> = {
  C: "No PAN, higher rate",
  A: "Lower rate (certificate)",
  T: "Transporter, no TDS",
  Y: "Under the limit, no TDS",
};

export default function TdsReturnPage() {
  const [kind, setKind] = useState<Kind>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("kind") === "contractors" ? "contractors" : "salary",
  );
  const [{ fy, quarter }, setPeriod] = useState(currentQuarter);
  const [doc, setDoc] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setDoc(null);
    api(`${KINDS[kind].api}?fy=${fy}&quarter=${quarter}`)
      .then(setDoc)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [kind, fy, quarter]);

  const step = (by: number) => {
    let q = quarter + by;
    let f = fy;
    if (q < 1) {
      q = 4;
      f = shiftFy(fy, -1);
    } else if (q > 4) {
      q = 1;
      f = shiftFy(fy, 1);
    }
    setPeriod({ fy: f, quarter: q });
  };
  const csv = (part: string) => `${KINDS[kind].api}?fy=${fy}&quarter=${quarter}&format=csv&part=${part}`;
  const k = KINDS[kind];

  return (
    <Shell>
      <div className="space-y-5">
        <PageHeader icon={FileText} title={k.title} subtitle={k.subtitle}>
          <div className="flex items-center rounded-xl border border-slate-200 bg-white">
            <button onClick={() => step(-1)} className="p-2.5 text-slate-500 hover:text-slate-900" aria-label="Previous quarter">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[150px] text-center text-sm font-bold text-slate-800">
              Q{quarter} {QUARTERS[quarter - 1]} · FY {fy}
            </span>
            <button onClick={() => step(1)} className="p-2.5 text-slate-500 hover:text-slate-900" aria-label="Next quarter">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </PageHeader>

        <Tabs<Kind>
          value={kind}
          onChange={(v) => {
            setKind(v);
            try {
              window.history.replaceState(null, "", v === "contractors" ? "?kind=contractors" : window.location.pathname);
            } catch {}
          }}
          tabs={[
            { id: "salary", label: "Salary (24Q)" },
            { id: "contractors", label: "Contractors, fees & rent (26Q)" },
          ]}
        />

        {error && <Alert tone="error">{error}</Alert>}
        {loading && !doc ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          doc && (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  { label: k.paid, value: rupees(doc.totals.paid) },
                  { label: "TDS deducted", value: rupees(doc.totals.tds) },
                  {
                    label: "TDS deposited",
                    value: rupees(doc.totals.deposited),
                    tone: doc.totals.deposited < doc.totals.tds ? "text-rose-600" : "text-emerald-700",
                  },
                  { label: "Return due by", value: shortDate(doc.filingDue) },
                ].map((t) => (
                  <div key={t.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
                    <div className="text-xs font-semibold text-slate-500">{t.label}</div>
                    <div className={cn("mt-1 font-display text-2xl font-extrabold tabular-nums text-slate-900", t.tone)}>{t.value}</div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-slate-500">
                {doc.company.name} · TAN{" "}
                {doc.company.tan ? (
                  <span className="font-mono font-semibold text-slate-700">{doc.company.tan}</span>
                ) : (
                  <Link href="/settings" className="font-semibold text-rose-600 underline">
                    not set
                  </Link>
                )}
              </div>

              {doc.problems.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-900">
                    <AlertTriangle className="h-4 w-4" /> Fix before filing
                  </div>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">
                    {doc.problems.map((p: string) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              <section className="rounded-2xl border border-slate-200/80 bg-white shadow-xs">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                  <h2 className="text-[15px] font-bold text-slate-900">Challans (TDS deposited each month)</h2>
                  <a href={csv("challans")} className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:underline">
                    <Download className="h-3.5 w-3.5" /> CSV
                  </a>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2 text-left">Month</th>
                        <th className="px-4 py-2 text-right">TDS</th>
                        <th className="px-4 py-2 text-right">Deposited</th>
                        <th className="px-4 py-2 text-left">On</th>
                        <th className="px-4 py-2 text-left">Challan / reference</th>
                        <th className="px-4 py-2 text-left">Due</th>
                        <th className="px-4 py-2 text-left">State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {doc.challans.map((c: any) => (
                        <tr key={`${c.section ?? ""}-${c.month}`}>
                          <td className="px-4 py-2.5 font-semibold text-slate-800">
                            {monthLabel(c.month)}
                            {c.section && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{c.section}</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{rupees(c.tds)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{rupees(c.deposited)}</td>
                          <td className="px-4 py-2.5 text-slate-600">{shortDate(c.depositedOn) || "—"}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{c.reference || "—"}</td>
                          <td className="px-4 py-2.5 text-slate-600">{shortDate(c.due)}</td>
                          <td className="px-4 py-2.5">
                            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold ring-1", STATE[c.state].pill)}>
                              {c.state === "NO_DATA" ? k.noData : STATE[c.state].label}
                            </span>
                            {c.interest > 0 && <div className="mt-0.5 text-[11px] text-amber-700">Interest about {rupees(c.interest)}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                  Deposits come from payments against the TDS bills in Finance. Put the bank&apos;s challan number (CIN) in the payment reference.
                </p>
              </section>

              {kind === "contractors" && (
                <section className="rounded-2xl border border-slate-200/80 bg-white shadow-xs">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                    <h2 className="text-[15px] font-bold text-slate-900">Payments and TDS for each party</h2>
                    <a href={csv("deductees")} className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:underline">
                      <Download className="h-3.5 w-3.5" /> CSV
                    </a>
                  </header>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-2 text-left">Date</th>
                          <th className="px-4 py-2 text-left">Party</th>
                          <th className="px-4 py-2 text-left">PAN</th>
                          <th className="px-4 py-2 text-left">Section</th>
                          <th className="px-4 py-2 text-right">Amount</th>
                          <th className="px-4 py-2 text-right">Rate</th>
                          <th className="px-4 py-2 text-right">TDS</th>
                          <th className="px-4 py-2 text-left">Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {doc.deductees.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                              No payments with TDS in this quarter.
                            </td>
                          </tr>
                        )}
                        {doc.deductees.map((d: any) => (
                          <tr key={d.paymentId}>
                            <td className="px-4 py-2.5 text-slate-600">{shortDate(d.paidOn)}</td>
                            <td className="px-4 py-2.5 font-semibold text-slate-800">{d.name}</td>
                            <td className="px-4 py-2.5 font-mono text-xs">{d.pan || <span className="font-sans font-semibold text-rose-600">Missing</span>}</td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-600" title={d.sectionLabel}>
                              {d.section ? `${d.section} · ${d.sectionCode}` : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{rupees(d.amountPaid)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{d.rate ? `${d.rate}%` : "—"}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{rupees(d.tds)}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-500">{[REMARK[d.remark], d.note?.replace(/^No PAN, so \d+%;? ?/, "")].filter(Boolean).join(" · ") || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {kind === "contractors" && (
                <section className="rounded-2xl border border-slate-200/80 bg-white shadow-xs">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                    <h2 className="text-[15px] font-bold text-slate-900">TDS certificates (Form 16A)</h2>
                    <span className="text-xs text-slate-500">Give each party theirs by {shortDate(form16ADue(fy, quarter))}</span>
                  </header>
                  <div className="divide-y divide-slate-100">
                    {certificateParties(doc.deductees).length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-500">No party had TDS held back this quarter.</div>}
                    {certificateParties(doc.deductees).map((p) => (
                      <div key={p.partyId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                        <div>
                          <span className="font-semibold text-slate-800">{p.name}</span>
                          <span className="ml-2 text-xs text-slate-500">
                            {p.sections.join(", ")} · TDS {rupees(p.tds)}
                          </span>
                        </div>
                        <Link href={`/finance/form-16a/${p.partyId}?fy=${fy}&quarter=${quarter}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:underline">
                          <FileText className="h-3.5 w-3.5" /> Certificate
                        </Link>
                      </div>
                    ))}
                  </div>
                  <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                    Made from the figures above, to send straight away. The certificate a party claims credit with is the one from TRACES once the return is filed; check it against this one.
                  </p>
                </section>
              )}

              {kind === "salary" && (
                <section className="rounded-2xl border border-slate-200/80 bg-white shadow-xs">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                    <h2 className="text-[15px] font-bold text-slate-900">Salary and TDS for each person (Annexure I)</h2>
                    <a href={csv("deductees")} className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:underline">
                      <Download className="h-3.5 w-3.5" /> CSV
                    </a>
                  </header>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-2 text-left">Month</th>
                          <th className="px-4 py-2 text-left">Name</th>
                          <th className="px-4 py-2 text-left">PAN</th>
                          <th className="px-4 py-2 text-right">Paid</th>
                          <th className="px-4 py-2 text-right">TDS</th>
                          <th className="px-4 py-2 text-left">Paid on</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {doc.deductees.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                              No approved staff payroll in this quarter.
                            </td>
                          </tr>
                        )}
                        {doc.deductees.map((d: any) => (
                          <tr key={`${d.month}-${d.userId}`}>
                            <td className="px-4 py-2.5 text-slate-600">{monthLabel(d.month)}</td>
                            <td className="px-4 py-2.5 font-semibold text-slate-800">{d.name}</td>
                            <td className="px-4 py-2.5 font-mono text-xs">{d.pan || <span className="font-sans font-semibold text-rose-600">Missing</span>}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{rupees(d.amountPaid)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{rupees(d.tds)}</td>
                            <td className="px-4 py-2.5 text-slate-600">{shortDate(d.paidOn)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {doc.salaryForYear && (
                <section className="rounded-2xl border border-slate-200/80 bg-white shadow-xs">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                    <h2 className="text-[15px] font-bold text-slate-900">Salary for the year (Annexure II)</h2>
                    <a href={csv("salary")} className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:underline">
                      <Download className="h-3.5 w-3.5" /> CSV
                    </a>
                  </header>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-2 text-left">Name</th>
                          <th className="px-4 py-2 text-left">Regime</th>
                          <th className="px-4 py-2 text-right">Gross</th>
                          <th className="px-4 py-2 text-right">Taxable</th>
                          <th className="px-4 py-2 text-right">Tax</th>
                          <th className="px-4 py-2 text-right">TDS cut</th>
                          <th className="px-4 py-2 text-right">Short</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {doc.salaryForYear.map((p: any) => (
                          <tr key={p.userId}>
                            <td className="px-4 py-2.5 font-semibold text-slate-800">
                              <Link href={`/payroll/tax/${p.userId}?fy=${fy}`} className="hover:text-amber-700 hover:underline">
                                {p.name}
                              </Link>
                            </td>
                            <td className="px-4 py-2.5 text-slate-600">{p.regime === "OLD" ? "Old" : "New"}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{rupees(p.gross)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{rupees(p.taxable)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{rupees(p.tax)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{rupees(p.tdsDeducted)}</td>
                            <td className={cn("px-4 py-2.5 text-right tabular-nums", p.shortfall > 0 && "font-bold text-rose-600")}>
                              {p.shortfall ? rupees(p.shortfall) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <p className="text-xs leading-relaxed text-slate-500">
                This page gathers what the return needs. File it with the NSDL Return Preparation Utility (RPU): copy these rows in, check them with the File
                Validation Utility (FVU), and upload the result on the income-tax portal or at a TIN facilitation centre. The app does not make the FVU file
                itself. Form 16 Part A is then downloaded from TRACES.
              </p>
            </>
          )
        )}
      </div>
    </Shell>
  );
}
