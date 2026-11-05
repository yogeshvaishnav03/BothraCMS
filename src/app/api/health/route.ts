import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Public health endpoint for system monitoring.
 *
 * Security invariants:
 * - Stable, predictable response payload.
 * - Never leaks internal database hostnames, credentials, or raw stack traces.
 */
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
    console.error("[HEALTH_CHECK_ERROR]", {
      name: error?.name,
      code: error?.code,
      message: error?.message?.slice(0, 100),
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        status: "error",
        database: "disconnected",
        message: "Database service unavailable. Persistent database connectivity check failed.",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
