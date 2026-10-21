import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { FinanceService } from "@/services/finance-service";
import type { Role } from "@/lib/permissions";

describe("Payment auto-approval is restricted to SUPER_ADMIN / ORG_ADMIN", () => {
  const stamp = Date.now();
  const testOrgId = `org-autoapprove-${stamp}`;
  const userIds: Partial<Record<Role, string>> = {};
  let partyId: string;
  let seq = 0;

  const roles: Role[] = ["SUPER_ADMIN", "ORG_ADMIN", "ACCOUNTANT", "PROJECT_MANAGER"];

  beforeAll(async () => {
    await prisma.organization.create({
      data: { id: testOrgId, name: "Auto-Approve Restriction Test Org" },
    });
    for (const role of roles) {
      const u = await prisma.user.create({
        data: {
          organizationId: testOrgId,
          name: `${role} user`,
          email: `${role.toLowerCase()}-${stamp}@autoapprove.test`,
          passwordHash: "not-a-real-hash",
          role,
        },
      });
      userIds[role] = u.id;
    }
    const party = await prisma.party.create({
      data: { organizationId: testOrgId, name: "Test Vendor", partyType: "VENDOR" },
    });
    partyId = party.id;
  });

  afterAll(async () => {
    try {
      await prisma.paymentAllocation.deleteMany({ where: { payment: { organizationId: testOrgId } } });
      await prisma.payment.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.auditEvent.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.party.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.user.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.organization.delete({ where: { id: testOrgId } });
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
  });

  async function pay(role: Role, extra: { autoApprove?: boolean; status?: string }) {
    seq += 1;
    const { payment } = await FinanceService.recordPayment({
      organizationId: testOrgId,
      partyId,
      paymentDate: new Date(),
      amount: 100000,
      method: "UPI",
      referenceNumber: `REF-${stamp}-${seq}`,
      idempotencyKey: `idemp-autoapprove-${stamp}-${seq}`,
      userId: userIds[role]!,
      role,
      ...extra,
    });
    return payment;
  }

  it("ACCOUNTANT with autoApprove: true still gets PENDING_APPROVAL", async () => {
    const payment = await pay("ACCOUNTANT", { autoApprove: true });
    expect(payment.status).toBe("PENDING_APPROVAL");
    expect(payment.approvedAt).toBeNull();
  });

  it("ACCOUNTANT sending status POSTED still gets PENDING_APPROVAL", async () => {
    const payment = await pay("ACCOUNTANT", { status: "POSTED" });
    expect(payment.status).toBe("PENDING_APPROVAL");
  });

  it("PROJECT_MANAGER (no finance:write) cannot auto-post a payment", async () => {
    await expect(pay("PROJECT_MANAGER", { autoApprove: true })).rejects.toThrow(/Forbidden/);
  });

  it("ORG_ADMIN with autoApprove: true is POSTED", async () => {
    const payment = await pay("ORG_ADMIN", { autoApprove: true });
    expect(payment.status).toBe("POSTED");
    expect(payment.approvedAt).not.toBeNull();
  });

  it("SUPER_ADMIN sending status POSTED is POSTED", async () => {
    const payment = await pay("SUPER_ADMIN", { status: "POSTED" });
    expect(payment.status).toBe("POSTED");
  });

  it("ORG_ADMIN can still choose to route a payment for approval", async () => {
    const payment = await pay("ORG_ADMIN", { autoApprove: false });
    expect(payment.status).toBe("PENDING_APPROVAL");
  });
});
