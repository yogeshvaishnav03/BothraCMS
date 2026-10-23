import { NextRequest } from "next/server";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { sendDemandMessages } from "@/services/demand-messages";

export const dynamic = "force-dynamic";

/** "Send today's messages now", without waiting for the daily run. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "users:manage");
    return jsonSuccess(await sendDemandMessages(user.organizationId));
  } catch (error) {
    return handleApiError(error);
  }
}
