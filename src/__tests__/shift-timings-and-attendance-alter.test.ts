import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { AttendanceService } from "@/services/attendance-service";
import {
  attendanceShiftSettings,
  saveAttendanceShiftSettings,
  DEFAULT_SHIFT_SETTINGS,
} from "@/lib/attendance-rules";

describe("Shift Timings & Alter Staff Attendance Tests", () => {
  const orgId = "org-shift-test";
  const superAdminId = "user-super-admin-shift";
  const supervisorId = "user-supervisor-shift";
  const regularStaffId = "user-regular-staff-shift";
  let siteId: string;

  beforeEach(async () => {
    // Cleanup
    await prisma.auditEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.attendanceSession.deleteMany({ where: { organizationId: orgId } });
    await prisma.staffAttendance.deleteMany({ where: { organizationId: orgId } });
    await prisma.workforceMember.deleteMany({ where: { organizationId: orgId } });
    await prisma.site.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });

    // Seed Organization
    await prisma.organization.create({
      data: {
        id: orgId,
        name: "Bothra Shift Test Corp",
        status: "ACTIVE",
      },
    });

    // Seed Users
    await prisma.user.createMany({
      data: [
        {
          id: superAdminId,
          organizationId: orgId,
          name: "Master Super Admin",
          email: "superadmin@bothra.test",
          role: "SUPER_ADMIN",
          passwordHash: "hash-123",
        },
        {
          id: supervisorId,
          organizationId: orgId,
          name: "Site Supervisor",
          email: "supervisor@bothra.test",
          role: "SITE_SUPERVISOR",
          passwordHash: "hash-123",
        },
        {
          id: regularStaffId,
          organizationId: orgId,
          name: "Ramesh Engineer",
          email: "ramesh@bothra.test",
          role: "SITE_ENGINEER",
          passwordHash: "hash-123",
        },
      ],
    });

    // Seed Site
    const site = await prisma.site.create({
      data: {
        organizationId: orgId,
        name: "Riverside Tower Site",
        code: "RTS-01",
        address: "Riverside Road",
        status: "ACTIVE",
      },
    });
    siteId = site.id;
  });

  it("should get default shift settings and allow Super Admin to alter shift timings & checkout reminders", async () => {
    const initial = await attendanceShiftSettings(orgId);
    expect(initial.enableCheckoutReminder).toBe(true);
    expect(initial.reminderGraceMinutes).toBe(15);
    expect(initial.shifts.length).toBeGreaterThanOrEqual(3);

    // Alter shift timings
    const updated = await saveAttendanceShiftSettings(orgId, {
      enableCheckoutReminder: true,
      reminderGraceMinutes: 30,
      standardWorkHours: 9,
      shifts: [
        { code: "GENERAL", name: "General Shift", startTime: "09:00", endTime: "18:00", durationHours: 9 },
        { code: "DAY", name: "Morning / Day Shift", startTime: "07:30", endTime: "16:30", durationHours: 9 },
        { code: "NIGHT", name: "Night Shift", startTime: "21:00", endTime: "06:00", durationHours: 9 },
      ],
    });

    expect(updated.reminderGraceMinutes).toBe(30);
    expect(updated.standardWorkHours).toBe(9);
    expect(updated.shifts[0].startTime).toBe("09:00");
    expect(updated.shifts[0].endTime).toBe("18:00");

    // Fetch again to verify persistence in Organization settingsJson
    const refetched = await attendanceShiftSettings(orgId);
    expect(refetched.reminderGraceMinutes).toBe(30);
    expect(refetched.shifts[0].startTime).toBe("09:00");
  });

  it("should allow Super Admin & Admin to record attendance for another account holder who forgot to check in", async () => {
    const workDate = "2026-11-03";
    const checkInAt = new Date(`${workDate}T09:30:00+05:30`);
    const checkOutAt = new Date(`${workDate}T18:30:00+05:30`);

    const record = await AttendanceService.recordOrAlterStaffAttendance({
      organizationId: orgId,
      userId: regularStaffId,
      siteId,
      workDate,
      status: "PRESENT",
      checkInAt,
      checkOutAt,
      shift: "GENERAL",
      reason: "Staff forgot to check in on phone; verified physically present on site",
      actorUserId: superAdminId,
      actorRole: "SUPER_ADMIN",
    });

    expect(record).toBeDefined();
    expect(record.status).toBe("PRESENT");
    expect(record.notes).toContain("[Shift: GENERAL]");
    expect(record.correctedBy).toBe(superAdminId);
    expect(record.correctionReason).toContain("verified physically present");

    // Audit log verification
    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: orgId,
        action: "ATTENDANCE_ADMIN_RECORDED",
      },
    });
    expect(auditEvent).toBeDefined();
    expect(auditEvent?.actorUserId).toBe(superAdminId);
    expect(auditEvent?.reason).toContain("verified physically present");

    // Synchronized StaffAttendance check
    const staffAtt = await prisma.staffAttendance.findUnique({
      where: {
        organizationId_userId_workDate: {
          organizationId: orgId,
          userId: regularStaffId,
          workDate,
        },
      },
    });
    expect(staffAtt).toBeDefined();
    expect(staffAtt?.status).toBe("PRESENT");
  });

  it("should allow Super Admin to alter an existing attendance session for an employee", async () => {
    const workDate = "2026-11-03";

    // 1. Employee checked in initially
    await AttendanceService.recordOrAlterStaffAttendance({
      organizationId: orgId,
      userId: regularStaffId,
      siteId,
      workDate,
      status: "PRESENT",
      checkInAt: new Date(`${workDate}T09:00:00+05:30`),
      shift: "DAY",
      reason: "Initial shift entry",
      actorUserId: superAdminId,
      actorRole: "SUPER_ADMIN",
    });

    // 2. Employee forgot to checkout after night shift. Super admin alters it:
    const altered = await AttendanceService.recordOrAlterStaffAttendance({
      organizationId: orgId,
      userId: regularStaffId,
      siteId,
      workDate,
      status: "OVERTIME",
      checkInAt: new Date(`${workDate}T09:00:00+05:30`),
      checkOutAt: new Date(`${workDate}T21:00:00+05:30`),
      shift: "DAY",
      reason: "Employee worked overtime until 9 PM for slab casting; admin recorded checkout",
      actorUserId: superAdminId,
      actorRole: "SUPER_ADMIN",
    });

    expect(altered.status).toBe("OVERTIME");
    expect(altered.checkOutAt).toBeDefined();

    // Verify correction audit event
    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        organizationId: orgId,
        action: "ATTENDANCE_CORRECTED",
      },
    });
    expect(auditEvent).toBeDefined();
    expect(auditEvent?.reason).toContain("worked overtime until 9 PM");
  });

  it("should reject altering staff attendance without sufficient justification", async () => {
    await expect(
      AttendanceService.recordOrAlterStaffAttendance({
        organizationId: orgId,
        userId: regularStaffId,
        siteId,
        workDate: "2026-11-03",
        status: "PRESENT",
        reason: "ok", // Too short (< 5 chars)
        actorUserId: superAdminId,
        actorRole: "SUPER_ADMIN",
      })
    ).rejects.toThrow(/detailed justification.*required/i);
  });
});
