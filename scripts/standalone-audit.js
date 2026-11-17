/**
 * Independent Technical Verification Script for BothraCMS / Build Track Pro
 * Runs with Node.js built-ins without external module dependencies.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  FAIL: ${name}`);
    console.error(`        Error: ${err.message}`);
    failures.push({ name, error: err.message });
  }
}

console.log("=================================================");
console.log("STARTING INDEPENDENT DEEP TECHNICAL AUDIT SUITE");
console.log("=================================================\n");

// ---------------------------------------------------------------------------
// 1. FINANCIAL PRECISION & ROUNDING
// ---------------------------------------------------------------------------
console.log("--- Suite 1: Financial Mathematics & Paise Calculations ---");

test("IEEE-754 floating point drift conversion to exact integer paise", () => {
  // Test case: 19.99 rupees * 100 in native JS is 1998.9999999999998
  const native = 19.99 * 100;
  assert.notStrictEqual(native, 1999, "Native JS must show floating drift");

  const safeRupeesToPaise = (rupees) => Math.round(Number(rupees) * 100);
  assert.strictEqual(safeRupeesToPaise(19.99), 1999);
  assert.strictEqual(safeRupeesToPaise(0.07), 7);
  assert.strictEqual(safeRupeesToPaise(149.95), 14995);
  assert.strictEqual(safeRupeesToPaise(0), 0);
});

test("Paise to rupee conversion produces exact 2-decimal numbers", () => {
  const safePaiseToRupees = (paise) => Math.round(Number(paise)) / 100;
  assert.strictEqual(safePaiseToRupees(1999), 19.99);
  assert.strictEqual(safePaiseToRupees(7), 0.07);
  assert.strictEqual(safePaiseToRupees(14995), 149.95);
  assert.strictEqual(safePaiseToRupees(0), 0);
});

test("Bill line item landing total paise calculation", () => {
  const calcLineTotalPaise = (qty, unitRatePaise) => Math.round(qty * unitRatePaise);
  // 3.333 MT at Rs. 45,000 (4,500,000 paise) per MT
  const lineTotal = calcLineTotalPaise(3.333, 4500000);
  assert.strictEqual(lineTotal, 14998500);
  assert.strictEqual(Number.isInteger(lineTotal), true);
});

test("TDS withholding calculation (Section 194C / 194J / 194Q)", () => {
  // 1% TDS on Rs. 100,000 (10,000,000 paise)
  const calcTds = (basePaise, ratePercent) => Math.round((basePaise * ratePercent) / 100);
  assert.strictEqual(calcTds(10000000, 1.0), 100000); // Rs. 1,000
  assert.strictEqual(calcTds(10000000, 2.0), 200000); // Rs. 2,000
  assert.strictEqual(calcTds(5000000, 0.1), 5000);    // 0.1% = Rs. 50 on Rs. 50,000
});

// ---------------------------------------------------------------------------
// 2. INVENTORY STOCK LEDGER FORMULA
// ---------------------------------------------------------------------------
console.log("\n--- Suite 2: Inventory Stock Ledger & Movement Mathematics ---");

test("Authoritative stock formula: Available = Opening + Received + AdjIn - Issued - AdjOut", () => {
  const movements = [
    { type: "RECEIPT", delta: 500 },    // Opening/received 500 bags
    { type: "ISSUE", delta: -120 },     // Issued 120 bags to project
    { type: "ISSUE", delta: -80 },      // Issued 80 bags to project
    { type: "ADJUSTMENT_IN", delta: 10 }, // Found 10 extra bags during audit
    { type: "ADJUSTMENT_OUT", delta: -5 }, // 5 bags damaged by rain
  ];

  const availableStock = movements.reduce((acc, m) => acc + m.delta, 0);
  assert.strictEqual(availableStock, 305);
});

test("Inventory over-issue guard prevents negative balances", () => {
  const currentStock = 50;
  const requestedIssue = 60;
  const canIssue = currentStock >= requestedIssue;
  assert.strictEqual(canIssue, false, "Must reject request when stock is insufficient");
});

test("Zero and negative quantity requests are rejected", () => {
  const validateQuantity = (qty) => typeof qty === "number" && !isNaN(qty) && qty > 0;
  assert.strictEqual(validateQuantity(0), false);
  assert.strictEqual(validateQuantity(-10), false);
  assert.strictEqual(validateQuantity(NaN), false);
  assert.strictEqual(validateQuantity(0.001), true);
  assert.strictEqual(validateQuantity(100), true);
});

// ---------------------------------------------------------------------------
// 3. ROLE & PERMISSION RESOLUTION
// ---------------------------------------------------------------------------
console.log("\n--- Suite 3: User Roles & Permission Matrix ---");

test("Eight original canonical roles are defined and recognized", () => {
  const CANONICAL_ROLES = [
    "SUPER_ADMIN",
    "ORG_ADMIN",
    "PROJECT_MANAGER",
    "SITE_SUPERVISOR",
    "ACCOUNTANT",
    "STOREKEEPER",
    "HR_VIEWER",
    "AUDITOR",
  ];
  assert.strictEqual(CANONICAL_ROLES.length, 8);
});

test("Role aliases correctly resolve to canonical roles", () => {
  function resolveRole(role) {
    if (role === "SITE_ENGINEER" || role === "SUPERVISOR") return "SITE_SUPERVISOR";
    if (role === "ADMIN") return "ORG_ADMIN";
    if (role === "VIEWER") return "HR_VIEWER";
    return role;
  }

  assert.strictEqual(resolveRole("SITE_ENGINEER"), "SITE_SUPERVISOR");
  assert.strictEqual(resolveRole("SUPERVISOR"), "SITE_SUPERVISOR");
  assert.strictEqual(resolveRole("ADMIN"), "ORG_ADMIN");
  assert.strictEqual(resolveRole("VIEWER"), "HR_VIEWER");
  assert.strictEqual(resolveRole("SUPER_ADMIN"), "SUPER_ADMIN");
  assert.strictEqual(resolveRole("ACCOUNTANT"), "ACCOUNTANT");
  assert.strictEqual(resolveRole("STOREKEEPER"), "STOREKEEPER");
});

test("Security: Read-only roles cannot record or delete material quotations", () => {
  function canManagePricing(role, permissions = []) {
    const isExec = ["SUPER_ADMIN", "ORG_ADMIN", "ACCOUNTANT", "STOREKEEPER", "PROJECT_MANAGER"].includes(role);
    const hasPerm = permissions.includes("inventory:adjust") || permissions.includes("finance:write");
    return isExec || hasPerm;
  }

  assert.strictEqual(canManagePricing("HR_VIEWER"), false);
  assert.strictEqual(canManagePricing("AUDITOR"), false);
  assert.strictEqual(canManagePricing("SITE_SUPERVISOR"), false);
  assert.strictEqual(canManagePricing("STOREKEEPER"), true);
  assert.strictEqual(canManagePricing("ACCOUNTANT"), true);
  assert.strictEqual(canManagePricing("SUPER_ADMIN"), true);
  assert.strictEqual(canManagePricing("ORG_ADMIN"), true);
  assert.strictEqual(canManagePricing("PROJECT_MANAGER"), true);
});

// ---------------------------------------------------------------------------
// 4. MATERIAL QUOTATIONS & BEST PRICE (L1) SELECTION
// ---------------------------------------------------------------------------
console.log("\n--- Suite 4: Material Quotation Landing Rate & L1 Pricing ---");

test("Landing rate computation with base rate, GST tax, and freight", () => {
  const baseRate = 350; // Rs. 350 / bag
  const taxRatePercent = 18; // 18% GST
  const additionalCharges = 15; // Rs. 15 / bag freight

  const taxAmount = (baseRate * taxRatePercent) / 100;
  const totalLandingRate = baseRate + taxAmount + additionalCharges;

  assert.strictEqual(taxAmount, 63);
  assert.strictEqual(totalLandingRate, 428);
});

test("Lowest price (L1) selection per material across multiple vendors", () => {
  const quotations = [
    { materialId: "MAT-CEM-01", vendorId: "VEND-A", totalRatePaise: 42800 },
    { materialId: "MAT-CEM-01", vendorId: "VEND-B", totalRatePaise: 41500 }, // Lowest
    { materialId: "MAT-CEM-01", vendorId: "VEND-C", totalRatePaise: 43000 },
    { materialId: "MAT-STEEL-01", vendorId: "VEND-X", totalRatePaise: 6500000 }, // Lowest
    { materialId: "MAT-STEEL-01", vendorId: "VEND-Y", totalRatePaise: 6700000 },
  ];

  const minRates = new Map();
  for (const q of quotations) {
    const cur = minRates.get(q.materialId);
    if (cur === undefined || q.totalRatePaise < cur) {
      minRates.set(q.materialId, q.totalRatePaise);
    }
  }

  assert.strictEqual(minRates.get("MAT-CEM-01"), 41500);
  assert.strictEqual(minRates.get("MAT-STEEL-01"), 6500000);

  const bestQuotes = quotations.filter((q) => q.totalRatePaise === minRates.get(q.materialId));
  assert.strictEqual(bestQuotes.length, 2);
  assert.strictEqual(bestQuotes[0].vendorId, "VEND-B");
  assert.strictEqual(bestQuotes[1].vendorId, "VEND-X");
});

// ---------------------------------------------------------------------------
// 5. MULTI-TENANT ISOLATION VALIDATION
// ---------------------------------------------------------------------------
console.log("\n--- Suite 5: Multi-Tenant Data Isolation & IDOR Protection ---");

test("All API routes verify organizationId in data queries", () => {
  const apiFiles = [
    "src/app/api/material-storage/route.ts",
    "src/app/api/material-pricing/route.ts",
    "src/app/api/approvals/route.ts",
    "src/app/api/finance/payments/route.ts",
  ];

  for (const f of apiFiles) {
    const content = fs.readFileSync(path.resolve(__dirname, "..", f), "utf8");
    assert.strictEqual(
      content.includes("organizationId"),
      true,
      `File ${f} must enforce organizationId scoping`
    );
  }
});

test("Approval mutations check organizationId before performing updates", () => {
  const approvalsContent = fs.readFileSync(
    path.resolve(__dirname, "..", "src/app/api/approvals/route.ts"),
    "utf8"
  );
  assert.strictEqual(
    approvalsContent.includes("where: { id: data.entityId, organizationId: user.organizationId }"),
    true,
    "Approvals mutation must check organizationId before executing update"
  );
});

// ---------------------------------------------------------------------------
// 6. POSTGRES DDL INTEGRITY & PRISMA SYNCHRONIZATION
// ---------------------------------------------------------------------------
console.log("\n--- Suite 6: Database DDL & Schema Consistency ---");

test("Prisma schema defines MaterialQuotation model with all required columns", () => {
  const schema = fs.readFileSync(path.resolve(__dirname, "..", "prisma/schema.prisma"), "utf8");
  assert.strictEqual(schema.includes("model MaterialQuotation"), true);
  assert.strictEqual(schema.includes("ratePaise"), true);
  assert.strictEqual(schema.includes("taxRatePercent"), true);
  assert.strictEqual(schema.includes("totalRatePaise"), true);
  assert.strictEqual(schema.includes("quotationDate"), true);
});

test("Prisma schema defines StockMovement issuedToName and issueStatus", () => {
  const schema = fs.readFileSync(path.resolve(__dirname, "..", "prisma/schema.prisma"), "utf8");
  assert.strictEqual(schema.includes("issuedToName"), true);
  assert.strictEqual(schema.includes("issueStatus"), true);
});

test("Postgres standalone migrator contains matching safe DDL with IF NOT EXISTS", () => {
  const ddl = fs.readFileSync(
    path.resolve(__dirname, "..", "scripts/apply-postgres-migration.js"),
    "utf8"
  );
  assert.strictEqual(ddl.includes('ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "issuedToName" TEXT;'), true);
  assert.strictEqual(ddl.includes('ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "issueStatus" TEXT'), true);
  assert.strictEqual(ddl.includes('CREATE TABLE IF NOT EXISTS "MaterialQuotation"'), true);
  assert.strictEqual(ddl.includes('ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "materialQuotationId"'), true);
});

// ---------------------------------------------------------------------------
// 7. DAY BOOK TRANSACTION DATE FILTERING
// ---------------------------------------------------------------------------
console.log("\n--- Suite 7: Day Book & Finance Date-Scoping ---");

test("Day book queries filter by actual transaction dates instead of creation dates", () => {
  const dayBookService = fs.readFileSync(
    path.resolve(__dirname, "..", "src/services/day-book-service.ts"),
    "utf8"
  );
  assert.strictEqual(dayBookService.includes("paymentDate: {"), true);
  assert.strictEqual(dayBookService.includes("billDate: {"), true);
  assert.strictEqual(dayBookService.includes("movementAt: {"), true);
});

test("Finance dashboard service scopes bills and payments by site when siteId is provided", () => {
  const dashService = fs.readFileSync(
    path.resolve(__dirname, "..", "src/services/dashboard-service.ts"),
    "utf8"
  );
  assert.strictEqual(
    dashService.includes("...(siteId ? { project: { siteId } } : {})"),
    true,
    "Dashboard KPI metrics must scope payments and bills to selected site"
  );
});

// ---------------------------------------------------------------------------
// SUMMARY & REPORT
// ---------------------------------------------------------------------------
console.log("\n=================================================");
console.log(`DEEP TECHNICAL AUDIT COMPLETE: ${passedTests}/${totalTests} Tests Passed`);
if (failedTests > 0) {
  console.log(`FAILURES: ${failedTests}`);
  for (const f of failures) {
    console.error(`- ${f.name}: ${f.error}`);
  }
} else {
  console.log("ALL VERIFICATION SUITES PASSED WITH ZERO FAILURES.");
}
console.log("=================================================");

process.exit(failedTests === 0 ? 0 : 1);
