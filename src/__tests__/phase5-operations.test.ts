import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { GET as getPayroll, POST as runPayroll } from "@/app/api/payroll/route";
import { POST as approvePayroll } from "@/app/api/payroll/[month]/approve/route";
import { POST as payPayroll } from "@/app/api/payroll/[month]/pay/route";
import { PATCH as editLine } from "@/app/api/payroll/lines/[id]/route";
import { GET as payslip } from "@/app/api/payroll/lines/[id]/payslip/route";
import { PUT as setSalary } from "@/app/api/payroll/salaries/[userId]/route";
import { POST as giveAdvance } from "@/app/api/payroll/advances/route";
import { GET as listDrawings, POST as addDrawing } from "@/app/api/drawings/route";
import { POST as addRevision } from "@/app/api/drawings/[id]/revisions/route";
import { POST as reviewRevision } from "@/app/api/drawing-revisions/[id]/review/route";
import { POST as runChecklist } from "@/app/api/quality/inspections/route";
import { GET as listIssues, POST as reportIssue } from "@/app/api/quality/issues/route";
import { POST as resolveIssue } from "@/app/api/quality/issues/[id]/resolve/route";
import { POST as verifyIssue } from "@/app/api/quality/issues/[id]/verify/route";
import { GET as listEquipment, POST as addEquipment } from "@/app/api/equipment/route";
import { POST as logEquipment } from "@/app/api/equipment/[id]/logs/route";
import { GET as listUnits, POST as addUnits } from "@/app/api/sales/units/route";
import { GET as listLeads, POST as addLead } from "@/app/api/sales/leads/route";
import { POST as leadActivity } from "@/app/api/sales/leads/[id]/activity/route";
import { GET as listBookings, POST as book } from "@/app/api/sales/bookings/route";
import { POST as raiseDemand } from "@/app/api/sales/installments/[id]/demand/route";
import { POST as receive } from "@/app/api/sales/installments/[id]/receive/route";
import { CommandCenterService } from "@/services/command-center-service";
import { istDateKey, monthDays } from "@/lib/ist-date";

const stamp = Date.now();
let orgId = "";
const ids: Record<string, string> = {};
const people = {
  admin: { name: "Owner Bothra", role: "ORG_ADMIN" },
  pm: { name: "Priya PM", role: "PROJECT_MANAGER" },
  accounts: { name: "Anil Accounts", role: "ACCOUNTANT" },
  hr: { name: "Hema HR", role: "HR_VIEWER" },
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
    organizationName: "Ops Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

const req = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost:3000${path}`, { method, body: body ? JSON.stringify(body) : undefined });
const p = (id: string) => ({ params: { id } });
const MONTH = "2026-09";
const R = 100; // ₹1 in paise

describe("Phase 5: payroll, drawings, quality & safety, equipment and sales", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Ops Org ${stamp}` } });
    orgId = org.id;
    for (const who of Object.keys(people) as Who[]) {
      const u = await prisma.user.create({
        data: { organizationId: orgId, name: people[who].name, email: `${who}-${stamp}@test.local`, passwordHash: "x", role: people[who].role, phone: "9829012345" },
      });
      ids[who] = u.id;
    }
    const site = await prisma.site.create({ data: { organizationId: orgId, name: "Mansarovar Site", code: `MS-${stamp}`, address: "Jaipur" } });
    ids.site = site.id;
    const project = await prisma.project.create({ data: { organizationId: orgId, siteId: site.id, code: `HT-${stamp}`, name: "Bothra Heights", managerUserId: ids.pm } });
    ids.project = project.id;
    const other = await prisma.project.create({ data: { organizationId: orgId, siteId: site.id, code: `OT-${stamp}`, name: "Other Villa" } });
    ids.other = other.id;
    await prisma.projectAssignment.create({ data: { organizationId: orgId, projectId: project.id, userId: ids.supervisor, assignedById: ids.admin } });

    // Mason: 3 full days (one of 10 hours) and one half day in September.
    const mason = await prisma.workforceMember.create({ data: { organizationId: orgId, employeeCode: `M-${stamp}`, name: "Ramesh Mason", workerType: "MASON", dailyWageRate: 800 * R } });
    ids.mason = mason.id;
    const at = (d: string, h: number) => new Date(`${MONTH}-${d}T${String(h).padStart(2, "0")}:00:00+05:30`);
    const sessions = [
      { d: "02", out: 17, status: "PRESENT" },
      { d: "03", out: 19, status: "PRESENT" }, // 10 hours → 2 hours overtime
      { d: "04", out: 17, status: "PRESENT" },
      { d: "05", out: 13, status: "HALF_DAY" },
    ];
    for (const s of sessions) {
      await prisma.attendanceSession.create({
        data: { organizationId: orgId, workforceMemberId: mason.id, siteId: site.id, projectId: project.id, workDate: `${MONTH}-${s.d}`, checkInAt: at(s.d, 9), checkOutAt: at(s.d, s.out), status: s.status, createdBy: ids.supervisor },
      });
    }
    // Supervisor checked in every working day except the 7th (leave) and the 8th (absent).
    for (const d of monthDays(MONTH)) {
      const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (weekday === 0 || d.endsWith("-08")) continue;
      await prisma.staffAttendance.create({
        data: { organizationId: orgId, userId: ids.supervisor, workDate: d, checkInAt: new Date(`${d}T09:00:00+05:30`), status: d.endsWith("-07") ? "LEAVE" : "PRESENT" },
      });
    }
    const vendor = await prisma.party.create({ data: { organizationId: orgId, partyType: "VENDOR", name: "Shree Earthmovers", phone: "9414000000" } });
    ids.vendor = vendor.id;
  });

  afterAll(async () => {
    if (orgId) await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  beforeEach(() => vi.restoreAllMocks());

  // ── Payroll ─────────────────────────────────────────────────────────────

  it("works out wages from site attendance and salary pro-rata, and takes back advances", async () => {
    as("accounts");
    expect((await setSalary(req(`/api/payroll/salaries/${ids.supervisor}`, "PUT", { monthlySalary: 30_000 * R }), { params: { userId: ids.supervisor } })).status).toBe(200);
    expect((await giveAdvance(req("/api/payroll/advances", "POST", { personType: "LABOUR", personId: ids.mason, amount: 1_000 * R, givenOn: `${MONTH}-10` }))).status).toBe(201);

    as("supervisor");
    expect((await getPayroll(req(`/api/payroll?month=${MONTH}`))).status).toBe(403);
    as("hr");
    expect((await getPayroll(req(`/api/payroll?month=${MONTH}`))).status).toBe(200);
    expect((await runPayroll(req("/api/payroll", "POST", { month: MONTH }))).status).toBe(403);

    as("accounts");
    const res = await runPayroll(req("/api/payroll", "POST", { month: MONTH }));
    expect(res.status).toBe(201);
    const { run } = (await res.json()).data;
    const mason = run.lines.find((l: any) => l.personId === ids.mason);
    expect(mason).toMatchObject({ payableDays: 3.5, halfDays: 1, overtimeHours: 2, basePay: 2_800 * R, overtimePay: 200 * R, advanceDeduction: 1_000 * R, net: 2_000 * R, projectId: ids.project });
    const sup = run.lines.find((l: any) => l.personId === ids.supervisor);
    // 30 days, one unpaid absence (the 8th); the leave on the 7th is paid.
    expect(sup).toMatchObject({ personType: "STAFF", leaveDays: 1, payableDays: 29, basePay: 29_000 * R, net: 29_000 * R });
    expect(run.totalNet).toBe(31_000 * R);
    ids.masonLine = mason.id;
    ids.supLine = sup.id;
  });

  it("only an admin approves, an approved payroll is locked, and paying books labour cost to the project", async () => {
    as("accounts");
    const edited = await editLine(req(`/api/payroll/lines/${ids.masonLine}`, "PATCH", { bonus: 500 * R, note: "Diwali bonus" }), p(ids.masonLine));
    expect((await edited.json()).data.run.totalNet).toBe(31_500 * R);
    expect((await approvePayroll(req(`/api/payroll/${MONTH}/approve`, "POST", {}), { params: { month: MONTH } })).status).toBe(403);

    as("admin");
    expect((await approvePayroll(req(`/api/payroll/${MONTH}/approve`, "POST", {}), { params: { month: MONTH } })).status).toBe(200);
    as("accounts");
    expect((await editLine(req(`/api/payroll/lines/${ids.masonLine}`, "PATCH", { bonus: 0 }), p(ids.masonLine))).status).toBe(409);
    expect((await runPayroll(req("/api/payroll", "POST", { month: MONTH }))).status).toBe(409);

    const paid = await payPayroll(req(`/api/payroll/${MONTH}/pay`, "POST", { method: "NEFT_RTGS", paymentDate: "2026-10-01" }), { params: { month: MONTH } });
    expect(paid.status).toBe(200);
    expect((await paid.json()).data.run.status).toBe("PAID");
    const payments = await prisma.payment.findMany({ where: { organizationId: orgId, recipientType: "EMPLOYEE" } });
    expect(payments).toHaveLength(2);
    expect(payments.find((x) => x.recipientName === "Ramesh Mason")).toMatchObject({ amount: 2_500 * R, costHead: "LABOUR", projectId: ids.project, status: "POSTED" });
    expect(payments.find((x) => x.recipientName === "Ravi Supervisor")).toMatchObject({ costHead: "OVERHEADS" });
  });

  it("staff can open their own payslip but not someone else's", async () => {
    as("supervisor");
    const own = await payslip(req(`/api/payroll/lines/${ids.supLine}/payslip`), p(ids.supLine));
    expect(own.status).toBe(200);
    expect((await own.json()).data.net).toBe(29_000 * R);
    expect((await payslip(req(`/api/payroll/lines/${ids.masonLine}/payslip`), p(ids.masonLine))).status).toBe(404);
    as("accounts");
    const slip = (await (await payslip(req(`/api/payroll/lines/${ids.masonLine}/payslip`), p(ids.masonLine))).json()).data;
    expect(slip.advances).toHaveLength(1);
    expect(slip.projectName).toBe("Bothra Heights");
  });

  // ── Drawings ────────────────────────────────────────────────────────────

  it("keeps drawing revisions and tells the site team when a new one is issued", async () => {
    as("supervisor");
    expect((await addDrawing(req("/api/drawings", "POST", { projectId: ids.project, number: "STR-101", title: "Slab", discipline: "STRUCTURAL" }))).status).toBe(403);

    as("pm");
    const created = await addDrawing(req("/api/drawings", "POST", { projectId: ids.project, number: "str-101", title: "Ground floor slab reinforcement", discipline: "STRUCTURAL", fileUrl: "/api/uploads/abc123", fileName: "str101.pdf" }));
    expect(created.status).toBe(201);
    const drawingId = (await created.json()).data.id;
    expect((await addDrawing(req("/api/drawings", "POST", { projectId: ids.project, number: "STR-101", title: "Again", discipline: "STRUCTURAL" }))).status).toBe(409);

    const r0 = await prisma.drawingRevision.findFirstOrThrow({ where: { drawingId } });
    expect(r0).toMatchObject({ revision: "R0", status: "FOR_APPROVAL", fileUrl: "/api/uploads/abc123" });
    expect((await reviewRevision(req(`/api/drawing-revisions/${r0.id}/review`, "POST", { action: "REJECT" }), p(r0.id))).status).toBe(422);
    expect((await reviewRevision(req(`/api/drawing-revisions/${r0.id}/review`, "POST", { action: "ISSUE" }), p(r0.id))).status).toBe(200);
    expect(await prisma.notification.count({ where: { userId: ids.supervisor, type: "DRAWING_ISSUED" } })).toBe(1);

    const rev = await addRevision(req(`/api/drawings/${drawingId}/revisions`, "POST", { fileUrl: "https://evil.example/x.pdf", notes: "Beam B4 deeper" }), p(drawingId));
    expect((await rev.json()).data.revision).toBe("R1");
    const r1 = await prisma.drawingRevision.findFirstOrThrow({ where: { drawingId, revision: "R1" } });
    expect(r1.fileUrl).toBeNull(); // only our own uploads are kept
    as("supervisor");
    expect((await reviewRevision(req(`/api/drawing-revisions/${r1.id}/review`, "POST", { action: "ISSUE" }), p(r1.id))).status).toBe(403);
    as("pm");
    await reviewRevision(req(`/api/drawing-revisions/${r1.id}/review`, "POST", { action: "ISSUE" }), p(r1.id));
    expect((await prisma.drawingRevision.findUniqueOrThrow({ where: { id: r0.id } })).status).toBe("SUPERSEDED");

    as("supervisor");
    const list = (await (await listDrawings(req(`/api/drawings?projectId=${ids.project}`))).json()).data;
    expect(list.drawings[0]).toMatchObject({ number: "STR-101" });
    expect(list.drawings[0].onSite.revision).toBe("R1");
    expect(list.summary).toMatchObject({ total: 1, gfc: 1, waiting: 0 });
  });

  // ── Quality and safety ──────────────────────────────────────────────────

  it("a failed checklist opens defects for the project manager; incidents alert admins", async () => {
    as("supervisor");
    expect(
      (await runChecklist(req("/api/quality/inspections", "POST", { projectId: ids.other, template: "PRE_POUR", items: [{ label: "x", result: "PASS" }] }))).status
    ).toBe(403);
    const res = await runChecklist(
      req("/api/quality/inspections", "POST", {
        projectId: ids.project,
        template: "PRE_POUR",
        location: "3rd floor slab",
        items: [
          { label: "Shuttering levels and props checked", result: "PASS" },
          { label: "Cover blocks fixed (slab 20 mm, beam 25 mm)", result: "FAIL", note: "Missing near grid C" },
          { label: "Cube moulds and slump cone ready", result: "FAIL" },
          { label: "Vibrator and standby available", result: "NA" },
        ],
      })
    );
    expect(res.status).toBe(201);
    const body = (await res.json()).data;
    expect(body.inspection.result).toBe("FAILED");
    expect(body.issuesOpened).toBe(2);
    const ncrs = await prisma.siteIssue.findMany({ where: { organizationId: orgId, kind: "NCR" } });
    expect(ncrs.map((n) => n.assignedTo)).toEqual([ids.pm, ids.pm]);
    expect(ncrs[0].issueNumber).toMatch(/^NCR-\d{4}-00[12]$/);
    expect(await prisma.notification.count({ where: { userId: ids.pm, type: "QUALITY_ALERT" } })).toBe(1);

    const incident = await reportIssue(
      req("/api/quality/issues", "POST", { projectId: ids.project, kind: "SAFETY_INCIDENT", severity: "HIGH", title: "Worker slipped from scaffold", injuredCount: 1 })
    );
    expect(incident.status).toBe(201);
    expect((await incident.json()).data.issueNumber).toMatch(/^SAF-/);
    const alert = await prisma.notification.findFirst({ where: { userId: ids.admin, type: "SAFETY_ALERT" } });
    expect(alert).toMatchObject({ severity: "CRITICAL" });

    const listed = (await (await listIssues(req(`/api/quality/issues?status=OPEN`))).json()).data;
    expect(listed.summary).toMatchObject({ openQuality: 2, openSafety: 1, daysSinceIncident: 0, inspections30d: 1, passRate30d: 0 });

    const ncr = ncrs[0];
    expect((await resolveIssue(req(`/api/quality/issues/${ncr.id}/resolve`, "POST", { resolution: "Cover blocks fixed and checked" }), p(ncr.id))).status).toBe(200);
    expect((await verifyIssue(req(`/api/quality/issues/${ncr.id}/verify`, "POST", { action: "CLOSE" }), p(ncr.id))).status).toBe(403);
    as("pm");
    expect((await verifyIssue(req(`/api/quality/issues/${ncr.id}/verify`, "POST", { action: "CLOSE" }), p(ncr.id))).status).toBe(200);
    expect((await prisma.siteIssue.findUniqueOrThrow({ where: { id: ncr.id } })).status).toBe("CLOSED");
  });

  // ── Equipment ───────────────────────────────────────────────────────────

  it("tracks a hired machine's hours, hire, fuel and breakdowns", async () => {
    as("supervisor");
    expect((await addEquipment(req("/api/equipment", "POST", { code: "JCB-1", name: "JCB", category: "EARTHMOVING", ownership: "OWNED" }))).status).toBe(403);
    as("pm");
    expect((await addEquipment(req("/api/equipment", "POST", { code: "JCB-1", name: "JCB 3DX", category: "EARTHMOVING", ownership: "HIRED" }))).status).toBe(422);
    const created = await addEquipment(
      req("/api/equipment", "POST", { code: "jcb-1", name: "JCB 3DX", category: "EARTHMOVING", ownership: "HIRED", vendorPartyId: ids.vendor, hireRate: 1_200 * R, hireRateUnit: "HOUR", currentProjectId: ids.project })
    );
    expect(created.status).toBe(201);
    const eq = (await created.json()).data;
    expect(eq).toMatchObject({ code: "JCB-1", status: "IN_USE" });

    as("supervisor");
    expect((await logEquipment(req(`/api/equipment/${eq.id}/logs`, "POST", { kind: "USAGE" }), p(eq.id))).status).toBe(422);
    const used = await logEquipment(req(`/api/equipment/${eq.id}/logs`, "POST", { kind: "USAGE", hours: 6, operator: "Suresh" }), p(eq.id));
    expect((await used.json()).data.cost).toBe(7_200 * R);
    await logEquipment(req(`/api/equipment/${eq.id}/logs`, "POST", { kind: "FUEL", fuelLitres: 40, cost: 3_600 * R }), p(eq.id));
    expect((await logEquipment(req(`/api/equipment/${eq.id}/logs`, "POST", { kind: "MOVE", projectId: null }), p(eq.id))).status).toBe(403);
    await logEquipment(req(`/api/equipment/${eq.id}/logs`, "POST", { kind: "BREAKDOWN", note: "Hydraulic leak" }), p(eq.id));
    expect(await prisma.notification.count({ where: { userId: ids.admin, type: "EQUIPMENT_ALERT" } })).toBe(1);

    const list = (await (await listEquipment(req("/api/equipment"))).json()).data;
    expect(list.summary).toMatchObject({ total: 1, underRepair: 1, hired: 1, monthCost: 10_800 * R });
    expect(list.equipment[0].month).toMatchObject({ hours: 6, fuelLitres: 40, daysUsed: 1 });

    await logEquipment(req(`/api/equipment/${eq.id}/logs`, "POST", { kind: "MAINTENANCE", cost: 2_000 * R, note: "Seal replaced" }), p(eq.id));
    expect((await prisma.equipment.findUniqueOrThrow({ where: { id: eq.id } })).status).toBe("IN_USE");
  });

  // ── Sales ───────────────────────────────────────────────────────────────

  it("runs a lead through to a booking with a construction-linked payment plan", async () => {
    as("supervisor");
    expect((await listUnits(req("/api/sales/units"))).status).toBe(403);

    as("pm");
    const added = await addUnits(req("/api/sales/units", "POST", { projectId: ids.project, unitNumbers: ["a-101", "A-102", "A-103"], unitType: "3BHK", areaSqft: 1650, price: 60_00_000 * R }));
    expect((await added.json()).data.added).toBe(3);
    expect((await addUnits(req("/api/sales/units", "POST", { projectId: ids.project, unitNumbers: ["A-101"], unitType: "3BHK", price: 1 }))).status).toBe(409);

    const lead = (await (await addLead(req("/api/sales/leads", "POST", { name: "Sunita Jain", phone: "98290 55555", source: "REFERRAL", projectId: ids.project, interest: "3BHK east facing" }))).json()).data;
    expect((await addLead(req("/api/sales/leads", "POST", { name: "Again", phone: "9829055555", source: "WALK_IN" }))).status).toBe(409);
    expect((await leadActivity(req(`/api/sales/leads/${lead.id}/activity`, "POST", { kind: "SITE_VISIT", note: "Liked A-101", stage: "SITE_VISIT" }), p(lead.id))).status).toBe(200);
    expect((await leadActivity(req(`/api/sales/leads/${lead.id}/activity`, "POST", { kind: "CALL", note: "x", stage: "LOST" }), p(lead.id))).status).toBe(422);

    const units = (await (await listUnits(req("/api/sales/units"))).json()).data;
    const a101 = units.find((u: any) => u.unitNumber === "A-101");
    const booked = await book(req("/api/sales/bookings", "POST", { unitId: a101.id, leadId: lead.id, agreementValue: 58_50_000 * R, plan: "CONSTRUCTION_LINKED" }));
    expect(booked.status).toBe(201);
    expect((await book(req("/api/sales/bookings", "POST", { unitId: a101.id, customerName: "X", customerPhone: "9999999999", agreementValue: 1 * R, plan: "DOWN_PAYMENT" }))).status).toBe(409);
    expect((await prisma.salesUnit.findUniqueOrThrow({ where: { id: a101.id } })).status).toBe("BOOKED");
    expect((await prisma.salesLead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("BOOKED");

    const data = (await (await listBookings(req("/api/sales/bookings"))).json()).data;
    const b = data.bookings[0];
    expect(b.installments).toHaveLength(8);
    expect(b.installments.reduce((s: number, i: any) => s + i.amount, 0)).toBe(58_50_000 * R);
    expect(b.installments[0]).toMatchObject({ label: "Booking amount", amount: 5_85_000 * R, dueDate: istDateKey() });
    expect(b.installments[2].dueDate).toBeNull();
    expect(data.summary).toMatchObject({ bookings: 1, salesValue: 58_50_000 * R, received: 0, overdue: 5_85_000 * R });

    // Money in is for accounts.
    const first = b.installments[0];
    expect((await receive(req(`/api/sales/installments/${first.id}/receive`, "POST", { amount: 5_85_000 * R, mode: "NEFT_RTGS" }), p(first.id))).status).toBe(403);
    as("accounts");
    expect((await receive(req(`/api/sales/installments/${first.id}/receive`, "POST", { amount: 9_00_000 * R, mode: "NEFT_RTGS" }), p(first.id))).status).toBe(422);
    expect((await receive(req(`/api/sales/installments/${first.id}/receive`, "POST", { amount: 5_85_000 * R, mode: "NEFT_RTGS", reference: "UTR998" }), p(first.id))).status).toBe(200);

    as("pm");
    const foundation = b.installments[2];
    const demand = await raiseDemand(req(`/api/sales/installments/${foundation.id}/demand`, "POST", {}), p(foundation.id));
    expect((await demand.json()).data.dueDate > istDateKey()).toBe(true);
    const after = (await (await listBookings(req("/api/sales/bookings"))).json()).data;
    expect(after.summary).toMatchObject({ received: 5_85_000 * R, overdue: 0 });
    const leads = (await (await listLeads(req("/api/sales/leads"))).json()).data;
    expect(leads.counts.BOOKED).toBe(1);
  });

  it("the dashboard shows what needs attention across these areas", async () => {
    const attention = await CommandCenterService.attention(orgId, istDateKey());
    expect(attention).toMatchObject({ openSafety: 1, drawingsWaiting: 0, payrollDraft: 0, equipmentDown: 0, customerOverdue: 0 });
  });
});
