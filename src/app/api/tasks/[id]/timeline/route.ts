import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserContext, requireProjectAccess } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { TaskTimelineService } from "@/services/task-timeline-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);

    const task = await prisma.task.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
      select: { id: true, title: true, status: true, projectId: true, assigneeUserId: true, createdBy: true },
    });
    if (!task) return jsonError("Task not found", "NOT_FOUND", 404);

    if (task.assigneeUserId !== user.userId && task.createdBy !== user.userId) {
      await requireProjectAccess(user, task.projectId, "tasks:read");
    }

    const entries = await TaskTimelineService.getTimeline(user.organizationId, task.id);
    return jsonSuccess({ task, entries });
  } catch (error) {
    return handleApiError(error);
  }
}
