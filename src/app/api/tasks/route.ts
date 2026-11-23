import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireUserContext,
  requirePermission,
  requireProjectAccess,
  getUserAccessibleProjectIds,
  isOrgOwnerOrAdmin,
} from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { notifyPeople } from "@/lib/notify";
import { notifyTaskAssigned } from "@/lib/task-notifications";
import { calculateInitialReminder, normalizePriority } from "@/lib/task-reminder";
import { ReminderService } from "@/services/reminder-service";

export const dynamic = "force-dynamic";

const createTaskSchema = z.object({
  projectId: z.string().optional().default(""),
  title: z.string().min(2),
  description: z.string().optional(),
  priority: z.enum(["DAILY", "GENERAL", "CRITICAL", "LOW", "MEDIUM", "HIGH"]).default("DAILY"),
  assigneeUserId: z.string().min(1).optional().nullable(),
  assigneeUserIds: z.array(z.string()).optional(),
  dueAt: z.string().optional(),
  taskType: z.enum(["STANDARD", "PERSONAL", "REQUEST_OWNER", "REQUEST_MANAGER", "REQUEST_ARCHITECT"]).optional(),
  reminderAt: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserContext(req);

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const assigneeUserId = searchParams.get("assigneeUserId");
    const employeeId = searchParams.get("employeeId");
    const taskType = searchParams.get("taskType");
    const filter = searchParams.get("filter"); // all, pending, overdue, completed, verified, my_tasks, assigned_by_me
    const includeArchived = searchParams.get("includeArchived") === "true";

    if (projectId) {
      await requireProjectAccess(user, projectId, "tasks:read");
    }

    const where: any = { organizationId: user.organizationId };
    if (!includeArchived) {
      where.isArchived = false;
    }

    const conditions: any[] = [];

    const accessibleProjectIds = await getUserAccessibleProjectIds(user);
    if (accessibleProjectIds !== null) {
      // Scoped users (Project Managers, Supervisors, Field Staff):
      // Can access tasks in projects they manage or are assigned to, plus any tasks assigned to or created by them.
      conditions.push({
        OR: [
          { projectId: { in: accessibleProjectIds } },
          { assigneeUserId: user.userId },
          { createdBy: user.userId },
        ],
      });
      if (projectId) {
        conditions.push({ projectId });
      }
    } else {
      // Admins (Super Admin, Org Admin): Unrestricted org-wide access
      if (projectId) {
        conditions.push({ projectId });
      }
    }

    if (conditions.length > 0) {
      where.AND = conditions;
    }

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assigneeUserId) where.assigneeUserId = assigneeUserId;
    if (employeeId) where.assigneeUserId = employeeId;
    if (taskType) where.taskType = taskType;

    const now = new Date();
    if (filter === "pending") {
      where.status = { in: ["TODO", "IN_PROGRESS", "BLOCKED"] };
    } else if (filter === "overdue") {
      where.status = { notIn: ["COMPLETED", "VERIFIED", "ARCHIVED"] };
      where.dueAt = { lt: now };
    } else if (filter === "completed") {
      where.status = "COMPLETED";
    } else if (filter === "verified") {
      where.status = "VERIFIED";
    } else if (filter === "my_tasks") {
      where.assigneeUserId = user.userId;
    } else if (filter === "assigned_by_me") {
      where.createdBy = user.userId;
    }

    const tasks = await prisma.task.findMany({
      where,
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
          select: { id: true, fileId: true, fileName: true, mimeType: true, category: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return jsonSuccess(tasks);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);

    const body = await req.json();
    const data = createTaskSchema.parse(body);

    const resolvedType = data.taskType || "STANDARD";
    if (resolvedType === "STANDARD") {
      requirePermission(user, "tasks:write");
    } else {
      // Personal tasks and raising requests to owner/manager can be created by any staff with tasks:read
      requirePermission(user, "tasks:read");
    }

    let effectiveProjectId = (data.projectId || "").trim();
    const isGeneralOrOther =
      !effectiveProjectId ||
      effectiveProjectId === "OTHER" ||
      effectiveProjectId === "GENERAL";

    if (isGeneralOrOther) {
      // Find or auto-ensure dedicated General Site Operations project for the organization
      let genProject = await prisma.project.findFirst({
        where: {
          organizationId: user.organizationId,
          isArchived: false,
          OR: [
            { code: "PRJ-GEN" },
            { name: "General Site Operations" },
          ],
        },
      });

      if (!genProject) {
        let site = await prisma.site.findFirst({
          where: { organizationId: user.organizationId, status: "ACTIVE" },
        });
        if (!site) {
          site = await prisma.site.create({
            data: {
              organizationId: user.organizationId,
              name: "Main Site / Head Office",
              code: `SITE-${user.organizationId.slice(-4)}`,
              address: "Central Site Operations",
              status: "ACTIVE",
            },
          });
        }
        genProject = await prisma.project.create({
          data: {
            organizationId: user.organizationId,
            siteId: site.id,
            code: "PRJ-GEN",
            name: "General Site Operations",
            status: "IN_PROGRESS",
          },
        });
      }

      effectiveProjectId = genProject.id;
    } else {
      await requireProjectAccess(user, effectiveProjectId, "tasks:write");

      const project = await prisma.project.findFirst({
        where: { id: effectiveProjectId, organizationId: user.organizationId, isArchived: false },
      });
      if (!project) {
        return jsonError("Project not found or outside organization scope", "PROJECT_NOT_FOUND", 404);
      }
    }

    // Support assigning task to multiple employees simultaneously
    let targetAssigneeIds: (string | null)[] = [];
    if (Array.isArray(data.assigneeUserIds) && data.assigneeUserIds.length > 0) {
      targetAssigneeIds = Array.from(new Set(data.assigneeUserIds.filter(Boolean)));
    } else if (data.assigneeUserId) {
      targetAssigneeIds = [data.assigneeUserId];
    } else {
      targetAssigneeIds = [resolvedType === "PERSONAL" ? user.userId : null];
    }

    if (targetAssigneeIds.length === 0) {
      targetAssigneeIds = [null];
    }

    const nonNullAssignees = targetAssigneeIds.filter((id): id is string => Boolean(id));
    if (nonNullAssignees.length > 0) {
      const existingUsers = await prisma.user.findMany({
        where: { id: { in: nonNullAssignees }, organizationId: user.organizationId },
        select: { id: true, name: true },
      });
      if (existingUsers.length !== nonNullAssignees.length) {
        return jsonError("One or more assignee users were not found or outside organization scope", "USER_NOT_FOUND", 404);
      }
    }

    const normalizedPriority = normalizePriority(data.priority);
    const effectiveReminderAt = data.reminderAt
      ? new Date(data.reminderAt)
      : calculateInitialReminder(normalizedPriority);

    const createdTasks = [];
    for (const targetAssigneeId of targetAssigneeIds) {
      const task = await prisma.task.create({
        data: {
          organizationId: user.organizationId,
          projectId: effectiveProjectId,
          title: data.title,
          description: data.description,
          priority: normalizedPriority,
          assigneeUserId: targetAssigneeId,
          taskType: resolvedType,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
          reminderAt: effectiveReminderAt,
          createdBy: user.userId,
        },
        include: {
          project: { include: { site: true } },
          assignee: true,
        },
      });

      // Initial status history
      await prisma.taskStatusHistory.create({
        data: {
          taskId: task.id,
          oldStatus: "NONE",
          newStatus: "TODO",
          changedBy: user.userId,
          note: resolvedType === "PERSONAL" ? "Personal task initialized" : "Task created",
        },
      });

      // Notify assignee if assigned to someone else with full project, site, and priority context
      if (targetAssigneeId && targetAssigneeId !== user.userId) {
        try {
          await notifyTaskAssigned({
            organizationId: user.organizationId,
            actorUser: { id: user.userId, name: user.name },
            assigneeUserId: targetAssigneeId,
            task: {
              id: task.id,
              title: task.title,
              priority: task.priority,
              taskType: task.taskType,
              project: task.project,
            },
          });
        } catch (notifErr) {
          console.warn("Task assignment notification warning:", notifErr);
        }
      }

      createdTasks.push(task);
    }

    if (createdTasks.length === 1) {
      return jsonSuccess(createdTasks[0], 201);
    }
    return jsonSuccess({ tasks: createdTasks, count: createdTasks.length }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    requirePermission(user, "tasks:write");

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return jsonError("Task ID is required", "BAD_REQUEST", 400);

    const task = await prisma.task.findFirst({
      where: { id, organizationId: user.organizationId },
    });

    if (!task) {
      return jsonError("Task not found", "NOT_FOUND", 404);
    }

    // Verify project access
    await requireProjectAccess(user, task.projectId, "tasks:write");

    // Soft-delete / Archival to preserve historical status and comment history
    await prisma.task.update({
      where: { id: task.id },
      data: {
        isArchived: true,
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedById: user.userId,
        archiveReason: "Task archived by authorized user",
        reminderAt: null,
      },
    });

    await ReminderService.dismissTaskReminders(task.id, user.organizationId);

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "TASK_ARCHIVED",
        entityType: "TASK",
        entityId: task.id,
        beforeJson: JSON.stringify({ title: task.title, status: task.status }),
        afterJson: JSON.stringify({ isArchived: true, status: "ARCHIVED" }),
        reason: "Task archived with all comments and history preserved",
      },
    });

    return jsonSuccess({ archived: true, deleted: true, id });
  } catch (error) {
    return handleApiError(error);
  }
}
