const { PrismaClient } = require("@prisma/client");
const { performance } = require("perf_hooks");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || "file:./prisma/dev.db" } },
});

async function runBenchmark() {
  console.log("=== PHASE 3 PERFORMANCE & RELIABILITY BENCHMARK ===");

  const results = [];

  // Helper to measure async execution time
  async function measure(name, iterations, fn) {
    const times = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn(i);
      const end = performance.now();
      times.push(end - start);
    }
    const total = times.reduce((a, b) => a + b, 0);
    const avg = total / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)] || max;

    const res = {
      operation: name,
      iterations,
      avgMs: parseFloat(avg.toFixed(2)),
      minMs: parseFloat(min.toFixed(2)),
      maxMs: parseFloat(max.toFixed(2)),
      p95Ms: parseFloat(p95.toFixed(2)),
      targetMet: p95 < 200, // SLA target: p95 < 200ms
    };
    results.push(res);
    console.log(`- ${name}: avg=${res.avgMs}ms, p95=${res.p95Ms}ms, min=${res.minMs}ms, max=${res.maxMs}ms [${res.targetMet ? "PASS" : "WARN"}]`);
    return res;
  }

  // 1. Database Indexed Lookup (Find user by email)
  await measure("Indexed User Lookup (findFirst by email)", 50, async () => {
    await prisma.user.findFirst({
      where: { email: "admin@buildtrack.pro" },
      select: { id: true, email: true, role: true, organizationId: true },
    });
  });

  // 2. Project List with Tenant Scope
  const org = await prisma.organization.findFirst();
  const orgId = org ? org.id : "demo-org-1";

  await measure("Tenant-Scoped Project Query (findMany)", 30, async () => {
    await prisma.project.findMany({
      where: { organizationId: orgId, isArchived: false },
      take: 20,
      include: {
        site: { select: { id: true, name: true, code: true } },
      },
    });
  });

  // 3. Complex Aggregation: Day Book Ledger
  await measure("Day Book Ledger Query (Multi-Entity Aggregation)", 20, async () => {
    const today = new Date().toISOString().split("T")[0];
    const [payments, bills, headcount] = await Promise.all([
      prisma.payment.findMany({
        where: { organizationId: orgId, status: { not: "REVERSED" } },
        take: 50,
      }),
      prisma.bill.findMany({
        where: { organizationId: orgId, isArchived: false },
        take: 50,
      }),
      prisma.workforceHeadcount.findMany({
        where: { organizationId: orgId },
        take: 10,
      }),
    ]);
  });

  // 4. Rate Limiter Atomic DB Transaction
  await measure("Distributed Rate Limiter Concurrency (Transaction Upsert)", 30, async (i) => {
    const key = `bench-key-${i % 5}`;
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      const existing = await tx.rateLimitRecord.findUnique({ where: { key } });
      if (!existing || now > existing.resetAt) {
        await tx.rateLimitRecord.upsert({
          where: { key },
          create: { key, points: 1, resetAt: new Date(now.getTime() + 60000) },
          update: { points: 1, resetAt: new Date(now.getTime() + 60000) },
        });
      } else {
        await tx.rateLimitRecord.update({
          where: { key },
          data: { points: { increment: 1 } },
        });
      }
    });
  });

  // 5. Simultaneous Concurrency Test (50 parallel reads)
  console.log("\nTesting 50 parallel asynchronous reads...");
  const pStart = performance.now();
  await Promise.all(
    Array.from({ length: 50 }).map(() =>
      prisma.material.findMany({
        where: { organizationId: orgId },
        take: 10,
      })
    )
  );
  const pTotal = performance.now() - pStart;
  console.log(`50 parallel queries completed in ${pTotal.toFixed(2)}ms (${(pTotal / 50).toFixed(2)}ms per query throughput).`);

  await prisma.$disconnect();

  console.log("\n=== PERFORMANCE REPORT SUMMARY ===");
  console.table(results);
}

runBenchmark().catch((err) => {
  console.error(err);
  process.exit(1);
});
