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
    const isPooler =
      url.hostname.includes("-pooler") ||
      url.hostname.includes(".pooler.") ||
      url.port === "6543" ||
      rawUrl.includes("pgbouncer=true");

    // CRITICAL FIX: Neon recent connection strings include channel_binding=require.
    // Prisma's Rust query engine DOES NOT support SCRAM channel binding (SCRAM-SHA-256-PLUS)
    // and immediately drops/aborts the connection with "Can't reach database server".
    // Stripping channel_binding allows Prisma to authenticate smoothly via standard TLS SCRAM-SHA-256.
    url.searchParams.delete("channel_binding");

    // Remote databases require SSL
    if (!url.searchParams.has("sslmode") && (isNeon || !url.hostname.includes("localhost"))) {
      url.searchParams.set("sslmode", "require");
    }

    // Set connection timeout to 60s to allow serverless / Neon cold start compute wake-up
    url.searchParams.set("connect_timeout", "60");

    // Set pool timeout to 60s
    url.searchParams.set("pool_timeout", "60");

    // In serverless, limit max connections per container to 5 to prevent exhausting pool connections
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "5");
    }

    // If using a pooled host (e.g. Neon connection pooler, Supabase pooler), pgbouncer=true is required by Prisma
    if (isPooler) {
      url.searchParams.set("pgbouncer", "true");
    }

    return url.toString();
  } catch {
    // If URL parsing fails, remove channel_binding via regex fallback
    let cleaned = rawUrl.replace(/[?&]channel_binding=[^&]+/g, "");
    if (!cleaned.includes("sslmode=")) {
      cleaned += (cleaned.includes("?") ? "&" : "?") + "sslmode=require";
    }
    if (!cleaned.includes("connect_timeout=")) {
      cleaned += (cleaned.includes("?") ? "&" : "?") + "connect_timeout=60";
    }
    if (!cleaned.includes("pool_timeout=")) {
      cleaned += (cleaned.includes("?") ? "&" : "?") + "pool_timeout=60";
    }
    return cleaned;
  }
}

export function getDirectDbUrl(): string | undefined {
  if (process.env.POSTGRES_URL_NON_POOLING) {
    return optimizeDbUrl(process.env.POSTGRES_URL_NON_POOLING);
  }
  const main =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL;
  if (!main) return undefined;
  try {
    const url = new URL(main);
    if (url.hostname.includes("-pooler.")) {
      url.hostname = url.hostname.replace("-pooler.", ".");
      url.searchParams.delete("pgbouncer");
      return optimizeDbUrl(url.toString());
    }
  } catch {
    if (main.includes("-pooler.")) {
      const direct = main.replace("-pooler.", ".").replace(/[?&]pgbouncer=true/g, "");
      return optimizeDbUrl(direct);
    }
  }
  return optimizeDbUrl(main);
}

// Select best connection string (prefer explicit DATABASE_URL)
let rawUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
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

let directPrismaClient: PrismaClient | null = null;
export function getDirectPrisma(): PrismaClient {
  if (!directPrismaClient) {
    const directUrl = getDirectDbUrl();
    directPrismaClient = new PrismaClient({
      datasources: directUrl ? { db: { url: directUrl } } : undefined,
      log: ["error"],
    });
  }
  return directPrismaClient;
}

let ddlSynced = false;
export async function ensurePostgresColumns() {
  if (ddlSynced) return;
  try {
    const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
    if (raw && (raw.startsWith("postgres://") || raw.startsWith("postgresql://"))) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "assignedSiteIdsJson" TEXT;`).catch(() => {});
      await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "extraPermissionsJson" TEXT;`).catch(() => {});
      await prisma.$executeRawUnsafe(`ALTER TABLE "WorkforceMember" ADD COLUMN IF NOT EXISTS "contractorId" TEXT;`).catch(() => {});
      ddlSynced = true;
    }
  } catch {}
}
