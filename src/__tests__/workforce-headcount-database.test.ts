import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { WorkforceHeadcountService } from "@/services/workforce-headcount-service";

describe("Workforce Headcount Database Persistence Tests", () => {
  const testOrgId = "test-org-headcount-" + Date.now();
  let testSiteId: string;
  const testUserId = "user-supervisor-" + Date.now();

  beforeAll(async () => {
    // Setup test organization and site
    const org = await prisma.organization.create({
      data: {
        id: testOrgId,
        name: "Headcount Test Organization",
        currency: "INR",
        timezone: "Asia/Kolkata",
      },
    });

    const site = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        name: "Chaupasni Row Houses Test Site",
        code: "SITE-HC-" + Date.now().toString().slice(-4),
        address: "Jodhpur Highway",
      },
    });
    testSiteId = site.id;

    await prisma.user.create({
      data: {
        id: testUserId,
        organizationId: testOrgId,
        name: "Test Supervisor",
        email: `supervisor-${Date.now()}@test.com`,
        passwordHash: "hash-placeholder",
        role: "SITE_SUPERVISOR",
      },
    });
  });

  afterAll(async () => {
    // Clean up test fixtures
    await prisma.workforceHeadcount.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await prisma.auditEvent.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await prisma.site.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: testOrgId } }).catch(() => {});
  });

  it("1. Persists site workforce headcount record in database table", async () => {
    const record = await WorkforceHeadcountService.saveRecord(
      testOrgId,
      {
        siteId: testSiteId,
        date: "2026-10-20",
        shift: "GENERAL",
        artisanCount: 5,
        craftsmanCount: 0,
        laborerMale: 4,
        laborerFemale: 2,
        contractorName: "Sharma Masons",
        notes: "Foundation casting work",
      },
      {
        userId: testUserId,
        name: "Test Supervisor",
        role: "SITE_SUPERVISOR",
      }
    );

    expect(record).toBeDefined();
    expect(record.grandTotal).toBe(11);
    expect(record.artisanCount).toBe(5);
    expect(record.laborerTotal).toBe(6);

    // Verify it exists in database table
    const dbRecord = await prisma.workforceHeadcount.findFirst({
      where: {
        organizationId: testOrgId,
        siteId: testSiteId,
        date: "2026-10-20",
      },
    });

    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.grandTotal).toBe(11);
    expect(dbRecord?.artisanCount).toBe(5);
    expect(dbRecord?.contractorName).toBe("Sharma Masons");
  });

  it("2. Updates existing headcount without creating duplicates", async () => {
    const updated = await WorkforceHeadcountService.saveRecord(
      testOrgId,
      {
        siteId: testSiteId,
        date: "2026-10-20",
        shift: "GENERAL",
        artisanCount: 7, // increased artisans
        craftsmanCount: 1, // added craftsman
        laborerMale: 4,
        laborerFemale: 2,
        contractorName: "Sharma Masons & Electricals",
        notes: "Reinforced team for slab work",
      },
      {
        userId: testUserId,
        name: "Test Supervisor",
        role: "SITE_SUPERVISOR",
      }
    );

    expect(updated.grandTotal).toBe(14);
    expect(updated.artisanCount).toBe(7);
    expect(updated.craftsmanCount).toBe(1);

    // Verify only ONE record exists in DB for this site/date/shift
    const count = await prisma.workforceHeadcount.count({
      where: {
        organizationId: testOrgId,
        siteId: testSiteId,
        date: "2026-10-20",
        shift: "GENERAL",
      },
    });

    expect(count).toBe(1);
  });

  it("3. Lists records scoped strictly to organization", async () => {
    const list = await WorkforceHeadcountService.listRecords(testOrgId, {
      siteId: testSiteId,
      date: "2026-10-20",
    });

    expect(list.length).toBe(1);
    expect(list[0].grandTotal).toBe(14);
    expect(list[0].siteName).toContain("Chaupasni");

    // Other orgs cannot see it
    const otherOrgList = await WorkforceHeadcountService.listRecords("unrelated-org-xyz", {
      siteId: testSiteId,
      date: "2026-10-20",
    });
    expect(otherOrgList.length).toBe(0);
  });

  it("4. Generates summary statistics correctly from database records", async () => {
    const summary = await WorkforceHeadcountService.getSummary(testOrgId, testSiteId, "2026-10-20");

    expect(summary.recordsCount).toBe(1);
    expect(summary.totalArtisan).toBe(7);
    expect(summary.totalCraftsman).toBe(1);
    expect(summary.totalLaborer).toBe(6);
    expect(summary.grandTotal).toBe(14);
  });

  it("5. Successfully deletes record from database and cleans up", async () => {
    const existing = await prisma.workforceHeadcount.findFirst({
      where: { organizationId: testOrgId, siteId: testSiteId },
    });
    expect(existing).not.toBeNull();

    const deleted = await WorkforceHeadcountService.deleteRecord(testOrgId, existing!.id);
    expect(deleted).toBe(true);

    const postCheck = await prisma.workforceHeadcount.findUnique({
      where: { id: existing!.id },
    });
    expect(postCheck).toBeNull();
  });

  it("6. Atomically saves bulk entries with contractor and direct workforce rates", async () => {
    // Create contractor party with daily wage rate
    const contractorParty = await prisma.party.create({
      data: {
        organizationId: testOrgId,
        name: "ABC Labour Services Pvt. Ltd.",
        type: "SUBCONTRACTOR",
        dailyWageRate: 90000, // ₹900
        maleHelperWageRate: 60000, // ₹600
        femaleHelperWageRate: 50000, // ₹500
      },
    });

    // 1 Contractor entry + 1 Direct entry
    const bulkResults = await WorkforceHeadcountService.saveBulkRecords(
      testOrgId,
      [
        {
          siteId: testSiteId,
          date: "2026-11-12",
          shift: "GENERAL",
          source: "CONTRACTOR",
          contractorId: contractorParty.id,
          contractorName: contractorParty.name,
          artisanCount: 5,
          skilledRate: 90000,
          skilledAmount: 450000,
          laborerMale: 8,
          maleRate: 60000,
          maleAmount: 480000,
          laborerFemale: 3,
          femaleRate: 50000,
          femaleAmount: 150000,
          totalExpense: 1080000, // ₹10,800
          notes: "Main contractor crew",
        },
        {
          siteId: testSiteId,
          date: "2026-11-12",
          shift: "GENERAL",
          source: "DIRECT",
          artisanCount: 2,
          skilledRate: 100000, // ₹1,000
          skilledAmount: 200000,
          laborerMale: 3,
          maleRate: 65000, // ₹650
          maleAmount: 195000,
          laborerFemale: 1,
          femaleRate: 55000, // ₹550
          femaleAmount: 55000,
          totalExpense: 450000, // ₹4,500
          notes: "Extra Team",
        },
      ],
      {
        userId: testUserId,
        name: "Test Supervisor",
        role: "SITE_SUPERVISOR",
      }
    );

    expect(bulkResults.length).toBe(2);
    expect(bulkResults[0].source).toBe("CONTRACTOR");
    expect(bulkResults[0].totalExpense).toBe(1080000);
    expect(bulkResults[1].source).toBe("DIRECT");
    expect(bulkResults[1].totalExpense).toBe(450000);

    // Verify rate card retrieval
    const rates = await WorkforceHeadcountService.getContractorRates(testOrgId, contractorParty.name);
    expect(rates.hasRates).toBe(true);
    expect(rates.skilledRate).toBe(90000);
    expect(rates.maleRate).toBe(60000);
    expect(rates.femaleRate).toBe(50000);

    // Verify 7 reports generation
    const reports = await WorkforceHeadcountService.getLabourExpenseReports(testOrgId, {
      siteId: testSiteId,
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    });

    expect(reports.dailyReport.length).toBeGreaterThanOrEqual(1);
    expect(reports.contractorReport.length).toBeGreaterThanOrEqual(1);
    expect(reports.directReport.length).toBeGreaterThanOrEqual(1);
    expect(reports.skilledVsUnskilled.totalSkilledExpense).toBeGreaterThan(0);
    expect(reports.skilledVsUnskilled.totalUnskilledExpense).toBeGreaterThan(0);
    expect(reports.grandTotals.totalExpense).toBe(1530000); // ₹15,300 in paise
    expect(reports.grandTotals.totalWorkers).toBe(22); // 16 + 6
  });
});
