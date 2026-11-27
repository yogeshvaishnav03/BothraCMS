import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as serverAuth from "@/lib/server-auth";
import * as auth from "@/lib/auth";
import { GET as getCommandCenter } from "@/app/api/dashboard/command-center/route";
import { GET as getKpi } from "@/app/api/dashboard/kpi/route";
import { CommandCenterService } from "@/services/command-center-service";
import { shiftDate, istDateKey } from "@/lib/ist-date";

describe("Dashboard Date and Site Synchronization", () => {
  let orgId = "";
  let userId = "";
  let siteAId = "";
  let siteBId = "";
  let projectAId = "";
  let projectBId = "";

  const TARGET_DATE = "2026-11-24";
  const OTHER_DATE = "2026-11-25";

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `Sync Test Org ${Date.now()}` },
    });
    orgId = org.id;

    const user = await prisma.user.create({
      data: {
        organizationId: orgId,
        name: "Sync Test Admin",
        email: `sync-admin-${Date.now()}@test.local`,
        passwordHash: "dummy",
        role: "SUPER_ADMIN",
      },
    });
    userId = user.id;

    const siteA = await prisma.site.create({
      data: {
        organizationId: orgId,
        name: "Peva Nagar Site",
        code: "PEVA",
        address: "Peva Road, Jodhpur",
      },
    });
    siteAId = siteA.id;

    const siteB = await prisma.site.create({
      data: {
        organizationId: orgId,
        name: "Skyline Towers Site",
        code: "SKYL",
        address: "Skyline Road, Jodhpur",
      },
    });
    siteBId = siteB.id;

    const projA = await prisma.project.create({
      data: {
        organizationId: orgId,
        siteId: siteAId,
        name: "Peva Nagar Project",
        code: "PEVA-01",
        status: "ACTIVE",
      },
    });
    projectAId = projA.id;

    const projB = await prisma.project.create({
      data: {
        organizationId: orgId,
        siteId: siteBId,
        name: "Skyline Project",
        code: "SKYL-01",
        status: "ACTIVE",
      },
    });
    projectBId = projB.id;

    const vendor = await prisma.party.create({
      data: {
        organizationId: orgId,
        name: "Cement Supplier",
        partyType: "VENDOR",
      },
    });

    // Payment on TARGET_DATE for Site A
    await prisma.payment.create({
      data: {
        organizationId: orgId,
        projectId: projectAId,
        partyId: vendor.id,
        amount: 314000, // ₹3,140
        method: "UPI",
        referenceNumber: "UPI-SITEA-24",
        status: "POSTED",
        paymentDate: new Date(`${TARGET_DATE}T11:00:00.000+05:30`),
        idempotencyKey: `pay-a-${Date.now()}`,
        createdBy: userId,
      },
    });

    // Payment on TARGET_DATE for Site B
    await prisma.payment.create({
      data: {
        organizationId: orgId,
        projectId: projectBId,
        partyId: vendor.id,
        amount: 500000, // ₹5,000
        method: "BANK_TRANSFER",
        referenceNumber: "BANK-SITEB-24",
        status: "POSTED",
        paymentDate: new Date(`${TARGET_DATE}T14:00:00.000+05:30`),
        idempotencyKey: `pay-b-${Date.now()}`,
        createdBy: userId,
      },
    });

    // Payment on OTHER_DATE for Site A
    await prisma.payment.create({
      data: {
        organizationId: orgId,
        projectId: projectAId,
        partyId: vendor.id,
        amount: 999000,
        method: "CASH",
        referenceNumber: "CASH-SITEA-25",
        status: "POSTED",
        paymentDate: new Date(`${OTHER_DATE}T10:00:00.000+05:30`),
        idempotencyKey: `pay-a-other-${Date.now()}`,
        createdBy: userId,
      },
    });

    // Mock authentication
    const userContext = {
      userId,
      organizationId: orgId,
      email: "sync-admin@test.local",
      name: "Sync Test Admin",
      role: "SUPER_ADMIN" as const,
      organizationName: "Sync Test Org",
      currency: "INR",
      timezone: "Asia/Kolkata",
    };

    vi.spyOn(serverAuth, "requireUserContext").mockResolvedValue(userContext as any);
    vi.spyOn(auth, "getUserContext").mockResolvedValue(userContext as any);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await prisma.payment.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.project.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.site.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.party.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
  });

  it("shiftDate should accurately step backward and forward in calendar days", () => {
    expect(shiftDate("2026-11-24", -1)).toBe("2026-11-23");
    expect(shiftDate("2026-11-24", 1)).toBe("2026-11-25");
    expect(shiftDate("2026-12-01", -1)).toBe("2026-11-30");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("CommandCenterService.getOverview filters strictly by date and siteId", async () => {
    // 1. Without siteId on TARGET_DATE: returns sum of both sites
    const companyOverview = await CommandCenterService.getOverview(orgId, TARGET_DATE);
    expect(companyOverview.summary.paymentsCount).toBe(2);
    expect(companyOverview.summary.totalPaymentsAmount).toBe(814000); // 314000 + 500000

    // 2. With siteAId on TARGET_DATE: returns only Site A payment (₹3,140)
    const siteAOverview = await CommandCenterService.getOverview(orgId, TARGET_DATE, siteAId);
    expect(siteAOverview.summary.paymentsCount).toBe(1);
    expect(siteAOverview.summary.totalPaymentsAmount).toBe(314000);

    // 3. With siteBId on TARGET_DATE: returns only Site B payment (₹5,000)
    const siteBOverview = await CommandCenterService.getOverview(orgId, TARGET_DATE, siteBId);
    expect(siteBOverview.summary.paymentsCount).toBe(1);
    expect(siteBOverview.summary.totalPaymentsAmount).toBe(500000);

    // 4. On OTHER_DATE with siteAId: returns only payment for OTHER_DATE
    const siteAOther = await CommandCenterService.getOverview(orgId, OTHER_DATE, siteAId);
    expect(siteAOther.summary.paymentsCount).toBe(1);
    expect(siteAOther.summary.totalPaymentsAmount).toBe(999000);
  });

  it("API /api/dashboard/command-center accepts date and siteId parameters", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/dashboard/command-center?date=${TARGET_DATE}&siteId=${siteAId}`
    );
    const res = await getCommandCenter(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.date).toBe(TARGET_DATE);
    expect(json.data.summary.totalPaymentsAmount).toBe(314000);
    expect(json.data.summary.paymentsCount).toBe(1);
  });

  it("API /api/dashboard/kpi accepts date and siteId parameters", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/dashboard/kpi?date=${TARGET_DATE}&siteId=${siteAId}`
    );
    const res = await getKpi(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
  });
});
