import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { QualitySafetyService } from "@/services/quality-safety-service";
import { checklistSchema } from "@/lib/checklist-schema";

export const dynamic = "force-dynamic";

/** The checklists people can run: the organization's own and the built-in ones. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    return jsonSuccess(await QualitySafetyService.checklists(user));
  } catch (error) {
    return handleApiError(error);
  }
}

/** A new checklist, or an edited copy of a built-in one. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    return jsonSuccess(await QualitySafetyService.saveChecklist(user, null, checklistSchema.parse(await req.json())), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
