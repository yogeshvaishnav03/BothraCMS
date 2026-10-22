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
    ...(slip.otherDeduction ? [{ label: "Other deduction", amount: slip.otherDeduction }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between px-4 print:hidden">
        <Link href="/payroll" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Payroll
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">
          <Printer className="h-4 w-4" /> Print / save PDF
        </button>
      </div>
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm print:rounded-none print:shadow-none">
        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <div className="font-display text-2xl font-extrabold text-slate-900">{slip.organizationName}</div>
            <div className="text-sm text-slate-500">Payslip for {monthLabel(slip.run.month)}</div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div className="font-bold uppercase tracking-wider">{slip.run.status === "PAID" ? "Paid" : slip.run.status === "APPROVED" ? "Approved" : "Draft"}</div>
            {slip.run.paidAt && <div>on {shortDate(slip.run.paidAt)}</div>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-500">Name</div>
            <div className="font-bold text-slate-900">{slip.personName}</div>
            <div className="text-slate-600">{(slip.roleLabel || "").toLowerCase()}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Attendance</div>
            <div className="text-slate-900">
              {slip.daysPresent} full days{slip.halfDays ? `, ${slip.halfDays} half days` : ""}
              {slip.leaveDays ? `, ${slip.leaveDays} leave` : ""}
            </div>
            {slip.projectName && <div className="text-slate-600">Site: {slip.projectName}</div>}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {[
            { title: "Earnings", rows: earnings, total: slip.gross },
            { title: "Deductions", rows: deductions, total: slip.advanceDeduction + slip.otherDeduction },
          ].map((block) => (
            <div key={block.title}>
              <div className="border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wider text-slate-500">{block.title}</div>
              {block.rows.length === 0 && <div className="py-2 text-sm text-slate-400">None</div>}
              {block.rows.map((r: any, i: number) => (
                <div key={i} className="flex justify-between py-1.5 text-sm">
                  <span className="text-slate-700">{r.label}</span>
                  <span className="tabular-nums text-slate-900">{rupees(r.amount)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5 text-sm font-bold">
                <span>Total</span>
                <span className="tabular-nums">{rupees(block.total)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between rounded-xl bg-slate-900 px-5 py-4 text-white">
          <span className="text-sm font-semibold">Net pay</span>
          <span className="font-display text-2xl font-extrabold tabular-nums">{rupees(slip.net)}</span>
        </div>
        {slip.note && <p className="mt-3 text-sm text-slate-600">Note: {slip.note}</p>}
        <p className="mt-8 text-center text-[11px] text-slate-400">This is a computer-generated payslip.</p>
      </div>
    </div>
  );
}
