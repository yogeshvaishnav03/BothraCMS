import path from "path";

export const STANDARD_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/bmp",
  "image/x-ms-bmp",
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
  "application/acad",
  "application/x-acad",
  "application/autocad_dwg",
  "application/dwg",
  "application/x-dwg",
  "image/vnd.dwg",
  "image/x-dwg",
  "application/dxf",
  "application/x-dxf",
  "image/vnd.dxf",
  "application/zip",
  "application/x-zip-compressed",
]);

export const PRESIGN_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/bmp",
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
  "application/acad",
  "application/dwg",
  "image/vnd.dwg",
  "application/dxf",
  "application/zip",
]);

export const STANDARD_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/pjpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "image/x-ms-bmp": ".bmp",
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
  "application/acad": ".dwg",
  "application/x-acad": ".dwg",
  "application/autocad_dwg": ".dwg",
  "application/dwg": ".dwg",
  "application/x-dwg": ".dwg",
  "image/vnd.dwg": ".dwg",
  "image/x-dwg": ".dwg",
  "application/dxf": ".dxf",
  "application/x-dxf": ".dxf",
  "image/vnd.dxf": ".dxf",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
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
      case "heic":
      case "heif":
        return "image/heic";
      case "avif":
        return "image/avif";
      case "bmp":
        return "image/bmp";
      case "dwg":
        return "application/acad";
      case "dxf":
        return "application/dxf";
      case "zip":
        return "application/zip";
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
  "image/heic",
  "image/heif",
  "image/avif",
  "image/bmp",
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

/** Blocks Windows executables, Linux binaries, Java bytecode, and script injections. */
function isDangerousExecutableOrScript(buffer: Buffer): boolean {
  if (buffer.length < 2) return false;
  // Windows DOS/PE executable 'MZ'
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) return true;
  // Linux ELF binary
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) return true;
  // Java class file
  if (buffer.length >= 4 && buffer[0] === 0xca && buffer[1] === 0xfe && buffer[2] === 0xba && buffer[3] === 0xbe) return true;

  // Inspect first 1024 bytes for active script injection
  const snippet = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("latin1").toLowerCase();
  if (
    snippet.includes("<script") ||
    snippet.includes("javascript:") ||
    snippet.includes("<html") ||
    snippet.includes("<?php") ||
    snippet.includes("<%@") ||
    snippet.includes("#!/bin/") ||
    snippet.includes("#!/usr/bin/")
  ) {
    return true;
  }
  return false;
}

/** Check if buffer matches ANY safe, authorized media or document format. */
function isAnySafeAllowedSignature(buffer: Buffer, fileName?: string): boolean {
  // JPEG: SOI marker 0xFF 0xD8
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return true;
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true;
  // PDF / FDF (within first 1024 bytes, handles BOM & comments)
  const header1k = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("latin1");
  if (header1k.includes("%PDF") || header1k.includes("%FDF")) return true;
  // WebP: RIFF....WEBP
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return true;
  // GIF: GIF87a or GIF89a
  if (buffer.length >= 3 && buffer.toString("ascii", 0, 3) === "GIF") return true;
  // BMP: 'BM'
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) return true;
  // TIFF: 'II*\0' or 'MM\0*'
  if (buffer.length >= 4 && ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a) || (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00))) return true;
  // AutoCAD DWG: starts with 'AC10'
  if (buffer.length >= 4 && buffer[0] === 0x41 && buffer[1] === 0x43 && buffer[2] === 0x31 && buffer[3] === 0x30) return true;
  // MP4 / QuickTime / 3GP / HEIC / AVIF ISO base media ftyp box
  if (buffer.length >= 8) {
    const tag = buffer.toString("ascii", 4, 8);
    if (tag === "ftyp" || tag === "moov" || tag === "wide" || tag === "mdat" || tag === "free" || tag === "skip") return true;
  }
  // WebM / EBML
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return true;
  // OGG
  if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "OggS") return true;
  // WAV or AVI
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF") {
    const sub = buffer.toString("ascii", 8, 12);
    if (sub === "WAVE" || sub === "AVI ") return true;
  }
  // MP3 / AAC audio
  if (buffer.length >= 3 && buffer.toString("ascii", 0, 3) === "ID3") return true;
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return true;
  // PK Zip / DOCX / XLSX
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)) return true;
  // Legacy Office DOC / XLS
  if (buffer.length >= 4 && buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) return true;

  // Plain text / CSV / DXF
  if (fileName) {
    const ext = fileName.split("?")[0].split(".").pop()?.toLowerCase();
    if (ext === "txt" || ext === "csv" || ext === "dxf") {
      const sample = buffer.subarray(0, Math.min(buffer.length, 512));
      return !sample.some((b) => b === 0x00);
    }
  }

  return false;
}

/** Inspects file header magic bytes against claimed MIME type with resilient cross-signature support. */
export function isValidMagicBytes(buffer: Buffer, mimeType: string, fileName?: string): boolean {
  if (buffer.length < 4) return false;

  // 1. Strictly block any executable, binary shellcode, or malicious script payload
  if (isDangerousExecutableOrScript(buffer)) {
    return false;
  }

  const cleanMime = normalizeMimeType(mimeType, fileName);

  // 2. Direct verification matching claimed MIME
  if (cleanMime === "image/png") {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true;
  } else if (cleanMime === "image/jpeg") {
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return true;
  } else if (cleanMime === "application/pdf") {
    const headerSnippet = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("latin1");
    if (headerSnippet.includes("%PDF") || headerSnippet.includes("%FDF")) return true;
  } else if (cleanMime === "image/webp") {
    if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return true;
  } else if (cleanMime === "image/gif") {
    if (buffer.toString("ascii", 0, 3) === "GIF") return true;
  } else if (cleanMime === "image/bmp" || cleanMime === "image/x-ms-bmp") {
    if (buffer[0] === 0x42 && buffer[1] === 0x4d) return true;
  } else if (cleanMime === "image/heic" || cleanMime === "image/heif" || cleanMime === "image/avif") {
    if (buffer.length >= 8 && buffer.toString("ascii", 4, 8) === "ftyp") return true;
  } else if (cleanMime === "application/acad" || cleanMime === "application/dwg" || cleanMime === "image/vnd.dwg") {
    if (buffer.length >= 4 && buffer[0] === 0x41 && buffer[1] === 0x43 && buffer[2] === 0x31 && buffer[3] === 0x30) return true;
  } else if (cleanMime === "video/mp4" || cleanMime === "video/quicktime" || cleanMime === "video/3gpp") {
    if (buffer.length >= 8) {
      const tag = buffer.toString("ascii", 4, 8);
      if (tag === "ftyp" || tag === "moov" || tag === "wide" || tag === "mdat" || tag === "free" || tag === "skip") return true;
    }
  } else if (cleanMime === "video/webm" || cleanMime === "audio/webm") {
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return true;
  } else if (cleanMime === "video/ogg" || cleanMime === "audio/ogg") {
    if (buffer.toString("ascii", 0, 4) === "OggS") return true;
  } else if (cleanMime === "video/x-msvideo") {
    if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "AVI ") return true;
  } else if (cleanMime === "audio/mp4" || cleanMime === "audio/m4a" || cleanMime === "audio/x-m4a") {
    if (buffer.length >= 8) {
      const tag = buffer.toString("ascii", 4, 8);
      if (tag === "ftyp" || tag === "moov" || tag === "mdat" || tag === "free" || tag === "skip") return true;
    }
  } else if (cleanMime === "audio/wav" || cleanMime === "audio/x-wav") {
    if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE") return true;
  } else if (cleanMime === "audio/mpeg" || cleanMime === "audio/mp3") {
    if (buffer.toString("ascii", 0, 3) === "ID3") return true;
    if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return true;
  } else if (cleanMime === "audio/aac") {
    if (buffer.toString("ascii", 0, 3) === "ID3") return true;
    if (buffer[0] === 0xff && (buffer[1] & 0xf0) === 0xf0) return true;
  } else if (cleanMime === "text/plain" || cleanMime === "text/csv" || cleanMime === "application/dxf") {
    const sample = buffer.subarray(0, Math.min(buffer.length, 512));
    if (!sample.some((b) => b === 0x00)) return true;
  } else if (
    cleanMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    cleanMime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    cleanMime === "application/zip"
  ) {
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)) return true;
  } else if (cleanMime === "application/msword" || cleanMime === "application/vnd.ms-excel") {
    if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) return true;
  }

  // 3. Resilient fallback: If mobile browser reported MIME inaccurately (e.g. image/jpeg for a WebP/PNG/PDF),
  // verify if the file has an authentic signature of ANY safe allowed document/media type
  if (isAnySafeAllowedSignature(buffer, fileName)) {
    return true;
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
  if (/^\/api\/uploads\/[A-Za-z0-9._-]+(\?.*)?$/.test(trimmed)) {
    return true;
  }
  if (/^https:\/\/[A-Za-z0-9.-]+\.(blob\.vercel-storage\.com|amazonaws\.com|r2\.cloudflarestorage\.com)\//i.test(trimmed)) {
    return true;
  }
  return /^data:(image\/(png|jpeg|jpg|webp|gif)|video\/(mp4|webm|quicktime|3gpp|ogg)|audio\/(webm|ogg|mp4|m4a|mpeg|wav|aac)|application\/(pdf|x-pdf));base64,[A-Za-z0-9+/=]+$/i.test(trimmed);
}
