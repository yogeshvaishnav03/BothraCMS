import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { autoMigrateDatabase } from "@/lib/db-auto-migrate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) {
      return jsonError("Unauthorized", "UNAUTHORIZED", 401);
    }
    if (user.role !== "SUPER_ADMIN") {
      return jsonError("Forbidden: Super Admin access required", "FORBIDDEN", 403);
    }

    const result = await autoMigrateDatabase(prisma);
    return jsonSuccess({
      message: result.isPostgres
        ? "PostgreSQL database schema verified and synchronized successfully!"
        : "Local SQLite database verified.",
      details: result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
