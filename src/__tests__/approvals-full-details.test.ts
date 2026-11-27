import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { GET as getApprovals, POST as postApproval } from "@/app/api/approvals/route";
import { NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

describe("Pending Approvals Queue - Full Details & Interactive View Tests", () => {
  const testOrgId = `org-appr-details-${Date.now()}`;
  let superAdminUser: any;
  let supervisorUser: any;
  let superAdminToken: string;
  let supervisorToken: string;
  let vendorParty: any;
  let project: any;
  let site: any;
  let material: any;
  let payment: any;
  let materialRequest: any;
  let purchaseOrder: any;

  beforeAll(async () => {
    // 1. Create Organization
    await prisma.organization.create({
      data: {
        id: testOrgId,
        name: "Approvals Detail Test Organization",
      },
    });

    // 2. Create Super Admin
    superAdminUser = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Master Super Admin",
        email: `admin-${Date.now()}@bothracms.com`,
        passwordHash: "dummy-hash",
        role: "SUPER_ADMIN",
      },
    });

    superAdminToken = await createSessionToken({
      userId: superAdminUser.id,
      email: superAdminUser.email,
      role: superAdminUser.role,
      organizationId: testOrgId,
    });

    // 3. Create Supervisor
    supervisorUser = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Ranjan Sharma",
        email: `ranjan-${Date.now()}@bothracms.com`,
        passwordHash: "dummy-hash",
        role: "SITE_SUPERVISOR",
      },
    });

    supervisorToken = await createSessionToken({
      userId: supervisorUser.id,
      email: supervisorUser.email,
      role: supervisorUser.role,
      organizationId: testOrgId,
    });

    // 4. Create Site and Project
    site = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        code: `SITE-${Date.now().toString().slice(-4)}`,
        name: "Peva Nagar Site",
        address: "Peva Nagar, Jodhpur",
      },
    });

    project = await prisma.project.create({
      data: {
        organizationId: testOrgId,
        siteId: site.id,
        name: "Peva Nagar Commercial Complex",
        code: "PN-COMM",
        status: "ACTIVE",
      },
    });

    // 5. Create Vendor Party
    vendorParty = await prisma.party.create({
      data: {
        organizationId: testOrgId,
        name: "OM CEMENT",
        partyType: "VENDOR",
        phone: "9876543210",
      },
    });

    // 6. Create Material
    material = await prisma.material.create({
      data: {
        organizationId: testOrgId,
        name: "10MM MUNGIYA",
        sku: `SKU-MUNG-${Date.now()}`,
        unitCode: "TON",
        unitPrice: 50000, // 500.00 rupees in paise
      },
    });

    // 7. Create Payment Request with payingAccount, method, note
    payment = await prisma.payment.create({
      data: {
        organizationId: testOrgId,
        partyId: vendorParty.id,
        recipientName: "OM CEMENT",
        recipientType: "VENDOR",
        payingAccount: "HDFC Bank Operating A/C (A/C: ...4421)",
        method: "BANK_TRANSFER",
        costHead: "MATERIALS",
        referenceNumber: `PAY-${Date.now()}`,
        paymentDate: new Date(),
        amount: 600000, // 6,000.00 INR (in paise)
        status: "PENDING_APPROVAL",
        approvalQuery: "For advance given",
        notes: "Urgent advance requested for site delivery",
        idempotencyKey: `idem-pay-${Date.now()}`,
        createdBy: supervisorUser.id,
        projectId: project.id,
      },
    });

    // 8. Create Material Request with items
    materialRequest = await prisma.materialRequest.create({
      data: {
        organizationId: testOrgId,
        requestNumber: `MR-${Date.now().toString().slice(-6)}`,
        projectId: project.id,
        requestedById: supervisorUser.id,
        neededBy: new Date(Date.now() + 86400000),
        priority: "URGENT",
        status: "PENDING",
        notes: "600 feet mungiya need at peva nagar",
        items: {
          create: [
            {
              description: "10MM MUNGIYA",
              quantity: 600,
              unitCode: "TON",
              materialId: material.id,
            },
          ],
        },
      },
    });

    // 9. Create Purchase Order
    purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        organizationId: testOrgId,
        orderNumber: `PO-${Date.now().toString().slice(-6)}`,
        materialId: material.id,
        vendorPartyId: vendorParty.id,
        quantity: 18,
        unitCode: "TON",
        unitRate: 50000,
        totalAmount: 900000, // 9,000.00 INR
        status: "PENDING_APPROVAL",
        approvalQuery: "Initial lot for foundation columns",
        siteId: site.id,
        projectId: project.id,
        createdBy: supervisorUser.id,
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.purchaseOrder.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.materialRequestItem.deleteMany({ where: { request: { organizationId: testOrgId } } });
      await prisma.materialRequest.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.paymentAllocation.deleteMany({ where: { payment: { organizationId: testOrgId } } });
      await prisma.attachment.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.payment.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.material.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.party.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.project.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.site.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.auditEvent.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.user.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
  });

  const makeAuthRequest = (url: string, token: string, init?: RequestInit) => {
    return new NextRequest(new URL(url, "http://localhost:3000"), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        ...(init?.headers || {}),
      },
    });
  };

  it("should return full details for pending payment requests", async () => {
    const req = makeAuthRequest("http://localhost:3000/api/approvals", superAdminToken);
    const res = await getApprovals(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.isApprover).toBe(true);

    const paymentItem = json.data.items.find((it: any) => it.id === payment.id);
    expect(paymentItem).toBeDefined();
    expect(paymentItem.type).toBe("PAYMENT");
    expect(paymentItem.title).toContain("OM CEMENT");
    expect(paymentItem.amountRupees).toBe(6000);
    expect(paymentItem.status).toBe("PENDING_APPROVAL");
    expect(paymentItem.query).toBe("For advance given");

    // Verify rich full details:
    expect(paymentItem.details).toBeDefined();
    expect(paymentItem.details.referenceNumber).toBe(payment.referenceNumber);
    expect(paymentItem.details.recipientName).toBe("OM CEMENT");
    expect(paymentItem.details.partyType).toBe("VENDOR");
    expect(paymentItem.details.partyPhone).toBe("9876543210");
    expect(paymentItem.details.payingAccount).toBe("HDFC Bank Operating A/C (A/C: ...4421)");
    expect(paymentItem.details.method).toBe("BANK_TRANSFER");
    expect(paymentItem.details.costHead).toBe("MATERIALS");
    expect(paymentItem.details.projectName).toBe("Peva Nagar Commercial Complex");
    expect(paymentItem.details.siteName).toBe("Peva Nagar Site");
    expect(paymentItem.details.creatorName).toBe("Ranjan Sharma");
    expect(paymentItem.details.creatorRole).toBe("SITE_SUPERVISOR");
  });

  it("should return full details for material requests and their line items", async () => {
    const req = makeAuthRequest("http://localhost:3000/api/approvals", superAdminToken);
    const res = await getApprovals(req);
    const json = await res.json();

    const mrItem = json.data.items.find((it: any) => it.id === materialRequest.id);
    expect(mrItem).toBeDefined();
    expect(mrItem.type).toBe("MATERIAL_REQUEST");
    expect(mrItem.details).toBeDefined();
    expect(mrItem.details.requestNumber).toBe(materialRequest.requestNumber);
    expect(mrItem.details.priority).toBe("URGENT");
    expect(mrItem.details.items).toHaveLength(1);
    expect(mrItem.details.items[0].description).toBe("10MM MUNGIYA");
    expect(mrItem.details.items[0].quantity).toBe(600);
    expect(mrItem.details.items[0].unitCode).toBe("TON");
  });

  it("should return full details for purchase orders", async () => {
    const req = makeAuthRequest("http://localhost:3000/api/approvals", superAdminToken);
    const res = await getApprovals(req);
    const json = await res.json();

    const poItem = json.data.items.find((it: any) => it.id === purchaseOrder.id);
    expect(poItem).toBeDefined();
    expect(poItem.type).toBe("PURCHASE_ORDER");
    expect(poItem.details).toBeDefined();
    expect(poItem.details.orderNumber).toBe(purchaseOrder.orderNumber);
    expect(poItem.details.materialName).toBe("10MM MUNGIYA");
    expect(poItem.details.vendorName).toBe("OM CEMENT");
    expect(poItem.details.quantity).toBe(18);
    expect(poItem.details.unitCode).toBe("TON");
    expect(poItem.details.totalAmountRupees).toBe(9000);
  });

  it("should approve the pending payment and record approver details", async () => {
    const req = makeAuthRequest(
      "http://localhost:3000/api/approvals",
      superAdminToken,
      {
        method: "POST",
        body: JSON.stringify({
          entityType: "PAYMENT",
          entityId: payment.id,
          action: "APPROVE",
        }),
      }
    );

    const res = await postApproval(req);
    expect(res.status).toBe(200);

    const updatedPayment = await prisma.payment.findUnique({
      where: { id: payment.id },
    });
    expect(updatedPayment?.status).toBe("POSTED");
    expect(updatedPayment?.approvedBy).toContain("Master Super Admin");
    expect(updatedPayment?.approvedAt).toBeDefined();
  });
});
