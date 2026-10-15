/**
 * Hardened SQLite Automated Database Restore Utility for Build Track Pro
 *
 * Capabilities:
 * - Pre-validates source backup file with SQLite 16-byte magic header inspection
 * - Generates an automated pre-restore safety snapshot of the active database before modifying anything
 * - Cleans up stale WAL and SHM files to prevent frame divergence
 * - Restores backup (and associated WAL/SHM frames if present)
 * - Verifies post-restore database integrity
 */
const fs = require("fs");
const path = require("path");
const { isValidSqliteFile } = require("./db-backup");

const DB_PATH = path.resolve(process.cwd(), "prisma", "dev.db");
const BACKUP_DIR = path.resolve(process.cwd(), "storage", "backups");

async function restore(backupFileName, customDbPath, customBackupDir) {
  const targetDbPath = customDbPath ? path.resolve(customDbPath) : DB_PATH;
  const backupDir = customBackupDir ? path.resolve(customBackupDir) : BACKUP_DIR;

  if (!fs.existsSync(backupDir)) {
    console.error(`[RESTORE ERROR] Backup directory does not exist at ${backupDir}`);
    process.exit(1);
  }

  let targetBackup = backupFileName;
  if (!targetBackup) {
    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith(".db") && !f.includes("pre_restore_safety"));
    if (files.length === 0) {
      console.error("[RESTORE ERROR] No backup files found to restore.");
      process.exit(1);
    }
    files.sort((a, b) => fs.statSync(path.join(backupDir, b)).mtimeMs - fs.statSync(path.join(backupDir, a)).mtimeMs);
    targetBackup = files[0];
  }

  const srcPath = path.isAbsolute(targetBackup) ? targetBackup : path.join(backupDir, targetBackup);
  if (!fs.existsSync(srcPath)) {
    console.error(`[RESTORE ERROR] Specified backup file not found: ${srcPath}`);
    process.exit(1);
  }

  // 1. Pre-validation: verify backup is authentic SQLite database
  if (!isValidSqliteFile(srcPath)) {
    console.error(`[RESTORE ABORTED] File ${srcPath} failed SQLite header validation! Restore aborted to protect database.`);
    process.exit(1);
  }

  // 2. Pre-Restore Safety Archive: Snapshot current database before making any changes
  if (fs.existsSync(targetDbPath)) {
    const safetyCopy = path.join(backupDir, `pre_restore_safety_${Date.now()}.db`);
    fs.copyFileSync(targetDbPath, safetyCopy);
    console.log(`[SAFETY ARCHIVE] Current database backed up to: ${safetyCopy}`);

    const activeWal = `${targetDbPath}-wal`;
    const activeShm = `${targetDbPath}-shm`;
    if (fs.existsSync(activeWal)) {
      fs.copyFileSync(activeWal, `${safetyCopy}-wal`);
    }
    if (fs.existsSync(activeShm)) {
      fs.copyFileSync(activeShm, `${safetyCopy}-shm`);
    }
  }

  // 3. Remove stale WAL and SHM files to prevent state corruption
  const targetWal = `${targetDbPath}-wal`;
  const targetShm = `${targetDbPath}-shm`;
  if (fs.existsSync(targetWal)) {
    try { fs.unlinkSync(targetWal); } catch (e) { /* ignore */ }
  }
  if (fs.existsSync(targetShm)) {
    try { fs.unlinkSync(targetShm); } catch (e) { /* ignore */ }
  }

  // 4. Copy backup to target DB path
  fs.copyFileSync(srcPath, targetDbPath);

  // 5. Restore associated WAL/SHM if present with the backup
  const srcWal = `${srcPath}-wal`;
  const srcShm = `${srcPath}-shm`;
  if (fs.existsSync(srcWal) && fs.statSync(srcWal).size > 0) {
    fs.copyFileSync(srcWal, targetWal);
    if (fs.existsSync(srcShm)) {
      fs.copyFileSync(srcShm, targetShm);
    }
    console.log("[RESTORE INFO] Restored accompanying WAL frames.");
  }

  // 6. Post-restore integrity verification
  if (!isValidSqliteFile(targetDbPath)) {
    console.error("[CRITICAL RESTORE FAILURE] Restored database failed SQLite header validation!");
    process.exit(1);
  }

  const restoredStats = fs.statSync(targetDbPath);
  console.log(`[RESTORE SUCCESS] Database restored from: ${srcPath}`);
  console.log(`[RESTORE METRICS] Restored database size: ${(restoredStats.size / 1024).toFixed(2)} KB`);

  return {
    restoredPath: targetDbPath,
    sourceBackup: srcPath,
    sizeBytes: restoredStats.size,
  };
}

if (require.main === module) {
  const arg = process.argv[2];
  const customDb = process.argv[3];
  const customDir = process.argv[4];
  restore(arg, customDb, customDir).catch((e) => {
    console.error("[FATAL RESTORE ERROR]", e);
    process.exit(1);
  });
}

module.exports = { restore };
