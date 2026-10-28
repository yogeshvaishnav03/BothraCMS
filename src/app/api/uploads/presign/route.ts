import { NextRequest } from "next/server";
import crypto from "crypto";
import path from "path";
import { z } from "zod";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";
import {
  requireUserContext,
  requireProjectAccess,
  requireFolderAccess,
  canReadFinance,
} from "@/lib/server-auth";
import { createPresignedUploadUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/csv",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

const MAX_STANDARD_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB for site evidence video

const FINANCIAL_CATEGORIES = new Set(["INVOICE", "BILL", "PAYMENT", "RECEIPT"]);

const PresignRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  category: z.string().optional().default("GENERAL"),
  entityType: z.string().optional().default("GENERAL"),
  entityId: z.string().optional().default(""),
  projectId: z.string().optional(),
  folderId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserContext(req);
    const body = await req.json().catch(() => null);

    const parsed = PresignRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid upload request payload", "VALIDATION_ERROR", 400, parsed.error.format());
    }

    const { fileName, mimeType, sizeBytes, category, projectId, folderId } = parsed.data;

    if (!ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
      return jsonError(
        `MIME type '${mimeType}' is not permitted. Permitted types: images, PDFs, office documents, and MP4/WebM videos.`,
        "UNSUPPORTED_MEDIA_TYPE",
        415
      );
    }

    const isVideo = mimeType.toLowerCase().startsWith("video/");
    const maxLimit = isVideo ? MAX_VIDEO_SIZE : MAX_STANDARD_SIZE;
    if (sizeBytes > maxLimit) {
      return jsonError(
        `File size (${(sizeBytes / 1024 / 1024).toFixed(1)} MB) exceeds allowed limit of ${maxLimit / 1024 / 1024} MB.`,
        "FILE_TOO_LARGE",
        413
      );
    }

    if (projectId) {
      await requireProjectAccess(user, projectId);
    }

    if (folderId) {
      await requireFolderAccess(user, folderId, "upload");
    }

    if (category && FINANCIAL_CATEGORIES.has(category.toUpperCase())) {
      if (!canReadFinance(user)) {
        return jsonError("You do not have permission to upload financial attachments.", "FORBIDDEN", 403);
      }
    }

    // Build tamper-proof, non-colliding object key scoped to tenant & project
    const fileId = crypto.randomUUID();
    const sanitizedName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
    const projectFolder = projectId ? `proj_${projectId}` : "general";
    const storageKey = `org_${user.organizationId}/${projectFolder}/${fileId}_${sanitizedName}`;

    const presigned = await createPresignedUploadUrl({
      key: storageKey,
      mimeType,
      sizeBytes,
      expiresInSeconds: 900, // 15 mins short-lived URL
    });

    if (!presigned) {
      // Cloud storage not configured (e.g. local development mode)
      return jsonSuccess({
        directUploadSupported: false,
        fallbackUrl: "/api/attachments",
        fileId,
        storageKey,
      });
    }

    return jsonSuccess({
      directUploadSupported: true,
      uploadUrl: presigned.uploadUrl,
      storageKey: presigned.storageKey,
      fileId,
      method: presigned.method,
      headers: presigned.headers,
      expiresInSeconds: presigned.expiresInSeconds,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
