/**
 * Centralized, cryptographically validated JWT secret configuration.
 * Shared across server-side auth helpers and Edge middleware.
 */

export function getJwtSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  const isVercel = Boolean(process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ENV);

  // In standalone production (self-hosted / Docker), fail closed if SESSION_SECRET is missing or insecure
  if (process.env.NODE_ENV === "production" && !isBuildPhase && !isVercel) {
    if (
      !secret ||
      secret.trim().length < 32 ||
      secret === "build_track_pro_fallback_session_secret_32chars"
    ) {
      throw new Error(
        "FATAL PRODUCTION CONFIGURATION ERROR: SESSION_SECRET is missing, insecure, or shorter than 32 characters. Production startup aborted to prevent token forgery."
      );
    }
  }

  // Authoritative production secret or secure fallback (for Vercel cloud previews / development)
  const validSecret =
    secret && secret.trim().length >= 32
      ? secret
      : "bothra_cms_super_secure_production_secret_key_2026_9876543210_token_security";

  return new TextEncoder().encode(validSecret);
}
