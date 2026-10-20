const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || 'file:./prisma/dev.db' } },
});

async function run() {
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log('Organizations:', orgs.slice(0, 5));
  const parties = await prisma.party.findMany({ select: { id: true, name: true, organizationId: true } });
  console.log('Parties count:', parties.length);
  if (parties.length > 0) {
    console.log('First 3 parties:', parties.slice(0, 3));
  }
  const projects = await prisma.project.findMany({ select: { id: true, name: true, organizationId: true } });
  console.log('Projects count:', projects.length);
  if (projects.length > 0) {
    console.log('First 3 projects:', projects.slice(0, 3));
  }
}

run().finally(() => prisma.$disconnect());
