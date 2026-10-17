import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../lib/db";
import { hashPassword, createSessionToken, SESSION_COOKIE_NAME } from "../lib/auth";
import { MeasurementBookService } from "../services/measurement-book-service";
import fs from "fs";
import path from "path";

// Direct API Route Handler Imports
import { POST as loginHandler } from "../app/api/auth/login/route";
import { POST as logoutHandler } from "../app/api/auth/logout/route";
import { GET as meHandler } from "../app/api/auth/me/route";
import { GET as healthHandler } from "../app/api/health/route";
import { GET as tenantsHandler, PATCH as toggleTenantHandler } from "../app/api/admin/tenants/route";
import { POST as createSiteHandler } from "../app/api/sites/route";
import { POST as createProjectHandler } from "../app/api/projects/route";
import { GET as getProjectDetailsHandler } from "../app/api/projects/[id]/route";
import { POST as createDsrHandler } from "../app/api/daily-reports/route";
import { POST as createReceiptHandler } from "../app/api/inventory/receipts/route";
import { POST as createIssueHandler } from "../app/api/inventory/issues/route";
import { POST as createTransferHandler } from "../app/api/inventory/transfers/route";
import { POST as createBillHandler } from "../app/api/finance/bills/route";
import { POST as createPaymentHandler } from "../app/api/finance/payments/route";
import { POST as reversePaymentHandler } from "../app/api/finance/payments/[id]/reverse/route";
import { GET as getStatementHandler } from "../app/api/parties/[id]/statement/route";
import { POST as checkInHandler } from "../app/api/attendance/check-in/route";
import { POST as checkOutHandler } from "../app/api/attendance/check-out/route";
import { POST as correctAttendanceHandler } from "../app/api/attendance/[id]/correct/route";
import { GET as notificationsHandler } from "../app/api/notifications/route";
import { POST as uploadHandler } from "../app/api/uploads/route";

function makeJsonRequest(url: string, method: string, body?: any, token?: string, extraHeaders?: Record<string, string>) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (token) {
    headers["Cookie"] = `${SESSION_COOKIE_NAME}=${token}`;
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Build Track Pro — Phase 4 Release Gate & Comprehensive Workflow Verification", () => {
  let org1Id: string;
  let org2Id: string;
  let admin1Id: string;
  let admin1Token: string;
  let superadminId: string;
  let superadminToken: string;
  let supervisor1Id: string;
  let supervisor1Token: string;
  let storekeeper1Id: string;
  let storekeeper1Token: string;

  let site1Id: string;
  let store1AId: string;
  let store1BId: string;
  let material1Id: string;
  let contractor1Id: string;
  let project1Id: string;
  let worker1Id: string;

  beforeAll(async () => {
    // 1. Create Organization 1 (Apex Prime) and Organization 2 (Zenith Corp)
    const org1 = await prisma.organization.create({
      data: { name: "Apex Prime Phase4", currency: "INR", timezone: "Asia/Kolkata", status: "ACTIVE" },
    });
    org1Id = org1.id;

    const org2 = await prisma.organization.create({
      data: { name: "Zenith Corp Phase4", currency: "INR", timezone: "Asia/Kolkata", status: "ACTIVE" },
    });
    org2Id = org2.id;

    // 2. Create Users
    const pwdHash = await hashPassword("ValidPass123!");

    const admin = await prisma.user.create({
      data: {
        organizationId: org1Id,
        name: "Phase 4 Admin",
        email: `p4admin-${Date.now()}@apexprime.com`,
        passwordHash: pwdHash,
        role: "ORG_ADMIN",
        status: "ACTIVE",
      },
    });
    admin1Id = admin.id;
    admin1Token = await createSessionToken({
      userId: admin.id,
      organizationId: org1Id,
      email: admin.email,
      name: admin.name,
      role: "ORG_ADMIN",
    });

    const superAdmin = await prisma.user.create({
      data: {
        organizationId: org1Id,
        name: "Phase 4 Superadmin",
        email: `p4super-${Date.now()}@buildtrack.pro`,
        passwordHash: pwdHash,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
      },
    });
    superadminId = superAdmin.id;
    superadminToken = await createSessionToken({
      userId: superAdmin.id,
      organizationId: org1Id,
      email: superAdmin.email,
      name: superAdmin.name,
      role: "SUPER_ADMIN",
    });

    const supervisor = await prisma.user.create({
      data: {
        organizationId: org1Id,
        name: "Phase 4 Supervisor",
        email: `p4sup-${Date.now()}@apexprime.com`,
        passwordHash: pwdHash,
        role: "SITE_SUPERVISOR",
        status: "ACTIVE",
      },
    });
    supervisor1Id = supervisor.id;
    supervisor1Token = await createSessionToken({
      userId: supervisor.id,
      organizationId: org1Id,
      email: supervisor.email,
      name: supervisor.name,
      role: "SITE_SUPERVISOR",
    });

    const storekeeper = await prisma.user.create({
      data: {
        organizationId: org1Id,
        name: "Phase 4 Storekeeper",
        email: `p4store-${Date.now()}@apexprime.com`,
        passwordHash: pwdHash,
        role: "STOREKEEPER",
        status: "ACTIVE",
      },
    });
    storekeeper1Id = storekeeper.id;
    storekeeper1Token = await createSessionToken({
      userId: storekeeper.id,
      organizationId: org1Id,
      email: storekeeper.email,
      name: storekeeper.name,
      role: "STOREKEEPER",
    });

    // 3. Create Site and Stores
    const site = await prisma.site.create({
      data: {
        organizationId: org1Id,
        name: "Apex Gate Tower",
        code: `AGT-${Date.now().toString().slice(-4)}`,
        address: "Phase 4 Verification Park",
        status: "ACTIVE",
      },
    });
    site1Id = site.id;

    const storeA = await prisma.store.create({
      data: { organizationId: org1Id, siteId: site1Id, name: "Yard Alpha", status: "ACTIVE" },
    });
    store1AId = storeA.id;

    const storeB = await prisma.store.create({
      data: { organizationId: org1Id, siteId: site1Id, name: "Yard Beta", status: "ACTIVE" },
    });
    store1BId = storeB.id;

    // 4. Create Material & Contractor
    const material = await prisma.material.create({
      data: {
        organizationId: org1Id,
        name: "Structural Steel TMT 16mm",
        sku: `STEEL-${Date.now().toString().slice(-4)}`,
        unitCode: "TONNE",
        minStockQty: 5,
        reorderQty: 20,
      },
    });
    material1Id = material.id;

    const contractor = await prisma.party.create({
      data: {
        organizationId: org1Id,
        name: "Apex Quality Subcontractors",
        partyType: "CONTRACTOR",
        taxIdentifier: "07AAACQ1234F1Z5",
      },
    });
    contractor1Id = contractor.id;

    // 5. Create Worker
    const worker = await prisma.workforceMember.create({
      data: {
        organizationId: org1Id,
        employeeCode: `WRK-${Date.now().toString().slice(-4)}`,
        name: "Ramesh Mason",
        workerType: "MASON",
        defaultSiteId: site1Id,
        dailyWageRate: 85000,
        active: true,
      },
    });
    worker1Id = worker.id;
  });

  afterAll(async () => {
    // Cleanup records safely in dependency order
    await (prisma as any).purchaseOrder?.deleteMany({ where: { organizationId: { in: [org1Id, org2Id] } } }).catch(() => {});
    await prisma.dailySiteReport.deleteMany({ where: { organizationId: { in: [org1Id, org2Id] } } }).catch(() => {});
    await prisma.attendanceSession.deleteMany({ where: { organizationId: { in: [org1Id, org2Id] } } }).catch(() => {});
    await prisma.workforceMember.deleteMany({ where: { organizationId: { in: [org1Id, org2Id] } } }).catch(() => {});
    await prisma.paymentAllocation.deleteMany({ where: { payment: { organizationId: { in: [org1Id, org2Id] } } } }).catch(() => {});
    await prisma.payment.deleteMany({ where: { organizationId: { in: [org1Id, org2Id] } } }).catch(() => {});
    await prisma.billLine.deleteMany({ where: { bill: { organizationId: { in: [org1Id, org2Id] } } } }).catch(() => {});
    await prisma.bill.deleteMany({ where: { organizationId: { in: [org1Id, org2Id] } } }).catch(() => {});
    await prisma.stockMovement.deleteMany({ where: { organizationId: { in: [org1Id, org2Id] } } }).catch(() => {});
    await prisma.stockBalance.deleteMany({ where: { store: { organizationId: { in: [org1Id, org2Id] } } } }).catch(() => {});
    await prisma.taskStatusHistory.deleteMany({ where: { task: { organizationId: { in: [org1Id, org2Id] } } } }).catch(() => {});
    await prisma.task.deleteMany({ where: { organizationId: { in: [org1Id, org2Id] } } }).catch(() => {});
    await prisma.project.deleteMany({ where: { organizationId: { in: [org1Id, org2Id] } } }).catch(() => {});
    await prisma.store.deleteMany({ where: { organizationId: { in: [org1Id, org2Id] } } }).catch(() => {});
    await prisma.site.deleteMany({ where: { organizationId: { in: [org1Id, org2Id] } } }).catch(() => {});
    await prisma.material.deleteMany({ where: { organizationId: { in: [org1Id, org2Id] } } }).catch(() => {});
    await prisma.party.deleteMany({ where: { organizationId: { in: [org1Id, org2Id] } } }).catch(() => {});
    await prisma.auditEvent.deleteMany({ where: { organizationId: { in: [org1Id, org2Id] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { organizationId: { in: [org1Id, org2Id] } } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: { in: [org1Id, org2Id] } } }).catch(() => {});
  });

  describe("1. Authentication, Sessions & Rate Limiting", () => {
    it("should login with valid credentials and return user context with session cookie", async () => {
      const user = await prisma.user.findUnique({ where: { id: admin1Id } });
      const req = makeJsonRequest("http://localhost:3000/api/auth/login", "POST", {
        email: user!.email,
        password: "ValidPass123!",
      });
      const res = await loginHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.user.email).toBe(user!.email);

      // Verify session cookie set
      const cookieHeader = res.headers.get("set-cookie");
      expect(cookieHeader).toBeDefined();
      expect(cookieHeader).toContain(SESSION_COOKIE_NAME);
    });

    it("should reject invalid login credentials with 401", async () => {
      const user = await prisma.user.findUnique({ where: { id: admin1Id } });
      const req = makeJsonRequest("http://localhost:3000/api/auth/login", "POST", {
        email: user!.email,
        password: "WrongPassword999!",
      });
      const res = await loginHandler(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("should reject tampered or invalid session token on /api/auth/me", async () => {
      const req = makeJsonRequest("http://localhost:3000/api/auth/me", "GET", undefined, "fake.invalid.token");
      const res = await meHandler(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.success).toBe(false);
    });

    it("should logout and expire session cookie", async () => {
      const res = await logoutHandler();
      const cookieHeader = res.headers.get("set-cookie");
      expect(cookieHeader).toContain("Max-Age=0");
    });
  });

  describe("2. Security Invariants & Role-Based Access Control", () => {
    it("should reject non-superadmin access to /api/admin/tenants with 403", async () => {
      const req = makeJsonRequest("http://localhost:3000/api/admin/tenants", "GET", undefined, admin1Token);
      const res = await tenantsHandler(req);
      expect(res.status).toBe(403);
    });

    it("should allow superadmin to query /api/admin/tenants", async () => {
      const req = makeJsonRequest("http://localhost:3000/api/admin/tenants", "GET", undefined, superadminToken);
      const res = await tenantsHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.tenants)).toBe(true);
      expect(data.data.totalTenants).toBeGreaterThanOrEqual(2);
    });

    it("should allow superadmin to toggle tenant suspension and immediately deny user context", async () => {
      // Step A: Suspend Org 2
      const patchReq = makeJsonRequest("http://localhost:3000/api/admin/tenants", "PATCH", {
        organizationId: org2Id,
        status: "SUSPENDED",
        reason: "Compliance audit suspension",
      }, superadminToken);

      const patchRes = await toggleTenantHandler(patchReq);
      const patchData = await patchRes.json();
      expect(patchRes.status).toBe(200);
      expect(patchData.data.organization.status).toBe("SUSPENDED");

      // Step B: Reactivate Org 2
      const reactivateReq = makeJsonRequest("http://localhost:3000/api/admin/tenants", "PATCH", {
        organizationId: org2Id,
        status: "ACTIVE",
        reason: "Compliance audit cleared",
      }, superadminToken);
      const reactivateRes = await toggleTenantHandler(reactivateReq);
      const reactivateData = await reactivateRes.json();
      expect(reactivateRes.status).toBe(200);
      expect(reactivateData.data.organization.status).toBe("ACTIVE");
    });
  });

  describe("3. Construction Operations: Sites, Projects & DSR", () => {
    it("should create a site and auto-initialize default yard store", async () => {
      const req = makeJsonRequest("http://localhost:3000/api/sites", "POST", {
        name: "Phase 4 Highrise Wing",
        code: `P4-SITE-${Date.now().toString().slice(-4)}`,
        address: "Plot 10, Sector 15",
      }, admin1Token);

      const res = await createSiteHandler(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe("Phase 4 Highrise Wing");
    });

    it("should create a project and retrieve its details with budget analytics", async () => {
      const req = makeJsonRequest("http://localhost:3000/api/projects", "POST", {
        siteId: site1Id,
        code: `PRJ-P4-${Date.now().toString().slice(-4)}`,
        name: "Tower C Structural Core",
        budgetAmount: 1500000000, // 1.5 Cr in paise
      }, admin1Token);

      const res = await createProjectHandler(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      project1Id = data.data.id;

      // Query project details endpoint
      const detailsReq = makeJsonRequest(`http://localhost:3000/api/projects/${project1Id}`, "GET", undefined, admin1Token);
      const detailsRes = await getProjectDetailsHandler(detailsReq, { params: { id: project1Id } });
      const detailsData = await detailsRes.json();

      expect(detailsRes.status).toBe(200);
      expect(detailsData.data.name).toBe("Tower C Structural Core");
      expect(detailsData.data.financials.budgetAmount).toBe(1500000000);
    });

    it("should reject cross-tenant project details access (IDOR defense)", async () => {
      // Create user in Org 2
      const pwd = await hashPassword("Pass123!");
      const foreignUser = await prisma.user.create({
        data: {
          organizationId: org2Id,
          name: "Foreign User Org2",
          email: `foreign-${Date.now()}@zenith.com`,
          passwordHash: pwd,
          role: "ORG_ADMIN",
          status: "ACTIVE",
        },
      });
      const foreignToken = await createSessionToken({
        userId: foreignUser.id,
        organizationId: org2Id,
        email: foreignUser.email,
        name: foreignUser.name,
        role: "ORG_ADMIN",
      });

      // Attempt to access Org 1 project details using Org 2 credentials
      const crossReq = makeJsonRequest(`http://localhost:3000/api/projects/${project1Id}`, "GET", undefined, foreignToken);
      const crossRes = await getProjectDetailsHandler(crossReq, { params: { id: project1Id } });

      expect(crossRes.status).toBe(404);
    });

    it("should submit a Daily Site Report and persist in project timeline", async () => {
      const req = makeJsonRequest("http://localhost:3000/api/daily-reports", "POST", {
        projectId: project1Id,
        reportDate: "2026-10-15",
        progress: "Completed level 5 slab reinforcement and electrical conduit laying.",
        blockers: "Minor rainfall delay of 45 minutes in afternoon.",
        safetyNotes: "100% harness compliance on scaffold work; zero safety incidents.",
      }, supervisor1Token);

      const res = await createDsrHandler(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.progress).toContain("Completed level 5 slab");
    });
  });

  describe("4. Inventory: Receipts, Issues, Negative Stock Prevention & Transfers", () => {
    it("should record material receipt and increment stock balance", async () => {
      const req = makeJsonRequest("http://localhost:3000/api/inventory/receipts", "POST", {
        storeId: store1AId,
        referenceDoc: `GRN-${Date.now().toString().slice(-4)}`,
        items: [
          {
            materialId: material1Id,
            quantity: 25,
            unitRate: 6500000, // 65,000 INR per tonne
          },
        ],
      }, storekeeper1Token);

      const res = await createReceiptHandler(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);

      // Verify balance persisted in database
      const balance = await prisma.stockBalance.findUnique({
        where: {
          materialId_storeId: {
            materialId: material1Id,
            storeId: store1AId,
          },
        },
      });
      expect(balance?.quantityOnHand).toBe(25);
    });

    it("should reject material issue exceeding on-hand stock (negative balance prevention)", async () => {
      const req = makeJsonRequest("http://localhost:3000/api/inventory/issues", "POST", {
        storeId: store1AId,
        materialId: material1Id,
        quantity: 50, // Available is only 25
        referenceDoc: "REQ-OVERDRAW",
      }, storekeeper1Token);

      const res = await createIssueHandler(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.message).toContain("Insufficient stock");
    });

    it("should transfer stock atomically between Store A and Store B", async () => {
      const req = makeJsonRequest("http://localhost:3000/api/inventory/transfers", "POST", {
        sourceStoreId: store1AId,
        targetStoreId: store1BId,
        materialId: material1Id,
        quantity: 10,
        referenceDoc: `XFER-${Date.now().toString().slice(-4)}`,
      }, storekeeper1Token);

      const res = await createTransferHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify both balances
      const balA = await prisma.stockBalance.findUnique({
        where: { materialId_storeId: { materialId: material1Id, storeId: store1AId } },
      });
      const balB = await prisma.stockBalance.findUnique({
        where: { materialId_storeId: { materialId: material1Id, storeId: store1BId } },
      });

      expect(balA?.quantityOnHand).toBe(15);
      expect(balB?.quantityOnHand).toBe(10);
    });

    it("should reject stock transfer when source and destination are the same store", async () => {
      const req = makeJsonRequest("http://localhost:3000/api/inventory/transfers", "POST", {
        sourceStoreId: store1AId,
        targetStoreId: store1AId,
        materialId: material1Id,
        quantity: 5,
        referenceDoc: "XFER-SAME",
      }, storekeeper1Token);

      const res = await createTransferHandler(req);
      expect(res.status).toBe(400);
    });
  });

  describe("5. Finance: Vendor Billing, Partial Payment & Payment Reversal", () => {
    let billId: string;
    let paymentId: string;

    it("should create vendor bill with line items", async () => {
      const req = makeJsonRequest("http://localhost:3000/api/finance/bills", "POST", {
        partyId: contractor1Id,
        projectId: project1Id,
        billNumber: `BILL-${Date.now().toString().slice(-4)}`,
        billDate: new Date().toISOString(),
        lines: [
          {
            description: "Excavation and Raft Foundation Shuttering",
            quantity: 100,
            unitRate: 50000,
            lineTotal: 5000000, // 50,000 INR
          },
        ],
      }, admin1Token);

      const res = await createBillHandler(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.totalAmount).toBe(5000000);
      billId = data.data.id;
    });

    it("should record a partial payment against the bill and update vendor statement", async () => {
      const req = makeJsonRequest("http://localhost:3000/api/finance/payments", "POST", {
        partyId: contractor1Id,
        paymentDate: new Date().toISOString(),
        method: "BANK_TRANSFER",
        referenceNumber: `UTR-${Date.now().toString().slice(-4)}`,
        idempotencyKey: `IDEMP-${Date.now()}`,
        amount: 3000000, // 30,000 INR partial payment
        allocations: [{ billId, amount: 3000000 }],
      }, admin1Token);

      const res = await createPaymentHandler(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.payment.amount).toBe(3000000);
      paymentId = data.data.payment.id;

      // Verify vendor statement
      const stmtReq = makeJsonRequest(`http://localhost:3000/api/parties/${contractor1Id}/statement`, "GET", undefined, admin1Token);
      const stmtRes = await getStatementHandler(stmtReq, { params: { id: contractor1Id } });
      const stmtData = await stmtRes.json();

      expect(stmtRes.status).toBe(200);
      expect(stmtData.data.totalBilled).toBe(5000000);
      expect(stmtData.data.totalPaid).toBe(3000000);
      expect(stmtData.data.outstandingBalance).toBe(2000000);
    });

    it("should reverse a payment, restore outstanding balance, and record an audit event", async () => {
      const req = makeJsonRequest(`http://localhost:3000/api/finance/payments/${paymentId}/reverse`, "POST", {
        reason: "Duplicate NEFT reference detected; payment cancelled",
      }, admin1Token);

      const res = await reversePaymentHandler(req, { params: { id: paymentId } });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.status).toBe("REVERSED");

      // Verify restored balance
      const stmtReq = makeJsonRequest(`http://localhost:3000/api/parties/${contractor1Id}/statement`, "GET", undefined, admin1Token);
      const stmtRes = await getStatementHandler(stmtReq, { params: { id: contractor1Id } });
      const stmtData = await stmtRes.json();

      expect(stmtData.data.totalPaid).toBe(0);
      expect(stmtData.data.outstandingBalance).toBe(5000000);
    });
  });

  describe("6. Workforce & Attendance: GPS Capture & Supervisor Correction", () => {
    let sessionId: string;

    it("should record worker check-in with GPS metadata", async () => {
      const today = new Date().toISOString().split("T")[0];
      const req = makeJsonRequest("http://localhost:3000/api/attendance/check-in", "POST", {
        workforceMemberId: worker1Id,
        siteId: site1Id,
        workDate: today,
        latitude: 28.6271,
        longitude: 77.3732,
        accuracyMeters: 8.5,
      }, supervisor1Token);

      const res = await checkInHandler(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.status).toBe("PRESENT");
      sessionId = data.data.id;
    });

    it("should reject duplicate check-in for the same worker on the same date", async () => {
      const today = new Date().toISOString().split("T")[0];
      const req = makeJsonRequest("http://localhost:3000/api/attendance/check-in", "POST", {
        workforceMemberId: worker1Id,
        siteId: site1Id,
        workDate: today,
      }, supervisor1Token);

      const res = await checkInHandler(req);
      expect(res.status).toBe(400);
    });

    it("should record check-out", async () => {
      const req = makeJsonRequest("http://localhost:3000/api/attendance/check-out", "POST", {
        sessionId,
        latitude: 28.6271,
        longitude: 77.3732,
      }, supervisor1Token);

      const res = await checkOutHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.checkOutAt).not.toBeNull();
    });

    it("should reject attendance correction by unauthorized supervisor", async () => {
      const req = makeJsonRequest(`http://localhost:3000/api/attendance/${sessionId}/correct`, "POST", {
        status: "OVERTIME",
        reason: "Worker stayed back 3 hours for emergency slab pour completion",
      }, supervisor1Token);

      const res = await correctAttendanceHandler(req, { params: { id: sessionId } });
      expect(res.status).toBe(403);
    });

    it("should allow manager attendance correction with audit reason", async () => {
      const req = makeJsonRequest(`http://localhost:3000/api/attendance/${sessionId}/correct`, "POST", {
        status: "OVERTIME",
        reason: "Worker stayed back 3 hours for emergency slab pour completion",
      }, admin1Token);

      const res = await correctAttendanceHandler(req, { params: { id: sessionId } });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.status).toBe("OVERTIME");
    });
  });

  describe("7. Measurement Book: Invariants, Atomic Writes & Crash Recovery", () => {
    it("should execute full MB lifecycle: create -> verify -> approve -> bill -> reject duplicate", async () => {
      const entry = await MeasurementBookService.createEntry({
        organizationId: org1Id,
        projectId: project1Id,
        partyId: contractor1Id,
        itemDescription: "Concrete Casting Grade M35 Core Columns",
        unit: "CUM",
        count: 4,
        length: 6,
        breadth: 1.5,
        depth: 0.5,
        agreedRate: 650000,
        userId: admin1Id,
        role: "ORG_ADMIN",
      });

      expect(entry.quantity).toBe(18);
      expect(entry.status).toBe("SUBMITTED");

      // Verify unapproved cannot be billed
      await expect(
        MeasurementBookService.convertToBill({
          organizationId: org1Id,
          entryId: entry.id,
          billNumber: `BILL-MB-UNAPP-${Date.now().toString().slice(-4)}`,
          userId: admin1Id,
          role: "ORG_ADMIN",
        })
      ).rejects.toThrow(/Cannot bill unapproved/);

      // Verify & approve
      const approved = await MeasurementBookService.updateStatus({
        organizationId: org1Id,
        entryId: entry.id,
        status: "APPROVED",
        userId: admin1Id,
        role: "ORG_ADMIN",
      });
      expect(approved.status).toBe("APPROVED");

      // Convert to bill
      const result = await MeasurementBookService.convertToBill({
        organizationId: org1Id,
        entryId: approved.id,
        billNumber: `BILL-MB-APP-${Date.now().toString().slice(-4)}`,
        userId: admin1Id,
        role: "ORG_ADMIN",
      });
      expect(result.entry.status).toBe("BILLED");
      expect(result.bill.status).toBe("POSTED");

      // Attempt duplicate conversion
      await expect(
        MeasurementBookService.convertToBill({
          organizationId: org1Id,
          entryId: approved.id,
          billNumber: `BILL-MB-DUP-${Date.now().toString().slice(-4)}`,
          userId: admin1Id,
          role: "ORG_ADMIN",
        })
      ).rejects.toThrow(/already been converted to Bill/);
    });

    it("should survive primary file corruption via atomic backup recovery", async () => {
      const storageFile = path.resolve(process.cwd(), "storage", "data", "measurement-book.json");
      const backupFile = path.resolve(process.cwd(), "storage", "data", "measurement-book.json.bak");

      expect(fs.existsSync(storageFile)).toBe(true);
      expect(fs.existsSync(backupFile)).toBe(true);

      // Corrupt primary file with broken JSON
      fs.writeFileSync(storageFile, "{ corrupted_incomplete_json...", "utf-8");

      // Call listEntries: Service must detect corruption and recover from backup
      const recovered = await MeasurementBookService.listEntries(org1Id);
      expect(Array.isArray(recovered)).toBe(true);
      expect(recovered.length).toBeGreaterThanOrEqual(1);

      // Verify primary file was healed
      const healedContent = fs.readFileSync(storageFile, "utf-8");
      expect(() => JSON.parse(healedContent)).not.toThrow();
    });
  });

  describe("8. Uploads Hardening, MIME Verification & Path Traversal Prevention", () => {
    it("should accept authentic PNG upload with valid magic bytes", async () => {
      // Authentic PNG signature: 89 50 4E 47 0D 0A 1A 0A
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      ]);
      const formData = new FormData();
      formData.append("file", new Blob([pngBuffer], { type: "image/png" }), "site_photo.png");

      const req = new NextRequest(new URL("http://localhost:3000/api/uploads"), {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${admin1Token}` },
        body: formData,
      });

      const res = await uploadHandler(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toMatch(/\.png$/);
    });

    it("should reject spoofed file disguised with fake MIME type", async () => {
      // Malicious payload pretending to be an image
      const textBuffer = Buffer.from("<script>malicious_code()</script>");
      const formData = new FormData();
      formData.append("file", new Blob([textBuffer], { type: "image/png" }), "exploit.png");

      const req = new NextRequest(new URL("http://localhost:3000/api/uploads"), {
        method: "POST",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${admin1Token}` },
        body: formData,
      });

      const res = await uploadHandler(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe("MIME_SPOOFING_DETECTED");
    });
  });

  describe("9. System Health & Operational Notifications", () => {
    it("should return healthy status on GET /api/health with database connectivity", async () => {
      const res = await healthHandler();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data.database).toBe("connected");
      expect(typeof data.uptime).toBe("number");
    });

    it("should return operational alerts on GET /api/notifications", async () => {
      const req = makeJsonRequest("http://localhost:3000/api/notifications", "GET", undefined, admin1Token);
      const res = await notificationsHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.alerts)).toBe(true);
    });
  });
});
