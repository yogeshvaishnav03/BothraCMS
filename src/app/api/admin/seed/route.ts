import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { seedDemoData } from "@/services/seed-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) {
      return jsonError("Unauthorized", "UNAUTHORIZED", 401);
    }

    // Enforce Super Admin authorization
    if (user.role !== "SUPER_ADMIN") {
      return jsonError(
        "Forbidden: Super Admin privileges are required to seed demo data",
        "FORBIDDEN",
        403
      );
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty or non-JSON body allowed
      body = {};
    }

    const targetOrgId = body?.organizationId || user.organizationId;
    const result = await seedDemoData(targetOrgId, user.userId);

    return jsonSuccess({
      message: `Demo data successfully populated for ${result.organizationName}!`,
      summary: result,
    });
  } catch (error) {
    console.error("[ADMIN_SEED_ERROR]", error);
    return handleApiError(error);
  }
}
