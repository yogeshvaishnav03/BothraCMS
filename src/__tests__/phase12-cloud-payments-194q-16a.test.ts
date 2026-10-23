import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { POST as pay } from "@/app/api/finance/payments/route";
import { GET as tdsReturn } from "@/app/api/finance/tds-return/route";
import { GET as form16ARoute } from "@/app/api/finance/form-16a/route";
import { GET as exportFile } from "@/app/api/exports/[kind]/route";
import { POST as payNow } from "@/app/api/portal/[token]/pay/route";
import { GET as payReturn } from "@/app/api/portal/pay/callback/route";
import { POST as payWebhook } from "@/app/api/portal/pay/webhook/route";
import { GET as getPayments, PATCH as patchPayments } from "@/app/api/organization/payments/route";
import { GET as getOrg } from "@/app/api/organization/route";
import { GET as storageGet, POST as storageMove } from "@/app/api/organization/storage/route";
import { partySection, TDS_SECTIONS, workTds } from "@/lib/contractor-tds";
import { backupFileToDatabase, getStorageProvider, isCloudStorage } from "@/lib/storage";
import { SalesService } from "@/services/sales-service";
import { assessmentYear, form16ADueDate } from "@/services/tds-certificates";
import { istDateKey } from "@/lib/ist-date";
import { fyOf } from "@/lib/income-tax";

// An in-memory Vercel Blob store.
const blobStore = vi.hoisted(() => new Map<string, { body: Buffer; contentType: string }>());
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string, body: Buffer, opts: { contentType: string; access: string }) => {
    if (opts.access !== "private") throw new Error("store is private");
    blobStore.set(pathname, { body: Buffer.from(body), contentType: opts.contentType });
    return { pathname, url: `https://store.private.blob.vercel-storage.com/${pathname}` };
  }),
  get: vi.fn(async (pathname: string) => {
    const b = blobStore.get(pathname);
    if (!b) return null;
    return { statusCode: 200, stream: new Response(new Uint8Array(b.body)).body, headers: new Headers(), blob: { contentType: b.contentType, size: b.body.length } };
  }),
  del: vi.fn(async (pathname: string) => void blobStore.delete(pathname)),
}));

const stamp = Date.now();
const R = 100;
const L = 1_00_000 * R; // ₹1 lakh
const ids: Record<string, string> = {};
const req = (path: string, method = "GET", body?: unknown, headers?: Record<string, string>) =>
  new NextRequest(`http://localhost:3000${path}`, { method, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body), headers });
const json = async (res: Response) => (await res.json()).data;

function asAdmin(organizationId: string, userId: string) {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId,
    organizationId,
    email: "owner@test.local",
    name: "Owner Bothra",
    role: "ORG_ADMIN" as any,
    organizationName: "Phase12 Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

const month = istDateKey().slice(0, 7);
const fy = fyOf(month);
const mm = Number(month.slice(5));
const quarter = (mm >= 4 && mm <= 6 ? 1 : mm >= 7 && mm <= 9 ? 2 : mm >= 10 ? 3 : 4) as 1 | 2 | 3 | 4;

describe("Phase 12: TDS on purchases (194Q) and Form 16A", () => {
  let n = 0;
  const payTo = (partyId: string, paise: number, extra: Record<string, unknown> = {}) =>
    pay(
      req("/api/finance/payments", "POST", {
        partyId,
        recipientType: "VENDOR",
        payingAccount: "HDFC current",
        reason: "Steel supply",
        paymentDate: new Date().toISOString(),
        amount: paise,
        method: "NEFT_RTGS",
        referenceNumber: `UTR12-${stamp}-${++n}`,
        idempotencyKey: `k12-${stamp}-${n}`,
        autoApprove: true,
        ...extra,
      })
    );

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: `Phase12 Org ${stamp}`,
        settingsJson: JSON.stringify({ taxId: "08AAACB1234F1Z5", tan: "JPRB12345C", companyAddress: "MI Road, Jaipur", tds194Q: true, tdsSignatory: "Rakesh Bothra", tdsSignatoryDesignation: "Partner" }),
      },
    });
    ids.org = org.id;
    ids.admin = (await prisma.user.create({ data: { organizationId: org.id, name: "Owner Bothra", email: `p12-admin-${stamp}@test.local`, passwordHash: "x", role: "ORG_ADMIN" } })).id;
    const party = (name: string, data: Record<string, unknown>) => prisma.party.create({ data: { organizationId: org.id, name, ...data } as any });
    ids.steel = (await party("Jindal Steel Stockist", { partyType: "VENDOR", panNumber: "AABCJ1234K", address: "VKI Area", city: "Jaipur", whatsappNumber: "9829012345" })).id;
    ids.cement = (await party("Cement dealer, no PAN", { partyType: "VENDOR" })).id;
    ids.mistri = (await party("Ramlal Mistri", { partyType: "CONTRACTOR", panNumber: "AAAPL1234C" })).id;
    ids.nopay = (await party("Paint shop", { partyType: "VENDOR", tdsSection: "NONE" })).id;
  });

  afterAll(async () => {
    if (ids.org) await prisma.organization.delete({ where: { id: ids.org } }).catch(() => {});
  });

  beforeEach(() => vi.restoreAllMocks());

  it("works out 194Q only on what is above ₹50 lakh in the year", () => {
    const q = TDS_SECTIONS["194Q"];
    expect(q).toMatchObject({ act: "194Q", code: "94Q", limit: 50 * L, period: "YEAR", excessOnly: true });
    expect(workTds({ section: q, pan: "AABCJ1234K", base: 40 * L, before: { base: 0, untaxedBase: 0 } }).amount).toBe(0);
    // ₹40 lakh earlier, ₹20 lakh now: only ₹10 lakh is above the limit, at 0.1%, with no catch-up.
    expect(workTds({ section: q, pan: "AABCJ1234K", base: 20 * L, before: { base: 40 * L, untaxedBase: 40 * L } })).toMatchObject({ rate: 0.1, amount: 1_000 * R, catchUpBase: 0 });
    // Once over, the whole payment.
    expect(workTds({ section: q, pan: "AABCJ1234K", base: 5 * L, before: { base: 60 * L, untaxedBase: 40 * L } }).amount).toBe(500 * R);
    // No PAN: 5%, not 20%.
    expect(workTds({ section: q, pan: null, base: 60 * L, before: { base: 0, untaxedBase: 0 } })).toMatchObject({ rate: 5, amount: 50_000 * R });
    // Suppliers come under 194Q only when the company turns it on; contractors stay 194C.
    expect(partySection({ partyType: "VENDOR" })).toBeNull();
    expect(partySection({ partyType: "VENDOR" }, { buyer194Q: true })?.key).toBe("194Q");
    expect(partySection({ partyType: "CONTRACTOR" }, { buyer194Q: true })?.key).toBe("194C");
    expect(partySection({ partyType: "VENDOR", tdsSection: "NONE" }, { buyer194Q: true })).toBeNull();
    expect(partySection({ partyType: "VENDOR", tdsSection: "194Q" })?.key).toBe("194Q");
    expect(assessmentYear("2026-27")).toBe("2027-28");
    expect(form16ADueDate("2026-27", 3)).toBe("2027-02-15");
  });

  it("holds back 194Q on a big supplier, keeps a TDS bill, and makes the Form 16A", async () => {
    asAdmin(ids.org, ids.admin);
    expect((await json(await payTo(ids.steel, 40 * L))).payment).toMatchObject({ tdsAmount: 0, tdsSection: null });
    expect((await json(await payTo(ids.steel, 20 * L))).payment).toMatchObject({ tdsSection: "194Q", tdsRate: 0.1, tdsAmount: 1_000 * R, tdsCatchUp: 0 });
    expect((await json(await payTo(ids.steel, 5 * L))).payment).toMatchObject({ tdsSection: "194Q", tdsAmount: 500 * R });
    // A supplier marked "No TDS" is left alone; contractors still get 194C.
    expect((await json(await payTo(ids.nopay, 60 * L))).payment).toMatchObject({ tdsAmount: 0 });
    expect((await json(await payTo(ids.mistri, 40_000 * R, { recipientType: "CONTRACTOR" }))).payment).toMatchObject({ tdsSection: "194C", tdsAmount: 400 * R });

    const bill = await prisma.bill.findFirst({ where: { organizationId: ids.org, billNumber: `TDS194Q-${month}` } });
    expect(bill).toMatchObject({ totalAmount: 1_500 * R, statutory: "TDS_194Q" });

    // Tally has a 194Q ledger.
    const today = istDateKey();
    const xml = await (await exportFile(req(`/api/exports/tally?from=${today}&to=${today}&parts=payments`), { params: { kind: "tally" } })).text();
    expect(xml).toContain('<LEDGER NAME="TDS Payable (194Q)" ACTION="Create">');

    // The 26Q shows the code 94Q.
    const ret = await json(await tdsReturn(req(`/api/finance/tds-return?fy=${fy}&quarter=${quarter}`)));
    const steel = ret.deductees.filter((d: any) => d.name === "Jindal Steel Stockist" && d.tds > 0).map((d: any) => [d.section, d.sectionCode, d.tds / R]);
    expect(steel).toEqual([
      ["194Q", "94Q", 1_000],
      ["194Q", "94Q", 500],
    ]);
    expect(ret.sections).toContain("194Q");

    // Form 16A before the deposit: listed, but it warns the TDS is not deposited.
    const list = await json(await form16ARoute(req(`/api/finance/form-16a?fy=${fy}&quarter=${quarter}`)));
    expect(list.parties.map((p: any) => p.name)).toEqual(["Jindal Steel Stockist", "Ramlal Mistri"]);
    let cert = await json(await form16ARoute(req(`/api/finance/form-16a?fy=${fy}&quarter=${quarter}&partyId=${ids.steel}`)));
    expect(cert.problems.join(" ")).toContain("not deposited");

    // Deposit the 194Q bill, then the certificate is complete.
    await payTo(bill!.partyId, 1_500 * R, { reason: "TDS deposit", referenceNumber: `CIN0510032-${stamp}`, allocations: [{ billId: bill!.id, amount: 1_500 * R }] });
    cert = await json(await form16ARoute(req(`/api/finance/form-16a?fy=${fy}&quarter=${quarter}&partyId=${ids.steel}`)));
    expect(cert).toMatchObject({
      assessmentYear: assessmentYear(fy),
      deductor: { name: `Phase12 Org ${stamp}`, tan: "JPRB12345C", pan: "AAACB1234F", signatory: "Rakesh Bothra", designation: "Partner" },
      deductee: { name: "Jindal Steel Stockist", pan: "AABCJ1234K", address: "VKI Area, Jaipur" },
      totals: { paid: 25 * L, tds: 1_500 * R, deposited: 1_500 * R },
      tdsInWords: "Rupees One Thousand Five Hundred only",
      problems: [],
    });
    expect(cert.challans).toEqual([expect.objectContaining({ section: "194Q", month, tds: 1_500 * R, deposited: 1_500 * R, reference: `CIN0510032-${stamp}` })]);
    expect(cert.payments.map((p: any) => p.sectionCode)).toEqual(["94Q", "94Q"]);

    // A party with nothing held back has no certificate.
    expect((await form16ARoute(req(`/api/finance/form-16a?fy=${fy}&quarter=${quarter}&partyId=${ids.nopay}`))).status).toBe(404);
  });
});

describe("Phase 12: buyers pay online (Razorpay)", () => {
  const KEY_SECRET = "rzpsecret_abcdefgh1234";
  const HOOK_SECRET = "hooksecret_9876";
  let token = "";
  let booking: any;
  let linkCalls: any[] = [];
  let linkN = 0;
  const buyerIp = `10.${(stamp >> 16) & 255}.${(stamp >> 8) & 255}.${stamp & 255}`;

  const sign = (s: string, secret: string) => crypto.createHmac("sha256", secret).update(s).digest("hex");
  const mockRazorpay = () => {
    const real = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
      const url = String(input);
      if (!url.startsWith("https://api.razorpay.com/")) return real(input, init);
      linkCalls.push({ url, auth: init?.headers?.Authorization, body: init?.body ? JSON.parse(init.body) : null });
      const id = `plink_T${stamp}${++linkN}`;
      return new Response(JSON.stringify({ id, short_url: `https://rzp.io/i/${id}`, status: "created" }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
  };
  const returnUrl = (p: { linkId: string; ref: string; status: string; paymentId: string }, secret = KEY_SECRET) => {
    const sig = sign(`${p.linkId}|${p.ref}|${p.status}|${p.paymentId}`, secret);
    return `/api/portal/pay/callback?razorpay_payment_id=${p.paymentId}&razorpay_payment_link_id=${p.linkId}&razorpay_payment_link_reference_id=${p.ref}&razorpay_payment_link_status=${p.status}&razorpay_signature=${sig}`;
  };
  const startPay = async (installmentId: string) => {
    // A fresh address each run, so the rate limit kept from earlier runs never applies.
    const res = await payNow(req(`/api/portal/${token}/pay`, "POST", { installmentId }, { "cf-connecting-ip": buyerIp }), { params: { token } });
    return { status: res.status, body: await res.json() };
  };

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Phase12 Sales ${stamp}`, settingsJson: JSON.stringify({ messaging: { siteUrl: "https://cms.bothra.in" } }) } });
    ids.salesOrg = org.id;
    ids.salesAdmin = (await prisma.user.create({ data: { organizationId: org.id, name: "Sales Owner", email: `p12-sales-${stamp}@test.local`, passwordHash: "x", role: "ORG_ADMIN" } })).id;
    const site = await prisma.site.create({ data: { organizationId: org.id, name: "Site", code: `S12-${stamp}`, address: "Jaipur" } });
    const project = await prisma.project.create({ data: { organizationId: org.id, siteId: site.id, code: `P12-${stamp}`, name: "Bothra Greens" } });
    const unit = await prisma.salesUnit.create({ data: { organizationId: org.id, projectId: project.id, unitNumber: "A-501", unitType: "3BHK", price: 60 * L } });
    booking = await prisma.salesBooking.create({
      data: {
        organizationId: org.id,
        unitId: unit.id,
        bookingNumber: `BK12-${stamp}`,
        customerName: "Sunita Jain",
        customerPhone: "98290 12345",
        bookingDate: istDateKey(),
        agreementValue: 60 * L,
        gstRate: 5,
        createdBy: ids.salesAdmin,
        portalToken: `tok12_${stamp}_abcdefghijklmnop`,
        installments: {
          create: [
            { sortOrder: 0, label: "Booking amount", amount: 6 * L, gstAmount: 30_000 * R, dueDate: istDateKey(), demandRaisedAt: new Date() },
            { sortOrder: 1, label: "On plinth", amount: 12 * L, gstAmount: 60_000 * R, dueDate: istDateKey(), demandRaisedAt: new Date() },
            { sortOrder: 2, label: "On 3rd slab", amount: 12 * L, gstAmount: 60_000 * R, dueDate: null },
          ],
        },
      },
      include: { installments: { orderBy: { sortOrder: "asc" } } },
    });
    token = booking.portalToken;
  });

  afterAll(async () => {
    if (ids.salesOrg) await prisma.organization.delete({ where: { id: ids.salesOrg } }).catch(() => {});
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    linkCalls = [];
  });

  it("keeps the keys on the server and shows Pay now only when switched on", async () => {
    asAdmin(ids.salesOrg, ids.salesAdmin);
    expect((await SalesService.portalView(token))!.payOnline).toBe(false);
    expect((await startPay(booking.installments[0].id)).status).toBe(409);

    expect((await patchPayments(req("/api/organization/payments", "PATCH", { keyId: "pk_live_bad" }))).status).toBe(422);
    expect((await patchPayments(req("/api/organization/payments", "PATCH", { enabled: true, keyId: "rzp_test_ABC123" }))).status).toBe(400); // no secret yet
    const saved = await json(await patchPayments(req("/api/organization/payments", "PATCH", { enabled: true, keyId: "rzp_test_ABC123", keySecret: KEY_SECRET, webhookSecret: HOOK_SECRET })));
    expect(saved.settings).toMatchObject({ enabled: true, ready: true, testKeys: true, keySecret: "••••1234", hasWebhookSecret: true });

    const shown = JSON.stringify(await json(await getPayments(req("/api/organization/payments"))));
    const org = JSON.stringify(await json(await getOrg(req("/api/organization"))));
    for (const text of [shown, org]) {
      expect(text).not.toContain(KEY_SECRET);
      expect(text).not.toContain(HOOK_SECRET);
    }
    const audit = await prisma.auditEvent.findFirst({ where: { organizationId: ids.salesOrg, action: "ONLINE_PAYMENT_SETTINGS_UPDATED" }, orderBy: { createdAt: "desc" } });
    expect(audit!.afterJson).not.toContain(KEY_SECRET);
    expect((await SalesService.portalView(token))!.payOnline).toBe(true);
  });

  it("makes a payment link for the balance and books the receipt once, on return or webhook", async () => {
    mockRazorpay();
    const first = booking.installments[0];
    // Not due yet: no link.
    expect((await startPay(booking.installments[2].id)).status).toBe(409);

    const started = await startPay(first.id);
    expect(started.status).toBe(200);
    expect(started.body.data.url).toMatch(/^https:\/\/rzp\.io\/i\/plink_/);
    expect(linkCalls).toHaveLength(1);
    expect(linkCalls[0].auth).toBe(`Basic ${Buffer.from(`rzp_test_ABC123:${KEY_SECRET}`).toString("base64")}`);
    expect(linkCalls[0].body).toMatchObject({ amount: 6_30_000 * R, currency: "INR", callback_url: "https://cms.bothra.in/api/portal/pay/callback", callback_method: "get", customer: { name: "Sunita Jain", contact: "+919829012345" } });
    // Pressing again reuses the open link.
    expect((await startPay(first.id)).body.data.url).toBe(started.body.data.url);
    expect(linkCalls).toHaveLength(1);

    const op = await prisma.onlinePayment.findFirstOrThrow({ where: { installmentId: first.id } });
    const p = { linkId: op.linkId!, ref: op.referenceId, status: "paid", paymentId: `pay_T${stamp}A` };

    // A forged return (wrong secret) books nothing.
    let res = await payReturn(req(returnUrl(p, "wrong-secret")));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain(`/portal/${token}?payment=check`);
    expect(await prisma.salesReceipt.count({ where: { bookingId: booking.id } })).toBe(0);

    // The real return books the receipt.
    res = await payReturn(req(returnUrl(p)));
    expect(res.headers.get("location")).toContain(`/portal/${token}?payment=paid`);
    const receipts = await prisma.salesReceipt.findMany({ where: { bookingId: booking.id } });
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ amount: 6_30_000 * R, gstAmount: 30_000 * R, mode: "ONLINE", reference: `Razorpay ${p.paymentId}`, createdBy: ids.salesAdmin });
    expect((await prisma.salesInstallment.findUniqueOrThrow({ where: { id: first.id } })).receivedAmount).toBe(6_30_000 * R);

    // The webhook arriving after books nothing more, but records the method.
    const body = JSON.stringify({ event: "payment_link.paid", payload: { payment_link: { entity: { id: p.linkId, status: "paid" } }, payment: { entity: { id: p.paymentId, amount: 6_30_000 * R, method: "upi" } } } });
    expect((await payWebhook(req("/api/portal/pay/webhook", "POST", body, { "x-razorpay-signature": sign(body, "nope") }))).status).toBe(401);
    expect((await payWebhook(req("/api/portal/pay/webhook", "POST", body, { "x-razorpay-signature": sign(body, HOOK_SECRET) }))).status).toBe(200);
    expect(await prisma.salesReceipt.count({ where: { bookingId: booking.id } })).toBe(1);
    expect(await prisma.onlinePayment.findUniqueOrThrow({ where: { id: op.id } })).toMatchObject({ status: "PAID", method: "upi", paymentId: p.paymentId });
    // The office is told.
    expect(await prisma.notification.count({ where: { organizationId: ids.salesOrg, type: "SALES_ONLINE_PAYMENT" } })).toBeGreaterThan(0);
    // Paid now: no more Pay now on it.
    expect((await startPay(first.id)).status).toBe(409);
  });

  it("books a webhook-only payment, puts any extra on the next instalment, and ignores a cancelled payment", async () => {
    mockRazorpay();
    const plinth = booking.installments[1];
    await startPay(plinth.id);
    const op = await prisma.onlinePayment.findFirstOrThrow({ where: { installmentId: plinth.id } });
    // The buyer gave up: nothing booked.
    const gaveUp = await payReturn(req(returnUrl({ linkId: op.linkId!, ref: op.referenceId, status: "cancelled", paymentId: "" })));
    expect(gaveUp.headers.get("location")).toContain("payment=not-paid");

    // Meanwhile the office entered ₹2 lakh by cheque on this instalment.
    await SalesService.receive({ userId: ids.salesAdmin, organizationId: ids.salesOrg } as any, plinth.id, { amount: 2 * L, mode: "CHEQUE", reference: "000123" });
    // The buyer pays the old link (₹12.6 lakh) and closes the page: only the webhook comes.
    const body = JSON.stringify({ event: "payment_link.paid", payload: { payment_link: { entity: { id: op.linkId } }, payment: { entity: { id: `pay_T${stamp}B`, method: "netbanking" } } } });
    expect((await payWebhook(req("/api/portal/pay/webhook", "POST", body, { "x-razorpay-signature": sign(body, HOOK_SECRET) }))).status).toBe(200);
    const rows = await prisma.salesReceipt.findMany({ where: { bookingId: booking.id, mode: "ONLINE", reference: `Razorpay pay_T${stamp}B` }, include: { installment: true } });
    expect(rows.map((r) => [r.installment.label, r.amount])).toEqual([
      ["On plinth", 10_60_000 * R],
      ["On 3rd slab", 2 * L],
    ]);
    const after = await prisma.onlinePayment.findUniqueOrThrow({ where: { id: op.id } });
    expect(after).toMatchObject({ status: "PAID", note: null });
    expect(JSON.parse(after.receiptIds!)).toHaveLength(2);
  });
});

describe("Phase 12: files in cloud storage (Vercel Blob)", () => {
  const saved = { ...process.env };
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Phase12 Files ${stamp}` } });
    ids.fileOrg = org.id;
    ids.fileAdmin = (await prisma.user.create({ data: { organizationId: org.id, name: "Files Owner", email: `p12-files-${stamp}@test.local`, passwordHash: "x", role: "ORG_ADMIN" } })).id;
  });
  afterAll(async () => {
    if (ids.fileOrg) await prisma.organization.delete({ where: { id: ids.fileOrg } }).catch(() => {});
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    for (const k of ["S3_BUCKET", "AWS_S3_BUCKET", "R2_BUCKET", "BLOB_READ_WRITE_TOKEN"]) delete process.env[k];
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("uses the Blob store when one is linked, and then keeps no database copies", async () => {
    expect(getStorageProvider().name).toBe("LOCAL");
    expect(isCloudStorage()).toBe(false);
    await backupFileToDatabase(ids.fileOrg, ["FILE_BLOB_local-1.png"], Buffer.from("png"));
    expect(await prisma.idempotencyRecord.count({ where: { organizationId: ids.fileOrg, operation: "FILE_BLOB" } })).toBe(1);

    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_store_secret";
    const blob = getStorageProvider();
    expect(blob.name).toBe("BLOB");
    await blobStore.clear();
    await blob.put(`${ids.fileOrg}_photo.jpg`, Buffer.from("jpeg-bytes"), "image/jpeg");
    expect(blobStore.get(`uploads/${ids.fileOrg}_photo.jpg`)).toMatchObject({ contentType: "image/jpeg" });
    expect((await blob.get(`${ids.fileOrg}_photo.jpg`))!.toString()).toBe("jpeg-bytes");
    expect(await blob.get("missing.jpg")).toBeNull();
    // Paths cannot climb out of the uploads folder.
    await blob.put("../../etc/x.png", Buffer.from("x"), "image/png");
    expect(blobStore.has("uploads/x.png")).toBe(true);

    await backupFileToDatabase(ids.fileOrg, ["FILE_BLOB_cloud-1.png"], Buffer.from("png"));
    expect(await prisma.idempotencyRecord.count({ where: { organizationId: ids.fileOrg, key: "FILE_BLOB_cloud-1.png" } })).toBe(0);
  });

  it("moves files kept in the database to the Blob store", async () => {
    asAdmin(ids.fileOrg, ids.fileAdmin);
    // Three uploads from before, each with its database copies under two or three keys.
    const files = [1, 2, 3].map((i) => ({ fileId: crypto.randomUUID(), body: Buffer.from(`file-${i}-${stamp}`) }));
    for (const f of files) {
      const diskFileName = `${ids.fileOrg}_${f.fileId}.png`;
      const a = await prisma.attachment.create({
        data: { organizationId: ids.fileOrg, entityType: "PROJECT_DOCUMENT", entityId: "x", fileId: f.fileId, fileName: "site.png", fileSize: f.body.length, mimeType: "image/png", diskFileName, uploadedById: ids.fileAdmin },
      });
      for (const key of [`FILE_BLOB_${f.fileId}`, `FILE_BLOB_${diskFileName}`, `FILE_BLOB_${a.id}`]) {
        await prisma.idempotencyRecord.create({ data: { organizationId: ids.fileOrg, key, operation: "FILE_BLOB", responseCode: 200, responseBodyJson: f.body.toString("base64") } });
      }
    }
    // Without cloud storage there is nowhere to move them.
    expect((await storageMove(req("/api/organization/storage", "POST", {}))).status).toBe(409);

    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_store_secret";
    blobStore.clear();
    const before = await json(await storageGet(req("/api/organization/storage")));
    expect(before).toMatchObject({ provider: "BLOB", cloud: true, files: 3 });
    expect(before.databaseCopies).toBeGreaterThanOrEqual(9);
    const moved = await json(await storageMove(req("/api/organization/storage", "POST", {})));
    expect(moved).toMatchObject({ failed: [], remaining: 0 });
    expect(moved.moved).toBeGreaterThanOrEqual(3);
    for (const f of files) {
      expect(blobStore.get(`uploads/${ids.fileOrg}_${f.fileId}.png`)?.body.toString()).toBe(f.body.toString());
      expect((await getStorageProvider().get(`${ids.fileOrg}_${f.fileId}.png`))!.toString()).toBe(f.body.toString());
    }
    expect(await prisma.idempotencyRecord.count({ where: { organizationId: ids.fileOrg, operation: "FILE_BLOB" } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { organizationId: ids.fileOrg, action: "FILES_MOVED_TO_CLOUD" } })).toBe(1);
  });
});
