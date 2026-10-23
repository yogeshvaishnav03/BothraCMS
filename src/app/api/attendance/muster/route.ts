import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requireProjectAccess } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { istDateKey } from "@/lib/ist-date";
import { onceOnly } from "@/lib/offline-send";
import { MusterService, MAX_OVERTIME_HOURS } from "@/services/muster-service";

export const dynamic = "force-dynamic";

/** The day's muster for a project's site: every worker and how they are marked. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req, "attendance:read");
    const sp = new URL(req.url).searchParams;
    const projectId = sp.get("projectId");
    if (!projectId) return jsonError("Pick a project.", "VALIDATION_ERROR", 422);
    await requireProjectAccess(user, projectId);
    return jsonSuccess(await MusterService.get(user, projectId, sp.get("date") || istDateKey()));
  } catch (error) {
    return handleApiError(error);
  }
}

const saveSchema = z.object({
  projectId: z.string().min(1),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entries: z
    .array(
      z.object({
        workerId: z.string().min(1),
        mark: z.enum(["PRESENT", "HALF_DAY", "ABSENT", "NONE"]),
        overtimeHours: z.number().min(0).max(MAX_OVERTIME_HOURS).optional(),
      })
    )
    .min(1)
    .max(500),
});

/** Save the muster. Saving again updates it, so a phone can resend it safely. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req, "attendance:write");
    return await onceOnly(req, user, async () => {
      const body = saveSchema.parse(await req.json());
      await requireProjectAccess(user, body.projectId, "attendance:write");
      return jsonSuccess(await MusterService.save(user, body));
    });
  } catch (error) {
    return handleApiError(error);
  }
}
