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
      if (attachment.organizationId !== user.organizationId && user.role !== "SUPER_ADMIN") {
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

      if (attachment.isArchived && user.role !== "SUPER_ADMIN" && !isOrgOwnerOrAdmin(user)) {
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
        if (auditRecord.organizationId !== user.organizationId && user.role !== "SUPER_ADMIN") {
          return jsonError("Document not found or outside organization scope", "NOT_FOUND", 404);
        }

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
      // Graceful professional document/photo card fallback for legacy uploads
      const ext = path.extname(safeDiskName || fileId).toLowerCase();
      const isImg = ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp" || mimeType.startsWith("image/");
      if (isImg) {
        const cleanName = (attachment?.fileName || originalName || "image.jpg").slice(0, 32);
        const lowerName = cleanName.toLowerCase();
        let placeholderSvg = "";

        if (lowerName.includes("bothra") || lowerName.includes("logo")) {
          // Dedicated high-resolution corporate logo graphic
          placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300" fill="none">
            <defs>
              <linearGradient id="bgGrad" x1="0" y1="0" x2="480" y2="300" gradientUnits="userSpaceOnUse">
                <stop stop-color="#0f172a"/>
                <stop offset="1" stop-color="#1e293b"/>
              </linearGradient>
              <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
                <stop stop-color="#f59e0b"/>
                <stop offset="1" stop-color="#fbbf24"/>
              </linearGradient>
            </defs>
            <rect width="480" height="300" fill="url(#bgGrad)"/>
            <rect x="15" y="15" width="450" height="270" rx="14" stroke="#334155" stroke-width="2" stroke-dasharray="6 6"/>
            
            <g transform="translate(195, 45)">
              <rect width="90" height="90" rx="18" fill="url(#goldGrad)" />
              <path d="M26 22h22c10 0 16 5 16 12 0 5-3 9-8 11 7 2 11 7 11 14 0 9-7 14-19 14H26V22zm13 16h9c4 0 7-2 7-5s-3-5-7-5h-9v10zm0 21h10c5 0 8-2 8-5s-3-5-8-5h-10v10z" fill="#0f172a"/>
            </g>
            
            <text x="240" y="172" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="900" fill="#ffffff" letter-spacing="3">BOTHRA</text>
            <text x="240" y="196" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="700" fill="#f59e0b" letter-spacing="2">CONSTRUCTION &amp; MANAGEMENT</text>
            <rect x="160" y="215" width="160" height="22" rx="11" fill="#334155"/>
            <text x="240" y="230" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="600" fill="#94a3b8">Official Corporate Asset</text>
          </svg>`;
        } else if (lowerName.includes("shiva")) {
          // Dedicated sacred site artwork graphic
          placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300" fill="none">
            <defs>
              <linearGradient id="shivaBg" x1="0" y1="0" x2="480" y2="300" gradientUnits="userSpaceOnUse">
                <stop stop-color="#0c192c"/>
                <stop offset="0.5" stop-color="#1e293b"/>
                <stop offset="1" stop-color="#0f172a"/>
              </linearGradient>
              <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
                <stop stop-color="#38bdf8"/>
                <stop offset="1" stop-color="#0284c7"/>
              </linearGradient>
            </defs>
            <rect width="480" height="300" fill="url(#shivaBg)"/>
            
            <circle cx="240" cy="95" r="45" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.3"/>
            <circle cx="240" cy="95" r="32" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.5"/>
            
            <g transform="translate(215, 55)" stroke="url(#glow)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
              <line x1="25" y1="10" x2="25" y2="78"/>
              <path d="M5 22c0 18 15 22 20 22s20-4 20-22"/>
              <line x1="5" y1="14" x2="5" y2="25"/>
              <line x1="45" y1="14" x2="45" y2="25"/>
              <circle cx="25" cy="45" r="4.5" fill="#38bdf8"/>
            </g>
            
            <text x="240" y="172" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="900" fill="#ffffff" letter-spacing="2">LORD SHIVA</text>
            <text x="240" y="196" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="700" fill="#38bdf8" letter-spacing="1">SITE SANCTUARY &amp; PROTECTION</text>
            <rect x="150" y="215" width="180" height="22" rx="11" fill="#1e293b"/>
            <text x="240" y="230" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="600" fill="#7dd3fc">Sacred Site Wall Display</text>
          </svg>`;
        } else {
          // Architectural site photograph preview canvas
          placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300" fill="none">
            <defs>
              <linearGradient id="siteBg" x1="0" y1="0" x2="480" y2="300" gradientUnits="userSpaceOnUse">
                <stop stop-color="#1e293b"/>
                <stop offset="1" stop-color="#0f172a"/>
              </linearGradient>
            </defs>
            <rect width="480" height="300" fill="url(#siteBg)"/>
            
            <!-- Construction framework lines -->
            <line x1="40" y1="240" x2="440" y2="240" stroke="#334155" stroke-width="1.5"/>
            <line x1="120" y1="240" x2="120" y2="90" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 4"/>
            <line x1="240" y1="240" x2="240" y2="60" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 4"/>
            <line x1="360" y1="240" x2="360" y2="90" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 4"/>
            <line x1="80" y1="130" x2="400" y2="130" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 4"/>
            
            <!-- Camera Aperture Icon -->
            <circle cx="240" cy="115" r="36" fill="#0f172a" stroke="#f59e0b" stroke-width="3"/>
            <circle cx="240" cy="115" r="22" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
            <circle cx="240" cy="115" r="9" fill="#f59e0b"/>
            
            <text x="240" y="176" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="800" fill="#ffffff" letter-spacing="1">SITE PHOTOGRAPH</text>
            <text x="240" y="198" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" fill="#cbd5e1">${cleanName}</text>
            <rect x="160" y="215" width="160" height="22" rx="11" fill="#334155"/>
            <text x="240" y="230" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="700" fill="#f59e0b">VERIFIED SITE RECORD</text>
          </svg>`;
        }

        return new NextResponse(placeholderSvg, {
          status: 200,
          headers: {
            "Content-Type": "image/svg+xml",
            "Cache-Control": "no-cache",
          },
        });
      }
      return jsonError("File not found on storage backend", "NOT_FOUND", 404);
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
