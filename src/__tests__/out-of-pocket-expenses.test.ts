import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET as getExpenses, POST as createExpense } from "@/app/api/expenses/route";
import { POST as approveExpense } from "@/app/api/expenses/[id]/approve/route";
import { POST as rejectExpense } from "@/app/api/expenses/[id]/reject/route";
import { prisma } from "@/lib/db";
import { createSessionToken } from "@/lib/auth";

describe("Supervisor Out-of-Pocket Expenses", () => {
  const testOrgId = "org-test-oop-" + Date.now();
  let supervisorUser: any;
  let adminUser: any;
  let accountantUser: any;
  let supervisorToken: string;
  let adminToken: string;
  let accountantToken: string;
  let testSite: any;
  let testProject: any;
  let receiptFileId: string;

  beforeAll(async () => {
    // Create organization
    await prisma.organization.create({
      data: {
        id: testOrgId,
        name: "Test Bothra Infra",
      },
    });

    // Create Site & Project
    testSite = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        name: "Chaupasni Sector 14",
        code: "CHP-14",
        status: "ACTIVE",
        address: "Chaupasni Road, Jodhpur",
      },
    });

    testProject = await prisma.project.create({
      data: {
        organizationId: testOrgId,
        siteId: testSite.id,
        name: "Tower Alpha Structural Work",
        code: "PRJ-TWR-A",
        status: "ACTIVE",
      },
    });

    // Create users: Supervisor, Admin, Accountant
    supervisorUser = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Ramesh Supervisor",
        email: `ramesh.${Date.now()}@bothra.test`,
        passwordHash: "hash123",
        role: "SITE_SUPERVISOR",
        status: "ACTIVE",
      },
    });

    adminUser = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Aditya Admin",
        email: `aditya.${Date.now()}@bothra.test`,
        passwordHash: "hash123",
        role: "ORG_ADMIN",
        status: "ACTIVE",
      },
    });

    accountantUser = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Pooja Finance",
        email: `pooja.${Date.now()}@bothra.test`,
        passwordHash: "hash123",
        role: "ACCOUNTANT",
        status: "ACTIVE",
      },
    });

    supervisorToken = await createSessionToken({
      userId: supervisorUser.id,
      name: supervisorUser.name,
      email: supervisorUser.email,
      role: supervisorUser.role,
      organizationId: testOrgId,
    });

    adminToken = await createSessionToken({
      userId: adminUser.id,
      name: adminUser.name,
      email: adminUser.email,
      role: adminUser.role,
      organizationId: testOrgId,
    });

    accountantToken = await createSessionToken({
      userId: accountantUser.id,
      name: accountantUser.name,
      email: accountantUser.email,
      role: accountantUser.role,
      organizationId: testOrgId,
    });

    receiptFileId = `rec-photo-${Date.now()}`;
  });

  const makeJsonRequest = (url: string, method: string, token: string, body?: any) => {
    return new NextRequest(new URL(url, "http://localhost:3000"), {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        cookie: `buildtrack_session=${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  it("STRICT MANDATORY CHECK: rejects expense submission without receipt photo", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/expenses", "POST", supervisorToken, {
      title: "Bought emergency diesel for generator",
      amount: 1500,
      expenseDate: "2026-11-06",
      category: "EQUIPMENT",
      paidTo: "BPCL Petrol Pump",
      paymentMode: "PERSONAL_UPI",
      siteId: testSite.id,
      // No receiptFileId provided!
    });

    const res = await createExpense(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("RECEIPT_MANDATORY");
    expect(json.error.message).toContain("mandatory");
  });

  it("allows SITE_SUPERVISOR to log an out-of-pocket expense with mandatory receipt photo", async () => {
    const req = makeJsonRequest("http://localhost:3000/api/expenses", "POST", supervisorToken, {
      title: "Purchased binding wire & nails from local hardware",
      amount: 1450,
      expenseDate: "2026-11-06",
      category: "MATERIALS",
      paidTo: "Om Sai Hardware & Electricals",
      paymentMode: "PERSONAL_UPI",
      siteId: testSite.id,
      notes: "Casting crew needed binding wire urgently; paid via personal GPay",
      receiptFileId,
      receiptFileName: "hardware-bill.jpg",
      receiptFileSize: 204800,
      receiptMimeType: "image/jpeg",
    });

    const res = await createExpense(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.amount).toBe(1450);
    expect(json.data.amountPaise).toBe(145000);
    expect(json.data.status).toBe("PENDING_APPROVAL");
    expect(json.data.receiptUrl).toBe(`/api/uploads/${receiptFileId}`);

    // Verify database record
    const payment = await prisma.payment.findUnique({
      where: { id: json.data.id },
      include: { attachments: true },
    });
    expect(payment).toBeDefined();
    expect(payment?.recipientType).toBe("OUT_OF_POCKET");
    expect(payment?.recipientName).toBe("Om Sai Hardware & Electricals");
    expect(payment?.payingAccount).toBe("Supervisor Out-of-Pocket");
    expect(payment?.attachments.length).toBeGreaterThan(0);
    expect(payment?.attachments[0].fileId).toBe(receiptFileId);
  });

  it("allows Supervisor, Admin, Super Admin, and Finance to view the expense entries", async () => {
    // Create an expense
    const createReq = makeJsonRequest("http://localhost:3000/api/expenses", "POST", supervisorToken, {
      title: "Tea and snacks for night casting labour",
      amount: 650,
      expenseDate: "2026-11-06",
      category: "LABOUR",
      paidTo: "Chai Point",
      paymentMode: "PERSONAL_CASH",
      siteId: testSite.id,
      receiptFileId: `chai-bill-${Date.now()}`,
    });
    const createRes = await createExpense(createReq);
    const created = await createRes.json();
    expect(createRes.status).toBe(201);

    // 1. Supervisor views expenses
    const supReq = makeJsonRequest("http://localhost:3000/api/expenses", "GET", supervisorToken);
    const supRes = await getExpenses(supReq);
    expect(supRes.status).toBe(200);
    const supJson = await supRes.json();
    expect(supJson.data.some((e: any) => e.id === created.data.id)).toBe(true);

    // 2. Admin views expenses
    const adminReq = makeJsonRequest("http://localhost:3000/api/expenses", "GET", adminToken);
    const adminRes = await getExpenses(adminReq);
    expect(adminRes.status).toBe(200);
    const adminJson = await adminRes.json();
    expect(adminJson.data.some((e: any) => e.id === created.data.id)).toBe(true);

    // 3. Finance (Accountant) views expenses
    const finReq = makeJsonRequest("http://localhost:3000/api/expenses", "GET", accountantToken);
    const finRes = await getExpenses(finReq);
    expect(finRes.status).toBe(200);
    const finJson = await finRes.json();
    expect(finJson.data.some((e: any) => e.id === created.data.id)).toBe(true);
  });

  it("allows Admin or Finance to approve the out-of-pocket expense claim for reimbursement", async () => {
    const createReq = makeJsonRequest("http://localhost:3000/api/expenses", "POST", supervisorToken, {
      title: "Tempo freight delivery of sand bags",
      amount: 1200,
      expenseDate: "2026-11-06",
      category: "TRANSPORT",
      paidTo: "Raju Tempo Service",
      paymentMode: "PERSONAL_CASH",
      siteId: testSite.id,
      receiptFileId: `tempo-memo-${Date.now()}`,
    });
    const createRes = await createExpense(createReq);
    const created = await createRes.json();

    // Finance approves
    const approveReq = makeJsonRequest(
      `http://localhost:3000/api/expenses/${created.data.id}/approve`,
      "POST",
      accountantToken
    );
    const approveRes = await approveExpense(approveReq, { params: { id: created.data.id } });
    expect(approveRes.status).toBe(200);
    const appJson = await approveRes.json();
    expect(appJson.data.status).toBe("POSTED");
    expect(appJson.data.approvedBy).toContain("Pooja Finance");

    // Check DB status
    const payment = await prisma.payment.findUnique({ where: { id: created.data.id } });
    expect(payment?.status).toBe("POSTED");
    expect(payment?.approvedBy).toContain("Pooja Finance");
  });

  it("allows Admin or Finance to decline the out-of-pocket claim with a reason", async () => {
    const createReq = makeJsonRequest("http://localhost:3000/api/expenses", "POST", supervisorToken, {
      title: "Miscellaneous hardware",
      amount: 3500,
      expenseDate: "2026-11-06",
      category: "MATERIALS",
      paidTo: "Local Store",
      paymentMode: "PERSONAL_CARD",
      siteId: testSite.id,
      receiptFileId: `card-slip-${Date.now()}`,
    });
    const createRes = await createExpense(createReq);
    const created = await createRes.json();

    // Admin declines
    const rejectReq = makeJsonRequest(
      `http://localhost:3000/api/expenses/${created.data.id}/reject`,
      "POST",
      adminToken,
      { rejectionReason: "Receipt is blurred and amount does not match bill" }
    );
    const rejectRes = await rejectExpense(rejectReq, { params: { id: created.data.id } });
    expect(rejectRes.status).toBe(200);
    const rejJson = await rejectRes.json();
    expect(rejJson.data.status).toBe("REJECTED");
    expect(rejJson.data.rejectionReason).toBe("Receipt is blurred and amount does not match bill");

    // Check DB status
    const payment = await prisma.payment.findUnique({ where: { id: created.data.id } });
    expect(payment?.status).toBe("REJECTED");
    expect(payment?.rejectionReason).toBe("Receipt is blurred and amount does not match bill");
  });
});
