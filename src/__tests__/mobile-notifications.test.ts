import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { POST as pushSubscribe, DELETE as pushDelete } from "@/app/api/push/route";
import { POST as sendChatMessage } from "@/app/api/chat/conversations/[id]/messages/route";
import { POST as submitDailyReport } from "@/app/api/daily-reports/route";
import { POST as placeOrder } from "@/app/api/orders/route";
import { ReminderService } from "@/services/reminder-service";
import { WorkReportService } from "@/services/work-report-service";
import { istDateKey } from "@/lib/ist-date";

const sent = vi.hoisted(
  () => [] as { endpoint: string; payload: string; options?: Record<string, unknown> }[]
);

vi.mock("web-push", () => {
  const api = {
    generateVAPIDKeys: () => ({
      publicKey: "BPublicKeyForMobileTests_" + "x".repeat(54),
      privateKey: "mobile-test-private-key",
    }),
    sendNotification: vi.fn(
      async (sub: { endpoint: string }, payload: string, options?: Record<string, unknown>) => {
        sent.push({ endpoint: sub.endpoint, payload, options });
        return { statusCode: 201 };
      }
    ),
  };
  return { default: api, ...api };
});

const stamp = Date.now();
const ROOT = path.resolve(__dirname, "../..");
const ids: Record<string, string> = {};

function makeReq(urlPath: string, method = "GET", body?: unknown) {
  return new NextRequest(`http://localhost:3000${urlPath}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function asUser(userId: string, role = "SITE_SUPERVISOR", name = "Mobile User") {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId,
    organizationId: ids.org,
    email: `${userId}@mobile.test.local`,
    name,
    role: role as any,
    organizationName: "Mobile Push Test Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

describe("Mobile Push Notifications & Cross-Device Delivery", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `Mobile Push Org ${stamp}`, status: "ACTIVE" },
    });
    ids.org = org.id;

    const admin = await prisma.user.create({
      data: {
        organizationId: ids.org,
        name: "Admin User",
        email: `admin-${stamp}@mobile.test.local`,
        passwordHash: "x",
        role: "ORG_ADMIN",
        status: "ACTIVE",
      },
    });
    ids.admin = admin.id;

    const supA = await prisma.user.create({
      data: {
        organizationId: ids.org,
        name: "Supervisor Alpha",
        email: `supa-${stamp}@mobile.test.local`,
        passwordHash: "x",
        role: "SITE_SUPERVISOR",
        status: "ACTIVE",
      },
    });
    ids.supA = supA.id;

    const supB = await prisma.user.create({
      data: {
        organizationId: ids.org,
        name: "Supervisor Beta",
        email: `supb-${stamp}@mobile.test.local`,
        passwordHash: "x",
        role: "SITE_SUPERVISOR",
        status: "ACTIVE",
      },
    });
    ids.supB = supB.id;

    const site = await prisma.site.create({
      data: {
        organizationId: ids.org,
        name: "Mobile Site",
        code: `MS-${stamp}`,
        address: "Sector 1, Jodhpur",
      },
    });
    ids.site = site.id;

    const project = await prisma.project.create({
      data: {
        organizationId: ids.org,
        siteId: ids.site,
        name: "Mobile Tower",
        code: `MT-${stamp}`,
        status: "IN_PROGRESS",
        managerUserId: ids.admin,
      },
    });
    ids.project = project.id;

    const vendor = await prisma.party.create({
      data: { organizationId: ids.org, name: "Vendor Mobile", partyType: "VENDOR" },
    });
    ids.vendor = vendor.id;

    const material = await prisma.material.create({
      data: {
        organizationId: ids.org,
        name: "TMT Steel",
        sku: `TMT-${stamp}`,
        unitCode: "KG",
      },
    });
    ids.material = material.id;

    const conv = await prisma.conversation.create({
      data: {
        organizationId: ids.org,
        type: "DIRECT",
        createdById: ids.supA,
        participants: {
          create: [{ userId: ids.supA }, { userId: ids.supB }],
        },
      },
    });
    ids.conv = conv.id;

    // Give admin and supB active mobile push subscriptions
    await prisma.pushSubscription.createMany({
      data: [
        {
          organizationId: ids.org,
          userId: ids.admin,
          endpoint: `https://fcm.googleapis.com/fcm/send/admin-${stamp}`,
          p256dh: "p".repeat(24),
          auth: "a".repeat(16),
        },
        {
          organizationId: ids.org,
          userId: ids.supB,
          endpoint: `https://web.push.apple.com/QTest/supb-${stamp}`,
          p256dh: "q".repeat(24),
          auth: "b".repeat(16),
        },
      ],
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await prisma.notification.deleteMany({ where: { organizationId: ids.org } });
    await prisma.pushSubscription.deleteMany({ where: { organizationId: ids.org } });
    await prisma.chatMessage.deleteMany({ where: { conversationId: ids.conv } });
    await prisma.conversationParticipant.deleteMany({ where: { conversationId: ids.conv } });
    await prisma.conversation.deleteMany({ where: { id: ids.conv } });
    await prisma.purchaseOrder.deleteMany({ where: { organizationId: ids.org } });
    await prisma.dailySiteReport.deleteMany({ where: { organizationId: ids.org } });
    await prisma.dailyWorkReport.deleteMany({ where: { organizationId: ids.org } });
    await prisma.task.deleteMany({ where: { organizationId: ids.org } });
    await prisma.project.deleteMany({ where: { organizationId: ids.org } });
    await prisma.material.deleteMany({ where: { organizationId: ids.org } });
    await prisma.party.deleteMany({ where: { organizationId: ids.org } });
    await prisma.site.deleteMany({ where: { organizationId: ids.org } });
    await prisma.user.deleteMany({ where: { organizationId: ids.org } });
    await prisma.organization.deleteMany({ where: { id: ids.org } });
  });

  beforeEach(() => {
    sent.length = 0;
  });

  it("1. Dispatches high-urgency Web Push notifications when chat messages are posted without duplicating DB rows", async () => {
    asUser(ids.supA, "SITE_SUPERVISOR", "Supervisor Alpha");
    const notifBefore = await prisma.notification.count({ where: { organizationId: ids.org } });

    const res = await sendChatMessage(
      makeReq(`/api/chat/conversations/${ids.conv}/messages`, "POST", {
        content: "Cement truck reached Gate 2",
      }),
      { params: { id: ids.conv } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const messageId = body.data.message.id;

    expect(sent).toHaveLength(1);
    expect(sent[0].endpoint).toContain(`supb-${stamp}`);
    expect(sent[0].options?.urgency).toBe("high");
    expect(JSON.parse(sent[0].payload)).toMatchObject({
      title: "New message from Supervisor Alpha",
      body: "Cement truck reached Gate 2",
      href: "/chat",
      tag: `chat:${messageId}`,
    });

    // Unread chat items are already computed dynamically in GET /api/notifications
    const notifAfter = await prisma.notification.count({ where: { organizationId: ids.org } });
    expect(notifAfter).toBe(notifBefore);
  });

  it("2. Sends Web Push notifications when ReminderService delivers due task reminders", async () => {
    const task = await prisma.task.create({
      data: {
        organizationId: ids.org,
        projectId: ids.project,
        title: "Verify Bar Bending",
        createdBy: ids.admin,
        assigneeUserId: ids.supB,
        status: "IN_PROGRESS",
        priority: "HIGH",
        reminderAt: new Date(Date.now() - 60_000),
      },
    });

    const delivered = await ReminderService.deliverDueReminders(ids.org);
    expect(delivered).toBe(1);
    expect(sent.length).toBe(2); // both admin & supB have subscriptions
    const supPush = sent.find((s) => s.endpoint.includes(`supb-${stamp}`));
    expect(supPush).toBeDefined();
    expect(supPush!.options?.urgency).toBe("high");
    expect(JSON.parse(supPush!.payload)).toMatchObject({
      title: "Task Reminder: Verify Bar Bending",
      href: `/tasks?projectId=${ids.project}`,
      tag: `TASK_REMINDER:${task.id}`,
    });
  });

  it("3. Sends mobile push notifications for work reports, daily site reports, and valid order hrefs (no /orders 404)", async () => {
    const reportDate = istDateKey();
    await WorkReportService.submit(ids.org, ids.supA, {
      reportDate,
      summary: "Plinth beam casting completed cleanly",
      projectId: ids.project,
    });
    expect(sent.some((s) => s.endpoint.includes(`admin-${stamp}`) && s.payload.includes("WORK_REPORT"))).toBe(true);

    sent.length = 0;
    asUser(ids.supA, "SITE_SUPERVISOR", "Supervisor Alpha");
    const dsrRes = await submitDailyReport(
      makeReq("/api/daily-reports", "POST", {
        projectId: ids.project,
        reportDate,
        progress: "20 cubic meters concrete poured",
      })
    );
    expect(dsrRes.status).toBe(201);
    expect(
      sent.some((s) => s.endpoint.includes(`admin-${stamp}`) && JSON.parse(s.payload).href === "/day-book")
    ).toBe(true);

    sent.length = 0;
    const orderRes = await placeOrder(
      makeReq("/api/orders", "POST", {
        vendorPartyId: ids.vendor,
        materialId: ids.material,
        siteId: ids.site,
        quantity: 100,
        unitCode: "KG",
      })
    );
    expect(orderRes.status).toBe(200);
    const orderPush = sent.find((s) => s.endpoint.includes(`admin-${stamp}`));
    expect(orderPush).toBeDefined();
    expect(JSON.parse(orderPush!.payload).href).toBe("/admin");
  });

  it("4. Supports logout detachment (DELETE /api/push) and safe re-claim on shared mobile devices", async () => {
    const sharedEndpoint = `https://fcm.googleapis.com/fcm/send/shared-phone-${stamp}`;

    asUser(ids.supA, "SITE_SUPERVISOR", "Supervisor Alpha");
    const subA = await pushSubscribe(
      makeReq("/api/push", "POST", {
        endpoint: sharedEndpoint,
        keys: { p256dh: "k".repeat(24), auth: "z".repeat(16) },
      })
    );
    expect(subA.status).toBe(201);

    // Without logging out/detaching first, cross-user hijack of another user's endpoint stays 403
    asUser(ids.supB, "SITE_SUPERVISOR", "Supervisor Beta");
    const blocked = await pushSubscribe(
      makeReq("/api/push", "POST", {
        endpoint: sharedEndpoint,
        keys: { p256dh: "m".repeat(24), auth: "w".repeat(16) },
      })
    );
    expect(blocked.status).toBe(403);

    // When User A logs out, DELETE /api/push detaches their mapping so User B can subscribe cleanly
    asUser(ids.supA, "SITE_SUPERVISOR", "Supervisor Alpha");
    const delA = await pushDelete(makeReq(`/api/push?endpoint=${encodeURIComponent(sharedEndpoint)}`, "DELETE"));
    expect(delA.status).toBe(200);

    asUser(ids.supB, "SITE_SUPERVISOR", "Supervisor Beta");
    const subB = await pushSubscribe(
      makeReq("/api/push", "POST", {
        endpoint: sharedEndpoint,
        keys: { p256dh: "k".repeat(24), auth: "z".repeat(16) },
      })
    );
    expect(subB.status).toBe(201);
  });

  it("5. Service Worker and mobile notification client helpers avoid Android/iOS runtime crashes and dead links", () => {
    const sw = fs.readFileSync(path.join(ROOT, "public/sw.js"), "utf8");
    const pushClient = fs.readFileSync(path.join(ROOT, "src/lib/push-client.ts"), "utf8");
    const provider = fs.readFileSync(path.join(ROOT, "src/components/providers/AppSessionProvider.tsx"), "utf8");
    const ordersRoute = fs.readFileSync(path.join(ROOT, "src/app/api/orders/route.ts"), "utf8");
    const approveOrderRoute = fs.readFileSync(path.join(ROOT, "src/app/api/orders/[id]/approve/route.ts"), "utf8");
    const rejectOrderRoute = fs.readFileSync(path.join(ROOT, "src/app/api/orders/[id]/reject/route.ts"), "utf8");

    // SW must only pass renotify when a non-empty tag exists (Chromium TypeError otherwise)
    expect(sw).toContain("cleanTag ? { tag: cleanTag, renotify: true } : {}");
    expect(sw).not.toContain('url.pathname.startsWith("/api/")');
    expect(sw).toContain('url.pathname === "/api/auth/me"');

    // AppSessionProvider uses ServiceWorkerRegistration.showNotification wrapper instead of raw `new Notification`
    expect(provider).toContain("showDeviceNotification");
    expect(provider).not.toContain("new Notification(");
    expect(pushClient).toContain("reg?.showNotification");
    expect(pushClient).toContain("res.status === 403");

    // No dead /orders hrefs remain
    expect(ordersRoute).not.toContain('href: "/orders"');
    expect(approveOrderRoute).not.toContain('href: "/orders"');
    expect(rejectOrderRoute).not.toContain('href: "/orders"');
  });
});
