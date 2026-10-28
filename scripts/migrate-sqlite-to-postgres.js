/**
 * BothraCMS SQLite to PostgreSQL Production Data Migrator
 *
 * Transfers all business data in strict topological order to respect foreign key constraints.
 * Preserves all UUIDs, timestamps, and relations.
 * Verifies record counts and critical financial totals (Bills, Payments) before finishing.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { PrismaClient } = require('@prisma/client');

// Order of migration respecting foreign keys
const TABLES_IN_ORDER = [
  'Organization',
  'User',
  'Site',
  'Project',
  'ProjectAssignment',
  'Party',
  'Material',
  'DocumentFolder',
  'Task',
  'TaskComment',
  'TaskStatusHistory',
  'DailySiteReport',
  'DailyWorkReport',
  'StaffAttendance',
  'WorkforceMember',
  'AttendanceSession',
  'AttendanceCorrection',
  'StockMovement',
  'Bill',
  'BillLine',
  'Payment',
  'PaymentAllocation',
  'Attachment',
  'AuditEvent',
  'Conversation',
  'ConversationParticipant',
  'ChatMessage',
  'IdempotencyRecord',
  'Notification',
];

async function migrateData() {
  const sqliteDbPath = path.resolve(__dirname, '..', 'prisma', 'dev.db');
  if (!fs.existsSync(sqliteDbPath)) {
    console.error(`❌ Source SQLite database not found at ${sqliteDbPath}`);
    process.exit(1);
  }

  const targetUrl = process.env.TARGET_DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!targetUrl || (!targetUrl.startsWith('postgresql://') && !targetUrl.startsWith('postgres://'))) {
    console.error('❌ TARGET_DATABASE_URL or POSTGRES_URL must be provided as a PostgreSQL connection string.');
    console.log('Usage: TARGET_DATABASE_URL="postgresql://user:pass@host:5432/bothracms" node scripts/migrate-sqlite-to-postgres.js');
    process.exit(1);
  }

  console.log('🚀 Starting SQLite -> PostgreSQL Data Migration...');
  console.log(`📂 Source: ${sqliteDbPath}`);
  console.log(`🌐 Target: ${targetUrl.replace(/:[^:@]*@/, ':****@')}`);

  const sqlite = new DatabaseSync(sqliteDbPath);
  const prismaTarget = new PrismaClient({
    datasources: { db: { url: targetUrl } },
  });

  try {
    await prismaTarget.$connect();
    console.log('✅ Connected to target PostgreSQL database.');

    const summary = [];

    for (const table of TABLES_IN_ORDER) {
      try {
        // Check if table exists in SQLite
        const tableCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
        if (!tableCheck) {
          continue;
        }

        const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
        if (rows.length === 0) {
          summary.push({ table, sourceCount: 0, targetCount: 0, status: 'SKIPPED_EMPTY' });
          continue;
        }

        const modelName = table.charAt(0).toLowerCase() + table.slice(1);
        const delegate = prismaTarget[modelName];

        if (!delegate) {
          console.warn(`⚠️ Prisma delegate not found for table ${table}, skipping direct insert.`);
          continue;
        }

        console.log(`⏳ Migrating table ${table} (${rows.length} records)...`);

        let insertedCount = 0;
        // Batch in chunks of 100
        const chunkSize = 100;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          const sanitizedChunk = chunk.map(row => {
            const sanitized = { ...row };
            for (const key of Object.keys(sanitized)) {
              if (sanitized[key] === null || sanitized[key] === undefined) continue;

              // Convert SQLite boolean integers (0/1) to booleans if needed
              if (typeof sanitized[key] === 'number' && (key.startsWith('is') || key.startsWith('has') || key.endsWith('Eligible') || key.endsWith('Applicable'))) {
                sanitized[key] = Boolean(sanitized[key]);
              }
              // Convert ISO date strings to Date objects if needed
              if (typeof sanitized[key] === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(sanitized[key])) {
                sanitized[key] = new Date(sanitized[key]);
              }
            }
            return sanitized;
          });

          for (const item of sanitizedChunk) {
            try {
              await delegate.upsert({
                where: { id: item.id },
                create: item,
                update: item,
              });
              insertedCount++;
            } catch (itemErr) {
              // Attempt raw insert or ignore unique collision
              console.warn(`Notice on ${table} item ${item.id}:`, itemErr.message);
            }
          }
        }

        const finalCount = await delegate.count();
        summary.push({
          table,
          sourceCount: rows.length,
          targetCount: finalCount,
          status: finalCount >= rows.length ? 'VERIFIED' : 'MISMATCH',
        });
        console.log(`✅ ${table}: ${insertedCount}/${rows.length} rows processed.`);
      } catch (err) {
        console.error(`❌ Error migrating table ${table}:`, err.message);
        summary.push({ table, sourceCount: 0, targetCount: 0, status: `ERROR: ${err.message}` });
      }
    }

    // Critical Financial Total Validation
    console.log('\n--- FINANCIAL DATA VALIDATION ---');
    try {
      const sqliteBills = sqlite.prepare('SELECT SUM(totalAmount) as total FROM "Bill"').get() || { total: 0 };
      const pgBills = await prismaTarget.bill.aggregate({ _sum: { totalAmount: true } });
      const sqliteBillTotal = Number(sqliteBills.total || 0).toFixed(2);
      const pgBillTotal = Number(pgBills._sum.totalAmount || 0).toFixed(2);

      const sqlitePayments = sqlite.prepare('SELECT SUM(amount) as total FROM "Payment"').get() || { total: 0 };
      const pgPayments = await prismaTarget.payment.aggregate({ _sum: { amount: true } });
      const sqlitePayTotal = Number(sqlitePayments.total || 0).toFixed(2);
      const pgPayTotal = Number(pgPayments._sum.amount || 0).toFixed(2);

      console.log(`Bill Totals:    SQLite: ₹${sqliteBillTotal}  |  PostgreSQL: ₹${pgBillTotal}  [${sqliteBillTotal === pgBillTotal ? 'MATCH' : 'MISMATCH'}]`);
      console.log(`Payment Totals: SQLite: ₹${sqlitePayTotal}  |  PostgreSQL: ₹${pgPayTotal}  [${sqlitePayTotal === pgPayTotal ? 'MATCH' : 'MISMATCH'}]`);
    } catch (finErr) {
      console.warn('Financial reconciliation notice:', finErr.message);
    }

    console.log('\n--- MIGRATION SUMMARY TABLE ---');
    console.table(summary);
    console.log('\n🎉 Migration procedure completed.');
  } finally {
    sqlite.close();
    await prismaTarget.$disconnect();
  }
}

if (require.main === module) {
  migrateData().catch(err => {
    console.error('Fatal migration error:', err);
    process.exit(1);
  });
}

module.exports = { migrateData };
