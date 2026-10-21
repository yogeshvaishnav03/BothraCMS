import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { Role } from "@/lib/permissions";
import { checkRateLimitAsync, resetRateLimitAsync, getClientIp } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = loginSchema.parse(body);

    const clientIp = getClientIp(req);

    // 1. IP-level rate limiting against distributed password spraying (max 30 attempts per minute per IP)
    const ipRateLimitKey = `login-ip:${clientIp}`;
    const ipLimit = await checkRateLimitAsync(ipRateLimitKey, 30, 60000);
    if (!ipLimit.allowed) {
      return jsonError(
        `Too many login attempts from this network. Please wait ${ipLimit.retryAfterSeconds} seconds before trying again.`,
        "TOO_MANY_REQUESTS",
        429
      );
    }

    // 2. Targeted account rate limiting (max 5 attempts per minute per account)
    const normalizedEmail = email.toLowerCase().trim();
    const acctRateLimitKey = `login-acct:${clientIp}:${normalizedEmail}`;
    const acctLimit = await checkRateLimitAsync(acctRateLimitKey, 5, 60000);
    if (!acctLimit.allowed) {
      return jsonError(
        `Too many failed login attempts for this account. Please wait ${acctLimit.retryAfterSeconds} seconds before trying again.`,
        "TOO_MANY_REQUESTS",
        429
      );
    }

    let user;
    try {
      user = await prisma.user.findFirst({
        where: { email: normalizedEmail },
        include: { organization: true },
      });
    } catch (dbErr: any) {
      // Diagnostic logged securely to protected server stdout/stderr (secrets redacted)
      console.error("[AUTH] Authoritative database connection error during login:", dbErr?.message || dbErr);

      // Generic client-facing error never leaks DATABASE_URL, localhost, port, or cloud provider details
      return jsonError(
        "Database service unavailable. Please check persistent database connectivity.",
        "DATABASE_ERROR",
        503
      );
    }

    if (!user || user.status !== "ACTIVE" || !user.organization || user.organization.status !== "ACTIVE") {
      return jsonError("Invalid email or password", "INVALID_CREDENTIALS", 401);
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return jsonError("Invalid email or password", "INVALID_CREDENTIALS", 401);
    }

    // Reset rate limiters on successful authentication
    await resetRateLimitAsync(acctRateLimitKey);
    await resetRateLimitAsync(ipRateLimitKey);

    // Update last login timestamp in database
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = await createSessionToken({
      userId: user.id,
      organizationId: user.organizationId,
      email: user.email,
      name: user.name,
      role: user.role as Role,
    });

    const res = jsonSuccess({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
      },
    });

    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && !req.headers.get("host")?.includes("localhost") && !req.headers.get("host")?.includes("127.0.0.1"),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return res;
  } catch (error) {
    return handleApiError(error);
  }
}
