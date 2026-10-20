import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../lib/db";
import { POST } from "../app/api/auth/login/route";
import { checkRateLimitAsync, resetRateLimitAsync, getClientIp } from "../lib/rate-limiter";
import { hashPassword, createSessionToken } from "../lib/auth";

describe("Phase 2 — Task 2 & 3: Distributed Rate Limiter & Error Disclosure Prevention", () => {
  let testOrgId: string;
  let testUserEmail: string;
  let testPassword = "ValidPassword123!";

  beforeEach(async () => {
    // Clean up test rate limit records
    await prisma.rateLimitRecord.deleteMany({
      where: {
        key: {
          contains: "test-user-rate-limit",
        },
      },
    }).catch(() => {});

    // Create a dedicated test org and user
    const org = await prisma.organization.create({
      data: {
        name: `RateLimit Test Org ${Date.now()}`,
        currency: "INR",
        timezone: "Asia/Kolkata",
      },
    });
    testOrgId = org.id;

    testUserEmail = `rate-limit-test-${Date.now()}@example.com`;
    const passwordHash = await hashPassword(testPassword);

    await prisma.user.create({
      data: {
        organizationId: testOrgId,
        email: testUserEmail,
        name: "Rate Limit Test User",
        passwordHash,
        role: "PROJECT_MANAGER",
        status: "ACTIVE",
      },
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  describe("Task 2: Distributed Concurrency-Safe Rate Limiter", () => {
    it("should allow up to 5 attempts and block the 6th attempt with 429", async () => {
      const targetEmail = `target-${Date.now()}@test.com`;

      for (let i = 1; i <= 5; i++) {
        const req = new NextRequest("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-real-ip": "203.0.113.10",
          },
          body: JSON.stringify({
            email: targetEmail,
            password: "wrong-password",
          }),
        });

        const res = await POST(req);
        // The first 5 failed attempts return 401 INVALID_CREDENTIALS
        expect(res.status).toBe(401);
      }

      // 6th attempt should be blocked by account rate limit (429 TOO_MANY_REQUESTS)
      const blockedReq = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-real-ip": "203.0.113.10",
        },
        body: JSON.stringify({
          email: targetEmail,
          password: "wrong-password",
        }),
      });

      const blockedRes = await POST(blockedReq);
      expect(blockedRes.status).toBe(429);
      const data = await blockedRes.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe("TOO_MANY_REQUESTS");
      expect(data.error.message).toContain("Too many failed login attempts for this account");
    });

    it("should persist rate limit counts in the database RateLimitRecord table", async () => {
      const customKey = `test-user-rate-limit:db-persist:${Date.now()}`;

      const res1 = await checkRateLimitAsync(customKey, 5, 30000);
      expect(res1.allowed).toBe(true);
      expect(res1.remaining).toBe(4);

      const dbRecord = await prisma.rateLimitRecord.findUnique({
        where: { key: customKey },
      });
      expect(dbRecord).not.toBeNull();
      expect(dbRecord?.points).toBe(1);

      // Perform 4 more increments
      await checkRateLimitAsync(customKey, 5, 30000);
      await checkRateLimitAsync(customKey, 5, 30000);
      await checkRateLimitAsync(customKey, 5, 30000);
      const res5 = await checkRateLimitAsync(customKey, 5, 30000);
      expect(res5.allowed).toBe(true);
      expect(res5.remaining).toBe(0);

      const res6 = await checkRateLimitAsync(customKey, 5, 30000);
      expect(res6.allowed).toBe(false);
      expect(res6.retryAfterSeconds).toBeGreaterThan(0);

      // Reset
      await resetRateLimitAsync(customKey);
      const afterReset = await prisma.rateLimitRecord.findUnique({
        where: { key: customKey },
      });
      expect(afterReset).toBeNull();
    });

    it("should safely validate and extract client IP without trusting spoofed values", () => {
      // 1. Direct real-ip header
      const req1 = new NextRequest("http://localhost:3000/api/auth/login", {
        headers: { "x-real-ip": "198.51.100.5" },
      });
      expect(getClientIp(req1)).toBe("198.51.100.5");

      // 2. Cloudflare CF-Connecting-IP
      const req2 = new NextRequest("http://localhost:3000/api/auth/login", {
        headers: { "cf-connecting-ip": "198.51.100.22" },
      });
      expect(getClientIp(req2)).toBe("198.51.100.22");

      // 3. Spoofed or malformed X-Forwarded-For should not be blindly accepted
      const reqMalformed = new NextRequest("http://localhost:3000/api/auth/login", {
        headers: { "x-forwarded-for": "<script>alert(1)</script>, 10.0.0.1" },
      });
      // The validator skips the malformed string and extracts the first valid IP
      expect(getClientIp(reqMalformed)).toBe("10.0.0.1");

      // 4. Completely invalid or empty header falls back safely to loopback
      const reqInvalid = new NextRequest("http://localhost:3000/api/auth/login", {
        headers: { "x-forwarded-for": "invalid-ip-string; drop table users" },
      });
      expect(getClientIp(reqInvalid)).toBe("127.0.0.1");
    });

    it("should reset rate limiters on successful login", async () => {
      const loginIp = "192.0.2.77";

      // Make 2 failed attempts
      for (let i = 0; i < 2; i++) {
        const failedReq = new NextRequest("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-real-ip": loginIp,
          },
          body: JSON.stringify({
            email: testUserEmail,
            password: "incorrect-password",
          }),
        });
        const res = await POST(failedReq);
        expect(res.status).toBe(401);
      }

      // Check record exists in database
      const acctKey = `login-acct:${loginIp}:${testUserEmail.toLowerCase().trim()}`;
      const recordBefore = await prisma.rateLimitRecord.findUnique({
        where: { key: acctKey },
      });
      expect(recordBefore?.points).toBe(2);

      // Successful login
      const successReq = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-real-ip": loginIp,
        },
        body: JSON.stringify({
          email: testUserEmail,
          password: testPassword,
        }),
      });
      const successRes = await POST(successReq);
      expect(successRes.status).toBe(200);

      // Record should be cleared
      const recordAfter = await prisma.rateLimitRecord.findUnique({
        where: { key: acctKey },
      });
      expect(recordAfter).toBeNull();
    });
  });

  describe("Task 3: Internal Error & Infrastructure Disclosure Prevention", () => {
    it("should return a generic 503 message and never disclose DATABASE_URL, localhost, or database credentials", async () => {
      // Mock prisma.user.findFirst to simulate database connection failure
      vi.spyOn(prisma.user, "findFirst").mockRejectedValueOnce(
        new Error("Connection to postgresql://postgres:SecretPassword123@localhost:5432/bothra_cms failed timed out")
      );

      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-real-ip": "198.51.100.99",
        },
        body: JSON.stringify({
          email: "db-fail-user@example.com",
          password: "any-password",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(503);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("DATABASE_ERROR");

      // Verify strict secrecy: no database URLs, passwords, hosts, or ports exposed to client
      const rawResponseText = JSON.stringify(json);
      expect(rawResponseText).not.toContain("localhost");
      expect(rawResponseText).not.toContain("5432");
      expect(rawResponseText).not.toContain("SecretPassword123");
      expect(rawResponseText).not.toContain("postgresql://");
      expect(rawResponseText).not.toContain("bothra_cms");
      expect(rawResponseText).not.toContain("DATABASE_URL");
      expect(rawResponseText).not.toContain("PrismaClient");
      expect(json.error.message).toBe("Database service unavailable. Please check persistent database connectivity.");
    });
  });
});
