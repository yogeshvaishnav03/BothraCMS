/**
 * Authoritative Indian TDS Regression Test Suite (BothraCMS / BuildTrack Pro)
 * 
 * Verifies statutory withholding calculations across both regimes:
 * - Income-tax Act, 1961 (up to 31 March 2026)
 * - Income-tax Act, 2025 (from 1 April 2026)
 * 
 * Covers Sections 194C, 194J, 194I, 194Q, Section 393(1) Table mappings,
 * Section 206AA / 397(2) PAN rules, Section 197 / 396 Lower Deduction Certificates,
 * CBDT Circular 23/2017 & 13/2021 GST rules, and 3-Tier Rounding (Rule 31A vs Sec 288B/516).
 */

const {
  workTds,
  work194C,
  TDS_SECTIONS,
  partySection,
  contractorPan,
  rate194C,
  resolveEffectiveTdsDate,
  resolveStatutoryReference,
  resolveEffectiveThreshold,
  resolveTaxYear,
  roundTransactionTds,
  roundStatutoryPayableOrRefund,
  aggregateTdsReporting,
} = require("../src/lib/contractor-tds.ts");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

console.log("==================================================================");
console.log("STARTING PHASE 3.3.2 TDS COMPLIANCE & STATUTORY REGRESSION SUITE");
console.log("==================================================================");

// -----------------------------------------------------------------
// SUITE 1: SECTION 194C / SECTION 393(1) TABLE 6(i) (CONTRACTORS)
// -----------------------------------------------------------------
console.log("\n--- Suite 1: Section 194C & Section 393(1) Table 6(i) (Contractors) ---");

const PAN_INDIVIDUAL = "ABCPK1234F"; // 4th letter (index 3) 'P' = Individual (1%)
const PAN_COMPANY = "ABCCK1234F";    // 4th letter (index 3) 'C' = Company (2%)
const PAN_FIRM = "ABCFK1234F";       // 4th letter (index 3) 'F' = Firm (2%)

// 1.1 Single payment below ₹30,000 threshold (no prior payments)
const resSingleBelow = work194C({
  pan: PAN_INDIVIDUAL,
  base: 25_000_00, // ₹25,000
  yearBefore: { base: 0, untaxedBase: 0 },
  creditDate: "2025-05-10",
  paymentDate: "2025-05-10",
});
assert(resSingleBelow.amount === 0 && resSingleBelow.section === null, "194C: Single payment ₹25,000 is under single limit ₹30,000 (₹0 TDS)");

// 1.2 Single payment exactly equal to ₹30,000 (no prior payments)
const resSingleEqual = work194C({
  pan: PAN_INDIVIDUAL,
  base: 30_000_00, // ₹30,000
  yearBefore: { base: 0, untaxedBase: 0 },
  creditDate: "2025-05-10",
  paymentDate: "2025-05-10",
});
assert(resSingleEqual.amount === 0 && resSingleEqual.section === null, "194C: Single payment exactly ₹30,000 is exempt (threshold > ₹30,000)");

// 1.3 Single payment above ₹30,000 (Individual deductor: 1%)
const resSingleAboveInd = work194C({
  pan: PAN_INDIVIDUAL, // Individual (4th letter 'P')
  base: 35_000_00, // ₹35,000
  yearBefore: { base: 0, untaxedBase: 0 },
  creditDate: "2025-05-10",
  paymentDate: "2025-05-10",
});
assert(resSingleAboveInd.amount === 350_00 && resSingleAboveInd.rate === 1, "194C: Single payment ₹35,000 to Individual deducts 1% = ₹350 TDS");

// 1.4 Single payment above ₹30,000 (Company deductor: 2%)
const resSingleAboveCo = work194C({
  pan: PAN_COMPANY, // Company (4th letter 'C')
  base: 35_000_00, // ₹35,000
  yearBefore: { base: 0, untaxedBase: 0 },
  creditDate: "2025-05-10",
  paymentDate: "2025-05-10",
});
assert(resSingleAboveCo.amount === 700_00 && resSingleAboveCo.rate === 2, "194C: Single payment ₹35,000 to Company deducts 2% = ₹700 TDS");

// 1.5 Aggregate annual threshold: payments below ₹1,00,000
const resAggBelow = work194C({
  pan: PAN_INDIVIDUAL,
  base: 20_000_00, // ₹20,000
  yearBefore: { base: 60_000_00, untaxedBase: 60_000_00 }, // Total = ₹80,000
  creditDate: "2025-06-15",
  paymentDate: "2025-06-15",
});
assert(resAggBelow.amount === 0, "194C: Aggregate payments of ₹80,000 remain under ₹1,00,000 threshold (₹0 TDS)");

// 1.6 Aggregate annual threshold: payments exactly ₹1,00,000
const resAggEqual = work194C({
  pan: PAN_INDIVIDUAL,
  base: 20_000_00, // ₹20,000
  yearBefore: { base: 80_000_00, untaxedBase: 80_000_00 }, // Total = ₹1,00,000
  creditDate: "2025-07-15",
  paymentDate: "2025-07-15",
});
assert(resAggEqual.amount === 0, "194C: Aggregate payments exactly ₹1,00,000 remain exempt (threshold > ₹1,00,000)");

// 1.7 Aggregate annual threshold: payment breaches ₹1,00,000 with catch-up on prior ₹80,000
const resAggBreach = work194C({
  pan: PAN_INDIVIDUAL, // Individual (1%)
  base: 25_000_00, // ₹25,000 (brings total to ₹1,05,000)
  yearBefore: { base: 80_000_00, untaxedBase: 80_000_00 },
  creditDate: "2025-08-20",
  paymentDate: "2025-08-20",
});
// Total base = ₹25,000 + ₹80,000 = ₹1,05,000; 1% of ₹1,05,000 = ₹1,050
assert(
  resAggBreach.amount === 1050_00 &&
  resAggBreach.catchUpBase === 80_000_00 &&
  resAggBreach.auditMetadata.isCatchUpApplied === true,
  "194C: Annual aggregate breach catches up prior ₹80,000; total base ₹1,05,000 @ 1% = ₹1,050 TDS"
);

// -----------------------------------------------------------------
// SUITE 2: SECTION 194J / SECTION 393(1) TABLE 6(iii) (FEES)
// -----------------------------------------------------------------
console.log("\n--- Suite 2: Section 194J & Section 393(1) Table 6(iii) (Fees) ---");

// 2.1 Pre-1 April 2025 threshold was ₹30,000
const threshPre2025 = resolveEffectiveThreshold(TDS_SECTIONS["194J_PROF"], "2025-03-15");
assert(threshPre2025 === 30_000_00, "194J: Threshold on 15 March 2025 is ₹30,000");

// 2.2 Post-1 April 2025 threshold is ₹50,000
const threshPost2025 = resolveEffectiveThreshold(TDS_SECTIONS["194J_PROF"], "2025-05-15");
assert(threshPost2025 === 50_000_00, "194J: Threshold on 15 May 2025 is ₹50,000");

// 2.3 Professional fees under ₹50,000 in FY 2025-26
const resProfUnder = workTds({
  section: TDS_SECTIONS["194J_PROF"],
  pan: "AAAAA1111P",
  base: 45_000_00,
  before: { base: 0, untaxedBase: 0 },
  creditDate: "2025-06-01",
  paymentDate: "2025-06-01",
});
assert(resProfUnder.amount === 0, "194J: Professional fees ₹45,000 under ₹50,000 threshold (₹0 TDS)");

// 2.4 Professional fees exceeding ₹50,000 in FY 2025-26 (10% rate)
const resProfExceed = workTds({
  section: TDS_SECTIONS["194J_PROF"],
  pan: "AAAAA1111P",
  base: 60_000_00,
  before: { base: 0, untaxedBase: 0 },
  creditDate: "2025-06-01",
  paymentDate: "2025-06-01",
});
assert(resProfExceed.amount === 6_000_00 && resProfExceed.rate === 10, "194J: Professional fees ₹60,000 deducts 10% = ₹6,000 TDS");

// 2.5 Technical services (FTS) exceeding ₹50,000 (2% rate)
const resTechExceed = workTds({
  section: TDS_SECTIONS["194J_TECH"],
  pan: "AAAAA1111P",
  base: 60_000_00,
  before: { base: 0, untaxedBase: 0 },
  creditDate: "2025-06-01",
  paymentDate: "2025-06-01",
});
assert(resTechExceed.amount === 1_200_00 && resTechExceed.rate === 2, "194J: Technical services ₹60,000 deducts 2% = ₹1,200 TDS");

// -----------------------------------------------------------------
// SUITE 3: SECTION 194I / SECTION 393(1) TABLE 2 (RENT)
// -----------------------------------------------------------------
console.log("\n--- Suite 3: Section 194I & Section 393(1) Table 2 (Rent) ---");

// 3.1 Monthly rent below ₹50,000
const resRentUnder = workTds({
  section: TDS_SECTIONS["194I_LB"],
  pan: "AAAAA1111P",
  base: 45_000_00,
  before: { base: 0, untaxedBase: 0 },
  creditDate: "2025-06-05",
  paymentDate: "2025-06-05",
});
assert(resRentUnder.amount === 0, "194I: Monthly rent of ₹45,000 is under ₹50,000/month threshold (₹0 TDS)");

// 3.2 Monthly rent exactly ₹50,000
const resRentEqual = workTds({
  section: TDS_SECTIONS["194I_LB"],
  pan: "AAAAA1111P",
  base: 50_000_00,
  before: { base: 0, untaxedBase: 0 },
  creditDate: "2025-06-05",
  paymentDate: "2025-06-05",
});
assert(resRentEqual.amount === 0, "194I: Monthly rent exactly ₹50,000 is exempt (threshold > ₹50,000)");

// 3.3 Monthly rent above ₹50,000 for land/building (10% rate)
const resRentLdExceed = workTds({
  section: TDS_SECTIONS["194I_LB"],
  pan: "AAAAA1111P",
  base: 70_000_00,
  before: { base: 0, untaxedBase: 0 },
  creditDate: "2025-06-05",
  paymentDate: "2025-06-05",
});
assert(resRentLdExceed.amount === 7_000_00 && resRentLdExceed.rate === 10, "194I: Building rent ₹70,000 deducts 10% = ₹7,000 TDS");

// 3.4 Monthly hire of plant/machinery above ₹50,000 (2% rate)
const resRentPmExceed = workTds({
  section: TDS_SECTIONS["194I_PM"],
  pan: "AAAAA1111P",
  base: 70_000_00,
  before: { base: 0, untaxedBase: 0 },
  creditDate: "2025-06-05",
  paymentDate: "2025-06-05",
});
assert(resRentPmExceed.amount === 1_400_00 && resRentPmExceed.rate === 2, "194I: Plant/machinery hire ₹70,000 deducts 2% = ₹1,400 TDS");

// 3.5 Monthly aggregation: two payments of ₹30,000 in same month
const resRentSplitMonth = workTds({
  section: TDS_SECTIONS["194I_LB"],
  pan: "AAAAA1111P",
  base: 30_000_00,
  before: { base: 30_000_00, untaxedBase: 30_000_00 }, // Total = ₹60,000
  creditDate: "2025-06-25",
  paymentDate: "2025-06-25",
});
assert(resRentSplitMonth.amount === 6_000_00 && resRentSplitMonth.catchUpBase === 30_000_00, "194I: Two ₹30,000 payments in same month breach ₹50,000; catches up prior payment = ₹6,000 TDS");

// -----------------------------------------------------------------
// SUITE 4: SECTION 194Q / SECTION 393(1) TABLE 8(ii) (GOODS)
// -----------------------------------------------------------------
console.log("\n--- Suite 4: Section 194Q & Section 393(1) Table 8(ii) (Goods) ---");

// 4.1 Buyer turnover below ₹10 crore: partySection returns null
const secUnderTurnover = partySection({ partyType: "VENDOR" }, { buyer194Q: false });
assert(secUnderTurnover === null, "194Q: Buyer turnover <= ₹10 Cr does not trigger Section 194Q");

// 4.2 Buyer turnover above ₹10 crore: partySection returns 194Q
const secAboveTurnover = partySection({ partyType: "VENDOR" }, { buyer194Q: true });
assert(secAboveTurnover && secAboveTurnover.act === "194Q", "194Q: Buyer turnover > ₹10 Cr assigns Section 194Q to vendors");

// 4.3 Aggregate purchase below ₹50 Lakhs (e.g. ₹40 Lakhs)
const resGoodsUnder = workTds({
  section: TDS_SECTIONS["194Q"],
  pan: "AAAAA1111P",
  base: 40_00_000_00,
  before: { base: 0, untaxedBase: 0 },
  creditDate: "2025-08-01",
  paymentDate: "2025-08-01",
});
assert(resGoodsUnder.amount === 0, "194Q: Cumulative purchase ₹40 Lakhs is under ₹50 Lakh threshold (₹0 TDS)");

// 4.4 Aggregate purchase crosses ₹50 Lakhs (prior ₹40L, current ₹15L -> total ₹55L, excess ₹5L)
const resGoodsCross = workTds({
  section: TDS_SECTIONS["194Q"],
  pan: "AAAAA1111P",
  base: 15_00_000_00, // ₹15 Lakhs
  before: { base: 40_00_000_00, untaxedBase: 40_00_000_00 },
  creditDate: "2025-09-01",
  paymentDate: "2025-09-01",
});
// 0.1% on excess ₹5,00,000 = ₹500
assert(resGoodsCross.amount === 500_00 && resGoodsCross.rate === 0.1, "194Q: Current ₹15L with prior ₹40L deducts 0.1% only on ₹5L excess = ₹500 TDS");

// 4.5 Subsequent payment after crossing ₹50 Lakhs (taxed entirely on payment amount)
const resGoodsSubs = workTds({
  section: TDS_SECTIONS["194Q"],
  pan: "AAAAA1111P",
  base: 10_00_000_00, // ₹10 Lakhs
  before: { base: 55_00_000_00, untaxedBase: 0 },
  creditDate: "2025-10-01",
  paymentDate: "2025-10-01",
});
// 0.1% on full ₹10 Lakhs = ₹1,000
assert(resGoodsSubs.amount === 1_000_00, "194Q: Subsequent ₹10L purchase after threshold is fully taxed @ 0.1% = ₹1,000 TDS");

// 4.6 Section 194Q without PAN: 5% penal rate (NOT 20%)
const resGoodsNoPan = workTds({
  section: TDS_SECTIONS["194Q"],
  pan: null,
  base: 15_00_000_00,
  before: { base: 40_00_000_00, untaxedBase: 40_00_000_00 }, // excess ₹5 Lakhs
  creditDate: "2025-09-01",
  paymentDate: "2025-09-01",
});
// 5% on excess ₹5,00,000 = ₹25,000
assert(resGoodsNoPan.amount === 25_000_00 && resGoodsNoPan.rate === 5, "194Q: Non-PAN purchase deducts 5% penal rate on excess = ₹25,000 TDS");

// -----------------------------------------------------------------
// SUITE 5: LEGISLATIVE TRANSITION (1961 ACT vs 2025 ACT)
// -----------------------------------------------------------------
console.log("\n--- Suite 5: Legislative Transition (1961 Act vs 2025 Act) ---");

// 5.1 Trigger on 31 March 2026 -> Income-tax Act, 1961
const statMar31 = resolveStatutoryReference("194C", "194C", "2026-03-31");
assert(
  statMar31.governingAct === "Income-tax Act, 1961" &&
  statMar31.sectionRef === "Section 194C",
  "Transition: 31 March 2026 maps to Income-tax Act, 1961 (Section 194C)"
);

// 5.2 Trigger on 1 April 2026 -> Income-tax Act, 2025 Section 393(1) Table Serial No. 6(i)
const statApr01 = resolveStatutoryReference("194C", "194C", "2026-04-01");
assert(
  statApr01.governingAct === "Income-tax Act, 2025" &&
  statApr01.sectionRef === "Section 393(1), Table Serial No. 6(i)",
  "Transition: 1 April 2026 maps to Income-tax Act, 2025 (Section 393(1), Table Serial No. 6(i))"
);

// 5.3 March credit / April payment -> Earlier date is March -> 1961 Act
const trigMarCredAprPay = resolveEffectiveTdsDate("2026-03-28", "2026-04-05");
const statMarCredAprPay = resolveStatutoryReference("194C", "194C", trigMarCredAprPay.effectiveDate);
assert(
  trigMarCredAprPay.effectiveDate === "2026-03-28" &&
  trigMarCredAprPay.trigger === "CREDIT" &&
  statMarCredAprPay.governingAct === "Income-tax Act, 1961",
  "Transition: March credit / April payment triggers under Income-tax Act, 1961"
);

// 5.4 March advance payment / April credit -> Earlier date is March -> 1961 Act
const trigMarPayAprCred = resolveEffectiveTdsDate("2026-04-10", "2026-03-25");
const statMarPayAprCred = resolveStatutoryReference("194C", "194C", trigMarPayAprCred.effectiveDate);
assert(
  trigMarPayAprCred.effectiveDate === "2026-03-25" &&
  trigMarPayAprCred.trigger === "PAYMENT" &&
  statMarPayAprCred.governingAct === "Income-tax Act, 1961",
  "Transition: March advance payment / April credit triggers under Income-tax Act, 1961"
);

// 5.5 April credit / April payment -> Both April -> 2025 Act
const trigAprBoth = resolveEffectiveTdsDate("2026-04-05", "2026-04-10");
const statAprBoth = resolveStatutoryReference("194C", "194C", trigAprBoth.effectiveDate);
assert(
  trigAprBoth.effectiveDate === "2026-04-05" &&
  statAprBoth.governingAct === "Income-tax Act, 2025" &&
  statAprBoth.sectionRef === "Section 393(1), Table Serial No. 6(i)",
  "Transition: April credit / April payment triggers under Income-tax Act, 2025 (Section 393(1), Table Serial No. 6(i))"
);

// -----------------------------------------------------------------
// SUITE 6: GST EXCLUSION BY CATEGORY (CBDT CIRCULARS 23/2017 & 13/2021)
// -----------------------------------------------------------------
console.log("\n--- Suite 6: GST Treatment by Category ---");

// 6.1 Services with GST separately indicated (Circular 23/2017): GST excluded from base
const resGstSepServices = workTds({
  section: TDS_SECTIONS["194C"],
  pan: PAN_COMPANY, // 2%
  base: 1_00_000_00, // ₹1,00,000 base
  gstAmount: 18_000_00, // 18% GST = ₹18,000
  isGstSeparated: true,
  before: { base: 0, untaxedBase: 0 },
  creditDate: "2025-06-01",
  paymentDate: "2025-06-01",
});
assert(
  resGstSepServices.taxableBasePaise === 1_00_000_00 &&
  resGstSepServices.amount === 2_000_00,
  "GST: Separately shown GST on services excluded from base; 2% on ₹1,00,000 = ₹2,000 TDS"
);

// 6.2 Services with GST not separately indicated: TDS applies to gross amount
const resGstNotSepServices = workTds({
  section: TDS_SECTIONS["194C"],
  pan: PAN_COMPANY, // 2%
  base: 1_00_000_00,
  gstAmount: 18_000_00,
  isGstSeparated: false,
  before: { base: 0, untaxedBase: 0 },
  creditDate: "2025-06-01",
  paymentDate: "2025-06-01",
});
assert(
  resGstNotSepServices.taxableBasePaise === 1_18_000_00 &&
  resGstNotSepServices.amount === 2_360_00,
  "GST: Gross invoice without separate GST taxed in full; 2% on ₹1,18,000 = ₹2,360 TDS"
);

// 6.3 Goods purchase on credit invoice with separate GST (Circular 13/2021): GST excluded
const resGstGoodsCredit = workTds({
  section: TDS_SECTIONS["194Q"],
  pan: PAN_COMPANY, // 0.1%
  base: 10_00_000_00, // ₹10 Lakhs (post threshold)
  gstAmount: 1_80_000_00,
  isGstSeparated: true,
  before: { base: 50_00_000_00, untaxedBase: 0 },
  creditDate: "2025-07-01", // Invoice credit date
  paymentDate: "2025-07-15", // Later payment date
});
assert(
  resGstGoodsCredit.taxableBasePaise === 10_00_000_00 &&
  resGstGoodsCredit.amount === 1_000_00,
  "GST: 194Q invoice credit with separate GST excludes GST; 0.1% on ₹10L = ₹1,000 TDS"
);

// 6.4 Goods purchase on advance payment (Circular 13/2021 Q1): TDS applies on gross advance
const resGstGoodsAdvance = workTds({
  section: TDS_SECTIONS["194Q"],
  pan: PAN_COMPANY, // 0.1%
  base: 10_00_000_00,
  gstAmount: 1_80_000_00,
  isGstSeparated: true,
  before: { base: 50_00_000_00, untaxedBase: 0 },
  creditDate: "2025-07-20", // Invoice date later
  paymentDate: "2025-07-01", // Advance payment earlier
});
assert(
  resGstGoodsAdvance.taxableBasePaise === 11_80_000_00 &&
  resGstGoodsAdvance.amount === 1_180_00,
  "GST: 194Q advance payment prior to invoice taxes gross advance including GST = ₹1,180 TDS"
);

// -----------------------------------------------------------------
// SUITE 7: LOWER / NIL DEDUCTION CERTIFICATES (SECTION 197 / 396)
// -----------------------------------------------------------------
console.log("\n--- Suite 7: Lower / Nil Deduction Certificates ---");

// 7.1 Valid certificate within date range and cumulative limit
const resCertValid = workTds({
  section: TDS_SECTIONS["194C"],
  pan: PAN_COMPANY, // Normal rate 2%
  base: 10_00_000_00, // ₹10 Lakhs
  before: { base: 0, untaxedBase: 0 },
  creditDate: "2025-06-15",
  paymentDate: "2025-06-15",
  certificate: {
    certificateNumber: "AO-197-2025-00123",
    validFrom: "2025-04-01",
    validTo: "2026-03-31",
    certifiedRate: 0.5, // 0.5% certified rate
    certificateLimitPaise: 50_00_000_00,
    utilizedLimitPaise: 10_00_000_00, // ₹10L utilized, ₹40L remaining
    applicableSection: "194C",
  },
});
// 0.5% on ₹10 Lakhs = ₹5,000
assert(
  resCertValid.amount === 5_000_00 &&
  resCertValid.auditMetadata.certificateDetails.isValid === true &&
  resCertValid.auditMetadata.certificateDetails.certifiedRate === 0.5,
  "Certificate: Valid lower deduction certificate (0.5%) applied successfully = ₹5,000 TDS"
);

// 7.2 Expired certificate reverts to normal rate
const resCertExpired = workTds({
  section: TDS_SECTIONS["194C"],
  pan: PAN_COMPANY, // Normal rate 2%
  base: 10_00_000_00,
  before: { base: 0, untaxedBase: 0 },
  creditDate: "2025-06-15",
  paymentDate: "2025-06-15",
  certificate: {
    certificateNumber: "AO-197-2024-99999",
    validFrom: "2024-04-01",
    validTo: "2025-03-31", // Expired
    certifiedRate: 0.5,
    certificateLimitPaise: 50_00_000_00,
    utilizedLimitPaise: 0,
    applicableSection: "194C",
  },
});
assert(
  resCertExpired.amount === 20_000_00 &&
  resCertExpired.auditMetadata.certificateDetails.isValid === false,
  "Certificate: Expired certificate rejected; reverted to normal statutory rate (2%) = ₹20,000 TDS"
);

// 7.3 Category mismatch: certificate for 194C used on 194J
const resCertMismatch = workTds({
  section: TDS_SECTIONS["194J_PROF"], // 194J (10%)
  pan: PAN_COMPANY,
  base: 10_00_000_00,
  before: { base: 0, untaxedBase: 0 },
  creditDate: "2025-06-15",
  paymentDate: "2025-06-15",
  certificate: {
    certificateNumber: "AO-197-2025-00123",
    validFrom: "2025-04-01",
    validTo: "2026-03-31",
    certifiedRate: 0.5,
    certificateLimitPaise: 50_00_000_00,
    utilizedLimitPaise: 0,
    applicableSection: "194C", // Mismatch with 194J!
  },
});
assert(
  resCertMismatch.amount === 1_00_000_00 &&
  resCertMismatch.auditMetadata.certificateDetails.isValid === false,
  "Certificate: Category mismatch rejected; 10% rate applied on professional fees = ₹1,00,000 TDS"
);

// 7.4 Certificate limit partially exhausted (split rate calculation)
const resCertPartial = workTds({
  section: TDS_SECTIONS["194C"],
  pan: PAN_COMPANY, // Normal rate 2%
  base: 10_00_000_00, // ₹10 Lakhs total
  before: { base: 0, untaxedBase: 0 },
  creditDate: "2025-06-15",
  paymentDate: "2025-06-15",
  certificate: {
    certificateNumber: "AO-197-2025-00123",
    validFrom: "2025-04-01",
    validTo: "2026-03-31",
    certifiedRate: 0.5,
    certificateLimitPaise: 15_00_000_00,
    utilizedLimitPaise: 9_00_000_00, // Only ₹6 Lakhs remaining!
    applicableSection: "194C",
  },
});
// Eligible ₹6L @ 0.5% = ₹3,000. Excess ₹4L @ 2% = ₹8,000. Total = ₹11,000
assert(
  resCertPartial.amount === 11_000_00 &&
  resCertPartial.auditMetadata.certificateDetails.eligiblePortionPaise === 6_00_000_00 &&
  resCertPartial.auditMetadata.certificateDetails.excessPortionPaise === 4_00_000_00,
  "Certificate: Partially exhausted limit splits correctly (₹6L @ 0.5% + ₹4L @ 2%) = ₹11,000 TDS"
);

// -----------------------------------------------------------------
// SUITE 8: 3-TIER ROUNDING (RULE 31A vs SECTION 288B / SECTION 516)
// -----------------------------------------------------------------
console.log("\n--- Suite 8: 3-Tier Rounding Logic ---");

// 8.1 Transaction-level rounding (TRACES Rule 31A nearest rupee)
// Below 50 paise: ₹1,234.49 (123449 paise) -> ₹1,234.00 (123400 paise)
assert(roundTransactionTds(123449) === 123400, "Rounding Tier 2: 123449 paise (< 50 paise) rounds down to 123400 paise (₹1,234)");

// Exactly 50 paise: ₹1,234.50 (123450 paise) -> ₹1,235.00 (123500 paise)
assert(roundTransactionTds(123450) === 123500, "Rounding Tier 2: 123450 paise (= 50 paise) rounds up to 123500 paise (₹1,235)");

// Above 50 paise: ₹1,234.51 (123451 paise) -> ₹1,235.00 (123500 paise)
assert(roundTransactionTds(123451) === 123500, "Rounding Tier 2: 123451 paise (> 50 paise) rounds up to 123500 paise (₹1,235)");

// 8.2 Statutory Terminal Rounding (Section 288B / Section 516 nearest ₹10)
// Value with last digit < 5: ₹18,234.90 -> drops paise to ₹18,234 -> rounds down to ₹18,230 (1823000 paise)
assert(roundStatutoryPayableOrRefund(1823490) === 1823000, "Rounding Tier 3 (Sec 288B/516): ₹18,234.90 drops paise, unit digit 4 rounds down to ₹18,230");

// Value with last digit == 5: ₹18,235.10 -> drops paise to ₹18,235 -> rounds up to ₹18,240 (1824000 paise)
assert(roundStatutoryPayableOrRefund(1823510) === 1824000, "Rounding Tier 3 (Sec 288B/516): ₹18,235.10 drops paise, unit digit 5 rounds up to ₹18,240");

// Value with last digit > 5: ₹18,236.00 -> drops paise to ₹18,236 -> rounds up to ₹18,240 (1824000 paise)
assert(roundStatutoryPayableOrRefund(1823600) === 1824000, "Rounding Tier 3 (Sec 288B/516): ₹18,236.00 drops paise, unit digit 6 rounds up to ₹18,240");

// 8.3 Multiple transactions aggregated into quarterly / monthly Challan ITNS 281 reporting
const sampleTdsBatch = [123400, 256700, 314400]; // ₹1,234 + ₹2,567 + ₹3,144 = ₹6,945 (694500 paise)
const batchResult = aggregateTdsReporting(sampleTdsBatch, "1961");
// Total is ₹6,945; unit digit is 5 -> rounds up to ₹6,950
assert(
  batchResult.transactionTotalPaise === 694500 &&
  batchResult.statutoryPayablePaise === 695000 &&
  batchResult.roundingAdjustmentPaise === 500,
  "Rounding Aggregation: Batch total ₹6,945 terminal-rounds to ₹6,950 under Section 288B (₹5 adjustment)"
);

// -----------------------------------------------------------------
// SUITE 9: AUDIT RECORD INTEGRITY & METADATA PRESERVATION
// -----------------------------------------------------------------
console.log("\n--- Suite 9: Audit Record Integrity & Metadata Fields ---");

const auditSample = workTds({
  section: TDS_SECTIONS["194C"],
  pan: PAN_COMPANY,
  base: 50_000_00,
  before: { base: 0, untaxedBase: 0 },
  creditDate: "2025-06-15",
  paymentDate: "2025-06-20",
  deductorType: "COMPANY",
  deducteeResidentialStatus: "RESIDENT",
});

const m = auditSample.auditMetadata;
assert(
  m.deductorType === "COMPANY" &&
  m.deducteeResidentialStatus === "RESIDENT" &&
  m.panStatus === "VALID" &&
  m.taxYear === "2025-26" &&
  m.statutoryRegime === "Income-tax Act, 1961" &&
  m.statutorySectionRef === "Section 194C" &&
  m.earlierDateTrigger === "CREDIT" &&
  m.deductionMechanism === "TAN_FORM_26Q" &&
  m.roundingRule === "NEAREST_RUPEE_TRANSACTION" &&
  typeof m.calculationTimestamp === "string" &&
  typeof m.calculationExplanation === "string",
  "Audit Integrity: All required statutory compliance and metadata fields populated accurately"
);

console.log("\n==================================================================");
console.log(`TDS REGRESSION SUITE COMPLETE: ${passed} Passed, ${failed} Failed`);
console.log("==================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
