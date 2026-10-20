const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || "file:./prisma/dev.db" } },
});

async function run() {
  console.log("=== PHASE 3 BASELINE DATABASE AUDIT ===");

  const [
    orgs,
    users,
    projects,
    sites,
    materials,
    stores,
    parties,
    bills,
    payments,
    attendanceSessions,
    workforceMembers,
    tasks,
    mbEntries,
    rateLimits,
    auditEvents,
    purchaseOrders,
    conversations,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.project.count(),
    prisma.site.count(),
    prisma.material.count(),
    prisma.store.count(),
    prisma.party.count(),
    prisma.bill.count(),
    prisma.payment.count(),
    prisma.attendanceSession.count(),
    prisma.workforceMember.count(),
    prisma.task.count(),
    prisma.measurementBookEntry.count(),
    prisma.rateLimitRecord.count(),
    prisma.auditEvent.count(),
    prisma.purchaseOrder.count(),
    prisma.conversation.count(),
  ]);

  console.log("Entities summary:", {
    orgs,
    users,
    projects,
    sites,
    materials,
    stores,
    parties,
    bills,
    payments,
    attendanceSessions,
    workforceMembers,
    tasks,
    mbEntries,
    rateLimits,
    auditEvents,
    purchaseOrders,
    conversations,
  });

  const demoAccounts = [
    "superadmin@buildtrack.pro",
    "admin@buildtrack.pro",
    "pm@buildtrack.pro",
    "supervisor@buildtrack.pro",
    "store@buildtrack.pro",
    "accountant@buildtrack.pro",
    "viewer@buildtrack.pro",
    "auditor@buildtrack.pro",
  ];

  console.log("\nChecking demo accounts:");
  for (const email of demoAccounts) {
    const user = await prisma.user.findFirst({
      where: { email },
      include: { organization: true },
    });
    if (!user) {
      console.log(`❌ ${email}: NOT FOUND`);
    } else {
      const pwMatches = await bcrypt.compare("Password123!", user.passwordHash);
      console.log(
        `✅ ${email} | Role: ${user.role} | Org: ${user.organization?.name || "NONE"} | Pwd valid: ${pwMatches}`
      );
    }
  }

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
