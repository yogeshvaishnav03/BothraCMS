import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";

describe("Priority 2: Tasks and Employee Accountability", () => {
  let org: any;
  let ownerUser: any;
  let managerUser: any;
  let supervisorUser: any;
  let site: any;
  let project: any;

  beforeAll(async () => {
    // 1. Create or fetch test organization
    org = await prisma.organization.create({
      data: {
        name: `Tasks Org ${Date.now()}`,
        currency: "INR",
      },
    });

    // 2. Create users with different roles
    ownerUser = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: `owner_${Date.now()}@buildtrack.test`,
        name: "Owner / Director",
        role: "ORG_ADMIN",
        passwordHash: "hash_test_123",
      },
    });

    managerUser = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: `manager_${Date.now()}@buildtrack.test`,
        name: "Project Manager",
        role: "PROJECT_MANAGER",
        passwordHash: "hash_test_123",
      },
    });

    supervisorUser = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: `supervisor_${Date.now()}@buildtrack.test`,
        name: "Site Supervisor",
        role: "SITE_ENGINEER",
        passwordHash: "hash_test_123",
      },
    });

    // 3. Create site & project
    site = await prisma.site.create({
      data: {
        organizationId: org.id,
        name: "Skyline Heights",
        code: `SH-${Date.now().toString().slice(-4)}`,
        address: "Plot 42, Skyline Tech Park",
      },
    });

    project = await prisma.project.create({
      data: {
        organizationId: org.id,
        siteId: site.id,
        name: "Tower A Structural Work",
        code: `TA-${Date.now().toString().slice(-4)}`,
        status: "ACTIVE",
        budgetAmount: 10000000,
      },
    });
  });

  it("should create standard tasks and assign to colleagues with assigner tracking", async () => {
    const dueAt = new Date(Date.now() + 86400000 * 3); // 3 days in future

    const task = await prisma.task.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        title: "Tie Column Rebar Level 4",
        description: "Follow structural consultant drawing TA-STR-04",
        priority: "HIGH",
        status: "TODO",
        taskType: "STANDARD",
        createdBy: managerUser.id,
        assigneeUserId: supervisorUser.id,
        dueAt,
      },
      include: {
        creator: true,
        assignee: true,
      },
    });

    expect(task.id).toBeDefined();
    expect(task.title).toBe("Tie Column Rebar Level 4");
    expect(task.taskType).toBe("STANDARD");
    expect(task.createdBy).toBe(managerUser.id);
    expect(task.creator.name).toBe("Project Manager");
    expect(task.assigneeUserId).toBe(supervisorUser.id);
    expect(task.assignee?.name).toBe("Site Supervisor");
    expect(task.status).toBe("TODO");
  });

  it("should allow raising requests specifically directed to Owner, Manager, or Architect", async () => {
    // Site supervisor raises an assistance request to the Owner for cement delivery escalation
    const requestTask = await prisma.task.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        title: "Escalate Cement Supplier Delivery Failure",
        description: "Supplier Shree Cement delayed delivery by 3 days. Need executive intervention.",
        priority: "CRITICAL",
        status: "TODO",
        taskType: "REQUEST_OWNER",
        createdBy: supervisorUser.id,
        assigneeUserId: ownerUser.id,
      },
    });

    expect(requestTask.taskType).toBe("REQUEST_OWNER");
    expect(requestTask.priority).toBe("CRITICAL");
    expect(requestTask.assigneeUserId).toBe(ownerUser.id);
  });

  it("should support personal tasks self-assigned to the logged-in employee", async () => {
    const personalTask = await prisma.task.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        title: "Personal: Re-verify calibration of total station instrument",
        priority: "LOW",
        status: "TODO",
        taskType: "PERSONAL",
        createdBy: supervisorUser.id,
        assigneeUserId: supervisorUser.id,
      },
    });

    expect(personalTask.taskType).toBe("PERSONAL");
    expect(personalTask.assigneeUserId).toBe(supervisorUser.id);
    expect(personalTask.createdBy).toBe(supervisorUser.id);
  });

  it("should record completion and verification timestamps and actors", async () => {
    const task = await prisma.task.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        title: "Cast Footing F12 Concrete",
        priority: "HIGH",
        status: "IN_PROGRESS",
        createdBy: managerUser.id,
        assigneeUserId: supervisorUser.id,
      },
    });

    // 1. Supervisor completes task
    const completedAt = new Date();
    const completedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        status: "COMPLETED",
        completedAt,
        completedById: supervisorUser.id,
      },
      include: { completedBy: true },
    });

    expect(completedTask.status).toBe("COMPLETED");
    expect(completedTask.completedAt).toEqual(completedAt);
    expect(completedTask.completedById).toBe(supervisorUser.id);
    expect(completedTask.completedBy?.name).toBe("Site Supervisor");

    // 2. Project Manager verifies and QA approves task
    const verifiedAt = new Date();
    const verifiedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        status: "VERIFIED",
        verifiedAt,
        verifiedById: managerUser.id,
      },
      include: { verifiedBy: true },
    });

    expect(verifiedTask.status).toBe("VERIFIED");
    expect(verifiedTask.verifiedAt).toEqual(verifiedAt);
    expect(verifiedTask.verifiedById).toBe(managerUser.id);
    expect(verifiedTask.verifiedBy?.name).toBe("Project Manager");
  });

  it("should record discussion comments, follow-up questions, and assistance requests", async () => {
    const task = await prisma.task.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        title: "Electrical Conduit Laying",
        priority: "MEDIUM",
        status: "IN_PROGRESS",
        createdBy: managerUser.id,
      },
    });

    // Add general note comment
    const comment1 = await prisma.taskComment.create({
      data: {
        organizationId: org.id,
        taskId: task.id,
        userId: supervisorUser.id,
        type: "COMMENT",
        content: "Conduits laid on grid lines A through D.",
      },
    });

    // Add assistance request
    const comment2 = await prisma.taskComment.create({
      data: {
        organizationId: org.id,
        taskId: task.id,
        userId: supervisorUser.id,
        type: "ASSISTANCE_REQUEST",
        content: "Need MEP consultant clarification on junction box height.",
      },
    });

    const thread = await prisma.taskComment.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: "asc" },
      include: { user: true },
    });

    expect(thread).toHaveLength(2);
    expect(thread[0].type).toBe("COMMENT");
    expect(thread[1].type).toBe("ASSISTANCE_REQUEST");
    expect(thread[1].content).toContain("Need MEP consultant clarification");
  });

  it("should identify overdue tasks accurately based on dueAt timestamp and completion status", async () => {
    const pastDate = new Date(Date.now() - 86400000 * 2); // 2 days in past

    // Overdue task (status TODO)
    const overdueTask = await prisma.task.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        title: "Overdue Safety Barrier Erection",
        priority: "CRITICAL",
        status: "TODO",
        dueAt: pastDate,
        createdBy: managerUser.id,
        assigneeUserId: supervisorUser.id,
      },
    });

    // Completed task that was due in the past (NOT overdue because it's completed)
    const completedPastTask = await prisma.task.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        title: "Past Due but Finished Excavation",
        priority: "MEDIUM",
        status: "COMPLETED",
        dueAt: pastDate,
        completedAt: new Date(pastDate.getTime() + 3600000),
        createdBy: managerUser.id,
        assigneeUserId: supervisorUser.id,
      },
    });

    const now = new Date();
    const overdueTasks = await prisma.task.findMany({
      where: {
        organizationId: org.id,
        status: { notIn: ["COMPLETED", "VERIFIED"] },
        dueAt: { lt: now },
      },
    });

    const overdueIds = overdueTasks.map((t) => t.id);
    expect(overdueIds).toContain(overdueTask.id);
    expect(overdueIds).not.toContain(completedPastTask.id);
  });
});
