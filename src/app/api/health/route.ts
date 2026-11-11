import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1 as result`;
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      status: "ok",
      database: "connected",
      latencyMs,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[HEALTH_CHECK_ERROR]", error?.message || error);
    return NextResponse.json(
      {
        status: "error",
        database: "disconnected",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
