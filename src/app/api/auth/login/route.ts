import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, hashPassword, createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { Role } from "@/lib/permissions";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = loginSchema.parse(body);

    const clientIp =
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "127.0.0.1";

    // 1. IP-level rate limiting against distributed password spraying (max 30 attempts per minute per IP)
    const ipRateLimitKey = `login-ip:${clientIp}`;
    const ipLimit = checkRateLimit(ipRateLimitKey, 30, 60000);
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
    const acctLimit = checkRateLimit(acctRateLimitKey, 5, 60000);
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

      // Auto-bootstrap persistent default accounts if database has zero users or bootstrap account is missing
      if (!user) {
        const bootstrapAccounts = [
          {
            id: "usr-super-1",
            name: "Master Super Admin",
            email: "superadmin@buildtrack.pro",
            role: "SUPER_ADMIN",
          },
          {
            id: "usr-admin-1",
            name: "Yogesh Vaishnav",
            email: "admin@buildtrack.pro",
            role: "ORG_ADMIN",
          },
          {
            id: "usr-pm-1",
            name: "Arjun Verma",
            email: "pm@buildtrack.pro",
            role: "PROJECT_MANAGER",
          },
          {
            id: "usr-sup-1",
            name: "Rajesh Kumar",
            email: "supervisor@buildtrack.pro",
            role: "SITE_SUPERVISOR",
          },
          {
            id: "usr-store-1",
            name: "Mohan Lal",
            email: "store@buildtrack.pro",
            role: "STOREKEEPER",
          },
          {
            id: "usr-fin-1",
            name: "Pooja Sharma",
            email: "finance@buildtrack.pro",
            role: "ACCOUNTANT",
          },
        ];

        const isBootstrapTarget = bootstrapAccounts.some(
          (acc) => acc.email.toLowerCase() === normalizedEmail
        );
        const totalUsers = await prisma.user.count().catch(() => -1);

        if (totalUsers === 0 || isBootstrapTarget) {
          const defaultOrg = await prisma.organization.upsert({
            where: { id: "demo-org-1" },
            update: {},
            create: {
              id: "demo-org-1",
              name: "Bothra Infrastructure & Builders",
              currency: "INR",
              timezone: "Asia/Kolkata",
              status: "ACTIVE",
            },
          });

          const defaultPasswordHash = await hashPassword("Password123!");

          for (const acc of bootstrapAccounts) {
            await prisma.user.upsert({
              where: {
                organizationId_email: {
                  organizationId: defaultOrg.id,
                  email: acc.email,
                },
              },
              update: {},
              create: {
                id: acc.id,
                organizationId: defaultOrg.id,
                name: acc.name,
                email: acc.email,
                passwordHash: defaultPasswordHash,
                role: acc.role,
                status: "ACTIVE",
              },
            });
          }

          // Re-query user after bootstrap
          user = await prisma.user.findFirst({
            where: { email: normalizedEmail },
            include: { organization: true },
          });
        }
      }
    } catch (dbErr: any) {
      console.error("[AUTH] Authoritative database connection error during login:", dbErr);
      const isLocalhostOnCloud =
        Boolean(process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ENV) &&
        (process.env.DATABASE_URL || "").includes("localhost");

      const message = isLocalhostOnCloud
        ? "Database configuration error: DATABASE_URL on Vercel is set to 'localhost:5432'. Cloud hosting requires a cloud PostgreSQL database (e.g. Neon, Supabase, or Vercel Postgres) instead of localhost."
        : "Database service unavailable. Please check persistent database connectivity.";

      return jsonError(message, "DATABASE_ERROR", 503);
    }

    if (!user || user.status !== "ACTIVE" || !user.organization || user.organization.status !== "ACTIVE") {
      return jsonError("Invalid email or password", "INVALID_CREDENTIALS", 401);
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return jsonError("Invalid email or password", "INVALID_CREDENTIALS", 401);
    }

    // Reset rate limiters on successful authentication
    resetRateLimit(acctRateLimitKey);
    resetRateLimit(ipRateLimitKey);

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
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return res;
  } catch (error) {
    return handleApiError(error);
  }
}
