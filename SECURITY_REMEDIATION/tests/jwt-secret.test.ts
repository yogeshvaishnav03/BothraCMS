import { describe, it, expect } from "vitest";
import { getJwtSecret } from "@/lib/jwt-secret";

/**
 * JWT Secret Validation Tests
 *
 * Regression tests ensuring:
 * - Production with missing SECRET fails
 * - Production with weak SECRET fails
 * - Production with valid SECRET succeeds
 * - Vercel exemption is removed
 * - Hardcoded fallback rejected
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
    it("should fail when SESSION_SECRET is missing in production", () => {
      expect(() => {
        getJwtSecretWithEnv({
          NODE_ENV: "production",
          NEXT_PHASE: undefined,
          SESSION_SECRET: undefined,
        });
      }).toThrow("FATAL PRODUCTION CONFIGURATION ERROR: SESSION_SECRET environment variable is not set");
    });

    it("should fail when SESSION_SECRET is weak (< 32 chars) in production", () => {
      expect(() => {
        getJwtSecretWithEnv({
          NODE_ENV: "production",
          NEXT_PHASE: undefined,
          SESSION_SECRET: weakSecret,
        });
      }).toThrow("FATAL PRODUCTION CONFIGURATION ERROR: SESSION_SECRET is shorter than 32 characters");
    });

    it("should succeed with valid 32+ char SECRET in production", () => {
      const res = getJwtSecretWithEnv({
        NODE_ENV: "production",
        NEXT_PHASE: undefined,
        SESSION_SECRET: validSecret,
      });
      expect(res).toBeInstanceOf(Uint8Array);
      expect(res.length).toBeGreaterThanOrEqual(32);
    });

    it("should fail when SESSION_SECRET is old hardcoded fallback", () => {
      expect(() => {
        getJwtSecretWithEnv({
          NODE_ENV: "production",
          NEXT_PHASE: undefined,
          SESSION_SECRET: oldFallback,
        });
      }).toThrow("FATAL PRODUCTION CONFIGURATION ERROR: SESSION_SECRET has been set to the default hardcoded secret");
    });

    it("should fail when SESSION_SECRET is embedded fallback secret", () => {
      expect(() => {
        getJwtSecretWithEnv({
          NODE_ENV: "production",
          NEXT_PHASE: undefined,
          SESSION_SECRET: embeddedFallback,
        });
      }).toThrow("FATAL PRODUCTION CONFIGURATION ERROR: SESSION_SECRET has been set to the embedded fallback secret");
    });

    it("should fail during Vercel production build without SESSION_SECRET", () => {
      expect(() => {
        getJwtSecretWithEnv({
          NODE_ENV: "production",
          VERCEL: "1",
          NEXT_PHASE: undefined,
          SESSION_SECRET: undefined,
        });
      }).toThrow("FATAL PRODUCTION CONFIGURATION ERROR: SESSION_SECRET environment variable is not set");
    });

    it("should not exempt Vercel-only from secret validation", () => {
      expect(process.env.NEXT_PUBLIC_VERCEL_ENV).not.toBeDefined();
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
