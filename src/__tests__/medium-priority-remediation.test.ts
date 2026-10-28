import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { hasPermission, canUser, assertPermission } from "@/lib/permissions";
import { fetchDayBookData } from "@/services/day-book-service";
import { ReminderService } from "@/services/reminder-service";
import { FinanceService } from "@/services/finance-service";

describe("Medium-Priority Remediation & Architecture Verification", () => {
  let testOrgId: string;
  let otherOrgId: string;
  let testSiteId: string;
  let otherSiteId: string;
  let testSupervisorId: string;
  let testAdminId: string;
  let testProjectId: string;
  let testPartyAId: string;
  let testPartyBId: string;
  let testBillId: string;

  beforeAll(async () => {
    // 1. Setup primary test organization
    const org = await prisma.organization.create({
      data: {
        name: "Medium Priority Test Org " + Date.now(),
        status: "ACTIVE",
      },
    });
    testOrgId = org.id;

    // 2. Setup secondary test organization for tenant isolation testing
    const otherOrg = await prisma.organization.create({
      data: {
        name: "Other Tenant Org " + Date.now(),
        status: "ACTIVE",
      },
    });
    otherOrgId = otherOrg.id;

    // 3. Setup sites
    const site = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        name: "Remediation Site Alpha",
        code: "SITE-MED-" + Date.now().toString().slice(-4),
        address: "123 Remediation Highway",
        status: "ACTIVE",
      },
    });
    testSiteId = site.id;

    const otherSite = await prisma.site.create({
      data: {
        organizationId: otherOrgId,
        name: "Other Tenant Site",
        code: "SITE-OTH-" + Date.now().toString().slice(-4),
        address: "456 Isolation Blvd",
        status: "ACTIVE",
      },
    });
    otherSiteId = otherSite.id;

    // 4. Setup Users
    const supervisor = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Supervisor Steve",
        email: `sup_med_${Date.now()}@buildtrack.pro`,
        passwordHash: "$2a$10$fakehashfortesting1234567890",
        role: "SITE_SUPERVISOR",
        status: "ACTIVE",
      },
    });
    testSupervisorId = supervisor.id;

    const admin = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Admin Amanda",
        email: `adm_med_${Date.now()}@buildtrack.pro`,
        passwordHash: "$2a$10$fakehashfortesting1234567890",
        role: "ORG_ADMIN",
        status: "ACTIVE",
      },
    });
    testAdminId = admin.id;

    // 5. Setup Project
    const project = await prisma.project.create({
      data: {
        organizationId: testOrgId,
        siteId: testSiteId,
        name: "Highrise Tower Phase 2",
        code: "MED-PRJ-" + Date.now().toString().slice(-4),
        status: "IN_PROGRESS",
        budgetAmount: 5000000,
      },
    });
    testProjectId = project.id;

    // 6. Setup Parties
    const partyA = await prisma.party.create({
      data: {
        organizationId: testOrgId,
        name: "Metro Cement Suppliers",
        partyType: "VENDOR",
      },
    });
    testPartyAId = partyA.id;

    const partyB = await prisma.party.create({
      data: {
        organizationId: testOrgId,
        name: "Shree Ram TMT Steel",
        partyType: "VENDOR",
      },
    });
    testPartyBId = partyB.id;

    // 7. Setup Bill for Party A: ₹50,000 (5,000,000 paise)
    const bill = await FinanceService.createBill({
      organizationId: testOrgId,
      projectId: testProjectId,
      partyId: testPartyAId,
      billNumber: "BILL-MED-" + Date.now().toString().slice(-4),
      billDate: new Date(),
      userId: testAdminId,
      role: "ORG_ADMIN",
      lines: [
        {
          description: "Grade 53 OPC Cement 100 bags",
          quantity: 100,
          unitRate: 50000,
          lineTotal: 5000000,
        },
      ],
      gst: { rate: 0 },
    });
    testBillId = bill.id;
  });

  afterAll(async () => {
    // Clean up test data safely in child-first dependency order
    try {
      await prisma.auditEvent.deleteMany({
        where: { organizationId: { in: [testOrgId, otherOrgId] } },
      });
      await prisma.paymentAllocation.deleteMany({
        where: { payment: { organizationId: { in: [testOrgId, otherOrgId] } } },
      });
      await prisma.payment.deleteMany({
        where: { organizationId: { in: [testOrgId, otherOrgId] } },
      });
      await prisma.billLine.deleteMany({
        where: { bill: { organizationId: { in: [testOrgId, otherOrgId] } } },
      });
      await prisma.bill.deleteMany({
        where: { organizationId: { in: [testOrgId, otherOrgId] } },
      });
      await prisma.notification.deleteMany({
        where: { organizationId: { in: [testOrgId, otherOrgId] } },
      });
      await prisma.dailySiteReport.deleteMany({
        where: { organizationId: { in: [testOrgId, otherOrgId] } },
      });
      await prisma.project.deleteMany({
        where: { organizationId: { in: [testOrgId, otherOrgId] } },
      });
      await prisma.party.deleteMany({
        where: { organizationId: { in: [testOrgId, otherOrgId] } },
      });
      await prisma.store.deleteMany({
        where: { organizationId: { in: [testOrgId, otherOrgId] } },
      });
      await prisma.site.deleteMany({
        where: { organizationId: { in: [testOrgId, otherOrgId] } },
      });
      await prisma.user.deleteMany({
        where: { organizationId: { in: [testOrgId, otherOrgId] } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [testOrgId, otherOrgId] } },
      });
    } catch {}
  });

  // =========================================================================
  // ITEM 1: Supervisor Audit Log Denial
  // =========================================================================
  describe("Item 1: User Permissions (Supervisor Audit Denial)", () => {
    it("denies audit:read permission to SITE_SUPERVISOR", () => {
      expect(hasPermission("SITE_SUPERVISOR", "audit:read")).toBe(false);
      expect(canUser({ role: "SITE_SUPERVISOR" }, "audit:read")).toBe(false);
    });

    it("assertPermission throws forbidden error for SITE_SUPERVISOR attempting audit:read", () => {
      expect(() => {
        assertPermission("SITE_SUPERVISOR", "audit:read");
      }).toThrow(/lacks required permission 'audit:read'/);
    });

    it("allows audit:read for explicitly authorized roles (SUPER_ADMIN, ORG_ADMIN, AUDITOR)", () => {
      expect(hasPermission("SUPER_ADMIN", "audit:read")).toBe(true);
      expect(hasPermission("ORG_ADMIN", "audit:read")).toBe(true);
      expect(hasPermission("AUDITOR", "audit:read")).toBe(true);
    });
  });

  // =========================================================================
  // ITEM 2: Quick Action Modal Scoping & Permissions
  // =========================================================================
  describe("Item 2: Quick Action Modal Scoping", () => {
    it("verifies permissions for sensitive actions like finance vs supervisor", () => {
      // Supervisor should NOT have finance:read/write
      expect(canUser({ role: "SITE_SUPERVISOR" }, "finance:write")).toBe(false);
      expect(canUser({ role: "SITE_SUPERVISOR" }, "finance:read")).toBe(false);

      // Supervisor SHOULD have attendance:read and inventory:read
      expect(canUser({ role: "SITE_SUPERVISOR" }, "attendance:read")).toBe(true);
      expect(canUser({ role: "SITE_SUPERVISOR" }, "inventory:read")).toBe(true);

      // Org Admin has both
      expect(canUser({ role: "ORG_ADMIN" }, "finance:read")).toBe(true);
      expect(canUser({ role: "ORG_ADMIN" }, "attendance:read")).toBe(true);
    });
  });

  // =========================================================================
  // ITEM 4: Day Book Date Filtering & Range Queries
  // =========================================================================
  describe("Item 4: Day Book Date Filter & Range Support", () => {
    const today = new Date().toISOString().split("T")[0];

    beforeAll(async () => {
      // Create a test payment in DB on today's date
      await FinanceService.recordPayment({
        organizationId: testOrgId,
        partyId: testPartyAId,
        projectId: testProjectId,
        paymentDate: new Date(),
        amount: 150000, // ₹1,500
        method: "CASH",
        payingAccount: "Site Petty Cash",
        referenceNumber: "VOUCHER-DAYBOOK-01",
        idempotencyKey: "IDEM-DB-TEST-" + Date.now(),
        notes: "Site diesel purchase for generator",
        userId: testAdminId,
        role: "ORG_ADMIN",
        autoApprove: true,
      });
    });

    it("retrieves Day Book records for a single date", async () => {
      const data = await fetchDayBookData(testOrgId, today);
      expect(data).toBeDefined();
      expect(data.date).toBe(today);
      expect(data.payments.length).toBeGreaterThanOrEqual(1);
      expect(data.summary.totalPaymentsAmount).toBeGreaterThanOrEqual(150000);
    });

    it("supports date range queries spanning multiple dates", async () => {
      const fromDate = "2026-01-01";
      const toDate = today;

      const data = await fetchDayBookData(testOrgId, fromDate, toDate);
      expect(data).toBeDefined();
      expect(data.fromDate).toBe(fromDate);
      expect(data.toDate).toBe(toDate);
      expect(data.date).toBe(`${fromDate} to ${toDate}`);
      expect(data.payments.length).toBeGreaterThanOrEqual(1);
    });

    it("scopes Day Book data to specific siteId when provided", async () => {
      const siteData = await fetchDayBookData(testOrgId, today, today, testSiteId);
      expect(siteData.payments.length).toBeGreaterThanOrEqual(1);

      // Other site should return 0 payments
      const emptySiteData = await fetchDayBookData(testOrgId, today, today, "non-existent-site");
      expect(emptySiteData.payments.length).toBe(0);
      expect(emptySiteData.summary.totalPaymentsAmount).toBe(0);
    });
  });

  // =========================================================================
  // ITEM 6: Notification Unread Count Persistence & Idempotency
  // =========================================================================
  describe("Item 6: Notification Unread Count", () => {
    let notif1Id: string;
    let notif2Id: string;

    beforeAll(async () => {
      const n1 = await prisma.notification.create({
        data: {
          organizationId: testOrgId,
          userId: testSupervisorId,
          type: "TASK_REMINDER",
          severity: "WARNING",
          title: "Overdue Safety Check",
          message: "Scaffolding safety check pending on Level 3",
          readAt: null,
        },
      });
      notif1Id = n1.id;

      const n2 = await prisma.notification.create({
        data: {
          organizationId: testOrgId,
          userId: testSupervisorId,
          type: "TASK_REMINDER",
          severity: "INFO",
          title: "Upcoming Inspection",
          message: "Structural audit scheduled for tomorrow",
          readAt: null,
        },
      });
      notif2Id = n2.id;
    });

    it("marks single notification as read and persists readAt timestamp in DB", async () => {
      const success = await ReminderService.markAsRead(notif1Id, testSupervisorId);
      expect(success).toBe(true);

      const updated = await prisma.notification.findUnique({
        where: { id: notif1Id },
      });
      expect(updated?.readAt).not.toBeNull();
    });

    it("handles idempotent markAsRead calls without duplicate decrements or errors", async () => {
      // Second call on already-read notification returns true without error
      const successAgain = await ReminderService.markAsRead(notif1Id, testSupervisorId);
      expect(successAgain).toBe(true);
    });

    it("marks all remaining notifications as read atomically", async () => {
      const markedCount = await ReminderService.markAllAsRead(testSupervisorId, testOrgId);
      expect(markedCount).toBeGreaterThanOrEqual(1);

      const unreadRemaining = await prisma.notification.count({
        where: { userId: testSupervisorId, readAt: null },
      });
      expect(unreadRemaining).toBe(0);
    });
  });

  // =========================================================================
  // ITEM 8: Project Page Filters
  // =========================================================================
  describe("Item 8: Project Page Filters", () => {
    it("filters correctly by site and status with exact results", async () => {
      const projectsForSite = await prisma.project.findMany({
        where: { organizationId: testOrgId, siteId: testSiteId },
      });
      expect(projectsForSite.length).toBeGreaterThanOrEqual(1);
      expect(projectsForSite[0].id).toBe(testProjectId);

      // Filter by non-existent site returns zero records gracefully
      const zeroProjects = await prisma.project.findMany({
        where: { organizationId: testOrgId, siteId: "non-existent-site-id" },
      });
      expect(zeroProjects).toHaveLength(0);
    });

    it("filters by status correctly (IN_PROGRESS vs COMPLETED)", async () => {
      const inProgress = await prisma.project.findMany({
        where: { organizationId: testOrgId, status: "IN_PROGRESS" },
      });
      expect(inProgress.some((p) => p.id === testProjectId)).toBe(true);

      const completed = await prisma.project.findMany({
        where: { organizationId: testOrgId, status: "COMPLETED" },
      });
      expect(completed.some((p) => p.id === testProjectId)).toBe(false);
    });
  });

  // =========================================================================
  // ITEM 9: Payment Out — Bill Selection, Allocations & Tenant Isolation
  // =========================================================================
  describe("Item 9: Payment Out Bill Selection & Isolation", () => {
    it("allocates payment to a pending bill and reduces outstanding balance", async () => {
      // Bill initial amount: ₹50,000 (5,000,000 paise)
      // Disburse partial payment of ₹20,000 (2,000,000 paise)
      const payResult = await FinanceService.recordPayment({
        organizationId: testOrgId,
        partyId: testPartyAId,
        projectId: testProjectId,
        paymentDate: new Date(),
        amount: 2000000,
        method: "BANK_TRANSFER",
        payingAccount: "Primary Operating Account",
        referenceNumber: "UTR-ALLOC-TEST-01",
        idempotencyKey: "IDEM-ALLOC-" + Date.now(),
        userId: testAdminId,
        role: "ORG_ADMIN",
        autoApprove: true,
        allocations: [
          {
            billId: testBillId,
            amount: 2000000, // allocate ₹20,000
          },
        ],
      });

      expect(payResult.payment.status).toBe("POSTED");
      expect(payResult.payment.allocations).toHaveLength(1);
      expect(payResult.payment.allocations[0].amount).toBe(2000000);

      // Verify outstanding balance on bill
      const bill = await prisma.bill.findUnique({
        where: { id: testBillId },
        include: {
          allocations: {
            where: { reversedAt: null, payment: { status: "POSTED" } },
          },
        },
      });

      const totalPaid = bill?.allocations.reduce((sum, a) => sum + a.amount, 0) || 0;
      expect(totalPaid).toBe(2000000); // ₹20,000 paid
      const outstanding = (bill?.totalAmount || 0) - totalPaid;
      expect(outstanding).toBe(3000000); // ₹30,000 outstanding
    });

    it("prevents allocating payment to a bill belonging to another party", async () => {
      // Attempt to pay Party B, but allocate to Party A's bill!
      await expect(
        FinanceService.recordPayment({
          organizationId: testOrgId,
          partyId: testPartyBId, // Party B
          projectId: testProjectId,
          paymentDate: new Date(),
          amount: 500000,
          method: "BANK_TRANSFER",
          payingAccount: "Primary Operating Account",
          referenceNumber: "UTR-CROSS-PARTY-ERR",
          idempotencyKey: "IDEM-CROSS-PARTY-" + Date.now(),
          userId: testAdminId,
          role: "ORG_ADMIN",
          autoApprove: true,
          allocations: [
            {
              billId: testBillId, // Belongs to Party A!
              amount: 500000,
            },
          ],
        })
      ).rejects.toThrow(/belongs to a different party/);
    });

    it("prevents allocating payment to another organization's bill (tenant isolation)", async () => {
      const otherAdmin = await prisma.user.create({
        data: {
          organizationId: otherOrgId,
          name: "Other Tenant Admin",
          email: `other_adm_${Date.now()}@buildtrack.pro`,
          passwordHash: "$2a$10$fakehashfortesting1234567890",
          role: "ORG_ADMIN",
          status: "ACTIVE",
        },
      });

      const otherParty = await prisma.party.create({
        data: {
          organizationId: otherOrgId,
          name: "Other Org Supplier",
          partyType: "VENDOR",
        },
      });

      const otherBill = await FinanceService.createBill({
        organizationId: otherOrgId,
        partyId: otherParty.id,
        billNumber: "OTHER-ORG-BILL-" + Date.now(),
        billDate: new Date(),
        userId: otherAdmin.id,
        role: "ORG_ADMIN",
        lines: [
          {
            description: "Other org materials",
            quantity: 10,
            unitRate: 100000,
            lineTotal: 1000000,
          },
        ],
        gst: { rate: 0 },
      });

      // Attempt to allocate from testOrgId against otherOrgId's bill
      await expect(
        FinanceService.recordPayment({
          organizationId: testOrgId,
          partyId: testPartyAId,
          projectId: testProjectId,
          paymentDate: new Date(),
          amount: 500000,
          method: "BANK_TRANSFER",
          payingAccount: "Primary Operating Account",
          referenceNumber: "UTR-CROSS-TENANT-ERR",
          idempotencyKey: "IDEM-CROSS-TENANT-" + Date.now(),
          userId: testAdminId,
          role: "ORG_ADMIN",
          autoApprove: true,
          allocations: [
            {
              billId: otherBill.id, // In other organization!
              amount: 500000,
            },
          ],
        })
      ).rejects.toThrow(/not found/);
    });

    it("prevents allocating amount exceeding bill outstanding balance (overpayment protection)", async () => {
      // Current outstanding balance on testBillId is ₹30,000 (3,000,000 paise).
      // Attempting to allocate ₹35,000 (3,500,000 paise) should be strictly rejected!
      await expect(
        FinanceService.recordPayment({
          organizationId: testOrgId,
          partyId: testPartyAId,
          projectId: testProjectId,
          paymentDate: new Date(),
          amount: 3500000,
          method: "BANK_TRANSFER",
          payingAccount: "Primary Operating Account",
          referenceNumber: "UTR-OVERPAY-ERR",
          idempotencyKey: "IDEM-OVERPAY-" + Date.now(),
          userId: testAdminId,
          role: "ORG_ADMIN",
          autoApprove: true,
          allocations: [
            {
              billId: testBillId,
              amount: 3500000, // Exceeds 3,000,000 paise outstanding!
            },
          ],
        })
      ).rejects.toThrow(/exceeds outstanding balance/);
    });
  });
});
