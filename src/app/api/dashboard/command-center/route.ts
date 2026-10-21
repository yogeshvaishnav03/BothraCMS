import { NextRequest } from "next/server";
import { requireUserContext, isOrgOwnerOrAdmin, AuthorizationError } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { CommandCenterService } from "@/services/command-center-service";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    if (!isOrgOwnerOrAdmin(user)) {
      throw new AuthorizationError("Forbidden: The Command Center is only available to admins", 403, "FORBIDDEN");
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || todayIst();
    if (!DATE_RE.test(date)) {
      return jsonError("Validation error: date — Use the format YYYY-MM-DD", "VALIDATION_ERROR", 422);
    }
    const siteId = searchParams.get("siteId") || undefined;

    const data = await CommandCenterService.getOverview(user.organizationId, date, siteId);
    return jsonSuccess(data);
  } catch (error) {
    return handleApiError(error);
  }
}
