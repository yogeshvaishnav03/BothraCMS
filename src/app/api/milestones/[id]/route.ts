import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requireProjectAccess } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { MilestoneService } from "@/services/milestone-service";

export const dynamic = "force-dynamic";

async function projectOf(organizationId: string, id: string) {
  const m = await prisma.projectMilestone.findFirst({ where: { id, organizationId }, select: { projectId: true } });
  return m?.projectId || null;
}

const dateField = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v ? new Date(v) : v === null ? null : undefined))
  .refine((d) => d === undefined || d === null || !isNaN(d.getTime()), "Invalid date");

const editSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  weight: z.number().positive().max(1000).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  plannedStart: dateField,
  plannedEnd: dateField,
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    const projectId = await projectOf(user.organizationId, params.id);
    if (!projectId) return jsonError("Stage not found", "NOT_FOUND", 404);
    await requireProjectAccess(user, projectId, "projects:write");
    await MilestoneService.edit(user.organizationId, params.id, editSchema.parse(await req.json()));
    return jsonSuccess(await MilestoneService.list(user.organizationId, projectId));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    const projectId = await projectOf(user.organizationId, params.id);
    if (!projectId) return jsonError("Stage not found", "NOT_FOUND", 404);
    await requireProjectAccess(user, projectId, "projects:write");
    const removed = await MilestoneService.remove(user.organizationId, params.id);
    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "MILESTONE_DELETED",
        entityType: "PROJECT",
        entityId: projectId,
        beforeJson: JSON.stringify({ name: removed.name, progressPercent: removed.progressPercent }),
        reason: `Stage "${removed.name}" removed`,
      },
    });
    return jsonSuccess(await MilestoneService.list(user.organizationId, projectId));
  } catch (error) {
    return handleApiError(error);
  }
}
