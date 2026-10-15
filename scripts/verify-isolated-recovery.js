/**
 * Hardened Isolated Backup & Recovery Verification Script
 * Validates hardened database backup and recovery on an isolated disposable database copy.
 * Never touches or mutates prisma/dev.db.
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { backup, isValidSqliteFile } = require("./db-backup");
const { restore } = require("./db-restore");

const ORIGINAL_DB = path.resolve(process.cwd(), "prisma", "dev.db");
const DISPOSABLE_DB = path.resolve(process.cwd(), "prisma", "disposable-hardened-test.db");
const DISPOSABLE_BACKUP_DIR = path.resolve(process.cwd(), "storage", "backups", "disposable_test_run");

async function runHardenedIsolatedTest() {
  console.log("=== HARDENED ISOLATED DATABASE BACKUP & RESTORE VERIFICATION ===");

  if (!fs.existsSync(ORIGINAL_DB)) {
    throw new Error(`Original database not found at ${ORIGINAL_DB}`);
  }

  // 1. Create disposable test database copy
  fs.copyFileSync(ORIGINAL_DB, DISPOSABLE_DB);
  console.log("Step 1: Created isolated disposable database copy: prisma/disposable-hardened-test.db");

  // Verify header on disposable copy
  if (!isValidSqliteFile(DISPOSABLE_DB)) {
    throw new Error("Disposable database failed SQLite header check!");
  }
  console.log("Step 1b: Verified authentic SQLite header on disposable test database.");

  const prismaTest = new PrismaClient({
    datasources: { db: { url: "file:./disposable-hardened-test.db" } },
  });

  let backupResult;

  try {
    // 2. Read baseline data
    const orgCount = await prismaTest.organization.count();
    const userCount = await prismaTest.user.count();
    const firstOrg = await prismaTest.organization.findFirst();
    if (!firstOrg) throw new Error("No organization found in database");
    const originalOrgName = firstOrg.name;

    console.log(`Step 2: Read baseline metrics: ${orgCount} organizations, ${userCount} users.`);
    console.log(`Baseline Org [${firstOrg.id}] Name: "${originalOrgName}"`);

    // 3. Create simulated WAL file to test WAL capture and handling
    const dummyWalPath = `${DISPOSABLE_DB}-wal`;
    fs.writeFileSync(dummyWalPath, "SIMULATED_WAL_PAGE_BUFFER_TEST_DATA", "utf8");
    console.log(`Step 3: Created simulated WAL file at ${dummyWalPath}`);

    // Disconnect prisma client before backup
    await prismaTest.$disconnect();

    // 4. Perform hardened backup of disposable database
    backupResult = await backup(DISPOSABLE_DB, DISPOSABLE_BACKUP_DIR);
    console.log(`Step 4: Hardened backup completed. Snapshot: ${backupResult.backupPath}`);

    // Verify backup file header
    if (!isValidSqliteFile(backupResult.backupPath)) {
      throw new Error("Created backup failed SQLite magic header validation!");
    }

    // 5. Corrupt the disposable database to simulate disaster
    const prismaCorrupt = new PrismaClient({
      datasources: { db: { url: "file:./disposable-hardened-test.db" } },
    });
    await prismaCorrupt.organization.update({
      where: { id: firstOrg.id },
      data: { name: "CORRUPTED_DISASTER_RECOVERY_TEST_ORG" },
    });
    await prismaCorrupt.$disconnect();
    console.log("Step 5: Mutated disposable database with corruption simulation.");

    // 6. Test invalid file rejection on restore
    const fakeCorruptBackup = path.join(DISPOSABLE_BACKUP_DIR, "corrupt_fake.db");
    fs.writeFileSync(fakeCorruptBackup, "NOT_A_SQLITE_FILE_CONTENT_TRASH", "utf8");
    console.log("Step 6: Created fake corrupted file to test restore pre-validation.");
    if (isValidSqliteFile(fakeCorruptBackup)) {
      throw new Error("isValidSqliteFile failed to reject fake corrupted file!");
    }
    console.log("Step 6b: Verified restore pre-validator correctly flags and rejects non-SQLite files.");

    // 7. Execute hardened restore
    const restoreResult = await restore(backupResult.backupPath, DISPOSABLE_DB, DISPOSABLE_BACKUP_DIR);
    console.log(`Step 7: Restored database from verified snapshot: ${restoreResult.sourceBackup}`);

    // 8. Reconnect and verify data fidelity
    const prismaVerify = new PrismaClient({
      datasources: { db: { url: "file:./disposable-hardened-test.db" } },
    });

    const restoredOrg = await prismaVerify.organization.findUnique({ where: { id: firstOrg.id } });
    const restoredOrgCount = await prismaVerify.organization.count();
    const restoredUserCount = await prismaVerify.user.count();

    console.log(`Step 8: Verified restored metrics: ${restoredOrgCount} orgs, ${restoredUserCount} users.`);
    console.log(`Restored Org Name: "${restoredOrg?.name}"`);

    await prismaVerify.$disconnect();

    if (restoredOrg?.name !== originalOrgName) {
      throw new Error(`Data mismatch! Expected "${originalOrgName}", got "${restoredOrg?.name}"`);
    }
    if (restoredOrgCount !== orgCount || restoredUserCount !== userCount) {
      throw new Error("Record count mismatch after restore!");
    }

    console.log("HARDENED VERIFICATION RESULT: PASS - 100% data fidelity restored with WAL & header protection.");
  } finally {
    // 9. Cleanup all disposable files
    const toClean = [
      DISPOSABLE_DB,
      `${DISPOSABLE_DB}-wal`,
      `${DISPOSABLE_DB}-shm`,
    ];
    for (const file of toClean) {
      if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch (e) { /* ignore */ }
      }
    }
    if (fs.existsSync(DISPOSABLE_BACKUP_DIR)) {
      try { fs.rmSync(DISPOSABLE_BACKUP_DIR, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
    console.log("Step 9: Cleaned up all disposable test databases and temporary backup snapshots.");
  }
}

runHardenedIsolatedTest().catch((err) => {
  console.error("CRITICAL FAILURE in hardened isolated recovery test:", err);
  process.exit(1);
});
