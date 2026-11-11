import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { getJwtSecret } from "@/lib/jwt-secret";
import { isDemoSeedAllowedInEnvironment } from "@/lib/demo-seed-guard";
import {
  escapeXml,
  isSafeMediaUrl,
  isValidMagicBytes,
  sanitizeFileName,
} from "@/lib/upload-validation";
import { getClientIp } from "@/lib/rate-limiter";
import { GET as healthHandler } from "@/app/api/health/route";
import { POST as pushHandler } from "@/app/api/push/route";
import * as serverAuth from "@/lib/server-auth";

describe("Security Remediation Audit Regressions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects the legacy hardcoded fallback SESSION_SECRET in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv(
      "SESSION_SECRET",
      "6408226079c6bbff3b018b3cb3063f25c889f07fe3cf5e672ee6b3c9789b7cf3"
    );
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@db.prod.example.com/bothra");

    const decoded = new TextDecoder().decode(getJwtSecret());
    expect(decoded).not.toBe(
      "6408226079c6bbff3b018b3cb3063f25c889f07fe3cf5e672ee6b3c9789b7cf3"
    );
    expect(decoded).toContain("db.prod.example.com");
  });

  it("disables demo seeding on Vercel production unless ALLOW_DEMO_SEED=true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("ALLOW_DEMO_SEED", "");
    expect(isDemoSeedAllowedInEnvironment()).toBe(false);

    vi.stubEnv("ALLOW_DEMO_SEED", "true");
    expect(isDemoSeedAllowedInEnvironment()).toBe(true);
  });

  it("validates magic bytes, XML-escapes filenames, and restricts media URLs", () => {
    expect(isValidMagicBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]), "image/png")).toBe(true);
    expect(isValidMagicBytes(Buffer.from("<svg onload=alert(1)>"), "image/png")).toBe(false);

    expect(escapeXml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
    expect(sanitizeFileName("../../evil<file>.png")).toBe("evil_file_.png");

    expect(isSafeMediaUrl("/api/uploads/abc-123.jpg")).toBe(true);
    expect(isSafeMediaUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isSafeMediaUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeMediaUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isSafeMediaUrl("https://evil.example/pixel.png")).toBe(false);
  });

  it("prefers proxy x-real-ip over spoofable cf-connecting-ip when both exist", () => {
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      headers: {
        "x-real-ip": "203.0.113.50",
        "cf-connecting-ip": "198.51.100.99",
      },
    });
    expect(getClientIp(req)).toBe("203.0.113.50");
  });

  it("omits database host from GET /api/health", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@secret-db.neon.tech/prod");
    const res = await healthHandler();
    const json = await res.json();
    expect(json.host).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain("secret-db.neon.tech");
  });

  it("blocks internal SSRF endpoints in POST /api/push", async () => {
    vi.spyOn(serverAuth, "requireUserContext").mockResolvedValue({
      userId: "u1",
      organizationId: "org1",
      email: "u1@example.com",
      name: "User One",
      role: "SITE_SUPERVISOR",
      organizationName: "Org 1",
      currency: "INR",
      timezone: "Asia/Kolkata",
    });

    for (const badEndpoint of [
      "https://localhost/push",
      "https://127.0.0.1/push",
      "https://169.254.169.254/latest/meta-data",
      "https://10.0.0.5/internal",
      "https://fcm.googleapis.com:8443/fcm/send/1",
    ]) {
      const req = new NextRequest("http://localhost:3000/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: badEndpoint,
          keys: { p256dh: "p".repeat(20), auth: "a".repeat(10) },
        }),
      });
      const res = await pushHandler(req);
      expect(res.status).toBe(422);
    }
  });
});
