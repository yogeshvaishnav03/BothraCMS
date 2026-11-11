import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { PATCH as updateUser } from "@/app/api/users/[id]/route";
import { GET as listUsers } from "@/app/api/users/route";
import { GET as authMe } from "@/app/api/auth/me/route";
import { PATCH as patchWorker } from "@/app/api/workforce/route";
import { GET as attendanceHistory } from "@/app/api/attendance/history/route";
import { POST as placeOrder } from "@/app/api/orders/route";
import { fetchDayBookData } from "@/services/day-book-service";
import { CommandCenterService } from "@/services/command-center-service";
import { istDateKey } from "@/lib/ist-date";
import { hasPermission, canUser } from "@/lib/permissions";
import { InventoryService } from "@/services/inventory-service";

const stamp = Date.now();
const ROOT = path.resolve(__dirname, "../..");
const ids: Record<string, string> = {};

function makeReq(urlPath: string, method = "GET", body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Cookie"] = `${SESSION_COOKIE_NAME}=${token}`;
  return new NextRequest(`http://localhost:3000${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function asUser(userId: string, role = "ORG_ADMIN", name = "Org Owner") {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId,
    organizationId: ids.org,
    email: `${userId}@name-access.test.local`,
    name,
    role: role as any,
    organizationName: "Name & Access Test Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

describe("Staff/Workforce Name Synchronization & Per-Employee Extra Accessibility", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `Name & Access Org ${stamp}`, status: "ACTIVE" },
    });
    ids.org = org.id;

    const owner = await prisma.user.create({
      data: {
        organizationId: ids.org,
        name: "Org Owner",
        email: `owner-${stamp}@name-access.test.local`,
        passwordHash: "x",
        role: "ORG_ADMIN",
        status: "ACTIVE",
      },
    });
    ids.owner = owner.id;

    const vikram = await prisma.user.create({
      data: {
        organizationId: ids.org,
        name: "Vikram Malhotra",
        email: `vikram-${stamp}@name-access.test.local`,
        passwordHash: "x",
        role: "SITE_SUPERVISOR",
        status: "ACTIVE",
      },
    });
    ids.vikram = vikram.id;

    const arjun = await prisma.user.create({
      data: {
        organizationId: ids.org,
        name: "Arjun Already Renamed",
        email: `arjun-${stamp}@name-access.test.local`,
        passwordHash: "x",
        role: "PROJECT_MANAGER",
        status: "ACTIVE",
      },
    });
    ids.arjun = arjun.id;

    const pooja = await prisma.user.create({
      data: {
        organizationId: ids.org,
        name: "Pooja Sharma",
        email: `pooja-${stamp}@name-access.test.local`,
        passwordHash: "x",
        role: "ACCOUNTANT",
        status: "ACTIVE",
      },
    });
    ids.pooja = pooja.id;

    const site = await prisma.site.create({
      data: {
        organizationId: ids.org,
        name: "Skyline Yard",
        code: `SY-${stamp}`,
        address: "Plot 12, Noida",
      },
    });
    ids.site = site.id;

    const store = await prisma.store.create({
      data: { organizationId: ids.org, siteId: ids.site, name: "Main Store" },
    });
    ids.store = store.id;

    const vendor = await prisma.party.create({
      data: { organizationId: ids.org, name: "Vendor Access", partyType: "VENDOR" },
    });
    ids.vendor = vendor.id;

    const material = await prisma.material.create({
      data: { organizationId: ids.org, name: "PPC Cement", sku: `PPC-${stamp}`, unitCode: "BAG" },
    });
    ids.material = material.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await prisma.organization.delete({ where: { id: ids.org } }).catch(() => {});
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("1. Renaming a user syncs linked WorkforceMember and Headcount names immediately in Day Book & Command Center", async () => {
    const today = istDateKey();

    // Seed stale linked WorkforceMember for Vikram + pre-existing stale WorkforceMember for Arjun (already renamed in User)
    const wmVikram = await prisma.workforceMember.create({
      data: {
        organizationId: ids.org,
        employeeCode: `USR-${ids.vikram.slice(-6).toUpperCase()}`,
        name: "Vikram Malhotra",
        workerType: "FOREMAN",
        defaultSiteId: ids.site,
      },
    });
    ids.wmVikram = wmVikram.id;

    const wmArjun = await prisma.workforceMember.create({
      data: {
        organizationId: ids.org,
        employeeCode: `USR-${ids.arjun.slice(-6).toUpperCase()}`,
        name: "Arjun Verma", // intentional stale name while User already says "Arjun Already Renamed"
        workerType: "SITE_ENGINEER",
        defaultSiteId: ids.site,
      },
    });
    ids.wmArjun = wmArjun.id;

    const wmBhawani = await prisma.workforceMember.create({
      data: {
        organizationId: ids.org,
        employeeCode: `WF-${stamp.toString().slice(-4)}`,
        name: "Bhawani Singh Rathore",
        workerType: "SITE_ENGINEER",
        defaultSiteId: ids.site,
      },
    });
    ids.wmBhawani = wmBhawani.id;

    await prisma.attendanceSession.createMany({
      data: [
        {
          organizationId: ids.org,
          workforceMemberId: wmVikram.id,
          siteId: ids.site,
          workDate: today,
          checkInAt: new Date(),
          status: "PRESENT",
          createdBy: ids.vikram,
        },
        {
          organizationId: ids.org,
          workforceMemberId: wmArjun.id,
          siteId: ids.site,
          workDate: today,
          checkInAt: new Date(),
          status: "PRESENT",
          createdBy: ids.arjun,
        },
        {
          organizationId: ids.org,
          workforceMemberId: wmBhawani.id,
          siteId: ids.site,
          workDate: today,
          checkInAt: new Date(),
          status: "PRESENT",
          createdBy: ids.owner,
        },
      ],
    });

    await prisma.workforceHeadcount.create({
      data: {
        organizationId: ids.org,
        siteId: ids.site,
        siteName: "Skyline Yard",
        date: today,
        shift: "DAY",
        contractorName: "Direct",
        grandTotal: 10,
        supervisorId: ids.vikram,
        supervisorName: "Vikram Malhotra",
      },
    });

    // Rename Vikram Malhotra -> Vikram Rathore via PATCH /api/users/[id]
    asUser(ids.owner, "ORG_ADMIN", "Org Owner");
    const renameRes = await updateUser(
      makeReq(`/api/users/${ids.vikram}`, "PATCH", { name: "Vikram Rathore" }),
      { params: { id: ids.vikram } }
    );
    expect(renameRes.status).toBe(200);

    // Linked WorkforceMember and WorkforceHeadcount should sync automatically
    const updatedWm = await prisma.workforceMember.findUnique({ where: { id: wmVikram.id } });
    expect(updatedWm?.name).toBe("Vikram Rathore");
    const hc = await prisma.workforceHeadcount.findFirst({
      where: { organizationId: ids.org, supervisorId: ids.vikram },
    });
    expect(hc?.supervisorName).toBe("Vikram Rathore");

    // Rename standalone SITE_ENGINEER Bhawani Singh Rathore via PATCH /api/workforce
    const editWorkerRes = await patchWorker(
      makeReq("/api/workforce", "PATCH", {
        id: wmBhawani.id,
        name: "Bhawani Rathore Updated",
      })
    );
    expect(editWorkerRes.status).toBe(200);

    // Day Book & Command Center timeline resolve BOTH newly-renamed and already-renamed USR- staff + edited worker
    const dayBook = await fetchDayBookData(ids.org, today);
    const staffNames = dayBook.attendance.map((a: any) => a.name);
    expect(staffNames).toContain("Vikram Rathore");
    expect(staffNames).toContain("Arjun Already Renamed");
    expect(staffNames).toContain("Bhawani Rathore Updated");
    expect(staffNames).not.toContain("Vikram Malhotra");
    expect(staffNames).not.toContain("Arjun Verma");
    expect(staffNames).not.toContain("Bhawani Singh Rathore");

    const overview = await CommandCenterService.getOverview(ids.org, today);
    const attTitles = overview.timeline.filter((e) => e.kind === "ATTENDANCE").map((e) => e.title);
    expect(attTitles).toContain("Vikram Rathore checked in");
    expect(attTitles).toContain("Arjun Already Renamed checked in");
    expect(attTitles).toContain("Bhawani Rathore Updated checked in");
    const arjunEntry = overview.timeline.find((e) => e.title === "Arjun Already Renamed checked in");
    expect(arjunEntry?.detail).toContain("Skyline Yard");

    // Attendance history also resolves Arjun's live User.name
    const histRes = await attendanceHistory(makeReq("/api/attendance/history?scope=all"));
    expect(histRes.status).toBe(200);
    const histJson = await histRes.json();
    const arjunSession = histJson.data.sessions.find((s: any) => s.workforceMember?.id === wmArjun.id);
    expect(arjunSession?.employeeName).toBe("Arjun Already Renamed");
  });

  it("2. Admin can grant custom extraPermissions to an employee beyond their role and enforce them across API + /api/auth/me", async () => {
    asUser(ids.owner, "ORG_ADMIN", "Org Owner");

    // Initially, Pooja (ACCOUNTANT) lacks attendance:write and inventory:receipt
    const patchRes = await updateUser(
      makeReq(`/api/users/${ids.pooja}`, "PATCH", {
        extraPermissions: ["attendance:write", "attendance:correct", "inventory:receipt"],
      }),
      { params: { id: ids.pooja } }
    );
    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.data.extraPermissions).toEqual([
      "attendance:write",
      "attendance:correct",
      "inventory:receipt",
    ]);

    const listRes = await listUsers(makeReq("/api/users"));
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    const poojaRow = listBody.data.find((u: any) => u.id === ids.pooja);
    expect(poojaRow.extraPermissions).toEqual([
      "attendance:write",
      "attendance:correct",
      "inventory:receipt",
    ]);

    // Real session cookie check -> getUserContext merges base role + extraPermissions from DB
    const poojaToken = await createSessionToken({
      userId: ids.pooja,
      organizationId: ids.org,
      email: `pooja-${stamp}@name-access.test.local`,
      name: "Pooja Sharma",
      role: "ACCOUNTANT",
    });

    const meRes = await authMe(makeReq("/api/auth/me", "GET", undefined, poojaToken));
    expect(meRes.status).toBe(200);
    const meJson = await meRes.json();
    expect(meJson.data.user.role).toBe("ACCOUNTANT");
    expect(meJson.data.user.extraPermissions).toEqual([
      "attendance:write",
      "attendance:correct",
      "inventory:receipt",
    ]);
    expect(meJson.data.user.permissions).toContain("finance:write"); // from base role
    expect(meJson.data.user.permissions).toContain("attendance:write"); // granted extra
    expect(meJson.data.user.permissions).toContain("inventory:receipt"); // granted extra
    expect(canUser(meJson.data.user, "inventory:receipt")).toBe(true);
    expect(canUser(meJson.data.user, "sites:manage")).toBe(false);

    // Extra permission works on Order creation (requires inventory:receipt or projects:write)
    const orderRes = await placeOrder(
      makeReq(
        "/api/orders",
        "POST",
        {
          vendorPartyId: ids.vendor,
          materialId: ids.material,
          siteId: ids.site,
          quantity: 25,
          unitCode: "BAG",
        },
        poojaToken
      )
    );
    expect(orderRes.status).toBe(200);

    // Extra permission works in InventoryService.receiveGoods
    const receiptRes = await InventoryService.receiveGoods({
      organizationId: ids.org,
      storeId: ids.store,
      items: [{ materialId: ids.material, quantity: 10 }],
      userId: ids.pooja,
      role: "ACCOUNTANT",
      permissions: meJson.data.user.permissions,
    });
    expect(receiptRes.movements).toHaveLength(1);

    // Ungranted permissions remain strictly blocked
    expect(hasPermission(meJson.data.user, "sites:manage")).toBe(false);

    // Unknown permission rejected with 422
    asUser(ids.owner, "ORG_ADMIN", "Org Owner");
    const badPerm = await updateUser(
      makeReq(`/api/users/${ids.pooja}`, "PATCH", {
        extraPermissions: ["nonexistent:perm"],
      }),
      { params: { id: ids.pooja } }
    );
    expect(badPerm.status).toBe(422);

    // Clearing extraPermissions reverts user cleanly back to base role
    const clearRes = await updateUser(
      makeReq(`/api/users/${ids.pooja}`, "PATCH", { extraPermissions: [] }),
      { params: { id: ids.pooja } }
    );
    expect(clearRes.status).toBe(200);
    const meAfterClear = await authMe(makeReq("/api/auth/me", "GET", undefined, poojaToken));
    const meAfterJson = await meAfterClear.json();
    expect(meAfterJson.data.user.extraPermissions).toEqual([]);
    expect(meAfterJson.data.user.permissions).not.toContain("attendance:write");
  });

  it("3. Team modal, Workforce directory, and schema include extra accessibility and worker editing support", () => {
    const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
    const migration = fs.readFileSync(path.join(ROOT, "scripts/apply-postgres-migration.js"), "utf8");
    const teamPage = fs.readFileSync(path.join(ROOT, "src/app/team/page.tsx"), "utf8");
    const workforcePage = fs.readFileSync(path.join(ROOT, "src/app/workforce/page.tsx"), "utf8");
    const shell = fs.readFileSync(path.join(ROOT, "src/components/layout/Shell.tsx"), "utf8");

    expect(schema).toContain("extraPermissionsJson");
    expect(migration).toContain("extraPermissionsJson");
    expect(teamPage).toContain("EXTRA_ACCESS_MODULES");
    expect(teamPage).toContain("Extra Accessibility");
    expect(teamPage).toContain("refreshUser(true)");
    expect(workforcePage).toContain("openEditWorkerModal");
    expect(workforcePage).toContain('method: editingWorker ? "PATCH" : "POST"');
    expect(shell).toContain('canUser(user, "users:manage")');
  });
});
