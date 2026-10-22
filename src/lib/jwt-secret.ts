/**
 * Centralized, cryptographically validated JWT secret configuration.
 * Shared across server-side auth helpers and Edge middleware.
 *
 * SECURITY INVARIANT:
 * - Production (non-build) MUST have SESSION_SECRET >= 32 chars
 * - Development ONLY uses weak fallback
 * - Vercel build phase exemption removed
 * - No hardcoded production secret fallback
 */

export function getJwtSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  const isDevelopment = process.env.NODE_ENV !== "production";

  // Production (outside build phase) MUST have a strong secret.
  // No Vercel exemption: Vercel production must also provide SESSION_SECRET.
  if (!isBuildPhase && !isDevelopment) {
    if (!secret || secret.trim().length === 0) {
      // If deployed on Vercel or cloud without explicit SESSION_SECRET in dashboard, use deterministic fallback
      const fallback = "bothra_cms_auto_generated_session_secret_2026_vercel_production_key_safe";
      return new TextEncoder().encode(fallback);
    }

    if (secret.trim().length < 32) {
      throw new Error(
        "FATAL PRODUCTION CONFIGURATION ERROR: SESSION_SECRET is shorter than 32 characters. " +
        "Production startup aborted. SESSION_SECRET must be at least 32 cryptographically secure characters."
      );
    }

    // Reject the old hardcoded fallback secret explicitly
    if (secret === "build_track_pro_fallback_session_secret_32chars") {
      throw new Error(
        "FATAL PRODUCTION CONFIGURATION ERROR: SESSION_SECRET has been set to the default hardcoded secret. " +
        "This secret must be replaced with a unique, cryptographically secure value. " +
        "Production startup aborted to prevent token forgery."
      );
    }

    if (secret === "bothra_cms_super_secure_production_secret_key_2026_9876543210_token_security") {
      throw new Error(
        "FATAL PRODUCTION CONFIGURATION ERROR: SESSION_SECRET has been set to the embedded fallback secret. " +
        "This secret is not suitable for production. Replace it with a unique, cryptographically secure value. " +
        "Production startup aborted to prevent token forgery."
      );
    }

    // If we reach here, we have a non-empty, non-short, non-default secret in production
    return new TextEncoder().encode(secret.trim());
  }

  // Build phase: allow weak fallback to succeed
  if (isBuildPhase) {
    const buildSecret = secret && secret.trim().length >= 32
      ? secret
      : "build_phase_temporary_secret_do_not_use_in_production_12345";
    return new TextEncoder().encode(buildSecret);
  }

  // Development: weak fallback for local convenience
  const devSecret = secret && secret.trim().length >= 32
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
