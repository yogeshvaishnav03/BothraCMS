import { prisma } from "@/lib/db";
import { istDateKey, istDayBounds } from "@/lib/ist-date";
import { statusLabel } from "@/lib/task-notifications";
import { parsePhotoUrls } from "@/services/task-timeline-service";
import { hoursBetween, isReportingRole } from "@/services/staff-attendance-service";

/**
 * Daily work reports: each employee writes what they did today. The form is
 * pre-filled from their own task activity and attendance so it takes a minute.
 */

export class WorkReportError extends Error {
  constructor(message: string, public statusCode = 422, public code = "WORK_REPORT_INVALID") {
    super(message);
  }
}

export interface WorkReportInput {
  reportDate: string;
  summary: string;
  hoursWorked?: number | null;
  projectId?: string | null;
  blockers?: string | null;
  tomorrowPlan?: string | null;
  photoUrls?: string[];
}

const reportInclude = {
  user: { select: { id: true, name: true, role: true, jobTitle: true, phone: true } },
  reviewedBy: { select: { id: true, name: true } },
  project: { select: { id: true, name: true, code: true } },
} as const;

function shape<T extends { photoUrls: string | null }>(r: T) {
  return { ...r, photoUrls: parsePhotoUrls(r.photoUrls) };
}

export class WorkReportService {
  /** What the person did on this date, from the system's own records. */
  static async draft(organizationId: string, userId: string, date: string) {
    const { start, end } = istDayBounds(date);
    const [history, comments, attendance, existing] = await Promise.all([
      prisma.taskStatusHistory.findMany({
        where: { changedBy: userId, createdAt: { gte: start, lte: end }, task: { organizationId } },
        include: { task: { select: { id: true, title: true, projectId: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.taskComment.findMany({
        where: { organizationId, userId, createdAt: { gte: start, lte: end } },
        include: { task: { select: { id: true, title: true, projectId: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.staffAttendance.findUnique({
        where: { organizationId_userId_workDate: { organizationId, userId, workDate: date } },
      }),
      prisma.dailyWorkReport.findUnique({
        where: { organizationId_userId_reportDate: { organizationId, userId, reportDate: date } },
        include: reportInclude,
      }),
    ]);

    // One line per task: what was written about it, and where its status ended up.
    const byTask = new Map<string, { title: string; notes: string[]; lastStatus: string | null }>();
    const slot = (t: { id: string; title: string }) => {
      const row = byTask.get(t.id) || { title: t.title, notes: [], lastStatus: null };
      byTask.set(t.id, row);
      return row;
    };
    for (const h of history) slot(h.task).lastStatus = h.newStatus;
    for (const c of comments) {
      if (c.type !== "PROGRESS_UPDATE") continue;
      const row = slot(c.task);
      const note = c.content.trim().replace(/[.\s]+$/, "");
      if (note && !row.notes.includes(note)) row.notes.push(note);
    }
    const lines = Array.from(byTask.values()).map((r) => {
      const status = r.lastStatus ? `now ${statusLabel(r.lastStatus).toLowerCase()}` : "";
      const notes = r.notes.join(". ");
      return notes ? `${r.title}: ${notes}${status ? ` (${status})` : ""}` : `${r.title}: ${status}`;
    });

    const photoUrls = comments.flatMap((c) => [...parsePhotoUrls(c.photoUrls), ...(c.photoUrl ? [c.photoUrl] : [])]).slice(0, 12);

    // The project the person touched most often that day.
    const projectCounts = new Map<string, number>();
    [...history.map((h) => h.task.projectId), ...comments.map((c) => c.task.projectId)].forEach((p) =>
      projectCounts.set(p, (projectCounts.get(p) || 0) + 1)
    );
    const topProject = Array.from(projectCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const now = new Date();
    const hoursWorked = attendance
      ? hoursBetween(attendance.checkInAt, attendance.checkOutAt || (date === istDateKey(now) ? now : null))
      : null;

    return {
      date,
      existing: existing ? shape(existing) : null,
      suggestion: {
        summary: lines.map((l) => `• ${l}`).join("\n"),
        hoursWorked,
        projectId: topProject,
        photoUrls,
      },
      activityCount: history.length + comments.length,
      attendance,
    };
  }

  static async upsert(organizationId: string, userId: string, input: WorkReportInput, now = new Date()) {
    const today = istDateKey(now);
    if (input.reportDate > today) throw new WorkReportError("You cannot file a report for a future date.");

    const existing = await prisma.dailyWorkReport.findUnique({
      where: { organizationId_userId_reportDate: { organizationId, userId, reportDate: input.reportDate } },
    });
    if (existing?.status === "REVIEWED") {
      throw new WorkReportError("This report is already reviewed and locked.", 409, "WORK_REPORT_LOCKED");
    }
    if (input.projectId) {
      const project = await prisma.project.findFirst({ where: { id: input.projectId, organizationId }, select: { id: true } });
      if (!project) throw new WorkReportError("Project not found", 404, "NOT_FOUND");
    }

    const data = {
      summary: input.summary.trim(),
      hoursWorked: input.hoursWorked ?? null,
      projectId: input.projectId || null,
      blockers: input.blockers?.trim() || null,
      tomorrowPlan: input.tomorrowPlan?.trim() || null,
      photoUrls: input.photoUrls && input.photoUrls.length ? JSON.stringify(input.photoUrls) : null,
      // Answering an admin's question sends the report back for review.
      status: "SUBMITTED",
    };

    const report = existing
      ? await prisma.dailyWorkReport.update({ where: { id: existing.id }, data, include: reportInclude })
      : await prisma.dailyWorkReport.create({
          data: { organizationId, userId, reportDate: input.reportDate, ...data },
          include: reportInclude,
        });

    if (!existing || existing.status === "NEEDS_INFO") {
      const admins = await prisma.user.findMany({
        where: { organizationId, status: "ACTIVE", role: { in: ["SUPER_ADMIN", "ORG_ADMIN"] }, id: { not: userId } },
        select: { id: true },
      });
      if (admins.length) {
        await prisma.notification.createMany({
          data: admins.map((a) => ({
            organizationId,
            userId: a.id,
            type: "WORK_REPORT",
            title: `${report.user.name} ${existing ? "updated" : "filed"} the work report for ${input.reportDate}`,
            message: data.summary.length > 200 ? `${data.summary.slice(0, 197)}...` : data.summary,
            severity: data.blockers ? "WARNING" : "INFO",
            entityType: "WORK_REPORT",
            entityId: report.id,
            href: `/work-reports?tab=team&date=${input.reportDate}`,
          })),
        });
      }
    }

    return shape(report);
  }

  static async listOwn(organizationId: string, userId: string, limit = 30) {
    const rows = await prisma.dailyWorkReport.findMany({
      where: { organizationId, userId },
      include: reportInclude,
      orderBy: { reportDate: "desc" },
      take: limit,
    });
    return rows.map(shape);
  }

  /** Everyone expected to report on a date, with their report and attendance. */
  static async dayOverview(organizationId: string, date: string) {
    const [users, reports, attendance] = await Promise.all([
      prisma.user.findMany({
        where: { organizationId, status: "ACTIVE" },
        select: { id: true, name: true, role: true, jobTitle: true, phone: true },
        orderBy: { name: "asc" },
      }),
      prisma.dailyWorkReport.findMany({ where: { organizationId, reportDate: date }, include: reportInclude }),
      prisma.staffAttendance.findMany({ where: { organizationId, workDate: date } }),
    ]);

    const reportByUser = new Map(reports.map((r) => [r.userId, shape(r)]));
    const attendanceByUser = new Map(attendance.map((a) => [a.userId, a]));

    const staff = users
      .filter((u) => isReportingRole(u.role) || reportByUser.has(u.id) || attendanceByUser.has(u.id))
      .map((u) => {
        const a = attendanceByUser.get(u.id) || null;
        return {
          user: u,
          report: reportByUser.get(u.id) || null,
          attendance: a ? { ...a, hours: hoursBetween(a.checkInAt, a.checkOutAt) } : null,
        };
      });

    const expected = staff.filter((s) => isReportingRole(s.user.role));
    return {
      date,
      staff,
      totals: {
        expected: expected.length,
        submitted: staff.filter((s) => s.report).length,
        missing: expected.filter((s) => !s.report).length,
        present: staff.filter((s) => s.attendance && (s.attendance.status === "PRESENT" || s.attendance.status === "HALF_DAY")).length,
        onLeave: staff.filter((s) => s.attendance?.status === "LEAVE").length,
        hours: Math.round(staff.reduce((sum, s) => sum + (s.report?.hoursWorked || s.attendance?.hours || 0), 0) * 10) / 10,
        withBlockers: staff.filter((s) => s.report?.blockers).length,
      },
    };
  }

  static async review(
    organizationId: string,
    reviewerId: string,
    reportId: string,
    input: { status: "REVIEWED" | "NEEDS_INFO"; note?: string | null }
  ) {
    const report = await prisma.dailyWorkReport.findFirst({ where: { id: reportId, organizationId } });
    if (!report) throw new WorkReportError("Report not found", 404, "NOT_FOUND");
    if (report.userId === reviewerId) throw new WorkReportError("You cannot review your own report.", 403, "FORBIDDEN");

    const updated = await prisma.dailyWorkReport.update({
      where: { id: report.id },
      data: { status: input.status, reviewNote: input.note?.trim() || null, reviewedById: reviewerId, reviewedAt: new Date() },
      include: reportInclude,
    });

    await prisma.notification.create({
      data: {
        organizationId,
        userId: report.userId,
        type: "WORK_REPORT",
        title:
          input.status === "REVIEWED"
            ? `Your work report for ${report.reportDate} was reviewed`
            : `More detail needed on your work report for ${report.reportDate}`,
        message: input.note?.trim() || (input.status === "REVIEWED" ? "Marked as reviewed." : "Please add more detail."),
        severity: input.status === "NEEDS_INFO" ? "WARNING" : "INFO",
        entityType: "WORK_REPORT",
        entityId: report.id,
        href: `/work-reports?date=${report.reportDate}`,
      },
    });

    return shape(updated);
  }
}
