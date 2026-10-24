"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { api, rupees, shortDate } from "@/lib/client-api";
import { cn } from "@/lib/cn";

const QUARTER_NAMES = ["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"];
const shiftFy = (fy: string, by: number) => {
  const y = Number(fy.slice(0, 4)) + by;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
};

/** Form 16 Part B for one staff member, printable, line by line as in the form. */
export default function Form16Page() {
  const { userId } = useParams<{ userId: string }>();
  const search = useSearchParams();
  const [fy, setFy] = useState<string | null>(search.get("fy"));
  const [doc, setDoc] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api(`/api/payroll/form-16?userId=${encodeURIComponent(userId)}${fy ? `&fy=${fy}` : ""}`)
      .then((d: any) => {
        setDoc(d);
        if (!fy) setFy(d.fy);
      })
      .catch((e) => {
        setDoc(null);
        setError(e.message);
      });
  }, [userId, fy]);

  const yearPicker = (current: string) => (
    <div className="flex items-center rounded-xl bg-white text-sm font-semibold shadow-sm ring-1 ring-slate-200">
      <button onClick={() => setFy(shiftFy(current, -1))} className="px-3 py-2 text-slate-500 hover:text-slate-900" aria-label="Previous year">
        ‹
      </button>
      <span className="px-1 tabular-nums">FY {current}</span>
      <button onClick={() => setFy(shiftFy(current, 1))} className="px-3 py-2 text-slate-500 hover:text-slate-900" aria-label="Next year">
        ›
      </button>
    </div>
  );

  if (error)
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center text-sm text-rose-600">
        {error}
        {fy && yearPicker(fy)}
      </div>
    );
  if (!doc) return <div className="p-8 text-center text-sm text-slate-500">Loading…</div>;
  const b = doc.partB;
  const Line = ({ n, label, value, strong, indent }: { n: string; label: React.ReactNode; value?: number | null; strong?: boolean; indent?: boolean }) => (
    <tr className={cn("border-b border-slate-200", strong && "font-bold text-slate-900")}>
      <td className="w-10 py-1.5 pr-2 align-top text-slate-500">{n}</td>
      <td className={cn("py-1.5", indent && "pl-4")}>{label}</td>
      <td className="w-36 py-1.5 text-right tabular-nums">{value === null || value === undefined ? "" : rupees(value)}</td>
    </tr>
  );

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 print:hidden">
        <Link href={`/payroll/tax/${userId}?fy=${doc.fy}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Salary and tax statement
        </Link>
        <div className="flex items-center gap-2">
          {yearPicker(doc.fy)}
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">
            <Printer className="h-4 w-4" /> Print / save PDF
          </button>
        </div>
      </div>

      {doc.problems.length > 0 && (
        <div className="mx-auto mb-4 max-w-3xl px-4 print:hidden">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <ul className="list-disc space-y-1 pl-5">
              {doc.problems.map((p: string) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl bg-white p-8 text-sm text-slate-700 shadow-sm print:rounded-none print:shadow-none">
        {!doc.complete && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="-rotate-12 text-7xl font-extrabold uppercase tracking-widest text-slate-900/5">Draft</span>
          </div>
        )}
        <div className="border-b-2 border-slate-900 pb-3 text-center">
          <div className="font-display text-xl font-extrabold text-slate-900">FORM No. 16 · PART B</div>
          <div className="text-xs text-slate-500">[See rule 31(1)(a)] Annexure: details of salary paid and any other income and tax deducted</div>
        </div>

        <table className="mt-4 w-full border border-slate-300 text-xs">
          <tbody>
            <tr className="border-b border-slate-300">
              <td className="w-1/2 border-r border-slate-300 p-2 align-top">
                <div className="font-bold uppercase text-slate-500">Employer</div>
                <div className="mt-1 text-sm font-bold text-slate-900">{doc.employer.name}</div>
                {doc.employer.address && <div className="whitespace-pre-line">{doc.employer.address}</div>}
              </td>
              <td className="p-2 align-top">
                <div className="font-bold uppercase text-slate-500">Employee</div>
                <div className="mt-1 text-sm font-bold text-slate-900">{doc.employee.name}</div>
                <div className="capitalize">{doc.employee.designation}</div>
              </td>
            </tr>
            <tr className="border-b border-slate-300">
              <td className="border-r border-slate-300 p-2">
                PAN of employer: <span className="font-mono font-semibold">{doc.employer.pan || "—"}</span>
                <br />
                TAN of employer: <span className="font-mono font-semibold">{doc.employer.tan || "—"}</span>
              </td>
              <td className="p-2">
                PAN of employee: <span className="font-mono font-semibold">{doc.employee.pan || "PANNOTAVBL"}</span>
              </td>
            </tr>
            <tr>
              <td className="border-r border-slate-300 p-2">
                Certificate no. <span className="font-mono font-semibold">{doc.certificateNumber}</span>
                <br />
                Assessment year <span className="font-semibold">{doc.assessmentYear}</span>
              </td>
              <td className="p-2">
                Period with employer: <span className="font-semibold">{shortDate(doc.period.from)}</span> to <span className="font-semibold">{shortDate(doc.period.to)}</span>
              </td>
            </tr>
          </tbody>
        </table>

        <h2 className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-500">Tax deducted and deposited, quarter by quarter (check against Part A from TRACES)</h2>
        <table className="mt-1 w-full text-xs">
          <thead className="border-b border-slate-300 text-left text-[11px] uppercase text-slate-500">
            <tr>
              <th className="py-1.5">Quarter</th>
              <th className="py-1.5 text-right">Salary paid</th>
              <th className="py-1.5 text-right">TDS deducted</th>
              <th className="py-1.5 text-right">TDS deposited</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {doc.quarters.map((q: any) => (
              <tr key={q.quarter} className="border-b border-slate-100">
                <td className="py-1.5">
                  Q{q.quarter} ({QUARTER_NAMES[q.quarter - 1]})
                </td>
                <td className="py-1.5 text-right">{rupees(q.paid)}</td>
                <td className="py-1.5 text-right">{rupees(q.tds)}</td>
                <td className={cn("py-1.5 text-right", q.deposited < q.tds && "font-semibold text-rose-600")}>{rupees(q.deposited)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-5 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
          <span>Whether opting out of taxation under section 115BAC(1A)?</span>
          <span className="font-bold text-slate-900">{doc.optedOutOf115BAC ? "Yes (old regime)" : "No (new regime)"}</span>
        </div>

        <table className="mt-3 w-full text-xs">
          <tbody>
            <Line n="1" label="Gross salary" />
            <Line n="(a)" indent label="Salary as per section 17(1)" value={b.salary17_1} />
            <Line n="(b)" indent label="Value of perquisites under section 17(2)" value={b.perquisites17_2} />
            <Line n="(c)" indent label="Profits in lieu of salary under section 17(3)" value={b.profits17_3} />
            <Line n="(d)" indent label="Total" value={b.grossSalary} strong />
            <Line n="(e)" indent label="Reported total amount of salary received from other employer(s)" value={b.otherEmployers} />
            <Line n="2" label="Less: allowances to the extent exempt under section 10" value={b.exempt10} />
            <Line n="3" label="Total amount of salary received from current employer [1(d) − 2]" value={b.fromThisEmployer} strong />
            <Line n="4" label="Less: deductions under section 16" />
            <Line n="(a)" indent label="Standard deduction under section 16(ia)" value={b.standardDeduction} />
            <Line n="(b)" indent label="Entertainment allowance under section 16(ii)" value={b.entertainment} />
            <Line n="(c)" indent label="Tax on employment under section 16(iii)" value={b.taxOnEmployment} />
            <Line n="5" label="Total amount of deductions under section 16 [4(a) + 4(b) + 4(c)]" value={b.totalUnder16} />
            <Line n="6" label='Income chargeable under the head "Salaries" [3 + 1(e) − 5]' value={b.chargeableSalary} strong />
            <Line n="7–8" label="Other income reported by the employee" value={b.otherIncome} />
            <Line n="9" label="Gross total income (6 + 8)" value={b.grossTotalIncome} strong />
            <Line n="10" label="Deductions under Chapter VI-A" />
            <Line n="(a)" indent label="Section 80C (including employee's provident fund), capped at ₹1,50,000" value={b.sec80C} />
            <Line n="(b)–(k)" indent label="Other deductions declared by the employee (80CCD, 80D, 80E, 80G, 80TTA…)" value={b.otherVIA} />
            <Line n="11" label="Aggregate of deductible amount under Chapter VI-A" value={b.totalVIA} />
            <Line n="12" label="Total taxable income (9 − 11)" value={b.totalIncome} strong />
            <Line n="13" label="Tax on total income" value={b.taxOnIncome} />
            <Line n="14" label="Rebate under section 87A, if applicable" value={b.rebate87A} />
            <Line n="15" label="Surcharge, wherever applicable" value={b.surcharge} />
            <Line n="16" label="Health and education cess" value={b.cess} />
            <Line n="17" label="Tax payable (13 + 15 + 16 − 14)" value={b.taxPayable} strong />
            <Line n="18" label="Less: relief under section 89" value={b.relief89} />
            <Line n="19" label="Net tax payable (17 − 18)" value={b.netTaxPayable} strong />
          </tbody>
        </table>
        <div className="mt-2 flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
          <span>Tax deducted at source during the year</span>
          <span className="font-bold tabular-nums text-slate-900">{rupees(b.tdsDeducted)}</span>
        </div>
        {b.balance !== 0 && (
          <div className={cn("mt-1 flex justify-between px-3 text-xs", b.balance > 0 ? "text-rose-600" : "text-emerald-700")}>
            <span>{b.balance > 0 ? "Short deducted (the employee pays it with the return)" : "Deducted in excess (the employee claims the refund)"}</span>
            <span className="font-semibold tabular-nums">{rupees(Math.abs(b.balance))}</span>
          </div>
        )}

        <div className="mt-6 rounded-xl border border-slate-300 p-3 text-xs leading-relaxed">
          <div className="font-bold uppercase text-slate-500">Verification</div>
          I, <span className="font-semibold">{doc.employer.signatory || "____________________"}</span>, working in the capacity of{" "}
          <span className="font-semibold">{doc.employer.designation || "__________"}</span>, do hereby certify that the information given above is true, complete and correct and is based on the
          books of account, documents, TDS statements and other available records. A sum of <span className="font-semibold">{rupees(b.tdsDeducted)}</span> ({doc.tdsInWords}) has been deducted
          at source and paid to the credit of the Central Government.
          <div className="mt-6 flex justify-between">
            <span>Place: ______________ &nbsp; Date: ______________</span>
            <span className="text-right">
              Signature of the person responsible for deduction of tax
              <br />
              <span className="font-semibold">{doc.employer.signatory || ""}</span>
            </span>
          </div>
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
          Part B prepared by {doc.employer.name} from its payroll. Part A, with the TRACES certificate number and the 24Q receipt numbers, is downloaded from TRACES after the four quarterly
          returns are filed; issue both together by {shortDate(doc.due)}. Allowances exempt under section 10, perquisites and income from other employers are not kept in payroll and show as nil.
        </p>
      </div>
    </div>
  );
}
