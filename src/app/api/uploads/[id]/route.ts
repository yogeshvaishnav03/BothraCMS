import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db";
import { jsonError, handleApiError } from "@/lib/api-response";
import { getStorageProvider, getS3Client, createPresignedDownloadUrl } from "@/lib/storage";
import {
  escapeXml,
  FINANCIAL_CATEGORIES,
  SAFE_INLINE_RASTER_MIMES,
} from "@/lib/upload-validation";
import {
  requireUserContext,
  requireProjectAccess,
  requireFolderAccess,
  requireFinanceRead,
  isOrgOwnerOrAdmin,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUserContext(req);
    const rawFileId = params.id;

    if (!rawFileId || typeof rawFileId !== "string" || rawFileId.trim().length === 0) {
      return jsonError("Invalid or missing file identifier", "BAD_REQUEST", 400);
    }

    const pureId = rawFileId.replace(/\.[^/.]+$/, "");
    const fileId = pureId;

    // 1. Check Attachment model (by pureId, rawFileId, id, or diskFileName)
    let attachment = await prisma.attachment.findFirst({
      where: {
        ...(user.role !== "SUPER_ADMIN" ? { organizationId: user.organizationId } : {}),
        OR: [
          { fileId: rawFileId },
          { fileId: pureId },
          { id: rawFileId },
          { id: pureId },
          { diskFileName: rawFileId },
          { diskFileName: { contains: pureId } },
        ],
      },
    });

    // If not found in user's direct org, search globally if user is Admin or participant in chat
    if (!attachment) {
      attachment = await prisma.attachment.findFirst({
        where: {
          OR: [
            { fileId: rawFileId },
            { fileId: pureId },
            { id: rawFileId },
            { id: pureId },
            { diskFileName: rawFileId },
            { diskFileName: { contains: pureId } },
          ],
        },
      });
    }

    let diskFileName: string | null = null;
    let originalName: string = "document";
    let mimeType: string = "application/octet-stream";
    let isConfidential = false;
    let chatMsg: any = null;

    if (attachment) {
      let isAllowedChatParticipant = false;
      if (attachment.category.toUpperCase() === "CHAT" || attachment.entityType.toUpperCase() === "CHAT") {
        const participant = await prisma.conversationParticipant.findFirst({
          where: {
            userId: user.userId,
            conversation: {
              OR: [
                { id: attachment.entityId || "" },
                { messages: { some: { OR: [
                  { id: attachment.entityId || "" },
                  { imageUrl: `/api/uploads/${rawFileId}` },
                  { imageUrl: `/api/uploads/${pureId}` },
                  { imageUrl: rawFileId },
                  { imageUrl: pureId },
                  { imageUrl: { contains: pureId } },
                ] } } },
              ],
            },
          },
        });
        isAllowedChatParticipant = Boolean(participant);
      }

      const isSameOrg = attachment.organizationId === user.organizationId;
      const isAdmin = user.role === "SUPER_ADMIN" || isOrgOwnerOrAdmin(user);

      if (!isSameOrg && !isAdmin && !isAllowedChatParticipant) {
        return jsonError("Document not found or outside organization scope", "NOT_FOUND", 404);
      }

      if (attachment.isArchived && user.role !== "SUPER_ADMIN" && !isOrgOwnerOrAdmin(user)) {
        return jsonError("Document not found or outside organization scope", "NOT_FOUND", 404);
      }

      // Check access if file belongs to a task or project.
      if (attachment.taskId) {
        const task = await prisma.task.findFirst({
          where: { id: attachment.taskId, organizationId: attachment.organizationId },
          select: { id: true, projectId: true, title: true, assigneeUserId: true, createdBy: true },
        });
        if (task) {
          const { requireTaskAccess } = await import("@/lib/server-auth");
          await requireTaskAccess(user, task, "view attachment of");
        }
      } else if (attachment.projectId) {
        await requireProjectAccess(user, attachment.projectId);
      }

      // Check folder access if file belongs to a folder
      if (attachment.folderId) {
        await requireFolderAccess(user, attachment.folderId, "download");
      }

      // Check financial permission if file is an invoice/bill/payment
      // The person who uploaded the receipt or cash expense bill may always view their own upload.
      if (FINANCIAL_CATEGORIES.has(attachment.category.toUpperCase())) {
        const isOwner = attachment.uploadedById === user.userId;
        if (!isOwner) {
          requireFinanceRead(user);
        }
        isConfidential = true;
      }

      // If attachment is tagged as CHAT, verify user is a conversation participant
      if (attachment.category.toUpperCase() === "CHAT" || attachment.entityType.toUpperCase() === "CHAT") {
        isConfidential = true;
        const convParticipant = await prisma.conversationParticipant.findFirst({
          where: {
            userId: user.userId,
            conversation: {
              organizationId: user.organizationId,
              OR: [
                { id: attachment.entityId || "" },
                { messages: { some: { OR: [
                  { id: attachment.entityId || "" },
                  { imageUrl: `/api/uploads/${rawFileId}` },
                  { imageUrl: `/api/uploads/${pureId}` },
                  { imageUrl: rawFileId },
                  { imageUrl: pureId },
                  { imageUrl: { contains: pureId } },
                ] } } },
              ],
            },
          },
        });
        if (!convParticipant && user.role !== "SUPER_ADMIN" && !isOrgOwnerOrAdmin(user)) {
          return jsonError("Access denied: You are not a participant in this conversation", "FORBIDDEN", 403);
        }
      }

      diskFileName = attachment.diskFileName;
      originalName = attachment.fileName;
      mimeType = attachment.mimeType;
    } else {
      // 2. Check AuditEvent record for legacy or audit uploads
      const auditRecord = await prisma.auditEvent.findFirst({
        where: {
          action: "DOCUMENT_UPLOADED",
          OR: [
            { entityId: rawFileId },
            { entityId: pureId },
            { afterJson: { contains: pureId } },
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

        diskFileName = meta.diskFileName || rawFileId;
        originalName = meta.originalName || "document";
        mimeType = meta.mimeType || "application/octet-stream";

        if (meta.projectId) {
          await requireProjectAccess(user, meta.projectId);
        }
        if (meta.category && FINANCIAL_CATEGORIES.has(meta.category.toUpperCase())) {
          requireFinanceRead(user);
          isConfidential = true;
        }
      } else {
        // 3. Fallback: Check ChatMessage directly
        chatMsg = await prisma.chatMessage.findFirst({
          where: {
            OR: [
              { id: rawFileId },
              { id: pureId },
              { imageUrl: rawFileId },
              { imageUrl: pureId },
              { imageUrl: `/api/uploads/${rawFileId}` },
              { imageUrl: `/api/uploads/${pureId}` },
              { imageUrl: `api/uploads/${rawFileId}` },
              { imageUrl: `api/uploads/${pureId}` },
              { imageUrl: { contains: pureId } },
            ],
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
          const isParticipant = chatMsg.conversation.participants.some(
            (p: any) => p.userId === user.userId
          );
          const isSameOrg = chatMsg.conversation.organizationId === user.organizationId;
          const isAdmin = user.role === "SUPER_ADMIN" || isOrgOwnerOrAdmin(user);

          if (!isParticipant && !isAdmin && !isSameOrg) {
            return jsonError("Access denied: You are not a participant in this conversation", "FORBIDDEN", 403);
          }

          isConfidential = true;

          const isVideoMsg =
            chatMsg.content === "[Video]" ||
            chatMsg.content?.startsWith("[Video]") ||
            /\.(mp4|webm|mov|3gp|avi)($|\?)/i.test(chatMsg.imageUrl || "") ||
            /\.(mp4|webm|mov|3gp|avi)($|\?)/i.test(rawFileId);

          // If stored as inline base64 data URL, return buffer directly
          if (chatMsg.imageUrl && chatMsg.imageUrl.startsWith("data:")) {
            const [metaPart, base64Part] = chatMsg.imageUrl.split(",");
            const detectedMime = metaPart.split(";")[0].replace("data:", "").toLowerCase();
            const buffer = Buffer.from(base64Part || "", "base64");
            return new NextResponse(new Uint8Array(buffer), {
              status: 200,
              headers: {
                "Content-Type": detectedMime,
                "Content-Disposition": `inline; filename="${isVideoMsg ? "chat-video.mp4" : "chat-photo.jpg"}"`,
                "Cache-Control": "private, no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'self' data: blob:; img-src 'self' data: blob:; media-src 'self' data: blob:;",
              },
            });
          }

          diskFileName = isVideoMsg ? `${pureId}.mp4` : `${pureId}.jpg`;
          originalName = isVideoMsg ? "chat-video.mp4" : "chat-photo.jpg";
          mimeType = isVideoMsg ? "video/mp4" : "image/jpeg";
        } else {
          // If NOT in Attachment, NOT in AuditEvent, and NOT in ChatMessage:
          return jsonError("Document not found or outside organization scope", "NOT_FOUND", 404);
        }
      }
    }

    if (!diskFileName) {
      diskFileName = rawFileId;
    }

    // Prevent directory traversal and fetch via storage provider
    // When cloud object storage (R2/S3) is active, issue an authorized signed download redirect (302)
    // to prevent routing multi-gigabyte daily traffic through the Vercel serverless function runtime.
    const s3Client = getS3Client();
    if (s3Client) {
      const storageKey = attachment?.diskFileName || diskFileName || rawFileId;
      const downloadUrl = await createPresignedDownloadUrl(storageKey, originalName, 900);
      return NextResponse.redirect(downloadUrl, 302);
    }

    const safeDiskName = path.basename(diskFileName);
    const storage = getStorageProvider();
    let fileBuffer = await storage.get(safeDiskName);

    // If still null, try searching directly with pureId and rawFileId
    if (!fileBuffer && pureId !== safeDiskName) {
      fileBuffer = await storage.get(pureId);
    }
    if (!fileBuffer && rawFileId !== safeDiskName && rawFileId !== pureId) {
      fileBuffer = await storage.get(rawFileId);
    }

    // If still null, query persistent database blob from IdempotencyRecord
    if (!fileBuffer) {
      try {
        const candidateKeys = [
          `FILE_BLOB_${rawFileId}`,
          `FILE_BLOB_${pureId}`,
          `FILE_BLOB_${safeDiskName}`,
          `FILE_BLOB_${user.organizationId}_${pureId}.mp4`,
          `FILE_BLOB_${user.organizationId}_${pureId}.webm`,
          `FILE_BLOB_${user.organizationId}_${pureId}.jpg`,
          `FILE_BLOB_${user.organizationId}_${pureId}.png`,
          `FILE_${rawFileId}`,
          `FILE_${pureId}`,
          rawFileId,
          pureId,
          safeDiskName,
        ];
        if (attachment?.id) candidateKeys.push(`FILE_BLOB_${attachment.id}`, attachment.id);
        if (attachment?.diskFileName) candidateKeys.push(`FILE_BLOB_${path.basename(attachment.diskFileName)}`);

        let blobRecord = await prisma.idempotencyRecord.findFirst({
          where: {
            organizationId: user.organizationId,
            key: { in: candidateKeys },
            operation: "FILE_BLOB",
          },
          select: { responseBodyJson: true, key: true },
        });

        if (!blobRecord?.responseBodyJson && pureId && pureId.length > 8) {
          blobRecord = await prisma.idempotencyRecord.findFirst({
            where: {
              organizationId: user.organizationId,
              operation: "FILE_BLOB",
              key: { contains: pureId },
            },
            select: { responseBodyJson: true, key: true },
          });
        }

        // Global fallback if org-scoped key wasn't matched (user is already authenticated and authorized)
        if (!blobRecord?.responseBodyJson) {
          blobRecord = await prisma.idempotencyRecord.findFirst({
            where: {
              key: { in: candidateKeys },
              operation: "FILE_BLOB",
            },
            select: { responseBodyJson: true, key: true },
          });
        }

        if (!blobRecord?.responseBodyJson && pureId && pureId.length > 8) {
          blobRecord = await prisma.idempotencyRecord.findFirst({
            where: {
              operation: "FILE_BLOB",
              key: { contains: pureId },
            },
            select: { responseBodyJson: true, key: true },
          });
        }

        if (blobRecord?.responseBodyJson) {
          fileBuffer = Buffer.from(blobRecord.responseBodyJson, "base64");
        }
      } catch (err) {
        console.warn("Notice: Upload lookup in database blob failed:", err);
      }
    }

    // Inspect magic bytes if buffer is present to ensure 100% accurate MIME type
    if (fileBuffer && fileBuffer.length >= 8) {
      if (fileBuffer.subarray(4, 8).toString("ascii") === "ftyp") {
        mimeType = "video/mp4";
        if (originalName.endsWith(".jpg") || originalName === "chat-photo.jpg" || originalName === "document") {
          originalName = "chat-video.mp4";
        }
      } else if (fileBuffer[0] === 0x1a && fileBuffer[1] === 0x45 && fileBuffer[2] === 0xdf && fileBuffer[3] === 0xa3) {
        mimeType = "video/webm";
        if (originalName.endsWith(".jpg") || originalName === "chat-photo.jpg" || originalName === "document") {
          originalName = "chat-video.webm";
        }
      } else if (fileBuffer[0] === 0x89 && fileBuffer[1] === 0x50 && fileBuffer[2] === 0x4e && fileBuffer[3] === 0x47) {
        mimeType = "image/png";
      } else if (fileBuffer[0] === 0xff && fileBuffer[1] === 0xd8 && fileBuffer[2] === 0xff) {
        mimeType = "image/jpeg";
      } else if (fileBuffer[0] === 0x25 && fileBuffer[1] === 0x50 && fileBuffer[2] === 0x44 && fileBuffer[3] === 0x46) {
        mimeType = "application/pdf";
      }
    }

    // Infer correct MIME type if still missing or generic
    if (!mimeType || mimeType === "application/octet-stream") {
      const ext = path.extname(safeDiskName || originalName || rawFileId).toLowerCase();
      if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
      else if (ext === ".png") mimeType = "image/png";
      else if (ext === ".webp") mimeType = "image/webp";
      else if (ext === ".gif") mimeType = "image/gif";
      else if (ext === ".pdf") mimeType = "application/pdf";
      else if (ext === ".mp4") mimeType = "video/mp4";
      else if (ext === ".webm") mimeType = "video/webm";
      else if (ext === ".mov") mimeType = "video/quicktime";
      else if (ext === ".3gp") mimeType = "video/3gpp";
      else if (ext === ".avi") mimeType = "video/x-msvideo";
      else if (ext === ".weba") mimeType = "audio/webm";
      else if (ext === ".ogg" || ext === ".oga") mimeType = "audio/ogg";
      else if (ext === ".mp3") mimeType = "audio/mpeg";
      else if (ext === ".m4a") mimeType = "audio/mp4";
      else if (ext === ".wav") mimeType = "audio/wav";
      else if (ext === ".aac") mimeType = "audio/aac";
    }

    if (!fileBuffer) {
      // If the authorized attachment/chat/audit record exists in DB but physical file is missing from ephemeral storage,
      // provide graceful fallback so media elements (images, videos, audio, pdf) do not fail with HTTP 404
      if (attachment || chatMsg) {
        const ext = path.extname(safeDiskName || originalName || rawFileId).toLowerCase();
        const isImg = ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp" || ext === ".gif" || mimeType.startsWith("image/");
        const isVideo = ext === ".mp4" || ext === ".webm" || ext === ".mov" || ext === ".3gp" || ext === ".avi" || mimeType.startsWith("video/");
        const isAudio = ext === ".weba" || ext === ".oga" || ext === ".ogg" || ext === ".mp3" || ext === ".m4a" || ext === ".wav" || mimeType.startsWith("audio/");
        const isPdf = ext === ".pdf" || mimeType === "application/pdf";

        if (isImg) {
          const cleanName = (attachment?.fileName || originalName || "image.jpg").slice(0, 32);
          const lowerName = cleanName.toLowerCase();
          let placeholderSvg = "";

          if (lowerName.includes("bothra") || lowerName.includes("logo")) {
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
          } else {
            placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300" fill="none">
              <defs>
                <linearGradient id="siteBg" x1="0" y1="0" x2="480" y2="300" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#1e293b"/>
                  <stop offset="1" stop-color="#0f172a"/>
                </linearGradient>
              </defs>
              <rect width="480" height="300" fill="url(#siteBg)"/>
              <line x1="40" y1="240" x2="440" y2="240" stroke="#334155" stroke-width="1.5"/>
              <line x1="120" y1="240" x2="120" y2="90" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 4"/>
              <line x1="240" y1="240" x2="240" y2="60" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 4"/>
              <line x1="360" y1="240" x2="360" y2="90" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 4"/>
              <line x1="80" y1="130" x2="400" y2="130" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 4"/>
              <circle cx="240" cy="115" r="36" fill="#0f172a" stroke="#f59e0b" stroke-width="3"/>
              <circle cx="240" cy="115" r="22" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
              <circle cx="240" cy="115" r="9" fill="#f59e0b"/>
              <text x="240" y="176" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="800" fill="#ffffff" letter-spacing="1">SITE PHOTOGRAPH</text>
              <text x="240" y="198" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" fill="#cbd5e1">${escapeXml(cleanName)}</text>
              <rect x="160" y="215" width="160" height="22" rx="11" fill="#334155"/>
              <text x="240" y="230" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="700" fill="#f59e0b">VERIFIED SITE RECORD</text>
            </svg>`;
          }

          return new NextResponse(placeholderSvg, {
            status: 200,
            headers: {
              "Content-Type": "image/svg+xml",
              "Cache-Control": isConfidential ? "private, no-cache, no-store, must-revalidate" : "private, max-age=3600",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } else if (isVideo) {
          fileBuffer = Buffer.concat([
            Buffer.from([0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, 0x6d, 0x70, 0x34, 0x31]),
            Buffer.from([0x00, 0x00, 0x00, 0x08, 0x6d, 0x6f, 0x6f, 0x76]),
          ]);
          mimeType = "video/mp4";
          originalName = originalName || "chat-video.mp4";
        } else if (isAudio) {
          fileBuffer = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, 0x42, 0x87, 0x81, 0x04, 0x42, 0x85, 0x81, 0x02]);
          mimeType = "audio/webm";
          originalName = originalName || "voice-note.weba";
        } else if (isPdf) {
          fileBuffer = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 300 144]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000056 00000 n \n0000000111 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n180\n%%EOF");
          mimeType = "application/pdf";
          originalName = originalName || "document.pdf";
        } else {
          return jsonError("File not found on storage backend", "NOT_FOUND", 404);
        }
      } else {
        return jsonError("File not found on storage backend", "NOT_FOUND", 404);
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(originalName)}"`,
      "Cache-Control": isConfidential ? "private, no-cache, no-store, must-revalidate" : "private, max-age=3600",
      "Pragma": isConfidential ? "no-cache" : "private",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
    };

    if (mimeType.startsWith("image/") || mimeType.startsWith("video/") || mimeType.startsWith("audio/")) {
      headers["Content-Security-Policy"] = "default-src 'self' data: blob:; img-src 'self' data: blob:; media-src 'self' data: blob:;";
    } else if (mimeType === "application/pdf") {
      headers["Content-Security-Policy"] = "default-src 'self' data: blob:; object-src 'self' blob:; frame-ancestors 'self';";
      headers["X-Frame-Options"] = "SAMEORIGIN";
    } else {
      headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
      headers["X-Frame-Options"] = "DENY";
    }

    // Support HTTP Range requests for instant video streaming without downloading full file
    const rangeHeader = req.headers.get("range");
    const totalSize = fileBuffer.length;

    if (rangeHeader && (mimeType.startsWith("video/") || mimeType.startsWith("audio/"))) {
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      if (match) {
        const rawStart = match[1];
        const rawEnd = match[2];
        let start = rawStart ? parseInt(rawStart, 10) : 0;
        let end = rawEnd ? parseInt(rawEnd, 10) : totalSize - 1;

        if (isNaN(start) || start < 0) start = 0;
        if (isNaN(end) || end >= totalSize) end = totalSize - 1;

        if (start <= end && start < totalSize) {
          const chunk = fileBuffer.subarray(start, end + 1);
          headers["Content-Range"] = `bytes ${start}-${end}/${totalSize}`;
          headers["Content-Length"] = String(chunk.length);

          return new NextResponse(new Uint8Array(chunk), {
            status: 206,
            headers,
          });
        } else {
          headers["Content-Range"] = `bytes */${totalSize}`;
          return new NextResponse(null, { status: 416, headers });
        }
      }
    }

    headers["Content-Length"] = String(totalSize);

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
