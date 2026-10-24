import { PrismaClient } from "@prisma/client";

/**
 * Idempotent schema migration for PostgreSQL environments (such as Vercel + Neon / Supabase).
 *
 * Ensures all columns and tables added across all project phases (Phases 1-11)
 * are present in the target PostgreSQL database without requiring manual CLI migration.
 */

const POSTGRES_COLUMNS: string[] = [
  // Phase 7: Workforce compliance
  `ALTER TABLE "WorkforceMember" ADD COLUMN IF NOT EXISTS "pfApplicable" BOOLEAN DEFAULT false;`,
  `ALTER TABLE "WorkforceMember" ADD COLUMN IF NOT EXISTS "esiApplicable" BOOLEAN DEFAULT false;`,
  `ALTER TABLE "WorkforceMember" ADD COLUMN IF NOT EXISTS "uan" TEXT;`,
  `ALTER TABLE "WorkforceMember" ADD COLUMN IF NOT EXISTS "esicNumber" TEXT;`,
  `ALTER TABLE "WorkforceMember" ADD COLUMN IF NOT EXISTS "bankAccount" TEXT;`,
  `ALTER TABLE "WorkforceMember" ADD COLUMN IF NOT EXISTS "ifsc" TEXT;`,

  // Phase 8: Bills reverse charge & tax line items
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "reverseCharge" BOOLEAN DEFAULT false;`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "statutory" TEXT;`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "costHead" TEXT;`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN DEFAULT false;`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "gstRate" DOUBLE PRECISION;`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "taxableAmount" DOUBLE PRECISION;`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "cgst" DOUBLE PRECISION DEFAULT 0;`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "sgst" DOUBLE PRECISION DEFAULT 0;`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "igst" DOUBLE PRECISION DEFAULT 0;`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "itcEligible" BOOLEAN DEFAULT true;`,
  `ALTER TABLE "BillLine" ADD COLUMN IF NOT EXISTS "gstRate" DOUBLE PRECISION;`,
  `ALTER TABLE "BillLine" ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION DEFAULT 0;`,

  // Phase 10: Payments TDS (194C)
  `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "tdsSection" TEXT;`,
  `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "tdsRate" DOUBLE PRECISION DEFAULT 0;`,
  `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "tdsBase" DOUBLE PRECISION DEFAULT 0;`,
  `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "tdsAmount" DOUBLE PRECISION DEFAULT 0;`,
  `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "tdsCatchUp" DOUBLE PRECISION DEFAULT 0;`,
  `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "tdsNote" TEXT;`,

  // Phase 11: Party TDS, Bank Details & Notification WhatsApp
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "tdsSection" TEXT;`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "contactPerson" TEXT;`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "whatsappNumber" TEXT;`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "city" TEXT;`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "category" TEXT;`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "rating" INTEGER;`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "panNumber" TEXT;`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "bankAccountName" TEXT;`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "bankAccountNumber" TEXT;`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "bankIfsc" TEXT;`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "bankName" TEXT;`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "bankBranch" TEXT;`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "upiId" TEXT;`,
  `ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "whatsappAt" TIMESTAMP(3);`,

  // Payroll Profiles & Lines
  `ALTER TABLE "PayrollProfile" ADD COLUMN IF NOT EXISTS "taxRegime" TEXT DEFAULT 'NEW';`,
  `ALTER TABLE "PayrollProfile" ADD COLUMN IF NOT EXISTS "taxDeclared" INTEGER DEFAULT 0;`,
  `ALTER TABLE "PayrollProfile" ADD COLUMN IF NOT EXISTS "pan" TEXT;`,
  `ALTER TABLE "PayrollProfile" ADD COLUMN IF NOT EXISTS "uan" TEXT;`,
  `ALTER TABLE "PayrollProfile" ADD COLUMN IF NOT EXISTS "esicNumber" TEXT;`,
  `ALTER TABLE "PayrollProfile" ADD COLUMN IF NOT EXISTS "bankAccount" TEXT;`,
  `ALTER TABLE "PayrollProfile" ADD COLUMN IF NOT EXISTS "ifsc" TEXT;`,
  `ALTER TABLE "PayrollProfile" ADD COLUMN IF NOT EXISTS "pfApplicable" BOOLEAN DEFAULT false;`,
  `ALTER TABLE "PayrollProfile" ADD COLUMN IF NOT EXISTS "esiApplicable" BOOLEAN DEFAULT false;`,
  `ALTER TABLE "PayrollLine" ADD COLUMN IF NOT EXISTS "tdsManual" BOOLEAN DEFAULT false;`,
  `ALTER TABLE "PayrollLine" ADD COLUMN IF NOT EXISTS "tds" INTEGER DEFAULT 0;`,
  // Phase 13: staff check-in location and selfie, Razorpay fees
  `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "geofenceM" INTEGER;`,
  `ALTER TABLE "StaffAttendance" ADD COLUMN IF NOT EXISTS "checkInSiteId" TEXT;`,
  `ALTER TABLE "StaffAttendance" ADD COLUMN IF NOT EXISTS "checkInDistanceM" INTEGER;`,
  `ALTER TABLE "StaffAttendance" ADD COLUMN IF NOT EXISTS "checkInFlag" TEXT;`,
  `ALTER TABLE "StaffAttendance" ADD COLUMN IF NOT EXISTS "checkInSelfie" TEXT;`,
  `ALTER TABLE "OnlinePayment" ADD COLUMN IF NOT EXISTS "fee" INTEGER;`,
  `ALTER TABLE "OnlinePayment" ADD COLUMN IF NOT EXISTS "feeTax" INTEGER;`,
  `ALTER TABLE "OnlinePayment" ADD COLUMN IF NOT EXISTS "feeBookedIn" TEXT;`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "whatsappGroupLink" TEXT;`,
];

const POSTGRES_TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS "DailyWorkReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportDate" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "hoursWorked" DOUBLE PRECISION,
    "projectId" TEXT,
    "blockers" TEXT,
    "tomorrowPlan" TEXT,
    "photoUrls" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "StaffAttendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workDate" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL,
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkInNote" TEXT,
    "checkOutAt" TIMESTAMP(3),
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "ProjectBudgetLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costHead" TEXT NOT NULL,
    "budgetAmount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "ProjectMilestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "ProjectMilestoneUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "milestoneId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "progressFrom" INTEGER NOT NULL,
    "progressTo" INTEGER NOT NULL,
    "statusTo" TEXT,
    "note" TEXT,
    "photoUrls" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "MaterialRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "neededBy" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "MaterialRequestItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "materialId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCode" TEXT NOT NULL,
    "approvedQty" DOUBLE PRECISION,
    "purchaseOrderId" TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS "PayrollProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthlySalary" INTEGER NOT NULL,
    "bankAccount" TEXT,
    "ifsc" TEXT,
    "pfApplicable" BOOLEAN NOT NULL DEFAULT false,
    "esiApplicable" BOOLEAN NOT NULL DEFAULT false,
    "uan" TEXT,
    "esicNumber" TEXT,
    "taxRegime" TEXT NOT NULL DEFAULT 'NEW',
    "taxDeclared" INTEGER NOT NULL DEFAULT 0,
    "pan" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "PayrollAdvance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "personType" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "givenOn" TEXT NOT NULL,
    "note" TEXT,
    "recoveredRunId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "PayrollRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalGross" INTEGER NOT NULL DEFAULT 0,
    "totalDeductions" INTEGER NOT NULL DEFAULT 0,
    "totalNet" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "PayrollLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "personType" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "roleLabel" TEXT,
    "projectId" TEXT,
    "daysPresent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "halfDays" INTEGER NOT NULL DEFAULT 0,
    "leaveDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payableDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rate" INTEGER NOT NULL,
    "basePay" INTEGER NOT NULL DEFAULT 0,
    "overtimePay" INTEGER NOT NULL DEFAULT 0,
    "bonus" INTEGER NOT NULL DEFAULT 0,
    "advanceDeduction" INTEGER NOT NULL DEFAULT 0,
    "otherDeduction" INTEGER NOT NULL DEFAULT 0,
    "pfEmployee" INTEGER NOT NULL DEFAULT 0,
    "esiEmployee" INTEGER NOT NULL DEFAULT 0,
    "professionalTax" INTEGER NOT NULL DEFAULT 0,
    "tds" INTEGER NOT NULL DEFAULT 0,
    "tdsManual" BOOLEAN NOT NULL DEFAULT false,
    "pfEmployer" INTEGER NOT NULL DEFAULT 0,
    "esiEmployer" INTEGER NOT NULL DEFAULT 0,
    "gross" INTEGER NOT NULL DEFAULT 0,
    "net" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "paymentId" TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS "Drawing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discipline" TEXT NOT NULL DEFAULT 'ARCHITECTURAL',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "DrawingRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "drawingId" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FOR_APPROVAL',
    "fileUrl" TEXT,
    "fileName" TEXT,
    "notes" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "QualityInspection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "template" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "itemsJson" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "photoUrls" TEXT,
    "inspectedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "SiteIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "issueNumber" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "photoUrls" TEXT,
    "inspectionId" TEXT,
    "injuredCount" INTEGER NOT NULL DEFAULT 0,
    "assignedTo" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolutionPhotoUrls" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "reportedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "Equipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'EARTHMOVING',
    "ownership" TEXT NOT NULL DEFAULT 'OWNED',
    "vendorPartyId" TEXT,
    "hireRate" INTEGER,
    "hireRateUnit" TEXT,
    "currentProjectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "nextServiceDue" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "EquipmentLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "equipmentId" TEXT NOT NULL,
    "projectId" TEXT,
    "logDate" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'USAGE',
    "hours" DOUBLE PRECISION,
    "fuelLitres" DOUBLE PRECISION,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "operator" TEXT,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "SalesUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "unitType" TEXT NOT NULL,
    "floor" TEXT,
    "areaSqft" DOUBLE PRECISION,
    "price" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "SalesLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "source" TEXT NOT NULL DEFAULT 'WALK_IN',
    "interest" TEXT,
    "budget" INTEGER,
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "nextFollowUp" TEXT,
    "lostReason" TEXT,
    "assignedTo" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "SalesLeadActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "SalesBooking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "leadId" TEXT,
    "bookingNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "bookingDate" TEXT NOT NULL,
    "agreementValue" INTEGER NOT NULL,
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "portalToken" TEXT UNIQUE,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "SalesInstallment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "percent" DOUBLE PRECISION,
    "amount" INTEGER NOT NULL,
    "gstAmount" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TEXT,
    "milestoneId" TEXT,
    "demandRaisedAt" TIMESTAMP(3),
    "demandAuto" BOOLEAN NOT NULL DEFAULT false,
    "receivedAmount" INTEGER NOT NULL DEFAULT 0,
    "lastReceivedAt" TIMESTAMP(3),
    "receipts" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "SalesReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "taxableAmount" INTEGER NOT NULL,
    "gstAmount" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "reference" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "MessageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "providerRef" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "BuyerSignInCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS "OfflineSend" (
    "ref" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  // Phase 12: payments buyers start from their page
  `CREATE TABLE IF NOT EXISTS "OnlinePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "referenceId" TEXT NOT NULL,
    "linkId" TEXT,
    "shortUrl" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "paymentId" TEXT,
    "method" TEXT,
    "fee" INTEGER,
    "feeTax" INTEGER,
    "feeBookedIn" TEXT,
    "receiptIds" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "OnlinePayment_referenceId_key" ON "OnlinePayment"("referenceId");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "OnlinePayment_linkId_key" ON "OnlinePayment"("linkId");`,
  `CREATE INDEX IF NOT EXISTS "OnlinePayment_organizationId_createdAt_idx" ON "OnlinePayment"("organizationId", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "OnlinePayment_installmentId_status_idx" ON "OnlinePayment"("installmentId", "status");`,

  // Phase 13: phones that turned on push alerts
  `CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");`,
  `CREATE INDEX IF NOT EXISTS "PushSubscription_organizationId_userId_idx" ON "PushSubscription"("organizationId", "userId");`,

  // Phase 14: WhatsApp chats with vendors, buyers and staff
  `CREATE TABLE IF NOT EXISTS "WhatsAppMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TEXT',
    "text" TEXT NOT NULL,
    "fileId" TEXT,
    "mimeType" TEXT,
    "fileName" TEXT,
    "providerRef" TEXT,
    "replyToRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "partyId" TEXT,
    "bookingId" TEXT,
    "staffUserId" TEXT,
    "purchaseOrderId" TEXT,
    "sentById" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppMessage_providerRef_key" ON "WhatsAppMessage"("providerRef");`,
  `CREATE INDEX IF NOT EXISTS "WhatsAppMessage_organizationId_waId_createdAt_idx" ON "WhatsAppMessage"("organizationId", "waId", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "WhatsAppMessage_organizationId_direction_readAt_idx" ON "WhatsAppMessage"("organizationId", "direction", "readAt");`,

  // Phase 14: marks on drawing sheets
  `CREATE TABLE IF NOT EXISTS "DrawingMarkup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "page" INTEGER NOT NULL DEFAULT 1,
    "shapesJson" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DrawingMarkup_revisionId_page_createdBy_key" ON "DrawingMarkup"("revisionId", "page", "createdBy");`,
  `CREATE INDEX IF NOT EXISTS "DrawingMarkup_organizationId_revisionId_idx" ON "DrawingMarkup"("organizationId", "revisionId");`,

  // Phase 14: the organization's own quality and safety checklists
  `CREATE TABLE IF NOT EXISTS "ChecklistTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'QUALITY',
    "itemsJson" TEXT NOT NULL,
    "replacesKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "ChecklistTemplate_organizationId_isActive_idx" ON "ChecklistTemplate"("organizationId", "isActive");`,
];

export async function autoMigrateDatabase(prisma: PrismaClient): Promise<{
  success: boolean;
  isPostgres: boolean;
  appliedColumns: number;
  appliedTables: number;
  error?: string;
}> {
  try {
    // Detect whether active datasource is PostgreSQL without throwing on SQLite
    const dbUrl =
      process.env.DATABASE_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      "";

    const isPostgres =
      dbUrl.startsWith("postgres://") ||
      dbUrl.startsWith("postgresql://") ||
      process.env.POSTGRES_URL !== undefined;

    if (!isPostgres) {
      return { success: true, isPostgres: false, appliedColumns: 0, appliedTables: 0 };
    }

    console.log("⚡ [AUTO_MIGRATE] Ensuring PostgreSQL schema tables and columns are up to date...");

    // 1. Ensure all tables exist
    let appliedTables = 0;
    for (const sql of POSTGRES_TABLES) {
      try {
        await prisma.$executeRawUnsafe(sql);
        appliedTables++;
      } catch (err: any) {
        console.warn(`[AUTO_MIGRATE] Table execution notice: ${err.message?.slice(0, 80)}`);
      }
    }

    // 2. Ensure all columns exist on modified existing tables
    let appliedColumns = 0;
    for (const sql of POSTGRES_COLUMNS) {
      try {
        await prisma.$executeRawUnsafe(sql);
        appliedColumns++;
      } catch (err: any) {
        console.warn(`[AUTO_MIGRATE] Column execution notice: ${err.message?.slice(0, 80)}`);
      }
    }

    console.log(`✅ [AUTO_MIGRATE] PostgreSQL schema verified (${appliedTables} tables, ${appliedColumns} columns checked).`);
    return { success: true, isPostgres: true, appliedColumns, appliedTables };
  } catch (error: any) {
    console.error("[AUTO_MIGRATE] Critical auto-migration error:", error);
    return {
      success: false,
      isPostgres: false,
      appliedColumns: 0,
      appliedTables: 0,
      error: error?.message || "Unknown migration error",
    };
  }
}
