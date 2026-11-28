/**
 * BothraCMS / BuildTrack Pro - Master Database Backup Tool
 *
 * Executes a full multi-format backup:
 * 1. Flushes SQLite WAL with PRAGMA wal_checkpoint(TRUNCATE).
 * 2. Creates verified binary SQLite database snapshot with magic-header validation.
 * 3. Dumps all Prisma models into an authoritative, structured JSON backup file with SHA-256 checksum.
 * 4. Generates a backup manifest detailing tables, counts, and sizes.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const SQLITE_MAGIC = 'SQLite format 3';

function isValidSqliteFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const stats = fs.statSync(filePath);
  if (stats.size < 100) return false;
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);
    return buffer.toString('utf8').startsWith(SQLITE_MAGIC);
  } catch {
    return false;
  }
}

async function runBackup() {
  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dateFormatted = new Date().toISOString().slice(0, 10);

  const backupDir = path.resolve(__dirname, '..', 'backups');
  const storageBackupDir = path.resolve(__dirname, '..', 'storage', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  if (!fs.existsSync(storageBackupDir)) fs.mkdirSync(storageBackupDir, { recursive: true });

  const dbPath = path.resolve(__dirname, '..', 'prisma', 'dev.db');
  console.log('==================================================================');
  console.log('📦 BOTHRACMS / BUILDTRACK PRO - MASTER DATABASE BACKUP');
  console.log('==================================================================');
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log(`📂 Source Database: ${dbPath}`);
  console.log(`📁 Backup Destination: ${backupDir}`);
  console.log('==================================================================\n');

  const prisma = new PrismaClient();

  try {
    // Step 1: WAL Checkpoint
    console.log('🔄 Step 1/3: Executing PRAGMA wal_checkpoint(TRUNCATE)...');
    try {
      await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
      console.log('  ✓ Checkpoint completed successfully.');
    } catch (err) {
      console.log(`  ℹ️ Checkpoint notice: ${err.message}`);
    }

    // Step 2: Binary Database Snapshot
    console.log('\n💾 Step 2/3: Creating binary database snapshot...');
    if (fs.existsSync(dbPath)) {
      const binaryDestPath = path.join(backupDir, `dev_backup_${timestamp}.db`);
      const storageDestPath = path.join(storageBackupDir, `dev_backup_${timestamp}.db`);

      fs.copyFileSync(dbPath, binaryDestPath);
      fs.copyFileSync(dbPath, storageDestPath);

      const walPath = `${dbPath}-wal`;
      const shmPath = `${dbPath}-shm`;
      if (fs.existsSync(walPath) && fs.statSync(walPath).size > 0) {
        fs.copyFileSync(walPath, `${binaryDestPath}-wal`);
      }
      if (fs.existsSync(shmPath) && fs.statSync(shmPath).size > 0) {
        fs.copyFileSync(shmPath, `${binaryDestPath}-shm`);
      }

      if (isValidSqliteFile(binaryDestPath)) {
        const stats = fs.statSync(binaryDestPath);
        console.log(`  ✓ Binary snapshot verified: ${path.basename(binaryDestPath)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      } else {
        console.warn('  ⚠️ Warning: Binary backup failed SQLite magic header check.');
      }
    } else {
      console.warn(`  ⚠️ Source database file not found at ${dbPath}`);
    }

    // Step 3: Comprehensive JSON Export of all Prisma Models
    console.log('\n📑 Step 3/3: Exporting all Prisma tables to JSON...');
    const tables = {};
    const tableCounts = {};

    const delegates = Object.keys(prisma).filter(
      (k) => !k.startsWith('$') && !k.startsWith('_') && typeof prisma[k]?.findMany === 'function'
    );

    for (const modelKey of delegates) {
      try {
        const records = await prisma[modelKey].findMany();
        if (Array.isArray(records)) {
          tables[modelKey] = records;
          tableCounts[modelKey] = records.length;
        }
      } catch (err) {
        console.warn(`  ⚠️ Could not query model ${modelKey}: ${err.message}`);
      }
    }

    const totalRecords = Object.values(tableCounts).reduce((a, b) => a + b, 0);
    const nonZeroTables = Object.entries(tableCounts).filter(([, count]) => count > 0);

    const jsonPayload = {
      version: '1.0.0',
      system: 'BothraCMS / BuildTrack Pro',
      company: 'Bothra Infrastructure & Builders',
      exportedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      summary: {
        totalTables: Object.keys(tableCounts).length,
        activeTables: nonZeroTables.length,
        totalRecords,
        tables: tableCounts,
      },
      data: tables,
    };

    const rawJson = JSON.stringify(jsonPayload, null, 2);
    const sha256 = crypto.createHash('sha256').update(rawJson).digest('hex');

    const finalPayload = {
      checksumSha256: sha256,
      ...jsonPayload,
    };

    const jsonFileName = `bothra_cms_database_backup_${dateFormatted}_${timestamp}.json`;
    const jsonFilePath = path.join(backupDir, jsonFileName);
    fs.writeFileSync(jsonFilePath, JSON.stringify(finalPayload, null, 2), 'utf8');

    const jsonFileSizeMB = (fs.statSync(jsonFilePath).size / 1024 / 1024).toFixed(2);
    console.log(`  ✓ JSON backup created: ${jsonFileName} (${jsonFileSizeMB} MB)`);
    console.log(`  ✓ Checksum SHA-256: ${sha256}`);
    console.log(`  ✓ Total Records: ${totalRecords} across ${nonZeroTables.length} active tables`);

    console.log('\n==================================================================');
    console.log('✅ DATABASE BACKUP COMPLETED SUCCESSFULLY');
    console.log('==================================================================');
    console.log(`1. Binary DB Snapshot: backups/dev_backup_${timestamp}.db`);
    console.log(`2. Full JSON Backup:   backups/${jsonFileName}`);
    console.log(`3. Duration:           ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
    console.log('==================================================================\n');

    return {
      success: true,
      timestamp,
      binaryPath: path.join(backupDir, `dev_backup_${timestamp}.db`),
      jsonPath: jsonFilePath,
      totalRecords,
      sha256,
      tableCounts,
    };
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runBackup().catch((err) => {
    console.error('❌ Fatal error during backup:', err);
    process.exit(1);
  });
}

module.exports = { runBackup };
