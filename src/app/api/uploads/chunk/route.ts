import { NextRequest } from "next/server";
import crypto from "crypto";
import path from "path";
import { getUserContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import { backupFileToDatabase, getStorageProvider } from "@/lib/storage";
import {
  STANDARD_ALLOWED_MIME_TYPES as ALLOWED_MIME_TYPES,
  STANDARD_EXTENSION_MAP as EXTENSION_MAP,
  isValidMagicBytes,
  sanitizeFileName,
  normalizeMimeType,
} from "@/lib/upload-validation";

export const dynamic = "force-dynamic";

// Maximum allowable individual chunk payload (2.5 - 3 MB, strictly below Vercel's 4.5 MB proxy limit)
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
// Maximum assembled file size (250 MB)
const MAX_TOTAL_BYTES = 250 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const formData = await req.formData();
    const chunk = formData.get("chunk") as File | null;
    const uploadId = (formData.get("uploadId") as string) || "";
    const chunkIndexRaw = formData.get("chunkIndex");
    const totalChunksRaw = formData.get("totalChunks");
    const fileName = (formData.get("fileName") as string) || "file";
    const fileType = (formData.get("fileType") as string) || "application/octet-stream";
    const entityType = (formData.get("entityType") as string) || "GENERAL";
    const entityId = (formData.get("entityId") as string) || "";
    const category = (formData.get("category") as string) || "GENERAL_DOCUMENT";
    const projectId = (formData.get("projectId") as string) || null;
    const createAttachment = formData.get("createAttachment") === "true";

    if (!chunk || !uploadId || chunkIndexRaw === null || totalChunksRaw === null) {
      return jsonError("Missing required chunk metadata", "BAD_REQUEST", 400);
    }

    const chunkIndex = parseInt(String(chunkIndexRaw), 10);
    const totalChunks = parseInt(String(totalChunksRaw), 10);

    if (isNaN(chunkIndex) || isNaN(totalChunks) || chunkIndex < 0 || totalChunks <= 0 || chunkIndex >= totalChunks) {
      return jsonError("Invalid chunk index or total chunks", "INVALID_CHUNK_INDEX", 400);
    }

    if (chunk.size > MAX_CHUNK_BYTES) {
      return jsonError("Individual chunk exceeds max allowable limit of 4 MB", "CHUNK_TOO_LARGE", 413);
    }

    const normalizedMime = normalizeMimeType(fileType, fileName);

    if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
      return jsonError(`File type '${fileType}' is not allowed`, "INVALID_FILE_TYPE", 400);
    }

    const chunkBuffer = Buffer.from(await chunk.arrayBuffer());

    // Clean up stale abandoned chunks older than 2 hours periodically
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await prisma.idempotencyRecord
      .deleteMany({
        where: {
          organizationId: user.organizationId,
          operation: "CHUNK_UPLOAD",
          createdAt: { lt: twoHoursAgo },
        },
      })
      .catch(() => {});

    // Save chunk to database store
    const chunkKey = `CHUNK_${uploadId}_${chunkIndex}`;
    await prisma.idempotencyRecord.upsert({
      where: {
        organizationId_key: {
          organizationId: user.organizationId,
          key: chunkKey,
        },
      },
      create: {
        organizationId: user.organizationId,
        key: chunkKey,
        operation: "CHUNK_UPLOAD",
        responseCode: 200,
        responseBodyJson: chunkBuffer.toString("base64"),
      },
      update: {
        responseBodyJson: chunkBuffer.toString("base64"),
      },
    });

    // Check how many chunks have been received for this upload
    const receivedChunks = await prisma.idempotencyRecord.findMany({
      where: {
        organizationId: user.organizationId,
        key: { startsWith: `CHUNK_${uploadId}_` },
        operation: "CHUNK_UPLOAD",
      },
      select: { key: true, responseBodyJson: true },
    });

    if (receivedChunks.length < totalChunks) {
      return jsonSuccess({
        uploadId,
        chunkIndex,
        totalChunks,
        receivedCount: receivedChunks.length,
        completed: false,
      });
    }

    // All chunks received! Reassemble in exact order
    receivedChunks.sort((a, b) => {
      const idxA = parseInt(a.key.slice(`CHUNK_${uploadId}_`.length), 10);
      const idxB = parseInt(b.key.slice(`CHUNK_${uploadId}_`.length), 10);
      return idxA - idxB;
    });

    const fullBuffer = Buffer.concat(
      receivedChunks.map((r) => Buffer.from(r.responseBodyJson || "", "base64"))
    );

    // Enforce total size limit
    if (fullBuffer.length > MAX_TOTAL_BYTES) {
      await prisma.idempotencyRecord.deleteMany({
        where: {
          organizationId: user.organizationId,
          key: { startsWith: `CHUNK_${uploadId}_` },
          operation: "CHUNK_UPLOAD",
        },
      });
      return jsonError("Assembled file exceeds 250 MB maximum limit", "FILE_TOO_LARGE", 413);
    }

    // Magic Bytes Content Verification
    if (!isValidMagicBytes(fullBuffer, normalizedMime, fileName)) {
      await prisma.idempotencyRecord.deleteMany({
        where: {
          organizationId: user.organizationId,
          key: { startsWith: `CHUNK_${uploadId}_` },
          operation: "CHUNK_UPLOAD",
        },
      });
      return jsonError("File signature does not match claimed file type", "MIME_SPOOFING_DETECTED", 400);
    }

    // Determine storage target
    const fileId = crypto.randomUUID();
    const safeExt = EXTENSION_MAP[normalizedMime] || path.extname(fileName) || ".bin";
    const diskFileName = `${user.organizationId}_${fileId}${safeExt}`;
    const sanitizedOriginalName = sanitizeFileName(fileName);

    const storage = getStorageProvider();
    await storage.put(diskFileName, fullBuffer, normalizedMime);

    try {
      await backupFileToDatabase(
        user.organizationId,
        [`FILE_BLOB_${fileId}`, `FILE_BLOB_${diskFileName}`],
        fullBuffer
      );
    } catch (err) {
      console.warn("Notice: Blob database backup skipped in chunk assembly:", err);
    }

    // Create Attachment record if requested or standard entity attachment
    if (createAttachment || entityType !== "TEMP") {
      await prisma.attachment.create({
        data: {
          organizationId: user.organizationId,
          entityType: entityType.toUpperCase(),
          entityId: entityId || fileId,
          fileId,
          fileName: sanitizedOriginalName,
          fileSize: fullBuffer.length,
          mimeType: normalizedMime,
          category: category.toUpperCase(),
          diskFileName,
          projectId: projectId || null,
          uploadedById: user.userId,
        },
      });
    }

    // Record audit event
    await prisma.auditEvent.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.userId,
        action: "DOCUMENT_UPLOADED",
        entityType: entityType.toUpperCase(),
        entityId: entityId || fileId,
        reason: `Uploaded ${category}: ${sanitizedOriginalName} (${(fullBuffer.length / 1024 / 1024).toFixed(2)} MB)`,
        afterJson: JSON.stringify({
          fileId,
          originalName: sanitizedOriginalName,
          mimeType: fileType,
          sizeBytes: fullBuffer.length,
          category,
          diskFileName,
        }),
      },
    });

    // Clean up temporary chunk records
    await prisma.idempotencyRecord.deleteMany({
      where: {
        organizationId: user.organizationId,
        key: { startsWith: `CHUNK_${uploadId}_` },
        operation: "CHUNK_UPLOAD",
      },
    });

    return jsonSuccess({
      url: `/api/uploads/${fileId}${safeExt}`,
      fileId,
      diskFileName,
      fileName: sanitizedOriginalName,
      sizeBytes: fullBuffer.length,
      completed: true,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
