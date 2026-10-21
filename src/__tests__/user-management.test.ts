import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import * as auth from "@/lib/auth";
import { verifyPassword } from "@/lib/auth";
import { GET as listUsers, POST as createUser } from "@/app/api/users/route";
import { PATCH as updateUser } from "@/app/api/users/[id]/route";
import { POST as resetPassword } from "@/app/api/users/[id]/reset-password/route";

let orgId = "";
let adminId = "";
const stamp = Date.now();

function as(role: string, userId = adminId) {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId,
    organizationId: orgId,
    email: "owner@test.local",
    name: "Owner",
    role: role as any,
    organizationName: "Users Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

const req = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost:3000${path}`, { method, body: body ? JSON.stringify(body) : undefined });

describe("User management", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `Users Org ${stamp}` } });
    orgId = org.id;
    const admin = await prisma.user.create({
      data: { organizationId: orgId, name: "Owner", email: `owner-${stamp}@test.local`, passwordHash: "x", role: "ORG_ADMIN" },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    if (orgId) await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  beforeEach(() => vi.restoreAllMocks());

  let engineerId = "";

  it("an admin adds a staff member and gets a one-time password that works", async () => {
    as("ORG_ADMIN");
    const res = await createUser(
      req("/api/users", "POST", {
        name: "Priya Engineer",
        email: `Priya-${stamp}@Test.local`,
        role: "PROJECT_MANAGER",
        phone: "98290 12345",
        jobTitle: "Site Engineer",
      })
    );
    const json = await res.json();
    expect(res.status).toBe(201);
    engineerId = json.data.user.id;
    expect(json.data.user.email).toBe(`priya-${stamp}@test.local`);
    expect(json.data.user.passwordHash).toBeUndefined();

    const row = await prisma.user.findUnique({ where: { id: engineerId } });
    expect(await verifyPassword(json.data.temporaryPassword, row!.passwordHash)).toBe(true);
    expect(await prisma.auditEvent.count({ where: { entityId: engineerId, action: "USER_CREATED" } })).toBe(1);
  });

  it("refuses a duplicate email", async () => {
    as("ORG_ADMIN");
    const res = await createUser(req("/api/users", "POST", { name: "Dup", email: `priya-${stamp}@test.local`, role: "AUDITOR" }));
    expect(res.status).toBe(409);
  });

  it("an Org Admin cannot create a Super Admin", async () => {
    as("ORG_ADMIN");
    const res = await createUser(req("/api/users", "POST", { name: "Boss", email: `boss-${stamp}@test.local`, role: "SUPER_ADMIN" }));
    expect(res.status).toBe(403);
  });

  it("non-admins cannot list or manage users", async () => {
    as("PROJECT_MANAGER", engineerId);
    expect((await listUsers(req("/api/users"))).status).toBe(403);
    expect((await updateUser(req(`/api/users/${adminId}`, "PATCH", { status: "INACTIVE" }), { params: { id: adminId } })).status).toBe(403);
  });

  it("changes a role and deactivates, with audit entries; the last admin is protected", async () => {
    as("ORG_ADMIN");
    const roleRes = await updateUser(req(`/api/users/${engineerId}`, "PATCH", { role: "ACCOUNTANT" }), { params: { id: engineerId } });
    expect((await roleRes.json()).data.role).toBe("ACCOUNTANT");

    const offRes = await updateUser(req(`/api/users/${engineerId}`, "PATCH", { status: "INACTIVE" }), { params: { id: engineerId } });
    expect((await offRes.json()).data.status).toBe("INACTIVE");

    const actions = (await prisma.auditEvent.findMany({ where: { entityId: engineerId }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["ROLE_CHANGED", "USER_DEACTIVATED"]));

    // The owner cannot deactivate or demote themselves.
    expect((await updateUser(req(`/api/users/${adminId}`, "PATCH", { status: "INACTIVE" }), { params: { id: adminId } })).status).toBe(403);
    expect((await updateUser(req(`/api/users/${adminId}`, "PATCH", { role: "AUDITOR" }), { params: { id: adminId } })).status).toBe(403);
  });

  it("resets a password to a new one-time password", async () => {
    as("ORG_ADMIN");
    const res = await resetPassword(req(`/api/users/${engineerId}/reset-password`, "POST"), { params: { id: engineerId } });
    const json = await res.json();
    const row = await prisma.user.findUnique({ where: { id: engineerId } });
    expect(await verifyPassword(json.data.temporaryPassword, row!.passwordHash)).toBe(true);
  });

  it("cannot touch users in another company", async () => {
    const other = await prisma.organization.create({ data: { name: `Other ${stamp}` } });
    const stranger = await prisma.user.create({
      data: { organizationId: other.id, name: "Stranger", email: `stranger-${stamp}@test.local`, passwordHash: "x", role: "AUDITOR" },
    });
    as("ORG_ADMIN");
    const res = await updateUser(req(`/api/users/${stranger.id}`, "PATCH", { status: "INACTIVE" }), { params: { id: stranger.id } });
    expect(res.status).toBe(404);
    await prisma.organization.delete({ where: { id: other.id } });
  });
});
