/**
 * Hardened SQLite Automated Backup Utility for Build Track Pro
 *
 * Capabilities:
 * - Checks SQLite WAL consistency & executes PRAGMA wal_checkpoint(TRUNCATE) if possible
 * - Copies WAL and SHM files alongside main database snapshot if active
 * - Validates SQLite 16-byte magic header ("SQLite format 3\0") on backup file
 * - Emits structured status, file sizes, and timestamps
 */
const fs = require("fs");
const path = require("path");

const SQLITE_MAGIC_HEADER = "SQLite format 3";

function isValidSqliteFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const stats = fs.statSync(filePath);
  if (stats.size < 100) return false;
  try {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);
    return buffer.toString("utf8").startsWith(SQLITE_MAGIC_HEADER);
  } catch (e) {
    return false;
  }
}

async function performWalCheckpoint(dbPath) {
  try {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${dbPath}`,
        },
      },
    });
    await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);");
    await prisma.$disconnect();
    console.log("[CHECKPOINT] Successfully executed PRAGMA wal_checkpoint(TRUNCATE).");
    return true;
  } catch (err) {
    console.log("[CHECKPOINT NOTICE] Offline checkpoint skipped or Prisma unavailable:", err.message);
    return false;
  }
}

async function backup(customDbPath, customBackupDir) {
  const dbPath = customDbPath ? path.resolve(customDbPath) : path.resolve(process.cwd(), "prisma", "dev.db");
  const backupDir = customBackupDir ? path.resolve(customBackupDir) : path.resolve(process.cwd(), "storage", "backups");

  if (!fs.existsSync(dbPath)) {
    console.error(`[BACKUP ERROR] Source database not found at ${dbPath}`);
    process.exit(1);
  }

  if (!isValidSqliteFile(dbPath)) {
    console.error(`[BACKUP ERROR] Source file at ${dbPath} is not a valid SQLite database!`);
    process.exit(1);
  }

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // 1. Attempt WAL checkpoint to flush uncommitted frames
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  if (fs.existsSync(walPath) && fs.statSync(walPath).size > 0) {
    console.log(`[WAL DETECTED] WAL file present (${fs.statSync(walPath).size} bytes). Attempting checkpoint...`);
    await performWalCheckpoint(dbPath);
  }

  // 2. Snapshot database file
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destPath = path.join(backupDir, `dev_backup_${timestamp}.db`);

  fs.copyFileSync(dbPath, destPath);

  // 3. If WAL file still has content, copy it alongside backup
  let copiedWal = false;
  if (fs.existsSync(walPath) && fs.statSync(walPath).size > 0) {
    fs.copyFileSync(walPath, `${destPath}-wal`);
    if (fs.existsSync(shmPath)) {
      fs.copyFileSync(shmPath, `${destPath}-shm`);
    }
    copiedWal = true;
  }

  // 4. Validate backup integrity
  if (!isValidSqliteFile(destPath)) {
    console.error("[BACKUP ERROR] Created backup file failed SQLite header integrity check!");
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    process.exit(1);
  }

  const stats = fs.statSync(destPath);
  console.log(`[BACKUP SUCCESS] Verified backup created at: ${destPath}`);
  console.log(`[BACKUP METRICS] Database size: ${(stats.size / 1024).toFixed(2)} KB | WAL captured: ${copiedWal}`);

  return {
    backupPath: destPath,
    sizeBytes: stats.size,
    timestamp,
    hasWal: copiedWal,
  };
}

if (require.main === module) {
  const argDb = process.argv[2];
  const argDir = process.argv[3];
  backup(argDb, argDir).catch((e) => {
    console.error("[FATAL BACKUP ERROR]", e);
    process.exit(1);
  });
}

module.exports = { backup, isValidSqliteFile, performWalCheckpoint };
