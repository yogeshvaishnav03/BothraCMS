import crypto from "crypto";

/**
 * The cryptographic key that signs and verifies authenticated login sessions.
 * Used by the login API (Node.js) and by middleware (Edge).
 *
 * Requirements:
 * - SESSION_SECRET (32+ characters) must be configured in deployment environment settings.
 * - In production environments, hardcoded session-secret fallbacks are strictly prohibited.
 */

const WEAK = new Set([
  "build_track_pro_fallback_session_secret_32chars",
  "bothra_cms_super_secure_production_secret_key_2026_9876543210_token_security",
  "development_only_insecure_secret_change_in_production_12345678",
]);

let warned = false;
function warnOnce(message: string) {
  if (warned) return;
  warned = true;
  console.warn(message);
}

function strong(secret: string | undefined): string | null {
  const s = secret?.trim();
  return s && s.length >= 32 && !WEAK.has(s) ? s : null;
}

export function getJwtSecret(): Uint8Array {
  const secret = strong(process.env.SESSION_SECRET);
  if (secret) return new TextEncoder().encode(secret);

  // Next.js build-time static page collection
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return new TextEncoder().encode("build_phase_temporary_secret_do_not_use_in_production_12345");
  }

  // Development & Test environments
  if (process.env.NODE_ENV !== "production") {
    warnOnce(
      "[JWT_SECRET] Development/Test environment: Using local development secret. Set SESSION_SECRET (>= 32 chars) for production deployments."
    );
    return new TextEncoder().encode("development_local_secure_fallback_key_32_characters_minimum");
  }

  // Production environment: Hardcoded fallbacks are strictly prohibited
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    "";

  if (dbUrl && !dbUrl.startsWith("file:")) {
    // Derive a unique tenant key using SHA-256 hash of database connection string
    warnOnce(
      "[JWT_SECRET] WARNING: SESSION_SECRET is not explicitly set in production. Deriving session key from DATABASE_URL. Please set SESSION_SECRET in deployment settings."
    );
    const derived = crypto.createHash("sha256").update(`bothra-cms-session-v2:${dbUrl}`).digest("hex");
    return new TextEncoder().encode(derived);
  }

  throw new Error(
    "CRITICAL SECURITY CONFIGURATION ERROR: SESSION_SECRET must be configured with a 32+ character cryptographically random string in production deployment settings. Hardcoded fallbacks are disabled."
  );
}
