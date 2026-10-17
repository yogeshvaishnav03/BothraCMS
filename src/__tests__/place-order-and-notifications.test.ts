import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../lib/db";
import { hashPassword, createSessionToken, SESSION_COOKIE_NAME } from "../lib/auth";
import { GET as getOrdersHandler, POST as placeOrderHandler } from "../app/api/orders/route";
import { PATCH as updateOrderHandler } from "../app/api/orders/[id]/route";
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

describe("Place Order & Vendor Notification Tests", () => {
  let testOrgId: string;
  let testUserId: string;
  let testUserToken: string;
  let testVendorId: string;
  let testMaterialId: string;
  let testStoreId: string;
  let createdOrderId: string;

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
    const user = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Yogesh Vaishnav",
        email: `yogesh-${Date.now()}@bothracms.com`,
        passwordHash: pwdHash,
        role: "SITE_SUPERVISOR",
        status: "ACTIVE",
      },
    });
    testUserId = user.id;

    testUserToken = await createSessionToken({
      userId: user.id,
      organizationId: testOrgId,
      email: user.email,
      name: user.name,
      role: "SITE_SUPERVISOR",
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
      testUserToken
    );
    const res = await placeOrderHandler(req);
    expect(res.status).toBe(400);
  });

  it("should successfully place a purchase order and generate vendor WhatsApp notification", async () => {
    const payload = {
      materialId: testMaterialId,
      vendorPartyId: testVendorId,
      quantity: 4425,
      unitCode: "PIECE",
      unitRate: 85, // ₹85 per piece
      storeId: testStoreId,
      expectedDeliveryDate: "2026-10-25",
      notes: "Urgent delivery needed for Ground Floor brick masonry work.",
      notificationMethod: "WHATSAPP_AND_EMAIL",
    };

    const req = makeJsonRequest("http://localhost:3000/api/orders", "POST", payload, testUserToken);
    const res = await placeOrderHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.order).toBeDefined();
    expect(json.data.order.orderNumber).toMatch(/^PO-\d{8}-\d{4}$/);
    expect(json.data.order.quantity).toBe(4425);
    expect(json.data.order.unitRate).toBe(8500); // 8500 paise = ₹85.00
    expect(json.data.order.totalAmount).toBe(4425 * 8500); // 37,612,500 paise = ₹3,76,125.00
    expect(json.data.order.status).toBe("PLACED");

    createdOrderId = json.data.order.id;

    // Check vendor notification details
    expect(json.data.notification).toBeDefined();
    expect(json.data.notification.vendorName).toBe("Om Cement & Bricks Supply");
    expect(json.data.notification.whatsappUrl).toContain("api.whatsapp.com/send?phone=919829012345");
    expect(json.data.notification.message).toContain("PURCHASE ORDER");
    expect(json.data.notification.message).toContain("Red Clay Bricks");
    expect(json.data.notification.message).toContain("4425 PIECE");
    expect(json.data.notification.message).toContain("₹85.00");
  });

  it("should return the created order on GET /api/orders?materialId=...", async () => {
    const req = makeJsonRequest(
      `http://localhost:3000/api/orders?materialId=${testMaterialId}`,
      "GET",
      undefined,
      testUserToken
    );
    const res = await getOrdersHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(1);

    const matched = json.data.find((o: any) => o.id === createdOrderId);
    expect(matched).toBeDefined();
    expect(matched.vendor.name).toBe("Om Cement & Bricks Supply");
    expect(matched.whatsappUrl).toBeDefined();
  });

  it("should include active placed orders in operational alerts (/api/notifications)", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/notifications", "GET", undefined, testUserToken);
    const res = await notificationsHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.alerts.some((a: any) => a.type === "PURCHASE_ORDER")).toBe(true);
  });

  it("should update order status via PATCH /api/orders/[id]", async () => {
    const req = makeJsonRequest(
      `http://localhost:3000/api/orders/${createdOrderId}`,
      "PATCH",
      { status: "CONFIRMED" },
      testUserToken
    );
    const res = await updateOrderHandler(req, { params: { id: createdOrderId } });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("CONFIRMED");
  });
});
