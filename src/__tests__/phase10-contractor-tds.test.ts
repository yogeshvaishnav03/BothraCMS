import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { POST as createBill } from "@/app/api/finance/bills/route";
import { POST as pay } from "@/app/api/finance/payments/route";
import { POST as preview } from "@/app/api/finance/payments/tds-preview/route";
import { GET as tdsReturn } from "@/app/api/finance/tds-return/route";
import { GET as exportFile } from "@/app/api/exports/[kind]/route";
import { FinanceService } from "@/services/finance-service";
import { contractorPan, rate194C, work194C } from "@/lib/contractor-tds";
import { istDateKey } from "@/lib/ist-date";
import { fyOf } from "@/lib/income-tax";

const stamp = Date.now();
let orgId = "";
const ids: Record<string, string> = {};

function asAdmin() {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId: ids.admin,
    organizationId: orgId,
    email: "admin@test.local",
    name: "Owner Bothra",
    role: "ORG_ADMIN" as any,
    organizationName: "Phase10 Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

const req = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost:3000${path}`, { method, body: body ? JSON.stringify(body) : undefined });
const R = 100; // ₹1 in paise
const json = async (res: Response) => (await res.json()).data;
let n = 0;
const payTo = (partyId: string, rupees: number, extra: Record<string, unknown> = {}) =>
  pay(
    req("/api/finance/payments", "POST", {
      partyId,
      recipientType: "CONTRACTOR",
      payingAccount: "HDFC current",
      reason: "Running bill",
      paymentDate: new Date().toISOString(),
      amount: rupees * R,
      method: "NEFT_RTGS",
      referenceNumber: `UTR-${stamp}-${++n}`,
      idempotencyKey: `k-${stamp}-${n}`,
      autoApprove: true,
      ...extra,
    })
  );

describe("Phase 10: TDS on contractor payments (194C)", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Phase10 Org ${stamp}`, settingsJson: JSON.stringify({ taxId: "08AAACB1234F1Z5", tan: "JPRB12345C" }) } });
    orgId = org.id;
    ids.admin = (await prisma.user.create({ data: { organizationId: orgId, name: "Owner Bothra", email: `admin-${stamp}@test.local`, passwordHash: "x", role: "ORG_ADMIN" } })).id;
    const party = (name: string, data: Record<string, unknown>) => prisma.party.create({ data: { organizationId: orgId, name, ...data } as any });
    ids.mistri = (await party("Ramlal Mistri", { partyType: "CONTRACTOR", panNumber: "AAAPL1234C" })).id;
    ids.firm = (await party("Shree Shuttering Works", { partyType: "CONTRACTOR", taxIdentifier: "08AABFS1234D1Z9" })).id;
    ids.nopan = (await party("Kalu Plaster Gang", { partyType: "CONTRACTOR" })).id;
    ids.truck = (await party("Marwar Transport", { partyType: "BOTH", panNumber: "AAKPT9876Q" })).id;
    ids.cement = (await party("Ambuja Dealer", { partyType: "VENDOR", panNumber: "AAACA1111B" })).id;
  });

  afterAll(async () => {
    if (orgId) await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  beforeEach(() => vi.restoreAllMocks());

  it("knows the rates, the PAN and the limits", () => {
    expect(rate194C("AAAPL1234C")).toBe(1); // individual
    expect(rate194C("AAAHL1234C")).toBe(1); // HUF
    expect(rate194C("AABFS1234D")).toBe(2); // firm
    expect(rate194C(null)).toBe(20);
    expect(contractorPan({ taxIdentifier: "08AABFS1234D1Z9" })).toBe("AABFS1234D");
    expect(contractorPan({ panNumber: "bad", taxIdentifier: null })).toBeNull();
    expect(work194C({ pan: "AAAPL1234C", base: 30_000 * R, yearBefore: { base: 0, untaxedBase: 0 } }).amount).toBe(0);
    expect(work194C({ pan: "AAAPL1234C", base: 30_001 * R, yearBefore: { base: 0, untaxedBase: 0 } }).amount).toBe(300_01);
  });

  it("holds back TDS when paying contractors and owes it to the government", async () => {
    asAdmin();
    // Small payments: nothing until the year crosses ₹1 lakh.
    let p = (await json(await payTo(ids.mistri, 20_000))).payment;
    expect(p).toMatchObject({ tdsAmount: 0, tdsSection: null, tdsBase: 20_000 * R });
    p = (await json(await payTo(ids.mistri, 25_000))).payment;
    expect(p.tdsAmount).toBe(0);
    // ₹70,000 takes the year to ₹1.15 lakh: 1% on this and the ₹45,000 before it.
    const peek = await json(await preview(req("/api/finance/payments/tds-preview", "POST", { partyId: ids.mistri, amount: 70_000 * R, paymentDate: new Date().toISOString() })));
    expect(peek).toMatchObject({ rate: 1, amount: 1_150 * R, catchUpBase: 45_000 * R, bankAmount: 68_850 * R, pan: "AAAPL1234C" });
    p = (await json(await payTo(ids.mistri, 70_000))).payment;
    expect(p).toMatchObject({ tdsSection: "194C", tdsRate: 1, tdsAmount: 1_150 * R, tdsCatchUp: 45_000 * R });
    // After that, each payment is taxed on its own.
    const later = (await json(await payTo(ids.mistri, 10_000))).payment;
    expect(later).toMatchObject({ tdsAmount: 100 * R, tdsCatchUp: 0 });

    // A firm's bill with GST: TDS at 2% on the amount before GST.
    const bill = await json(
      await createBill(req("/api/finance/bills", "POST", { partyId: ids.firm, billNumber: "SSW/14", billDate: new Date().toISOString(), lines: [{ description: "Shuttering, slab 6", lineTotal: 1_00_000 * R }], gst: { rate: 18 } }))
    );
    expect(bill.totalAmount).toBe(1_18_000 * R);
    p = (await json(await payTo(ids.firm, 1_18_000, { allocations: [{ billId: bill.id, amount: 1_18_000 * R }] }))).payment;
    expect(p).toMatchObject({ tdsRate: 2, tdsBase: 1_00_000 * R, tdsAmount: 2_000 * R });
    // The bill is settled in full; the bank paid less.
    const settled = await prisma.bill.findUniqueOrThrow({ where: { id: bill.id }, include: { allocations: true } });
    expect(settled.allocations.reduce((s, a) => s + a.amount, 0)).toBe(1_18_000 * R);

    // No PAN: 20%.
    p = (await json(await payTo(ids.nopan, 40_000))).payment;
    expect(p).toMatchObject({ tdsRate: 20, tdsAmount: 8_000 * R });
    expect(p.tdsNote).toContain("No PAN");

    // A transporter's declaration: no TDS, but the reason is required.
    expect((await payTo(ids.truck, 50_000, { tds: { mode: "NONE" } })).status).not.toBe(201);
    p = (await json(await payTo(ids.truck, 50_000, { tds: { mode: "NONE", reason: "Transporter declaration, 6 trucks" } }))).payment;
    expect(p).toMatchObject({ tdsAmount: 0, tdsSection: "NONE" });
    // Suppliers are not touched.
    p = (await json(await payTo(ids.cement, 2_00_000, { recipientType: "VENDOR" }))).payment;
    expect(p).toMatchObject({ tdsAmount: 0, tdsSection: null, tdsBase: 0 });

    // The month's TDS is owed to the Income Tax Department as one bill.
    const month = istDateKey().slice(0, 7);
    const owed = () => prisma.bill.findFirst({ where: { organizationId: orgId, billNumber: `TDS194C-${month}` }, include: { party: true } });
    expect(await owed()).toMatchObject({ totalAmount: (1_150 + 100 + 2_000 + 8_000) * R, statutory: "TDS_194C", status: "POSTED" });
    expect((await owed())!.party.name).toContain("Income Tax");

    // Reversing a payment takes its TDS off.
    await FinanceService.reversePayment({ organizationId: orgId, paymentId: later.id, reason: "Paid twice by mistake", userId: ids.admin, role: "ORG_ADMIN" as any });
    expect((await owed())!.totalAmount).toBe((1_150 + 2_000 + 8_000) * R);

    // Tally: the bank pays the net amount, the TDS goes to its own ledger, and the TDS bill is not a purchase.
    const today = istDateKey();
    const xml = await (await exportFile(req(`/api/exports/tally?from=${today}&to=${today}&parts=bills,payments`), { params: { kind: "tally" } })).text();
    expect(xml).toContain('<LEDGER NAME="TDS Payable (194C)" ACTION="Create">');
    expect(xml).toContain("<LEDGERNAME>HDFC current</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>68850.00</AMOUNT>");
    expect(xml).toContain("<LEDGERNAME>TDS Payable (194C)</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>1150.00</AMOUNT>");
    expect(xml).not.toContain(`TDS194C-${month}</VOUCHERNUMBER>`);
    const rows = (await (await exportFile(req(`/api/exports/payments?from=${today}&to=${today}`), { params: { kind: "payments" } })).text()).split("\r\n");
    expect(rows[0]).toContain("Amount,TDS held,From bank");

    // The quarter's 26Q.
    const fy = fyOf(month);
    const q = ([4, 5, 6].includes(Number(month.slice(5))) ? 1 : [7, 8, 9].includes(Number(month.slice(5))) ? 2 : [10, 11, 12].includes(Number(month.slice(5))) ? 3 : 4) as 1 | 2 | 3 | 4;
    const ret = await json(await tdsReturn(req(`/api/finance/tds-return?fy=${fy}&quarter=${q}`)));
    expect(ret.deductees.map((d: any) => [d.name, d.tds / R, d.remark])).toEqual([
      ["Ramlal Mistri", 1_150, ""],
      ["Shree Shuttering Works", 2_000, ""],
      ["Kalu Plaster Gang", 8_000, "C"],
      ["Marwar Transport", 0, "T"],
    ]);
    expect(ret.deductees[0].amountPaid).toBe(1_15_000 * R);
    expect(ret.challans.find((c: any) => c.month === month)).toMatchObject({ tds: 11_150 * R, deposited: 0 });
    expect(ret.problems.join(" ")).toContain("No PAN for Kalu Plaster Gang");
    const sheet = await (await tdsReturn(req(`/api/finance/tds-return?fy=${fy}&quarter=${q}&format=csv&part=deductees`))).text();
    expect(sheet).toContain("Kalu Plaster Gang,PANNOTAVBL,194C");
  });
});
