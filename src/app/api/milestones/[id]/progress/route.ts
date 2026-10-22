import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requireProjectAccess } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { MILESTONE_STATUSES, MilestoneService } from "@/services/milestone-service";
import { sanitizePhotoUrls } from "@/services/task-timeline-service";

export const dynamic = "force-dynamic";

const progressSchema = z.object({
  progressPercent: z.number().min(0).max(100),
  note: z.string().max(2000).nullable().optional(),
  photoUrls: z.array(z.string()).max(12).default([]),
  status: z.enum(MILESTONE_STATUSES).optional(),
});

/** Site team records how far a stage has got, with photos. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    const m = await prisma.projectMilestone.findFirst({ where: { id: params.id, organizationId: user.organizationId }, select: { projectId: true } });
    if (!m) return jsonError("Stage not found", "NOT_FOUND", 404);
    await requireProjectAccess(user, m.projectId, "tasks:write");
    const body = progressSchema.parse(await req.json());
    const { demandsRaised } = await MilestoneService.postProgress(user.organizationId, params.id, { userId: user.userId, name: user.name }, {
      ...body,
      photoUrls: sanitizePhotoUrls(body.photoUrls),
    });
    return jsonSuccess({ ...(await MilestoneService.list(user.organizationId, m.projectId)), demandsRaised }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
