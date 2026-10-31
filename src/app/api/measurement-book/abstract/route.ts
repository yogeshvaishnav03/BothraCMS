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
    const projectId = searchParams.get("projectId") || undefined;
    const partyId = searchParams.get("partyId") || undefined;
    const siteId = searchParams.get("siteId") || undefined;

    const abstractData = await MeasurementBookService.getAbstract(user.organizationId, {
      projectId,
      partyId,
      siteId,
    });

    return jsonSuccess(abstractData);
  } catch (error) {
    return handleApiError(error);
  }
}
