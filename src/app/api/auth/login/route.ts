import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, hashPassword, createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { Role } from "@/lib/permissions";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limiter";
import { dynamicStore } from "@/lib/dynamic-store";

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
    const acctRateLimitKey = `login-acct:${clientIp}:${email.toLowerCase().trim()}`;
    const acctLimit = checkRateLimit(acctRateLimitKey, 5, 60000);
    if (!acctLimit.allowed) {
      return jsonError(
        `Too many failed login attempts for this account. Please wait ${acctLimit.retryAfterSeconds} seconds before trying again.`,
        "TOO_MANY_REQUESTS",
        429
      );
    }

    let user = null;
    let dbError = false;

    try {
      user = await prisma.user.findFirst({
        where: { email: email.toLowerCase().trim() },
        include: { organization: true },
      });

      // Auto-bootstrap default organization and admin if database is brand new with zero accounts
      if (!user) {
        const totalUsers = await prisma.user.count().catch(() => -1);
        if (totalUsers === 0 && email.toLowerCase().trim() === "admin@buildtrack.pro") {
          const org = await prisma.organization.create({
            data: {
              id: "demo-org-1",
              name: "Apex Infrastructure & Builders",
              currency: "INR",
              timezone: "Asia/Kolkata",
              status: "ACTIVE",
            },
          });
          const passwordHash = await hashPassword("Password123!");
          user = await prisma.user.create({
            data: {
              id: "usr-admin-1",
              organizationId: org.id,
              name: "Vikram Malhotra",
              email: "admin@buildtrack.pro",
              passwordHash,
              role: "ORG_ADMIN",
              status: "ACTIVE",
            },
            include: { organization: true },
          });
        }
      }
    } catch (err) {
      console.warn("[AUTH] Database connection failed, allowing built-in demo credentials verification:", err);
      dbError = true;
    }

    // If database is offline or uninitialized, permit default demo accounts only in local dev/test or explicit sandbox staging
    if (dbError || !user) {
      const allowDemo = process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_LOGIN === "true";
      const DEMO_USERS: Record<string, { id: string; name: string; role: Role }> = {
        "admin@buildtrack.pro": { id: "usr-admin-1", name: "Vikram Malhotra", role: "ORG_ADMIN" },
        "pm@buildtrack.pro": { id: "usr-pm-1", name: "Arjun Verma", role: "PROJECT_MANAGER" },
        "supervisor@buildtrack.pro": { id: "usr-sup-1", name: "Rajesh Kumar", role: "SITE_SUPERVISOR" },
        "store@buildtrack.pro": { id: "usr-store-1", name: "Mohan Lal", role: "STOREKEEPER" },
        "finance@buildtrack.pro": { id: "usr-fin-1", name: "Pooja Sharma", role: "ACCOUNTANT" },
      };

      const demo = allowDemo ? DEMO_USERS[email.toLowerCase().trim()] : null;
      if (demo && (password === "Password123!" || password === "password123!")) {
        resetRateLimit(acctRateLimitKey);
        resetRateLimit(ipRateLimitKey);

        const token = await createSessionToken({
          userId: demo.id,
          organizationId: "demo-org-1",
          email: email.toLowerCase().trim(),
          name: demo.name,
          role: demo.role,
        });

        const orgName = dynamicStore.getOrg()?.name || "Bothra Infrastructure & Builders";
        const res = jsonSuccess({
          user: {
            id: demo.id,
            name: demo.name,
            email: email.toLowerCase().trim(),
            role: demo.role,
            organizationId: "demo-org-1",
            organizationName: orgName,
          },
        });

        res.cookies.set({
          name: SESSION_COOKIE_NAME,
          value: token,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 7,
        });

        return res;
      }

      if (dbError) {
        return jsonError("Authentication service is temporarily unavailable. Please try again shortly.", "INVALID_CREDENTIALS", 401);
      }

      return jsonError("Invalid credentials or account suspended", "INVALID_CREDENTIALS", 401);
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return jsonError("Invalid credentials", "INVALID_CREDENTIALS", 401);
    }

    // Reset rate limiters on successful authentication
    resetRateLimit(acctRateLimitKey);
    resetRateLimit(ipRateLimitKey);

    // Update last login
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
