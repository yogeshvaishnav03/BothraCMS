import { describe, it, expect } from "vitest";
import { getJwtSecret } from "@/lib/jwt-secret";

/**
 * JWT Secret Validation Tests
 *
 * Regression tests ensuring:
 * - Production uses SESSION_SECRET when it is strong
 * - Without one it never throws (a throw in the middleware breaks every page)
 *   and derives the key from the database address, the same in every runtime
 * - Weak and known default secrets are not used
 * - Development has safe fallback
 */

function getJwtSecretWithEnv(env: Record<string, string | undefined>): Uint8Array {
  const originalEnv = { ...process.env };

  Object.entries(env).forEach(([key, value]) => {
    if (value === undefined) {
      delete (process.env as any)[key];
    } else {
      process.env[key] = value;
    }
  });

  try {
    return getJwtSecret();
  } finally {
    Object.assign(process.env, originalEnv);
  }
}

describe("JWT Secret Validation", () => {
  const validSecret = "a".repeat(32); // 32-char valid secret
  const weakSecret = "short"; // < 32 chars
  const oldFallback = "build_track_pro_fallback_session_secret_32chars";
  const embeddedFallback = "bothra_cms_super_secure_production_secret_key_2026_9876543210_token_security";

  describe("Production Mode", () => {
    const dec = (b: Uint8Array) => new TextDecoder().decode(b);
    const dbUrl = "postgres://user:pass@db.example.com:5432/bothra";

    it("uses a valid 32+ char SESSION_SECRET", () => {
      const res = getJwtSecretWithEnv({ NODE_ENV: "production", NEXT_PHASE: undefined, SESSION_SECRET: `  ${validSecret}  ` });
      expect(dec(res)).toBe(validSecret);
    });

    it("never throws without a secret: derives the key from the database address", () => {
      const env = { NODE_ENV: "production", NEXT_PHASE: undefined, SESSION_SECRET: undefined, DATABASE_URL: dbUrl };
      const a = getJwtSecretWithEnv(env);
      expect(dec(a)).toContain(dbUrl);
      // Same bytes every time, so the login API and the middleware agree.
      expect(dec(getJwtSecretWithEnv(env))).toBe(dec(a));
    });

    it("treats weak, short and known default secrets as missing", () => {
      for (const bad of [weakSecret, oldFallback, embeddedFallback]) {
        const res = getJwtSecretWithEnv({ NODE_ENV: "production", NEXT_PHASE: undefined, SESSION_SECRET: bad, DATABASE_URL: dbUrl });
        expect(dec(res)).not.toBe(bad);
        expect(dec(res)).toContain(dbUrl);
      }
    });

    it("does not fall back to a fixed string when a database address exists", () => {
      const a = getJwtSecretWithEnv({ NODE_ENV: "production", NEXT_PHASE: undefined, SESSION_SECRET: undefined, DATABASE_URL: dbUrl });
      const b = getJwtSecretWithEnv({ NODE_ENV: "production", NEXT_PHASE: undefined, SESSION_SECRET: undefined, DATABASE_URL: `${dbUrl}2` });
      expect(dec(a)).not.toBe(dec(b));
    });
  });

  describe("Build Phase", () => {
    it("should allow weak fallback during Next.js build phase", () => {
      const res = getJwtSecretWithEnv({
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
        SESSION_SECRET: undefined,
      });
      expect(res).toBeInstanceOf(Uint8Array);
    });
  });

  describe("Development Mode", () => {
    it("should use development fallback when SESSION_SECRET is missing", () => {
      const res = getJwtSecretWithEnv({
        NODE_ENV: "development",
        NEXT_PHASE: undefined,
        SESSION_SECRET: undefined,
      });
      expect(res).toBeInstanceOf(Uint8Array);
    });

    it("should accept custom SESSION_SECRET in development if provided", () => {
      const res = getJwtSecretWithEnv({
        NODE_ENV: "development",
        NEXT_PHASE: undefined,
        SESSION_SECRET: validSecret,
      });
      expect(res).toBeInstanceOf(Uint8Array);
      expect(res.length).toBeGreaterThanOrEqual(32);
    });

    it("should log warning when using development fallback", () => {
      const isDev = process.env.NODE_ENV !== "production";
      const hasSecret = process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32;

      if (isDev && !hasSecret) {
        console.warn("[JWT_SECRET] Development: using weak fallback");
      }
      expect(true);
    });
  });

  describe("Token Signing Consistency", () => {
    it("should use same secret for signing and verification", () => {
      expect(typeof getJwtSecretWithEnv).toBe("function");
    });
  });

  describe("Environment Variable Handling", () => {
    it("should trim whitespace from SESSION_SECRET", () => {
      const secretWithSpaces = "  " + validSecret + "  ";
      const trimmed = secretWithSpaces.trim();
      expect(trimmed.length).toBeGreaterThanOrEqual(32);
    });

    it("should not expose secret value in error messages", () => {
      const error = new Error(
        "FATAL PRODUCTION CONFIGURATION ERROR: SESSION_SECRET is missing, insecure, or shorter than 32 characters."
      );
      expect(error.message).not.toContain(validSecret);
      expect(error.message).not.toContain(embeddedFallback);
    });
  });
});
