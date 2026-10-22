import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { GET as getBudget, PUT as putBudget } from "@/app/api/projects/[id]/budget/route";
import { GET as getPortfolio } from "@/app/api/budgets/route";
import { POST as createBill } from "@/app/api/finance/bills/route";
import { GET as listMilestones, POST as addMilestone } from "@/app/api/projects/[id]/milestones/route";
import { POST as postProgress } from "@/app/api/milestones/[id]/progress/route";
import { GET as listRequests, POST as createRequest } from "@/app/api/material-requests/route";
import { POST as reviewRequest } from "@/app/api/material-requests/[id]/review/route";
import { POST as orderLine } from "@/app/api/material-requests/[id]/order/route";
import { POST as cancelRequest } from "@/app/api/material-requests/[id]/cancel/route";
import { CommandCenterService } from "@/services/command-center-service";
import { istDateKey } from "@/lib/ist-date";

const stamp = Date.now();
let orgId = "";
const ids: Record<string, string> = {};
const people = {
  admin: { name: "Owner Bothra", role: "ORG_ADMIN" },
  pm: { name: "Priya PM", role: "PROJECT_MANAGER" },
  accounts: { name: "Anil Accounts", role: "ACCOUNTANT" },
  supervisor: { name: "Ravi Supervisor", role: "SITE_SUPERVISOR" },
} as const;
type Who = keyof typeof people;

function as(who: Who) {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId: ids[who],
    organizationId: orgId,
    email: `${who}@test.local`,
    name: people[who].name,
    role: people[who].role as any,
    organizationName: "Controls Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

const req = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost:3000${path}`, { method, body: body ? JSON.stringify(body) : undefined });
const p = (id: string) => ({ params: { id } });
const L = 100_000_00; // ₹1 lakh in paise

describe("Budget vs actual, construction stages and material requests", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Controls Org ${stamp}` } });
    orgId = org.id;
    for (const who of Object.keys(people) as Who[]) {
      const u = await prisma.user.create({
        data: { organizationId: orgId, name: people[who].name, email: `${who}-${stamp}@test.local`, passwordHash: "x", role: people[who].role },
      });
      ids[who] = u.id;
    }
    const site = await prisma.site.create({ data: { organizationId: orgId, name: "Vaishali Site", code: `VS-${stamp}`, address: "Jaipur" } });
    ids.site = site.id;
    const day = 86_400_000;
    const project = await prisma.project.create({
      data: {
        organizationId: orgId,
        siteId: site.id,
        code: `TWR-${stamp}`,
        name: "Bothra Heights",
        managerUserId: ids.pm,
        budgetAmount: 50 * L,
        startDate: new Date(Date.now() - 100 * day),
        endDate: new Date(Date.now() + 265 * day),
      },
    });
    ids.project = project.id;
    const other = await prisma.project.create({ data: { organizationId: orgId, siteId: site.id, code: `OTH-${stamp}`, name: "Other Villa" } });
    ids.other = other.id;
    await prisma.projectAssignment.create({
      data: { organizationId: orgId, projectId: project.id, userId: ids.supervisor, assignedById: ids.admin },
    });
    await prisma.projectAssignment.create({
      data: { organizationId: orgId, projectId: project.id, userId: ids.accounts, assignedById: ids.admin },
    });

    const vendor = await prisma.party.create({ data: { organizationId: orgId, partyType: "VENDOR", name: "Shree Cement Traders" } });
    const contractor = await prisma.party.create({ data: { organizationId: orgId, partyType: "CONTRACTOR", name: "Ramesh RCC Works" } });
    ids.vendor = vendor.id;
    ids.contractor = contractor.id;
    const cement = await prisma.material.create({ data: { organizationId: orgId, sku: `CEM-${stamp}`, name: "OPC Cement 53", unitCode: "BAG" } });
    ids.cement = cement.id;
    const store = await prisma.store.create({ data: { organizationId: orgId, siteId: site.id, name: "Site store" } });
    await prisma.stockBalance.create({ data: { materialId: cement.id, storeId: store.id, quantityOnHand: 120 } });

    // Spend on the project: a cement bill, a contractor RA bill paid in full,
    // a direct wage payment, an approved purchase order and approved RA work not yet billed.
    await prisma.bill.create({
      data: {
        organizationId: orgId,
        partyId: vendor.id,
        projectId: project.id,
        billNumber: "SCT-1",
        billDate: new Date(),
        totalAmount: 4 * L,
        createdBy: ids.accounts,
        lines: { create: [{ description: "Cement 1000 bags", materialId: cement.id, quantity: 1000, unitRate: 400_00, lineTotal: 4 * L }] },
      },
    });
    const raBill = await prisma.bill.create({
      data: { organizationId: orgId, partyId: contractor.id, projectId: project.id, billNumber: "RA-1", billDate: new Date(), totalAmount: 10 * L, createdBy: ids.accounts },
    });
    await prisma.payment.create({
      data: {
        organizationId: orgId,
        partyId: contractor.id,
        projectId: project.id,
        paymentDate: new Date(),
        amount: 10 * L,
        method: "NEFT_RTGS",
        referenceNumber: "UTR1",
        status: "POSTED",
        idempotencyKey: `pay-ra-${stamp}`,
        createdBy: ids.accounts,
        allocations: { create: [{ billId: raBill.id, amount: 10 * L }] },
      },
    });
    await prisma.payment.create({
      data: {
        organizationId: orgId,
        projectId: project.id,
        recipientType: "EMPLOYEE",
        recipientName: "Labour gang (weekly)",
        paymentDate: new Date(),
        amount: 2 * L,
        method: "CASH",
        referenceNumber: "WAGE-W1",
        status: "POSTED",
        idempotencyKey: `pay-wage-${stamp}`,
        createdBy: ids.accounts,
      },
    });
    await prisma.purchaseOrder.create({
      data: {
        organizationId: orgId,
        orderNumber: `PO-T-${stamp}`,
        materialId: cement.id,
        vendorPartyId: vendor.id,
        projectId: project.id,
        quantity: 500,
        unitCode: "BAG",
        totalAmount: 2 * L,
        status: "APPROVED",
        createdBy: ids.pm,
      },
    });
    await prisma.measurementBookEntry.create({
      data: { organizationId: orgId, projectId: project.id, partyId: contractor.id, itemDescription: "Slab casting L5", unit: "CUM", status: "APPROVED", totalAmount: 3 * L, createdBy: ids.pm },
    });
  });

  afterAll(async () => {
    if (orgId) await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  beforeEach(() => vi.restoreAllMocks());

  // ── Budget ──────────────────────────────────────────────────────────────

  it("splits spend by cost head without counting a paid bill twice", async () => {
    as("accounts");
    const saved = await putBudget(
      req(`/api/projects/${ids.project}/budget`, "PUT", {
        lines: [
          { costHead: "MATERIAL", budgetAmount: 8 * L },
          { costHead: "CONTRACTOR", budgetAmount: 12 * L },
          { costHead: "LABOUR", budgetAmount: 5 * L },
        ],
      }),
      p(ids.project)
    );
    expect(saved.status).toBe(200);
    const { data } = await saved.json();
    const head = (k: string) => data.heads.find((h: any) => h.costHead === k);

    expect(head("MATERIAL")).toMatchObject({ budget: 8 * L, actual: 4 * L, committed: 2 * L, health: "OK" });
    // RA bill of 10L is counted once even though a 10L payment settled it; 3L of approved RA work is committed.
    expect(head("CONTRACTOR")).toMatchObject({ budget: 12 * L, actual: 10 * L, committed: 3 * L, health: "OVER", variance: -1 * L });
    expect(head("LABOUR")).toMatchObject({ actual: 2 * L, health: "OK" });

    expect(data.totals).toMatchObject({ budget: 50 * L, allocated: 25 * L, unallocated: 25 * L, actual: 16 * L, committed: 5 * L, paid: 12 * L });
    expect(data.topParties[0]).toEqual({ name: "Ramesh RCC Works", amount: 10 * L });
    expect(await prisma.auditEvent.count({ where: { entityId: ids.project, action: "PROJECT_BUDGET_UPDATED" } })).toBe(1);
  });

  it("a bill can be booked to a cost head explicitly", async () => {
    as("accounts");
    const res = await createBill(
      req("/api/finance/bills", "POST", {
        partyId: ids.vendor,
        projectId: ids.project,
        billNumber: "JCB-7",
        billDate: new Date().toISOString(),
        costHead: "EQUIPMENT",
        lines: [{ description: "JCB hire, 3 days", lineTotal: 45_000_00 }],
      })
    );
    expect(res.status).toBe(201);
    const { data } = await (await getBudget(req(`/api/projects/${ids.project}/budget`), p(ids.project))).json();
    const equipment = data.heads.find((h: any) => h.costHead === "EQUIPMENT");
    expect(equipment).toMatchObject({ actual: 45_000_00, budget: 0, health: "NO_BUDGET" });
  });

  it("site staff without finance access cannot see or change budgets", async () => {
    as("supervisor");
    expect((await getBudget(req(`/api/projects/${ids.project}/budget`), p(ids.project))).status).toBe(403);
    expect((await getPortfolio(req("/api/budgets"))).status).toBe(403);
    as("pm");
    // Project managers can read the budget but not set it.
    expect((await getBudget(req(`/api/projects/${ids.project}/budget`), p(ids.project))).status).toBe(200);
    const put = await putBudget(req(`/api/projects/${ids.project}/budget`, "PUT", { lines: [{ costHead: "OTHER", budgetAmount: 1 }] }), p(ids.project));
    expect(put.status).toBe(403);
  });

  // ── Stages ──────────────────────────────────────────────────────────────

  it("adds the standard building stages across the project dates, once", async () => {
    as("pm");
    const res = await addMilestone(req(`/api/projects/${ids.project}/milestones`, "POST", { template: "STANDARD" }), p(ids.project));
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.added).toBe(12);
    const first = data.milestones[0];
    const last = data.milestones[11];
    expect(first.name).toMatch(/excavation/i);
    expect(new Date(first.plannedStart).getTime()).toBeLessThan(new Date(last.plannedEnd).getTime());

    const again = await addMilestone(req(`/api/projects/${ids.project}/milestones`, "POST", { template: "STANDARD" }), p(ids.project));
    expect(again.status).toBe(409);
  });

  it("site staff record progress with photos; the plan shows what is late", async () => {
    as("supervisor");
    // The supervisor can update progress but not change the plan.
    expect((await addMilestone(req(`/api/projects/${ids.project}/milestones`, "POST", { name: "Extra stage" }), p(ids.project))).status).toBe(403);

    const list = (await (await listMilestones(req(`/api/projects/${ids.project}/milestones`), p(ids.project))).json()).data;
    const excavation = list.milestones[0];
    const foundation = list.milestones[1];
    // By day 100 of 365 the first two stages should be finished.
    expect(excavation.schedule).toBe("DELAYED");

    const done = await postProgress(
      req(`/api/milestones/${excavation.id}/progress`, "POST", { progressPercent: 100, note: "Excavation complete", photoUrls: ["/api/uploads/pit1", "http://x.test/a.png"] }),
      p(excavation.id)
    );
    expect(done.status).toBe(201);
    await postProgress(req(`/api/milestones/${foundation.id}/progress`, "POST", { progressPercent: 40, note: "Footings F1-F12 cast" }), p(foundation.id));

    const after = (await (await listMilestones(req(`/api/projects/${ids.project}/milestones`), p(ids.project))).json()).data;
    const ex = after.milestones[0];
    expect(ex.status).toBe("COMPLETED");
    expect(ex.actualEnd).toBeTruthy();
    expect(ex.schedule).toBe("DONE");
    expect(ex.updates[0].photoUrls).toEqual(["/api/uploads/pit1"]);
    expect(after.milestones[1].status).toBe("IN_PROGRESS");
    expect(after.milestones[1].schedule).toBe("DELAYED");
    // Weighted: excavation 4 × 100% + foundation 10 × 40% over a total weight of 100.
    expect(after.summary.overallProgress).toBe(8);
    expect(after.summary.plannedProgress).toBeGreaterThan(after.summary.overallProgress);

    const adminNote = await prisma.notification.findFirst({ where: { organizationId: orgId, userId: ids.admin, type: "MILESTONE_UPDATE" }, orderBy: { createdAt: "asc" } });
    expect(adminNote?.title).toContain("completed");
    expect(await prisma.notification.count({ where: { organizationId: orgId, userId: ids.pm, type: "MILESTONE_UPDATE" } })).toBe(2);
  });

  it("refuses a progress update that changes nothing", async () => {
    as("supervisor");
    const list = (await (await listMilestones(req(`/api/projects/${ids.project}/milestones`), p(ids.project))).json()).data;
    const m = list.milestones[1];
    const res = await postProgress(req(`/api/milestones/${m.id}/progress`, "POST", { progressPercent: m.progressPercent }), p(m.id));
    expect(res.status).toBe(422);
  });

  // ── Material requests ───────────────────────────────────────────────────

  let requestId = "";

  it("site raises a request; the office is told and sees stock already at site", async () => {
    as("supervisor");
    const outside = await createRequest(req("/api/material-requests", "POST", { projectId: ids.other, items: [{ materialId: ids.cement, quantity: 10 }] }));
    expect(outside.status).toBe(403);

    const res = await createRequest(
      req("/api/material-requests", "POST", {
        projectId: ids.project,
        priority: "URGENT",
        neededBy: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        notes: "Slab L6 on Friday",
        items: [
          { materialId: ids.cement, quantity: 300 },
          { description: "Binding wire 18 gauge", quantity: 50, unitCode: "kg" },
        ],
      })
    );
    expect(res.status).toBe(201);
    const { data } = await res.json();
    requestId = data.id;
    expect(data.requestNumber).toMatch(/^MR-\d{4}-001$/);
    expect(data.items.map((i: any) => i.unitCode).sort()).toEqual(["BAG", "kg"]);

    const notes = await prisma.notification.findMany({ where: { organizationId: orgId, type: "MATERIAL_REQUEST", entityId: requestId } });
    expect(notes.map((n) => n.userId).sort()).toEqual([ids.admin, ids.pm].sort());
    expect(notes[0].severity).toBe("WARNING");

    as("pm");
    const list = (await (await listRequests(req("/api/material-requests?status=PENDING"))).json()).data;
    const mine = list.find((r: any) => r.id === requestId);
    expect(mine.canManage).toBe(true);
    expect(mine.items.find((i: any) => i.materialId === ids.cement).stockAtSite).toBe(120);
  });

  it("only the office approves; the manager can cut quantities", async () => {
    as("supervisor");
    expect((await reviewRequest(req(`/api/material-requests/${requestId}/review`, "POST", { action: "APPROVE" }), p(requestId))).status).toBe(403);
    expect((await cancelRequest(req(`/api/material-requests/${requestId}/cancel`, "POST"), p(requestId))).status).toBe(200);

    // Raise it again and let the manager approve 180 bags (120 already at site).
    const again = await (await createRequest(req("/api/material-requests", "POST", { projectId: ids.project, items: [{ materialId: ids.cement, quantity: 300 }, { description: "Binding wire 18 gauge", quantity: 50, unitCode: "KG" }] }))).json();
    requestId = again.data.id;
    expect(again.data.requestNumber).toMatch(/-002$/);

    as("pm");
    const cementLine = again.data.items.find((i: any) => i.materialId === ids.cement);
    const res = await reviewRequest(
      req(`/api/material-requests/${requestId}/review`, "POST", { action: "APPROVE", items: [{ id: cementLine.id, approvedQty: 180 }] }),
      p(requestId)
    );
    const { data } = await res.json();
    expect(data.status).toBe("APPROVED");
    expect(data.items.find((i: any) => i.id === cementLine.id).approvedQty).toBe(180);

    expect((await cancelRequest(req(`/api/material-requests/${requestId}/cancel`, "POST"), p(requestId))).status).toBe(403);
  });

  it("each approved line becomes a purchase order on the project", async () => {
    as("pm");
    const request = await prisma.materialRequest.findUnique({ where: { id: requestId }, include: { items: true } });
    const cementLine = request!.items.find((i) => i.materialId === ids.cement)!;
    const wireLine = request!.items.find((i) => !i.materialId)!;

    const first = await orderLine(req(`/api/material-requests/${requestId}/order`, "POST", { itemId: cementLine.id, vendorPartyId: ids.vendor, unitRate: 410 }), p(requestId));
    expect(first.status).toBe(201);
    const afterFirst = (await first.json()).data;
    expect(afterFirst.status).toBe("PARTLY_ORDERED");
    const po = await prisma.purchaseOrder.findUnique({ where: { id: afterFirst.items.find((i: any) => i.id === cementLine.id).purchaseOrderId } });
    expect(po).toMatchObject({ projectId: ids.project, siteId: ids.site, quantity: 180, unitRate: 410_00, totalAmount: 180 * 410_00, status: "PENDING_APPROVAL" });

    // Free-text lines must be matched to a catalogue material first.
    const unmatched = await orderLine(req(`/api/material-requests/${requestId}/order`, "POST", { itemId: wireLine.id, vendorPartyId: ids.vendor }), p(requestId));
    expect(unmatched.status).toBe(422);
    const twice = await orderLine(req(`/api/material-requests/${requestId}/order`, "POST", { itemId: cementLine.id, vendorPartyId: ids.vendor }), p(requestId));
    expect(twice.status).toBe(409);

    const wire = await prisma.material.create({ data: { organizationId: orgId, sku: `WIRE-${stamp}`, name: "Binding wire", unitCode: "KG" } });
    const second = await orderLine(
      req(`/api/material-requests/${requestId}/order`, "POST", { itemId: wireLine.id, vendorPartyId: ids.vendor, materialId: wire.id, unitRate: 85 }),
      p(requestId)
    );
    expect((await second.json()).data.status).toBe("ORDERED");

    const supNote = await prisma.notification.findFirst({ where: { organizationId: orgId, userId: ids.supervisor, type: "MATERIAL_REQUEST", title: { contains: "ordered" } } });
    expect(supNote).toBeTruthy();

    // Orders still waiting for approval are not counted as committed spend yet.
    const { data } = await (await getBudget(req(`/api/projects/${ids.project}/budget`), p(ids.project))).json();
    expect(data.heads.find((h: any) => h.costHead === "MATERIAL").committed).toBe(2 * L);
  });

  it("the dashboard lists project health with progress and waiting requests", async () => {
    as("supervisor");
    await createRequest(req("/api/material-requests", "POST", { projectId: ids.project, items: [{ materialId: ids.cement, quantity: 5 }] }));
    const overview = await CommandCenterService.getOverview(orgId, istDateKey());
    const heights = overview.projects.find((x) => x.projectId === ids.project)!;
    expect(heights.progress).toBe(8);
    expect(heights.delayedStages).toBeGreaterThanOrEqual(1);
    expect(heights.usedPercent).toBeCloseTo(((16 * L + 45_000_00) / (50 * L)) * 100, 0);
    expect(overview.projects[0].projectId).toBe(ids.project);
    expect(overview.approvals.materialRequestsPending).toBe(1);
  });
});
