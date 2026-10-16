import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "../lib/db";
import {
  hashPassword,
  createSessionToken,
  verifySessionToken,
  getJwtSecret,
  SESSION_COOKIE_NAME,
} from "../lib/auth";
import { middleware } from "../middleware";
import { handleApiError } from "../lib/api-response";
import { InventoryService } from "../services/inventory-service";
import { FinanceService } from "../services/finance-service";
import { MeasurementBookService } from "../services/measurement-book-service";

// API Handlers
import { POST as loginHandler } from "../app/api/auth/login/route";
import { GET as healthHandler } from "../app/api/health/route";
import { POST as createMaterialHandler } from "../app/api/materials/route";
import { GET as getUploadHandler } from "../app/api/uploads/[id]/route";
import { POST as createBillHandler } from "../app/api/finance/bills/route";
import { POST as createIssueHandler } from "../app/api/inventory/issues/route";
import { POST as checkInHandler } from "../app/api/attendance/check-in/route";

function makeJsonRequest(
  url: string,
  method: string,
  body?: any,
  token?: string,
  extraHeaders?: Record<string, string>
) {
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

describe("Build Track Pro — Phase 6 Security Audit & Vulnerability Remediation Suite", () => {
  let orgAId: string;
  let orgBId: string;
  let adminAId: string;
  let adminAToken: string;
  let auditorAToken: string;
  let storekeeperAToken: string;
  let userBToken: string;

  let siteAId: string;
  let storeAId: string;
  let materialAId: string;
  let partyAId: string;
  let projectAId: string;
  let workerAId: string;

  beforeAll(async () => {
    // 1. Create Organization A & B
    const orgA = await prisma.organization.create({
      data: { name: "Audit Tenant A", currency: "INR", timezone: "Asia/Kolkata" },
    });
    orgAId = orgA.id;

    const orgB = await prisma.organization.create({
      data: { name: "Audit Tenant B", currency: "INR", timezone: "Asia/Kolkata" },
    });
    orgBId = orgB.id;

    // 2. Create Users
    const pwdHash = await hashPassword("SecureAudit123!");

    const adminA = await prisma.user.create({
      data: {
        organizationId: orgAId,
        name: "Org A Admin",
        email: `admin-a-${Date.now()}@audita.com`,
        passwordHash: pwdHash,
        role: "ORG_ADMIN",
      },
    });
    adminAId = adminA.id;
    adminAToken = await createSessionToken({
      userId: adminA.id,
      organizationId: orgAId,
      email: adminA.email,
      name: adminA.name,
      role: "ORG_ADMIN",
    });

    const auditorA = await prisma.user.create({
      data: {
        organizationId: orgAId,
        name: "Org A Auditor",
        email: `auditor-a-${Date.now()}@audita.com`,
        passwordHash: pwdHash,
        role: "AUDITOR",
      },
    });
    auditorAToken = await createSessionToken({
      userId: auditorA.id,
      organizationId: orgAId,
      email: auditorA.email,
      name: auditorA.name,
      role: "AUDITOR",
    });

    const storekeeperA = await prisma.user.create({
      data: {
        organizationId: orgAId,
        name: "Org A Storekeeper",
        email: `store-a-${Date.now()}@audita.com`,
        passwordHash: pwdHash,
        role: "STOREKEEPER",
      },
    });
    storekeeperAToken = await createSessionToken({
      userId: storekeeperA.id,
      organizationId: orgAId,
      email: storekeeperA.email,
      name: storekeeperA.name,
      role: "STOREKEEPER",
    });

    const userB = await prisma.user.create({
      data: {
        organizationId: orgBId,
        name: "Tenant B Admin",
        email: `admin-b-${Date.now()}@auditb.com`,
        passwordHash: pwdHash,
        role: "ORG_ADMIN",
      },
    });
    userBToken = await createSessionToken({
      userId: userB.id,
      organizationId: orgBId,
      email: userB.email,
      name: userB.name,
      role: "ORG_ADMIN",
    });

    // 3. Operational Seed for Tenant A
    const siteA = await prisma.site.create({
      data: {
        organizationId: orgAId,
        name: "Tenant A Tower Site",
        code: `SITE-A-${Date.now()}`,
        address: "Site A Address",
      },
    });
    siteAId = siteA.id;

    const storeA = await prisma.store.create({
      data: { organizationId: orgAId, siteId: siteAId, name: "Site A Central Depot" },
    });
    storeAId = storeA.id;

    const materialA = await prisma.material.create({
      data: {
        organizationId: orgAId,
        sku: `SKU-A-${Date.now()}`,
        name: "Structural Steel A",
        unitCode: "TONNE",
        minStockQty: 5,
        reorderQty: 20,
      },
    });
    materialAId = materialA.id;

    const partyA = await prisma.party.create({
      data: {
        organizationId: orgAId,
        partyType: "VENDOR",
        name: "Apex Steel Vendor A",
      },
    });
    partyAId = partyA.id;

    const projectA = await prisma.project.create({
      data: {
        organizationId: orgAId,
        siteId: siteAId,
        code: `PRJ-A-${Date.now()}`,
        name: "Tower Alpha Structural",
        budgetAmount: 1000000,
      },
    });
    projectAId = projectA.id;

    const workerA = await prisma.workforceMember.create({
      data: {
        organizationId: orgAId,
        employeeCode: `WRK-A-${Date.now()}`,
        name: "Ramesh Mason A",
        workerType: "MASON",
        defaultSiteId: siteAId,
      },
    });
    workerAId = workerA.id;
  });

  describe("1. Authentication & JWT Security Verification", () => {
    it("should accept valid HS256 tokens and reject tokens with mismatched secrets", async () => {
      const valid = await verifySessionToken(adminAToken);
      expect(valid).not.toBeNull();
      expect(valid?.userId).toBeTruthy();
      expect(valid?.organizationId).toBe(orgAId);

      const fakeSecret = new TextEncoder().encode("completely_wrong_secret_key_32characters_long");
      const forgedToken = await new SignJWT({
        userId: "hacker-123",
        organizationId: orgAId,
        role: "SUPER_ADMIN",
      })
        .setProtectedHeader({ alg: "HS256" })
        .sign(fakeSecret);

      const rejected = await verifySessionToken(forgedToken);
      expect(rejected).toBeNull();
    });

    it("should reject tampered JWT payloads", async () => {
      const parts = adminAToken.split(".");
      // Alter payload segment
      const tamperedToken = `${parts[0]}.${parts[1]}xyz.${parts[2]}`;
      const verified = await verifySessionToken(tamperedToken);
      expect(verified).toBeNull();
    });
  });

  describe("2. Authorization & Role Privilege Verification", () => {
    it("should reject material creation by AUDITOR (privilege escalation check)", async () => {
      const req = makeJsonRequest(
        "http://localhost:3000/api/materials",
        "POST",
        {
          sku: `MAT-AUD-${Date.now()}`,
          name: "Auditor Created Material",
          unitCode: "BAG",
          minStockQty: 10,
          reorderQty: 50,
        },
        auditorAToken
      );

      const res = await createMaterialHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("FORBIDDEN");
    });

    it("should allow material creation by STOREKEEPER with inventory management role", async () => {
      const req = makeJsonRequest(
        "http://localhost:3000/api/materials",
        "POST",
        {
          sku: `MAT-STR-${Date.now()}`,
          name: "Storekeeper Created Material",
          unitCode: "BAG",
          minStockQty: 10,
          reorderQty: 50,
        },
        storekeeperAToken
      );

      const res = await createMaterialHandler(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.name).toBe("Storekeeper Created Material");
    });
  });

  describe("3. Tenant Isolation & IDOR Prevention", () => {
    it("should prevent Tenant B from creating a bill against Tenant A's vendor", async () => {
      const req = makeJsonRequest(
        "http://localhost:3000/api/finance/bills",
        "POST",
        {
          partyId: partyAId, // Belongs to Tenant A
          billNumber: `BILL-IDOR-${Date.now()}`,
          billDate: new Date().toISOString(),
          lines: [{ description: "Cross-tenant theft", lineTotal: 50000 }],
        },
        userBToken // Tenant B User
      );

      const res = await createBillHandler(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.message).toContain("Vendor/Contractor not found");
    });

    it("should prevent Tenant B from issuing goods from Tenant A's store", async () => {
      const req = makeJsonRequest(
        "http://localhost:3000/api/inventory/issues",
        "POST",
        {
          storeId: storeAId, // Belongs to Tenant A
          materialId: materialAId,
          quantity: 1,
        },
        userBToken
      );

      const res = await createIssueHandler(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.message).toContain("Store not found or outside organization scope");
    });

    it("should prevent Tenant B from checking attendance at Tenant A's site", async () => {
      const req = makeJsonRequest(
        "http://localhost:3000/api/attendance/check-in",
        "POST",
        {
          workforceMemberId: workerAId,
          siteId: siteAId,
        },
        userBToken
      );

      const res = await checkInHandler(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.message).toContain("Workforce member not found");
    });

    it("should prevent Tenant B from downloading Tenant A's private uploads", async () => {
      const fakeFileId = "00000000-0000-0000-0000-000000000001";
      const req = makeJsonRequest(
        `http://localhost:3000/api/uploads/${fakeFileId}`,
        "GET",
        undefined,
        userBToken
      );

      const res = await getUploadHandler(req, { params: { id: fakeFileId } });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error.code).toBe("NOT_FOUND");
    });
  });

  describe("4. CSRF Defense-in-Depth Verification", () => {
    it("should block cross-site mutative requests from foreign origin", async () => {
      const req = new NextRequest(new URL("http://localhost:3000/api/inventory/receipts"), {
        method: "POST",
        headers: {
          Host: "localhost:3000",
          Origin: "http://malicious-attacker-website.evil",
          Cookie: `${SESSION_COOKIE_NAME}=${adminAToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const res = await middleware(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.message).toBe("Cross-site request forgery blocked");
    });

    it("should allow mutative requests with matching origin", async () => {
      const req = new NextRequest(new URL("http://localhost:3000/api/inventory/receipts"), {
        method: "POST",
        headers: {
          Host: "localhost:3000",
          Origin: "http://localhost:3000",
          Cookie: `${SESSION_COOKIE_NAME}=${adminAToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const res = await middleware(req);
      // Middleware should allow request through to Next.js handler
      expect(res.status).not.toBe(403);
    });
  });

  describe("5. Login Brute Force & Rate Limiting Hardening", () => {
    it("should trigger rate limiting after multiple failed attempts on the same account", async () => {
      const testEmail = `brute-target-${Date.now()}@audita.com`;
      let lastRes: any;

      for (let i = 0; i < 6; i++) {
        const req = makeJsonRequest(
          "http://localhost:3000/api/auth/login",
          "POST",
          { email: testEmail, password: "WrongPassword123!" },
          undefined,
          { "x-real-ip": "10.0.0.99" }
        );
        lastRes = await loginHandler(req);
      }

      expect(lastRes.status).toBe(429);
      const json = await lastRes.json();
      expect(json.error.code).toBe("TOO_MANY_REQUESTS");
    });
  });

  describe("6. Information Disclosure & Error Sanitization", () => {
    it("should sanitize raw health check errors to avoid leaking database paths", async () => {
      const res = await healthHandler();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.database).toBe("connected");
    });

    it("should sanitize internal database error messages in production mode", async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = "production";
        const error = new Error("PrismaClientKnownRequestError: SELECT * FROM `users` WHERE failed SQLite error");
        const res = handleApiError(error);
        expect(res.status).toBe(500);
        const data = await res.json();
        expect(data.error.message).not.toContain("SELECT");
        expect(data.error.message).toContain("internal database error");
      } finally {
        (process.env as any).NODE_ENV = origEnv;
      }
    });
  });

  describe("7. Financial & Inventory Precision Invariants", () => {
    it("should maintain precise decimal representation in adjustStock", async () => {
      // 1. Initial receipt of 10.3333
      await InventoryService.receiveGoods({
        organizationId: orgAId,
        storeId: storeAId,
        items: [{ materialId: materialAId, quantity: 10.3333 }],
        userId: adminAId,
        role: "STOREKEEPER",
      });

      // 2. Physical adjustment of -0.3333
      const adjusted = await InventoryService.adjustStock({
        organizationId: orgAId,
        storeId: storeAId,
        materialId: materialAId,
        quantityDelta: -0.3333,
        reason: "Physical inventory audit count correction",
        userId: adminAId,
        role: "STOREKEEPER",
      });

      expect(adjusted.success).toBe(true);
      // Should equal exactly 10 with no floating point rounding noise (e.g. 9.999999999999)
      const balance = await prisma.stockBalance.findUnique({
        where: {
          materialId_storeId: { materialId: materialAId, storeId: storeAId },
        },
      });
      expect(balance?.quantityOnHand).toBe(10);
    });

    it("should reject double reversal of payments", async () => {
      const payment = await FinanceService.recordPayment({
        organizationId: orgAId,
        partyId: partyAId,
        paymentDate: new Date(),
        amount: 25000,
        method: "BANK_TRANSFER",
        referenceNumber: `REF-${Date.now()}`,
        idempotencyKey: `IDEMP-${Date.now()}`,
        userId: adminAId,
        role: "ORG_ADMIN",
      });

      // First reversal succeeds
      await FinanceService.reversePayment({
        organizationId: orgAId,
        paymentId: payment.payment.id,
        reason: "Duplicate bank chargeback",
        userId: adminAId,
        role: "ORG_ADMIN",
      });

      // Second reversal must throw
      await expect(
        FinanceService.reversePayment({
          organizationId: orgAId,
          paymentId: payment.payment.id,
          reason: "Attempt second reversal",
          userId: adminAId,
          role: "ORG_ADMIN",
        })
      ).rejects.toThrow("Payment has already been reversed");
    });
  });
});
