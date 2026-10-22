import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { POST as createBill } from "@/app/api/finance/bills/route";
import { GET as exportFile } from "@/app/api/exports/[kind]/route";
import { POST as addUnits, GET as listUnits } from "@/app/api/sales/units/route";
import { GET as listBookings, POST as book } from "@/app/api/sales/bookings/route";
import { POST as receive } from "@/app/api/sales/installments/[id]/receive/route";
import { GET as getReceipt } from "@/app/api/sales/receipts/[id]/route";
import { POST as cancelReceipt } from "@/app/api/sales/receipts/[id]/cancel/route";
import { POST as portalLink } from "@/app/api/sales/bookings/[id]/portal/route";
import { GET as moneyIn } from "@/app/api/sales/money-in/route";
import { GET as getPayroll, POST as runPayroll } from "@/app/api/payroll/route";
import { GET as salaries } from "@/app/api/payroll/salaries/route";
import { PUT as saveWorker } from "@/app/api/payroll/workers/[id]/route";
import { PUT as payrollSettings } from "@/app/api/payroll/settings/route";
import { POST as approvePayroll } from "@/app/api/payroll/[month]/approve/route";
import { GET as statutoryFile } from "@/app/api/payroll/[month]/statutory-file/route";
import { GET as bankFile } from "@/app/api/payroll/[month]/bank-file/route";
import { billGst } from "@/services/finance-service";
import { SalesService } from "@/services/sales-service";
import { gstStateCode } from "@/lib/company";
import { istDateKey, monthDays } from "@/lib/ist-date";

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
    organizationName: "Phase7 Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

const req = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost:3000${path}`, { method, body: body ? JSON.stringify(body) : undefined });
const p = (id: string) => ({ params: { id } });
const R = 100; // ₹1 in paise
const json = async (res: Response) => (await res.json()).data;
const MONTH = "2026-08";

describe("Phase 7: GST on supplier bills, PF and ESI for site workers, receipt cancellation", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Phase7 Org ${stamp}`, settingsJson: JSON.stringify({ taxId: "08AAACB1234F1Z5" }) } });
    orgId = org.id;
    for (const who of Object.keys(people) as Who[]) {
      const u = await prisma.user.create({ data: { organizationId: orgId, name: people[who].name, email: `${who}-${stamp}@test.local`, passwordHash: "x", role: people[who].role } });
      ids[who] = u.id;
    }
    const site = await prisma.site.create({ data: { organizationId: orgId, name: "Mansarovar Site", code: `MS-${stamp}`, address: "Jaipur" } });
    ids.site = site.id;
    const project = await prisma.project.create({ data: { organizationId: orgId, siteId: site.id, code: `MS-${stamp}`, name: "Bothra Heights", managerUserId: ids.pm } });
    ids.project = project.id;
    const parties = [
      ["local", "Jaipur Steel Traders", "08AABCJ1234K1Z2"],
      ["outside", "Mumbai Lifts Pvt Ltd", "27AABCM5678L1Z9"],
      ["plain", "Kishan Sand Supplier", null],
    ] as const;
    for (const [key, name, gstin] of parties) {
      ids[key] = (await prisma.party.create({ data: { organizationId: orgId, partyType: "VENDOR", name, taxIdentifier: gstin } })).id;
    }
    // Two site workers on PF and ESI, 20 days each in August. Shyam has no UAN yet.
    for (const [key, name, code] of [
      ["ramu", "Ramu Prajapat", "W-1"],
      ["shyam", "Shyam Lal", "W-2"],
    ] as const) {
      const m = await prisma.workforceMember.create({ data: { organizationId: orgId, employeeCode: `${code}-${stamp}`, name, workerType: "MASON", dailyWageRate: 600 * R, defaultSiteId: site.id } });
      ids[key] = m.id;
      for (const d of monthDays(MONTH).slice(0, 20)) {
        await prisma.attendanceSession.create({
          data: { organizationId: orgId, workforceMemberId: m.id, siteId: site.id, projectId: project.id, workDate: d, checkInAt: new Date(`${d}T09:00:00+05:30`), checkOutAt: new Date(`${d}T17:00:00+05:30`), status: "PRESENT", createdBy: ids.supervisor },
        });
      }
    }
  });

  afterAll(async () => {
    if (orgId) await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  beforeEach(() => vi.restoreAllMocks());

  it("splits supplier GST into CGST + SGST, or IGST for a supplier in another state", () => {
    expect(billGst(1_00_000 * R, 18, false)).toEqual({ cgst: 9_000 * R, sgst: 9_000 * R, igst: 0, tax: 18_000 * R });
    expect(billGst(1_00_000 * R, 18, true)).toEqual({ cgst: 0, sgst: 0, igst: 18_000 * R, tax: 18_000 * R });
    // An odd paisa goes to SGST so the halves add up.
    expect(billGst(101, 5, false)).toEqual({ cgst: 2, sgst: 3, igst: 0, tax: 5 });
    expect(gstStateCode("27AABCM5678L1Z9")).toBe("27");
    expect(gstStateCode("ABCDE1234F")).toBeNull();
  });

  it("adds GST to supplier bills and carries it into Tally and the purchase register", async () => {
    as("accounts");
    const bill = (party: string, billNumber: string, amount: number, gst?: unknown) =>
      createBill(req("/api/finance/bills", "POST", { partyId: ids[party], billNumber, billDate: new Date().toISOString(), lines: [{ description: "Supply", lineTotal: amount }], gst }));

    const local = await bill("local", "JST/1", 1_00_000 * R, { rate: 18 });
    expect(local.status).toBe(201);
    expect(await json(local)).toMatchObject({ totalAmount: 1_18_000 * R, taxableAmount: 1_00_000 * R, cgst: 9_000 * R, sgst: 9_000 * R, igst: 0, gstRate: 18 });
    // The supplier's GSTIN starts 27 (Maharashtra), ours 08 (Rajasthan): IGST.
    expect(await json(await bill("outside", "ML/9", 2_00_000 * R, { rate: 18 }))).toMatchObject({ totalAmount: 2_36_000 * R, igst: 36_000 * R, cgst: 0 });
    // No input credit claimed: the tax becomes part of the cost.
    expect(await json(await bill("local", "JST/2", 10_000 * R, { rate: 5, interState: false, itcEligible: false }))).toMatchObject({ totalAmount: 10_500 * R, itcEligible: false });
    // A bill with no GST is unchanged.
    expect(await json(await bill("plain", "KS/5", 20_000 * R))).toMatchObject({ totalAmount: 20_000 * R, gstRate: null, cgst: 0 });
    expect((await bill("local", "JST/3", 1_000 * R, { rate: 7 })).status).not.toBe(201);

    const today = istDateKey();
    const xml = await (await exportFile(req(`/api/exports/tally?from=${today}&to=${today}&parts=bills`), { params: { kind: "tally" } })).text();
    expect(xml).toContain('<LEDGER NAME="Input CGST" ACTION="Create">');
    expect(xml).toContain('<LEDGER NAME="Input IGST" ACTION="Create">');
    expect(xml).toContain("<LEDGERNAME>Input CGST</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-9000.00</AMOUNT>");
    expect(xml).toContain("<LEDGERNAME>Input IGST</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-36000.00</AMOUNT>");
    expect(xml).toContain("<LEDGERNAME>Jaipur Steel Traders</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>118000.00</AMOUNT>");
    // The expense gets only the taxable value when credit is claimed, and the whole bill when not.
    expect(xml).toMatch(/<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-100000.00<\/AMOUNT>/);
    expect(xml).toMatch(/<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-10500.00<\/AMOUNT>/);

    const csv = (await (await exportFile(req(`/api/exports/purchases?from=${today}&to=${today}`), { params: { kind: "purchases" } })).text()).replace(/^﻿/, "");
    const rows = csv.split("\r\n");
    expect(rows[0]).toContain("Taxable value,GST rate %,CGST,SGST,IGST,ITC,Reverse charge,Bill amount");
    expect(rows.find((r) => r.includes("JST/1"))).toContain("100000.00,18,9000.00,9000.00,0.00,Yes,,118000.00");
    expect(rows.find((r) => r.includes("ML/9"))).toContain("200000.00,18,0.00,0.00,36000.00,Yes,,236000.00");
    expect(rows.find((r) => r.includes("JST/2"))).toContain(",No,,10500.00");
    expect(rows[rows.length - 1]).toContain("330000.00,,9250.00,9250.00,36000.00,,,384500.00");
  });

  it("takes PF and ESI from site workers and makes the PF ECR and ESI files", async () => {
    as("supervisor");
    expect((await saveWorker(req(`/api/payroll/workers/${ids.ramu}`, "PUT", { pfApplicable: true }), p(ids.ramu))).status).toBe(403);
    as("accounts");
    expect((await saveWorker(req(`/api/payroll/workers/${ids.ramu}`, "PUT", { pfApplicable: true, uan: "12" }), p(ids.ramu))).status).toBe(422);
    const saved = await json(
      await saveWorker(
        req(`/api/payroll/workers/${ids.ramu}`, "PUT", { pfApplicable: true, esiApplicable: true, uan: "100900800700", esicNumber: "3100123456", bankAccount: "1234567890", ifsc: "sbin0001234" }),
        p(ids.ramu)
      )
    );
    const ramu = saved.workers.find((w: any) => w.id === ids.ramu);
    expect(ramu).toMatchObject({ pfApplicable: true, uan: "100900800700", ifsc: "SBIN0001234", bankAccountMasked: "••••7890" });
    expect(ramu.bankAccount).toBeUndefined();
    await saveWorker(req(`/api/payroll/workers/${ids.shyam}`, "PUT", { pfApplicable: true, esiApplicable: true }), p(ids.shyam));
    expect((await json(await salaries(req("/api/payroll/salaries")))).workers).toHaveLength(2);

    // Professional tax is set for the state but never cut from daily wages.
    await payrollSettings(req("/api/payroll/settings", "PUT", { ptState: "MAHARASHTRA" }));
    await runPayroll(req("/api/payroll", "POST", { month: MONTH }));
    const d = await json(await getPayroll(req(`/api/payroll?month=${MONTH}`)));
    const line = d.run.lines.find((l: any) => l.personId === ids.ramu);
    // 20 days × ₹600 = ₹12,000: PF 12% = ₹1,440, ESI 0.75% = ₹90 (employer 3.25% = ₹390).
    expect(line).toMatchObject({ gross: 12_000 * R, pfEmployee: 1_440 * R, pfEmployer: 1_440 * R, esiEmployee: 90 * R, esiEmployer: 390 * R, professionalTax: 0, net: 10_470 * R });
    expect(d.gaps).toEqual({ pf: ["Shyam Lal"], esi: ["Shyam Lal"] });

    expect((await statutoryFile(req(`/api/payroll/${MONTH}/statutory-file?kind=pf-ecr`), { params: { month: MONTH } })).status).toBe(409);
    as("admin");
    await approvePayroll(req(`/api/payroll/${MONTH}/approve`, "POST", {}), { params: { month: MONTH } });
    expect((await statutoryFile(req(`/api/payroll/${MONTH}/statutory-file?kind=form16`), { params: { month: MONTH } })).status).toBe(400);
    const ecr = await statutoryFile(req(`/api/payroll/${MONTH}/statutory-file?kind=pf-ecr`), { params: { month: MONTH } });
    expect(ecr.headers.get("content-disposition")).toContain(`pf-ecr_${MONTH}.txt`);
    // UAN, name, gross, EPF/EPS/EDLI wages, EE 12%, EPS 8.33%, difference, NCP days (26 − 20), refund.
    expect(await ecr.text()).toBe("100900800700#~#RAMU PRAJAPAT#~#12000#~#12000#~#12000#~#12000#~#1440#~#1000#~#440#~#6#~#0");
    const esi = (await (await statutoryFile(req(`/api/payroll/${MONTH}/statutory-file?kind=esi`), { params: { month: MONTH } })).text()).split("\r\n");
    expect(esi[0]).toContain("IP Number,IP Name");
    expect(esi.slice(1)).toEqual(["3100123456,Ramu Prajapat,20,12000,,"]);
    // Site workers' bank details now go in the salary transfer file too.
    expect(await (await bankFile(req(`/api/payroll/${MONTH}/bank-file`), { params: { month: MONTH } })).text()).toContain("Ramu Prajapat,'1234567890,SBIN0001234,10470.00,Wages 2026-08");
    expect(await prisma.auditEvent.count({ where: { organizationId: orgId, action: "PAYROLL_STATUTORY_FILE" } })).toBe(2);
  });

  it("cancels a customer receipt: money back on the instalment, out of the registers, kept on record", async () => {
    as("pm");
    await addUnits(req("/api/sales/units", "POST", { projectId: ids.project, unitNumbers: ["H-201"], unitType: "2BHK", price: 10_00_000 * R }));
    const unit = (await json(await listUnits(req("/api/sales/units")))).find((u: any) => u.unitNumber === "H-201");
    await book(req("/api/sales/bookings", "POST", { unitId: unit.id, customerName: "Kavita Jain", customerPhone: "9829033333", agreementValue: 10_00_000 * R, plan: "DOWN_PAYMENT", gstRate: 5 }));
    let b = (await json(await listBookings(req("/api/sales/bookings")))).bookings[0];
    as("accounts");
    let last = "";
    for (const i of b.installments) last = (await json(await receive(req(`/api/sales/installments/${i.id}/receive`, "POST", { amount: i.total, mode: "CHEQUE", reference: "CHQ" }), p(i.id)))).receiptId;
    expect((await prisma.salesUnit.findUnique({ where: { id: unit.id } }))!.status).toBe("SOLD");
    const today = istDateKey();
    expect((await json(await moneyIn(req(`/api/sales/money-in?from=${today}&to=${today}`)))).receipts).toHaveLength(3);

    // Only an admin can cancel, and has to say why.
    expect((await cancelReceipt(req(`/api/sales/receipts/${last}/cancel`, "POST", { reason: "Cheque bounced" }), p(last))).status).toBe(403);
    as("admin");
    expect((await cancelReceipt(req(`/api/sales/receipts/${last}/cancel`, "POST", { reason: "" }), p(last))).status).toBe(422);
    expect((await cancelReceipt(req(`/api/sales/receipts/${last}/cancel`, "POST", { reason: "Cheque bounced" }), p(last))).status).toBe(200);
    expect((await cancelReceipt(req(`/api/sales/receipts/${last}/cancel`, "POST", { reason: "Again" }), p(last))).status).toBe(409);

    b = (await json(await listBookings(req("/api/sales/bookings")))).bookings[0];
    const possession = b.installments[2];
    expect(possession.receivedAmount).toBe(0);
    expect(possession.receipts[0]).toMatchObject({ id: last, cancelReason: "Cheque bounced" });
    expect(b.balance).toBe(1_05_000 * R);
    expect((await prisma.salesUnit.findUnique({ where: { id: unit.id } }))!.status).toBe("BOOKED");
    expect((await json(await getReceipt(req(`/api/sales/receipts/${last}`), p(last)))).cancelledAt).toBeTruthy();

    // Gone from money in, the GST sales register and the buyer's page.
    expect((await json(await moneyIn(req(`/api/sales/money-in?from=${today}&to=${today}`)))).receipts).toHaveLength(2);
    const gst = (await (await exportFile(req(`/api/exports/gst-sales?from=${today}&to=${today}`), { params: { kind: "gst-sales" } })).text()).split("\r\n");
    expect(gst).toHaveLength(4); // header, 2 receipts, total
    const token = (await json(await portalLink(req(`/api/sales/bookings/${b.id}/portal`, "POST", {}), p(b.id)))).path.split("/").pop();
    const view = await SalesService.portalView(token);
    expect(view!.received).toBe(9_45_000 * R);
    expect(view!.installments[2].receipts).toHaveLength(0);
    expect(await SalesService.portalReceipt(token, last)).toBeNull();
    expect(await prisma.auditEvent.count({ where: { organizationId: orgId, action: "SALES_RECEIPT_CANCELLED" } })).toBe(1);
  });
});
