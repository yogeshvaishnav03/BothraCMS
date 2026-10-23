import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import type { UserContext } from "@/lib/auth";
import { istDateKey, isDateKey } from "@/lib/ist-date";

/**
 * The daily labour muster: a supervisor marks each site worker present, half
 * day or absent for a project's site, with any overtime. Saving the same
 * muster again simply updates it, so it is safe to send from a phone that
 * had no signal.
 */

export type MusterMark = "PRESENT" | "HALF_DAY" | "ABSENT" | "NONE";
export const MUSTER_NOTE = "Marked on the muster";
/** Supervisors can fill in the last week; older days need someone who can correct attendance. */
export const MUSTER_BACK_DAYS = 7;
export const MAX_OVERTIME_HOURS = 8;
const STANDARD_HOURS = 8;

export class MusterError extends Error {
  constructor(
    message: string,
    public statusCode = 422,
    public code = "MUSTER_INVALID"
  ) {
    super(message);
  }
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
}

/** Shift times for a mark: the day starts 9 am IST; a half day is 4 hours. */
export function shiftTimes(workDate: string, mark: Exclude<MusterMark, "NONE">, overtimeHours = 0) {
  const checkInAt = new Date(`${workDate}T09:00:00.000+05:30`);
  if (mark === "ABSENT") return { checkInAt, checkOutAt: null };
  const hours = mark === "HALF_DAY" ? STANDARD_HOURS / 2 : STANDARD_HOURS + overtimeHours;
  return { checkInAt, checkOutAt: new Date(checkInAt.getTime() + hours * 3_600_000) };
}

function overtimeOf(s: { checkInAt: Date; checkOutAt: Date | null }) {
  if (!s.checkOutAt) return 0;
  const h = (s.checkOutAt.getTime() - s.checkInAt.getTime()) / 3_600_000 - STANDARD_HOURS;
  return h > 0 ? Math.round(h * 2) / 2 : 0;
}

function markOf(status: string): Exclude<MusterMark, "NONE"> {
  return status === "HALF_DAY" ? "HALF_DAY" : status === "ABSENT" ? "ABSENT" : "PRESENT";
}

function checkDate(user: UserContext, workDate: string) {
  if (!isDateKey(workDate)) throw new MusterError("Pick a valid date.");
  const today = istDateKey();
  if (workDate > today) throw new MusterError("The muster cannot be filled for a day that has not come yet.");
  if (daysBetween(workDate, today) > MUSTER_BACK_DAYS && !hasPermission(user.role, "attendance:correct")) {
    throw new MusterError(`Only the last ${MUSTER_BACK_DAYS} days can be filled. Ask an admin to correct older days.`, 403, "TOO_OLD");
  }
}

async function projectOf(user: UserContext, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: user.organizationId },
    select: { id: true, name: true, siteId: true, site: { select: { name: true } } },
  });
  if (!project) throw new MusterError("Project not found.", 404, "NOT_FOUND");
  return project;
}

export class MusterService {
  /** Workers and today's marks for one project's site. */
  static async get(user: UserContext, projectId: string, workDate: string) {
    if (!isDateKey(workDate)) throw new MusterError("Pick a valid date.");
    const project = await projectOf(user, projectId);
    const [workers, sessions] = await Promise.all([
      prisma.workforceMember.findMany({
        where: { organizationId: user.organizationId, active: true, isArchived: false, NOT: { employeeCode: { startsWith: "USR-" } } },
        select: { id: true, name: true, employeeCode: true, workerType: true, dailyWageRate: true, defaultSiteId: true },
        orderBy: { name: "asc" },
      }),
      prisma.attendanceSession.findMany({
        where: { organizationId: user.organizationId, workDate, isArchived: false },
        select: { id: true, workforceMemberId: true, siteId: true, status: true, checkInAt: true, checkOutAt: true, correctedBy: true, notes: true, site: { select: { name: true } } },
      }),
    ]);
    const here = new Map(sessions.filter((s) => s.siteId === project.siteId).map((s) => [s.workforceMemberId, s]));
    const elsewhere = new Map(sessions.filter((s) => s.siteId !== project.siteId).map((s) => [s.workforceMemberId, s.site.name]));
    const rows = workers.map((w) => {
      const s = here.get(w.id);
      return {
        id: w.id,
        name: w.name,
        code: w.employeeCode,
        trade: w.workerType,
        dailyWage: Math.round(w.dailyWageRate || 0),
        usualSite: w.defaultSiteId === project.siteId,
        mark: (s ? markOf(s.status) : "NONE") as MusterMark,
        overtimeHours: s ? overtimeOf(s) : 0,
        locked: !!s?.correctedBy,
        elsewhere: elsewhere.get(w.id) || null,
      };
    });
    // This site's own workers first, then everyone else.
    rows.sort((a, b) => Number(b.usualSite) - Number(a.usualSite) || a.name.localeCompare(b.name));
    return {
      project: { id: project.id, name: project.name, site: project.site.name },
      workDate,
      today: istDateKey(),
      canEdit: hasPermission(user.role, "attendance:write"),
      backDays: hasPermission(user.role, "attendance:correct") ? null : MUSTER_BACK_DAYS,
      workers: rows,
    };
  }

  static async save(
    user: UserContext,
    input: { projectId: string; workDate: string; entries: { workerId: string; mark: MusterMark; overtimeHours?: number }[] }
  ) {
    checkDate(user, input.workDate);
    const project = await projectOf(user, input.projectId);
    const ids = Array.from(new Set(input.entries.map((e) => e.workerId)));
    const workers = await prisma.workforceMember.findMany({
      where: { id: { in: ids }, organizationId: user.organizationId, isArchived: false },
      select: { id: true },
    });
    if (workers.length !== ids.length) throw new MusterError("Some workers on the muster were not found. Refresh and try again.", 404, "NOT_FOUND");
    const existing = await prisma.attendanceSession.findMany({
      where: { organizationId: user.organizationId, siteId: project.siteId, workDate: input.workDate, workforceMemberId: { in: ids } },
    });
    const byWorker = new Map(existing.map((s) => [s.workforceMemberId, s]));

    const counts = { present: 0, halfDay: 0, absent: 0, cleared: 0, kept: 0 };
    await prisma.$transaction(async (tx) => {
      for (const e of input.entries) {
        const s = byWorker.get(e.workerId);
        if (s?.correctedBy) {
          counts.kept++; // an admin's correction stands
          continue;
        }
        if (e.mark === "NONE") {
          if (s && s.notes === MUSTER_NOTE) {
            await tx.attendanceSession.delete({ where: { id: s.id } });
            counts.cleared++;
          }
          continue;
        }
        const ot = e.mark === "PRESENT" ? Math.min(MAX_OVERTIME_HOURS, Math.max(0, Math.round((e.overtimeHours || 0) * 2) / 2)) : 0;
        const status = e.mark === "PRESENT" && ot > 0 ? "OVERTIME" : e.mark;
        const times = shiftTimes(input.workDate, e.mark, ot);
        if (s) {
          // A worker's own check-in keeps its real times; only the day's mark changes.
          const ownTimes = s.notes !== MUSTER_NOTE;
          await tx.attendanceSession.update({
            where: { id: s.id },
            data: { status, projectId: project.id, ...(ownTimes ? {} : times) },
          });
        } else {
          await tx.attendanceSession.create({
            data: {
              organizationId: user.organizationId,
              workforceMemberId: e.workerId,
              siteId: project.siteId,
              projectId: project.id,
              workDate: input.workDate,
              status,
              notes: MUSTER_NOTE,
              createdBy: user.userId,
              ...times,
            },
          });
        }
        if (e.mark === "PRESENT") counts.present++;
        else if (e.mark === "HALF_DAY") counts.halfDay++;
        else counts.absent++;
      }
      await tx.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.userId,
          action: "MUSTER_SAVED",
          entityType: "PROJECT",
          entityId: project.id,
          afterJson: JSON.stringify({ workDate: input.workDate, ...counts }),
        },
      });
    });
    return { ...counts, ...(await MusterService.get(user, input.projectId, input.workDate)) };
  }
}
