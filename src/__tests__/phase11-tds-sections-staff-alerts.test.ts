import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { POST as pay } from "@/app/api/finance/payments/route";
import { POST as preview } from "@/app/api/finance/payments/tds-preview/route";
import { GET as tdsReturn } from "@/app/api/finance/tds-return/route";
import { GET as exportFile } from "@/app/api/exports/[kind]/route";
import { partySection, TDS_SECTIONS, workTds } from "@/lib/contractor-tds";
import { partyProfileSchema } from "@/lib/party-profile";
import { isQuietHour, oneLine, sendOverdueTaskDigest, sendStaffAlerts } from "@/services/staff-alerts";
import { istDateKey } from "@/lib/ist-date";
import { fyOf } from "@/lib/income-tax";

const stamp = Date.now();
const tail = String(stamp).slice(-6);
const R = 100;
const ids: Record<string, string> = {};
let orgId = "";
let liveOrgId = "";

const req = (path: string, method = "GET", body?: unknown) => new NextRequest(`http://localhost:3000${path}`, { method, body: body ? JSON.stringify(body) : undefined });
const json = async (res: Response) => (await res.json()).data;

function asAdmin(organizationId: string, userId: string) {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId,
    organizationId,
    email: "owner@test.local",
    name: "Owner Bothra",
    role: "ORG_ADMIN" as any,
    organizationName: "Phase11 Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

let n = 0;
const payTo = (partyId: string, rupees: number, extra: Record<string, unknown> = {}) =>
  pay(
    req("/api/finance/payments", "POST", {
      partyId,
      recipientType: "VENDOR",
      payingAccount: "HDFC current",
      reason: "Monthly bill",
      paymentDate: new Date().toISOString(),
      amount: rupees * R,
      method: "NEFT_RTGS",
      referenceNumber: `UTR11-${stamp}-${++n}`,
      idempotencyKey: `k11-${stamp}-${n}`,
      autoApprove: true,
      ...extra,
    })
  );

// Mid-morning in India today, so quiet hours never get in the way.
const noonIst = () => new Date(Date.parse(`${istDateKey()}T06:30:00Z`));

describe("Phase 11: TDS on fees (194J) and rent (194I)", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Phase11 Org ${stamp}`, settingsJson: JSON.stringify({ taxId: "08AAACB1234F1Z5", tan: "JPRB12345C" }) } });
    orgId = org.id;
    ids.admin = (await prisma.user.create({ data: { organizationId: orgId, name: "Owner Bothra", email: `p11-admin-${stamp}@test.local`, passwordHash: "x", role: "ORG_ADMIN" } })).id;
    const party = (name: string, data: Record<string, unknown>) => prisma.party.create({ data: { organizationId: orgId, name, ...data } as any });
    ids.architect = (await party("Mehta Architects", { partyType: "VENDOR", panNumber: "AAAPM1234K", tdsSection: "194J_PROF" })).id;
    ids.lab = (await party("Rajasthan Soil Lab", { partyType: "VENDOR", panNumber: "AABCR5678L", tdsSection: "194J_TECH" })).id;
    ids.landlord = (await party("Site office landlord", { partyType: "VENDOR", panNumber: "AAAPL4321M", tdsSection: "194I_LB" })).id;
    ids.crane = (await party("Jaipur Crane Hire", { partyType: "VENDOR", panNumber: "AABFJ1111N", tdsSection: "194I_PM" })).id;
    ids.cement = (await party("Ambuja Dealer", { partyType: "VENDOR", panNumber: "AAACA1111B" })).id;
    ids.mistri = (await party("Ramlal Mistri", { partyType: "CONTRACTOR", panNumber: "AAAPL1234C" })).id;
    ids.exempt = (await party("Govt. agency", { partyType: "CONTRACTOR", tdsSection: "NONE" })).id;
  });

  afterAll(async () => {
    if (orgId) await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  beforeEach(() => vi.restoreAllMocks());

  it("knows each section's rate, limit and the party's default", () => {
    expect(TDS_SECTIONS["194J_PROF"]).toMatchObject({ act: "194J", code: "94J-B", period: "YEAR" });
    expect(TDS_SECTIONS["194I_LB"]).toMatchObject({ act: "194I", code: "4IB", period: "MONTH" });
    expect(partySection({ partyType: "CONTRACTOR", tdsSection: null })?.key).toBe("194C");
    expect(partySection({ partyType: "VENDOR", tdsSection: null })).toBeNull();
    expect(partySection({ partyType: "VENDOR", tdsSection: "194J_TECH" })?.key).toBe("194J_TECH");
    expect(partySection({ partyType: "CONTRACTOR", tdsSection: "NONE" })).toBeNull();
    // ₹50,000 a year for fees, then 10% on all of it.
    const fees = TDS_SECTIONS["194J_PROF"];
    expect(workTds({ section: fees, pan: "AAAPM1234K", base: 50_000 * R, before: { base: 0, untaxedBase: 0 } }).amount).toBe(0);
    expect(workTds({ section: fees, pan: "AAAPM1234K", base: 20_000 * R, before: { base: 40_000 * R, untaxedBase: 40_000 * R } })).toMatchObject({ rate: 10, amount: 6_000 * R, catchUpBase: 40_000 * R });
    expect(workTds({ section: fees, pan: null, base: 60_000 * R, before: { base: 0, untaxedBase: 0 } }).rate).toBe(20);
    // The parties form sends "" for "automatic".
    expect(partyProfileSchema.parse({ tdsSection: "" }).tdsSection).toBeNull();
    expect(partyProfileSchema.parse({ tdsSection: "194I_PM" }).tdsSection).toBe("194I_PM");
    expect(() => partyProfileSchema.parse({ tdsSection: "194H" })).toThrow();
  });

  it("holds back TDS on fees and rent, keeps a bill for each, and files them in the 26Q", async () => {
    asAdmin(orgId, ids.admin);

    // Architect: ₹30,000 is under the yearly ₹50,000; the next ₹30,000 crosses it: 10% on ₹60,000.
    let p = (await json(await payTo(ids.architect, 30_000))).payment;
    expect(p).toMatchObject({ tdsAmount: 0, tdsSection: null });
    const peek = await json(await preview(req("/api/finance/payments/tds-preview", "POST", { partyId: ids.architect, amount: 30_000 * R, paymentDate: new Date().toISOString() })));
    expect(peek).toMatchObject({ label: "Professional fees (194J)", rate: 10, amount: 6_000 * R, bankAmount: 24_000 * R });
    p = (await json(await payTo(ids.architect, 30_000))).payment;
    expect(p).toMatchObject({ tdsSection: "194J_PROF", tdsRate: 10, tdsAmount: 6_000 * R, tdsCatchUp: 30_000 * R });

    // Soil testing: technical services at 2%.
    p = (await json(await payTo(ids.lab, 75_000))).payment;
    expect(p).toMatchObject({ tdsSection: "194J_TECH", tdsRate: 2, tdsAmount: 1_500 * R });

    // Rent is counted by the month: ₹60,000 is over ₹50,000, so 10%.
    p = (await json(await payTo(ids.landlord, 60_000))).payment;
    expect(p).toMatchObject({ tdsSection: "194I_LB", tdsRate: 10, tdsAmount: 6_000 * R });
    // Crane hire of ₹40,000 in the month stays under the limit.
    p = (await json(await payTo(ids.crane, 40_000))).payment;
    expect(p).toMatchObject({ tdsAmount: 0, tdsSection: null });

    // Goods suppliers and exempt parties are not touched; contractors still get 194C.
    expect((await json(await payTo(ids.cement, 2_00_000))).payment).toMatchObject({ tdsAmount: 0 });
    expect((await json(await payTo(ids.exempt, 2_00_000, { recipientType: "CONTRACTOR" }))).payment).toMatchObject({ tdsAmount: 0 });
    expect((await json(await payTo(ids.mistri, 40_000, { recipientType: "CONTRACTOR" }))).payment).toMatchObject({ tdsSection: "194C", tdsAmount: 400 * R });

    // One bill a month for each act, owed to the Income Tax Department.
    const month = istDateKey().slice(0, 7);
    const bill = (act: string) => prisma.bill.findFirst({ where: { organizationId: orgId, billNumber: `TDS${act}-${month}` } });
    expect(await bill("194J")).toMatchObject({ totalAmount: 7_500 * R, statutory: "TDS_194J" });
    expect(await bill("194I")).toMatchObject({ totalAmount: 6_000 * R, statutory: "TDS_194I" });
    expect(await bill("194C")).toMatchObject({ totalAmount: 400 * R, statutory: "TDS_194C" });
    const owedTo = await prisma.bill.findMany({ where: { organizationId: orgId, statutory: { startsWith: "TDS_" } }, select: { partyId: true } });
    expect(new Set(owedTo.map((b) => b.partyId)).size).toBe(1);

    // Tally: a TDS ledger for each act, and the TDS bills are not purchases.
    const today = istDateKey();
    const xml = await (await exportFile(req(`/api/exports/tally?from=${today}&to=${today}&parts=bills,payments`), { params: { kind: "tally" } })).text();
    expect(xml).toContain('<LEDGER NAME="TDS Payable (194J)" ACTION="Create">');
    expect(xml).toContain('<LEDGER NAME="TDS Payable (194I)" ACTION="Create">');
    expect(xml).toContain("<LEDGERNAME>TDS Payable (194J)</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>6000.00</AMOUNT>");
    expect(xml).toContain("<LEDGERNAME>TDS Payable (194I)</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>6000.00</AMOUNT>");
    expect(xml).not.toContain(`TDS194J-${month}</VOUCHERNUMBER>`);

    // Depositing the 194J bill clears the 194J ledger.
    const fees = await bill("194J");
    await payTo((fees as any).partyId, 7_500, { recipientType: "VENDOR", reason: "TDS deposit", referenceNumber: `CIN-${stamp}`, allocations: [{ billId: fees!.id, amount: 7_500 * R }] });
    const xml2 = await (await exportFile(req(`/api/exports/tally?from=${today}&to=${today}&parts=payments`), { params: { kind: "tally" } })).text();
    expect(xml2).toContain(`<PARTYLEDGERNAME>TDS Payable (194J)</PARTYLEDGERNAME>`);

    // The quarter's 26Q: each payment with its section code; challans per act.
    const fy = fyOf(month);
    const mm = Number(month.slice(5));
    const q = (mm >= 4 && mm <= 6 ? 1 : mm <= 9 && mm >= 7 ? 2 : mm >= 10 ? 3 : 4) as 1 | 2 | 3 | 4;
    const ret = await json(await tdsReturn(req(`/api/finance/tds-return?fy=${fy}&quarter=${q}`)));
    const row = (name: string) => ret.deductees.filter((d: any) => d.name === name).map((d: any) => [d.section, d.sectionCode, d.tds / R, d.remark]);
    expect(row("Mehta Architects")).toEqual([["194J", "94J-B", 6_000, ""]]);
    expect(row("Rajasthan Soil Lab")).toEqual([["194J", "94J-A", 1_500, ""]]);
    expect(row("Site office landlord")).toEqual([["194I", "4IB", 6_000, ""]]);
    expect(row("Ramlal Mistri")).toEqual([["194C", "94C", 400, ""]]);
    // A party marked "No TDS" is not part of the return.
    expect(row("Govt. agency")).toEqual([]);
    expect(ret.sections).toEqual(expect.arrayContaining(["194C", "194J", "194I"]));
    const challan = (act: string) => ret.challans.find((c: any) => c.month === month && c.section === act);
    expect(challan("194J")).toMatchObject({ tds: 7_500 * R, deposited: 7_500 * R });
    expect(challan("194I")).toMatchObject({ tds: 6_000 * R, deposited: 0 });
    const sheet = await (await tdsReturn(req(`/api/finance/tds-return?fy=${fy}&quarter=${q}&format=csv&part=deductees`))).text();
    expect(sheet).toContain("Mehta Architects,AAAPM1234K,194J,94J-B");
    const challans = await (await tdsReturn(req(`/api/finance/tds-return?fy=${fy}&quarter=${q}&format=csv&part=challans`))).text();
    expect(challans.split("\r\n")[0].startsWith("Section,")).toBe(true);
  });
});

describe("Phase 11: WhatsApp alerts to staff", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Phase11 Alerts ${stamp}`, settingsJson: JSON.stringify({ messaging: { testMode: true, staffAlerts: false } }) } });
    ids.alertOrg = org.id;
    const user = (name: string, role: string, phone: string | null) =>
      prisma.user.create({ data: { organizationId: org.id, name, email: `${name.replace(/\W/g, "")}-${stamp}@test.local`, passwordHash: "x", role, phone } });
    ids.owner = (await user("Rakesh Bothra", "ORG_ADMIN", `98${tail}01`)).id;
    ids.super = (await user("Anil Supervisor", "SITE_SUPERVISOR", `97${tail}02`)).id;
    ids.nophone = (await user("No Phone", "SITE_SUPERVISOR", null)).id;
    const site = await prisma.site.create({ data: { organizationId: org.id, name: "Site", code: `S11-${stamp}`, address: "Jaipur" } });
    ids.project = (await prisma.project.create({ data: { organizationId: org.id, siteId: site.id, code: `P11-${stamp}`, name: "Bothra Greens" } })).id;
    ids.vendor = (await prisma.party.create({ data: { organizationId: org.id, name: "Ambuja Dealer", partyType: "VENDOR" } })).id;

    const live = await prisma.organization.create({
      data: { name: `Phase11 Live ${stamp}`, settingsJson: JSON.stringify({ messaging: { waPhoneNumberId: "1098765432101", waToken: "EAAGsecret9999", waStaffTemplate: "staff_alert", staffAlerts: true, siteUrl: "https://cms.bothra.in" } }) },
    });
    liveOrgId = live.id;
    ids.liveUser = (await prisma.user.create({ data: { organizationId: live.id, name: "Meena Store", email: `meena-${stamp}@test.local`, passwordHash: "x", role: "STOREKEEPER", phone: `+91 96${tail}03` } })).id;
  });

  afterAll(async () => {
    for (const id of [ids.alertOrg, liveOrgId]) if (id) await prisma.organization.delete({ where: { id } }).catch(() => {});
  });

  beforeEach(() => vi.restoreAllMocks());

  it("knows quiet hours and keeps template values on one line", () => {
    const at = (ist: string) => new Date(Date.parse(`2026-10-23T${ist}:00+05:30`));
    expect(isQuietHour(at("07:59"))).toBe(true);
    expect(isQuietHour(at("08:00"))).toBe(false);
    expect(isQuietHour(at("20:59"))).toBe(false);
    expect(isQuietHour(at("21:00"))).toBe(true);
    expect(oneLine("Slab 6\n\ncracks   seen\tnear lift")).toBe("Slab 6 cracks seen near lift");
  });

  it("sends each person one message for what waits for them, without repeats", async () => {
    const org = ids.alertOrg;
    const now = noonIst();
    // A payment waiting for approval, raised while alerts were still off.
    asAdmin(org, ids.super);
    const raised = await pay(
      req("/api/finance/payments", "POST", {
        partyId: ids.vendor,
        recipientType: "VENDOR",
        payingAccount: "HDFC current",
        reason: "Cement advance",
        paymentDate: new Date().toISOString(),
        amount: 85_000 * R,
        method: "NEFT_RTGS",
        referenceNumber: `UTR-A-${stamp}`,
        idempotencyKey: `kA-${stamp}`,
      })
    );
    expect((await json(raised)).payment.status).toBe("PENDING_APPROVAL");
    expect(await sendStaffAlerts(org, { now })).toMatchObject({ off: true });

    await prisma.organization.update({ where: { id: org }, data: { settingsJson: JSON.stringify({ messaging: { testMode: true, staffAlerts: true, siteUrl: "https://cms.bothra.in" } }) } });
    const note = (userId: string, type: string, title: string, severity = "INFO") =>
      prisma.notification.create({ data: { organizationId: org, userId, type, title, message: title, severity, href: "/quality", createdAt: new Date(now.getTime() - 60_000) } });
    await note(ids.super, "QUALITY_ALERT", "Honeycombing on slab 6\ncolumn C4");
    await note(ids.super, "TASK_REMINDER", "Task Reminder: Shuttering check");
    await note(ids.super, "CHAT_MESSAGE", "New chat message"); // not a WhatsApp kind
    await note(ids.nophone, "QUALITY_ALERT", "Crack in beam");
    await note(ids.owner, "WORK_REPORT", "Labour shortage at site", "CRITICAL");

    expect(await sendStaffAlerts(org, { now })).toMatchObject({ sent: 2, failed: 0 });
    const log = await prisma.messageLog.findMany({ where: { organizationId: org, kind: "STAFF" }, orderBy: { to: "asc" } });
    const supervisor = log.find((l) => l.to === `9197${tail}02`)!;
    expect(supervisor.text).toBe("Hi Anil, 2 things need you: Honeycombing on slab 6 column C4; Task Reminder: Shuttering check. Open Bothra CMS: https://cms.bothra.in/");
    const owner = log.find((l) => l.to === `9198${tail}01`)!;
    expect(owner.text).toContain("Labour shortage at site");
    expect(owner.text).toContain("payment of ₹85,000 to Ambuja Dealer is waiting for approval (from Anil Supervisor)");
    expect(owner).toMatchObject({ refType: "PAYMENT", status: "TEST" });
    // Chat messages stay in the app; the person with no phone gets nothing.
    expect(await prisma.notification.count({ where: { organizationId: org, whatsappAt: { not: null } } })).toBe(3);

    // Nothing new: nothing sent. A new alert within 15 minutes waits.
    expect(await sendStaffAlerts(org, { now })).toMatchObject({ sent: 0 });
    await prisma.messageLog.updateMany({ where: { organizationId: org }, data: { createdAt: new Date(now.getTime() - 5 * 60_000) } });
    await note(ids.super, "SAFETY_ALERT", "No helmets on floor 3");
    expect(await sendStaffAlerts(org, { now })).toMatchObject({ sent: 0, held: 1 });
    const later = new Date(now.getTime() + 20 * 60_000);
    expect(await sendStaffAlerts(org, { now: later })).toMatchObject({ sent: 1 });
    expect((await prisma.messageLog.findFirst({ where: { organizationId: org, kind: "STAFF", text: { contains: "helmets" } } }))!.text).toBe(
      "Hi Anil, No helmets on floor 3. Open Bothra CMS: https://cms.bothra.in/quality"
    );
    // Quiet at night.
    await note(ids.super, "SAFETY_ALERT", "Scaffolding loose");
    expect(await sendStaffAlerts(org, { now: new Date(Date.parse(`${istDateKey()}T17:00:00Z`)) })).toMatchObject({ quiet: true });

    // Overdue tasks each morning, once a day.
    await prisma.task.create({ data: { organizationId: org, projectId: ids.project, title: "Order steel for slab 7", createdBy: ids.owner, assigneeUserId: ids.super, dueAt: new Date(now.getTime() - 2 * 86_400_000) } as any });
    await prisma.task.create({ data: { organizationId: org, projectId: ids.project, title: "Done already", createdBy: ids.owner, assigneeUserId: ids.super, status: "COMPLETED", dueAt: new Date(now.getTime() - 86_400_000) } as any });
    expect(await sendOverdueTaskDigest(org, now)).toMatchObject({ sent: 1 });
    expect(await sendOverdueTaskDigest(org, now)).toMatchObject({ sent: 0 });
    expect((await prisma.messageLog.findFirst({ where: { organizationId: org, kind: "STAFF_DIGEST" } }))!.text).toBe(
      'Hi Anil, you have 1 overdue task: "Order steel for slab 7". Open Bothra CMS: https://cms.bothra.in/tasks'
    );
  });

  it("calls WhatsApp with the staff template and three values", async () => {
    const calls: any[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(init.body), auth: init.headers.Authorization });
      return new Response(JSON.stringify({ messages: [{ id: "wamid.staff1" }] }), { status: 200 });
    });
    await prisma.notification.create({
      data: { organizationId: liveOrgId, userId: ids.liveUser, type: "MATERIAL_REQUEST", title: "Material request MR-12: 200 bags cement", message: "x", href: "/material-requests", createdAt: new Date(noonIst().getTime() - 60_000) },
    });
    expect(await sendStaffAlerts(liveOrgId, { now: noonIst() })).toMatchObject({ sent: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://graph.facebook.com/v21.0/1098765432101/messages");
    expect(calls[0].auth).toBe("Bearer EAAGsecret9999");
    expect(calls[0].body).toMatchObject({
      to: `9196${tail}03`,
      type: "template",
      template: {
        name: "staff_alert",
        components: [{ type: "body", parameters: [{ text: "Meena" }, { text: "Material request MR-12: 200 bags cement" }, { text: "https://cms.bothra.in/material-requests" }] }],
      },
    });
    expect(await prisma.messageLog.findFirst({ where: { organizationId: liveOrgId } })).toMatchObject({ status: "SENT", providerRef: "wamid.staff1" });
  });
});
