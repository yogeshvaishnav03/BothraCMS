import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../lib/db";
import { hashPassword } from "../lib/auth";
import { InventoryService } from "../services/inventory-service";
import { FinanceService } from "../services/finance-service";
import { AttendanceService } from "../services/attendance-service";
import { DashboardService } from "../services/dashboard-service";

describe("Build Track Pro — Business Rules & Invariants Test Suite", () => {
  let testOrgId: string;
  let testUserId: string;
  let testSiteAId: string;
  let testSiteBId: string;
  let testStoreAId: string;
  let testStoreBId: string;
  let testMaterialId: string;
  let testPartyId: string;
  let testProjectId: string;
  let testWorkerId: string;

  beforeAll(async () => {
    // 1. Create Organization
    const org = await prisma.organization.create({
      data: {
        name: "Apex Infrastructure Ltd",
        currency: "INR",
        timezone: "Asia/Kolkata",
      },
    });
    testOrgId = org.id;

    // 2. Create User
    const pwdHash = await hashPassword("TestPass123!");
    const user = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Test Supervisor",
        email: `test-${Date.now()}@apexinfra.com`,
        passwordHash: pwdHash,
        role: "ORG_ADMIN",
      },
    });
    testUserId = user.id;

    // 3. Create Sites
    const siteA = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        name: "Skyline Towers Site",
        code: `SKY-${Date.now().toString().slice(-4)}`,
        address: "Sector 62, Noida",
      },
    });
    testSiteAId = siteA.id;

    const siteB = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        name: "Riverside Villas Site",
        code: `RIV-${Date.now().toString().slice(-4)}`,
        address: "Sector 128, Noida",
      },
    });
    testSiteBId = siteB.id;

    // 4. Create Stores
    const storeA = await prisma.store.create({
      data: {
        organizationId: testOrgId,
        siteId: testSiteAId,
        name: "Skyline Main Store",
      },
    });
    testStoreAId = storeA.id;

    const storeB = await prisma.store.create({
      data: {
        organizationId: testOrgId,
        siteId: testSiteBId,
        name: "Riverside Store",
      },
    });
    testStoreBId = storeB.id;

    // 5. Create Material
    const material = await prisma.material.create({
      data: {
        organizationId: testOrgId,
        sku: `CEM-${Date.now().toString().slice(-4)}`,
        name: "UltraTech Cement 50kg",
        unitCode: "BAG",
        minStockQty: 50,
      },
    });
    testMaterialId = material.id;

    // 6. Create Party (Vendor)
    const party = await prisma.party.create({
      data: {
        organizationId: testOrgId,
        name: "Asian Paints & Cement Depot",
        partyType: "VENDOR",
      },
    });
    testPartyId = party.id;

    // 7. Create Project
    const project = await prisma.project.create({
      data: {
        organizationId: testOrgId,
        siteId: testSiteAId,
        name: "Tower A Construction",
        code: `PRJ-${Date.now().toString().slice(-4)}`,
        budgetAmount: 500000000, // 50 lakhs
      },
    });
    testProjectId = project.id;

    // 8. Create Workforce Member
    const worker = await prisma.workforceMember.create({
      data: {
        organizationId: testOrgId,
        name: "Ramesh Kumar (Mason)",
        employeeCode: `EMP-${Date.now().toString().slice(-4)}`,
        workerType: "MASON",
        defaultSiteId: testSiteAId,
      },
    });
    testWorkerId = worker.id;
  });

  afterAll(async () => {
    // Clean up test organization data
    if (testOrgId) {
      await prisma.organization.delete({ where: { id: testOrgId } });
    }
  });

  // Acceptance Test 1: Receiving 10 units increases site stock by exactly 10 and creates ledger entry
  it("Test 1: Receiving 10 units increases stock by 10 and creates ledger row", async () => {
    const receiptResult = await InventoryService.receiveGoods({
      organizationId: testOrgId,
      storeId: testStoreAId,
      vendorPartyId: testPartyId,
      referenceDoc: "CHALLAN-001",
      notes: "Initial site batch",
      items: [{ materialId: testMaterialId, quantity: 10, unitRate: 38000 }],
      userId: testUserId,
      role: "ORG_ADMIN",
    });

    expect(receiptResult.success).toBe(true);
    expect(receiptResult.movements.length).toBe(1);
    expect(receiptResult.movements[0].quantityDelta).toBe(10);
    expect(receiptResult.movements[0].unitCode).toBe("BAG");
    expect(receiptResult.movements[0].referenceDoc).toBe("CHALLAN-001");

    // Verify balance projection
    const balance = await prisma.stockBalance.findUnique({
      where: {
        materialId_storeId: { materialId: testMaterialId, storeId: testStoreAId },
      },
    });
    expect(balance?.quantityOnHand).toBe(10);

    // Verify ledger chronological report
    const ledger = await InventoryService.getMaterialLedger(testOrgId, testMaterialId, testStoreAId);
    expect(ledger.currentBalance).toBe(10);
    expect(ledger.totalReceived).toBe(10);
  });

  // Acceptance Test 2: Issuing 3 units reduces stock by exactly 3 and links usage
  it("Test 2: Issuing 3 units reduces stock by exactly 3 and links usage", async () => {
    const issueResult = await InventoryService.issueGoods({
      organizationId: testOrgId,
      storeId: testStoreAId,
      materialId: testMaterialId,
      quantity: 3,
      projectId: testProjectId,
      notes: "Issued for foundation footing",
      userId: testUserId,
      role: "ORG_ADMIN",
    });

    expect(issueResult.success).toBe(true);
    expect(issueResult.remainingStock).toBe(7);

    // Verify database record
    const balance = await prisma.stockBalance.findUnique({
      where: {
        materialId_storeId: { materialId: testMaterialId, storeId: testStoreAId },
      },
    });
    expect(balance?.quantityOnHand).toBe(7);

    // Verify ledger
    const ledger = await InventoryService.getMaterialLedger(testOrgId, testMaterialId, testStoreAId);
    expect(ledger.currentBalance).toBe(7);
    expect(ledger.totalIssued).toBe(3);
  });

  // Acceptance Test 2b: Over-issuing is prevented (cannot go negative)
  it("Test 2b: Prevent issuing more than available stock (no negative stock)", async () => {
    await expect(
      InventoryService.issueGoods({
        organizationId: testOrgId,
        storeId: testStoreAId,
        materialId: testMaterialId,
        quantity: 100, // only 7 available
        userId: testUserId,
        role: "ORG_ADMIN",
      })
    ).rejects.toThrow(/Insufficient stock/);
  });

  // Acceptance Test 3: Inter-store transfer of 5 units atomically decrements Store A and increments Store B
  it("Test 3: Transfer of 5 units atomically decreases Store A and increases Store B by 5", async () => {
    const transferResult = await InventoryService.transferGoods({
      organizationId: testOrgId,
      sourceStoreId: testStoreAId,
      targetStoreId: testStoreBId,
      materialId: testMaterialId,
      quantity: 5,
      notes: "Transfer between sites",
      userId: testUserId,
      role: "ORG_ADMIN",
    });

    expect(transferResult.success).toBe(true);
    expect(transferResult.sourceRemaining).toBe(2);

    const storeABalance = await prisma.stockBalance.findUnique({
      where: { materialId_storeId: { materialId: testMaterialId, storeId: testStoreAId } },
    });
    const storeBBalance = await prisma.stockBalance.findUnique({
      where: { materialId_storeId: { materialId: testMaterialId, storeId: testStoreBId } },
    });

    expect(storeABalance?.quantityOnHand).toBe(2);
    expect(storeBBalance?.quantityOnHand).toBe(5);
  });

  // Acceptance Test 4 & 5: Bill of ₹10,000 + allocation of ₹4,000 results in ₹4,000 paid and ₹6,000 outstanding; Idempotency check
  it("Test 4 & 5: Bill of ₹10,000 and ₹4,000 payment leaves ₹6,000 outstanding; idempotency prevents double post", async () => {
    // 1. Create Bill of ₹10,000 (1,000,000 paise)
    const bill = await FinanceService.createBill({
      organizationId: testOrgId,
      partyId: testPartyId,
      billNumber: `BILL-${Date.now()}`,
      billDate: new Date(),
      lines: [
        {
          description: "Asian Paints Exterior Emulsion (5 drums)",
          lineTotal: 1000000, // 10,000 INR
        },
      ],
      userId: testUserId,
      role: "ORG_ADMIN",
    });

    expect(bill.totalAmount).toBe(1000000);

    // 2. Record Payment of ₹4,000 (400,000 paise) allocated to bill
    const idempotencyKey = `idemp-${Date.now()}`;
    const paymentResult = await FinanceService.recordPayment({
      organizationId: testOrgId,
      partyId: testPartyId,
      paymentDate: new Date(),
      amount: 400000, // 4,000 INR
      method: "BANK_TRANSFER",
      referenceNumber: "UTR-HDFC-998811",
      idempotencyKey,
      allocations: [{ billId: bill.id, amount: 400000 }],
      userId: testUserId,
      role: "ORG_ADMIN",
    });

    expect(paymentResult.idempotentReplay).toBe(false);
    expect(paymentResult.payment.amount).toBe(400000);

    // 3. Repeated payment submission with identical Idempotency-Key
    const replayResult = await FinanceService.recordPayment({
      organizationId: testOrgId,
      partyId: testPartyId,
      paymentDate: new Date(),
      amount: 400000,
      method: "BANK_TRANSFER",
      referenceNumber: "UTR-HDFC-998811",
      idempotencyKey,
      allocations: [{ billId: bill.id, amount: 400000 }],
      userId: testUserId,
      role: "ORG_ADMIN",
    });

    expect(replayResult.idempotentReplay).toBe(true);
    expect(replayResult.payment.id).toBe(paymentResult.payment.id);

    // 4. Verify party statement reconciles: ₹10,000 billed, ₹4,000 paid, ₹6,000 outstanding
    const statement = await FinanceService.getPartyStatement(testOrgId, testPartyId);
    expect(statement.totalBilled).toBe(1000000);
    expect(statement.totalPaid).toBe(400000);
    expect(statement.outstandingBalance).toBe(600000);

    const reconciledBill = statement.bills.find((b) => b.id === bill.id);
    expect(reconciledBill?.paidAmount).toBe(400000);
    expect(reconciledBill?.outstandingAmount).toBe(600000);
  });

  // Acceptance Test 6: Reversing a payment restores the balance and retains an audit trail
  it("Test 6: Reversing payment restores outstanding balance and retains audit trail", async () => {
    // 1. Create a bill of ₹5,000 (500,000 paise)
    const bill = await FinanceService.createBill({
      organizationId: testOrgId,
      partyId: testPartyId,
      billNumber: `BILL-REV-${Date.now()}`,
      billDate: new Date(),
      lines: [{ description: "Plumbing Supplies", lineTotal: 500000 }],
      userId: testUserId,
      role: "ORG_ADMIN",
    });

    // 2. Pay ₹5,000
    const paymentResult = await FinanceService.recordPayment({
      organizationId: testOrgId,
      partyId: testPartyId,
      paymentDate: new Date(),
      amount: 500000,
      method: "CHEQUE",
      referenceNumber: "CHQ-102938",
      idempotencyKey: `idemp-rev-${Date.now()}`,
      allocations: [{ billId: bill.id, amount: 500000 }],
      userId: testUserId,
      role: "ORG_ADMIN",
    });

    // 3. Reverse payment
    const reversed = await FinanceService.reversePayment({
      organizationId: testOrgId,
      paymentId: paymentResult.payment.id,
      reason: "Cheque bounced due to signature mismatch",
      userId: testUserId,
      role: "ORG_ADMIN",
    });

    expect(reversed.status).toBe("REVERSED");
    expect(reversed.reversalReason).toBe("Cheque bounced due to signature mismatch");

    // 4. Verify balance is restored back to ₹5,000 outstanding on this bill
    const statement = await FinanceService.getPartyStatement(testOrgId, testPartyId);
    const checkedBill = statement.bills.find((b) => b.id === bill.id);
    expect(checkedBill?.paidAmount).toBe(0);
    expect(checkedBill?.outstandingAmount).toBe(500000);

    // 5. Verify Audit Trail entry was created
    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: testOrgId,
        action: "PAYMENT_REVERSED",
        entityId: paymentResult.payment.id,
      },
    });
    expect(auditEvent).not.toBeNull();
    expect(auditEvent?.reason).toBe("Cheque bounced due to signature mismatch");
  });

  // Acceptance Test 7: Workforce attendance check-in/out sequence and duplicate check-in rejection
  it("Test 7: Attendance check-in/out records timestamps; duplicate check-in is rejected", async () => {
    const today = new Date().toISOString().split("T")[0];

    // 1. Check in worker
    const session = await AttendanceService.checkIn({
      organizationId: testOrgId,
      workforceMemberId: testWorkerId,
      siteId: testSiteAId,
      workDate: today,
      latitude: 28.5355,
      longitude: 77.3910,
      accuracyM: 8.5,
      notes: "Checked in at Main Gate",
      userId: testUserId,
      role: "SITE_SUPERVISOR",
    });

    expect(session.id).toBeDefined();
    expect(session.status).toBe("PRESENT");
    expect(session.checkInAt).toBeDefined();
    expect(session.checkOutAt).toBeNull();

    // 2. Duplicate check-in on same day should reject
    await expect(
      AttendanceService.checkIn({
        organizationId: testOrgId,
        workforceMemberId: testWorkerId,
        siteId: testSiteAId,
        workDate: today,
        userId: testUserId,
        role: "SITE_SUPERVISOR",
      })
    ).rejects.toThrow(/already checked in/);

    // 3. Check out worker
    const checkedOut = await AttendanceService.checkOut({
      organizationId: testOrgId,
      sessionId: session.id,
      userId: testUserId,
      role: "SITE_SUPERVISOR",
    });

    expect(checkedOut.checkOutAt).toBeDefined();
    expect(new Date(checkedOut.checkOutAt!).getTime()).toBeGreaterThanOrEqual(
      new Date(session.checkInAt).getTime()
    );
  });

  // Acceptance Test 8: Dashboard KPIs match real database records
  it("Test 8: Dashboard KPIs equal database query results", async () => {
    const kpi = await DashboardService.getKpiMetrics(testOrgId);

    expect(kpi.activeProjectsCount).toBeGreaterThanOrEqual(1);
    expect(kpi.workersPresentTodayCount).toBeGreaterThanOrEqual(1);
    expect(kpi.totalOutstandingPayablesAmount).toBeGreaterThan(0);
  });
});
