/**
 * TDS held back on payments to parties (not salary): contractors (194C),
 * professionals and technical services (194J), rent (194I) and large
 * purchases of goods (194Q).
 *
 * Section 194C, contractors:
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
 * The sections a party can come under. A party with none set is 194C when it
 * is a contractor and is not taxed otherwise (supplies of goods).
 *
 * - 194J: professional fees (architect, structural consultant, CA, lawyer)
 *   10%; technical services 2%. Due once the year's fees pass ₹50,000.
 * - 194I: rent of plant and machinery (cranes, JCB, shuttering on hire) 2%;
 *   land or building 10%. Due once the month's rent passes ₹50,000.
 *
 * - 194Q: purchases of goods from one supplier above ₹50 lakh in the year,
 *   0.1% on the part above ₹50 lakh only (no catch-up), 5% without a PAN.
 *   Only for a buyer whose turnover last year was over ₹10 crore, so it is
 *   switched on for the company in Settings.
 *
 * `code` is the section code the 26Q return uses. Limits are from the
 * Finance Act 2025; check them each April.
 */
export interface TdsSection {
  key: string;
  label: string;
  act: "194C" | "194J" | "194I" | "194Q";
  code: string;
  rate: (pan: string) => number;
  /** Rate without a PAN (206AA): 20%, or 5% for 194Q. */
  noPanRate?: number;
  /** TDS only on the part of the period's payments above the limit, not the whole period (194Q). */
  excessOnly?: boolean;
  /** A single payment above this is taxed even under the period limit. */
  single?: number;
  /** TDS starts once the period's payments pass this, on the whole period. */
  limit: number;
  period: "YEAR" | "MONTH";
}

export const TDS_SECTIONS: Record<string, TdsSection> = {
  "194C": { key: "194C", label: "Contractor (194C)", act: "194C", code: "94C", rate: (pan) => (pan[3] === "P" || pan[3] === "H" ? 1 : 2), single: SINGLE_LIMIT, limit: YEAR_LIMIT, period: "YEAR" },
  "194J_PROF": { key: "194J_PROF", label: "Professional fees (194J)", act: "194J", code: "94J-B", rate: () => 10, limit: 50_000_00, period: "YEAR" },
  "194J_TECH": { key: "194J_TECH", label: "Technical services (194J)", act: "194J", code: "94J-A", rate: () => 2, limit: 50_000_00, period: "YEAR" },
  "194I_PM": { key: "194I_PM", label: "Machinery on hire (194I)", act: "194I", code: "4IA", rate: () => 2, limit: 50_000_00, period: "MONTH" },
  "194I_LB": { key: "194I_LB", label: "Rent of land or building (194I)", act: "194I", code: "4IB", rate: () => 10, limit: 50_000_00, period: "MONTH" },
  "194Q": { key: "194Q", label: "Purchase of goods (194Q)", act: "194Q", code: "94Q", rate: () => 0.1, noPanRate: 5, limit: 50_00_000_00, period: "YEAR", excessOnly: true },
};

/** The acts a monthly TDS bill is kept for, and the payment sections under each. */
export const TDS_ACTS = ["194C", "194J", "194I", "194Q"] as const;
export type TdsAct = (typeof TDS_ACTS)[number];
export const sectionsOf = (act: TdsAct) => Object.values(TDS_SECTIONS).filter((s) => s.act === act).map((s) => s.key);

/**
 * The section that applies to a party, or null when its payments are not taxed.
 * `buyer194Q` is the company's "turnover over ₹10 crore" setting: then goods
 * suppliers with no section set come under 194Q.
 */
export function partySection(party: { partyType?: string | null; tdsSection?: string | null }, opts: { buyer194Q?: boolean } = {}): TdsSection | null {
  if (party.tdsSection === "NONE") return null;
  if (party.tdsSection && TDS_SECTIONS[party.tdsSection]) return TDS_SECTIONS[party.tdsSection];
  if (isContractor(party.partyType)) return TDS_SECTIONS["194C"];
  return opts.buyer194Q && party.partyType === "VENDOR" ? TDS_SECTIONS["194Q"] : null;
}

/** The section a payment was taxed under (old payments say "194C"). */
export const paymentSection = (key: string | null | undefined) => (key && TDS_SECTIONS[key]) || null;

/**
 * TDS on one payment.
 * `base` is this payment's amount before GST; `before` is the earlier
 * payments to the same party in the section's period (the financial year,
 * or the month for rent), and the part of them that had no TDS.
 */
export function workTds(input: {
  section: TdsSection;
  pan: string | null;
  base: number;
  before: { base: number; untaxedBase: number };
  mode?: TdsMode;
  manualAmount?: number;
  reason?: string | null;
}): TdsResult {
  const sec = input.section;
  const base = Math.max(0, Math.round(input.base));
  const noPanRate = sec.noPanRate ?? NO_PAN_RATE;
  const rate = input.pan ? sec.rate(input.pan) : noPanRate;
  const mode = input.mode || "AUTO";
  if (mode === "NONE") {
    return { section: null, rate: 0, base, catchUpBase: 0, amount: 0, note: input.reason?.trim() || "No TDS" };
  }
  if (mode === "MANUAL") {
    const amount = Math.max(0, Math.min(base, Math.round(input.manualAmount || 0)));
    return {
      section: sec.key,
      rate: base ? Math.round((amount / base) * 10000) / 100 : 0,
      base,
      catchUpBase: 0,
      amount,
      note: input.reason?.trim() || "Typed in",
    };
  }
  const after = input.before.base + base;
  const crosses = after > sec.limit;
  const period = sec.period === "MONTH" ? "this month" : "this year";
  if (sec.excessOnly) {
    // Only the part of this payment that takes the year above the limit is taxed.
    const taxed = Math.max(0, after - Math.max(sec.limit, input.before.base));
    if (!taxed) return { section: null, rate: 0, base, catchUpBase: 0, amount: 0, note: `${rupees(after)} so far ${period} (TDS starts above ${rupees(sec.limit)})` };
    const notes = [input.pan ? null : `No PAN, so ${noPanRate}%`, taxed < base ? `on ${rupees(taxed)} above ${rupees(sec.limit)} this year` : null];
    return { section: sec.key, rate, base, catchUpBase: 0, amount: Math.round((taxed * rate) / 100), note: notes.filter(Boolean).join("; ") || null };
  }
  if (!crosses && !(sec.single && base > sec.single)) {
    const under = sec.single ? `Under ${rupees(sec.single)} and ${rupees(after)} so far ${period}` : `${rupees(after)} so far ${period}`;
    return { section: null, rate: 0, base, catchUpBase: 0, amount: 0, note: `${under} (TDS starts above ${rupees(sec.limit)})` };
  }
  const catchUpBase = crosses ? input.before.untaxedBase : 0;
  const amount = Math.round(((base + catchUpBase) * rate) / 100);
  const notes = [input.pan ? null : `No PAN, so ${noPanRate}%`];
  if (catchUpBase) notes.push(`includes ${rupees(catchUpBase)} paid earlier ${period} without TDS`);
  return { section: sec.key, rate, base, catchUpBase, amount, note: notes.filter(Boolean).join("; ") || null };
}

/** TDS on a payment to a contractor (section 194C). */
export function work194C(input: {
  pan: string | null;
  base: number;
  yearBefore: { base: number; untaxedBase: number };
  mode?: TdsMode;
  manualAmount?: number;
  reason?: string | null;
}): TdsResult {
  return workTds({ ...input, section: TDS_SECTIONS["194C"], before: input.yearBefore });
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
