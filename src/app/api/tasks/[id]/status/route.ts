import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { dynamicStore } from "@/lib/dynamic-store";

export const dynamic = "force-dynamic";

const updateStatusSchema = z.object({
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED"]),
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

    try {
      const task = await prisma.task.findFirst({
        where: { id: params.id, organizationId: user.organizationId },
      });

      if (!task) return jsonError("Task not found", "NOT_FOUND", 404);

      const oldStatus = task.status;

      const [updatedTask] = await prisma.$transaction([
        prisma.task.update({
          where: { id: task.id },
          data: { status },
          include: { project: true, assignee: true },
        }),
        prisma.taskStatusHistory.create({
          data: {
            taskId: task.id,
            oldStatus,
            newStatus: status,
            changedBy: user.userId,
            note: note || null,
          },
        }),
      ]);

      return jsonSuccess(updatedTask);
    } catch (dbErr) {
      console.warn("[TASKS] Database update failed, updating dynamicStore:", dbErr);
      const updated = dynamicStore.updateTaskStatus(params.id, status, note);
      if (!updated) return jsonError("Task not found in store", "NOT_FOUND", 404);
      return jsonSuccess(updated);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
