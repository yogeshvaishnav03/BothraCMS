import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { DashboardService } from "@/services/dashboard-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) {
      return jsonError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("siteId") || undefined;

    const metrics = await DashboardService.getKpiMetrics(user.organizationId, siteId);
    return jsonSuccess(metrics);
  } catch (error) {
    return handleApiError(error);
  }
}
