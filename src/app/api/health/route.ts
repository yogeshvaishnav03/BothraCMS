import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const rawDbUrl =
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    "";

  let currentHost = null;
  try {
    if (rawDbUrl && !rawDbUrl.startsWith("file:")) {
      currentHost = new URL(rawDbUrl).hostname;
    }
  } catch {}

  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1 as result`;
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      status: "ok",
      database: "connected",
      host: currentHost,
      latencyMs,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        database: "disconnected",
        host: currentHost,
        errorName: error?.name,
        errorMessage: error?.message,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
