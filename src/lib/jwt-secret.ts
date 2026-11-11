/**
 * The cryptographic key that signs and verifies authenticated login sessions.
 * Used by the login API (Node.js) and by middleware (Edge).
 *
 * Invariants:
 * - Edge Runtime compatible (pure Web standard TextEncoder / Web Crypto, NO Node.js "crypto" import).
 * - Guaranteed identical key bytes across Node.js API and Edge middleware when SESSION_SECRET or DATABASE_URL is configured.
 * - Rejects short (< 32 chars) or known public fallback secrets in production.
 * - NEVER throws: an unhandled throw in the middleware breaks every page.
 */

const DEV_ONLY_SESSION_SECRET = "buildtrack_local_dev_only_session_secret_32chars_min";
const KNOWN_WEAK_SECRETS = new Set([
  "build_track_pro_fallback_session_secret_32chars",
  "bothra_cms_super_secure_production_secret_key_2026_9876543210_token_security",
  "6408226079c6bbff3b018b3cb3063f25c889f07fe3cf5e672ee6b3c9789b7cf3",
  "replace_with_a_secure_random_production_secret_32chars_minimum",
]);

const globalForJwt = globalThis as unknown as {
  __ephemeralProdFallbackSecret?: string;
};

function strong(secret: string | undefined): string | null {
  const s = secret?.trim();
  if (!s || s.length < 32 || KNOWN_WEAK_SECRETS.has(s)) {
    return null;
  }
  return s;
}

function getRuntimeRandomFallback(): string {
  if (!globalForJwt.__ephemeralProdFallbackSecret) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    globalForJwt.__ephemeralProdFallbackSecret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return globalForJwt.__ephemeralProdFallbackSecret;
}

export function getJwtSecret(): Uint8Array {
  const explicit = strong(process.env.SESSION_SECRET);
  if (explicit) {
    return new TextEncoder().encode(explicit);
  }

  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  const isProdRuntime = process.env.NODE_ENV === "production" && !isBuildPhase;

  if (isProdRuntime) {
    const dbUrl =
      process.env.DATABASE_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      "";
    if (dbUrl.trim()) {
      const salt = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "bothra-prod";
      return new TextEncoder().encode(`bothra-jwt-key:${salt}:${dbUrl.trim()}`);
    }
    return new TextEncoder().encode(getRuntimeRandomFallback());
  }

  return new TextEncoder().encode(DEV_ONLY_SESSION_SECRET);
}
