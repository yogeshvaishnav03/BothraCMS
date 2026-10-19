import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const updateStatusSchema = z.object({
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED", "VERIFIED"]),
  note: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    assertPermission(user.role, "tasks:write");

    const body = await req.json();
    const { status, note } = updateStatusSchema.parse(body);

    const task = await prisma.task.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
    });

    if (!task) return jsonError("Task not found", "NOT_FOUND", 404);

    if (task.assigneeUserId !== user.userId && task.createdBy !== user.userId) {
      const { requireProjectAccess } = await import("@/lib/server-auth");
      await requireProjectAccess(user, task.projectId, "tasks:write");
    }

    const oldStatus = task.status;
    const updateData: any = { status };

    if (status === "COMPLETED" && oldStatus !== "COMPLETED") {
      updateData.completedAt = new Date();
      updateData.completedById = user.userId;
    } else if (status === "VERIFIED") {
      updateData.verifiedAt = new Date();
      updateData.verifiedById = user.userId;
    }

    const [updatedTask] = await prisma.$transaction([
      prisma.task.update({
        where: { id: task.id },
        data: updateData,
        include: {
          project: true,
          assignee: true,
          completedBy: { select: { id: true, name: true } },
          verifiedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.taskStatusHistory.create({
        data: {
          taskId: task.id,
          oldStatus,
          newStatus: status,
          changedBy: user.userId,
          note: note || (status === "VERIFIED" ? "Task verified by supervisor" : null),
        },
      }),
    ]);

    return jsonSuccess(updatedTask);
  } catch (error) {
    return handleApiError(error);
  }
}
