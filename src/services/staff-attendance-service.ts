import { prisma } from "@/lib/db";
import { istDateKey, monthDays } from "@/lib/ist-date";
import { attendanceRules, distanceText, placeCheckIn } from "@/lib/attendance-rules";

/**
 * Check-in / check-out for staff who use the CMS. One row per person per
 * IST day. Admins can also mark a day as leave or half day.
 */

export class StaffAttendanceError extends Error {
  constructor(message: string, public statusCode = 409, public code = "ATTENDANCE_CONFLICT") {
    super(message);
  }
}

export const STAFF_STATUSES = ["PRESENT", "HALF_DAY", "LEAVE", "ABSENT"] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export function hoursBetween(start: Date | null | undefined, end: Date | null | undefined): number | null {
  if (!start || !end) return null;
  const h = (end.getTime() - start.getTime()) / 3_600_000;
  return h > 0 ? Math.round(h * 10) / 10 : 0;
}

/** Roles whose people are expected to check in and file a daily report. */
export function isReportingRole(role: string): boolean {
  return role !== "SUPER_ADMIN" && role !== "ORG_ADMIN" && role !== "AUDITOR";
}

/** A selfie must be a photo this person uploaded to this company, or it is ignored. */
async function ownSelfie(organizationId: string, userId: string, url: string | null | undefined) {
  const m = url ? /^\/api\/uploads\/([\w.-]+)$/.exec(url) : null;
  if (!m) return null;
  const photo = await prisma.attachment.findFirst({
    where: { organizationId, uploadedById: userId, fileId: m[1], mimeType: { startsWith: "image/" } },
    select: { fileId: true },
  });
  return photo ? `/api/uploads/${photo.fileId}` : null;
}

export class StaffAttendanceService {
  static async today(organizationId: string, userId: string, now = new Date()) {
    return prisma.staffAttendance.findUnique({
      where: { organizationId_userId_workDate: { organizationId, userId, workDate: istDateKey(now) } },
    });
  }

  static async checkIn(
    organizationId: string,
    userId: string,
    input: { lat?: number | null; lng?: number | null; note?: string | null; selfie?: string | null; offline?: boolean },
    now = new Date()
  ) {
    const workDate = istDateKey(now);
    const existing = await prisma.staffAttendance.findUnique({
      where: { organizationId_userId_workDate: { organizationId, userId, workDate } },
    });
    // A phone that lost signal mid-send tries again with the same press time;
    // that is the same check-in, not a second one.
    if (existing?.checkInAt?.getTime() === now.getTime()) return existing;
    if (existing && existing.status !== "LEAVE" && existing.status !== "ABSENT") {
      throw new StaffAttendanceError("You have already checked in today.");
    }
    const [rules, place] = await Promise.all([attendanceRules(organizationId), placeCheckIn(organizationId, input)]);
    const selfie = await ownSelfie(organizationId, userId, input.selfie);
    // A check-in saved on a phone with no signal is never refused when it
    // finally arrives (the person was there at the time); it is only flagged.
    if (!input.offline) {
      if (rules.requireGps && (input.lat == null || input.lng == null)) {
        throw new StaffAttendanceError("Turn on location for this site and try again. Your company needs it to check in.", 422, "LOCATION_REQUIRED");
      }
      if (rules.blockOffSite && place.flag === "OFF_SITE") {
        throw new StaffAttendanceError(`You are ${distanceText(place.distanceM!)} from ${place.siteName}. Check in when you reach the site.`, 422, "OFF_SITE");
      }
      if (rules.requireSelfie && !selfie) {
        throw new StaffAttendanceError("Take a selfie to check in.", 422, "SELFIE_REQUIRED");
      }
    }
    const data = {
      checkInAt: now,
      checkInLat: input.lat ?? null,
      checkInLng: input.lng ?? null,
      checkInNote: input.note?.trim() || null,
      checkInSiteId: place.siteId,
      checkInDistanceM: place.distanceM,
      checkInFlag: place.flag,
      checkInSelfie: selfie,
      checkOutAt: null,
      status: "PRESENT",
    };
    return existing
      ? prisma.staffAttendance.update({ where: { id: existing.id }, data })
      : prisma.staffAttendance.create({ data: { organizationId, userId, workDate, ...data } });
  }

  static async checkOut(
    organizationId: string,
    userId: string,
    input: { lat?: number | null; lng?: number | null },
    now = new Date()
  ) {
    const workDate = istDateKey(now);
    const existing = await prisma.staffAttendance.findUnique({
      where: { organizationId_userId_workDate: { organizationId, userId, workDate } },
    });
    if (!existing || existing.status === "LEAVE" || existing.status === "ABSENT") {
      throw new StaffAttendanceError("Check in first.", 422, "NOT_CHECKED_IN");
    }
    if (existing.checkOutAt?.getTime() === now.getTime()) return existing;
    if (existing.checkOutAt) throw new StaffAttendanceError("You have already checked out today.");
    const hours = hoursBetween(existing.checkInAt, now) ?? 0;
    return prisma.staffAttendance.update({
      where: { id: existing.id },
      data: {
        checkOutAt: now,
        checkOutLat: input.lat ?? null,
        checkOutLng: input.lng ?? null,
        // Under four hours counts as half a day unless an admin says otherwise.
        status: existing.status === "PRESENT" && hours < 4 ? "HALF_DAY" : existing.status,
      },
    });
  }

  /** Admin marks a person's day (leave, half day, present, absent). */
  static async setStatus(organizationId: string, userId: string, workDate: string, status: StaffStatus) {
    const user = await prisma.user.findFirst({ where: { id: userId, organizationId }, select: { id: true } });
    if (!user) throw new StaffAttendanceError("User not found", 404, "NOT_FOUND");
    const existing = await prisma.staffAttendance.findUnique({
      where: { organizationId_userId_workDate: { organizationId, userId, workDate } },
    });
    if (existing) return prisma.staffAttendance.update({ where: { id: existing.id }, data: { status } });
    // A day marked without a check-in is anchored at 10:00 IST so the row has a time.
    return prisma.staffAttendance.create({
      data: { organizationId, userId, workDate, status, checkInAt: new Date(`${workDate}T10:00:00.000+05:30`) },
    });
  }

  /** Month grid: every active member × every day, with totals. */
  static async register(organizationId: string, month: string) {
    const days = monthDays(month);
    const [users, rows] = await Promise.all([
      prisma.user.findMany({
        where: { organizationId, status: "ACTIVE" },
        select: { id: true, name: true, role: true, jobTitle: true, phone: true },
        orderBy: { name: "asc" },
      }),
      prisma.staffAttendance.findMany({
        where: { organizationId, workDate: { gte: days[0], lte: days[days.length - 1] } },
      }),
    ]);

    const sites = new Map((await prisma.site.findMany({ where: { organizationId }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
    const byUser = new Map<
      string,
      Record<string, { status: string; checkInAt: string; checkOutAt: string | null; hours: number | null; flag: string | null; site: string | null; distanceM: number | null; selfie: string | null }>
    >();
    for (const r of rows) {
      const cells = byUser.get(r.userId) || {};
      cells[r.workDate] = {
        status: r.status,
        checkInAt: r.checkInAt.toISOString(),
        checkOutAt: r.checkOutAt ? r.checkOutAt.toISOString() : null,
        hours: hoursBetween(r.checkInAt, r.checkOutAt),
        flag: r.checkInFlag,
        site: r.checkInSiteId ? sites.get(r.checkInSiteId) || null : null,
        distanceM: r.checkInDistanceM,
        selfie: r.checkInSelfie,
      };
      byUser.set(r.userId, cells);
    }

    const members = users.map((u) => {
      const cells = byUser.get(u.id) || {};
      const values = Object.values(cells);
      return {
        user: u,
        cells,
        totals: {
          present: values.filter((c) => c.status === "PRESENT").length,
          halfDay: values.filter((c) => c.status === "HALF_DAY").length,
          leave: values.filter((c) => c.status === "LEAVE").length,
          away: values.filter((c) => c.flag === "OFF_SITE").length,
          hours: Math.round(values.reduce((s, c) => s + (c.hours || 0), 0) * 10) / 10,
        },
      };
    });

    return { month, days, members };
  }
}
