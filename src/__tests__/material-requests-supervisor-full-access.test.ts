import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { GET as listRequestsHandler, POST as createRequestHandler } from "@/app/api/material-requests/route";
import { POST as reviewRequestHandler } from "@/app/api/material-requests/[id]/review/route";
import { POST as orderLineHandler } from "@/app/api/material-requests/[id]/order/route";
import { POST as cancelRequestHandler } from "@/app/api/material-requests/[id]/cancel/route";
import { POST as approveOrderHandler } from "@/app/api/orders/[id]/approve/route";
import { POST as rejectOrderHandler } from "@/app/api/orders/[id]/reject/route";

function makeJsonRequest(url: string, method: string, token: string, body?: any) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Cookie: `${SESSION_COOKIE_NAME}=${token}`,
  };
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Material Requests - Supervisor / Full Access Verification", () => {
  let org: any;
  let supervisorUser: any;
  let supervisorToken: string;
  let site: any;
  let project: any;
  let material: any;
  let vendor: any;

  beforeEach(async () => {
    org = await prisma.organization.create({
      data: {
        name: `MR Test Org ${Date.now()}`,
      },
    });

    supervisorUser = await prisma.user.create({
      data: {
        organizationId: org.id,
        name: "Ranjan Sharma",
        email: `ranjan-${Date.now()}@test.com`,
        passwordHash: "hash123",
        role: "SITE_SUPERVISOR",
        status: "ACTIVE",
      },
    });

    supervisorToken = await createSessionToken({
      userId: supervisorUser.id,
      email: supervisorUser.email,
      role: supervisorUser.role,
      organizationId: org.id,
      permissions: [
        "projects:read",
        "projects:write",
        "inventory:read",
        "inventory:write",
        "inventory:receipt",
        "inventory:issue",
      ],
    });

    site = await prisma.site.create({
      data: {
        organizationId: org.id,
        name: "Peva Nagar Site",
        code: `PN-${Date.now().toString().slice(-4)}`,
        address: "Peva Nagar, Jodhpur",
        status: "ACTIVE",
      },
    });

    project = await prisma.project.create({
      data: {
        organizationId: org.id,
        siteId: site.id,
        name: "Peva Nagar Project",
        code: `PRJ-${Date.now().toString().slice(-4)}`,
        managerUserId: supervisorUser.id,
        status: "ACTIVE",
      },
    });

    material = await prisma.material.create({
      data: {
        organizationId: org.id,
        name: "Chunai Khande",
        sku: `SKU-${Date.now().toString().slice(-6)}`,
        unitCode: "TON",
      },
    });

    vendor = await prisma.party.create({
      data: {
        organizationId: org.id,
        name: "Vishnu Ji Khande Wale",
        partyType: "VENDOR",
      },
    });
  });

  afterEach(async () => {
    if (org?.id) {
      await prisma.auditEvent.deleteMany({ where: { organizationId: org.id } });
      await prisma.purchaseOrder.deleteMany({ where: { organizationId: org.id } });
      await prisma.materialRequestItem.deleteMany({ where: { request: { organizationId: org.id } } });
      await prisma.materialRequest.deleteMany({ where: { organizationId: org.id } });
      await prisma.material.deleteMany({ where: { organizationId: org.id } });
      await prisma.party.deleteMany({ where: { organizationId: org.id } });
      await prisma.project.deleteMany({ where: { organizationId: org.id } });
      await prisma.site.deleteMany({ where: { organizationId: org.id } });
      await prisma.user.deleteMany({ where: { organizationId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
  });

  it("Supervisor has canManage=true when listing material requests", async () => {
    // Create a request
    const createReq = makeJsonRequest("/api/material-requests", "POST", supervisorToken, {
      projectId: project.id,
      items: [{ materialId: material.id, quantity: 18, unitCode: "TON" }],
      notes: "Need 18 TON Chunai Khande at site",
    });
    const createRes = await createRequestHandler(createReq);
    expect(createRes.status).toBe(201);

    // List requests
    const listReq = makeJsonRequest("/api/material-requests", "GET", supervisorToken);
    const listRes = await listRequestsHandler(listReq);
    const data = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.length).toBeGreaterThanOrEqual(1);

    const first = data.data[0];
    expect(first.canManage).toBe(true);
  });

  it("Supervisor can review and approve a material request", async () => {
    // Create a request
    const createReq = makeJsonRequest("/api/material-requests", "POST", supervisorToken, {
      projectId: project.id,
      items: [{ materialId: material.id, quantity: 18, unitCode: "TON" }],
    });
    const createRes = await createRequestHandler(createReq);
    const createdData = await createRes.json();
    const requestId = createdData.data.id;
    const itemId = createdData.data.items[0].id;

    // Review / Approve
    const reviewReq = makeJsonRequest(
      `/api/material-requests/${requestId}/review`,
      "POST",
      supervisorToken,
      {
        action: "APPROVE",
        items: [{ id: itemId, approvedQty: 18 }],
      }
    );
    const reviewRes = await reviewRequestHandler(reviewReq, { params: { id: requestId } });
    const reviewData = await reviewRes.json();
    expect(reviewRes.status).toBe(200);
    expect(reviewData.success).toBe(true);
    expect(reviewData.data.status).toBe("APPROVED");
    expect(reviewData.data.items[0].approvedQty).toBe(18);
  });

  it("Supervisor can place an order on an approved material request item", async () => {
    // Create & approve request
    const createReq = makeJsonRequest("/api/material-requests", "POST", supervisorToken, {
      projectId: project.id,
      items: [{ materialId: material.id, quantity: 18, unitCode: "TON" }],
    });
    const createRes = await createRequestHandler(createReq);
    const createdData = await createRes.json();
    const requestId = createdData.data.id;
    const itemId = createdData.data.items[0].id;

    const reviewReq = makeJsonRequest(
      `/api/material-requests/${requestId}/review`,
      "POST",
      supervisorToken,
      {
        action: "APPROVE",
        items: [{ id: itemId, approvedQty: 18 }],
      }
    );
    await reviewRequestHandler(reviewReq, { params: { id: requestId } });

    // Place order
    const orderReq = makeJsonRequest(
      `/api/material-requests/${requestId}/order`,
      "POST",
      supervisorToken,
      {
        itemId,
        vendorPartyId: vendor.id,
        unitRate: 1500,
      }
    );
    const orderRes = await orderLineHandler(orderReq, { params: { id: requestId } });
    const orderData = await orderRes.json();
    expect(orderRes.status).toBe(201);
    expect(orderData.success).toBe(true);
    expect(orderData.data.items[0].purchaseOrderId).toBeDefined();
  });

  it("Supervisor can approve and reject purchase orders", async () => {
    // Create an unapproved purchase order
    const po = await prisma.purchaseOrder.create({
      data: {
        organizationId: org.id,
        orderNumber: `PO-TEST-${Date.now()}`,
        materialId: material.id,
        vendorPartyId: vendor.id,
        siteId: site.id,
        projectId: project.id,
        quantity: 10,
        unitCode: "TON",
        status: "PENDING_APPROVAL",
        createdBy: supervisorUser.id,
      },
    });

    // Approve purchase order
    const approveReq = makeJsonRequest(`/api/orders/${po.id}/approve`, "POST", supervisorToken, {});
    const approveRes = await approveOrderHandler(approveReq, { params: { id: po.id } });
    const approveData = await approveRes.json();
    expect(approveRes.status).toBe(200);
    expect(approveData.success).toBe(true);
    expect(approveData.data.order.status).toBe("APPROVED");

    // Create another PO to test reject
    const po2 = await prisma.purchaseOrder.create({
      data: {
        organizationId: org.id,
        orderNumber: `PO-TEST2-${Date.now()}`,
        materialId: material.id,
        vendorPartyId: vendor.id,
        siteId: site.id,
        projectId: project.id,
        quantity: 5,
        unitCode: "TON",
        status: "PENDING_APPROVAL",
        createdBy: supervisorUser.id,
      },
    });

    const rejectReq = makeJsonRequest(`/api/orders/${po2.id}/reject`, "POST", supervisorToken, {
      reason: "Rate too high",
    });
    const rejectRes = await rejectOrderHandler(rejectReq, { params: { id: po2.id } });
    const rejectData = await rejectRes.json();
    expect(rejectRes.status).toBe(200);
    expect(rejectData.success).toBe(true);
    expect(rejectData.data.order.status).toBe("REJECTED");
  });

  it("Supervisor can cancel a pending material request", async () => {
    const createReq = makeJsonRequest("/api/material-requests", "POST", supervisorToken, {
      projectId: project.id,
      items: [{ materialId: material.id, quantity: 18, unitCode: "TON" }],
    });
    const createRes = await createRequestHandler(createReq);
    const createdData = await createRes.json();
    const requestId = createdData.data.id;

    const cancelReq = makeJsonRequest(`/api/material-requests/${requestId}/cancel`, "POST", supervisorToken, {});
    const cancelRes = await cancelRequestHandler(cancelReq, { params: { id: requestId } });
    const cancelData = await cancelRes.json();
    expect(cancelRes.status).toBe(200);
    expect(cancelData.success).toBe(true);
    expect(cancelData.data.status).toBe("CANCELLED");
  });
});
