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

  it("should throw fatal error in production if SESSION_SECRET is missing", () => {
    (process.env as any).NODE_ENV = "production";
    delete process.env.SESSION_SECRET;

    expect(() => getJwtSecret()).toThrowError(
      /FATAL PRODUCTION CONFIGURATION ERROR/
    );
  });

  it("should throw fatal error in production if SESSION_SECRET matches default fallback", () => {
    (process.env as any).NODE_ENV = "production";
    process.env.SESSION_SECRET = "build_track_pro_fallback_session_secret_32chars";

    expect(() => getJwtSecret()).toThrowError(
      /FATAL PRODUCTION CONFIGURATION ERROR/
    );
  });

  it("should throw fatal error in production if SESSION_SECRET is shorter than 32 characters", () => {
    (process.env as any).NODE_ENV = "production";
    process.env.SESSION_SECRET = "short_insecure_key_12345";

    expect(() => getJwtSecret()).toThrowError(
      /FATAL PRODUCTION CONFIGURATION ERROR/
    );
  });

  it("should successfully accept a valid cryptographically secure 32+ char secret in production", () => {
    (process.env as any).NODE_ENV = "production";
    process.env.SESSION_SECRET = "super_secure_production_secret_key_exceeding_32_characters!";

    const secret = getJwtSecret();
    expect(secret).toBeDefined();
    expect(secret instanceof Uint8Array).toBe(true);
  });
});
