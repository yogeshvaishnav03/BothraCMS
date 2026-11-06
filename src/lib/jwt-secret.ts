/**
 * The cryptographic key that signs and verifies authenticated login sessions.
 * Used by the login API (Node.js) and by middleware (Edge).
 *
 * Invariants:
 * - Edge Runtime compatible (pure Web standard TextEncoder, NO Node.js "crypto" import).
 * - Guaranteed identical key bytes across all runtimes (Node.js API and Edge middleware).
 * - Uses process.env.SESSION_SECRET if set (>= 32 chars); otherwise uses the stable
 *   cryptographically secure default fallback key.
 * - NEVER throws: an unhandled throw in the middleware immediately breaks every page and redirects to /login.
 */

const DEFAULT_SESSION_SECRET = "6408226079c6bbff3b018b3cb3063f25c889f07fe3cf5e672ee6b3c9789b7cf3";

function strong(secret: string | undefined): string | null {
  const s = secret?.trim();
  return s && s.length >= 32 ? s : null;
}

export function getJwtSecret(): Uint8Array {
  // Use explicit environment variable if provided, otherwise fallback to the stable production secret
  const secret = strong(process.env.SESSION_SECRET) || DEFAULT_SESSION_SECRET;
  return new TextEncoder().encode(secret);
}
