import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireUserContext,
  requireProjectAccess,
  requirePermission,
  isOrgOwnerOrAdmin,
} from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { notifyTaskUpdate, notifyTaskAssigned } from "@/lib/task-notifications";
import { calculateInitialReminder, normalizePriority } from "@/lib/task-reminder";

export const dynamic = "force-dynamic";

const editTaskSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  priority: z.enum(["DAILY", "GENERAL", "CRITICAL", "LOW", "MEDIUM", "HIGH"]).optional(),
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

    // Verify task visibility: Users should only see tasks assigned to them or created by them
    if (task.assigneeUserId !== user.userId && task.createdBy !== user.userId) {
      if (!isOrgOwnerOrAdmin(user)) {
        return jsonError("Forbidden: You can only view tasks assigned to you or created by you", "FORBIDDEN", 403);
      }
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
      if (!isOrgOwnerOrAdmin(user)) {
        return jsonError("Forbidden: You can only edit tasks assigned to you or created by you", "FORBIDDEN", 403);
      }
      await requireProjectAccess(user, task.projectId, "tasks:write");
    }

    const body = await req.json();
    const data = editTaskSchema.parse(body);

    if (data.reason !== undefined && !data.reason.trim()) {
      return jsonError("Reason for change is mandatory. Please state why this task is being modified.", "VALIDATION_ERROR", 400);
    }

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.description !== undefined) updateData.description = data.description;
    if (data.priority !== undefined) {
      const normPriority = normalizePriority(data.priority);
      updateData.priority = normPriority;
      if (data.reminderAt === undefined && normPriority !== task.priority) {
        updateData.reminderAt = calculateInitialReminder(normPriority);
        updateData.reminderDeliveredAt = null;
      }
    }
    if (data.assigneeUserId !== undefined) {
      if (data.assigneeUserId) {
        const targetAssignee = await prisma.user.findFirst({
          where: { id: data.assigneeUserId, organizationId: user.organizationId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!targetAssignee) {
          return jsonError("Assignee not found in this organization", "NOT_FOUND", 404);
        }
        updateData.assigneeUserId = targetAssignee.id;
      } else {
        updateData.assigneeUserId = null;
      }
    }
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
        project: { include: { site: true } },
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

    const changed: string[] = [];
    if (updated.title !== task.title) changed.push("title");
    if ((updated.description || "") !== (task.description || "")) changed.push("description");
    if (updated.priority !== task.priority) changed.push(`priority to ${updated.priority}`);
    if (String(updated.dueAt) !== String(task.dueAt)) changed.push("due date");
    if (updated.assigneeUserId !== task.assigneeUserId) {
      changed.push(updated.assignee ? `assignee to ${updated.assignee.name}` : "assignee (now unassigned)");
    }
    if (changed.length > 0) {
      if (updated.assigneeUserId && updated.assigneeUserId !== task.assigneeUserId && updated.assigneeUserId !== user.userId) {
        await notifyTaskAssigned({
          organizationId: user.organizationId,
          actorUser: { id: user.userId, name: user.name },
          assigneeUserId: updated.assigneeUserId,
          task: {
            id: updated.id,
            title: updated.title,
            priority: updated.priority,
            taskType: updated.taskType,
            project: updated.project,
          },
        }).catch((err) => console.warn("Task reassignment notification warning:", err));
      }

      await notifyTaskUpdate({
        organizationId: user.organizationId,
        actorUserId: user.userId,
        task: { ...task, assigneeUserId: updated.assigneeUserId },
        title: `${user.name} edited "${updated.title}"`,
        message: `Changed ${changed.join(", ")}.${data.reason ? ` Reason: ${data.reason}` : ""}`,
        // The previous assignee hears that the task moved away from them.
        extraRecipientIds: [task.assigneeUserId],
      });
    }

    return jsonSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
