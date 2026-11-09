import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  compressImageFile,
  computeScaledDimensions,
  isCompressibleImage,
  presetForAttachmentCategory,
  toJpegFileName,
  IMAGE_COMPRESSION_PRESETS,
} from "../lib/image-compression";

const origDocument = (globalThis as any).document;
const origCreateImageBitmap = (globalThis as any).createImageBitmap;

afterEach(() => {
  if (origDocument === undefined) {
    delete (globalThis as any).document;
  } else {
    (globalThis as any).document = origDocument;
  }
  if (origCreateImageBitmap === undefined) {
    delete (globalThis as any).createImageBitmap;
  } else {
    (globalThis as any).createImageBitmap = origCreateImageBitmap;
  }
});

describe("Client-Side Automatic Image Compression", () => {
  describe("Pure helpers & presets", () => {
    it("scales oversized landscape and portrait dimensions proportionally", () => {
      expect(computeScaledDimensions(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
      expect(computeScaledDimensions(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
      expect(computeScaledDimensions(1200, 900, 1600)).toEqual({ width: 1200, height: 900 });
      expect(computeScaledDimensions(0, 100, 1600)).toEqual({ width: 0, height: 0 });
    });

    it("identifies compressible raster photos vs skipped types", () => {
      expect(isCompressibleImage(new Blob(["x"], { type: "image/jpeg" }))).toBe(true);
      expect(isCompressibleImage(new Blob(["x"], { type: "image/png" }))).toBe(true);
      expect(isCompressibleImage(new Blob(["x"], { type: "image/webp" }))).toBe(true);
      expect(isCompressibleImage(new Blob(["x"], { type: "image/heic" }))).toBe(true);
      expect(isCompressibleImage(new Blob(["x"], { type: "" }), "IMG_001.JPG")).toBe(true);

      expect(isCompressibleImage(new Blob(["x"], { type: "application/pdf" }))).toBe(false);
      expect(isCompressibleImage(new Blob(["x"], { type: "video/mp4" }))).toBe(false);
      expect(isCompressibleImage(new Blob(["x"], { type: "image/gif" }))).toBe(false);
      expect(isCompressibleImage(new Blob(["x"], { type: "image/svg+xml" }))).toBe(false);
      expect(isCompressibleImage(new Blob(["x"], { type: "text/csv" }), "data.csv")).toBe(false);
    });

    it("normalizes image filenames to .jpg cleanly", () => {
      expect(toJpegFileName("site.jpg")).toBe("site.jpg");
      expect(toJpegFileName("site.JPEG")).toBe("site.JPEG");
      expect(toJpegFileName("receipt.png")).toBe("receipt.jpg");
      expect(toJpegFileName("IMG_1234.HEIC")).toBe("IMG_1234.jpg");
      expect(toJpegFileName("capture")).toBe("capture.jpg");
    });

    it("maps attachment categories to safe quality presets", () => {
      expect(presetForAttachmentCategory("DRAWING", "DRAWING")).toBe("drawing");
      expect(IMAGE_COMPRESSION_PRESETS.drawing.maxDimension).toBeGreaterThanOrEqual(2400);

      expect(presetForAttachmentCategory("INVOICE")).toBe("receipt");
      expect(presetForAttachmentCategory("RECEIPT")).toBe("receipt");
      expect(presetForAttachmentCategory("BILL")).toBe("receipt");
      expect(presetForAttachmentCategory("PHOTO", "ATTENDANCE")).toBe("selfie");
      expect(presetForAttachmentCategory("PHOTO", "SITE_PHOTO")).toBe("photo");
    });
  });

  describe("compressImageFile runtime behavior", () => {
    it("returns PDFs and GIFs untouched", async () => {
      const pdf = new File([new Uint8Array(500_000)], "drawing.pdf", { type: "application/pdf" });
      const resPdf = await compressImageFile(pdf, { preset: "drawing" });
      expect(resPdf.type).toBe("application/pdf");
      expect(resPdf.size).toBe(500_000);
      expect(resPdf.name).toBe("drawing.pdf");

      const gif = new File([new Uint8Array(500_000)], "anim.gif", { type: "image/gif" });
      const resGif = await compressImageFile(gif);
      expect(resGif.type).toBe("image/gif");
      expect(resGif.size).toBe(500_000);
    });

    it("skips already-small JPEGs without invoking canvas", async () => {
      let calledBitmap = false;
      (globalThis as any).document = {
        createElement: () => ({}),
      };
      (globalThis as any).createImageBitmap = async () => {
        calledBitmap = true;
        return { width: 100, height: 100, close() {} };
      };

      const tiny = new File([new Uint8Array(40_000)], "tiny.jpg", { type: "image/jpeg" });
      const out = await compressImageFile(tiny, { preset: "photo" });
      expect(calledBitmap).toBe(false);
      expect(out.size).toBe(40_000);
    });

    it("resizes large photos on white canvas background and renames to .jpg", async () => {
      let drawnWidth = 0;
      let drawnHeight = 0;
      let fillStyleUsed = "";
      let encodedMime = "";
      let encodedQuality = 0;
      let closed = false;

      (globalThis as any).createImageBitmap = async () => ({
        width: 4000,
        height: 3000,
        close() {
          closed = true;
        },
      });

      const fakeCanvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: "",
          fillRect(x: number, y: number, w: number, h: number) {
            void x;
            void y;
            drawnWidth = w;
            drawnHeight = h;
            fillStyleUsed = this.fillStyle;
          },
          drawImage() {},
        }),
        toBlob(cb: (b: Blob | null) => void, mime: string, quality: number) {
          encodedMime = mime;
          encodedQuality = quality;
          cb(new Blob([new Uint8Array(120_000)], { type: mime }));
        },
      };

      (globalThis as any).document = {
        createElement: (tag: string) => (tag === "canvas" ? fakeCanvas : {}),
      };

      const largePng = new File([new Uint8Array(3_000_000)], "site-slab.png", { type: "image/png" });
      const compressed = await compressImageFile(largePng, { preset: "photo" });

      expect(closed).toBe(true);
      expect(drawnWidth).toBe(1600);
      expect(drawnHeight).toBe(1200);
      expect(fillStyleUsed).toBe("#ffffff");
      expect(encodedMime).toBe("image/jpeg");
      expect(encodedQuality).toBe(0.8);
      expect(compressed.name).toBe("site-slab.jpg");
      expect(compressed.type).toBe("image/jpeg");
      expect(compressed.size).toBe(120_000);
    });

    it("keeps original file if compressed output does not shrink by at least 5%", async () => {
      (globalThis as any).createImageBitmap = async () => ({
        width: 1200,
        height: 900,
        close() {},
      });
      (globalThis as any).document = {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => ({
            fillStyle: "",
            fillRect() {},
            drawImage() {},
          }),
          toBlob(cb: (b: Blob | null) => void, mime: string) {
            cb(new Blob([new Uint8Array(198_000)], { type: mime }));
          },
        }),
      };

      const original = new File([new Uint8Array(200_000)], "already-tight.webp", { type: "image/webp" });
      const result = await compressImageFile(original, { preset: "photo" });
      expect(result.name).toBe("already-tight.webp");
      expect(result.type).toBe("image/webp");
      expect(result.size).toBe(200_000);
    });

    it("falls back gracefully without throwing if image decoding fails", async () => {
      (globalThis as any).document = {
        createElement: () => ({}),
      };
      (globalThis as any).createImageBitmap = async () => {
        throw new Error("Corrupted bitmap");
      };

      const raw = new File([new Uint8Array(500_000)], "broken.jpg", { type: "image/jpeg" });
      const out = await compressImageFile(raw);
      expect(out.name).toBe("broken.jpg");
      expect(out.size).toBe(500_000);
    });
  });

  describe("Uploaders integration wiring", () => {
    const readSrc = (rel: string) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

    it("wires automatic compression into all shared upload components and offline queue", () => {
      for (const rel of [
        "components/ui/PhotoPicker.tsx",
        "components/ui/FileUpload.tsx",
        "components/attachments/AttachmentManager.tsx",
        "lib/offline-queue.ts",
      ]) {
        const content = readSrc(rel);
        expect(content).toContain("compressImageFile");
      }

      expect(readSrc("components/attachments/AttachmentManager.tsx")).toContain("presetForAttachmentCategory");
      expect(readSrc("components/ui/FileUpload.tsx")).toContain("presetForAttachmentCategory");
    });

    it("wires automatic compression into all direct page uploaders", () => {
      for (const rel of [
        "app/page.tsx",
        "app/day-book/page.tsx",
        "app/expenses/page.tsx",
        "app/measurement-book/page.tsx",
        "app/work-reports/page.tsx",
        "app/chat/page.tsx",
      ]) {
        const content = readSrc(rel);
        expect(content).toContain("compressImageFile");
      }
    });

    it("accepts /api/uploads relative URLs in chat so photos do not inline base64 into Postgres", () => {
      const chatSrc = readSrc("app/chat/page.tsx");
      expect(chatSrc).toContain('returnedUrl.startsWith("/")');
    });
  });
});
