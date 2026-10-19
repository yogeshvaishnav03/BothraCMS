import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requireProjectAccess, requirePermission } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const editTaskSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  assigneeUserId: z.string().optional(),
  dueAt: z.string().optional(),
  taskType: z.enum(["STANDARD", "PERSONAL", "REQUEST_OWNER", "REQUEST_MANAGER", "REQUEST_ARCHITECT"]).optional(),
  reminderAt: z.string().optional(),
  reason: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);

    const task = await prisma.task.findFirst({
      where: { id: params.id, organizationId: user.organizationId, isArchived: false },
      include: {
        project: { include: { site: true } },
        assignee: { select: { id: true, name: true, email: true, role: true } },
        creator: { select: { id: true, name: true, role: true } },
        completedBy: { select: { id: true, name: true } },
        verifiedBy: { select: { id: true, name: true } },
        comments: {
          include: { user: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: "asc" },
        },
        statusHistory: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
        attachments: {
          where: { isArchived: false },
          include: { uploadedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!task) return jsonError("Task not found", "NOT_FOUND", 404);

    // Verify project access if user is not assignee or creator
    if (task.assigneeUserId !== user.userId && task.createdBy !== user.userId) {
      await requireProjectAccess(user, task.projectId, "tasks:read");
    }

    return jsonSuccess(task);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "tasks:write");

    const task = await prisma.task.findFirst({
      where: { id: params.id, organizationId: user.organizationId, isArchived: false },
    });
    if (!task) return jsonError("Task not found", "NOT_FOUND", 404);

    // Verify project access if user is not assignee or creator
    if (task.assigneeUserId !== user.userId && task.createdBy !== user.userId) {
      await requireProjectAccess(user, task.projectId, "tasks:write");
    }

    const body = await req.json();
    const data = editTaskSchema.parse(body);

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.description !== undefined) updateData.description = data.description;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.assigneeUserId !== undefined) updateData.assigneeUserId = data.assigneeUserId || null;
    if (data.taskType !== undefined) updateData.taskType = data.taskType;
    if (data.dueAt !== undefined) updateData.dueAt = data.dueAt ? new Date(data.dueAt) : null;
    if (data.reminderAt !== undefined) {
      updateData.reminderAt = data.reminderAt ? new Date(data.reminderAt) : null;
      updateData.reminderDeliveredAt = null; // reset delivery tracking if reminder time updated
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: updateData,
      include: {
        project: true,
        assignee: true,
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "TASK_EDITED",
        entityType: "TASK",
        entityId: task.id,
        reason: data.reason || "Task details modified",
        beforeJson: JSON.stringify({
          title: task.title,
          description: task.description,
          priority: task.priority,
          assigneeUserId: task.assigneeUserId,
          dueAt: task.dueAt,
          taskType: task.taskType,
          reminderAt: task.reminderAt,
        }),
        afterJson: JSON.stringify({
          title: updated.title,
          description: updated.description,
          priority: updated.priority,
          assigneeUserId: updated.assigneeUserId,
          dueAt: updated.dueAt,
          taskType: updated.taskType,
          reminderAt: updated.reminderAt,
        }),
      },
    });

    return jsonSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
