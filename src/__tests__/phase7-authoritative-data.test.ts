import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clientCache, clearLegacyBusinessLocalStorage } from "../lib/client-cache";
import { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, createSessionToken } from "../lib/auth";
import { prisma } from "../lib/db";

// API route handlers
import { GET as getProjectsHandler } from "../app/api/projects/route";
import { DELETE as deleteProjectHandler } from "../app/api/projects/[id]/route";
import { DELETE as deleteTaskHandler } from "../app/api/tasks/route";
import { DELETE as deleteMaterialHandler } from "../app/api/materials/route";
import { GET as getSitesHandler } from "../app/api/sites/route";
import { POST as loginHandler } from "../app/api/auth/login/route";

function makeJsonRequest(
  url: string,
  method: string,
  body?: any,
  token?: string,
  extraHeaders?: Record<string, string>
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (token) {
    headers["Cookie"] = `${SESSION_COOKIE_NAME}=${token}`;
  }
  const init: any = { method, headers };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), init);
}

describe("Build Track Pro — Phase 7 Authoritative Data & Multi-Tenant Integrity Test Suite", () => {
  describe("1. Client Cache Neutralization & Pure Passthrough", () => {
    let mockStorage: Record<string, string> = {};

    beforeEach(() => {
      mockStorage = {};
      // Mock global window and localStorage
      (global as any).window = {};
      (global as any).localStorage = {
        getItem: vi.fn((key: string) => mockStorage[key] || null),
        setItem: vi.fn((key: string, val: string) => {
          mockStorage[key] = val;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
        clear: vi.fn(() => {
          mockStorage = {};
        }),
      };
    });

    afterEach(() => {
      delete (global as any).window;
      delete (global as any).localStorage;
    });

    it("should never merge local storage business records with server projects", () => {
      const serverProjects = [{ id: "srv-p1", name: "Server Project 1" }];
      mockStorage["bothra_cms_projects"] = JSON.stringify([{ id: "fake-1", name: "Fake Local" }]);

      const result = clientCache.mergeProjects(serverProjects);
      expect(result).toEqual(serverProjects);
      expect(result.find((p) => p.id === "fake-1")).toBeUndefined();
    });

    it("should return empty arrays for legacy cache getters instead of reading mock data", () => {
      mockStorage["bothra_cms_sites"] = JSON.stringify([{ id: "fake-site" }]);
      mockStorage["bothra_cms_bills"] = JSON.stringify([{ id: "fake-bill" }]);
      mockStorage["bothra_cms_attendance"] = JSON.stringify([{ id: "fake-att" }]);

      expect(clientCache.getSites()).toEqual([]);
      expect(clientCache.getBills()).toEqual([]);
      expect(clientCache.getAttendance()).toEqual([]);
      expect(clientCache.getPayments()).toEqual([]);
    });

    it("should compute KPIs strictly from authoritative server responses", () => {
      const serverKpis = {
        activeProjectsCount: 5,
        tasksDueTodayCount: 3,
        tasksOverdueCount: 1,
        workersPresentTodayCount: 42,
        lowStockItemsCount: 4,
        paymentsMadeTodayAmount: 150000,
        totalOutstandingPayablesAmount: 650000,
      };

      const computed = clientCache.calculateKpis(serverKpis);
      expect(computed).toEqual(serverKpis);

      // When server returns undefined or empty, returns zero rather than synthetic numbers
      const emptyKpis = clientCache.calculateKpis(undefined);
      expect(emptyKpis.activeProjectsCount).toBe(0);
      expect(emptyKpis.workersPresentTodayCount).toBe(0);
      expect(emptyKpis.totalOutstandingPayablesAmount).toBe(0);
    });

    it("should immediately purge all legacy business keys from localStorage", () => {
      mockStorage["bothra_cms_projects"] = "[]";
      mockStorage["bothra_cms_materials"] = "[]";
      mockStorage["bothra_org_name"] = "Bothra Demo";
      mockStorage["harmless_user_theme"] = "dark";

      clearLegacyBusinessLocalStorage();

      expect(mockStorage["bothra_cms_projects"]).toBeUndefined();
      expect(mockStorage["bothra_cms_materials"]).toBeUndefined();
      expect(mockStorage["bothra_org_name"]).toBeUndefined();
      // Harmless preferences are preserved
      expect(mockStorage["harmless_user_theme"]).toBe("dark");
    });
  });

  describe("2. Error Transparency & Elimination of Silent Fallbacks", () => {
    it("should return 500/503 error on database failure and NEVER return mock sites", async () => {
      const token = await createSessionToken({
        userId: "test-user-1",
        organizationId: "test-org-1",
        email: "test@example.com",
        name: "Test User",
        role: "ORG_ADMIN",
      });

      // Spy on prisma.site.findMany and simulate database connection failure
      const findManySpy = vi.spyOn(prisma.site, "findMany").mockRejectedValueOnce(
        new Error("Connection to database timed out")
      );

      const req = makeJsonRequest("http://localhost:3000/api/sites", "GET", null, token);
      const res = await getSitesHandler(req);
      const data = await res.json();

      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.data).toBeUndefined(); // Must NOT return fallback fake sites

      findManySpy.mockRestore();
    });

    it("should return error on database failure for projects and NEVER return dynamicStore fallback", async () => {
      const token = await createSessionToken({
        userId: "test-user-2",
        organizationId: "test-org-2",
        email: "test2@example.com",
        name: "Test User 2",
        role: "ORG_ADMIN",
      });

      const findManySpy = vi.spyOn(prisma.project, "findMany").mockRejectedValueOnce(
        new Error("Postgres database unavailable")
      );

      const req = makeJsonRequest("http://localhost:3000/api/projects", "GET", null, token);
      const res = await getProjectsHandler(req);
      const data = await res.json();

      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();

      findManySpy.mockRestore();
    });

    it("should return 503 Service Unavailable on login when database is unreachable", async () => {
      const findUniqueSpy = vi.spyOn(prisma.user, "findUnique").mockRejectedValueOnce(
        new Error("Database connection lost")
      );

      const req = makeJsonRequest("http://localhost:3000/api/auth/login", "POST", {
        email: "admin@buildtrack.pro",
        password: "Password123!",
      });

      const res = await loginHandler(req);
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Database service unavailable");

      findUniqueSpy.mockRestore();
    });
  });

  describe("3. Multi-Tenant Scoping & Cross-Tenant Deletion Rejection", () => {
    it("should prevent Tenant B from deleting Tenant A project", async () => {
      const tenantBToken = await createSessionToken({
        userId: "user-tenant-b",
        organizationId: "tenant-b-id",
        email: "user@tenant-b.com",
        name: "Tenant B Admin",
        role: "ORG_ADMIN",
      });

      // Tenant A project exists in DB, but has organizationId = "tenant-a-id"
      const findFirstSpy = vi.spyOn(prisma.project, "findFirst").mockResolvedValueOnce(null);

      const req = makeJsonRequest(
        "http://localhost:3000/api/projects/tenant-a-project-id",
        "DELETE",
        null,
        tenantBToken
      );

      const res = await deleteProjectHandler(req, {
        params: { id: "tenant-a-project-id" },
      });
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Project not found");

      findFirstSpy.mockRestore();
    });

    it("should prevent Tenant B from deleting Tenant A material", async () => {
      const tenantBToken = await createSessionToken({
        userId: "user-tenant-b",
        organizationId: "tenant-b-id",
        email: "user@tenant-b.com",
        name: "Tenant B Admin",
        role: "ORG_ADMIN",
      });

      const findFirstSpy = vi.spyOn(prisma.material, "findFirst").mockResolvedValueOnce(null);

      const req = makeJsonRequest(
        "http://localhost:3000/api/materials?id=tenant-a-material-id",
        "DELETE",
        null,
        tenantBToken
      );

      const res = await deleteMaterialHandler(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);

      findFirstSpy.mockRestore();
    });

    it("should prevent Tenant B from deleting Tenant A task", async () => {
      const tenantBToken = await createSessionToken({
        userId: "user-tenant-b",
        organizationId: "tenant-b-id",
        email: "user@tenant-b.com",
        name: "Tenant B Admin",
        role: "ORG_ADMIN",
      });

      const findFirstSpy = vi.spyOn(prisma.task, "findFirst").mockResolvedValueOnce(null);

      const req = makeJsonRequest(
        "http://localhost:3000/api/tasks?id=tenant-a-task-id",
        "DELETE",
        null,
        tenantBToken
      );

      const res = await deleteTaskHandler(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);

      findFirstSpy.mockRestore();
    });
  });
});
