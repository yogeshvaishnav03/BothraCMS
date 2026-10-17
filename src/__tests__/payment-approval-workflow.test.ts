import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { FinanceService } from "@/services/finance-service";

describe("Payment Approval Workflow (Super Admin Confirmation & Paying Account)", () => {
  const testOrgId = `org-payapp-${Date.now()}`;
  let superAdminId: string;
  let supervisorId: string;
  let accountantId: string;
  let vendorPartyId: string;
  let contractorPartyId: string;
  let testBillId: string;

  beforeAll(async () => {
    // Create Organization
    await prisma.organization.create({
      data: {
        id: testOrgId,
        name: "Bothra Payment Approval Test Org",
      },
    });

    // Create Super Admin
    const sa = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Executive Super Admin",
        email: `sa-${Date.now()}@bothra.com`,
        passwordHash: "hash-sa",
        role: "SUPER_ADMIN",
      },
    });
    superAdminId = sa.id;

    // Create Site Supervisor
    const sup = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Site Supervisor Verma",
        email: `sup-${Date.now()}@bothra.com`,
        passwordHash: "hash-sup",
        role: "SITE_SUPERVISOR",
      },
    });
    supervisorId = sup.id;

    // Create Accountant
    const acc = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Chief Accountant Sharma",
        email: `acc-${Date.now()}@bothra.com`,
        passwordHash: "hash-acc",
        role: "ACCOUNTANT",
      },
    });
    accountantId = acc.id;

    // Create Vendor Party
    const vendor = await prisma.party.create({
      data: {
        organizationId: testOrgId,
        name: "Ultratech Cement Distributor",
        partyType: "VENDOR",
      },
    });
    vendorPartyId = vendor.id;

    // Create Contractor Party
    const contractor = await prisma.party.create({
      data: {
        organizationId: testOrgId,
        name: "Verma Shuttering Contractors",
        partyType: "CONTRACTOR",
      },
    });
    contractorPartyId = contractor.id;

    // Create a Bill for Vendor (₹50,000 = 5,000,000 paise)
    const bill = await FinanceService.createBill({
      organizationId: testOrgId,
      partyId: vendorPartyId,
      billNumber: `BILL-CEMENT-${Date.now()}`,
      billDate: new Date(),
      lines: [
        {
          description: "UltraTech PPC Cement (100 bags)",
          lineTotal: 5000000,
        },
      ],
      userId: accountantId,
      role: "ACCOUNTANT",
    });
    testBillId = bill.id;
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

  it("Scenario 1: Paying a Vendor raises an approval query to Super Admin and does NOT debit bill until approved", async () => {
    // 1. Accountant initiates payment to Vendor with paying account and reason
    const result = await FinanceService.recordPayment({
      organizationId: testOrgId,
      partyId: vendorPartyId,
      recipientType: "VENDOR",
      payingAccount: "HDFC Bank Operating A/C (A/C: ...4421)",
      approvalQuery: "Advance payment for cement supply delivery batch #12",
      paymentDate: new Date(),
      amount: 2000000, // ₹20,000
      method: "BANK_TRANSFER",
      referenceNumber: "NEFT-HDFC-00129",
      idempotencyKey: `idemp-vendor-${Date.now()}`,
      allocations: [{ billId: testBillId, amount: 2000000 }],
      userId: accountantId,
      role: "ACCOUNTANT",
      autoApprove: false,
    });

    const payment = result.payment;
    expect(payment.status).toBe("PENDING_APPROVAL");
    expect(payment.payingAccount).toBe("HDFC Bank Operating A/C (A/C: ...4421)");
    expect(payment.approvalQuery).toBe("Advance payment for cement supply delivery batch #12");
    expect(payment.recipientType).toBe("VENDOR");

    // 2. While PENDING_APPROVAL, verify that vendor statement still shows ₹50,000 outstanding (bill is NOT debited yet!)
    const statementBeforeApproval = await FinanceService.getPartyStatement(testOrgId, vendorPartyId);
    expect(statementBeforeApproval.totalBilled).toBe(5000000);
    expect(statementBeforeApproval.totalPaid).toBe(0);
    expect(statementBeforeApproval.outstandingBalance).toBe(5000000);

    // 3. Super Admin reviews and confirms payment approval
    const approvedPayment = await FinanceService.approvePayment({
      organizationId: testOrgId,
      paymentId: payment.id,
      userId: superAdminId,
      role: "SUPER_ADMIN",
      approverName: "Executive Super Admin",
      notes: "Verified delivery challan and approved disbursement from HDFC account.",
    });

    expect(approvedPayment.status).toBe("POSTED");
    expect(approvedPayment.approvedBy).toContain("Executive Super Admin");
    expect(approvedPayment.approvedAt).not.toBeNull();

    // 4. Now that payment is POSTED, statement reflects ₹20,000 paid and ₹30,000 outstanding!
    const statementAfterApproval = await FinanceService.getPartyStatement(testOrgId, vendorPartyId);
    expect(statementAfterApproval.totalBilled).toBe(5000000);
    expect(statementAfterApproval.totalPaid).toBe(2000000);
    expect(statementAfterApproval.outstandingBalance).toBe(3000000);
  });

  it("Scenario 2: Paying an Employee directly with purpose and source account raises approval query and approves cleanly", async () => {
    // Supervisor submits payment reimbursement for an Employee without partyId
    const result = await FinanceService.recordPayment({
      organizationId: testOrgId,
      recipientType: "EMPLOYEE",
      recipientName: "Kailash Chand (Senior Site Supervisor)",
      payingAccount: "Site Office Petty Cash Wallet",
      approvalQuery: "Reimbursement for local transport and site safety equipment purchase",
      paymentDate: new Date(),
      amount: 450000, // ₹4,500
      method: "CASH",
      referenceNumber: "CASH-VOUCHER-881",
      idempotencyKey: `idemp-emp-${Date.now()}`,
      userId: supervisorId,
      role: "SITE_SUPERVISOR",
      autoApprove: false,
    });

    const payment = result.payment;
    expect(payment.status).toBe("PENDING_APPROVAL");
    expect(payment.recipientType).toBe("EMPLOYEE");
    expect(payment.recipientName).toBe("Kailash Chand (Senior Site Supervisor)");
    expect(payment.payingAccount).toBe("Site Office Petty Cash Wallet");

    // Super Admin approves the employee payment
    const approved = await FinanceService.approvePayment({
      organizationId: testOrgId,
      paymentId: payment.id,
      userId: superAdminId,
      role: "SUPER_ADMIN",
      approverName: "Executive Super Admin",
    });

    expect(approved.status).toBe("POSTED");
    expect(approved.approvedBy).toContain("SUPER_ADMIN");
  });

  it("Scenario 3: Paying a Contractor can be rejected by Super Admin with rejection reason", async () => {
    // Supervisor submits a contractor advance payment
    const result = await FinanceService.recordPayment({
      organizationId: testOrgId,
      partyId: contractorPartyId,
      recipientType: "CONTRACTOR",
      recipientName: "Verma Shuttering Contractors",
      payingAccount: "State Bank of India CMS Current A/C (A/C: ...1109)",
      approvalQuery: "Advance request for 4th floor slab shuttering labor",
      paymentDate: new Date(),
      amount: 6000000, // ₹60,000
      method: "BANK_TRANSFER",
      referenceNumber: "NEFT-SBI-ADV-902",
      idempotencyKey: `idemp-contractor-${Date.now()}`,
      userId: supervisorId,
      role: "SITE_SUPERVISOR",
      autoApprove: false,
    });

    const payment = result.payment;
    expect(payment.status).toBe("PENDING_APPROVAL");

    // Super Admin rejects the payment query
    const rejected = await FinanceService.rejectPayment({
      organizationId: testOrgId,
      paymentId: payment.id,
      userId: superAdminId,
      role: "SUPER_ADMIN",
      rejectorName: "Executive Super Admin",
      reason: "Work measurements for 4th floor not verified in MB yet. Resubmit after MB entry.",
    });

    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectionReason).toBe(
      "Work measurements for 4th floor not verified in MB yet. Resubmit after MB entry."
    );
    expect(rejected.approvedBy).toContain("Executive Super Admin");

    // Attempting to approve an already rejected payment should throw
    await expect(
      FinanceService.approvePayment({
        organizationId: testOrgId,
        paymentId: payment.id,
        userId: superAdminId,
        role: "SUPER_ADMIN",
        approverName: "Executive Super Admin",
      })
    ).rejects.toThrow("Cannot approve payment in 'REJECTED' status");
  });

  it("Scenario 4: Super Admin can directly auto-approve payment when explicitly requested", async () => {
    // Super Admin submits payment directly with autoApprove: true
    const result = await FinanceService.recordPayment({
      organizationId: testOrgId,
      partyId: vendorPartyId,
      recipientType: "VENDOR",
      payingAccount: "ICICI Bank Project Escrow A/C",
      approvalQuery: "Emergency procurement direct settlement by Super Admin",
      paymentDate: new Date(),
      amount: 1000000, // ₹10,000
      method: "UPI",
      referenceNumber: "UPI-ICICI-SA-009",
      idempotencyKey: `idemp-sa-direct-${Date.now()}`,
      userId: superAdminId,
      role: "SUPER_ADMIN",
      autoApprove: true,
    });

    expect(result.payment.status).toBe("POSTED");
    expect(result.payment.approvedBy).toContain("Auto-Approved");
    expect(result.payment.payingAccount).toBe("ICICI Bank Project Escrow A/C");
  });

  it("Scenario 5: Audit events are recorded for payment queries, approvals, and rejections", async () => {
    const auditLogs = await prisma.auditEvent.findMany({
      where: {
        organizationId: testOrgId,
        entityType: "PAYMENT",
      },
      orderBy: { createdAt: "desc" },
    });

    const actions = auditLogs.map((a) => a.action);
    expect(actions).toContain("PAYMENT_APPROVAL_REQUESTED");
    expect(actions).toContain("PAYMENT_APPROVED");
    expect(actions).toContain("PAYMENT_REJECTED");
  });
});
