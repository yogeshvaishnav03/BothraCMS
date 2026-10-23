import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { indianMobile } from "@/lib/messaging";
import { requestCode, verifyCode, portalGate, buyerPhone } from "@/services/buyer-sign-in";
import { nextMessage, sendDemandMessages } from "@/services/demand-messages";
import { POST as verifyRoute } from "@/app/api/portal/sign-in/verify/route";
import { GET as getMessaging, PATCH as patchMessaging } from "@/app/api/organization/messaging/route";
import { GET as getOrg } from "@/app/api/organization/route";
import { istDateKey } from "@/lib/ist-date";

const stamp = Date.now();
const ids: Record<string, string> = {};
const R = 100;
const day = (offset: number, from = istDateKey()) => new Date(Date.parse(`${from}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
// Unique mobiles per run so earlier runs' rows never match.
const tail = String(stamp).slice(-6);
const PHONE = `98${tail}11`;
const PHONE2 = `97${tail}22`;
const PHONE3 = `96${tail}33`;

const req = (path: string, method = "GET", body?: unknown) => new NextRequest(`http://localhost:3000${path}`, { method, body: body ? JSON.stringify(body) : undefined });

async function makeOrg(name: string, messaging: Record<string, unknown>) {
  const org = await prisma.organization.create({ data: { name: `${name} ${stamp}`, settingsJson: JSON.stringify({ phone: "0141-2222222", messaging }) } });
  const admin = await prisma.user.create({ data: { organizationId: org.id, name: "Owner", email: `${name.replace(/\W/g, "")}-${stamp}@test.local`, passwordHash: "x", role: "ORG_ADMIN" } });
  const site = await prisma.site.create({ data: { organizationId: org.id, name: "Site", code: `S-${name.slice(0, 3)}-${stamp}`, address: "Jaipur" } });
  const project = await prisma.project.create({ data: { organizationId: org.id, siteId: site.id, code: `P-${name.slice(0, 3)}-${stamp}`, name: "Bothra Greens" } });
  return { orgId: org.id, adminId: admin.id, projectId: project.id };
}

async function makeBooking(orgId: string, projectId: string, unitNumber: string, phone: string, installments: { label: string; amount: number; dueDate: string | null }[]) {
  const unit = await prisma.salesUnit.create({ data: { organizationId: orgId, projectId, unitNumber, unitType: "3BHK", price: 60_00_000 * R } });
  return prisma.salesBooking.create({
    data: {
      organizationId: orgId,
      unitId: unit.id,
      bookingNumber: `BK-${unitNumber}-${stamp}`,
      customerName: "Sunita Jain",
      customerPhone: phone,
      bookingDate: istDateKey(),
      agreementValue: 60_00_000 * R,
      createdBy: "x",
      installments: { create: installments.map((i, n) => ({ sortOrder: n, label: i.label, amount: i.amount, dueDate: i.dueDate, demandRaisedAt: i.dueDate ? new Date() : null })) },
    },
    include: { installments: true },
  });
}

function asAdmin(orgId: string, userId: string) {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId,
    organizationId: orgId,
    email: "owner@test.local",
    name: "Owner",
    role: "ORG_ADMIN" as any,
    organizationName: "Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

describe("Phase 10: buyer sign-in with a code, and WhatsApp demands", () => {
  beforeAll(async () => {
    const a = await makeOrg("Test Mode Builders", { testMode: true, buyerSignIn: true });
    Object.assign(ids, { orgA: a.orgId, adminA: a.adminId, projectA: a.projectId });
    const b = await makeOrg("Live Builders", {
      waPhoneNumberId: "1098765432101",
      waToken: "EAAGsecrettoken1234",
      waDemandTemplate: "payment_demand",
      waReminderTemplate: "payment_reminder",
      autoDemands: true,
      remindBeforeDays: 3,
      remindEveryDays: 7,
      maxOverdueReminders: 2,
      siteUrl: "https://cms.bothra.in",
    });
    Object.assign(ids, { orgB: b.orgId, adminB: b.adminId, projectB: b.projectId });
  });

  afterAll(async () => {
    for (const id of [ids.orgA, ids.orgB]) if (id) await prisma.organization.delete({ where: { id } }).catch(() => {});
  });

  beforeEach(() => vi.restoreAllMocks());

  it("reads Indian mobile numbers", () => {
    expect(indianMobile("98290 12345")).toBe("919829012345");
    expect(indianMobile("+91-98290-12345")).toBe("919829012345");
    expect(indianMobile("09829012345")).toBe("919829012345");
    expect(indianMobile("0141 2222222")).toBeNull();
    expect(indianMobile("12345")).toBeNull();
  });

  it("signs a buyer in with a code and locks the page to their number", async () => {
    const booking = await makeBooking(ids.orgA, ids.projectA, "A-101", `+91 ${PHONE.slice(0, 5)} ${PHONE.slice(5)}`, [{ label: "Booking amount", amount: 6_00_000 * R, dueDate: istDateKey() }]);
    await makeBooking(ids.orgA, ids.projectA, "B-202", `0${PHONE}`, [{ label: "Booking amount", amount: 5_00_000 * R, dueDate: null }]);

    await expect(requestCode("12345")).rejects.toThrow("10-digit");
    await expect(requestCode(PHONE2)).rejects.toThrow("could not find a booking");

    const sent = await requestCode(PHONE);
    expect(sent.sentTo).toBe(`+91 ${PHONE.slice(0, 2)}XXX XX${PHONE.slice(-3)}`);
    // Test mode: the code is in the log, not sent.
    const logged = await prisma.messageLog.findFirstOrThrow({ where: { organizationId: ids.orgA, kind: "OTP" }, orderBy: { createdAt: "desc" } });
    expect(logged).toMatchObject({ status: "TEST", to: `91${PHONE}` });
    const code = logged.text.slice(0, 6);
    expect(code).toMatch(/^\d{6}$/);

    const wrong = code === "000000" ? "111111" : "000000";
    await expect(verifyCode(PHONE, wrong)).rejects.toThrow("4 tries left");

    // The route sets the cookie and lists both homes on that number.
    const res = await verifyRoute(req("/api/portal/sign-in/verify", "POST", { phone: PHONE, code }));
    expect(res.status).toBe(200);
    const homes = (await res.json()).data.homes;
    expect(homes.map((h: any) => h.unitNumber).sort()).toEqual(["A-101", "B-202"]);
    const cookie = res.cookies.get("bothra_buyer")!;
    expect(cookie.httpOnly).toBe(true);
    expect(await buyerPhone(cookie.value)).toBe(`91${PHONE}`);
    // A code works once.
    await expect(verifyCode(PHONE, code)).rejects.toThrow("expired");

    const token = homes.find((h: any) => h.unitNumber === "A-101").token;
    expect(token).toBe((await prisma.salesBooking.findUniqueOrThrow({ where: { id: booking.id } })).portalToken);
    expect(await portalGate(token, null)).toBe("SIGN_IN");
    expect(await portalGate(token, `91${PHONE2}`)).toBe("SIGN_IN");
    expect(await portalGate(token, `91${PHONE}`)).toBe("OK");
    expect(await portalGate("not-a-real-link-at-all-xx", `91${PHONE}`)).toBeNull();

    // Five wrong codes and that code is dead.
    await requestCode(PHONE);
    for (let n = 0; n < 5; n++) await verifyCode(PHONE, wrong).catch(() => null);
    const last = await prisma.messageLog.findFirstOrThrow({ where: { organizationId: ids.orgA, kind: "OTP" }, orderBy: { createdAt: "desc" } });
    await expect(verifyCode(PHONE, last.text.slice(0, 6))).rejects.toThrow("expired");
    // Three codes in 15 minutes is the limit.
    await requestCode(PHONE);
    await expect(requestCode(PHONE)).rejects.toThrow("Too many codes");

    // With sign-in off, the link alone opens the page, as before.
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: ids.orgA } });
    const s = JSON.parse(org.settingsJson!);
    await prisma.organization.update({ where: { id: ids.orgA }, data: { settingsJson: JSON.stringify({ ...s, messaging: { ...s.messaging, buyerSignIn: false } }) } });
    expect(await portalGate(token, null)).toBe("OK");
  });

  it("decides which reminder is due", () => {
    const rules = { remindBeforeDays: 3, remindEveryDays: 7, maxOverdueReminders: 2 };
    const at = (d: string) => new Date(`${d}T06:00:00Z`);
    const inst = { dueDate: "2026-11-20", demandRaisedAt: new Date() };
    expect(nextMessage(inst, [], "2026-10-01", rules)).toBeNull(); // too far ahead
    expect(nextMessage(inst, [], "2026-11-05", rules)).toBe("DEMAND");
    const demand = { kind: "DEMAND", status: "SENT", createdAt: at("2026-11-05") };
    expect(nextMessage(inst, [demand], "2026-11-05", rules)).toBeNull();
    expect(nextMessage(inst, [demand], "2026-11-17", rules)).toBe("DUE_SOON");
    const soon = { kind: "DUE_SOON", status: "SENT", createdAt: at("2026-11-17") };
    expect(nextMessage(inst, [demand, soon], "2026-11-20", rules)).toBeNull();
    expect(nextMessage(inst, [demand, soon], "2026-11-21", rules)).toBe("OVERDUE");
    const o1 = { kind: "OVERDUE", status: "SENT", createdAt: at("2026-11-21") };
    expect(nextMessage(inst, [demand, soon, o1], "2026-11-25", rules)).toBeNull();
    expect(nextMessage(inst, [demand, soon, o1], "2026-11-28", rules)).toBe("OVERDUE");
    const o2 = { kind: "OVERDUE", status: "SENT", createdAt: at("2026-11-28") };
    expect(nextMessage(inst, [demand, soon, o1, o2], "2026-12-30", rules)).toBeNull(); // at most 2
    // A wrong number is tried three times, then left alone.
    const fail = { kind: "DEMAND", status: "FAILED", createdAt: at("2026-11-05") };
    expect(nextMessage(inst, [fail, fail], "2026-11-06", rules)).toBe("DEMAND");
    expect(nextMessage(inst, [fail, fail, fail], "2026-11-06", rules)).toBeNull();
  });

  it("sends demands and reminders through the WhatsApp Business API", async () => {
    const today = istDateKey();
    const booking = await makeBooking(ids.orgB, ids.projectB, "C-303", PHONE3, [
      { label: "On plinth", amount: 3_00_000 * R, dueDate: day(5, today) },
      { label: "On roof slab", amount: 6_00_000 * R, dueDate: null },
    ]);
    const calls: { url: string; body: any; auth: string }[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(init.body), auth: init.headers.Authorization });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${calls.length}` }] }), { status: 200 });
    });

    expect(await sendDemandMessages(ids.orgB, today)).toMatchObject({ sent: 1, failed: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://graph.facebook.com/v21.0/1098765432101/messages");
    expect(calls[0].auth).toBe("Bearer EAAGsecrettoken1234");
    const token = (await prisma.salesBooking.findUniqueOrThrow({ where: { id: booking.id } })).portalToken;
    expect(calls[0].body).toMatchObject({
      messaging_product: "whatsapp",
      to: `91${PHONE3}`,
      type: "template",
      template: { name: "payment_demand", language: { code: "en" } },
    });
    expect(calls[0].body.template.components[0].parameters.map((p: any) => p.text)).toEqual([
      "Sunita",
      "Unit C-303, Bothra Greens",
      "On plinth",
      "₹3,00,000",
      new Date(`${day(5, today)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
      `https://cms.bothra.in/portal/${token}`,
    ]);
    const log = await prisma.messageLog.findFirstOrThrow({ where: { organizationId: ids.orgB, kind: "DEMAND" } });
    expect(log).toMatchObject({ status: "SENT", providerRef: "wamid.1", refType: "SALES_INSTALLMENT" });

    // Run again the same day: nothing new.
    expect((await sendDemandMessages(ids.orgB, today)).sent).toBe(0);
    // Three days before: the reminder template. Then overdue.
    await prisma.messageLog.updateMany({ where: { organizationId: ids.orgB }, data: { createdAt: new Date(Date.now() - 5 * 86_400_000) } });
    expect((await sendDemandMessages(ids.orgB, day(2, today))).sent).toBe(1);
    expect(calls[1].body.template.name).toBe("payment_reminder");
    expect((await prisma.messageLog.findFirstOrThrow({ where: { organizationId: ids.orgB }, orderBy: { createdAt: "desc" } })).kind).toBe("DUE_SOON");

    // WhatsApp refuses: the failure is logged with Meta's reason.
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Template name does not exist in the translation" } }), { status: 400 }));
    await prisma.messageLog.updateMany({ where: { organizationId: ids.orgB }, data: { createdAt: new Date(Date.now() - 5 * 86_400_000) } });
    expect(await sendDemandMessages(ids.orgB, day(6, today))).toMatchObject({ sent: 0, failed: 1 });
    expect((await prisma.messageLog.findFirstOrThrow({ where: { organizationId: ids.orgB, status: "FAILED" } })).error).toContain("Template name");

    // Paid in full: no more reminders.
    await prisma.salesInstallment.update({ where: { id: booking.installments[0].id }, data: { receivedAmount: 3_00_000 * R } });
    expect((await sendDemandMessages(ids.orgB, day(7, today))).sent).toBe(0);
  });

  it("sends one message a day per buyer, covering several instalments", async () => {
    const today = istDateKey();
    await makeBooking(ids.orgB, ids.projectB, "D-404", PHONE2, [
      { label: "On foundation", amount: 2_00_000 * R, dueDate: day(-10, today) },
      { label: "On plinth", amount: 3_00_000 * R, dueDate: day(-3, today) },
      { label: "On first slab", amount: 4_00_000 * R, dueDate: day(4, today) },
    ]);
    const calls: any[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url: any, init: any) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.d${calls.length}` }] }), { status: 200 });
    });
    const toBuyer = () => calls.filter((c) => c.to === `91${PHONE2}`);
    await sendDemandMessages(ids.orgB, today);
    // The new demand first; the overdue ones wait a day.
    expect(toBuyer()).toHaveLength(1);
    expect(toBuyer()[0].template.name).toBe("payment_demand");
    await sendDemandMessages(ids.orgB, day(1, today));
    expect(toBuyer()).toHaveLength(2);
    const overdue = toBuyer()[1];
    expect(overdue.template.name).toBe("payment_reminder");
    expect(overdue.template.components[0].parameters.slice(2, 4).map((p: any) => p.text)).toEqual(["On foundation, On plinth", "₹5,00,000"]);
    // Both instalments count as reminded.
    expect(await prisma.messageLog.count({ where: { organizationId: ids.orgB, kind: "OVERDUE", to: `91${PHONE2}` } })).toBe(2);
    // Later that day the next instalment is three days away, but the buyer already had a message today.
    await prisma.messageLog.updateMany({ where: { organizationId: ids.orgB, kind: "OVERDUE", to: `91${PHONE2}` }, data: { createdAt: new Date(`${day(1, today)}T06:00:00Z`) } });
    await sendDemandMessages(ids.orgB, day(1, today));
    expect(toBuyer()).toHaveLength(2);
    // The next day it goes.
    await sendDemandMessages(ids.orgB, day(2, today));
    expect(toBuyer()).toHaveLength(3);
    expect(toBuyer()[2].template.components[0].parameters[2].text).toBe("On first slab");
  });

  it("keeps the WhatsApp token on the server", async () => {
    asAdmin(ids.orgB, ids.adminB);
    const d = (await (await getMessaging(req("/api/organization/messaging"))).json()).data;
    expect(d.settings).toMatchObject({ waToken: "••••1234", hasWaToken: true, can: { whatsapp: true, demands: true, otp: false } });
    const org = await (await getOrg(req("/api/organization"))).text();
    expect(org).not.toContain("EAAGsecrettoken1234");
    expect(org).not.toContain("settingsJson");

    // Buyer sign-in needs a way to send the code.
    const bad = await patchMessaging(req("/api/organization/messaging", "PATCH", { buyerSignIn: true }));
    expect(bad.status).toBe(400);
    // Saving without the token keeps it; the template makes sign-in possible.
    const ok = await patchMessaging(req("/api/organization/messaging", "PATCH", { buyerSignIn: true, waOtpTemplate: "buyer_sign_in" }));
    expect(ok.status).toBe(200);
    const saved = JSON.parse((await prisma.organization.findUniqueOrThrow({ where: { id: ids.orgB } })).settingsJson!);
    expect(saved.messaging).toMatchObject({ waToken: "EAAGsecrettoken1234", buyerSignIn: true, waOtpTemplate: "buyer_sign_in" });
    expect(saved.phone).toBe("0141-2222222");
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { organizationId: ids.orgB, action: "MESSAGING_SETTINGS_UPDATED" } });
    expect(audit.afterJson).not.toContain("EAAGsecrettoken1234");

    // The code goes as a WhatsApp authentication template with the copy-code button.
    const calls: any[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url: any, init: any) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ messages: [{ id: "wamid.otp" }] }), { status: 200 });
    });
    await requestCode(PHONE3);
    expect(calls[0].template.name).toBe("buyer_sign_in");
    expect(calls[0].template.components[1]).toMatchObject({ type: "button", sub_type: "url" });
    const otpLog = await prisma.messageLog.findFirstOrThrow({ where: { organizationId: ids.orgB, kind: "OTP" } });
    expect(otpLog.text).toMatch(/^•{6} is your code/);
  });
});
