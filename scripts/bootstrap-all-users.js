const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const USERS = [
  {
    id: "usr-super-1",
    name: "Master Super Admin",
    email: "superadmin@buildtrack.pro",
    role: "SUPER_ADMIN",
    jobTitle: "Global Tenant Administrator",
  },
  {
    id: "usr-admin-1",
    name: "Vikram Malhotra",
    email: "admin@buildtrack.pro",
    role: "ORG_ADMIN",
    jobTitle: "Organization Administrator",
  },
  {
    id: "usr-pm-1",
    name: "Arjun Verma",
    email: "pm@buildtrack.pro",
    role: "PROJECT_MANAGER",
    jobTitle: "Project Manager",
  },
  {
    id: "usr-sup-1",
    name: "Rajesh Kumar",
    email: "supervisor@buildtrack.pro",
    role: "SITE_SUPERVISOR",
    jobTitle: "Site Supervisor",
  },
  {
    id: "usr-fin-1",
    name: "Pooja Sharma",
    email: "finance@buildtrack.pro",
    role: "ACCOUNTANT",
    jobTitle: "Accountant",
  },
  {
    id: "usr-store-1",
    name: "Mohan Lal",
    email: "store@buildtrack.pro",
    role: "STOREKEEPER",
    jobTitle: "Storekeeper",
  },
];

const DEFAULT_PASSWORD = "Password123!";

async function bootstrapAllUsers() {
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING;

  const isPostgres = dbUrl && (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://"));

  const prisma = new PrismaClient({
    datasources: isPostgres ? { db: { url: dbUrl } } : undefined,
  });

  try {
    console.log("⚡ [USER_BOOTSTRAP] Ensuring primary organization exists...");
    let org = await prisma.organization.findFirst();
    if (!org) {
      org = await prisma.organization.create({
        data: {
          id: "1eb45938-3964-41ab-8145-c8ff93c90c73",
          name: "Bothra Infrastructure & Builders",
          currency: "INR",
          timezone: "Asia/Kolkata",
          status: "ACTIVE",
        },
      });
      console.log(`✅ [USER_BOOTSTRAP] Created primary organization: ${org.name} (${org.id})`);
    } else {
      console.log(`ℹ️ [USER_BOOTSTRAP] Using existing organization: ${org.name} (${org.id})`);
    }

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    console.log(`⚡ [USER_BOOTSTRAP] Upserting authoritative role accounts with password '${DEFAULT_PASSWORD}'...`);
    for (const u of USERS) {
      const normalizedEmail = u.email.toLowerCase().trim();
      const existingUser = await prisma.user.findFirst({
        where: {
          organizationId: org.id,
          email: normalizedEmail,
        },
      });

      if (existingUser) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            name: existingUser.name || u.name,
            role: u.role,
            passwordHash,
            status: "ACTIVE",
            jobTitle: existingUser.jobTitle || u.jobTitle,
          },
        });
        console.log(`  ✓ Updated ${u.role}: ${normalizedEmail}`);
      } else {
        await prisma.user.create({
          data: {
            id: u.id,
            organizationId: org.id,
            name: u.name,
            email: normalizedEmail,
            role: u.role,
            passwordHash,
            status: "ACTIVE",
            jobTitle: u.jobTitle,
          },
        });
        console.log(`  + Created ${u.role}: ${normalizedEmail}`);
      }
    }

    console.log("✅ [USER_BOOTSTRAP] All authoritative role accounts verified and ready for login.");
  } catch (error) {
    console.error("⚠️ [USER_BOOTSTRAP] Notice:", error.message || error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  bootstrapAllUsers();
}

module.exports = { bootstrapAllUsers };
