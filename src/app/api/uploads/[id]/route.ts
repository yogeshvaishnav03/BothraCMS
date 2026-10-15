import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getUserContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const UPLOAD_BASE_DIR = path.resolve(process.cwd(), "storage", "uploads", "private");

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserContext(req);
    if (!user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

    const fileId = params.id;

    // Verify file ownership via AuditEvent record for the organization
    const auditRecord = await prisma.auditEvent.findFirst({
      where: {
        organizationId: user.organizationId,
        action: "DOCUMENT_UPLOADED",
        OR: [
          { entityId: fileId },
          { afterJson: { contains: fileId } },
        ],
      },
    });

    if (!auditRecord) {
      return jsonError("Document not found or outside organization scope", "NOT_FOUND", 404);
    }

    let meta: any = {};
    try {
      meta = JSON.parse(auditRecord.afterJson || "{}");
    } catch {
      return jsonError("Corrupted file metadata", "INTERNAL_ERROR", 500);
    }

    const diskFileName = meta.diskFileName;
    if (!diskFileName) {
      return jsonError("File reference missing", "NOT_FOUND", 404);
    }

    // Prevent directory traversal
    const safeDiskName = path.basename(diskFileName);
    const filePath = path.join(UPLOAD_BASE_DIR, safeDiskName);

    if (!fs.existsSync(filePath)) {
      return jsonError("File not found on storage disk", "FILE_NOT_FOUND", 404);
    }

    const fileBuffer = await fs.promises.readFile(filePath);
    const mimeType = meta.mimeType || "application/octet-stream";

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(meta.originalName || "document")}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Frame-Options": "DENY",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
