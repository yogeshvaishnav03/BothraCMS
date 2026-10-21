import { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { istDateKey, isDateKey } from "@/lib/ist-date";
import { WorkReportService } from "@/services/work-report-service";

export const dynamic = "force-dynamic";

/** A pre-filled report built from the person's task updates and attendance. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const date = new URL(req.url).searchParams.get("date") || istDateKey();
    if (!isDateKey(date)) return jsonError("date must be YYYY-MM-DD", "VALIDATION_ERROR", 422);
    return jsonSuccess(await WorkReportService.draft(user.organizationId, user.userId, date));
  } catch (error) {
    return handleApiError(error);
  }
}
