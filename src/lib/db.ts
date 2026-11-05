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

    // Remote databases require SSL
    if (!url.searchParams.has("sslmode") && (isNeon || !url.hostname.includes("localhost"))) {
      url.searchParams.set("sslmode", "require");
    }

    // Set connection timeout to 30s to allow serverless / Neon cold start compute wake-up
    const currentTimeout = parseInt(url.searchParams.get("connect_timeout") || "0", 10);
    if (!currentTimeout || currentTimeout < 30) {
      url.searchParams.set("connect_timeout", "30");
    }

    // Set pool timeout to 30s
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "30");
    }

    // If using a pooled host (e.g. Neon connection pooler), pgbouncer=true is required by Prisma
    if (isPooler && !url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }

    return url.toString();
  } catch {
    return rawUrl;
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

// Select best connection string: prefer Prisma-tailored URL, then general DATABASE_URL, etc.
const rawUrl =
  process.env.POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

const dbUrl = optimizeDbUrl(rawUrl);

if (!process.env.DATABASE_URL && dbUrl) {
  process.env.DATABASE_URL = dbUrl;
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
