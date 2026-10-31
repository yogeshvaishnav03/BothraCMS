const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('Password123!', 10);
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.error('No organization found');
    return;
  }

  const testAccounts = [
    { email: 'admin@buildtrack.pro', name: 'Vikram Malhotra', role: 'SUPER_ADMIN' },
    { email: 'supervisor@buildtrack.pro', name: 'Rajesh Kumar', role: 'SITE_SUPERVISOR' },
    { email: 'accountant@buildtrack.pro', name: 'Pooja Sharma', role: 'ACCOUNTANT' },
    { email: 'engineer@buildtrack.pro', name: 'Arjun Verma', role: 'SITE_ENGINEER' },
  ];

  for (const acc of testAccounts) {
    const existing = await prisma.user.findFirst({
      where: { email: acc.email, organizationId: org.id },
    });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: acc.role,
          passwordHash: hash,
          status: 'ACTIVE',
        },
      });
      console.log(`✓ Updated role & password for: ${acc.email} (${acc.role})`);
    } else {
      await prisma.user.create({
        data: {
          organizationId: org.id,
          email: acc.email,
          name: acc.name,
          role: acc.role,
          passwordHash: hash,
          status: 'ACTIVE',
        },
      });
      console.log(`✓ Created test account: ${acc.email} (${acc.role})`);
    }
  }

  // Ensure supervisor has an active project assignment
  const supervisor = await prisma.user.findFirst({ where: { email: 'supervisor@buildtrack.pro', organizationId: org.id } });
  const admin = await prisma.user.findFirst({ where: { email: 'admin@buildtrack.pro', organizationId: org.id } });
  const activeProject = await prisma.project.findFirst({ where: { organizationId: org.id, isArchived: false } });
  if (supervisor && activeProject && admin) {
    const existingAssignment = await prisma.projectAssignment.findFirst({
      where: { userId: supervisor.id, projectId: activeProject.id }
    });
    if (!existingAssignment) {
      await prisma.projectAssignment.create({
        data: {
          organizationId: org.id,
          userId: supervisor.id,
          projectId: activeProject.id,
          role: 'SITE_SUPERVISOR',
          status: 'ACTIVE',
          assignedById: admin.id
        }
      });
      console.log(`✓ Assigned ${supervisor.email} to project: ${activeProject.name}`);
    } else {
      console.log(`✓ Project assignment verified for ${supervisor.email}`);
    }
  }

  console.log('All test role accounts ready!');
}

main().finally(() => prisma.$disconnect());
