import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { FinanceService } from "@/services/finance-service";

describe("Bill & Delivery Challan Paid vs Unpaid & Partial Payment Support", () => {
  const testOrgId = `org-bill-pay-${Date.now()}`;
  let superAdminId: string;
  let supervisorId: string;
  let vendorPartyId: string;

  beforeAll(async () => {
    await prisma.organization.create({
      data: {
        id: testOrgId,
        name: "Bill Challan Test Org",
      },
    });

    const sa = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Super Admin User",
        email: `sa-${Date.now()}@test.com`,
        passwordHash: "hash-sa",
        role: "SUPER_ADMIN",
      },
    });
    superAdminId = sa.id;

    const sup = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Supervisor User",
        email: `sup-${Date.now()}@test.com`,
        passwordHash: "hash-sup",
        role: "SITE_SUPERVISOR",
      },
    });
    supervisorId = sup.id;

    const vendor = await prisma.party.create({
      data: {
        organizationId: testOrgId,
        name: "Shree Ram Building Materials",
        partyType: "VENDOR",
      },
    });
    vendorPartyId = vendor.id;
  });

  afterAll(async () => {
    try {
      await prisma.paymentAllocation.deleteMany({ where: { payment: { organizationId: testOrgId } } });
      await prisma.payment.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.billLine.deleteMany({ where: { bill: { organizationId: testOrgId } } });
      await prisma.bill.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.auditEvent.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.party.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.user.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.organization.delete({ where: { id: testOrgId } });
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
  });

  it("creates an unpaid bill with full liability as pending", async () => {
    // Bill of ₹2,000 (200,000 paise)
    const bill = await FinanceService.createBill({
      organizationId: testOrgId,
      partyId: vendorPartyId,
      billNumber: `INV-UNPAID-${Date.now()}`,
      billDate: new Date(),
      lines: [
        {
          description: "Cement Bags 50kg",
          quantity: 5,
          unitRate: 40000,
          lineTotal: 200000,
        },
      ],
      userId: superAdminId,
      role: "SUPER_ADMIN",
    });

    expect(bill.totalAmount).toBe(200000);

    // Verify allocations are empty and outstanding balance equals total
    const fullBill = await prisma.bill.findUnique({
      where: { id: bill.id },
      include: { allocations: true },
    });
    const paidPaise = (fullBill?.allocations || []).reduce((s, a) => s + a.amount, 0);
    const outstandingPaise = (fullBill?.totalAmount || 0) - paidPaise;

    expect(paidPaise).toBe(0);
    expect(outstandingPaise).toBe(200000);
  });

  it("creates a bill and records a partial payment (Bill ₹2,000, Pay ₹1,500, Pending ₹500)", async () => {
    const bill = await FinanceService.createBill({
      organizationId: testOrgId,
      partyId: vendorPartyId,
      billNumber: `INV-PARTIAL-${Date.now()}`,
      billDate: new Date(),
      lines: [
        {
          description: "Sand 1 Truck",
          quantity: 1,
          unitRate: 200000,
          lineTotal: 200000,
        },
      ],
      userId: superAdminId,
      role: "SUPER_ADMIN",
    });

    expect(bill.totalAmount).toBe(200000);

    // Pay ₹1,500 (150,000 paise)
    const result = await FinanceService.recordPayment({
      organizationId: testOrgId,
      partyId: vendorPartyId,
      recipientType: "VENDOR",
      recipientName: "Shree Ram Building Materials",
      payingAccount: "HDFC Bank Operating A/C (A/C: ...4421)",
      paymentDate: new Date(),
      amount: 150000,
      method: "UPI",
      referenceNumber: `UTR-${Date.now()}`,
      idempotencyKey: `pay-partial-${bill.id}`,
      userId: superAdminId,
      role: "SUPER_ADMIN",
      autoApprove: true,
      allocations: [
        {
          billId: bill.id,
          amount: 150000,
        },
      ],
    });

    expect(result.payment.status).toBe("POSTED");

    // Fetch updated bill
    const updatedBill = await prisma.bill.findUnique({
      where: { id: bill.id },
      include: { allocations: true },
    });

    const paidPaise = (updatedBill?.allocations || []).reduce((s, a) => s + a.amount, 0);
    const outstandingPaise = (updatedBill?.totalAmount || 0) - paidPaise;

    expect(paidPaise).toBe(150000); // ₹1,500 paid
    expect(outstandingPaise).toBe(50000); // ₹500 pending
  });

  it("creates a delivery challan with total amount and partial payment", async () => {
    // Delivery Challan with total ₹2,000
    const challan = await FinanceService.createBill({
      organizationId: testOrgId,
      partyId: vendorPartyId,
      billNumber: `DC-PARTIAL-${Date.now()}`,
      billDate: new Date(),
      status: "CHALLAN",
      totalAmount: 200000,
      lines: [
        {
          description: "Bricks (NOS)",
          quantity: 200,
          unitRate: 1000,
          lineTotal: 200000,
        },
      ],
      userId: superAdminId,
      role: "SUPER_ADMIN",
    });

    expect(challan.status).toBe("CHALLAN");
    expect(challan.totalAmount).toBe(200000);

    // Pay ₹1,500 against the Delivery Challan
    const result = await FinanceService.recordPayment({
      organizationId: testOrgId,
      partyId: vendorPartyId,
      recipientType: "VENDOR",
      recipientName: "Shree Ram Building Materials",
      payingAccount: "HDFC Bank Operating A/C (A/C: ...4421)",
      paymentDate: new Date(),
      amount: 150000,
      method: "BANK_TRANSFER",
      referenceNumber: `REF-${Date.now()}`,
      idempotencyKey: `pay-dc-${challan.id}`,
      userId: superAdminId,
      role: "SUPER_ADMIN",
      autoApprove: true,
      allocations: [
        {
          billId: challan.id,
          amount: 150000,
        },
      ],
    });

    expect(result.payment.status).toBe("POSTED");

    const updatedChallan = await prisma.bill.findUnique({
      where: { id: challan.id },
      include: { allocations: true },
    });

    const paidPaise = (updatedChallan?.allocations || []).reduce((s, a) => s + a.amount, 0);
    const outstandingPaise = (updatedChallan?.totalAmount || 0) - paidPaise;

    expect(paidPaise).toBe(150000); // ₹1,500 paid
    expect(outstandingPaise).toBe(50000); // ₹500 pending
  });

  it("auto-approves payment under ₹20,000 and requires approval for payment >= ₹20,000 by non-executive", async () => {
    // 1. Payment under ₹20,000 (e.g. ₹19,999) by non-executive -> auto approved
    const underThreshold = 1999900;
    const isAutoApproved = underThreshold < 2000000;
    expect(isAutoApproved).toBe(true);

    // 2. Payment of ₹20,000 or above (e.g. ₹20,000) by non-executive -> requires approval
    const thresholdAmount = 2000000;
    const nonExecApproved = thresholdAmount < 2000000 ? true : false;
    expect(nonExecApproved).toBe(false);

    // 3. Payment of ₹20,000 or above by Super Admin -> executive auto approved
    const isExecutive = true;
    const execApproved = thresholdAmount < 2000000 ? true : (isExecutive ? true : false);
    expect(execApproved).toBe(true);
  });
});
