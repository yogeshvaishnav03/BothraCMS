import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { GET as getTasksHandler, POST as createTaskHandler } from "@/app/api/tasks/route";
import { GET as getTaskByIdHandler, PATCH as patchTaskHandler } from "@/app/api/tasks/[id]/route";
import { GET as getCommentsHandler, POST as postCommentHandler } from "@/app/api/tasks/[id]/comments/route";
import { GET as getMembersHandler } from "@/app/api/tasks/[id]/members/route";
import { PATCH as updateStatusHandler } from "@/app/api/tasks/[id]/status/route";
import { DashboardService } from "@/services/dashboard-service";

function makeJsonRequest(url: string, method: string, body?: any, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Cookie"] = `${SESSION_COOKIE_NAME}=${token}`;
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Strict Task Visibility by User Account", () => {
  let org: any;
  let userA: any; // Task creator / assigner
  let userB: any; // Task assignee
  let userC: any; // Unrelated user (neither assigner nor assignee)
  let userD: any; // Co-assignee on multi-assignee task
  let project: any;
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let tokenD: string;

  beforeAll(async () => {
    org = await prisma.organization.create({
      data: {
        name: `Task Visibility Org ${Date.now()}`,
        currency: "INR",
      },
    });

    userA = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: `usera_${Date.now()}@buildtrack.test`,
        name: "User A (Assigner)",
        role: "PROJECT_MANAGER",
        passwordHash: "hash_test_123",
      },
    });

    userB = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: `userb_${Date.now()}@buildtrack.test`,
        name: "User B (Assignee)",
        role: "SITE_SUPERVISOR",
        passwordHash: "hash_test_123",
      },
    });

    userC = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: `userc_${Date.now()}@buildtrack.test`,
        name: "User C (Unrelated)",
        role: "ORG_ADMIN",
        passwordHash: "hash_test_123",
      },
    });

    userD = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: `userd_${Date.now()}@buildtrack.test`,
        name: "User D (Co-Assignee)",
        role: "SITE_SUPERVISOR",
        passwordHash: "hash_test_123",
      },
    });

    const site = await prisma.site.create({
      data: {
        organizationId: org.id,
        name: "Visibility Test Site",
        code: `VTS-${Date.now().toString().slice(-4)}`,
        address: "Site Road",
      },
    });

    project = await prisma.project.create({
      data: {
        organizationId: org.id,
        siteId: site.id,
        managerUserId: userA.id,
        name: "Visibility Test Project",
        code: `PRJ-${Date.now().toString().slice(-4)}`,
        status: "ACTIVE",
      },
    });

    tokenA = await createSessionToken({
      userId: userA.id,
      email: userA.email,
      name: userA.name,
      role: userA.role,
      organizationId: org.id,
      permissions: ["tasks:read", "tasks:write", "projects:read"],
    });

    tokenB = await createSessionToken({
      userId: userB.id,
      email: userB.email,
      name: userB.name,
      role: userB.role,
      organizationId: org.id,
      permissions: ["tasks:read", "tasks:write", "projects:read"],
    });

    tokenC = await createSessionToken({
      userId: userC.id,
      email: userC.email,
      name: userC.name,
      role: userC.role,
      organizationId: org.id,
      permissions: ["tasks:read", "tasks:write", "projects:read"],
    });

    tokenD = await createSessionToken({
      userId: userD.id,
      email: userD.email,
      name: userD.name,
      role: userD.role,
      organizationId: org.id,
      permissions: ["tasks:read", "tasks:write", "projects:read"],
    });
  });

  it("1. Single assignee task is only visible in GET /api/tasks to assigner and assignee", async () => {
    // User A creates a task assigned to User B
    const createReq = makeJsonRequest(
      "/api/tasks",
      "POST",
      {
        projectId: project.id,
        title: "Install Electrical Conduits",
        description: "Install conduits on 2nd floor",
        priority: "HIGH",
        assigneeUserId: userB.id,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      },
      tokenA
    );
    const createRes = await createTaskHandler(createReq);
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const taskId = created.data.id;

    // User A (creator) calls GET /api/tasks -> can see the task
    const resA = await getTasksHandler(makeJsonRequest("/api/tasks", "GET", undefined, tokenA));
    expect(resA.status).toBe(200);
    const listA = (await resA.json()).data;
    expect(listA.some((t: any) => t.id === taskId)).toBe(true);

    // User B (assignee) calls GET /api/tasks -> can see the task
    const resB = await getTasksHandler(makeJsonRequest("/api/tasks", "GET", undefined, tokenB));
    expect(resB.status).toBe(200);
    const listB = (await resB.json()).data;
    expect(listB.some((t: any) => t.id === taskId)).toBe(true);

    // User C (unrelated third party) calls GET /api/tasks -> CANNOT see the task
    const resC = await getTasksHandler(makeJsonRequest("/api/tasks", "GET", undefined, tokenC));
    expect(resC.status).toBe(200);
    const listC = (await resC.json()).data;
    expect(listC.some((t: any) => t.id === taskId)).toBe(false);
  });

  it("2. Single assignee task is forbidden (403) in GET /api/tasks/[id] to unrelated user", async () => {
    const task = await prisma.task.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        title: "Pour Concrete Slab 3",
        priority: "CRITICAL",
        createdBy: userA.id,
        assigneeUserId: userB.id,
      },
    });

    // User A (creator) -> 200 OK
    const resA = await getTaskByIdHandler(
      makeJsonRequest(`/api/tasks/${task.id}`, "GET", undefined, tokenA),
      { params: { id: task.id } }
    );
    expect(resA.status).toBe(200);

    // User B (assignee) -> 200 OK
    const resB = await getTaskByIdHandler(
      makeJsonRequest(`/api/tasks/${task.id}`, "GET", undefined, tokenB),
      { params: { id: task.id } }
    );
    expect(resB.status).toBe(200);

    // User C (unrelated) -> 403 Forbidden
    const resC = await getTaskByIdHandler(
      makeJsonRequest(`/api/tasks/${task.id}`, "GET", undefined, tokenC),
      { params: { id: task.id } }
    );
    expect(resC.status).toBe(403);
    const err = await resC.json();
    expect(JSON.stringify(err)).toMatch(/Forbidden/i);
  });

  it("3. Multi-assignee sibling tasks allow sibling assignees but block unrelated users", async () => {
    // User A assigns task to User B and User D
    const createReq = makeJsonRequest(
      "/api/tasks",
      "POST",
      {
        projectId: project.id,
        title: "Erect Scaffolding Block A",
        priority: "HIGH",
        assigneeUserIds: [userB.id, userD.id],
      },
      tokenA
    );
    const createRes = await createTaskHandler(createReq);
    expect(createRes.status).toBe(201);
    const body = await createRes.json();
    const tasks = body.data.tasks;
    expect(tasks.length).toBe(2);

    const taskForB = tasks.find((t: any) => t.assigneeUserId === userB.id);
    const taskForD = tasks.find((t: any) => t.assigneeUserId === userD.id);

    // User B can access taskForD as a sibling assignee
    const resBviewD = await getTaskByIdHandler(
      makeJsonRequest(`/api/tasks/${taskForD.id}`, "GET", undefined, tokenB),
      { params: { id: taskForD.id } }
    );
    expect(resBviewD.status).toBe(200);

    // User C cannot access either
    const resCviewB = await getTaskByIdHandler(
      makeJsonRequest(`/api/tasks/${taskForB.id}`, "GET", undefined, tokenC),
      { params: { id: taskForB.id } }
    );
    expect(resCviewB.status).toBe(403);

    const resCviewD = await getTaskByIdHandler(
      makeJsonRequest(`/api/tasks/${taskForD.id}`, "GET", undefined, tokenC),
      { params: { id: taskForD.id } }
    );
    expect(resCviewD.status).toBe(403);
  });

  it("4. Task endpoints (PATCH, comments, members, status) block unrelated users", async () => {
    const task = await prisma.task.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        title: "Test Security Sub-endpoints",
        priority: "MEDIUM",
        createdBy: userA.id,
        assigneeUserId: userB.id,
      },
    });

    // PATCH /api/tasks/[id]
    const patchRes = await patchTaskHandler(
      makeJsonRequest(
        `/api/tasks/${task.id}`,
        "PATCH",
        { title: "Hacked Title", reason: "Attempted edit" },
        tokenC
      ),
      { params: { id: task.id } }
    );
    expect(patchRes.status).toBe(403);

    // GET /api/tasks/[id]/comments
    const getCommentsRes = await getCommentsHandler(
      makeJsonRequest(`/api/tasks/${task.id}/comments`, "GET", undefined, tokenC),
      { params: { id: task.id } }
    );
    expect(getCommentsRes.status).toBe(403);

    // POST /api/tasks/[id]/comments
    const postCommentsRes = await postCommentHandler(
      makeJsonRequest(`/api/tasks/${task.id}/comments`, "POST", { content: "Unrelated comment" }, tokenC),
      { params: { id: task.id } }
    );
    expect(postCommentsRes.status).toBe(403);

    // GET /api/tasks/[id]/members
    const getMembersRes = await getMembersHandler(
      makeJsonRequest(`/api/tasks/${task.id}/members`, "GET", undefined, tokenC),
      { params: { id: task.id } }
    );
    expect(getMembersRes.status).toBe(403);

    // PATCH /api/tasks/[id]/status
    const updateStatusRes = await updateStatusHandler(
      makeJsonRequest(`/api/tasks/${task.id}/status`, "PATCH", { status: "COMPLETED" }, tokenC),
      { params: { id: task.id } }
    );
    expect(updateStatusRes.status).toBe(403);
  });

  it("5. Dashboard KPI metrics strictly filter tasks by current user account", async () => {
    const now = new Date();
    // Overdue task assigned to User B, created by User A
    const overdueTask = await prisma.task.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        title: "Overdue Painting Work",
        priority: "HIGH",
        status: "TODO",
        dueAt: new Date(now.getTime() - 86400000), // yesterday
        createdBy: userA.id,
        assigneeUserId: userB.id,
      },
    });

    // User A context (assigner) -> should count the overdue task
    const metricsA = await DashboardService.getKpiMetrics(org.id, undefined, {
      userId: userA.id,
      organizationId: org.id,
      email: userA.email,
      name: userA.name,
      role: userA.role,
      permissions: [],
    });
    expect(metricsA.tasksOverdueCount).toBeGreaterThanOrEqual(1);
    expect(metricsA.tasksOverdue.some((t: any) => t.id === overdueTask.id)).toBe(true);

    // User B context (assignee) -> should count the overdue task
    const metricsB = await DashboardService.getKpiMetrics(org.id, undefined, {
      userId: userB.id,
      organizationId: org.id,
      email: userB.email,
      name: userB.name,
      role: userB.role,
      permissions: [],
    });
    expect(metricsB.tasksOverdueCount).toBeGreaterThanOrEqual(1);
    expect(metricsB.tasksOverdue.some((t: any) => t.id === overdueTask.id)).toBe(true);

    // User C context (unrelated user) -> should NOT see this overdue task
    const metricsC = await DashboardService.getKpiMetrics(org.id, undefined, {
      userId: userC.id,
      organizationId: org.id,
      email: userC.email,
      name: userC.name,
      role: userC.role,
      permissions: [],
    });
    expect(metricsC.tasksOverdue.some((t: any) => t.id === overdueTask.id)).toBe(false);
  });
});
