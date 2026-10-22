import React from "react";
import { paiseInWords } from "@/lib/amount-words";

/** Printable receipt and demand letter. Plain markup so the staff pages and the buyer portal share them. */

const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDate = (d: string | null | undefined) =>
  d ? new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";
const MODES: Record<string, string> = { NEFT_RTGS: "NEFT / RTGS", UPI: "UPI", CHEQUE: "Cheque", CASH: "Cash", HOME_LOAN: "Home loan disbursement" };

interface Company {
  name: string;
  address: string | null;
  phone: string | null;
  gstin: string | null;
}

function Letterhead({ company, title, number, date }: { company: Company; title: string; number?: string | null; date: string }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-4">
      <div>
        <div className="font-display text-xl font-extrabold text-slate-900">{company.name}</div>
        {company.address && <div className="mt-1 max-w-xs text-xs text-slate-600">{company.address}</div>}
        <div className="mt-1 text-xs text-slate-600">
          {[company.phone ? `Ph ${company.phone}` : null, company.gstin ? `GSTIN ${company.gstin}` : null].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{title}</div>
        {number && <div className="mt-1 font-mono text-sm font-bold text-slate-900">{number}</div>}
        <div className="mt-0.5 text-xs text-slate-600">{longDate(date)}</div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <tr className={strong ? "border-t border-slate-300 font-bold text-slate-900" : "text-slate-700"}>
      <td className="py-1.5 pr-4">{label}</td>
      <td className="py-1.5 text-right tabular-nums">{value}</td>
    </tr>
  );
}

export function ReceiptDocument({ receipt }: { receipt: any }) {
  const b = receipt.booking;
  const half = Math.floor(receipt.gstAmount / 2);
  return (
    <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200 print:rounded-none print:shadow-none print:ring-0">
      <Letterhead company={receipt.company} title="Payment receipt" number={receipt.receiptNumber} date={receipt.date} />
      <p className="mt-5 text-sm leading-relaxed text-slate-700">
        Received with thanks from <b className="text-slate-900">{b.customerName}</b> the sum of <b className="text-slate-900">{inr(receipt.amount)}</b> (
        {paiseInWords(receipt.amount)}) by {MODES[receipt.mode] || receipt.mode}
        {receipt.reference ? `, reference ${receipt.reference}` : ""}, towards <b className="text-slate-900">{receipt.installment.label}</b> for unit{" "}
        <b className="text-slate-900">{b.unit.unitNumber}</b> ({b.unit.unitType}) in {b.unit.project.name}, booking {b.bookingNumber}.
      </p>
      <table className="mt-5 w-full text-sm">
        <tbody>
          <Row label="Towards the unit price" value={inr(receipt.taxableAmount)} />
          {receipt.gstAmount > 0 && (
            <>
              <Row label={`CGST @ ${b.gstRate / 2}%`} value={inr(half)} />
              <Row label={`SGST @ ${b.gstRate / 2}%`} value={inr(receipt.gstAmount - half)} />
            </>
          )}
          <Row label="Total received" value={inr(receipt.amount)} strong />
        </tbody>
      </table>
      <p className="mt-4 text-xs text-slate-500">Cheque payments are subject to realisation.</p>
      <div className="mt-12 flex items-end justify-between text-xs text-slate-600">
        <div>{receipt.byName ? `Received by ${receipt.byName}` : ""}</div>
        <div className="text-right">
          <div className="mb-8">For {receipt.company.name}</div>
          <div className="border-t border-slate-400 pt-1">Authorised signatory</div>
        </div>
      </div>
    </div>
  );
}

export function DemandLetter({ letter, today, portalUrl }: { letter: any; today: string; portalUrl?: string | null }) {
  const b = letter.booking;
  const inst = letter.installment;
  const half = Math.floor(inst.gstAmount / 2);
  const payNow = inst.balance + letter.earlierDue;
  return (
    <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200 print:rounded-none print:shadow-none print:ring-0">
      <Letterhead company={letter.company} title="Payment demand" number={b.bookingNumber} date={today} />
      <div className="mt-5 text-sm text-slate-700">
        <div className="font-semibold text-slate-900">{b.customerName}</div>
        <div>{b.customerPhone}</div>
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-900">
        Subject: Payment due for unit {b.unit.unitNumber}, {b.unit.project.name}: {inst.label}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-700">
        Dear {b.customerName.split(" ")[0]}, we are happy to tell you that construction has reached the stage linked to this instalment. As per your
        payment schedule, please pay the amount below by <b className="text-slate-900">{longDate(inst.dueDate)}</b>.
      </p>
      <table className="mt-5 w-full text-sm">
        <tbody>
          <Row label={`${inst.label}${inst.percent ? ` (${inst.percent}% of ${inr(b.agreementValue)})` : ""}`} value={inr(inst.amount)} />
          {inst.gstAmount > 0 && (
            <>
              <Row label={`CGST @ ${b.gstRate / 2}%`} value={inr(half)} />
              <Row label={`SGST @ ${b.gstRate / 2}%`} value={inr(inst.gstAmount - half)} />
            </>
          )}
          {inst.receivedAmount > 0 && <Row label="Less: already received" value={`− ${inr(inst.receivedAmount)}`} />}
          {letter.earlierDue > 0 && <Row label="Add: earlier instalments still unpaid" value={inr(letter.earlierDue)} />}
          <Row label="Amount payable now" value={inr(payNow)} strong />
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500">{paiseInWords(payNow)}</p>
      <p className="mt-4 text-sm text-slate-700">
        Paid so far on this booking: {inr(letter.paidSoFar)}. Please share the transaction reference after paying so we can send your receipt.
      </p>
      {portalUrl && (
        <p className="mt-2 text-sm text-slate-700">
          See your full schedule, receipts and site photos any time at <span className="break-all font-medium text-slate-900">{portalUrl}</span>
        </p>
      )}
      <div className="mt-12 text-right text-xs text-slate-600">
        <div className="mb-8">For {letter.company.name}</div>
        <div className="ml-auto w-48 border-t border-slate-400 pt-1">Authorised signatory</div>
      </div>
    </div>
  );
}
