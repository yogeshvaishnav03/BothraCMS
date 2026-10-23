"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { api, rupees, shortDate } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, FileText, Loader2 } from "lucide-react";

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const shiftFy = (fy: string, by: number) => {
  const y = Number(fy.slice(0, 4)) + by;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
};
const QUARTERS = ["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"];

const STATE: Record<string, { label: string; pill: string }> = {
  PAID: { label: "Deposited", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  LATE: { label: "Deposited late", pill: "bg-amber-50 text-amber-800 ring-amber-200" },
  PART_PAID: { label: "Part deposited", pill: "bg-amber-50 text-amber-800 ring-amber-200" },
  NOT_PAID: { label: "Not deposited", pill: "bg-rose-50 text-rose-700 ring-rose-200" },
  NIL: { label: "No TDS", pill: "bg-slate-50 text-slate-500 ring-slate-200" },
  NO_PAYROLL: { label: "Payroll not approved", pill: "bg-slate-50 text-slate-500 ring-slate-200" },
  FUTURE: { label: "Month not over", pill: "bg-slate-50 text-slate-400 ring-slate-200" },
};

/** The quarter now running, or the last one finished when its return is the one to file. */
function currentQuarter() {
  const now = new Date(Date.now() + 5.5 * 3600_000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const fyStart = m >= 4 ? y : y - 1;
  const q = m >= 4 ? Math.floor((m - 4) / 3) + 1 : 4;
  // Show the quarter just ended; that is the return due next.
  if (q === 1) return { fy: `${fyStart - 1}-${String(fyStart % 100).padStart(2, "0")}`, quarter: 4 };
  return { fy: `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`, quarter: q - 1 };
}

export default function TdsReturnPage() {
  const [{ fy, quarter }, setPeriod] = useState(currentQuarter);
  const [doc, setDoc] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api(`/api/payroll/tds-return?fy=${fy}&quarter=${quarter}`)
      .then(setDoc)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fy, quarter]);

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
  const csv = (part: string) => `/api/payroll/tds-return?fy=${fy}&quarter=${quarter}&format=csv&part=${part}`;

  return (
    <Shell>
      <div className="space-y-5">
        <PageHeader icon={FileText} title="TDS Return on Salary (24Q)" subtitle="Each quarter's salary, TDS and challans, ready to copy into the return utility.">
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
                  { label: "Salary paid", value: rupees(doc.totals.paid) },
                  { label: "TDS deducted", value: rupees(doc.totals.tds) },
                  { label: "TDS deposited", value: rupees(doc.totals.deposited), tone: doc.totals.deposited < doc.totals.tds ? "text-rose-600" : "text-emerald-700" },
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
                        <tr key={c.month}>
                          <td className="px-4 py-2.5 font-semibold text-slate-800">{monthLabel(c.month)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{rupees(c.tds)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{rupees(c.deposited)}</td>
                          <td className="px-4 py-2.5 text-slate-600">{shortDate(c.depositedOn) || "—"}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{c.reference || "—"}</td>
                          <td className="px-4 py-2.5 text-slate-600">{shortDate(c.due)}</td>
                          <td className="px-4 py-2.5">
                            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold ring-1", STATE[c.state].pill)}>{STATE[c.state].label}</span>
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
                            <td className={cn("px-4 py-2.5 text-right tabular-nums", p.shortfall > 0 && "font-bold text-rose-600")}>{p.shortfall ? rupees(p.shortfall) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <p className="text-xs leading-relaxed text-slate-500">
                This page gathers what the return needs. File it with the NSDL Return Preparation Utility (RPU): copy these rows in, check them with
                the File Validation Utility (FVU), and upload the result on the income-tax portal or at a TIN facilitation centre. The app does not make
                the FVU file itself. Form 16 Part A is then downloaded from TRACES.
              </p>
            </>
          )
        )}
      </div>
    </Shell>
  );
}
