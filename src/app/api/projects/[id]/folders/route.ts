import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import {
  requireUserContext,
  requireProjectAccess,
  requirePermission,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const createFolderSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  parentId: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    await requireProjectAccess(user, params.id);

    const folders = await prisma.documentFolder.findMany({
      where: {
        projectId: params.id,
        organizationId: user.organizationId,
        isArchived: false,
      },
      include: {
        permissions: true,
        _count: {
          select: {
            attachments: { where: { isArchived: false } },
            subfolders: { where: { isArchived: false } },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return jsonSuccess(folders);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req, "projects:write");
    await requireProjectAccess(user, params.id, "projects:write");

    const body = await req.json();
    const data = createFolderSchema.parse(body);

    if (data.parentId) {
      const parent = await prisma.documentFolder.findFirst({
        where: {
          id: data.parentId,
          projectId: params.id,
          organizationId: user.organizationId,
          isArchived: false,
        },
      });
      if (!parent) {
        return jsonError("Parent folder not found in this project", "NOT_FOUND", 404);
      }
    }

    const folder = await prisma.documentFolder.create({
      data: {
        organizationId: user.organizationId,
        projectId: params.id,
        name: data.name.trim(),
        description: data.description?.trim(),
        parentId: data.parentId || null,
        isArchived: false,
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "FOLDER_CREATED",
        entityType: "DOCUMENT_FOLDER",
        entityId: folder.id,
        reason: `Created folder '${folder.name}' in project ${params.id}`,
      },
    });

    return jsonSuccess(folder, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
