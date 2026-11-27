import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { POST as createTaskHandler } from "@/app/api/tasks/route";

function makeJsonRequest(url: string, method: string, body?: any, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Cookie"] = `${SESSION_COOKIE_NAME}=${token}`;
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Batch Task Creation with Individual Titles and Descriptions", () => {
  let org: any;
  let user: any;
  let project: any;
  let site: any;

  beforeAll(async () => {
    org = await prisma.organization.create({
      data: {
        name: `Batch Tasks Org ${Date.now()}`,
        currency: "INR",
      },
    });

    user = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: `batch_user_${Date.now()}@buildtrack.test`,
        name: "Batch Task Manager",
        role: "ORG_ADMIN",
        passwordHash: "hash_test_123",
      },
    });

    site = await prisma.site.create({
      data: {
        organizationId: org.id,
        name: `Site Batch ${Date.now()}`,
        code: `SB-${Date.now().toString().slice(-4)}`,
        address: "Test Site Address, Jodhpur",
      },
    });

    project = await prisma.project.create({
      data: {
        organizationId: org.id,
        siteId: site.id,
        name: `Project Batch ${Date.now()}`,
        code: `PB-${Date.now().toString().slice(-4)}`,
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.task.deleteMany({ where: { organizationId: org?.id } });
      await prisma.project.deleteMany({ where: { organizationId: org?.id } });
      await prisma.site.deleteMany({ where: { organizationId: org?.id } });
      await prisma.user.deleteMany({ where: { organizationId: org?.id } });
      await prisma.organization.deleteMany({ where: { id: org?.id } });
    } catch {
      // ignore cleanup errors
    }
  });

  it("creates multiple tasks in batch where each task receives its own specific description", async () => {
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: org.id,
    });

    const batchTasks = [
      {
        title: "Tie rebar on 6th floor columns",
        description: "Use 16mm Fe500 TMT bars with 4-inch spacing according to structural sheet S-04.",
      },
      {
        title: "Submit electrical conduit drawings",
        description: "Coordinate with MEP consultant for DB panel routing on 2nd and 3rd floors.",
      },
      {
        title: "Pour C30 concrete for basement ramp",
        description: "Admixture added for rapid hardening, slump test required before pouring.",
      },
    ];

    const createdTasks: any[] = [];

    for (const item of batchTasks) {
      const req = makeJsonRequest("http://localhost:3000/api/tasks", "POST", {
        projectId: project.id,
        title: item.title,
        description: item.description,
        priority: "HIGH",
      }, token);

      const res = await createTaskHandler(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.title).toBe(item.title);
      expect(data.data.description).toBe(item.description);
      createdTasks.push(data.data);
    }

    expect(createdTasks.length).toBe(3);
    expect(createdTasks[0].title).toBe("Tie rebar on 6th floor columns");
    expect(createdTasks[0].description).toBe("Use 16mm Fe500 TMT bars with 4-inch spacing according to structural sheet S-04.");
    expect(createdTasks[1].title).toBe("Submit electrical conduit drawings");
    expect(createdTasks[1].description).toBe("Coordinate with MEP consultant for DB panel routing on 2nd and 3rd floors.");
    expect(createdTasks[2].title).toBe("Pour C30 concrete for basement ramp");
    expect(createdTasks[2].description).toBe("Admixture added for rapid hardening, slump test required before pouring.");
  });
});
