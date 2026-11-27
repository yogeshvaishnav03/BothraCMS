import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { AttendanceService } from "@/services/attendance-service";
import { StaffAttendanceService } from "@/services/staff-attendance-service";
import { istDateKey } from "@/lib/ist-date";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { GET as getAttendanceHistoryHandler } from "@/app/api/attendance/history/route";

function makeJsonRequest(url: string, method: string, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Cookie"] = `${SESSION_COOKIE_NAME}=${token}`;
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers,
  });
}

describe("Attendance Half-Day and Absent Rules", () => {
  let testOrg: any;
  let testUser: any;
  let testSite: any;
  let testWorker: any;

  beforeEach(async () => {
    testOrg = await prisma.organization.create({
      data: {
        name: `Test Org ${Date.now()}`,
      },
    });

    testUser = await prisma.user.create({
      data: {
        organizationId: testOrg.id,
        name: "Test Staff User",
        email: `staff-${Date.now()}@test.com`,
        passwordHash: "hash123",
        role: "SITE_ENGINEER",
        status: "ACTIVE",
      },
    });

    testSite = await prisma.site.create({
      data: {
        organizationId: testOrg.id,
        name: "Test Site A",
        code: `SITE-${Date.now().toString().slice(-4)}`,
        address: "123 Test Site Road",
        status: "ACTIVE",
      },
    });

    testWorker = await prisma.workforceMember.create({
      data: {
        organizationId: testOrg.id,
        name: "Test Staff User",
        employeeCode: `USR-${testUser.id.slice(-6).toUpperCase()}`,
        workerType: "STAFF",
        active: true,
      },
    });
  });

  afterEach(async () => {
    if (testOrg?.id) {
      await prisma.attendanceSession.deleteMany({ where: { organizationId: testOrg.id } });
      await prisma.staffAttendance.deleteMany({ where: { organizationId: testOrg.id } });
      await prisma.workforceMember.deleteMany({ where: { organizationId: testOrg.id } });
      await prisma.user.deleteMany({ where: { organizationId: testOrg.id } });
      await prisma.site.deleteMany({ where: { organizationId: testOrg.id } });
      await prisma.organization.delete({ where: { id: testOrg.id } });
    }
  });

  it("Rule 3A: Check-out in less than 3 hours results in ABSENT status", async () => {
    const todayStr = istDateKey(new Date());
    // Checked in 2 hours ago
    const checkInTime = new Date(Date.now() - 2 * 3600 * 1000);

    const session = await prisma.attendanceSession.create({
      data: {
        organizationId: testOrg.id,
        workforceMemberId: testWorker.id,
        siteId: testSite.id,
        workDate: todayStr,
        checkInAt: checkInTime,
        status: "PRESENT",
        createdBy: testUser.id,
      },
    });

    const checkedOut = await AttendanceService.checkOut({
      organizationId: testOrg.id,
      sessionId: session.id,
      userId: testUser.id,
      role: "SITE_ENGINEER",
      permissions: ["attendance:record"],
    });

    expect(checkedOut.status).toBe("ABSENT");
  });

  it("Rule 3B: Check-out after 3 hours (3h to 7h) results in HALF_DAY status", async () => {
    const todayStr = istDateKey(new Date());
    // Checked in 4.5 hours ago (after 3 hours of check in)
    const checkInTime = new Date(Date.now() - 4.5 * 3600 * 1000);

    const session = await prisma.attendanceSession.create({
      data: {
        organizationId: testOrg.id,
        workforceMemberId: testWorker.id,
        siteId: testSite.id,
        workDate: todayStr,
        checkInAt: checkInTime,
        status: "PRESENT",
        createdBy: testUser.id,
      },
    });

    const checkedOut = await AttendanceService.checkOut({
      organizationId: testOrg.id,
      sessionId: session.id,
      userId: testUser.id,
      role: "SITE_ENGINEER",
      permissions: ["attendance:record"],
    });

    expect(checkedOut.status).toBe("HALF_DAY");
  });

  it("Rule 3C: Check-out after full shift (>= 7 hours) results in PRESENT status", async () => {
    const todayStr = istDateKey(new Date());
    // Checked in 8 hours ago
    const checkInTime = new Date(Date.now() - 8 * 3600 * 1000);

    const session = await prisma.attendanceSession.create({
      data: {
        organizationId: testOrg.id,
        workforceMemberId: testWorker.id,
        siteId: testSite.id,
        workDate: todayStr,
        checkInAt: checkInTime,
        status: "PRESENT",
        createdBy: testUser.id,
      },
    });

    const checkedOut = await AttendanceService.checkOut({
      organizationId: testOrg.id,
      sessionId: session.id,
      userId: testUser.id,
      role: "SITE_ENGINEER",
      permissions: ["attendance:record"],
    });

    expect(checkedOut.status).toBe("PRESENT");
  });

  it("Rule 2: Forgotten check-out on a past date is resolved to HALF_DAY", async () => {
    // Past date (yesterday)
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const session = await prisma.attendanceSession.create({
      data: {
        organizationId: testOrg.id,
        workforceMemberId: testWorker.id,
        siteId: testSite.id,
        workDate: yesterdayStr,
        checkInAt: new Date(`${yesterdayStr}T09:00:00.000Z`),
        checkOutAt: null, // Forgot to check out
        status: "PRESENT",
        createdBy: testUser.id,
      },
    });

    const pastDaily = await AttendanceService.getDailyAttendance(
      testOrg.id,
      testSite.id,
      yesterdayStr
    );

    const found = pastDaily.find((s) => s.id === session.id);
    expect(found).toBeDefined();
    expect(found?.status).toBe("HALF_DAY");

    // Also verify updated in database
    const dbRecord = await prisma.attendanceSession.findUnique({
      where: { id: session.id },
    });
    expect(dbRecord?.status).toBe("HALF_DAY");
  });

  it("Rule 3D: StaffAttendanceService checkOut properly applies 3h threshold", async () => {
    const workDate = istDateKey(new Date());
    const fourHoursAgo = new Date(Date.now() - 4 * 3600 * 1000);

    await prisma.staffAttendance.create({
      data: {
        organizationId: testOrg.id,
        userId: testUser.id,
        workDate,
        checkInAt: fourHoursAgo,
        status: "PRESENT",
      },
    });

    const updated = await StaffAttendanceService.checkOut(
      testOrg.id,
      testUser.id,
      {},
      new Date()
    );

    expect(updated.status).toBe("HALF_DAY");
  });

  it("Rule 1 & API: Active user who has NOT checked in today is marked ABSENT in history API", async () => {
    // Admin user to query scope=all
    const adminUser = await prisma.user.create({
      data: {
        organizationId: testOrg.id,
        name: "Admin Boss",
        email: `admin-${Date.now()}@test.com`,
        passwordHash: "hash123",
        role: "ORG_ADMIN",
        status: "ACTIVE",
      },
    });

    const token = await createSessionToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      organizationId: testOrg.id,
      permissions: ["attendance:view_all"],
    });

    const req = makeJsonRequest("/api/attendance/history?scope=all", "GET", token);
    const res = await getAttendanceHistoryHandler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    // testUser has not checked in today, so there should be an absent session for testUser
    const userAbsentSession = data.data.sessions.find(
      (s: any) => s.employeeName === testUser.name && s.isToday
    );
    expect(userAbsentSession).toBeDefined();
    expect(userAbsentSession?.status).toBe("ABSENT");
    expect(userAbsentSession?.isNotCheckedIn).toBe(true);
  });

  it("Metrics: totalDaysPresent weights full day as 1.0, half day as 0.5, and absent as 0", async () => {
    const adminUser = await prisma.user.create({
      data: {
        organizationId: testOrg.id,
        name: "Admin Boss 2",
        email: `admin2-${Date.now()}@test.com`,
        passwordHash: "hash123",
        role: "ORG_ADMIN",
        status: "ACTIVE",
      },
    });

    // Create 1 full day session on past date 1
    const past1 = "2026-11-01";
    await prisma.attendanceSession.create({
      data: {
        organizationId: testOrg.id,
        workforceMemberId: testWorker.id,
        siteId: testSite.id,
        workDate: past1,
        checkInAt: new Date(`${past1}T09:00:00.000Z`),
        checkOutAt: new Date(`${past1}T17:00:00.000Z`), // 8 hours -> PRESENT
        status: "PRESENT",
        createdBy: testUser.id,
      },
    });

    // Create 1 half day session on past date 2 (4 hours)
    const past2 = "2026-11-02";
    await prisma.attendanceSession.create({
      data: {
        organizationId: testOrg.id,
        workforceMemberId: testWorker.id,
        siteId: testSite.id,
        workDate: past2,
        checkInAt: new Date(`${past2}T09:00:00.000Z`),
        checkOutAt: new Date(`${past2}T13:30:00.000Z`), // 4.5 hours -> HALF_DAY
        status: "HALF_DAY",
        createdBy: testUser.id,
      },
    });

    const token = await createSessionToken({
      userId: testUser.id,
      email: testUser.email,
      role: testUser.role,
      organizationId: testOrg.id,
      permissions: [],
    });

    // Self scope
    const req = makeJsonRequest("/api/attendance/history?scope=self", "GET", token);
    const res = await getAttendanceHistoryHandler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // past1 = 1.0, past2 = 0.5, today (not checked in) = 0 => total = 1.5
    expect(data.data.metrics.totalDaysPresent).toBe(1.5);
  });
});
