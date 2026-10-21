import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../lib/db";
import { hashPassword, verifyPassword, createSessionToken } from "../lib/auth";
import { POST } from "../app/api/auth/change-password/route";
import { NextRequest } from "next/server";

describe("Password Change API Endpoint (/api/auth/change-password)", () => {
  let orgId: string;
  let userId: string;
  let userEmail: string;
  let sessionToken: string;
  const initialPassword = "InitialPassword123!";
  const newValidPassword = "NewStrongPassword456!";

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: `Password Test Org ${Date.now()}`,
        currency: "INR",
        timezone: "Asia/Kolkata",
      },
    });
    orgId = org.id;

    const pwdHash = await hashPassword(initialPassword);
    userEmail = `pwd-test-${Date.now()}@buildtrack.test`;

    const user = await prisma.user.create({
      data: {
        organizationId: orgId,
        name: "Password Test User",
        email: userEmail,
        passwordHash: pwdHash,
        role: "SITE_SUPERVISOR",
        status: "ACTIVE",
      },
    });
    userId = user.id;

    sessionToken = await createSessionToken({
      userId,
      organizationId: orgId,
      email: userEmail,
      name: "Password Test User",
      role: "SITE_SUPERVISOR",
    });
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  it("rejects unauthorized requests without session", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: initialPassword,
        newPassword: newValidPassword,
        confirmPassword: newValidPassword,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects request when new password is too short (< 8 chars)", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `buildtrack_session=${sessionToken}`,
      },
      body: JSON.stringify({
        currentPassword: initialPassword,
        newPassword: "short",
        confirmPassword: "short",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects request when confirmPassword does not match newPassword", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `buildtrack_session=${sessionToken}`,
      },
      body: JSON.stringify({
        currentPassword: initialPassword,
        newPassword: "NewValidPassword123!",
        confirmPassword: "DifferentPassword456!",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("do not match");
  });

  it("rejects request when current password is wrong", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `buildtrack_session=${sessionToken}`,
      },
      body: JSON.stringify({
        currentPassword: "IncorrectPassword999!",
        newPassword: newValidPassword,
        confirmPassword: newValidPassword,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INVALID_CURRENT_PASSWORD");
  });

  it("rejects request when new password is identical to current password", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `buildtrack_session=${sessionToken}`,
      },
      body: JSON.stringify({
        currentPassword: initialPassword,
        newPassword: initialPassword,
        confirmPassword: initialPassword,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PASSWORD_REUSED");
  });

  it("successfully updates password, persists hash in DB, and creates audit event", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `buildtrack_session=${sessionToken}`,
      },
      body: JSON.stringify({
        currentPassword: initialPassword,
        newPassword: newValidPassword,
        confirmPassword: newValidPassword,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify database record
    const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(updatedUser).toBeDefined();

    // Old password should now fail
    const oldMatches = await verifyPassword(initialPassword, updatedUser!.passwordHash);
    expect(oldMatches).toBe(false);

    // New password should succeed
    const newMatches = await verifyPassword(newValidPassword, updatedUser!.passwordHash);
    expect(newMatches).toBe(true);

    // Verify audit event
    const audit = await prisma.auditEvent.findFirst({
      where: {
        organizationId: orgId,
        actorUserId: userId,
        action: "PASSWORD_CHANGED",
      },
    });
    expect(audit).toBeDefined();
    expect(audit?.entityType).toBe("User");
  });
});
