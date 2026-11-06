import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET as getSite, DELETE as deleteSite } from "@/app/api/sites/[id]/route";
import { prisma } from "@/lib/db";
import { createSessionToken } from "@/lib/auth";

describe("Site Deletion and Project Transfer Workflow", () => {
  const testOrgId = "org-test-site-del-" + Date.now();
  let adminUser: any;
  let supervisorUser: any;
  let adminToken: string;
  let supervisorToken: string;

  let siteA: any;
  let siteB: any;
  let completedSite: any;

  beforeAll(async () => {
    // 1. Create organization
    await prisma.organization.create({
      data: {
        id: testOrgId,
        name: "Test Infra Builders",
      },
    });

    // 2. Create Admin and Supervisor
    adminUser = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Admin User",
        email: `admin.${Date.now()}@bothra.test`,
        passwordHash: "hash123",
        role: "ORG_ADMIN",
        status: "ACTIVE",
      },
    });

    supervisorUser = await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Supervisor User",
        email: `sup.${Date.now()}@bothra.test`,
        passwordHash: "hash123",
        role: "SITE_SUPERVISOR",
        status: "ACTIVE",
      },
    });

    adminToken = await createSessionToken({
      userId: adminUser.id,
      name: adminUser.name,
      email: adminUser.email,
      role: adminUser.role,
      organizationId: testOrgId,
    });

    supervisorToken = await createSessionToken({
      userId: supervisorUser.id,
      name: supervisorUser.name,
      email: supervisorUser.email,
      role: supervisorUser.role,
      organizationId: testOrgId,
    });

    // 3. Create Sites
    siteA = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        name: "Site Alpha North",
        code: `ALPH-${Date.now().toString().slice(-4)}`,
        address: "North Sector 1",
        status: "ACTIVE",
      },
    });

    siteB = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        name: "Site Beta South",
        code: `BETA-${Date.now().toString().slice(-4)}`,
        address: "South Sector 2",
        status: "ACTIVE",
      },
    });

    completedSite = await prisma.site.create({
      data: {
        organizationId: testOrgId,
        name: "Site Gamma Finished",
        code: `GAMM-${Date.now().toString().slice(-4)}`,
        address: "Old Industrial Area",
        status: "ACTIVE",
      },
    });

    // 4. Create projects
    // siteA has active projects
    await prisma.project.create({
      data: {
        organizationId: testOrgId,
        siteId: siteA.id,
        name: "Tower 1 Civil Construction",
        code: `PRJ-A1-${Date.now().toString().slice(-4)}`,
        status: "IN_PROGRESS",
      },
    });
    await prisma.project.create({
      data: {
        organizationId: testOrgId,
        siteId: siteA.id,
        name: "Tower 2 Foundation",
        code: `PRJ-A2-${Date.now().toString().slice(-4)}`,
        status: "PLANNING",
      },
    });

    // completedSite only has completed project
    await prisma.project.create({
      data: {
        organizationId: testOrgId,
        siteId: completedSite.id,
        name: "Completed Highway Junction",
        code: `PRJ-G1-${Date.now().toString().slice(-4)}`,
        status: "COMPLETED",
      },
    });
  });

  const makeReq = (url: string, method: string, token: string, body?: any) => {
    return new NextRequest(new URL(url, "http://localhost:3000"), {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        cookie: `buildtrack_session=${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  it("blocks non-admin users from deleting a site", async () => {
    const req = makeReq(`http://localhost:3000/api/sites/${completedSite.id}`, "DELETE", supervisorToken);
    const res = await deleteSite(req, { params: { id: completedSite.id } });
    expect(res.status).toBe(403);
  });

  it("directly deletes a site when all its projects are completed", async () => {
    const req = makeReq(`http://localhost:3000/api/sites/${completedSite.id}`, "DELETE", adminToken);
    const res = await deleteSite(req, { params: { id: completedSite.id } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.transferredCount).toBe(0);

    // Verify site is archived in DB
    const archivedSite = await prisma.site.findUnique({ where: { id: completedSite.id } });
    expect(archivedSite?.status).toBe("ARCHIVED");
  });

  it("requires project transfer when site has active/incomplete projects", async () => {
    const req = makeReq(`http://localhost:3000/api/sites/${siteA.id}`, "DELETE", adminToken);
    const res = await deleteSite(req, { params: { id: siteA.id } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("PROJECTS_REQUIRE_TRANSFER");
    expect(json.error.details.requiresTransfer).toBe(true);
    expect(json.error.details.activeProjects.length).toBe(2);
  });

  it("successfully transfers active projects to another site and deletes the site", async () => {
    const req = makeReq(
      `http://localhost:3000/api/sites/${siteA.id}`,
      "DELETE",
      adminToken,
      { transferToSiteId: siteB.id }
    );
    const res = await deleteSite(req, { params: { id: siteA.id } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.transferredCount).toBe(2);
    expect(json.data.targetSiteId).toBe(siteB.id);

    // Verify siteA is archived in DB
    const archivedSiteA = await prisma.site.findUnique({ where: { id: siteA.id } });
    expect(archivedSiteA?.status).toBe("ARCHIVED");

    // Verify projects are now assigned to siteB
    const movedProjects = await prisma.project.findMany({
      where: { siteId: siteB.id, organizationId: testOrgId },
    });
    expect(movedProjects.length).toBe(2);
  });
});
