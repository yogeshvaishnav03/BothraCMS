import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { backupFileToDatabase, getStorageProvider } from "@/lib/storage";
import {
  STANDARD_ALLOWED_MIME_TYPES,
  FINANCIAL_CATEGORIES,
  isValidMagicBytes,
  sanitizeFileName,
} from "@/lib/upload-validation";

import {
  requireUserContext,
  requireProjectAccess,
  requireFolderAccess,
  requireFinanceRead,
  isOrgOwnerOrAdmin,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

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
      await requireFolderAccess(user, attachment.folderId, "edit");
    }
    if (FINANCIAL_CATEGORIES.has(attachment.category.toUpperCase())) {
      requireFinanceRead(user);
    }
    if (
      !isOrgOwnerOrAdmin(user) &&
      user.role !== "PROJECT_MANAGER" &&
      attachment.uploadedById !== user.userId
    ) {
      return jsonError("Forbidden: Insufficient privileges to replace this attachment", "FORBIDDEN", 403);
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return jsonError("No replacement file provided", "MISSING_FILE", 400);
    }

    if (!STANDARD_ALLOWED_MIME_TYPES.has(file.type)) {
      return jsonError(
        `Invalid file format '${file.type}'. Supported formats: JPEG, PNG, WEBP, PDF`,
        "INVALID_FILE_TYPE",
        400
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return jsonError(
        `File size (${(file.size / 1024 / 1024).toFixed(2)} MB) exceeds limit of 10 MB`,
        "FILE_TOO_LARGE",
        400
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    if (!isValidMagicBytes(fileBuffer, file.type)) {
      return jsonError("File signature verification failed", "MIME_SPOOFING_DETECTED", 400);
    }

    const sanitizedOriginalName = sanitizeFileName(file.name);

    // Put file into storage backend
    const storage = getStorageProvider();
    await storage.put(attachment.diskFileName, fileBuffer, file.type);

    // A copy in the database when there is no cloud storage.
    await backupFileToDatabase(
      user.organizationId,
      [`FILE_BLOB_${attachment.fileId}`, `FILE_BLOB_${attachment.diskFileName}`, `FILE_BLOB_${attachment.id}`],
      fileBuffer
    );

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
