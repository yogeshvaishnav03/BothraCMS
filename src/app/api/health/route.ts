import { NextResponse } from "next/server";
import { optimizeDbUrl } from "@/lib/db";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const results: any = {};

  // 1. Get raw URLs from environment
  const pooledRaw =
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;

  const directRaw =
    process.env.POSTGRES_URL_NON_POOLING ||
    (pooledRaw ? pooledRaw.replace("-pooler.", ".") : undefined);

  const pooledClean = optimizeDbUrl(pooledRaw);
  let directClean = optimizeDbUrl(directRaw);
  if (directClean) {
    try {
      const u = new URL(directClean);
      u.hostname = u.hostname.replace("-pooler.", ".");
      u.searchParams.delete("pgbouncer");
      directClean = u.toString();
    } catch {}
  }

  results.urls = {
    pooledHost: pooledClean ? new URL(pooledClean).hostname : null,
    directHost: directClean ? new URL(directClean).hostname : null,
  };

  // Test 1: Test Direct Connection
  if (directClean) {
    try {
      const directClient = new PrismaClient({
        datasources: { db: { url: directClean } },
      });
      const start = Date.now();
      await directClient.$queryRaw`SELECT 1 as result`;
      results.direct = { ok: true, latencyMs: Date.now() - start };
      await directClient.$disconnect();
    } catch (e: any) {
      results.direct = { ok: false, error: e.message?.slice(0, 200) };
    }
  }

  // Test 2: Test Pooled Connection
  if (pooledClean) {
    try {
      const pooledClient = new PrismaClient({
        datasources: { db: { url: pooledClean } },
      });
      const start = Date.now();
      await pooledClient.$queryRaw`SELECT 1 as result`;
      results.pooled = { ok: true, latencyMs: Date.now() - start };
      await pooledClient.$disconnect();
    } catch (e: any) {
      results.pooled = { ok: false, error: e.message?.slice(0, 200) };
    }
  }

  const isHealthy = results.direct?.ok || results.pooled?.ok;

  return NextResponse.json(
    {
      status: isHealthy ? "ok" : "error",
      results,
      timestamp: new Date().toISOString(),
    },
    { status: isHealthy ? 200 : 503 }
  );
}
