"use client";

export type ImageCompressionPreset = "photo" | "receipt" | "drawing" | "selfie";

export interface CompressImageOptions {
  /** Compression profile preset (default: "photo"). */
  preset?: ImageCompressionPreset;
  /** Override longest output edge in pixels. */
  maxDimension?: number;
  /** Override JPEG quality between 0 and 1. */
  quality?: number;
  /** Skip re-encoding already small supported images below this byte size. */
  minBytes?: number;
  /** Explicit filename when input is a generic Blob. */
  fileName?: string;
}

export const IMAGE_COMPRESSION_PRESETS: Record<
  ImageCompressionPreset,
  { maxDimension: number; quality: number; minBytes: number }
> = {
  /** Daily site photos, progress updates, MB evidence, chat images (~180–350 KB). */
  photo: { maxDimension: 1600, quality: 0.8, minBytes: 150 * 1024 },
  /** Bills, GST invoices, shop receipts, UPI screenshots — slightly sharper text. */
  receipt: { maxDimension: 1600, quality: 0.82, minBytes: 150 * 1024 },
  /** Architectural / structural drawing scans — preserves fine linework and dimensions. */
  drawing: { maxDimension: 2560, quality: 0.9, minBytes: 250 * 1024 },
  /** Staff attendance check-in selfies. */
  selfie: { maxDimension: 1024, quality: 0.8, minBytes: 100 * 1024 },
};

const BACKEND_SUPPORTED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const SKIPPED_IMAGE_MIMES = new Set([
  "image/gif",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

const COMPRESSIBLE_EXT_REGEX = /\.(jpe?g|png|webp|heic|heif|bmp|tiff?)$/i;

/** Chooses the right compression preset from an attachment category / entity type. */
export function presetForAttachmentCategory(
  category?: string | null,
  entityType?: string | null
): ImageCompressionPreset {
  const cat = (category || "").toUpperCase();
  const ent = (entityType || "").toUpperCase();
  if (cat === "DRAWING" || ent === "DRAWING") return "drawing";
  if (cat === "INVOICE" || cat === "BILL" || cat === "RECEIPT" || cat === "PAYMENT") {
    return "receipt";
  }
  if (ent === "ATTENDANCE") return "selfie";
  return "photo";
}

/** Returns true when a file is a raster photo we can safely resize/re-encode cleanly. */
export function isCompressibleImage(file: Blob, explicitName?: string): boolean {
  const mime = (file.type || "").toLowerCase();
  const name = explicitName || (file instanceof File ? file.name : "") || "";

  if (SKIPPED_IMAGE_MIMES.has(mime)) return false;
  if (mime.startsWith("image/")) return true;
  if (!mime && COMPRESSIBLE_EXT_REGEX.test(name)) return true;
  return false;
}

/** Computes target dimensions fitting inside `maxDimension` while keeping aspect ratio. */
export function computeScaledDimensions(
  srcWidth: number,
  srcHeight: number,
  maxDimension: number
): { width: number; height: number } {
  if (srcWidth <= 0 || srcHeight <= 0 || !Number.isFinite(srcWidth) || !Number.isFinite(srcHeight)) {
    return { width: 0, height: 0 };
  }
  const longest = Math.max(srcWidth, srcHeight);
  if (longest <= maxDimension) {
    return { width: Math.round(srcWidth), height: Math.round(srcHeight) };
  }
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(srcWidth * scale)),
    height: Math.max(1, Math.round(srcHeight * scale)),
  };
}

/** Normalizes output filename to .jpg while preserving existing .jpg/.jpeg extensions. */
export function toJpegFileName(originalName: string): string {
  const trimmed = (originalName || "photo").trim() || "photo";
  if (/\.jpe?g$/i.test(trimmed)) return trimmed;
  if (/\.[a-z0-9]{1,8}$/i.test(trimmed)) {
    return trimmed.replace(/\.[a-z0-9]{1,8}$/i, ".jpg");
  }
  return `${trimmed}.jpg`;
}

function wrapAsFile(input: Blob, fileName: string): File {
  if (input instanceof File && input.name === fileName) return input;
  const fallbackMime = input.type || "application/octet-stream";
  const lastModified = input instanceof File ? input.lastModified : Date.now();
  return new File([input], fileName, { type: fallbackMime, lastModified });
}

interface DecodedRaster {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

async function decodeImage(blob: Blob): Promise<DecodedRaster | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          cleanup: () => {
            try {
              bitmap.close();
            } catch {}
          },
        };
      }
      bitmap.close();
    } catch {
      // Fall through to HTMLImageElement decoder (covers browsers/codecs where createImageBitmap fails)
    }
  }

  if (typeof Image === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return null;
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image decode failed"));
      el.src = objectUrl;
    });
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (width <= 0 || height <= 0) {
      URL.revokeObjectURL(objectUrl);
      return null;
    }
    return {
      source: img,
      width,
      height,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch {
    URL.revokeObjectURL(objectUrl);
    return null;
  }
}

/**
 * Automatically resizes and compresses uploaded raster photos (JPEG/PNG/WebP/HEIC)
 * on the client device before uploading. PDFs, documents, GIFs, SVGs, videos,
 * and already-tiny files are returned untouched.
 *
 * Guarantees safe fallback: never throws and never returns a larger file than input
 * (unless converting a non-standard image MIME like HEIC into browser/API-safe JPEG).
 */
export async function compressImageFile(
  input: File | Blob,
  options: CompressImageOptions = {}
): Promise<File> {
  const inputName = options.fileName || (input instanceof File ? input.name : "photo.jpg") || "photo.jpg";
  const originalFile = wrapAsFile(input, inputName);

  if (typeof document === "undefined" || !isCompressibleImage(input, inputName)) {
    return originalFile;
  }

  const presetConfig = IMAGE_COMPRESSION_PRESETS[options.preset || "photo"];
  const maxDimension = options.maxDimension ?? presetConfig.maxDimension;
  const quality = options.quality ?? presetConfig.quality;
  const minBytes = options.minBytes ?? presetConfig.minBytes;

  const normalizedMime = (input.type || "").toLowerCase();
  const mustConvertMime = normalizedMime !== "" && !BACKEND_SUPPORTED_IMAGE_MIMES.has(normalizedMime);

  // Skip decoding tiny files that are already well-compressed and API-compatible
  if (!mustConvertMime && input.size > 0 && input.size <= minBytes) {
    return originalFile;
  }

  let decoded: DecodedRaster | null = null;
  let canvas: HTMLCanvasElement | null = null;

  try {
    decoded = await decodeImage(input);
    if (!decoded) return originalFile;

    const { width, height } = computeScaledDimensions(decoded.width, decoded.height, maxDimension);
    if (width <= 0 || height <= 0) return originalFile;

    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return originalFile;

    // Fill white before drawing so PNG transparency never turns black in JPEG
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(decoded.source, 0, 0, width, height);

    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas!.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    });

    if (!compressedBlob || compressedBlob.size === 0) {
      return originalFile;
    }

    // Keep original if compression did not meaningfully save space (unless MIME needed conversion)
    if (!mustConvertMime && compressedBlob.size >= input.size * 0.95) {
      return originalFile;
    }

    return new File([compressedBlob], toJpegFileName(inputName), {
      type: "image/jpeg",
      lastModified: originalFile.lastModified,
    });
  } catch {
    return originalFile;
  } finally {
    decoded?.cleanup();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
