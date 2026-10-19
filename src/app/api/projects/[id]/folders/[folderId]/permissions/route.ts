import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import {
  requireUserContext,
  requireFolderAccess,
  requireProjectAccess,
  isOrgOwnerOrAdmin,
} from "@/lib/server-auth";
import { Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const permissionSchema = z.object({
  userId: z.string().optional(),
  role: z.enum([
    "SUPER_ADMIN",
    "ORG_ADMIN",
    "PROJECT_MANAGER",
    "SITE_ENGINEER",
    "SUPERVISOR",
    "STORE_KEEPER",
    "ACCOUNTANT",
    "VIEWER",
  ]).optional(),
  canView: z.boolean().default(true),
  canUpload: z.boolean().default(false),
  canEdit: z.boolean().default(false),
  canDelete: z.boolean().default(false),
  canDownload: z.boolean().default(true),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; folderId: string } }
) {
  try {
    const user = await requireUserContext(req);
    await requireFolderAccess(user, params.folderId, "view");

    const permissions = await prisma.folderPermission.findMany({
      where: {
        folderId: params.folderId,
        organizationId: user.organizationId,
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    return jsonSuccess(permissions);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; folderId: string } }
) {
  try {
    const user = await requireUserContext(req, "projects:write");
    await requireProjectAccess(user, params.id, "projects:write");

    const folder = await prisma.documentFolder.findFirst({
      where: {
        id: params.folderId,
        projectId: params.id,
        organizationId: user.organizationId,
        isArchived: false,
      },
    });

    if (!folder) {
      return jsonError("Folder not found", "NOT_FOUND", 404);
    }

    const body = await req.json();
    const data = permissionSchema.parse(body);

    if (!data.userId && !data.role) {
      return jsonError("Either userId or role must be provided", "BAD_REQUEST", 400);
    }

    // Upsert folder permission
    let perm = await prisma.folderPermission.findFirst({
      where: {
        folderId: folder.id,
        organizationId: user.organizationId,
        userId: data.userId || null,
        role: (data.role as Role) || null,
      },
    });

    if (perm) {
      perm = await prisma.folderPermission.update({
        where: { id: perm.id },
        data: {
          canView: data.canView,
          canUpload: data.canUpload,
          canEdit: data.canEdit,
          canDelete: data.canDelete,
          canDownload: data.canDownload,
        },
      });
    } else {
      perm = await prisma.folderPermission.create({
        data: {
          organizationId: user.organizationId,
          folderId: folder.id,
          userId: data.userId || null,
          role: (data.role as Role) || null,
          canView: data.canView,
          canUpload: data.canUpload,
          canEdit: data.canEdit,
          canDelete: data.canDelete,
          canDownload: data.canDownload,
        },
      });
    }

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "FOLDER_PERMISSION_CONFIGURED",
        entityType: "FOLDER_PERMISSION",
        entityId: perm.id,
        reason: `Configured folder permission on '${folder.name}' for ${data.userId ? `user ${data.userId}` : `role ${data.role}`}`,
        afterJson: JSON.stringify(data),
      },
    });

    return jsonSuccess(perm, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; folderId: string } }
) {
  try {
    const user = await requireUserContext(req, "projects:write");
    await requireProjectAccess(user, params.id, "projects:write");

    const { searchParams } = new URL(req.url);
    const permissionId = searchParams.get("permissionId");
    if (!permissionId) {
      return jsonError("Permission ID is required", "BAD_REQUEST", 400);
    }

    const perm = await prisma.folderPermission.findFirst({
      where: {
        id: permissionId,
        folderId: params.folderId,
        organizationId: user.organizationId,
      },
    });

    if (!perm) {
      return jsonError("Folder permission not found", "NOT_FOUND", 404);
    }

    await prisma.folderPermission.delete({
      where: { id: perm.id },
    });

    return jsonSuccess({ message: "Folder permission deleted" });
  } catch (error) {
    return handleApiError(error);
  }
}
