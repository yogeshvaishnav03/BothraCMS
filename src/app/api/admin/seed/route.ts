import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { seedDemoData } from "@/services/seed-service";
import { checkDemoSeedAllowed } from "@/lib/demo-seed-guard";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) {
      return jsonError("Unauthorized", "UNAUTHORIZED", 401);
    }

    // Enforce Super Admin authorization and the production guard
    const denial = checkDemoSeedAllowed(user.role);
    if (denial) {
      return jsonError(denial.message, denial.code, denial.status);
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

    const { generatedPassword, createdUsers, ...summary } = result;

    return jsonSuccess({
      message: `Demo data successfully populated for ${result.organizationName}!`,
      summary,
      // Shown once: the random password assigned to demo accounts created in this run.
      demoCredentials: createdUsers.length ? { password: generatedPassword, emails: createdUsers } : null,
    });
  } catch (error) {
    console.error("[ADMIN_SEED_ERROR]", error);
    return handleApiError(error);
  }
}
