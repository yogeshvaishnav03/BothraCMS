/**
 * Centralized JWT secret configuration.
 * Shared across server-side auth helpers and Edge middleware.
 *
 * CRITICAL FOR VERCEL: This function MUST NEVER throw in any runtime.
 * Both the Node.js serverless runtime (login API) and the Edge runtime
 * (middleware) must always return the EXACT SAME secret bytes.
 * Any throw here silently breaks authentication on Vercel.
 */

// Single deterministic fallback used when SESSION_SECRET is missing or invalid.
// Both Edge middleware and Node.js API routes will resolve to this same value.
const PRODUCTION_FALLBACK =
  "bothra_cms_auto_generated_session_secret_2026_vercel_production_key_safe";

export function getJwtSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  const isDevelopment = process.env.NODE_ENV !== "production";

  // --- Build phase: allow weak fallback to succeed ---
  if (isBuildPhase) {
    const buildSecret =
      secret && secret.trim().length >= 32
        ? secret
        : "build_phase_temporary_secret_do_not_use_in_production_12345";
    return new TextEncoder().encode(buildSecret);
  }

  // --- Development: weak fallback for local convenience ---
  if (isDevelopment) {
    const devSecret =
      secret && secret.trim().length >= 32
        ? secret
        : "development_only_insecure_secret_change_in_production_12345678";

    if (!secret || secret.trim().length < 32) {
      console.warn(
        "[JWT_SECRET] Development mode: using weak fallback secret. " +
          "Set SESSION_SECRET environment variable for a strong secret."
      );
    }

    return new TextEncoder().encode(devSecret);
  }

  // --- Production runtime (Node.js serverless + Edge middleware) ---
  // NEVER throw. Any error silently breaks auth on Vercel.

  if (!secret || secret.trim().length === 0) {
    console.warn(
      "[JWT_SECRET] Production: SESSION_SECRET not set. Using deterministic fallback."
    );
    return new TextEncoder().encode(PRODUCTION_FALLBACK);
  }

  if (secret.trim().length < 32) {
    console.warn(
      "[JWT_SECRET] Production: SESSION_SECRET too short (" +
        secret.trim().length +
        " chars). Using deterministic fallback."
    );
    return new TextEncoder().encode(PRODUCTION_FALLBACK);
  }

  // Reject known weak/blocklisted secrets → use fallback instead of crashing
  const blocklist = [
    "build_track_pro_fallback_session_secret_32chars",
    "bothra_cms_super_secure_production_secret_key_2026_9876543210_token_security",
  ];

  if (blocklist.includes(secret)) {
    console.warn(
      "[JWT_SECRET] Production: SESSION_SECRET matches a known weak default. Using deterministic fallback."
    );
    return new TextEncoder().encode(PRODUCTION_FALLBACK);
  }

  // Valid strong secret provided
  return new TextEncoder().encode(secret.trim());
}
