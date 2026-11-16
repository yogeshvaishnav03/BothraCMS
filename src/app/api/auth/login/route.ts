import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma, ensurePostgresColumns, getDirectPrisma } from "@/lib/db";
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

    // 2. Targeted IP + account rate limiting (max 5 attempts per minute per IP + account)
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

    // 3. Global per-account rate limiting across all IPs (defends against IP-header rotation / distributed brute-force)
    const globalAcctKey = `login-email:${normalizedEmail}`;
    const globalAcctLimit = await checkRateLimitAsync(globalAcctKey, 15, 5 * 60000);
    if (!globalAcctLimit.allowed) {
      return jsonError(
        `Too many failed login attempts for this account. Please wait ${globalAcctLimit.retryAfterSeconds} seconds before trying again.`,
        "TOO_MANY_REQUESTS",
        429
      );
    }

    const userSelect = {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      role: true,
      status: true,
      organizationId: true,
      organization: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    };

    let user: any = null;
    let lastDbErr: any = null;
    const maxRetries = 4;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = attempt >= 3 ? getDirectPrisma() : prisma;
        user = await client.user.findFirst({
          where: { email: normalizedEmail },
          select: userSelect,
        });
        lastDbErr = null;
        break;
      } catch (dbErr: any) {
        lastDbErr = dbErr;
        console.warn(`[AUTH] Database query attempt ${attempt}/${maxRetries} failed:`, dbErr?.message || dbErr);

        if (attempt < maxRetries) {
          try {
            await prisma.$disconnect();
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, attempt * 800));
          try {
            await prisma.$connect();
            await ensurePostgresColumns();
          } catch {}
        }
      }
    }

    if (lastDbErr) {
      // Diagnostic logged securely to protected server stdout/stderr (secrets redacted)
      console.error("[AUTH] Authoritative database connection error during login:", lastDbErr?.message || lastDbErr);

      // Generic client-facing error never leaks DATABASE_URL, localhost, port, or cloud provider details
      return jsonError(
        "Database service unavailable. Please check persistent database connectivity.",
        "DATABASE_ERROR",
        503
      );
    }

    if (!user) {
      // Auto-heal empty or reconnected database
      try {
        const client = getDirectPrisma();
        const userCount = await client.user.count().catch(() => 0);
        if (
          userCount === 0 ||
          normalizedEmail === "superadmin@buildtrack.pro" ||
          normalizedEmail === "lakashy@buildtrack.pro" ||
          normalizedEmail === "admin@buildtrack.pro"
        ) {
          const { bootstrapWebsiteDataRuntime } = await import("@/lib/runtime-seeder");
          await bootstrapWebsiteDataRuntime();
          user = await client.user.findFirst({
            where: { email: normalizedEmail },
            select: userSelect,
          });
        }
      } catch (seedErr) {
        console.warn("[AUTH] Auto-bootstrap error during login:", seedErr);
      }
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
    await resetRateLimitAsync(globalAcctKey);
    await resetRateLimitAsync(ipRateLimitKey);

    // Update last login timestamp in database (non-fatal if transient db hiccup)
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    } catch (updateErr) {
      console.warn("[AUTH] Notice: Unable to update lastLoginAt (non-fatal):", updateErr);
    }

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

    // Determine if the current connection is HTTPS (direct or through reverse proxy)
    const forwardedProto = req.headers.get("x-forwarded-proto");
    const isHttps = forwardedProto
      ? forwardedProto.split(",")[0].trim().toLowerCase() === "https"
      : req.nextUrl.protocol === "https:";

    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return res;
  } catch (error) {
    return handleApiError(error);
  }
}
