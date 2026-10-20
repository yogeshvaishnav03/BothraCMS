import { NextRequest } from "next/server";
import path from "path";
import { getUserContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { getStorageProvider } from "@/lib/storage";

import { requireUserContext, requireProjectAccess, requireFolderAccess, isOrgOwnerOrAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);

    const attachment = await prisma.attachment.findFirst({
      where: {
        organizationId: user.organizationId,
        OR: [{ id: params.id }, { fileId: params.id }],
      },
    });

    if (!attachment || attachment.isArchived) {
      return jsonError("Attachment not found or outside organization scope", "NOT_FOUND", 404);
    }

    if (attachment.projectId) {
      await requireProjectAccess(user, attachment.projectId);
    }
    if (attachment.folderId) {
      await requireFolderAccess(user, attachment.folderId, "upload");
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return jsonError("No replacement file provided", "MISSING_FILE", 400);
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const sanitizedOriginalName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_");

    // Put file into storage backend
    const storage = getStorageProvider();
    await storage.put(attachment.diskFileName, fileBuffer, file.type);

    // Save persistent base64 blob to IdempotencyRecord
    const b64 = fileBuffer.toString("base64");
    const candidateKeys = [
      `FILE_BLOB_${attachment.fileId}`,
      `FILE_BLOB_${attachment.diskFileName}`,
      `FILE_BLOB_${attachment.id}`,
    ];

    for (const key of candidateKeys) {
      await prisma.idempotencyRecord.upsert({
        where: {
          organizationId_key: {
            organizationId: user.organizationId,
            key,
          },
        },
        create: {
          organizationId: user.organizationId,
          key,
          operation: "FILE_BLOB",
          responseCode: 200,
          responseBodyJson: b64,
        },
        update: {
          responseBodyJson: b64,
        },
      });
    }

    const updated = await prisma.attachment.update({
      where: { id: attachment.id },
      data: {
        fileName: sanitizedOriginalName,
        fileSize: file.size,
        mimeType: file.type,
      },
    });

    return jsonSuccess({
      message: "Attachment file replaced and updated successfully",
      data: {
        id: updated.id,
        fileId: updated.fileId,
        fileName: updated.fileName,
        fileSize: updated.fileSize,
        mimeType: updated.mimeType,
        url: `/api/uploads/${updated.fileId}?t=${Date.now()}`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

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
