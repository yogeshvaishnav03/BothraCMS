import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import {
  requireUserContext,
  requireFolderAccess,
  requireProjectAccess,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const updateFolderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  parentId: z.string().nullable().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; folderId: string } }
) {
  try {
    const user = await requireUserContext(req);
    const folder = await requireFolderAccess(user, params.folderId, "view");

    // Fetch folder with files and subfolders
    const folderDetail = await prisma.documentFolder.findFirst({
      where: {
        id: params.folderId,
        projectId: params.id,
        organizationId: user.organizationId,
        isArchived: false,
      },
      include: {
        parent: true,
        subfolders: {
          where: { isArchived: false },
          orderBy: { name: "asc" },
        },
        attachments: {
          where: { isArchived: false },
          orderBy: { createdAt: "desc" },
        },
        permissions: true,
      },
    });

    if (!folderDetail) {
      return jsonError("Folder not found", "NOT_FOUND", 404);
    }

    return jsonSuccess(folderDetail);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; folderId: string } }
) {
  try {
    const user = await requireUserContext(req);
    const folder = await requireFolderAccess(user, params.folderId, "edit");

    const body = await req.json();
    const data = updateFolderSchema.parse(body);

    // If moving folder to a different parent, check for circular hierarchy
    if (data.parentId !== undefined) {
      if (data.parentId === folder.id) {
        return jsonError("A folder cannot be set as its own parent", "CIRCULAR_DEPENDENCY", 400);
      }

      if (data.parentId !== null) {
        // Verify target parent exists and belongs to project
        const targetParent = await prisma.documentFolder.findFirst({
          where: {
            id: data.parentId,
            projectId: params.id,
            organizationId: user.organizationId,
            isArchived: false,
          },
        });

        if (!targetParent) {
          return jsonError("Target parent folder not found", "NOT_FOUND", 404);
        }

        // Detect circular ancestor loop: traverse up targetParent's ancestry
        let currentParentId: string | null = targetParent.parentId;
        while (currentParentId) {
          if (currentParentId === folder.id) {
            return jsonError(
              "Circular hierarchy detected: cannot move a folder into its own subfolder",
              "CIRCULAR_DEPENDENCY",
              400
            );
          }
          const ancestor = await prisma.documentFolder.findUnique({
            where: { id: currentParentId },
            select: { parentId: true },
          });
          currentParentId = ancestor?.parentId || null;
        }
      }
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.description !== undefined) updateData.description = data.description?.trim();
    if (data.parentId !== undefined) updateData.parentId = data.parentId;

    const updated = await prisma.documentFolder.update({
      where: { id: folder.id },
      data: updateData,
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "FOLDER_UPDATED",
        entityType: "DOCUMENT_FOLDER",
        entityId: folder.id,
        reason: `Updated folder ${folder.name}`,
        afterJson: JSON.stringify(updateData),
      },
    });

    return jsonSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; folderId: string } }
) {
  try {
    const user = await requireUserContext(req);
    const folder = await requireFolderAccess(user, params.folderId, "delete");

    const cascade = req.nextUrl.searchParams.get("cascade") === "true";

    // Non-empty folder check
    const [activeFilesCount, activeSubfoldersCount] = await Promise.all([
      prisma.attachment.count({
        where: { folderId: folder.id, isArchived: false },
      }),
      prisma.documentFolder.count({
        where: { parentId: folder.id, isArchived: false },
      }),
    ]);

    if (!cascade && (activeFilesCount > 0 || activeSubfoldersCount > 0)) {
      return jsonError(
        `Cannot delete non-empty folder (${activeFilesCount} files, ${activeSubfoldersCount} subfolders). Specify cascade=true to archive all contents.`,
        "FOLDER_NOT_EMPTY",
        400
      );
    }

    // Soft-delete folder to prevent permanent data loss
    await prisma.documentFolder.update({
      where: { id: folder.id },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        archivedById: user.userId,
      },
    });

    if (cascade) {
      await Promise.all([
        prisma.attachment.updateMany({
          where: { folderId: folder.id, isArchived: false },
          data: {
            isArchived: true,
            archivedAt: new Date(),
            archivedById: user.userId,
            archiveReason: `Cascaded from folder ${folder.name}`,
          },
        }),
        prisma.documentFolder.updateMany({
          where: { parentId: folder.id, isArchived: false },
          data: {
            isArchived: true,
            archivedAt: new Date(),
            archivedById: user.userId,
          },
        }),
      ]);
    }

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "FOLDER_ARCHIVED",
        entityType: "DOCUMENT_FOLDER",
        entityId: folder.id,
        reason: `Archived folder ${folder.name} (cascade=${cascade})`,
      },
    });

    return jsonSuccess({
      message: "Folder archived successfully",
      id: folder.id,
      cascade,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
