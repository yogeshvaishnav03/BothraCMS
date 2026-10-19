import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireUserContext,
  requirePermission,
  requireProjectAccess,
  getUserAccessibleProjectIds,
} from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const createTaskSchema = z.object({
  projectId: z.string().optional().default(""),
  title: z.string().min(2),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  assigneeUserId: z.string().min(1).optional(),
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

    if (projectId) {
      where.projectId = projectId;
    } else {
      const accessibleProjectIds = await getUserAccessibleProjectIds(user);
      if (accessibleProjectIds !== null) {
        where.OR = [
          { projectId: { in: accessibleProjectIds } },
          { assigneeUserId: user.userId },
          { createdBy: user.userId },
        ];
      }
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

    let targetAssigneeId = data.assigneeUserId;

    if (resolvedType === "PERSONAL" && !targetAssigneeId) {
      targetAssigneeId = user.userId;
    }

    if (targetAssigneeId) {
      const assignee = await prisma.user.findFirst({
        where: { id: targetAssigneeId, organizationId: user.organizationId },
      });
      if (!assignee) {
        return jsonError("Assignee user not found or outside organization scope", "USER_NOT_FOUND", 404);
      }
    }

    const task = await prisma.task.create({
      data: {
        organizationId: user.organizationId,
        projectId: effectiveProjectId,
        title: data.title,
        description: data.description,
        priority: data.priority,
        assigneeUserId: targetAssigneeId,
        taskType: resolvedType,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        reminderAt: data.reminderAt ? new Date(data.reminderAt) : null,
        createdBy: user.userId,
      },
      include: {
        project: true,
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

    return jsonSuccess(task, 201);
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
      },
    });

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
