import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function optimizeDbUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  if (rawUrl.startsWith("file:")) return rawUrl;

  try {
    const url = new URL(rawUrl);
    const isNeon = url.hostname.includes("neon.tech");
    const isPooler = url.hostname.includes("-pooler");

    // CRITICAL FIX: Neon recent connection strings include channel_binding=require.
    // Prisma's Rust query engine DOES NOT support SCRAM channel binding (SCRAM-SHA-256-PLUS)
    // and immediately drops/aborts the connection with "Can't reach database server".
    // Stripping channel_binding allows Prisma to authenticate smoothly via standard TLS SCRAM-SHA-256.
    url.searchParams.delete("channel_binding");

    // Remote databases require SSL
    if (!url.searchParams.has("sslmode") && (isNeon || !url.hostname.includes("localhost"))) {
      url.searchParams.set("sslmode", "require");
    }

    // Set connection timeout to 30s to allow serverless / Neon cold start compute wake-up
    url.searchParams.set("connect_timeout", "30");

    // Set pool timeout to 30s
    url.searchParams.set("pool_timeout", "30");

    // If using a pooled host (e.g. Neon connection pooler), pgbouncer=true is required by Prisma
    if (isPooler) {
      url.searchParams.set("pgbouncer", "true");
    }

    return url.toString();
  } catch {
    // If URL parsing fails, remove channel_binding via regex fallback
    return rawUrl.replace(/[?&]channel_binding=[^&]+/g, "");
  }
}

export function getDirectDbUrl(): string | undefined {
  if (process.env.POSTGRES_URL_NON_POOLING) {
    return optimizeDbUrl(process.env.POSTGRES_URL_NON_POOLING);
  }
  const main =
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;
  if (!main) return undefined;
  try {
    const url = new URL(main);
    if (url.hostname.includes("-pooler.")) {
      url.hostname = url.hostname.replace("-pooler.", ".");
      url.searchParams.delete("pgbouncer");
      return optimizeDbUrl(url.toString());
    }
  } catch {}
  return undefined;
}

// Select best connection string
let rawUrl =
  process.env.POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

// If on Vercel and no Postgres configured, ensure /tmp/dev.db fallback is available
if (!rawUrl || rawUrl.startsWith("file:")) {
  if (process.env.VERCEL) {
    try {
      const fs = require("fs");
      const path = require("path");
      const tmpDb = "/tmp/dev.db";
      const bundledDb = path.resolve(process.cwd(), "prisma", "dev.db");
      if (!fs.existsSync(tmpDb) && fs.existsSync(bundledDb)) {
        fs.copyFileSync(bundledDb, tmpDb);
      }
      rawUrl = `file:${tmpDb}`;
    } catch {}
  }
}

const dbUrl = optimizeDbUrl(rawUrl);

// Unconditionally update process.env so Prisma's Rust engine env("DATABASE_URL") gets the cleaned string
if (dbUrl) {
  process.env.DATABASE_URL = dbUrl;
  if (process.env.POSTGRES_PRISMA_URL) process.env.POSTGRES_PRISMA_URL = dbUrl;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: dbUrl
      ? {
          db: {
            url: dbUrl,
          },
        }
      : undefined,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

globalForPrisma.prisma = prisma;
