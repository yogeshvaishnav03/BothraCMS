import { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { MaterialRequestService } from "@/services/material-request-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    return jsonSuccess(await MaterialRequestService.cancel(user, params.id));
  } catch (error) {
    return handleApiError(error);
  }
}
