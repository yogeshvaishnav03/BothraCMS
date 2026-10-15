import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../lib/db";
import { hashPassword, createSessionToken, verifySessionToken } from "../lib/auth";
import { InventoryService } from "../services/inventory-service";
import { FinanceService } from "../services/finance-service";
import { AttendanceService } from "../services/attendance-service";
import { MeasurementBookService } from "../services/measurement-book-service";
import { checkRateLimit, resetRateLimit } from "../lib/rate-limiter";

describe("Build Track Pro — Security Audit & Phase 2 Invariants Test Suite", () => {
  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;
  let siteAId: string;
  let siteBId: string;
  let storeAId: string;
  let storeBId: string;
  let materialAId: string;
  let materialBId: string;
  let partyAId: string;
  let projectAId: string;
  let workerAId: string;

  beforeAll(async () => {
    // 1. Create Organization A
    const orgA = await prisma.organization.create({
      data: { name: "Apex Builders Org A", currency: "INR", timezone: "Asia/Kolkata" },
    });
    orgAId = orgA.id;

    // 2. Create Organization B (Tenant Isolation Test)
    const orgB = await prisma.organization.create({
      data: { name: "Zenith Infra Org B", currency: "INR", timezone: "Asia/Kolkata" },
    });
    orgBId = orgB.id;

    // 3. Create Users
    const pwdHash = await hashPassword("SecurePass123!");
    const userA = await prisma.user.create({
      data: {
        organizationId: orgAId,
        name: "Admin User A",
        email: `admin-a-${Date.now()}@apexa.com`,
        passwordHash: pwdHash,
        role: "ORG_ADMIN",
      },
    });
    userAId = userA.id;

    const userB = await prisma.user.create({
      data: {
        organizationId: orgBId,
        name: "Admin User B",
        email: `admin-b-${Date.now()}@zenithb.com`,
        passwordHash: pwdHash,
        role: "ORG_ADMIN",
      },
    });
    userBId = userB.id;

    // 4. Create Sites
    const siteA = await prisma.site.create({
      data: { organizationId: orgAId, name: "Site Alpha", code: `S-A-${Date.now().toString().slice(-4)}`, address: "Sector 1" },
    });
    siteAId = siteA.id;

    const siteB = await prisma.site.create({
      data: { organizationId: orgBId, name: "Site Beta", code: `S-B-${Date.now().toString().slice(-4)}`, address: "Sector 2" },
    });
    siteBId = siteB.id;

    // 5. Create Stores
    const storeA = await prisma.store.create({
      data: { organizationId: orgAId, siteId: siteAId, name: "Store Alpha" },
    });
    storeAId = storeA.id;

    const storeB = await prisma.store.create({
      data: { organizationId: orgBId, siteId: siteBId, name: "Store Beta" },
    });
    storeBId = storeB.id;

    // 6. Create Materials
    const materialA = await prisma.material.create({
      data: { organizationId: orgAId, sku: `MAT-A-${Date.now()}`, name: "Cement Grade 53", unitCode: "BAG", minStockQty: 100 },
    });
    materialAId = materialA.id;

    const materialB = await prisma.material.create({
      data: { organizationId: orgBId, sku: `MAT-B-${Date.now()}`, name: "Bricks Clay Red", unitCode: "NOS", minStockQty: 500 },
    });
    materialBId = materialB.id;

    // 7. Create Party in Org A
    const partyA = await prisma.party.create({
      data: { organizationId: orgAId, name: "Alpha Steel & Brick Supplies", partyType: "VENDOR" },
    });
    partyAId = partyA.id;

    // 8. Create Project in Org A
    const projectA = await prisma.project.create({
      data: { organizationId: orgAId, siteId: siteAId, name: "Tower Alpha One", code: `PRJ-A-${Date.now().toString().slice(-4)}` },
    });
    projectAId = projectA.id;

    // 9. Create Worker in Org A
    const workerA = await prisma.workforceMember.create({
      data: { organizationId: orgAId, name: "Ramesh Mason", employeeCode: `EMP-A-${Date.now().toString().slice(-4)}`, workerType: "MASON", defaultSiteId: siteAId },
    });
    workerAId = workerA.id;

    // Seed stock into Store A for Org A
    await InventoryService.receiveGoods({
      organizationId: orgAId,
      storeId: storeAId,
      vendorPartyId: partyAId,
      items: [{ materialId: materialAId, quantity: 50, unitRate: 40000 }],
      userId: userAId,
      role: "ORG_ADMIN",
    });
  });

  afterAll(async () => {
    if (orgAId) await prisma.organization.delete({ where: { id: orgAId } });
    if (orgBId) await prisma.organization.delete({ where: { id: orgBId } });
  });

  // --- 1. CROSS-ORGANIZATION IDOR ATTEMPTS ---
  it("SEC-1: Cross-organization stock transfer is strictly rejected", async () => {
    // Org A user tries to transfer material from Store A into Org B's Store B
    await expect(
      InventoryService.transferGoods({
        organizationId: orgAId,
        sourceStoreId: storeAId,
        targetStoreId: storeBId, // ORG B STORE!
        materialId: materialAId,
        quantity: 5,
        userId: userAId,
        role: "ORG_ADMIN",
      })
    ).rejects.toThrow(/Target store not found or outside organization scope/);

    // Org A user tries to transfer from Org B's store
    await expect(
      InventoryService.transferGoods({
        organizationId: orgAId,
        sourceStoreId: storeBId, // ORG B STORE!
        targetStoreId: storeAId,
        materialId: materialAId,
        quantity: 5,
        userId: userAId,
        role: "ORG_ADMIN",
      })
    ).rejects.toThrow(/Source store not found or outside organization scope/);
  });

  it("SEC-2: Cross-organization workforce check-in is strictly rejected", async () => {
    const today = new Date().toISOString().split("T")[0];

    // Org A supervisor tries to check in worker into Org B's site
    await expect(
      AttendanceService.checkIn({
        organizationId: orgAId,
        workforceMemberId: workerAId,
        siteId: siteBId, // ORG B SITE!
        workDate: today,
        userId: userAId,
        role: "SITE_SUPERVISOR",
      })
    ).rejects.toThrow(/Site not found or outside organization scope/);
  });

  it("SEC-3: Cross-organization bill creation rejects unauthorized project/material links", async () => {
    // Org A user tries to bill against Org B's material
    await expect(
      FinanceService.createBill({
        organizationId: orgAId,
        partyId: partyAId,
        billNumber: `BILL-SEC-${Date.now()}`,
        billDate: new Date(),
        lines: [
          {
            description: "Illegal link to competitor stock",
            materialId: materialBId, // ORG B MATERIAL!
            lineTotal: 100000,
          },
        ],
        userId: userAId,
        role: "ORG_ADMIN",
      })
    ).rejects.toThrow(/Material .* not found or outside organization scope/);
  });

  // --- 2. AUTHENTICATION & FORGED IDENTITY HEADERS ---
  it("SEC-4: Tampered JWT token is rejected by session verifier", async () => {
    const validToken = await createSessionToken({
      userId: userAId,
      organizationId: orgAId,
      email: "test@apexa.com",
      name: "Admin A",
      role: "ORG_ADMIN",
    });

    // Tamper the payload
    const tamperedToken = validToken.slice(0, -6) + "xxxxxx";
    const result = await verifySessionToken(tamperedToken);
    expect(result).toBeNull();
  });

  it("SEC-5: Login rate limiter blocks brute force attempts after 5 attempts", () => {
    const testKey = `login:192.168.1.100:victim-${Date.now()}@test.com`;
    resetRateLimit(testKey);

    // Attempts 1 to 5 should be allowed
    for (let i = 1; i <= 5; i++) {
      const res = checkRateLimit(testKey, 5, 60000);
      expect(res.allowed).toBe(true);
    }

    // Attempt 6 must be blocked
    const blockedRes = checkRateLimit(testKey, 5, 60000);
    expect(blockedRes.allowed).toBe(false);
    expect(blockedRes.retryAfterSeconds).toBeGreaterThan(0);

    // Clean up
    resetRateLimit(testKey);
  });

  // --- 3. ROLE-BASED ACCESS CONTROL ENFORCEMENT ---
  it("SEC-6: Unauthorized role is rejected from executing financial payment reversal", async () => {
    // SITE_SUPERVISOR role attempting finance:reverse must throw permission denial
    await expect(
      FinanceService.reversePayment({
        organizationId: orgAId,
        paymentId: "dummy-payment-id",
        reason: "Unauthorized supervisor reversal",
        userId: userAId,
        role: "SITE_SUPERVISOR", // Role lacking finance:reverse permission!
      })
    ).rejects.toThrow(/Forbidden: Role SITE_SUPERVISOR lacks required permission/);
  });

  // --- 4. MEASUREMENT BOOK (MB BOOK) WORKFLOW & INVARIANTS ---
  it("P2-1: Measurement Book computes cubic/square dimensions and strictly blocks billing unapproved entries", async () => {
    // 1. Create a Subcontractor MB Entry (Excavation work: 2 trenches, 10m length, 3m breadth, 1.5m depth @ ₹450 / CUM)
    // Quantity = 2 * 10 * 3 * 1.5 = 90 CUM
    // Total Amount = 90 * 45000 paise = 4,050,000 paise (₹40,500.00)
    const entry = await MeasurementBookService.createEntry({
      organizationId: orgAId,
      projectId: projectAId,
      partyId: partyAId,
      itemDescription: "Earthwork excavation in foundation trenches",
      unit: "CUM",
      count: 2,
      length: 10,
      breadth: 3,
      depth: 1.5,
      agreedRate: 45000, // 450.00 INR
      notes: "Trench 1 and Trench 2 completed as per drawing",
      userId: userAId,
      role: "PROJECT_MANAGER",
    });

    expect(entry.quantity).toBe(90);
    expect(entry.totalAmount).toBe(4050000);
    expect(entry.status).toBe("SUBMITTED");

    // 2. INVARIANT CHECK: Unapproved entry CANNOT be converted into a bill
    await expect(
      MeasurementBookService.convertToBill({
        organizationId: orgAId,
        entryId: entry.id,
        billNumber: `BILL-MB-${Date.now()}`,
        userId: userAId,
        role: "ORG_ADMIN",
      })
    ).rejects.toThrow(/Cannot bill unapproved measurement book entry/);

    // 3. Manager verifies and approves measurement
    const verified = await MeasurementBookService.updateStatus({
      organizationId: orgAId,
      entryId: entry.id,
      status: "VERIFIED",
      notes: "Physical site dimensions cross-checked with laser tape",
      userId: userAId,
      role: "PROJECT_MANAGER",
    });
    expect(verified.status).toBe("VERIFIED");

    const approved = await MeasurementBookService.updateStatus({
      organizationId: orgAId,
      entryId: entry.id,
      status: "APPROVED",
      notes: "Approved for billing",
      userId: userAId,
      role: "ORG_ADMIN",
    });
    expect(approved.status).toBe("APPROVED");

    // 4. Convert approved MB record into authoritative Bill
    const billNumber = `MB-BILL-${Date.now()}`;
    const result = await MeasurementBookService.convertToBill({
      organizationId: orgAId,
      entryId: entry.id,
      billNumber,
      userId: userAId,
      role: "ORG_ADMIN",
    });

    expect(result.entry.status).toBe("BILLED");
    expect(result.bill.totalAmount).toBe(4050000);
    expect(result.bill.billNumber).toBe(billNumber);

    // 5. Verify vendor account reflects the newly posted subcontractor bill
    const statement = await FinanceService.getPartyStatement(orgAId, partyAId);
    expect(statement.totalBilled).toBeGreaterThanOrEqual(4050000);
  });
});
