import path from "path";

export const STANDARD_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/x-pdf",
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
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/x-pdf",
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
  "image/jpg": ".jpg",
  "image/pjpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
  "application/x-pdf": ".pdf",
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

/**
 * Normalizes user-supplied MIME types by stripping parameters (;codecs=..., ;charset=...),
 * resolving common aliases, and inferring missing or generic types from file extensions.
 */
export function normalizeMimeType(mime?: string | null, fileName?: string): string {
  let cleaned = (mime || "").split(";")[0].trim().toLowerCase();

  if (cleaned === "image/jpg" || cleaned === "image/pjpeg") cleaned = "image/jpeg";
  if (cleaned === "application/x-pdf") cleaned = "application/pdf";
  if (cleaned === "audio/x-wav") cleaned = "audio/wav";
  if (cleaned === "audio/mp3") cleaned = "audio/mpeg";
  if (cleaned === "audio/x-m4a") cleaned = "audio/m4a";

  if (!cleaned || cleaned === "application/octet-stream" || cleaned === "binary/octet-stream") {
    const ext = (fileName || "").split("?")[0].split(".").pop()?.toLowerCase();
    switch (ext) {
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "png":
        return "image/png";
      case "webp":
        return "image/webp";
      case "gif":
        return "image/gif";
      case "pdf":
        return "application/pdf";
      case "mp4":
        return "video/mp4";
      case "webm":
        return "video/webm";
      case "mov":
        return "video/quicktime";
      case "3gp":
        return "video/3gpp";
      case "avi":
        return "video/x-msvideo";
      case "weba":
        return "audio/webm";
      case "ogg":
      case "oga":
        return "audio/ogg";
      case "m4a":
        return "audio/mp4";
      case "mp3":
        return "audio/mpeg";
      case "wav":
        return "audio/wav";
      case "aac":
        return "audio/aac";
      case "txt":
        return "text/plain";
      case "csv":
        return "text/csv";
      case "docx":
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      case "doc":
        return "application/msword";
      case "xlsx":
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      case "xls":
        return "application/vnd.ms-excel";
      default:
        return cleaned || "application/octet-stream";
    }
  }

  return cleaned;
}

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
export function isValidMagicBytes(buffer: Buffer, mimeType: string, fileName?: string): boolean {
  if (buffer.length < 4) return false;
  const cleanMime = normalizeMimeType(mimeType, fileName);

  if (cleanMime === "image/png") {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (cleanMime === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (cleanMime === "application/pdf") {
    // PDF magic bytes: '%PDF-' within the first 1024 bytes
    const headerSnippet = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("latin1");
    return headerSnippet.includes("%PDF-");
  }
  if (cleanMime === "image/webp") {
    if (buffer.length < 12) return false;
    return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  }
  if (cleanMime === "image/gif") {
    return buffer.toString("ascii", 0, 3) === "GIF";
  }
  if (cleanMime === "video/mp4" || cleanMime === "video/quicktime" || cleanMime === "video/3gpp") {
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
  if (cleanMime === "video/webm" || cleanMime === "audio/webm") {
    // Matroska / WebM EBML ID header 0x1A 0x45 0xDF 0xA3
    return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  }
  if (cleanMime === "video/ogg" || cleanMime === "audio/ogg") {
    return buffer.toString("ascii", 0, 4) === "OggS";
  }
  if (cleanMime === "video/x-msvideo") {
    if (buffer.length < 12) return false;
    return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "AVI ";
  }

  // Audio formats (voice notes & sound recordings)
  if (cleanMime === "audio/mp4" || cleanMime === "audio/m4a" || cleanMime === "audio/x-m4a") {
    if (buffer.length < 8) return false;
    const tag = buffer.toString("ascii", 4, 8);
    return tag === "ftyp" || tag === "moov" || tag === "mdat" || tag === "free" || tag === "skip";
  }
  if (cleanMime === "audio/wav" || cleanMime === "audio/x-wav") {
    if (buffer.length < 12) return false;
    return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE";
  }
  if (cleanMime === "audio/mpeg" || cleanMime === "audio/mp3") {
    if (buffer.toString("ascii", 0, 3) === "ID3") return true;
    return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  }
  if (cleanMime === "audio/aac") {
    if (buffer.toString("ascii", 0, 3) === "ID3") return true;
    return buffer[0] === 0xff && (buffer[1] & 0xf0) === 0xf0;
  }

  // Text & Office Documents
  if (cleanMime === "text/plain" || cleanMime === "text/csv") {
    return true;
  }
  if (
    cleanMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    cleanMime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  }
  if (cleanMime === "application/msword" || cleanMime === "application/vnd.ms-excel") {
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
  return /^data:(image\/(png|jpeg|jpg|webp|gif)|video\/(mp4|webm|quicktime|3gpp|ogg)|audio\/(webm|ogg|mp4|m4a|mpeg|wav|aac)|application\/(pdf|x-pdf));base64,[A-Za-z0-9+/=]+$/i.test(trimmed);
}
