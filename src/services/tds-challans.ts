import { prisma } from "@/lib/db";
import { istDateKey } from "@/lib/ist-date";
import { tdsDueDate } from "@/lib/contractor-tds";

export type ChallanState = "FUTURE" | "NO_DATA" | "NIL" | "PAID" | "LATE" | "PART_PAID" | "NOT_PAID";

/**
 * One row a month for a TDS return: TDS deducted, what was deposited (payments
 * against that month's TDS bill in Finance), when, and interest if it was late
 * (1.5% a month or part of a month from deduction to deposit, section 201(1A)).
 */
export async function tdsChallans(input: {
  organizationId: string;
  months: string[];
  billNumber: (month: string) => string;
  /** TDS deducted that month, or null when there is nothing to report yet (for example payroll not approved). */
  tdsOf: (month: string) => number | null;
  /** The date the TDS was deducted, for the interest. */
  deductedOn: (month: string) => string;
}) {
  const bills = await prisma.bill.findMany({
    where: { organizationId: input.organizationId, billNumber: { in: input.months.map(input.billNumber) }, status: { not: "VOIDED" } },
    include: { allocations: { where: { reversedAt: null }, include: { payment: { select: { paymentDate: true, referenceNumber: true, status: true } } } } },
  });
  const billOf = new Map(bills.map((b) => [b.billNumber, b]));
  const thisMonth = istDateKey().slice(0, 7);
  return input.months.map((m) => {
    const reported = input.tdsOf(m);
    const tds = reported ?? 0;
    const paid = (billOf.get(input.billNumber(m))?.allocations || []).filter((a) => a.payment.status === "POSTED");
    const deposited = Math.round(paid.reduce((s, a) => s + a.amount, 0));
    const depositedOn = paid.map((a) => istDateKey(a.payment.paymentDate)).sort().slice(-1)[0] || null;
    const due = tdsDueDate(m);
    let lateMonths = 0;
    if (depositedOn && depositedOn > due) {
      const [y1, m1] = input.deductedOn(m).split("-").map(Number);
      const [y2, m2] = depositedOn.split("-").map(Number);
      lateMonths = (y2 - y1) * 12 + (m2 - m1) + 1;
    }
    const state: ChallanState =
      m > thisMonth
        ? "FUTURE"
        : reported === null
        ? "NO_DATA"
        : tds === 0
        ? "NIL"
        : deposited >= tds
        ? depositedOn! > due
          ? "LATE"
          : "PAID"
        : deposited > 0
        ? "PART_PAID"
        : "NOT_PAID";
    return {
      month: m,
      tds,
      deposited,
      depositedOn,
      reference: paid.map((a) => a.payment.referenceNumber).filter(Boolean).join(", ") || null,
      due,
      state,
      interest: lateMonths ? Math.round(tds * 0.015 * lateMonths) : 0,
    };
  });
}

const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const money = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

/** Plain-words warnings for the challan rows. */
export function challanProblems(rows: (Awaited<ReturnType<typeof tdsChallans>>[number] & { section?: string })[], noData: string) {
  const out: string[] = [];
  for (const c of rows) {
    const tag = c.section ? ` (${c.section})` : "";
    if (c.state === "NO_DATA") out.push(`${noData} for ${monthName(c.month)}.`);
    else if (c.state === "NOT_PAID" || c.state === "PART_PAID") out.push(`TDS${tag} for ${monthName(c.month)} is not fully deposited: ${money(c.tds - c.deposited)} still to pay, due ${day(c.due)}.`);
    else if (c.state === "LATE") out.push(`TDS${tag} for ${monthName(c.month)} was deposited late, on ${day(c.depositedOn!)}. Interest of about ${money(c.interest)} is payable.`);
  }
  return out;
}

/** The last date to file each quarter's TDS return. */
export function returnDueDate(fy: string, quarter: 1 | 2 | 3 | 4) {
  const start = Number(fy.slice(0, 4));
  return [`${start}-07-31`, `${start}-10-31`, `${start + 1}-01-31`, `${start + 1}-05-31`][quarter - 1];
}
