import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { MeasurementBookService } from "@/services/measurement-book-service";
import { jsonSuccess, jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const postImageSchema = z.object({
  action: z.enum(["UPLOAD", "REPLACE"]).default("UPLOAD"),
  fileUrl: z.string().min(1, "fileUrl is required"),
  fileName: z.string().min(1, "fileName is required"),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  caption: z.string().optional(),
  // Required if action === "REPLACE"
  attachmentId: z.string().optional(),
  reason: z.string().optional(),
});

const deleteImageSchema = z.object({
  attachmentId: z.string().min(1, "attachmentId is required"),
  reason: z.string().min(3, "Mandatory reason must be at least 3 characters"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const data = postImageSchema.parse(body);

    if (data.action === "REPLACE") {
      if (!data.attachmentId || !data.reason || !data.reason.trim()) {
        return jsonError("attachmentId and mandatory reason are required for replacing an image", "INVALID_INPUT", 400);
      }

      const replaced = await MeasurementBookService.replaceAttachmentWithReason({
        organizationId: user.organizationId,
        entryId: params.id,
        attachmentId: data.attachmentId,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        caption: data.caption,
        reason: data.reason,
        userId: user.userId,
        userName: (user as any).name || (user as any).email || "User",
        role: user.role,
      });

      return jsonSuccess(replaced, 201);
    }

    // Default: UPLOAD
    const uploaded = await MeasurementBookService.addAttachment({
      organizationId: user.organizationId,
      entryId: params.id,
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      caption: data.caption,
      userId: user.userId,
      userName: (user as any).name || (user as any).email || "User",
      role: user.role,
    });

    return jsonSuccess(uploaded, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const body = await req.json();
    const data = deleteImageSchema.parse(body);

    const result = await MeasurementBookService.deleteAttachmentWithReason({
      organizationId: user.organizationId,
      entryId: params.id,
      attachmentId: data.attachmentId,
      reason: data.reason,
      userId: user.userId,
      userName: (user as any).name || (user as any).email || "User",
      role: user.role,
    });

    return jsonSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
