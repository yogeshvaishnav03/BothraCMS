import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { sendAllDemandMessages } from "@/services/demand-messages";
import { sendAllStaffAlerts } from "@/services/staff-alerts";

export const dynamic = "force-dynamic";

/**
 * The daily WhatsApp run: demands, reminders before the due date and overdue
 * reminders to buyers, and staff alerts held overnight plus overdue tasks. Called by the scheduler with `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET || "";
    const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const ok = secret.length >= 16 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
    if (!ok) return jsonError("Unauthorized", "UNAUTHORIZED", 401);
    const demands = await sendAllDemandMessages();
    const staff = await sendAllStaffAlerts();
    return jsonSuccess({ ...demands, staff });
  } catch (error) {
    return handleApiError(error);
  }
}
