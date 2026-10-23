/**
 * The key that signs and checks login sessions. Used by the login API
 * (Node.js) and by the middleware (Edge), which must get the same bytes or
 * every page sends the user back to the login screen.
 *
 * - SESSION_SECRET (32+ characters) is used when it is set. Set it in the
 *   Vercel project settings.
 * - In production without one, the key is derived from the database
 *   address. Both runtimes see the same environment, so they agree, and the
 *   address is itself secret, unlike a fixed string in the code.
 * - It never throws: a throw in the middleware breaks every page.
 *
 * Never write SESSION_SECRET into a .env file during the build (see
 * scripts/prepare-db.js): Next.js copies .env values into the Edge
 * middleware at build time, but the Node.js functions on Vercel do not read
 * that file, so the two would disagree.
 */

const WEAK = new Set(["build_track_pro_fallback_session_secret_32chars", "bothra_cms_super_secure_production_secret_key_2026_9876543210_token_security"]);

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

  if (process.env.NEXT_PHASE === "phase-production-build") {
    return new TextEncoder().encode("build_phase_temporary_secret_do_not_use_in_production_12345");
  }

  if (process.env.NODE_ENV !== "production") {
    warnOnce("[JWT_SECRET] Development mode: using weak fallback secret. Set SESSION_SECRET environment variable for a strong secret.");
    return new TextEncoder().encode("development_only_insecure_secret_change_in_production_12345678");
  }

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || "";
  warnOnce("[JWT_SECRET] Production: SESSION_SECRET is missing or weak. Set a 32+ character SESSION_SECRET in the deployment settings.");
  return new TextEncoder().encode(dbUrl ? `bothra-session-v1|${dbUrl}` : LAST_RESORT);
}
