import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getUserContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const UPLOAD_BASE_DIR = path.resolve(process.cwd(), "storage", "uploads", "private");
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

function isValidMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;
  // PNG: 89 50 4E 47
  if (mimeType === "image/png") {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  // JPEG: FF D8 FF
  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  // PDF: 25 50 44 46 (%PDF)
  if (mimeType === "application/pdf") {
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  }
  // WEBP: RIFF ... WEBP
  if (mimeType === "image/webp") {
    if (buffer.length < 12) return false;
    const isRiff = buffer.toString("ascii", 0, 4) === "RIFF";
    const isWebp = buffer.toString("ascii", 8, 12) === "WEBP";
    return isRiff && isWebp;
  }
  return false;
}

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_BASE_DIR)) {
  fs.mkdirSync(UPLOAD_BASE_DIR, { recursive: true });
}

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
    const filePath = path.join(UPLOAD_BASE_DIR, diskFileName);

    // Sanitize user provided filename to prevent header injection and path traversal
    const sanitizedOriginalName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_");

    // Save to private directory
    await fs.promises.writeFile(filePath, fileBuffer);

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
