import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitSync } from "@/lib/rate-limiter";
import { readUploadedImage } from "@/lib/upload-read";
import { SalesService } from "@/services/sales-service";

export const dynamic = "force-dynamic";

/** A site photo on the buyer portal. Public, but only for photos of the buyer's own project. */
export async function GET(_req: NextRequest, { params }: { params: { token: string; updateId: string; n: string } }) {
  const notFound = () => new NextResponse("Not found", { status: 404 });
  if (!checkRateLimitSync(`portal-photo:${params.token}`, 120, 60_000).allowed) return new NextResponse("Too many requests", { status: 429 });
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 0 || n > 20) return notFound();
  const url = await SalesService.portalPhotoUrl(params.token, params.updateId, n);
  if (!url) return notFound();
  const file = await readUploadedImage(url);
  if (!file) return notFound();
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.mimeType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'",
    },
  });
}
