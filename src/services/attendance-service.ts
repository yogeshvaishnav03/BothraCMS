import { prisma } from "@/lib/db";
import { assertPermission, Role } from "@/lib/permissions";

export interface CheckInInput {
  organizationId: string;
  workforceMemberId: string;
  siteId: string;
  projectId?: string;
  workDate: string; // YYYY-MM-DD
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
  notes?: string;
  userId: string;
  role: Role;
}

export interface CheckOutInput {
  organizationId: string;
  sessionId: string;
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
  notes?: string;
  userId: string;
  role: Role;
}

export interface CorrectAttendanceInput {
  organizationId: string;
  sessionId: string;
  status: string; // PRESENT, HALF_DAY, OVERTIME, ABSENT
  checkInAt?: Date;
  checkOutAt?: Date;
  reason: string;
  userId: string;
  role: Role;
}

export class AttendanceService {
  /**
   * Check in a workforce member for a shift
   */
  static async checkIn(input: CheckInInput) {
    assertPermission(input.role, "attendance:write");

    const member = await prisma.workforceMember.findFirst({
      where: { id: input.workforceMemberId, organizationId: input.organizationId },
    });
    if (!member) {
      throw new Error("NotFound: Workforce member not found");
    }

    const site = await prisma.site.findFirst({
      where: { id: input.siteId, organizationId: input.organizationId },
    });
    if (!site) {
      throw new Error("NotFound: Site not found or outside organization scope");
    }

    if (input.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, organizationId: input.organizationId },
      });
      if (!project) {
        throw new Error("NotFound: Project not found or outside organization scope");
      }
    }

    // Check for existing session on same day at site
    const existingSession = await prisma.attendanceSession.findUnique({
      where: {
        organizationId_workforceMemberId_siteId_workDate: {
          organizationId: input.organizationId,
          workforceMemberId: input.workforceMemberId,
          siteId: input.siteId,
          workDate: input.workDate,
        },
      },
    });

    if (existingSession) {
      throw new Error(
        `Worker ${member.name} (${member.employeeCode}) has already checked in on ${input.workDate}`
      );
    }

    const now = new Date();

    return await prisma.attendanceSession.create({
      data: {
        organizationId: input.organizationId,
        workforceMemberId: input.workforceMemberId,
        siteId: input.siteId,
        projectId: input.projectId ?? null,
        workDate: input.workDate,
        checkInAt: now,
        checkInLat: input.latitude ?? null,
        checkInLng: input.longitude ?? null,
        checkInAccuracyM: input.accuracyM ?? null,
        status: "PRESENT",
        notes: input.notes ?? null,
        createdBy: input.userId,
      },
      include: {
        workforceMember: true,
        site: true,
      },
    });
  }

  /**
   * Check out an active session
   */
  static async checkOut(input: CheckOutInput) {
    assertPermission(input.role, "attendance:write");

    const session = await prisma.attendanceSession.findFirst({
      where: { id: input.sessionId, organizationId: input.organizationId },
      include: { workforceMember: true },
    });

    if (!session) {
      throw new Error("NotFound: Attendance session not found");
    }

    if (session.checkOutAt) {
      throw new Error("This attendance session has already been checked out");
    }

    const now = new Date();

    return await prisma.attendanceSession.update({
      where: { id: session.id },
      data: {
        checkOutAt: now,
        checkOutLat: input.latitude ?? null,
        checkOutLng: input.longitude ?? null,
        checkOutAccuracyM: input.accuracyM ?? null,
        notes: input.notes ? `${session.notes || ""}; ${input.notes}`.trim() : session.notes,
      },
      include: { workforceMember: true, site: true },
    });
  }

  /**
   * Correct attendance with mandatory supervisor justification
   */
  static async correctAttendance(input: CorrectAttendanceInput) {
    assertPermission(input.role, "attendance:correct");

    if (!input.reason || input.reason.trim().length < 5) {
      throw new Error("A detailed justification is required for attendance correction");
    }

    const session = await prisma.attendanceSession.findFirst({
      where: { id: input.sessionId, organizationId: input.organizationId },
      include: { workforceMember: true },
    });

    if (!session) {
      throw new Error("NotFound: Attendance session not found");
    }

    const updated = await prisma.attendanceSession.update({
      where: { id: session.id },
      data: {
        status: input.status,
        checkInAt: input.checkInAt ?? session.checkInAt,
        checkOutAt: input.checkOutAt ?? session.checkOutAt,
        correctedBy: input.userId,
        correctionReason: input.reason,
      },
      include: { workforceMember: true, site: true },
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.userId,
        action: "ATTENDANCE_CORRECTED",
        entityType: "ATTENDANCE_SESSION",
        entityId: session.id,
        reason: input.reason,
        beforeJson: JSON.stringify({
          status: session.status,
          checkInAt: session.checkInAt,
          checkOutAt: session.checkOutAt,
        }),
        afterJson: JSON.stringify({
          status: updated.status,
          checkInAt: updated.checkInAt,
          checkOutAt: updated.checkOutAt,
        }),
      },
    });

    return updated;
  }

  /**
   * Get attendance for a site on a given date
   */
  static async getDailyAttendance(
    organizationId: string,
    siteId?: string,
    workDate?: string
  ) {
    const whereClause: any = { organizationId };
    if (siteId) whereClause.siteId = siteId;
    if (workDate) whereClause.workDate = workDate;

    return await prisma.attendanceSession.findMany({
      where: whereClause,
      include: {
        workforceMember: true,
        site: true,
        project: true,
        creator: { select: { id: true, name: true } },
      },
      orderBy: { checkInAt: "desc" },
    });
  }
}
