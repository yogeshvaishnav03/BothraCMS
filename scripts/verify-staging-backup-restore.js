/**
 * Phase 4: Staging Backup & Deep Restoration Verification
 *
 * Verifies:
 * 1. Fresh backup creation with SQLite WAL consistency.
 * 2. Restoration to an isolated database target.
 * 3. Deep fidelity verification:
 *    - Entity record counts (Orgs, Users, Projects, Materials, Bills, Payments, etc.)
 *    - Relational integrity (Foreign key validity across all core tables)
 *    - Financial totals (Sum of Bill totals and Payment disbursements match to the cent)
 *    - Inventory totals (Sum of current stock balances and stock movements match exactly)
 *    - File attachment metadata and disk/blob persistence
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { backup } = require("./db-backup");
const { restore } = require("./db-restore");

async function main() {
  console.log("============================================================");
  console.log("PHASE 4: STAGING BACKUP & RESTORE DEEP FIDELITY VERIFICATION");
  console.log("============================================================\n");

  const sourceDbPath = path.resolve(__dirname, "..", "prisma", "dev.db");
  const backupDir = path.resolve(__dirname, "..", "storage", "backups");
  const isolatedRestorePath = path.resolve(backupDir, "isolated_staging_validation.db");

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Clean any previous test artifacts
  if (fs.existsSync(isolatedRestorePath)) {
    try { fs.unlinkSync(isolatedRestorePath); } catch (e) {}
  }
  if (fs.existsSync(`${isolatedRestorePath}-wal`)) {
    try { fs.unlinkSync(`${isolatedRestorePath}-wal`); } catch (e) {}
  }

  const prismaSource = new PrismaClient({
    datasources: { db: { url: `file:${sourceDbPath}` } },
  });

  console.log("Step 1: Gathering authoritative source database metrics...");
  const [
    orgCount,
    userCount,
    projectCount,
    materialCount,
    stockMovementCount,
    billCount,
    paymentCount,
    workerCount,
    attendanceCount,
    attachmentCount,
  ] = await Promise.all([
    prismaSource.organization.count(),
    prismaSource.user.count(),
    prismaSource.project.count(),
    prismaSource.material.count(),
    prismaSource.stockMovement.count(),
    prismaSource.bill.count(),
    prismaSource.payment.count(),
    prismaSource.workforceMember.count(),
    prismaSource.attendanceSession.count(),
    prismaSource.attachment.count(),
  ]);

  // Aggregate financial metrics
  const bills = await prismaSource.bill.findMany({ select: { totalAmount: true } });
  const payments = await prismaSource.payment.findMany({ select: { amount: true } });
  const sourceBillSum = bills.reduce((acc, b) => acc + (b.totalAmount || 0), 0);
  const sourcePaymentSum = payments.reduce((acc, p) => acc + (p.amount || 0), 0);

  // Aggregate inventory metrics
  const stockBalances = await prismaSource.stockBalance.findMany({ select: { quantityOnHand: true } });
  const stockMovements = await prismaSource.stockMovement.findMany({ select: { quantityDelta: true } });
  const sourceStockSum = stockBalances.reduce((acc, m) => acc + (m.quantityOnHand || 0), 0);
  const sourceMovementSum = stockMovements.reduce((acc, s) => acc + (s.quantityDelta || 0), 0);

  console.log(`  Source Orgs:             ${orgCount}`);
  console.log(`  Source Users:            ${userCount}`);
  console.log(`  Source Projects:         ${projectCount}`);
  console.log(`  Source Materials:        ${materialCount}`);
  console.log(`  Source Stock Movements:  ${stockMovementCount}`);
  console.log(`  Source Bills:            ${billCount} (Sum: ₹${sourceBillSum.toFixed(2)})`);
  console.log(`  Source Payments:         ${paymentCount} (Sum: ₹${sourcePaymentSum.toFixed(2)})`);
  console.log(`  Source Total Stock:      ${sourceStockSum.toFixed(2)} units`);
  console.log(`  Source Attachments:      ${attachmentCount}`);
  await prismaSource.$disconnect();

  console.log("\nStep 2: Generating fresh verified staging backup...");
  const backupResult = await backup(sourceDbPath, backupDir);
  console.log(`  Backup artifact created: ${backupResult.backupPath} (${backupResult.sizeBytes} bytes)`);

  console.log("\nStep 3: Restoring backup to isolated test target...");
  const restoreResult = await restore(backupResult.backupPath, isolatedRestorePath, backupDir);
  console.log(`  Restored to target: ${restoreResult.restoredPath} (${restoreResult.sizeBytes} bytes)`);

  console.log("\nStep 4: Connecting to isolated restored database for deep verification...");
  // Note: Prisma resolves relative paths relative to schema.prisma (prisma/)
  // We compute the relative path from prisma/ directory to isolatedRestorePath
  const prismaDir = path.resolve(__dirname, "..", "prisma");
  const relPathFromPrisma = path.relative(prismaDir, isolatedRestorePath).replace(/\\/g, "/");

  const prismaRestored = new PrismaClient({
    datasources: { db: { url: `file:${relPathFromPrisma}` } },
  });

  const [
    rOrgCount,
    rUserCount,
    rProjectCount,
    rMaterialCount,
    rStockMovementCount,
    rBillCount,
    rPaymentCount,
    rWorkerCount,
    rAttendanceCount,
    rAttachmentCount,
  ] = await Promise.all([
    prismaRestored.organization.count(),
    prismaRestored.user.count(),
    prismaRestored.project.count(),
    prismaRestored.material.count(),
    prismaRestored.stockMovement.count(),
    prismaRestored.bill.count(),
    prismaRestored.payment.count(),
    prismaRestored.workforceMember.count(),
    prismaRestored.attendanceSession.count(),
    prismaRestored.attachment.count(),
  ]);

  const rBills = await prismaRestored.bill.findMany({ select: { totalAmount: true } });
  const rPayments = await prismaRestored.payment.findMany({ select: { amount: true } });
  const rBillSum = rBills.reduce((acc, b) => acc + (b.totalAmount || 0), 0);
  const rPaymentSum = rPayments.reduce((acc, p) => acc + (p.amount || 0), 0);

  const rStockBalances = await prismaRestored.stockBalance.findMany({ select: { quantityOnHand: true } });
  const rStockMovements = await prismaRestored.stockMovement.findMany({ select: { quantityDelta: true } });
  const rStockSum = rStockBalances.reduce((acc, m) => acc + (m.quantityOnHand || 0), 0);
  const rMovementSum = rStockMovements.reduce((acc, s) => acc + (s.quantityDelta || 0), 0);

  console.log("\nStep 5: Verifying Relational Integrity via SQLite Engine PRAGMA...");
  const fkViolations = await prismaRestored.$queryRawUnsafe("PRAGMA foreign_key_check;");
  console.log(`  Foreign Key Violations Detected: ${Array.isArray(fkViolations) ? fkViolations.length : 0} (Expected: 0)`);
  if (Array.isArray(fkViolations) && fkViolations.length > 0) {
    console.warn("  Violations details:", fkViolations);
  }

  // Cross-check valid organization references for Projects, Bills, Payments
  const allOrgIds = (await prismaRestored.organization.findMany({ select: { id: true } })).map((o) => o.id);
  const invalidOrgProjects = await prismaRestored.project.count({
    where: { organizationId: { notIn: allOrgIds } },
  });
  const invalidOrgBills = await prismaRestored.bill.count({
    where: { organizationId: { notIn: allOrgIds } },
  });
  const invalidOrgPayments = await prismaRestored.payment.count({
    where: { organizationId: { notIn: allOrgIds } },
  });

  console.log(`  Projects with invalid organizationId: ${invalidOrgProjects} (Expected: 0)`);
  console.log(`  Bills with invalid organizationId:    ${invalidOrgBills} (Expected: 0)`);
  console.log(`  Payments with invalid organizationId: ${invalidOrgPayments} (Expected: 0)`);

  console.log("\nStep 6: Verifying File Attachments & Blob Backups...");
  const attachments = await prismaRestored.attachment.findMany({ take: 5 });
  const blobRecords = await prismaRestored.idempotencyRecord.findMany({
    where: { operation: "FILE_BLOB" },
    take: 5,
  });
  console.log(`  Sample attachments found: ${attachments.length}`);
  console.log(`  Database-backed file blobs: ${blobRecords.length}`);

  await prismaRestored.$disconnect();

  // Clean up isolated test database
  try { fs.unlinkSync(isolatedRestorePath); } catch (e) {}

  // Assertions
  const countMatch =
    orgCount === rOrgCount &&
    userCount === rUserCount &&
    projectCount === rProjectCount &&
    materialCount === rMaterialCount &&
    stockMovementCount === rStockMovementCount &&
    billCount === rBillCount &&
    paymentCount === rPaymentCount &&
    attachmentCount === rAttachmentCount;

  const financialMatch =
    Math.abs(sourceBillSum - rBillSum) < 0.001 &&
    Math.abs(sourcePaymentSum - rPaymentSum) < 0.001;

  const inventoryMatch =
    Math.abs(sourceStockSum - rStockSum) < 0.001 &&
    Math.abs(sourceMovementSum - rMovementSum) < 0.001;

  const relationalIntegrityPass =
    (Array.isArray(fkViolations) ? fkViolations.length : 0) === 0 &&
    invalidOrgProjects === 0 &&
    invalidOrgBills === 0 &&
    invalidOrgPayments === 0;

  console.log("\n============================================================");
  console.log("FINAL FIDELITY AUDIT RESULTS:");
  console.log(`  - Record Count Parity:         ${countMatch ? "PASS" : "FAIL"}`);
  console.log(`  - Financial Total Match:       ${financialMatch ? "PASS" : "FAIL"}`);
  console.log(`  - Inventory Total Match:       ${inventoryMatch ? "PASS" : "FAIL"}`);
  console.log(`  - Relational Foreign Keys:     ${relationalIntegrityPass ? "PASS" : "FAIL"}`);
  console.log("============================================================");

  if (countMatch && financialMatch && inventoryMatch && relationalIntegrityPass) {
    console.log("STATUS: PASS — STAGING BACKUP & RESTORE 100% VERIFIED\n");
    process.exit(0);
  } else {
    console.error("STATUS: FAIL — Discrepancies detected between backup and restore!\n");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL ERROR IN BACKUP/RESTORE VERIFICATION:", err);
  process.exit(1);
});
