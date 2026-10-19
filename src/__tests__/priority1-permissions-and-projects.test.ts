import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  requireUserContext,
  requirePermission,
  canReadFinance,
  requireFinanceRead,
  isOrgOwnerOrAdmin,
  userHasProjectAccess,
  requireProjectAccess,
  getUserAccessibleProjectIds,
  AuthorizationError,
} from "@/lib/server-auth";
import { UserContext } from "@/lib/auth";
import { Role } from "@/lib/permissions";

describe("Priority 1: Enforce API Permissions and Project Access", () => {
  const orgId = "org-test-p1";
  const ownerUserId = "user-owner-p1";
  const managerUserId = "user-mgr-p1";
  const supervisorUserId = "user-sup-p1";
  const engineerUserId = "user-eng-p1";
  const viewerUserId = "user-view-p1";

  let project1Id: string;
  let project2Id: string;

  beforeEach(async () => {
    // Clean up
    await prisma.projectAssignment.deleteMany({ where: { organizationId: orgId } });
    await prisma.task.deleteMany({ where: { organizationId: orgId } });
    await prisma.project.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });

    // Seed organization
    await prisma.organization.create({
      data: {
        id: orgId,
        name: "Priority 1 Test Org",
        status: "ACTIVE",
      },
    });

    // Seed users
    await prisma.user.createMany({
      data: [
        { id: ownerUserId, organizationId: orgId, name: "Owner", email: "owner@p1.test", role: "ORG_ADMIN", passwordHash: "test-hash" },
        { id: managerUserId, organizationId: orgId, name: "Manager", email: "mgr@p1.test", role: "PROJECT_MANAGER", passwordHash: "test-hash" },
        { id: supervisorUserId, organizationId: orgId, name: "Supervisor", email: "sup@p1.test", role: "SUPERVISOR", passwordHash: "test-hash" },
        { id: engineerUserId, organizationId: orgId, name: "Engineer", email: "eng@p1.test", role: "SITE_ENGINEER", passwordHash: "test-hash" },
        { id: viewerUserId, organizationId: orgId, name: "Viewer", email: "view@p1.test", role: "VIEWER", passwordHash: "test-hash" },
      ],
    });

    const site = await prisma.site.create({
      data: {
        organizationId: orgId,
        name: "Test Site Alpha",
        code: "TSA-01",
        address: "123 Construction Rd",
        status: "ACTIVE",
      },
    });

    // Seed projects: Project 1 managed by managerUserId, Project 2 managed by someone else
    const p1 = await prisma.project.create({
      data: {
        organizationId: orgId,
        siteId: site.id,
        name: "Project Alpha",
        code: "PA-101",
        status: "IN_PROGRESS",
        managerUserId: managerUserId,
        budgetAmount: 5000000,
      },
    });
    project1Id = p1.id;

    const p2 = await prisma.project.create({
      data: {
        organizationId: orgId,
        siteId: site.id,
        name: "Project Beta",
        code: "PB-202",
        status: "IN_PROGRESS",
        budgetAmount: 8000000,
      },
    });
    project2Id = p2.id;
  });

  it("1.1 Owner/Admin has organization-wide access to all projects", async () => {
    const ownerCtx: UserContext = {
      userId: ownerUserId,
      email: "owner@p1.test",
      role: "ORG_ADMIN",
      organizationId: orgId,
    };

    expect(isOrgOwnerOrAdmin(ownerCtx)).toBe(true);
    expect(await userHasProjectAccess(ownerCtx, project1Id)).toBe(true);
    expect(await userHasProjectAccess(ownerCtx, project2Id)).toBe(true);

    const accessibleProjects = await getUserAccessibleProjectIds(ownerCtx);
    // null signifies org-wide access without filtering
    expect(accessibleProjects).toBeNull();
  });

  it("1.2 Non-owner without assignment is denied access to unassigned project", async () => {
    const supervisorCtx: UserContext = {
      userId: supervisorUserId,
      email: "sup@p1.test",
      role: "SUPERVISOR",
      organizationId: orgId,
    };

    expect(isOrgOwnerOrAdmin(supervisorCtx)).toBe(false);
    expect(await userHasProjectAccess(supervisorCtx, project1Id)).toBe(false);
    expect(await userHasProjectAccess(supervisorCtx, project2Id)).toBe(false);

    await expect(requireProjectAccess(supervisorCtx, project1Id)).rejects.toThrow(AuthorizationError);
  });

  it("1.3 Project manager automatically accesses project they manage", async () => {
    const mgrCtx: UserContext = {
      userId: managerUserId,
      email: "mgr@p1.test",
      role: "PROJECT_MANAGER",
      organizationId: orgId,
    };

    expect(await userHasProjectAccess(mgrCtx, project1Id)).toBe(true);
    expect(await userHasProjectAccess(mgrCtx, project2Id)).toBe(false);

    const accessible = await getUserAccessibleProjectIds(mgrCtx);
    expect(accessible).toContain(project1Id);
    expect(accessible).not.toContain(project2Id);
  });

  it("1.4 ProjectAssignment grants specific project access and revocation removes it", async () => {
    const supCtx: UserContext = {
      userId: supervisorUserId,
      email: "sup@p1.test",
      role: "SUPERVISOR",
      organizationId: orgId,
    };

    // Initially denied
    expect(await userHasProjectAccess(supCtx, project2Id)).toBe(false);

    // Create assignment
    const assignment = await prisma.projectAssignment.create({
      data: {
        organizationId: orgId,
        projectId: project2Id,
        userId: supervisorUserId,
        role: "SUPERVISOR",
        status: "ACTIVE",
        assignedById: ownerUserId,
      },
    });

    // Now has access to project 2 but still not project 1
    expect(await userHasProjectAccess(supCtx, project2Id)).toBe(true);
    expect(await userHasProjectAccess(supCtx, project1Id)).toBe(false);

    const accessible = await getUserAccessibleProjectIds(supCtx);
    expect(accessible).toEqual([project2Id]);

    // Revoke assignment
    await prisma.projectAssignment.update({
      where: { id: assignment.id },
      data: { status: "REVOKED" },
    });

    // Access is immediately revoked
    expect(await userHasProjectAccess(supCtx, project2Id)).toBe(false);
    const accessibleAfterRevoke = await getUserAccessibleProjectIds(supCtx);
    expect(accessibleAfterRevoke).toEqual([]);
  });

  it("1.5 Financial data permission checks correctly distinguish finance vs non-finance roles", () => {
    const ownerCtx: UserContext = { userId: ownerUserId, email: "o@test.com", role: "ORG_ADMIN", organizationId: orgId };
    const acctCtx: UserContext = { userId: "acct-1", email: "a@test.com", role: "ACCOUNTANT", organizationId: orgId };
    const supCtx: UserContext = { userId: supervisorUserId, email: "s@test.com", role: "SUPERVISOR", organizationId: orgId };
    const engCtx: UserContext = { userId: engineerUserId, email: "e@test.com", role: "SITE_ENGINEER", organizationId: orgId };

    expect(canReadFinance(ownerCtx)).toBe(true);
    expect(canReadFinance(acctCtx)).toBe(true);
    expect(canReadFinance(supCtx)).toBe(false);
    expect(canReadFinance(engCtx)).toBe(false);

    expect(() => requireFinanceRead(ownerCtx)).not.toThrow();
    expect(() => requireFinanceRead(acctCtx)).not.toThrow();
    expect(() => requireFinanceRead(supCtx)).toThrow(AuthorizationError);
    expect(() => requireFinanceRead(engCtx)).toThrow(AuthorizationError);
  });
});
