import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/seed/route";
import * as auth from "@/lib/auth";
import * as seedService from "@/services/seed-service";

describe("POST /api/admin/seed (1-Click Demo Data Population)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should reject unauthenticated requests with 401", async () => {
    vi.spyOn(auth, "getUserContext").mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/admin/seed", {
      method: "POST",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
  });

  it("should reject non-SUPER_ADMIN users with 403 Forbidden", async () => {
    vi.spyOn(auth, "getUserContext").mockResolvedValue({
      userId: "usr-admin-1",
      organizationId: "org-1",
      email: "admin@buildtrack.pro",
      name: "Org Admin",
      role: "ORG_ADMIN",
      organizationName: "Test Org",
      currency: "INR",
      timezone: "Asia/Kolkata",
    });

    const req = new NextRequest("http://localhost:3000/api/admin/seed", {
      method: "POST",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error.message).toContain("Super Admin privileges are required");
  });

  it("should allow SUPER_ADMIN to trigger seedDemoData and return summary", async () => {
    vi.spyOn(auth, "getUserContext").mockResolvedValue({
      userId: "usr-super-1",
      organizationId: "org-1",
      email: "superadmin@buildtrack.pro",
      name: "Master Super Admin",
      role: "SUPER_ADMIN",
      organizationName: "Bothra Construction",
      currency: "INR",
      timezone: "Asia/Kolkata",
    });

    const mockSeedResult: seedService.SeedResult = {
      organizationId: "org-1",
      organizationName: "Bothra Construction",
      sitesCreated: 2,
      storesCreated: 2,
      projectsCreated: 2,
      materialsCreated: 5,
      partiesCreated: 4,
      tasksCreated: 4,
      billsCreated: 2,
      paymentsCreated: 2,
      workforceCreated: 5,
      attendanceCreated: 4,
      dailyReportsCreated: 1,
    };

    vi.spyOn(seedService, "seedDemoData").mockResolvedValue(mockSeedResult);

    const req = new NextRequest("http://localhost:3000/api/admin/seed", {
      method: "POST",
      body: JSON.stringify({ organizationId: "org-1" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.summary.sitesCreated).toBe(2);
    expect(json.data.summary.projectsCreated).toBe(2);
    expect(json.data.summary.materialsCreated).toBe(5);
  });
});
