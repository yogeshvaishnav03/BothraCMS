/**
 * Super Admin Bootstrap Script for Build Track Pro
 * Usage: npx tsx scripts/create-super-admin.ts <email> <password> <name> [organizationId]
 *
 * Example:
 *   npx tsx scripts/create-super-admin.ts superadmin@buildtrack.pro SecureAdminPass123! "Master Admin" demo-org-1
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const email = args[0] || process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = args[1] || process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const name = args[2] || process.env.ADMIN_BOOTSTRAP_NAME || "System Super Admin";
  let orgId = args[3] || process.env.ADMIN_BOOTSTRAP_ORG_ID;

  if (!email || !password) {
    console.log("Usage: npx tsx scripts/create-super-admin.ts <email> <password> [name] [organizationId]");
    console.log("Or set environment variables: ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD");
    process.exit(1);
  }

  // Find or create default organization if not specified
  if (!orgId) {
    const firstOrg = await prisma.organization.findFirst();
    if (firstOrg) {
      orgId = firstOrg.id;
    } else {
      const newOrg = await prisma.organization.create({
        data: {
          name: "Apex Infrastructure & Builders",
          currency: "INR",
          timezone: "Asia/Kolkata",
          status: "ACTIVE",
        },
      });
      orgId = newOrg.id;
      console.log(`[BOOTSTRAP] Created primary organization: ${orgId}`);
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: orgId,
        email: email.toLowerCase().trim(),
      },
    },
    update: {
      role: "SUPER_ADMIN",
      passwordHash,
      status: "ACTIVE",
    },
    create: {
      organizationId: orgId,
      name,
      email: email.toLowerCase().trim(),
      passwordHash,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  });

  console.log(`[BOOTSTRAP SUCCESS] Super Admin account created/updated:`);
  console.log(`  User ID: ${user.id}`);
  console.log(`  Email:   ${user.email}`);
  console.log(`  Role:    ${user.role}`);
  console.log(`  Org ID:  ${user.organizationId}`);
}

main()
  .catch((e) => {
    console.error("[BOOTSTRAP ERROR]", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
