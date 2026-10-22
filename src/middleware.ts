import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";

const SESSION_COOKIE_NAME = "buildtrack_session";

// Routes that do not require authentication
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/debug",
  "/api/auth/debug-node",
  "/api/auth/test-verify",
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
    if (pathname === "/login") {
      const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (token) {
        try {
          await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"] });
          return NextResponse.redirect(new URL("/", req.url));
        } catch {
          // Token invalid, stay on login
        }
      }
    }
    return NextResponse.next();
  }

  // 2. Extract session token (check both cookie and Authorization header)
  let token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    const rawCookieHeader = req.headers.get("cookie") || "";
    const match = rawCookieHeader.match(/buildtrack_session=([^;]+)/);
    if (match) {
      token = match[1];
    }
  }

  if (!token) {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace(/^Bearer\s+/i, "").trim();
    }
  }

  // 3. If no token found
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

  // 4. Verify token
  let verifiedPayload: any = null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"] });
    verifiedPayload = payload;
  } catch (err: any) {
    // If token verification fails, return diagnostic header for easier troubleshooting
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: "UNAUTHORIZED", 
            message: "Session expired or invalid",
            reason: err?.code || err?.message || "jwt_verification_failed"
          } 
        },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    loginUrl.searchParams.set("reason", "token_invalid");
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  // 5. User is authenticated, forward verified context in headers
  const sanitizedHeaders = new Headers(req.headers);
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
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
