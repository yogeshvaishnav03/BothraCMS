"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { api, rupees, shortDate } from "@/lib/client-api";

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

/** A printable payslip (use the browser's Print → Save as PDF). */
export default function PayslipPage() {
  const { id } = useParams<{ id: string }>();
  const [slip, setSlip] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api(`/api/payroll/lines/${id}/payslip`).then(setSlip).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="p-8 text-center text-sm text-rose-600">{error}</div>;
  if (!slip) return <div className="p-8 text-center text-sm text-slate-500">Loading payslip…</div>;

  const labour = slip.personType === "LABOUR";
  const earnings = [
    { label: labour ? `Wages (${slip.payableDays} days × ${rupees(slip.rate)})` : `Salary (${slip.payableDays} of ${new Date(Date.UTC(+slip.run.month.slice(0, 4), +slip.run.month.slice(5), 0)).getUTCDate()} days)`, amount: slip.basePay },
    ...(slip.overtimePay ? [{ label: `Overtime (${slip.overtimeHours} hrs)`, amount: slip.overtimePay }] : []),
    ...(slip.bonus ? [{ label: "Bonus / incentive", amount: slip.bonus }] : []),
  ];
  const deductions = [
    ...slip.advances.map((a: any) => ({ label: `Advance given ${shortDate(a.givenOn)}`, amount: a.amount })),
    ...(slip.pfEmployee ? [{ label: "Provident fund (12%)", amount: slip.pfEmployee }] : []),
    ...(slip.esiEmployee ? [{ label: "ESI (0.75%)", amount: slip.esiEmployee }] : []),
    ...(slip.professionalTax ? [{ label: "Professional tax", amount: slip.professionalTax }] : []),
    ...(slip.tds ? [{ label: "Income tax (TDS)", amount: slip.tds }] : []),
    ...(slip.otherDeduction ? [{ label: "Other deduction", amount: slip.otherDeduction }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-5 sm:px-4 sm:py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between gap-2 print:hidden">
        <Link href="/payroll" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Payroll
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs sm:text-sm font-bold text-white whitespace-nowrap">
          <Printer className="h-4 w-4" /> Print / save PDF
        </button>
      </div>
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-5 sm:p-8 shadow-sm print:rounded-none print:p-0 print:shadow-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b-2 border-slate-900 pb-4">
          <div className="min-w-0">
            <div className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 leading-snug">{slip.organizationName}</div>
            <div className="text-xs sm:text-sm text-slate-500 mt-0.5">Payslip for {monthLabel(slip.run.month)}</div>
          </div>
          <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-0.5 shrink-0">
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ring-1 whitespace-nowrap ${
                slip.run.status === "PAID"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : slip.run.status === "APPROVED"
                  ? "bg-amber-50 text-amber-800 ring-amber-200"
                  : "bg-slate-100 text-slate-600 ring-slate-200"
              }`}
            >
              {slip.run.status === "PAID" ? "Paid" : slip.run.status === "APPROVED" ? "Approved" : "Draft"}
            </span>
            {slip.run.paidAt && <div className="text-xs text-slate-500 whitespace-nowrap">on {shortDate(slip.run.paidAt)}</div>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 text-sm sm:grid-cols-2 sm:gap-4 sm:p-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Employee</div>
            <div className="font-bold text-slate-900 mt-0.5">{slip.personName}</div>
            <div className="text-xs text-slate-600 capitalize">{(slip.roleLabel || "").toLowerCase()}</div>
            {(slip.uan || slip.esicNumber) && (
              <div className="text-xs text-slate-500 mt-1">{[slip.uan && `UAN ${slip.uan}`, slip.esicNumber && `ESIC ${slip.esicNumber}`].filter(Boolean).join(" · ")}</div>
            )}
          </div>
          <div className="min-w-0 border-t border-slate-200/70 pt-3 sm:border-t-0 sm:pt-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Attendance & Site</div>
            <div className="font-semibold text-slate-900 mt-0.5">
              {slip.daysPresent} full days{slip.halfDays ? `, ${slip.halfDays} half days` : ""}
              {slip.leaveDays ? `, ${slip.leaveDays} leave` : ""}
            </div>
            {slip.projectName && <div className="text-xs text-slate-600 mt-0.5 leading-snug">Site: {slip.projectName}</div>}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {[
            { title: "Earnings", rows: earnings, total: slip.gross },
            { title: "Deductions", rows: deductions, total: slip.gross - slip.net },
          ].map((block) => (
            <div key={block.title}>
              <div className="border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wider text-slate-500">{block.title}</div>
              {block.rows.length === 0 && <div className="py-2 text-sm text-slate-400">None</div>}
              {block.rows.map((r: any, i: number) => (
                <div key={i} className="flex justify-between gap-3 py-1.5 text-sm">
                  <span className="text-slate-700 min-w-0">{r.label}</span>
                  <span className="tabular-nums text-slate-900 shrink-0 whitespace-nowrap">{rupees(r.amount)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between gap-3 border-t border-slate-200 pt-1.5 text-sm font-bold">
                <span>Total</span>
                <span className="tabular-nums shrink-0 whitespace-nowrap">{rupees(block.total)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3.5 sm:px-5 sm:py-4 text-white">
          <span className="text-sm font-semibold">Net pay</span>
          <span className="font-display text-xl sm:text-2xl font-extrabold tabular-nums whitespace-nowrap">{rupees(slip.net)}</span>
        </div>
        {slip.pfEmployer + slip.esiEmployer > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Paid by the company on top of your salary:{" "}
            {[slip.pfEmployer && `PF ${rupees(slip.pfEmployer)}`, slip.esiEmployer && `ESI ${rupees(slip.esiEmployer)}`].filter(Boolean).join(", ")}.
          </p>
        )}
        {slip.note && <p className="mt-3 text-sm text-slate-600">Note: {slip.note}</p>}
        <p className="mt-8 text-center text-[11px] text-slate-400">This is a computer-generated payslip.</p>
      </div>
    </div>
  );
}
