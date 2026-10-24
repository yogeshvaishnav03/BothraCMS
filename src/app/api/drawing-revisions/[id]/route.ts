import { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { DrawingService } from "@/services/drawing-service";

export const dynamic = "force-dynamic";

/** A revision to view, mark up or compare. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    return jsonSuccess(await DrawingService.revisionDetail(user, params.id));
  } catch (error) {
    return handleApiError(error);
  }
}
