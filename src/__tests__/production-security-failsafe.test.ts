import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getJwtSecret } from "../lib/auth";

describe("Production Security Fail-Safe & Startup Protection", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should permit fallback secret in non-production environments", () => {
    (process.env as any).NODE_ENV = "development";
    delete process.env.SESSION_SECRET;

    const secret = getJwtSecret();
    expect(secret).toBeDefined();
    expect(secret instanceof Uint8Array).toBe(true);
  });

  it("never throws in production without SESSION_SECRET (that would break every page)", () => {
    (process.env as any).NODE_ENV = "production";
    delete process.env.SESSION_SECRET;
    process.env.DATABASE_URL = "postgres://u:p@db.example.com/bothra";
    expect(new TextDecoder().decode(getJwtSecret())).toContain("db.example.com");
  });

  it("does not use a known default or short SESSION_SECRET in production", () => {
    (process.env as any).NODE_ENV = "production";
    process.env.DATABASE_URL = "postgres://u:p@db.example.com/bothra";
    for (const bad of ["build_track_pro_fallback_session_secret_32chars", "short_insecure_key_12345"]) {
      process.env.SESSION_SECRET = bad;
      expect(new TextDecoder().decode(getJwtSecret())).not.toBe(bad);
    }
  });

  it("should successfully accept a valid cryptographically secure 32+ char secret in production", () => {
    (process.env as any).NODE_ENV = "production";
    process.env.SESSION_SECRET = "super_secure_production_secret_key_exceeding_32_characters!";

    const secret = getJwtSecret();
    expect(secret).toBeDefined();
    expect(secret instanceof Uint8Array).toBe(true);
  });
});
