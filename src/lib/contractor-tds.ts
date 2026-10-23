/**
 * TDS on payments to contractors, section 194C of the Income-tax Act.
 *
 * - 1% when the contractor is an individual or HUF (4th letter of the PAN is
 *   P or H), 2% for anyone else (firm, company, trust...).
 * - 20% when there is no PAN (section 206AA).
 * - Nothing is due while a single payment is ₹30,000 or less and the year's
 *   payments to that contractor are ₹1,00,000 or less. Once the year crosses
 *   ₹1 lakh, TDS is due on the whole year, so the earlier small payments are
 *   caught up in the payment that crosses it.
 * - TDS is on the amount before GST when the GST is shown separately.
 *
 * Amounts are in paise.
 */

export const SECTION_194C = "194C";
export const SINGLE_LIMIT = 30_000_00;
export const YEAR_LIMIT = 1_00_000_00;
export const NO_PAN_RATE = 20;

const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
const GSTIN = /^\d{2}([A-Z]{5}\d{4}[A-Z])[A-Z\d]Z[A-Z\d]$/;

/** The contractor's PAN, from the PAN field or else from inside their GSTIN. */
export function contractorPan(party: { panNumber?: string | null; taxIdentifier?: string | null }): string | null {
  const pan = party.panNumber?.trim().toUpperCase();
  if (pan && PAN.test(pan)) return pan;
  const gstin = party.taxIdentifier?.trim().toUpperCase();
  const m = gstin ? GSTIN.exec(gstin) : null;
  return m ? m[1] : null;
}

export function rate194C(pan: string | null) {
  if (!pan) return NO_PAN_RATE;
  return pan[3] === "P" || pan[3] === "H" ? 1 : 2;
}

/** Contractors and parties marked as both supply and work. */
export function isContractor(partyType: string | null | undefined) {
  return partyType === "CONTRACTOR" || partyType === "BOTH";
}

export type TdsMode = "AUTO" | "NONE" | "MANUAL";

export interface TdsResult {
  section: string | null;
  rate: number;
  base: number;
  /** Earlier payments this year that had no TDS and are caught up now. */
  catchUpBase: number;
  amount: number;
  note: string | null;
}

const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

/**
 * TDS on one payment.
 * `base` is this payment's amount before GST; `yearBefore` is the year's
 * earlier payments to the same contractor (their base, and the part of it that
 * had no TDS).
 */
export function work194C(input: {
  pan: string | null;
  base: number;
  yearBefore: { base: number; untaxedBase: number };
  mode?: TdsMode;
  manualAmount?: number;
  reason?: string | null;
}): TdsResult {
  const base = Math.max(0, Math.round(input.base));
  const rate = rate194C(input.pan);
  const mode = input.mode || "AUTO";
  if (mode === "NONE") {
    return { section: null, rate: 0, base, catchUpBase: 0, amount: 0, note: input.reason?.trim() || "No TDS" };
  }
  if (mode === "MANUAL") {
    const amount = Math.max(0, Math.min(base, Math.round(input.manualAmount || 0)));
    return {
      section: SECTION_194C,
      rate: base ? Math.round((amount / base) * 10000) / 100 : 0,
      base,
      catchUpBase: 0,
      amount,
      note: input.reason?.trim() || "Typed in",
    };
  }
  const yearAfter = input.yearBefore.base + base;
  const crossesYear = yearAfter > YEAR_LIMIT;
  if (base <= SINGLE_LIMIT && !crossesYear) {
    return {
      section: null,
      rate: 0,
      base,
      catchUpBase: 0,
      amount: 0,
      note: `Under ${rupees(SINGLE_LIMIT)} and ${rupees(yearAfter)} so far this year (TDS starts above ${rupees(YEAR_LIMIT)})`,
    };
  }
  const catchUpBase = crossesYear ? input.yearBefore.untaxedBase : 0;
  const amount = Math.round(((base + catchUpBase) * rate) / 100);
  const notes = [input.pan ? null : "No PAN, so 20%"];
  if (catchUpBase) notes.push(`includes ${rupees(catchUpBase)} paid earlier this year without TDS`);
  return { section: SECTION_194C, rate, base, catchUpBase, amount, note: notes.filter(Boolean).join("; ") || null };
}

/** What actually leaves the bank for a payment: the TDS held back stays with us until it is deposited. */
export function bankAmount(p: { amount: number; tdsAmount?: number | null }) {
  return p.amount - (p.tdsAmount || 0);
}

/** First day of the financial year (April) holding this IST date key. */
export function fyStartOf(dateKey: string) {
  const y = Number(dateKey.slice(0, 4));
  const m = Number(dateKey.slice(5, 7));
  return `${m >= 4 ? y : y - 1}-04-01`;
}

/** TDS is deposited by the 7th of the next month; for March, by 30 April. */
export function tdsDueDate(month: string) {
  if (month.endsWith("-03")) return `${month.slice(0, 4)}-04-30`;
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-07` : `${y}-${String(m + 1).padStart(2, "0")}-07`;
}
