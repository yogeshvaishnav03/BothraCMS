import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { GET } from "@/app/api/dashboard/command-center/route";

const DATE = "2030-03-15";
let orgId = "";
let userId = "";

function mockUser(role: string) {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId,
    organizationId: orgId,
    email: "cc-admin@test.local",
    name: "Command Center Admin",
    role: role as any,
    organizationName: "CC Test Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

function get(query = `?date=${DATE}`) {
  return GET(new NextRequest(`http://localhost:3000/api/dashboard/command-center${query}`));
}

describe("Admin Command Center API", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `CC Test Org ${Date.now()}` } });
    orgId = org.id;
    const user = await prisma.user.create({
      data: {
        organizationId: orgId,
        name: "Command Center Admin",
        email: `cc-admin-${Date.now()}@test.local`,
        passwordHash: "x",
        role: "ORG_ADMIN",
      },
    });
    userId = user.id;
    const party = await prisma.party.create({
      data: { organizationId: orgId, partyType: "VENDOR", name: "Shree Cement Traders" },
    });

    // A ₹50,000 bill and a ₹20,000 posted payment on DATE, plus a ₹5,000 payment awaiting approval.
    const bill = await prisma.bill.create({
      data: {
        organizationId: orgId,
        partyId: party.id,
        billNumber: "CC-BILL-1",
        billDate: new Date(`${DATE}T10:00:00.000+05:30`),
        totalAmount: 5_000_000,
        createdBy: userId,
      },
    });
    const posted = await prisma.payment.create({
      data: {
        organizationId: orgId,
        partyId: party.id,
        paymentDate: new Date(`${DATE}T12:00:00.000+05:30`),
        amount: 2_000_000,
        method: "UPI",
        referenceNumber: "UPI-CC-1",
        status: "POSTED",
        idempotencyKey: `cc-posted-${Date.now()}`,
        createdBy: userId,
      },
    });
    await prisma.paymentAllocation.create({
      data: { paymentId: posted.id, billId: bill.id, amount: 2_000_000 },
    });
    await prisma.payment.create({
      data: {
        organizationId: orgId,
        partyId: party.id,
        paymentDate: new Date(`${DATE}T15:00:00.000+05:30`),
        amount: 500_000,
        method: "CASH",
        referenceNumber: "CASH-CC-2",
        status: "PENDING_APPROVAL",
        idempotencyKey: `cc-pending-${Date.now()}`,
        createdBy: userId,
      },
    });
    await prisma.auditEvent.create({
      data: {
        organizationId: orgId,
        actorUserId: userId,
        action: "PAYMENT_POSTED",
        entityType: "PAYMENT",
        entityId: posted.id,
        createdAt: new Date(`${DATE}T12:01:00.000+05:30`),
      },
    });
  });

  afterAll(async () => {
    if (orgId) await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("gives an admin the day's timeline, approvals, payables, trend and team activity", async () => {
    mockUser("ORG_ADMIN");
    const res = await get();
    const json = await res.json();

    expect(res.status).toBe(200);
    const data = json.data;
    expect(data.date).toBe(DATE);
    expect(data.summary.billsCount).toBe(1);
    expect(data.timeline.map((t: any) => t.kind).sort()).toEqual(["BILL", "PAYMENT", "PAYMENT"]);
    expect(data.approvals.paymentsPendingCount).toBe(1);
    expect(data.approvals.paymentsPendingAmount).toBe(500_000);
    expect(data.finance.outstandingPayables).toBe(3_000_000);
    expect(data.finance.trend).toHaveLength(7);
    expect(data.finance.trend[6]).toEqual({ date: DATE, paid: 2_000_000, billed: 5_000_000, received: 0 });
    expect(data.team).toHaveLength(1);
    expect(data.team[0]).toMatchObject({ userId, actions: 1 });
    expect(data.activity[0].action).toBe("PAYMENT_POSTED");
  });

  it("is refused for non-admin roles", async () => {
    for (const role of ["PROJECT_MANAGER", "SITE_SUPERVISOR", "ACCOUNTANT"]) {
      mockUser(role);
      const res = await get();
      expect(res.status).toBe(403);
    }
  });

  it("rejects a malformed date", async () => {
    mockUser("SUPER_ADMIN");
    const res = await get("?date=15-03-2030");
    expect(res.status).toBe(422);
  });
});

describe("formatCompactINR", () => {
  it("shortens paise amounts the Indian way", async () => {
    const { formatCompactINR } = await import("@/lib/formatters");
    expect(formatCompactINR(95_000)).toBe("₹950");
    expect(formatCompactINR(1_250_000)).toBe("₹12.5K");
    expect(formatCompactINR(34_000_000)).toBe("₹3.4L");
    expect(formatCompactINR(1_200_000_000)).toBe("₹1.2Cr");
    expect(formatCompactINR(null)).toBe("₹0");
  });
});
