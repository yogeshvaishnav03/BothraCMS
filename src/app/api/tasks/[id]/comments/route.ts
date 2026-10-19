import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserContext, requireProjectAccess } from "@/lib/server-auth";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const createCommentSchema = z.object({
  content: z.string().min(1),
  type: z.enum(["COMMENT", "QUESTION", "ASSISTANCE_REQUEST", "PROGRESS_UPDATE"]).default("COMMENT"),
  photoUrl: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);

    const task = await prisma.task.findFirst({
      where: { id: params.id, organizationId: user.organizationId, isArchived: false },
    });
    if (!task) return jsonError("Task not found", "NOT_FOUND", 404);

    if (task.assigneeUserId !== user.userId && task.createdBy !== user.userId) {
      await requireProjectAccess(user, task.projectId, "tasks:read");
    }

    const comments = await prisma.taskComment.findMany({
      where: { taskId: task.id, organizationId: user.organizationId },
      include: {
        user: { select: { id: true, name: true, role: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return jsonSuccess(comments);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);

    const task = await prisma.task.findFirst({
      where: { id: params.id, organizationId: user.organizationId, isArchived: false },
    });
    if (!task) return jsonError("Task not found", "NOT_FOUND", 404);

    if (task.assigneeUserId !== user.userId && task.createdBy !== user.userId) {
      await requireProjectAccess(user, task.projectId, "tasks:write");
    }

    const body = await req.json();
    const data = createCommentSchema.parse(body);

    const comment = await prisma.taskComment.create({
      data: {
        organizationId: user.organizationId,
        taskId: task.id,
        userId: user.userId,
        content: data.content.trim(),
        type: data.type,
        photoUrl: data.photoUrl || null,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    });

    return jsonSuccess(comment, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
