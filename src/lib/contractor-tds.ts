/**
 * Comprehensive Indian TDS Compliance Engine (BothraCMS / BuildTrack Pro)
 * 
 * Implements dual date-aware statutory withholding regimes:
 * 1. Income-tax Act, 1961 (for transactions triggered on or before 31 March 2026)
 *    - Section 194C: Payments to resident contractors / subcontractors
 *    - Section 194J: Fees for professional & technical services
 *    - Section 194I: Rent of plant/machinery & land/building
 *    - Section 194Q: Purchase of goods exceeding ₹50 Lakhs
 *    - Section 206AA: Higher withholding rates for non-furnishing of PAN
 *    - Section 288B: Statutory terminal rounding of tax payable/refundable to nearest ₹10
 * 
 * 2. Income-tax Act, 2025 (for transactions triggered on or after 1 April 2026)
 *    - Section 393(1), Table Serial No. 6(i): Resident contractor payments
 *    - Section 393(1), Table Serial No. 6(iii): Professional & technical service fees
 *    - Section 393(1), Table Serial No. 2(ii): Rent payments by specified persons
 *    - Section 393(1), Table Serial No. 8(ii): Purchase of goods from resident sellers
 *    - Section 397(2): Higher withholding rates for failure to furnish valid PAN
 *    - Section 516: Statutory terminal rounding of tax payable/refundable to nearest ₹10
 * 
 * Amounts are expressed as integer paise (1 Rupee = 100 Paise).
 */

export const SECTION_194C = "194C";
export const SINGLE_LIMIT = 30_000_00; // ₹30,000 in paise
export const YEAR_LIMIT = 1_00_000_00;   // ₹1,00,000 in paise
export const NO_PAN_RATE_DEFAULT = 20;   // 20% default penal rate
export const NO_PAN_RATE_GOODS = 5;      // 5% penal rate under 194Q / 393(1) Table 8(ii)

const PAN_REGEX = /^[A-Z]{5}\d{4}[A-Z]$/;
const GSTIN_REGEX = /^\d{2}([A-Z]{5}\d{4}[A-Z])[A-Z\d]Z[A-Z\d]$/;

/**
 * Validates whether a given string is a syntactically valid Indian PAN.
 */
export function isValidPan(pan?: string | null): boolean {
  if (!pan) return false;
  return PAN_REGEX.test(pan.trim().toUpperCase());
}

/**
 * Extracts and normalizes the contractor/vendor's PAN, either from the PAN field
 * or embedded inside the 15-digit GSTIN (characters 3-12).
 */
export function contractorPan(party: { panNumber?: string | null; taxIdentifier?: string | null }): string | null {
  const pan = party.panNumber?.trim().toUpperCase();
  if (pan && PAN_REGEX.test(pan)) return pan;
  const gstin = party.taxIdentifier?.trim().toUpperCase();
  const m = gstin ? GSTIN_REGEX.exec(gstin) : null;
  return m ? m[1] : null;
}

/**
 * Evaluates the deductee's legal entity type from the 4th character of PAN:
 * 'P' = Individual, 'H' = HUF, 'C' = Company, 'F' = Partnership Firm / LLP, 'T' = Trust, etc.
 */
export function getPanEntityType(pan: string | null): "INDIVIDUAL_HUF" | "COMPANY" | "FIRM" | "OTHER" {
  if (!pan || pan.length < 4) return "OTHER";
  const fourthChar = pan[3].toUpperCase();
  if (fourthChar === "P" || fourthChar === "H") return "INDIVIDUAL_HUF";
  if (fourthChar === "C") return "COMPANY";
  if (fourthChar === "F") return "FIRM";
  return "OTHER";
}

/**
 * Resolves Section 194C / Section 393(1) Table 6(i) contractor withholding rate:
 * - 1% for Individual or HUF (4th character 'P' or 'H')
 * - 2% for Companies, Firms, LLPs, and other legal entities
 * - 20% penal rate when PAN is missing/invalid (Section 206AA / Section 397(2))
 */
export function rate194C(pan: string | null): number {
  if (!isValidPan(pan)) return NO_PAN_RATE_DEFAULT;
  const type = getPanEntityType(pan);
  return type === "INDIVIDUAL_HUF" ? 1 : 2;
}

/** Determines whether a party is classified as a contractor or mixed supplier/contractor. */
export function isContractor(partyType: string | null | undefined): boolean {
  return partyType === "CONTRACTOR" || partyType === "BOTH";
}

export type TdsMode = "AUTO" | "NONE" | "MANUAL";

export type DeductorType = "INDIVIDUAL_HUF" | "COMPANY" | "FIRM" | "OTHER";
export type DeducteeResidentialStatus = "RESIDENT" | "NON_RESIDENT";
export type PanStatus = "VALID" | "INVALID" | "MISSING";
export type RoundingRule = "NEAREST_RUPEE_TRANSACTION" | "SECTION_288B_TEN_RUPEES" | "SECTION_516_TEN_RUPEES";

/**
 * Lower / Nil Deduction Certificate issued by Assessing Officer
 * under Section 197 of 1961 Act or Section 396 of 2025 Act.
 */
export interface LowerDeductionCertificate {
  certificateNumber: string;
  validFrom: string;           // YYYY-MM-DD
  validTo: string;             // YYYY-MM-DD
  certifiedRate: number;       // e.g. 0.5 for 0.5%, 0 for nil
  certificateLimitPaise: number; // Maximum cumulative amount covered in paise
  utilizedLimitPaise: number;    // Cumulative base already utilized in paise
  applicableSection: "194C" | "194J" | "194I" | "194Q";
  issuingAuthority?: string;
}

export interface TdsAuditMetadata {
  panSupplied: boolean;
  pan: string | null;
  panStatus: PanStatus;
  deductorType: DeductorType;
  deducteeResidentialStatus: DeducteeResidentialStatus;
  taxYear: string;
  accumulatedThresholdPaise: number;
  isGstSeparated: boolean;
  gstAmountPaise: number;
  gstCircularReference: string;
  isCatchUpApplied: boolean;
  statutoryRegime: "Income-tax Act, 1961" | "Income-tax Act, 2025";
  statutorySectionRef: string;
  statutorySectionVersion: string;
  earlierDateTrigger: "CREDIT" | "PAYMENT" | "SAME";
  deductionMechanism: "TAN_FORM_26Q" | "INDIVIDUAL_HUF_FORM_141";
  higherRateProvision: string | null;
  certificateDetails: {
    certificateNumber: string;
    validFrom: string;
    validTo: string;
    certifiedRate: number;
    certificateLimitPaise: number;
    utilizedLimitPaise: number;
    isValid: boolean;
    rejectionReason?: string;
    eligiblePortionPaise: number;
    excessPortionPaise: number;
  } | null;
  roundingRule: RoundingRule;
  calculationTimestamp: string;
  calculationExplanation: string;
  disclaimer: string;
}

export interface TdsResult {
  section: string | null;
  rate: number;
  base: number;
  /** Earlier payments this period that had no TDS and are caught up now. */
  catchUpBase: number;
  amount: number;
  note: string | null;

  // Authoritative Date-Aware Statutory Audit & Compliance Metadata
  creditDate: string;
  paymentDate: string;
  effectiveDate: string;
  governingAct: "Income-tax Act, 1961" | "Income-tax Act, 2025";
  sectionRef: string;
  category: string;
  threshold: number;
  taxableBasePaise: number;
  tdsAmountPaise: number;
  calculationVersion: string;
  auditMetadata: TdsAuditMetadata;
}

const formatRupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

/**
 * Resolves Financial Tax Year from effective transaction date.
 * E.g., '2025-04-10' -> '2025-26'; '2026-03-31' -> '2025-26'; '2026-04-01' -> '2026-27'.
 */
export function resolveTaxYear(effectiveDate: string): string {
  const y = Number(effectiveDate.slice(0, 4));
  const m = Number(effectiveDate.slice(5, 7));
  const startYear = m >= 4 ? y : y - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
}

/**
 * Resolves the statutory trigger date: strictly the EARLIER of creditDate or paymentDate.
 * Both the 1961 Act and 2025 Act mandate tax deduction at credit or payment, whichever is earlier.
 */
export function resolveEffectiveTdsDate(creditDate?: string | null, paymentDate?: string | null): {
  effectiveDate: string;
  trigger: "CREDIT" | "PAYMENT" | "SAME";
} {
  const cd = creditDate?.slice(0, 10);
  const pd = paymentDate?.slice(0, 10);
  if (cd && pd) {
    if (cd < pd) return { effectiveDate: cd, trigger: "CREDIT" };
    if (pd < cd) return { effectiveDate: pd, trigger: "PAYMENT" };
    return { effectiveDate: cd, trigger: "SAME" };
  }
  const fallback = cd || pd || new Date().toISOString().slice(0, 10);
  return { effectiveDate: fallback, trigger: cd ? "CREDIT" : "PAYMENT" };
}

/**
 * Precise 3-Tier Rounding Implementation:
 * 
 * 1. Internal Precision: Exact integer paise computation.
 * 2. Transaction-Level Voucher Rounding: Nearest whole rupee (in paise units: multiple of 100).
 *    (Fractional paise >= 50 round up; < 50 round down).
 *    Regulatory basis: TRACES quarterly Form 26Q specification, ITNS 281 Challan rules, Rule 31A.
 *    (Explicitly distinguished: this is NOT Section 288B / Section 516).
 * 3. Statutory Terminal Rounding (Section 288B of 1961 Act / Section 516 of 2025 Act):
 *    Terminal rounding on the aggregate tax payable / refundable amount.
 *    Paise are dropped, and whole rupees are rounded to the nearest multiple of ₹10.
 */

/**
 * Tier 2: Transaction-level TDS rounding to the nearest whole rupee.
 * Governed by TRACES quarterly Form 26Q e-TDS return specifications and Rule 31A.
 */
export function roundTransactionTds(exactPaise: number): number {
  if (exactPaise <= 0) return 0;
  // exactPaise: e.g. 123450 paise (₹1,234.50) -> Math.round(1234.5) = 1235 -> 123500 paise (₹1,235.00)
  return Math.round(exactPaise / 100) * 100;
}

/**
 * Tier 3: Statutory terminal rounding of final amount payable / refundable
 * under Section 288B (Income-tax Act, 1961) or Section 516 (Income-tax Act, 2025).
 * 
 * Step 1: Drop fractional paise entirely.
 * Step 2: If the last digit of the whole-rupee amount is 5 or more, increase to next multiple of ₹10;
 *         if less than 5, truncate to lower multiple of ₹10.
 */
export function roundStatutoryPayableOrRefund(totalPaise: number, act: "1961" | "2025" = "1961"): number {
  if (totalPaise <= 0) return 0;
  // Step 1: Truncate paise to obtain whole rupees
  const wholeRupees = Math.floor(totalPaise / 100);
  // Step 2: Examine unit digit
  const remainder = wholeRupees % 10;
  let roundedRupees: number;
  if (remainder >= 5) {
    roundedRupees = wholeRupees + (10 - remainder);
  } else {
    roundedRupees = wholeRupees - remainder;
  }
  return roundedRupees * 100; // Return in paise
}

/**
 * Aggregates multiple transaction TDS amounts and applies terminal statutory
 * rounding (Section 288B / Section 516) to the Challan / quarterly statement total.
 */
export function aggregateTdsReporting(transactionsPaise: number[], act: "1961" | "2025" = "1961"): {
  transactionTotalPaise: number;
  statutoryPayablePaise: number;
  roundingAdjustmentPaise: number;
} {
  const transactionTotalPaise = transactionsPaise.reduce((acc, curr) => acc + curr, 0);
  const statutoryPayablePaise = roundStatutoryPayableOrRefund(transactionTotalPaise, act);
  const roundingAdjustmentPaise = statutoryPayablePaise - transactionTotalPaise;
  return {
    transactionTotalPaise,
    statutoryPayablePaise,
    roundingAdjustmentPaise,
  };
}

/**
 * Statutory Section Reference Resolver across Legislative Regimes:
 * - Pre-1 April 2026: Governed by the Income-tax Act, 1961.
 * - On or after 1 April 2026: Governed by the Income-tax Act, 2025 (Section 393 Table References).
 * 
 * Enforces authoritative Table Serial Numbers from the enacted 2025 Act:
 * - Contractor Payments: Section 393(1), Table Serial No. 6(i)
 * - Professional Services: Section 393(1), Table Serial No. 6(iii)(b)
 * - Technical Services: Section 393(1), Table Serial No. 6(iii)(a)
 * - Rent of Machinery / Plant: Section 393(1), Table Serial No. 2(ii)(a)
 * - Rent of Land / Building: Section 393(1), Table Serial No. 2(ii)(b)
 * - Purchase of Goods: Section 393(1), Table Serial No. 8(ii)
 */
export function resolveStatutoryReference(
  act: "194C" | "194J" | "194I" | "194Q",
  key: string,
  effectiveDate: string
): {
  governingAct: "Income-tax Act, 1961" | "Income-tax Act, 2025";
  sectionRef: string;
  category: "CONTRACTOR" | "RENT_MACHINERY" | "RENT_BUILDING" | "TECHNICAL_SERVICES" | "PROFESSIONAL_FEES" | "PURCHASE_OF_GOODS";
  deductionMechanism: "TAN_FORM_26Q" | "INDIVIDUAL_HUF_FORM_141";
  gstCircularReference: string;
  higherRateProvision: string;
  version: string;
} {
  const isAct2025 = effectiveDate >= "2026-04-01";
  const governingAct = isAct2025 ? "Income-tax Act, 2025" : "Income-tax Act, 1961";
  const version = isAct2025 ? "ITA-2025-SEC393-V1.0" : "ITA-1961-REV2025.1";

  if (isAct2025) {
    switch (act) {
      case "194C":
        return {
          governingAct,
          sectionRef: "Section 393(1), Table Serial No. 6(i)",
          category: "CONTRACTOR",
          deductionMechanism: "TAN_FORM_26Q",
          gstCircularReference: "CBDT Circular No. 23/2017 (GST exclusion on contracts/services)",
          higherRateProvision: "Section 397(2) (20% non-PAN penal rate)",
          version,
        };
      case "194I":
        return {
          governingAct,
          sectionRef: key === "194I_PM"
            ? "Section 393(1), Table Serial No. 2(ii)(a)"
            : "Section 393(1), Table Serial No. 2(ii)(b)",
          category: key === "194I_PM" ? "RENT_MACHINERY" : "RENT_BUILDING",
          deductionMechanism: "TAN_FORM_26Q",
          gstCircularReference: "CBDT Circular No. 23/2017 (GST exclusion on rent/services)",
          higherRateProvision: "Section 397(2) (20% non-PAN penal rate)",
          version,
        };
      case "194J":
        return {
          governingAct,
          sectionRef: key === "194J_TECH"
            ? "Section 393(1), Table Serial No. 6(iii)(a)"
            : "Section 393(1), Table Serial No. 6(iii)(b)",
          category: key === "194J_TECH" ? "TECHNICAL_SERVICES" : "PROFESSIONAL_FEES",
          deductionMechanism: "TAN_FORM_26Q",
          gstCircularReference: "CBDT Circular No. 23/2017 (GST exclusion on professional/technical fees)",
          higherRateProvision: "Section 397(2) (20% non-PAN penal rate)",
          version,
        };
      case "194Q":
        return {
          governingAct,
          sectionRef: "Section 393(1), Table Serial No. 8(ii)",
          category: "PURCHASE_OF_GOODS",
          deductionMechanism: "TAN_FORM_26Q",
          gstCircularReference: "CBDT Circular No. 13 of 2021 (GST exclusion on purchase of goods on credit)",
          higherRateProvision: "Section 397(2) Proviso (5% non-PAN rate for purchase of goods)",
          version,
        };
    }
  }

  // Income-tax Act, 1961
  switch (act) {
    case "194C":
      return {
        governingAct,
        sectionRef: "Section 194C",
        category: "CONTRACTOR",
        deductionMechanism: "TAN_FORM_26Q",
        gstCircularReference: "CBDT Circular No. 23/2017 (GST exclusion on contracts)",
        higherRateProvision: "Section 206AA(1) (20% non-PAN penal rate)",
        version,
      };
    case "194I":
      return {
        governingAct,
        sectionRef: key === "194I_PM" ? "Section 194I(a)" : "Section 194I(b)",
        category: key === "194I_PM" ? "RENT_MACHINERY" : "RENT_BUILDING",
        deductionMechanism: "TAN_FORM_26Q",
        gstCircularReference: "CBDT Circular No. 23/2017 (GST exclusion on rent)",
        higherRateProvision: "Section 206AA(1) (20% non-PAN penal rate)",
        version,
      };
    case "194J":
      return {
        governingAct,
        sectionRef: key === "194J_TECH" ? "Section 194J(1)(a)" : "Section 194J(1)(b)",
        category: key === "194J_TECH" ? "TECHNICAL_SERVICES" : "PROFESSIONAL_FEES",
        deductionMechanism: "TAN_FORM_26Q",
        gstCircularReference: "CBDT Circular No. 23/2017 (GST exclusion on professional/technical fees)",
        higherRateProvision: "Section 206AA(1) (20% non-PAN penal rate)",
        version,
      };
    case "194Q":
      return {
        governingAct,
        sectionRef: "Section 194Q",
        category: "PURCHASE_OF_GOODS",
        deductionMechanism: "TAN_FORM_26Q",
        gstCircularReference: "CBDT Circular No. 13 of 2021 (GST exclusion on purchase of goods on credit)",
        higherRateProvision: "Section 206AA(1) Second Proviso (5% non-PAN rate for purchase of goods)",
        version,
      };
  }
}

/** Resolves effective statutory threshold based on effective transaction date */
export function resolveEffectiveThreshold(sec: TdsSection, effectiveDate: string): number {
  if (sec.act === "194J") {
    // ₹30,000 before 1 April 2025; ₹50,000 on or after 1 April 2025
    return effectiveDate < "2025-04-01" ? 30_000_00 : 50_000_00;
  }
  if (sec.act === "194I") {
    // ₹50,000 per month (or part of a month) from 1 April 2025
    return 50_000_00;
  }
  return sec.limit;
}

export interface TdsSection {
  key: string;
  label: string;
  act: "194C" | "194J" | "194I" | "194Q";
  code: string;
  rate: (pan: string) => number;
  /** Rate without a valid PAN: 20%, or 5% for 194Q / 393(1) Table 8(ii). */
  noPanRate?: number;
  /** TDS only on the part of the period's payments above the threshold, not the whole period (194Q). */
  excessOnly?: boolean;
  /** A single payment above this is taxed even if under the cumulative period limit (194C single threshold: ₹30,000). */
  single?: number;
  /** Cumulative threshold in paise. */
  limit: number;
  period: "YEAR" | "MONTH";
}

export const TDS_SECTIONS: Record<string, TdsSection> = {
  "194C": {
    key: "194C",
    label: "Contractor (194C / 393(1) Sl No 6(i))",
    act: "194C",
    code: "94C",
    rate: (pan) => (getPanEntityType(pan) === "INDIVIDUAL_HUF" ? 1 : 2),
    single: SINGLE_LIMIT,
    limit: YEAR_LIMIT,
    period: "YEAR",
  },
  "194J_PROF": {
    key: "194J_PROF",
    label: "Professional fees (194J / 393(1) Sl No 6(iii)(b))",
    act: "194J",
    code: "94J-B",
    rate: () => 10,
    limit: 50_000_00,
    period: "YEAR",
  },
  "194J_TECH": {
    key: "194J_TECH",
    label: "Technical services (194J / 393(1) Sl No 6(iii)(a))",
    act: "194J",
    code: "94J-A",
    rate: () => 2,
    limit: 50_000_00,
    period: "YEAR",
  },
  "194I_PM": {
    key: "194I_PM",
    label: "Machinery / Equipment Hire (194I / 393(1) Sl No 2(ii)(a))",
    act: "194I",
    code: "4IA",
    rate: () => 2,
    limit: 50_000_00,
    period: "MONTH",
  },
  "194I_LB": {
    key: "194I_LB",
    label: "Rent of Land / Building (194I / 393(1) Sl No 2(ii)(b))",
    act: "194I",
    code: "4IB",
    rate: () => 10,
    limit: 50_000_00,
    period: "MONTH",
  },
  "194Q": {
    key: "194Q",
    label: "Purchase of Goods (194Q / 393(1) Sl No 8(ii))",
    act: "194Q",
    code: "94Q",
    rate: () => 0.1,
    noPanRate: NO_PAN_RATE_GOODS, // 5% penal rate for goods
    limit: 50_00_000_00,
    period: "YEAR",
    excessOnly: true,
  },
};

export const TDS_ACTS = ["194C", "194J", "194I", "194Q"] as const;
export type TdsAct = (typeof TDS_ACTS)[number];
export const sectionsOf = (act: TdsAct) => Object.values(TDS_SECTIONS).filter((s) => s.act === act).map((s) => s.key);

export function partySection(
  party: { partyType?: string | null; tdsSection?: string | null },
  opts: { buyer194Q?: boolean } = {}
): TdsSection | null {
  if (party.tdsSection === "NONE") return null;
  if (party.tdsSection && TDS_SECTIONS[party.tdsSection]) return TDS_SECTIONS[party.tdsSection];
  if (isContractor(party.partyType)) return TDS_SECTIONS["194C"];
  return opts.buyer194Q && party.partyType === "VENDOR" ? TDS_SECTIONS["194Q"] : null;
}

export const paymentSection = (key: string | null | undefined) => (key && TDS_SECTIONS[key]) || null;

/**
 * Authoritative Date-Aware TDS Calculation Engine.
 * 
 * Complies with Indian Income-tax statutory frameworks:
 * - Date-Aware: Income-tax Act, 1961 vs Income-tax Act, 2025.
 * - Trigger: strictly earlier of creditDate or paymentDate.
 * - Statutory Rounding: 
 *   - Transaction-level TDS: rounded to nearest whole rupee (TRACES Rule 31A).
 *   - Final Amount Payable: statutory terminal rounding under Section 288B / Section 516.
 * - PAN Status & Category-Specific Higher Rates: 
 *   - 20% penal rate for services/contracts under Section 206AA / Section 397(2).
 *   - 5% penal rate for purchase of goods under Section 206AA Second Proviso / Section 397(2) Proviso.
 * - Certificate Validation (Section 197 / Section 396):
 *   - Validates date range, category match, and cumulative limit exhaustion.
 * - Category-Specific GST Exclusion:
 *   - Services (194C, 194J, 194I): CBDT Circular 23/2017 (GST excluded if shown separately).
 *   - Goods (194Q): CBDT Circular 13/2021 (GST excluded on credit invoice; included on advance payment).
 */
export function workTds(input: {
  section: TdsSection;
  pan: string | null;
  base: number;
  before: { base: number; untaxedBase: number };
  mode?: TdsMode;
  manualAmount?: number;
  reason?: string | null;
  creditDate?: string | null;
  paymentDate?: string | null;
  isGstSeparated?: boolean;
  gstAmount?: number;
  deductorType?: DeductorType;
  deducteeResidentialStatus?: DeducteeResidentialStatus;
  certificate?: LowerDeductionCertificate | null;
}): TdsResult {
  const sec = input.section;
  const isGstSeparated = input.isGstSeparated !== false;
  const gstAmountPaise = Math.max(0, Math.round(input.gstAmount || 0));

  const cd = input.creditDate?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const pd = input.paymentDate?.slice(0, 10) || cd;
  const { effectiveDate, trigger } = resolveEffectiveTdsDate(cd, pd);

  const {
    governingAct,
    sectionRef,
    category,
    deductionMechanism,
    gstCircularReference,
    higherRateProvision,
    version,
  } = resolveStatutoryReference(sec.act, sec.key, effectiveDate);

  const effectiveLimit = resolveEffectiveThreshold(sec, effectiveDate);
  const taxYear = resolveTaxYear(effectiveDate);

  // Category-specific GST exclusion logic:
  // For Section 194Q, if it is an advance payment (pd < cd), GST cannot be separated prior to invoice
  let effectiveBase: number;
  if (sec.act === "194Q" && trigger === "PAYMENT" && cd > pd) {
    // Advance payment under 194Q: TDS applies to gross advance amount per Circular 13/2021
    effectiveBase = Math.max(0, Math.round(input.base + gstAmountPaise));
  } else if (!isGstSeparated && gstAmountPaise > 0) {
    // GST not indicated separately: TDS applies to gross invoice
    effectiveBase = Math.max(0, Math.round(input.base + gstAmountPaise));
  } else {
    // Separately shown GST is excluded from taxable base
    effectiveBase = Math.max(0, Math.round(input.base));
  }

  // PAN validation
  const panValid = isValidPan(input.pan);
  const panStatus: PanStatus = panValid ? "VALID" : input.pan ? "INVALID" : "MISSING";
  const noPanRate = sec.noPanRate ?? NO_PAN_RATE_DEFAULT;

  // Standard statutory rate evaluation
  let applicableRate: number;
  let higherRateApplied: string | null = null;
  if (panValid) {
    applicableRate = sec.rate(input.pan!);
  } else {
    applicableRate = noPanRate;
    higherRateApplied = higherRateProvision;
  }

  // Lower / Nil Deduction Certificate verification (Section 197 / Section 396)
  let certificateDetails: TdsAuditMetadata["certificateDetails"] = null;
  let certifiedEligibleBase = 0;
  let certifiedRate = 0;

  if (input.certificate && panValid) {
    const cert = input.certificate;
    const isDateValid = effectiveDate >= cert.validFrom && effectiveDate <= cert.validTo;
    const isCategoryValid = cert.applicableSection === sec.act;

    if (!isDateValid) {
      certificateDetails = {
        certificateNumber: cert.certificateNumber,
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        certifiedRate: cert.certifiedRate,
        certificateLimitPaise: cert.certificateLimitPaise,
        utilizedLimitPaise: cert.utilizedLimitPaise,
        isValid: false,
        rejectionReason: `Certificate expired or not yet effective on transaction date (${effectiveDate})`,
        eligiblePortionPaise: 0,
        excessPortionPaise: effectiveBase,
      };
    } else if (!isCategoryValid) {
      certificateDetails = {
        certificateNumber: cert.certificateNumber,
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        certifiedRate: cert.certifiedRate,
        certificateLimitPaise: cert.certificateLimitPaise,
        utilizedLimitPaise: cert.utilizedLimitPaise,
        isValid: false,
        rejectionReason: `Category mismatch: certificate issued for Section ${cert.applicableSection}, but transaction is under ${sec.act}`,
        eligiblePortionPaise: 0,
        excessPortionPaise: effectiveBase,
      };
    } else {
      // Valid certificate: check available cumulative limit
      const availableLimit = Math.max(0, cert.certificateLimitPaise - cert.utilizedLimitPaise);
      certifiedEligibleBase = Math.min(effectiveBase, availableLimit);
      const excessBase = effectiveBase - certifiedEligibleBase;
      certifiedRate = cert.certifiedRate;

      certificateDetails = {
        certificateNumber: cert.certificateNumber,
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        certifiedRate: cert.certifiedRate,
        certificateLimitPaise: cert.certificateLimitPaise,
        utilizedLimitPaise: cert.utilizedLimitPaise,
        isValid: true,
        eligiblePortionPaise: certifiedEligibleBase,
        excessPortionPaise: excessBase,
      };
    }
  }

  const mode = input.mode || "AUTO";
  const deductorType = input.deductorType || "COMPANY";
  const deducteeResidentialStatus = input.deducteeResidentialStatus || "RESIDENT";

  const buildAuditMetadata = (
    finalAmount: number,
    isCatchUp: boolean,
    explanation: string
  ): TdsAuditMetadata => ({
    panSupplied: panValid,
    pan: input.pan || null,
    panStatus,
    deductorType,
    deducteeResidentialStatus,
    taxYear,
    accumulatedThresholdPaise: input.before.base + effectiveBase,
    isGstSeparated,
    gstAmountPaise,
    gstCircularReference,
    isCatchUpApplied: isCatchUp,
    statutoryRegime: governingAct,
    statutorySectionRef: sectionRef,
    statutorySectionVersion: version,
    earlierDateTrigger: trigger,
    deductionMechanism,
    higherRateProvision: higherRateApplied,
    certificateDetails,
    roundingRule: "NEAREST_RUPEE_TRANSACTION",
    calculationTimestamp: new Date().toISOString(),
    calculationExplanation: explanation,
    disclaimer: "Statutory tax determination. Subject to formal review by a qualified Chartered Accountant / Tax Auditor.",
  });

  const baseResultMetadata = {
    creditDate: cd,
    paymentDate: pd,
    effectiveDate,
    governingAct,
    sectionRef,
    category,
    threshold: effectiveLimit,
    taxableBasePaise: effectiveBase,
    calculationVersion: version,
  };

  // 1. NONE mode (Explicit exemption)
  if (mode === "NONE") {
    const explanation = input.reason?.trim() || "Exempt / No TDS deducted";
    return {
      section: null,
      rate: 0,
      base: effectiveBase,
      catchUpBase: 0,
      amount: 0,
      note: explanation,
      tdsAmountPaise: 0,
      ...baseResultMetadata,
      auditMetadata: buildAuditMetadata(0, false, explanation),
    };
  }

  // 2. MANUAL mode (User explicit override)
  if (mode === "MANUAL") {
    const rawManual = Math.max(0, Math.min(effectiveBase, Math.round(input.manualAmount || 0)));
    const amount = roundTransactionTds(rawManual);
    const explanation = input.reason?.trim() || "Manual user override applied";
    return {
      section: sec.key,
      rate: effectiveBase ? Math.round((amount / effectiveBase) * 10000) / 100 : 0,
      base: effectiveBase,
      catchUpBase: 0,
      amount,
      note: explanation,
      tdsAmountPaise: amount,
      ...baseResultMetadata,
      auditMetadata: buildAuditMetadata(amount, false, explanation),
    };
  }

  // 3. AUTO mode: Threshold & Calculation evaluation
  const after = input.before.base + effectiveBase;
  const crosses = after > effectiveLimit;
  const periodLabel = sec.period === "MONTH" ? "this month" : "this tax year";

  // Case A: Excess-only deduction (Section 194Q / Section 393(1) Table 8(ii))
  if (sec.excessOnly) {
    const taxedBase = Math.max(0, after - Math.max(effectiveLimit, input.before.base));
    if (!taxedBase) {
      const explanation = `${formatRupees(after)} cumulative so far ${periodLabel} (TDS applies on excess over ${formatRupees(effectiveLimit)})`;
      return {
        section: null,
        rate: 0,
        base: effectiveBase,
        catchUpBase: 0,
        amount: 0,
        note: explanation,
        tdsAmountPaise: 0,
        ...baseResultMetadata,
        auditMetadata: buildAuditMetadata(0, false, explanation),
      };
    }

    // Compute tax with certificate or standard/penal rate
    let rawTaxPaise: number;
    if (certificateDetails && certificateDetails.isValid) {
      const certTax = (certificateDetails.eligiblePortionPaise * certificateDetails.certifiedRate) / 100;
      const normalTax = (certificateDetails.excessPortionPaise * applicableRate) / 100;
      rawTaxPaise = certTax + normalTax;
    } else {
      rawTaxPaise = (taxedBase * applicableRate) / 100;
    }

    const amount = roundTransactionTds(rawTaxPaise);
    const notes: string[] = [];
    if (!panValid) notes.push(`No PAN, penal rate ${noPanRate}% applied under ${higherRateApplied}`);
    if (taxedBase < effectiveBase) {
      notes.push(`deducted on ${formatRupees(taxedBase)} excess over ${formatRupees(effectiveLimit)} ${periodLabel}`);
    }
    const explanation = notes.join("; ") || `TDS deducted at ${applicableRate}% on excess amount`;

    return {
      section: sec.key,
      rate: applicableRate,
      base: effectiveBase,
      catchUpBase: 0,
      amount,
      note: notes.join("; ") || null,
      tdsAmountPaise: amount,
      ...baseResultMetadata,
      auditMetadata: buildAuditMetadata(amount, false, explanation),
    };
  }

  // Case B: Standard threshold check (single payment limit or cumulative period limit)
  if (!crosses && !(sec.single && effectiveBase > sec.single)) {
    const underMsg = sec.single
      ? `Under single limit ${formatRupees(sec.single)} and ${formatRupees(after)} so far ${periodLabel}`
      : `${formatRupees(after)} so far ${periodLabel}`;
    const explanation = `${underMsg} (TDS threshold: ${formatRupees(effectiveLimit)})`;
    return {
      section: null,
      rate: 0,
      base: effectiveBase,
      catchUpBase: 0,
      amount: 0,
      note: explanation,
      tdsAmountPaise: 0,
      ...baseResultMetadata,
      auditMetadata: buildAuditMetadata(0, false, explanation),
    };
  }

  // Case C: Threshold breached — full deduction with retroactive catch-up if applicable
  const catchUpBase = crosses ? input.before.untaxedBase : 0;
  const totalTaxablePaise = effectiveBase + catchUpBase;

  let rawTaxPaise: number;
  if (certificateDetails && certificateDetails.isValid) {
    const certTax = (certificateDetails.eligiblePortionPaise * certificateDetails.certifiedRate) / 100;
    const normalTax = ((totalTaxablePaise - certificateDetails.eligiblePortionPaise) * applicableRate) / 100;
    rawTaxPaise = certTax + normalTax;
  } else {
    rawTaxPaise = (totalTaxablePaise * applicableRate) / 100;
  }

  const amount = roundTransactionTds(rawTaxPaise);
  const notes: string[] = [];
  if (!panValid) notes.push(`No PAN, penal rate ${noPanRate}% applied under ${higherRateApplied}`);
  if (catchUpBase > 0) {
    notes.push(`includes catch-up on ${formatRupees(catchUpBase)} paid earlier ${periodLabel} without TDS`);
  }
  if (certificateDetails && certificateDetails.isValid) {
    notes.push(`lower certificate ${certificateDetails.certificateNumber} applied at ${certificateDetails.certifiedRate}%`);
  }
  const explanation = notes.join("; ") || `TDS deducted at ${applicableRate}% on ${formatRupees(totalTaxablePaise)}`;

  return {
    section: sec.key,
    rate: applicableRate,
    base: effectiveBase,
    catchUpBase,
    amount,
    note: notes.join("; ") || null,
    tdsAmountPaise: amount,
    ...baseResultMetadata,
    auditMetadata: buildAuditMetadata(amount, catchUpBase > 0, explanation),
  };
}

/** TDS on a payment to a contractor (Section 194C / Section 393(1) Table 6(i)). */
export function work194C(input: {
  pan: string | null;
  base: number;
  yearBefore: { base: number; untaxedBase: number };
  mode?: TdsMode;
  manualAmount?: number;
  reason?: string | null;
  creditDate?: string | null;
  paymentDate?: string | null;
  isGstSeparated?: boolean;
  gstAmount?: number;
  certificate?: LowerDeductionCertificate | null;
}): TdsResult {
  return workTds({ ...input, section: TDS_SECTIONS["194C"], before: input.yearBefore });
}

/** What actually leaves the bank for a payment: the TDS held back stays with us until deposited. */
export function bankAmount(p: { amount: number; tdsAmount?: number | null }): number {
  return p.amount - (p.tdsAmount || 0);
}

/** First day of the financial year (April) holding this IST date key. */
export function fyStartOf(dateKey: string): string {
  const y = Number(dateKey.slice(0, 4));
  const m = Number(dateKey.slice(5, 7));
  return `${m >= 4 ? y : y - 1}-04-01`;
}

/** TDS is deposited by the 7th of the next month; for March, by 30 April. */
export function tdsDueDate(month: string): string {
  if (month.endsWith("-03")) return `${month.slice(0, 4)}-04-30`;
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-07` : `${y}-${String(m + 1).padStart(2, "0")}-07`;
}
