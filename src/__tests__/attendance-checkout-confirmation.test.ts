import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { GET as getCheckOutStatusHandler } from "@/app/api/attendance/check-out-status/route";

function makeJsonRequest(url: string, method: string, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Cookie"] = `${SESSION_COOKIE_NAME}=${token}`;
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers,
  });
}

describe("Attendance Check-Out Confirmation & Pending Status Verification", () => {
  let org: any;
  let user: any;
  let project: any;
  let site: any;
  let party: any;

  beforeAll(async () => {
    org = await prisma.organization.create({
      data: {
        name: `Checkout Org ${Date.now()}`,
        currency: "INR",
      },
    });

    user = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: `checkout_user_${Date.now()}@buildtrack.test`,
        name: "Site Engineer",
        role: "SITE_SUPERVISOR",
        passwordHash: "hash_test_123",
      },
    });

    site = await prisma.site.create({
      data: {
        organizationId: org.id,
        name: `Checkout Site ${Date.now()}`,
        code: `CS-${Date.now().toString().slice(-4)}`,
        address: "Site Road, Jodhpur",
      },
    });

    project = await prisma.project.create({
      data: {
        organizationId: org.id,
        siteId: site.id,
        name: `Checkout Project ${Date.now()}`,
        code: `CP-${Date.now().toString().slice(-4)}`,
      },
    });

    party = await prisma.party.create({
      data: {
        organizationId: org.id,
        name: `Vendor XYZ ${Date.now()}`,
        partyType: "VENDOR",
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.paymentAllocation.deleteMany({ where: { bill: { organizationId: org?.id } } });
      await prisma.billLine.deleteMany({ where: { bill: { organizationId: org?.id } } });
      await prisma.bill.deleteMany({ where: { organizationId: org?.id } });
      await prisma.payment.deleteMany({ where: { organizationId: org?.id } });
      await prisma.task.deleteMany({ where: { organizationId: org?.id } });
      await prisma.party.deleteMany({ where: { organizationId: org?.id } });
      await prisma.project.deleteMany({ where: { organizationId: org?.id } });
      await prisma.site.deleteMany({ where: { organizationId: org?.id } });
      await prisma.user.deleteMany({ where: { organizationId: org?.id } });
      await prisma.organization.deleteMany({ where: { id: org?.id } });
    } catch {
      // ignore cleanup errors
    }
  });

  it("returns 401 when unauthenticated", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/attendance/check-out-status", "GET");
    const res = await getCheckOutStatusHandler(req);
    expect(res.status).toBe(401);
  });

  it("returns all clear when user has no pending tasks or unpaid bills", async () => {
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: org.id,
    });

    const req = makeJsonRequest("http://localhost:3000/api/attendance/check-out-status", "GET", token);
    const res = await getCheckOutStatusHandler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.hasPendingTasks).toBe(false);
    expect(json.data.hasPendingPayments).toBe(false);
    expect(json.data.hasPendingItems).toBe(false);
  });

  it("detects pending assigned tasks before check-out", async () => {
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: org.id,
    });

    // Create a pending task assigned to this user
    await prisma.task.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        title: "Complete daily rebar inspection",
        status: "PENDING",
        priority: "HIGH",
        assigneeUserId: user.id,
        createdBy: user.id,
        dueAt: new Date(),
      },
    });

    const req = makeJsonRequest("http://localhost:3000/api/attendance/check-out-status", "GET", token);
    const res = await getCheckOutStatusHandler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.hasPendingTasks).toBe(true);
    expect(json.data.pendingTasksCount).toBeGreaterThanOrEqual(1);
    expect(json.data.hasPendingItems).toBe(true);
    expect(json.data.pendingTasks[0].title).toBe("Complete daily rebar inspection");
  });

  it("detects pending payments and unpaid bills before check-out", async () => {
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: org.id,
    });

    // Create an unpaid bill
    await prisma.bill.create({
      data: {
        organizationId: org.id,
        partyId: party.id,
        projectId: project.id,
        billNumber: `BILL-${Date.now().toString().slice(-5)}`,
        billDate: new Date(),
        totalAmount: 500000,
        status: "POSTED",
        createdBy: user.id,
        lines: {
          create: [
            {
              description: "50 bags Cement Grade 53",
              lineTotal: 500000,
            },
          ],
        },
      },
    });

    const req = makeJsonRequest("http://localhost:3000/api/attendance/check-out-status", "GET", token);
    const res = await getCheckOutStatusHandler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.hasPendingPayments).toBe(true);
    expect(json.data.pendingPaymentsCount).toBeGreaterThanOrEqual(1);
    expect(json.data.hasPendingItems).toBe(true);
  });
});
