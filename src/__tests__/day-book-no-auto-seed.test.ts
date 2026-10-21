import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/day-book/route";
import * as auth from "@/lib/auth";
import { DayBookSeedService } from "@/services/day-book-seed-service";

function mockUser(role: string) {
  vi.spyOn(auth, "getUserContext").mockResolvedValue({
    userId: "usr-daybook-test",
    organizationId: `org-daybook-empty-${Date.now()}`,
    email: "daybook@test.local",
    name: "Day Book Tester",
    role: role as any,
    organizationName: "Empty Org",
    currency: "INR",
    timezone: "Asia/Kolkata",
  });
}

describe("Day Book never seeds demo data implicitly", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("GET on a date with no activity returns empty data without seeding", async () => {
    mockUser("ORG_ADMIN");
    const seedSpy = vi.spyOn(DayBookSeedService, "seedDemoDataForOrg");

    const res = await GET(new NextRequest("http://localhost:3000/api/day-book?date=2001-01-01"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.payments).toEqual([]);
    expect(json.data.bills).toEqual([]);
    expect(json.data.summary.paymentsCount).toBe(0);
    expect(seedSpy).not.toHaveBeenCalled();
  });

  it("POST (manual demo seed) is refused for non-SUPER_ADMIN roles", async () => {
    mockUser("ORG_ADMIN");
    const seedSpy = vi.spyOn(DayBookSeedService, "seedDemoDataForOrg");

    const res = await POST(
      new NextRequest("http://localhost:3000/api/day-book", {
        method: "POST",
        body: JSON.stringify({ date: "2001-01-01" }),
      })
    );

    expect(res.status).toBe(403);
    expect(seedSpy).not.toHaveBeenCalled();
  });

  it("POST is refused in production for SUPER_ADMIN unless ALLOW_DEMO_SEED=true", async () => {
    mockUser("SUPER_ADMIN");
    const seedSpy = vi.spyOn(DayBookSeedService, "seedDemoDataForOrg");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEMO_SEED", "false");

    const res = await POST(
      new NextRequest("http://localhost:3000/api/day-book", {
        method: "POST",
        body: JSON.stringify({ date: "2001-01-01" }),
      })
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe("DEMO_SEED_DISABLED");
    expect(seedSpy).not.toHaveBeenCalled();
  });
});
