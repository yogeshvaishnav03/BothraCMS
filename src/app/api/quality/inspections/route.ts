import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { QualitySafetyService } from "@/services/quality-safety-service";
import { onceOnly } from "@/lib/offline-send";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "projects:read");
    return jsonSuccess(await QualitySafetyService.listInspections(user, new URL(req.url).searchParams.get("projectId")));
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({
  projectId: z.string().min(1),
  template: z.string().min(1).max(40),
  title: z.string().max(200).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  milestoneId: z.string().nullable().optional(),
  items: z
    .array(z.object({ label: z.string().trim().min(1).max(200), result: z.enum(["PASS", "FAIL", "NA"]), note: z.string().max(500).nullable().optional() }))
    .min(1)
    .max(40),
  photoUrls: z.array(z.string()).max(12).optional(),
});

/** Record a checklist inspection; each failed point opens an issue. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "tasks:write");
    return await onceOnly(req, user, async () => jsonSuccess(await QualitySafetyService.createInspection(user, schema.parse(await req.json())), 201));
  } catch (error) {
    return handleApiError(error);
  }
}
