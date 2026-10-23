import { PrismaClient } from "@prisma/client";
import { autoMigrateDatabase } from "./db-auto-migrate";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  hasAutoMigrated?: boolean;
};

const dbUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

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

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Auto-heal PostgreSQL database schema on container startup (idempotent & non-blocking)
if (!globalForPrisma.hasAutoMigrated) {
  globalForPrisma.hasAutoMigrated = true;
  autoMigrateDatabase(prisma).catch((err) => {
    console.error("[AUTO_MIGRATE_STARTUP_NOTICE]", err);
  });
}

