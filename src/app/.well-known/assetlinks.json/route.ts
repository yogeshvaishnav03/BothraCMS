import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const assetlinks = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.bothracms.app",
        sha256_cert_fingerprints: [
          "57:41:F1:21:F4:6F:C7:DA:EF:97:4D:D9:43:69:C5:E1:DA:2D:3D:45:29:0B:E3:51:E1:0E:95:6A:1C:47:0E:6E"
        ]
      }
    }
  ];

  return new NextResponse(JSON.stringify(assetlinks, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
