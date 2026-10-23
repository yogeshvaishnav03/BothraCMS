import path from "path";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage";

/**
 * Moving uploaded files out of the database into cloud storage.
 *
 * Before cloud storage was set up, each upload was kept as text in the
 * database (two or three copies under different keys), so that it survived
 * Vercel wiping the server disk. Once a Blob store (or S3 / R2) is linked,
 * those copies can go to the store: each file is uploaded once under its
 * file name and its database copies are deleted. Files not moved yet still
 * open, from the database.
 */

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

const PROVIDER_NAME: Record<string, string> = { LOCAL: "Server disk, with a copy in the database", S3: "Amazon S3", R2: "Cloudflare R2", BLOB: "Vercel Blob" };

export async function storageStatus(organizationId: string) {
  const provider = getStorageProvider().name;
  const [copies, attachments] = await Promise.all([
    prisma.idempotencyRecord.count({ where: { organizationId, operation: "FILE_BLOB" } }),
    prisma.attachment.count({ where: { organizationId } }),
  ]);
  return {
    provider,
    providerName: PROVIDER_NAME[provider] || provider,
    cloud: provider !== "LOCAL",
    onVercel: !!process.env.VERCEL,
    databaseCopies: copies,
    files: attachments,
  };
}

/** Moves up to `batch` files to cloud storage. Call again while `remaining` is above 0. */
export async function moveFilesToCloud(organizationId: string, batch = 20) {
  const storage = getStorageProvider();
  if (storage.name === "LOCAL") throw Object.assign(new Error("Link a Vercel Blob store (or set S3 / R2) first."), { statusCode: 409, code: "NO_CLOUD_STORAGE" });
  const rows = await prisma.idempotencyRecord.findMany({
    where: { organizationId, operation: "FILE_BLOB" },
    select: { id: true, key: true },
    orderBy: { createdAt: "asc" },
    take: batch * 3,
  });
  const done = new Set<string>();
  const failed: string[] = [];
  let moved = 0;
  for (const row of rows) {
    if (moved >= batch) break;
    const suffix = row.key.replace(/^FILE_BLOB_/, "");
    if (done.has(suffix)) continue;
    const attachment = await prisma.attachment.findFirst({
      where: { organizationId, OR: [{ diskFileName: suffix }, { fileId: suffix }, { id: suffix }] },
      select: { id: true, fileId: true, diskFileName: true, mimeType: true },
    });
    const diskName = path.basename(attachment?.diskFileName || suffix);
    const keys = [row.key, ...(attachment ? [`FILE_BLOB_${attachment.fileId}`, `FILE_BLOB_${attachment.diskFileName}`, `FILE_BLOB_${attachment.id}`] : [])];
    [suffix, diskName, attachment?.fileId, attachment?.id].forEach((k) => k && done.add(k));
    const full = await prisma.idempotencyRecord.findUnique({ where: { id: row.id }, select: { responseBodyJson: true } });
    if (!full?.responseBodyJson) {
      await prisma.idempotencyRecord.deleteMany({ where: { organizationId, operation: "FILE_BLOB", key: { in: keys } } });
      continue;
    }
    try {
      const mimeType = attachment?.mimeType || MIME[path.extname(diskName).toLowerCase()] || "application/octet-stream";
      await storage.put(diskName, Buffer.from(full.responseBodyJson, "base64"), mimeType);
      await prisma.idempotencyRecord.deleteMany({ where: { organizationId, operation: "FILE_BLOB", key: { in: keys } } });
      moved += 1;
    } catch (err) {
      failed.push(diskName);
      console.warn("Notice: moving a file to cloud storage failed:", diskName, (err as Error)?.message);
      // Stop on the first failure: the store is probably not reachable, and the rest would fail too.
      break;
    }
  }
  const remaining = await prisma.idempotencyRecord.count({ where: { organizationId, operation: "FILE_BLOB" } });
  return { moved, failed, remaining };
}
