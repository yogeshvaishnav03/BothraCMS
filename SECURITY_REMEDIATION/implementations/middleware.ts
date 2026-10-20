import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";

const SESSION_COOKIE_NAME = "buildtrack_session";

// Routes that do not require authentication
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/health",
];

// Trusted origins for CORS and CSRF (configure in environment)
function getTrustedOrigins(): string[] {
  const envOrigins = process.env.TRUSTED_ORIGINS || "";
  const parsed = envOrigins
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // Always trust current host in development
  if (process.env.NODE_ENV === "development") {
    parsed.push("localhost:3000", "localhost:3001", "127.0.0.1:3000", "127.0.0.1:3001");
  }

  return parsed;
}

/**
 * Validate that origin/referer match trusted origins for unsafe methods.
 *
 * SECURITY INVARIANT:
 * - Missing Origin AND missing Referer on unsafe methods → REJECTED
 * - Malformed origins → REJECTED
 * - Untrusted origins → REJECTED
 * - Bearer token authentication provides alternative CSRF-safe path
 */
function validateRequestOrigin(req: NextRequest): { valid: boolean; reason?: string } {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host") || "";
  const authorization = req.headers.get("authorization");

  // 1. Bearer token (non-browser, API-authenticated) → CSRF-safe
  if (authorization && authorization.startsWith("Bearer ")) {
    // No origin/referer validation needed for bearer-authenticated requests
    // (attacker cannot make bearer requests from another origin)
    return { valid: true };
  }

  // 2. Cookie-authenticated request MUST have valid Origin or Referer

  // Case A: Origin header present
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const trusted = getTrustedOrigins();

      // Check against trusted origins
      if (trusted.some((t) => originUrl.host === t)) {
        return { valid: true };
      }

      // Check against current host
      if (originUrl.host === host) {
        return { valid: true };
      }

      return { valid: false, reason: "Origin not trusted" };
    } catch {
      return { valid: false, reason: "Malformed Origin header" };
    }
  }

  // Case B: Referer header present (Origin missing)
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const trusted = getTrustedOrigins();

      // Check against trusted origins
      if (trusted.some((t) => refererUrl.host === t)) {
        return { valid: true };
      }

      // Check against current host
      if (refererUrl.host === host) {
        return { valid: true };
      }

      return { valid: false, reason: "Referer not trusted" };
    } catch {
      return { valid: false, reason: "Malformed Referer header" };
    }
  }

  // Case C: Both Origin and Referer missing → REJECT
  // Cookies present but no origin verification possible
  return { valid: false, reason: "Missing Origin and Referer headers" };
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Allow public paths and static assets
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/)
  ) {
    // If user is already authenticated and visits /login, redirect to dashboard
    if (pathname === "/login") {
      const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (token) {
        try {
          await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"] });
          return NextResponse.redirect(new URL("/", req.url));
        } catch {
          // Token invalid, proceed to login page
        }
      }
    }
    return NextResponse.next();
  }

  // 2. CSRF Defense: Validate origin/referer for unsafe API methods
  if (
    pathname.startsWith("/api/") &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
  ) {
    const originValidation = validateRequestOrigin(req);
    if (!originValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Cross-site request forgery protection: invalid or missing origin",
          },
        },
        { status: 403 }
      );
    }
  }

  // 3. Extract session token
  const token =
    req.cookies.get(SESSION_COOKIE_NAME)?.value ||
    req.headers.get("Authorization")?.replace("Bearer ", "");

  // Always sanitize inbound request headers against client-forged identity headers
  const sanitizedHeaders = new Headers(req.headers);
  sanitizedHeaders.delete("x-user-id");
  sanitizedHeaders.delete("x-user-role");
  sanitizedHeaders.delete("x-organization-id");

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Verify session token
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"] });

    // Forward strictly verified authenticated user context via request headers
    sanitizedHeaders.set("x-user-id", (payload.userId as string) || "");
    sanitizedHeaders.set("x-user-role", (payload.role as string) || "");
    sanitizedHeaders.set("x-organization-id", (payload.organizationId as string) || "");

    return NextResponse.next({
      request: {
        headers: sanitizedHeaders,
      },
    });
  } catch {
    // Token expired or tampered
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Session expired or invalid" } },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for static files and internal Next.js assets
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
