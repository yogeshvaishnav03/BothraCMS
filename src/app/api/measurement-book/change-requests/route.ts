import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { MeasurementBookService } from "@/services/measurement-book-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const entryId = searchParams.get("entryId") || undefined;

    const requests = await MeasurementBookService.listChangeRequests(user.organizationId, {
      status,
      entryId,
    });

    return jsonSuccess(requests);
  } catch (error) {
    return handleApiError(error);
  }
}
