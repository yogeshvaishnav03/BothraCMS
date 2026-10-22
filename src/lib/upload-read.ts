import path from "path";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage";

const IMAGE_TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

/**
 * Reads an uploaded image by its /api/uploads/<id> url, with no user checks.
 * Callers must already have decided the viewer may see it (e.g. the buyer
 * portal checks the photo belongs to the buyer's project).
 */
export async function readUploadedImage(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const match = /^\/api\/uploads\/([^/?#]+)$/.exec(url);
  if (!match) return null;
  const fileId = decodeURIComponent(match[1]);
  const attachment = await prisma.attachment.findFirst({
    where: { OR: [{ fileId }, { id: fileId }, { diskFileName: fileId }] },
    select: { id: true, diskFileName: true, mimeType: true },
  });
  const diskName = path.basename(attachment?.diskFileName || fileId);
  let buffer = await getStorageProvider().get(diskName);
  if (!buffer) {
    const keys = [`FILE_BLOB_${fileId}`, `FILE_BLOB_${diskName}`, ...(attachment ? [`FILE_BLOB_${attachment.id}`] : [])];
    const blob = await prisma.idempotencyRecord.findFirst({ where: { key: { in: keys }, operation: "FILE_BLOB" }, select: { responseBodyJson: true } });
    if (blob?.responseBodyJson) buffer = Buffer.from(blob.responseBodyJson, "base64");
  }
  if (!buffer) return null;
  const mimeType = attachment?.mimeType?.startsWith("image/") ? attachment.mimeType : IMAGE_TYPES[path.extname(diskName).toLowerCase()];
  if (!mimeType || mimeType === "image/svg+xml") return null;
  return { buffer, mimeType };
}
