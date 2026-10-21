import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requireProjectAccess, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { TaskTimelineService, sanitizePhotoUrls } from "@/services/task-timeline-service";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED", "VERIFIED"]).optional(),
  note: z.string().max(4000).default(""),
  photoUrls: z.array(z.string()).max(12).default([]),
});

/** Post a progress update (note, photos, optional status move) on a task. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "tasks:write");

    const task = await prisma.task.findFirst({
      where: { id: params.id, organizationId: user.organizationId, isArchived: false },
      select: { id: true, title: true, status: true, projectId: true, assigneeUserId: true, createdBy: true },
    });
    if (!task) return jsonError("Task not found", "NOT_FOUND", 404);

    if (task.assigneeUserId !== user.userId && task.createdBy !== user.userId) {
      await requireProjectAccess(user, task.projectId, "tasks:write");
    }

    const data = updateSchema.parse(await req.json());
    const photoUrls = sanitizePhotoUrls(data.photoUrls);
    if (!data.note.trim() && photoUrls.length === 0 && (!data.status || data.status === task.status)) {
      return jsonError("Add a note, a photo or a new status", "EMPTY_UPDATE", 422);
    }

    const result = await TaskTimelineService.postUpdate({
      organizationId: user.organizationId,
      userId: user.userId,
      userName: user.name,
      task,
      status: data.status,
      note: data.note,
      photoUrls,
    });

    const entries = await TaskTimelineService.getTimeline(user.organizationId, task.id);
    return jsonSuccess({ ...result, entries }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
