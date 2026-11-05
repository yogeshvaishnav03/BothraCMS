import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const apkPath = path.resolve(process.cwd(), "public", "bothra-cms.apk");
    if (!fs.existsSync(apkPath)) {
      return new NextResponse("APK file not found", { status: 404 });
    }

    const fileBuffer = fs.readFileSync(apkPath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": 'attachment; filename="bothra-cms.apk"',
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err: any) {
    return new NextResponse(err?.message || "Failed to download APK", { status: 500 });
  }
}
