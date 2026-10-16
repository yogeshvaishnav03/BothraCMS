/**
 * Centralized, cryptographically validated JWT secret configuration.
 * Shared across server-side auth helpers and Edge middleware.
 */

export function getJwtSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  // In production (self-hosted, Docker, or Vercel), fail closed if SESSION_SECRET is insecure
  if (process.env.NODE_ENV === "production" && !isBuildPhase) {
    if (
      !secret ||
      secret.trim().length < 32 ||
      secret === "build_track_pro_fallback_session_secret_32chars" ||
      secret === "build_track_pro_super_secure_session_secret_2026_key"
    ) {
      throw new Error(
        "FATAL PRODUCTION CONFIGURATION ERROR: SESSION_SECRET is missing, insecure, or shorter than 32 characters. Production startup aborted to prevent token forgery."
      );
    }
  }

  // Non-production development fallback only
  return new TextEncoder().encode(
    secret || "build_track_pro_fallback_session_secret_32chars"
  );
}
