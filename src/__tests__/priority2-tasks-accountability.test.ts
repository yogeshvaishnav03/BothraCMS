import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { POST as createTaskHandler } from "@/app/api/tasks/route";
import { GET as getProjectsHandler } from "@/app/api/projects/route";

function makeJsonRequest(url: string, method: string, body?: any, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Cookie"] = `${SESSION_COOKIE_NAME}=${token}`;
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

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
        role: "SITE_SUPERVISOR",
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

  it("should create tasks with projectId: 'OTHER' and resolve to General Site Operations", async () => {
    const token = await createSessionToken({
      userId: ownerUser.id,
      email: ownerUser.email,
      role: ownerUser.role,
      organizationId: org.id,
    });

    const req = makeJsonRequest("http://localhost:3000/api/tasks", "POST", {
      projectId: "OTHER",
      title: "General Maintenance of Generator",
      priority: "HIGH",
      taskType: "STANDARD",
    }, token);

    const res = await createTaskHandler(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.title).toBe("General Maintenance of Generator");
    expect(data.data.project).toBeDefined();
    expect(data.data.project.name).toBe("General Site Operations");
  });

  it("should support personal task creation with omitted or empty projectId", async () => {
    const token = await createSessionToken({
      userId: supervisorUser.id,
      email: supervisorUser.email,
      role: supervisorUser.role,
      organizationId: org.id,
    });

    const req = makeJsonRequest("http://localhost:3000/api/tasks", "POST", {
      projectId: "",
      title: "My Personal Daily Site Inspection Checklist",
      priority: "LOW",
      taskType: "PERSONAL",
    }, token);

    const res = await createTaskHandler(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.assigneeUserId).toBe(supervisorUser.id);
    expect(data.data.project.name).toBe("General Site Operations");
  });

  it("should auto-provision General Site Operations project for an organization with 0 projects on GET api/projects", async () => {
    const zeroOrg = await prisma.organization.create({
      data: { name: `Zero Org ${Date.now()}`, currency: "INR" },
    });
    const zeroUser = await prisma.user.create({
      data: {
        organizationId: zeroOrg.id,
        email: `zero_${Date.now()}@test.com`,
        name: "Zero Admin",
        role: "ORG_ADMIN",
        passwordHash: "hash",
      },
    });
    const token = await createSessionToken({
      userId: zeroUser.id,
      email: zeroUser.email,
      role: zeroUser.role,
      organizationId: zeroOrg.id,
    });

    const req = makeJsonRequest("http://localhost:3000/api/projects", "GET", undefined, token);
    const res = await getProjectsHandler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.length).toBeGreaterThanOrEqual(1);
    expect(data.data[0].name).toBe("General Site Operations");
  });

  it("should allow ACCOUNTANT to create tasks, personal tasks, and raise requests without permission errors", async () => {
    const acctUser = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: `accountant_${Date.now()}@buildtrack.test`,
        name: "Pooja Sharma",
        role: "ACCOUNTANT",
        passwordHash: "hash_test_123",
      },
    });

    const token = await createSessionToken({
      userId: acctUser.id,
      email: acctUser.email,
      role: acctUser.role,
      organizationId: org.id,
    });

    // Assign accountant to project
    await prisma.projectAssignment.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        userId: acctUser.id,
        role: "ACCOUNTANT",
        status: "ACTIVE",
        assignedById: ownerUser.id,
      },
    });

    // 1. Accountant creates a standard task for vendor bills
    const req1 = makeJsonRequest("http://localhost:3000/api/tasks", "POST", {
      projectId: project.id,
      title: "Collect GST challans from cement vendor",
      priority: "HIGH",
      taskType: "STANDARD",
      assigneeUserId: supervisorUser.id,
    }, token);

    const res1 = await createTaskHandler(req1);
    const data1 = await res1.json();

    expect(res1.status).toBe(201);
    expect(data1.success).toBe(true);
    expect(data1.data.title).toBe("Collect GST challans from cement vendor");

    // 2. Accountant raises request for Owner
    const req2 = makeJsonRequest("http://localhost:3000/api/tasks", "POST", {
      projectId: "OTHER",
      title: "Urgent RTGS payment approval for steel supplier",
      priority: "CRITICAL",
      taskType: "REQUEST_OWNER",
      assigneeUserId: ownerUser.id,
    }, token);

    const res2 = await createTaskHandler(req2);
    const data2 = await res2.json();

    expect(res2.status).toBe(201);
    expect(data2.success).toBe(true);
    expect(data2.data.taskType).toBe("REQUEST_OWNER");
  });
});

