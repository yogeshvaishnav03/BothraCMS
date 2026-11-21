import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requirePermission, requireProjectAccess, isOrgOwnerOrAdmin } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { notifyTaskAssigned } from "@/lib/task-notifications";

export const dynamic = "force-dynamic";

const addMemberSchema = z.object({
  userId: z.string().min(1).optional(),
  userIds: z.array(z.string().min(1)).optional(),
  reason: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);

    const task = await prisma.task.findFirst({
      where: { id: params.id, organizationId: user.organizationId, isArchived: false },
      include: {
        project: { include: { site: true } },
        assignee: { select: { id: true, name: true, email: true, role: true, jobTitle: true } },
        creator: { select: { id: true, name: true, role: true } },
      },
    });

    if (!task) return jsonError("Task not found", "NOT_FOUND", 404);

    if (task.assigneeUserId !== user.userId && task.createdBy !== user.userId) {
      if (!isOrgOwnerOrAdmin(user)) {
        return jsonError("Forbidden: You can only view tasks assigned to you or created by you", "FORBIDDEN", 403);
      }
      await requireProjectAccess(user, task.projectId, "tasks:read");
    }

    // Find all sibling tasks with the same title & project in this organization
    const siblingTasks = await prisma.task.findMany({
      where: {
        organizationId: user.organizationId,
        projectId: task.projectId,
        title: task.title,
        isArchived: false,
        assigneeUserId: { not: null },
      },
      include: {
        assignee: { select: { id: true, name: true, email: true, role: true, jobTitle: true } },
      },
    });

    const memberMap = new Map<string, any>();
    if (task.assignee) {
      memberMap.set(task.assignee.id, {
        ...task.assignee,
        isCurrentTaskAssignee: true,
        taskId: task.id,
      });
    }

    for (const st of siblingTasks) {
      if (st.assignee && !memberMap.has(st.assignee.id)) {
        memberMap.set(st.assignee.id, {
          ...st.assignee,
          isCurrentTaskAssignee: st.id === task.id,
          taskId: st.id,
        });
      }
    }

    // Fetch all active employees in organization
    const allEmployees = await prisma.user.findMany({
      where: { organizationId: user.organizationId, status: "ACTIVE" },
      select: { id: true, name: true, email: true, role: true, jobTitle: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    return jsonSuccess({
      task: {
        id: task.id,
        title: task.title,
        projectId: task.projectId,
        assigneeUserId: task.assigneeUserId,
      },
      members: Array.from(memberMap.values()),
      availableEmployees: allEmployees,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "tasks:write");

    const task = await prisma.task.findFirst({
      where: { id: params.id, organizationId: user.organizationId, isArchived: false },
      include: {
        project: { include: { site: true } },
        assignee: { select: { id: true, name: true, role: true } },
      },
    });

    if (!task) return jsonError("Task not found", "NOT_FOUND", 404);

    if (task.assigneeUserId !== user.userId && task.createdBy !== user.userId) {
      if (!isOrgOwnerOrAdmin(user)) {
        return jsonError("Forbidden: You can only manage members of tasks assigned to you or created by you", "FORBIDDEN", 403);
      }
      await requireProjectAccess(user, task.projectId, "tasks:write");
    }

    const body = await req.json();
    const data = addMemberSchema.parse(body);

    const targetIds = Array.from(
      new Set([...(data.userIds || []), ...(data.userId ? [data.userId] : [])])
    ).filter(Boolean);

    if (targetIds.length === 0) {
      return jsonError("Please select at least one employee to add to this task.", "VALIDATION_ERROR", 400);
    }

    const targetUsers = await prisma.user.findMany({
      where: { id: { in: targetIds }, organizationId: user.organizationId, status: "ACTIVE" },
      select: { id: true, name: true, email: true, role: true, jobTitle: true },
    });

    if (targetUsers.length === 0) {
      return jsonError("Selected employee(s) not found or inactive.", "USER_NOT_FOUND", 404);
    }

    const addedMembers: any[] = [];

    for (const targetUser of targetUsers) {
      // If current task is unassigned, assign this user directly to the current task
      if (!task.assigneeUserId) {
        await prisma.task.update({
          where: { id: task.id },
          data: { assigneeUserId: targetUser.id },
        });
        task.assigneeUserId = targetUser.id;

        await prisma.taskStatusHistory.create({
          data: {
            taskId: task.id,
            oldStatus: task.status,
            newStatus: task.status,
            changedBy: user.userId,
            note: `Assigned member: ${targetUser.name} (${targetUser.role.replace(/_/g, " ")}) added to task`,
          },
        });

        await notifyTaskAssigned({
          organizationId: user.organizationId,
          actorUser: { id: user.userId, name: user.name },
          assigneeUserId: targetUser.id,
          task: {
            id: task.id,
            title: task.title,
            priority: task.priority,
            taskType: task.taskType,
            project: task.project,
          },
        }).catch((err) => console.warn("Task assignment notification warning:", err));

        addedMembers.push(targetUser);
        continue;
      }

      // Check if already assigned to current task
      if (task.assigneeUserId === targetUser.id) {
        continue;
      }

      // Check if already assigned to an existing sibling task for this project & title
      const existingSibling = await prisma.task.findFirst({
        where: {
          organizationId: user.organizationId,
          projectId: task.projectId,
          title: task.title,
          assigneeUserId: targetUser.id,
          isArchived: false,
        },
      });

      if (existingSibling) {
        continue;
      }

      // Create assigned copy for this employee so they can see and manage their work on this task
      const newTask = await prisma.task.create({
        data: {
          organizationId: user.organizationId,
          projectId: task.projectId,
          title: task.title,
          description: task.description,
          priority: task.priority,
          assigneeUserId: targetUser.id,
          taskType: task.taskType,
          dueAt: task.dueAt,
          reminderAt: task.reminderAt,
          createdBy: task.createdBy || user.userId,
        },
        include: {
          project: { include: { site: true } },
          assignee: true,
        },
      });

      // Status histories
      await prisma.taskStatusHistory.create({
        data: {
          taskId: newTask.id,
          oldStatus: "NONE",
          newStatus: "TODO",
          changedBy: user.userId,
          note: `Task assigned to ${targetUser.name} (${targetUser.role.replace(/_/g, " ")})`,
        },
      });

      await prisma.taskStatusHistory.create({
        data: {
          taskId: task.id,
          oldStatus: task.status,
          newStatus: task.status,
          changedBy: user.userId,
          note: `Added team member: ${targetUser.name} (${targetUser.role.replace(/_/g, " ")}) to collaborate on this task`,
        },
      });

      // Notify the added team member
      await notifyTaskAssigned({
        organizationId: user.organizationId,
        actorUser: { id: user.userId, name: user.name },
        assigneeUserId: targetUser.id,
        task: {
          id: newTask.id,
          title: newTask.title,
          priority: newTask.priority,
          taskType: newTask.taskType,
          project: newTask.project,
        },
      }).catch((err) => console.warn("Task assignment notification warning:", err));

      addedMembers.push(targetUser);
    }

    if (addedMembers.length > 0) {
      await prisma.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.userId,
          action: "TASK_MEMBERS_ADDED",
          entityType: "TASK",
          entityId: task.id,
          reason: data.reason || `Added ${addedMembers.map((m) => m.name).join(", ")} to task "${task.title}"`,
          afterJson: JSON.stringify({
            taskId: task.id,
            title: task.title,
            addedMembers: addedMembers.map((m) => ({ id: m.id, name: m.name, role: m.role })),
          }),
        },
      });
    }

    return jsonSuccess({
      message:
        addedMembers.length > 0
          ? `Successfully added ${addedMembers.map((m) => m.name).join(", ")} to this task!`
          : "Selected employee(s) are already assigned to this task.",
      addedCount: addedMembers.length,
      addedMembers,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
