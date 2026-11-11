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

function getCanonicalPostgresSecret(): string | null {
  // Prefer direct/pooled variables that db.ts never mutates at Node module load,
  // and strip query parameters so optimizeDbUrl() edits never cause Node API
  // routes and Edge middleware to compute different signing keys.
  const candidates = [
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_URL,
    process.env.DIRECT_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.DATABASE_URL,
  ];
  for (const raw of candidates) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    if (/^postgres(ql)?:\/\//i.test(trimmed)) {
      return trimmed.split("?")[0].replace(/\/+$/, "");
    }
  }
  return null;
}

function getOtherDeploymentSecret(): string | null {
  const candidates = [
    process.env.CRON_SECRET,
    process.env.BLOB_READ_WRITE_TOKEN,
    process.env.AWS_SECRET_ACCESS_KEY,
    process.env.RAZORPAY_KEY_SECRET,
    process.env.WHATSAPP_APP_SECRET,
    process.env.VAPID_PRIVATE_KEY,
  ];
  for (const raw of candidates) {
    const trimmed = raw?.trim();
    if (trimmed && trimmed.length >= 16) {
      return `bothra-jwt-dep:${trimmed}`;
    }
  }
  return null;
}

export function getJwtSecret(): Uint8Array {
  const explicit = strong(process.env.SESSION_SECRET);
  if (explicit) {
    return new TextEncoder().encode(explicit);
  }

  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  const isProdRuntime = process.env.NODE_ENV === "production" && !isBuildPhase;

  if (isProdRuntime) {
    const pgBase = getCanonicalPostgresSecret();
    if (pgBase) {
      return new TextEncoder().encode(`bothra-jwt-key:${pgBase}`);
    }
    const depSecret = getOtherDeploymentSecret();
    if (depSecret) {
      return new TextEncoder().encode(depSecret);
    }
    console.error(
      "[JWT_SECRET] Production SESSION_SECRET and database/deployment secrets are missing; Node and Edge runtimes cannot share ephemeral keys."
    );
    return new TextEncoder().encode(getRuntimeRandomFallback());
  }

  return new TextEncoder().encode(DEV_ONLY_SESSION_SECRET);
}
