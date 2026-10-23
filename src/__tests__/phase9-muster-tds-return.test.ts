import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { POST as createRequest } from "@/app/api/material-requests/route";
import { GET as getMuster, POST as saveMuster } from "@/app/api/attendance/muster/route";
import { GET as getPayroll, POST as runPayroll } from "@/app/api/payroll/route";
import { PUT as setSalary } from "@/app/api/payroll/salaries/[userId]/route";
import { POST as approvePayroll } from "@/app/api/payroll/[month]/approve/route";
import { GET as tdsReturn } from "@/app/api/payroll/tds-return/route";
import { istDateKey, monthDays } from "@/lib/ist-date";

const stamp = Date.now();
let orgId = "";
const ids: Record<string, string> = {};
const people = {
  admin: { name: "Owner Bothra", role: "ORG_ADMIN" },
  accounts: { name: "Anil Accounts", role: "ACCOUNTANT" },
  supervisor: { name: "Sunil Supervisor", role: "SITE_SUPERVISOR" },
  outsider: { name: "Om Outsider", role: "SITE_SUPERVISOR" },
} as const;
type Who = keyof typeof people;

function as(who: Who) {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId: ids[who],
    organizationId: orgId,
    email: `${who}@test.local`,
    name: people[who].name,
    role: people[who].role as any,
    organizationName: "Phase9 Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

const req = (path: string, method = "GET", body?: unknown, headers?: Record<string, string>) =>
  new NextRequest(`http://localhost:3000${path}`, { method, body: body ? JSON.stringify(body) : undefined, headers });
const R = 100; // ₹1 in paise
const json = async (res: Response) => (await res.json()).data;
const shift = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

describe("Phase 9: one-time offline sends, site muster, TDS return", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Phase9 Org ${stamp}`, settingsJson: JSON.stringify({ taxId: "08AAACB1234F1Z5", tan: "JPRB12345C" }) } });
    orgId = org.id;
    for (const who of Object.keys(people) as Who[]) {
      const u = await prisma.user.create({ data: { organizationId: orgId, name: people[who].name, email: `${who}-${stamp}@test.local`, passwordHash: "x", role: people[who].role } });
      ids[who] = u.id;
    }
    const site = await prisma.site.create({ data: { organizationId: orgId, name: "Vaishali Nagar plot", code: `VN${stamp}`, address: "Jaipur" } });
    const other = await prisma.site.create({ data: { organizationId: orgId, name: "Mansarovar plot", code: `MS${stamp}`, address: "Jaipur" } });
    ids.site = site.id;
    ids.otherSite = other.id;
    ids.project = (await prisma.project.create({ data: { organizationId: orgId, siteId: site.id, code: `P${stamp}`, name: "Vaishali Heights", managerUserId: ids.supervisor } })).id;
    ids.otherProject = (await prisma.project.create({ data: { organizationId: orgId, siteId: other.id, code: `Q${stamp}`, name: "Mansarovar Greens" } })).id;
    const worker = (name: string, code: string, siteId: string | null) =>
      prisma.workforceMember.create({ data: { organizationId: orgId, name, employeeCode: `${code}-${stamp}`, workerType: "MASON", dailyWageRate: 800 * R, defaultSiteId: siteId } });
    ids.ramesh = (await worker("Ramesh Mason", "W1", site.id)).id;
    ids.kailash = (await worker("Kailash Helper", "W2", site.id)).id;
    ids.babulal = (await worker("Babulal Carpenter", "W3", other.id)).id;
  });

  afterAll(async () => {
    if (orgId) {
      await prisma.offlineSend.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
    }
  });

  beforeEach(() => vi.restoreAllMocks());

  it("handles a request saved on a phone only once, however many times it arrives", async () => {
    as("supervisor");
    const body = { projectId: ids.project, priority: "URGENT", items: [{ description: "OPC cement 53 grade", quantity: 100, unitCode: "BAG" }] };
    const ref = `ref-${stamp}-a`;
    const first = await createRequest(req("/api/material-requests", "POST", body, { "X-Offline-Ref": ref }));
    expect(first.status).toBe(201);
    const made = await json(first);
    // The reply was lost; the phone sends it again.
    const again = await createRequest(req("/api/material-requests", "POST", body, { "X-Offline-Ref": ref }));
    expect(again.status).toBe(201);
    expect(again.headers.get("X-Offline-Replay")).toBe("1");
    expect((await json(again)).id).toBe(made.id);
    expect(await prisma.materialRequest.count({ where: { organizationId: orgId } })).toBe(1);

    // Someone else cannot reuse the id.
    as("outsider");
    expect((await createRequest(req("/api/material-requests", "POST", body, { "X-Offline-Ref": ref }))).status).toBe(409);

    // A refused request can be corrected and sent with the same id.
    as("supervisor");
    const ref2 = `ref-${stamp}-b`;
    expect((await createRequest(req("/api/material-requests", "POST", { ...body, items: [] }, { "X-Offline-Ref": ref2 }))).status).toBe(422);
    expect((await createRequest(req("/api/material-requests", "POST", body, { "X-Offline-Ref": ref2 }))).status).toBe(201);
    // Without the header, each send is new.
    await createRequest(req("/api/material-requests", "POST", body));
    expect(await prisma.materialRequest.count({ where: { organizationId: orgId } })).toBe(3);
  });

  it("marks the site muster and pays it in payroll", async () => {
    const today = istDateKey();
    as("supervisor");
    const m = await json(await getMuster(req(`/api/attendance/muster?projectId=${ids.project}&date=${today}`)));
    expect(m.project).toMatchObject({ name: "Vaishali Heights", site: "Vaishali Nagar plot" });
    // This site's workers first.
    expect(m.workers.map((w: any) => w.name)).toEqual(["Kailash Helper", "Ramesh Mason", "Babulal Carpenter"]);
    expect(m.workers.every((w: any) => w.mark === "NONE")).toBe(true);

    const entries = [
      { workerId: ids.ramesh, mark: "PRESENT", overtimeHours: 2 },
      { workerId: ids.kailash, mark: "HALF_DAY" },
      { workerId: ids.babulal, mark: "ABSENT" },
    ];
    const saved = await json(await saveMuster(req("/api/attendance/muster", "POST", { projectId: ids.project, workDate: today, entries })));
    expect(saved).toMatchObject({ present: 1, halfDay: 1, absent: 1 });
    const ramesh = saved.workers.find((w: any) => w.id === ids.ramesh);
    expect(ramesh).toMatchObject({ mark: "PRESENT", overtimeHours: 2 });
    const session = await prisma.attendanceSession.findFirst({ where: { workforceMemberId: ids.ramesh, workDate: today } });
    expect(session).toMatchObject({ status: "OVERTIME", siteId: ids.site, projectId: ids.project });
    expect(session!.checkInAt.toISOString()).toBe(new Date(`${today}T09:00:00+05:30`).toISOString());
    expect((session!.checkOutAt!.getTime() - session!.checkInAt.getTime()) / 3_600_000).toBe(10);

    // Sent again from a phone: the same result, no extra rows.
    await saveMuster(req("/api/attendance/muster", "POST", { projectId: ids.project, workDate: today, entries }));
    expect(await prisma.attendanceSession.count({ where: { organizationId: orgId, workDate: today } })).toBe(3);

    // An admin's correction stays.
    await prisma.attendanceSession.updateMany({ where: { workforceMemberId: ids.babulal, workDate: today }, data: { correctedBy: ids.admin, status: "PRESENT" } });
    const kept = await json(await saveMuster(req("/api/attendance/muster", "POST", { projectId: ids.project, workDate: today, entries: [{ workerId: ids.babulal, mark: "ABSENT" }] })));
    expect(kept.kept).toBe(1);
    expect(kept.workers.find((w: any) => w.id === ids.babulal)).toMatchObject({ mark: "PRESENT", locked: true });

    // Clearing a mark removes it.
    await saveMuster(req("/api/attendance/muster", "POST", { projectId: ids.project, workDate: shift(today, -1), entries: [{ workerId: ids.kailash, mark: "PRESENT" }] }));
    await saveMuster(req("/api/attendance/muster", "POST", { projectId: ids.project, workDate: shift(today, -1), entries: [{ workerId: ids.kailash, mark: "NONE" }] }));
    expect(await prisma.attendanceSession.count({ where: { workforceMemberId: ids.kailash, workDate: shift(today, -1) } })).toBe(0);

    // Limits: not tomorrow, not long ago for a supervisor, not someone else's project, not without the permission.
    const one = (workDate: string, projectId = ids.project) => req("/api/attendance/muster", "POST", { projectId, workDate, entries: [{ workerId: ids.ramesh, mark: "PRESENT" }] });
    expect((await saveMuster(one(shift(today, 1)))).status).toBe(422);
    expect((await saveMuster(one(shift(today, -10)))).status).toBe(403);
    expect((await saveMuster(one(today, ids.otherProject))).status).toBe(403);
    as("admin");
    expect((await saveMuster(one(shift(today, -10)))).status).toBe(200);
    await prisma.attendanceSession.deleteMany({ where: { workforceMemberId: ids.ramesh, workDate: shift(today, -10) } });
    as("accounts");
    expect((await saveMuster(one(today))).status).toBe(403);

    // Payroll pays it: Ramesh a full day with 2 hours' overtime, Kailash half a day.
    as("accounts");
    const month = today.slice(0, 7);
    await runPayroll(req("/api/payroll", "POST", { month }));
    const lines = (await json(await getPayroll(req(`/api/payroll?month=${month}`)))).run.lines;
    expect(lines.find((l: any) => l.personId === ids.ramesh)).toMatchObject({ payableDays: 1, overtimeHours: 2, basePay: 800 * R, overtimePay: 200 * R });
    expect(lines.find((l: any) => l.personId === ids.kailash)).toMatchObject({ payableDays: 0.5, basePay: 400 * R });
  });

  it("gathers the quarter's TDS return with challans, late interest and missing PANs", async () => {
    // A full month at work in April 2026, so it is the first quarter of 2026-27.
    for (const d of monthDays("2026-04")) {
      await prisma.staffAttendance.create({ data: { organizationId: orgId, userId: ids.supervisor, workDate: d, checkInAt: new Date(`${d}T09:00:00+05:30`), status: "PRESENT" } });
    }
    as("accounts");
    expect((await setSalary(req(`/api/payroll/salaries/${ids.supervisor}`, "PUT", { monthlySalary: 1_50_000 * R, pan: "ABCDE12" }), { params: { userId: ids.supervisor } })).status).toBe(422);
    await setSalary(req(`/api/payroll/salaries/${ids.supervisor}`, "PUT", { monthlySalary: 1_50_000 * R }), { params: { userId: ids.supervisor } });
    await runPayroll(req("/api/payroll", "POST", { month: "2026-04" }));
    as("admin");
    await approvePayroll(req("/api/payroll/2026-04/approve", "POST", {}), { params: { month: "2026-04" } });

    // TDS paid on 10 May, after the 7 May due date.
    const bill = await prisma.bill.findFirstOrThrow({ where: { organizationId: orgId, billNumber: "TDS-2026-04" } });
    const pay = await prisma.payment.create({
      data: {
        organizationId: orgId,
        partyId: bill.partyId,
        paymentDate: new Date("2026-05-10T11:00:00+05:30"),
        amount: bill.totalAmount,
        method: "NEFT_RTGS",
        referenceNumber: "CIN 0510260001234",
        idempotencyKey: `tds-${stamp}`,
        status: "POSTED",
        createdBy: ids.admin,
      } as any,
    });
    await prisma.paymentAllocation.create({ data: { paymentId: pay.id, billId: bill.id, amount: bill.totalAmount } });

    as("accounts");
    const q1 = await json(await tdsReturn(req("/api/payroll/tds-return?fy=2026-27&quarter=1")));
    expect(q1.months).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(q1.filingDue).toBe("2026-07-31");
    expect(q1.company.tan).toBe("JPRB12345C");
    const april = q1.challans[0];
    expect(april).toMatchObject({ month: "2026-04", tds: 12_567 * R, deposited: 12_567 * R, depositedOn: "2026-05-10", due: "2026-05-07", state: "LATE", reference: "CIN 0510260001234" });
    // 1.5% a month for April and May (deducted 30 April, paid 10 May).
    expect(april.interest).toBe(Math.round(12_567 * R * 0.015 * 2));
    expect(q1.challans[1].state).toBe("NO_DATA");
    expect(q1.deductees).toHaveLength(1);
    expect(q1.deductees[0]).toMatchObject({ name: "Sunil Supervisor", pan: null, section: "192", amountPaid: 1_50_000 * R, tds: 12_567 * R, paidOn: "2026-04-30" });
    expect(q1.problems.join(" ")).toContain("No PAN for Sunil Supervisor");
    expect(q1.problems.join(" ")).toContain("deposited late");
    expect(q1.salaryForYear).toBeNull();

    const sheet = await (await tdsReturn(req("/api/payroll/tds-return?fy=2026-27&quarter=1&format=csv&part=deductees"))).text();
    expect(sheet).toContain("2026-04,Sunil Supervisor,PANNOTAVBL,192,30/04/2026,150000,12567,30/04/2026,Yes");
    expect((await tdsReturn(req("/api/payroll/tds-return?fy=2026-27&quarter=1&format=csv&part=salary"))).status).toBe(400);

    // With a PAN the warning goes; Q4 carries the year's salary.
    await setSalary(req(`/api/payroll/salaries/${ids.supervisor}`, "PUT", { monthlySalary: 1_50_000 * R, pan: "abcde1234f" }), { params: { userId: ids.supervisor } });
    const again = await json(await tdsReturn(req("/api/payroll/tds-return?fy=2026-27&quarter=1")));
    expect(again.deductees[0].pan).toBe("ABCDE1234F");
    expect(again.problems.join(" ")).not.toContain("No PAN");
    const q4 = await json(await tdsReturn(req("/api/payroll/tds-return?fy=2026-27&quarter=4")));
    expect(q4.filingDue).toBe("2027-05-31");
    expect(q4.salaryForYear[0]).toMatchObject({ name: "Sunil Supervisor", pan: "ABCDE1234F", tdsDeducted: 12_567 * R });

    expect((await tdsReturn(req("/api/payroll/tds-return?fy=2026-27&quarter=5"))).status).toBe(400);
    as("supervisor");
    expect((await tdsReturn(req("/api/payroll/tds-return?fy=2026-27&quarter=1"))).status).toBe(403);
  });
});
