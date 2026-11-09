import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { downloadCsv } from "../lib/csv-download";

const ROOT = path.resolve(__dirname, "../..");

function collectFiles(dir: string, exts = [".ts", ".tsx", ".css"]): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      out.push(...collectFiles(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

describe("Android & iPhone Mobile UI/UX Fixes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("Blob-based CSV Export Helper", () => {
    it("is SSR-safe when window/document are unavailable", () => {
      expect(() => downloadCsv("report", "ColA,ColB\n1,2")).not.toThrow();
    });

    it("prepends UTF-8 BOM, enforces .csv extension, triggers download click, and delays URL revocation", async () => {
      const clickSpy = vi.fn();
      const appendSpy = vi.fn();
      const removeSpy = vi.fn();
      const linkEl: any = { click: clickSpy, style: {} };
      let capturedBlob: Blob | null = null;
      let capturedTimeoutDelay: number | undefined;

      vi.stubGlobal("document", {
        createElement: vi.fn(() => linkEl),
        body: { appendChild: appendSpy, removeChild: removeSpy },
      });
      vi.stubGlobal("window", {
        setTimeout: vi.fn((_cb: () => void, ms: number) => {
          capturedTimeoutDelay = ms;
          return 1;
        }),
      });
      vi.spyOn(URL, "createObjectURL").mockImplementation((b: any) => {
        capturedBlob = b;
        return "blob:mock-csv-url";
      });
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

      downloadCsv("muster-report", "data:text/csv;charset=utf-8,Name,Count\nAlice,5");

      expect(linkEl.download).toBe("muster-report.csv");
      expect(linkEl.href).toBe("blob:mock-csv-url");
      expect(linkEl.rel).toBe("noopener");
      expect(appendSpy).toHaveBeenCalledWith(linkEl);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(removeSpy).toHaveBeenCalledWith(linkEl);
      expect(capturedTimeoutDelay).toBe(10000);
      expect(capturedBlob).not.toBeNull();
      const rawBytes = new Uint8Array(await capturedBlob!.arrayBuffer());
      expect(Array.from(rawBytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
      const blobText = await capturedBlob!.text();
      expect(blobText).toContain("Name,Count\nAlice,5");
      expect(blobText).not.toContain("data:text/csv");
    });
  });

  describe("Viewport, Typography & Capacitor Platform Guardrails", () => {
    it("allows accessible pinch-zoom and safe-area cover + min-h-dvh in layout.tsx", () => {
      const layout = fs.readFileSync(path.join(ROOT, "src/app/layout.tsx"), "utf8");
      expect(layout).toContain("maximumScale: 5");
      expect(layout).not.toContain("userScalable: false");
      expect(layout).toContain('viewportFit: "cover"');
      expect(layout).toContain("min-h-dvh");
    });

    it("enforces iOS 16px input font-size rule, safe-area utilities, desktop-scoped fixed attachment, and touch hover rules in globals.css", () => {
      const css = fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
      expect(css).toContain("font-size: 16px !important;");
      expect(css).toContain(".pt-safe");
      expect(css).toContain(".pb-safe");
      expect(css).toContain(".mobile-header-safe");
      expect(css).toContain(".bottom-safe-offset");
      expect(css).toMatch(/@media\s*\(min-width:\s*1024px\)\s*\{[\s\S]*background-attachment:\s*fixed;/);
      expect(css).toMatch(/@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
      expect(css).toMatch(/@media\s*\(hover:\s*none\)\s*\{[\s\S]*group-hover:opacity-100/);
    });

    it("configures Capacitor for iOS and Android WebView edge-to-edge & input stability", () => {
      const cap = JSON.parse(fs.readFileSync(path.join(ROOT, "capacitor.config.json"), "utf8"));
      expect(cap.server.url).toMatch(/^https:\/\//);
      expect(cap.ios.contentInset).toBe("never");
      expect(cap.android.captureInput).toBe(false);
    });
  });

  describe("Repository-Wide Mobile UI Static Regression Guards", () => {
    const appAndComponentFiles = [
      ...collectFiles(path.join(ROOT, "src/app"), [".tsx", ".ts"]),
      ...collectFiles(path.join(ROOT, "src/components"), [".tsx", ".ts"]),
    ];

    it("uses downloadCsv (Blob) instead of raw data:text/csv URIs across all pages and components", () => {
      for (const file of appAndComponentFiles) {
        const content = fs.readFileSync(file, "utf8");
        expect(content, `${path.relative(ROOT, file)} must not use data:text/csv`).not.toContain("data:text/csv");
      }
    });

    it("uses dynamic viewport units (dvh) rather than fixed vh units inside src/app and src/components", () => {
      for (const file of appAndComponentFiles) {
        const content = fs.readFileSync(file, "utf8");
        expect(content, `${path.relative(ROOT, file)} has fixed vh utility class`).not.toMatch(/\[\d+(?:\.\d+)?vh\]/);
        expect(content, `${path.relative(ROOT, file)} has raw 100vh/90vh/85vh`).not.toMatch(/\b(?:100|90|85)vh\b/);
      }
    });

    it("does not hide <input type='file'> elements with display:none (`hidden` class) that blocks mobile triggers", () => {
      for (const file of appAndComponentFiles) {
        const content = fs.readFileSync(file, "utf8");
        const inputs = [...content.matchAll(/<input[^>]*type=["']file["'][^>]*>/gs)];
        for (const match of inputs) {
          expect(match[0], `${path.relative(ROOT, file)} file input uses hidden class`).not.toMatch(/\bhidden\b/);
          if (match[0].includes("capture=")) {
            expect(match[0], `${path.relative(ROOT, file)} mixes capture= with application/pdf`).not.toContain(
              "application/pdf"
            );
          }
        }
      }
    });

    it("pairs every mousedown outside-click listener with pointerdown for touchscreens", () => {
      const srcFiles = collectFiles(path.join(ROOT, "src"), [".ts", ".tsx"]);
      for (const file of srcFiles) {
        const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
        lines.forEach((line, idx) => {
          if (line.includes("mousedown")) {
            const context = lines.slice(Math.max(0, idx - 5), idx + 5).join("\n");
            expect(context, `${path.relative(ROOT, file)}:${idx + 1} mousedown lacks pointerdown`).toContain(
              "pointerdown"
            );
          }
        });
      }
    });

    it("does not use blocking native alert(), confirm(), or prompt() dialogs in app pages or components", () => {
      for (const file of appAndComponentFiles) {
        const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
        lines.forEach((line, idx) => {
          if (/\/\/|eslint/.test(line)) return;
          expect(
            line,
            `${path.relative(ROOT, file)}:${idx + 1} uses native browser dialog`
          ).not.toMatch(/(?<![\w.])(?:confirm|prompt|alert)\(|\bwindow\.(?:confirm|prompt|alert)\(/);
        });
      }
    });

    it("applies safe-area offsets to global mobile shell chrome and banners", () => {
      const shell = fs.readFileSync(path.join(ROOT, "src/components/layout/Shell.tsx"), "utf8");
      const banner = fs.readFileSync(path.join(ROOT, "src/components/layout/NotificationBanner.tsx"), "utf8");
      const installPrompt = fs.readFileSync(
        path.join(ROOT, "src/components/pwa/AndroidInstallPrompt.tsx"),
        "utf8"
      );
      const quickLauncher = fs.readFileSync(
        path.join(ROOT, "src/components/ui/QuickActionLauncher.tsx"),
        "utf8"
      );
      expect(shell).toContain("mobile-header-safe");
      expect(shell).toContain("env(safe-area-inset-bottom");
      expect(banner).toContain("safe-area-inset-top");
      expect(installPrompt).toContain("safe-area-inset-bottom");
      expect(quickLauncher).toContain("safe-area-inset-bottom");
    });
  });
});
