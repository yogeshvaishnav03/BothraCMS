/**
 * BothraCMS / BuildTrack Pro - Automated Database Restore Tool
 *
 * Restores the complete database from the authoritative backup JSON:
 * `backups/bothra_cms_direct_prisma_backup_2026-11-28T05-54-34.json`
 *
 * Supports PostgreSQL (Neon, Supabase, AWS RDS, local PG) and SQLite.
 *
 * Usage:
 *   node scripts/restore-from-backup.js
 * Or with a custom connection string:
 *   TARGET_DATABASE_URL="postgresql://user:pass@host/dbname?sslmode=require" node scripts/restore-from-backup.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

// 1. Resolve backup file
const BACKUP_FILE = path.resolve(
  __dirname,
  '..',
  'backups',
  'bothra_cms_direct_prisma_backup_2026-11-28T05-54-34.json'
);

if (!fs.existsSync(BACKUP_FILE)) {
  console.error(`❌ Backup file not found at: ${BACKUP_FILE}`);
  process.exit(1);
}

// 2. Resolve target database URL
function resolveTargetUrl() {
  if (process.env.TARGET_DATABASE_URL) return process.env.TARGET_DATABASE_URL.trim();
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL.trim();
  if (process.env.POSTGRES_PRISMA_URL) return process.env.POSTGRES_PRISMA_URL.trim();

  // Try loading from .env
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('DATABASE_URL=') || trimmed.startsWith('POSTGRES_URL=')) {
        let val = trimmed.slice(trimmed.indexOf('=') + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (val) return val;
      }
    }
  }

  return process.env.DATABASE_URL || 'file:./prisma/dev.db';
}

// Ordered table list to respect foreign key constraints
const TABLES_ORDER = [
  'organization',
  'user',
  'site',
  'project',
  'projectAssignment',
  'party',
  'store',
  'materialCategory',
  'material',
  'stockBalance',
  'stockMovement',
  'materialQuotation',
  'purchaseOrder',
  'bill',
  'billLine',
  'payment',
  'paymentAllocation',
  'liquidatedDamage',
  'task',
  'taskComment',
  'taskStatusHistory',
  'workforceMember',
  'workforceHeadcount',
  'attendanceSession',
  'dailySiteReport',
  'dailyWorkReport',
  'staffAttendance',
  'drawing',
  'drawingRevision',
  'drawingMarkup',
  'measurementGroup',
  'measurementSubgroup',
  'measurementBookEntry',
  'measurementAttachment',
  'measurementChangeRequest',
  'measurementHistory',
  'materialRequest',
  'materialRequestItem',
  'payrollProfile',
  'payrollAdvance',
  'payrollRun',
  'payrollLine',
  'checklistTemplate',
  'qualityInspection',
  'siteIssue',
  'equipment',
  'equipmentLog',
  'salesUnit',
  'salesLead',
  'salesLeadActivity',
  'salesBooking',
  'salesInstallment',
  'salesReceipt',
  'conversation',
  'conversationParticipant',
  'chatMessage',
  'documentFolder',
  'folderPermission',
  'attachment',
  'notification',
  'auditEvent',
  'rateLimitRecord',
  'idempotencyRecord',
  'offlineSend',
  'whatsAppMessage',
  'messageLog',
  'buyerSignInCode',
  'onlinePayment',
  'pushSubscription',
];

async function main() {
  const targetUrl = resolveTargetUrl();
  const isPostgres = targetUrl.startsWith('postgresql://') || targetUrl.startsWith('postgres://');
  const maskedUrl = targetUrl.replace(/:[^:@]*@/, ':****@');

  console.log('==================================================================');
  console.log('📦 BOTHRACMS / BUILDTRACK PRO - DATABASE RESTORATION UTILITY');
  console.log('==================================================================');
  console.log(`📁 Source Backup: ${path.basename(BACKUP_FILE)}`);
  console.log(`🎯 Target Database: ${maskedUrl}`);
  console.log(`🔌 Database Engine: ${isPostgres ? 'PostgreSQL (Cloud / Server)' : 'SQLite'}`);
  console.log('==================================================================\n');

  // Read backup payload
  console.log('📖 Reading backup file...');
  const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
  const backupData = backup.data || {};
  console.log(`✅ Backup loaded: ${backup.summary.totalRecords} records across ${backup.summary.totalTables} tables.\n`);

  // Initialize Prisma Client
  const prisma = new PrismaClient({
    datasources: { db: { url: targetUrl } },
  });

  try {
    // 1. Test connection
    console.log('🔍 Testing database connection...');
    await prisma.$queryRawUnsafe('SELECT 1 as result;');
    console.log('✅ Connection established successfully.\n');

    // 2. Disable foreign key constraints if Postgres
    if (isPostgres) {
      console.log('⚙️ Disabling session replication checks (PostgreSQL)...');
      try {
        await prisma.$executeRawUnsafe("SET session_replication_role = 'replica';");
      } catch (err) {
        console.warn('⚠️ Could not set session_replication_role:', err.message);
      }
    } else {
      console.log('⚙️ Disabling foreign key constraints (SQLite)...');
      try {
        await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF;');
      } catch (err) {
        console.warn('⚠️ Could not disable SQLite foreign keys:', err.message);
      }
    }

    // 3. Insert records in order
    console.log('\n🚀 Starting table restoration...');
    let totalRestored = 0;
    const restoredSummary = {};

    for (const modelKey of TABLES_ORDER) {
      const records = backupData[modelKey];
      if (!records || !Array.isArray(records) || records.length === 0) {
        continue;
      }

      const delegate = prisma[modelKey];
      if (!delegate || typeof delegate.upsert !== 'function') {
        console.warn(`  ⚠️ No Prisma delegate found for table: ${modelKey} (skipping ${records.length} records)`);
        continue;
      }

      let tableSuccess = 0;
      for (const rawRecord of records) {
        // Prepare record data: convert ISO strings back to Date objects where needed
        const record = { ...rawRecord };
        for (const [key, val] of Object.entries(record)) {
          if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
            record[key] = new Date(val);
          }
        }

        try {
          if (record.id) {
            await delegate.upsert({
              where: { id: record.id },
              create: record,
              update: record,
            });
          } else {
            // Models with composite keys or no id
            await delegate.create({ data: record });
          }
          tableSuccess++;
        } catch (recordErr) {
          // Attempt create if upsert failed due to unique key variations
          try {
            await delegate.create({ data: record });
            tableSuccess++;
          } catch (createErr) {
            console.warn(`    ⚠️ Failed to insert ${modelKey} record (${record.id || 'no-id'}):`, createErr.message);
          }
        }
      }

      totalRestored += tableSuccess;
      restoredSummary[modelKey] = tableSuccess;
      console.log(`  ✓ Restored ${tableSuccess}/${records.length} records into [${modelKey}]`);
    }

    // 4. Re-enable foreign key constraints
    if (isPostgres) {
      console.log('\n⚙️ Re-enabling session replication checks (PostgreSQL)...');
      try {
        await prisma.$executeRawUnsafe("SET session_replication_role = 'DEFAULT';");
      } catch (err) {
        console.warn('⚠️ Could not reset session_replication_role:', err.message);
      }
    } else {
      console.log('\n⚙️ Re-enabling foreign key constraints (SQLite)...');
      try {
        await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
      } catch (err) {
        console.warn('⚠️ Could not re-enable SQLite foreign keys:', err.message);
      }
    }

    console.log('\n==================================================================');
    console.log(`🎉 DATABASE RESTORATION COMPLETE!`);
    console.log(`📊 Total Records Restored: ${totalRestored}`);
    console.log(`📋 Total Tables Populated: ${Object.keys(restoredSummary).length}`);
    console.log('==================================================================\n');

  } catch (fatalError) {
    console.error('\n❌ Fatal error during database restoration:', fatalError.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
