import path from "path";

export const STANDARD_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/3gpp",
  "video/x-msvideo",
  "video/ogg",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

export const PRESIGN_ALLOWED_MIME_TYPES = new Set([
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
  "video/3gpp",
  "video/x-msvideo",
  "video/ogg",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
]);

export const STANDARD_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/3gpp": ".3gp",
  "video/x-msvideo": ".avi",
  "video/ogg": ".ogv",
  "audio/webm": ".weba",
  "audio/ogg": ".oga",
  "audio/mp4": ".m4a",
  "audio/m4a": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/aac": ".aac",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-excel": ".xls",
};

export const FINANCIAL_CATEGORIES = new Set(["INVOICE", "BILL", "PAYMENT", "RECEIPT"]);

export const SAFE_INLINE_RASTER_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/mpeg",
  "audio/wav",
  "audio/aac",
]);

/** Inspects file header magic bytes against the claimed MIME type. */
export function isValidMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;
  if (mimeType === "image/png") {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "application/pdf") {
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  }
  if (mimeType === "image/webp") {
    if (buffer.length < 12) return false;
    return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  }
  if (mimeType === "image/gif") {
    return buffer.toString("ascii", 0, 3) === "GIF";
  }
  if (mimeType === "video/mp4" || mimeType === "video/quicktime" || mimeType === "video/3gpp") {
    if (buffer.length < 8) return false;
    const tag = buffer.toString("ascii", 4, 8);
    return (
      tag === "ftyp" ||
      tag === "moov" ||
      tag === "wide" ||
      tag === "mdat" ||
      tag === "free" ||
      tag === "skip"
    );
  }
  if (mimeType === "video/webm") {
    // Matroska / WebM EBML ID header 0x1A 0x45 0xDF 0xA3
    return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  }
  if (mimeType === "video/ogg") {
    return buffer.toString("ascii", 0, 4) === "OggS";
  }
  if (mimeType === "video/x-msvideo") {
    if (buffer.length < 12) return false;
    return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "AVI ";
  }

  // Audio formats (voice notes & sound recordings)
  if (mimeType === "audio/webm") {
    return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  }
  if (mimeType === "audio/ogg") {
    return buffer.toString("ascii", 0, 4) === "OggS";
  }
  if (mimeType === "audio/mp4" || mimeType === "audio/m4a" || mimeType === "audio/x-m4a") {
    if (buffer.length < 8) return false;
    const tag = buffer.toString("ascii", 4, 8);
    return tag === "ftyp" || tag === "moov" || tag === "mdat" || tag === "free" || tag === "skip";
  }
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") {
    if (buffer.length < 12) return false;
    return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE";
  }
  if (mimeType === "audio/mpeg" || mimeType === "audio/mp3") {
    if (buffer.toString("ascii", 0, 3) === "ID3") return true;
    return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  }
  if (mimeType === "audio/aac") {
    if (buffer.toString("ascii", 0, 3) === "ID3") return true;
    return buffer[0] === 0xff && (buffer[1] & 0xf0) === 0xf0;
  }

  // Text & Office Documents
  if (mimeType === "text/plain" || mimeType === "text/csv") {
    return true;
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  }
  if (mimeType === "application/msword" || mimeType === "application/vnd.ms-excel") {
    return buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
  }

  return false;
}

/** Strips directory paths and unsafe characters from user-supplied file names. */
export function sanitizeFileName(name: string): string {
  const base = path.basename(name || "document").replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || "document";
}

/** Escapes XML/SVG character data to prevent markup injection. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Allows only internal upload endpoints or safe raster base64 data URLs. */
export function isSafeMediaUrl(url: string): boolean {
  const trimmed = url.trim();
  if (/^\/api\/uploads\/[A-Za-z0-9._-]+(\?t=\d+)?$/.test(trimmed)) {
    return true;
  }
  return /^data:(image\/(png|jpeg|jpg|webp|gif)|video\/(mp4|webm|quicktime|3gpp|ogg)|audio\/(webm|ogg|mp4|m4a|mpeg|wav|aac)|application\/pdf);base64,[A-Za-z0-9+/=]+$/i.test(trimmed);
}
