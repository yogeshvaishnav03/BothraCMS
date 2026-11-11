import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getUserContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { backupFileToDatabase, getStorageProvider } from "@/lib/storage";
import {
  STANDARD_ALLOWED_MIME_TYPES as ALLOWED_MIME_TYPES,
  STANDARD_EXTENSION_MAP as EXTENSION_MAP,
  isValidMagicBytes,
  sanitizeFileName,
} from "@/lib/upload-validation";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const category = (formData.get("category") as string) || "GENERAL_DOCUMENT";
    const entityType = (formData.get("entityType") as string) || "GENERAL";
    const entityId = (formData.get("entityId") as string) || "";
    const notes = (formData.get("notes") as string) || "";

    if (!file) {
      return jsonError("No file provided in form data", "MISSING_FILE", 400);
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return jsonError(
        `Invalid file type '${file.type}'. Allowed types: JPEG, PNG, WEBP, PDF`,
        "INVALID_FILE_TYPE",
        400
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return jsonError(
        `File size (${(file.size / 1024 / 1024).toFixed(2)} MB) exceeds maximum limit of 5 MB`,
        "FILE_TOO_LARGE",
        400
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Magic Bytes Content Inspection
    if (!isValidMagicBytes(fileBuffer, file.type)) {
      return jsonError(
        "File signature (magic bytes) does not match the claimed MIME type",
        "MIME_SPOOFING_DETECTED",
        400
      );
    }

    // Strictly enforce safe file extension from verified MIME type
    const safeExt = EXTENSION_MAP[file.type] || ".bin";
    const fileId = crypto.randomUUID();
    const diskFileName = `${user.organizationId}_${fileId}${safeExt}`;

    // Sanitize user provided filename to prevent header injection and path traversal
    const sanitizedOriginalName = sanitizeFileName(file.name);

    // Save to storage provider (S3 / R2 / Local)
    const storage = getStorageProvider();
    await storage.put(diskFileName, fileBuffer, file.type);

    // A copy in the database when there is no cloud storage, so the file survives on Vercel.
    try {
      await backupFileToDatabase(user.organizationId, [`FILE_BLOB_${fileId}`, `FILE_BLOB_${diskFileName}`], fileBuffer);
    } catch (err) {
      console.warn("Notice: Blob database backup skipped in uploads POST:", err);
    }

    // Record audit event & metadata
    const audit = await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "DOCUMENT_UPLOADED",
        entityType: entityType.toUpperCase(),
        entityId: entityId || fileId,
        reason: notes || `Uploaded ${category}: ${sanitizedOriginalName}`,
        afterJson: JSON.stringify({
          fileId,
          originalName: sanitizedOriginalName,
          mimeType: file.type,
          sizeBytes: file.size,
          category,
          diskFileName,
        }),
      },
    });

    // Also create an Attachment record so the serve route (/api/uploads/[id])
    // can reliably locate the file by fileId + organizationId for all users.
    await prisma.attachment.create({
      data: {
        organizationId: user.organizationId,
        entityType: entityType.toUpperCase() || "GENERAL",
        entityId: entityId || fileId,
        fileId,
        fileName: sanitizedOriginalName,
        fileSize: file.size,
        mimeType: file.type,
        category: category || "GENERAL",
        diskFileName,
        uploadedById: user.userId,
      },
    });

    return jsonSuccess(
      {
        id: fileId,
        name: sanitizedOriginalName,
        mimeType: file.type,
        sizeBytes: file.size,
        category,
        url: `/api/uploads/${fileId}`,
        auditId: audit.id,
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const uploads = await prisma.auditEvent.findMany({
      where: {
        organizationId: user.organizationId,
        action: "DOCUMENT_UPLOADED",
      },
      include: {
        actor: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const results = uploads.map((u) => {
      let meta: any = {};
      try {
        meta = JSON.parse(u.afterJson || "{}");
      } catch {
        meta = {};
      }
      return {
        id: meta.fileId || u.entityId,
        name: meta.originalName || "Document",
        category: meta.category || "ATTACHMENT",
        mimeType: meta.mimeType || "application/octet-stream",
        sizeBytes: meta.sizeBytes || 0,
        uploadedBy: u.actor.name,
        uploadedAt: u.createdAt,
        url: `/api/uploads/${meta.fileId || u.entityId}`,
      };
    });

    return jsonSuccess(results);
  } catch (error) {
    return handleApiError(error);
  }
}
