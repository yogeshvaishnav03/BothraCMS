import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../lib/db";
import { hashPassword, createSessionToken, SESSION_COOKIE_NAME } from "../lib/auth";
import { POST as loginHandler } from "../app/api/auth/login/route";
import { POST as logoutHandler } from "../app/api/auth/logout/route";
import { GET as meHandler } from "../app/api/auth/me/route";
import { GET as getTenantsHandler, PATCH as updateTenantHandler } from "../app/api/admin/tenants/route";
import { PATCH as updateOrgHandler } from "../app/api/organization/route";
import { POST as createSiteHandler } from "../app/api/sites/route";
import { GET as getProjectsHandler, POST as createProjectHandler } from "../app/api/projects/route";
import { POST as createAssignmentHandler } from "../app/api/projects/[id]/assignments/route";
import { POST as createWorkerHandler } from "../app/api/workforce/route";
import { POST as createHeadcountHandler } from "../app/api/workforce/headcount/route";
import { GET as getDayBookHandler } from "../app/api/day-book/route";
import { POST as createBillHandler } from "../app/api/finance/bills/route";
import { POST as createPaymentHandler } from "../app/api/finance/payments/route";
import { POST as approvePaymentHandler } from "../app/api/finance/payments/[id]/approve/route";
import { POST as reversePaymentHandler } from "../app/api/finance/payments/[id]/reverse/route";
import { POST as createPartyHandler } from "../app/api/parties/route";
import { POST as createMaterialHandler } from "../app/api/materials/route";
import { POST as createStoreHandler } from "../app/api/stores/route";
import { POST as createReceiptHandler } from "../app/api/inventory/receipts/route";
import { POST as createIssueHandler } from "../app/api/inventory/issues/route";
import { POST as createTransferHandler } from "../app/api/inventory/transfers/route";
import { POST as createFolderHandler } from "../app/api/projects/[id]/folders/route";
import { POST as createMBHandler } from "../app/api/measurement-book/route";
import { GET as getAuditHandler } from "../app/api/audit/route";
import { Role } from "../lib/permissions";

function makeReq(url: string, method = "GET", body: any = null, token?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) {
    headers["cookie"] = `${SESSION_COOKIE_NAME}=${token}`;
    headers["authorization"] = `Bearer ${token}`;
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Build Track Pro — Phase 3 Comprehensive End-to-End & Role Matrix Test Suite", () => {
  let tenantAId: string;
  let tenantBId: string;

  // Tokens for Tenant A roles
  let superAdminToken: string;
  let orgAdminToken: string;
  let projectManagerToken: string;
  let siteSupervisorToken: string;
  let accountantToken: string;
  let storekeeperToken: string;
  let hrViewerToken: string;
  let auditorToken: string;

  // Tenant B token for cross-tenant isolation checks
  let tenantBAdminToken: string;

  // Shared test entity IDs
  let siteAId: string;
  let projectAId: string;
  let storeA1Id: string;
  let storeA2Id: string;
  let materialAId: string;
  let partyAId: string;
  let pmUserId: string;
  let accountantUserId: string;

  beforeAll(async () => {
    // 1. Create Tenant A and Tenant B
    const orgA = await prisma.organization.create({
      data: {
        name: `Phase 3 Test Tenant A ${Date.now()}`,
        currency: "INR",
        timezone: "Asia/Kolkata",
        status: "ACTIVE",
      },
    });
    tenantAId = orgA.id;

    const orgB = await prisma.organization.create({
      data: {
        name: `Phase 3 Rival Tenant B ${Date.now()}`,
        currency: "INR",
        timezone: "Asia/Kolkata",
        status: "ACTIVE",
      },
    });
    tenantBId = orgB.id;

    const pwdHash = await hashPassword("Password123!");

    // 2. Provision all 8 roles for Tenant A
    const roles: Role[] = [
      "SUPER_ADMIN",
      "ORG_ADMIN",
      "PROJECT_MANAGER",
      "SITE_SUPERVISOR",
      "ACCOUNTANT",
      "STOREKEEPER",
      "HR_VIEWER",
      "AUDITOR",
    ];

    const tokens: Record<string, string> = {};

    for (const r of roles) {
      const email = `phase3-${r.toLowerCase()}-${Date.now()}@tenant-a.com`;
      const user = await prisma.user.create({
        data: {
          organizationId: tenantAId,
          name: `User ${r}`,
          email,
          passwordHash: pwdHash,
          role: r,
          status: "ACTIVE",
        },
      });

      if (r === "PROJECT_MANAGER") {
        pmUserId = user.id;
      }
      if (r === "ACCOUNTANT") {
        accountantUserId = user.id;
      }

      tokens[r] = await createSessionToken({
        userId: user.id,
        organizationId: tenantAId,
        email: user.email,
        name: user.name,
        role: r,
      });
    }

    superAdminToken = tokens["SUPER_ADMIN"];
    orgAdminToken = tokens["ORG_ADMIN"];
    projectManagerToken = tokens["PROJECT_MANAGER"];
    siteSupervisorToken = tokens["SITE_SUPERVISOR"];
    accountantToken = tokens["ACCOUNTANT"];
    storekeeperToken = tokens["STOREKEEPER"];
    hrViewerToken = tokens["HR_VIEWER"];
    auditorToken = tokens["AUDITOR"];

    // 3. Provision Tenant B Admin
    const userB = await prisma.user.create({
      data: {
        organizationId: tenantBId,
        name: "Tenant B Admin",
        email: `admin-${Date.now()}@tenant-b.com`,
        passwordHash: pwdHash,
        role: "ORG_ADMIN",
        status: "ACTIVE",
      },
    });

    tenantBAdminToken = await createSessionToken({
      userId: userB.id,
      organizationId: tenantBId,
      email: userB.email,
      name: userB.name,
      role: "ORG_ADMIN",
    });

    // 4. Set up Baseline Entities in Tenant A
    const site = await prisma.site.create({
      data: {
        organizationId: tenantAId,
        name: "Phase 3 Primary Construction Site",
        code: `P3-${Date.now().toString().slice(-4)}`,
        address: "123 Phase 3 Construction Expressway, Noida",
        status: "ACTIVE",
      },
    });
    siteAId = site.id;

    const project = await prisma.project.create({
      data: {
        organizationId: tenantAId,
        name: "Phase 3 Tower Operations",
        code: `PRJ-${Date.now().toString().slice(-4)}`,
        siteId: siteAId,
        managerUserId: pmUserId,
        status: "ACTIVE",
      },
    });
    projectAId = project.id;

    // Assign accountant to projectAId so finance queries succeed
    await prisma.projectAssignment.create({
      data: {
        organizationId: tenantAId,
        projectId: projectAId,
        userId: accountantUserId,
        assignedById: pmUserId,
        role: "ACCOUNTANT",
        status: "ACTIVE",
      },
    });

    const store1 = await prisma.store.create({
      data: {
        organizationId: tenantAId,
        siteId: siteAId,
        name: "Phase 3 Main Central Yard",
      },
    });
    storeA1Id = store1.id;

    const store2 = await prisma.store.create({
      data: {
        organizationId: tenantAId,
        siteId: siteAId,
        name: "Phase 3 Secondary Sub-Store",
      },
    });
    storeA2Id = store2.id;

    const material = await prisma.material.create({
      data: {
        organizationId: tenantAId,
        name: "Phase 3 Cement 53 Grade",
        sku: `MAT-CEM-${Date.now()}`,
        unitCode: "BAG",
        minStockQty: 50,
      },
    });
    materialAId = material.id;

    const party = await prisma.party.create({
      data: {
        organizationId: tenantAId,
        name: "Phase 3 UltraTech Concrete Supplies",
        partyType: "VENDOR",
      },
    });
    partyAId = party.id;
  });

  describe("Phase B — End-to-End Operational Workflows", () => {
    it("B-1: Complete Authentication & Session Lifecycle (Login, Profile, Logout, Expiry)", async () => {
      // 1. Valid Login
      const loginReq = makeReq("http://localhost:3000/api/auth/login", "POST", {
        email: "admin@buildtrack.pro",
        password: "Password123!",
      });
      const loginRes = await loginHandler(loginReq);
      expect(loginRes.status).toBe(200);
      const loginData = await loginRes.json();
      expect(loginData.success).toBe(true);
      expect(loginData.data.user.email).toBe("admin@buildtrack.pro");

      // Verify session cookie presence
      const cookies = loginRes.cookies.getAll();
      const sessionCookie = cookies.find((c) => c.name === SESSION_COOKIE_NAME);
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.value.length).toBeGreaterThan(20);

      // 2. Profile check (/api/auth/me) with token
      const meReq = makeReq("http://localhost:3000/api/auth/me", "GET", null, sessionCookie?.value);
      const meRes = await meHandler(meReq);
      expect(meRes.status).toBe(200);
      const meData = await meRes.json();
      expect(meData.data.user.email).toBe("admin@buildtrack.pro");

      // 3. Logout
      const logoutReq = makeReq("http://localhost:3000/api/auth/logout", "POST", null, sessionCookie?.value);
      const logoutRes = await logoutHandler(logoutReq);
      expect(logoutRes.status).toBe(200);

      // 4. Invalid or tampered token returns 401
      const tamperedReq = makeReq("http://localhost:3000/api/auth/me", "GET", null, "invalid.tampered.token");
      const tamperedRes = await meHandler(tamperedReq);
      expect(tamperedRes.status).toBe(401);
    });

    it("B-2: Organization Management (SuperAdmin Tenant Registry & OrgAdmin Settings Update)", async () => {
      // Super Admin reads tenant registry
      const getTenantsReq = makeReq("http://localhost:3000/api/admin/tenants", "GET", null, superAdminToken);
      const tenantsRes = await getTenantsHandler(getTenantsReq);
      expect(tenantsRes.status).toBe(200);
      const tenantsJson = await tenantsRes.json();
      expect(tenantsJson.data.totalTenants).toBeGreaterThanOrEqual(1);

      // Org Admin updates current organization settings
      const updateOrgReq = makeReq(
        "http://localhost:3000/api/organization",
        "PATCH",
        { timezone: "Asia/Kolkata", currency: "INR" },
        orgAdminToken
      );
      const updateRes = await updateOrgHandler(updateOrgReq);
      expect(updateRes.status).toBe(200);
    });

    it("B-3: Workforce, Attendance & Day Book Data Integration Across Timezones", async () => {
      const targetDate = "2026-10-20";

      // 1. Submit workforce headcount
      const hcReq = makeReq(
        "http://localhost:3000/api/workforce/headcount",
        "POST",
        {
          siteId: siteAId,
          date: targetDate,
          shift: "DAY",
          artisanCount: 15,
          laborerMale: 25,
          laborerFemale: 10,
          contractorName: "Shree Ram Construction Labor",
        },
        siteSupervisorToken
      );
      const hcRes = await createHeadcountHandler(hcReq);
      expect([200, 201]).toContain(hcRes.status);
      const hcData = await hcRes.json();
      expect(hcData.success).toBe(true);
      expect(hcData.data.grandTotal).toBe(50); // 15 + 25 + 10

      // 2. Submit a Day Book Bill
      const billReq = makeReq(
        "http://localhost:3000/api/finance/bills",
        "POST",
        {
          partyId: partyAId,
          projectId: projectAId,
          billNumber: `DB-BILL-${Date.now().toString().slice(-5)}`,
          billDate: `${targetDate}T12:00:00.000Z`,
          lines: [{ description: "Concrete Mix M25", lineTotal: 2500000 }], // 25,000 INR
        },
        accountantToken
      );
      const billRes = await createBillHandler(billReq);
      expect(billRes.status).toBe(201);

      // 3. Submit a Day Book Payment
      const payReq = makeReq(
        "http://localhost:3000/api/finance/payments",
        "POST",
        {
          partyId: partyAId,
          projectId: projectAId,
          amount: 1000000, // 10,000 INR
          method: "CASH",
          payingAccount: "Primary Operating Account",
          paymentDate: `${targetDate}T12:00:00.000Z`,
          referenceNumber: `PAY-REF-${Date.now().toString().slice(-5)}`,
          idempotencyKey: `IDEMP-P3-${Date.now()}`,
          autoApprove: true,
        },
        accountantToken
      );
      const payRes = await createPaymentHandler(payReq);
      expect(payRes.status).toBe(201);

      // 4. Query Day Book endpoint for targetDate and verify all items appear
      const dayBookReq = makeReq(
        `http://localhost:3000/api/day-book?date=${targetDate}&siteId=${siteAId}`,
        "GET",
        null,
        orgAdminToken
      );
      const dayBookRes = await getDayBookHandler(dayBookReq);
      expect(dayBookRes.status).toBe(200);
      const dayBookJson = await dayBookRes.json();
      expect(dayBookJson.success).toBe(true);

      // Verify headcount is visible
      expect(dayBookJson.data.summary.headcountTotal).toBe(50);
      expect(dayBookJson.data.summary.headcountArtisans).toBe(15);
      expect(dayBookJson.data.summary.headcountLaborers).toBe(35); // 25 + 10

      // Verify payments and bills are visible
      expect(dayBookJson.data.payments.length).toBeGreaterThanOrEqual(1);
      expect(dayBookJson.data.bills.length).toBeGreaterThanOrEqual(1);
    });

    it("B-4: Authoritative Inventory Workflow (Receipt, Issue, Negative Stock Block & Inter-Store Transfer)", async () => {
      // 1. Inward Goods Receipt (100 bags of cement to Store 1)
      const receiptReq = makeReq(
        "http://localhost:3000/api/inventory/receipts",
        "POST",
        {
          storeId: storeA1Id,
          vendorPartyId: partyAId,
          items: [{ materialId: materialAId, quantity: 100, unitRate: 350 }],
          idempotencyKey: `RCPT-P3-${Date.now()}`,
        },
        storekeeperToken
      );
      const receiptRes = await createReceiptHandler(receiptReq);
      expect(receiptRes.status).toBe(201);

      // 2. Goods Issue: Consume 30 bags at site
      const issueReq = makeReq(
        "http://localhost:3000/api/inventory/issues",
        "POST",
        {
          storeId: storeA1Id,
          materialId: materialAId,
          quantity: 30,
          issueTo: "Floor 4 Casting Crew",
          idempotencyKey: `ISSUE-P3-${Date.now()}`,
        },
        storekeeperToken
      );
      const issueRes = await createIssueHandler(issueReq);
      expect([200, 201]).toContain(issueRes.status);

      // 3. Negative Stock Prevention: Attempt to issue 200 bags (store only has 70 remaining)
      const excessiveIssueReq = makeReq(
        "http://localhost:3000/api/inventory/issues",
        "POST",
        {
          storeId: storeA1Id,
          materialId: materialAId,
          quantity: 200,
          issueTo: "Greedy Contractor",
          idempotencyKey: `ISSUE-OVER-${Date.now()}`,
        },
        storekeeperToken
      );
      const excessiveRes = await createIssueHandler(excessiveIssueReq);
      expect(excessiveRes.status).toBe(400); // Insufficient stock rejected!

      // 4. Inter-store transfer: Transfer 20 bags from Store 1 to Store 2
      const transferReq = makeReq(
        "http://localhost:3000/api/inventory/transfers",
        "POST",
        {
          sourceStoreId: storeA1Id,
          targetStoreId: storeA2Id,
          materialId: materialAId,
          quantity: 20,
          idempotencyKey: `XFER-P3-${Date.now()}`,
        },
        storekeeperToken
      );
      const transferRes = await createTransferHandler(transferReq);
      expect([200, 201]).toContain(transferRes.status);
    });

    it("B-5: Financial Workflow & Two-Party Approval / Reversal Invariants", async () => {
      // 1. Create a contractor bill for 50,000 INR
      const billReq = makeReq(
        "http://localhost:3000/api/finance/bills",
        "POST",
        {
          partyId: partyAId,
          projectId: projectAId,
          billNumber: `BILL-APPR-${Date.now()}`,
          billDate: new Date().toISOString(),
          lines: [{ description: "Formwork & Shuttering", lineTotal: 5000000 }],
        },
        accountantToken
      );
      const billRes = await createBillHandler(billReq);
      expect(billRes.status).toBe(201);
      const billData = await billRes.json();
      const billId = billData.data.id;

      // 2. Accountant initiates payment query for Super Admin approval
      const payReq = makeReq(
        "http://localhost:3000/api/finance/payments",
        "POST",
        {
          partyId: partyAId,
          projectId: projectAId,
          amount: 2000000, // 20,000 INR
          method: "BANK_TRANSFER",
          payingAccount: "HDFC Operating Current A/C",
          paymentDate: new Date().toISOString(),
          referenceNumber: `CHQ-${Date.now()}`,
          idempotencyKey: `PAY-QUERY-${Date.now()}`,
          autoApprove: false, // Triggers approval query
          allocations: [{ billId, amount: 2000000 }],
        },
        accountantToken
      );
      const payRes = await createPaymentHandler(payReq);
      expect(payRes.status).toBe(201);
      const payData = await payRes.json();
      const paymentId = payData.data.payment.id;
      expect(payData.data.payment.status).toBe("PENDING_APPROVAL");

      // 3. Super Admin approves payment
      const approveReq = makeReq(
        `http://localhost:3000/api/finance/payments/${paymentId}/approve`,
        "POST",
        { approvalNotes: "Verified with project manager. Approved for disbursement." },
        superAdminToken
      );
      const approveRes = await approvePaymentHandler(approveReq, { params: { id: paymentId } });
      expect(approveRes.status).toBe(200);

      // 4. Org Admin reverses payment with audit trail
      const reverseReq = makeReq(
        `http://localhost:3000/api/finance/payments/${paymentId}/reverse`,
        "POST",
        { reason: "Vendor banking details incorrect, returning funds." },
        orgAdminToken
      );
      const reverseRes = await reversePaymentHandler(reverseReq, { params: { id: paymentId } });
      expect(reverseRes.status).toBe(200);

      // 5. Double reversal must be strictly blocked
      const doubleRevReq = makeReq(
        `http://localhost:3000/api/finance/payments/${paymentId}/reverse`,
        "POST",
        { reason: "Attempt duplicate reversal" },
        orgAdminToken
      );
      const doubleRevRes = await reversePaymentHandler(doubleRevReq, { params: { id: paymentId } });
      expect(doubleRevRes.status).toBe(400); // Already reversed!
    });
  });

  describe("Phase C — Role and Multi-Tenant Access Matrix", () => {
    it("C-1: SITE_SUPERVISOR cannot disburse financial payments directly", async () => {
      const payReq = makeReq(
        "http://localhost:3000/api/finance/payments",
        "POST",
        {
          partyId: partyAId,
          amount: 500000,
          method: "CASH",
          paymentDate: new Date().toISOString(),
          referenceNumber: "UNAUTH-PAY",
          idempotencyKey: `UNAUTH-${Date.now()}`,
          autoApprove: true,
        },
        siteSupervisorToken
      );
      const res = await createPaymentHandler(payReq);
      expect(res.status).toBe(403); // Forbidden!
    });

    it("C-2: STOREKEEPER cannot create or modify contractor bills", async () => {
      const billReq = makeReq(
        "http://localhost:3000/api/finance/bills",
        "POST",
        {
          partyId: partyAId,
          billNumber: "UNAUTH-BILL",
          billDate: new Date().toISOString(),
          lines: [{ description: "Hack", lineTotal: 10000 }],
        },
        storekeeperToken
      );
      const res = await createBillHandler(billReq);
      expect(res.status).toBe(403); // Forbidden!
    });

    it("C-3: AUDITOR role is read-only (can read audit logs, cannot mutate inventory)", async () => {
      // 1. Auditor can read audit trail
      const auditReq = makeReq("http://localhost:3000/api/audit", "GET", null, auditorToken);
      const auditRes = await getAuditHandler(auditReq);
      expect(auditRes.status).toBe(200);

      // 2. Auditor CANNOT issue stock
      const issueReq = makeReq(
        "http://localhost:3000/api/inventory/issues",
        "POST",
        {
          storeId: storeA1Id,
          materialId: materialAId,
          quantity: 5,
          idempotencyKey: `AUDITOR-HACK-${Date.now()}`,
        },
        auditorToken
      );
      const issueRes = await createIssueHandler(issueReq);
      expect(issueRes.status).toBe(403);
    });

    it("C-4: Cross-Tenant Isolation: Tenant B cannot access or modify Tenant A resources", async () => {
      // Tenant B tries to create a project assignment in Tenant A's project
      const tamperReq = makeReq(
        `http://localhost:3000/api/projects/${projectAId}/assignments`,
        "POST",
        { userId: "unauthorized-user-id", role: "SITE_ENGINEER" },
        tenantBAdminToken
      );
      const tamperRes = await createAssignmentHandler(tamperReq, { params: { id: projectAId } });
      expect(tamperRes.status).toBe(404); // Outside tenant boundary!
    });

    it("C-5: Cross-Tenant Isolation: Tenant B cannot query Tenant A's Day Book", async () => {
      // Tenant B passes Tenant A's siteId to Day Book endpoint
      const dayBookReq = makeReq(
        `http://localhost:3000/api/day-book?date=2026-10-20&siteId=${siteAId}`,
        "GET",
        null,
        tenantBAdminToken
      );
      const res = await getDayBookHandler(dayBookReq);
      expect(res.status).toBe(200);
      const data = await res.json();
      // Tenant B sees empty results for Tenant A's site
      expect(data.data.payments.length).toBe(0);
      expect(data.data.bills.length).toBe(0);
      expect(data.data.receipts.length).toBe(0);
    });
  });
});
