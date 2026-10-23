"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, MessageCircle, Printer } from "lucide-react";
import { api, rupees, shortDate } from "@/lib/client-api";
import { whatsappLink } from "@/lib/contact-links";

const QUARTER_NAMES = ["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"];
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

/** A party's TDS certificate for one quarter (Form 16A), printable. */
export default function Form16APage() {
  const { partyId } = useParams<{ partyId: string }>();
  const search = useSearchParams();
  const fy = search.get("fy") || "";
  const quarter = search.get("quarter") || "1";
  const [doc, setDoc] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api(`/api/finance/form-16a?fy=${encodeURIComponent(fy)}&quarter=${encodeURIComponent(quarter)}&partyId=${encodeURIComponent(partyId)}`)
      .then(setDoc)
      .catch((e) => setError(e.message));
  }, [partyId, fy, quarter]);

  if (error) return <div className="p-8 text-center text-sm text-rose-600">{error}</div>;
  if (!doc) return <div className="p-8 text-center text-sm text-slate-500">Loading…</div>;
  const wa = whatsappLink(
    doc.deductee.whatsapp,
    `Dear ${doc.deductee.name}, TDS of ${rupees(doc.totals.tds)} was deducted from our payments to you in Q${doc.quarter} (${QUARTER_NAMES[doc.quarter - 1]}) of FY ${doc.fy}` +
      ` and deposited under TAN ${doc.deductor.tan || ""}. The certificate (Form 16A) is attached. – ${doc.deductor.name}`
  );

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 print:hidden">
        <Link href="/payroll/tds-return?kind=contractors" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> TDS return (26Q)
        </Link>
        <div className="flex items-center gap-2">
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          )}
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

      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 text-sm text-slate-700 shadow-sm print:rounded-none print:shadow-none">
        <div className="border-b-2 border-slate-900 pb-3 text-center">
          <div className="font-display text-xl font-extrabold text-slate-900">FORM No. 16A</div>
          <div className="text-xs text-slate-500">[See rule 31(1)(b)] Certificate under section 203 of the Income-tax Act, 1961 for tax deducted at source</div>
        </div>

        <table className="mt-4 w-full border border-slate-300 text-xs">
          <tbody>
            <tr className="border-b border-slate-300">
              <td className="w-1/2 border-r border-slate-300 p-2 align-top">
                <div className="font-bold uppercase text-slate-500">Deductor</div>
                <div className="mt-1 text-sm font-bold text-slate-900">{doc.deductor.name}</div>
                {doc.deductor.address && <div className="whitespace-pre-line">{doc.deductor.address}</div>}
              </td>
              <td className="p-2 align-top">
                <div className="font-bold uppercase text-slate-500">Deductee</div>
                <div className="mt-1 text-sm font-bold text-slate-900">{doc.deductee.name}</div>
                {doc.deductee.address && <div>{doc.deductee.address}</div>}
              </td>
            </tr>
            <tr className="border-b border-slate-300">
              <td className="border-r border-slate-300 p-2">
                PAN of deductor: <span className="font-mono font-semibold">{doc.deductor.pan || "—"}</span>
                <br />
                TAN of deductor: <span className="font-mono font-semibold">{doc.deductor.tan || "—"}</span>
              </td>
              <td className="p-2">
                PAN of deductee: <span className="font-mono font-semibold">{doc.deductee.pan || "PANNOTAVBL"}</span>
              </td>
            </tr>
            <tr>
              <td className="border-r border-slate-300 p-2">
                Certificate no. <span className="font-mono font-semibold">{doc.certificateNumber}</span>
                <br />
                Assessment year <span className="font-semibold">{doc.assessmentYear}</span>
              </td>
              <td className="p-2">
                Period: <span className="font-semibold">{shortDate(doc.period.from)}</span> to <span className="font-semibold">{shortDate(doc.period.to)}</span> (Q{doc.quarter})
              </td>
            </tr>
          </tbody>
        </table>

        <h2 className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-500">Summary of payment</h2>
        <table className="mt-1 w-full text-xs">
          <thead className="border-b border-slate-300 text-left text-[11px] uppercase text-slate-500">
            <tr>
              <th className="py-1.5">Date paid</th>
              <th className="py-1.5">Nature of payment</th>
              <th className="py-1.5">Code</th>
              <th className="py-1.5 text-right">Amount paid</th>
              <th className="py-1.5 text-right">Rate</th>
              <th className="py-1.5 text-right">TDS</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {doc.payments.map((p: any, i: number) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-1.5">{shortDate(p.paidOn)}</td>
                <td className="py-1.5">{p.sectionLabel}</td>
                <td className="py-1.5">{p.sectionCode}</td>
                <td className="py-1.5 text-right">{rupees(p.amountPaid)}</td>
                <td className="py-1.5 text-right">{p.rate}%</td>
                <td className="py-1.5 text-right">{rupees(p.tds)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-900 font-bold text-slate-900">
              <td className="py-1.5" colSpan={3}>
                Total
              </td>
              <td className="py-1.5 text-right">{rupees(doc.totals.paid)}</td>
              <td />
              <td className="py-1.5 text-right">{rupees(doc.totals.tds)}</td>
            </tr>
          </tbody>
        </table>

        <h2 className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-500">Tax deposited to the credit of the Central Government (challans)</h2>
        <table className="mt-1 w-full text-xs">
          <thead className="border-b border-slate-300 text-left text-[11px] uppercase text-slate-500">
            <tr>
              <th className="py-1.5">Section</th>
              <th className="py-1.5">Month</th>
              <th className="py-1.5">Challan (BSR code / serial)</th>
              <th className="py-1.5">Date deposited</th>
              <th className="py-1.5 text-right">TDS deposited</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {doc.challans.map((c: any) => (
              <tr key={`${c.section}-${c.month}`} className="border-b border-slate-100">
                <td className="py-1.5">{c.section}</td>
                <td className="py-1.5">{monthLabel(c.month)}</td>
                <td className="py-1.5 font-mono">{c.reference || "—"}</td>
                <td className="py-1.5">{c.depositedOn ? shortDate(c.depositedOn) : <span className="font-semibold text-rose-600">Not deposited</span>}</td>
                <td className="py-1.5 text-right">{rupees(c.deposited)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-900 font-bold text-slate-900">
              <td className="py-1.5" colSpan={4}>
                Total
              </td>
              <td className="py-1.5 text-right">{rupees(doc.totals.deposited)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6 rounded-xl border border-slate-300 p-3 text-xs leading-relaxed">
          <div className="font-bold uppercase text-slate-500">Verification</div>
          I, <span className="font-semibold">{doc.deductor.signatory || "____________________"}</span>, in my capacity as{" "}
          <span className="font-semibold">{doc.deductor.designation || "__________"}</span>, do hereby certify that a sum of{" "}
          <span className="font-semibold">{rupees(doc.totals.tds)}</span> ({doc.tdsInWords}) has been deducted and deposited to the credit of the Central Government, as shown above, and that
          the information given above is true, complete and correct, based on the books of account and other records available.
          <div className="mt-6 flex justify-between">
            <span>Place: ______________ &nbsp; Date: ______________</span>
            <span className="text-right">
              Signature
              <br />
              <span className="font-semibold">{doc.deductor.signatory || ""}</span>
            </span>
          </div>
        </div>
        <p className="mt-3 text-[10px] text-slate-400">
          Prepared by {doc.deductor.name} from its books. The certificate generated on TRACES after the quarterly statement is filed carries the TRACES certificate number.
        </p>
      </div>
    </div>
  );
}
