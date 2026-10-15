import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE_NAME = "buildtrack_session";

function getJwtSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!secret || secret === "build_track_pro_fallback_session_secret_32chars" || secret.trim().length < 32) {
      throw new Error(
        "FATAL PRODUCTION CONFIGURATION ERROR: SESSION_SECRET is missing, insecure, or shorter than 32 characters. Production startup aborted to prevent token forgery."
      );
    }
  }
  return new TextEncoder().encode(secret || "build_track_pro_fallback_session_secret_32chars");
}

const JWT_SECRET = getJwtSecret();

// Routes that do not require authentication
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/health",
];

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
          await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });
          return NextResponse.redirect(new URL("/", req.url));
        } catch {
          // Token invalid, proceed to login page
        }
      }
    }
    return NextResponse.next();
  }

  // 2. CSRF Defense-in-Depth for mutative API calls
  if (
    pathname.startsWith("/api/") &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
  ) {
    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");
    const host = req.headers.get("host");

    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return NextResponse.json(
            { success: false, error: { code: "FORBIDDEN", message: "Cross-site request forgery blocked" } },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "Invalid request origin" } },
          { status: 403 }
        );
      }
    } else if (referer && host) {
      try {
        const refererHost = new URL(referer).host;
        if (refererHost !== host) {
          return NextResponse.json(
            { success: false, error: { code: "FORBIDDEN", message: "Cross-site request forgery blocked" } },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "Invalid request referer" } },
          { status: 403 }
        );
      }
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
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });

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
