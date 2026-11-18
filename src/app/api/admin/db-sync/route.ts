import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { autoMigrateDatabase } from "@/lib/db-auto-migrate";
import { bootstrapWebsiteDataRuntime } from "@/lib/runtime-seeder";

export const dynamic = "force-dynamic";

const ALLOWED_REPAIR_ROLES = ["SUPER_ADMIN", "ORG_ADMIN", "OWNER", "PROJECT_MANAGER"];

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) {
      return jsonError("Unauthorized", "UNAUTHORIZED", 401);
    }
    if (!ALLOWED_REPAIR_ROLES.includes(user.role)) {
      return jsonError("Forbidden: Administrative access required to repair data", "FORBIDDEN", 403);
    }

    const migrationResult = await autoMigrateDatabase(prisma);
    const seeded = await bootstrapWebsiteDataRuntime(user.organizationId).catch((err) => {
      console.warn("[DB_SYNC] Runtime seeder notice:", err?.message || err);
      return false;
    });

    return jsonSuccess({
      message: migrationResult.isPostgres
        ? "PostgreSQL database schema verified, synchronized, and operational data repaired successfully!"
        : "Database schema verified and operational data repaired.",
      migration: migrationResult,
      repaired: seeded,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
