import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";

const SESSION_COOKIE_NAME = "buildtrack_session";

// Routes that do not require authentication
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/health",
  // Buyer portal: a secret link per booking, read-only.
  "/portal",
  "/api/portal",
  // Scheduled jobs check their own secret (CRON_SECRET).
  "/api/cron",
  // Meta's WhatsApp webhook checks its own signature (app secret).
  "/api/webhooks/whatsapp",
  // Installable site app: the service worker, its manifest and icons, and the no-signal page.
  "/sw.js",
  "/manifest.webmanifest",
  "/icons",
  "/offline",
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
 * Validate that origin/referer matches host or trusted origins.
 */
function isValidOriginOrReferer(
  origin: string | null,
  referer: string | null,
  host: string
): { valid: boolean; reason?: string } {
  const trusted = getTrustedOrigins();

  // Case A: Origin header present
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === host || trusted.some((t) => originUrl.host === t)) {
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
      if (refererUrl.host === host || trusted.some((t) => refererUrl.host === t)) {
        return { valid: true };
      }
      return { valid: false, reason: "Referer not trusted" };
    } catch {
      return { valid: false, reason: "Malformed Referer header" };
    }
  }

  // Case C: Both Origin and Referer missing
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

  // Always sanitize inbound request headers against client-forged identity headers
  const sanitizedHeaders = new Headers(req.headers);
  sanitizedHeaders.delete("x-user-id");
  sanitizedHeaders.delete("x-user-role");
  sanitizedHeaders.delete("x-organization-id");

  // Extract authentication tokens
  const cookieToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  const hasBearer = Boolean(authHeader && authHeader.startsWith("Bearer "));
  const bearerToken = hasBearer ? authHeader!.replace(/^Bearer\s+/i, "").trim() : null;

  const isMutativeApiMethod =
    pathname.startsWith("/api/") &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);

  let verifiedPayload: any = null;

  // 2. CSRF Defense and Stateless Exemption Strategy
  if (isMutativeApiMethod) {
    const host = req.headers.get("host") || "";
    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");

    // Case 1: Cookie is present (Browser request)
    // POLICY: If cookies are present, browser state is attached.
    // Origin/Referer MUST be validated regardless of whether a Bearer header was also injected.
    if (cookieToken) {
      const originValidation = isValidOriginOrReferer(origin, referer, host);
      if (!originValidation.valid) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Cross-site request forgery blocked",
            },
          },
          { status: 403 }
        );
      }
      // CSRF passed, verify cookie token
      try {
        const { payload } = await jwtVerify(cookieToken, getJwtSecret(), { algorithms: ["HS256"] });
        verifiedPayload = payload;
      } catch (err: any) {
        console.warn(`[AUTH MIDDLEWARE] Mutative CSRF-cookie token verification failed on ${pathname}:`, err?.message || err);
        return NextResponse.json(
          { success: false, error: { code: "UNAUTHORIZED", message: "Session expired or invalid" } },
          { status: 401 }
        );
      }
    }
    // Case 2: Pure Bearer token (Stateless API request, NO cookie present)
    // POLICY: Valid Bearer tokens are exempt from CSRF because cross-origin browsers cannot forge custom headers.
    // CRITICAL: Unauthenticated / invalid Bearer tokens MUST NEVER receive CSRF exemption.
    else if (bearerToken) {
      try {
        const { payload } = await jwtVerify(bearerToken, getJwtSecret(), { algorithms: ["HS256"] });
        verifiedPayload = payload;
        // Valid Bearer authenticated -> CSRF exemption granted
      } catch (err: any) {
        console.warn(`[AUTH MIDDLEWARE] Bearer token verification failed on ${pathname}:`, err?.message || err);
        return NextResponse.json(
          { success: false, error: { code: "UNAUTHORIZED", message: "Invalid or expired Bearer token" } },
          { status: 401 }
        );
      }
    }
    // Case 3: Neither cookie nor Bearer token present
    else {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }
  }

  // 3. For Non-mutative API requests (GET, HEAD, OPTIONS) or Page routes, verify token if not already verified
  if (!verifiedPayload) {
    const token = cookieToken || bearerToken;

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

    try {
      const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"] });
      verifiedPayload = payload;
    } catch (err: any) {
      console.warn(`[AUTH MIDDLEWARE] Session token verification rejected on ${pathname}:`, err?.message || err);
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

  // 4. Forward strictly verified authenticated user context via request headers
  sanitizedHeaders.set("x-user-id", (verifiedPayload.userId as string) || "");
  sanitizedHeaders.set("x-user-role", (verifiedPayload.role as string) || "");
  sanitizedHeaders.set("x-organization-id", (verifiedPayload.organizationId as string) || "");

  return NextResponse.next({
    request: {
      headers: sanitizedHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for static files and internal Next.js assets
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
