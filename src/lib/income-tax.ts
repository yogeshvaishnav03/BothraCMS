/**
 * Income tax on salary, for TDS under section 192. Rates are those of the
 * Finance Act 2025 (new regime slabs up to ₹24 lakh at 30%, rebate up to
 * ₹12 lakh). Check them each April and change the tables here if the budget
 * changes them. All amounts are in paise.
 */

export type TaxRegime = "NEW" | "OLD";

const L = 1_00_000_00; // ₹1 lakh in paise

const SLABS: Record<TaxRegime, { upTo: number | null; rate: number }[]> = {
  NEW: [
    { upTo: 4 * L, rate: 0 },
    { upTo: 8 * L, rate: 5 },
    { upTo: 12 * L, rate: 10 },
    { upTo: 16 * L, rate: 15 },
    { upTo: 20 * L, rate: 20 },
    { upTo: 24 * L, rate: 25 },
    { upTo: null, rate: 30 },
  ],
  OLD: [
    { upTo: 2.5 * L, rate: 0 },
    { upTo: 5 * L, rate: 5 },
    { upTo: 10 * L, rate: 20 },
    { upTo: null, rate: 30 },
  ],
};

export const STANDARD_DEDUCTION: Record<TaxRegime, number> = { NEW: 75_000_00, OLD: 50_000_00 };
/** Section 87A: no tax up to this taxable income. */
const REBATE_LIMIT: Record<TaxRegime, number> = { NEW: 12 * L, OLD: 5 * L };
/** 80C (which includes the employee's PF) is capped at ₹1.5 lakh. */
export const SECTION_80C_CAP = 1.5 * L;

const rupee = (paise: number) => Math.round(paise / 100) * 100;

function slabTax(taxable: number, regime: TaxRegime) {
  let tax = 0;
  let from = 0;
  for (const s of SLABS[regime]) {
    const top = s.upTo ?? Infinity;
    if (taxable > from) tax += ((Math.min(taxable, top) - from) * s.rate) / 100;
    from = top;
  }
  return tax;
}

function surchargeRate(taxable: number, regime: TaxRegime) {
  if (taxable > 500 * L) return regime === "OLD" ? 37 : 25;
  if (taxable > 200 * L) return 25;
  if (taxable > 100 * L) return 15;
  if (taxable > 50 * L) return 10;
  return 0;
}

/** Tax for the year on a taxable income, with rebate, surcharge and 4% cess. */
export function annualTax(taxable: number, regime: TaxRegime) {
  taxable = Math.max(0, rupee(taxable));
  let tax = slabTax(taxable, regime);
  let rebate = 0;
  if (taxable <= REBATE_LIMIT[regime]) {
    rebate = tax;
  } else if (regime === "NEW" && tax > taxable - REBATE_LIMIT.NEW) {
    // Marginal relief: just above ₹12 lakh, tax cannot be more than the income above it.
    rebate = tax - (taxable - REBATE_LIMIT.NEW);
  }
  tax -= rebate;
  const surcharge = (tax * surchargeRate(taxable, regime)) / 100;
  const cess = ((tax + surcharge) * 4) / 100;
  return { taxable, slabTax: rupee(tax + rebate), rebate: rupee(rebate), surcharge: rupee(surcharge), cess: rupee(cess), total: rupee(tax + surcharge + cess) };
}

/** "2026-27" for any month from April 2026 to March 2027. */
export function fyOf(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function fyMonths(fy: string) {
  const start = Number(fy.slice(0, 4));
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((3 + i) % 12) + 1;
    return `${m >= 4 ? start : start + 1}-${String(m).padStart(2, "0")}`;
  });
}

export function isFy(v: string | null | undefined): v is string {
  return !!v && /^\d{4}-\d{2}$/.test(v) && (Number(v.slice(0, 4)) + 1) % 100 === Number(v.slice(5));
}

export interface YearSoFar {
  gross: number;
  pf: number;
  pt: number;
  tds: number;
}

/**
 * The year's income: what was paid in earlier months plus this month's pay
 * repeated for the rest of the year, less the deductions the regime allows.
 */
export function projectYear(input: { regime: TaxRegime; declared: number; earlier: YearSoFar; month: { gross: number; pf: number; pt: number }; monthsLeft: number }) {
  const { regime, earlier, month, monthsLeft } = input;
  const gross = earlier.gross + month.gross * monthsLeft;
  const pf = earlier.pf + month.pf * monthsLeft;
  const pt = earlier.pt + month.pt * monthsLeft;
  const deductions =
    regime === "NEW" ? STANDARD_DEDUCTION.NEW : STANDARD_DEDUCTION.OLD + pt + Math.min(SECTION_80C_CAP, pf) + Math.max(0, input.declared);
  const tax = annualTax(Math.min(gross, Math.max(0, gross - deductions)), regime);
  return { gross, pf, pt, deductions: Math.min(gross, deductions), ...tax };
}

/** This month's TDS: the year's tax not yet deducted, spread over the months left. */
export function monthlyTds(input: Parameters<typeof projectYear>[0]) {
  const year = projectYear(input);
  const left = Math.max(0, year.total - input.earlier.tds);
  return { tds: rupee(left / Math.max(1, input.monthsLeft)), year };
}

/** Months from this one to March, this one included. */
export function monthsLeftInFy(month: string) {
  const months = fyMonths(fyOf(month));
  return months.length - months.indexOf(month);
}
