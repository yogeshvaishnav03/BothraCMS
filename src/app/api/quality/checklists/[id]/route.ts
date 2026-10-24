import { NextRequest } from "next/server";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { QualitySafetyService } from "@/services/quality-safety-service";
import { checklistSchema } from "@/lib/checklist-schema";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    return jsonSuccess(await QualitySafetyService.saveChecklist(user, params.id, checklistSchema.omit({ replacesKey: true }).parse(await req.json())));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    await QualitySafetyService.removeChecklist(user, params.id);
    return jsonSuccess({ removed: true });
  } catch (error) {
    return handleApiError(error);
  }
}
