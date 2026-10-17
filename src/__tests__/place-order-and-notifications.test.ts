import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../lib/db";
import { hashPassword, createSessionToken, SESSION_COOKIE_NAME } from "../lib/auth";
import { GET as getOrdersHandler, POST as placeOrderHandler } from "../app/api/orders/route";
import { PATCH as updateOrderHandler } from "../app/api/orders/[id]/route";
import { POST as approveOrderHandler } from "../app/api/orders/[id]/approve/route";
import { POST as rejectOrderHandler } from "../app/api/orders/[id]/reject/route";
import { GET as notificationsHandler } from "../app/api/notifications/route";

function makeJsonRequest(url: string, method: string, body?: any, token?: string) {
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

describe("Place Order & Super Admin Approval Workflow Tests", () => {
  let testOrgId: string;
  let testSupervisorToken: string;
  let testSuperAdminToken: string;
  let testVendorId: string;
  let testMaterialId: string;
  let testStoreId: string;
  let createdOrderId: string;
  let rejectTestOrderId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: "Bothra Test Infra",
        currency: "INR",
        timezone: "Asia/Kolkata",
        status: "ACTIVE",
      },
    });
    testOrgId = org.id;

    const pwdHash = await hashPassword("TestPass123!");

    // Create Site Supervisor (requester)
    const supervisor = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Yogesh Vaishnav (Site Supervisor)",
        email: `supervisor-${Date.now()}@bothracms.com`,
        passwordHash: pwdHash,
        role: "SITE_SUPERVISOR",
        status: "ACTIVE",
      },
    });

    testSupervisorToken = await createSessionToken({
      userId: supervisor.id,
      organizationId: testOrgId,
      email: supervisor.email,
      name: supervisor.name,
      role: "SITE_SUPERVISOR",
    });

    // Create Super Admin (approver)
    const superAdmin = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Chief Super Admin",
        email: `superadmin-${Date.now()}@bothracms.com`,
        passwordHash: pwdHash,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
      },
    });

    testSuperAdminToken = await createSessionToken({
      userId: superAdmin.id,
      organizationId: testOrgId,
      email: superAdmin.email,
      name: superAdmin.name,
      role: "SUPER_ADMIN",
    });

    const site = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        name: "Chaupasni Row Houses",
        code: `CRH-${Date.now()}`,
        address: "Sector 14, Jodhpur",
      },
    });

    const store = await prisma.store.create({
      data: {
        organizationId: testOrgId,
        siteId: site.id,
        name: "Main Yard",
      },
    });
    testStoreId = store.id;

    const vendor = await prisma.party.create({
      data: {
        organizationId: testOrgId,
        partyType: "VENDOR",
        name: "Om Cement & Bricks Supply",
        phone: "+91 98290 12345",
        email: "sales@omcement.example.com",
        taxIdentifier: "08AAAAA0000A1Z5",
        address: "Industrial Area Phase 2, Jodhpur",
      },
    });
    testVendorId = vendor.id;

    const material = await prisma.material.create({
      data: {
        organizationId: testOrgId,
        sku: `BRK-${Date.now().toString().slice(-4)}`,
        name: "Red Clay Bricks",
        unitCode: "PIECE",
        minStockQty: 5000,
        reorderQty: 2500,
      },
    });
    testMaterialId = material.id;
  });

  afterAll(async () => {
    await (prisma as any).purchaseOrder?.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await prisma.auditEvent.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await prisma.stockBalance.deleteMany({ where: { store: { organizationId: testOrgId } } }).catch(() => {});
    await prisma.material.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await prisma.store.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await prisma.party.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await prisma.site.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: testOrgId } }).catch(() => {});
  });

  it("should reject unauthenticated requests to /api/orders", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/orders", "GET");
    const res = await getOrdersHandler(req);
    expect(res.status).toBe(401);
  });

  it("should validate required order fields", async () => {
    const req = makeJsonRequest(
      "http://localhost:3000/api/orders",
      "POST",
      { quantity: 0 },
      testSupervisorToken
    );
    const res = await placeOrderHandler(req);
    expect(res.status).toBe(400);
  });

  it("should raise an order query to Super Admin with status PENDING_APPROVAL by default", async () => {
    const payload = {
      materialId: testMaterialId,
      vendorPartyId: testVendorId,
      quantity: 4425,
      unitCode: "PIECE",
      unitRate: 85, // ₹85 per piece
      storeId: testStoreId,
      expectedDeliveryDate: "2026-10-25",
      notes: "Urgent delivery needed for Ground Floor brick masonry work.",
      approvalQuery: "Critical brick shortage at Chaupasni site. Urgent Super Admin approval requested.",
      notificationMethod: "WHATSAPP_AND_EMAIL",
    };

    const req = makeJsonRequest("http://localhost:3000/api/orders", "POST", payload, testSupervisorToken);
    const res = await placeOrderHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.order).toBeDefined();
    expect(json.data.order.orderNumber).toMatch(/^PO-\d{8}-\d{4}$/);
    expect(json.data.order.quantity).toBe(4425);
    expect(json.data.order.unitRate).toBe(8500); // 8500 paise = ₹85.00
    expect(json.data.order.totalAmount).toBe(4425 * 8500); // 37,612,500 paise = ₹3,76,125.00
    expect(json.data.order.status).toBe("PENDING_APPROVAL");
    expect(json.data.isPendingApproval).toBe(true);
    expect(json.data.order.approvalQuery).toContain("Critical brick shortage");
    expect(json.data.order.approvedBy).toBeNull();
    expect(json.data.notification.sent).toBe(false);

    createdOrderId = json.data.order.id;

    // Verify Audit Event logged for query raised
    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: testOrgId,
        entityId: createdOrderId,
        action: "PURCHASE_ORDER_QUERY_RAISED",
      },
    });
    expect(auditEvent).toBeDefined();
  });

  it("should surface an ORDER_APPROVAL_REQUEST alert to Super Admin in /api/notifications", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/notifications", "GET", undefined, testSuperAdminToken);
    const res = await notificationsHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    const approvalAlert = json.data.alerts.find(
      (a: any) => a.type === "ORDER_APPROVAL_REQUEST" && a.id.includes(createdOrderId)
    );
    expect(approvalAlert).toBeDefined();
    expect(approvalAlert.title).toContain("Super Admin Approval");
    expect(approvalAlert.message).toContain("Red Clay Bricks");
  });

  it("should prevent non-admin from approving the order (403 Forbidden)", async () => {
    const req = makeJsonRequest(
      `http://localhost:3000/api/orders/${createdOrderId}/approve`,
      "POST",
      { notes: "Hacker trying to approve" },
      testSupervisorToken
    );
    const res = await approveOrderHandler(req, { params: { id: createdOrderId } });
    expect(res.status).toBe(403);
  });

  it("should allow Super Admin to approve order and activate vendor notification", async () => {
    const req = makeJsonRequest(
      `http://localhost:3000/api/orders/${createdOrderId}/approve`,
      "POST",
      { notes: "Budget approved for ground floor masonry" },
      testSuperAdminToken
    );
    const res = await approveOrderHandler(req, { params: { id: createdOrderId } });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.order.status).toBe("APPROVED");
    expect(json.data.order.approvedBy).toContain("Chief Super Admin");
    expect(json.data.order.approvedAt).toBeDefined();

    // Vendor notification links should now be active
    expect(json.data.notification).toBeDefined();
    expect(json.data.notification.sent).toBe(true);
    expect(json.data.notification.vendorName).toBe("Om Cement & Bricks Supply");
    expect(json.data.notification.whatsappUrl).toContain("api.whatsapp.com/send?phone=919829012345");
    expect(json.data.notification.message).toContain("approved");

    // Verify Audit Event logged for order approved
    const approvalAuditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: testOrgId,
        entityId: createdOrderId,
        action: "PURCHASE_ORDER_APPROVED",
      },
    });
    expect(approvalAuditEvent).toBeDefined();
  });

  it("should allow Super Admin to reject an order query with a reason", async () => {
    // First create a second order to reject
    const placeReq = makeJsonRequest(
      "http://localhost:3000/api/orders",
      "POST",
      {
        materialId: testMaterialId,
        vendorPartyId: testVendorId,
        quantity: 1000,
        unitCode: "PIECE",
        unitRate: 100,
        notes: "Excess order",
      },
      testSupervisorToken
    );
    const placeRes = await placeOrderHandler(placeReq);
    const placeJson = await placeRes.json();
    rejectTestOrderId = placeJson.data.order.id;

    // Super admin rejects
    const rejectReq = makeJsonRequest(
      `http://localhost:3000/api/orders/${rejectTestOrderId}/reject`,
      "POST",
      { reason: "Rate too high, negotiate with vendor before ordering." },
      testSuperAdminToken
    );
    const rejectRes = await rejectOrderHandler(rejectReq, { params: { id: rejectTestOrderId } });
    expect(rejectRes.status).toBe(200);

    const rejectJson = await rejectRes.json();
    expect(rejectJson.success).toBe(true);
    expect(rejectJson.data.order.status).toBe("REJECTED");
    expect(rejectJson.data.order.rejectionReason).toContain("Rate too high");

    // Verify Audit Event for rejection
    const rejectAuditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: testOrgId,
        entityId: rejectTestOrderId,
        action: "PURCHASE_ORDER_REJECTED",
      },
    });
    expect(rejectAuditEvent).toBeDefined();
  });
});
