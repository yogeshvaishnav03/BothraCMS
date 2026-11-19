/**
 * Standalone direct PostgreSQL DDL synchronizer.
 * Can be called during build or bootstrap to guarantee all Phase 5-11 tables and columns exist.
 */
// Prisma client is loaded lazily inside applyMigration after validating DIRECT_URL and staging isolation

const POSTGRES_COLUMNS = [
  // Custom per-employee extra accessibility permissions
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "extraPermissionsJson" TEXT;`,

  // Material unit price
  `ALTER TABLE "Material" ADD COLUMN IF NOT EXISTS "unitPrice" DOUBLE PRECISION DEFAULT 0;`,

  // Chat message edit support
  `ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "isEdited" BOOLEAN DEFAULT false;`,

  // Phase 7: Workforce compliance & category wage rates
  `ALTER TABLE "WorkforceMember" ADD COLUMN IF NOT EXISTS "maleHelperWageRate" DOUBLE PRECISION;`,
  `ALTER TABLE "WorkforceMember" ADD COLUMN IF NOT EXISTS "femaleHelperWageRate" DOUBLE PRECISION;`,
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
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "dailyWageRate" DOUBLE PRECISION;`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "maleHelperWageRate" DOUBLE PRECISION;`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "femaleHelperWageRate" DOUBLE PRECISION;`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "liquidatedDamagesTerms" TEXT;`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "liquidatedDamagesPercent" DOUBLE PRECISION;`,
  `ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "whatsappAt" TIMESTAMP(3);`,

  // Contractor Rates Automation & Direct Labour Cost Management
  `ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "projectId" TEXT;`,
  `ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "projectName" TEXT;`,
  `ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'CONTRACTOR';`,
  `ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "contractorId" TEXT;`,
  `ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "skilledRate" DOUBLE PRECISION DEFAULT 0;`,
  `ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "skilledAmount" DOUBLE PRECISION DEFAULT 0;`,
  `ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "maleRate" DOUBLE PRECISION DEFAULT 0;`,
  `ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "maleAmount" DOUBLE PRECISION DEFAULT 0;`,
  `ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "femaleRate" DOUBLE PRECISION DEFAULT 0;`,
  `ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "femaleAmount" DOUBLE PRECISION DEFAULT 0;`,
  `ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "totalExpense" DOUBLE PRECISION DEFAULT 0;`,
  `ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "rateUnit" TEXT DEFAULT 'DAY';`,
  `ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "isOverridden" BOOLEAN DEFAULT false;`,
  `ALTER TABLE "WorkforceHeadcount" ADD COLUMN IF NOT EXISTS "overrideReason" TEXT;`,
  `CREATE INDEX IF NOT EXISTS "WorkforceHeadcount_contractorName_idx" ON "WorkforceHeadcount"("contractorName");`,
  `CREATE INDEX IF NOT EXISTS "WorkforceHeadcount_source_idx" ON "WorkforceHeadcount"("source");`,

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
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "assignedSiteIdsJson" TEXT;`,
  `ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "geofenceM" INTEGER;`,
  `ALTER TABLE "StaffAttendance" ADD COLUMN IF NOT EXISTS "checkInSiteId" TEXT;`,
  `ALTER TABLE "StaffAttendance" ADD COLUMN IF NOT EXISTS "checkInDistanceM" INTEGER;`,
  `ALTER TABLE "StaffAttendance" ADD COLUMN IF NOT EXISTS "checkInFlag" TEXT;`,
  `ALTER TABLE "StaffAttendance" ADD COLUMN IF NOT EXISTS "checkInSelfie" TEXT;`,
  `ALTER TABLE "OnlinePayment" ADD COLUMN IF NOT EXISTS "fee" INTEGER;`,
  `ALTER TABLE "OnlinePayment" ADD COLUMN IF NOT EXISTS "feeTax" INTEGER;`,
  `ALTER TABLE "OnlinePayment" ADD COLUMN IF NOT EXISTS "feeBookedIn" TEXT;`,
  // Phase 14: Dynamic contractor selection in workforce registration
  `ALTER TABLE "WorkforceMember" ADD COLUMN IF NOT EXISTS "contractorId" TEXT;`,
  `CREATE INDEX IF NOT EXISTS "WorkforceMember_contractorId_idx" ON "WorkforceMember"("organizationId", "contractorId");`,
  `ALTER TABLE "Party" ADD COLUMN IF NOT EXISTS "whatsappGroupLink" TEXT;`,

  // Measurement Book Entry Columns & Audit Fields
  `ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "groupId" TEXT;`,
  `ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "subgroupId" TEXT;`,
  `ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT;`,
  `ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "entryName" TEXT;`,
  `ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "measurementType" TEXT DEFAULT 'WALL';`,
  `ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "formula" TEXT DEFAULT 'AREA';`,
  `ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "grossQuantity" DOUBLE PRECISION DEFAULT 1.0;`,
  `ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "deduction" DOUBLE PRECISION DEFAULT 0.0;`,
  `ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "remarks" TEXT;`,
  `ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "measurementDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;`,
  `ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "version" INTEGER DEFAULT 1;`,
  `ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN DEFAULT false;`,
  `ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);`,
  `ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "deletedBy" TEXT;`,
  `ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "deletedByName" TEXT;`,
  `ALTER TABLE "MeasurementBookEntry" ADD COLUMN IF NOT EXISTS "deletionReason" TEXT;`,
  `CREATE INDEX IF NOT EXISTS "MeasurementBookEntry_groupId_idx" ON "MeasurementBookEntry"("groupId");`,
  `CREATE INDEX IF NOT EXISTS "MeasurementBookEntry_subgroupId_idx" ON "MeasurementBookEntry"("subgroupId");`,
  `CREATE INDEX IF NOT EXISTS "MeasurementBookEntry_isDeleted_idx" ON "MeasurementBookEntry"("isDeleted");`,
  // Hot query composite performance indexes
  `CREATE INDEX IF NOT EXISTS "Task_organizationId_isArchived_status_idx" ON "Task"("organizationId", "isArchived", "status");`,
  `CREATE INDEX IF NOT EXISTS "Task_organizationId_isArchived_dueAt_idx" ON "Task"("organizationId", "isArchived", "dueAt");`,
  `CREATE INDEX IF NOT EXISTS "Task_organizationId_reminderDeliveredAt_reminderAt_idx" ON "Task"("organizationId", "reminderDeliveredAt", "reminderAt");`,
  `CREATE INDEX IF NOT EXISTS "StockMovement_organizationId_isArchived_materialId_storeId_idx" ON "StockMovement"("organizationId", "isArchived", "materialId", "storeId");`,
  `CREATE INDEX IF NOT EXISTS "Bill_organizationId_status_isArchived_idx" ON "Bill"("organizationId", "status", "isArchived");`,
  `CREATE INDEX IF NOT EXISTS "Bill_organizationId_isArchived_billDate_idx" ON "Bill"("organizationId", "isArchived", "billDate");`,
  `CREATE INDEX IF NOT EXISTS "Payment_organizationId_status_isArchived_idx" ON "Payment"("organizationId", "status", "isArchived");`,
  `CREATE INDEX IF NOT EXISTS "Payment_organizationId_paymentDate_idx" ON "Payment"("organizationId", "paymentDate");`,
  `CREATE INDEX IF NOT EXISTS "AttendanceSession_organizationId_isArchived_workDate_idx" ON "AttendanceSession"("organizationId", "isArchived", "workDate");`,
  `CREATE INDEX IF NOT EXISTS "IdempotencyRecord_organizationId_operation_idx" ON "IdempotencyRecord"("organizationId", "operation");`,
  `CREATE INDEX IF NOT EXISTS "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");`,
  `CREATE INDEX IF NOT EXISTS "MeasurementBookEntry_organizationId_isDeleted_status_idx" ON "MeasurementBookEntry"("organizationId", "isDeleted", "status");`,
  `CREATE INDEX IF NOT EXISTS "Notification_organizationId_userId_createdAt_idx" ON "Notification"("organizationId", "userId", "createdAt");`,

  // Feature 7 & 8: Material Storage & Material Quotations
  `ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "issuedToName" TEXT;`,
  `ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "issueStatus" TEXT DEFAULT 'ISSUED';`,
  `ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "materialQuotationId" TEXT;`,
  `CREATE INDEX IF NOT EXISTS "Attachment_materialQuotationId_idx" ON "Attachment"("materialQuotationId");`,
  `ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "attendanceSessionId" TEXT;`,
  `CREATE INDEX IF NOT EXISTS "Attachment_attendanceSessionId_idx" ON "Attachment"("attendanceSessionId");`,
];

const POSTGRES_TABLES = [
  `CREATE TABLE IF NOT EXISTS "AttendanceSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "workforceMemberId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "projectId" TEXT,
    "workDate" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkInAccuracyM" DOUBLE PRECISION,
    "checkOutAt" TIMESTAMP(3),
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "checkOutAccuracyM" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "notes" TEXT,
    "correctedBy" TEXT,
    "correctionReason" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "archiveReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
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
  // Measurement Book Hierarchy & Audit System
  `CREATE TABLE IF NOT EXISTS "MeasurementGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "siteId" TEXT,
    "name" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "MeasurementGroup_organizationId_projectId_partyId_key" ON "MeasurementGroup"("organizationId", "projectId", "partyId");`,
  `CREATE INDEX IF NOT EXISTS "MeasurementGroup_organizationId_idx" ON "MeasurementGroup"("organizationId");`,
  `CREATE INDEX IF NOT EXISTS "MeasurementGroup_projectId_idx" ON "MeasurementGroup"("projectId");`,
  `CREATE INDEX IF NOT EXISTS "MeasurementGroup_partyId_idx" ON "MeasurementGroup"("partyId");`,

  `CREATE TABLE IF NOT EXISTS "MeasurementSubgroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ROOM',
    "description" TEXT,
    "remarks" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "MeasurementSubgroup_organizationId_idx" ON "MeasurementSubgroup"("organizationId");`,
  `CREATE INDEX IF NOT EXISTS "MeasurementSubgroup_groupId_idx" ON "MeasurementSubgroup"("groupId");`,

  `CREATE TABLE IF NOT EXISTS "MeasurementAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "caption" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deleteReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "replacedById" TEXT,
    "replaceReason" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "MeasurementAttachment_organizationId_idx" ON "MeasurementAttachment"("organizationId");`,
  `CREATE INDEX IF NOT EXISTS "MeasurementAttachment_entryId_idx" ON "MeasurementAttachment"("entryId");`,

  `CREATE TABLE IF NOT EXISTS "MeasurementChangeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "previousData" TEXT NOT NULL,
    "proposedData" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "requestedByName" TEXT,
    "requestedRole" TEXT,
    "reviewedBy" TEXT,
    "reviewedByName" TEXT,
    "reviewerComments" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "MeasurementChangeRequest_organizationId_idx" ON "MeasurementChangeRequest"("organizationId");`,
  `CREATE INDEX IF NOT EXISTS "MeasurementChangeRequest_entryId_idx" ON "MeasurementChangeRequest"("entryId");`,
  `CREATE INDEX IF NOT EXISTS "MeasurementChangeRequest_status_idx" ON "MeasurementChangeRequest"("status");`,

  `CREATE TABLE IF NOT EXISTS "MeasurementHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT,
    "actorRole" TEXT,
    "reason" TEXT,
    "diff" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "MeasurementHistory_organizationId_idx" ON "MeasurementHistory"("organizationId");`,
  `CREATE INDEX IF NOT EXISTS "MeasurementHistory_entryId_idx" ON "MeasurementHistory"("entryId");`,
  `CREATE INDEX IF NOT EXISTS "MeasurementHistory_action_idx" ON "MeasurementHistory"("action");`,

  `CREATE TABLE IF NOT EXISTS "MaterialQuotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "vendorPartyId" TEXT NOT NULL,
    "unitCode" TEXT NOT NULL,
    "ratePaise" INTEGER NOT NULL,
    "taxRatePercent" DOUBLE PRECISION NOT NULL DEFAULT 18.0,
    "taxAmountPaise" INTEGER NOT NULL DEFAULT 0,
    "additionalPaise" INTEGER NOT NULL DEFAULT 0,
    "totalRatePaise" INTEGER NOT NULL,
    "quotationDate" TEXT NOT NULL,
    "validUntil" TEXT,
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "MaterialQuotation_org_mat_date_idx" ON "MaterialQuotation"("organizationId", "materialId", "quotationDate");`,
  `CREATE INDEX IF NOT EXISTS "MaterialQuotation_vendorPartyId_idx" ON "MaterialQuotation"("vendorPartyId");`,

  `CREATE TABLE IF NOT EXISTS "LiquidatedDamage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "projectId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "damageType" TEXT DEFAULT 'DELAY',
    "reason" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "deductionDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "waiveReason" TEXT,
    "waivedAt" TIMESTAMP(3),
    "waivedById" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "LiquidatedDamage_org_party_idx" ON "LiquidatedDamage"("organizationId", "partyId");`,
  `CREATE INDEX IF NOT EXISTS "LiquidatedDamage_org_project_idx" ON "LiquidatedDamage"("organizationId", "projectId");`,
  `CREATE INDEX IF NOT EXISTS "LiquidatedDamage_org_status_idx" ON "LiquidatedDamage"("organizationId", "status");`,
  `CREATE INDEX IF NOT EXISTS "LiquidatedDamage_deductionDate_idx" ON "LiquidatedDamage"("deductionDate");`,
];

const POSTGRES_CONSTRAINTS = [
  // MaterialQuotation Foreign Keys enforcing relational integrity with historical data retention (RESTRICT delete behaviors)
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MaterialQuotation_organizationId_fkey') THEN
      ALTER TABLE "MaterialQuotation" ADD CONSTRAINT "MaterialQuotation_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
    END IF;
  END $$;`,

  `DO $$ BEGIN
    -- Detect and repair incorrect pre-existing CASCADE constraints to enforce RESTRICT for quotation audit history
    IF EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'MaterialQuotation_materialId_fkey' AND confdeltype = 'c'
    ) THEN
      ALTER TABLE "MaterialQuotation" DROP CONSTRAINT "MaterialQuotation_materialId_fkey";
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MaterialQuotation_materialId_fkey') THEN
      ALTER TABLE "MaterialQuotation" ADD CONSTRAINT "MaterialQuotation_materialId_fkey"
      FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT;
    END IF;
  END $$;`,

  `DO $$ BEGIN
    -- Detect and repair incorrect pre-existing CASCADE constraints to enforce RESTRICT for vendor pricing history
    IF EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'MaterialQuotation_vendorPartyId_fkey' AND confdeltype = 'c'
    ) THEN
      ALTER TABLE "MaterialQuotation" DROP CONSTRAINT "MaterialQuotation_vendorPartyId_fkey";
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MaterialQuotation_vendorPartyId_fkey') THEN
      ALTER TABLE "MaterialQuotation" ADD CONSTRAINT "MaterialQuotation_vendorPartyId_fkey"
      FOREIGN KEY ("vendorPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT;
    END IF;
  END $$;`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MaterialQuotation_createdBy_fkey') THEN
      ALTER TABLE "MaterialQuotation" ADD CONSTRAINT "MaterialQuotation_createdBy_fkey"
      FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT;
    END IF;
  END $$;`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Attachment_materialQuotationId_fkey') THEN
      ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_materialQuotationId_fkey"
      FOREIGN KEY ("materialQuotationId") REFERENCES "MaterialQuotation"("id") ON DELETE SET NULL;
    END IF;
  END $$;`,

  // Enforce audit retention on financial and inventory ledger relations (prohibit silent cascading ledger purges)
  `DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Bill_partyId_fkey' AND confdeltype = 'c') THEN
      ALTER TABLE "Bill" DROP CONSTRAINT "Bill_partyId_fkey";
      ALTER TABLE "Bill" ADD CONSTRAINT "Bill_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT;
    END IF;
  END $$;`,

  `DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_partyId_fkey' AND confdeltype = 'c') THEN
      ALTER TABLE "Payment" DROP CONSTRAINT "Payment_partyId_fkey";
      ALTER TABLE "Payment" ADD CONSTRAINT "Payment_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT;
    END IF;
  END $$;`,

  `DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockMovement_materialId_fkey' AND confdeltype = 'c') THEN
      ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_materialId_fkey";
      ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT;
    END IF;
  END $$;`,

  `DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockMovement_storeId_fkey' AND confdeltype = 'c') THEN
      ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_storeId_fkey";
      ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT;
    END IF;
  END $$;`,
];

function isBenignSqlError(err) {
  if (!err) return false;
  const msg = (err.message || "").toLowerCase();
  return (
    msg.includes("already exists") ||
    msg.includes("duplicate column") ||
    msg.includes("duplicate key") ||
    msg.includes("42701") || // duplicate_column
    msg.includes("42p07") || // duplicate_table
    msg.includes("42710")    // duplicate_object
  );
}

function maskDatabaseUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    return `${parsed.protocol}//***:***@${parsed.host}${parsed.pathname}`;
  } catch {
    return "postgresql://***:***@hidden";
  }
}

async function applyMigration() {
  // Phase 3.3.1 Security Enforcement: Migration runner strictly requires DIRECT_URL explicitly.
  // Direct DDL migrations must NEVER fall back to DATABASE_URL or connection poolers.
  const directUrl = process.env.DIRECT_URL;

  if (!directUrl) {
    console.error("❌ [POSTGRES_MIGRATOR FATAL ERROR] Missing required DIRECT_URL environment variable.");
    console.error("   Migrations require an authentic, unpooled direct PostgreSQL endpoint.");
    console.error("   Fallback to DATABASE_URL is strictly disabled to prevent transaction pooler DDL lockups.");
    throw new Error(
      "MIGRATION_BLOCKED: DIRECT_URL environment variable is required. Migrations must never use pooled DATABASE_URL connections."
    );
  }

  // Validate PostgreSQL protocol
  if (!directUrl.startsWith("postgres://") && !directUrl.startsWith("postgresql://")) {
    console.error("❌ [POSTGRES_MIGRATOR FATAL ERROR] Invalid protocol in DIRECT_URL.");
    throw new Error(
      "MIGRATION_BLOCKED: DIRECT_URL must start with postgres:// or postgresql://"
    );
  }

  // Strictly prevent unintentional execution against production databases
  const isProductionEnv = process.env.NODE_ENV === "production";
  const hasStagingAllowance = process.env.ALLOW_STAGING_MIGRATION === "true" || process.env.ALLOW_PRODUCTION_MIGRATION === "true";
  if (isProductionEnv && !hasStagingAllowance) {
    throw new Error(
      "MIGRATION_BLOCKED: Direct DDL migration against production environment is strictly prohibited! Set ALLOW_STAGING_MIGRATION=true only when connecting to an explicitly confirmed disposable staging database."
    );
  }

  // Validate that connection does not target connection pooler endpoints
  if (directUrl.includes("pgbouncer=true") || directUrl.includes(":6543") || directUrl.includes("-pooler.")) {
    throw new Error(
      "MIGRATION_BLOCKED: DIRECT_URL targets a connection pooler (-pooler, port 6543, or pgbouncer=true). DDL migrations require an unpooled direct connection to port 5432."
    );
  }

  // Redacted logging: Never print credentials or secrets
  console.log(`⚡ [POSTGRES_MIGRATOR] Target endpoint: ${maskDatabaseUrl(directUrl)}`);

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({
    datasources: { db: { url: directUrl } },
  });

  try {
    console.log("⚡ [POSTGRES_MIGRATOR] Connecting to direct PostgreSQL endpoint for controlled DDL execution...");

    // 1. Pre-migration schema health check
    const existingTables = await prisma.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
    ).catch(() => []);
    console.log(`ℹ️ [POSTGRES_MIGRATOR] Pre-migration check: ${existingTables.length} public tables found.`);

    // If base tables are missing (e.g. empty or reconnected database), apply complete init migration
    if (existingTables.length === 0 || !existingTables.some((t) => t.table_name === "User")) {
      console.log("⚡ [POSTGRES_MIGRATOR] Base tables missing. Initializing full schema from migration...");
      const fs = require("fs");
      const path = require("path");
      const initSqlPath = path.resolve(__dirname, "..", "prisma", "migrations", "20261027000000_init_postgresql", "migration.sql");
      if (fs.existsSync(initSqlPath)) {
        const sql = fs.readFileSync(initSqlPath, "utf8");
        await prisma.$executeRawUnsafe(sql);
        console.log("✅ [POSTGRES_MIGRATOR] Base PostgreSQL schema initialized successfully.");
      }
    }

    // 2. Sequential Columns Migration
    console.log(`⚡ [POSTGRES_MIGRATOR] Applying ${POSTGRES_COLUMNS.length} column definitions...`);
    for (const sql of POSTGRES_COLUMNS) {
      try {
        await prisma.$executeRawUnsafe(sql);
      } catch (err) {
        if (!isBenignSqlError(err)) {
          console.error(`❌ [POSTGRES_MIGRATOR ERROR] Critical failure executing column DDL:\n${sql}\nReason: ${err.message}`);
          throw err;
        }
      }
    }

    // 3. Sequential Tables & Indexes Migration
    console.log(`⚡ [POSTGRES_MIGRATOR] Applying ${POSTGRES_TABLES.length} tables and indexes...`);
    for (const sql of POSTGRES_TABLES) {
      try {
        await prisma.$executeRawUnsafe(sql);
      } catch (err) {
        if (!isBenignSqlError(err)) {
          console.error(`❌ [POSTGRES_MIGRATOR ERROR] Critical failure executing table/index DDL:\n${sql}\nReason: ${err.message}`);
          throw err;
        }
      }
    }

    // 4. Sequential Relational Constraints & Foreign Keys
    console.log(`⚡ [POSTGRES_MIGRATOR] Applying ${POSTGRES_CONSTRAINTS.length} foreign key constraints...`);
    for (const sql of POSTGRES_CONSTRAINTS) {
      try {
        await prisma.$executeRawUnsafe(sql);
      } catch (err) {
        if (!isBenignSqlError(err)) {
          console.error(`❌ [POSTGRES_MIGRATOR ERROR] Critical failure executing foreign key constraint:\n${sql}\nReason: ${err.message}`);
          throw err;
        }
      }
    }

    // 5. Post-migration exhaustive relational constraint inspection
    const verifiedConstraints = await prisma.$queryRawUnsafe(`
      SELECT 
        c.conname AS constraint_name,
        src_tbl.relname AS source_table,
        src_col.attname AS source_column,
        ref_tbl.relname AS referenced_table,
        ref_col.attname AS referenced_column,
        c.confdeltype AS on_delete_action,
        c.convalidated AS is_validated
      FROM pg_constraint c
      JOIN pg_class src_tbl ON src_tbl.oid = c.conrelid
      JOIN pg_class ref_tbl ON ref_tbl.oid = c.confrelid
      JOIN pg_attribute src_col ON src_col.attrelid = c.conrelid AND src_col.attnum = ANY(c.conkey)
      JOIN pg_attribute ref_col ON ref_col.attrelid = c.confrelid AND ref_col.attnum = ANY(c.confkey)
      WHERE src_tbl.relname = 'MaterialQuotation';
    `).catch(() => []);

    console.log(`✅ [POSTGRES_MIGRATOR] Verified ${verifiedConstraints.length} active foreign key constraints on MaterialQuotation:`);
    for (const fc of verifiedConstraints) {
      const delAction = fc.on_delete_action === 'r' ? 'RESTRICT' : fc.on_delete_action === 'c' ? 'CASCADE' : fc.on_delete_action;
      console.log(`   • ${fc.constraint_name}: ${fc.source_table}(${fc.source_column}) -> ${fc.referenced_table}(${fc.referenced_column}) [ON DELETE ${delAction}] Validated: ${fc.is_validated}`);
    }

    console.log("✅ [POSTGRES_MIGRATOR] PostgreSQL schema synchronized and verified successfully.");

    return {
      success: true,
      columnsCount: POSTGRES_COLUMNS.length,
      tablesCount: POSTGRES_TABLES.length,
      constraintsCount: POSTGRES_CONSTRAINTS.length,
      verifiedConstraints,
    };
  } catch (err) {
    console.error("❌ [POSTGRES_MIGRATOR FATAL ERROR]:", err.message);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  applyMigration();
}

module.exports = { applyMigration };
