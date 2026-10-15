import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { jsonSuccess, jsonError } from "@/lib/api-response";
import { ROLE_PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUserContext(req);
  if (!user) {
    return jsonError("Unauthorized", "UNAUTHORIZED", 401);
  }

  const permissions = ROLE_PERMISSIONS[user.role] || [];

  return jsonSuccess({
    user: {
      id: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: user.organizationName,
      currency: user.currency,
      timezone: user.timezone,
      permissions,
    },
  });
}
