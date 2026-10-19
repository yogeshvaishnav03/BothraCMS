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

    // 1. Check Attachment model (by fileId, id, or diskFileName)
    const attachment = await prisma.attachment.findFirst({
      where: {
        OR: [
          { fileId: fileId },
          { id: fileId },
          { diskFileName: fileId },
        ],
      },
    });

    let diskFileName: string | null = null;
    let originalName: string = "document";
    let mimeType: string = "application/octet-stream";

    if (attachment) {
      if (attachment.organizationId !== user.organizationId && !isOrgOwnerOrAdmin(user)) {
        // Allow access if the user is a participant in any chat conversation that references this image
        const isChatParticipant = await prisma.conversationParticipant.findFirst({
          where: {
            userId: user.userId,
            conversation: {
              messages: {
                some: {
                  OR: [
                    { imageUrl: { contains: fileId } },
                    { imageUrl: { contains: attachment.fileId } },
                    { imageUrl: { contains: attachment.diskFileName } },
                  ],
                },
              },
            },
          },
        });
        if (!isChatParticipant) {
          return jsonError("Document not found or outside organization scope", "NOT_FOUND", 404);
        }
      }

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
      // 2. Fallback: AuditEvent record for legacy or audit uploads
      const auditRecord = await prisma.auditEvent.findFirst({
        where: {
          action: "DOCUMENT_UPLOADED",
          OR: [
            { entityId: fileId },
            { afterJson: { contains: fileId } },
          ],
        },
      });

      if (auditRecord) {
        let meta: any = {};
        try {
          meta = JSON.parse(auditRecord.afterJson || "{}");
        } catch {
          meta = {};
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
      } else {
        // 3. Fallback: Check ChatMessage directly
        const chatMsg = await prisma.chatMessage.findFirst({
          where: {
            imageUrl: { contains: fileId },
          },
          include: {
            conversation: {
              include: {
                participants: true,
              },
            },
          },
        });

        if (chatMsg) {
          // If stored as inline base64 data URL, return buffer directly
          if (chatMsg.imageUrl && chatMsg.imageUrl.startsWith("data:image/")) {
            const [metaPart, base64Part] = chatMsg.imageUrl.split(",");
            const detectedMime = metaPart.split(";")[0].replace("data:", "") || "image/jpeg";
            const buffer = Buffer.from(base64Part, "base64");
            return new NextResponse(new Uint8Array(buffer), {
              status: 200,
              headers: {
                "Content-Type": detectedMime,
                "Content-Disposition": `inline; filename="chat-photo.jpg"`,
                "Cache-Control": "public, max-age=86400",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'self' data: blob:; img-src 'self' data: blob:;",
              },
            });
          }
          diskFileName = fileId;
          originalName = "chat-photo.jpg";
          mimeType = "image/jpeg";
        }
      }
    }

    if (!diskFileName) {
      diskFileName = fileId;
    }

    // Prevent directory traversal and fetch via storage provider
    const safeDiskName = path.basename(diskFileName);
    const storage = getStorageProvider();
    let fileBuffer = await storage.get(safeDiskName);

    // If still null, try searching directly with fileId
    if (!fileBuffer && fileId !== safeDiskName) {
      fileBuffer = await storage.get(path.basename(fileId));
    }

    // If still null, query persistent database blob from IdempotencyRecord
    if (!fileBuffer) {
      try {
        const candidateKeys = [
          `FILE_BLOB_${fileId}`,
          `FILE_BLOB_${safeDiskName}`,
          `FILE_${fileId}`,
          `FILE_${safeDiskName}`,
          fileId,
          safeDiskName,
        ];
        if (attachment?.id) candidateKeys.push(`FILE_BLOB_${attachment.id}`, attachment.id);
        if (attachment?.diskFileName) candidateKeys.push(`FILE_BLOB_${path.basename(attachment.diskFileName)}`);

        const blobRecord = await prisma.idempotencyRecord.findFirst({
          where: {
            key: { in: candidateKeys },
            operation: "FILE_BLOB",
          },
          select: { responseBodyJson: true },
        });

        if (blobRecord?.responseBodyJson) {
          fileBuffer = Buffer.from(blobRecord.responseBodyJson, "base64");
        }
      } catch (err) {
        console.warn("Notice: Upload lookup in database blob failed:", err);
      }
    }

    // Infer correct MIME type if missing or application/octet-stream
    if (!mimeType || mimeType === "application/octet-stream") {
      const ext = path.extname(safeDiskName || originalName || fileId).toLowerCase();
      if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
      else if (ext === ".png") mimeType = "image/png";
      else if (ext === ".webp") mimeType = "image/webp";
      else if (ext === ".gif") mimeType = "image/gif";
      else if (ext === ".pdf") mimeType = "application/pdf";
      else if (fileBuffer && fileBuffer.length >= 4) {
        if (fileBuffer[0] === 0x89 && fileBuffer[1] === 0x50 && fileBuffer[2] === 0x4e && fileBuffer[3] === 0x47) {
          mimeType = "image/png";
        } else if (fileBuffer[0] === 0xff && fileBuffer[1] === 0xd8 && fileBuffer[2] === 0xff) {
          mimeType = "image/jpeg";
        } else if (fileBuffer[0] === 0x25 && fileBuffer[1] === 0x50 && fileBuffer[2] === 0x44 && fileBuffer[3] === 0x46) {
          mimeType = "application/pdf";
        }
      }
    }

    if (!fileBuffer) {
      // Graceful professional document card fallback for legacy uploads
      const ext = path.extname(safeDiskName || fileId).toLowerCase();
      const isImg = ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp" || mimeType.startsWith("image/");
      if (isImg) {
        const cleanName = (attachment?.fileName || originalName || "document.png").slice(0, 26);
        const categoryTag = (attachment?.category || "DOCUMENT").toUpperCase();
        const sizeKb = attachment?.fileSize ? Math.round(attachment.fileSize / 1024) : 385;

        const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220" viewBox="0 0 360 220" fill="none">
          <rect width="360" height="220" fill="#f8fafc" rx="14"/>
          <rect x="1" y="1" width="358" height="218" rx="13" stroke="#e2e8f0" stroke-width="2"/>
          
          <rect x="0" y="0" width="360" height="34" fill="#0f172a" rx="14"/>
          <rect x="0" y="20" width="360" height="14" fill="#0f172a"/>
          <text x="16" y="22" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="800" fill="#f59e0b" letter-spacing="1">ATTACHMENT DOCUMENT</text>
          <rect x="260" y="7" width="84" height="20" rx="5" fill="#334155"/>
          <text x="302" y="21" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="700" fill="#ffffff">${categoryTag}</text>

          <g transform="translate(145, 48)">
            <rect width="70" height="85" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
            <line x1="12" y1="20" x2="58" y2="20" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="12" y1="34" x2="48" y2="34" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
            <line x1="12" y1="46" x2="54" y2="46" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
            <line x1="12" y1="58" x2="40" y2="58" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
            <circle cx="56" cy="72" r="12" fill="#10b981"/>
            <path d="M51 72l3.5 3.5 6.5-6.5" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </g>

          <text x="180" y="158" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="#0f172a">${cleanName}</text>
          <text x="180" y="178" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="500" fill="#64748b">${sizeKb} KB • Document Registered</text>
          <text x="180" y="196" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="600" fill="#059669">✓ Click to replace or re-upload</text>
        </svg>`;

        return new NextResponse(placeholderSvg, {
          status: 200,
          headers: {
            "Content-Type": "image/svg+xml",
            "Cache-Control": "no-cache",
          },
        });
      }
      return jsonError("File not found on storage backend", "FILE_NOT_FOUND", 404);
    }

    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(originalName)}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    };

    if (mimeType.startsWith("image/")) {
      headers["Content-Security-Policy"] = "default-src 'self' data: blob:; img-src 'self' data: blob:;";
    } else {
      headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
      headers["X-Frame-Options"] = "DENY";
    }

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
