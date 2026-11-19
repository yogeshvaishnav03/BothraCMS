const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("STARTING LIQUIDATED DAMAGES VERIFICATION SUITE");
console.log("==================================================================\n");

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.error(`  FAIL: ${name}`);
  }
}

// 1. Prisma schema check
const schema = fs.readFileSync(path.resolve(__dirname, "..", "prisma", "schema.prisma"), "utf-8");
assert(schema.includes("model LiquidatedDamage {"), "Prisma schema contains model LiquidatedDamage");
assert(schema.includes("liquidatedDamagesTerms"), "Party model has liquidatedDamagesTerms");
assert(schema.includes("liquidatedDamagesPercent"), "Party model has liquidatedDamagesPercent");
assert(schema.includes("liquidatedDamages LiquidatedDamage[]"), "Party model has liquidatedDamages relation");

// 2. Postgres migration script check
const migrator = fs.readFileSync(path.resolve(__dirname, "..", "scripts", "apply-postgres-migration.js"), "utf-8");
assert(migrator.includes('ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "liquidatedDamagesTerms"'), "Postgres migrator adds liquidatedDamagesTerms column");
assert(migrator.includes('ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "liquidatedDamagesPercent"'), "Postgres migrator adds liquidatedDamagesPercent column");
assert(migrator.includes('CREATE TABLE IF NOT EXISTS "LiquidatedDamage"'), "Postgres migrator creates LiquidatedDamage table");

// 3. Service checks
const service = fs.readFileSync(path.resolve(__dirname, "..", "src", "services", "liquidated-damages-service.ts"), "utf-8");
assert(service.includes("recordDamage"), "LiquidatedDamagesService implements recordDamage");
assert(service.includes("waiveDamage"), "LiquidatedDamagesService implements waiveDamage");
assert(service.includes("getPartyDamages"), "LiquidatedDamagesService implements getPartyDamages");
assert(service.includes("LIQUIDATED_DAMAGES_DEDUCTED"), "Audit event logged on damage deduction");
assert(service.includes("LIQUIDATED_DAMAGES_WAIVED"), "Audit event logged on damage waiver");

// 4. Finance Service reconciliation check
const finService = fs.readFileSync(path.resolve(__dirname, "..", "src", "services", "finance-service.ts"), "utf-8");
assert(finService.includes("totalDamagesDeducted"), "FinanceService computes totalDamagesDeducted in party statement");
assert(finService.includes("outstandingBalance = roundPaise(totalBilled - totalPaid - totalDamagesDeducted)"), "FinanceService correctly offsets damages from outstanding balance");

// 5. Party Statement Page check
const statementPage = fs.readFileSync(path.resolve(__dirname, "..", "src", "app", "parties", "[id]", "page.tsx"), "utf-8");
assert(statementPage.includes("Liquidated Damages &amp; Deductions Register"), "Party statement page renders Liquidated Damages register");
assert(statementPage.includes("showDamageModal"), "Party statement page contains Deduct Damages modal");
assert(statementPage.includes("waiveTarget"), "Party statement page contains Waive modal");
assert(statementPage.includes("Damages Deducted"), "Party statement page includes Damages Deducted KPI card");

// 6. Party Directory Page check
const partiesPage = fs.readFileSync(path.resolve(__dirname, "..", "src", "app", "parties", "page.tsx"), "utf-8");
assert(partiesPage.includes("liquidatedDamagesTerms"), "Parties directory page contains Liquidated Damages form fields");
assert(partiesPage.includes("liquidatedDamagesPercent"), "Parties directory page contains max cap % field");
assert(partiesPage.includes("totalDamagesDeducted"), "Parties directory shows total damages deducted on cards and table");

// 7. Finance Page check
const financePage = fs.readFileSync(path.resolve(__dirname, "..", "src", "app", "finance", "page.tsx"), "utf-8");
assert(financePage.includes("totalDamagesDeducted"), "Finance page warns if selected vendor has liquidated damages on file");

console.log(`\n==================================================================`);
console.log(`LIQUIDATED DAMAGES SUITE: ${passed} Passed, ${failed} Failed`);
console.log(`==================================================================`);

if (failed > 0) process.exit(1);
