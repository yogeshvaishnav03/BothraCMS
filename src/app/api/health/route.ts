import { NextResponse } from "next/server";
import { prisma, getDirectDbUrl } from "@/lib/db";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const envSummary = {
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasPostgresPrismaUrl: !!process.env.POSTGRES_PRISMA_URL,
    hasPostgresUrl: !!process.env.POSTGRES_URL,
    hasPostgresNonPooling: !!process.env.POSTGRES_URL_NON_POOLING,
  };

  // Step 1: Test primary prisma client
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1 as result`;
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      status: "ok",
      database: "connected",
      mode: "primary",
      latencyMs,
      env: envSummary,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (primaryErr: any) {
    const primaryErrorInfo = {
      name: primaryErr?.name,
      code: primaryErr?.code,
      message: primaryErr?.message,
    };

    // Step 2: Attempt fallback with direct unpooled PostgreSQL URL
    const directUrl = getDirectDbUrl();
    if (directUrl) {
      try {
        const directClient = new PrismaClient({
          datasources: { db: { url: directUrl } },
          log: ["error"],
        });
        const start = Date.now();
        await directClient.$queryRaw`SELECT 1 as result`;
        const latencyMs = Date.now() - start;
        await directClient.$disconnect();

        return NextResponse.json({
          status: "degraded",
          database: "direct_fallback_available",
          notice: "Primary pooled connection failed, but direct unpooled connection succeeded.",
          directLatencyMs: latencyMs,
          primaryError: primaryErrorInfo,
          env: envSummary,
          timestamp: new Date().toISOString(),
        });
      } catch (directErr: any) {
        return NextResponse.json(
          {
            status: "error",
            errorName: primaryErr?.name,
            errorMessage: primaryErr?.message,
            directErrorName: directErr?.name,
            directErrorMessage: directErr?.message,
            env: envSummary,
            timestamp: new Date().toISOString(),
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      {
        status: "error",
        errorName: primaryErr?.name,
        errorMessage: primaryErr?.message,
        env: envSummary,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
