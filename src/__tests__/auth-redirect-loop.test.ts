import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST as loginHandler } from "@/app/api/auth/login/route";
import { middleware } from "@/middleware";
import { getJwtSecret } from "@/lib/jwt-secret";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

describe("Authentication & Session Persistence (Redirect Loop Prevention)", () => {
  it("getJwtSecret should never throw and work synchronously without node crypto in all environments", () => {
    const secret = getJwtSecret();
    expect(secret).toBeInstanceOf(Uint8Array);
    expect(secret.length).toBeGreaterThanOrEqual(32);
  });

  it("POST /api/auth/login should issue a valid session cookie that is accepted over HTTP", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Host": "localhost:3000",
      },
      body: JSON.stringify({
        email: "admin@buildtrack.pro",
        password: "Password123!",
      }),
    });

    const res = await loginHandler(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe("admin@buildtrack.pro");

    const sessionCookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.value).toBeTruthy();
    expect(sessionCookie?.httpOnly).toBe(true);
    // Over HTTP (non-https), secure must be false so browsers don't reject it
    expect(sessionCookie?.secure).toBe(false);
    expect(sessionCookie?.path).toBe("/");
  });

  it("POST /api/auth/login over HTTPS (x-forwarded-proto: https) should set secure: true", async () => {
    const req = new NextRequest("https://cms.bothra.com/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Host": "cms.bothra.com",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({
        email: "admin@buildtrack.pro",
        password: "Password123!",
      }),
    });

    const res = await loginHandler(req);
    expect(res.status).toBe(200);

    const sessionCookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.secure).toBe(true);
  });

  it("Middleware should accept valid session cookie and forward identity headers without redirecting to login", async () => {
    const token = await createSessionToken({
      userId: "bcb3fc79-2742-4a8c-a4ef-3f615bf214d0",
      organizationId: "1eb45938-3964-41ab-8145-c8ff93c90c73",
      email: "admin@buildtrack.pro",
      name: "Organization Admin",
      role: "SUPER_ADMIN",
    });

    const req = new NextRequest("http://localhost:3000/", {
      headers: {
        Cookie: `buildtrack_session=${token}`,
      },
    });

    const res = await middleware(req);
    // Should pass through to page (status 200, next() response)
    expect(res.status).toBe(200);
    // Must NOT have redirect location to /login
    expect(res.headers.get("location")).toBeNull();
    // Headers must forward user info
    expect(res.headers.get("x-middleware-request-x-user-id")).toBe("bcb3fc79-2742-4a8c-a4ef-3f615bf214d0");
    expect(res.headers.get("x-middleware-request-x-user-role")).toBe("SUPER_ADMIN");
  });

  it("Middleware should redirect unauthenticated requests on protected routes to /login", async () => {
    const req = new NextRequest("http://localhost:3000/day-book", {
      headers: {},
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("from=%2Fday-book");
  });
});
