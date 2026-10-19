import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { FinanceService } from "@/services/finance-service";
import { roundPaise } from "@/lib/financial-math";

describe("Priority 4 & 6: Vendors, Contractors, Contract Progress, Payments & Audit Trail", () => {
  let orgId: string;
  let adminId: string;
  let accountantId: string;
  let projectId: string;
  let vendorPartyId: string;
  let contractorPartyId: string;
  let materialId: string;

  beforeAll(async () => {
    // 1. Setup organization and users
    const org = await prisma.organization.create({
      data: { name: `Bothra Priority 4 Org ${Date.now()}` },
    });
    orgId = org.id;

    const admin = await prisma.user.create({
      data: {
        organizationId: orgId,
        name: "Director Bothra",
        email: `director-${Date.now()}@bothracms.com`,
        passwordHash: "hash-admin",
        role: "ORG_ADMIN",
      },
    });
    adminId = admin.id;

    const accountant = await prisma.user.create({
      data: {
        organizationId: orgId,
        name: "Site Accountant Patel",
        email: `acc-${Date.now()}@bothracms.com`,
        passwordHash: "hash-acc",
        role: "ACCOUNTANT",
      },
    });
    accountantId = accountant.id;

    const site = await prisma.site.create({
      data: {
        organizationId: orgId,
        name: "Skyline Tower Site",
        code: `STS-${Date.now().toString().slice(-4)}`,
        address: "Plot 104, Civil Lines",
      },
    });

    const project = await prisma.project.create({
      data: {
        organizationId: orgId,
        siteId: site.id,
        name: "Skyline Heights Commercial Tower",
        code: `SHC-${Date.now().toString().slice(-4)}`,
        status: "ACTIVE",
        budgetAmount: 5000000, // ₹50 Lakhs
      },
    });
    projectId = project.id;

    const material = await prisma.material.create({
      data: {
        organizationId: orgId,
        name: "Fe550D TMT Reinforcement Steel",
        sku: `STEEL-${Date.now().toString().slice(-4)}`,
        unitCode: "TONNE",
        minStockQty: 10,
        reorderQty: 25,
      },
    });
    materialId = material.id;
  });

  it("should create distinct Vendor and Contractor profiles with contractor contract value", async () => {
    // Vendor: Material Supplier
    const vendor = await prisma.party.create({
      data: {
        organizationId: orgId,
        name: "Apex Steel Mills Ltd",
        partyType: "VENDOR",
        phone: "+919876543210",
        taxIdentifier: "27AAAAA0000A1Z5",
        notes: "Contact: Mr. Singhania",
        contractValue: 0,
      },
    });
    vendorPartyId = vendor.id;

    // Contractor: Civil Works Execution Contractor
    const contractor = await prisma.party.create({
      data: {
        organizationId: orgId,
        name: "Royal Infrastructure & RCC Contractors",
        partyType: "CONTRACTOR",
        phone: "+919876543211",
        taxIdentifier: "ABCDE1234F",
        notes: "Contact: Er. Rameshwar",
        contractValue: 250000000, // ₹25 Lakhs (in paise)
      },
    });
    contractorPartyId = contractor.id;

    expect(vendor.partyType).toBe("VENDOR");
    expect(contractor.partyType).toBe("CONTRACTOR");
    expect(contractor.contractValue).toBe(250000000);
  });

  it("should create progress bills for Contractor and Vendor with project allocation", async () => {
    // Contractor Progress Bill #1 (RA Bill 1)
    const contractorBill = await FinanceService.createBill({
      organizationId: orgId,
      partyId: contractorPartyId,
      projectId: projectId,
      billNumber: `RA-BILL-01-${Date.now()}`,
      billDate: new Date(),
      dueDate: new Date(Date.now() + 15 * 86400000),
      lines: [
        {
          description: "RCC Foundation Stage 1 casting and curing work",
          quantity: 1,
          unitRate: 50000000, // ₹5 Lakhs
          lineTotal: 50000000,
        },
      ],
      notes: "First running account progress bill certified by Project Engineer",
      userId: accountantId,
      role: "ACCOUNTANT",
    });

    expect(contractorBill.partyId).toBe(contractorPartyId);
    expect(contractorBill.projectId).toBe(projectId);
    expect(contractorBill.totalAmount).toBe(50000000);

    // Vendor Material Supply Bill
    const vendorBill = await FinanceService.createBill({
      organizationId: orgId,
      partyId: vendorPartyId,
      projectId: projectId,
      billNumber: `SUPPLY-INV-101-${Date.now()}`,
      billDate: new Date(),
      lines: [
        {
          description: "Supply of 15 MT Fe550D TMT Bars",
          materialId: materialId,
          quantity: 15,
          unitRate: 6000000, // ₹60,000 per MT
          lineTotal: 90000000, // ₹9 Lakhs
        },
      ],
      notes: "Delivered to Skyline Heights site as per Challan #7821",
      userId: accountantId,
      role: "ACCOUNTANT",
    });

    expect(vendorBill.partyId).toBe(vendorPartyId);
    expect(vendorBill.lines[0].materialId).toBe(materialId);
    expect(vendorBill.totalAmount).toBe(90000000);
  });

  it("should disburse payment against contractor progress bill and calculate correct outstanding balances", async () => {
    // Fetch contractor bills
    const bills = await prisma.bill.findMany({
      where: { partyId: contractorPartyId, organizationId: orgId },
      include: { allocations: { where: { reversedAt: null } } },
    });
    const bill = bills[0];
    expect(bill).toBeDefined();

    // Record partial payment of ₹3 Lakhs (30,000,000 paise) against ₹5 Lakhs bill
    const { payment } = await FinanceService.recordPayment({
      organizationId: orgId,
      partyId: contractorPartyId,
      recipientType: "CONTRACTOR",
      recipientName: "Royal Infrastructure & RCC Contractors",
      payingAccount: "HDFC Bank Operating A/c 50200012345",
      projectId: projectId,
      paymentDate: new Date(),
      amount: 30000000, // ₹3 Lakhs
      method: "NEFT_RTGS",
      referenceNumber: `UTR-${Date.now()}`,
      idempotencyKey: `PAY-CONTR-${Date.now()}`,
      userId: accountantId,
      role: "ACCOUNTANT",
      autoApprove: true,
      allocations: [{ billId: bill.id, amount: 30000000 }],
      notes: "Part payment against RA Bill 1",
    });

    expect(payment.status).toBe("POSTED");
    expect(payment.allocations.length).toBe(1);

    // Verify Contractor Statement Calculations
    const partyWithData = await prisma.party.findUnique({
      where: { id: contractorPartyId },
      include: {
        bills: {
          include: {
            allocations: {
              where: { reversedAt: null, payment: { status: "POSTED" } },
            },
          },
        },
        payments: {
          where: { status: "POSTED" },
        },
      },
    });

    const totalBilled = partyWithData!.bills.reduce((sum, b) => sum + b.totalAmount, 0);
    const totalPaid = partyWithData!.payments.reduce((sum, p) => sum + p.amount, 0);
    const outstandingBalance = roundPaise(totalBilled - totalPaid);
    const contractVal = partyWithData!.contractValue || 0;
    const remainingContractBalance = contractVal > 0 ? roundPaise(contractVal - totalBilled) : 0;

    expect(totalBilled).toBe(50000000); // ₹5 Lakhs billed
    expect(totalPaid).toBe(30000000);   // ₹3 Lakhs paid
    expect(outstandingBalance).toBe(20000000); // ₹2 Lakhs pending on current bills
    expect(remainingContractBalance).toBe(200000000); // ₹20 Lakhs unbilled contract value
  });

  it("should record material-wise supply breakdown accurately for vendor ledger", async () => {
    const vendorBills = await prisma.bill.findMany({
      where: { partyId: vendorPartyId, organizationId: orgId },
      include: {
        lines: {
          include: { material: true },
        },
      },
    });

    expect(vendorBills.length).toBeGreaterThan(0);
    const allLines = vendorBills.flatMap((b) => b.lines);
    const steelLines = allLines.filter((l) => l.materialId === materialId);

    expect(steelLines.length).toBe(1);
    expect(steelLines[0].quantity).toBe(15);
    expect(steelLines[0].material?.name).toBe("Fe550D TMT Reinforcement Steel");
  });

  it("should safely reverse a posted payment, restore bill balance, and log an audit event", async () => {
    // Find the contractor payment
    const payment = await prisma.payment.findFirst({
      where: { partyId: contractorPartyId, status: "POSTED" },
      include: { allocations: true },
    });
    expect(payment).toBeDefined();

    // Reverse the payment
    const reversed = await FinanceService.reversePayment({
      organizationId: orgId,
      paymentId: payment!.id,
      reason: "Cheque bounce / UTR returned due to incorrect beneficiary account suffix",
      userId: adminId,
      role: "ORG_ADMIN",
    });

    expect(reversed.status).toBe("REVERSED");
    expect(reversed.reversedAt).not.toBeNull();
    expect(reversed.reversalReason).toContain("beneficiary account suffix");

    // Verify allocations are reversed
    const allocations = await prisma.paymentAllocation.findMany({
      where: { paymentId: payment!.id },
    });
    for (const alloc of allocations) {
      expect(alloc.reversedAt).not.toBeNull();
    }

    // Verify bill's outstanding balance is fully restored to 50,000,000 paise
    const bill = await prisma.bill.findUnique({
      where: { id: payment!.allocations[0].billId },
      include: {
        allocations: {
          where: { reversedAt: null, payment: { status: "POSTED" } },
        },
      },
    });
    const paidAmount = bill!.allocations.reduce((sum, a) => sum + a.amount, 0);
    const restoredOutstanding = roundPaise(bill!.totalAmount - paidAmount);
    expect(restoredOutstanding).toBe(50000000); // Full ₹5 Lakhs is once again outstanding

    // Verify Audit Event was logged
    const auditLog = await prisma.auditEvent.findFirst({
      where: {
        organizationId: orgId,
        entityType: "PAYMENT",
        entityId: payment!.id,
        action: "PAYMENT_REVERSED",
      },
    });
    expect(auditLog).toBeDefined();
    expect(auditLog!.actorUserId).toBe(adminId);
    expect(auditLog!.reason).toContain("beneficiary account suffix");
  });

  it("should preserve party update audit history with changed fields and reason", async () => {
    const originalContractor = await prisma.party.findUnique({
      where: { id: contractorPartyId },
    });

    // Update contractor details (e.g., contract value revision)
    const newContractValue = 300000000; // Revised to ₹30 Lakhs
    await prisma.party.update({
      where: { id: contractorPartyId },
      data: {
        contractValue: newContractValue,
        phone: "+919876543999",
      },
    });

    // Create AuditEvent as done in /api/parties/[id]
    await prisma.auditEvent.create({
      data: {
        organizationId: orgId,
        actorUserId: adminId,
        action: "UPDATE",
        entityType: "PARTY",
        entityId: contractorPartyId,
        beforeJson: JSON.stringify({
          contractValue: originalContractor!.contractValue,
          phone: originalContractor!.phone,
        }),
        afterJson: JSON.stringify({
          contractValue: newContractValue,
          phone: "+919876543999",
        }),
        reason: "Contract amendment clause 4.2 approved by Chief Engineer for additional floor RCC works",
      },
    });

    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        organizationId: orgId,
        entityType: "PARTY",
        entityId: contractorPartyId,
      },
    });

    expect(auditEvents.length).toBeGreaterThan(0);
    const latestEvent = auditEvents[0];
    expect(latestEvent.action).toBe("UPDATE");
    expect(latestEvent.reason).toContain("Contract amendment clause 4.2");

    const before = JSON.parse(latestEvent.beforeJson || "{}");
    const after = JSON.parse(latestEvent.afterJson || "{}");
    expect(before.contractValue).toBe(250000000);
    expect(after.contractValue).toBe(300000000);
  });
});
