import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionToken } from "@/lib/auth";
import { InventoryService } from "@/services/inventory-service";
import { GET as getSitesHandler } from "@/app/api/sites/route";
import { GET as getConversationsHandler } from "@/app/api/chat/conversations/route";

describe("Performance Optimizations & Regression Suite", () => {
  const orgId = "org-perf-test-" + Date.now();
  const userId = "user-perf-admin-" + Date.now();
  const otherUserId = "user-perf-staff-" + Date.now();
  let siteId = "";
  let storeId = "";
  let matNormalId = "";
  let matLowId = "";
  let matZeroId = "";
  let adminToken = "";

  let trackQueries = false;
  const queryCounts: Record<string, number> = {};

  function resetQueryCounts() {
    for (const k of Object.keys(queryCounts)) delete queryCounts[k];
  }
  function qCount(model: string, action: string) {
    return queryCounts[`${model}.${action}`] || 0;
  }

  beforeAll(() => {
    (prisma as any).$use(async (params: any, next: any) => {
      if (trackQueries && params.model && params.action) {
        const key = `${params.model}.${params.action}`;
        queryCounts[key] = (queryCounts[key] || 0) + 1;
      }
      return next(params);
    });
  });

  async function cleanup() {
    await prisma.chatMessage.deleteMany({ where: { conversation: { organizationId: orgId } } }).catch(() => {});
    await prisma.conversationParticipant.deleteMany({ where: { conversation: { organizationId: orgId } } }).catch(() => {});
    await prisma.conversation.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.auditEvent.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.idempotencyRecord.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.stockMovement.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.stockBalance.deleteMany({ where: { store: { organizationId: orgId } } }).catch(() => {});
    await prisma.project.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.material.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.store.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.site.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
  }

  beforeEach(async () => {
    trackQueries = false;
    resetQueryCounts();
    await cleanup();

    await prisma.organization.create({
      data: { id: orgId, name: "Performance Test Org", status: "ACTIVE" },
    });

    await prisma.user.create({
      data: {
        id: userId,
        organizationId: orgId,
        name: "Perf Admin",
        email: `perf-admin-${Date.now()}@test.local`,
        role: "ORG_ADMIN",
        status: "ACTIVE",
        passwordHash: "hash",
      },
    });

    await prisma.user.create({
      data: {
        id: otherUserId,
        organizationId: orgId,
        name: "Perf Staff",
        email: `perf-staff-${Date.now()}@test.local`,
        role: "SITE_SUPERVISOR",
        status: "ACTIVE",
        passwordHash: "hash",
      },
    });

    adminToken = await createSessionToken({
      userId,
      organizationId: orgId,
      email: "perf-admin@test.local",
      name: "Perf Admin",
      role: "ORG_ADMIN",
    });

    const site = await prisma.site.create({
      data: {
        organizationId: orgId,
        name: "North Tower Site",
        code: "NT-01",
        address: "Sector 10",
        status: "ACTIVE",
      },
    });
    siteId = site.id;

    const store = await prisma.store.create({
      data: {
        organizationId: orgId,
        siteId: site.id,
        name: "North Store",
        status: "ACTIVE",
      },
    });
    storeId = store.id;

    const [m1, m2, m3] = await Promise.all([
      prisma.material.create({
        data: {
          organizationId: orgId,
          sku: "PERF-CEM",
          name: "Cement 53G",
          unitCode: "BAG",
          minStockQty: 20,
          active: true,
        },
      }),
      prisma.material.create({
        data: {
          organizationId: orgId,
          sku: "PERF-STL",
          name: "TMT Steel 16mm",
          unitCode: "KG",
          minStockQty: 100,
          active: true,
        },
      }),
      prisma.material.create({
        data: {
          organizationId: orgId,
          sku: "PERF-SND",
          name: "River Sand",
          unitCode: "CFT",
          minStockQty: 50,
          active: true,
        },
      }),
    ]);
    matNormalId = m1.id;
    matLowId = m2.id;
    matZeroId = m3.id;
  });

  afterAll(async () => {
    trackQueries = false;
    await cleanup();
  });

  it("1. getAuthoritativeStockSummary uses 1 batched groupBy, heals drift once, and performs 0 DB writes in steady state", async () => {
    await InventoryService.receiveGoods({
      organizationId: orgId,
      storeId,
      items: [
        { materialId: matNormalId, quantity: 60 },
        { materialId: matLowId, quantity: 40 },
      ],
      userId,
      role: "ORG_ADMIN",
    });

    // Inject balance drift into StockBalance
    await prisma.stockBalance.updateMany({
      where: { materialId: matNormalId, storeId },
      data: { quantityOnHand: 999 },
    });

    // Pass 1: should detect drift, heal once via update, and use 0 aggregate calls
    resetQueryCounts();
    trackQueries = true;
    const pass1 = await InventoryService.getAuthoritativeStockSummary(orgId, siteId);
    trackQueries = false;

    expect(qCount("StockMovement", "aggregate")).toBe(0);
    expect(qCount("StockMovement", "groupBy")).toBe(1);
    expect(qCount("StockBalance", "update")).toBe(1);

    const cem1 = pass1.find((m) => m.id === matNormalId);
    const stl1 = pass1.find((m) => m.id === matLowId);
    const snd1 = pass1.find((m) => m.id === matZeroId);
    expect(cem1?.availableStock).toBe(60);
    expect(cem1?.isLowStock).toBe(false);
    expect(stl1?.availableStock).toBe(40);
    expect(stl1?.isLowStock).toBe(true);
    expect(snd1?.availableStock).toBe(0);
    expect(snd1?.isZeroStock).toBe(true);

    // Verify DB balance is healed
    const healedBalance = await prisma.stockBalance.findUnique({
      where: { materialId_storeId: { materialId: matNormalId, storeId } },
    });
    expect(healedBalance?.quantityOnHand).toBe(60);

    // Pass 2 (steady state): 0 StockBalance writes
    resetQueryCounts();
    trackQueries = true;
    const pass2 = await InventoryService.getAuthoritativeStockSummary(orgId, siteId);
    trackQueries = false;

    expect(qCount("StockMovement", "aggregate")).toBe(0);
    expect(qCount("StockMovement", "groupBy")).toBe(1);
    expect(qCount("StockBalance", "update")).toBe(0);
    expect(pass2.find((m) => m.id === matNormalId)?.availableStock).toBe(60);
  });

  it("2. getLowStockAlerts computes exact alerts from StockMovement without writing to StockBalance", async () => {
    await InventoryService.receiveGoods({
      organizationId: orgId,
      storeId,
      items: [
        { materialId: matNormalId, quantity: 30 },
        { materialId: matLowId, quantity: 50 },
      ],
      userId,
      role: "ORG_ADMIN",
    });

    // Drift balance row — getLowStockAlerts must still trust ledger and execute 0 writes
    await prisma.stockBalance.updateMany({
      where: { materialId: matLowId, storeId },
      data: { quantityOnHand: 5000 },
    });

    resetQueryCounts();
    trackQueries = true;
    const alerts = await InventoryService.getLowStockAlerts(orgId);
    trackQueries = false;

    expect(qCount("StockMovement", "aggregate")).toBe(0);
    expect(qCount("StockMovement", "groupBy")).toBe(1);
    expect(qCount("StockBalance", "update")).toBe(0);

    const ids = alerts.map((a) => a.id).sort();
    expect(ids).toEqual([matLowId, matZeroId].sort());
    expect(alerts.find((a) => a.id === matZeroId)?.alertSeverity).toBe("CRITICAL");
    expect(alerts.find((a) => a.id === matLowId)?.alertSeverity).toBe("WARNING");
  });

  it("3. GET /api/sites?compact=1 returns slim site metadata with _count and omits nested stores/projects", async () => {
    await prisma.project.create({
      data: {
        organizationId: orgId,
        siteId,
        code: "PRJ-COMP-1",
        name: "Tower A",
        status: "IN_PROGRESS",
      },
    });

    const compactReq = new NextRequest("http://localhost:3000/api/sites?compact=1", {
      method: "GET",
      headers: { Cookie: `buildtrack_session=${adminToken}` },
    });
    const compactRes = await getSitesHandler(compactReq);
    const compactJson = await compactRes.json();

    expect(compactRes.status).toBe(200);
    expect(compactJson.success).toBe(true);
    expect(compactJson.data).toHaveLength(1);
    expect(compactJson.data[0]).toMatchObject({
      id: siteId,
      name: "North Tower Site",
      code: "NT-01",
      _count: { projects: 1, workforceMembers: 0 },
    });
    expect(compactJson.data[0].stores).toBeUndefined();
    expect(compactJson.data[0].projects).toBeUndefined();

    // Full mode still includes nested stores & projects for /projects page
    const fullReq = new NextRequest("http://localhost:3000/api/sites", {
      method: "GET",
      headers: { Cookie: `buildtrack_session=${adminToken}` },
    });
    const fullRes = await getSitesHandler(fullReq);
    const fullJson = await fullRes.json();
    expect(fullRes.status).toBe(200);
    expect(Array.isArray(fullJson.data[0].stores)).toBe(true);
    expect(Array.isArray(fullJson.data[0].projects)).toBe(true);
  });

  it("4. GET /api/chat/conversations batches unread counts without N+1 chatMessage.count calls", async () => {
    const t0 = new Date("2026-10-01T10:00:00.000Z");
    const t1 = new Date("2026-10-01T10:05:00.000Z");
    const t2 = new Date("2026-10-01T10:10:00.000Z");

    // Conv A: lastReadAt = null -> 2 msgs from otherUser, 1 from user -> unread 2
    const convA = await prisma.conversation.create({
      data: { organizationId: orgId, type: "GROUP", name: "Group A", createdById: userId },
    });
    // Conv B: lastReadAt = t1 -> 1 msg at t0 (read), 1 msg at t2 (unread) -> unread 1
    const convB = await prisma.conversation.create({
      data: { organizationId: orgId, type: "GROUP", name: "Group B", createdById: userId },
    });
    // Conv C: lastReadAt = t2 -> 1 msg at t0 (read) -> unread 0
    const convC = await prisma.conversation.create({
      data: { organizationId: orgId, type: "GROUP", name: "Group C", createdById: userId },
    });

    await prisma.conversationParticipant.createMany({
      data: [
        { conversationId: convA.id, userId, lastReadAt: null },
        { conversationId: convA.id, userId: otherUserId },
        { conversationId: convB.id, userId, lastReadAt: t1 },
        { conversationId: convB.id, userId: otherUserId },
        { conversationId: convC.id, userId, lastReadAt: t2 },
        { conversationId: convC.id, userId: otherUserId },
      ],
    });

    await prisma.chatMessage.createMany({
      data: [
        { conversationId: convA.id, senderId: otherUserId, content: "m1", createdAt: t0 },
        { conversationId: convA.id, senderId: otherUserId, content: "m2", createdAt: t1 },
        { conversationId: convA.id, senderId: userId, content: "own", createdAt: t2 },
        { conversationId: convB.id, senderId: otherUserId, content: "old", createdAt: t0 },
        { conversationId: convB.id, senderId: otherUserId, content: "new", createdAt: t2 },
        { conversationId: convB.id, senderId: userId, content: "ownNew", createdAt: t2 },
        { conversationId: convC.id, senderId: otherUserId, content: "seen", createdAt: t0 },
      ],
    });

    resetQueryCounts();
    trackQueries = true;
    const req = new NextRequest("http://localhost:3000/api/chat/conversations", {
      method: "GET",
      headers: { Cookie: `buildtrack_session=${adminToken}` },
    });
    const res = await getConversationsHandler(req);
    trackQueries = false;
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(qCount("ChatMessage", "count")).toBe(0);

    const byId = new Map((json.data.conversations as any[]).map((c) => [c.id, c]));
    expect(byId.get(convA.id)?.unreadCount).toBe(2);
    expect(byId.get(convB.id)?.unreadCount).toBe(1);
    expect(byId.get(convC.id)?.unreadCount).toBe(0);
  });

  it("5. Frontend & SW guards eliminate blocking splash, duplicate polling/fetches, render-blocking fonts, and SW API cache churn", () => {
    const root = path.resolve(__dirname, "../..");
    const shell = fs.readFileSync(path.join(root, "src/components/layout/Shell.tsx"), "utf8");
    const banner = fs.readFileSync(path.join(root, "src/components/layout/NotificationBanner.tsx"), "utf8");
    const provider = fs.readFileSync(path.join(root, "src/components/providers/AppSessionProvider.tsx"), "utf8");
    const home = fs.readFileSync(path.join(root, "src/app/page.tsx"), "utf8");
    const layout = fs.readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
    const sw = fs.readFileSync(path.join(root, "public/sw.js"), "utf8");

    expect(shell).toContain("useAppSession");
    expect(shell).toContain("hasClearedDevSwThisLoad");
    expect(shell).toContain("document.hidden");
    expect(shell).not.toContain("if (loading) {");

    expect(banner).toContain("hasAutoSyncedPushThisSession");
    expect(banner).toContain("shouldShowIosPushInstallPrompt");

    expect(provider).toContain("30_000");
    expect(provider).toContain("document.hidden");
    expect(provider).toContain("/api/sites?compact=1");
    expect(provider).toContain("inflightAuthRef");
    expect(provider).toContain("inflightSitesRef");

    expect(home).not.toContain('fetch("/api/materials"');
    expect(home).not.toContain("fetch('/api/materials'");

    expect(layout).toContain("GoogleFontsLoader");
    expect(layout).toContain("AppSessionProvider");
    expect(layout).not.toContain('rel="stylesheet"');

    expect(sw).not.toContain('url.pathname.startsWith("/api/")');
    expect(sw).toContain('url.pathname === "/api/auth/me"');
  });
});
