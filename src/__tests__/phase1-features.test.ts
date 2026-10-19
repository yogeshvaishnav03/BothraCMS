import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../lib/db";
import { hashPassword, createSessionToken, verifySessionToken } from "../lib/auth";
import { InventoryService } from "../services/inventory-service";
import { FinanceService } from "../services/finance-service";
import { AttendanceService } from "../services/attendance-service";

describe("Build Track Pro — Phase 1 Features & Integration Test Suite", () => {
  let testOrgId: string;
  let testAdminUserId: string;
  let testSupervisorUserId: string;
  let testSiteAId: string;
  let testSiteBId: string;
  let testStoreAId: string;
  let testStoreBId: string;
  let testMaterialId: string;
  let testVendorId: string;
  let testProjectId: string;

  beforeAll(async () => {
    // 1. Create Organization
    const org = await prisma.organization.create({
      data: {
        name: "Phase 1 Testing Construction Ltd",
        currency: "INR",
        timezone: "Asia/Kolkata",
      },
    });
    testOrgId = org.id;

    // 2. Create Users
    const pwdHash = await hashPassword("P1Pass123!");
    const admin = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Phase 1 Admin",
        email: `p1admin-${Date.now()}@p1test.com`,
        passwordHash: pwdHash,
        role: "ORG_ADMIN",
      },
    });
    testAdminUserId = admin.id;

    const supervisor = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Phase 1 Supervisor",
        email: `p1sup-${Date.now()}@p1test.com`,
        passwordHash: pwdHash,
        role: "SITE_SUPERVISOR",
      },
    });
    testSupervisorUserId = supervisor.id;

    // 3. Create Sites
    const siteA = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        name: "Metro Phase 1 Tower Site",
        code: `MET-${Date.now().toString().slice(-4)}`,
        address: "Site A Road, Sector 15",
      },
    });
    testSiteAId = siteA.id;

    const siteB = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        name: "Metro Phase 1 Depot Site",
        code: `DEP-${Date.now().toString().slice(-4)}`,
        address: "Site B Depot, Sector 22",
      },
    });
    testSiteBId = siteB.id;

    // 4. Create Stores
    const storeA = await prisma.store.create({
      data: {
        organizationId: testOrgId,
        siteId: testSiteAId,
        name: "Tower Central Store",
      },
    });
    testStoreAId = storeA.id;

    const storeB = await prisma.store.create({
      data: {
        organizationId: testOrgId,
        siteId: testSiteBId,
        name: "Depot Yard Store",
      },
    });
    testStoreBId = storeB.id;

    // 5. Create Material
    const material = await prisma.material.create({
      data: {
        organizationId: testOrgId,
        sku: `STEEL-${Date.now().toString().slice(-4)}`,
        name: "TMT Rebar 12mm",
        unitCode: "KG",
        minStockQty: 500,
      },
    });
    testMaterialId = material.id;

    // 6. Create Vendor Party
    const vendor = await prisma.party.create({
      data: {
        organizationId: testOrgId,
        name: "Tata Steel Distribution",
        partyType: "VENDOR",
      },
    });
    testVendorId = vendor.id;

    // 7. Create Project
    const project = await prisma.project.create({
      data: {
        organizationId: testOrgId,
        siteId: testSiteAId,
        name: "Metro Viaduct Pillar E",
        code: `PRJ-M-${Date.now().toString().slice(-4)}`,
        budgetAmount: 120000000,
      },
    });
    testProjectId = project.id;
  });

  afterAll(async () => {
    if (testOrgId) {
      await prisma.organization.delete({ where: { id: testOrgId } });
    }
  });

  // --- 1. AUTH & JWT SESSION INTEGRITY ---
  it("P1-1: JWT Session creation and verification with role scopes", async () => {
    const token = await createSessionToken({
      userId: testAdminUserId,
      organizationId: testOrgId,
      email: "p1admin@test.com",
      name: "Phase 1 Admin",
      role: "ORG_ADMIN",
    });

    expect(token).toBeDefined();
    expect(typeof token).toBe("string");

    const decoded = await verifySessionToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe(testAdminUserId);
    expect(decoded?.organizationId).toBe(testOrgId);
    expect(decoded?.role).toBe("ORG_ADMIN");

    // Invalid / tempered token rejection
    const invalidResult = await verifySessionToken("tampered.jwt.token");
    expect(invalidResult).toBeNull();
  });

  // --- 2. MATERIALS STOCK TRANSFERS ---
  it("P1-2: Stock Transfer requires positive balance, rejects same store, updates balances atomically", async () => {
    // 1. Initial receipt of 1000 kg rebar into Store A
    await InventoryService.receiveGoods({
      organizationId: testOrgId,
      storeId: testStoreAId,
      vendorPartyId: testVendorId,
      referenceDoc: "DC-TATA-001",
      notes: "Stock delivery",
      items: [{ materialId: testMaterialId, quantity: 1000, unitRate: 6500 }],
      userId: testAdminUserId,
      role: "ORG_ADMIN",
    });

    // 2. Reject transfer if source and target stores are the same
    await expect(
      InventoryService.transferGoods({
        organizationId: testOrgId,
        sourceStoreId: testStoreAId,
        targetStoreId: testStoreAId, // SAME STORE
        materialId: testMaterialId,
        quantity: 200,
        userId: testAdminUserId,
        role: "ORG_ADMIN",
      })
    ).rejects.toThrow(/cannot be identical/);

    // 3. Reject transfer if quantity exceeds available stock (e.g. 5000 kg when only 1000 available)
    await expect(
      InventoryService.transferGoods({
        organizationId: testOrgId,
        sourceStoreId: testStoreAId,
        targetStoreId: testStoreBId,
        materialId: testMaterialId,
        quantity: 5000,
        userId: testAdminUserId,
        role: "ORG_ADMIN",
      })
    ).rejects.toThrow(/Insufficient stock/);

    // 4. Successful transfer of 350 kg from Store A to Store B
    const transfer = await InventoryService.transferGoods({
      organizationId: testOrgId,
      sourceStoreId: testStoreAId,
      targetStoreId: testStoreBId,
      materialId: testMaterialId,
      quantity: 350,
      notes: "Dispatch to Depot for fabrication",
      userId: testAdminUserId,
      role: "ORG_ADMIN",
    });

    expect(transfer.success).toBe(true);
    expect(transfer.sourceRemaining).toBe(650);

    // Verify database balances in both stores
    const sourceBal = await prisma.stockBalance.findUnique({
      where: { materialId_storeId: { materialId: testMaterialId, storeId: testStoreAId } },
    });
    const targetBal = await prisma.stockBalance.findUnique({
      where: { materialId_storeId: { materialId: testMaterialId, storeId: testStoreBId } },
    });

    expect(sourceBal?.quantityOnHand).toBe(650);
    expect(targetBal?.quantityOnHand).toBe(350);

    // Verify stock movements recorded
    const movements = await prisma.stockMovement.findMany({
      where: {
        organizationId: testOrgId,
        materialId: testMaterialId,
        movementType: { in: ["TRANSFER_IN", "TRANSFER_OUT"] },
      },
    });
    expect(movements.length).toBe(2); // One OUT (-350) and one IN (+350)
  });

  // --- 3. FINANCE BILL RECORDING ---
  it("P1-3: Bill creation with multiple line items, tax, and ledger attribution", async () => {
    const billNumber = `INV-TATA-${Date.now()}`;
    const bill = await FinanceService.createBill({
      organizationId: testOrgId,
      partyId: testVendorId,
      projectId: testProjectId,
      billNumber,
      billDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days credit
      lines: [
        {
          description: "High tensile TMT bars 12mm",
          materialId: testMaterialId,
          quantity: 200,
          unitRate: 6500, // 65.00 INR
          lineTotal: 1300000, // 13,000 INR (1,300,000 paise)
        },
        {
          description: "Freight and offloading surcharge",
          lineTotal: 200000, // 2,000 INR (200,000 paise)
        },
      ],
      userId: testAdminUserId,
      role: "ORG_ADMIN",
    });

    expect(bill.id).toBeDefined();
    expect(bill.billNumber).toBe(billNumber);
    expect(bill.totalAmount).toBe(1500000); // 15,000 INR
    expect(bill.lines.length).toBe(2);

    // Statement balance should reflect 15,000 INR billed and unpaid
    const statement = await FinanceService.getPartyStatement(testOrgId, testVendorId);
    expect(statement.totalBilled).toBe(1500000);
    expect(statement.outstandingBalance).toBe(1500000);
  });

  // --- 4. WORKFORCE REGISTRATION & MULTI-SITE ATTENDANCE ---
  it("P1-4: Worker registration with wage and site-scoped check-in", async () => {
    // 1. Register a new worker with daily wage rate
    const worker = await prisma.workforceMember.create({
      data: {
        organizationId: testOrgId,
        name: "Sunil Verma",
        employeeCode: `WRK-${Date.now().toString().slice(-4)}`,
        phone: "+919876543210",
        workerType: "CARPENTER",
        dailyWageRate: 85000, // 850.00 INR
        defaultSiteId: testSiteAId,
      },
    });

    expect(worker.id).toBeDefined();
    expect(worker.workerType).toBe("CARPENTER");
    expect(worker.dailyWageRate).toBe(85000);

    // 2. Perform check-in at Site A
    const today = new Date().toISOString().split("T")[0];
    const session = await AttendanceService.checkIn({
      organizationId: testOrgId,
      workforceMemberId: worker.id,
      siteId: testSiteAId,
      workDate: today,
      latitude: 28.5355,
      longitude: 77.3910,
      notes: "Checked in via Supervisor App",
      userId: testSupervisorUserId,
      role: "SITE_SUPERVISOR",
    });

    expect(session.status).toBe("PRESENT");
    expect(session.workforceMemberId).toBe(worker.id);
    expect(session.siteId).toBe(testSiteAId);

    // 3. Perform check-out
    const checkOutResult = await AttendanceService.checkOut({
      organizationId: testOrgId,
      sessionId: session.id,
      notes: "Shift complete - full day",
      userId: testSupervisorUserId,
      role: "SITE_SUPERVISOR",
    });

    expect(checkOutResult.checkOutAt).not.toBeNull();
  });

  it("P1-4b: User 1-click self check-in and check-out with GPS coordinates and automatic session resolution", async () => {
    // 1. User checks in without specifying workforceMemberId or siteId
    const today = new Date().toISOString().split("T")[0];
    const selfSession = await AttendanceService.checkIn({
      organizationId: testOrgId,
      workDate: today,
      latitude: 28.6139,
      longitude: 77.2090,
      accuracyM: 5.0,
      userId: testSupervisorUserId,
      role: "SITE_SUPERVISOR",
    });

    expect(selfSession).toBeDefined();
    expect(selfSession.checkInAt).toBeDefined();
    expect(selfSession.checkInLat).toBe(28.6139);
    expect(selfSession.checkInLng).toBe(77.2090);
    expect(selfSession.checkOutAt).toBeNull();
    expect(selfSession.createdBy).toBe(testSupervisorUserId);

    // 2. User checks out without specifying sessionId - service auto-resolves today's session
    const selfCheckOut = await AttendanceService.checkOut({
      organizationId: testOrgId,
      latitude: 28.6140,
      longitude: 77.2091,
      accuracyM: 4.5,
      userId: testSupervisorUserId,
      role: "SITE_SUPERVISOR",
    });

    expect(selfCheckOut.id).toBe(selfSession.id);
    expect(selfCheckOut.checkOutAt).not.toBeNull();
    expect(selfCheckOut.checkOutLat).toBe(28.6140);
    expect(selfCheckOut.checkOutLng).toBe(77.2091);
  });

  // --- 5. DAILY SITE REPORT PERSISTENCE ---
  it("P1-5: Daily site report creation, site-scoping, and supervisor auditing", async () => {
    const today = new Date().toISOString().split("T")[0];
    const dailyReport = await prisma.dailySiteReport.create({
      data: {
        organizationId: testOrgId,
        projectId: testProjectId,
        reportDate: today,
        progress: "Completed column casting for pier P1 to P4. Rebar tying started on pier P5.",
        blockers: "Concrete transit mixer delayed by 45 minutes due to highway traffic.",
        safetyNotes: "All workers equipped with safety harnesses and helmets. No incidents.",
        createdBy: testSupervisorUserId,
      },
    });

    expect(dailyReport.id).toBeDefined();
    expect(dailyReport.progress).toContain("Completed column casting");
    expect(dailyReport.safetyNotes).toContain("safety harnesses");
    expect(dailyReport.projectId).toBe(testProjectId);

    // Verify querying daily reports scoped to project & organization
    const siteReports = await prisma.dailySiteReport.findMany({
      where: { organizationId: testOrgId, projectId: testProjectId },
      include: { project: true, creator: true },
    });
    expect(siteReports.length).toBeGreaterThanOrEqual(1);
    expect(siteReports[0].project.name).toBe("Metro Viaduct Pillar E");
    expect(siteReports[0].creator.id).toBe(testSupervisorUserId);
  });
});
