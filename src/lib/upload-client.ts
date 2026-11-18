"use client";

export interface UploadClientMediaOptions {
  entityType?: string | null;
  entityId?: string | null;
  category?: string | null;
  projectId?: string | null;
  folderId?: string | null;
  createAttachment?: boolean;
  onProgress?: (percent: number, statusText: string) => void;
}

export interface UploadClientMediaResult {
  url: string;
  fileId: string;
  fileName: string;
  sizeBytes?: number;
}

// Chunks are 2.5 MB each, well under Vercel's hard 4.5 MB request body limit
const CHUNK_SIZE = 2.5 * 1024 * 1024;
// Any file larger than 3.5 MB automatically uses chunked streaming
const DIRECT_UPLOAD_MAX_BYTES = 3.5 * 1024 * 1024;

/**
 * Universal upload utility that reliably uploads files up to 250 MB
 * to Vercel/Next.js without ever encountering HTTP 413 Payload Too Large.
 */
export async function uploadClientMedia(
  file: File,
  options: UploadClientMediaOptions = {}
): Promise<UploadClientMediaResult> {
  const entityType = options.entityType || "GENERAL";
  const entityId = options.entityId || "";
  const category = options.category || "GENERAL";
  const projectId = options.projectId || "";
  const createAttachment = options.createAttachment ?? true;

  // For small files (<= 3.5 MB), attempt standard single-request upload first
  if (file.size <= DIRECT_UPLOAD_MAX_BYTES) {
    try {
      const endpoint = createAttachment ? "/api/attachments" : "/api/uploads";
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("entityType", entityType);
      if (entityId) form.append("entityId", entityId);
      if (projectId) form.append("projectId", projectId);
      form.append("category", category);

      options.onProgress?.(40, "Uploading...");
      let res = await fetch(endpoint, { method: "POST", body: form });

      // If /api/attachments failed and createAttachment was true, fallback to /api/uploads
      if (!res.ok && res.status !== 413 && createAttachment) {
        try {
          const fallbackRes = await fetch("/api/uploads", { method: "POST", body: form });
          if (fallbackRes.ok) {
            res = fallbackRes;
          }
        } catch {}
      }

      if (res.status === 413) {
        // Fallback to chunked upload if server gateway returns 413
        console.warn("Direct upload returned 413, falling back to chunked upload...");
      } else {
        const json = await res.json().catch(() => null);
        if (res.ok && json?.data?.url) {
          options.onProgress?.(100, "Upload complete");
          return {
            url: json.data.url,
            fileId: json.data.fileId || file.name,
            fileName: json.data.fileName || file.name,
            sizeBytes: file.size,
          };
        }
        if (!res.ok) {
          throw new Error(json?.error?.message || json?.message || `Upload failed (Status ${res.status})`);
        }
      }
    } catch (err: any) {
      if (err.message && !err.message.includes("413")) {
        throw err;
      }
      // If 413 occurred, proceed to chunked upload below
    }
  }

  // Chunked Upload: slices the file into 2.5 MB chunks so Vercel never rejects it
  const uploadId = `upl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    const chunkBlob = file.slice(start, end);

    const chunkForm = new FormData();
    chunkForm.append("chunk", chunkBlob, file.name);
    chunkForm.append("uploadId", uploadId);
    chunkForm.append("chunkIndex", String(chunkIndex));
    chunkForm.append("totalChunks", String(totalChunks));
    chunkForm.append("fileName", file.name);
    chunkForm.append("fileType", (file.type || "").split(";")[0].trim().toLowerCase() || "application/octet-stream");
    chunkForm.append("entityType", entityType);
    if (entityId) chunkForm.append("entityId", entityId);
    if (projectId) chunkForm.append("projectId", projectId);
    chunkForm.append("category", category);
    chunkForm.append("createAttachment", createAttachment ? "true" : "false");

    const progressPct = Math.round(((chunkIndex + 1) / totalChunks) * 100);
    options.onProgress?.(progressPct, `Uploading (${progressPct}%)...`);

    // Retry each chunk up to 2 times in case of mobile network drops
    let chunkOk = false;
    let lastError: Error | null = null;
    let resJson: any = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch("/api/uploads/chunk", {
          method: "POST",
          body: chunkForm,
        });

        resJson = await res.json().catch(() => null);
        if (res.ok && resJson?.success) {
          chunkOk = true;
          break;
        } else {
          lastError = new Error(resJson?.error?.message || `Chunk ${chunkIndex + 1}/${totalChunks} upload failed`);
        }
      } catch (networkErr: any) {
        lastError = networkErr;
        // Short backoff before retry
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    if (!chunkOk) {
      throw lastError || new Error(`Upload failed at chunk ${chunkIndex + 1} of ${totalChunks}`);
    }

    // If this is the last chunk, return the final result
    if (chunkIndex === totalChunks - 1 && resJson?.data?.url) {
      options.onProgress?.(100, "Done!");
      return {
        url: resJson.data.url,
        fileId: resJson.data.fileId,
        fileName: resJson.data.fileName || file.name,
        sizeBytes: resJson.data.sizeBytes || file.size,
      };
    }
  }

  throw new Error("Chunk upload finished without receiving completion confirmation.");
}
