import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: "connected",
    });
  } catch (error: any) {
    console.error("[HEALTH_CHECK_ERROR]", error);
    const dbUrl =
      process.env.DATABASE_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      "";
    let configuredHost = "unknown";
    try {
      if (dbUrl) {
        const u = new URL(dbUrl);
        configuredHost = u.host;
      }
    } catch {}

    return NextResponse.json(
      {
        status: "error",
        error: "Database connectivity check failed",
        diagnostic: error?.message || String(error),
        code: error?.code,
        dbConfigured: Boolean(dbUrl),
        configuredHost,
        envSources: {
          DATABASE_URL: Boolean(process.env.DATABASE_URL),
          POSTGRES_PRISMA_URL: Boolean(process.env.POSTGRES_PRISMA_URL),
          POSTGRES_URL: Boolean(process.env.POSTGRES_URL),
          POSTGRES_URL_NON_POOLING: Boolean(process.env.POSTGRES_URL_NON_POOLING),
        },
      },
      { status: 500 }
    );
  }
}
