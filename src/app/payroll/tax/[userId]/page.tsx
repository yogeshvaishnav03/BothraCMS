"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, Printer } from "lucide-react";
import { api, rupees } from "@/lib/client-api";
import { cn } from "@/lib/cn";

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
const shiftFy = (fy: string, by: number) => {
  const y = Number(fy.slice(0, 4)) + by;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
};

/** Salary and tax for a financial year, printable (Form 16 Part B in summary). */
export default function TaxStatementPage() {
  const { userId } = useParams<{ userId: string }>();
  const search = useSearchParams();
  const [fy, setFy] = useState<string | null>(search.get("fy"));
  const [doc, setDoc] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api(`/api/payroll/tax/${userId}${fy ? `?fy=${fy}` : ""}`)
      .then((d) => {
        setDoc(d);
        if (!fy) setFy(d.fy);
      })
      .catch((e) => setError(e.message));
  }, [userId, fy]);

  if (error) return <div className="p-8 text-center text-sm text-rose-600">{error}</div>;
  if (!doc) return <div className="p-8 text-center text-sm text-slate-500">Loading…</div>;
  const p = doc.projected;
  const Row = ({ label, value, strong, minus }: { label: string; value: number; strong?: boolean; minus?: boolean }) => (
    <tr className={cn("border-t border-slate-100", strong && "font-bold text-slate-900")}>
      <td className="py-1.5">{label}</td>
      <td className="py-1.5 text-right tabular-nums">{minus && value ? `− ${rupees(value)}` : rupees(value)}</td>
    </tr>
  );

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 print:hidden">
        <Link href="/payroll" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Payroll
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl bg-white text-sm font-semibold shadow-sm ring-1 ring-slate-200">
            <button onClick={() => setFy(shiftFy(doc.fy, -1))} className="px-3 py-2 text-slate-500 hover:text-slate-900" aria-label="Previous year">
              ‹
            </button>
            <span className="px-1 tabular-nums">FY {doc.fy}</span>
            <button onClick={() => setFy(shiftFy(doc.fy, 1))} className="px-3 py-2 text-slate-500 hover:text-slate-900" aria-label="Next year">
              ›
            </button>
          </div>
          <Link href={`/payroll/form-16/${userId}?fy=${doc.fy}`} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">
            <FileText className="h-4 w-4" /> Form 16 Part B
          </Link>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">
            <Printer className="h-4 w-4" /> Print / save PDF
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm print:rounded-none print:shadow-none">
        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <div className="font-display text-2xl font-extrabold text-slate-900">{doc.company.name}</div>
            {doc.company.gstin && <div className="text-xs text-slate-500">GSTIN {doc.company.gstin}</div>}
            <div className="mt-1 text-sm text-slate-500">Salary and tax statement, financial year {doc.fy}</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-bold text-slate-900">{doc.person.name}</div>
            <div className="text-xs text-slate-500">{doc.person.jobTitle || doc.person.role.replace(/_/g, " ").toLowerCase()}</div>
            {doc.person.uan && <div className="text-xs text-slate-500">UAN {doc.person.uan}</div>}
            <div className="mt-1 text-xs font-semibold text-slate-700">{doc.regime === "NEW" ? "New tax regime" : "Old tax regime"}</div>
          </div>
        </div>

        <table className="mt-5 w-full text-sm">
          <thead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="py-1.5 text-left">Month</th>
              <th className="py-1.5 text-right">Gross</th>
              <th className="py-1.5 text-right">PF</th>
              <th className="py-1.5 text-right">ESI</th>
              <th className="py-1.5 text-right">Prof. tax</th>
              <th className="py-1.5 text-right">TDS</th>
              <th className="py-1.5 text-right">Net paid</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {doc.rows.map((r: any) => (
              <tr key={r.month} className={cn("border-t border-slate-100", !r.status && "text-slate-300")}>
                <td className="py-1.5">
                  {monthLabel(r.month)}
                  {r.status === "DRAFT" && <span className="ml-1.5 text-[10px] font-bold uppercase text-amber-600">draft</span>}
                </td>
                <td className="py-1.5 text-right">{r.status ? rupees(r.gross) : "—"}</td>
                <td className="py-1.5 text-right">{r.pf ? rupees(r.pf) : "—"}</td>
                <td className="py-1.5 text-right">{r.esi ? rupees(r.esi) : "—"}</td>
                <td className="py-1.5 text-right">{r.pt ? rupees(r.pt) : "—"}</td>
                <td className="py-1.5 text-right">
                  {r.tds ? rupees(r.tds) : "—"}
                  {r.tdsManual && <span className="ml-1 text-[10px] text-slate-400" title="Typed in by hand">✎</span>}
                </td>
                <td className="py-1.5 text-right">{r.status ? rupees(r.net) : "—"}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-900 font-bold text-slate-900">
              <td className="py-2">Total</td>
              <td className="py-2 text-right">{rupees(doc.totals.gross)}</td>
              <td className="py-2 text-right">{rupees(doc.totals.pf)}</td>
              <td className="py-2 text-right">{rupees(doc.totals.esi)}</td>
              <td className="py-2 text-right">{rupees(doc.totals.pt)}</td>
              <td className="py-2 text-right">{rupees(doc.totals.tds)}</td>
              <td className="py-2 text-right">{rupees(doc.totals.net)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Tax for the year {p.complete ? "" : `(${doc.monthsPaid} month${doc.monthsPaid === 1 ? "" : "s"} paid, the rest at the latest month's pay)`}
            </h2>
            <table className="mt-2 w-full text-sm text-slate-700">
              <tbody>
                <Row label="Salary for the year" value={p.gross} />
                <Row label={doc.regime === "NEW" ? "Standard deduction" : "Standard deduction, prof. tax, 80C (PF) and declared"} value={p.deductions} minus />
                <Row label="Taxable income" value={p.taxable} strong />
                <Row label="Tax on slabs" value={p.slabTax} />
                {p.rebate > 0 && <Row label="Rebate (section 87A)" value={p.rebate} minus />}
                {p.surcharge > 0 && <Row label="Surcharge" value={p.surcharge} />}
                <Row label="Health and education cess (4%)" value={p.cess} />
                <Row label="Tax for the year" value={p.total} strong />
              </tbody>
            </table>
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Deducted</h2>
            <table className="mt-2 w-full text-sm text-slate-700">
              <tbody>
                <Row label="TDS deducted so far" value={p.tdsSoFar} />
                <Row label={p.complete ? "Short deducted" : "Still to deduct this year"} value={p.balance} strong />
              </tbody>
            </table>
            {doc.regime === "OLD" && doc.declared > 0 && <p className="mt-3 text-xs text-slate-500">Declared deductions: {rupees(doc.declared)} a year.</p>}
          </div>
        </div>

        <p className="mt-8 border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-400">
          A summary of salary paid and tax deducted. Form 16 Part B, line by line, is under &quot;Form 16 Part B&quot; above; Part A comes from the TRACES portal
          after the TDS returns are filed. Figures for the rest of the year are an estimate.
        </p>
      </div>
    </div>
  );
}
