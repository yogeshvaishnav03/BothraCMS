import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const envInfo = {
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasPostgresUrl: !!process.env.POSTGRES_URL,
    hasPostgresPrismaUrl: !!process.env.POSTGRES_PRISMA_URL,
    dbUrlProtocol: process.env.DATABASE_URL ? process.env.DATABASE_URL.split(":")[0] : null,
    nodeEnv: process.env.NODE_ENV,
    isVercel: !!process.env.VERCEL,
  };

  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1 as result`;
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      status: "ok",
      database: "connected",
      latencyMs,
      envInfo,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        database: "disconnected",
        errorName: error?.name,
        errorCode: error?.code,
        errorMessage: error?.message,
        envInfo,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
