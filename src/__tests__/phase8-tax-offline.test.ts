import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { POST as createBill } from "@/app/api/finance/bills/route";
import { GET as exportFile } from "@/app/api/exports/[kind]/route";
import { GET as getPayroll, POST as runPayroll } from "@/app/api/payroll/route";
import { PUT as setSalary } from "@/app/api/payroll/salaries/[userId]/route";
import { PATCH as editLine } from "@/app/api/payroll/lines/[id]/route";
import { POST as approvePayroll } from "@/app/api/payroll/[month]/approve/route";
import { GET as taxStatement } from "@/app/api/payroll/tax/[userId]/route";
import { POST as staffAttendance } from "@/app/api/staff-attendance/route";
import { annualTax, fyMonths, fyOf, isFy, monthlyTds, monthsLeftInFy } from "@/lib/income-tax";
import { istDateKey, monthDays } from "@/lib/ist-date";

const stamp = Date.now();
let orgId = "";
const ids: Record<string, string> = {};
const people = {
  admin: { name: "Owner Bothra", role: "ORG_ADMIN" },
  accounts: { name: "Anil Accounts", role: "ACCOUNTANT" },
  engineer: { name: "Esha Engineer", role: "SITE_SUPERVISOR" },
  other: { name: "Om Supervisor", role: "SITE_SUPERVISOR" },
} as const;
type Who = keyof typeof people;

function as(who: Who) {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId: ids[who],
    organizationId: orgId,
    email: `${who}@test.local`,
    name: people[who].name,
    role: people[who].role as any,
    organizationName: "Phase8 Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

const req = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost:3000${path}`, { method, body: body ? JSON.stringify(body) : undefined });
const p = (id: string) => ({ params: { id } });
const R = 100; // ₹1 in paise
const json = async (res: Response) => (await res.json()).data;

async function presentAllMonth(userId: string, month: string) {
  for (const d of monthDays(month)) {
    await prisma.staffAttendance.create({ data: { organizationId: orgId, userId, workDate: d, checkInAt: new Date(`${d}T09:00:00+05:30`), status: "PRESENT" } });
  }
}

describe("Phase 8: TDS on salary, statutory payables, GST per bill line, offline check-in", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Phase8 Org ${stamp}`, settingsJson: JSON.stringify({ taxId: "08AAACB1234F1Z5" }) } });
    orgId = org.id;
    for (const who of Object.keys(people) as Who[]) {
      const u = await prisma.user.create({ data: { organizationId: orgId, name: people[who].name, email: `${who}-${stamp}@test.local`, passwordHash: "x", role: people[who].role } });
      ids[who] = u.id;
    }
    ids.vendor = (await prisma.party.create({ data: { organizationId: orgId, partyType: "VENDOR", name: "Shree Ram Traders", taxIdentifier: "08AABCS1234K1Z2" } })).id;
    ids.transport = (await prisma.party.create({ data: { organizationId: orgId, partyType: "VENDOR", name: "Marudhar Roadways" } })).id;
  });

  afterAll(async () => {
    if (orgId) await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  beforeEach(() => vi.restoreAllMocks());

  it("works out income tax under the new and old regimes", () => {
    // New regime: nothing up to ₹12 lakh, marginal relief just above it.
    expect(annualTax(12_00_000 * R, "NEW").total).toBe(0);
    expect(annualTax(12_50_000 * R, "NEW")).toMatchObject({ slabTax: 67_500 * R, rebate: 17_500 * R, cess: 2_000 * R, total: 52_000 * R });
    expect(annualTax(20_00_000 * R, "NEW").total).toBe(2_08_000 * R);
    // Old regime: 5% from ₹2.5 lakh, 20% from ₹5 lakh, rebate up to ₹5 lakh.
    expect(annualTax(5_00_000 * R, "OLD").total).toBe(0);
    expect(annualTax(10_00_000 * R, "OLD").total).toBe(1_17_000 * R);
    // Surcharge above ₹50 lakh.
    expect(annualTax(60_00_000 * R, "NEW").surcharge).toBeGreaterThan(0);

    expect(fyOf("2027-02")).toBe("2026-27");
    expect(fyOf("2026-04")).toBe("2026-27");
    expect(fyMonths("2026-27")[0]).toBe("2026-04");
    expect(fyMonths("2026-27")[11]).toBe("2027-03");
    expect(monthsLeftInFy("2026-10")).toBe(6);
    expect(isFy("2026-27")).toBe(true);
    expect(isFy("2026-28")).toBe(false);

    // ₹1.5 lakh a month from April: ₹18 lakh − ₹75,000 = ₹17.25 lakh taxable, ₹1,50,800 for the year.
    const t = monthlyTds({ regime: "NEW", declared: 0, earlier: { gross: 0, pf: 0, pt: 0, tds: 0 }, month: { gross: 1_50_000 * R, pf: 0, pt: 0 }, monthsLeft: 12 });
    expect(t.year.total).toBe(1_50_800 * R);
    expect(t.tds).toBe(12_567 * R);
    // Old regime with ₹1.5 lakh of PF and ₹50,000 declared pays more here.
    const old = monthlyTds({ regime: "OLD", declared: 50_000 * R, earlier: { gross: 0, pf: 0, pt: 0, tds: 0 }, month: { gross: 1_50_000 * R, pf: 12_500 * R, pt: 200 * R }, monthsLeft: 12 });
    expect(old.year.deductions).toBe((50_000 + 2_400 + 1_50_000 + 50_000) * R);
  });

  it("deducts TDS automatically, keeps a typed-in TDS, and shows the year's tax statement", async () => {
    await presentAllMonth(ids.engineer, "2026-04");
    await presentAllMonth(ids.engineer, "2026-05");
    as("accounts");
    await setSalary(req(`/api/payroll/salaries/${ids.engineer}`, "PUT", { monthlySalary: 1_50_000 * R, taxRegime: "NEW" }), { params: { userId: ids.engineer } });
    expect((await setSalary(req(`/api/payroll/salaries/${ids.engineer}`, "PUT", { monthlySalary: 1_50_000 * R, taxRegime: "FLAT" }), { params: { userId: ids.engineer } })).status).toBe(422);

    await runPayroll(req("/api/payroll", "POST", { month: "2026-04" }));
    let line = (await json(await getPayroll(req("/api/payroll?month=2026-04")))).run.lines.find((l: any) => l.personId === ids.engineer);
    expect(line).toMatchObject({ gross: 1_50_000 * R, tds: 12_567 * R, tdsManual: false, net: (1_50_000 - 12_567) * R });

    // Approving puts the TDS in Finance as a bill owed, due on the 7th.
    as("admin");
    await approvePayroll(req("/api/payroll/2026-04/approve", "POST", {}), { params: { month: "2026-04" } });
    const tdsBill = await prisma.bill.findFirst({ where: { organizationId: orgId, billNumber: "TDS-2026-04" }, include: { party: true } });
    expect(tdsBill).toMatchObject({ totalAmount: 12_567 * R, status: "POSTED" });
    expect(tdsBill!.party.name).toContain("Income Tax");
    expect(istDateKey(tdsBill!.dueDate!)).toBe("2026-05-07");
    expect(await prisma.bill.count({ where: { organizationId: orgId, billNumber: { startsWith: "PF-" } } })).toBe(0);

    // May: the year so far is counted, so the TDS stays level.
    as("accounts");
    await runPayroll(req("/api/payroll", "POST", { month: "2026-05" }));
    line = (await json(await getPayroll(req("/api/payroll?month=2026-05")))).run.lines.find((l: any) => l.personId === ids.engineer);
    expect(line.tds).toBe(12_567 * R);
    // Typed in by hand, it is kept on refresh; null goes back to working it out.
    await editLine(req(`/api/payroll/lines/${line.id}`, "PATCH", { tds: 20_000 * R }), p(line.id));
    await runPayroll(req("/api/payroll", "POST", { month: "2026-05" }));
    line = (await json(await getPayroll(req("/api/payroll?month=2026-05")))).run.lines.find((l: any) => l.personId === ids.engineer);
    expect(line).toMatchObject({ tds: 20_000 * R, tdsManual: true });
    // A bonus with automatic TDS raises the tax.
    const back = await json(await editLine(req(`/api/payroll/lines/${line.id}`, "PATCH", { tds: null, bonus: 50_000 * R }), p(line.id)));
    line = back.run.lines.find((l: any) => l.personId === ids.engineer);
    expect(line.tdsManual).toBe(false);
    expect(line.tds).toBeGreaterThan(12_567 * R);

    const st = await json(await taxStatement(req(`/api/payroll/tax/${ids.engineer}?fy=2026-27`), { params: { userId: ids.engineer } }));
    expect(st.rows).toHaveLength(12);
    expect(st.monthsPaid).toBe(2);
    expect(st.totals.gross).toBe(3_50_000 * R);
    expect(st.totals.tds).toBe(12_567 * R + line.tds);
    expect(st.projected.gross).toBe((1_50_000 + 2_00_000 * 11) * R);
    expect((await taxStatement(req(`/api/payroll/tax/${ids.engineer}?fy=2026`), { params: { userId: ids.engineer } })).status).toBe(400);

    // Staff can see their own statement, but not someone else's.
    as("engineer");
    expect((await taxStatement(req(`/api/payroll/tax/${ids.engineer}`), { params: { userId: ids.engineer } })).status).toBe(200);
    as("other");
    expect((await taxStatement(req(`/api/payroll/tax/${ids.engineer}`), { params: { userId: ids.engineer } })).status).toBe(403);
  });

  it("charges GST line by line and handles reverse charge", async () => {
    as("accounts");
    const bill = (party: string, billNumber: string, lines: unknown[], gst: unknown) =>
      createBill(req("/api/finance/bills", "POST", { partyId: ids[party], billNumber, billDate: new Date().toISOString(), lines, gst }));

    // Sand at 5% and steel at 18% on one bill.
    const mixed = await bill("vendor", "SRT/1", [{ description: "River sand", lineTotal: 10_000 * R, gstRate: 5 }, { description: "TMT steel", lineTotal: 20_000 * R }], { rate: 18 });
    expect(mixed.status).toBe(201);
    expect(await json(mixed)).toMatchObject({ taxableAmount: 30_000 * R, cgst: 2_050 * R, sgst: 2_050 * R, totalAmount: 34_100 * R, gstRate: 18 });
    const lines = await prisma.billLine.findMany({ where: { bill: { billNumber: "SRT/1", organizationId: orgId } }, orderBy: { lineTotal: "asc" } });
    expect(lines.map((l) => [l.gstRate, l.taxAmount])).toEqual([
      [5, 500 * R],
      [18, 3_600 * R],
    ]);
    expect((await bill("vendor", "SRT/2", [{ description: "Sand", lineTotal: 1_000 * R }], { interState: false })).status).not.toBe(201);

    // Transport under reverse charge: the transporter is paid ₹50,000, and we owe the 5% GST.
    const rcm = await json(await bill("transport", "MR/88", [{ description: "Freight, Kishangarh to site", lineTotal: 50_000 * R }], { rate: 5, interState: false, reverseCharge: true }));
    expect(rcm).toMatchObject({ totalAmount: 50_000 * R, cgst: 1_250 * R, sgst: 1_250 * R, reverseCharge: true });

    const today = istDateKey();
    const xml = await (await exportFile(req(`/api/exports/tally?from=${today}&to=${today}&parts=bills`), { params: { kind: "tally" } })).text();
    expect(xml).toContain('<LEDGER NAME="CGST Payable (RCM)" ACTION="Create">');
    expect(xml).toContain("<LEDGERNAME>CGST Payable (RCM)</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>1250.00</AMOUNT>");
    expect(xml).toContain("<LEDGERNAME>Input CGST</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-1250.00</AMOUNT>");
    expect(xml).toContain("<LEDGERNAME>Marudhar Roadways</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>50000.00</AMOUNT>");

    const rows = (await (await exportFile(req(`/api/exports/purchases?from=${today}&to=${today}`), { params: { kind: "purchases" } })).text()).split("\r\n");
    expect(rows[0]).toContain("ITC,Reverse charge,Bill amount");
    expect(rows.find((r) => r.includes("SRT/1"))).toContain("30000.00,5/18,2050.00,2050.00,0.00,Yes,,34100.00");
    expect(rows.find((r) => r.includes("MR/88"))).toContain("50000.00,5,1250.00,1250.00,0.00,Yes,Yes,50000.00");
  });

  it("records a check-in sent late from a phone with no signal at the time it was made", async () => {
    as("other");
    const at = new Date(Date.now() - 2 * 3600_000);
    if (istDateKey(at) !== istDateKey()) return; // just after midnight IST the earlier time is yesterday
    expect((await staffAttendance(req("/api/staff-attendance", "POST", { action: "check-in", at: new Date(Date.now() - 2 * 86400_000).toISOString() }))).status).toBe(422);
    const res = await staffAttendance(req("/api/staff-attendance", "POST", { action: "check-in", at: at.toISOString() }));
    expect(res.status).toBe(201);
    const row = await json(res);
    expect(new Date(row.checkInAt).getTime()).toBe(at.getTime());
    expect(row.checkInNote).toContain("no signal");
    // The reply was lost and the phone sends the same check-in again: still one check-in, no error.
    const again = await staffAttendance(req("/api/staff-attendance", "POST", { action: "check-in", at: at.toISOString() }));
    expect(again.status).toBe(201);
    expect((await json(again)).id).toBe(row.id);
    // A second, different press is still refused.
    expect((await staffAttendance(req("/api/staff-attendance", "POST", { action: "check-in" }))).status).toBe(409);
  });
});
