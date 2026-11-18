/**
 * Hardened Database Demo Data Purge Utility for BothraCMS / BuildTrack Pro
 *
 * Removes all demo/sample sites, stores, projects, tasks, materials, inventory,
 * parties, workforce, bills, payments, reports, and drawings.
 *
 * PRESERVES:
 * - Organization records (tenant configuration, company settings, currency, timezone)
 * - User accounts (Super Admin, Admins, login credentials and passwords)
 * - Push subscriptions
 */

const fs = require("fs");
const path = require("path");

// Load .env if present
const envFile = path.resolve(__dirname, "..", ".env");
if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

function getDbUrl() {
  return (
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    "file:./dev.db"
  );
}

// All demo tables to purge in child-to-parent order
const TABLES_TO_PURGE = [
  "PaymentAllocation",
  "Payment",
  "BillLine",
  "Bill",
  "SalesReceipt",
  "SalesInstallment",
  "SalesBooking",
  "SalesLeadActivity",
  "SalesLead",
  "SalesUnit",
  "SiteIssue",
  "QualityInspection",
  "ChecklistTemplate",
  "DrawingMarkup",
  "DrawingRevision",
  "Drawing",
  "EquipmentLog",
  "Equipment",
  "PayrollLine",
  "PayrollRun",
  "PayrollAdvance",
  "PayrollProfile",
  "MaterialRequestItem",
  "MaterialRequest",
  "MaterialQuotation",
  "PurchaseOrder",
  "MeasurementHistory",
  "MeasurementChangeRequest",
  "MeasurementAttachment",
  "MeasurementBookEntry",
  "MeasurementSubgroup",
  "MeasurementGroup",
  "StockMovement",
  "StockBalance",
  "Material",
  "MaterialCategory",
  "TaskStatusHistory",
  "TaskComment",
  "Task",
  "DailySiteReport",
  "DailyWorkReport",
  "StaffAttendance",
  "AttendanceRecord",
  "AttendanceSession",
  "WorkforceHeadcount",
  "WorkforceMember",
  "Party",
  "ProjectMilestoneUpdate",
  "ProjectMilestone",
  "ProjectBudgetLine",
  "ProjectAssignment",
  "Store",
  "Project",
  "Site",
  "FolderPermission",
  "DocumentFolder",
  "Attachment",
  "ChatMessage",
  "ConversationParticipant",
  "Conversation",
  "Notification",
  "AuditEvent",
  "WhatsAppMessage",
  "MessageLog",
  "OfflineSend"
];

async function clearDemoData(options = {}) {
  const dbUrl = options.dbUrl || getDbUrl();
  const isPostgres = dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://");

  let PrismaClient;
  try {
    PrismaClient = require("@prisma/client").PrismaClient;
  } catch (err) {
    console.warn("⚠️ @prisma/client not available:", err.message);
    return { success: false, error: err.message };
  }

  const prisma = new PrismaClient({
    datasources: isPostgres ? { db: { url: dbUrl } } : undefined,
  });

  console.log("============================================================");
  console.log("🧹 BOTHRA CMS - PURGING ALL DEMO & SAMPLE DATA");
  console.log(`🌐 Target: ${isPostgres ? "Remote PostgreSQL" : "Local SQLite"}`);
  console.log("============================================================\n");

  const summary = {};

  try {
    if (isPostgres) {
      // In PostgreSQL, execute TRUNCATE ... CASCADE on all demo tables
      console.log("⚡ Executing PostgreSQL TRUNCATE CASCADE on demo tables...");
      for (const table of TABLES_TO_PURGE) {
        try {
          await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
          summary[table] = "CLEARED";
        } catch (tblErr) {
          if (!tblErr.message.includes("does not exist")) {
            console.log(`  [Notice] ${table}: ${tblErr.message}`);
          }
        }
      }
    } else {
      // SQLite: Turn off foreign keys temporarily, delete each table, then restore foreign keys
      console.log("⚡ Executing SQLite table purge on demo tables...");
      await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF;");
      for (const table of TABLES_TO_PURGE) {
        try {
          await prisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
          summary[table] = "CLEARED";
        } catch (tblErr) {
          if (!tblErr.message.includes("no such table")) {
            console.log(`  [Notice] ${table}: ${tblErr.message}`);
          }
        }
      }
      await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON;");
    }

    // Verify preservation of Users and Organizations
    const orgCount = await prisma.organization.count().catch(() => 0);
    const userCount = await prisma.user.count().catch(() => 0);
    console.log(`\n✅ PURGE COMPLETE!`);
    console.log(`🏢 Organizations Preserved: ${orgCount}`);
    console.log(`👤 Users & Logins Preserved: ${userCount}`);
    console.log(`📁 All sample sites, projects, stores, materials, inventory, bills, payments, and workforce records removed.\n`);

    return {
      success: true,
      orgsPreserved: orgCount,
      usersPreserved: userCount,
      tablesPurged: Object.keys(summary).length,
    };
  } catch (error) {
    console.error("❌ Purge error:", error);
    return { success: false, error: error.message };
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

if (require.main === module) {
  clearDemoData()
    .then((res) => {
      if (!res.success) process.exit(1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { clearDemoData, TABLES_TO_PURGE };
