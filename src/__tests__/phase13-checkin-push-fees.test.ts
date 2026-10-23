import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { POST as staffAttendance } from "@/app/api/staff-attendance/route";
import { GET as getAttendanceSettings, PATCH as patchAttendanceSettings } from "@/app/api/organization/attendance/route";
import { GET as pushGet, POST as pushSubscribe, DELETE as pushDelete } from "@/app/api/push/route";
import { GET as feesGet, POST as feesBook } from "@/app/api/organization/payments/fees/route";
import { distanceM, placeCheckIn } from "@/lib/attendance-rules";
import { pushToPeople } from "@/lib/push";
import { notifyPeople } from "@/lib/notify";
import { completeOnlinePayment } from "@/services/online-payments";
import { istDateKey } from "@/lib/ist-date";

// web-push without the network: an endpoint containing "gone" answers 410.
const sent = vi.hoisted(() => [] as { endpoint: string; payload: string }[]);
vi.mock("web-push", () => {
  const api = {
    generateVAPIDKeys: () => ({ publicKey: "BPublicKeyForTests_" + "x".repeat(60), privateKey: "private-key-for-tests" }),
    sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string) => {
      if (sub.endpoint.includes("gone")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      if (sub.endpoint.includes("flaky")) throw Object.assign(new Error("Server error"), { statusCode: 500 });
      sent.push({ endpoint: sub.endpoint, payload });
      return { statusCode: 201 };
    }),
  };
  return { default: api, ...api };
});

const stamp = Date.now();
const ids: Record<string, string> = {};
const req = (path: string, method = "GET", body?: unknown, headers?: Record<string, string>) =>
  new NextRequest(`http://localhost:3000${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers });
const json = async (res: Response) => (await res.json()).data;

function as(userId: string, role = "ORG_ADMIN") {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId,
    organizationId: ids.org,
    email: "p13@test.local",
    name: "Phase13",
    role: role as any,
    organizationName: "Phase13 Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

// Site at Malviya Nagar, Jaipur; a point ~110 m north, and one ~5 km away.
const SITE = { lat: 26.8549, lng: 75.8243 };
const NEAR = { lat: 26.8559, lng: 75.8243 };
const FAR = { lat: 26.9, lng: 75.8243 };

describe("Phase 13: check-in location and selfie, phone alerts, Razorpay fees", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Phase13 Org ${stamp}` } });
    ids.org = org.id;
    const user = async (key: string, role: string) =>
      (ids[key] = (await prisma.user.create({ data: { organizationId: org.id, name: key, email: `p13-${key}-${stamp}@test.local`, passwordHash: "x", role } })).id);
    await user("admin", "ORG_ADMIN");
    for (const k of ["near", "far", "nogps", "blocked", "offline", "selfie", "push"]) await user(k, "SITE_SUPERVISOR");
    ids.site = (await prisma.site.create({ data: { organizationId: org.id, name: "Malviya Nagar Tower", code: `MNT${stamp}`, address: "Malviya Nagar, Jaipur" } })).id;
  });

  afterAll(async () => {
    if (ids.org) await prisma.organization.delete({ where: { id: ids.org } }).catch(() => {});
  });

  beforeEach(() => vi.restoreAllMocks());

  it("works out distance and the nearest site", async () => {
    expect(Math.round(distanceM(SITE, NEAR))).toBeGreaterThan(100);
    expect(Math.round(distanceM(SITE, NEAR))).toBeLessThan(120);
    // No site has a location yet: nothing to flag.
    expect(await placeCheckIn(ids.org, { lat: null, lng: null } as any)).toMatchObject({ siteId: null, flag: null });
  });

  it("lets an admin set a site's location and radius, and the rules", async () => {
    as(ids.near, "SITE_SUPERVISOR");
    expect((await patchAttendanceSettings(req("/api/organization/attendance", "PATCH", { rules: { blockOffSite: true } }))).status).toBe(403);

    as(ids.admin);
    expect((await patchAttendanceSettings(req("/api/organization/attendance", "PATCH", { site: { id: ids.site, latitude: SITE.lat, longitude: null } }))).status).toBe(400);
    const res = await patchAttendanceSettings(req("/api/organization/attendance", "PATCH", { site: { id: ids.site, latitude: SITE.lat, longitude: SITE.lng, geofenceM: 200 } }));
    expect(res.status).toBe(200);
    const d = await json(res);
    expect(d.rules).toEqual({ requireGps: false, requireSelfie: false, blockOffSite: false });
    expect(d.sites.find((s: any) => s.id === ids.site)).toMatchObject({ latitude: SITE.lat, longitude: SITE.lng });
    expect(await prisma.auditEvent.count({ where: { organizationId: ids.org, action: "SITE_LOCATION_SET" } })).toBe(1);
  });

  it("flags a check-in away from the site, and one with no location, without refusing them", async () => {
    as(ids.near, "SITE_SUPERVISOR");
    const near = await json(await staffAttendance(req("/api/staff-attendance", "POST", { action: "check-in", ...NEAR })));
    expect(near).toMatchObject({ checkInSiteId: ids.site, checkInFlag: null });
    expect(near.checkInDistanceM).toBeGreaterThan(100);

    as(ids.far, "SITE_SUPERVISOR");
    const far = await staffAttendance(req("/api/staff-attendance", "POST", { action: "check-in", ...FAR }));
    expect(far.status).toBe(201);
    expect(await json(far)).toMatchObject({ checkInSiteId: ids.site, checkInFlag: "OFF_SITE" });

    as(ids.nogps, "SITE_SUPERVISOR");
    expect(await json(await staffAttendance(req("/api/staff-attendance", "POST", { action: "check-in" })))).toMatchObject({ checkInFlag: "NO_GPS", checkInSiteId: null });

    // The office sees them on the settings page.
    as(ids.admin);
    const today = (await json(await getAttendanceSettings(req("/api/organization/attendance")))).today;
    expect(today.map((t: any) => t.flag).sort()).toEqual(["NO_GPS", "OFF_SITE", null].sort());
  });

  it("can refuse check-ins away from the site, but never one sent late from a phone with no signal", async () => {
    as(ids.admin);
    await patchAttendanceSettings(req("/api/organization/attendance", "PATCH", { rules: { blockOffSite: true, requireGps: true } }));

    as(ids.blocked, "SITE_SUPERVISOR");
    const noGps = await staffAttendance(req("/api/staff-attendance", "POST", { action: "check-in" }));
    expect(noGps.status).toBe(422);
    expect((await noGps.json()).error.code).toBe("LOCATION_REQUIRED");
    const far = await staffAttendance(req("/api/staff-attendance", "POST", { action: "check-in", ...FAR }));
    expect(far.status).toBe(422);
    const body = await far.json();
    expect(body.error.code).toBe("OFF_SITE");
    expect(body.error.message).toContain("Malviya Nagar Tower");
    expect(await prisma.staffAttendance.count({ where: { userId: ids.blocked } })).toBe(0);

    as(ids.offline, "SITE_SUPERVISOR");
    const late = await staffAttendance(req("/api/staff-attendance", "POST", { action: "check-in", ...FAR, at: new Date(Date.now() - 3600_000).toISOString() }));
    expect(late.status).toBe(201);
    expect(await json(late)).toMatchObject({ checkInFlag: "OFF_SITE" });

    as(ids.admin);
    await patchAttendanceSettings(req("/api/organization/attendance", "PATCH", { rules: { blockOffSite: false, requireGps: false } }));
  });

  it("asks for a selfie when the company wants one, and only takes the person's own photo", async () => {
    as(ids.admin);
    await patchAttendanceSettings(req("/api/organization/attendance", "PATCH", { rules: { requireSelfie: true } }));
    const photo = async (by: string, mimeType = "image/jpeg") => {
      const fileId = crypto.randomUUID();
      await prisma.attachment.create({
        data: { organizationId: ids.org, entityType: "ATTENDANCE", entityId: fileId, fileId, fileName: "selfie.jpg", fileSize: 1000, mimeType, category: "PHOTO", diskFileName: `${fileId}.jpg`, uploadedById: by },
      });
      return `/api/uploads/${fileId}`;
    };

    as(ids.selfie, "SITE_SUPERVISOR");
    const none = await staffAttendance(req("/api/staff-attendance", "POST", { action: "check-in", ...NEAR }));
    expect(none.status).toBe(422);
    expect((await none.json()).error.code).toBe("SELFIE_REQUIRED");
    // Someone else's photo, or a PDF, does not count.
    expect((await staffAttendance(req("/api/staff-attendance", "POST", { action: "check-in", ...NEAR, selfie: await photo(ids.admin) }))).status).toBe(422);
    expect((await staffAttendance(req("/api/staff-attendance", "POST", { action: "check-in", ...NEAR, selfie: await photo(ids.selfie, "application/pdf") }))).status).toBe(422);
    const mine = await photo(ids.selfie);
    const ok = await staffAttendance(req("/api/staff-attendance", "POST", { action: "check-in", ...NEAR, selfie: mine }));
    expect(ok.status).toBe(201);
    expect((await json(ok)).checkInSelfie).toBe(mine);

    as(ids.admin);
    await patchAttendanceSettings(req("/api/organization/attendance", "PATCH", { rules: { requireSelfie: false } }));
  });

  it("makes push keys once, never shows the private key, and saves a phone's subscription", async () => {
    as(ids.push, "SITE_SUPERVISOR");
    const first = await json(await pushGet(req("/api/push")));
    expect(first.publicKey).toMatch(/^BPublicKey/);
    expect(JSON.stringify(first)).not.toContain("private-key-for-tests");
    const org = await prisma.organization.findUnique({ where: { id: ids.org } });
    expect(JSON.parse(org!.settingsJson!).push.privateKey).toBe("private-key-for-tests");

    expect((await pushSubscribe(req("/api/push", "POST", { endpoint: "http://insecure.example/x", keys: { p256dh: "p".repeat(20), auth: "a".repeat(10) } }))).status).toBe(422);
    const endpoint = `https://fcm.googleapis.com/fcm/send/ok-${stamp}`;
    const res = await pushSubscribe(req("/api/push", "POST", { endpoint, keys: { p256dh: "p".repeat(20), auth: "a".repeat(10) }, test: true }));
    expect(res.status).toBe(201);
    expect((await json(res)).test).toEqual({ sent: 1, failed: 0 });
    expect(JSON.parse(sent.at(-1)!.payload)).toMatchObject({ title: "Alerts are on", href: "/" });
    expect((await json(await pushGet(req(`/api/push?endpoint=${encodeURIComponent(endpoint)}`)))).thisDevice).toBe(true);
  });

  it("pushes alerts from the bell, and drops phones the push service says are gone", async () => {
    await prisma.pushSubscription.createMany({
      data: [
        { organizationId: ids.org, userId: ids.push, endpoint: `https://push.example/gone-${stamp}`, p256dh: "p".repeat(20), auth: "a".repeat(10) },
        { organizationId: ids.org, userId: ids.push, endpoint: `https://push.example/flaky-${stamp}`, p256dh: "p".repeat(20), auth: "a".repeat(10), failures: 3 },
      ],
    });
    sent.length = 0;
    await notifyPeople({
      organizationId: ids.org,
      actorUserId: ids.admin,
      userIds: [ids.push],
      type: "SAFETY_ALERT",
      title: "Scaffold collapse at Tower B",
      message: "Stop work on Tower B until it is checked.",
      href: "/quality",
      entityType: "SITE_ISSUE",
      entityId: "issue-1",
      severity: "CRITICAL",
    });
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0].payload)).toMatchObject({ title: "Scaffold collapse at Tower B", href: "/quality", tag: "SITE_ISSUE:issue-1" });
    const left = await prisma.pushSubscription.findMany({ where: { userId: ids.push }, orderBy: { endpoint: "asc" } });
    expect(left.map((s) => s.endpoint.split("/").pop()!.split("-")[0]).sort()).toEqual(["flaky", "ok"]);
    expect(left.find((s) => s.endpoint.includes("flaky"))!.failures).toBe(4);
    // A fifth failure in a row removes it.
    await pushToPeople(ids.org, [ids.push], { title: "x", body: "y" });
    expect(await prisma.pushSubscription.count({ where: { userId: ids.push } })).toBe(1);

    as(ids.push, "SITE_SUPERVISOR");
    expect((await json(await pushDelete(req("/api/push", "DELETE")))).removed).toBe(1);
  });

  it("notes Razorpay's fee on each payment and books a month's fees once in Finance", async () => {
    const month = istDateKey().slice(0, 7);
    const op = (n: number, data: Record<string, unknown>) =>
      prisma.onlinePayment.create({
        data: { organizationId: ids.org, bookingId: "b", installmentId: "i", referenceId: `p13-${stamp}-${n}`, linkId: `plink_${stamp}_${n}`, amount: 5_00_000_00, expiresAt: new Date(), ...data } as any,
      });
    await op(1, { status: "PAID", paymentId: "pay_1", paidAt: new Date(), fee: 10_620_00, feeTax: 1_620_00 });
    await op(2, { status: "PAID", paymentId: "pay_2", paidAt: new Date() });
    await prisma.organization.update({
      where: { id: ids.org },
      data: { settingsJson: JSON.stringify({ ...JSON.parse((await prisma.organization.findUnique({ where: { id: ids.org } }))!.settingsJson || "{}"), payments: { enabled: true, keyId: "rzp_test_abc", keySecret: "s3cret", webhookSecret: "" } }) },
    });

    // The webhook carries the fee for a payment booked earlier by the buyer's return.
    await op(3, { status: "PAID", paymentId: "pay_3", paidAt: new Date() });
    await completeOnlinePayment({ linkId: `plink_${stamp}_3`, paymentId: "pay_3", fee: 2_360_00, feeTax: 360_00, source: "WEBHOOK" });
    expect((await prisma.onlinePayment.findUnique({ where: { linkId: `plink_${stamp}_3` } }))!.fee).toBe(2_360_00);

    // pay_2's fee is asked from Razorpay when the month is booked.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init?: any) => {
      expect(String(url)).toBe("https://api.razorpay.com/v1/payments/pay_2");
      expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("rzp_test_abc:s3cret").toString("base64")}`);
      return new Response(JSON.stringify({ id: "pay_2", fee: 1_180_00, tax: 180_00, method: "upi" }), { status: 200 });
    });

    as(ids.near, "SITE_SUPERVISOR");
    expect((await feesBook(req("/api/organization/payments/fees", "POST", { month }))).status).toBe(403);

    as(ids.admin);
    const before = (await json(await feesGet(req("/api/organization/payments/fees")))).months.find((m: any) => m.month === month);
    expect(before).toMatchObject({ payments: 3, unknown: 1, booked: 0, fee: 12_980_00 });

    const res = await feesBook(req("/api/organization/payments/fees", "POST", { month }));
    expect(res.status).toBe(201);
    const booked = await json(res);
    expect(booked).toMatchObject({ fee: 14_160_00, tax: 2_160_00, payments: 3, waiting: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payment = await prisma.payment.findUnique({ where: { id: booked.paymentId } });
    expect(payment).toMatchObject({ recipientName: "Razorpay", amount: 14_160_00, costHead: "OVERHEADS", status: "POSTED", idempotencyKey: `razorpay-fees-${month}` });
    expect(await prisma.auditEvent.count({ where: { organizationId: ids.org, action: "RAZORPAY_FEES_BOOKED" } })).toBe(1);

    // Nothing new: refused. A later payment is booked on its own.
    expect((await feesBook(req("/api/organization/payments/fees", "POST", { month }))).status).toBe(409);
    await op(4, { status: "PAID", paymentId: "pay_4", paidAt: new Date(), fee: 590_00, feeTax: 90_00 });
    const again = await json(await feesBook(req("/api/organization/payments/fees", "POST", { month })));
    expect(again).toMatchObject({ fee: 590_00, payments: 1 });
    expect((await prisma.payment.findUnique({ where: { id: again.paymentId } }))!.idempotencyKey).toBe(`razorpay-fees-${month}-2`);
    const after = (await json(await feesGet(req("/api/organization/payments/fees")))).months.find((m: any) => m.month === month);
    expect(after).toMatchObject({ payments: 4, booked: 4, unknown: 0 });
  });
});
