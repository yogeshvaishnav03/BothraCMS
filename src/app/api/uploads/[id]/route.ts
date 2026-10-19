import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db";
import { jsonError, handleApiError } from "@/lib/api-response";
import { getStorageProvider } from "@/lib/storage";
import {
  requireUserContext,
  requireProjectAccess,
  requireFolderAccess,
  requireFinanceRead,
  isOrgOwnerOrAdmin,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const FINANCIAL_CATEGORIES = new Set(["INVOICE", "BILL", "PAYMENT", "RECEIPT"]);

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    const fileId = params.id;

    // Check Attachment model first for authoritative access control
    const attachment = await prisma.attachment.findFirst({
      where: {
        fileId,
        organizationId: user.organizationId,
      },
    });

    let diskFileName: string | null = null;
    let originalName: string = "document";
    let mimeType: string = "application/octet-stream";

    if (attachment) {
      if (attachment.isArchived && !isOrgOwnerOrAdmin(user)) {
        return jsonError("Document not found or outside organization scope", "NOT_FOUND", 404);
      }

      // Check project access if file belongs to a project
      if (attachment.projectId) {
        await requireProjectAccess(user, attachment.projectId);
      }

      // Check folder access if file belongs to a folder
      if (attachment.folderId) {
        await requireFolderAccess(user, attachment.folderId, "download");
      }

      // Check financial permission if file is an invoice/bill/payment
      if (FINANCIAL_CATEGORIES.has(attachment.category.toUpperCase())) {
        requireFinanceRead(user);
      }

      diskFileName = attachment.diskFileName;
      originalName = attachment.fileName;
      mimeType = attachment.mimeType;
    } else {
      // Fallback to AuditEvent record for legacy or audit uploads
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

      diskFileName = meta.diskFileName;
      originalName = meta.originalName || "document";
      mimeType = meta.mimeType || "application/octet-stream";

      if (meta.projectId) {
        await requireProjectAccess(user, meta.projectId);
      }
      if (meta.category && FINANCIAL_CATEGORIES.has(meta.category.toUpperCase())) {
        requireFinanceRead(user);
      }
    }

    if (!diskFileName) {
      return jsonError("File reference missing", "NOT_FOUND", 404);
    }

    // Prevent directory traversal and fetch via storage provider
    const safeDiskName = path.basename(diskFileName);
    const storage = getStorageProvider();
    const fileBuffer = await storage.get(safeDiskName);

    if (!fileBuffer) {
      return jsonError("File not found on storage backend", "FILE_NOT_FOUND", 404);
    }

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(originalName)}"`,
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
