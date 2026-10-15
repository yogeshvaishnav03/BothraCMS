import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserContext } from "@/lib/auth";
import { assertPermission } from "@/lib/permissions";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { dynamicStore } from "@/lib/dynamic-store";

export const dynamic = "force-dynamic";

const createTaskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(2),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  assigneeUserId: z.string().min(1).optional(),
  dueAt: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const assigneeUserId = searchParams.get("assigneeUserId");

    const where: any = { organizationId: user.organizationId };
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assigneeUserId) where.assigneeUserId = assigneeUserId;

    try {
      const tasks = await prisma.task.findMany({
        where,
        include: {
          project: { include: { site: true } },
          assignee: { select: { id: true, name: true, email: true } },
          creator: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return jsonSuccess(tasks);
    } catch {
      return jsonSuccess(dynamicStore.getTasks());
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    assertPermission(user.role, "tasks:write");

    const body = await req.json();
    const data = createTaskSchema.parse(body);

    try {
      const project = await prisma.project.findFirst({
        where: { id: data.projectId, organizationId: user.organizationId },
      });
      if (!project) {
        return jsonError("Project not found or outside organization scope", "PROJECT_NOT_FOUND", 404);
      }

      if (data.assigneeUserId) {
        const assignee = await prisma.user.findFirst({
          where: { id: data.assigneeUserId, organizationId: user.organizationId },
        });
        if (!assignee) {
          return jsonError("Assignee user not found or outside organization scope", "USER_NOT_FOUND", 404);
        }
      }

      const task = await prisma.task.create({
        data: {
          organizationId: user.organizationId,
          projectId: data.projectId,
          title: data.title,
          description: data.description,
          priority: data.priority,
          assigneeUserId: data.assigneeUserId,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
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
          note: "Task created",
        },
      });

      return jsonSuccess(task, 201);
    } catch (dbErr) {
      console.warn("[TASKS] Database write failed, saving to dynamicStore:", dbErr);
      const newTask = dynamicStore.addTask(data);
      return jsonSuccess(newTask, 201);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
