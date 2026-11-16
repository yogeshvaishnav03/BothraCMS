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
  return /^data:(image\/(png|jpeg|jpg|webp|gif)|video\/(mp4|webm|quicktime|3gpp|ogg));base64,[A-Za-z0-9+/=]+$/i.test(trimmed);
}
