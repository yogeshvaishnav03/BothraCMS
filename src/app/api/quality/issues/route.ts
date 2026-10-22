import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserContext, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { ISSUE_KINDS, QualitySafetyService, SEVERITIES } from "@/services/quality-safety-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "projects:read");
    const sp = new URL(req.url).searchParams;
    return jsonSuccess(await QualitySafetyService.listIssues(user, { projectId: sp.get("projectId"), status: sp.get("status"), kind: sp.get("kind") }));
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({
  projectId: z.string().min(1),
  kind: z.enum(ISSUE_KINDS),
  severity: z.enum(SEVERITIES).default("MEDIUM"),
  title: z.string().trim().min(3).max(200),
  description: z.string().max(2000).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  photoUrls: z.array(z.string()).max(12).optional(),
  injuredCount: z.number().int().min(0).max(500).optional(),
  assignedTo: z.string().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/** Report a quality defect, safety incident, near miss or unsafe act. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "tasks:write");
    return jsonSuccess(await QualitySafetyService.reportIssue(user, schema.parse(await req.json())), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
