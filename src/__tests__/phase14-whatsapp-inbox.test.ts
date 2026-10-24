import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { GET as hookGet, POST as hookPost } from "@/app/api/webhooks/whatsapp/route";
import { GET as threadGet, POST as threadPost } from "@/app/api/whatsapp/messages/route";
import { GET as inboxGet } from "@/app/api/whatsapp/conversations/route";
import { POST as orderSend } from "@/app/api/orders/[id]/whatsapp/route";
import { PATCH as patchMessaging, GET as getMessaging } from "@/app/api/organization/messaging/route";
import { partyProfileSchema } from "@/lib/party-profile";
import { orderSummary } from "@/services/whatsapp-inbox";

const stamp = Date.now();
const tail = String(stamp).slice(-6);
const PHONE_ID = `77${tail}01`;
const SECRET = "meta-app-secret-for-tests-123";
const VENDOR = `9198${tail}11`;
const BUYER = `9197${tail}22`;
const ids: Record<string, string> = {};

const req = (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost:3000${path}`, { method, body: typeof body === "string" ? body : body ? JSON.stringify(body) : undefined, headers });
const json = async (res: Response) => (await res.json()).data;

function as(role: string, userId = ids.admin) {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId,
    organizationId: ids.org,
    email: "x@test.local",
    name: "Owner",
    role: role as any,
    organizationName: "Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

const sign = (raw: string, secret = SECRET) => `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
const hook = (value: any) => {
  const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: PHONE_ID }, ...value } }] }] });
  return { raw, call: (sig = sign(raw)) => hookPost(req("/api/webhooks/whatsapp", "POST", raw, { "x-hub-signature-256": sig })) };
};

describe("Phase 14: WhatsApp orders to vendors and replies in the app", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `Inbox Builders ${stamp}`, settingsJson: JSON.stringify({ messaging: { waPhoneNumberId: PHONE_ID, waToken: "EAAGinboxtoken", waOrderTemplate: "vendor_order", siteUrl: "https://cms.bothra.in" } }) },
    });
    ids.org = org.id;
    ids.admin = (await prisma.user.create({ data: { organizationId: org.id, name: "Rakesh Bothra", email: `inbox-admin-${stamp}@test.local`, passwordHash: "x", role: "ORG_ADMIN" } })).id;
    ids.store = (await prisma.user.create({ data: { organizationId: org.id, name: "Meena Store", email: `inbox-store-${stamp}@test.local`, passwordHash: "x", role: "STOREKEEPER" } })).id;
    // The phone is typed with a space, as people do.
    ids.vendor = (await prisma.party.create({ data: { organizationId: org.id, name: "Ambuja Dealer", partyType: "VENDOR", phone: `+91 98${tail.slice(0, 3)} ${tail.slice(3)}11`, whatsappGroupLink: "https://chat.whatsapp.com/AbCdEf123456XyZ" } })).id;
    const site = await prisma.site.create({ data: { organizationId: org.id, name: "Bothra Greens", code: `S14-${stamp}`, address: "Jaipur" } });
    const material = await prisma.material.create({ data: { organizationId: org.id, sku: `CEM-${stamp}`, name: "Cement OPC 53", unitCode: "BAG" } });
    ids.po = (
      await prisma.purchaseOrder.create({
        data: { organizationId: org.id, orderNumber: `PO-${stamp}`, materialId: material.id, vendorPartyId: ids.vendor, siteId: site.id, quantity: 200, unitCode: "BAG", unitRate: 380_00, totalAmount: 76_000_00, status: "APPROVED", createdBy: ids.store },
      })
    ).id;
    const project = await prisma.project.create({ data: { organizationId: org.id, siteId: site.id, code: `P14-${stamp}`, name: "Greens" } });
    const unit = await prisma.salesUnit.create({ data: { organizationId: org.id, projectId: project.id, unitNumber: `A-${tail}`, unitType: "3BHK", price: 60_00_000_00 } });
    await prisma.salesBooking.create({ data: { organizationId: org.id, unitId: unit.id, bookingNumber: `BK-${stamp}`, customerName: "Sunita Jain", customerPhone: `97${tail}22`, bookingDate: "2026-10-01", agreementValue: 60_00_000_00, createdBy: ids.admin } });
  });

  afterAll(async () => {
    if (ids.org) await prisma.organization.delete({ where: { id: ids.org } }).catch(() => {});
  });

  beforeEach(() => vi.restoreAllMocks());

  it("sets up the webhook: a verify token, Meta's check, and the app secret kept hidden", async () => {
    as("ORG_ADMIN");
    const saved = await json(await patchMessaging(req("/api/organization/messaging", "PATCH", { waAppSecret: SECRET })));
    expect(saved.settings.waVerifyToken).toMatch(/^bothra_/);
    expect(saved.settings.waAppSecret).toBe("••••-123");
    expect(saved.settings.can.inbox).toBe(true);
    const page = await json(await getMessaging(req("/api/organization/messaging")));
    expect(page.webhookUrl).toBe("https://cms.bothra.in/api/webhooks/whatsapp");
    expect(JSON.stringify(page)).not.toContain(SECRET);

    const token = saved.settings.waVerifyToken;
    const ok = await hookGet(req(`/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345`));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("12345");
    expect((await hookGet(req(`/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=bothra_wrongwrongwrongwrong&hub.challenge=1`))).status).toBe(403);

    // The vendor's group link must be a real invite link.
    expect(() => partyProfileSchema.parse({ whatsappGroupLink: "https://example.com/x" })).toThrow();
    expect(partyProfileSchema.parse({ whatsappGroupLink: "" }).whatsappGroupLink).toBeNull();
  });

  it("sends an order: the template when the vendor has not written, the full order when they have", async () => {
    const calls: any[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url: any, init: any) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.out${calls.length}-${stamp}` }] }), { status: 200 });
    });
    as("STOREKEEPER", ids.store);
    const first = await json(await orderSend(req(`/api/orders/${ids.po}/whatsapp`, "POST", {}), { params: { id: ids.po } }));
    expect(first.message).toMatchObject({ status: "SENT", kind: "TEMPLATE", partyId: ids.vendor, purchaseOrderId: ids.po, sentById: ids.store });
    expect(calls[0]).toMatchObject({ to: VENDOR, type: "template", template: { name: "vendor_order" } });
    expect(calls[0].template.components[0].parameters.map((p: any) => p.text)).toEqual([`PO-${stamp}`, `Inbox Builders ${stamp}`, "200 BAG Cement OPC 53, at ₹380/BAG, total ₹76,000, deliver to Bothra Greens"]);
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: ids.po } })).notificationSent).toBe(true);

    // A typed message is refused outside the 24 hours.
    as("ORG_ADMIN");
    const refused = await threadPost(req("/api/whatsapp/messages", "POST", { to: VENDOR, text: "Any update?" }));
    expect(refused.status).toBe(409);

    // The vendor replies to the order, with a photo of the challan.
    const reply = hook({
      contacts: [{ wa_id: VENDOR, profile: { name: "Ambuja" } }],
      messages: [
        { from: VENDOR, id: `wamid.in1-${stamp}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Confirmed, dispatch tomorrow 10 am" }, context: { id: `wamid.out1-${stamp}` } },
        { from: VENDOR, id: `wamid.in2-${stamp}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "image", image: { id: "MEDIA1", mime_type: "image/jpeg", caption: "Challan" } },
      ],
    });
    expect((await reply.call(sign(reply.raw, "wrong-secret"))).status).toBe(401);
    expect(await prisma.whatsAppMessage.count({ where: { organizationId: ids.org, direction: "IN" } })).toBe(0);

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
      if (String(url).endsWith("/MEDIA1")) return new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/media1", mime_type: "image/jpeg", file_size: jpeg.length }), { status: 200 });
      if (String(url).startsWith("https://lookaside")) return new Response(jpeg, { status: 200 });
      return new Response("{}", { status: 404 });
    });
    const res = await reply.call();
    expect(await res.json()).toMatchObject({ ok: true, received: 2 });
    expect((await (await reply.call()).json()).received).toBe(0); // Meta retried: nothing twice
    const inbound = await prisma.whatsAppMessage.findMany({ where: { organizationId: ids.org, direction: "IN" }, orderBy: { kind: "desc" } });
    expect(inbound.map((m) => [m.kind, m.text, m.partyId, m.purchaseOrderId])).toEqual([
      ["TEXT", "Confirmed, dispatch tomorrow 10 am", ids.vendor, ids.po],
      ["IMAGE", "Challan", ids.vendor, null],
    ]);
    const photo = await prisma.attachment.findFirstOrThrow({ where: { organizationId: ids.org, fileId: inbound[1].fileId! } });
    expect(photo).toMatchObject({ entityType: "PARTY", entityId: ids.vendor, mimeType: "image/jpeg", category: "PHOTO" });
    // The bell for the people who handle vendors.
    const bell = await prisma.notification.findMany({ where: { organizationId: ids.org, type: "WHATSAPP_REPLY" } });
    expect(new Set(bell.map((n) => n.userId))).toEqual(new Set([ids.admin, ids.store]));
    expect(bell[0]).toMatchObject({ title: "WhatsApp from Ambuja Dealer", href: `/whatsapp?with=${VENDOR}` });

    // Delivery updates: read stays read even if "delivered" comes late.
    const ticks = hook({ statuses: [{ id: `wamid.out1-${stamp}`, status: "read" }, { id: `wamid.out1-${stamp}`, status: "delivered" }] });
    await ticks.call();
    expect((await prisma.whatsAppMessage.findUniqueOrThrow({ where: { providerRef: `wamid.out1-${stamp}` } })).status).toBe("READ");

    // Now within 24 hours: a typed reply goes as text, and an order goes in full.
    const calls2: any[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url: any, init: any) => {
      calls2.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ messages: [{ id: `wamid.out-b${calls2.length}-${stamp}` }] }), { status: 200 });
    });
    const typed = await json(await threadPost(req("/api/whatsapp/messages", "POST", { to: VENDOR, text: "Thanks, gate 2 please" })));
    expect(typed.message).toMatchObject({ status: "SENT", kind: "TEXT", sentById: ids.admin });
    expect(calls2[0]).toMatchObject({ to: VENDOR, type: "text", text: { body: "Thanks, gate 2 please" } });
    as("STOREKEEPER", ids.store);
    await orderSend(req(`/api/orders/${ids.po}/whatsapp`, "POST", {}), { params: { id: ids.po } });
    expect(calls2[1].type).toBe("text");
    expect(calls2[1].text.body).toContain(`PURCHASE ORDER: PO-${stamp}`);

    // Opening the chat marks the replies read.
    const t = await json(await threadGet(req(`/api/whatsapp/messages?with=${VENDOR}`)));
    expect(t.with).toMatchObject({ kind: "VENDOR", name: "Ambuja Dealer", groupLink: "https://chat.whatsapp.com/AbCdEf123456XyZ" });
    expect(t.windowOpen).toBe(true);
    expect(t.messages.map((m: any) => m.direction).sort().join(",")).toBe("IN,IN,OUT,OUT,OUT");
    expect(await prisma.whatsAppMessage.count({ where: { organizationId: ids.org, direction: "IN", readAt: null } })).toBe(0);
  });

  it("brings buyers' replies in too, and shows each chat only to the right people", async () => {
    const msg = hook({ messages: [{ from: BUYER, id: `wamid.buyer-${stamp}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "When is possession?" } }] });
    await msg.call();
    as("ORG_ADMIN");
    const all = await json(await inboxGet(req("/api/whatsapp/conversations")));
    const buyer = all.conversations.find((c: any) => c.waId === BUYER);
    expect(buyer).toMatchObject({ kind: "BUYER", name: "Sunita Jain", unread: 1, windowOpen: true });
    as("STOREKEEPER", ids.store);
    const store = await json(await inboxGet(req("/api/whatsapp/conversations")));
    expect(store.conversations.map((c: any) => c.kind)).toEqual(["VENDOR"]);
    expect((await threadGet(req(`/api/whatsapp/messages?with=${BUYER}`))).status).toBe(403);
    expect(orderSummary({ quantity: 5, unitCode: "TONNE", material: { name: "TMT 12mm\nFe500" } })).toBe("5 TONNE TMT 12mm Fe500");
  });
});
