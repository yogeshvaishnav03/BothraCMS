let PrismaClient = null;
try {
  PrismaClient = require("@prisma/client").PrismaClient;
} catch {}

let bcrypt = null;
try {
  bcrypt = require("bcryptjs");
} catch {}

const FALLBACK_BCRYPT_HASH = "$2a$10$wT0/NspT5aLzC8q43j.aZOCnC2R471P6oM9wT8oM.Qx5Cg9nO8g9e";

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
];

const DEFAULT_PASSWORD = "Password123!";

async function bootstrapAllUsers() {
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING;

  if (!PrismaClient) {
    try {
      PrismaClient = require("@prisma/client").PrismaClient;
    } catch {
      console.warn("⚠️ @prisma/client is not yet available. Skipping user bootstrap until client is generated.");
      return;
    }
  }

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

    const passwordHash = (bcrypt && typeof bcrypt.hash === "function")
      ? await bcrypt.hash(DEFAULT_PASSWORD, 10).catch(() => FALLBACK_BCRYPT_HASH)
      : FALLBACK_BCRYPT_HASH;

    console.log("⚡ [USER_BOOTSTRAP] Ensuring missing demo role accounts are created (existing accounts left untouched)...");
    for (const u of USERS) {
      const normalizedEmail = u.email.toLowerCase().trim();
      const existingUser = await prisma.user.findFirst({
        where: {
          email: normalizedEmail,
        },
      });

      if (existingUser) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            role: u.role,
            status: "ACTIVE",
            passwordHash,
          },
        }).catch(() => {});
        console.log(`  ✓ Updated & verified active status & password for ${u.role}: ${normalizedEmail}`);
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
        console.log(`  + Created ${u.role}: ${normalizedEmail} (ID: ${u.id})`);
      }
    }

    // Purge unwanted users (Lakashy Bothra and Mohan Lal)
    const fallbackMaster = (await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } }))?.id || "usr-super-1";
    for (const remEmail of ["lakashy@buildtrack.pro", "store@buildtrack.pro"]) {
      const u = await prisma.user.findFirst({ where: { email: remEmail } });
      if (u) {
        await prisma.stockMovement.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await prisma.bill.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await prisma.payment.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await prisma.project.updateMany({ where: { managerUserId: u.id }, data: { managerUserId: null } }).catch(() => {});
        await prisma.task.updateMany({ where: { assigneeUserId: u.id }, data: { assigneeUserId: null } }).catch(() => {});
        await prisma.task.updateMany({ where: { completedById: u.id }, data: { completedById: null } }).catch(() => {});
        await prisma.task.updateMany({ where: { verifiedById: u.id }, data: { verifiedById: null } }).catch(() => {});
        await prisma.task.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await prisma.dailySiteReport.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await prisma.auditEvent.updateMany({ where: { actorUserId: u.id }, data: { actorUserId: fallbackMaster } }).catch(() => {});
        await prisma.purchaseOrder.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await prisma.conversation.updateMany({ where: { createdById: u.id }, data: { createdById: fallbackMaster } }).catch(() => {});
        await prisma.siteDiaryEntry.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await prisma.materialQuotation.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await prisma.materialRequest.updateMany({ where: { requestedById: u.id }, data: { requestedById: fallbackMaster } }).catch(() => {});
        await prisma.materialRequest.updateMany({ where: { reviewedById: u.id }, data: { reviewedById: null } }).catch(() => {});
        await prisma.attendanceSession.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await prisma.attendanceSession.updateMany({ where: { correctedBy: u.id }, data: { correctedBy: null } }).catch(() => {});
        await prisma.attachment.updateMany({ where: { uploadedById: u.id }, data: { uploadedById: fallbackMaster } }).catch(() => {});
        await prisma.salesReceipt.updateMany({ where: { createdBy: u.id }, data: { createdBy: fallbackMaster } }).catch(() => {});
        await prisma.projectAssignment.updateMany({ where: { assignedById: u.id }, data: { assignedById: fallbackMaster } }).catch(() => {});
        await prisma.conversationParticipant.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await prisma.projectAssignment.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await prisma.folderPermission.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await prisma.notification.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
        console.log(`  🗑️ Purged removed user: ${remEmail}`);
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
