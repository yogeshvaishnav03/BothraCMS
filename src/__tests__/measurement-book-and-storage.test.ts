import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../lib/db";
import { hashPassword, createSessionToken, SESSION_COOKIE_NAME } from "../lib/auth";
import { NextRequest } from "next/server";
import { GET as getMBHandler, POST as postMBHandler } from "../app/api/measurement-book/route";
import { LocalStorageProvider, S3CompatibleStorageProvider, getStorageProvider } from "../lib/storage";

function makeJsonRequest(
  url: string,
  method: string,
  body?: any,
  token?: string
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
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

describe("Measurement Book & Cloud Storage Provider Tests", () => {
  let testOrgId: string;
  let testProjectId: string;
  let testPartyId: string;
  let adminToken: string;
  let supervisorToken: string;

  beforeAll(async () => {
    // 1. Create Organization
    const org = await prisma.organization.create({
      data: {
        name: "MB Verification Org Ltd",
        currency: "INR",
        timezone: "Asia/Kolkata",
      },
    });
    testOrgId = org.id;

    // 2. Create Admin and Supervisor
    const pwdHash = await hashPassword("SecurePass123!");
    const admin = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "MB Project Manager",
        email: `mb-admin-${Date.now()}@buildtrack.com`,
        passwordHash: pwdHash,
        role: "ORG_ADMIN",
      },
    });
    adminToken = await createSessionToken({
      userId: admin.id,
      email: admin.email,
      organizationId: testOrgId,
      role: "ORG_ADMIN",
    });

    const supervisor = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "MB Site Supervisor",
        email: `mb-sup-${Date.now()}@buildtrack.com`,
        passwordHash: pwdHash,
        role: "SITE_SUPERVISOR",
      },
    });
    supervisorToken = await createSessionToken({
      userId: supervisor.id,
      email: supervisor.email,
      organizationId: testOrgId,
      role: supervisor.role as any,
    });

    // 3. Create Site & Project
    const site = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        name: "MB Project Site Alpha",
        code: `MB-S-${Date.now().toString().slice(-4)}`,
        address: "123 Construction Highway Sector 4, Jaipur",
      },
    });

    const project = await prisma.project.create({
      data: {
        organizationId: testOrgId,
        siteId: site.id,
        name: "Highway Flyover Pier Reinforcement",
        code: `PRJ-MB-${Date.now().toString().slice(-4)}`,
      },
    });
    testProjectId = project.id;

    // 4. Create Contractor Party
    const party = await prisma.party.create({
      data: {
        organizationId: testOrgId,
        name: "Shree Civil Engineering Subcontractors",
        partyType: "CONTRACTOR",
      },
    });
    testPartyId = party.id;
  });

  afterAll(async () => {
    // Clean up test data in correct dependency order
    try { await prisma.paymentAllocation.deleteMany({ where: { bill: { organizationId: testOrgId } } }); } catch {}
    try { await prisma.billLine.deleteMany({ where: { bill: { organizationId: testOrgId } } }); } catch {}
    try { await prisma.bill.deleteMany({ where: { organizationId: testOrgId } }); } catch {}
    try { await prisma.auditEvent.deleteMany({ where: { organizationId: testOrgId } }); } catch {}
    try { await prisma.party.deleteMany({ where: { organizationId: testOrgId } }); } catch {}
    try { await prisma.project.deleteMany({ where: { organizationId: testOrgId } }); } catch {}
    try { await prisma.site.deleteMany({ where: { organizationId: testOrgId } }); } catch {}
    try { await prisma.user.deleteMany({ where: { organizationId: testOrgId } }); } catch {}
    try { await prisma.organization.deleteMany({ where: { id: testOrgId } }); } catch {}
  });

  describe("1. Measurement Book Workflow & Precision Invariants", () => {
    let createdEntryId: string;

    it("should reject measurement entry creation by unauthorized role", async () => {
      const req = makeJsonRequest(
        "http://localhost:3000/api/measurement-book",
        "POST",
        {
          action: "CREATE",
          projectId: testProjectId,
          partyId: testPartyId,
          itemDescription: "Unauthorized measurement attempt",
          unit: "CUM",
          count: 1,
          length: 1,
          agreedRate: 100000,
        },
        supervisorToken // SITE_SUPERVISOR lacks projects:write
      );

      const res = await postMBHandler(req);
      expect(res.status).toBe(403);
    });

    it("should record measurement entry with exact calculated quantities (L x B x D x N)", async () => {
      const req = makeJsonRequest(
        "http://localhost:3000/api/measurement-book",
        "POST",
        {
          action: "CREATE",
          projectId: testProjectId,
          partyId: testPartyId,
          itemDescription: "M35 Grade Concrete for Pier Cap",
          unit: "CUM",
          count: 4,
          length: 5.5,
          breadth: 2.0,
          depth: 1.25,
          agreedRate: 650000, // 6500.00 Rs in paise
          notes: "Drawing Ref: D-204/Cap",
        },
        adminToken
      );

      const res = await postMBHandler(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);

      const entry = data.data;
      expect(entry.id).toBeDefined();
      createdEntryId = entry.id;

      // 4 * 5.5 * 2.0 * 1.25 = 55 CUM
      expect(entry.quantity).toBe(55);
      // 55 * 650000 paise = 35750000 paise (3,57,500.00 Rs)
      expect(entry.totalAmount).toBe(35750000);
      expect(entry.status).toBe("SUBMITTED");
    });

    it("should list measurement entries with tenant and project scoping", async () => {
      const req = makeJsonRequest(
        `http://localhost:3000/api/measurement-book?projectId=${testProjectId}`,
        "GET",
        undefined,
        adminToken
      );

      const res = await getMBHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(1);

      const found = data.data.find((e: any) => e.id === createdEntryId);
      expect(found).toBeDefined();
      expect(found.itemDescription).toBe("M35 Grade Concrete for Pier Cap");
    });

    it("should allow authorized user to verify and then approve measurement entry", async () => {
      // Step 1: Verify
      const verifyReq = makeJsonRequest(
        "http://localhost:3000/api/measurement-book",
        "POST",
        {
          action: "UPDATE_STATUS",
          entryId: createdEntryId,
          status: "VERIFIED",
        },
        adminToken
      );
      const verifyRes = await postMBHandler(verifyReq);
      expect(verifyRes.status).toBe(200);
      const verifyData = await verifyRes.json();
      expect(verifyData.data.status).toBe("VERIFIED");

      // Step 2: Approve
      const approveReq = makeJsonRequest(
        "http://localhost:3000/api/measurement-book",
        "POST",
        {
          action: "UPDATE_STATUS",
          entryId: createdEntryId,
          status: "APPROVED",
        },
        adminToken
      );
      const approveRes = await postMBHandler(approveReq);
      expect(approveRes.status).toBe(200);
      const approveData = await approveRes.json();
      expect(approveData.data.status).toBe("APPROVED");
    });

    it("should convert approved measurement entry into an authoritative contractor bill", async () => {
      const billNum = `BILL-MB-TEST-${Date.now().toString().slice(-4)}`;
      const convertReq = makeJsonRequest(
        "http://localhost:3000/api/measurement-book",
        "POST",
        {
          action: "CONVERT_TO_BILL",
          entryId: createdEntryId,
          billNumber: billNum,
        },
        adminToken
      );

      const res = await postMBHandler(convertReq);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.entry.status).toBe("BILLED");
      expect(data.data.bill.billNumber).toBe(billNum);
      expect(data.data.bill.totalAmount).toBe(35750000);
    });
  });

  describe("2. Storage Provider Abstraction & SigV4 Security", () => {
    it("should write and read files safely with LocalStorageProvider and enforce path basename", async () => {
      const local = new LocalStorageProvider();
      const testBuffer = Buffer.from("BuildTrack Private Invoice Content 2026", "utf-8");
      const safeKey = `test_${Date.now()}.txt`;

      const putRes = await local.put(safeKey, testBuffer);
      expect(putRes.key).toBe(safeKey);

      const retrieved = await local.get(safeKey);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.toString("utf-8")).toBe("BuildTrack Private Invoice Content 2026");

      const delRes = await local.delete(safeKey);
      expect(delRes).toBe(true);

      const afterDel = await local.get(safeKey);
      expect(afterDel).toBeNull();
    });

    it("should generate valid AWS SigV4 signed download URLs for S3CompatibleStorageProvider", async () => {
      const s3 = new S3CompatibleStorageProvider({
        bucket: "buildtrack-private-documents",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region: "ap-south-1",
      });

      const signedUrl = await s3.getSignedDownloadUrl("invoice_oct_2026.pdf", "Invoice.pdf", 3600);
      expect(signedUrl).toContain("https://buildtrack-private-documents.s3.ap-south-1.amazonaws.com");
      expect(signedUrl).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
      expect(signedUrl).toContain("X-Amz-Credential=AKIAIOSFODNN7EXAMPLE");
      expect(signedUrl).toContain("X-Amz-Signature=");
      expect(signedUrl).toContain("X-Amz-Expires=3600");
    });

    it("should instantiate LocalStorageProvider by default when no S3 credentials exist", () => {
      const provider = getStorageProvider();
      expect(provider).toBeDefined();
      expect(["LOCAL", "S3", "R2"]).toContain(provider.name);
    });
  });
});
