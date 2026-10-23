import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { POST as addUnits, GET as listUnits } from "@/app/api/sales/units/route";
import { GET as listBookings, POST as book } from "@/app/api/sales/bookings/route";
import { POST as receive } from "@/app/api/sales/installments/[id]/receive/route";
import { PUT as linkStage } from "@/app/api/sales/installments/[id]/stage/route";
import { GET as demandLetter } from "@/app/api/sales/installments/[id]/letter/route";
import { GET as getReceipt } from "@/app/api/sales/receipts/[id]/route";
import { POST as portalLink } from "@/app/api/sales/bookings/[id]/portal/route";
import { POST as cancelBooking } from "@/app/api/sales/bookings/[id]/cancel/route";
import { GET as portalPhoto } from "@/app/api/portal/[token]/photo/[updateId]/[n]/route";
import { POST as postProgress } from "@/app/api/milestones/[id]/progress/route";
import { GET as moneyIn } from "@/app/api/sales/money-in/route";
import { GET as exportFile } from "@/app/api/exports/[kind]/route";
import { GET as exportSummary } from "@/app/api/exports/summary/route";
import { GET as getPayroll, POST as runPayroll } from "@/app/api/payroll/route";
import { PUT as setSalary } from "@/app/api/payroll/salaries/[userId]/route";
import { PUT as payrollSettings } from "@/app/api/payroll/settings/route";
import { PATCH as editLine } from "@/app/api/payroll/lines/[id]/route";
import { POST as approvePayroll } from "@/app/api/payroll/[month]/approve/route";
import { GET as bankFile } from "@/app/api/payroll/[month]/bank-file/route";
import { SalesService, stageKey } from "@/services/sales-service";
import { fetchDayBookData } from "@/services/day-book-service";
import { CommandCenterService } from "@/services/command-center-service";
import { professionalTax, statutory } from "@/services/payroll-service";
import { paiseInWords } from "@/lib/amount-words";
import { istDateKey, monthDays } from "@/lib/ist-date";

const stamp = Date.now();
let orgId = "";
const ids: Record<string, string> = {};
const people = {
  admin: { name: "Owner Bothra", role: "ORG_ADMIN" },
  pm: { name: "Priya PM", role: "PROJECT_MANAGER" },
  accounts: { name: "Anil Accounts", role: "ACCOUNTANT" },
  supervisor: { name: "Ravi Supervisor", role: "SITE_SUPERVISOR" },
  engineer: { name: "Esha Engineer", role: "SITE_SUPERVISOR" },
} as const;
type Who = keyof typeof people;

function as(who: Who) {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId: ids[who],
    organizationId: orgId,
    email: `${who}@test.local`,
    name: people[who].name,
    role: people[who].role as any,
    organizationName: "Phase6 Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

const req = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost:3000${path}`, { method, body: body ? JSON.stringify(body) : undefined });
const p = (id: string) => ({ params: { id } });
const R = 100; // ₹1 in paise
const json = async (res: Response) => (await res.json()).data;
// A 1×1 PNG.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function bookings() {
  return (await json(await listBookings(req("/api/sales/bookings")))).bookings as any[];
}

describe("Phase 6: buyer portal, automatic demands, GST receipts, accounts export and statutory payroll", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `Phase6 Org ${stamp}`, settingsJson: JSON.stringify({ taxId: "08AAACB1234F1Z5", companyAddress: "MI Road, Jaipur", phone: "0141 2222222" }) },
    });
    orgId = org.id;
    for (const who of Object.keys(people) as Who[]) {
      const u = await prisma.user.create({
        data: { organizationId: orgId, name: people[who].name, email: `${who}-${stamp}@test.local`, passwordHash: "x", role: people[who].role, phone: "9829012345" },
      });
      ids[who] = u.id;
    }
    const site = await prisma.site.create({ data: { organizationId: orgId, name: "Vaishali Site", code: `VS-${stamp}`, address: "Jaipur" } });
    const project = await prisma.project.create({ data: { organizationId: orgId, siteId: site.id, code: `GR-${stamp}`, name: "Bothra Greens", managerUserId: ids.pm } });
    ids.project = project.id;
    const other = await prisma.project.create({ data: { organizationId: orgId, siteId: site.id, code: `OT-${stamp}`, name: "Other Tower" } });
    ids.other = other.id;
    const stages = ["Foundation (PCC, footings, columns to plinth)", "Plinth beam & backfilling", "Superstructure (columns, beams, slabs)", "Brickwork & blockwork"];
    for (const [i, name] of stages.entries()) {
      const m = await prisma.projectMilestone.create({ data: { organizationId: orgId, projectId: project.id, name, sortOrder: i, weight: 1, createdBy: ids.admin } });
      ids[`stage${i}`] = m.id;
    }
    const otherStage = await prisma.projectMilestone.create({ data: { organizationId: orgId, projectId: other.id, name: "Foundation", sortOrder: 0, createdBy: ids.admin } });
    ids.otherStage = otherStage.id;
    // A site photo on each project, stored as a database blob.
    for (const [key, milestoneId] of [["photo", ids.stage0], ["otherPhoto", otherStage.id]] as const) {
      const fileId = `p6-${key}-${stamp}.png`;
      await prisma.idempotencyRecord.create({ data: { organizationId: orgId, key: `FILE_BLOB_${fileId}`, operation: "FILE_BLOB", responseCode: 200, responseBodyJson: PNG } });
      const u = await prisma.projectMilestoneUpdate.create({
        data: { milestoneId, userId: ids.supervisor, progressFrom: 0, progressTo: 20, note: "Footings", photoUrls: JSON.stringify([`/api/uploads/${fileId}`]) },
      });
      ids[key] = u.id;
    }
    const vendor = await prisma.party.create({ data: { organizationId: orgId, partyType: "VENDOR", name: "Jaipur Cement & Co", taxIdentifier: "08AABCJ1234K1Z2" } });
    ids.vendor = vendor.id;
  });

  afterAll(async () => {
    if (orgId) await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  beforeEach(() => vi.restoreAllMocks());

  it("matches instalments to construction stages by name", () => {
    expect(stageKey("On foundation")).toBe("foundation");
    expect(stageKey("Foundation (PCC, footings, columns to plinth)")).toBe("foundation");
    expect(stageKey("On plinth")).toBe("plinth");
    expect(stageKey("On each slab (average)")).toBe(stageKey("Superstructure (columns, beams, slabs)"));
    expect(stageKey("On possession")).toBe(stageKey("Snagging & handover"));
    expect(stageKey("Booking amount")).toBeNull();
    expect(paiseInWords(12_34_567_50)).toBe("Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Fifty Paise Only");
  });

  it("books with GST, splits each receipt into price and GST, and numbers receipts", async () => {
    as("pm");
    await addUnits(req("/api/sales/units", "POST", { projectId: ids.project, unitNumbers: ["G-101", "G-102"], unitType: "2BHK", price: 40_00_000 * R }));
    const units = await json(await listUnits(req("/api/sales/units")));
    ids.unit = units.find((u: any) => u.unitNumber === "G-101").id;
    expect(
      (await book(req("/api/sales/bookings", "POST", { unitId: ids.unit, customerName: "Meena Sharma", customerPhone: "9829011111", agreementValue: 40_00_000 * R, plan: "CONSTRUCTION_LINKED", gstRate: 40 }))).status
    ).toBe(422);
    const res = await book(req("/api/sales/bookings", "POST", { unitId: ids.unit, customerName: "Meena Sharma", customerPhone: "9829011111", agreementValue: 40_00_000 * R, plan: "CONSTRUCTION_LINKED", gstRate: 5 }));
    expect(res.status).toBe(201);
    const b = (await bookings())[0];
    ids.booking = b.id;
    expect(b.gstRate).toBe(5);
    expect(b.installments[0]).toMatchObject({ amount: 4_00_000 * R, gstAmount: 20_000 * R, total: 4_20_000 * R });
    expect(b.total).toBe(42_00_000 * R);

    as("accounts");
    const first = b.installments[0];
    expect((await receive(req(`/api/sales/installments/${first.id}/receive`, "POST", { amount: 4_20_001 * R, mode: "UPI" }), p(first.id))).status).toBe(422);
    const r1 = await json(await receive(req(`/api/sales/installments/${first.id}/receive`, "POST", { amount: 2_10_000 * R, mode: "UPI", reference: "UPI111" }), p(first.id)));
    const r2 = await json(await receive(req(`/api/sales/installments/${first.id}/receive`, "POST", { amount: 2_10_000 * R, mode: "NEFT_RTGS", reference: "UTR222" }), p(first.id)));
    expect(r1.receiptNumber).toMatch(/^RC-\d{4}-001$/);
    expect(r2.receiptNumber).toMatch(/^RC-\d{4}-002$/);
    const receipt = await json(await getReceipt(req(`/api/sales/receipts/${r1.receiptId}`), p(r1.receiptId)));
    expect(receipt).toMatchObject({ amount: 2_10_000 * R, gstAmount: 10_000 * R, taxableAmount: 2_00_000 * R });
    expect(receipt.company).toMatchObject({ gstin: "08AAACB1234F1Z5", address: "MI Road, Jaipur" });
    ids.receipt = r1.receiptId;

    const after = (await bookings())[0];
    expect(after.installments[0].receipts.map((r: any) => r.receiptNumber)).toEqual([r1.receiptNumber, r2.receiptNumber]);
    expect(after.received).toBe(4_20_000 * R);

    // Money in shows on the Day Book, the dashboard timeline and for finance.
    const day = await fetchDayBookData(orgId, istDateKey());
    expect(day.summary.totalMoneyInAmount).toBe(4_20_000 * R);
    const overview = await CommandCenterService.getOverview(orgId, istDateKey());
    expect(overview.timeline.filter((t) => t.kind === "MONEY_IN")).toHaveLength(2);
    expect(overview.finance.trend[6].received).toBe(4_20_000 * R);
    const list = await json(await moneyIn(req("/api/sales/money-in")));
    expect(list).toMatchObject({ total: 4_20_000 * R, gst: 20_000 * R });
    as("supervisor");
    expect((await moneyIn(req("/api/sales/money-in"))).status).toBe(403);
  });

  it("raises the buyers' demands when a construction stage reaches 100%", async () => {
    as("pm");
    let b = (await bookings()).find((x) => x.id === ids.booking);
    const plinth = b.installments.find((i: any) => i.label === "On plinth");
    const foundation = b.installments.find((i: any) => i.label === "On foundation");
    expect(foundation.linkedStage).toMatchObject({ id: ids.stage0, explicit: false });
    // The office ties the plinth instalment to brickwork instead.
    expect((await linkStage(req(`/api/sales/installments/${plinth.id}/stage`, "PUT", { milestoneId: ids.otherStage }), p(plinth.id))).status).toBe(422);
    expect((await linkStage(req(`/api/sales/installments/${plinth.id}/stage`, "PUT", { milestoneId: ids.stage3 }), p(plinth.id))).status).toBe(200);

    const done = await postProgress(req(`/api/milestones/${ids.stage0}/progress`, "POST", { progressPercent: 100, note: "Foundation complete" }), p(ids.stage0));
    expect((await json(done)).demandsRaised).toBe(1);
    // Finishing the plinth stage does not touch the re-linked plinth instalment.
    expect((await json(await postProgress(req(`/api/milestones/${ids.stage1}/progress`, "POST", { progressPercent: 100 }), p(ids.stage1)))).demandsRaised).toBe(0);

    b = (await bookings()).find((x) => x.id === ids.booking);
    const f = b.installments.find((i: any) => i.label === "On foundation");
    expect(f.demandAuto).toBe(true);
    expect(f.dueDate > istDateKey()).toBe(true);
    expect(b.installments.find((i: any) => i.label === "On plinth").dueDate).toBeNull();
    const note = await prisma.notification.findFirst({ where: { userId: ids.admin, title: { contains: "demand" } } });
    expect(note?.title).toContain("1 customer demand raised");

    // Brickwork done → the brickwork instalment and the plinth one linked to it.
    expect((await json(await postProgress(req(`/api/milestones/${ids.stage3}/progress`, "POST", { progressPercent: 100 }), p(ids.stage3)))).demandsRaised).toBe(2);
    // Posting 100% again does not raise anything twice.
    expect((await json(await postProgress(req(`/api/milestones/${ids.stage3}/progress`, "POST", { progressPercent: 100, note: "Curing" }), p(ids.stage3)))).demandsRaised).toBe(0);

    const letter = await json(await demandLetter(req(`/api/sales/installments/${f.id}/letter`), p(f.id)));
    expect(letter.installment).toMatchObject({ label: "On foundation", total: f.total, balance: f.total });
    expect(letter.earlierDue).toBe(b.installments[1].total); // the agreement instalment is unpaid
  });

  it("gives the buyer a private page that shows only their booking and their project's photos", async () => {
    as("supervisor");
    expect((await portalLink(req(`/api/sales/bookings/${ids.booking}/portal`, "POST", {}), p(ids.booking))).status).toBe(403);
    as("pm");
    const { path } = await json(await portalLink(req(`/api/sales/bookings/${ids.booking}/portal`, "POST", {}), p(ids.booking)));
    const token = path.split("/").pop()!;
    expect(token.length).toBeGreaterThanOrEqual(30);
    // Asking again gives the same link.
    expect((await json(await portalLink(req(`/api/sales/bookings/${ids.booking}/portal`, "POST", {}), p(ids.booking)))).path).toBe(path);

    const view = await SalesService.portalView(token);
    expect(view).not.toBeNull();
    expect(view!.booking.customerName).toBe("Meena Sharma");
    expect(view!.received).toBe(4_20_000 * R);
    expect(view!.progress).toBe(75); // 3 of 4 equal stages done
    expect(view!.photos.map((ph) => ph.updateId)).toEqual([ids.photo]);
    expect(JSON.stringify(view)).not.toContain("portalToken");
    expect(await SalesService.portalReceipt(token, ids.receipt)).not.toBeNull();

    const ok = await portalPhoto(req(`/api/portal/${token}/photo/${ids.photo}/0`), { params: { token, updateId: ids.photo, n: "0" } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    const foreign = await portalPhoto(req(`/api/portal/${token}/photo/${ids.otherPhoto}/0`), { params: { token, updateId: ids.otherPhoto, n: "0" } });
    expect(foreign.status).toBe(404);
    expect((await portalPhoto(req("/x"), { params: { token: "wrong-token-wrong-token-wrong", updateId: ids.photo, n: "0" } })).status).toBe(404);

    // Resetting the link stops the old one; cancelling the booking stops all.
    const reset = (await json(await portalLink(req(`/api/sales/bookings/${ids.booking}/portal`, "POST", { reset: true }), p(ids.booking)))).path.split("/").pop();
    expect(await SalesService.portalView(token)).toBeNull();
    expect(await SalesService.portalView(reset)).not.toBeNull();
    // A second booking to cancel, so the main one stays for the export test.
    const g102 = (await json(await listUnits(req("/api/sales/units")))).find((u: any) => u.unitNumber === "G-102");
    const second = await json(await book(req("/api/sales/bookings", "POST", { unitId: g102.id, customerName: "Kiran", customerPhone: "9829022222", agreementValue: 10_00_000 * R, plan: "CONSTRUCTION_LINKED" })));
    // Foundation, plinth and brickwork are already done, so this late buyer owes those now; slabs are not.
    const late = (await bookings()).find((x) => x.id === second.id);
    const due = (label: string) => late.installments.find((i: any) => i.label === label);
    for (const label of ["On foundation", "On plinth", "On brickwork"]) expect(due(label)).toMatchObject({ demandAuto: true });
    expect(due("On foundation").dueDate > istDateKey()).toBe(true);
    expect(due("On each slab (average)").dueDate).toBeNull();
    const t2 = (await json(await portalLink(req(`/api/sales/bookings/${second.id}/portal`, "POST", {}), p(second.id)))).path.split("/").pop();
    as("admin");
    expect((await cancelBooking(req(`/api/sales/bookings/${second.id}/cancel`, "POST", { reason: "Changed mind" }), p(second.id))).status).toBe(200);
    expect(await SalesService.portalView(t2)).toBeNull();
  });

  it("exports bills, payments and receipts for Tally and the GST registers", async () => {
    const today = istDateKey();
    await prisma.bill.create({
      data: { organizationId: orgId, partyId: ids.vendor, projectId: ids.project, billNumber: "JC/77", billDate: new Date(), totalAmount: 1_18_000 * R, createdBy: ids.admin },
    });
    await prisma.payment.create({
      data: { organizationId: orgId, partyId: ids.vendor, paymentDate: new Date(), amount: 50_000 * R, method: "NEFT_RTGS", referenceNumber: "PAY-1", status: "POSTED", idempotencyKey: `p6-${stamp}`, payingAccount: "HDFC Current A/c", createdBy: ids.admin },
    });
    const qs = `from=${today}&to=${today}`;

    as("supervisor");
    expect((await exportFile(req(`/api/exports/tally?${qs}`), { params: { kind: "tally" } })).status).toBe(403);

    as("accounts");
    expect((await exportFile(req(`/api/exports/tally?from=${today}&to=2020-01-01`), { params: { kind: "tally" } })).status).toBe(400);
    const summary = await json(await exportSummary(req(`/api/exports/summary?${qs}`)));
    expect(summary).toMatchObject({ bills: { count: 1 }, payments: { count: 1 }, receipts: { count: 2, gst: 20_000 * R } });

    const tally = await exportFile(req(`/api/exports/tally?${qs}`), { params: { kind: "tally" } });
    expect(tally.headers.get("content-type")).toContain("application/xml");
    const xml = await tally.text();
    expect(xml).toContain('<LEDGER NAME="Jaipur Cement &amp; Co" ACTION="Create">');
    expect(xml).toContain("<PARENT>Sundry Creditors</PARENT>");
    expect(xml).toContain('<VOUCHER VCHTYPE="Purchase"');
    // Purchase: material Dr (negative), supplier Cr.
    expect(xml).toContain("<LEDGERNAME>Purchase - Construction Material</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-118000.00</AMOUNT>");
    expect(xml).toContain("<LEDGERNAME>HDFC Current A/c</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>50000.00</AMOUNT>");
    // Each receipt: a Sales invoice with CGST + SGST, and a Receipt.
    expect(xml.match(/VCHTYPE="Sales"/g)).toHaveLength(2);
    expect(xml.match(/VCHTYPE="Receipt"/g)).toHaveLength(2);
    expect(xml).toContain("<LEDGERNAME>Output CGST</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>5000.00</AMOUNT>");
    expect(xml).toContain("<LEDGERNAME>Meena Sharma (G-101)</LEDGERNAME>");

    const onlyReceipts = await (await exportFile(req(`/api/exports/tally?${qs}&parts=receipts`), { params: { kind: "tally" } })).text();
    expect(onlyReceipts).not.toContain('VCHTYPE="Purchase"');

    const gst = await (await exportFile(req(`/api/exports/gst-sales?${qs}`), { params: { kind: "gst-sales" } })).text();
    const rows = gst.replace(/^﻿/, "").split("\r\n");
    expect(rows[0]).toContain("Taxable value");
    expect(rows).toHaveLength(4); // header, 2 receipts, total
    expect(rows[3]).toContain("400000.00");
    const purchases = await (await exportFile(req(`/api/exports/purchases?${qs}`), { params: { kind: "purchases" } })).text();
    expect(purchases).toContain("08AABCJ1234K1Z2");
    expect(await prisma.auditEvent.count({ where: { organizationId: orgId, action: "ACCOUNTS_EXPORTED" } })).toBe(4);
  });

  it("works out PF, ESI and professional tax, takes TDS, and makes the bank transfer file", () => {
    const profile = { pfApplicable: true, esiApplicable: true, monthlySalary: 18_000 * R };
    expect(statutory(profile, { basePay: 18_000 * R, gross: 18_000 * R }, "MAHARASHTRA", "2026-08")).toEqual({
      pfEmployee: 1_800 * R,
      pfEmployer: 1_800 * R,
      esiEmployee: 135 * R,
      esiEmployer: 585 * R,
      professionalTax: 200 * R,
    });
    // PF is capped at the ₹15,000 wage ceiling; ESI stops above ₹21,000.
    expect(statutory({ ...profile, monthlySalary: 40_000 * R }, { basePay: 40_000 * R, gross: 40_000 * R }, "NONE", "2026-08")).toMatchObject({
      pfEmployee: 1_800 * R,
      esiEmployee: 0,
      professionalTax: 0,
    });
    expect(professionalTax("MAHARASHTRA", 18_000 * R, "2027-02")).toBe(300 * R);
    expect(professionalTax("KARNATAKA", 24_000 * R, "2026-08")).toBe(0);
    expect(statutory(null, { basePay: 1, gross: 1 }, "MAHARASHTRA", "2026-08").professionalTax).toBe(0);
  });

  it("applies statutory deductions in a payroll run", async () => {
    const MONTH = "2026-08";
    for (const d of monthDays(MONTH)) {
      await prisma.staffAttendance.create({ data: { organizationId: orgId, userId: ids.engineer, workDate: d, checkInAt: new Date(`${d}T09:00:00+05:30`), status: "PRESENT" } });
    }
    as("accounts");
    expect((await payrollSettings(req("/api/payroll/settings", "PUT", { ptState: "MARS" }))).status).toBe(422);
    expect((await payrollSettings(req("/api/payroll/settings", "PUT", { ptState: "MAHARASHTRA" }))).status).toBe(200);
    expect(
      (await setSalary(req(`/api/payroll/salaries/${ids.engineer}`, "PUT", { monthlySalary: 18_000 * R, pfApplicable: true, esiApplicable: true, uan: "123", bankAccount: "50100012345678", ifsc: "HDFC0001234" }), { params: { userId: ids.engineer } })).status
    ).toBe(422);
    expect(
      (
        await setSalary(
          req(`/api/payroll/salaries/${ids.engineer}`, "PUT", { monthlySalary: 18_000 * R, pfApplicable: true, esiApplicable: true, uan: "100200300400", bankAccount: "50100012345678", ifsc: "HDFC0001234" }),
          { params: { userId: ids.engineer } }
        )
      ).status
    ).toBe(200);
    expect((await runPayroll(req("/api/payroll", "POST", { month: MONTH }))).status).toBe(201);
    let run = (await json(await getPayroll(req(`/api/payroll?month=${MONTH}`)))).run;
    let line = run.lines.find((l: any) => l.personId === ids.engineer);
    expect(line).toMatchObject({ gross: 18_000 * R, pfEmployee: 1_800 * R, esiEmployee: 135 * R, professionalTax: 200 * R, net: 15_865 * R });
    expect(run.statutory).toMatchObject({ pfEmployer: 1_800 * R, esiEmployer: 585 * R });

    const edited = await json(await editLine(req(`/api/payroll/lines/${line.id}`, "PATCH", { tds: 500 * R }), p(line.id)));
    line = edited.run.lines.find((l: any) => l.personId === ids.engineer);
    expect(line).toMatchObject({ tds: 500 * R, net: 15_365 * R });
    // A refresh keeps the TDS typed in.
    await runPayroll(req("/api/payroll", "POST", { month: MONTH }));
    run = (await json(await getPayroll(req(`/api/payroll?month=${MONTH}`)))).run;
    expect(run.lines.find((l: any) => l.personId === ids.engineer).net).toBe(15_365 * R);

    expect((await bankFile(req(`/api/payroll/${MONTH}/bank-file`), { params: { month: MONTH } })).status).toBe(409);
    as("admin");
    await approvePayroll(req(`/api/payroll/${MONTH}/approve`, "POST", {}), { params: { month: MONTH } });
    const file = await (await bankFile(req(`/api/payroll/${MONTH}/bank-file`), { params: { month: MONTH } })).text();
    expect(file).toContain("Esha Engineer,'50100012345678,HDFC0001234,15365.00,Salary 2026-08");
    as("supervisor");
    expect((await bankFile(req(`/api/payroll/${MONTH}/bank-file`), { params: { month: MONTH } })).status).toBe(403);
  });
});
