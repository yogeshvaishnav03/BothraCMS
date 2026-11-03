import { prisma } from "@/lib/db";
import { assertPermission, Role } from "@/lib/permissions";

export interface CheckInInput {
  organizationId: string;
  workforceMemberId?: string;
  siteId?: string;
  projectId?: string;
  workDate?: string; // YYYY-MM-DD
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
  notes?: string;
  attachmentIds?: string[];
  userId: string;
  role: Role;
}

export interface CheckOutInput {
  organizationId: string;
  sessionId?: string;
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
  shift?: "GENERAL" | "DAY" | "NIGHT";
  reason: string;
  userId: string;
  role: Role;
}

export interface RecordOrAlterStaffAttendanceInput {
  organizationId: string;
  userId: string;
  siteId: string;
  projectId?: string;
  workDate: string; // YYYY-MM-DD
  status: string; // PRESENT, HALF_DAY, OVERTIME, ABSENT, ON_LEAVE
  checkInAt?: Date | string;
  checkOutAt?: Date | string;
  shift?: "GENERAL" | "DAY" | "NIGHT";
  reason: string;
  actorUserId: string;
  actorRole: Role;
}

export class AttendanceService {
  /**
   * Check in a workforce member or current user for a shift
   */
  static async checkIn(input: CheckInInput) {
    let member: any = null;

    if (input.workforceMemberId) {
      assertPermission(input.role, "attendance:write");
      member = await prisma.workforceMember.findFirst({
        where: { id: input.workforceMemberId, organizationId: input.organizationId },
      });
      if (!member) {
        throw new Error("NotFound: Workforce member not found");
      }
    } else {
      // Self check-in for the authenticated user
      const user = await prisma.user.findFirst({
        where: { id: input.userId, organizationId: input.organizationId },
      });
      if (!user) {
        throw new Error("NotFound: User not found");
      }

      // Check if user already has an associated workforce member
      member = await prisma.workforceMember.findFirst({
        where: {
          organizationId: input.organizationId,
          OR: [
            { employeeCode: `USR-${user.id.slice(-6).toUpperCase()}` },
            { name: user.name },
          ],
        },
      });

      if (!member) {
        member = await prisma.workforceMember.create({
          data: {
            organizationId: input.organizationId,
            employeeCode: `USR-${user.id.slice(-6).toUpperCase()}`,
            name: user.name || "Staff Member",
            workerType: user.role === "SITE_SUPERVISOR" ? "FOREMAN" : "SITE_ENGINEER",
            defaultSiteId: input.siteId || undefined,
            active: true,
          },
        });
      }
    }

    let site: any = null;
    let resolvedSiteId = input.siteId;

    if (resolvedSiteId) {
      site = await prisma.site.findFirst({
        where: { id: resolvedSiteId, organizationId: input.organizationId },
      });
      if (!site) {
        throw new Error("NotFound: Site not found or outside organization scope");
      }
    } else {
      // Fallback to worker default site, or first active site in organization
      if (member.defaultSiteId) {
        site = await prisma.site.findFirst({
          where: { id: member.defaultSiteId, organizationId: input.organizationId },
        });
      }
      if (!site) {
        site = (await prisma.site.findFirst({
          where: { organizationId: input.organizationId, status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
        })) || (await prisma.site.findFirst({
          where: { organizationId: input.organizationId },
        }));
      }
      if (!site) {
        throw new Error("NotFound: No active site found in organization");
      }
      resolvedSiteId = site.id;
    }

    if (input.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, organizationId: input.organizationId },
      });
      if (!project) {
        throw new Error("NotFound: Project not found or outside organization scope");
      }
    }

    const effectiveWorkDate = input.workDate || new Date().toISOString().split("T")[0];

    // Check for existing session on same day
    const existingSession = await prisma.attendanceSession.findFirst({
      where: {
        organizationId: input.organizationId,
        workforceMemberId: member.id,
        workDate: effectiveWorkDate,
      },
    });

    if (existingSession) {
      throw new Error(
        `Worker ${member.name} (${member.employeeCode}) has already checked in on ${effectiveWorkDate}`
      );
    }

    const now = new Date();

    const session = await prisma.attendanceSession.create({
      data: {
        organizationId: input.organizationId,
        workforceMemberId: member.id,
        siteId: resolvedSiteId!,
        projectId: input.projectId ?? null,
        workDate: effectiveWorkDate,
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
        project: true,
        attachments: true,
      },
    });

    if (input.attachmentIds && input.attachmentIds.length > 0) {
      await prisma.attachment.updateMany({
        where: {
          id: { in: input.attachmentIds },
          organizationId: input.organizationId,
        },
        data: {
          attendanceSessionId: session.id,
          projectId: input.projectId ?? null,
        },
      });
    }

    return session;
  }

  /**
   * Check out an active session
   */
  static async checkOut(input: CheckOutInput) {
    let session: any = null;

    if (input.sessionId) {
      session = await prisma.attendanceSession.findFirst({
        where: { id: input.sessionId, organizationId: input.organizationId },
        include: { workforceMember: true },
      });
      if (!session) {
        throw new Error("NotFound: Attendance session not found");
      }
      // If user is checking out someone else, verify permission
      if (session.createdBy !== input.userId) {
        assertPermission(input.role, "attendance:write");
      }
    } else {
      // Self-checkout: find open session for today belonging to user's workforce member
      const user = await prisma.user.findUnique({ where: { id: input.userId } });
      const member = await prisma.workforceMember.findFirst({
        where: {
          organizationId: input.organizationId,
          OR: [
            { employeeCode: `USR-${input.userId.slice(-6).toUpperCase()}` },
            ...(user?.name ? [{ name: user.name }] : []),
          ],
        },
      });

      if (!member) {
        throw new Error("NotFound: No workforce record found for this user");
      }

      session = await prisma.attendanceSession.findFirst({
        where: {
          organizationId: input.organizationId,
          workforceMemberId: member.id,
          checkOutAt: null,
        },
        orderBy: { checkInAt: "desc" },
        include: { workforceMember: true },
      });

      if (!session) {
        throw new Error("NotFound: No active attendance session found to check out");
      }
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

    const shiftTag = input.shift ? `[Shift: ${input.shift}]` : "";
    let updatedNotes = session.notes || "";
    if (input.shift) {
      updatedNotes = `${shiftTag} ${updatedNotes.replace(/\[Shift:\s*(GENERAL|DAY|NIGHT)\]/gi, "").trim()}`.trim();
    }

    const updated = await prisma.attendanceSession.update({
      where: { id: session.id },
      data: {
        status: input.status,
        checkInAt: input.checkInAt ?? session.checkInAt,
        checkOutAt: input.checkOutAt ?? session.checkOutAt,
        correctedBy: input.userId,
        correctionReason: input.reason,
        notes: updatedNotes || session.notes,
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
          shift: input.shift,
        }),
      },
    });

    return updated;
  }

  /**
   * Admin and Super Admin alter or create attendance record for another account holder
   */
  static async recordOrAlterStaffAttendance(input: RecordOrAlterStaffAttendanceInput) {
    if (input.actorRole !== "SUPER_ADMIN" && input.actorRole !== "ORG_ADMIN") {
      assertPermission(input.actorRole, "attendance:write");
    }

    if (!input.reason || input.reason.trim().length < 5) {
      throw new Error("A detailed justification (min. 5 characters) is required to alter staff attendance.");
    }

    const targetUser = await prisma.user.findFirst({
      where: { id: input.userId, organizationId: input.organizationId },
    });
    if (!targetUser) {
      throw new Error("NotFound: Target employee / user not found in organization.");
    }

    const site = await prisma.site.findFirst({
      where: { id: input.siteId, organizationId: input.organizationId },
    });
    if (!site) {
      throw new Error("NotFound: Site not found in organization.");
    }

    // Resolve or create workforce member for target user
    let member = await prisma.workforceMember.findFirst({
      where: {
        organizationId: input.organizationId,
        OR: [
          { employeeCode: `USR-${targetUser.id.slice(-6).toUpperCase()}` },
          { name: targetUser.name },
        ],
      },
    });

    if (!member) {
      member = await prisma.workforceMember.create({
        data: {
          organizationId: input.organizationId,
          employeeCode: `USR-${targetUser.id.slice(-6).toUpperCase()}`,
          name: targetUser.name || "Staff Member",
          workerType: targetUser.role === "SITE_SUPERVISOR" ? "FOREMAN" : "SITE_ENGINEER",
          defaultSiteId: input.siteId,
          active: true,
        },
      });
    }

    const shiftCode = input.shift || "GENERAL";
    const shiftTag = `[Shift: ${shiftCode}]`;

    const existingSession = await prisma.attendanceSession.findFirst({
      where: {
        organizationId: input.organizationId,
        workforceMemberId: member.id,
        workDate: input.workDate,
      },
    });

    let checkInDate: Date;
    if (input.checkInAt) {
      checkInDate = new Date(input.checkInAt);
    } else if (existingSession?.checkInAt) {
      checkInDate = existingSession.checkInAt;
    } else {
      checkInDate = new Date(`${input.workDate}T09:30:00+05:30`);
    }

    let checkOutDate: Date | null = null;
    if (input.checkOutAt) {
      checkOutDate = new Date(input.checkOutAt);
    } else if (input.status === "ABSENT" || input.status === "ON_LEAVE") {
      checkOutDate = null;
    } else if (existingSession?.checkOutAt) {
      checkOutDate = existingSession.checkOutAt;
    }

    let resultSession: any;
    if (existingSession) {
      const existingNotes = existingSession.notes || "";
      const cleanedNotes = existingNotes.replace(/\[Shift:\s*(GENERAL|DAY|NIGHT)\]/gi, "").trim();
      const updatedNotes = `${shiftTag} ${cleanedNotes}`.trim();

      resultSession = await prisma.attendanceSession.update({
        where: { id: existingSession.id },
        data: {
          siteId: input.siteId,
          projectId: input.projectId ?? existingSession.projectId,
          status: input.status,
          checkInAt: checkInDate,
          checkOutAt: checkOutDate,
          correctedBy: input.actorUserId,
          correctionReason: input.reason,
          notes: updatedNotes,
        },
        include: { workforceMember: true, site: true, creator: true },
      });

      await prisma.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "ATTENDANCE_CORRECTED",
          entityType: "ATTENDANCE_SESSION",
          entityId: existingSession.id,
          reason: input.reason,
          beforeJson: JSON.stringify({
            status: existingSession.status,
            checkInAt: existingSession.checkInAt,
            checkOutAt: existingSession.checkOutAt,
            siteId: existingSession.siteId,
          }),
          afterJson: JSON.stringify({
            status: resultSession.status,
            checkInAt: resultSession.checkInAt,
            checkOutAt: resultSession.checkOutAt,
            siteId: resultSession.siteId,
            shift: shiftCode,
          }),
        },
      });
    } else {
      resultSession = await prisma.attendanceSession.create({
        data: {
          organizationId: input.organizationId,
          workforceMemberId: member.id,
          siteId: input.siteId,
          projectId: input.projectId ?? null,
          workDate: input.workDate,
          checkInAt: checkInDate,
          checkOutAt: checkOutDate,
          status: input.status,
          notes: `${shiftTag} Admin recorded attendance: ${input.reason}`,
          createdBy: input.actorUserId,
          correctedBy: input.actorUserId,
          correctionReason: input.reason,
        },
        include: { workforceMember: true, site: true, creator: true },
      });

      await prisma.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "ATTENDANCE_ADMIN_RECORDED",
          entityType: "ATTENDANCE_SESSION",
          entityId: resultSession.id,
          reason: input.reason,
          afterJson: JSON.stringify({
            status: resultSession.status,
            checkInAt: resultSession.checkInAt,
            checkOutAt: resultSession.checkOutAt,
            siteId: resultSession.siteId,
            shift: shiftCode,
            forUserId: targetUser.id,
          }),
        },
      });
    }

    // Keep StaffAttendance in sync
    const staffStatus = input.status === "ON_LEAVE" ? "LEAVE" : input.status === "OVERTIME" ? "PRESENT" : input.status;
    const existingStaffAtt = await prisma.staffAttendance.findUnique({
      where: {
        organizationId_userId_workDate: {
          organizationId: input.organizationId,
          userId: targetUser.id,
          workDate: input.workDate,
        },
      },
    });

    if (existingStaffAtt) {
      await prisma.staffAttendance.update({
        where: { id: existingStaffAtt.id },
        data: {
          checkInAt: checkInDate,
          checkOutAt: checkOutDate,
          status: staffStatus,
          checkInSiteId: input.siteId,
        },
      });
    } else {
      await prisma.staffAttendance.create({
        data: {
          organizationId: input.organizationId,
          userId: targetUser.id,
          workDate: input.workDate,
          checkInAt: checkInDate,
          checkOutAt: checkOutDate,
          status: staffStatus,
          checkInSiteId: input.siteId,
          checkInNote: `${shiftTag} Recorded by Admin`,
        },
      });
    }

    return resultSession;
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
        attachments: {
          where: { isArchived: false },
        },
      },
      orderBy: { checkInAt: "desc" },
    });
  }
}
