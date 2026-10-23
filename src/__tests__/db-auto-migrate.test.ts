import { describe, it, expect } from "vitest";
import { autoMigrateDatabase } from "@/lib/db-auto-migrate";
import { prisma } from "@/lib/db";

describe("PostgreSQL Auto-Migration & Self-Healing Invariants", () => {
  it("should handle non-Postgres environment safely without error", async () => {
    const res = await autoMigrateDatabase(prisma);
    expect(res.success).toBe(true);
    // In local SQLite environment, isPostgres should be false and no errors thrown
    expect(typeof res.isPostgres).toBe("boolean");
  });
});
