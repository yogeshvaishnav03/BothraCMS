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
    const entryId = searchParams.get("entryId") || undefined;

    const history = await MeasurementBookService.listHistory(user.organizationId, entryId);

    return jsonSuccess(history);
  } catch (error) {
    return handleApiError(error);
  }
}
