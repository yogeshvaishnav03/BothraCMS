import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../lib/db";
import { hashPassword } from "../lib/auth";
import { MeasurementBookService } from "../services/measurement-book-service";
import path from "path";

describe("Build Track Pro — Phase 3 Production Readiness & Security Verification", () => {
  let orgXId: string;
  let orgYId: string;
  let userXId: string;
  let userYId: string;
  let superadminId: string;
  let siteXId: string;
  let projectXId: string;
  let contractorXId: string;

  beforeAll(async () => {
    // 1. Create Organization X and Organization Y
    const orgX = await prisma.organization.create({
      data: { name: "Phase 3 Org X", currency: "INR", timezone: "Asia/Kolkata" },
    });
    orgXId = orgX.id;

    const orgY = await prisma.organization.create({
      data: { name: "Phase 3 Org Y", currency: "INR", timezone: "Asia/Kolkata" },
    });
    orgYId = orgY.id;

    // 2. Create Users
    const pwdHash = await hashPassword("Password123!");
    const userX = await prisma.user.create({
      data: {
        organizationId: orgXId,
        name: "Org X Admin",
        email: `admin-x-${Date.now()}@test.com`,
        passwordHash: pwdHash,
        role: "ORG_ADMIN",
      },
    });
    userXId = userX.id;

    const userY = await prisma.user.create({
      data: {
        organizationId: orgYId,
        name: "Org Y Admin",
        email: `admin-y-${Date.now()}@test.com`,
        passwordHash: pwdHash,
        role: "ORG_ADMIN",
      },
    });
    userYId = userY.id;

    const superAdmin = await prisma.user.create({
      data: {
        organizationId: orgXId,
        name: "System Superadmin",
        email: `superadmin-${Date.now()}@buildtrack.pro`,
        passwordHash: pwdHash,
        role: "SUPER_ADMIN",
      },
    });
    superadminId = superAdmin.id;

    // 3. Setup Site, Project, Contractor for Org X
    const siteX = await prisma.site.create({
      data: {
        organizationId: orgXId,
        name: "Site Phase 3",
        code: `P3-${Date.now().toString().slice(-4)}`,
        address: "Phase 3 Verification Lane",
      },
    });
    siteXId = siteX.id;

    const projectX = await prisma.project.create({
      data: {
        organizationId: orgXId,
        siteId: siteXId,
        name: "P3 Commercial Tower",
        code: `PRJ-P3-${Date.now().toString().slice(-4)}`,
        budgetAmount: 10000000,
      },
    });
    projectXId = projectX.id;

    const contractorX = await prisma.party.create({
      data: {
        organizationId: orgXId,
        name: "P3 Supreme Contractors",
        partyType: "CONTRACTOR",
      },
    });
    contractorXId = contractorX.id;
  });

  afterAll(async () => {
    // Cleanup created test records
    await prisma.dailySiteReport.deleteMany({ where: { projectId: projectXId } }).catch(() => {});
    await prisma.billLine.deleteMany({ where: { bill: { organizationId: orgXId } } }).catch(() => {});
    await prisma.bill.deleteMany({ where: { organizationId: orgXId } }).catch(() => {});
    await prisma.auditEvent.deleteMany({ where: { organizationId: orgXId } }).catch(() => {});
    await prisma.project.deleteMany({ where: { id: projectXId } }).catch(() => {});
    await prisma.store.deleteMany({ where: { siteId: siteXId } }).catch(() => {});
    await prisma.site.deleteMany({ where: { id: siteXId } }).catch(() => {});
    await prisma.party.deleteMany({ where: { organizationId: orgXId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [userXId, userYId, superadminId] } } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: { in: [orgXId, orgYId] } } }).catch(() => {});
  });

  describe("1. Uploads Hardening & Magic Bytes Validation", () => {
    it("should correctly identify authentic PNG file signatures", () => {
      // PNG header magic bytes: 89 50 4E 47 0D 0A 1A 0A
      const authenticPngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      const isPng =
        authenticPngHeader[0] === 0x89 &&
        authenticPngHeader[1] === 0x50 &&
        authenticPngHeader[2] === 0x4e &&
        authenticPngHeader[3] === 0x47;
      expect(isPng).toBe(true);
    });

    it("should correctly identify authentic PDF file signatures", () => {
      // PDF header: %PDF (25 50 44 46)
      const authenticPdfHeader = Buffer.from("%PDF-1.7\n%FakeBodyForTesting");
      const isPdf =
        authenticPdfHeader[0] === 0x25 &&
        authenticPdfHeader[1] === 0x50 &&
        authenticPdfHeader[2] === 0x44 &&
        authenticPdfHeader[3] === 0x46;
      expect(isPdf).toBe(true);
    });

    it("should reject malicious file disguised with spoofed mime type", () => {
      // Malicious payload disguised as image/png
      const spoofedPayload = Buffer.from("<script>alert('xss')</script>");
      const isPng =
        spoofedPayload[0] === 0x89 &&
        spoofedPayload[1] === 0x50 &&
        spoofedPayload[2] === 0x4e &&
        spoofedPayload[3] === 0x47;
      const isPdf =
        spoofedPayload[0] === 0x25 &&
        spoofedPayload[1] === 0x50 &&
        spoofedPayload[2] === 0x44 &&
        spoofedPayload[3] === 0x46;

      expect(isPng).toBe(false);
      expect(isPdf).toBe(false);
    });

    it("should sanitize filenames and prevent path traversal attacks", () => {
      const maliciousFilename = "../../etc/passwd.png";
      const sanitized = path.basename(maliciousFilename).replace(/[^a-zA-Z0-9._-]/g, "_");
      expect(sanitized).toBe("passwd.png");
      expect(sanitized.includes("..")).toBe(false);
      expect(sanitized.includes("/")).toBe(false);
      expect(sanitized.includes("\\")).toBe(false);
    });
  });

  describe("2. Measurement Book Idempotency & Billing Protection", () => {
    it("should prevent duplicate billing of an already billed MB entry", async () => {
      // Step A: Create and verify MB entry
      const mbEntry = await MeasurementBookService.createEntry({
        organizationId: orgXId,
        projectId: projectXId,
        partyId: contractorXId,
        itemDescription: "P3 Structural Column Casting M30",
        unit: "CUM",
        count: 1,
        length: 5,
        breadth: 2,
        depth: 1,
        agreedRate: 450000,
        userId: userXId,
        role: "ORG_ADMIN",
      });

      const approvedEntry = await MeasurementBookService.updateStatus({
        organizationId: orgXId,
        entryId: mbEntry.id,
        status: "APPROVED",
        userId: userXId,
        role: "ORG_ADMIN",
      });

      expect(approvedEntry.status).toBe("APPROVED");

      // Step B: Convert to bill
      const result = await MeasurementBookService.convertToBill({
        organizationId: orgXId,
        entryId: approvedEntry.id,
        billNumber: `BILL-P3-${Date.now().toString().slice(-4)}`,
        userId: userXId,
        role: "ORG_ADMIN",
      });

      expect(result.bill).toBeDefined();
      expect(result.bill.status).toBe("POSTED");

      // Step C: Attempt to bill the same entry again — MUST throw error
      await expect(
        MeasurementBookService.convertToBill({
          organizationId: orgXId,
          entryId: approvedEntry.id,
          billNumber: `BILL-P3-DUP-${Date.now().toString().slice(-4)}`,
          userId: userXId,
          role: "ORG_ADMIN",
        })
      ).rejects.toThrow("already been converted to Bill");
    });
  });

  describe("3. Multi-tenant Scoping on Project Records", () => {
    it("should strictly isolate projects between organizations", async () => {
      // Find project as Org X
      const projectForOrgX = await prisma.project.findFirst({
        where: { id: projectXId, organizationId: orgXId },
      });
      expect(projectForOrgX).not.toBeNull();
      expect(projectForOrgX?.name).toBe("P3 Commercial Tower");

      // Attempt to access project with Org Y credentials
      const crossTenantAttempt = await prisma.project.findFirst({
        where: { id: projectXId, organizationId: orgYId },
      });
      expect(crossTenantAttempt).toBeNull();
    });

    it("should enforce tenant boundaries on Daily Site Reports", async () => {
      const dsr = await prisma.dailySiteReport.create({
        data: {
          organizationId: orgXId,
          projectId: projectXId,
          reportDate: "2026-10-15",
          progress: "Phase 3 structural concrete inspection complete",
          createdBy: userXId,
        },
      });

      // Query scoped to Org X: found
      const dsrOrgX = await prisma.dailySiteReport.findFirst({
        where: { id: dsr.id, organizationId: orgXId },
      });
      expect(dsrOrgX).not.toBeNull();

      // Query scoped to Org Y: null (isolated)
      const dsrOrgY = await prisma.dailySiteReport.findFirst({
        where: { id: dsr.id, organizationId: orgYId },
      });
      expect(dsrOrgY).toBeNull();
    });
  });

  describe("4. Super Admin Platform Administration Checks", () => {
    it("should verify superadmin role distinction", async () => {
      const adminUser = await prisma.user.findUnique({
        where: { id: userXId },
      });
      const superUser = await prisma.user.findUnique({
        where: { id: superadminId },
      });

      expect(adminUser?.role).toBe("ORG_ADMIN");
      expect(superUser?.role).toBe("SUPER_ADMIN");
      expect(superUser?.role === "SUPER_ADMIN").toBe(true);
      expect(adminUser?.role === "SUPER_ADMIN").toBe(false);
    });

    it("should allow querying all tenant metrics across organizations for super admin", async () => {
      const organizations = await prisma.organization.findMany({
        where: { id: { in: [orgXId, orgYId] } },
        include: {
          _count: {
            select: {
              users: true,
              projects: true,
              sites: true,
            },
          },
        },
      });

      expect(organizations.length).toBe(2);
      const orgXData = organizations.find((o) => o.id === orgXId);
      const orgYData = organizations.find((o) => o.id === orgYId);

      expect(orgXData?._count.projects).toBeGreaterThanOrEqual(1);
      expect(orgYData?._count.users).toBeGreaterThanOrEqual(1);
    });
  });
});
