"use client";

/**
 * Draws a drawing sheet (a PDF page or a photo/scan) into a canvas, in the
 * browser. PDF.js is served from /pdfjs (see public/pdfjs/VERSION.txt) and
 * loaded only when a PDF is opened, so the rest of the app stays light.
 */

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<any> };

let pdfjs: Promise<any> | null = null;
function loadPdfJs() {
  if (!pdfjs) {
    pdfjs = import(/* webpackIgnore: true */ "/pdfjs/pdf.min.mjs" as string).then((lib: any) => {
      lib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return lib;
    });
  }
  return pdfjs;
}

const docs = new Map<string, Promise<PdfDoc>>();
const images = new Map<string, Promise<HTMLImageElement>>();

export const isPdf = (fileName: string | null | undefined, url: string) => /\.pdf$/i.test(fileName || "") || /\.pdf($|\?)/i.test(url);

async function sniffPdf(url: string): Promise<boolean> {
  // Upload links have no extension; ask for the type without downloading the file.
  const res = await fetch(url, { method: "HEAD", credentials: "same-origin" });
  return (res.headers.get("content-type") || "").includes("pdf");
}

function pdfDoc(url: string) {
  if (!docs.has(url)) docs.set(url, loadPdfJs().then((lib) => lib.getDocument({ url, withCredentials: true }).promise));
  return docs.get(url)!;
}

function image(url: string) {
  if (!images.has(url)) {
    images.set(
      url,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Could not open the drawing file"));
        img.src = url;
      })
    );
  }
  return images.get(url)!;
}

const kinds = new Map<string, Promise<"pdf" | "image">>();
export function fileKind(url: string, fileName?: string | null) {
  if (!kinds.has(url)) kinds.set(url, isPdf(fileName, url) ? Promise.resolve("pdf") : sniffPdf(url).then((p) => (p ? "pdf" : "image")).catch(() => "image" as const));
  return kinds.get(url)!;
}

/**
 * Renders page `page` at `width` CSS pixels wide (sharp on high-density
 * screens). Returns the page count and the drawn size.
 */
export async function renderSheet(canvas: HTMLCanvasElement, url: string, opts: { fileName?: string | null; page: number; width: number }) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const kind = await fileKind(url, opts.fileName);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  if (kind === "pdf") {
    const doc = await pdfDoc(url);
    const page = await doc.getPage(Math.min(Math.max(1, opts.page), doc.numPages));
    const base = page.getViewport({ scale: 1 });
    const scale = opts.width / base.width;
    const vp = page.getViewport({ scale: scale * dpr });
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    canvas.style.width = `${opts.width}px`;
    canvas.style.height = `${Math.round(vp.height / dpr)}px`;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return { pages: doc.numPages, width: opts.width, height: Math.round(vp.height / dpr) };
  }
  const img = await image(url);
  const h = Math.round((img.naturalHeight / img.naturalWidth) * opts.width);
  canvas.width = Math.round(opts.width * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${opts.width}px`;
  canvas.style.height = `${h}px`;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { pages: 1, width: opts.width, height: h };
}

/**
 * Overlay of two sheets drawn at the same size: lines only in the older one
 * in red (removed), only in the newer one in blue (added), in both in grey.
 */
export function diffInto(out: HTMLCanvasElement, a: HTMLCanvasElement, b: HTMLCanvasElement) {
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  out.width = w;
  out.height = h;
  out.style.width = a.style.width;
  out.style.height = `${Math.round(h / (a.width / parseFloat(a.style.width || `${a.width}`)))}px`;
  const read = (c: HTMLCanvasElement) => {
    const t = document.createElement("canvas");
    t.width = w;
    t.height = h;
    const x = t.getContext("2d")!;
    x.fillStyle = "#fff";
    x.fillRect(0, 0, w, h);
    x.drawImage(c, 0, 0);
    return x.getImageData(0, 0, w, h).data;
  };
  const pa = read(a);
  const pb = read(b);
  const ctx = out.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const o = img.data;
  let changed = 0;
  for (let i = 0; i < o.length; i += 4) {
    const da = 255 - (pa[i] * 0.3 + pa[i + 1] * 0.59 + pa[i + 2] * 0.11); // ink in the old sheet
    const db = 255 - (pb[i] * 0.3 + pb[i + 1] * 0.59 + pb[i + 2] * 0.11); // ink in the new sheet
    const inkA = da > 60;
    const inkB = db > 60;
    if (inkA && inkB) {
      o[i] = o[i + 1] = o[i + 2] = 175;
    } else if (inkA) {
      o[i] = 220;
      o[i + 1] = 38;
      o[i + 2] = 38;
      changed++;
    } else if (inkB) {
      o[i] = 37;
      o[i + 1] = 99;
      o[i + 2] = 235;
      changed++;
    } else {
      o[i] = o[i + 1] = o[i + 2] = 255;
    }
    o[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { changedShare: changed / (w * h) };
}
