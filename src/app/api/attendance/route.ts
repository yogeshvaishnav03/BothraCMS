import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { AttendanceService } from "@/services/attendance-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("siteId") || undefined;
    const workDate = searchParams.get("workDate") || new Date().toISOString().split("T")[0];

    const records = await AttendanceService.getDailyAttendance(
      user.organizationId,
      siteId,
      workDate
    );

    return jsonSuccess(records);
  } catch (error) {
    return handleApiError(error);
  }
}
