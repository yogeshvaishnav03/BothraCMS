import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { GET as revisionDetail } from "@/app/api/drawing-revisions/[id]/route";
import { PUT as saveMarkup } from "@/app/api/drawing-revisions/[id]/markup/route";
import { GET as listChecklists, POST as addChecklist } from "@/app/api/quality/checklists/route";
import { PATCH as editChecklist, DELETE as removeChecklist } from "@/app/api/quality/checklists/[id]/route";
import { POST as runChecklist } from "@/app/api/quality/inspections/route";
import { GET as form16 } from "@/app/api/payroll/form-16/route";
import { fyMonths } from "@/lib/income-tax";

const stamp = Date.now();
let orgId = "";
const ids: Record<string, string> = {};
const people = {
  admin: { name: "Owner Bothra", role: "ORG_ADMIN" },
  pm: { name: "Priya PM", role: "PROJECT_MANAGER" },
  supervisor: { name: "Ravi Supervisor", role: "SITE_SUPERVISOR" },
  outsider: { name: "Sunil Other Site", role: "SITE_SUPERVISOR" },
} as const;
type Who = keyof typeof people;

function as(who: Who) {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId: ids[who],
    organizationId: orgId,
    email: `${who}@test.local`,
    name: people[who].name,
    role: people[who].role as any,
    organizationName: "Markup Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

const req = (path: string, method = "GET", body?: unknown) => new NextRequest(`http://localhost:3000${path}`, { method, body: body ? JSON.stringify(body) : undefined });
const p = (id: string) => ({ params: { id } });
const cloud = { type: "cloud", color: "#dc2626", points: [[0.1, 0.1], [0.3, 0.25]] };
const note = { type: "text", color: "#2563eb", points: [[0.5, 0.5]], text: "Beam B4 depth?" };

describe("Phase 14: drawing markup and custom checklists", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Markup Org ${stamp}` } });
    orgId = org.id;
    for (const who of Object.keys(people) as Who[]) {
      ids[who] = (await prisma.user.create({ data: { organizationId: orgId, name: people[who].name, email: `${who}-${stamp}@test.local`, passwordHash: "x", role: people[who].role } })).id;
    }
    const site = await prisma.site.create({ data: { organizationId: orgId, name: "Site", code: `S-${stamp}`, address: "Jaipur" } });
    const project = await prisma.project.create({ data: { organizationId: orgId, siteId: site.id, code: `P-${stamp}`, name: "Bothra Heights", managerUserId: ids.pm } });
    ids.project = project.id;
    await prisma.projectAssignment.create({ data: { organizationId: orgId, projectId: project.id, userId: ids.supervisor, assignedById: ids.admin } });
    const drawing = await prisma.drawing.create({ data: { organizationId: orgId, projectId: project.id, number: "STR-101", title: "Slab", discipline: "STRUCTURAL", createdBy: ids.pm } });
    ids.r0 = (await prisma.drawingRevision.create({ data: { drawingId: drawing.id, revision: "R0", status: "SUPERSEDED", fileUrl: "/api/uploads/r0", fileName: "r0.pdf", uploadedBy: ids.pm } })).id;
    ids.r1 = (await prisma.drawingRevision.create({ data: { drawingId: drawing.id, revision: "R1", status: "GFC", fileUrl: "/api/uploads/r1", fileName: "r1.pdf", uploadedBy: ids.pm } })).id;
  });
  beforeEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  it("saves each person's marks per page, tells the uploader once, and keeps other projects out", async () => {
    as("supervisor");
    // Bad marks are refused: an unknown colour, a point far off the sheet, a note with no text.
    expect((await saveMarkup(req(`/api/drawing-revisions/${ids.r1}/markup`, "PUT", { page: 1, shapes: [{ ...cloud, color: "#ff00ff" }] }), p(ids.r1))).status).toBe(422);
    expect((await saveMarkup(req(`/api/drawing-revisions/${ids.r1}/markup`, "PUT", { page: 1, shapes: [{ ...cloud, points: [[0, 0], [3, 3]] }] }), p(ids.r1))).status).toBe(422);
    expect((await saveMarkup(req(`/api/drawing-revisions/${ids.r1}/markup`, "PUT", { page: 1, shapes: [{ ...note, text: "" }] }), p(ids.r1))).status).toBe(422);

    expect((await saveMarkup(req(`/api/drawing-revisions/${ids.r1}/markup`, "PUT", { page: 1, shapes: [cloud, note] }), p(ids.r1))).status).toBe(200);
    // Saving again replaces, not adds.
    expect((await saveMarkup(req(`/api/drawing-revisions/${ids.r1}/markup`, "PUT", { page: 1, shapes: [cloud, note, { type: "arrow", color: "#dc2626", points: [[0.2, 0.2], [0.4, 0.4]] }] }), p(ids.r1))).status).toBe(200);
    expect(await prisma.drawingMarkup.count({ where: { revisionId: ids.r1 } })).toBe(1);
    const told = await prisma.notification.findMany({ where: { organizationId: orgId, userId: ids.pm, href: `/drawings/view/${ids.r1}` } });
    expect(told).toHaveLength(1);
    expect(told[0].title).toContain("marked up STR-101 R1");
    expect(told[0].message).toBe("Beam B4 depth?");
    expect(await prisma.auditEvent.count({ where: { organizationId: orgId, action: "DRAWING_MARKED_UP" } })).toBe(2);

    // The project manager sees the supervisor's marks next to their own, and both revisions to compare.
    as("pm");
    await saveMarkup(req(`/api/drawing-revisions/${ids.r1}/markup`, "PUT", { page: 2, shapes: [cloud] }), p(ids.r1));
    const d = (await (await revisionDetail(req(`/api/drawing-revisions/${ids.r1}`), p(ids.r1))).json()).data;
    expect(d.drawing.number).toBe("STR-101");
    expect(d.revisions.map((r: any) => r.revision)).toEqual(["R0", "R1"]);
    const theirs = d.markups.find((m: any) => !m.mine);
    expect(theirs).toMatchObject({ page: 1, createdByName: "Ravi Supervisor" });
    expect(theirs.shapes).toHaveLength(3);
    expect(d.markups.find((m: any) => m.mine)).toMatchObject({ page: 2 });

    // Clearing your marks removes only yours.
    as("supervisor");
    await saveMarkup(req(`/api/drawing-revisions/${ids.r1}/markup`, "PUT", { page: 1, shapes: [] }), p(ids.r1));
    expect(await prisma.drawingMarkup.count({ where: { revisionId: ids.r1 } })).toBe(1);

    // Someone not on the project can neither see nor mark the drawing.
    as("outsider");
    expect((await revisionDetail(req(`/api/drawing-revisions/${ids.r1}`), p(ids.r1))).status).toBe(403);
    expect((await saveMarkup(req(`/api/drawing-revisions/${ids.r1}/markup`, "PUT", { page: 1, shapes: [cloud] }), p(ids.r1))).status).toBe(403);
  });

  it("lets managers write their own checklists and change the built-in ones", async () => {
    as("supervisor");
    expect((await addChecklist(req("/api/quality/checklists", "POST", { name: "Tiling", kind: "QUALITY", items: ["Level"] }))).status).toBe(403);

    as("pm");
    const made = await addChecklist(req("/api/quality/checklists", "POST", { name: "Tiling check", kind: "QUALITY", items: [" Tiles soaked ", "", "Joints 3 mm with spacers", "tiles soaked", "Hollow sound test"] }));
    expect(made.status).toBe(201);
    const tiling = (await made.json()).data;
    expect(tiling.items).toEqual(["Tiles soaked", "Joints 3 mm with spacers", "Hollow sound test"]);
    expect((await addChecklist(req("/api/quality/checklists", "POST", { name: "Tiling check", kind: "QUALITY", items: ["x"] }))).status).toBe(409);

    // Change the built-in safety walk: the copy takes its place in the list.
    const copy = (await (await addChecklist(req("/api/quality/checklists", "POST", { name: "Weekly site safety walk (Bothra)", kind: "SAFETY", items: ["Helmets", "Harness at height", "Lift gate locked"], replacesKey: "SAFETY_WALK" }))).json()).data;
    expect((await addChecklist(req("/api/quality/checklists", "POST", { name: "Another walk", kind: "SAFETY", items: ["x"], replacesKey: "SAFETY_WALK" }))).status).toBe(409);
    let list = (await (await listChecklists(req("/api/quality/checklists"))).json()).data;
    expect(list.map((c: any) => c.key)).not.toContain("SAFETY_WALK");
    expect(list.map((c: any) => c.key)).toEqual(expect.arrayContaining([`T:${tiling.id}`, `T:${copy.id}`, "PRE_POUR", "PLASTER"]));

    expect((await editChecklist(req(`/api/quality/checklists/${tiling.id}`, "PATCH", { name: "Tiling check", kind: "QUALITY", items: ["Tiles soaked", "Hollow sound test", "Slope to drain"] }), p(tiling.id))).status).toBe(200);

    // Site staff run it; a failed point on the safety copy opens an unsafe act.
    as("supervisor");
    const ran = await runChecklist(
      req("/api/quality/inspections", "POST", { projectId: ids.project, template: `T:${copy.id}`, location: "Tower A", items: [{ label: "Helmets", result: "PASS" }, { label: "Lift gate locked", result: "FAIL", note: "Gate open on 4th floor" }] })
    );
    expect(ran.status).toBe(201);
    const ins = await prisma.qualityInspection.findFirstOrThrow({ where: { organizationId: orgId } });
    expect(ins).toMatchObject({ template: `T:${copy.id}`, title: "Weekly site safety walk (Bothra)", result: "FAILED" });
    expect(await prisma.siteIssue.findFirstOrThrow({ where: { inspectionId: ins.id } })).toMatchObject({ kind: "UNSAFE_ACT", title: "Gate open on 4th floor" });
    expect((await runChecklist(req("/api/quality/inspections", "POST", { projectId: ids.project, template: "T:nope", items: [{ label: "x", result: "PASS" }] }))).status).toBe(422);

    // Removing the copy brings the built-in back; the inspection keeps its points.
    as("pm");
    expect((await removeChecklist(req(`/api/quality/checklists/${copy.id}`, "DELETE"), p(copy.id))).status).toBe(200);
    list = (await (await listChecklists(req("/api/quality/checklists"))).json()).data;
    expect(list.map((c: any) => c.key)).toContain("SAFETY_WALK");
    expect(list.map((c: any) => c.key)).not.toContain(`T:${copy.id}`);
    expect(JSON.parse((await prisma.qualityInspection.findUniqueOrThrow({ where: { id: ins.id } })).itemsJson)).toHaveLength(2);
    expect(await prisma.auditEvent.count({ where: { organizationId: orgId, entityType: "CHECKLIST_TEMPLATE" } })).toBe(4);
  });
});


describe("Phase 14: Form 16 Part B", () => {
  let org = "";
  const u: Record<string, string> = {};
  const FY = "2025-26";
  const as16 = (who: "accounts" | "engineer" | "other") =>
    vi.spyOn(auth, "getUserContext").mockResolvedValue({
      userId: u[who],
      organizationId: org,
      email: `${who}@t.local`,
      name: who,
      role: (who === "accounts" ? "ACCOUNTANT" : "SITE_SUPERVISOR") as any,
      organizationName: "F16 Org",
      currency: "INR",
      timezone: "Asia/Kolkata",
    });

  beforeAll(async () => {
    org = (await prisma.organization.create({ data: { name: `F16 Org ${stamp}`, settingsJson: JSON.stringify({ tan: "JPRB12345C", taxId: "08AABCB1234F1Z5", tdsSignatory: "Owner Bothra", tdsSignatoryDesignation: "Director" }) } })).id;
    for (const [who, role] of [["accounts", "ACCOUNTANT"], ["engineer", "SITE_SUPERVISOR"], ["other", "SITE_SUPERVISOR"]] as const) {
      u[who] = (await prisma.user.create({ data: { organizationId: org, name: who === "engineer" ? "Vikas Engineer" : who, email: `${who}-f16-${stamp}@t.local`, passwordHash: "x", role, jobTitle: who === "engineer" ? "Site Engineer" : null } })).id;
    }
    // ₹1.5 lakh a month, old regime: 12 approved months, ₹15,000 TDS each, ₹200 professional tax, ₹1,800 PF.
    await prisma.payrollProfile.create({ data: { organizationId: org, userId: u.engineer, monthlySalary: 150_000_00, taxRegime: "OLD", taxDeclared: 25_000_00, pan: "ABCPE1234K" } });
    for (const month of fyMonths(FY)) {
      await prisma.payrollRun.create({
        data: {
          organizationId: org,
          month,
          status: "PAID",
          createdBy: u.accounts,
          paidAt: new Date(`${month}-28T06:00:00Z`),
          lines: { create: { personType: "STAFF", personId: u.engineer, personName: "Vikas Engineer", rate: 150_000_00, basePay: 150_000_00, gross: 150_000_00, pfEmployee: 1_800_00, professionalTax: 200_00, tds: 15_000_00, net: 133_000_00 } },
        },
      });
    }
  });
  beforeEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await prisma.organization.delete({ where: { id: org } }).catch(() => {});
  });

  it("fills Part B line by line from the year's payroll and lists who needs one", async () => {
    as16("accounts");
    const list = (await (await form16(req(`/api/payroll/form-16?fy=${FY}`))).json()).data;
    expect(list.due).toBe("2026-06-15");
    expect(list.staff).toEqual([{ userId: u.engineer, name: "Vikas Engineer", gross: 18_00_000_00, tds: 1_80_000_00, months: 12 }]);

    const d = (await (await form16(req(`/api/payroll/form-16?fy=${FY}&userId=${u.engineer}`))).json()).data;
    expect(d).toMatchObject({ assessmentYear: "2026-27", complete: true, optedOutOf115BAC: true, employer: { tan: "JPRB12345C", pan: "AABCB1234F", signatory: "Owner Bothra" }, employee: { pan: "ABCPE1234K", designation: "Site Engineer" } });
    const b = d.partB;
    // 18,00,000 − 50,000 standard − 2,400 professional tax = 17,47,600.
    expect(b).toMatchObject({ grossSalary: 18_00_000_00, standardDeduction: 50_000_00, taxOnEmployment: 2_400_00, chargeableSalary: 17_47_600_00 });
    // 80C is the PF (21,600); the declared 25,000 goes under other Chapter VI-A deductions.
    expect(b).toMatchObject({ sec80C: 21_600_00, otherVIA: 25_000_00, totalVIA: 46_600_00, totalIncome: 17_01_000_00 });
    // Old regime: 1,12,500 + 30% of 7,01,000 = 3,22,800, plus 4% cess.
    expect(b.taxOnIncome).toBe(3_22_800_00);
    expect(b.cess).toBe(12_912_00);
    expect(b.netTaxPayable).toBe(3_35_712_00);
    expect(b.tdsDeducted).toBe(1_80_000_00);
    expect(b.balance).toBe(1_55_712_00);
    expect(d.quarters.map((q: any) => q.tds)).toEqual([45_000_00, 45_000_00, 45_000_00, 45_000_00]);
    expect(d.problems.join(" ")).toMatch(/short of the tax for the year/);
    expect(d.tdsInWords).toContain("One Lakh Eighty Thousand");

    // Staff see their own form only.
    as16("engineer");
    expect((await form16(req(`/api/payroll/form-16?fy=${FY}&userId=${u.engineer}`))).status).toBe(200);
    as16("other");
    expect((await form16(req(`/api/payroll/form-16?fy=${FY}&userId=${u.engineer}`))).status).toBe(403);
    expect((await form16(req(`/api/payroll/form-16?fy=${FY}`))).status).toBe(403);
    as16("accounts");
    expect((await form16(req(`/api/payroll/form-16?fy=${FY}&userId=${u.other}`))).status).toBe(404);
  });
});
