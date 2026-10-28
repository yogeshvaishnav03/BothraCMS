/**
 * The cryptographic key that signs and verifies authenticated login sessions.
 * Used by the login API (Node.js) and by middleware (Edge).
 *
 * Requirements:
 * - Edge Runtime compatible (pure Web standard TextEncoder, NO Node.js "crypto" import).
 * - Same bytes in every runtime so the login API and middleware always agree.
 * - In production without an explicit SESSION_SECRET, the key is derived from the database address.
 * - NEVER throws: an unhandled throw in the middleware immediately breaks every page and redirects to /login.
 */

const WEAK = new Set([
  "build_track_pro_fallback_session_secret_32chars",
  "bothra_cms_super_secure_production_secret_key_2026_9876543210_token_security",
  "development_only_insecure_secret_change_in_production_12345678",
]);

const LAST_RESORT = "bothra_cms_session_key_without_secret_or_database_url_set";

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

  // Production environment: Derive key from DATABASE_URL so Edge & Node.js runtimes agree without throwing
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    "";

  warnOnce(
    "[JWT_SECRET] Production: SESSION_SECRET is not explicitly set or is weak. Deriving session key from database connection. Set SESSION_SECRET (>= 32 chars) in deployment settings."
  );

  return new TextEncoder().encode(dbUrl ? `bothra-session-v1|${dbUrl}` : LAST_RESORT);
}
