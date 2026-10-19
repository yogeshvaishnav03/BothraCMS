import { NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { getStorageProvider } from "@/lib/storage";

import { requireUserContext, requireProjectAccess, requireFolderAccess, isOrgOwnerOrAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);

    const attachment = await prisma.attachment.findFirst({
      where: { id: params.id, organizationId: user.organizationId },
    });

    if (!attachment || attachment.isArchived) {
      return jsonError("Attachment not found or outside organization scope", "NOT_FOUND", 404);
    }

    if (attachment.projectId) {
      await requireProjectAccess(user, attachment.projectId);
    }

    if (attachment.folderId) {
      await requireFolderAccess(user, attachment.folderId, "delete");
    }

    // Role check: Admin, Project Manager or original uploader can delete/archive
    if (
      !isOrgOwnerOrAdmin(user) &&
      user.role !== "PROJECT_MANAGER" &&
      attachment.uploadedById !== user.userId
    ) {
      return jsonError("Forbidden: Insufficient privileges to archive this attachment", "FORBIDDEN", 403);
    }

    // Soft-delete to preserve business records and file history
    const archived = await prisma.attachment.update({
      where: { id: attachment.id },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        archivedById: user.userId,
        archiveReason: "Attachment archived by user",
      },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "DOCUMENT_ARCHIVED",
        entityType: attachment.entityType,
        entityId: attachment.entityId,
        reason: `Archived attachment ${attachment.fileName} (${attachment.category})`,
      },
    });

    return jsonSuccess({ message: "Attachment archived successfully", id: archived.id });
  } catch (error) {
    return handleApiError(error);
  }
}
