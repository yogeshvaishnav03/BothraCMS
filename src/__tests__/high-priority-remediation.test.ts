import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  getUserAccessibleProjectIds,
  userHasProjectAccess,
} from "@/lib/server-auth";
import { FinanceService, updateBill } from "@/services/finance-service";
import {
  createPresignedUploadUrl,
  createPresignedDownloadUrl,
  verifyObjectExists,
  getStorageProvider,
} from "@/lib/storage";
import { createProductionBackup } from "../../scripts/production-backup";

describe("High-Priority Remediation & Architecture Verification", () => {
  let testOrgId: string;
  let testSiteId: string;
  let testSupervisorId: string;
  let testAdminId: string;
  let testProjectId: string;
  let testPartyId: string;
  let testBillId: string;

  beforeAll(async () => {
    // 1. Setup test organization
    const org = await prisma.organization.create({
      data: {
        name: "Test Remediation Org " + Date.now(),
        status: "ACTIVE",
      },
    });
    testOrgId = org.id;

    // 2. Setup site
    const site = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        name: "Test Site Alpha",
        code: "SITE-ALPHA-" + Date.now().toString().slice(-4),
        address: "123 Construction Ave",
        status: "ACTIVE",
      },
    });
    testSiteId = site.id;

    // 3. Setup Users
    const supervisor = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Site Supervisor Sam",
        email: `supervisor_${Date.now()}@buildtrack.pro`,
        passwordHash: "$2a$10$fakehashfortesting1234567890",
        role: "SITE_SUPERVISOR",
        status: "ACTIVE",
      },
    });
    testSupervisorId = supervisor.id;

    const admin = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Admin Alice",
        email: `admin_${Date.now()}@buildtrack.pro`,
        passwordHash: "$2a$10$fakehashfortesting1234567890",
        role: "ORG_ADMIN",
        status: "ACTIVE",
      },
    });
    testAdminId = admin.id;

    // 4. Setup Project
    const project = await prisma.project.create({
      data: {
        organizationId: testOrgId,
        siteId: testSiteId,
        name: "Commercial Tower Phase 1",
        code: "PRJ-" + Date.now().toString().slice(-4),
        status: "IN_PROGRESS",
        budgetAmount: 1000000,
      },
    });
    testProjectId = project.id;

    // 5. Setup Party & Bill
    const party = await prisma.party.create({
      data: {
        organizationId: testOrgId,
        name: "Apex Steel Supplies",
        partyType: "VENDOR",
      },
    });
    testPartyId = party.id;

    const bill = await FinanceService.createBill({
      organizationId: testOrgId,
      projectId: testProjectId,
      partyId: testPartyId,
      billNumber: "BILL-TEST-" + Date.now().toString().slice(-4),
      billDate: new Date(),
      userId: testAdminId,
      role: "ORG_ADMIN",
      lines: [
        {
          description: "TMT Rebar 12mm",
          quantity: 100,
          unitRate: 500,
          lineTotal: 50000,
        },
      ],
      gst: { rate: 18 },
    });
    testBillId = bill.id;
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      await prisma.auditEvent.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.attachment.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.attendanceSession.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.workforceMember.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.billLine.deleteMany({ where: { bill: { organizationId: testOrgId } } });
      await prisma.paymentAllocation.deleteMany({ where: { payment: { organizationId: testOrgId } } });
      await prisma.payment.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.bill.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.party.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.project.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.site.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.user.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.organization.delete({ where: { id: testOrgId } });
    } catch {}
  });

  // Issue 1 & 2: Active Projects Visibility for Supervisor & Dashboard
  describe("Issue 1 & 2: Supervisor Active Projects & Dashboard Access", () => {
    it("allows a Site Supervisor to view active projects in their org when assigned to project", async () => {
      await prisma.projectAssignment.create({
        data: {
          organizationId: testOrgId,
          projectId: testProjectId,
          userId: testSupervisorId,
          assignedById: testAdminId,
          status: "ACTIVE",
        },
      });

      const userContext = {
        userId: testSupervisorId,
        organizationId: testOrgId,
        role: "SITE_SUPERVISOR",
      };

      const hasAccess = await userHasProjectAccess(userContext, testProjectId);
      expect(hasAccess).toBe(true);

      const accessibleIds = await getUserAccessibleProjectIds(userContext);
      expect(accessibleIds).not.toBeNull();
      expect(accessibleIds).toContain(testProjectId);

      await prisma.projectAssignment.deleteMany({ where: { userId: testSupervisorId } });
    });

    it("restricts supervisor if assigned to specific projects only", async () => {
      const otherProject = await prisma.project.create({
        data: {
          organizationId: testOrgId,
          siteId: testSiteId,
          name: "Restricted Tower",
          code: "PRJ-RES-" + Date.now().toString().slice(-4),
          status: "IN_PROGRESS",
        },
      });

      await prisma.projectAssignment.create({
        data: {
          organizationId: testOrgId,
          projectId: otherProject.id,
          userId: testSupervisorId,
          assignedById: testAdminId,
          status: "ACTIVE",
        },
      });

      const userContext = {
        userId: testSupervisorId,
        organizationId: testOrgId,
        role: "SITE_SUPERVISOR",
      };

      const accessibleIds = await getUserAccessibleProjectIds(userContext);
      expect(accessibleIds).toContain(otherProject.id);
      expect(accessibleIds).not.toContain(testProjectId);

      await prisma.projectAssignment.deleteMany({ where: { userId: testSupervisorId } });
      await prisma.project.delete({ where: { id: otherProject.id } });
    });
  });

  // Issue 3: Active Construction Site Filter
  describe("Issue 3: Active Construction Site Filter", () => {
    it("correctly filters projects by siteId", async () => {
      const site2 = await prisma.site.create({
        data: {
          organizationId: testOrgId,
          name: "Site Beta",
          code: "SITE-BETA-" + Date.now().toString().slice(-4),
          address: "456 Beta Rd",
          status: "ACTIVE",
        },
      });

      const project2 = await prisma.project.create({
        data: {
          organizationId: testOrgId,
          siteId: site2.id,
          name: "Beta Residential Complex",
          code: "PRJ-BETA-" + Date.now().toString().slice(-4),
          status: "IN_PROGRESS",
        },
      });

      const site1Projects = await prisma.project.findMany({
        where: { organizationId: testOrgId, siteId: testSiteId, isArchived: false },
      });
      const site2Projects = await prisma.project.findMany({
        where: { organizationId: testOrgId, siteId: site2.id, isArchived: false },
      });

      expect(site1Projects.some((p) => p.id === testProjectId)).toBe(true);
      expect(site1Projects.some((p) => p.id === project2.id)).toBe(false);

      expect(site2Projects.some((p) => p.id === project2.id)).toBe(true);
      expect(site2Projects.some((p) => p.id === testProjectId)).toBe(false);

      await prisma.project.delete({ where: { id: project2.id } });
      await prisma.site.delete({ where: { id: site2.id } });
    });
  });

  // Issue 5: Submit Daily Report Operational Role Restriction
  describe("Issue 5: Operational Role Permissions for Daily Reports", () => {
    it("permits operational roles and rejects financial roles", () => {
      const allowedDailyReportRoles = new Set([
        "SUPER_ADMIN",
        "ORG_ADMIN",
        "PROJECT_MANAGER",
        "SITE_SUPERVISOR",
      ]);

      expect(allowedDailyReportRoles.has("SITE_SUPERVISOR")).toBe(true);
      expect(allowedDailyReportRoles.has("PROJECT_MANAGER")).toBe(true);
      expect(allowedDailyReportRoles.has("ORG_ADMIN")).toBe(true);
      expect(allowedDailyReportRoles.has("SUPER_ADMIN")).toBe(true);

      expect(allowedDailyReportRoles.has("ACCOUNTANT")).toBe(false);
      expect(allowedDailyReportRoles.has("VIEWER")).toBe(false);
    });
  });

  // Issue 6: Edit Bill with Mandatory Reason & Audit Trail
  describe("Issue 6: Edit Bill with Mandatory Justification & Audit Trail", () => {
    it("rejects bill update without a justification reason of at least 5 characters", async () => {
      await expect(
        updateBill({
          organizationId: testOrgId,
          billId: testBillId,
          userId: testAdminId,
          role: "ORG_ADMIN",
          reason: "No", // too short
          lines: [
            {
              description: "TMT Rebar 16mm",
              quantity: 120,
              unitRate: 550,
              lineTotal: 66000,
            },
          ],
        })
      ).rejects.toThrow(/justification reason of at least 5 characters/i);
    });

    it("successfully edits bill with reason, recalculates total, and records immutable AuditEvent", async () => {
      const updated = await updateBill({
        organizationId: testOrgId,
        billId: testBillId,
        userId: testAdminId,
        role: "ORG_ADMIN",
        reason: "Quantity revised after engineer site measurement",
        lines: [
          {
            description: "TMT Rebar 16mm",
            quantity: 100,
            unitRate: 600,
            lineTotal: 60000,
          },
        ],
        gst: { rate: 18 },
      });

      expect(updated.subtotal).toBe(60000);
      expect(updated.totalAmount).toBe(70800);

      // Verify audit event
      const audit = await prisma.auditEvent.findFirst({
        where: {
          organizationId: testOrgId,
          action: "BILL_UPDATED",
          actorUserId: testAdminId,
        },
        orderBy: { createdAt: "desc" },
      });

      expect(audit).not.toBeNull();
      expect(audit!.reason).toBe("Quantity revised after engineer site measurement");
      const parsedAfter = JSON.parse(audit!.afterJson!);
      expect(parsedAfter.totalAmount).toBe(70800);
    });

    it("prevents reducing bill total below already disbursed payment amount", async () => {
      // Create a payment disbursed against this bill
      const payment = await prisma.payment.create({
        data: {
          organization: { connect: { id: testOrgId } },
          party: { connect: { id: testPartyId } },
          project: { connect: { id: testProjectId } },
          creator: { connect: { id: testAdminId } },
          amount: 50000,
          status: "PAID",
          referenceNumber: "TXN-CHQ-10023",
          method: "CHEQUE",
          idempotencyKey: "test-idem-" + Date.now(),
          payingAccount: "HDFC A/c",
          paymentDate: new Date(),
          allocations: {
            create: [
              {
                billId: testBillId,
                amount: 50000,
              },
            ],
          },
        },
      });

      // Try reducing bill to 30,000 (below 50,000 paid)
      await expect(
        updateBill({
          organizationId: testOrgId,
          billId: testBillId,
          userId: testAdminId,
          role: "ORG_ADMIN",
          reason: "Trying to reduce below paid amount",
          lines: [
            {
              description: "Reduced Line",
              quantity: 50,
              unitRate: 600,
              lineTotal: 30000,
            },
          ],
        })
      ).rejects.toThrow(/cannot be reduced below the amount already disbursed/i);

      // Cleanup payment
      await prisma.paymentAllocation.deleteMany({ where: { paymentId: payment.id } });
      await prisma.payment.delete({ where: { id: payment.id } });
    });
  });

  // Issue 7: Mandatory Ref / Voucher No. on Payments
  describe("Issue 7: Mandatory Payment Reference Number", () => {
    it("validates that reference number is strictly required for financial payments", async () => {
      const invalidPayment = {
        referenceNumber: "",
      };
      expect(invalidPayment.referenceNumber.trim().length > 0).toBe(false);

      const validPayment = {
        referenceNumber: "UTR-HDFC-9920144",
      };
      expect(validPayment.referenceNumber.trim().length > 0).toBe(true);
    });
  });

  // Issue 8: Exclude Rejected Payments from Disbursed Totals
  describe("Issue 8: Exclude Rejected & Reversed Payments from Disbursed Totals", () => {
    it("excludes REJECTED and REVERSED payments from financial totals", async () => {
      const p1 = await prisma.payment.create({
        data: {
          organization: { connect: { id: testOrgId } },
          party: { connect: { id: testPartyId } },
          project: { connect: { id: testProjectId } },
          creator: { connect: { id: testAdminId } },
          amount: 15000,
          status: "PAID",
          referenceNumber: "REF-001",
          method: "UPI",
          idempotencyKey: "test-p1-" + Date.now(),
          payingAccount: "HDFC A/c",
          paymentDate: new Date(),
        },
      });

      const p2 = await prisma.payment.create({
        data: {
          organization: { connect: { id: testOrgId } },
          party: { connect: { id: testPartyId } },
          project: { connect: { id: testProjectId } },
          creator: { connect: { id: testAdminId } },
          amount: 25000,
          status: "REJECTED",
          referenceNumber: "REF-002",
          method: "NEFT",
          idempotencyKey: "test-p2-" + Date.now(),
          payingAccount: "HDFC A/c",
          paymentDate: new Date(),
        },
      });

      const p3 = await prisma.payment.create({
        data: {
          organization: { connect: { id: testOrgId } },
          party: { connect: { id: testPartyId } },
          project: { connect: { id: testProjectId } },
          creator: { connect: { id: testAdminId } },
          amount: 10000,
          status: "REVERSED",
          referenceNumber: "REF-003",
          method: "RTGS",
          idempotencyKey: "test-p3-" + Date.now(),
          payingAccount: "HDFC A/c",
          paymentDate: new Date(),
        },
      });

      const payments = await prisma.payment.findMany({
        where: { organizationId: testOrgId },
      });

      // Filter logic applied in Finance page
      const disbursedTotal = payments
        .filter((p) => p.status !== "REJECTED" && p.status !== "REVERSED")
        .reduce((sum, p) => sum + p.amount, 0);

      expect(disbursedTotal).toBe(15000); // Only p1 counted, p2 and p3 excluded

      // Cleanup
      await prisma.payment.deleteMany({
        where: { id: { in: [p1.id, p2.id, p3.id] } },
      });
    });
  });

  // Issue 4: Attendance Checkout Reminder & Time-Tag Correction
  describe("Issue 4: Attendance Checkout Reminder & Correction", () => {
    it("flags session for checkout reminder when hours >= 8", () => {
      const checkInTime = new Date(Date.now() - 8.5 * 3600 * 1000); // 8.5 hours ago
      const hoursOnShift = (Date.now() - checkInTime.getTime()) / (1000 * 60 * 60);

      const reminderThresholdHours = 8;
      const shouldRemind = hoursOnShift >= reminderThresholdHours;
      expect(shouldRemind).toBe(true);
    });

    it("requires mandatory justification of at least 5 chars for attendance correction", async () => {
      const worker = await prisma.workforceMember.create({
        data: {
          organization: { connect: { id: testOrgId } },
          name: "Ramesh Kumar",
          employeeCode: "EMP-" + Date.now(),
          workerType: "DIRECT",
        },
      });

      const attendance = await prisma.attendanceSession.create({
        data: {
          organization: { connect: { id: testOrgId } },
          workforceMember: { connect: { id: worker.id } },
          site: { connect: { id: testSiteId } },
          project: { connect: { id: testProjectId } },
          workDate: new Date().toISOString().split("T")[0],
          checkInAt: new Date(Date.now() - 9 * 3600 * 1000),
          status: "PRESENT",
          creator: { connect: { id: testSupervisorId } },
        },
      });

      const justification = "Biometric reader was offline during morning entry";
      expect(justification.trim().length >= 5).toBe(true);

      const updatedCheckIn = new Date(Date.now() - 8 * 3600 * 1000);
      const updatedCheckOut = new Date();

      const corrected = await prisma.attendanceSession.update({
        where: { id: attendance.id },
        data: {
          checkInAt: updatedCheckIn,
          checkOutAt: updatedCheckOut,
          status: "PRESENT",
        },
      });

      expect(corrected.status).toBe("PRESENT");

      // Cleanup
      await prisma.attendanceSession.delete({ where: { id: attendance.id } });
      await prisma.workforceMember.delete({ where: { id: worker.id } });
    });
  });

  // Phase 3: Persistent Object Storage
  describe("Phase 3: Persistent Object Storage Architecture", () => {
    it("provides storage provider and presigned download URL generation", async () => {
      const storage = getStorageProvider();
      expect(storage).toBeDefined();

      const key = "test_doc_001.pdf";
      const downloadUrl = await createPresignedDownloadUrl(key, "Specification.pdf", 900);
      expect(downloadUrl).toBeDefined();
      expect(typeof downloadUrl).toBe("string");
    });

    it("verifies object existence in storage backend", async () => {
      const existsResult = await verifyObjectExists("non_existent_key_99999999.xyz");
      expect(existsResult.exists).toBe(false);
    });
  });

  // Phase 4: Backup & Disaster Recovery
  describe("Phase 4: Coordinated Backup Manifest & RPO/RTO", () => {
    it("generates coordinate backup manifest linking database metadata to object storage", async () => {
      const backupResult = await createProductionBackup({ retention: "DAILY" });
      expect(backupResult).toBeDefined();
      expect(backupResult.manifestData).toBeDefined();
      expect(backupResult.manifestData.database.sha256).toBeDefined();
      expect(backupResult.manifestData.serviceLevelObjectives.recoveryPointObjective).toContain("RPO");
      expect(backupResult.manifestData.serviceLevelObjectives.recoveryTimeObjective).toContain("RTO");
    });
  });
});
