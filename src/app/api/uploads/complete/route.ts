import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import {
  requireUserContext,
  requireProjectAccess,
  requireFolderAccess,
  canReadFinance,
} from "@/lib/server-auth";
import { verifyObjectExists } from "@/lib/storage";

export const dynamic = "force-dynamic";

const FINANCIAL_CATEGORIES = new Set(["INVOICE", "BILL", "PAYMENT", "RECEIPT"]);

const CompleteUploadSchema = z.object({
  fileId: z.string().min(1),
  storageKey: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  category: z.string().optional().default("GENERAL"),
  entityType: z.string().optional().default("GENERAL"),
  entityId: z.string().optional().default(""),
  projectId: z.string().optional(),
  folderId: z.string().optional(),
  notes: z.string().optional(),
  checksum: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const body = await req.json().catch(() => null);

    const parsed = CompleteUploadSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid completion payload", "VALIDATION_ERROR", 400, parsed.error.format());
    }

    const {
      fileId,
      storageKey,
      fileName,
      mimeType,
      sizeBytes,
      category,
      entityType,
      entityId,
      projectId,
      folderId,
      notes,
    } = parsed.data;

    // Verify tenant scoping in storageKey to prevent tamper attacks
    if (!storageKey.startsWith(`org_${user.organizationId}/`)) {
      return jsonError("Unauthorized storage path key", "FORBIDDEN", 403);
    }

    if (projectId) {
      await requireProjectAccess(user, projectId);
    }

    if (folderId) {
      await requireFolderAccess(user, folderId, "upload");
    }

    if (category && FINANCIAL_CATEGORIES.has(category.toUpperCase())) {
      if (!canReadFinance(user)) {
        return jsonError("You do not have permission to attach financial documents.", "FORBIDDEN", 403);
      }
    }

    // Verify file actually exists in storage before creating database record
    const verified = await verifyObjectExists(storageKey);
    if (!verified.exists) {
      return jsonError("Object was not found in storage. Upload may have been interrupted.", "OBJECT_NOT_FOUND", 400);
    }

    // If storage reports actual byte size, use the verified storage byte size
    const finalSizeBytes = verified.size || sizeBytes;

    const attachment = await prisma.attachment.create({
      data: {
        organizationId: user.organizationId,
        entityType: entityType.toUpperCase(),
        entityId: entityId || "DIRECT_UPLOAD",
        fileId,
        fileName,
        fileSize: finalSizeBytes,
        mimeType: verified.mimeType || mimeType,
        category: category.toUpperCase(),
        diskFileName: storageKey,
        projectId: projectId || null,
        folderId: folderId || null,
        notes: notes || null,
        uploadedById: user.userId,
      },
    });

    // Record immutable audit event
    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "ATTACHMENT_UPLOADED_DIRECT",
        entityType: "ATTACHMENT",
        entityId: attachment.id,
        afterJson: JSON.stringify({
          attachmentId: attachment.id,
          fileId,
          storageKey,
          fileName,
          sizeBytes: finalSizeBytes,
          category,
          projectId,
        }),
      },
    }).catch(() => {});

    return jsonSuccess({
      id: attachment.id,
      fileId: attachment.fileId,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
      category: attachment.category,
      url: `/api/uploads/${attachment.fileId}`,
      createdAt: attachment.createdAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
