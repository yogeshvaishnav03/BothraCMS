import { NextRequest } from "next/server";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { sendDemandMessages } from "@/services/demand-messages";
import { sendOverdueTaskDigest, sendStaffAlerts } from "@/services/staff-alerts";

export const dynamic = "force-dynamic";

/** "Send today's messages now", without waiting for the daily run. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "users:manage");
    const demands = await sendDemandMessages(user.organizationId);
    const alerts = await sendStaffAlerts(user.organizationId);
    const digest = await sendOverdueTaskDigest(user.organizationId);
    return jsonSuccess({ ...demands, staff: { sent: alerts.sent + digest.sent, failed: alerts.failed + digest.failed, off: alerts.off } });
  } catch (error) {
    return handleApiError(error);
  }
}
