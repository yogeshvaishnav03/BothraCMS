import { prisma } from "@/lib/db";
import { notifyPeople } from "@/lib/notify";
import { parsePhotoUrls } from "@/services/task-timeline-service";
import { SalesService } from "@/services/sales-service";

/**
 * Construction stages for a project: planned dates, % done, and a history of
 * every progress update with site photos. Overall project progress is the
 * weighted average of its stages.
 */

export class MilestoneError extends Error {
  constructor(message: string, public statusCode = 422, public code = "MILESTONE_INVALID") {
    super(message);
  }
}

/** Typical stages of a building project, in order, with their rough share of the work. */
export const STANDARD_STAGES: { name: string; weight: number }[] = [
  { name: "Site clearing, survey & excavation", weight: 4 },
  { name: "Foundation (PCC, footings, columns to plinth)", weight: 10 },
  { name: "Plinth beam & backfilling", weight: 5 },
  { name: "Superstructure (columns, beams, slabs)", weight: 25 },
  { name: "Brickwork & blockwork", weight: 10 },
  { name: "Electrical & plumbing conduits", weight: 8 },
  { name: "Internal & external plaster", weight: 10 },
  { name: "Waterproofing", weight: 4 },
  { name: "Flooring & tiling", weight: 8 },
  { name: "Doors, windows & grills", weight: 5 },
  { name: "Painting & finishing", weight: 7 },
  { name: "Snagging & handover", weight: 4 },
];

export const MILESTONE_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

const DAY_MS = 86_400_000;

function statusFor(progress: number, current: string, requested?: MilestoneStatus): MilestoneStatus {
  if (progress >= 100) return "COMPLETED";
  if (requested === "ON_HOLD") return "ON_HOLD";
  if (progress > 0) return "IN_PROGRESS";
  return current === "ON_HOLD" && requested !== "IN_PROGRESS" ? "ON_HOLD" : "NOT_STARTED";
}

/** Where the stage should be today if the work ran evenly from planned start to planned end. */
export function expectedPercent(plannedStart: Date | null, plannedEnd: Date | null, now = new Date()): number | null {
  if (!plannedEnd) return null;
  const end = plannedEnd.getTime();
  const start = plannedStart ? plannedStart.getTime() : end;
  if (now.getTime() >= end) return 100;
  if (now.getTime() <= start) return 0;
  return Math.round(((now.getTime() - start) / (end - start)) * 100);
}

export function describeSchedule(
  m: { plannedStart: Date | null; plannedEnd: Date | null; progressPercent: number; actualEnd: Date | null },
  now = new Date()
) {
  const expected = expectedPercent(m.plannedStart, m.plannedEnd, now);
  const lateBy =
    m.plannedEnd && m.progressPercent < 100 && now.getTime() > m.plannedEnd.getTime()
      ? Math.floor((now.getTime() - m.plannedEnd.getTime()) / DAY_MS)
      : m.plannedEnd && m.actualEnd && m.actualEnd.getTime() > m.plannedEnd.getTime()
      ? Math.floor((m.actualEnd.getTime() - m.plannedEnd.getTime()) / DAY_MS)
      : 0;
  const behindBy = expected === null ? 0 : Math.max(0, expected - m.progressPercent);
  const schedule: "ON_TRACK" | "AT_RISK" | "DELAYED" | "DONE" | "UNPLANNED" =
    m.progressPercent >= 100
      ? "DONE"
      : expected === null
      ? "UNPLANNED"
      : lateBy > 0
      ? "DELAYED"
      : behindBy >= 15
      ? "AT_RISK"
      : "ON_TRACK";
  return { expectedPercent: expected, behindBy, lateByDays: lateBy, schedule };
}

export function overallProgress(milestones: { weight: number; progressPercent: number }[]): number {
  const totalWeight = milestones.reduce((s, m) => s + (m.weight > 0 ? m.weight : 0), 0);
  if (totalWeight <= 0) return 0;
  const done = milestones.reduce((s, m) => s + (m.weight > 0 ? m.weight : 0) * m.progressPercent, 0);
  return Math.round((done / totalWeight) * 10) / 10;
}

const updateInclude = { user: { select: { id: true, name: true, role: true } } } as const;

export class MilestoneService {
  static async list(organizationId: string, projectId: string) {
    const milestones = await prisma.projectMilestone.findMany({
      where: { organizationId, projectId },
      include: { updates: { include: updateInclude, orderBy: { createdAt: "desc" }, take: 20 } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const now = new Date();
    const rows = milestones.map((m) => ({
      ...m,
      ...describeSchedule(m, now),
      updates: m.updates.map((u) => ({ ...u, photoUrls: parsePhotoUrls(u.photoUrls) })),
    }));
    const overall = overallProgress(milestones);
    const plannedOverall = (() => {
      const withPlan = milestones.filter((m) => m.plannedEnd);
      if (withPlan.length === 0) return null;
      return overallProgress(withPlan.map((m) => ({ weight: m.weight, progressPercent: expectedPercent(m.plannedStart, m.plannedEnd, now) ?? 0 })));
    })();
    return {
      milestones: rows,
      summary: {
        overallProgress: overall,
        plannedProgress: plannedOverall,
        total: rows.length,
        completed: rows.filter((r) => r.status === "COMPLETED").length,
        delayed: rows.filter((r) => r.schedule === "DELAYED").length,
        atRisk: rows.filter((r) => r.schedule === "AT_RISK").length,
      },
    };
  }

  static async create(
    organizationId: string,
    projectId: string,
    userId: string,
    input: { name: string; description?: string | null; weight?: number; plannedStart?: Date | null; plannedEnd?: Date | null }
  ) {
    if (input.plannedStart && input.plannedEnd && input.plannedEnd < input.plannedStart) {
      throw new MilestoneError("The planned end must be after the planned start.");
    }
    const last = await prisma.projectMilestone.findFirst({ where: { organizationId, projectId }, orderBy: { sortOrder: "desc" } });
    return prisma.projectMilestone.create({
      data: {
        organizationId,
        projectId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        weight: input.weight && input.weight > 0 ? input.weight : 1,
        plannedStart: input.plannedStart || null,
        plannedEnd: input.plannedEnd || null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        createdBy: userId,
      },
    });
  }

  /** Add the standard building stages, spread across the project's dates when it has them. */
  static async addStandardStages(organizationId: string, projectId: string, userId: string) {
    const existing = await prisma.projectMilestone.count({ where: { organizationId, projectId } });
    if (existing > 0) throw new MilestoneError("This project already has stages. Add new ones one at a time.", 409, "MILESTONES_EXIST");
    const project = await prisma.project.findFirst({ where: { id: projectId, organizationId }, select: { startDate: true, endDate: true } });
    if (!project) throw new MilestoneError("Project not found", 404, "NOT_FOUND");

    const start = project.startDate?.getTime();
    const end = project.endDate?.getTime();
    const span = start && end && end > start ? end - start : null;
    const totalWeight = STANDARD_STAGES.reduce((s, x) => s + x.weight, 0);
    // Stages overlap in real life; give each a window proportional to its weight, laid end to end.
    let cursor = 0;
    const data = STANDARD_STAGES.map((stage, i) => {
      const share = stage.weight / totalWeight;
      const row = {
        organizationId,
        projectId,
        name: stage.name,
        weight: stage.weight,
        sortOrder: i,
        createdBy: userId,
        plannedStart: span ? new Date(start! + Math.round(cursor * span)) : null,
        plannedEnd: span ? new Date(start! + Math.round((cursor + share) * span)) : null,
      };
      cursor += share;
      return row;
    });
    await prisma.projectMilestone.createMany({ data });
    return data.length;
  }

  static async edit(
    organizationId: string,
    milestoneId: string,
    input: {
      name?: string;
      description?: string | null;
      weight?: number;
      plannedStart?: Date | null;
      plannedEnd?: Date | null;
      sortOrder?: number;
    }
  ) {
    const m = await prisma.projectMilestone.findFirst({ where: { id: milestoneId, organizationId } });
    if (!m) throw new MilestoneError("Stage not found", 404, "NOT_FOUND");
    const plannedStart = input.plannedStart !== undefined ? input.plannedStart : m.plannedStart;
    const plannedEnd = input.plannedEnd !== undefined ? input.plannedEnd : m.plannedEnd;
    if (plannedStart && plannedEnd && plannedEnd < plannedStart) throw new MilestoneError("The planned end must be after the planned start.");
    return prisma.projectMilestone.update({
      where: { id: m.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.weight !== undefined && input.weight > 0 ? { weight: input.weight } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        plannedStart,
        plannedEnd,
      },
    });
  }

  static async remove(organizationId: string, milestoneId: string) {
    const m = await prisma.projectMilestone.findFirst({ where: { id: milestoneId, organizationId } });
    if (!m) throw new MilestoneError("Stage not found", 404, "NOT_FOUND");
    await prisma.projectMilestone.delete({ where: { id: m.id } });
    return m;
  }

  /** Record progress from site: new %, a note, photos. Admins and the project manager are told. */
  static async postProgress(
    organizationId: string,
    milestoneId: string,
    actor: { userId: string; name: string },
    input: { progressPercent: number; note?: string | null; photoUrls: string[]; status?: MilestoneStatus }
  ) {
    const m = await prisma.projectMilestone.findFirst({
      where: { id: milestoneId, organizationId },
      include: { project: { select: { id: true, name: true, managerUserId: true } } },
    });
    if (!m) throw new MilestoneError("Stage not found", 404, "NOT_FOUND");

    const progress = Math.max(0, Math.min(100, Math.round(input.progressPercent)));
    const status = statusFor(progress, m.status, input.status);
    if (progress === m.progressPercent && status === m.status && !input.note?.trim() && input.photoUrls.length === 0) {
      throw new MilestoneError("Change the % done, the status, or add a note or photo.");
    }
    const now = new Date();

    const [updated] = await prisma.$transaction([
      prisma.projectMilestone.update({
        where: { id: m.id },
        data: {
          progressPercent: progress,
          status,
          actualStart: m.actualStart || (progress > 0 ? now : null),
          actualEnd: progress >= 100 ? m.actualEnd || now : null,
        },
      }),
      prisma.projectMilestoneUpdate.create({
        data: {
          milestoneId: m.id,
          userId: actor.userId,
          progressFrom: m.progressPercent,
          progressTo: progress,
          statusTo: status !== m.status ? status : null,
          note: input.note?.trim() || null,
          photoUrls: input.photoUrls.length ? JSON.stringify(input.photoUrls) : null,
        },
      }),
    ]);

    const title =
      status === "COMPLETED" && m.status !== "COMPLETED"
        ? `${m.project.name}: "${m.name}" completed`
        : `${m.project.name}: "${m.name}" is ${progress}% done`;
    await notifyPeople({
      organizationId,
      actorUserId: actor.userId,
      userIds: [m.project.managerUserId],
      includeAdmins: true,
      type: "MILESTONE_UPDATE",
      title,
      message: `${actor.name}: ${input.note?.trim() || `progress moved from ${m.progressPercent}% to ${progress}%`}${
        input.photoUrls.length ? ` (${input.photoUrls.length} photo${input.photoUrls.length > 1 ? "s" : ""})` : ""
      }`,
      severity: status === "ON_HOLD" ? "WARNING" : "INFO",
      entityType: "PROJECT",
      entityId: m.project.id,
      href: `/projects/${m.project.id}?tab=MILESTONES`,
    });

    // A finished stage raises the buyers' construction-linked demands.
    const demandsRaised =
      status === "COMPLETED" && m.status !== "COMPLETED"
        ? await SalesService.autoRaiseForStage(organizationId, { id: m.id, projectId: m.projectId, name: m.name }, actor.userId)
        : 0;

    return { ...updated, demandsRaised };
  }

  /** Overall progress and delayed stage count per project. */
  static async progressByProject(organizationId: string, projectIds: string[]) {
    if (projectIds.length === 0) return new Map<string, { progress: number; delayed: number; stages: number }>();
    const rows = await prisma.projectMilestone.findMany({
      where: { organizationId, projectId: { in: projectIds } },
      select: { projectId: true, weight: true, progressPercent: true, plannedStart: true, plannedEnd: true, actualEnd: true },
    });
    const grouped = new Map<string, typeof rows>();
    rows.forEach((r) => grouped.set(r.projectId, [...(grouped.get(r.projectId) || []), r]));
    const now = new Date();
    const out = new Map<string, { progress: number; delayed: number; stages: number }>();
    grouped.forEach((list, id) =>
      out.set(id, {
        progress: overallProgress(list),
        delayed: list.filter((m) => describeSchedule(m, now).schedule === "DELAYED").length,
        stages: list.length,
      })
    );
    return out;
  }
}
